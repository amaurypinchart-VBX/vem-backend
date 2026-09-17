"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.createProjectFromEmail = createProjectFromEmail;
const zod_1 = require("zod");
const database_1 = require("../config/database");
const cloudinaryService_1 = require("./cloudinaryService");
const logger_1 = require("../utils/logger");
const aiService_1 = require("./aiService");
const PLACEHOLDER_CLIENT = '⚠️ Client à confirmer';
function subjectPrefix() {
    return process.env.NEW_PROJECT_SUBJECT_PREFIX || 'NEW';
}
// Retire le préfixe déclencheur ("NEW", "NEW:", "NEW -", ...) du sujet.
function stripPrefix(subject) {
    const p = subjectPrefix().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return subject.replace(new RegExp('^\\s*' + p + '[:\\-\\s]*', 'i'), '').trim();
}
function parseDate(s) {
    if (!s || typeof s !== 'string')
        return null;
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
}
const PROJECT_FIELDS_SCHEMA = zod_1.z.object({
    projectName: zod_1.z.string().catch(''),
    internalNumber: zod_1.z.string().catch(''),
    clientName: zod_1.z.string().catch(''),
    contactName: zod_1.z.string().catch(''),
    contactEmail: zod_1.z.string().catch(''),
    contactPhone: zod_1.z.string().catch(''),
    address: zod_1.z.string().catch(''),
    city: zod_1.z.string().catch(''),
    installationStart: zod_1.z.string().catch(''),
    installationEnd: zod_1.z.string().catch(''),
    dismantlingStart: zod_1.z.string().catch(''),
    dismantlingEnd: zod_1.z.string().catch(''),
    workersCount: zod_1.z.number().catch(0),
    description: zod_1.z.string().catch(''),
    specialInstructions: zod_1.z.string().catch(''),
});
// Appelle Claude pour extraire les champs du projet depuis le texte du mail.
async function extractFields(subjectClean, body) {
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
    return (0, aiService_1.callClaudeJSON)({
        maxTokens: 1500,
        schema: PROJECT_FIELDS_SCHEMA,
        messages: [{ role: 'user', content: prompt }],
    });
}
// Trouve un client existant (nom insensible à la casse, ou email) ou le crée.
async function resolveClient(f) {
    const name = (f.clientName || '').trim();
    const email = (f.contactEmail || '').trim();
    if (name) {
        const existing = await database_1.prisma.client.findFirst({
            where: { name: { equals: name, mode: 'insensitive' } },
        });
        if (existing)
            return { id: existing.id, name: existing.name };
    }
    if (!name && email) {
        const byEmail = await database_1.prisma.client.findFirst({
            where: { email: { equals: email, mode: 'insensitive' } },
        });
        if (byEmail)
            return { id: byEmail.id, name: byEmail.name };
    }
    if (!name) {
        // Client indéfini → placeholder réutilisable
        const ph = await database_1.prisma.client.findFirst({ where: { name: PLACEHOLDER_CLIENT } });
        if (ph)
            return { id: ph.id, name: ph.name };
        const created = await database_1.prisma.client.create({ data: { name: PLACEHOLDER_CLIENT } });
        return { id: created.id, name: created.name };
    }
    const created = await database_1.prisma.client.create({
        data: {
            name,
            contactName: f.contactName || null,
            email: email || null,
            phone: f.contactPhone || null,
        },
    });
    return { id: created.id, name: created.name };
}
async function createProjectFromEmail(input) {
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
    const dup = await database_1.prisma.project.findUnique({ where: { internalNumber } });
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
    const project = await database_1.prisma.project.create({
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
            if (!buffer || buffer.length === 0)
                continue;
            const filename = att.filename || `mail-${Date.now()}`;
            const { url, publicId } = await (0, cloudinaryService_1.uploadToCloudinary)(buffer, `projects/${project.id}/files`, {
                resource_type: 'auto',
            });
            await database_1.prisma.projectFile.create({
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
        }
        catch (e) {
            logger_1.logger.error(`[project-from-email] Upload PJ échoué : ${e.message || e}`);
        }
    }
    // ─── Notification in-app (admins + chefs de projet) ───
    try {
        const recipients = await database_1.prisma.user.findMany({
            where: { role: { in: ['admin', 'project_manager'] }, isActive: true },
            select: { id: true },
        });
        if (recipients.length) {
            await database_1.prisma.notification.createMany({
                data: recipients.map(u => ({
                    userId: u.id,
                    type: 'project_created_email',
                    title: '🆕 Projet créé depuis un email',
                    body: `${project.name} (${internalNumber}) · client : ${client.name} · ${filesUploaded} fichier(s). À vérifier.`,
                    data: JSON.stringify({ projectId: project.id, internalNumber }),
                })),
            });
        }
    }
    catch (e) {
        logger_1.logger.warn(`[project-from-email] Notifications non créées : ${e.message || e}`);
    }
    return {
        created: true,
        projectId: project.id,
        internalNumber,
        clientName: client.name,
        filesUploaded,
    };
}
//# sourceMappingURL=projectFromEmail.js.map