// src/middleware/scopeGuard.ts
// Cloisonnement par projet des accès limités (site manager, installateur, ouvrier, client) — voir access.ts.
//
// Liste BLANCHE : pour un accès limité, une requête qui ne correspond à aucune règle de son module est refusée.
// Chaque règle dit ce qu'il faut pour passer (lecture / écriture / droit donné) et comment retrouver le ou les
// projets concernés (paramètre, ou objet → son projet). Tous les projets trouvés doivent être accessibles, ainsi
// qu'un projectId éventuel dans la query ou le corps (empêche de déplacer un objet vers un autre projet).
// Les listes sans projet (règle `list`) sont filtrées dans la route avec projectWhere().
// Les accès complets (admin, technical manager, project manager, engineer, sales, warehouse) ne passent pas ici.
import { Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { AuthRequest, projectIds } from './auth';
import { AppError } from '../utils/AppError';
import { canWrite, Grant } from './access';

const db = prisma as any;

/** read = voir ; write = créer / modifier (site manager) ; anyWrite = site manager ou un droit donné ; ou un droit précis */
type Need = 'read' | 'write' | 'anyWrite' | Grant;
type Ids = Array<string | null | undefined>;

export interface Rule {
  m: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  p: string;
  need: Need;
  /** le rôle client passe aussi (lecture seulement) */
  client?: boolean;
  /** liste filtrée dans la route (ou action sans projet) */
  list?: boolean;
  /** au moins un des projets trouvés suffit (fiche client partagée par plusieurs projets) */
  any?: boolean;
  proj?: (pr: Record<string, string>, req: AuthRequest) => Promise<Ids> | Ids;
}

// ── objet → projet ───────────────────────────────────────────────────────────
async function pid(model: string, id: string | undefined): Promise<string | null> {
  if (!id) return null;
  const r = await db[model].findUnique({ where: { id }, select: { projectId: true } }).catch(() => null);
  return r?.projectId ?? null;
}
const look = {
  task: (id?: string) => pid('task', id),
  ticket: (id?: string) => pid('ticket', id),
  handover: (id?: string) => pid('handover', id),
  daily: (id?: string) => pid('dailyReport', id),
  truck: (id?: string) => pid('truck', id),
  file: (id?: string) => pid('projectFile', id),
  member: (id?: string) => pid('projectTeam', id),
  remark: (id?: string) => pid('clientRemark', id),
  visit: (id?: string) => pid('clientVisit', id),
  briefing: (id?: string) => pid('briefing', id),
  booking: (id?: string) => pid('teamBooking', id),
  hotel: (id?: string) => pid('hotelBooking', id),
  box: (id?: string) => pid('warehouseBox', id),
  toolbox: (id?: string) => pid('toolbox', id),
  checklist: (id?: string) => pid('projectChecklist', id),
  async handoverItem(id?: string) {
    if (!id) return null;
    const r = await db.handoverItem.findUnique({ where: { id }, select: { handover: { select: { projectId: true } } } }).catch(() => null);
    return r?.handover?.projectId ?? null;
  },
  async dailyPhoto(id?: string) {
    if (!id) return null;
    const r = await db.dailyReportPhoto.findUnique({ where: { id }, select: { report: { select: { projectId: true } } } }).catch(() => null);
    return r?.report?.projectId ?? null;
  },
  async boxItem(id?: string) {
    if (!id) return null;
    const r = await db.boxItem.findUnique({ where: { id }, select: { box: { select: { projectId: true } } } }).catch(() => null);
    return r?.box?.projectId ?? null;
  },
  async boxQr(qr?: string) {
    if (!qr) return null;
    const r = await db.warehouseBox.findUnique({ where: { qrCode: qr }, select: { projectId: true } }).catch(() => null);
    return r?.projectId ?? null;
  },
  async drawer(id?: string) {
    if (!id) return null;
    const r = await db.toolboxDrawer.findUnique({ where: { id }, select: { toolbox: { select: { projectId: true } } } }).catch(() => null);
    return r?.toolbox?.projectId ?? null;
  },
  async tool(id?: string) {
    if (!id) return null;
    const r = await db.toolboxTool.findUnique({ where: { id }, select: { drawer: { select: { toolbox: { select: { projectId: true } } } } } }).catch(() => null);
    return r?.drawer?.toolbox?.projectId ?? null;
  },
  async checklistItem(id?: string) {
    if (!id) return null;
    const r = await db.projectChecklistItem.findUnique({ where: { id }, select: { checklist: { select: { projectId: true } } } }).catch(() => null);
    return r?.checklist?.projectId ?? null;
  },
  async checklistPhoto(id?: string) {
    if (!id) return null;
    const r = await db.projectChecklistPhoto.findUnique({ where: { id }, select: { item: { select: { checklist: { select: { projectId: true } } } } } }).catch(() => null);
    return r?.item?.checklist?.projectId ?? null;
  },
  async clientProjects(clientId?: string): Promise<string[]> {
    if (!clientId) return [];
    const rows = await prisma.project.findMany({ where: { clientId }, select: { id: true } });
    return rows.map((r) => r.id);
  },
};

const body = (req: AuthRequest) => [req.body?.projectId];

// ── règles par module ────────────────────────────────────────────────────────
export const RULES: Record<string, Rule[]> = {
  projects: [
    { m: 'GET', p: '/', need: 'read', client: true, list: true },
    { m: 'GET', p: '/:id', need: 'read', client: true, proj: (p) => [p.id] },
    { m: 'PATCH', p: '/:id', need: 'write', proj: (p) => [p.id] },
    { m: 'POST', p: '/:id/team', need: 'write', proj: (p) => [p.id] },
    { m: 'PATCH', p: '/:id/team/:memberId', need: 'write', proj: async (p) => [p.id, await look.member(p.memberId)] },
    { m: 'DELETE', p: '/:id/team/:memberId', need: 'write', proj: async (p) => [p.id, await look.member(p.memberId)] },
    { m: 'POST', p: '/:id/team/:memberId/notify', need: 'write', proj: async (p) => [p.id, await look.member(p.memberId)] },
    { m: 'GET', p: '/:id/trucks', need: 'read', proj: (p) => [p.id] },
    { m: 'POST', p: '/:id/trucks', need: 'write', proj: (p) => [p.id] },
    { m: 'PATCH', p: '/:id/trucks/:truckId', need: 'write', proj: async (p) => [p.id, await look.truck(p.truckId)] },
    { m: 'DELETE', p: '/:id/trucks/:truckId', need: 'write', proj: async (p) => [p.id, await look.truck(p.truckId)] },
    { m: 'GET', p: '/:id/report/pdf', need: 'read', proj: (p) => [p.id] },
    { m: 'GET', p: '/:id/task-hours', need: 'read', proj: (p) => [p.id] },
    { m: 'GET', p: '/:id/files', need: 'read', proj: (p) => [p.id] },
    { m: 'PUT', p: '/:id/files/reorder', need: 'write', proj: (p) => [p.id] },
    { m: 'POST', p: '/:id/files', need: 'write', proj: (p) => [p.id] },
    { m: 'DELETE', p: '/:id/files/:fileId', need: 'write', proj: async (p) => [p.id, await look.file(p.fileId)] },
    // /projects/:id/bookings et /hotel-bookings sont servis par le routeur teamBookings (monté à la racine de l'API)
    { m: 'GET', p: '/:id/bookings', need: 'read', proj: (p) => [p.id] },
    { m: 'POST', p: '/:id/bookings', need: 'write', proj: (p) => [p.id] },
    { m: 'GET', p: '/:id/hotel-bookings', need: 'read', proj: (p) => [p.id] },
    { m: 'POST', p: '/:id/hotel-bookings', need: 'write', proj: (p) => [p.id] },
  ],
  tasks: [
    { m: 'GET', p: '/', need: 'read', list: true },
    { m: 'POST', p: '/', need: 'write', proj: (_p, req) => body(req) },
    { m: 'PATCH', p: '/:id', need: 'write', proj: async (p) => [await look.task(p.id)] },
    { m: 'DELETE', p: '/:id', need: 'write', proj: async (p) => [await look.task(p.id)] },
    { m: 'POST', p: '/:id/comments', need: 'write', proj: async (p) => [await look.task(p.id)] },
  ],
  tickets: [
    { m: 'GET', p: '/', need: 'read', list: true },
    { m: 'GET', p: '/stats', need: 'read', list: true },
    { m: 'GET', p: '/:id', need: 'read', proj: async (p) => [await look.ticket(p.id)] },
    { m: 'POST', p: '/', need: 'write', proj: (_p, req) => body(req) },
    { m: 'PATCH', p: '/:id', need: 'write', proj: async (p) => [await look.ticket(p.id)] },
  ],
  handover: [
    { m: 'GET', p: '/', need: 'read', client: true, list: true },
    { m: 'GET', p: '/:id', need: 'read', client: true, proj: async (p) => [await look.handover(p.id)] },
    { m: 'GET', p: '/:id/pdf', need: 'read', client: true, proj: async (p) => [await look.handover(p.id)] },
    { m: 'POST', p: '/', need: 'handover', proj: (_p, req) => body(req) },
    { m: 'PATCH', p: '/:id', need: 'handover', proj: async (p) => [await look.handover(p.id)] },
    { m: 'POST', p: '/:id/items', need: 'handover', proj: async (p) => [await look.handover(p.id)] },
    { m: 'DELETE', p: '/:id', need: 'write', proj: async (p) => [await look.handover(p.id)] },
    { m: 'POST', p: '/:id/sign', need: 'handover', proj: async (p) => [await look.handover(p.id)] },
    { m: 'POST', p: '/:id/items/:itemId/photo', need: 'handover', proj: async (p) => [await look.handover(p.id), await look.handoverItem(p.itemId)] },
    { m: 'PATCH', p: '/:id/items/:itemId', need: 'handover', proj: async (p) => [await look.handover(p.id), await look.handoverItem(p.itemId)] },
    { m: 'POST', p: '/:id/send', need: 'handover', proj: async (p) => [await look.handover(p.id)] },
    { m: 'POST', p: '/:id/signature-token', need: 'handover', proj: async (p) => [await look.handover(p.id)] },
  ],
  checklists: [
    { m: 'GET', p: '/templates', need: 'read', list: true },
    { m: 'GET', p: '/project/:projectId', need: 'read', proj: (p) => [p.projectId] },
    { m: 'GET', p: '/project/:projectId/pdf', need: 'read', proj: (p) => [p.projectId] },
    { m: 'POST', p: '/project/:projectId/send', need: 'checklists', proj: (p) => [p.projectId] },
    { m: 'POST', p: '/project/:projectId/configure', need: 'write', proj: (p) => [p.projectId] },
    { m: 'PATCH', p: '/items/:itemId', need: 'checklists', proj: async (p) => [await look.checklistItem(p.itemId)] },
    { m: 'POST', p: '/items/:itemId/photos', need: 'checklists', proj: async (p) => [await look.checklistItem(p.itemId)] },
    { m: 'POST', p: '/items/:itemId/documents', need: 'checklists', proj: async (p) => [await look.checklistItem(p.itemId)] },
    { m: 'DELETE', p: '/photos/:photoId', need: 'checklists', proj: async (p) => [await look.checklistPhoto(p.photoId)] },
    { m: 'GET', p: '/items/:itemId/logs', need: 'read', proj: async (p) => [await look.checklistItem(p.itemId)] },
    { m: 'PATCH', p: '/:checklistId', need: 'checklists', proj: async (p) => [await look.checklist(p.checklistId)] },
    { m: 'POST', p: '/:checklistId/validate', need: 'checklists', proj: async (p) => [await look.checklist(p.checklistId)] },
  ],
  daily: [
    { m: 'GET', p: '/', need: 'read', list: true },
    { m: 'GET', p: '/:id', need: 'read', proj: async (p) => [await look.daily(p.id)] },
    { m: 'POST', p: '/', need: 'daily_reports', proj: (_p, req) => body(req) },
    { m: 'PATCH', p: '/:id', need: 'daily_reports', proj: async (p) => [await look.daily(p.id)] },
    { m: 'POST', p: '/:id/photos', need: 'daily_reports', proj: async (p) => [await look.daily(p.id)] },
    { m: 'DELETE', p: '/:id/photos/:photoId', need: 'daily_reports', proj: async (p) => [await look.daily(p.id), await look.dailyPhoto(p.photoId)] },
    { m: 'PATCH', p: '/:id/photos/:photoId', need: 'daily_reports', proj: async (p) => [await look.daily(p.id), await look.dailyPhoto(p.photoId)] },
    { m: 'DELETE', p: '/:id', need: 'write', proj: async (p) => [await look.daily(p.id)] },
    { m: 'POST', p: '/:id/send', need: 'daily_reports', proj: async (p) => [await look.daily(p.id)] },
    { m: 'GET', p: '/:id/pdf', need: 'read', proj: async (p) => [await look.daily(p.id)] },
    { m: 'GET', p: '/:id/attachments', need: 'read', proj: async (p) => [await look.daily(p.id)] },
    { m: 'POST', p: '/:id/attachments', need: 'daily_reports', proj: async (p) => [await look.daily(p.id)] },
    { m: 'POST', p: '/:id/attachments/checklist', need: 'daily_reports', proj: async (p) => [await look.daily(p.id)] },
    { m: 'DELETE', p: '/:id/attachments/:attId', need: 'daily_reports', proj: async (p) => [await look.daily(p.id)] },
  ],
  upload: [
    { m: 'POST', p: '/photo', need: 'anyWrite', list: true },
    { m: 'POST', p: '/photos', need: 'anyWrite', list: true },
    { m: 'POST', p: '/task-photo/:taskId', need: 'write', proj: async (p) => [await look.task(p.taskId)] },
    { m: 'POST', p: '/ticket-photo/:ticketId', need: 'write', proj: async (p) => [await look.ticket(p.ticketId)] },
    { m: 'POST', p: '/project-file/:projectId', need: 'write', proj: (p) => [p.projectId] },
    { m: 'POST', p: '/box-photo/:boxId', need: 'write', proj: async (p) => [await look.box(p.boxId)] },
    { m: 'POST', p: '/handover-photo/:handoverId', need: 'handover', proj: async (p) => [await look.handover(p.handoverId)] },
    { m: 'POST', p: '/daily-photo/:reportId', need: 'daily_reports', proj: async (p) => [await look.daily(p.reportId)] },
  ],
  reports: [
    { m: 'GET', p: '/daily/:id', need: 'read', proj: async (p) => [await look.daily(p.id)] },
    { m: 'GET', p: '/handover/:id', need: 'read', client: true, proj: async (p) => [await look.handover(p.id)] },
  ],
  remarks: [
    { m: 'GET', p: '/', need: 'read', list: true },
    { m: 'GET', p: '/project/:projectId/pdf', need: 'read', proj: (p) => [p.projectId] },
    { m: 'GET', p: '/:id', need: 'read', proj: async (p) => [await look.remark(p.id)] },
    { m: 'POST', p: '/', need: 'write', proj: (_p, req) => body(req) },
    { m: 'PATCH', p: '/:id', need: 'write', proj: async (p) => [await look.remark(p.id)] },
    { m: 'DELETE', p: '/:id', need: 'write', proj: async (p) => [await look.remark(p.id)] },
    { m: 'POST', p: '/:id/photos', need: 'write', proj: async (p) => [await look.remark(p.id)] },
  ],
  visits: [
    { m: 'GET', p: '/', need: 'read', list: true },
    { m: 'GET', p: '/:id', need: 'read', proj: async (p) => [await look.visit(p.id)] },
    { m: 'GET', p: '/:id/pdf', need: 'read', proj: async (p) => [await look.visit(p.id)] },
    { m: 'POST', p: '/', need: 'write', proj: (_p, req) => body(req) },
    { m: 'PATCH', p: '/:id', need: 'write', proj: async (p) => [await look.visit(p.id)] },
    { m: 'DELETE', p: '/:id', need: 'write', proj: async (p) => [await look.visit(p.id)] },
    { m: 'POST', p: '/:id/send', need: 'write', proj: async (p) => [await look.visit(p.id)] },
  ],
  briefings: [
    { m: 'GET', p: '/project/:projectId', need: 'read', proj: (p) => [p.projectId] },
    { m: 'POST', p: '/project/:projectId', need: 'write', proj: (p) => [p.projectId] },
    { m: 'POST', p: '/project/:projectId/generate', need: 'write', proj: (p) => [p.projectId] },
    { m: 'GET', p: '/:id', need: 'read', proj: async (p) => [await look.briefing(p.id)] },
    { m: 'PATCH', p: '/:id', need: 'write', proj: async (p) => [await look.briefing(p.id)] },
    { m: 'DELETE', p: '/:id', need: 'write', proj: async (p) => [await look.briefing(p.id)] },
  ],
  bookings: [
    { m: 'GET', p: '/bookings/calendar', need: 'read', list: true },
    { m: 'GET', p: '/projects/:projectId/bookings', need: 'read', proj: (p) => [p.projectId] },
    { m: 'POST', p: '/projects/:projectId/bookings', need: 'write', proj: (p) => [p.projectId] },
    { m: 'PATCH', p: '/bookings/:id', need: 'write', proj: async (p) => [await look.booking(p.id)] },
    { m: 'DELETE', p: '/bookings/:id', need: 'write', proj: async (p) => [await look.booking(p.id)] },
    { m: 'GET', p: '/projects/:projectId/hotel-bookings', need: 'read', proj: (p) => [p.projectId] },
    { m: 'POST', p: '/projects/:projectId/hotel-bookings', need: 'write', proj: (p) => [p.projectId] },
    { m: 'PATCH', p: '/hotel-bookings/:id', need: 'write', proj: async (p) => [await look.hotel(p.id)] },
    { m: 'DELETE', p: '/hotel-bookings/:id', need: 'write', proj: async (p) => [await look.hotel(p.id)] },
  ],
  warehouse: [
    { m: 'GET', p: '/boxes', need: 'read', list: true },
    { m: 'GET', p: '/boxes/:id', need: 'read', proj: async (p) => [await look.box(p.id)] },
    { m: 'POST', p: '/boxes', need: 'write', proj: (_p, req) => body(req) },
    { m: 'PATCH', p: '/boxes/:id', need: 'write', proj: async (p) => [await look.box(p.id)] },
    { m: 'POST', p: '/boxes/:id/items', need: 'write', proj: async (p) => [await look.box(p.id)] },
    { m: 'PATCH', p: '/items/:itemId', need: 'write', proj: async (p) => [await look.boxItem(p.itemId)] },
    { m: 'DELETE', p: '/items/:itemId', need: 'write', proj: async (p) => [await look.boxItem(p.itemId)] },
    { m: 'GET', p: '/scan/:qrCode', need: 'read', proj: async (p) => [await look.boxQr(p.qrCode)] },
  ],
  toolbox: [
    { m: 'GET', p: '/', need: 'read', list: true },
    { m: 'GET', p: '/:id', need: 'read', proj: async (p) => [await look.toolbox(p.id)] },
    { m: 'POST', p: '/', need: 'write', proj: (_p, req) => body(req) },
    { m: 'POST', p: '/drawers/:drawerId/tools', need: 'write', proj: async (p) => [await look.drawer(p.drawerId)] },
    { m: 'PATCH', p: '/tools/:toolId', need: 'write', proj: async (p) => [await look.tool(p.toolId)] },
    { m: 'POST', p: '/drawers/:drawerId/validate', need: 'write', proj: async (p) => [await look.drawer(p.drawerId)] },
  ],
  // dictée / mise en forme des daily reports (pas la lecture de carte d'identité)
  ai: [
    { m: 'POST', p: '/parse-daily', need: 'anyWrite', list: true },
    { m: 'POST', p: '/transcribe', need: 'anyWrite', list: true },
  ],
  translate: [
    { m: 'POST', p: '/', need: 'anyWrite', list: true },
  ],
  taskTemplates: [
    { m: 'GET', p: '/', need: 'read', list: true },
    { m: 'GET', p: '/categories', need: 'read', list: true },
  ],
  clients: [
    { m: 'GET', p: '/:id', need: 'read', any: true, proj: (p) => look.clientProjects(p.id) },
    { m: 'GET', p: '/:id/contacts', need: 'read', any: true, proj: (p) => look.clientProjects(p.id) },
  ],
  // la route filtre elle-même (liste réduite, fiche à soi)
  users: [
    { m: 'GET', p: '/', need: 'read', client: true, list: true },
    { m: 'PATCH', p: '/:id', need: 'read', client: true, list: true },
  ],
  settings: [
    { m: 'GET', p: '/:key', need: 'read', list: true },
  ],
};

// ── moteur ───────────────────────────────────────────────────────────────────
function compile(p: string): RegExp {
  const parts = p.split('/').filter(Boolean).map((s) => (s.startsWith(':') ? `(?<${s.slice(1)}>[^/]+)` : s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  return new RegExp(`^/${parts.join('/')}/?$`);
}
const COMPILED = new Map<Rule, RegExp>();
function matchRule(rules: Rule[], method: string, path: string): { rule: Rule; params: Record<string, string> } | null {
  const m = method === 'HEAD' ? 'GET' : method;
  for (const rule of rules) {
    if (rule.m !== m) continue;
    let re = COMPILED.get(rule);
    if (!re) { re = compile(rule.p); COMPILED.set(rule, re); }
    const hit = re.exec(path);
    if (hit) {
      const params: Record<string, string> = {};
      for (const [k, v] of Object.entries(hit.groups || {})) params[k] = decodeURIComponent(v);
      return { rule, params };
    }
  }
  return null;
}

function allowed(req: AuthRequest, need: Need): boolean {
  const a = req.access!;
  if (need === 'read') return true;
  if (need === 'write') return a.write;
  if (need === 'anyWrite') return a.write || a.grants.length > 0;
  return canWrite(a, need);
}

const DENIED = 'Accès non autorisé pour ton rôle.';

/** Garde d'un module : `name` = clé de RULES. */
export const scopeGuard = (name: keyof typeof RULES) => {
  const rules = RULES[name];
  return async (req: AuthRequest, _res: Response, next: NextFunction) => {
    try {
      const a = req.access;
      if (!a || !req.user) throw new AppError('Non autorisé', 401);
      if (a.scope === 'all') return next();

      const hit = matchRule(rules, req.method, req.path);
      if (!hit) throw new AppError(DENIED, 403);
      const { rule, params } = hit;
      if (a.scope === 'client' && (!rule.client || rule.need !== 'read')) throw new AppError(DENIED, 403);
      if (!allowed(req, rule.need)) throw new AppError('Tu peux consulter mais pas modifier : demande à un responsable de t’en donner le droit.', 403);

      const mine = new Set((await projectIds(req)) || []);
      // un projectId transmis (filtre de liste, création, modification) doit toujours être un de ses projets
      const q = req.query?.projectId;
      const extra = [...(Array.isArray(q) ? q : q !== undefined ? [q] : []), req.body?.projectId]
        .filter((v) => v !== undefined && v !== null && v !== '').map(String);
      if (extra.some((id) => !mine.has(id))) throw new AppError('Accès refusé : tu n’es pas affecté à ce projet.', 403);

      if (rule.list) return next();
      const found = ((await rule.proj?.(params, req)) || []).filter((v): v is string => !!v).map(String);
      if (!found.length) throw new AppError('Introuvable', 404);
      const ok = rule.any ? found.some((id) => mine.has(id)) : found.every((id) => mine.has(id));
      if (!ok) throw new AppError('Accès refusé : tu n’es pas affecté à ce projet.', 403);
      next();
    } catch (err) { next(err); }
  };
};
