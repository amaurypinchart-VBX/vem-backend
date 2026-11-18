// src/routes/publicHandoverSign.ts
// Routes PUBLIQUES (sans auth) pour la signature client par lien.
// Le client n'a pas de compte — il accède via un token unique.

import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { AppError } from '../utils/AppError';
import { generateHandoverPdf } from '../services/pdfService';
import { sendMail } from '../services/emailService';
import { saveProjectFilePdf } from '../utils/saveProjectFile';
import { handoverChecklist, checklistPdfData, publicChecklist, handoverChecklistMode } from '../services/checklistService';
import { translateTexts } from '../services/translationService';

/** Langue choisie à la génération du lien de signature (fr par défaut). */
const signLang = (h: { signatureLang?: string | null }): 'fr' | 'en' => (h.signatureLang === 'en' ? 'en' : 'fr');

/** Traduit (IA, repli sur l'original) les textes saisis en français montrés sur la page de signature. */
async function translateSignPage(data: any, lang: 'fr' | 'en') {
  if (lang === 'fr') return;
  const texts = new Set<string>();
  const add = (v: any) => { if (v && String(v).trim()) texts.add(String(v)); };
  data.items.forEach((it: any) => { add(it.zoneName); add(it.comment); });
  add(data.generalNotes); add(data.scopeOfWork);
  (data.checklist?.items || []).forEach((it: any) => { add(it.categoryName); add(it.label); add(it.comment); add(it.hint); });
  const list = [...texts];
  if (!list.length) return;
  const out = await translateTexts(list, lang).catch(() => list);
  const map = new Map(list.map((txt, i) => [txt, out[i] || txt]));
  const tr = (v: any) => (v && map.has(String(v)) ? map.get(String(v)) : v);
  data.items.forEach((it: any) => { it.zoneName = tr(it.zoneName); it.comment = tr(it.comment); });
  data.generalNotes = tr(data.generalNotes);
  data.scopeOfWork = tr(data.scopeOfWork);
  (data.checklist?.items || []).forEach((it: any) => {
    it.categoryName = tr(it.categoryName); it.label = tr(it.label); it.comment = tr(it.comment); it.hint = tr(it.hint);
  });
}

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

    // mêmes valeurs que le PDF : champs saisis dans « ✏️ Modifier » d'abord
    const cf = ((h.customFields as Record<string, any> | null) || {});
    const pick = (key: string, fallback: any) => (cf[key] !== undefined && cf[key] !== null && String(cf[key]).trim() !== '' ? String(cf[key]) : fallback);
    const typedDate = cf.handoverDate ? new Date(String(cf.handoverDate)) : null;
    const clientName = pick('clientName', h.clientName || h.project.client?.name || 'Client');
    const lang = signLang(h);
    const data: any = {
      lang,
      project: {
        name: pick('projectName', h.project.name),
        internalNumber: h.project.internalNumber,
        address: pick('siteAddress', h.project.address),
      },
      clientName,
      // nom proposé sous la signature du client
      clientRep: pick('clientRep', clientName),
      siteManagerName: pick('spantechRep', h.siteManager ? `${h.siteManager.firstName} ${h.siteManager.lastName}` : 'N/A'),
      items: h.items.map((it: any) => ({
        zoneName: it.zoneName,
        status: it.status,
        comment: it.comment,
      })),
      generalNotes: h.generalNotes,
      scopeOfWork: h.scopeOfWork,
      managerSignatureUrl: h.managerSignatureUrl,
      date: typedDate && !isNaN(typedDate.getTime()) ? typedDate : h.createdAt,
      // check-list de montage en lecture seule (sans N.A. ni données internes)
      checklist: handoverChecklistMode(h) === 'none' ? null : publicChecklist(await handoverChecklist(h.projectId)),
      // true : la check-list est montrée en annexe, après la signature
      checklistAnnex: handoverChecklistMode(h) === 'annex',
    };
    await translateSignPage(data, lang);
    res.json({ success: true, data });
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
      // champs saisis dans « ✏️ Modifier » ; le nom tapé par le client au moment de signer prime sous sa signature
      customFields: {
        ...(((h.customFields as Record<string, any> | null) || {})),
        ...((signerName || '').trim() ? { clientRep: (signerName || '').trim() } : {}),
      },
      managerSignatureUrl: h.managerSignatureUrl,
      clientSignatureUrl: signatureBase64,
      date: h.createdAt,
      lang: signLang(h),
      checklist: handoverChecklistMode(h) === 'none' ? null : checklistPdfData(await handoverChecklist(h.projectId)),
      checklistAnnex: handoverChecklistMode(h) === 'annex',
    });
    const lang = signLang(h);
    saveProjectFilePdf(h.projectId, pdfBuffer, `Handover_${h.project.internalNumber}_signed${lang === 'en' ? '_en' : ''}.pdf`, 'handover', null);

    // 3. Email aux 2 parties (site manager + client)
    const recipients = new Set<string>();
    if (h.siteManager?.email) recipients.add(h.siteManager.email);
    if (h.project.client?.email) recipients.add(h.project.client.email);

    if (recipients.size > 0) {
      try {
        await sendMail({
          to: Array.from(recipients),
          subject: lang === 'en'
            ? `[VEM] Handover signed — ${h.project.name}`
            : `[VEM] Handover signé — ${h.project.name}`,
          html: lang === 'en'
            ? `<p>Hello,</p>
<p>The client has signed the handover of the project <strong>${h.project.name}</strong> (ref. ${h.project.internalNumber}).</p>
<p>The full report with both signatures is attached.</p>
<p>Best regards,<br>The VIEWBOX team</p>`
            : `<p>Bonjour,</p>
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
      data: { message: lang === 'en' ? 'Signature saved. An e-mail with the full PDF has been sent.' : 'Signature enregistrée. Un email avec le PDF complet a été envoyé.' },
    });
  } catch (err) { next(err); }
});

export default router;