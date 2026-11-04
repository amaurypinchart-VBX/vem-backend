// src/services/plansPdfJobs.ts
// PDF des jeux de plans faits par le serveur (Plans Viewbox) : le navigateur prépare ce que lui seul sait calculer
// (peinture visible, vues absentes du cache partagé), le serveur dessine les planches dans un processus séparé
// (plans-server/pdf-render.mjs, compilé depuis plans/src/server/pdfRender.tsx) avec une mémoire plafonnée : un jeu trop
// lourd arrête ce processus, jamais VEM. Un seul PDF à la fois (les autres attendent), fichiers dans le dossier
// temporaire, oubliés après une heure.
import { fork, ChildProcess } from 'child_process';
import { randomUUID } from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';

export type PdfJobState = 'waiting' | 'queued' | 'running' | 'done' | 'error';

export interface PdfJob {
  id: string;
  projectId: string;
  userId: string;
  dir: string;
  fileName: string;
  status: PdfJobState;
  page?: number;
  pages?: number;
  detail?: string;
  message?: string;
  size?: number;
  failedImages?: number;
  missingViews?: number;
  keys: string[];
  createdAt: number;
  touchedAt: number;
  child?: ChildProcess;
}

const BASE = path.join(os.tmpdir(), 'vem-plans-pdf');
const JOB_TTL_MS = 60 * 60 * 1000;
const JOB_TIMEOUT_MS = 30 * 60 * 1000;
/** mémoire du processus de rendu (Mo) : réglable par PLANS_PDF_HEAP_MB */
const HEAP_MB = Math.max(256, Number(process.env.PLANS_PDF_HEAP_MB) || 2048);

const jobs = new Map<string, PdfJob>();
const queue: string[] = [];
let running: string | null = null;

// tâches d'un démarrage précédent : perdues (processus arrêtés), dossiers effacés
try {
  fs.rmSync(BASE, { recursive: true, force: true });
} catch {
  /* rien */
}

/** Le rendu compilé est-il présent ? (absent en développement tant que `plans` n'a pas été compilé) */
export function rendererPath(): string | null {
  const candidates = [
    process.env.PLANS_PDF_RENDERER,
    path.resolve(__dirname, '../../plans-server/pdf-render.mjs'),
    path.resolve(process.cwd(), 'plans-server/pdf-render.mjs'),
  ].filter((p): p is string => !!p);
  return candidates.find((p) => fs.existsSync(p)) ?? null;
}

export function createJob(projectId: string, userId: string, manifest: unknown, fileName: string): PdfJob {
  const id = randomUUID();
  const dir = path.join(BASE, id);
  fs.mkdirSync(path.join(dir, 'views'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'lw'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest));
  const now = Date.now();
  const job: PdfJob = { id, projectId, userId, dir, fileName, status: 'waiting', keys: [], createdAt: now, touchedAt: now };
  jobs.set(id, job);
  return job;
}

export function getJob(id: string): PdfJob | undefined {
  const job = jobs.get(id);
  if (job) job.touchedAt = Date.now();
  return job;
}

export function jobStatus(job: PdfJob) {
  const position = job.status === 'queued' ? queue.indexOf(job.id) + (running ? 1 : 0) : undefined;
  return {
    id: job.id,
    status: job.status,
    page: job.page,
    pages: job.pages,
    detail: job.detail,
    message: job.message,
    size: job.size,
    failedImages: job.failedImages,
    missingViews: job.missingViews,
    ...(position != null ? { position } : {}),
  };
}

const lwFile = (job: PdfJob, key: string) => path.join(job.dir, 'lw', `${key}.bin`);

/** Vues que le navigateur doit envoyer : ni dans la tâche, ni dans le cache partagé des vues. */
export async function missingKeys(job: PdfJob, keys: string[]): Promise<string[]> {
  job.keys = [...new Set([...job.keys, ...keys])];
  const notHere = keys.filter((k) => !fs.existsSync(lwFile(job, k)));
  const shared = notHere.filter((k) => !k.startsWith('custom-'));
  const found = new Set<string>();
  for (let i = 0; i < shared.length; i += 500) {
    const part = shared.slice(i, i + 500);
    const rows = await prisma.$queryRaw<Array<{ k: string }>>`SELECT "key" AS k FROM "plans_linework_cache" WHERE "key" = ANY(${part}::text[])`;
    for (const r of rows) found.add(r.k);
  }
  return notHere.filter((k) => !found.has(k));
}

export function writeLinework(job: PdfJob, key: string, data: Buffer): void {
  fs.writeFileSync(lwFile(job, key), data);
  if (!job.keys.includes(key)) job.keys.push(key);
}

