"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.io = void 0;
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const compression_1 = __importDefault(require("compression"));
const morgan_1 = __importDefault(require("morgan"));
const path_1 = __importDefault(require("path"));
const http_1 = require("http");
const socket_io_1 = require("socket.io");
const errorHandler_1 = require("./middleware/errorHandler");
const auth_1 = require("./middleware/auth");
const logger_1 = require("./utils/logger");
const auth_2 = __importDefault(require("./routes/auth"));
const projects_1 = __importDefault(require("./routes/projects"));
const tasks_1 = __importDefault(require("./routes/tasks"));
const tickets_1 = __importDefault(require("./routes/tickets"));
const handover_1 = __importDefault(require("./routes/handover"));
const dailyReports_1 = __importDefault(require("./routes/dailyReports"));
const warehouse_1 = __importDefault(require("./routes/warehouse"));
const toolbox_1 = __importDefault(require("./routes/toolbox"));
const upload_1 = __importDefault(require("./routes/upload"));
const notifications_1 = __importDefault(require("./routes/notifications"));
const users_1 = __importDefault(require("./routes/users"));
const clients_1 = __importDefault(require("./routes/clients"));
const reports_1 = __importDefault(require("./routes/reports"));
const taskTemplates_1 = __importDefault(require("./routes/taskTemplates"));
const ai_1 = __importDefault(require("./routes/ai"));
const clientRemarks_1 = __importDefault(require("./routes/clientRemarks"));
const clientVisits_1 = __importDefault(require("./routes/clientVisits"));
const briefing_1 = __importDefault(require("./routes/briefing"));
const settings_1 = __importDefault(require("./routes/settings"));
const teamBookings_1 = __importDefault(require("./routes/teamBookings"));
const emailWebhook_1 = __importDefault(require("./routes/emailWebhook"));
const imapPoller_1 = require("./services/imapPoller");
const migrations_1 = require("./utils/migrations");
const translate_1 = __importDefault(require("./routes/translate"));
const publicHandoverSign_1 = __importDefault(require("./routes/publicHandoverSign"));
const publicCalendar_1 = __importDefault(require("./routes/publicCalendar"));
const assistant_1 = __importDefault(require("./routes/assistant"));
const app = (0, express_1.default)();
const http = (0, http_1.createServer)(app);
exports.io = new socket_io_1.Server(http, {
    cors: { origin: '*', credentials: true },
});
exports.io.on('connection', (socket) => {
    const userId = socket.handshake.auth.userId;
    if (userId)
        socket.join(`user:${userId}`);
    socket.on('project:join', (pid) => socket.join(`project:${pid}`));
    socket.on('disconnect', () => { });
});
app.use((0, helmet_1.default)({ contentSecurityPolicy: false, frameguard: false }));
app.use((0, cors_1.default)({ origin: '*', credentials: true }));
app.use((0, compression_1.default)());
app.use((0, morgan_1.default)('tiny'));
app.use(express_1.default.json({ limit: '50mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '50mb' }));
app.use(express_1.default.static(path_1.default.join(__dirname, '..', 'public'), {
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
        }
        else {
            res.setHeader('Cache-Control', 'public, max-age=300');
        }
    },
}));
app.get('/health', (_, res) => res.json({ ok: true, ts: new Date().toISOString() }));
const API = '/api/v1';
app.use(`${API}/auth`, auth_2.default);
// Route PUBLIQUE — pas de middleware auth, accessible par lien
app.use('/api/v1/public/handover-sign', publicHandoverSign_1.default);
// Route PUBLIQUE — calendrier projets 2 mois pour écran entrepôt
app.use('/api/v1/public', publicCalendar_1.default);
app.use(`${API}/users`, auth_1.authMiddleware, users_1.default);
app.use(`${API}/clients`, auth_1.authMiddleware, clients_1.default);
app.use(`${API}/projects`, auth_1.authMiddleware, projects_1.default);
app.use(`${API}/tasks`, auth_1.authMiddleware, tasks_1.default);
app.use(`${API}/tickets`, auth_1.authMiddleware, tickets_1.default);
app.use(`${API}/handover`, auth_1.authMiddleware, handover_1.default);
app.use(`${API}/daily-reports`, auth_1.authMiddleware, dailyReports_1.default);
app.use(`${API}/warehouse`, auth_1.authMiddleware, warehouse_1.default);
app.use(`${API}/toolbox`, auth_1.authMiddleware, toolbox_1.default);
app.use(`${API}/upload`, auth_1.authMiddleware, upload_1.default);
app.use(`${API}/notifications`, auth_1.authMiddleware, notifications_1.default);
app.use(`${API}/reports`, auth_1.authMiddleware, reports_1.default);
app.use(`${API}/task-templates`, auth_1.authMiddleware, taskTemplates_1.default);
app.use(`${API}/ai`, auth_1.authMiddleware, ai_1.default);
app.use(`${API}/client-remarks`, auth_1.authMiddleware, clientRemarks_1.default);
app.use(`${API}/client-visits`, auth_1.authMiddleware, clientVisits_1.default);
app.use(`${API}/briefings`, auth_1.authMiddleware, briefing_1.default);
// Assistant lecture seule — réservé aux rôles qui pilotent les projets.
app.use(`${API}/assistant`, auth_1.authMiddleware, (0, auth_1.requireRole)('admin', 'project_manager', 'technical_manager', 'site_manager'), assistant_1.default);
app.use('/api/v1/translate', translate_1.default);
app.use(`${API}/settings`, auth_1.authMiddleware, settings_1.default);
// Le routeur teamBookings définit ses propres chemins (/projects/:id/bookings,
// /bookings/:id, /bookings/calendar) donc on le monte directement à l'API root.
app.use(API, auth_1.authMiddleware, teamBookings_1.default);
// Webhook public Brevo Inbound (PAS de authMiddleware — Brevo ne peut pas s'authentifier).
// La sécurité passe par le token partagé BREVO_WEBHOOK_SECRET vérifié dans la route.
app.use('/webhooks', emailWebhook_1.default);
// Route admin pour déclencher manuellement le polling IMAP (pratique pour tester
// sans attendre l'intervalle de 5 minutes). À appeler depuis la console F12 :
//   await fetch(`${API}/imap-poll`, { method:'POST', headers:{Authorization:`Bearer ${TOKEN}`} }).then(r=>r.json())
app.post(`${API}/imap-poll`, auth_1.authMiddleware, async (_req, res, next) => {
    try {
        const { pollImapOnce } = await Promise.resolve().then(() => __importStar(require('./services/imapPoller')));
        const result = await pollImapOnce();
        res.json({ success: true, data: result });
    }
    catch (err) {
        next(err);
    }
});
app.get('*', (_, res) => res.sendFile(path_1.default.join(__dirname, '..', 'public', 'index.html')));
app.use(errorHandler_1.errorHandler);
const PORT = parseInt(process.env.PORT || '3000', 10);
http.listen(PORT, '0.0.0.0', async () => {
    logger_1.logger.info(`🚀 VEM running on port ${PORT}`);
    await (0, migrations_1.runStartupMigrations)();
    // Démarre le polling IMAP pour récupérer les emails entrants → projets.
    // Ne fait rien si IMAP_USER/IMAP_PASS ne sont pas configurés.
    (0, imapPoller_1.startImapPoller)();
});
exports.default = app;
//# sourceMappingURL=index.js.map