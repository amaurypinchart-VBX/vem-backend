// Modèle SketchUp analysé → entrées du calcul complet : Viewbox placées (repère de chaque Viewbox, type de la
// reconnaissance → gabarit de la bibliothèque) et objets portés (murs, vitrages, portes, garde-corps, logos) en charges
// sur la rive du côté le plus proche ou au nœud le plus proche ; escaliers extérieurs (kit) et éléments terrasse
// (statico 18-0573 § 3.5) placés. Tout ce que le calcul ne sait pas encore modéliser (autres pièces porteuses hors
// gabarit : poutres, poteaux ajoutés…) est une erreur bloquante (verdict « incomplet »).
import type { LoadedScene } from '../../scene/loadedScene';
import type { PlacedModule, PlacedStair } from '../core/assemble';
import { placeFromFrame } from '../core/assemble';
import type { Vec3 } from '../core/fem/types';
import type { LibraryEntry, ModuleTypeEntry, PartAssignment } from '../core/library';
import { NATURE_LABEL } from '../core/library';
import { fmtNumber } from '../core/units';
import type { EdgeItem, PointItem } from '../core/loads';
import type { Recognition } from '../core/recognition';
import { proposeFor } from '../core/recognition';
import type { Side } from '../core/templates/viewboxEU';
import type { StairKitParams } from '../core/templates/stair';
import { STAIR_KITS } from '../library/seed';
import type { PlacedTerrace } from '../core/terrace';
import { placeTerrace } from '../core/terrace';
import { endHeights } from './geometry';

export interface SceneStudyModel {
  modules: PlacedModule[];
  /** pièces porteuses du modèle marquées « ignorées » (escalier, terrasse, poutre…) : hors calcul, citées dans le rapport */
  ignored: IgnoredPart[];
  /** escaliers extérieurs (kit avec palier) placés contre une Viewbox */
  stairs: PlacedStair[];
  /** éléments terrasse : posés au sol ou sur la toiture d'une Viewbox */
  terraces: PlacedTerrace[];
  edgeItems: EdgeItem[];
  pointItems: PointItem[];
  errors: string[];
  warnings: string[];
}

export interface IgnoredPart {
  label: string;
  count: number;
}

const STRUCTURAL_NATURES = new Set(['beam', 'column', 'bracing', 'deck', 'stair', 'landing', 'terrace']);

/** Types de pièces porteuses (catégorie ou nature structurelle) que l'utilisateur a choisi d'ignorer. */
export function ignoredStructural(recognition: Recognition): IgnoredPart[] {
  return recognition.types
    .filter((t) => t.kind === 'item' && t.assignment?.role === 'ignored')
    .filter((t) => STRUCTURAL_NATURES.has(t.assignment!.nature) || proposeFor(t.category, false)?.assignment.role === 'structural')
    .map((t) => ({ label: t.label, count: t.nodeIds.length }));
}

/**
 * Escalier du modèle → escalier placé : le palier est contre le côté de Viewbox parallèle à la volée qui touche la
 * boîte de l'objet (≤ 300 mm), au plancher de la Viewbox du dessus (ou au haut de celle du dessous) le plus proche de
 * « haut de la boîte − garde-corps 1,25 m » ; la volée part du bout le plus bas (hauteur moyenne des sommets).
 */
