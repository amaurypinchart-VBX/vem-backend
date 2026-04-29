// src/services/emailService.ts
import nodemailer from 'nodemailer';
import { logger } from '../utils/logger';

const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST || 'smtp.gmail.com',
  port:   Number(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const FROM = `"${process.env.EMAIL_FROM_NAME || 'VEM'}" <${process.env.SMTP_USER}>`;

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

export async function sendMail(opts: { to: string|string[]; subject: string; html: string; attachments?: any[] }) {
  if (!process.env.SMTP_USER) {
    logger.warn('SMTP not configured — email skipped');
    return;
  }
  try {
    await transporter.sendMail({
      from: FROM,
      to: Array.isArray(opts.to) ? opts.to.join(',') : opts.to,
      subject: opts.subject,
      html: opts.html,
      attachments: opts.attachments,
    });
    logger.info(`Email sent to ${opts.to}`);
  } catch (err) {
    logger.error(`Email failed: ${err}`);
  }
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
