// Structure dessinée relevée par l'extension SketchUp (≥ 1.3.0, « source A ») ramenée dans le repère du gabarit d'un
// module (u grand côté, v petit côté, z vers le haut, origine au coin bas de la boîte du module, pieds exclus) — le même
// repère que les maillages de `moduleStructureMesh`. Chaîne : définition du module (mm, Z vers le haut) → monde SketchUp
// (transformation de l'instance) → monde VEM (Y vers le haut : (x, y, z) → (x, z, −y)) → gabarit (`ModuleFrame`).
// Chaque barre redevient un solide extrudé de sa coupe exacte, pour passer par le même relevé (`extractFrame`).
// Fonctions pures.
import type { ManifestStructure } from '../../core/manifest';
import type { ModuleFrame } from '../../core/views';
import type { FrameRole } from '../core/library';
import { FRAME_ROLES } from '../core/library';
import type { RawMember } from '../core/frameExtract';
import type { V3 } from '../core/sectionDetect';
import { extrude } from '../core/sectionDetect';

const dot = (a: readonly number[], b: readonly number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Point / vecteur de la définition du module → repère du gabarit. */
export function definitionToTemplate(transform: readonly number[], f: ModuleFrame): { point: (p: readonly number[]) => V3; vector: (v: readonly number[]) => V3 } {
  const T = transform;
  const lin = (p: readonly number[]): V3 => [T[0] * p[0] + T[4] * p[1] + T[8] * p[2], T[1] * p[0] + T[5] * p[1] + T[9] * p[2], T[2] * p[0] + T[6] * p[1] + T[10] * p[2]];
  const yUp = (w: V3): V3 => [w[0], w[2], -w[1]];
  const origin: V3 = [0, 1, 2].map((k) => f.origin[k] + f.xAxis[k] * f.min[0] + f.yAxis[k] * f.min[1] + f.up[k] * f.min[2]) as V3;
  const [u, v] = f.longAxis === 'x' ? [f.xAxis, f.yAxis] : [f.yAxis, f.xAxis];
  const proj = (d: readonly number[]): V3 => [dot(d, u), dot(d, v), dot(d, f.up)];
  return {
    point: (p) => {
      const w = lin(p);
      const y = yUp([w[0] + T[12], w[1] + T[13], w[2] + T[14]]);
      return proj([y[0] - origin[0], y[1] - origin[1], y[2] - origin[2]]);
    },
    vector: (d) => proj(yUp(lin(d))),
  };
}

/** Barres de la structure dessinée → solides dans le repère du gabarit (rôle / section / nuance saisis gardés). */
export function drawnMembers(s: ManifestStructure, transform: readonly number[], f: ModuleFrame): RawMember[] {
  const map = definitionToTemplate(transform, f);
  const out: RawMember[] = [];
  for (const m of s.members) {
    const a = map.point(m.a);
    const b = map.point(m.b);
    const d: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const L = Math.hypot(...d);
    if (L < 1) continue;
    const dir = d.map((x) => x / L) as V3;
    // axes de la coupe : yRef et axe × yRef, calculés dans la définition puis transportés (un miroir reste juste)
    const ax = [m.b[0] - m.a[0], m.b[1] - m.a[1], m.b[2] - m.a[2]];
    const al = Math.hypot(ax[0], ax[1], ax[2]) || 1;
    const n = ax.map((x) => x / al);
    const yr = m.yRef;
    const zr = [n[1] * yr[2] - n[2] * yr[1], n[2] * yr[0] - n[0] * yr[2], n[0] * yr[1] - n[1] * yr[0]];
    const y = map.vector(yr);
    const z = map.vector(zr);
    const role = m.roleSource === 'manuel' && (FRAME_ROLES as readonly string[]).includes(m.role ?? '') ? (m.role as FrameRole) : undefined;
    out.push({
      id: m.id,
      name: m.name,
      definition: m.definition,
      ...(role ? { roleHint: role } : {}),
      ...(m.section ? { sectionHint: m.section } : {}),
      ...(m.grade ? { gradeHint: m.grade } : {}),
      solid: true,
      triangles: extrude(m.loops, a, dir, y, z, L),
    });
  }
  return out;
}
