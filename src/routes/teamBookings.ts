// src/routes/teamBookings.ts
// Gestion des bookings transport + hôtel pour chaque membre d'équipe sur un projet.
// Un booking représente une "phase" (installation OU démontage) pour un membre :
//   - dates de présence sur site
//   - moyen de transport aller + détails (n° de vol, etc.)
//   - moyen de transport retour
//   - hôtel et dates de séjour
import { Router, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../utils/AppError';

const router = Router();

// Désactiver le cache HTTP pour ce module — les bookings changent souvent.
router.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  next();
});

// GET /projects/:projectId/bookings — tous les bookings d'un projet
router.get('/projects/:projectId/bookings', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const bookings = await (prisma as any).teamBooking.findMany({
      where: { projectId: req.params.projectId },
      include: { user: { select: { id: true, firstName: true, lastName: true, role: true, avatarUrl: true } } },
      orderBy: [{ onSiteStart: 'asc' }],
    });
    res.json({ success: true, data: bookings });
  } catch (err) { next(err); }
});

// POST /projects/:projectId/bookings — créer un booking
router.post('/projects/:projectId/bookings', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const body = req.body || {};
    if (!body.userId) throw new AppError('userId est requis', 400);
    if (!body.phase || !['installation', 'dismantling'].includes(body.phase)) {
      throw new AppError('phase doit être "installation" ou "dismantling"', 400);
    }
    if (!body.onSiteStart || !body.onSiteEnd) throw new AppError('onSiteStart et onSiteEnd sont requis', 400);

    const booking = await (prisma as any).teamBooking.create({
      data: {
        projectId:       req.params.projectId,
        userId:          body.userId,
        phase:           body.phase,
        onSiteStart:     new Date(body.onSiteStart),
        onSiteEnd:       new Date(body.onSiteEnd),
        outboundMode:    body.outboundMode    || null,
        outboundDate:    body.outboundDate    ? new Date(body.outboundDate)    : null,
        outboundDetails: body.outboundDetails || null,
        returnMode:      body.returnMode      || null,
        returnDate:      body.returnDate      ? new Date(body.returnDate)      : null,
        returnDetails:   body.returnDetails   || null,
        hotelName:       body.hotelName       || null,
        hotelAddress:    body.hotelAddress    || null,
        hotelCheckin:    body.hotelCheckin    ? new Date(body.hotelCheckin)    : null,
        hotelCheckout:   body.hotelCheckout   ? new Date(body.hotelCheckout)   : null,
        hotelNotes:      body.hotelNotes      || null,
        notes:           body.notes           || null,
      },
      include: { user: { select: { id: true, firstName: true, lastName: true, role: true, avatarUrl: true } } },
    });
    res.status(201).json({ success: true, data: booking });
  } catch (err) { next(err); }
});

// PATCH /bookings/:id — modifier un booking (n'importe lequel)
router.patch('/bookings/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const body = req.body || {};
    const data: any = {};
    // Champs scalaires : on ne touche que ceux explicitement fournis
    for (const k of ['phase','outboundMode','outboundDetails','returnMode','returnDetails','hotelName','hotelAddress','hotelNotes','notes']) {
      if (body[k] !== undefined) data[k] = body[k] || null;
    }
    // Champs date : convertir en Date si fournis (null = effacement)
    for (const k of ['onSiteStart','onSiteEnd','outboundDate','returnDate','hotelCheckin','hotelCheckout']) {
      if (body[k] !== undefined) data[k] = body[k] ? new Date(body[k]) : null;
    }
    const booking = await (prisma as any).teamBooking.update({
      where: { id: req.params.id },
      data,
      include: { user: { select: { id: true, firstName: true, lastName: true, role: true, avatarUrl: true } } },
    });
    res.json({ success: true, data: booking });
  } catch (err) { next(err); }
});

// DELETE /bookings/:id
router.delete('/bookings/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await (prisma as any).teamBooking.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) { next(err); }
});

// GET /bookings/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD&role=installer|site_manager
// Renvoie tous les bookings dont la période on-site (élargie aux jours de trajet
// aller/retour) chevauche la plage demandée. Sert au dashboard équipes.
router.get('/bookings/calendar', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const from = req.query.from ? new Date(String(req.query.from)) : new Date();
    const to   = req.query.to   ? new Date(String(req.query.to))   : new Date(Date.now() + 90*86400000);
    const roleFilter = req.query.role ? String(req.query.role) : null;

    // On utilise la période la plus large possible :
    //   début = MIN(outboundDate, onSiteStart, hotelCheckin)
    //   fin   = MAX(returnDate,    onSiteEnd,  hotelCheckout)
    // Pour éviter de complexifier la requête, on fait un large prefetch sur on_site
    // puis on filtre en mémoire avec la période élargie.
    const raw = await (prisma as any).teamBooking.findMany({
      where: {
        OR: [
          { onSiteStart:  { lte: to }, onSiteEnd:    { gte: from } },
          { outboundDate: { lte: to,  gte: from } },
          { returnDate:   { lte: to,  gte: from } },
        ],
      },
      include: {
        user:    { select: { id: true, firstName: true, lastName: true, role: true, avatarUrl: true } },
        project: { select: { id: true, name: true, internalNumber: true, status: true } },
      },
      orderBy: [{ onSiteStart: 'asc' }],
    });

    const filtered = roleFilter ? raw.filter((b: any) => b.user.role === roleFilter) : raw;
    res.json({ success: true, data: filtered });
  } catch (err) { next(err); }
});

export default router;