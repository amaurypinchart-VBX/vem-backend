// src/services/whatsappDaily.ts
// Conversation WhatsApp d'un groupe de chantier → brouillons de daily reports, un par journée.
//
// 1. `prepareWhatsAppImport` : lit l'export (whatsappChat.ts), regroupe les messages par journée de chantier et indique
//    pour chaque jour la phase (dates du projet) et les rapports déjà existants. Aucun appel IA.
// 2. `draftDailyFromChat` : une journée → Claude rédige le brouillon (journal horodaté, résumé, météo, ouvriers, heures par
//    tâche type, avancement des tâches du planning, légendes des photos). Chaque proposition cite ses messages (#n).
// Rien n'est créé ici : le front montre les brouillons, l'utilisateur corrige et valide, puis crée les rapports avec les
// routes habituelles (POST /daily-reports, photos, PATCH /tasks).
import { z } from 'zod';
import { prisma } from '../config/database';
import { AppError } from '../utils/AppError';
import { logger } from '../utils/logger';
import { anthropicRequest } from './aiService';
import { aiEnabled, logAiCall } from './structureAi';
import { costOf } from './structureAiGuard';
import { ChatMessage, DateOrder, dayTranscript, groupChatByDay, parseWhatsAppChat } from './whatsappChat';

/** Modèle de l'import WhatsApp : variable dédiée, sinon Claude Opus 5.5. */
export const WHATSAPP_MODEL = process.env.ANTHROPIC_MODEL_DAILY_IMPORT || 'claude-opus-5-5';

/** Au-delà, une journée n'est pas envoyée à l'IA (≈ 100 000 jetons) : à découper à la main. */
const MAX_DAY_CHARS = 400_000;

export const WEATHER_LABELS: Record<string, string> = {
  sunny: '☀️ Ensoleillé', cloudy: '⛅ Nuageux', rain: '🌧️ Pluie', cold: '❄️ Froid', storm: '🌩️ Orage',
};

type Phase = 'installation' | 'dismantling';

/** Date du calendrier à Bruxelles (les dates projet sont enregistrées à minuit local ou UTC selon la saisie). */
function brusselsDate(d: Date | null | undefined): string | null {
  if (!d) return null;
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Brussels', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/** Phase d'une journée d'après les dates du projet : dans une période, sinon installation avant le démontage. */
export function phaseForDate(date: string, p: { installationStart: Date; installationEnd: Date; dismantlingStart: Date | null; dismantlingEnd: Date | null }): Phase {
  const dStart = brusselsDate(p.dismantlingStart);
  const dEnd = brusselsDate(p.dismantlingEnd) || dStart;
  const iEnd = brusselsDate(p.installationEnd);
  if (dStart && date >= dStart && (!dEnd || date <= dEnd)) return 'dismantling';
  if (iEnd && date <= iEnd) return 'installation';
  if (dStart && date >= dStart) return 'dismantling';
  return 'installation';
}

export async function prepareWhatsAppImport(projectId: string, text: string, opts: { dayStartHour?: number; dateOrder?: DateOrder }) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true, installationStart: true, installationEnd: true, dismantlingStart: true, dismantlingEnd: true },
  });
  if (!project) throw new AppError('Projet introuvable', 404);
  const chat = parseWhatsAppChat(text, { dateOrder: opts.dateOrder });
  const days = groupChatByDay(chat.messages, opts.dayStartHour ?? 0);

  const existing = await prisma.dailyReport.findMany({ where: { projectId }, select: { reportDate: true } });
  const perDate = new Map<string, number>();
  for (const r of existing) {
    const k = r.reportDate.toISOString().slice(0, 10);
    perDate.set(k, (perDate.get(k) || 0) + 1);
  }
  return {
    format: chat.format,
    dateOrder: chat.dateOrder,
    participants: chat.participants,
    warnings: chat.warnings,
    project: {
      name: project.name,
      installation: [brusselsDate(project.installationStart), brusselsDate(project.installationEnd)],
      dismantling: [brusselsDate(project.dismantlingStart), brusselsDate(project.dismantlingEnd)],
    },
    ai: { enabled: aiEnabled(), model: WHATSAPP_MODEL },
    days: days.map(d => ({ ...d, phase: phaseForDate(d.date, project), existingReports: perDate.get(d.date) || 0 })),
  };
}

// ─── Brouillon d'une journée (IA) ───

const STATUS_FR: Record<string, string> = { todo: 'à faire', in_progress: 'en cours', done: 'terminée', blocked: 'bloquée' };

