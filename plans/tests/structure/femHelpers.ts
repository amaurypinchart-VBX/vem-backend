// Aides pour construire de petits modèles de test du solveur (unités N, mm).
import type { EndSpec, FemMember, FemModel, FemSupport, LoadSet, SupportDof, Vec6 } from '../../src/structure/core/fem/types';

export const E = 210000;
export const G = 80769.23;

/** Section de test (valeurs d'un QHP 100×5 : A, Iy, Iz, It en mm², mm⁴). */
export const SEC = { A: 1880, Iy: 2.81e6, Iz: 2.81e6, It: 4.33e6 };
/** Section non symétrique (valeurs d'un UNP 220). */
export const UNP = { A: 3740, Iy: 26.9e6, Iz: 1.97e6, It: 0.162e6 };

export class ModelBuilder {
  readonly model: FemModel = { nodes: [], members: [], supports: [] };
  node(id: string, x: number, y: number, z: number): number {
    this.model.nodes.push({ id, x, y, z });
    return this.model.nodes.length - 1;
  }
  member(id: string, i: number, j: number, extra: Partial<FemMember> = {}, sec = SEC): number {
    this.model.members.push({ id, i, j, E, G, ...sec, ...extra });
    return this.model.members.length - 1;
  }
  support(node: number, dofs: SupportDof[] | 'fixed' | 'pinned', extra: Partial<FemSupport> = {}): void {
    const d: SupportDof[] = dofs === 'fixed' ? Array(6).fill('fixed') : dofs === 'pinned' ? ['fixed', 'fixed', 'fixed', 'free', 'free', 'free'] : dofs;
    this.model.supports.push({ node, dofs: d as FemSupport['dofs'], ...extra });
  }
}

export const load = (id: string, parts: Partial<LoadSet> = {}): LoadSet => ({ id, nodal: [], member: [], ...parts });
export const force = (node: number, f: Partial<Record<'fx' | 'fy' | 'fz' | 'mx' | 'my' | 'mz', number>>) => ({
  node,
  f: [f.fx ?? 0, f.fy ?? 0, f.fz ?? 0, f.mx ?? 0, f.my ?? 0, f.mz ?? 0] as Vec6,
});
export const end = (...spec: EndSpec): EndSpec => spec;

export const rel = (a: number, b: number) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-12);
