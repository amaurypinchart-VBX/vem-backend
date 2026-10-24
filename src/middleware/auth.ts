// src/middleware/auth.ts
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AppError } from '../utils/AppError';
import { Access, accessFor, loadUserRow, projectIdsOf } from './access';
import { JWT_SECRET } from '../utils/secrets';

export interface AuthRequest extends Request {
  user?: { id: string; email: string; role: string; firstName: string; lastName: string };
  /** Droits de la personne connectée (rôle relu en base à chaque requête). */
  access?: Access;
  /** Projets accessibles (rempli par projectIds(), seulement pour les accès limités). */
  scopeProjectIds?: string[];
}

export const authMiddleware = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) throw new AppError('Token manquant', 401);
    let decoded: any;
    try {
      decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    } catch { throw new AppError('Non autorisé', 401); }
    if (!decoded?.id) throw new AppError('Non autorisé', 401);
    // Le rôle et le statut sont relus en base : un compte désactivé ou un rôle changé prend effet tout de suite
    // (le jeton garde l'ancien rôle jusqu'à 8 h).
    const row = await loadUserRow(String(decoded.id));
    if (!row || !row.isActive) throw new AppError('Non autorisé', 401);
    req.user = { id: decoded.id, email: decoded.email, role: row.role, firstName: decoded.firstName, lastName: decoded.lastName };
    req.access = accessFor(row.role, row.plansAccess, row.grants);
    next();
  } catch (err) {
    next(err instanceof AppError ? err : new AppError('Non autorisé', 401));
  }
};

export const requireRole = (...roles: string[]) =>
  (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role))
      return next(new AppError('Permission insuffisante', 403));
    next();
  };

/** Projets accessibles : null = tous ; sinon la liste des ids (mise en cache sur la requête). */
export async function projectIds(req: AuthRequest): Promise<string[] | null> {
  const a = req.access;
  if (!a || !req.user) throw new AppError('Non autorisé', 401);
  if (a.scope === 'all') return null;
  if (!req.scopeProjectIds) req.scopeProjectIds = await projectIdsOf(req.user.id, a.scope);
  return req.scopeProjectIds;
}

/** Filtre Prisma à ajouter aux listes : {} pour un accès complet, sinon { projectId: { in: [...] } }. */
export async function projectWhere(req: AuthRequest, field = 'projectId'): Promise<Record<string, any>> {
  const ids = await projectIds(req);
  return ids === null ? {} : { [field]: { in: ids } };
}