const INSTRUCTIONS = `Tu prépares le rapport journalier (daily report) d'un chantier Viewbox International (installation événementielle : box / modules, façades, vitrages, planchers, structures) à partir de la conversation WhatsApp du groupe de l'équipe pour UNE journée. Le rapport est relu et validé par le responsable avant d'être créé, puis il peut être envoyé au client : écris en français, clair, factuel et professionnel.

Règles :
- N'utilise que ce qui est écrit dans les messages de la journée (et les notes vocales transcrites). N'invente rien : pas d'heure, de quantité, de nom ou de problème qui ne soit pas dans les messages.
- Ignore les blagues, salutations, messages privés ou hors chantier. Un média sans texte ne donne pas d'information à lui seul.
- Chaque message est numéroté « [#n HH:MM] Auteur : texte ». Cite les numéros des messages qui justifient chaque proposition dans « refs ».

Réponds UNIQUEMENT avec un objet JSON, sans texte autour, de cette forme :
{
  "relevant": true,
  "summary": "…",
  "weather": "",
  "workersPresent": null,
  "workersBasis": "",
  "entries": [{ "time": "HH:MM", "text": "…", "refs": [3, 4] }],
  "taskHours": [{ "template": "H2", "title": "…", "hours": 0, "workers": 0, "basis": "…", "refs": [] }],
  "taskUpdates": [{ "task": "T5", "status": "done", "evidence": "…", "refs": [] }],
  "photos": [{ "photo": "p1", "caption": "…" }],
  "questions": ["…"]
}

Champs :
- relevant : false seulement si la journée ne contient rien sur le travail du chantier (alors le reste peut être vide).
- summary : 3 à 6 phrases : ce qui a été fait, l'avancement, les problèmes / incidents, ce qui reste ou la suite prévue.
- weather : "sunny", "cloudy", "rain", "cold", "storm" si la météo est dite dans les messages, sinon "".
- workersPresent : nombre de personnes de l'équipe présentes sur le chantier ce jour-là s'il est dit ou s'il se déduit clairement des messages (ex. « on est 6 »), sinon null ; workersBasis explique d'où vient ce nombre (messages #n).
- entries : le journal de chantier, dans l'ordre chronologique. Une entrée = une action, un événement ou un problème distinct (arrivée, livraison, montage de telle box, réception, incident, départ…). time = l'heure citée dans le message si elle est donnée (« fini à 16h30 »), sinon l'heure d'envoi du message. Ne fusionne pas deux actions distinctes ; regroupe en revanche les messages qui disent la même chose. Un problème commence par « ⚠️ ».
- taskHours : le tableau heures / hommes. Pour chaque tâche type (Hn) travaillée ce jour : hours = durée de travail sur cette tâche dans la journée (en heures, au quart d'heure), workers = nombre d'hommes sur cette tâche. Ces nombres doivent se déduire des messages (heures de début / fin annoncées, heures des messages, nombre de personnes cité). basis = le calcul avec ses messages, ex. « début 08:00 (#12), fini 12:30 (#40) = 4,5 h ; 4 hommes (#3) ». Si la durée ou le nombre d'hommes ne peut pas être déduit, mets 0 et pose la question dans « questions ». Utilise la référence Hn de la liste quand le travail y correspond ; sinon template null et un titre court. Ne mets pas de ligne pour une tâche qui n'a pas été travaillée.
- taskUpdates : les tâches du planning du projet (Tn) dont les messages montrent clairement qu'elles ont été terminées (done), commencées (in_progress) ou bloquées (blocked) ce jour-là. evidence = la phrase du message, entre guillemets, avec #n. Ne propose pas le statut actuel de la tâche, ni de revenir en arrière sur une tâche terminée.
- photos : une légende courte (12 mots maximum) pour chaque photo pN, d'après sa légende WhatsApp ou les messages autour (ce que montre probablement la photo) ; si rien ne l'indique : "Photo du chantier".
- questions : au plus 5 points que le responsable doit vérifier ou compléter avant de valider (informations manquantes, contradictions).`;

