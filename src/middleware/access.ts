// src/middleware/access.ts
// Qui a le droit de voir / modifier quoi — LE SEUL endroit où les rôles sont traduits en droits.
//
//   admin, technical_manager  : tout, tous les projets + Plans 2D (Plans Viewbox, Étude structure, Loading)
//   project_manager, engineer : tous les projets ; Plans 2D seulement si activé sur la fiche de la personne
//   sales_engineer, warehouse : tous les projets, jamais les Plans 2D
//   site_manager              : seulement ses projets (équipe ou technical manager du projet), lecture + écriture
//   installer, worker         : seulement leurs projets, tout voir, rien ajouter / modifier — sauf les droits
//                               donnés personne par personne (colonne users.access_grants : daily_reports,
//                               handover, checklists)
//   client                    : seulement son projet (il doit être ajouté à l'équipe du projet) et seulement
//                               le handover (lecture + PDF). Rien d'autre tant qu'on ne l'ouvre pas ici.
//   rôle inconnu              : traité comme installer (lecture seule de ses projets)
import { prisma } from '../config/database';

export const ALL_PROJECTS_ROLES = ['admin', 'technical_manager', 'project_manager', 'engineer', 'sales_engineer', 'warehouse'];
/** Rôles qui gèrent les personnes (fiches complètes : n° de carte d'identité, n° national…). */
export const PEOPLE_MANAGER_ROLES = ['admin', 'technical_manager', 'project_manager'];
/** Plans 2D : toujours pour ces rôles… */
export const PLANS_ALWAYS_ROLES = ['admin', 'technical_manager'];
/** …et pour ces rôles seulement si l'accès est activé sur la fiche (users.plans_access). */
export const PLANS_OPTIONAL_ROLES = ['project_manager', 'engineer'];

/** Droits d'écriture qu'on peut donner à un installateur / ouvrier. */
export const GRANTS = ['daily_reports', 'handover', 'checklists'] as const;
export type Grant = typeof GRANTS[number];

export type Scope = 'all' | 'team' | 'client';

export interface Access {
  role: string;
  /** all = tous les projets ; team = ses projets ; client = son projet, handover seulement */
  scope: Scope;
  /** peut créer / modifier dans ses projets (site manager, et les rôles « all ») */
  write: boolean;
  grants: Grant[];
  plans: boolean;
}

export function accessFor(role: string, plansFlag: boolean, grants: string[] = []): Access {
  const clean = grants.filter((g): g is Grant => (GRANTS as readonly string[]).includes(g));
  if (ALL_PROJECTS_ROLES.includes(role)) {
    const plans = PLANS_ALWAYS_ROLES.includes(role) || (PLANS_OPTIONAL_ROLES.includes(role) && plansFlag);
    return { role, scope: 'all', write: true, grants: [...GRANTS], plans };
  }
  if (role === 'client') return { role, scope: 'client', write: false, grants: [], plans: false };
  if (role === 'site_manager') return { role, scope: 'team', write: true, grants: [...GRANTS], plans: false };
  // installer, worker et tout rôle inconnu : lecture seule + droits donnés
  return { role, scope: 'team', write: false, grants: clean, plans: false };
}

/** Peut écrire dans un domaine (daily_reports / handover / checklists) d'un projet accessible ? */
export function canWrite(a: Access, grant?: Grant): boolean {
  if (a.write) return true;
  return !!grant && a.grants.includes(grant);
}

export interface UserRow { role: string; isActive: boolean; plansAccess: boolean; grants: string[] }