export function placeStair(
  b: readonly number[],
  id: string,
  label: string,
  modules: PlacedModule[],
  kit: StairKitParams,
  heights?: (axis: 0 | 2) => { low: number; high: number } | null,
): { stair: PlacedStair | null; reason?: string; warning?: string } {
  const ext: [number, number] = [b[3] - b[0], b[5] - b[2]];
  const axis: 0 | 2 = ext[0] >= ext[1] ? 0 : 2;
  const [lo, hi] = axis === 0 ? [b[0], b[3]] : [b[2], b[5]];
  const across: 0 | 2 = axis === 0 ? 2 : 0;
  const [clo, chi] = across === 0 ? [b[0], b[3]] : [b[2], b[5]];
  const target = b[4] - 1250;
  let best: { pm: PlacedModule; side: Side; level: 'floor' | 'roof'; H: number; d: number; along: [number, number]; depth: number } | null = null;
  for (const pm of modules) {
    const p = pm.params;
    const W = p.y1 + p.y0;
    const Lm = p.x1 + p.x0;
    const sides: Array<{ side: Side; n: Vec3; at: number; along: Vec3; len: number }> = [
      { side: 'u0', n: [-pm.u[0], 0, -pm.u[2]], at: 0, along: pm.v, len: W },
      { side: 'u1', n: [pm.u[0], 0, pm.u[2]], at: Lm, along: pm.v, len: W },
      { side: 'v0', n: [-pm.v[0], 0, -pm.v[2]], at: 0, along: pm.u, len: Lm },
      { side: 'v1', n: [pm.v[0], 0, pm.v[2]], at: W, along: pm.u, len: Lm },
    ];
    for (const sd of sides) {
      // côté parallèle à la volée, normale selon l'autre axe
      if (Math.abs(sd.n[across]) < 0.99) continue;
      const face = sd.side[0] === 'u' ? [pm.origin[0] + pm.u[0] * sd.at, pm.origin[2] + pm.u[2] * sd.at] : [pm.origin[0] + pm.v[0] * sd.at, pm.origin[2] + pm.v[2] * sd.at];
      const faceAcross = across === 0 ? face[0] : face[1];
      const sign = Math.sign(sd.n[across]);
      const gap = sign > 0 ? clo - faceAcross : faceAcross - chi;
      if (gap < -150 || gap > 300) continue;
      // recouvrement le long de la volée
      const a0 = (axis === 0 ? pm.origin[0] : pm.origin[2]) + sd.along[axis] * 0;
      const a1 = a0 + sd.along[axis] * sd.len;
      const ov = Math.min(hi, Math.max(a0, a1)) - Math.max(lo, Math.min(a0, a1));
      if (ov < 1000) continue;
      const options: Array<['floor' | 'roof', number]> = [];
      if (pm.level > 0) options.push(['floor', pm.origin[1] + p.floorZ]);
      options.push(['roof', pm.origin[1] + p.topZ]);
      for (const [level, H] of options) {
        const d = Math.abs(H - target) + (level === 'roof' ? 1 : 0);
        // profondeur de l'escalier depuis la ligne de système de la rive (5 mm à l'intérieur de la face)
        const depth = (sign > 0 ? chi - faceAcross : faceAcross - clo) + 5;
        if (!best || d < best.d) best = { pm, side: sd.side, level, H, d, along: [Math.min(a0, a1), Math.max(a0, a1)], depth };
      }
    }
  }
  if (!best) return { stair: null, reason: `${label} : aucun côté de Viewbox contre l’escalier (≤ 30 cm) — escalier non calculé.` };
  if (best.d > 600) return { stair: null, reason: `${label} : hauteur du palier (≈ ${Math.round(target)} mm) sans plancher de Viewbox correspondant — escalier non calculé.` };
  // bout du palier : le plus haut (sommets), sinon celui qui est le long de la Viewbox
  const h = heights?.(axis);
  let landingAtLow: boolean;
  let warning: string | undefined;
  if (h && Number.isFinite(h.low) && Number.isFinite(h.high) && Math.abs(h.high - h.low) > 300) landingAtLow = h.low > h.high;
  else {
    landingAtLow = Math.abs(lo - best.along[0]) <= Math.abs(hi - best.along[1]);
    warning = `${label} : sens de la volée déduit de la position contre ${best.pm.id} (à vérifier).`;
  }
  const run: Vec3 = axis === 0 ? [landingAtLow ? 1 : -1, 0, 0] : [0, 0, landingAtLow ? 1 : -1];
  const landingEnd = landingAtLow ? lo : -hi;
  // dimensions mesurées sur la boîte de l'objet (garde-corps et débords du kit déduits) : largeur entre limons, volée
  const notes: string[] = warning ? [warning] : [];
  const W = best.depth - kit.gap - kit.outerRail;
  let k = kit;
  if (Math.abs(W - kit.width) > 60) {
    if (W < 600 || W > 2500) return { stair: null, reason: `${label} : largeur mesurée ${Math.round(W)} mm hors du domaine du kit (0,60 à 2,50 m) — escalier non calculé.` };
    k = { ...kit, width: Math.round(W / 10) * 10 };
    notes.push(`${label} : largeur entre limons mesurée ${fmt(k.width)} m (kit ${fmt(kit.width)} m), mêmes profilés.`);
  }
  const L = hi - lo - (kit.landingEndOffset + kit.landingMargin + kit.boltSpacing + kit.landingMargin + kit.hookExtension + kit.footOverhang);
  const rise = best.H - Math.min(...modules.filter((m) => m.level === 0).map((m) => m.origin[1]));
  const kitL = (rise - kit.footHeight) * kit.runPerRise;
  let flight: number | undefined;
  if (Math.abs(L - kitL) > 150) {
    const slope = (Math.atan2(rise - kit.footHeight, L) * 180) / Math.PI;
    if (L <= 0 || slope < 25 || slope > 45) return { stair: null, reason: `${label} : volée mesurée ${fmt(Math.max(0, L))} m pour ${fmt(rise)} m de hauteur (pente hors de 25° à 45°) — escalier non calculé.` };
    flight = Math.round(L / 10) * 10;
    notes.push(`${label} : volée mesurée ${fmt(flight)} m en plan (pente ${Math.round(slope)}°), mêmes profilés que le kit.`);
  }
  return { stair: { id, label, kit: k, module: best.pm.id, side: best.side, level: best.level, run, landingEnd, ...(flight !== undefined ? { flight } : {}) }, warning: notes.join(' ') || undefined };
}

