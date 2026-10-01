// src/middleware/projectAccess.ts
// Accès par projet : les rôles de PROJECT_SCOPED_ROLES ne voient que les projets où ils sont affectés
// (membre de l'équipe du projet ou technical manager du projet). Les autres rôles voient tous les projets.
// Utilisé pour l'instant par la check-list de montage (src/routes/checklists.ts).
import { Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { AuthRequest } from './auth';
import { AppError } from '../utils/AppError';

export const PROJECT_SCOPED_ROLES = ['installer', 'site_manager'];

type AuthUser = NonNullable<AuthRequest['user']>;

export async function canAccessProject(user: AuthUser, projectId: string): Promise<boolean> {
  if (!PROJECT_SCOPED_ROLES.includes(user.role)) return true;
  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      OR: [{ technicalManagerId: user.id }, { team: { some: { userId: user.id } } }],
    },
    select: { id: true },
  });
  return !!project;
}

export async function assertProjectAccess(user: AuthUser | undefined, projectId: string): Promise<void> {
  if (!user) throw new AppError('Non autorisé', 401);
  if (!(await canAccessProject(user, projectId)))
    throw new AppError('Accès refusé : tu n’es pas affecté à ce projet.', 403);
}

/** Middleware : vérifie l'accès au projet dont l'id est dans req.params[param]. */
export const requireProjectAccess = (param = 'projectId') =>
  async (req: AuthRequest, _res: Response, next: NextFunction) => {
    try {
      await assertProjectAccess(req.user, String(req.params[param]));
      next();
    } catch (err) { next(err); }
  };