/** Rôle, statut, accès Plans et droits donnés, lus en base (un changement prend effet tout de suite). */
export async function loadUserRow(userId: string): Promise<UserRow | null> {
  try {
    const rows = await prisma.$queryRaw<Array<{ role: string; is_active: boolean; plans_access: boolean; access_grants: string[] | null }>>`
      SELECT role::text AS role, is_active, plans_access, access_grants FROM users WHERE id = ${userId} LIMIT 1
    `;
    const r = rows[0];
    return r ? { role: r.role, isActive: r.is_active, plansAccess: r.plans_access === true, grants: r.access_grants || [] } : null;
  } catch {
    // colonne access_grants pas encore créée (premières secondes après un déploiement)
    const rows = await prisma.$queryRaw<Array<{ role: string; is_active: boolean }>>`
      SELECT role::text AS role, is_active FROM users WHERE id = ${userId} LIMIT 1
    `;
    const r = rows[0];
    return r ? { role: r.role, isActive: r.is_active, plansAccess: false, grants: [] } : null;
  }
}

/** Rôles limités dans le temps (VEM Chantier) : installateur, ouvrier et rôle inconnu — pas le site manager ni le client. */
export function timeLimitedRole(role: string | undefined | null): boolean {
  if (!role) return false;
  return !ALL_PROJECTS_ROLES.includes(role) && role !== 'site_manager' && role !== 'client';
}

/** Jours d'accès par défaut avant l'installation / après le démontage (app_settings « chantier.access », 14 / 14). */
export const SITE_DAYS_DEFAULT = { before: 14, after: 14 };
let siteDaysCache: { at: number; v: { before: number; after: number } } | null = null;
export async function siteAccessDays(): Promise<{ before: number; after: number }> {
  if (siteDaysCache && Date.now() - siteDaysCache.at < 60_000) return siteDaysCache.v;
  let v = { ...SITE_DAYS_DEFAULT };
  try {
    const rows = await prisma.$queryRaw<Array<{ value: any }>>`SELECT value FROM app_settings WHERE key = 'chantier.access' LIMIT 1`;
    const raw = rows[0]?.value;
    const b = Number(raw?.before), a = Number(raw?.after);
    if (Number.isFinite(b) && b >= 0 && b <= 365) v.before = Math.round(b);
    if (Number.isFinite(a) && a >= 0 && a <= 365) v.after = Math.round(a);
  } catch { /* table / clé absente : valeurs par défaut */ }
  siteDaysCache = { at: Date.now(), v };
  return v;
}
export function clearSiteDaysCache() { siteDaysCache = null; }

/**
 * Ids des projets d'une personne (membre de l'équipe ou technical manager du projet).
 * Installateur / ouvrier (`role` donné et limité dans le temps) : seulement pendant la période du chantier — de
 * N jours avant le début de l'installation à N jours après la fin du démontage (fin d'installation sans démontage),
 * dates de Bruxelles —, ou jusqu'à la date « accès prolongé » de sa ligne d'équipe.
 */
export async function projectIdsOf(userId: string, scope: Scope, role?: string): Promise<string[]> {
  if (scope === 'team' && timeLimitedRole(role)) {
    try {
      const d = await siteAccessDays();
      const rows = await prisma.$queryRaw<Array<{ id: string }>>`
        SELECT p.id FROM projects p
        WHERE p.technical_manager_id = ${userId}
           OR EXISTS (
             SELECT 1 FROM project_team t
             WHERE t.project_id = p.id AND t.user_id = ${userId} AND (
               (t.access_until IS NOT NULL AND t.access_until >= NOW())
               OR (
                 (NOW() AT TIME ZONE 'Europe/Brussels')::date >= p.installation_start::date - COALESCE(p.site_days_before, ${d.before})::int
                 AND (NOW() AT TIME ZONE 'Europe/Brussels')::date <= COALESCE(p.dismantling_end, p.dismantling_start, p.installation_end)::date + COALESCE(p.site_days_after, ${d.after})::int
               )
             )
           )
      `;
      return rows.map((r) => r.id);
    } catch { /* colonnes pas encore créées (premières secondes après un déploiement) : règle sans période */ }
  }
  const rows = await prisma.project.findMany({
    where: scope === 'client'
      ? { team: { some: { userId } } }
      : { OR: [{ technicalManagerId: userId }, { team: { some: { userId } } }] },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}