const G = 9.81;
const fmt = (mm: number) => fmtNumber(mm / 1e3, 2);
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
  const stairs: PlacedStair[] = [];
  const terraces: PlacedTerrace[] = [];
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
    if (a.role === 'structural' && (a.nature === 'stair' || a.nature === 'landing')) {
      for (const nodeId of t.nodeIds) {
        const n = scene.look.byId.get(nodeId);
        const r = n?.bboxMm ? placeStair(n.bboxMm, `ESC-${stairs.length + 1}`, t.label, modules, STAIR_KITS[0], (axis) => endHeights(scene, nodeId, axis)) : { stair: null, reason: `${t.label} : géométrie introuvable` };
        if (r.stair) stairs.push(r.stair);
        else errors.push(r.reason!);
        if (r.warning) warnings.push(r.warning);
      }
      continue;
    }
    if (a.role === 'structural' && a.nature === 'terrace') {
      for (const nodeId of t.nodeIds) {
        const n = scene.look.byId.get(nodeId);
        const r = n?.bboxMm ? placeTerrace(n.bboxMm, `TER-${terraces.length + 1}`, t.label, modules) : { terrace: null, reason: `${t.label} : géométrie introuvable` };
        if (r.terrace) terraces.push(r.terrace);
        else errors.push(r.reason!);
      }
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
    errors.push(`${count} pièce(s) porteuse(s) « ${nature} » : pas encore modélisées dans le calcul complet (poutres, poteaux ajoutés) — verdict incomplet`);
  for (const [label, count] of windOnly) warnings.push(`${label} (${count}) : surface au vent seule, pas encore appliquée au calcul (vent calculé sur les côtés des Viewbox)`);
  const ignored = ignoredStructural(recognition);
  for (const p of ignored)
    warnings.push(`${p.label} (${p.count}) : pièce porteuse ignorée — ni son poids, ni l’exploitation, ni le vent, ni ses appuis sur les Viewbox ne sont dans le calcul (citée dans le rapport)`);
  if (!modules.length && !errors.length) errors.push('Aucune Viewbox calculable dans le modèle.');
  return { modules, ignored, stairs, terraces, edgeItems, pointItems, errors, warnings };
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
      const nature = a.nature === 'wall' || a.nature === 'glazing' || a.nature === 'door' || a.nature === 'railing' ? a.nature : undefined;
      edge.push({ module: pm.id, side: near.side, from, to, level, q, loadCase: lcase === 'G7' ? 'G3' : lcase, label, ...(nature ? { nature } : {}) });
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
