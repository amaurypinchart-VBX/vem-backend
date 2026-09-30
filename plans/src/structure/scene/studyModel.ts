// Modèle SketchUp analysé → entrées du calcul complet : Viewbox placées (repère de chaque Viewbox, type de la
// reconnaissance → gabarit de la bibliothèque) et objets portés (murs, vitrages, portes, garde-corps, logos) en charges
// sur la rive du côté le plus proche ou au nœud le plus proche. Tout ce que le calcul ne sait pas encore modéliser
// (pièces porteuses hors gabarit : escaliers, terrasses, poutres…) est une erreur bloquante (verdict « incomplet »).
import type { LoadedScene } from '../../scene/loadedScene';
import type { PlacedModule } from '../core/assemble';
import { placeFromFrame } from '../core/assemble';
import type { Vec3 } from '../core/fem/types';
import type { LibraryEntry, ModuleTypeEntry, PartAssignment } from '../core/library';
import { NATURE_LABEL } from '../core/library';
import type { EdgeItem, PointItem } from '../core/loads';
import type { Recognition } from '../core/recognition';
import type { Side } from '../core/templates/viewboxEU';

export interface SceneStudyModel {
  modules: PlacedModule[];
  edgeItems: EdgeItem[];
  pointItems: PointItem[];
  errors: string[];
  warnings: string[];
}

const G = 9.81;
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export function studyModelFromScene(scene: LoadedScene, recognition: Recognition, library: readonly LibraryEntry[]): SceneStudyModel {
  const errors: string[] = [];
  const warnings: string[] = [];
  const modules: PlacedModule[] = [];
  const templates = new Map(library.filter((e): e is ModuleTypeEntry => e.kind === 'module_type' && !e.disabled).map((e) => [e.key, e]));
  // ─── Viewbox ───
  for (const t of recognition.types) {
    if (t.kind !== 'module') continue;
    const entry = t.assignment?.moduleTemplate ? templates.get(t.assignment.moduleTemplate) : undefined;
    if (t.status === 'unknown' || !entry) {
      errors.push(`${t.label} (${t.moduleIds.length} Viewbox) : ${t.reason}`);
      continue;
    }
    for (const id of t.moduleIds) {
      const f = scene.frames.get(id);
      const info = scene.index.modules.find((m) => m.id === id);
      if (!f || !info) {
        errors.push(`${id} : repère de la Viewbox introuvable`);
        continue;
      }
      const { module, reason } = placeFromFrame(f, info.level, entry);
      if (module) modules.push(module);
      else errors.push(reason!);
    }
  }
  // ─── objets ───
  const edgeItems: EdgeItem[] = [];
  const pointItems: PointItem[] = [];
  const unmodelled = new Map<string, number>();
  const windOnly = new Map<string, number>();
  for (const t of recognition.types) {
    if (t.kind !== 'item' || !t.assignment) {
      if (t.kind === 'item' && t.status === 'unknown') errors.push(`${t.label} : ${t.reason}`);
      continue;
    }
    const a = t.assignment;
    if (t.status === 'unknown') {
      errors.push(`${t.label} : ${t.reason}`);
      continue;
    }
    if (a.role === 'ignored') continue;
    // la Viewbox elle-même (composant classé d'un bloc) : calculée par le gabarit de sa Viewbox
    if (a.nature === 'viewbox') {
      if (!t.moduleIds.length) errors.push(`${t.label} : Viewbox hors des modules numérotés (VBX-xx) — la numéroter dans SketchUp (extension viewbox_prep)`);
      continue;
    }
    if (a.role === 'structural') {
      unmodelled.set(NATURE_LABEL[a.nature], (unmodelled.get(NATURE_LABEL[a.nature]) ?? 0) + t.nodeIds.length);
      continue;
    }
    if (a.role === 'wind') {
      windOnly.set(t.label, t.nodeIds.length);
      continue;
    }
    if (!a.weight) continue;
    for (const nodeId of t.nodeIds) {
      const n = scene.look.byId.get(nodeId);
      if (!n?.bboxMm) continue;
      placeItem(n.bboxMm, n.moduleId, a, `${t.label}`, modules, edgeItems, pointItems);
    }
  }
  for (const [nature, count] of unmodelled)
    errors.push(`${count} pièce(s) porteuse(s) « ${nature} » : pas encore modélisées dans le calcul complet (escaliers, terrasses, poutres ajoutées) — verdict incomplet`);
  for (const [label, count] of windOnly) warnings.push(`${label} (${count}) : surface au vent seule, pas encore appliquée au calcul (vent calculé sur les côtés des Viewbox)`);
  if (!modules.length && !errors.length) errors.push('Aucune Viewbox calculable dans le modèle.');
  return { modules, edgeItems, pointItems, errors, warnings };
}

