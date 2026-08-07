// src/routes/projects.ts
import { Router, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../utils/AppError';
import { io } from '../index';
import { notifyTubizeTruckMovement } from '../services/telegramService';
import { createWarehouseTask } from '../services/warehouseAppService';
import { sendMail } from '../services/emailService';

const router = Router();

router.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { status, search } = req.query;
    const where: any = {};
    if (status) where.status = status;
    if (search) where.OR = [
      { name: { contains: String(search), mode: 'insensitive' } },
      { internalNumber: { contains: String(search), mode: 'insensitive' } },
    ];

    const projects = await prisma.project.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { installationStart: 'asc' }],
      include: {
        client: { select: { id:true, name:true } },
        technicalManager: { select: { id:true, firstName:true, lastName:true } },
        team: { include: { user: { select: { id:true, firstName:true, lastName:true, role:true } } } },
        _count: { select: { tasks:true, tickets:true } },
      },
    });

    // Attach progress
    const enriched = await Promise.all(projects.map(async p => {
      const [total, done] = await Promise.all([
        prisma.task.count({ where: { projectId: p.id } }),
        prisma.task.count({ where: { projectId: p.id, status: 'done' } }),
      ]);
      return { ...p, tasksTotal: total, tasksDone: done, progress: total > 0 ? Math.round(done/total*100) : 0 };
    }));

    res.json({ success: true, data: enriched });
  } catch (err) { next(err); }
});

// PATCH /projects/reorder — réordonner plusieurs projets en une seule requête.
// IMPORTANT : doit être déclarée AVANT GET/PATCH /:id pour qu'Express ne
// confonde pas "reorder" avec un id de projet.
router.patch('/reorder', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { orders } = req.body; // [{ id: string, sortOrder: number }, ...]
    if (!Array.isArray(orders)) {
      return res.status(400).json({ success: false, error: 'orders doit être un tableau' });
    }
    await prisma.$transaction(
      orders.map((o: any) =>
        prisma.project.update({
          where: { id: o.id },
          data:  { sortOrder: Number(o.sortOrder) || 0 },
        })
      )
    );
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.get('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const p = await prisma.project.findUnique({
      where: { id: req.params.id },
      include: {
        client: true,
        technicalManager: { select: { id:true, firstName:true, lastName:true, email:true } },
        team: { include: { user: { select: { id:true, firstName:true, lastName:true, role:true, avatarUrl:true, phone:true, email:true } } } },
        trucks: true,
        files: { orderBy: { createdAt: 'desc' } },
        _count: { select: { tasks:true, tickets:true, handovers:true, warehouseBoxes:true } },
      },
    });
    if (!p) throw new AppError('Projet introuvable', 404);
    const [total, done] = await Promise.all([
      prisma.task.count({ where: { projectId: p.id } }),
      prisma.task.count({ where: { projectId: p.id, status: 'done' } }),
    ]);
    res.json({ success: true, data: { ...p, tasksTotal: total, tasksDone: done, progress: total > 0 ? Math.round(done/total*100) : 0 } });
  } catch (err) { next(err); }
});

router.post('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { siteManagerIds = [], engineerIds = [], ...data } = req.body;
    const project = await prisma.project.create({
      data: {
        ...data,
        internalNumber: data.internalNumber || `VEM-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`,
        installationStart: new Date(data.installationStart),
        installationEnd:   new Date(data.installationEnd),
        dismantlingStart:  data.dismantlingStart ? new Date(data.dismantlingStart) : null,
        dismantlingEnd:    data.dismantlingEnd   ? new Date(data.dismantlingEnd)   : null,
        createdById: req.user!.id,
        team: {
          create: [
            ...siteManagerIds.map((uid: string) => ({ userId: uid, role: 'site_manager', isLead: true })),
            ...engineerIds.map((uid: string) => ({ userId: uid, role: 'engineer' })),
          ],
        },
      },
      include: { client: true },
    });
    res.status(201).json({ success: true, data: project });
  } catch (err) { next(err); }
});

