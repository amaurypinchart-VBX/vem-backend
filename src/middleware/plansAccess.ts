// src/middleware/plansAccess.ts
// Accès aux outils Plans 2D (Plans Viewbox /plans/, Étude structure, Loading liste, Plan 2D Studio) :
// toujours pour admin et technical manager ; pour project manager et engineer seulement si activé sur la fiche
// (colonne users.plans_access) ; jamais pour les autres rôles (sales, site manager, installateur, client…).
// Lu en base à chaque requête : un accès activé ou retiré prend effet tout de suite, sans reconnexion.
import { Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { AuthRequest } from './auth';
import { AppError } from '../utils/AppError';
import { accessFor, loadUserRow, PLANS_ALWAYS_ROLES, PLANS_OPTIONAL_ROLES } from './access';

export async function hasPlansAccess(userId: string): Promise<boolean> {
  try {
    const row = await loadUserRow(userId);
    return !!row && row.isActive && accessFor(row.role, row.plansAccess, row.grants).plans;
  } catch {
    return false;
  }
}

/** Ids des utilisateurs qui ont l'accès (pour la liste de l'équipe). */
export async function plansAccessUserIds(): Promise<Set<string>> {
  try {
    const rows = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM users
      WHERE role::text = ANY(${PLANS_ALWAYS_ROLES})
         OR (plans_access = true AND role::text = ANY(${PLANS_OPTIONAL_ROLES}))
    `;
    return new Set(rows.map((r) => r.id));
  } catch {
    return new Set();
  }
}

export const requirePlansAccess = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.access?.plans)
      throw new AppError('Accès aux Plans 2D non activé pour ton compte. Demande à un responsable de l’activer (Équipe › fiche du membre).', 403);
    next();
  } catch (err) { next(err); }
};
