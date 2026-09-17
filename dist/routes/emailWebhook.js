"use strict";
// src/routes/emailWebhook.ts
// Webhook public qui reçoit les emails entrants de Brevo Inbound Parsing.
// Brevo POST un JSON contenant les emails reçus, avec les pièces jointes
// téléchargeables via leur API (DownloadToken).
//
// Sécurité : un token partagé en query string (BREVO_WEBHOOK_SECRET) empêche
// les requêtes non autorisées de poster ici. Brevo permet de configurer une
// URL de webhook avec des paramètres.
//
// Flux :
//   1) Brevo POST → on vérifie le token
//   2) On parse le sujet pour trouver le N° interne d'un projet existant
//   3) Pour chaque pièce jointe, on télécharge depuis Brevo, on upload sur
//      Cloudinary, on crée une ProjectFile liée au projet
//
// Variables d'env requises :
//   - BREVO_WEBHOOK_SECRET : token partagé pour authentifier les requêtes
//   - BREVO_API_KEY        : clé API Brevo pour télécharger les pièces jointes
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const database_1 = require("../config/database");
const cloudinaryService_1 = require("../services/cloudinaryService");
const logger_1 = require("../utils/logger");
const router = (0, express_1.Router)();
// POST /webhooks/brevo-inbound?token=SECRET
router.post('/brevo-inbound', async (req, res) => {
    try {
        // ─── 1) Vérification du token partagé ───
        const token = req.query.token || req.headers['x-webhook-token'];
        if (!process.env.BREVO_WEBHOOK_SECRET) {
            logger_1.logger.error('[email-webhook] BREVO_WEBHOOK_SECRET non configurée');
            return res.status(500).json({ error: 'Webhook not configured' });
        }
        if (token !== process.env.BREVO_WEBHOOK_SECRET) {
            logger_1.logger.warn(`[email-webhook] Token invalide depuis ${req.ip}`);
            return res.status(401).json({ error: 'Unauthorized' });
        }
        // ─── 2) Récupération du payload (peut être un objet ou un tableau d'items) ───
        const items = Array.isArray(req.body?.items)
            ? req.body.items
            : Array.isArray(req.body)
                ? req.body
                : [req.body];
        let totalProcessed = 0;
        let totalSkipped = 0;
        const projectsCache = await database_1.prisma.project.findMany({
            select: { id: true, internalNumber: true, name: true },
        });
        for (const item of items) {
            const subject = String(item.Subject || item.subject || '').trim();
            const fromAddr = item.From?.Address || item.from?.address || item.From?.email || 'inconnu';
            if (!subject) {
                totalSkipped++;
                continue;
            }
            // ─── 3) Recherche du projet par N° interne dans le sujet ───
            // On itère sur tous les projets et on prend celui dont le N° interne apparaît dans le sujet.
            // Insensible à la casse, et on prend le plus long match si plusieurs (évite VEM-1 matchant VEM-12).
            const upperSubject = subject.toUpperCase();
            const matches = projectsCache.filter(p => p.internalNumber && upperSubject.includes(p.internalNumber.toUpperCase())).sort((a, b) => (b.internalNumber.length - a.internalNumber.length));
            const project = matches[0];
            if (!project) {
                logger_1.logger.warn(`[email-webhook] Aucun projet trouvé dans sujet : "${subject}" (de ${fromAddr})`);
                totalSkipped++;
                continue;
            }
            // ─── 4) Traitement des pièces jointes ───
            const attachments = item.Attachments || item.attachments || [];
            if (attachments.length === 0) {
                logger_1.logger.info(`[email-webhook] Mail sans pièce jointe pour ${project.internalNumber} (sujet : "${subject}")`);
                totalSkipped++;
                continue;
            }
            for (const att of attachments) {
                try {
                    const filename = att.Name || att.name || att.filename || `mail-${Date.now()}`;
                    let buffer = null;
                    // Brevo : téléchargement via DownloadToken sur leur API
                    if (att.DownloadToken) {
                        const apiKey = process.env.BREVO_API_KEY;
                        if (!apiKey) {
                            logger_1.logger.error('[email-webhook] BREVO_API_KEY manquante — pièces jointes impossibles à télécharger');
                            break;
                        }
                        const dlRes = await fetch(`https://api.brevo.com/v3/inboundParsing/attachments/${att.DownloadToken}`, { headers: { 'api-key': apiKey, 'Accept': 'application/octet-stream' } });
                        if (!dlRes.ok) {
                            logger_1.logger.error(`[email-webhook] Échec download "${filename}" : HTTP ${dlRes.status}`);
                            continue;
                        }
                        const ab = await dlRes.arrayBuffer();
                        buffer = Buffer.from(ab);
                    }
                    // Fallback : contenu inline en base64 (rare)
                    else if (att.Content || att.content) {
                        buffer = Buffer.from(att.Content || att.content, 'base64');
                    }
                    if (!buffer || buffer.length === 0) {
                        logger_1.logger.warn(`[email-webhook] Pièce jointe "${filename}" vide, ignorée`);
                        continue;
                    }
                    // ─── 5) Upload sur Cloudinary + création du ProjectFile ───
                    const { url, publicId } = await (0, cloudinaryService_1.uploadToCloudinary)(buffer, `projects/${project.id}/files`, {
                        resource_type: 'auto',
                    });
                    await database_1.prisma.projectFile.create({
                        data: {
                            projectId: project.id,
                            fileName: filename,
                            fileUrl: url,
                            publicId: publicId,
                            fileSize: buffer.length,
                            category: 'email', // pour distinguer des uploads UI dans la prochaine évolution
                        },
                    });
                    totalProcessed++;
                    logger_1.logger.info(`[email-webhook] ✅ "${filename}" (${Math.round(buffer.length / 1024)} KB) → ${project.internalNumber} (de ${fromAddr})`);
                }
                catch (e) {
                    logger_1.logger.error(`[email-webhook] Erreur sur pièce jointe : ${e.message || e}`);
                }
            }
        }
        res.json({ success: true, processed: totalProcessed, skipped: totalSkipped });
    }
    catch (err) {
        logger_1.logger.error(`[email-webhook] Erreur globale : ${err.message || err}`);
        // Toujours répondre 200 à Brevo pour éviter les retries inutiles
        // sauf en cas d'erreur d'auth (401)
        res.status(200).json({ error: 'Internal error', message: err.message });
    }
});
exports.default = router;
//# sourceMappingURL=emailWebhook.js.map