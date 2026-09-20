"use strict";
// src/services/taskHours.ts
// Calcule le total d'heures passées par tâche générale (template) sur un projet,
// à partir de tous ses daily reports. La correspondance ligne -> tâche générale
// est déterminée par IA (un seul appel par lot de lignes non encore classées),
// mise en cache dans DailyEntryTaskMap pour ne jamais réanalyser deux fois la
// même entrée. Le calcul des heures lui-même est du JS pur, sans IA.
Object.defineProperty(exports, "__esModule", { value: true });
exports.classifyProjectEntries = classifyProjectEntries;
exports.computeProjectTaskHours = computeProjectTaskHours;
const zod_1 = require("zod");
const database_1 = require("../config/database");
const aiService_1 = require("./aiService");
const logger_1 = require("../utils/logger");
const UNCLASSIFIED = 'Non classé';
// Nombre de lignes envoyées par appel IA — au-delà, on découpe en plusieurs
// appels pour éviter qu'Haiku coupe sa réponse (max_tokens) sur un trop gros lot.
const CHUNK_SIZE = 150;
// Durée attribuée à la dernière entrée horodatée d'un rapport, faute d'entrée
// suivante permettant de calculer un écart.
const DEFAULT_LAST_ENTRY_HOURS = 1;
const CLASSIFY_SCHEMA = zod_1.z.array(zod_1.z.object({
    i: zod_1.z.number(),
    task: zod_1.z.string(),
}));
function timeToMinutes(time) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(time);
    if (!m)
        return null;
    return Number(m[1]) * 60 + Number(m[2]);
}
async function classifyChunk(chunk, taskTitles) {
    const linesText = chunk.map((e, idx) => `${idx}. ${e.description}`).join('\n');
    const tasksText = taskTitles.map(t => `- ${t}`).join('\n');
    const result = await (0, aiService_1.callClaudeJSON)({
        maxTokens: 8000,
        timeoutMs: 90000,
        schema: CLASSIFY_SCHEMA,
        messages: [{
                role: 'user',
                content: `Tu dois classer chaque ligne de rapport de chantier ci-dessous dans UNE tâche générale parmi la liste fournie.

Tâches générales disponibles :
${tasksText}

Lignes à classer (index. description) :
${linesText}

Pour chaque ligne, choisis la tâche générale qui correspond le mieux. Si aucune ne correspond, réponds "${UNCLASSIFIED}".

Réponds UNIQUEMENT avec un tableau JSON de la forme [{"i": <index>, "task": "<titre exact d'une tâche ci-dessus, ou \\"${UNCLASSIFIED}\\">"}], un élément par ligne, sans texte avant ou après, sans backticks markdown.`,
            }],
    });
    return result;
}
// Classe (via IA) les entrées de daily report du projet pas encore présentes dans
// DailyEntryTaskMap. N'appelle l'IA que s'il reste des entrées non classées, et
// en un seul appel par lot de CHUNK_SIZE lignes.
async function classifyProjectEntries(projectId) {
    const entries = await database_1.prisma.dailyReportEntry.findMany({
        where: { report: { projectId } },
        select: { id: true, description: true },
    });
    if (entries.length === 0)
        return;
    const alreadyMapped = await database_1.prisma.dailyEntryTaskMap.findMany({
        where: { projectId },
        select: { entryId: true },
    });
    const mappedIds = new Set(alreadyMapped.map(m => m.entryId));
    const unmapped = entries.filter(e => !mappedIds.has(e.id));
    if (unmapped.length === 0)
        return;
    const templateTasks = await database_1.prisma.task.findMany({
        where: { projectId },
        select: { title: true, stage: true },
    });
    const stageByTitle = new Map();
    for (const t of templateTasks)
        if (!stageByTitle.has(t.title))
            stageByTitle.set(t.title, t.stage);
    const taskTitles = [...stageByTitle.keys()];
    if (taskTitles.length === 0) {
        // Aucune tâche template sur ce projet : tout part en "Non classé", sans appel IA.
        await database_1.prisma.dailyEntryTaskMap.createMany({
            data: unmapped.map(e => ({ entryId: e.id, projectId, taskTitle: UNCLASSIFIED, stage: null })),
            skipDuplicates: true,
        });
        return;
    }
    for (let offset = 0; offset < unmapped.length; offset += CHUNK_SIZE) {
        const chunk = unmapped.slice(offset, offset + CHUNK_SIZE);
        logger_1.logger.info(`[taskHours] classification IA projet=${projectId} : ${chunk.length} lignes (lot ${offset / CHUNK_SIZE + 1})`);
        const assignments = await classifyChunk(chunk, taskTitles);
        const taskByIndex = new Map(assignments.map(a => [a.i, a.task]));
        await database_1.prisma.$transaction(chunk.map((entry, idx) => {
            const rawTask = taskByIndex.get(idx);
            const taskTitle = rawTask && stageByTitle.has(rawTask) ? rawTask : UNCLASSIFIED;
            const stage = stageByTitle.get(taskTitle) ?? null;
            return database_1.prisma.dailyEntryTaskMap.upsert({
                where: { entryId: entry.id },
                create: { entryId: entry.id, projectId, taskTitle, stage },
                update: { taskTitle, stage },
            });
        }));
    }
}
// Calcule les heures par tâche générale à partir du cache DailyEntryTaskMap
// (pur JS, aucun appel IA ici). Pour chaque daily report, les entrées horodatées
// sont triées par heure croissante ; la durée d'une entrée = écart jusqu'à la
// suivante du même rapport, la dernière du rapport valant DEFAULT_LAST_ENTRY_HOURS.
// Les entrées sans heure ne comptent pas d'heures (mais restent classées).
async function computeProjectTaskHours(projectId) {
    const reports = await database_1.prisma.dailyReport.findMany({
        where: { projectId },
        select: { entries: { select: { id: true, entryTime: true } } },
    });
    const taskMaps = await database_1.prisma.dailyEntryTaskMap.findMany({
        where: { projectId },
        select: { entryId: true, taskTitle: true, stage: true },
    });
    const mapByEntry = new Map(taskMaps.map(m => [m.entryId, m]));
    const hoursByTask = new Map();
    for (const report of reports) {
        const timed = report.entries
            .map(e => ({ id: e.id, minutes: e.entryTime ? timeToMinutes(e.entryTime) : null }))
            .filter((e) => e.minutes !== null)
            .sort((a, b) => a.minutes - b.minutes);
        for (let i = 0; i < timed.length; i++) {
            const cur = timed[i];
            const next = timed[i + 1];
            const durationHours = next ? (next.minutes - cur.minutes) / 60 : DEFAULT_LAST_ENTRY_HOURS;
            const mapping = mapByEntry.get(cur.id);
            const taskTitle = mapping?.taskTitle || UNCLASSIFIED;
            const stage = mapping?.stage ?? null;
            const bucket = hoursByTask.get(taskTitle) || { stage, hours: 0 };
            bucket.hours += durationHours;
            hoursByTask.set(taskTitle, bucket);
        }
    }
    const data = [...hoursByTask.entries()]
        .map(([taskTitle, { stage, hours }]) => ({ taskTitle, stage, hours: Math.round(hours * 100) / 100 }))
        .sort((a, b) => b.hours - a.hours);
    const totalHours = Math.round(data.reduce((sum, t) => sum + t.hours, 0) * 100) / 100;
    const unclassifiedHours = data.find(t => t.taskTitle === UNCLASSIFIED)?.hours || 0;
    return { data, totalHours, unclassifiedHours };
}
//# sourceMappingURL=taskHours.js.map