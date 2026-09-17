"use strict";
// src/services/imapPoller.ts
// Service de polling IMAP — se connecte à une boîte Gmail toutes les N minutes
// pour récupérer les nouveaux emails non lus, parser le sujet pour trouver le
// N° interne d'un projet, télécharger les pièces jointes et les uploader.
//
// Variables d'env requises :
//   - IMAP_USER : adresse Gmail (ex: warehouseviewbox@gmail.com)
//   - IMAP_PASS : App Password Gmail (16 caractères, même que SMTP_PASS)
//   - IMAP_HOST : optionnel (défaut imap.gmail.com)
//   - IMAP_PORT : optionnel (défaut 993)
//   - IMAP_POLL_INTERVAL : optionnel, intervalle en minutes (défaut 5)
//
// L'IMAP doit être ACTIVÉ dans les paramètres Gmail :
//   https://mail.google.com/mail/u/0/#settings/fwdandpop → activer IMAP
Object.defineProperty(exports, "__esModule", { value: true });
exports.pollImapOnce = pollImapOnce;
exports.startImapPoller = startImapPoller;
exports.stopImapPoller = stopImapPoller;
const imapflow_1 = require("imapflow");
const mailparser_1 = require("mailparser");
const database_1 = require("../config/database");
const cloudinaryService_1 = require("./cloudinaryService");
const logger_1 = require("../utils/logger");
const projectFromEmail_1 = require("./projectFromEmail");
const bookingFromEmail_1 = require("./bookingFromEmail");
let isRunning = false;
let pollTimer = null;
// Lance une session de polling : vérifie les mails non lus de la boîte INBOX,
// pour chaque mail trouve le projet correspondant et uploade les pièces jointes.
async function pollImapOnce() {
    if (!process.env.IMAP_USER || !process.env.IMAP_PASS) {
        logger_1.logger.warn('[imap] IMAP_USER ou IMAP_PASS manquant — polling désactivé');
        return { processed: 0, skipped: 0, errors: 0 };
    }
    if (isRunning) {
        logger_1.logger.info('[imap] Polling déjà en cours, on saute ce tour');
        return { processed: 0, skipped: 0, errors: 0 };
    }
    isRunning = true;
    let processed = 0, skipped = 0, errors = 0;
    let client = null;
    try {
        client = new imapflow_1.ImapFlow({
            host: process.env.IMAP_HOST || 'imap.gmail.com',
            port: Number(process.env.IMAP_PORT) || 993,
            secure: true,
            auth: {
                user: process.env.IMAP_USER,
                pass: process.env.IMAP_PASS,
            },
            logger: false,
        });
        await client.connect();
        logger_1.logger.info(`[imap] Connecté à ${process.env.IMAP_USER}`);
        const lock = await client.getMailboxLock('INBOX');
        try {
            // Cache des projets pour matcher les N° internes dans les sujets
            const projects = await database_1.prisma.project.findMany({
                select: { id: true, internalNumber: true, name: true },
            });
            // Recherche tous les mails NON LUS dans la boîte de réception
            const uids = await client.search({ seen: false }, { uid: true });
            if (!uids || uids.length === 0) {
                logger_1.logger.info('[imap] Aucun nouveau mail à traiter');
                return { processed: 0, skipped: 0, errors: 0 };
            }
            logger_1.logger.info(`[imap] ${uids.length} nouveau(x) mail(s) à analyser`);
            for (const uid of uids) {
                try {
                    // Récupère le message complet
                    const msg = await client.fetchOne(uid, { source: true, envelope: true }, { uid: true });
                    if (!msg || !msg.source) {
                        errors++;
                        continue;
                    }
                    const parsed = await (0, mailparser_1.simpleParser)(msg.source);
                    const subject = (parsed.subject || '').trim();
                    const from = parsed.from?.text || 'inconnu';
                    if (!subject) {
                        logger_1.logger.info(`[imap] Mail UID ${uid} sans sujet — ignoré`);
                        await client.messageFlagsAdd(uid, ['\\Seen'], { uid: true });
                        skipped++;
                        continue;
                    }
                    // ─── NOUVEAU : création de projet depuis un mail transféré ───
                    // Si le sujet commence par le préfixe déclencheur (défaut "NEW"),
                    // on ne cherche PAS un projet existant : on en crée un nouveau.
                    const NEW_PREFIX = (process.env.NEW_PROJECT_SUBJECT_PREFIX || 'NEW').toUpperCase();
                    if (subject.toUpperCase().replace(/^\s+/, '').startsWith(NEW_PREFIX)) {
                        try {
                            const result = await (0, projectFromEmail_1.createProjectFromEmail)({
                                subject,
                                text: parsed.text || parsed.html || '',
                                from,
                                attachments: parsed.attachments || [],
                            });
                            if (result.created) {
                                processed++;
                                logger_1.logger.info(`[imap] 🆕 Projet créé "${result.internalNumber}" (${result.filesUploaded} fichier(s)) depuis mail de ${from}`);
                            }
                            else {
                                skipped++;
                                logger_1.logger.warn(`[imap] Création projet ignorée : ${result.reason || 'inconnue'}`);
                            }
                        }
                        catch (e) {
                            errors++;
                            logger_1.logger.error(`[imap] Erreur création projet depuis mail : ${e.message || e}`);
                        }
                        await client.messageFlagsAdd(uid, ['\\Seen'], { uid: true });
                        continue;
                    }
                    // Recherche du projet par N° interne dans le sujet (le plus long match gagne)
                    const upper = subject.toUpperCase();
                    const matches = projects.filter(p => p.internalNumber && upper.includes(p.internalNumber.toUpperCase())).sort((a, b) => b.internalNumber.length - a.internalNumber.length);
                    const project = matches[0];
                    if (!project) {
                        logger_1.logger.warn(`[imap] Aucun projet trouvé dans "${subject}" (de ${from}) — mail ignoré`);
                        // On marque quand même comme lu pour ne pas re-tenter à chaque poll
                        await client.messageFlagsAdd(uid, ['\\Seen'], { uid: true });
                        skipped++;
                        continue;
                    }
                    // ─── NOUVEAU : réservations depuis le corps du mail (l'IA décide) ───
                    let bookingsCreated = 0;
                    try {
                        const r = await (0, bookingFromEmail_1.createBookingsFromEmail)({
                            projectId: project.id,
                            internalNumber: project.internalNumber,
                            subject,
                            text: parsed.text || parsed.html || '',
                            from,
                        });
                        bookingsCreated = r.created;
                        if (r.created > 0) {
                            processed++;
                            logger_1.logger.info(`[imap] 🚛 ${r.trucks} camion(s), ${r.hotels} hôtel(s), ${r.team} trajet(s) → ${project.internalNumber} (de ${from})`);
                        }
                        if (r.skipped.length)
                            logger_1.logger.info(`[imap] réservations ignorées : ${r.skipped.join(' | ')}`);
                    }
                    catch (e) {
                        logger_1.logger.error(`[imap] Erreur parsing réservations : ${e.message || e}`);
                        errors++;
                    }
                    // ─── Upload des pièces jointes (comme avant) ───
                    const attachments = parsed.attachments || [];
                    let uploadedHere = 0;
                    for (const att of attachments) {
                        try {
                            const buffer = att.content;
                            if (!buffer || buffer.length === 0)
                                continue;
                            const filename = att.filename || `mail-${Date.now()}`;
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
                                    category: 'email',
                                },
                            });
                            uploadedHere++;
                            processed++;
                            logger_1.logger.info(`[imap] ✅ "${filename}" (${Math.round(buffer.length / 1024)} KB) → ${project.internalNumber} (de ${from})`);
                        }
                        catch (e) {
                            logger_1.logger.error(`[imap] Erreur upload pièce jointe : ${e.message || e}`);
                            errors++;
                        }
                    }
                    // Marquer comme lu, SAUF si des PJ étaient présentes mais aucune n'a pu
                    // être uploadée ET qu'aucune réservation n'a été créée (retry au prochain poll).
                    if (bookingsCreated > 0 || uploadedHere > 0 || attachments.length === 0) {
                        await client.messageFlagsAdd(uid, ['\\Seen'], { uid: true });
                        if (bookingsCreated === 0 && uploadedHere === 0)
                            skipped++;
                    }
                }
                catch (e) {
                    logger_1.logger.error(`[imap] Erreur traitement UID ${uid} : ${e.message || e}`);
                    errors++;
                }
            }
        }
        finally {
            lock.release();
        }
    }
    catch (err) {
        logger_1.logger.error(`[imap] Erreur connexion : ${err.message || err}`);
        errors++;
    }
    finally {
        if (client) {
            try {
                await client.logout();
            }
            catch (_) { /* ignore */ }
        }
        isRunning = false;
    }
    return { processed, skipped, errors };
}
// Démarre le polling périodique au boot du serveur
function startImapPoller() {
    if (!process.env.IMAP_USER || !process.env.IMAP_PASS) {
        logger_1.logger.info('[imap] Polling désactivé (IMAP_USER/IMAP_PASS non configurées)');
        return;
    }
    const intervalMin = Number(process.env.IMAP_POLL_INTERVAL) || 5;
    const intervalMs = intervalMin * 60 * 1000;
    logger_1.logger.info(`[imap] Démarrage du polling toutes les ${intervalMin} minute(s) sur ${process.env.IMAP_USER}`);
    // Premier poll après 30 secondes (le temps que le serveur soit prêt)
    setTimeout(() => {
        pollImapOnce().catch(e => logger_1.logger.error(`[imap] poll initial échoué : ${e.message || e}`));
        // Puis polls réguliers
        pollTimer = setInterval(() => {
            pollImapOnce().catch(e => logger_1.logger.error(`[imap] poll échoué : ${e.message || e}`));
        }, intervalMs);
    }, 30000);
}
function stopImapPoller() {
    if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
        logger_1.logger.info('[imap] Polling arrêté');
    }
}
//# sourceMappingURL=imapPoller.js.map