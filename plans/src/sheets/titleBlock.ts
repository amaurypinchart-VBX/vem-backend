// Cartouche pré-rempli depuis le projet VEM (client, adresse, intervenants, dates) — modifiable ensuite.
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

export function titleBlockFromProject(project: Project | null, me: VemUser | null, today = new Date()): TitleBlockData {
  const t = emptyTitleBlock();
  if (project) {
    t.client = project.client?.name ?? '';
    t.address = [project.address, project.city].filter(Boolean).join(', ');
    t.projectName = project.name ?? '';
    t.projectNumber = project.internalNumber ?? '';
    t.projectDate = fmtDate(project.installationStart);
    t.technicalManager = person(project.technicalManager);
    const byRole = (role: string) => project.team?.find((m) => m.role === role || m.user?.role === role)?.user;
    t.salesEngineer = person(byRole('sales_engineer'));
    t.projectManager = person(byRole('project_manager'));
  }
  t.drawnBy = fullName(me);
  t.createdDate = fmtDate(today);
  return t;
}
