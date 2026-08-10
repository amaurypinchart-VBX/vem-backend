// src/services/bookingFromEmail.ts
// Crée des réservations (camions, hôtels, trajets équipe) sur un projet EXISTANT
// à partir du corps d'un email transféré.
// Déclenché depuis imapPoller quand un projet est identifié par sa référence
// interne dans le sujet (PAS de préfixe NEW — celui-ci reste réservé à la
// création de projet via projectFromEmail).
//
// Étapes :
//   1) Extraction via Claude (claude-haiku-4-5) → JSON { trucks, hotels, teamTravel }
//   2) Camions   → Truck    (status "draft")
//   3) Hôtels    → HotelBooking (marqueur "à valider" dans notes)
//   4) Trajets   → TeamBooking  (uniquement si le nom correspond à un membre de l'équipe)
//   5) Notification in-app des admins / chefs de projet
//
// Fichier autonome : ne modifie aucun flux existant.

import { prisma } from '../config/database';
import { logger } from '../utils/logger';

interface EmailInput {
  projectId: string;
  internalNumber: string | null;
  subject: string;
  text: string;
  from: string;
}
interface CreateResult {
  created: number;      // total d'enregistrements créés
  trucks: number;
  hotels: number;
  team: number;
  skipped: string[];    // infos non créées (ex: membre non trouvé)
}

const AUTO_TAG = '📧 Créé auto depuis mail — à valider';
const VEHICLE_TYPES = ['truck', 'van', 'crane', 'scissor', 'manitou', 'forklift', 'generator'];

