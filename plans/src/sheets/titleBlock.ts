// Cartouche pré-rempli depuis le projet VEM (client, adresse, intervenants, dates) — modifiable ensuite, et
// remis à jour depuis le projet : à l'ouverture d'un jeu (champs changés dans VEM depuis la dernière reprise) ou
// à la demande (« ↻ Reprendre du projet »).
import type { Project, VemUser } from '../api/vem';
import type { Person, TitleBlockData } from './types';
import { emptyTitleBlock } from './types';

const fullName = (u?: VemUser | null) => [u?.firstName, u?.lastName].filter(Boolean).join(' ').trim();
const person = (u?: VemUser | null): Person => ({ name: fullName(u), email: u?.email ?? '' });

export function fmtDate(d: string | Date | undefined | null): string {
  if (!d) return '';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(date.getDate())} / ${p(date.getMonth() + 1)} / ${date.getFullYear()}`;
}

/** Champs du cartouche qui viennent du projet VEM (les autres sont propres au jeu de plans). */
export const PROJECT_FIELDS = ['client', 'address', 'projectName', 'projectNumber', 'projectDate', 'salesEngineer', 'technicalManager', 'projectManager'] as const;
export type ProjectField = (typeof PROJECT_FIELDS)[number];
export type ProjectValues = Pick<TitleBlockData, ProjectField>;

export const PROJECT_FIELD_LABELS: Record<ProjectField, string> = {
  client: 'Client',
  address: 'Adresse d’installation',
  projectName: 'Nom du projet',
  projectNumber: 'N° de projet',
  projectDate: 'Date du projet',
  salesEngineer: 'Sales engineer',
  technicalManager: 'Technical manager',
  projectManager: 'Project manager',
};

/**
 * Intervenant d'un rôle dans l'équipe du projet : rôle sur le projet d'abord (le responsable « lead » en premier),
 * sinon rôle de la personne dans VEM.
 */
function memberWithRole(project: Project, role: string): VemUser | undefined {
  const team = (project.team ?? []).filter((m) => m.user);
  const byLead = (a: { isLead?: boolean }, b: { isLead?: boolean }) => Number(!!b.isLead) - Number(!!a.isLead);
  return (team.filter((m) => m.role === role).sort(byLead)[0] ?? team.filter((m) => m.user?.role === role).sort(byLead)[0])?.user;
}

export function projectValues(project: Project): ProjectValues {
  return {
    client: project.client?.name ?? '',
    address: [project.address, project.city].filter(Boolean).join(', '),
    projectName: project.name ?? '',
    projectNumber: project.internalNumber ?? '',
    projectDate: fmtDate(project.installationStart),
    salesEngineer: person(memberWithRole(project, 'sales_engineer')),
    // technical manager de la fiche projet, sinon celui de l'équipe
    technicalManager: person(project.technicalManager ?? memberWithRole(project, 'technical_manager')),
    projectManager: person(memberWithRole(project, 'project_manager')),
  };
}

export function titleBlockFromProject(project: Project | null, me: VemUser | null, today = new Date()): TitleBlockData {
  const t = emptyTitleBlock();
  if (project) Object.assign(t, projectValues(project));
  t.drawnBy = fullName(me);
  t.createdDate = fmtDate(today);
  return t;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Champs à mettre à jour : différents du projet, et changés dans le projet depuis la dernière reprise (`synced`).
 * Sans reprise connue (jeu ancien), tout champ différent du projet est proposé. Un champ modifié à la main alors
 * que le projet n'a pas bougé n'est pas proposé.
 */
export function projectChanges(tb: TitleBlockData, fresh: ProjectValues, synced?: Partial<ProjectValues>): ProjectField[] {
  return PROJECT_FIELDS.filter((f) => !same(tb[f], fresh[f]) && (!synced || !(f in synced) || !same(synced[f], fresh[f])));
}