export function writeView(job: PdfJob, vpId: string, data: Buffer): void {
  fs.writeFileSync(path.join(job.dir, 'views', `${vpId}.bin`), data);
}

/** Lance (ou relance avec d'autres réglages d'images) le rendu : vues du cache partagé copiées, puis file d'attente. */
export async function startJob(job: PdfJob, options: { imagePx: number; jpegQuality: number }): Promise<void> {
  if (job.status === 'queued' || job.status === 'running') return;
  fs.writeFileSync(path.join(job.dir, 'options.json'), JSON.stringify(options));
  fs.rmSync(path.join(job.dir, 'out.pdf'), { force: true });
  Object.assign(job, { status: 'queued', page: 0, pages: undefined, detail: 'vues du serveur', message: undefined, size: undefined });
  try {
    // vues du cache partagé (une à la fois, ≤ 8 Mo chacune)
    for (const key of job.keys) {
      if (key.startsWith('custom-') || fs.existsSync(lwFile(job, key))) continue;
      const rows = await prisma.$queryRaw<Array<{ data: Buffer }>>`SELECT "data" FROM "plans_linework_cache" WHERE "key" = ${key}`;
      if (rows.length) fs.writeFileSync(lwFile(job, key), rows[0].data);
    }
  } catch (e) {
    Object.assign(job, { status: 'error', message: `Lecture des vues impossible : ${(e as Error).message}` });
    return;
  }
  job.detail = undefined;
  queue.push(job.id);
  pump();
}

function pump(): void {
  if (running) return;
  const id = queue.shift();
  if (!id) return;
  const job = jobs.get(id);
  if (!job || job.status !== 'queued') return pump();
  const renderer = rendererPath();
  if (!renderer) {
    Object.assign(job, { status: 'error', message: 'Rendu PDF du serveur absent (module Plans non compilé)' });
    return pump();
  }
  running = id;
  job.status = 'running';
  const started = Date.now();
  let child: ChildProcess;
  try {
    child = fork(renderer, [job.dir], {
      execArgv: [`--max-old-space-size=${HEAP_MB}`, '--expose-gc'],
      stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
    });
  } catch (e) {
    running = null;
    Object.assign(job, { status: 'error', message: (e as Error).message });
    return pump();
  }
  job.child = child;
  const timer = setTimeout(() => {
    job.message = 'Temps dépassé (30 min)';
    child.kill('SIGKILL');
  }, JOB_TIMEOUT_MS);
  child.on('message', (m: any) => {
    if (!m || typeof m !== 'object') return;
    if (m.type === 'progress') Object.assign(job, { page: m.page, pages: m.pages, ...(m.detail ? { detail: m.detail } : {}) });
    else if (m.type === 'done') Object.assign(job, { status: 'done', size: m.size, failedImages: m.failedImages, missingViews: m.missingViews, detail: undefined });
    else if (m.type === 'error') Object.assign(job, { message: String(m.message || 'Erreur du rendu') });
  });
  child.on('exit', (code, signal) => {
    clearTimeout(timer);
    job.child = undefined;
    running = null;
    if (job.status !== 'done') {
      const oom = signal === 'SIGABRT' || code === 134 || signal === 'SIGKILL';
      job.status = 'error';
      job.message ??= oom ? `Mémoire du serveur dépassée (${HEAP_MB} Mo)` : `Rendu arrêté (code ${code ?? signal})`;
      logger.warn(`PDF plans ${job.id} : ${job.message} — planche ${job.page ?? 0}/${job.pages ?? '?'}`);
    } else logger.info(`PDF plans ${job.id} : ${job.pages} planche(s), ${Math.round((job.size ?? 0) / 1e5) / 10} Mo en ${Math.round((Date.now() - started) / 1000)} s`);
    pump();
  });
}

export function outFile(job: PdfJob): string {
  return path.join(job.dir, 'out.pdf');
}

export function deleteJob(job: PdfJob): void {
  jobs.delete(job.id);
  const i = queue.indexOf(job.id);
  if (i >= 0) queue.splice(i, 1);
  job.child?.kill('SIGKILL');
  fs.rm(job.dir, { recursive: true, force: true }, () => undefined);
}

// tâches oubliées (onglet fermé) : effacées après une heure sans nouvelles
setInterval(() => {
  const now = Date.now();
  for (const job of [...jobs.values()]) if (job.status !== 'running' && now - job.touchedAt > JOB_TTL_MS) deleteJob(job);
}, 10 * 60 * 1000).unref();
