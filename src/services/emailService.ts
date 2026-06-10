// src/services/emailService.ts
// Envoi d'emails — utilise Brevo en priorité (plus fiable que SMTP Gmail sur Railway),
// avec fallback automatique vers SMTP si BREVO_API_KEY n'est pas configurée.
//
// Variables d'env :
//   - BREVO_API_KEY     : si présente, on utilise l'API transactionnelle Brevo
//   - EMAIL_FROM_NAME   : nom expéditeur (défaut "VEM")
//   - EMAIL_FROM_ADDR   : adresse expéditeur Brevo (ex: noreply@viewbox-event.com)
//                        — ATTENTION : DOIT être un domaine vérifié dans Brevo
//   - SMTP_HOST/PORT/USER/PASS : fallback si pas de Brevo
import nodemailer from 'nodemailer';
import { logger } from '../utils/logger';

// ─── Fallback SMTP (Gmail/autre) ───
const PORT = Number(process.env.SMTP_PORT) || 465;
const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST || 'smtp.gmail.com',
  port:   PORT,
  secure: PORT === 465,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  connectionTimeout: 15000,
  greetingTimeout:   10000,
  socketTimeout:     20000,
  family: 4,
} as any);

// Pour le From : nom + adresse. Si EMAIL_FROM_ADDR pas défini, on utilise SMTP_USER.
const FROM_NAME = process.env.EMAIL_FROM_NAME || 'VEM';
const FROM_ADDR = process.env.EMAIL_FROM_ADDR || process.env.SMTP_USER || 'noreply@viewbox-event.com';
const FROM      = `"${FROM_NAME}" <${FROM_ADDR}>`;

