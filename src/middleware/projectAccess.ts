// src/middleware/projectAccess.ts
// Accès par projet : les rôles de PROJECT_SCOPED_ROLES ne voient que les projets où ils sont affectés
// (membre de l'équipe du projet ou technical manager du projet). Les autres rôles voient tous les projets.
// Appliqué à toutes les routes qui lisent ou modifient des données d'un projet :
// - listes : filtre `projectScopeWhere` (projets) / `projectIdFilter` (données rattachées à un projet) ;
// - routes avec un id dans l'URL : `router.param(..., projectParamGuard(lookup))` (lookup = id → projectId) ;
// - créations avec un projectId dans le corps : `assertProjectAccess`.
import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { AuthRequest } from './auth';
import { AppError } from '../utils/AppError';

export const PROJECT_SCOPED_ROLES = ['installer', 'site_manager', 'worker'];

type AuthUser = NonNullable<AuthRequest['user']>;

export const isProjectScoped = (user: { role: string } | undefined): boolean =>
  !!user && PROJECT_SCOPED_ROLES.includes(user.role);

/** Condition Prisma sur Project : projets où l'utilisateur est dans l'équipe ou technical manager. */
const assignedWhere = (userId: string) => ({
  OR: [{ technicalManagerId: userId }, { team: { some: { userId } } }],
});

/** Filtre Prisma à ajouter sur Project (AND) : {} pour les rôles non limités. */
export function projectScopeWhere(user: { id: string; role: string } | undefined): Record<string, unknown> {
  return isProjectScoped(user) ? assignedWhere(user!.id) : {};
}

/** Projets accessibles : null = tous (rôle non limité). */
export async function accessibleProjectIds(user: { id: string; role: string } | undefined): Promise<string[] | null> {
  if (!isProjectScoped(user)) return null;
  const rows = await prisma.project.findMany({ where: assignedWhere(user!.id), select: { id: true } });
  return rows.map((r) => r.id);
}

export async function canAccessProject(user: { id: string; role: string }, projectId: string): Promise<boolean> {
  if (!isProjectScoped(user)) return true;
  const project = await prisma.project.findFirst({
    where: { id: projectId, ...assignedWhere(user.id) },
    select: { id: true },
  });
  return !!project;
}

export async function assertProjectAccess(user: AuthUser | undefined, projectId: string): Promise<void> {
  if (!user) throw new AppError('Non autorisé', 401);
  if (!(await canAccessProject(user, projectId)))
    throw new AppError('Accès refusé : tu n’es pas affecté à ce projet.', 403);
}

/**
 * Filtre `projectId` pour une liste de données rattachées à un projet (tâches, rapports…).
 * - projet demandé : vérifie l'accès et le renvoie ;
 * - aucun projet demandé : undefined (pas de filtre) pour les rôles non limités, sinon { in: projets accessibles }.
 */
export async function projectIdFilter(
  user: AuthUser | undefined,
  requested?: unknown,
): Promise<string | { in: string[] } | undefined> {
  if (requested) {
    await assertProjectAccess(user, String(requested));
    return String(requested);
  }
  const ids = await accessibleProjectIds(user);
  return ids === null ? undefined : { in: ids };
}

/** Middleware : vérifie l'accès au projet dont l'id est dans req.params[param]. */
export const requireProjectAccess = (param = 'projectId') =>
  async (req: AuthRequest, _res: Response, next: NextFunction) => {
    try {
      await assertProjectAccess(req.user, String(req.params[param]));
      next();
    } catch (err) { next(err); }
  };

/**
 * Pour router.param : `lookup` retrouve le projet de l'élément dont l'id est dans l'URL.
 * Élément introuvable (ou sans projet) : on laisse passer, la route répond 404 elle-même.
 * Les rôles non limités ne déclenchent aucune requête.
 */
export const projectParamGuard = (lookup: (value: string) => Promise<string | null | undefined>) =>
  async (req: Request, _res: Response, next: NextFunction, value: string) => {
    try {
      const user = (req as AuthRequest).user;
      if (isProjectScoped(user)) {
        const projectId = await lookup(String(value)).catch(() => null);
        if (projectId) await assertProjectAccess(user, projectId);
      }
      next();
    } catch (err) { next(err); }
  };

/** Raccourci pour router.param sur un paramètre qui est directement l'id du projet. */
export const projectIdParamGuard = projectParamGuard(async (id) => id);
