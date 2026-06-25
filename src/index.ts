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
import { authMiddleware } from './middleware/auth';
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
import settingsRoutes from './routes/settings';
import teamBookingsRoutes from './routes/teamBookings';
import emailWebhookRoutes from './routes/emailWebhook';
import { startImapPoller } from './services/imapPoller';
import { runStartupMigrations } from './utils/migrations';
import translateRoutes from './routes/translate';

const app  = express();
const http = createServer(app);

export const io = new SocketServer(http, {
  cors: { origin: '*', credentials: true },
} as any);

io.on('connection', (socket) => {
  const userId = socket.handshake.auth.userId;
  if (userId) socket.join(`user:${userId}`);
  socket.on('project:join', (pid: string) => socket.join(`project:${pid}`));
  socket.on('disconnect', () => {});
});

app.use(helmet({ contentSecurityPolicy: false }));
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
app.use(`${API}/users`,          authMiddleware, userRoutes);
app.use(`${API}/clients`,        authMiddleware, clientRoutes);
app.use(`${API}/projects`,       authMiddleware, projectRoutes);
app.use(`${API}/tasks`,          authMiddleware, taskRoutes);
app.use(`${API}/tickets`,        authMiddleware, ticketRoutes);
app.use(`${API}/handover`,       authMiddleware, handoverRoutes);
app.use(`${API}/daily-reports`,  authMiddleware, dailyRoutes);
app.use(`${API}/warehouse`,      authMiddleware, warehouseRoutes);
app.use(`${API}/toolbox`,        authMiddleware, toolboxRoutes);
app.use(`${API}/upload`,         authMiddleware, uploadRoutes);
app.use(`${API}/notifications`,  authMiddleware, notifRoutes);
app.use(`${API}/reports`,        authMiddleware, reportRoutes);
app.use(`${API}/task-templates`, authMiddleware, taskTemplatesRoutes);
app.use(`${API}/ai`, authMiddleware, aiRoutes);
app.use(`${API}/client-remarks`, authMiddleware, clientRemarksRoutes);
app.use(`${API}/client-visits`,  authMiddleware, clientVisitsRoutes);
app.use(`${API}/briefings`,      authMiddleware, briefingRoutes);
app.use(`${API}/settings`,       authMiddleware, settingsRoutes);
app.use('/api/translate', translateRoutes);
// Le routeur teamBookings définit ses propres chemins (/projects/:id/bookings,
// /bookings/:id, /bookings/calendar) donc on le monte directement à l'API root.
app.use(API,                     authMiddleware, teamBookingsRoutes);
// Webhook public Brevo Inbound (PAS de authMiddleware — Brevo ne peut pas s'authentifier).
// La sécurité passe par le token partagé BREVO_WEBHOOK_SECRET vérifié dans la route.
app.use('/webhooks',             emailWebhookRoutes);

// Route admin pour déclencher manuellement le polling IMAP (pratique pour tester
// sans attendre l'intervalle de 5 minutes). À appeler depuis la console F12 :
//   await fetch(`${API}/imap-poll`, { method:'POST', headers:{Authorization:`Bearer ${TOKEN}`} }).then(r=>r.json())
app.post(`${API}/imap-poll`, authMiddleware, async (_req, res, next) => {
  try {
    const { pollImapOnce } = await import('./services/imapPoller');
    const result = await pollImapOnce();
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

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