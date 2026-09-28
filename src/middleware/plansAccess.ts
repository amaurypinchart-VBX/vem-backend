// src/middleware/plansAccess.ts
// Accès aux outils Plans 2D (Plans Viewbox /plans/ et Plan 2D Studio), activé personne par personne
// (colonne users.plans_access, voir runStartupMigrations). Lu en base à chaque requête : un accès
// activé ou retiré prend effet tout de suite, sans reconnexion.
import { Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { AuthRequest } from './auth';
import { AppError } from '../utils/AppError';

export async function hasPlansAccess(userId: string): Promise<boolean> {
  try {
    const rows = await prisma.$queryRaw<Array<{ plans_access: boolean }>>`
      SELECT plans_access FROM users WHERE id = ${userId} LIMIT 1
    `;
    return rows[0]?.plans_access === true;
  } catch {
    // colonne pas encore créée (quelques secondes au démarrage) : accès refusé
    return false;
  }
}

/** Ids des utilisateurs qui ont l'accès (pour la liste de l'équipe). */
export async function plansAccessUserIds(): Promise<Set<string>> {
  try {
    const rows = await prisma.$queryRaw<Array<{ id: string }>>`SELECT id FROM users WHERE plans_access = true`;
    return new Set(rows.map((r) => r.id));
  } catch {
    return new Set();
  }
}

export const requirePlansAccess = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user || !(await hasPlansAccess(req.user.id)))
      throw new AppError('Accès aux Plans 2D non activé pour ton compte. Demande à un responsable de l’activer (Équipe › fiche du membre).', 403);
    next();
  } catch (err) { next(err); }
};