const ref = z.preprocess(v => (typeof v === 'string' ? Number(String(v).replace(/^#/, '')) : v), z.number()).catch(NaN);
const refs = z.array(ref).catch([]);
const DayAi = z.object({
  relevant: z.boolean().catch(true),
  summary: z.string().catch(''),
  weather: z.string().catch(''),
  workersPresent: z.number().nullable().catch(null),
  workersBasis: z.string().catch(''),
  entries: z.array(z.object({ time: z.string().catch(''), text: z.string().catch(''), refs })).catch([]),
  taskHours: z.array(z.object({
    template: z.string().nullable().catch(null),
    title: z.string().catch(''),
    hours: z.number().catch(0),
    workers: z.number().catch(0),
    basis: z.string().catch(''),
    refs,
  })).catch([]),
  taskUpdates: z.array(z.object({ task: z.string().catch(''), status: z.string().catch(''), evidence: z.string().catch(''), refs })).catch([]),
  photos: z.array(z.object({ photo: z.string().catch(''), caption: z.string().catch('') })).catch([]),
  questions: z.array(z.string()).catch([]),
});

export interface DayDraft {
  date: string;
  phase: Phase;
  relevant: boolean;
  summary: string;
  weather: string;
  workersPresent: number | null;
  workersBasis: string;
  entries: Array<{ time: string; text: string; refs: number[] }>;
  taskHours: Array<{ taskTemplateId: string | null; taskTitle: string; hours: number; workers: number; basis: string; refs: number[] }>;
  taskUpdates: Array<{ taskId: string; title: string; current: string; status: 'done' | 'in_progress' | 'blocked'; evidence: string; refs: number[] }>;
  /** légende proposée par numéro de message (photo) */
  photoCaptions: Record<number, string>;
  questions: string[];
  model: string;
  costUsd: number | null;
}

function firstJson(text: string): unknown {
  const cleaned = text.replace(/```json|```/g, '');
  const a = cleaned.indexOf('{');
  const b = cleaned.lastIndexOf('}');
  if (a < 0 || b <= a) throw new AppError('Réponse de l’IA illisible (pas de JSON) : relancer l’analyse de ce jour.', 502);
  try { return JSON.parse(cleaned.slice(a, b + 1)); }
  catch { throw new AppError('Réponse de l’IA illisible (JSON invalide) : relancer l’analyse de ce jour.', 502); }
}

const clean = (s: string, max = 2000) => String(s || '').replace(/\s+\n/g, '\n').trim().slice(0, max);

function hhmm(t: string): string {
  const m = /^(\d{1,2})[:h.](\d{2})$/.exec(String(t || '').trim());
  if (!m || +m[1] > 23 || +m[2] > 59) return '';
  return `${m[1].padStart(2, '0')}:${m[2]}`;
}

/** Modèles qui acceptent output_config.effort / le repli serveur. */
const supportsEffort = (model: string) => /opus-5|fable-5|mythos-5|sonnet-5|haiku-5/.test(model);
const supportsFallback = (model: string) => /opus-5-5|fable-5|sonnet-5-5/.test(model);

export async function draftDailyFromChat(
  projectId: string,
  input: { date: string; phase?: string; messages: Array<ChatMessage & { transcript?: string }> },
  ctx: { userId?: string },
): Promise<DayDraft> {
  if (!aiEnabled()) throw new AppError('IA non configurée (clé API Anthropic absente) : créer le rapport à la main.', 503);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new AppError('Date invalide', 400);
  // messages renvoyés par le navigateur : on ne garde que les champs attendus
  const KINDS = ['photo', 'video', 'audio', 'document', 'sticker', 'contact', 'other'];
  const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');
  const messages: Array<ChatMessage & { transcript?: string }> = (input.messages || [])
    .filter(m => m && Number.isInteger(m.i))
    .slice(0, 5000)
    .map(m => ({
      i: m.i,
      date: str(m.date, 10),
      time: str(m.time, 5),
      author: str(m.author, 120) || null,
      text: str(m.text, 20000),
      ...(m.file && KINDS.includes(m.kind as string) ? { file: str(m.file, 200), kind: m.kind } : {}),
      ...(KINDS.includes(m.omitted as string) ? { omitted: m.omitted } : {}),
      ...(typeof m.transcript === 'string' ? { transcript: str(m.transcript, 20000) } : {}),
    }));
  if (!messages.length) throw new AppError('Aucun message pour cette journée', 400);

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      name: true, internalNumber: true, city: true,
      installationStart: true, installationEnd: true, dismantlingStart: true, dismantlingEnd: true,
      client: { select: { name: true } },
    },
  });
  if (!project) throw new AppError('Projet introuvable', 404);
  const phase: Phase = input.phase === 'dismantling' || input.phase === 'installation' ? input.phase : phaseForDate(input.date, project);

  const [allTasks, templates, team] = await Promise.all([
    prisma.task.findMany({
      where: { projectId },
      select: { id: true, title: true, status: true, stage: true, taskDate: true, assignedTo: { select: { firstName: true, lastName: true } } },
      orderBy: [{ taskDate: 'asc' }, { createdAt: 'asc' }],
    }),
    prisma.taskTemplate.findMany({
      where: { isActive: true, phase },
      select: { id: true, title: true, category: { select: { name: true } } },
      orderBy: [{ sortOrder: 'asc' }],
    }),
    prisma.projectTeam.findMany({ where: { projectId }, include: { user: { select: { firstName: true, lastName: true } } } }),
  ]);

  // statut filtré ici plutôt que dans la requête (types d'enum de la base de production, voir dailyAttachments.ts)
  const tasks = allTasks.filter(t => String(t.status) !== 'cancelled').slice(0, 400);
  const tRef = new Map<string, (typeof tasks)[number]>(tasks.map((t, k) => [`T${k + 1}`, t]));
  const hRef = new Map<string, (typeof templates)[number]>(templates.map((t, k) => [`H${k + 1}`, t]));
  const fmt = (d: Date | null) => (d ? brusselsDate(d) : '—');
  const context = [
    `Projet : ${project.name} (n° ${project.internalNumber})${project.client?.name ? `, client ${project.client.name}` : ''}${project.city ? `, ${project.city}` : ''}`,
    `Installation du ${fmt(project.installationStart)} au ${fmt(project.installationEnd)}${project.dismantlingStart ? ` ; démontage du ${fmt(project.dismantlingStart)} au ${fmt(project.dismantlingEnd)}` : ''}`,
    `Équipe du projet : ${team.map(m => `${m.user.firstName} ${m.user.lastName} (${m.role})`).join(', ') || '—'}`,
    '',
    `Tâches du planning du projet (référence, statut actuel, titre) :`,
    ...(tasks.length
      ? tasks.map((t, k) => `T${k + 1} [${STATUS_FR[t.status] || t.status}] ${t.title}${t.stage ? ` — ${t.stage}` : ''}${t.taskDate ? ` — prévue le ${fmt(t.taskDate)}` : ''}${t.assignedTo ? ` — ${t.assignedTo.firstName} ${t.assignedTo.lastName}` : ''}`)
      : ['(aucune tâche au planning)']),
    '',
    `Tâches types du tableau heures / hommes (phase ${phase === 'dismantling' ? 'démontage' : 'installation'}) :`,
    ...(templates.length ? templates.map((t, k) => `H${k + 1} ${t.title}${t.category?.name ? ` — ${t.category.name}` : ''}`) : ['(aucune tâche type)']),
  ].join('\n');

  const { text: transcript, photoRefs } = dayTranscript(messages);
  if (transcript.length > MAX_DAY_CHARS) {
    throw new AppError(`Journée trop longue pour l’analyse (${Math.round(transcript.length / 1000)} 000 caractères) : créer ce rapport à la main.`, 413);
  }
  const dayLabel = new Date(`${input.date}T12:00:00Z`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

  const body: Record<string, any> = {
    model: WHATSAPP_MODEL,
    max_tokens: 16000,
    // consignes + contexte du projet identiques pour tous les jours d'une même phase : mis en cache
    system: [
      { type: 'text', text: INSTRUCTIONS },
      { type: 'text', text: context, cache_control: { type: 'ephemeral' } },
    ],
    messages: [{
      role: 'user',
      content: `Journée du ${dayLabel} (${input.date}), phase ${phase === 'dismantling' ? 'démontage' : 'installation'}. Messages WhatsApp de la journée :\n\n${transcript}`,
    }],
    ...(supportsEffort(WHATSAPP_MODEL) ? { output_config: { effort: 'medium' } } : {}),
  };

  const t0 = Date.now();
  let data: any;
  try {
    if (supportsFallback(WHATSAPP_MODEL)) {
      // repli côté serveur sur un autre modèle en cas de refus (Claude API) ; sans cette option si elle est refusée
      try {
        data = await anthropicRequest({ ...body, fallbacks: 'default' }, { timeoutMs: 240000, retries: 1, betas: ['server-side-fallback-2026-07-01'] });
      } catch (e: any) {
        if (!(e instanceof AppError) || !/fallback|beta/i.test(e.message)) throw e;
        data = await anthropicRequest(body, { timeoutMs: 240000, retries: 1 });
      }
    } else {
      data = await anthropicRequest(body, { timeoutMs: 240000, retries: 1 });
    }
  } catch (e: any) {
    await logAiCall('daily-whatsapp', { userId: ctx.userId }, { model: WHATSAPP_MODEL, durationMs: Date.now() - t0 }, false, e.message);
    throw e;
  }
  const model = data.model ?? WHATSAPP_MODEL;
  const costUsd = costOf(model, data.usage ?? {});
  const usage = {
    model,
    inputTokens: (data.usage?.input_tokens ?? 0) + (data.usage?.cache_read_input_tokens ?? 0) + (data.usage?.cache_creation_input_tokens ?? 0),
    outputTokens: data.usage?.output_tokens ?? 0,
    costUsd,
    durationMs: Date.now() - t0,
  };
  const stop = data.stop_reason;
  await logAiCall('daily-whatsapp', { userId: ctx.userId }, usage, stop !== 'refusal' && stop !== 'max_tokens', stop === 'refusal' || stop === 'max_tokens' ? `stop_reason=${stop}` : undefined);
  if (stop === 'refusal') throw new AppError('L’IA a refusé d’analyser cette journée : créer ce rapport à la main.', 422);
  if (stop === 'max_tokens') throw new AppError('Réponse de l’IA coupée (journée très chargée) : relancer, ou créer ce rapport à la main.', 502);
  const text = (data.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
  const parsed = DayAi.safeParse(firstJson(text));
  if (!parsed.success) {
    logger.error(`[whatsappDaily] réponse hors schéma : ${parsed.error.message.slice(0, 400)}`);
    throw new AppError('Réponse de l’IA hors du format attendu : relancer l’analyse de ce jour.', 502);
  }
  const ai = parsed.data;

  // ─── normalisation : références → ids, nombres bornés, rien qui ne vienne pas de la liste ───
  const known = new Set(messages.map(m => m.i));
  const okRefs = (r: number[]) => [...new Set(r.filter(n => Number.isInteger(n) && known.has(n)))].slice(0, 30);
  const quarter = (h: number) => Math.round(Math.min(24, Math.max(0, Number(h) || 0)) * 4) / 4;

  const entries = ai.entries
    .map(e => ({ time: hhmm(e.time), text: clean(e.text, 1500), refs: okRefs(e.refs) }))
    .filter(e => e.text)
    .slice(0, 200);

  const taskHours = ai.taskHours
    .map(t => {
      const tpl = t.template ? hRef.get(String(t.template).trim().toUpperCase()) : undefined;
      return {
        taskTemplateId: tpl?.id ?? null,
        taskTitle: clean(tpl?.title || t.title, 200),
        hours: quarter(t.hours),
        workers: Math.round(Math.min(500, Math.max(0, Number(t.workers) || 0))),
        basis: clean(t.basis, 600),
        refs: okRefs(t.refs),
      };
    })
    .filter(t => t.taskTitle)
    .slice(0, 60);

  const updates = new Map<string, DayDraft['taskUpdates'][number]>();
  for (const u of ai.taskUpdates) {
    const task = tRef.get(String(u.task).trim().toUpperCase());
    const status = u.status as 'done' | 'in_progress' | 'blocked';
    if (!task || !['done', 'in_progress', 'blocked'].includes(status)) continue;
    const current = String(task.status);
    if (current === status || current === 'done') continue;
    updates.set(task.id, { taskId: task.id, title: task.title, current, status, evidence: clean(u.evidence, 600), refs: okRefs(u.refs) });
  }

  const photoCaptions: Record<number, string> = {};
  for (const p of ai.photos) {
    const idx = photoRefs[String(p.photo).trim().toLowerCase()];
    if (idx !== undefined && p.caption.trim()) photoCaptions[idx] = clean(p.caption, 200);
  }

  const workers = ai.workersPresent;
  return {
    date: input.date,
    phase,
    relevant: ai.relevant,
    summary: clean(ai.summary, 4000),
    weather: WEATHER_LABELS[String(ai.weather).trim().toLowerCase()] || '',
    workersPresent: workers === null || !Number.isFinite(workers) ? null : Math.round(Math.min(500, Math.max(0, workers))),
    workersBasis: clean(ai.workersBasis, 400),
    entries,
    taskHours,
    taskUpdates: [...updates.values()],
    photoCaptions,
    questions: ai.questions.map(q => clean(q, 400)).filter(Boolean).slice(0, 8),
    model,
    costUsd,
  };
}
