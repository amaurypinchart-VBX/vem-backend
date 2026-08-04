// src/services/projectFromEmail.ts
// Crée un projet VEM à partir d'un email transféré.
// Déclenché depuis imapPoller quand le sujet commence par le préfixe
// NEW_PROJECT_SUBJECT_PREFIX (défaut "NEW").
//
// Étapes :
//   1) Extraction des infos via Claude (claude-haiku-4-5) → JSON structuré
//   2) Résolution / création du client
//   3) Création du projet en statut "draft"
//   4) Upload des pièces jointes sur Cloudinary → ProjectFile (category "email")
//   5) Notification in-app des admins / chefs de projet
//
// Aucune modification des flux existants : ce fichier est autonome.

import { prisma } from '../config/database';
import { uploadToCloudinary } from './cloudinaryService';
import { logger } from '../utils/logger';

interface EmailAttachment {
  content?: Buffer;
  filename?: string;
  contentType?: string;
}
interface EmailInput {
  subject: string;
  text: string;
  from: string;
  attachments: EmailAttachment[];
}
interface CreateResult {
  created: boolean;
  reason?: string;
  projectId?: string;
  internalNumber?: string;
  clientName?: string;
  filesUploaded?: number;
}

const PLACEHOLDER_CLIENT = '⚠️ Client à confirmer';

function subjectPrefix(): string {
  return process.env.NEW_PROJECT_SUBJECT_PREFIX || 'NEW';
}

// Retire le préfixe déclencheur ("NEW", "NEW:", "NEW -", ...) du sujet.
function stripPrefix(subject: string): string {
  const p = subjectPrefix().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return subject.replace(new RegExp('^\\s*' + p + '[:\\-\\s]*', 'i'), '').trim();
}