router.patch('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { siteManagerIds, engineerIds, trucks, tasks, ...data } = req.body;

    // Convertir toutes les colonnes de type DateTime — sinon Prisma rejette
    // les strings ISO comme entrées invalides
    for (const k of ['installationStart','installationEnd','dismantlingStart','dismantlingEnd']) {
      if (data[k]) data[k] = new Date(data[k]);
      else if (data[k] === '' || data[k] === null) data[k] = null;
    }

    // Nettoyage : on retire les champs qui ne sont pas dans le modèle Project
    // pour éviter une erreur P2009 ("unknown argument") sur les updates
    const allowed = [
      'name','internalNumber','clientId','technicalManagerId',
      'address','city','description','specialInstructions',
      'scope','installNotes','dismantleNotes','sortOrder',
      'workersCount','status',
      'installationStart','installationEnd','dismantlingStart','dismantlingEnd',
    ];
    const cleanData: any = {};
    for (const k of allowed) if (data[k] !== undefined) cleanData[k] = data[k];

    const project = await prisma.project.update({
      where: { id: req.params.id },
      data: cleanData,
      include: { client: true, technicalManager: { select: { id:true, firstName:true, lastName:true } } },
    });
    io.to(`project:${req.params.id}`).emit('project:updated', project);
    res.json({ success: true, data: project });
  } catch (err: any) {
    // On expose le vrai message au front pour debugger plus vite (ex: clientId invalide, date pourrie)
    next(err);
  }
});

router.delete('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await prisma.project.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) { next(err); }
});
// POST /projects/:id/team — ajouter un membre
router.post('/:id/team', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { userId, role, isLead, phase } = req.body;
    const member = await prisma.projectTeam.create({
      data: {
        projectId: req.params.id,
        userId,
        role,
        isLead: isLead||false,
        phase: phase || 'both',
      },
      include: { user: { select: { firstName:true, lastName:true, email:true } } },
    });
    res.status(201).json({ success: true, data: member });
  } catch (err: any) {
    if (err.code === 'P2002') return res.status(409).json({ success: false, error: 'Déjà dans l\'équipe' });
    next(err);
  }
});

// PATCH /projects/:id/team/:memberId — modifier un membre (phase, rôle, isLead)
router.patch('/:id/team/:memberId', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data: any = {};
    if (req.body.phase  !== undefined) data.phase  = req.body.phase;
    if (req.body.role   !== undefined) data.role   = req.body.role;
    if (req.body.isLead !== undefined) data.isLead = req.body.isLead;
    const member = await prisma.projectTeam.update({
      where: { id: req.params.memberId },
      data,
      include: { user: { select: { firstName:true, lastName:true, email:true } } },
    });
    res.json({ success: true, data: member });
  } catch (err) { next(err); }
});

// DELETE /projects/:id/team/:memberId — retirer un membre de l'équipe
router.delete('/:id/team/:memberId', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await prisma.projectTeam.delete({ where: { id: req.params.memberId } });
    res.json({ success: true });
  } catch (err) { next(err); }
});

