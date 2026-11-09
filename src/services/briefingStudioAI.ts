// src/services/briefingStudioAI.ts
// Textes d'accompagnement des slides du Briefing Studio (« ✨ Générer avec l'IA »
// dans le Studio, A. Pinchart 09.11.2026). Les tableaux (équipe, camions, hôtels…)
// restent construits par le navigateur à partir des vraies données ; l'IA écrit
// seulement une courte phrase « à retenir » par slide, à partir de ces mêmes
// données. Elle ne doit inventer aucun nom, heure, chiffre ou détail.

import { z } from 'zod';
import { prisma } from '../config/database';
import { AppError } from '../utils/AppError';
import { callClaudeJSON } from './aiService';

const MODEL = process.env.ANTHROPIC_MODEL_BRIEFING || 'claude-sonnet-5-5';

const txt = z.string().catch('').transform(s => s.trim().slice(0, 600));
const TEXTS_SCHEMA = z.object({
  intro: txt,
  planning: txt,
  location: txt,
  team: txt,
  contacts: txt,
  trucks: txt,
  teamBookings: txt,
  hotels: txt,
  notes: txt,
  tasks: txt,
  remarks: txt,
  closing: txt,
});
export type StudioTexts = z.infer<typeof TEXTS_SCHEMA>;

