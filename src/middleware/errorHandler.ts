// src/middleware/errorHandler.ts
import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/AppError';
import { logger } from '../utils/logger';

export const errorHandler = (err: any, req: Request, res: Response, _next: NextFunction) => {
  // Log complet côté serveur (avec stack)
  logger.error(`${req.method} ${req.url} — ${err.message || err}`);
  if (err.stack) logger.error(err.stack);

  // Erreurs Prisma classiques
  if (err.code === 'P2002') return res.status(409).json({ success: false, error: 'Valeur déjà existante (contrainte unique)' });
  if (err.code === 'P2025') return res.status(404).json({ success: false, error: 'Enregistrement introuvable' });

  // AppError = message explicite contrôlé
  const status = err.statusCode || 500;

  // On renvoie le vrai message d'erreur au front pour le debug (ce qui aide
  // l'utilisateur à voir si c'est par ex. un SMTP non configuré, une clé API
  // manquante, etc.). En prod hardcore on cacherait — mais ici l'opérateur
  // est l'utilisateur final.
  const msg = err.message || (err instanceof AppError ? err.message : 'Erreur interne serveur');
  res.status(status).json({ success: false, error: msg });
};