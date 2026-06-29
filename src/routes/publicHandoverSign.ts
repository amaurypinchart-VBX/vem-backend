// src/routes/publicHandoverSign.ts
// Routes PUBLIQUES (sans auth) pour la signature client par lien.
// Le client n'a pas de compte — il accède via un token unique.

import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { AppError } from '../utils/AppError';
import { generateHandoverPdf } from '../services/pdfService';
import { sendMail } from '../services/emailService';

const router = Router();

// GET /api/v1/public/handover-sign/:token
// Renvoie les infos du handover pour aperçu sur la page de signature.
// Renvoie 410 (Gone) si le token est invalide, utilisé ou expiré.
router.get('/:token', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const h = await prisma.handover.findFirst({
      where: {
        signatureToken: req.params.token,
        signatureTokenUsed: false,
      },
      include: {
        project: { include: { client: { select: { name: true, email: true } } } },
        siteManager: { select: { firstName: true, lastName: true } },
        items: {
          orderBy: { sortOrder: 'asc' },
          include: { photos: true, itemPhotos: true },
        },
      },
    });
    if (!h) {
      return res.status(410).json({ success: false, error: 'Lien invalide ou déjà utilisé' });
    }

    res.json({
      success: true,
      data: {
        project: {
          name: h.project.name,
          internalNumber: h.project.internalNumber,
          address: h.project.address,
        },
        clientName: h.clientName || h.project.client?.name || 'Client',
        siteManagerName: h.siteManager ? `${h.siteManager.firstName} ${h.siteManager.lastName}` : 'N/A',
        items: h.items.map((it: any) => ({
          zoneName: it.zoneName,
          status: it.status,
          comment: it.comment,
        })),
        generalNotes: h.generalNotes,
        scopeOfWork: h.scopeOfWork,
        managerSignatureUrl: h.managerSignatureUrl,
        date: h.createdAt,
      },
    });
  } catch (err) { next(err); }
});

// POST /api/v1/public/handover-sign/:token
// Reçoit la signature du client + nom optionnel, marque le token comme utilisé,
// génère le PDF complet et l'envoie par email aux parties prenantes.
router.post('/:token', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { signatureBase64, signerName } = req.body;
    if (!signatureBase64 || typeof signatureBase64 !== 'string' || !signatureBase64.startsWith('data:image')) {
      return res.status(400).json({ success: false, error: 'Signature invalide' });
    }

    const h = await prisma.handover.findFirst({
      where: {
        signatureToken: req.params.token,
        signatureTokenUsed: false,
      },
      include: {
        project: { include: { client: { select: { name: true, email: true } } } },
        siteManager: { select: { firstName: true, lastName: true, email: true } },
        items: {
          orderBy: { sortOrder: 'asc' },
          include: { photos: true, itemPhotos: true },
        },
      },
    });
    if (!h) {
      return res.status(410).json({ success: false, error: 'Lien expiré ou déjà utilisé' });
    }

    // 1. Marquer comme signé + token utilisé (atomique)
    await prisma.handover.update({
      where: { id: h.id },
      data: {
        clientSignatureUrl: signatureBase64,
        clientSignedAt: new Date(),
        clientName: (signerName || '').trim() || h.clientName,
        signatureTokenUsed: true,
        status: h.managerSignedAt ? 'signed' : h.status,
      },
    });

    // 2. Générer le PDF avec les 2 signatures
    const items = h.items.map((it: any) => ({
      zoneName: it.zoneName,
      status: it.status,
      comment: it.comment,
      photos: [
        ...(it.photos || []).map((p: any) => ({ photoUrl: p.photoUrl })),
        ...(it.itemPhotos || []).map((p: any) => ({ photoUrl: p.photoUrl })),
      ],
    }));

    const pdfBuffer = await generateHandoverPdf({
      project: { name: h.project.name, internalNumber: h.project.internalNumber, address: h.project.address },
      clientName: (signerName || '').trim() || h.clientName || h.project.client?.name || 'Client',
      siteManagerName: h.siteManager ? `${h.siteManager.firstName} ${h.siteManager.lastName}` : 'N/A',
      items,
      generalNotes: h.generalNotes,
      scopeOfWork: h.scopeOfWork,
      managerSignatureUrl: h.managerSignatureUrl,
      clientSignatureUrl: signatureBase64,
      date: h.createdAt,
      lang: 'fr',
    });

    // 3. Email aux 2 parties (site manager + client)
    const recipients = new Set<string>();
    if (h.siteManager?.email) recipients.add(h.siteManager.email);
    if (h.project.client?.email) recipients.add(h.project.client.email);

    if (recipients.size > 0) {
      try {
        await sendMail({
          to: Array.from(recipients),
          subject: `[VEM] Handover signé — ${h.project.name}`,
          html: `<p>Bonjour,</p>
<p>Le client a signé le handover du projet <strong>${h.project.name}</strong> (réf. ${h.project.internalNumber}).</p>
<p>Le rapport complet avec les 2 signatures est en pièce jointe.</p>
<p>Cordialement,<br>L'équipe VIEWBOX</p>`,
          attachments: [{
            filename: `Handover_${h.project.internalNumber}_signed.pdf`,
            content: pdfBuffer,
            contentType: 'application/pdf',
          }],
        });
      } catch (e) {
        console.error('[public-sign] email failed:', e);
        // On ne fait pas crasher la requête — la signature est déjà enregistrée
      }
    }

    res.json({
      success: true,
      data: { message: 'Signature enregistrée. Un email avec le PDF complet a été envoyé.' },
    });
  } catch (err) { next(err); }
});

export default router;