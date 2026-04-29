// src/middleware/errorHandler.ts
import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/AppError';
import { logger } from '../utils/logger';

export const errorHandler = (err: any, req: Request, res: Response, _next: NextFunction) => {
  logger.error(`${req.method} ${req.url} — ${err.message}`);
  const status = err.statusCode || 500;
  const msg = err instanceof AppError ? err.message : 'Erreur interne serveur';
  // Prisma unique constraint
  if (err.code === 'P2002') return res.status(409).json({ success: false, error: 'Valeur déjà existante' });
  if (err.code === 'P2025') return res.status(404).json({ success: false, error: 'Enregistrement introuvable' });
  res.status(status).json({ success: false, error: msg });
};
