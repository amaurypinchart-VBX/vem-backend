// Lecture tolérante des vues spéciales enregistrées (réglages du modèle, préréglages, IA) : champ inconnu ignoré,
// champ absent = valeur par défaut, valeur hors bornes ramenée, entrée illisible écartée. Jamais d'exception.
import type {
  CameraDir,
  CustomViewSpec,
  CutAxis,
  CutFill,
  CutPlane,
  CutRef,
  IsoCorner,
  LayoutMode,
  LevelRef,
  ModuleRef,
  Rotation,
  SectionBox,
  Vec3,
  ViewCamera,
  ViewLayout,
  ViewMatch,
  ViewStyle,
  VisibilityOp,
  VisibilityRule,
} from './types';
import { DEFAULT_CAMERA, DEFAULT_LAYOUT, DEFAULT_STYLE, MAX_CUTS } from './types';

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() && Number.isFinite(Number(v)) ? Number(v) : undefined;
const str = (v: unknown, max = 200): string | undefined => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined);
const oneOf = <T extends string>(v: unknown, list: readonly T[], fallback: T): T => (list.includes(v as T) ? (v as T) : fallback);
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const strList = (v: unknown, max = 500): string[] | undefined => {
  if (!Array.isArray(v)) return undefined;
  const out = [...new Set(v.map((x) => str(x, 300)).filter((x): x is string => !!x))].slice(0, max);
  return out.length ? out : undefined;
};

function vec(v: unknown): Vec3 | undefined {
  if (!Array.isArray(v) || v.length !== 3) return undefined;
  const out = v.map(num);
  return out.every((x) => x !== undefined) ? (out as Vec3) : undefined;
}

function nonZero(v: Vec3 | undefined): Vec3 | undefined {
  return v && Math.hypot(...v) > 1e-9 ? v : undefined;
}

export const CAMERA_DIRS: readonly CameraDir[] = ['top', 'bottom', 'front', 'back', 'left', 'right', 'iso', 'iso-below', 'custom'];
export const ISO_CORNERS: readonly IsoCorner[] = ['fl', 'fr', 'bl', 'br'];
export const LEVEL_REFS: readonly LevelRef[] = ['ground', 'floor-bottom', 'floor-top', 'ceiling', 'roof-bottom', 'roof-top'];
export const MODULE_REFS: readonly ModuleRef[] = ['mid', 'side0', 'side1'];
export const CUT_AXES: readonly CutAxis[] = ['horizontal', 'long', 'short', 'x', 'z', 'custom'];
export const VISIBILITY_OPS: readonly VisibilityOp[] = ['hide', 'show', 'ghost', 'isolate'];
export const LAYOUT_MODES: readonly LayoutMode[] = ['assembled', 'exploded', 'per-module', 'assembled+exploded'];
export const CUT_FILLS: readonly CutFill[] = ['by-material', 'drawing', 'solid', 'hatch', 'none'];

/** Limite des distances (mm) : 1 km, bien au-delà de toute installation. */
const MAX_MM = 1_000_000;

export function cleanCamera(raw: unknown): ViewCamera {
  if (!isObj(raw)) return { ...DEFAULT_CAMERA };
  const dir = oneOf(raw.dir, CAMERA_DIRS, 'top');
  const cam: ViewCamera = {
    frame: raw.frame === 'module' ? 'module' : 'world',
    dir,
    rotate: ([0, 90, 180, 270] as const).includes(num(raw.rotate) as Rotation) ? (num(raw.rotate) as Rotation) : 0,
    mirror: raw.mirror === true,
  };
  if (dir === 'iso' || dir === 'iso-below') cam.isoCorner = oneOf(raw.isoCorner, ISO_CORNERS, 'fl');
  if (dir === 'bottom' && raw.reflected === true) cam.reflected = true;
  if (dir === 'custom') {
    const c = isObj(raw.custom) ? raw.custom : {};
    const d = nonZero(vec(c.dir));
    const up = nonZero(vec(c.up));
    if (d) cam.custom = { dir: d, up: up ?? [0, 1, 0] };
    else cam.dir = 'top';
  }
  return cam;
}