const TZ = 'Europe/Brussels';
const d = (v: Date | null | undefined) => v
  ? new Date(v).toLocaleString('fr-FR', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
  : '';
const day = (v: Date | null | undefined) => v
  ? new Date(v).toLocaleDateString('fr-FR', { timeZone: TZ, weekday: 'short', day: '2-digit', month: '2-digit' })
  : '';
const name = (u: { firstName?: string | null; lastName?: string | null } | null | undefined) =>
  u ? `${u.firstName || ''} ${u.lastName || ''}`.trim() : '';
const phase = (p: string) => p === 'dismantling' ? 'démontage' : p === 'installation' ? 'installation' : 'installation + démontage';

export async function generateStudioTexts(projectId: string): Promise<StudioTexts> {
  const p = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      client: { include: { contacts: true } },
      team: { include: { user: { select: { firstName: true, lastName: true } } } },
      trucks: true,
      tasks: { include: { assignedTo: { select: { firstName: true, lastName: true } } } },
      clientRemarks: true,
      teamBookings: { include: { user: { select: { firstName: true, lastName: true } } } },
      hotelBookings: { include: { occupants: { include: { user: { select: { firstName: true, lastName: true } } } } } },
    },
  });
  if (!p) throw new AppError('Projet introuvable', 404);

  const lines: string[] = [];
  lines.push(`Projet : ${p.name}`);
  lines.push(`Client : ${p.client?.name || 'non renseigné'}`);
  lines.push(`Lieu : ${[p.address, p.city].filter(Boolean).join(', ') || 'non renseigné'}`);
  lines.push(`Installation : ${d(p.installationStart)} → ${d(p.installationEnd)}`);
  lines.push(p.dismantlingStart ? `Démontage : ${d(p.dismantlingStart)} → ${d(p.dismantlingEnd)}` : 'Démontage : non planifié');
  if (p.workersCount) lines.push(`Effectif prévu : ${p.workersCount}`);
  if (p.scope) lines.push(`Objet : ${p.scope}`);
  if (p.description) lines.push(`Description : ${p.description}`);
  if (p.installNotes) lines.push(`Notes installation : ${p.installNotes}`);
  if (p.dismantleNotes) lines.push(`Notes démontage : ${p.dismantleNotes}`);
  if (p.specialInstructions) lines.push(`Consignes spéciales : ${p.specialInstructions}`);

  const team = p.team.map(m => `- ${name(m.user)} · ${m.role}${m.isLead ? ' (chef)' : ''} · ${phase(m.phase)}`);
  lines.push(`\nÉquipe (${team.length}) :\n${team.join('\n') || '(aucune)'}`);
  const contacts = (p.client?.contacts || []).map(c => `- ${c.name}${c.role ? ' · ' + c.role : ''}`);
  lines.push(`\nContacts client (${contacts.length}) :\n${contacts.join('\n') || '(aucun)'}`);
  const trucks = p.trucks.map(t => `- ${t.vehicleType || 'camion'} · ${t.loadingLocation || '?'} → ${t.unloadingLocation || '?'} · chargement ${d(t.loadingDate) || '?'}${t.arrivalDate ? ' · arrivée ' + d(t.arrivalDate) : ''}${t.notes ? ' · ' + t.notes : ''}`);
  lines.push(`\nCamions / engins (${trucks.length}) :\n${trucks.join('\n') || '(aucun)'}`);
  const trips = p.teamBookings.map(b => `- ${name(b.user)} · ${phase(b.phase)} · sur site ${day(b.onSiteStart)} → ${day(b.onSiteEnd)} · aller ${b.outboundMode || '?'} ${d(b.outboundDate)} · retour ${b.returnMode || '?'} ${d(b.returnDate)}`);
  lines.push(`\nTransport équipe (${trips.length}) :\n${trips.join('\n') || '(aucun)'}`);
  const hotels = p.hotelBookings.map(h => `- ${h.hotelName}${h.hotelAddress ? ' (' + h.hotelAddress + ')' : ''} · ${phase(h.phase)} · ${day(h.checkin)} → ${day(h.checkout)} · ${h.occupants.map(o => name(o.user)).filter(Boolean).join(', ')}`);
  lines.push(`\nHôtels (${hotels.length}) :\n${hotels.join('\n') || '(aucun)'}`);
  const tasks = p.tasks.filter(t => t.priority === 'high' || t.priority === 'critical').slice(0, 15)
    .map(t => `- ${t.title}${t.taskDate ? ' · ' + day(t.taskDate) : ''}${t.startTime ? ' ' + t.startTime : ''} · ${t.status}`);
  lines.push(`\nTâches importantes (${tasks.length}) :\n${tasks.join('\n') || '(aucune)'}`);
  const remarks = p.clientRemarks.filter(r => r.status !== 'resolved' && r.status !== 'archived').slice(0, 12)
    .map(r => `- ${r.title}${r.zone ? ' · zone ' + r.zone : ''} · ${r.status}`);
  lines.push(`\nRemarques client ouvertes (${remarks.length}) :\n${remarks.join('\n') || '(aucune)'}`);

  const prompt = `Tu prépares les textes d'accompagnement d'un briefing d'avant-chantier pour une équipe de montage Viewbox (structures modulaires événementielles). Chaque texte s'affiche sous le titre d'une slide, au-dessus du tableau ou de la carte qui contient déjà le détail.

DONNÉES DU PROJET :
${lines.join('\n')}

Écris pour chaque slide 1 à 3 phrases courtes (max ~280 caractères), en français, ton direct et concret, vocabulaire terrain : ce que l'équipe doit retenir ou faire (ex. qui arrive quand, ce qu'il faut préparer, le point d'attention). Ne recopie pas le tableau ligne par ligne : synthétise.

Réponds UNIQUEMENT avec cet objet JSON :
{
  "intro": "objectif du chantier et contexte, pour la couverture",
  "planning": "", "location": "accès / arrivée sur site", "team": "", "contacts": "",
  "trucks": "", "teamBookings": "", "hotels": "", "notes": "les points clés des notes et consignes",
  "tasks": "", "remarks": "",
  "closing": "une phrase de fin motivante et sobre"
}

Règles strictes :
- N'invente JAMAIS un nom, une heure, une date, un chiffre, une adresse ou un détail technique absent des données.
- Si une section n'a pas de données « (aucun) », mets "" pour cette clé.
- Pas de markdown, pas d'emoji, pas de guillemets décoratifs.`;

  return callClaudeJSON<StudioTexts>({
    model: MODEL,
    maxTokens: 3000,
    schema: TEXTS_SCHEMA,
    messages: [{ role: 'user', content: prompt }],
    timeoutMs: 90000,
  });
}