function base(title: string, content: string): string {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
  body{font-family:Arial,sans-serif;background:#f5f5f5;margin:0;padding:20px;}
  .wrap{max-width:600px;margin:0 auto;background:#fff;border-radius:10px;overflow:hidden;}
  .hdr{background:#1a1a2e;padding:24px;text-align:center;}
  .logo{color:#e63946;font-size:28px;font-weight:900;letter-spacing:2px;}
  .sub{color:rgba(255,255,255,.5);font-size:11px;margin-top:4px;}
  .body{padding:30px;}
  h2{color:#1a1a2e;margin:0 0 16px;}
  p{color:#555;line-height:1.6;margin:0 0 12px;}
  .info{background:#f8f8f8;border-radius:8px;padding:16px;margin:16px 0;}
  .row{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #eee;}
  .row:last-child{border:none;}
  .lbl{color:#999;font-size:13px;}
  .val{color:#1a1a2e;font-weight:700;font-size:13px;}
  .btn{display:inline-block;background:#e63946;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;margin:16px 0;}
  .badge-red{background:#fde8e8;color:#c0392b;padding:3px 10px;border-radius:99px;font-size:12px;font-weight:700;}
  .badge-amber{background:#fff3d4;color:#b8860b;padding:3px 10px;border-radius:99px;font-size:12px;font-weight:700;}
  .ftr{background:#f8f8f8;padding:14px;text-align:center;color:#999;font-size:11px;}
  </style></head>
  <body><div class="wrap">
  <div class="hdr"><div class="logo">VEM</div><div class="sub">ViewBox Event Manager</div></div>
  <div class="body"><h2>${title}</h2>${content}</div>
  <div class="ftr">© ${new Date().getFullYear()} VEM · Email automatique</div>
  </div></body></html>`;
}

// ─── Envoi via API Brevo (préféré sur Railway) ───
// Doc : https://developers.brevo.com/reference/sendtransacemail
async function sendViaBrevo(opts: { to: string|string[]; subject: string; html: string; attachments?: any[] }) {
  const toList = (Array.isArray(opts.to) ? opts.to : [opts.to]).map(e => ({ email: e }));
  const body: any = {
    sender:      { name: FROM_NAME, email: FROM_ADDR },
    to:          toList,
    subject:     opts.subject,
    htmlContent: opts.html,
  };
  // Convertir les attachments nodemailer-like vers le format Brevo (name + base64 content)
  if (opts.attachments && opts.attachments.length > 0) {
    body.attachment = opts.attachments.map((a: any) => {
      let content: string;
      if (Buffer.isBuffer(a.content))           content = a.content.toString('base64');
      else if (typeof a.content === 'string')   content = Buffer.from(a.content).toString('base64');
      else                                       content = '';
      return { name: a.filename || a.name || 'attachment', content };
    });
  }
  const r: any = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key':      process.env.BREVO_API_KEY!,
      'Content-Type': 'application/json',
      'Accept':       'application/json',
    },
    body: JSON.stringify(body),
  });
  const txt = await r.text();
  if (!r.ok) {
    logger.error(`[email/brevo] HTTP ${r.status} : ${txt}`);
    throw new Error(`Brevo API ${r.status} : ${txt.slice(0, 250)}`);
  }
  let json: any = {};
  try { json = JSON.parse(txt); } catch (_) { /* ok pour 204 No Content */ }
  return { messageId: json.messageId || `brevo-${Date.now()}` };
}

export async function sendMail(opts: { to: string|string[]; subject: string; html: string; attachments?: any[] }) {
  // Choix du provider : par défaut SMTP (Gmail), Brevo uniquement si demandé explicitement.
  // L'ancien code utilisait Brevo dès que BREVO_API_KEY était définie, mais ça créait
  // des problèmes pour les comptes qui n'ont configuré Brevo QUE pour l'inbound.
  const provider = (process.env.EMAIL_PROVIDER || 'smtp').toLowerCase();

  if (provider === 'brevo') {
    if (!process.env.BREVO_API_KEY) {
      throw new Error('EMAIL_PROVIDER=brevo mais BREVO_API_KEY non configurée');
    }
    try {
      const result = await sendViaBrevo(opts);
      const toStr = Array.isArray(opts.to) ? opts.to.join(', ') : opts.to;
      logger.info(`[email/brevo] ✅ envoyé à ${toStr} (messageId=${result.messageId})`);
      return result;
    } catch (brevoErr: any) {
      logger.error(`[email/brevo] ❌ échec : ${brevoErr.message}`);
      throw new Error(`Envoi mail échoué (Brevo) : ${brevoErr.message}`);
    }
  }

  // Par défaut : SMTP nodemailer (Gmail/autre)
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    const msg = 'SMTP non configuré : SMTP_USER ou SMTP_PASS manquant dans Railway. ' +
                'Voir https://support.google.com/accounts/answer/185833 pour générer un App Password Gmail.';
    logger.error(msg);
    throw new Error(msg);
  }
  try {
    logger.info(`[email/smtp] tentative d'envoi via ${process.env.SMTP_HOST || 'smtp.gmail.com'}:${PORT} (user=${process.env.SMTP_USER})`);
    const result = await transporter.sendMail({
      from: FROM,
      to: Array.isArray(opts.to) ? opts.to.join(',') : opts.to,
      subject: opts.subject,
      html: opts.html,
      attachments: opts.attachments,
    });
    const toStr = Array.isArray(opts.to) ? opts.to.join(', ') : opts.to;
    logger.info(`[email/smtp] ✅ envoyé à ${toStr} (messageId=${result.messageId})`);
    return result;
  } catch (err: any) {
    // Détection des erreurs Gmail typiques pour aider au diagnostic
    let hint = '';
    const msg = String(err.message || err);
    if (msg.includes('Invalid login') || msg.includes('Username and Password not accepted')) {
      hint = ' — Gmail refuse la connexion. Tu DOIS utiliser un App Password (pas ton mot de passe Gmail normal). ' +
             'Génère-le sur https://myaccount.google.com/apppasswords (nécessite 2FA activé).';
    } else if (msg.includes('ETIMEDOUT') || msg.includes('ECONNREFUSED')) {
      hint = ' — Timeout réseau. Essaye SMTP_PORT=465 (au lieu de 587) sur Railway.';
    } else if (msg.includes('self signed certificate')) {
      hint = ' — Problème de certificat TLS.';
    }
    logger.error(`[email/smtp] ❌ échec : ${msg}${hint}`);
    throw new Error(`Envoi mail échoué : ${msg}${hint}`);
  }
}

// Route de test : POST /api/v1/admin/test-email avec { to: "...." } pour diagnostiquer
// Cette fonction est exportée pour pouvoir être appelée depuis une route admin.
export async function sendTestEmail(to: string) {
  return sendMail({
    to,
    subject: '[VEM] Test d\'envoi email',
    html: base('Test SMTP', '<p>Si vous lisez ce mail, la configuration SMTP fonctionne ✅</p><p>Envoyé depuis ' + (process.env.SMTP_USER || 'inconnu') + '</p>'),
  });
}

export async function sendTicketAssigned(opts: { to: string; ticketTitle: string; urgency: string; project: string; location?: string; assignee: string; description: string; appUrl: string }) {
  const urgencyLabel: Record<string,string> = { critical:'🔴 Critique', high:'🟠 Élevé', medium:'🟡 Moyen', low:'🟢 Faible' };
  const content = `
    <p>Bonjour <strong>${opts.assignee}</strong>,</p>
    <p>Un ticket vous a été assigné.</p>
    <div class="info">
      <div class="row"><span class="lbl">Projet</span><span class="val">${opts.project}</span></div>
      <div class="row"><span class="lbl">Titre</span><span class="val">${opts.ticketTitle}</span></div>
      <div class="row"><span class="lbl">Urgence</span><span class="val">${urgencyLabel[opts.urgency] || opts.urgency}</span></div>
      ${opts.location ? `<div class="row"><span class="lbl">Localisation</span><span class="val">${opts.location}</span></div>` : ''}
    </div>
    <p><strong>Description :</strong></p>
    <p style="background:#f8f8f8;padding:12px;border-radius:8px;border-left:4px solid #e63946;">${opts.description}</p>
    <a href="${opts.appUrl}" class="btn">Voir le ticket</a>`;
  await sendMail({ to: opts.to, subject: `[VEM] Ticket assigné : ${opts.ticketTitle}`, html: base('🛠️ Nouveau ticket assigné', content) });
}

export async function sendDailyReport(opts: { to: string|string[]; projectName: string; date: string; notes?: string; entries: any[]; pdfBuffer?: Buffer }) {
  const entriesHtml = opts.entries.map(e => `<div class="row"><span class="lbl">${e.entryTime}</span><span class="val" style="max-width:340px;">${e.description}</span></div>`).join('');
  const content = `
    <p>Rapport journalier du projet <strong>${opts.projectName}</strong> pour le <strong>${opts.date}</strong>.</p>
    <div class="info">${entriesHtml || '<p style="color:#999;font-size:13px;">Aucune entrée.</p>'}</div>
    ${opts.notes ? `<p><strong>Notes :</strong> ${opts.notes}</p>` : ''}
    ${opts.pdfBuffer ? '<p>📎 Le rapport PDF est joint à cet email.</p>' : ''}`;
  await sendMail({
    to: opts.to,
    subject: `[VEM] Daily Report — ${opts.projectName} — ${opts.date}`,
    html: base('📓 Rapport Journalier', content),
    attachments: opts.pdfBuffer ? [{ filename: `Daily_${opts.projectName}_${opts.date}.pdf`, content: opts.pdfBuffer }] : undefined,
  });
}

export async function sendHandoverPdf(opts: { to: string|string[]; projectName: string; pdfBuffer: Buffer }) {
  const content = `<p>Le rapport de réception (Handover) pour le projet <strong>${opts.projectName}</strong> a été signé et est disponible en pièce jointe.</p>`;
  await sendMail({
    to: opts.to,
    subject: `[VEM] Handover signé — ${opts.projectName}`,
    html: base('🧾 Rapport de Réception', content),
    attachments: [{ filename: `Handover_${opts.projectName.replace(/\s/g,'_')}.pdf`, content: opts.pdfBuffer }],
  });
}

export async function sendTicketEscalation(opts: { to: string; ticketTitle: string; projectName: string; hours: number; appUrl: string }) {
  const content = `
    <p>⚠️ Le ticket suivant n'a pas été traité depuis <strong>${opts.hours}h</strong> :</p>
    <div class="info">
      <div class="row"><span class="lbl">Ticket</span><span class="val">${opts.ticketTitle}</span></div>
      <div class="row"><span class="lbl">Projet</span><span class="val">${opts.projectName}</span></div>
      <div class="row"><span class="lbl">Délai dépassé</span><span class="val">${opts.hours}h</span></div>
    </div>
    <a href="${opts.appUrl}" class="btn">Traiter maintenant</a>`;
  await sendMail({ to: opts.to, subject: `[VEM] 🚨 ESCALADE — ${opts.ticketTitle}`, html: base('🚨 Escalade Automatique', content) });
}