// POST /projects/:id/team/:memberId/notify — envoyer infos / notifier un membre
// Body : { items: string[], channel: 'notif'|'email'|'both', message?: string }
// items possibles : assignment | project_info | briefings | bookings | reports | ai_content
router.post('/:id/team/:memberId/notify', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { items = [], channel = 'notif', message = '' } = req.body as {
      items: string[]; channel: 'notif' | 'email' | 'both'; message?: string;
    };
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: 'Aucun élément à envoyer' });
    }

    const member = await prisma.projectTeam.findUnique({
      where: { id: req.params.memberId },
      include: {
        user:    { select: { id: true, firstName: true, lastName: true, email: true } },
        project: { include: { client: { select: { name: true } }, briefing: { select: { id: true, title: true } } } },
      },
    });
    if (!member || member.projectId !== req.params.id) {
      return res.status(404).json({ success: false, error: 'Membre introuvable' });
    }

    const u = member.user;
    const p = member.project;
    const roleLabel = member.role;
    const phaseMap: Record<string, string> = { both: 'installation + démontage', installation: 'installation', dismantling: 'démontage' };
    const phaseLabel = phaseMap[member.phase] || member.phase;
    const fmt = (d?: Date | null) => d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
    const APP_URL = process.env.APP_URL || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : '');
    const esc = (s: string) => String(s || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const textParts: string[] = [];
    const htmlParts: string[] = [];

    if (items.includes('assignment')) {
      textParts.push(`Tu es assigné au projet ${p.name} (${p.internalNumber}) en tant que ${roleLabel} — phase : ${phaseLabel}.`);
      htmlParts.push(`
        <h3 style="margin:18px 0 8px;color:#1a1a2e;">📌 Assignation</h3>
        <div class="info">
          <div class="row"><span class="lbl">Projet</span><span class="val">${esc(p.name)}</span></div>
          <div class="row"><span class="lbl">N° interne</span><span class="val">${esc(p.internalNumber)}</span></div>
          <div class="row"><span class="lbl">Rôle</span><span class="val">${esc(roleLabel)}</span></div>
          <div class="row"><span class="lbl">Phase</span><span class="val">${phaseLabel}</span></div>
        </div>`);
    }

    if (items.includes('project_info')) {
      const lieu = [p.address, p.city].filter(Boolean).join(', ') || '—';
      textParts.push(`Infos projet — Client: ${p.client?.name || '—'} | Lieu: ${lieu} | Installation: ${fmt(p.installationStart)} → ${fmt(p.installationEnd)}${p.dismantlingStart ? ` | Démontage: ${fmt(p.dismantlingStart)} → ${fmt(p.dismantlingEnd)}` : ''}`);
      htmlParts.push(`
        <h3 style="margin:18px 0 8px;color:#1a1a2e;">📋 Infos du projet</h3>
        <div class="info">
          <div class="row"><span class="lbl">Client</span><span class="val">${esc(p.client?.name || '—')}</span></div>
          <div class="row"><span class="lbl">Lieu</span><span class="val">${esc(lieu)}</span></div>
          <div class="row"><span class="lbl">Installation</span><span class="val">${fmt(p.installationStart)} → ${fmt(p.installationEnd)}</span></div>
          ${p.dismantlingStart ? `<div class="row"><span class="lbl">Démontage</span><span class="val">${fmt(p.dismantlingStart)} → ${fmt(p.dismantlingEnd)}</span></div>` : ''}
        </div>
        ${p.scope ? `<p><strong>Notes globales :</strong> ${esc(p.scope)}</p>` : ''}
        ${p.installNotes ? `<p><strong>Notes installation :</strong> ${esc(p.installNotes)}</p>` : ''}
        ${p.dismantleNotes ? `<p><strong>Notes démontage :</strong> ${esc(p.dismantleNotes)}</p>` : ''}`);
    }

    if (items.includes('briefings')) {
      if (p.briefing) {
        textParts.push(`Un briefing est disponible pour ce projet${p.briefing.title ? ` : ${p.briefing.title}` : ''}.`);
        htmlParts.push(`
          <h3 style="margin:18px 0 8px;color:#1a1a2e;">📊 Briefing</h3>
          <p>Un briefing est disponible pour ce projet${p.briefing.title ? ` : <strong>${esc(p.briefing.title)}</strong>` : ''}.</p>
          ${APP_URL ? `<a href="${APP_URL}" class="btn">Ouvrir VEM</a>` : ''}`);
      } else {
        textParts.push(`Aucun briefing n'a encore été créé pour ce projet.`);
        htmlParts.push(`<h3 style="margin:18px 0 8px;color:#1a1a2e;">📊 Briefing</h3><p style="color:#999;">Aucun briefing créé pour l'instant.</p>`);
      }
    }

    if (items.includes('bookings')) {
      const [transports, hotels] = await Promise.all([
        prisma.teamBooking.findMany({ where: { projectId: p.id, userId: u.id }, orderBy: { onSiteStart: 'asc' } }),
        prisma.hotelBooking.findMany({ where: { projectId: p.id, occupants: { some: { userId: u.id } } }, orderBy: { checkin: 'asc' } }),
      ]);
      const bkText: string[] = [];
      transports.forEach(t => bkText.push(`Transport (${t.phase}) : ${fmt(t.onSiteStart)}→${fmt(t.onSiteEnd)}${t.outboundMode ? `, aller ${t.outboundMode} ${fmt(t.outboundDate)}` : ''}${t.returnMode ? `, retour ${t.returnMode} ${fmt(t.returnDate)}` : ''}`));
      hotels.forEach(h => bkText.push(`Hôtel : ${h.hotelName} (${fmt(h.checkin)}→${fmt(h.checkout)})`));
      textParts.push(bkText.length ? `Réservations — ${bkText.join(' | ')}` : `Aucune réservation à ton nom sur ce projet.`);
      htmlParts.push(`
        <h3 style="margin:18px 0 8px;color:#1a1a2e;">🚚 Tes réservations</h3>
        ${(transports.length || hotels.length) ? `<div class="info">
          ${transports.map(t => `<div class="row"><span class="lbl">Transport ${t.phase}</span><span class="val">${fmt(t.onSiteStart)} → ${fmt(t.onSiteEnd)}</span></div>${t.outboundMode ? `<div class="row"><span class="lbl">Aller</span><span class="val">${esc(t.outboundMode)} · ${fmt(t.outboundDate)}</span></div>` : ''}${t.returnMode ? `<div class="row"><span class="lbl">Retour</span><span class="val">${esc(t.returnMode)} · ${fmt(t.returnDate)}</span></div>` : ''}`).join('')}
          ${hotels.map(h => `<div class="row"><span class="lbl">Hôtel</span><span class="val">${esc(h.hotelName)} · ${fmt(h.checkin)}→${fmt(h.checkout)}</span></div>`).join('')}
        </div>` : `<p style="color:#999;">Aucune réservation à ton nom.</p>`}`);
    }

    if (items.includes('reports')) {
      const reports = await prisma.dailyReport.findMany({
        where: { projectId: p.id }, orderBy: { reportDate: 'desc' }, take: 5,
        select: { reportDate: true, generalNotes: true },
      });
      textParts.push(reports.length ? `Derniers rapports : ${reports.map(r => fmt(r.reportDate)).join(', ')}.` : `Aucun rapport journalier pour ce projet.`);
      htmlParts.push(`
        <h3 style="margin:18px 0 8px;color:#1a1a2e;">📄 Derniers rapports</h3>
        ${reports.length ? `<div class="info">${reports.map(r => `<div class="row"><span class="lbl">${fmt(r.reportDate)}</span><span class="val" style="max-width:340px;">${esc((r.generalNotes || '').slice(0, 80)) || '—'}</span></div>`).join('')}</div>` : `<p style="color:#999;">Aucun rapport pour l'instant.</p>`}`);
    }

    if (items.includes('ai_content')) {
      const aiMsg = await generateAiMemberMessage({
        name: `${u.firstName} ${u.lastName}`.trim(),
        role: roleLabel, phase: phaseLabel,
        project: p.name, client: p.client?.name || '',
        location: [p.address, p.city].filter(Boolean).join(', '),
        installStart: fmt(p.installationStart), installEnd: fmt(p.installationEnd),
        scope: p.scope || '', installNotes: p.installNotes || '',
      });
      if (aiMsg) {
        textParts.push(aiMsg);
        htmlParts.push(`<h3 style="margin:18px 0 8px;color:#1a1a2e;">🤖 Message</h3><p style="background:#f4f7ff;border-left:4px solid #4895ef;padding:12px 16px;border-radius:0 8px 8px 0;white-space:pre-wrap;">${esc(aiMsg)}</p>`);
      }
    }

    const summaryText = textParts.join('\n\n');

    // Canal : notification in-app
    let notifCreated = false;
    if (channel === 'notif' || channel === 'both') {
      await prisma.notification.create({
        data: {
          userId: u.id,
          type:   'project_info',
          title:  `📤 ${p.name}`,
          body:   (message ? message + '\n\n' : '') + summaryText.slice(0, 1000),
          data:   JSON.stringify({ projectId: p.id, items }),
        },
      });
      try { io.to(`user:${u.id}`).emit('notification:new', { projectId: p.id }); } catch {}
      notifCreated = true;
    }

    // Canal : email
    let emailSent = false;
    if (channel === 'email' || channel === 'both') {
      if (!u.email) {
        return res.status(400).json({ success: false, error: `${u.firstName} n'a pas d'email — utilise la notification à la place.` });
      }
      const intro = message ? `<p style="background:#fffbe6;border-left:4px solid #f4a261;padding:12px 16px;border-radius:0 8px 8px 0;">${esc(message)}</p>` : '';
      const html = memberEmailShell(`Projet ${esc(p.name)}`, `<p>Bonjour <strong>${esc(u.firstName)}</strong>,</p>${intro}${htmlParts.join('')}${APP_URL ? `<a href="${APP_URL}" class="btn">Ouvrir VEM</a>` : ''}`);
      await sendMail({ to: u.email, subject: `[VEM] ${p.name} — infos projet`, html });
      emailSent = true;
    }

    const bits: string[] = [];
    if (notifCreated) bits.push('notification envoyée');
    if (emailSent)    bits.push(`email envoyé à ${u.email}`);
    res.json({ success: true, data: { summary: `✅ ${u.firstName} : ${bits.join(' + ')}` } });
  } catch (err) { next(err); }
});

