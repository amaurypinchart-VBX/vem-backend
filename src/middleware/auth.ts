// src/middleware/auth.ts
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AppError } from '../utils/AppError';

export interface AuthRequest extends Request {
  user?: { id: string; email: string; role: string; firstName: string; lastName: string };
}

export const authMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) throw new AppError('Token manquant', 401);
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'vem-secret-change-me') as any;
    req.user = decoded;
    next();
  } catch {
    next(new AppError('Non autorisé', 401));
  }
};

export const requireRole = (...roles: string[]) =>
  (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role))
      return next(new AppError('Permission insuffisante', 403));
    next();
  };
