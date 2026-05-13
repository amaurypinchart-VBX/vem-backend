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
// import clientRemarksRoutes from './routes/clientRemarks';

const app  = express();
const http = createServer(app);

export const io = new SocketServer(http, {
  cors: { origin: '*', credentials: true },
});

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

app.use(express.static(path.join(__dirname, '..', 'public')));

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
// app.use(`${API}/client-remarks`, authMiddleware, clientRemarksRoutes);

app.get('*', (_, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));

app.use(errorHandler);

const PORT = parseInt(process.env.PORT || '3000', 10);
http.listen(PORT, '0.0.0.0', () => {
  logger.info(`🚀 VEM running on port ${PORT}`);
});

export default app;