// ── Helper : gabarit HTML de l'email membre (mêmes classes que emailService) ──
function memberEmailShell(title: string, content: string): string {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
  body{font-family:Arial,sans-serif;background:#f5f5f5;margin:0;padding:20px;}
  .wrap{max-width:600px;margin:0 auto;background:#fff;border-radius:10px;overflow:hidden;}
  .hdr{background:#1a1a2e;padding:24px;text-align:center;}
  .logo{color:#e63946;font-size:28px;font-weight:900;letter-spacing:2px;}
  .sub{color:rgba(255,255,255,.5);font-size:11px;margin-top:4px;}
  .body{padding:30px;}
  h2{color:#1a1a2e;margin:0 0 16px;}
  h3{font-size:15px;}
  p{color:#555;line-height:1.6;margin:0 0 12px;}
  .info{background:#f8f8f8;border-radius:8px;padding:16px;margin:8px 0 16px;}
  .row{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #eee;}
  .row:last-child{border:none;}
  .lbl{color:#999;font-size:13px;}
  .val{color:#1a1a2e;font-weight:700;font-size:13px;text-align:right;}
  .btn{display:inline-block;background:#e63946;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;margin:16px 0;}
  .ftr{background:#f8f8f8;padding:14px;text-align:center;color:#999;font-size:11px;}
  </style></head>
  <body><div class="wrap">
  <div class="hdr"><div class="logo">VEM</div><div class="sub">ViewBox Event Manager</div></div>
  <div class="body"><h2>${title}</h2>${content}</div>
  <div class="ftr">© ${new Date().getFullYear()} VEM · Email automatique</div>
  </div></body></html>`;
}

// ── Helper : message personnalisé via Claude Haiku, repli templaté si indispo ──
async function generateAiMemberMessage(ctx: {
  name: string; role: string; phase: string; project: string; client: string;
  location: string; installStart: string; installEnd: string; scope: string; installNotes: string;
}): Promise<string> {
  const firstName = ctx.name.split(' ')[0] || ctx.name;
  const fallback = `Salut ${firstName}, tu interviens sur le projet ${ctx.project}${ctx.client ? ` pour ${ctx.client}` : ''} en tant que ${ctx.role} (${ctx.phase}). Installation du ${ctx.installStart} au ${ctx.installEnd}${ctx.location ? ` à ${ctx.location}` : ''}. Merci de confirmer ta disponibilité.`;
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return fallback;
  try {
    const prompt = `Rédige un court message professionnel et chaleureux en français (3-4 phrases max, tutoiement) pour informer un membre d'équipe de son affectation sur un chantier événementiel. Pas de formule de politesse finale type "cordialement". Contexte :
- Destinataire : ${ctx.name}
- Rôle : ${ctx.role} (phase : ${ctx.phase})
- Projet : ${ctx.project}${ctx.client ? ` (client ${ctx.client})` : ''}
- Lieu : ${ctx.location || 'à préciser'}
- Installation : ${ctx.installStart} → ${ctx.installEnd}
${ctx.scope ? `- Contexte : ${ctx.scope}` : ''}
${ctx.installNotes ? `- Notes install : ${ctx.installNotes}` : ''}
Réponds uniquement avec le message, sans préambule.`;
    const r: any = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!r.ok) return fallback;
    const j: any = await r.json();
    const text = (j.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('').trim();
    return text || fallback;
  } catch {
    return fallback;
  }
}

// POST /projects/:id/trucks — ajouter camion/machine
router.post('/:id/trucks', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const truck = await prisma.truck.create({
      data: {
        projectId: req.params.id,
        vehicleType: req.body.vehicleType || 'truck',
        truckNumber: req.body.truckNumber || null,
        licensePlate: req.body.licensePlate || null,
        driverName: req.body.driverName || null,
        driverPhone: req.body.driverPhone || null,
        status: req.body.status || 'planned',
        loadingDate:  req.body.loadingDate  ? new Date(req.body.loadingDate)  : null,
        arrivalDate:  req.body.arrivalDate  ? new Date(req.body.arrivalDate)  : null,
        departureDate: req.body.departureDate ? new Date(req.body.departureDate) : null,
        loadingLocation:   req.body.loadingLocation   || null,
        unloadingLocation: req.body.unloadingLocation || null,
        notes: req.body.notes || null,
      } as any,
    });

    // Notification Telegram + création task dans EntrepôtApp si Tubize.
    // Échoue silencieusement si non configuré (logs warning).
    // Fire-and-forget pour ne pas bloquer la réponse HTTP.
    prisma.project.findUnique({
      where: { id: req.params.id },
      select: { id: true, name: true, internalNumber: true, address: true },
    }).then(project => {
      if (!project) return;
      notifyTubizeTruckMovement(truck, project, 'created').catch(() => {});
      createWarehouseTask(truck, project).catch(() => {});
    }).catch(() => {});

    res.status(201).json({ success: true, data: truck });
  } catch (err) { next(err); }
});

// PATCH /projects/:id/trucks/:truckId — mise à jour d'un véhicule
router.patch('/:id/trucks/:truckId', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data: any = {};
    // Champs scalaires : on n'écrit que ceux explicitement fournis
    for (const k of ['vehicleType','truckNumber','licensePlate','driverName','driverPhone','status','loadingLocation','unloadingLocation','notes']) {
      if (req.body[k] !== undefined) data[k] = req.body[k] || null;
    }
    // Champs date
    for (const k of ['loadingDate','arrivalDate','departureDate']) {
      if (req.body[k] !== undefined) data[k] = req.body[k] ? new Date(req.body[k]) : null;
    }
    const truck = await prisma.truck.update({ where: { id: req.params.truckId }, data });

    // Notification Telegram en cas de modification SIGNIFICATIVE :
    // - changement de la date de chargement (replanification)
    // - changement du lieu de chargement / déchargement
    // (un changement de chauffeur ou de notes ne déclenche pas de notif)
    const significantChange = (
      data.loadingDate       !== undefined ||
      data.arrivalDate       !== undefined ||
      data.loadingLocation   !== undefined ||
      data.unloadingLocation !== undefined ||
      data.status            !== undefined
    );
    if (significantChange) {
      prisma.project.findUnique({
        where: { id: req.params.id },
        select: { id: true, name: true, internalNumber: true },
      }).then(project => {
        if (project) notifyTubizeTruckMovement(truck, project, 'updated').catch(() => {});
      }).catch(() => {});
    }

    res.json({ success: true, data: truck });
  } catch (err) { next(err); }
});

// DELETE /projects/:id/trucks/:truckId
router.delete('/:id/trucks/:truckId', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await prisma.truck.delete({ where: { id: req.params.truckId } });
    res.json({ success: true });
  } catch (err) { next(err); }
});

// GET /projects/:id/trucks  
router.get('/:id/trucks', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const trucks = await prisma.truck.findMany({
      where: { projectId: req.params.id },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data: trucks });
  } catch (err) { next(err); }
});

// GET /projects/:id/files
router.get('/:id/files', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const files = await prisma.projectFile.findMany({
      where: { projectId: req.params.id },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data: files });
  } catch (err) { next(err); }
});

// POST /projects/:id/files
router.post('/:id/files', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { fileName, fileUrl, fileType, fileSize, publicId, category } = req.body;
    if (!fileUrl) throw new AppError('fileUrl requis', 400);
    const file = await prisma.projectFile.create({
      data: {
        projectId:  req.params.id,
        uploadedBy: req.user!.id,
        fileName:   fileName || 'fichier',
        fileUrl,
        fileType:   fileType  || null,
        fileSize:   fileSize  || null,
        publicId:   publicId  || null,
        category:   category  || 'project',
      },
    });
    res.status(201).json({ success: true, data: file });
  } catch (err) { next(err); }
});

// DELETE /projects/:id/files/:fileId
router.delete('/:id/files/:fileId', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await prisma.projectFile.delete({ where: { id: req.params.fileId } });
    res.json({ success: true });
  } catch (err) { next(err); }
});

export default router;