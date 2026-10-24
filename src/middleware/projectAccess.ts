// src/middleware/projectAccess.ts
// Accès par projet : voir src/middleware/access.ts (site manager, installateur, ouvrier, client = seulement
// leurs projets ; les autres rôles voient tous les projets).
import { Response, NextFunction } from 'express';
import { AuthRequest, projectIds } from './auth';
import { AppError } from '../utils/AppError';

export async function canAccessProject(req: AuthRequest, projectId: string): Promise<boolean> {
  const ids = await projectIds(req);
  return ids === null || ids.includes(projectId);
}

export async function assertProjectAccess(req: AuthRequest, projectId: string | null | undefined): Promise<void> {
  if (!req.user) throw new AppError('Non autorisé', 401);
  if (!projectId || !(await canAccessProject(req, String(projectId))))
    throw new AppError('Accès refusé : tu n’es pas affecté à ce projet.', 403);
}

/** Middleware : vérifie l'accès au projet dont l'id est dans req.params[param]. */
export const requireProjectAccess = (param = 'projectId') =>
  async (req: AuthRequest, _res: Response, next: NextFunction) => {
    try {
      await assertProjectAccess(req, String(req.params[param]));
      next();
    } catch (err) { next(err); }
  };