function loadCaseOf(a: PartAssignment): EdgeItem['loadCase'] | 'G7' {
  if (a.nature === 'railing') return 'G5';
  if (a.nature === 'sign') return 'G7';
  return 'G3';
}

/** Objet → charge linéique sur la rive la plus proche (à ≤ 300 mm du côté) ou charge ponctuelle au nœud le plus proche. */
export function placeItem(b: readonly number[], moduleId: string | null, a: PartAssignment, label: string, modules: PlacedModule[], edge: EdgeItem[], point: PointItem[]) {
  const corners: Vec3[] = [];
  for (const x of [b[0], b[3]]) for (const y of [b[1], b[4]]) for (const z of [b[2], b[5]]) corners.push([x, y, z]);
  const c: Vec3 = [(b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2];
  const local = (pm: PlacedModule, p: Vec3) => {
    const d: Vec3 = [p[0] - pm.origin[0], p[1] - pm.origin[1], p[2] - pm.origin[2]];
    return { u: dot(d, pm.u), v: dot(d, pm.v), z: d[1] };
  };
  // Viewbox de l'objet (rattachement de l'analyse), sinon la plus proche de son centre
  let pm = moduleId ? modules.find((m) => m.id === moduleId) : undefined;
  if (!pm) {
    let best = Infinity;
    for (const m of modules) {
      const l = local(m, c);
      const p = m.params;
      const du = Math.max(p.x0 - l.u, 0, l.u - p.x1);
      const dv = Math.max(p.y0 - l.v, 0, l.v - p.y1);
      const dz = Math.max(p.floorZ - l.z, 0, l.z - p.topZ);
      const d = Math.hypot(du, dv, dz);
      if (d < best) [best, pm] = [d, m];
    }
  }
  if (!pm) return;
  const p = pm.params;
  const lc = local(pm, c);
  const bottom = Math.min(...corners.map((x) => local(pm!, x).z));
  const level: 'floor' | 'roof' = bottom > p.roofZ - 300 ? 'roof' : 'floor';
  const sides: Array<{ side: Side; d: number }> = [
    { side: 'v0', d: Math.abs(lc.v - p.y0) },
    { side: 'v1', d: Math.abs(lc.v - p.y1) },
    { side: 'u0', d: Math.abs(lc.u - p.x0) },
    { side: 'u1', d: Math.abs(lc.u - p.x1) },
  ];
  const near = sides.reduce((x, y) => (y.d < x.d ? y : x));
  const w = a.weight!;
  const lcase = loadCaseOf(a);
  // panneau vertical (mur, vitrage, habillage) donné en kg/m² : surface = longueur × hauteur, pas l'emprise au sol
  const height = b[4] - b[1];
  const thin = Math.min(b[3] - b[0], b[5] - b[2]);
  const vertical = w.unit === 'kg/m²' && height >= 3 * thin && thin < 300;
  if (near.d <= 300 && (w.unit !== 'kg/m²' || vertical)) {
    const along = near.side === 'v0' || near.side === 'v1';
    const [s0, len] = along ? [p.x0, p.x1 - p.x0] : [p.y0, p.y1 - p.y0];
    const ss = corners.map((x) => {
      const l = local(pm!, x);
      return (along ? l.u : l.v) - s0;
    });
    const from = Math.max(0, Math.min(...ss));
    const to = Math.min(len, Math.max(...ss));
    const L = to - from;
    if (L > 50 && (w.unit === 'kg/m' || vertical || L > 1000)) {
      const q = w.unit === 'kg/m' ? (w.value * G) / 1000 : vertical ? (w.value * G * height) / 1e6 : (w.value * G) / L;
      edge.push({ module: pm.id, side: near.side, from, to, level, q, loadCase: lcase === 'G7' ? 'G3' : lcase, label });
      return;
    }
  }
  // charge ponctuelle (poids total ; kg/m² sur l'emprise en plan, ou sur la face d'un panneau vertical)
  let F = 0;
  if (w.unit === 'kg') F = w.value * G;
  else if (w.unit === 'kg/m') F = (w.value * G * Math.max(b[3] - b[0], b[5] - b[2])) / 1000;
  else F = w.value * G * 1e-6 * (vertical ? Math.max(b[3] - b[0], b[5] - b[2]) * height : (b[3] - b[0]) * (b[5] - b[2]));
  point.push({ module: pm.id, u: lc.u, v: lc.v, level, F, loadCase: lcase, label });
}
