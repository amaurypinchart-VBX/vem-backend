"use strict";
// src/services/briefingAI.ts
// Génère un premier jet de briefing pour un projet à partir de ses données.
//
// Principe : on ne fait pas halluciner l'IA sur des données déjà structurées
// (équipe, camions, hôtels, tâches) — ces blocs restent "auto" comme dans
// l'éditeur (voir BLOCK_TYPES dans public/index.html) et se remplissent tout
// seuls à l'affichage. L'IA ne rédige que le texte qui demande une vraie
// synthèse : une intro client-ready et les étapes de planning. Les contacts
// viennent directement de ClientContact — données réelles, pas générées.
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateBriefingDraft = generateBriefingDraft;
const zod_1 = require("zod");
const database_1 = require("../config/database");
const AppError_1 = require("../utils/AppError");
const aiService_1 = require("./aiService");
const DRAFT_SCHEMA = zod_1.z.object({
    intro: zod_1.z.string().catch(''),
    planningSteps: zod_1.z.array(zod_1.z.object({
        time: zod_1.z.string().catch(''),
        duration: zod_1.z.string().catch(''),
        description: zod_1.z.string(),
        responsible: zod_1.z.string().catch(''),
    })).catch([]),
});
function fmtDate(d) {
    if (!d)
        return '';
    return new Date(d).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}
async function draftTexts(project) {
    const prompt = `Tu rédiges le contenu d'un briefing d'avant-chantier pour une équipe d'installation événementielle (Viewbox). Le ton est professionnel, clair, concret — pas de blabla marketing.

Projet : ${project.name}
Client : ${project.clientName || 'non renseigné'}
Site : ${project.address}${project.city ? ', ' + project.city : ''}
Installation : du ${fmtDate(project.installationStart)} au ${fmtDate(project.installationEnd)}
${project.dismantlingStart ? `Démontage : du ${fmtDate(project.dismantlingStart)} au ${fmtDate(project.dismantlingEnd)}` : 'Démontage : non planifié'}
Effectif prévu : ${project.workersCount || 'non précisé'}
Description / scope : ${project.description || project.scope || 'non renseigné'}
Notes installation : ${project.installNotes || '(aucune)'}
Notes démontage : ${project.dismantleNotes || '(aucune)'}
Consignes spéciales : ${project.specialInstructions || '(aucune)'}

Réponds UNIQUEMENT avec cet objet JSON (aucun texte, aucun backtick) :
{
  "intro": "2 à 4 phrases résumant l'objectif du chantier et le contexte pour l'équipe qui découvre le briefing. Base-toi UNIQUEMENT sur les infos ci-dessus, n'invente aucun détail absent.",
  "planningSteps": [
    { "time": "HH:MM ou vide si inconnu", "duration": "ex: 2h, ou vide", "description": "étape concrète de l'installation ou du démontage", "responsible": "rôle ou vide" }
  ]
}

Règles :
- N'invente JAMAIS une heure, un nom de personne ou un détail technique qui n'apparaît pas dans les infos ci-dessus.
- Si les infos ne permettent pas de déduire un planning détaillé heure par heure, propose des étapes génériques mais réalistes pour ce type de chantier (arrivée équipe, déchargement, montage, tests, nettoyage, etc.) SANS heures précises (laisse "time" vide).
- 3 à 8 étapes de planning maximum.`;
    return (0, aiService_1.callClaudeJSON)({
        maxTokens: 1500,
        schema: DRAFT_SCHEMA,
        messages: [{ role: 'user', content: prompt }],
    });
}
async function generateBriefingDraft(projectId) {
    const project = await database_1.prisma.project.findUnique({
        where: { id: projectId },
        include: {
            client: { include: { contacts: true } },
            technicalManager: { select: { firstName: true, lastName: true, phone: true, email: true } },
        },
    });
    if (!project)
        throw new AppError_1.AppError('Projet introuvable', 404);
    const draft = await draftTexts({
        name: project.name,
        clientName: project.client?.name || '',
        address: project.address,
        city: project.city,
        installationStart: project.installationStart,
        installationEnd: project.installationEnd,
        dismantlingStart: project.dismantlingStart,
        dismantlingEnd: project.dismantlingEnd,
        workersCount: project.workersCount,
        description: project.description,
        scope: project.scope,
        installNotes: project.installNotes,
        dismantleNotes: project.dismantleNotes,
        specialInstructions: project.specialInstructions,
    });
    // Contacts : contacts client réels + éventuellement le responsable technique interne.
    const contacts = [
        ...project.client.contacts.map(c => ({
            name: c.name, role: c.role || 'Contact client', phone: c.phone || '', email: c.email || '',
        })),
        ...(project.technicalManager ? [{
                name: `${project.technicalManager.firstName} ${project.technicalManager.lastName}`,
                role: 'Responsable technique Viewbox',
                phone: project.technicalManager.phone || '',
                email: project.technicalManager.email || '',
            }] : []),
    ];
    const slides = [
        { title: 'Infos projet', blocks: [{ type: 'project' }] },
        { title: 'Contacts', blocks: [{ type: 'contacts', contacts }] },
        { title: 'Introduction', blocks: [{ type: 'text', content: draft.intro }] },
        {
            title: 'Planning',
            blocks: [{
                    type: 'planning',
                    phase: 'installation',
                    dateLabel: fmtDate(project.installationStart),
                    steps: draft.planningSteps,
                }],
        },
        {
            title: 'Logistique',
            blocks: [
                { type: 'trucks' },
                { type: 'team_bookings' },
                { type: 'hotel_bookings' },
            ],
        },
    ];
    return { title: `Briefing IA — ${project.name}`, slides };
}
//# sourceMappingURL=briefingAI.js.map