function parseDate(s: any): Date | null {
  if (!s || typeof s !== 'string') return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

// Appelle Claude pour extraire les champs du projet depuis le texte du mail.
async function extractFields(subjectClean: string, body: string): Promise<any> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY non configurée');

  const today = new Date().toISOString().split('T')[0];

  const prompt = `Tu extrais les informations d'un projet d'installation événementielle depuis un email transféré (FR, EN ou NL).

Date du jour : ${today} (utilise-la pour déduire l'année des dates sans année : si le mois est déjà passé, prends l'année suivante).

SUJET DU MAIL : ${subjectClean}

CORPS DU MAIL :
${body}

Réponds UNIQUEMENT avec cet objet JSON (aucun texte, aucun backtick) :
{
  "projectName": "nom court et lisible du projet (ex: 'Viewbox Klokgebouw Eindhoven') — jamais un simple code",
  "internalNumber": "code interne / n° de commande s'il apparaît (souvent dans le sujet), sinon ''",
  "clientName": "société cliente finale (PAS l'expéditeur Viewbox/interne). Vide si non identifiable.",
  "contactName": "nom du contact client, sinon ''",
  "contactEmail": "email du contact client, sinon ''",
  "contactPhone": "téléphone du contact client, sinon ''",
  "address": "adresse complète du site d'installation, sinon ''",
  "city": "ville du site, sinon ''",
  "installationStart": "YYYY-MM-DD ou ''",
  "installationEnd": "YYYY-MM-DD ou '' (= installationStart si un seul jour)",
  "dismantlingStart": "YYYY-MM-DD ou '' (seulement si le démontage est explicitement mentionné)",
  "dismantlingEnd": "YYYY-MM-DD ou ''",
  "workersCount": 0,
  "description": "résumé du montage : nombre de Viewboxes, modules (HVAC...), équipement fourni",
  "specialInstructions": "notes logistiques : transport, assemblage, disponibilité client, etc."
}

Règles :
- N'invente jamais une date : si aucune date n'est trouvée, laisse ''.
- Ne confonds pas l'expéditeur interne (Viewbox, sales engineer) avec le client final.`;

  const response: any = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Anthropic API error: ${response.status} — ${err.slice(0, 200)}`);
  }

  const data = await response.json() as any;
  const content = data.content?.[0]?.text || '';
  logger.info(`[project-from-email] IA brute (${content.length} car) : ${content.slice(0, 300)}`);

  const cleaned = content.replace(/```json|```/g, '').trim();
  const first = cleaned.indexOf('{');
  const last = cleaned.lastIndexOf('}');
  if (first === -1 || last <= first) throw new Error('Pas de JSON dans la réponse IA');
  return JSON.parse(cleaned.slice(first, last + 1));
}

// Trouve un client existant (nom insensible à la casse, ou email) ou le crée.
async function resolveClient(f: any): Promise<{ id: string; name: string }> {
  const name = (f.clientName || '').trim();
  const email = (f.contactEmail || '').trim();

  if (name) {
    const existing = await prisma.client.findFirst({
      where: { name: { equals: name, mode: 'insensitive' } },
    });
    if (existing) return { id: existing.id, name: existing.name };
  }
  if (!name && email) {
    const byEmail = await prisma.client.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
    });
    if (byEmail) return { id: byEmail.id, name: byEmail.name };
  }

  if (!name) {
    // Client indéfini → placeholder réutilisable
    const ph = await prisma.client.findFirst({ where: { name: PLACEHOLDER_CLIENT } });
    if (ph) return { id: ph.id, name: ph.name };
    const created = await prisma.client.create({ data: { name: PLACEHOLDER_CLIENT } });
    return { id: created.id, name: created.name };
  }

  const created = await prisma.client.create({
    data: {
      name,
      contactName: f.contactName || null,
      email: email || null,
      phone: f.contactPhone || null,
    },
  });
  return { id: created.id, name: created.name };
}

export async function createProjectFromEmail(input: EmailInput): Promise<CreateResult> {
  const subjectClean = stripPrefix(input.subject);
  const body = (input.text || '').slice(0, 8000);

  const f = await extractFields(subjectClean, body);

  // ─── N° interne ───
  const year = new Date().getFullYear();
  let internalNumber = (f.internalNumber || '').trim();
  if (!internalNumber) {
    internalNumber = (subjectClean && subjectClean.length <= 24 && !/\s/.test(subjectClean))
      ? subjectClean
      : `VEM-${year}-${String(Date.now()).slice(-4)}`;
  }
  // Anti-doublon : si ce n° existe déjà, on ne recrée pas (mail re-transféré)
  const dup = await prisma.project.findUnique({ where: { internalNumber } });
  if (dup) {
    return { created: false, reason: `internalNumber "${internalNumber}" déjà utilisé` };
  }

  // ─── Client ───
  const client = await resolveClient(f);

  // ─── Dates (fallback : aujourd'hui, un seul jour) ───
  const instStart = parseDate(f.installationStart) || new Date();
  const instEnd = parseDate(f.installationEnd) || instStart;
  const dismStart = parseDate(f.dismantlingStart);
  const dismEnd = parseDate(f.dismantlingEnd) || dismStart;

  // Notes : origine + client à confirmer si besoin
  let special = f.specialInstructions || '';
  if (client.name === PLACEHOLDER_CLIENT) {
    special = `⚠️ CLIENT À CONFIRMER (non identifié dans le mail).\n${special}`.trim();
  }
  special = `📧 Projet créé automatiquement depuis un mail de ${input.from}.\n${special}`.trim();

  // ─── Création du projet (statut draft) ───
  const project = await prisma.project.create({
    data: {
      internalNumber,
      name: (f.projectName || subjectClean || 'Nouveau projet').slice(0, 200),
      clientId: client.id,
      status: 'draft',
      address: f.address || '',
      city: f.city || null,
      installationStart: instStart,
      installationEnd: instEnd,
      dismantlingStart: dismStart,
      dismantlingEnd: dismEnd,
      workersCount: Math.max(0, parseInt(String(f.workersCount ?? 0), 10) || 0),
      description: f.description || null,
      specialInstructions: special || null,
    },
  });

  // ─── Pièces jointes → Cloudinary → ProjectFile ───
  let filesUploaded = 0;
  for (const att of input.attachments || []) {
    try {
      const buffer = att.content;
      if (!buffer || buffer.length === 0) continue;
      const filename = att.filename || `mail-${Date.now()}`;
      const { url, publicId } = await uploadToCloudinary(buffer, `projects/${project.id}/files`, {
        resource_type: 'auto',
      });
      await prisma.projectFile.create({
        data: {
          projectId: project.id,
          fileName: filename,
          fileUrl: url,
          publicId,
          fileSize: buffer.length,
          category: 'email',
        },
      });
      filesUploaded++;
    } catch (e: any) {
      logger.error(`[project-from-email] Upload PJ échoué : ${e.message || e}`);
    }
  }

  // ─── Notification in-app (admins + chefs de projet) ───
  try {
    const recipients = await prisma.user.findMany({
      where: { role: { in: ['admin', 'project_manager'] as any }, isActive: true },
      select: { id: true },
    });
    if (recipients.length) {
      await prisma.notification.createMany({
        data: recipients.map(u => ({
          userId: u.id,
          type: 'project_created_email',
          title: '🆕 Projet créé depuis un email',
          body: `${project.name} (${internalNumber}) · client : ${client.name} · ${filesUploaded} fichier(s). À vérifier.`,
          data: JSON.stringify({ projectId: project.id, internalNumber }),
        })),
      });
    }
  } catch (e: any) {
    logger.warn(`[project-from-email] Notifications non créées : ${e.message || e}`);
  }

  return {
    created: true,
    projectId: project.id,
    internalNumber,
    clientName: client.name,
    filesUploaded,
  };
}