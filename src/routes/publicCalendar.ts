import { Router } from 'express';
import { prisma } from '../config/database';

const router = Router();

// GET /api/v1/public/calendar
// Route PUBLIQUE (pas d'authMiddleware) — destinée à un écran d'entrepôt.
// Renvoie les projets actifs qui chevauchent la fenêtre [aujourd'hui, +2 mois].
router.get('/calendar', async (_req, res, next) => {
  try {
    const now = new Date();
    const windowStart = new Date(now); windowStart.setHours(0, 0, 0, 0);
    const windowEnd = new Date(windowStart);
    windowEnd.setDate(windowEnd.getDate() + 60); // ~2 mois

    const projects = await prisma.project.findMany({
      where: {
        status: { notIn: ['cancelled'] },
        // Le projet démarre avant la fin de fenêtre
        installationStart: { lte: windowEnd },
        // ET se termine après le début de fenêtre (fin = démontage si présent, sinon installation)
        OR: [
          { dismantlingEnd: { gte: windowStart } },
          { dismantlingEnd: null, installationEnd: { gte: windowStart } },
        ],
      },
      select: {
        id: true,
        internalNumber: true,
        name: true,
        status: true,
        city: true,
        installationStart: true,
        installationEnd: true,
        dismantlingStart: true,
        dismantlingEnd: true,
        client: { select: { name: true } },
        trucks: {
          select: {
            id: true,
            truckNumber: true,
            licensePlate: true,
            loadingDate: true,
            departureDate: true,
            arrivalDate: true,
          },
        },
      },
      orderBy: { installationStart: 'asc' },
    });

    const data = projects.map((p) => ({
      id: p.id,
      internalNumber: p.internalNumber,
      name: p.name,
      status: p.status,
      city: p.city,
      clientName: p.client?.name || '',
      installationStart: p.installationStart,
      installationEnd: p.installationEnd,
      dismantlingStart: p.dismantlingStart,
      dismantlingEnd: p.dismantlingEnd,
      trucks: (p.trucks || []).map((t) => ({
        id: t.id,
        label: t.truckNumber || t.licensePlate || 'Camion',
        date: t.loadingDate || t.departureDate || t.arrivalDate,
      })),
    }));

    // Pas de cache navigateur/CDN : la page se rafraîchit d'elle-même
    res.setHeader('Cache-Control', 'no-store');
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

export default router;