function cleanRef(raw: unknown, axis: CutAxis): CutRef {
  const r = isObj(raw) ? raw : {};
  if (axis === 'horizontal' && r.kind === 'level') return { kind: 'level', ref: oneOf(r.ref, LEVEL_REFS, 'floor-top') };
  if ((axis === 'long' || axis === 'short') && r.kind === 'module') return { kind: 'module', ref: oneOf(r.ref, MODULE_REFS, 'mid') };
  return { kind: 'absolute' };
}

export function cleanCut(raw: unknown, i: number): CutPlane | null {
  if (!isObj(raw)) return null;
  const axis = oneOf(raw.axis, CUT_AXES, 'horizontal');
  const cut: CutPlane = {
    id: str(raw.id, 60) ?? `cut-${i + 1}`,
    frame: raw.frame === 'module' ? 'module' : 'world',
    axis,
    ref: cleanRef(raw.ref, axis),
    offset: clamp(num(raw.offset) ?? 0, -MAX_MM, MAX_MM),
    keep: raw.keep === 'negative' ? 'negative' : 'positive',
  };
  // repère module : seulement horizontal / long / court (les axes monde x, z n'y ont pas de sens)
  if (cut.frame === 'module' && (axis === 'x' || axis === 'z')) cut.frame = 'world';
  if ((axis === 'long' || axis === 'short') && cut.frame === 'world' && cut.ref.kind === 'module') cut.frame = 'module';
  const label = str(raw.label, 4);
  if (label) cut.label = label.toUpperCase();
  const depth = num(raw.depth);
  if (depth !== undefined && depth > 0) cut.depth = Math.min(depth, MAX_MM);
  if (axis === 'custom') {
    const c = isObj(raw.custom) ? raw.custom : {};
    const point = vec(c.point);
    const normal = nonZero(vec(c.normal));
    if (!point || !normal) return null;
    cut.custom = { point, normal };
    cut.frame = 'world';
  }
  return cut;
}

export function cleanBox(raw: unknown): SectionBox | undefined {
  if (!isObj(raw)) return undefined;
  const a = vec(raw.min);
  const b = vec(raw.max);
  if (!a || !b) return undefined;
  const min = a.map((v, i) => Math.min(v, b[i])) as Vec3;
  const max = a.map((v, i) => Math.max(v, b[i])) as Vec3;
  if (max.some((v, i) => v - min[i] < 1)) return undefined;
  const box: SectionBox = { frame: raw.frame === 'module' ? 'module' : 'world', min, max };
  const m = str(raw.moduleId, 60);
  if (m) box.moduleId = m;
  return box;
}

export function cleanMatch(raw: unknown): ViewMatch | null {
  if (!isObj(raw)) return null;
  const m: ViewMatch = {};
  for (const k of ['nodeIds', 'modulePaths', 'definitions', 'viewTags', 'categories', 'moduleIds', 'articleRefs'] as const) {
    const l = strList(raw[k]);
    if (l) m[k] = l;
  }
  if (typeof raw.common === 'boolean') m.common = raw.common;
  // une règle sans critère toucherait tout le modèle : écartée
  return Object.keys(m).length ? m : null;
}

export function cleanRule(raw: unknown, i: number): VisibilityRule | null {
  if (!isObj(raw)) return null;
  const match = cleanMatch(raw.match);
  if (!match) return null;
  return {
    id: str(raw.id, 60) ?? `rule-${i + 1}`,
    op: oneOf(raw.op, VISIBILITY_OPS, 'hide'),
    match,
    label: str(raw.label) ?? 'Règle',
    source: oneOf(raw.source, ['click', 'preset', 'ai', 'sketchup'] as const, 'click'),
  };
}