function parseDT(s: any): Date | null {
  if (!s || typeof s !== 'string') return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

// Normalise pour comparer des noms (minuscules, sans accents, sans doubles espaces).
function norm(s: string): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Appelle Claude pour décider du contenu et extraire les réservations.
async function extract(subject: string, body: string, roster: string[]): Promise<any> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY non configurée');

  const today = new Date().toISOString().split('T')[0];
  const rosterLine = roster.length
    ? roster.join(', ')
    : '(aucun membre encore assigné au projet)';

  const prompt = `Tu extrais des réservations logistiques depuis un email transféré (FR, EN ou NL) concernant un projet d'installation événementielle déjà existant.

Date du jour : ${today} (déduis l'année des dates sans année ; si le mois est déjà passé, prends l'année suivante).
Membres de l'équipe du projet (pour rattacher les trajets) : ${rosterLine}

SUJET : ${subject}

CORPS DU MAIL :
${body}

Analyse le contenu et décide ce qu'il contient. Réponds UNIQUEMENT avec cet objet JSON (aucun texte, aucun backtick) :
{
  "trucks": [
    {
      "vehicleType": "un parmi: truck, van, crane, scissor, manitou, forklift, generator (défaut truck)",
      "truckNumber": "identifiant/numéro du camion s'il y en a un, sinon ''",
      "licensePlate": "plaque d'immatriculation, sinon ''",
      "driverName": "nom du chauffeur, sinon ''",
      "driverPhone": "téléphone chauffeur, sinon ''",
      "loadingLocation": "lieu de chargement / départ, sinon ''",
      "unloadingLocation": "lieu de déchargement / arrivée, sinon ''",
      "loadingDate": "date+heure de chargement au format YYYY-MM-DDTHH:MM, ou juste YYYY-MM-DD, sinon ''",
      "departureDate": "date+heure de départ YYYY-MM-DDTHH:MM ou YYYY-MM-DD, sinon ''",
      "arrivalDate": "date+heure d'arrivée YYYY-MM-DDTHH:MM ou YYYY-MM-DD, sinon ''",
      "notes": "toute info utile restante, sinon ''"
    }
  ],
  "hotels": [
    {
      "hotelName": "nom de l'hôtel",
      "hotelAddress": "adresse, sinon ''",
      "checkin": "YYYY-MM-DD, sinon ''",
      "checkout": "YYYY-MM-DD, sinon ''",
      "reference": "n° de réservation, sinon ''",
      "phase": "installation ou dismantling (défaut installation)",
      "notes": "info restante, sinon ''"
    }
  ],
  "teamTravel": [
    {
      "memberName": "nom EXACT tel qu'il apparaît dans la liste des membres ci-dessus ; laisse '' si tu n'es pas sûr",
      "phase": "installation ou dismantling (défaut installation)",
      "outboundMode": "avion/train/voiture/... sinon ''",
      "outboundDate": "YYYY-MM-DDTHH:MM ou YYYY-MM-DD, sinon ''",
      "outboundDetails": "n° de vol, gare, etc. sinon ''",
      "returnMode": "sinon ''",
      "returnDate": "YYYY-MM-DDTHH:MM ou YYYY-MM-DD, sinon ''",
      "returnDetails": "sinon ''",
      "notes": "info restante, sinon ''"
    }
  ]
}

Règles :
- Un camion/véhicule mentionné = un objet dans "trucks". Plusieurs camions = plusieurs objets.
- N'invente jamais une date : si absente, mets ''.
- Ne mets un "memberName" QUE s'il correspond clairement à un membre de la liste fournie. Sinon ''.
- Si le mail ne contient aucune réservation d'un type donné, renvoie un tableau vide pour ce type.`;

  const response: any = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2500,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Anthropic API error: ${response.status} — ${err.slice(0, 200)}`);
  }

  const data = await response.json() as any;
  const content = data.content?.[0]?.text || '';
  logger.info(`[booking-from-email] IA brute (${content.length} car) : ${content.slice(0, 300)}`);

  const cleaned = content.replace(/```json|```/g, '').trim();
  const first = cleaned.indexOf('{');
  const last = cleaned.lastIndexOf('}');
  if (first === -1 || last <= first) throw new Error('Pas de JSON dans la réponse IA');
  return JSON.parse(cleaned.slice(first, last + 1));
}

export async function createBookingsFromEmail(input: EmailInput): Promise<CreateResult> {
  const result: CreateResult = { created: 0, trucks: 0, hotels: 0, team: 0, skipped: [] };
  const body = (input.text || '').slice(0, 8000);
  if (!body.trim()) {
    result.skipped.push('corps du mail vide');
    return result;
  }

  // Projet + équipe (pour rattacher les trajets et servir de fallback de dates)
  const project = await prisma.project.findUnique({
    where: { id: input.projectId },
    select: {
      id: true,
      installationStart: true, installationEnd: true,
      dismantlingStart: true, dismantlingEnd: true,
    },
  });
  if (!project) {
    result.skipped.push('projet introuvable');
    return result;
  }

  const teamRows = await prisma.projectTeam.findMany({
    where: { projectId: input.projectId },
    select: { userId: true, user: { select: { firstName: true, lastName: true } } },
  });
  const roster = teamRows.map(t => `${t.user.firstName} ${t.user.lastName}`);

  const f = await extract(input.subject, body, roster);

  const origin = `${AUTO_TAG} (mail de ${input.from}).`;

  // ─── Camions ───
  for (const t of (Array.isArray(f.trucks) ? f.trucks : [])) {
    try {
      const vt = VEHICLE_TYPES.includes((t.vehicleType || '').trim())
        ? t.vehicleType.trim() : 'truck';
      const extraNotes = [origin, (t.notes || '').trim()].filter(Boolean).join('\n');
      await prisma.truck.create({
        data: {
          projectId: project.id,
          vehicleType: vt,
          truckNumber: (t.truckNumber || '').trim() || null,
          licensePlate: (t.licensePlate || '').trim() || null,
          driverName: (t.driverName || '').trim() || null,
          driverPhone: (t.driverPhone || '').trim() || null,
          loadingLocation: (t.loadingLocation || '').trim() || null,
          unloadingLocation: (t.unloadingLocation || '').trim() || null,
          loadingDate: parseDT(t.loadingDate),
          departureDate: parseDT(t.departureDate),
          arrivalDate: parseDT(t.arrivalDate),
          notes: extraNotes || null,
          status: 'draft',
        },
      });
      result.trucks++; result.created++;
    } catch (e: any) {
      logger.error(`[booking-from-email] camion non créé : ${e.message || e}`);
    }
  }

  // ─── Hôtels ───
  for (const h of (Array.isArray(f.hotels) ? f.hotels : [])) {
    try {
      const name = (h.hotelName || '').trim();
      if (!name) { result.skipped.push('hôtel sans nom'); continue; }
      const phase = h.phase === 'dismantling' ? 'dismantling' : 'installation';
      const checkin = parseDT(h.checkin)
        || (phase === 'dismantling' ? project.dismantlingStart : project.installationStart)
        || project.installationStart;
      const checkout = parseDT(h.checkout)
        || (phase === 'dismantling' ? project.dismantlingEnd : project.installationEnd)
        || project.installationEnd;
      const extraNotes = [origin, (h.notes || '').trim()].filter(Boolean).join('\n');
      await prisma.hotelBooking.create({
        data: {
          projectId: project.id,
          phase,
          hotelName: name,
          hotelAddress: (h.hotelAddress || '').trim() || null,
          checkin,
          checkout,
          reference: (h.reference || '').trim() || null,
          notes: extraNotes || null,
        },
      });
      result.hotels++; result.created++;
    } catch (e: any) {
      logger.error(`[booking-from-email] hôtel non créé : ${e.message || e}`);
    }
  }

  // ─── Trajets équipe (uniquement si le membre est reconnu) ───
  for (const tt of (Array.isArray(f.teamTravel) ? f.teamTravel : [])) {
    try {
      const wanted = norm(tt.memberName || '');
      if (!wanted) { result.skipped.push('trajet sans membre identifié'); continue; }

      const match = teamRows.find(r => {
        const full = norm(`${r.user.firstName} ${r.user.lastName}`);
        return full === wanted || full.includes(wanted) || wanted.includes(full);
      });
      if (!match) {
        result.skipped.push(`trajet ignoré (membre "${tt.memberName}" absent de l'équipe)`);
        continue;
      }

      const phase = tt.phase === 'dismantling' ? 'dismantling' : 'installation';
      const outDate = parseDT(tt.outboundDate);
      const retDate = parseDT(tt.returnDate);
      const onSiteStart = outDate
        || (phase === 'dismantling' ? project.dismantlingStart : project.installationStart)
        || project.installationStart;
      const onSiteEnd = retDate
        || (phase === 'dismantling' ? project.dismantlingEnd : project.installationEnd)
        || project.installationEnd;
      const extraNotes = [origin, (tt.notes || '').trim()].filter(Boolean).join('\n');

      await prisma.teamBooking.create({
        data: {
          projectId: project.id,
          userId: match.userId,
          phase,
          onSiteStart,
          onSiteEnd,
          outboundMode: (tt.outboundMode || '').trim() || null,
          outboundDate: outDate,
          outboundDetails: (tt.outboundDetails || '').trim() || null,
          returnMode: (tt.returnMode || '').trim() || null,
          returnDate: retDate,
          returnDetails: (tt.returnDetails || '').trim() || null,
          notes: extraNotes || null,
        },
      });
      result.team++; result.created++;
    } catch (e: any) {
      logger.error(`[booking-from-email] trajet non créé : ${e.message || e}`);
    }
  }

  // ─── Notification ───
  if (result.created > 0) {
    try {
      const recipients = await prisma.user.findMany({
        where: { role: { in: ['admin', 'project_manager'] as any }, isActive: true },
        select: { id: true },
      });
      if (recipients.length) {
        const parts = [
          result.trucks ? `${result.trucks} camion(s)` : '',
          result.hotels ? `${result.hotels} hôtel(s)` : '',
          result.team ? `${result.team} trajet(s)` : '',
        ].filter(Boolean).join(', ');
        await prisma.notification.createMany({
          data: recipients.map(u => ({
            userId: u.id,
            type: 'bookings_created_email',
            title: '🚛 Réservations créées depuis un email',
            body: `${input.internalNumber || 'Projet'} · ${parts} en brouillon. À valider.`,
            data: JSON.stringify({ projectId: project.id, internalNumber: input.internalNumber }),
          })),
        });
      }
    } catch (e: any) {
      logger.warn(`[booking-from-email] Notifications non créées : ${e.message || e}`);
    }
  }

  logger.info(`[booking-from-email] ${input.internalNumber || project.id} → ${result.trucks} camion(s), ${result.hotels} hôtel(s), ${result.team} trajet(s)`);
  return result;
}