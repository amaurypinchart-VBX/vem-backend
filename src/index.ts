import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import path from 'path';
import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';

import { errorHandler } from './middleware/errorHandler';
import jwt from 'jsonwebtoken';
import { authMiddleware, requireRole } from './middleware/auth';
import { requirePlansAccess } from './middleware/plansAccess';
import { scopeGuard } from './middleware/scopeGuard';
import { accessFor, loadUserRow, projectIdsOf } from './middleware/access';
import { JWT_SECRET } from './utils/secrets';
import { logger } from './utils/logger';

import authRoutes          from './routes/auth';
import projectRoutes       from './routes/projects';
import taskRoutes          from './routes/tasks';
import ticketRoutes        from './routes/tickets';
import handoverRoutes      from './routes/handover';
import dailyRoutes         from './routes/dailyReports';
import warehouseRoutes     from './routes/warehouse';
import toolboxRoutes       from './routes/toolbox';
import uploadRoutes        from './routes/upload';
import notifRoutes         from './routes/notifications';
import userRoutes          from './routes/users';
import clientRoutes        from './routes/clients';
import reportRoutes        from './routes/reports';
import taskTemplatesRoutes from './routes/taskTemplates';
import aiRoutes from './routes/ai';
import clientRemarksRoutes from './routes/clientRemarks';
import clientVisitsRoutes from './routes/clientVisits';
import briefingRoutes from './routes/briefing';
import plan2dRoutes from './routes/plan2d';
import plansRoutes from './routes/plans';
import structureRoutes from './routes/structure';
import loadingRoutes from './routes/loading';
import settingsRoutes from './routes/settings';
import teamBookingsRoutes from './routes/teamBookings';
import emailWebhookRoutes from './routes/emailWebhook';
import { startImapPoller } from './services/imapPoller';
import { runStartupMigrations } from './utils/migrations';
import translateRoutes from './routes/translate';
import publicHandoverSignRoutes from './routes/publicHandoverSign';
import publicCalendarRoutes from './routes/publicCalendar';
import assistantRoutes from './routes/assistant';
import checklistRoutes from './routes/checklists';

const app  = express();
const http = createServer(app);

export const io = new SocketServer(http, {
  cors: { origin: '*', credentials: true },
} as any);

// Temps réel : connexion seulement avec un jeton valide ; on ne rejoint que sa propre salle et les salles des
// projets auxquels on a accès (avant : n'importe qui pouvait écouter n'importe quel projet).
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    const decoded: any = jwt.verify(String(token || ''), JWT_SECRET, { algorithms: ['HS256'] });
    const row = await loadUserRow(String(decoded.id));
    if (!row || !row.isActive) return next(new Error('unauthorized'));
    (socket.data as any).userId = String(decoded.id);
    (socket.data as any).access = accessFor(row.role, row.plansAccess, row.grants);
    next();
  } catch { next(new Error('unauthorized')); }
});
io.on('connection', (socket) => {
  const userId = (socket.data as any).userId as string;
  const access = (socket.data as any).access;
  socket.join(`user:${userId}`);
  socket.on('project:join', async (pid: string) => {
    try {
      if (typeof pid !== 'string') return;
      if (access.scope !== 'all' && !(await projectIdsOf(userId, access.scope)).includes(pid)) return;
      socket.join(`project:${pid}`);
    } catch { /* ignoré */ }
  });
  socket.on('disconnect', () => {});
});

// Railway passe par un proxy : l'IP réelle du visiteur (limiteur de tentatives de connexion) est dans X-Forwarded-For.
app.set('trust proxy', 1);

app.use(helmet({ contentSecurityPolicy: false, frameguard: false }));
app.use(cors({ origin: '*', credentials: true }));
app.use(compression());
app.use(morgan('tiny'));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use(express.static(path.join(__dirname, '..', 'public'), {
  // ETag + lastModified activés par défaut, on les confirme ici pour clarté.
  // Le navigateur garde les fichiers en cache mais REVALIDE à chaque fois :
  // - HTML : 'no-cache' = vérifie systématiquement, mais retourne 304 (vide) si inchangé
  //   → plus de re-téléchargement complet du 620 KB inutilement
  // - Assets (images, logo) : max-age=300 = cache 5 min sans appel serveur
  etag: true,
  lastModified: true,
  setHeaders: (res, p) => {
    if (p.endsWith('.html')) {
      res.setHeader('Cache-Control', 'public, no-cache, must-revalidate');
    } else {
      res.setHeader('Cache-Control', 'public, max-age=300');
    }
  },
}));

app.get('/health', (_, res) => res.json({ ok: true, ts: new Date().toISOString() }));

const API = '/api/v1';

app.use(`${API}/auth`,           authRoutes);
// Route PUBLIQUE — pas de middleware auth, accessible par lien
app.use('/api/v1/public/handover-sign', publicHandoverSignRoutes);
// Route PUBLIQUE — calendrier projets 2 mois pour écran entrepôt
app.use('/api/v1/public', publicCalendarRoutes);