export function cleanLayout(raw: unknown): ViewLayout {
  const r = isObj(raw) ? raw : {};
  const out: ViewLayout = {
    mode: oneOf(r.mode, LAYOUT_MODES, DEFAULT_LAYOUT.mode),
    gap: clamp(num(r.gap) ?? DEFAULT_LAYOUT.gap, 0, 100_000),
    keepArrangement: typeof r.keepArrangement === 'boolean' ? r.keepArrangement : DEFAULT_LAYOUT.keepArrangement,
    levels: r.levels === 'filter' ? 'filter' : 'separate',
    groupIdentical: typeof r.groupIdentical === 'boolean' ? r.groupIdentical : DEFAULT_LAYOUT.groupIdentical,
    labels: oneOf(r.labels, ['none', 'id', 'id+type'] as const, DEFAULT_LAYOUT.labels),
    common: r.common === 'keep-in-place' ? 'keep-in-place' : 'hide',
  };
  const cols = num(r.columns);
  if (cols !== undefined && cols >= 1) out.columns = Math.min(50, Math.round(cols));
  return out;
}

export function cleanStyle(raw: unknown): ViewStyle {
  const r = isObj(raw) ? raw : {};
  return {
    cutFill: oneOf(r.cutFill, CUT_FILLS, DEFAULT_STYLE.cutFill),
    cutLine: clamp(num(r.cutLine) ?? DEFAULT_STYLE.cutLine, 0.05, 2),
    beyond: r.beyond === 'thin' ? 'thin' : 'normal',
    hidden: r.hidden === true,
    ghostTone: clamp(num(r.ghostTone) ?? DEFAULT_STYLE.ghostTone, 0, 1),
    categoryColors: r.categoryColors === true,
  };
}

/** Une vue spéciale (null si illisible). */
export function cleanCustomView(raw: unknown, now = new Date().toISOString()): CustomViewSpec | null {
  if (!isObj(raw)) return null;
  const id = str(raw.id, 80);
  if (!id) return null;
  const scopeRaw = isObj(raw.scope) ? raw.scope : {};
  const modules = Array.isArray(scopeRaw.modules) ? strList(scopeRaw.modules) ?? [] : 'all';
  const levels = Array.isArray(scopeRaw.levels) ? [...new Set(scopeRaw.levels.map(num).filter((x): x is number => x !== undefined).map(Math.round))].sort((a, b) => a - b) : undefined;
  const cuts = (Array.isArray(raw.cuts) ? raw.cuts : [])
    .map((c, i) => cleanCut(c, i))
    .filter((c): c is CutPlane => !!c)
    .slice(0, MAX_CUTS);
  const rules = (Array.isArray(raw.visibility) ? raw.visibility : []).map((r, i) => cleanRule(r, i)).filter((r): r is VisibilityRule => !!r);
  const spec: CustomViewSpec = {
    v: 1,
    id,
    name: str(raw.name) ?? 'Vue spéciale',
    source: oneOf(raw.source, ['user', 'preset', 'ai', 'sketchup'] as const, 'user'),
    createdAt: str(raw.createdAt, 40) ?? now,
    updatedAt: str(raw.updatedAt, 40) ?? now,
    scope: { modules: modules === 'all' || modules.length ? modules : 'all', common: scopeRaw.common !== false },
    camera: cleanCamera(raw.camera),
    cuts,
    visibility: rules,
    layout: cleanLayout(raw.layout),
    style: cleanStyle(raw.style),
    output: raw.output === 'render' ? 'render' : 'vector',
  };
  if (levels?.length) spec.scope.levels = levels;
  const presetKey = str(raw.presetKey, 80);
  if (presetKey) spec.presetKey = presetKey;
  const by = str(raw.updatedBy, 120);
  if (by) spec.updatedBy = by;
  const box = cleanBox(raw.box);
  if (box) spec.box = box;
  return spec;
}

/** Liste des vues spéciales d'un modèle (réglages) : illisibles écartées, identifiants en double écartés. */
export function cleanCustomViews(raw: unknown): CustomViewSpec[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: CustomViewSpec[] = [];
  for (const r of raw) {
    const v = cleanCustomView(r);
    if (!v || seen.has(v.id)) continue;
    seen.add(v.id);
    out.push(v);
  }
  return out;
}
