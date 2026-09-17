"use strict";
// src/services/assistantService.ts
// Assistant en langage naturel pour les PM/chefs de projet : répond à des
// questions sur les projets en interrogeant la base via des "tools" Claude
// (tool-use), jamais "de mémoire". Chaque tool est une lecture Prisma bornée
// (take limité, champs explicitement sélectionnés, jamais de données
// sensibles comme passwordHash). Aucune écriture n'est exposée.
Object.defineProperty(exports, "__esModule", { value: true });
exports.askAssistant = askAssistant;
const zod_1 = require("zod");
const database_1 = require("../config/database");
const AppError_1 = require("../utils/AppError");
const logger_1 = require("../utils/logger");
const aiService_1 = require("./aiService");
const MAX_ROWS = 20;
const MAX_ITERATIONS = 5;
// Résout une référence de projet (id, n° interne ou nom partiel) vers un id réel.
async function resolveProjectId(ref) {
    if (!ref)
        return undefined;
    const byId = await database_1.prisma.project.findUnique({ where: { id: ref }, select: { id: true } }).catch(() => null);
    if (byId)
        return byId.id;
    const byInternalNumber = await database_1.prisma.project.findFirst({
        where: { internalNumber: { equals: ref, mode: 'insensitive' } },
        select: { id: true },
    });
    if (byInternalNumber)
        return byInternalNumber.id;
    const byName = await database_1.prisma.project.findFirst({
        where: { name: { contains: ref, mode: 'insensitive' } },
        select: { id: true },
        orderBy: { updatedAt: 'desc' },
    });
    return byName?.id;
}
const TOOLS = [
    {
        name: 'list_projects',
        description: "Liste les projets, avec filtre optionnel par statut ou par fenêtre de dates d'installation.",
        inputSchema: {
            type: 'object',
            properties: {
                status: { type: 'string', description: 'draft, confirmed, in_preparation, loading, on_site, installation, handover, dismantling, completed, cancelled...' },
                from: { type: 'string', description: 'Date ISO — projets dont l\'installation commence après cette date' },
                to: { type: 'string', description: 'Date ISO — projets dont l\'installation commence avant cette date' },
                search: { type: 'string', description: 'Recherche texte libre sur le nom du projet' },
            },
        },
        zodSchema: zod_1.z.object({
            status: zod_1.z.string().optional(),
            from: zod_1.z.string().optional(),
            to: zod_1.z.string().optional(),
            search: zod_1.z.string().optional(),
        }),
        resolve: async (input) => {
            const where = {};
            if (input.status)
                where.status = input.status;
            if (input.search)
                where.name = { contains: input.search, mode: 'insensitive' };
            if (input.from || input.to) {
                where.installationStart = {};
                if (input.from)
                    where.installationStart.gte = new Date(input.from);
                if (input.to)
                    where.installationStart.lte = new Date(input.to);
            }
            const projects = await database_1.prisma.project.findMany({
                where, take: MAX_ROWS, orderBy: { installationStart: 'asc' },
                select: {
                    internalNumber: true, name: true, status: true, city: true,
                    installationStart: true, installationEnd: true,
                    client: { select: { name: true } },
                },
            });
            return projects;
        },
    },
    {
        name: 'get_project',
        description: 'Récupère le détail complet d\'un projet (n° interne, nom, ou id).',
        inputSchema: {
            type: 'object',
            properties: { projectRef: { type: 'string', description: 'N° interne, id ou nom (partiel) du projet' } },
            required: ['projectRef'],
        },
        zodSchema: zod_1.z.object({ projectRef: zod_1.z.string() }),
        resolve: async (input) => {
            const id = await resolveProjectId(input.projectRef);
            if (!id)
                return { error: 'Projet introuvable' };
            return database_1.prisma.project.findUnique({
                where: { id },
                select: {
                    internalNumber: true, name: true, status: true, address: true, city: true,
                    installationStart: true, installationEnd: true, dismantlingStart: true, dismantlingEnd: true,
                    workersCount: true, description: true, specialInstructions: true,
                    client: { select: { name: true, contactName: true, phone: true, email: true } },
                    technicalManager: { select: { firstName: true, lastName: true } },
                },
            });
        },
    },
    {
        name: 'list_tasks',
        description: 'Liste les tâches, filtrables par projet et/ou statut.',
        inputSchema: {
            type: 'object',
            properties: {
                projectRef: { type: 'string', description: 'N° interne, id ou nom du projet' },
                status: { type: 'string', description: 'todo, in_progress, done, blocked, cancelled' },
            },
        },
        zodSchema: zod_1.z.object({ projectRef: zod_1.z.string().optional(), status: zod_1.z.string().optional() }),
        resolve: async (input) => {
            const projectId = await resolveProjectId(input.projectRef);
            if (input.projectRef && !projectId)
                return { error: 'Projet introuvable' };
            const where = {};
            if (projectId)
                where.projectId = projectId;
            if (input.status)
                where.status = input.status;
            return database_1.prisma.task.findMany({
                where, take: MAX_ROWS, orderBy: { taskDate: 'asc' },
                select: {
                    title: true, status: true, priority: true, taskDate: true,
                    assignedTo: { select: { firstName: true, lastName: true } },
                    project: { select: { internalNumber: true, name: true } },
                },
            });
        },
    },
    {
        name: 'list_tickets',
        description: "Liste les tickets (incidents/demandes), filtrables par projet, statut ou urgence.",
        inputSchema: {
            type: 'object',
            properties: {
                projectRef: { type: 'string' },
                status: { type: 'string', description: 'open, assigned, in_progress, resolved, validated, closed' },
                urgency: { type: 'string', description: 'low, medium, high, critical' },
            },
        },
        zodSchema: zod_1.z.object({ projectRef: zod_1.z.string().optional(), status: zod_1.z.string().optional(), urgency: zod_1.z.string().optional() }),
        resolve: async (input) => {
            const projectId = await resolveProjectId(input.projectRef);
            if (input.projectRef && !projectId)
                return { error: 'Projet introuvable' };
            const where = {};
            if (projectId)
                where.projectId = projectId;
            if (input.status)
                where.status = input.status;
            if (input.urgency)
                where.urgency = input.urgency;
            return database_1.prisma.ticket.findMany({
                where, take: MAX_ROWS, orderBy: { createdAt: 'desc' },
                select: {
                    title: true, description: true, urgency: true, status: true, plannedDate: true,
                    assignedTo: { select: { firstName: true, lastName: true } },
                    project: { select: { internalNumber: true, name: true } },
                },
            });
        },
    },
    {
        name: 'list_trucks',
        description: 'Liste les véhicules (camions, grues, nacelles...) planifiés, filtrables par projet ou statut.',
        inputSchema: {
            type: 'object',
            properties: {
                projectRef: { type: 'string' },
                status: { type: 'string', description: 'draft, planned, confirmed...' },
            },
        },
        zodSchema: zod_1.z.object({ projectRef: zod_1.z.string().optional(), status: zod_1.z.string().optional() }),
        resolve: async (input) => {
            const projectId = await resolveProjectId(input.projectRef);
            if (input.projectRef && !projectId)
                return { error: 'Projet introuvable' };
            const where = {};
            if (projectId)
                where.projectId = projectId;
            if (input.status)
                where.status = input.status;
            return database_1.prisma.truck.findMany({
                where, take: MAX_ROWS, orderBy: { loadingDate: 'asc' },
                select: {
                    vehicleType: true, truckNumber: true, licensePlate: true, driverName: true, status: true,
                    loadingDate: true, departureDate: true, arrivalDate: true,
                    project: { select: { internalNumber: true, name: true } },
                },
            });
        },
    },
    {
        name: 'list_team_bookings',
        description: "Liste les trajets (aller/retour) réservés pour l'équipe sur un projet.",
        inputSchema: {
            type: 'object',
            properties: { projectRef: { type: 'string' } },
        },
        zodSchema: zod_1.z.object({ projectRef: zod_1.z.string().optional() }),
        resolve: async (input) => {
            const projectId = await resolveProjectId(input.projectRef);
            if (input.projectRef && !projectId)
                return { error: 'Projet introuvable' };
            const where = {};
            if (projectId)
                where.projectId = projectId;
            return database_1.prisma.teamBooking.findMany({
                where, take: MAX_ROWS, orderBy: { onSiteStart: 'asc' },
                select: {
                    phase: true, onSiteStart: true, onSiteEnd: true,
                    outboundMode: true, outboundDate: true, returnMode: true, returnDate: true,
                    user: { select: { firstName: true, lastName: true } },
                    project: { select: { internalNumber: true, name: true } },
                },
            });
        },
    },
    {
        name: 'list_hotel_bookings',
        description: "Liste les réservations d'hôtel pour l'équipe sur un projet.",
        inputSchema: {
            type: 'object',
            properties: { projectRef: { type: 'string' } },
        },
        zodSchema: zod_1.z.object({ projectRef: zod_1.z.string().optional() }),
        resolve: async (input) => {
            const projectId = await resolveProjectId(input.projectRef);
            if (input.projectRef && !projectId)
                return { error: 'Projet introuvable' };
            const where = {};
            if (projectId)
                where.projectId = projectId;
            return database_1.prisma.hotelBooking.findMany({
                where, take: MAX_ROWS, orderBy: { checkin: 'asc' },
                select: {
                    hotelName: true, phase: true, checkin: true, checkout: true,
                    occupants: { select: { user: { select: { firstName: true, lastName: true } } } },
                    project: { select: { internalNumber: true, name: true } },
                },
            });
        },
    },
    {
        name: 'list_daily_reports',
        description: "Liste les rapports journaliers d'un projet (météo, effectif, notes, entrées chronologiques).",
        inputSchema: {
            type: 'object',
            properties: {
                projectRef: { type: 'string' },
                from: { type: 'string', description: 'Date ISO' },
                to: { type: 'string', description: 'Date ISO' },
            },
            required: ['projectRef'],
        },
        zodSchema: zod_1.z.object({ projectRef: zod_1.z.string(), from: zod_1.z.string().optional(), to: zod_1.z.string().optional() }),
        resolve: async (input) => {
            const projectId = await resolveProjectId(input.projectRef);
            if (!projectId)
                return { error: 'Projet introuvable' };
            const where = { projectId };
            if (input.from || input.to) {
                where.reportDate = {};
                if (input.from)
                    where.reportDate.gte = new Date(input.from);
                if (input.to)
                    where.reportDate.lte = new Date(input.to);
            }
            const reports = await database_1.prisma.dailyReport.findMany({
                where, take: MAX_ROWS, orderBy: { reportDate: 'desc' },
                select: {
                    reportDate: true, weather: true, workersPresent: true, generalNotes: true,
                    entries: { take: 10, select: { entryTime: true, description: true } },
                },
            });
            return reports;
        },
    },
];
function systemPrompt(user) {
    const today = new Date().toISOString().split('T')[0];
    return `Tu es l'assistant interne de VEM (Viewbox Event Manager), un outil de gestion de projets d'installation événementielle.
Date du jour : ${today}.
Utilisateur : ${user.firstName} ${user.lastName} (rôle : ${user.role}).

Règles impératives :
- Tu n'as PAS de connaissance directe des projets/tâches/tickets — utilise TOUJOURS les outils fournis pour aller chercher les données réelles avant de répondre.
- Ne réponds JAMAIS en inventant une donnée absente des résultats d'outils. Si les outils ne donnent pas la réponse, dis-le clairement.
- Réponds en français, de façon concise et concrète (liste à puces si utile), en citant les éléments concrets trouvés (n° de projet, dates, noms).
- Si la question est ambiguë (plusieurs projets possibles), utilise list_projects pour clarifier plutôt que de deviner.`;
}
async function askAssistant(question, user) {
    const messages = [
        { role: 'user', content: question },
    ];
    const toolCalls = [];
    const tools = TOOLS.map(t => ({ name: t.name, description: t.description, input_schema: t.inputSchema }));
    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
        const data = await (0, aiService_1.anthropicRequest)({
            max_tokens: 1500,
            system: systemPrompt(user),
            tools,
            messages,
        }, { timeoutMs: 30000, retries: 1 });
        const content = data.content || [];
        const toolUses = content.filter(b => b.type === 'tool_use');
        if (toolUses.length === 0) {
            const answer = content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
            return { answer: answer || "Je n'ai pas pu formuler de réponse.", toolCalls };
        }
        messages.push({ role: 'assistant', content });
        const toolResults = [];
        for (const use of toolUses) {
            const tool = TOOLS.find(t => t.name === use.name);
            let resultPayload;
            if (!tool) {
                resultPayload = { error: `Outil inconnu : ${use.name}` };
            }
            else {
                const parsedInput = tool.zodSchema.safeParse(use.input || {});
                if (!parsedInput.success) {
                    resultPayload = { error: `Paramètres invalides : ${parsedInput.error.message}` };
                }
                else {
                    try {
                        resultPayload = await tool.resolve(parsedInput.data);
                    }
                    catch (e) {
                        logger_1.logger.error(`[assistant] tool ${use.name} a échoué : ${e.message || e}`);
                        resultPayload = { error: 'Erreur lors de la lecture des données' };
                    }
                }
                toolCalls.push({ name: use.name, input: use.input });
            }
            toolResults.push({
                type: 'tool_result',
                tool_use_id: use.id,
                content: JSON.stringify(resultPayload ?? null).slice(0, 8000),
            });
        }
        messages.push({ role: 'user', content: toolResults });
    }
    throw new AppError_1.AppError("L'assistant n'a pas pu conclure (trop d'étapes nécessaires) — reformule ta question.", 502);
}
//# sourceMappingURL=assistantService.js.map