app.use(`${API}/users`,          authMiddleware, userRoutes);
// scopeGuard : site manager / installateur / ouvrier / client ne passent que sur leurs projets et seulement
// pour les actions listées dans src/middleware/scopeGuard.ts (tout le reste est refusé).
app.use(`${API}/users`,          authMiddleware, scopeGuard('users'), userRoutes);
app.use(`${API}/clients`,        authMiddleware, scopeGuard('clients'), clientRoutes);
app.use(`${API}/projects`,       authMiddleware, scopeGuard('projects'), projectRoutes);
app.use(`${API}/tasks`,          authMiddleware, scopeGuard('tasks'), taskRoutes);
app.use(`${API}/tickets`,        authMiddleware, scopeGuard('tickets'), ticketRoutes);
app.use(`${API}/handover`,       authMiddleware, scopeGuard('handover'), handoverRoutes);
// Check-list de montage (bibliothèque + check-list de chaque projet, affichée dans le handover)
app.use(`${API}/checklists`,     authMiddleware, scopeGuard('checklists'), checklistRoutes);

app.use(`${API}/daily-reports`,  authMiddleware, scopeGuard('daily'), dailyRoutes);
app.use(`${API}/warehouse`,      authMiddleware, scopeGuard('warehouse'), warehouseRoutes);
app.use(`${API}/toolbox`,        authMiddleware, scopeGuard('toolbox'), toolboxRoutes);
app.use(`${API}/upload`,         authMiddleware, scopeGuard('upload'), uploadRoutes);
app.use(`${API}/notifications`,  authMiddleware, notifRoutes);
app.use(`${API}/reports`,        authMiddleware, scopeGuard('reports'), reportRoutes);
app.use(`${API}/task-templates`, authMiddleware, scopeGuard('taskTemplates'), taskTemplatesRoutes);
app.use(`${API}/ai`,             authMiddleware, scopeGuard('ai'), aiRoutes);
app.use(`${API}/client-remarks`, authMiddleware, scopeGuard('remarks'), clientRemarksRoutes);
app.use(`${API}/client-visits`,  authMiddleware, scopeGuard('visits'), clientVisitsRoutes);
app.use(`${API}/briefings`,      authMiddleware, scopeGuard('briefings'), briefingRoutes);
// Outils Plans 2D : admin + technical manager, et project manager / engineer si activé sur leur fiche
// (jamais sales, site manager, installateur, client — voir src/middleware/access.ts).
app.use(`${API}/plan2d`,         authMiddleware, requirePlansAccess, plan2dRoutes);
app.use(`${API}/plans`,          authMiddleware, requirePlansAccess, plansRoutes);
app.use(`${API}/structure`,      authMiddleware, requirePlansAccess, structureRoutes);
app.use(`${API}/loading`,        authMiddleware, requirePlansAccess, loadingRoutes);
// Assistant — lit les données de TOUS les projets : réservé aux rôles qui voient tous les projets et les pilotent
// (plus le site manager, limité à ses projets).
app.use(`${API}/assistant`,      authMiddleware, requireRole('admin', 'project_manager', 'technical_manager'), assistantRoutes);
// Traduction (appel payant à l'IA) : connecté seulement.
app.use(`${API}/translate`,      authMiddleware, scopeGuard('translate'), translateRoutes);
app.use(`${API}/settings`,       authMiddleware, scopeGuard('settings'), settingsRoutes);

// Le routeur teamBookings définit ses propres chemins (/projects/:id/bookings,
// /bookings/:id, /bookings/calendar) donc on le monte directement à l'API root.
app.use(API,                     authMiddleware, scopeGuard('bookings'), teamBookingsRoutes);
// Webhook public Brevo Inbound (PAS de authMiddleware — Brevo ne peut pas s'authentifier).
// La sécurité passe par le token partagé BREVO_WEBHOOK_SECRET vérifié dans la route.
app.use('/webhooks',             emailWebhookRoutes);

// Route admin pour déclencher manuellement le polling IMAP (pratique pour tester
// sans attendre l'intervalle de 5 minutes). À appeler depuis la console F12 :
//   await fetch(`${API}/imap-poll`, { method:'POST', headers:{Authorization:`Bearer ${TOKEN}`} }).then(r=>r.json())
app.post(`${API}/imap-poll`, authMiddleware, requireRole('admin', 'project_manager', 'technical_manager'), async (_req, res, next) => {
  try {
    const { pollImapOnce } = await import('./services/imapPoller');
    const result = await pollImapOnce();
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

// Fichier de Plans Viewbox introuvable (page ouverte avant une mise en ligne : les noms changent à chaque build) :
// 404, jamais la page d'accueil de VEM (le navigateur la refuserait comme script, sans message clair).
app.use('/plans/assets', (_req, res) => res.status(404).type('text/plain').send('Fichier introuvable : nouvelle version en ligne, recharger la page.'));

app.get('*', (_, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));

app.use(errorHandler);

const PORT = parseInt(process.env.PORT || '3000', 10);
http.listen(PORT, '0.0.0.0', async () => {
  logger.info(`🚀 VEM running on port ${PORT}`);
  await runStartupMigrations();
  // Démarre le polling IMAP pour récupérer les emails entrants → projets.
  // Ne fait rien si IMAP_USER/IMAP_PASS ne sont pas configurés.
  startImapPoller();
});

export default app;