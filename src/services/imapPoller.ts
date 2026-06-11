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

import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { prisma } from '../config/database';
import { uploadToCloudinary } from './cloudinaryService';
import { logger } from '../utils/logger';

let isRunning = false;
let pollTimer: NodeJS.Timeout | null = null;

// Lance une session de polling : vérifie les mails non lus de la boîte INBOX,
// pour chaque mail trouve le projet correspondant et uploade les pièces jointes.
export async function pollImapOnce(): Promise<{ processed: number; skipped: number; errors: number }> {
  if (!process.env.IMAP_USER || !process.env.IMAP_PASS) {
    logger.warn('[imap] IMAP_USER ou IMAP_PASS manquant — polling désactivé');
    return { processed: 0, skipped: 0, errors: 0 };
  }
  if (isRunning) {
    logger.info('[imap] Polling déjà en cours, on saute ce tour');
    return { processed: 0, skipped: 0, errors: 0 };
  }
  isRunning = true;

  let processed = 0, skipped = 0, errors = 0;
  let client: ImapFlow | null = null;

  try {
    client = new ImapFlow({
      host:   process.env.IMAP_HOST || 'imap.gmail.com',
      port:   Number(process.env.IMAP_PORT) || 993,
      secure: true,
      auth: {
        user: process.env.IMAP_USER,
        pass: process.env.IMAP_PASS,
      },
      logger: false,
    });

    await client.connect();
    logger.info(`[imap] Connecté à ${process.env.IMAP_USER}`);

    const lock = await client.getMailboxLock('INBOX');
    try {
      // Cache des projets pour matcher les N° internes dans les sujets
      const projects = await prisma.project.findMany({
        select: { id: true, internalNumber: true, name: true },
      });

      // Recherche tous les mails NON LUS dans la boîte de réception
      const uids = await client.search({ seen: false }, { uid: true });
      if (!uids || uids.length === 0) {
        logger.info('[imap] Aucun nouveau mail à traiter');
        return { processed: 0, skipped: 0, errors: 0 };
      }

      logger.info(`[imap] ${uids.length} nouveau(x) mail(s) à analyser`);

      for (const uid of uids) {
        try {
          // Récupère le message complet
          const msg = await client.fetchOne(uid, { source: true, envelope: true }, { uid: true });
          if (!msg || !msg.source) { errors++; continue; }

          const parsed = await simpleParser(msg.source);
          const subject = (parsed.subject || '').trim();
          const from    = parsed.from?.text || 'inconnu';

          if (!subject) {
            logger.info(`[imap] Mail UID ${uid} sans sujet — ignoré`);
            await client.messageFlagsAdd(uid, ['\\Seen'], { uid: true });
            skipped++;
            continue;
          }

          // Recherche du projet par N° interne dans le sujet (le plus long match gagne)
          const upper = subject.toUpperCase();
          const matches = projects.filter(p =>
            p.internalNumber && upper.includes(p.internalNumber.toUpperCase())
          ).sort((a, b) => b.internalNumber!.length - a.internalNumber!.length);
          const project = matches[0];

          if (!project) {
            logger.warn(`[imap] Aucun projet trouvé dans "${subject}" (de ${from}) — mail ignoré`);
            // On marque quand même comme lu pour ne pas re-tenter à chaque poll
            await client.messageFlagsAdd(uid, ['\\Seen'], { uid: true });
            skipped++;
            continue;
          }

          const attachments = parsed.attachments || [];
          if (attachments.length === 0) {
            logger.info(`[imap] Mail "${subject}" pour ${project.internalNumber} sans pièce jointe`);
            await client.messageFlagsAdd(uid, ['\\Seen'], { uid: true });
            skipped++;
            continue;
          }

          // Upload chaque pièce jointe
          let uploadedHere = 0;
          for (const att of attachments) {
            try {
              const buffer = att.content;
              if (!buffer || buffer.length === 0) continue;

              const filename = att.filename || `mail-${Date.now()}`;
              const { url, publicId } = await uploadToCloudinary(buffer, `projects/${project.id}/files`, {
                resource_type: 'auto',
              });
              await prisma.projectFile.create({
                data: {
                  projectId: project.id,
                  fileName:  filename,
                  fileUrl:   url,
                  publicId:  publicId,
                  fileSize:  buffer.length,
                  category:  'email',
                },
              });
              uploadedHere++;
              processed++;
              logger.info(`[imap] ✅ "${filename}" (${Math.round(buffer.length/1024)} KB) → ${project.internalNumber} (de ${from})`);
            } catch (e: any) {
              logger.error(`[imap] Erreur upload pièce jointe : ${e.message || e}`);
              errors++;
            }
          }

          // On marque le mail comme lu seulement si au moins une pièce jointe a été uploadée
          // (sinon on retentera au prochain poll, utile si Cloudinary était down)
          if (uploadedHere > 0) {
            await client.messageFlagsAdd(uid, ['\\Seen'], { uid: true });
          }
        } catch (e: any) {
          logger.error(`[imap] Erreur traitement UID ${uid} : ${e.message || e}`);
          errors++;
        }
      }
    } finally {
      lock.release();
    }
  } catch (err: any) {
    logger.error(`[imap] Erreur connexion : ${err.message || err}`);
    errors++;
  } finally {
    if (client) {
      try { await client.logout(); } catch (_) { /* ignore */ }
    }
    isRunning = false;
  }

  return { processed, skipped, errors };
}

// Démarre le polling périodique au boot du serveur
export function startImapPoller() {
  if (!process.env.IMAP_USER || !process.env.IMAP_PASS) {
    logger.info('[imap] Polling désactivé (IMAP_USER/IMAP_PASS non configurées)');
    return;
  }

  const intervalMin = Number(process.env.IMAP_POLL_INTERVAL) || 5;
  const intervalMs = intervalMin * 60 * 1000;

  logger.info(`[imap] Démarrage du polling toutes les ${intervalMin} minute(s) sur ${process.env.IMAP_USER}`);

  // Premier poll après 30 secondes (le temps que le serveur soit prêt)
  setTimeout(() => {
    pollImapOnce().catch(e => logger.error(`[imap] poll initial échoué : ${e.message || e}`));

    // Puis polls réguliers
    pollTimer = setInterval(() => {
      pollImapOnce().catch(e => logger.error(`[imap] poll échoué : ${e.message || e}`));
    }, intervalMs);
  }, 30_000);
}

export function stopImapPoller() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
    logger.info('[imap] Polling arrêté');
  }
}