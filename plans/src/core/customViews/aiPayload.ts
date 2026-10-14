// Assistant « 🤖 Décris la vue » (pur) : données envoyées à l'IA — inventaire du modèle (Viewbox, types de pièces
// avec leurs clés, étiquettes, hauteurs relatives au plancher), références de hauteur, préréglages, vue actuelle,
// opérations permises. Pas de géométrie, pas d'image ; < 150 Ko. L'IA ne peut choisir que dans ces listes.
import type { SceneIndex } from '../types';
import type { SceneLookup } from '../subset';
import type { ModuleFrame } from '../views';
import type { TagResolver } from './tags';
import type { ModuleRefs } from './refs';
import type { CustomViewSpec } from './types';
import type { ViewPreset } from './presets';
import { clusterRanks } from './layout';
import { displayLabel } from './editor';
import { CAMERA_DIRS, CUT_AXES, CUT_FILLS, LAYOUT_MODES, LEVEL_REFS, MODULE_REFS, VISIBILITY_OPS } from './clean';

export interface PartTypeInfo {
  /** clé utilisable dans `match.definitions` */
  definition: string;
  label: string;
  category: string | null;
  tag: string | null;
  /** nombre par Viewbox (max) et en tout */
  perModule: number;
  total: number;
  /** hauteur bas → haut depuis le dessus du plancher (mm, arrondie à 10) */
  heightFromFloor: [number, number];
  /** pièce interne à la définition de la Viewbox (présente dans plusieurs Viewbox) */
  inViewbox: boolean;
  materials?: string[];
}

export interface ViewAiPayload {
  modules: Array<{ id: string; level: number; type?: string; dims: [number, number, number]; front: string; row: number; col: number }>;
  partTypes: PartTypeInfo[];
  common: Array<{ label: string; category: string | null; count: number }>;
  categories: string[];
  tags: Array<{ tag: string; label: string; count: number }>;
  heights: Record<string, number>;
  maxHeight: number;
  presets: Array<{ key: string; name: string; description: string }>;
  current: Pick<CustomViewSpec, 'name' | 'camera' | 'cuts' | 'layout' | 'style' | 'scope'> & { rules: Array<{ id: string; op: string; label: string }>; box?: string };
  allowed: {
    ops: string[];
    cameraDirs: readonly string[];
    cutAxes: readonly string[];
    levelRefs: readonly string[];
    moduleRefs: readonly string[];
    visibilityOps: readonly string[];
    layoutModes: readonly string[];
    cutFills: readonly string[];
  };
}

export const VIEW_AI_OPS = ['setCamera', 'addCut', 'removeCut', 'setBox', 'addRule', 'removeRule', 'setLayout', 'setStyle', 'setScope', 'usePreset'] as const;

const r10 = (v: number) => Math.round(v / 10) * 10;
const MAX_PART_TYPES = 400;

export function viewAiPayload(input: {
  index: SceneIndex;
  look: SceneLookup;
  tags: TagResolver;
  frames: ReadonlyMap<string, ModuleFrame>;
  refs: ReadonlyMap<string, ModuleRefs>;
  spec: CustomViewSpec;
  presets: ViewPreset[];
}): ViewAiPayload {
  const { index, look, tags, frames, refs, spec, presets } = input;
  const mods = [...index.modules].sort((a, b) => a.level - b.level || a.id.localeCompare(b.id, 'fr', { numeric: true }));
  // rangées / colonnes en plan (centres des Viewbox)
  const centres = mods.map((m) => {
    const f = frames.get(m.id);
    if (!f) return [0, 0];
    const cx = (f.min[0] + f.max[0]) / 2;
    const cy = (f.min[1] + f.max[1]) / 2;
    return [f.origin[0] + f.xAxis[0] * cx + f.yAxis[0] * cy, f.origin[2] + f.xAxis[2] * cx + f.yAxis[2] * cy];
  });
  const cols = clusterRanks(centres.map((c) => c[0]));
  const rows = clusterRanks(centres.map((c) => -c[1]));
  const modules = mods.map((m, i) => ({
    id: m.id,
    level: m.level,
    ...(m.type ? { type: m.type } : {}),
    dims: [Math.round(m.planDimsMm[0]), Math.round(m.planDimsMm[1]), Math.round(m.heightMm)] as [number, number, number],
    front: frames.get(m.id)?.front ?? '+x',
    row: rows[i],
    col: cols[i],
  }));
  const floorTop = new Map(mods.map((m) => [m.id, refs.get(m.id)?.['floor-top'].y ?? m.bboxMm[1]]));

  // types de pièces par définition (dans les Viewbox et accessoires)
  const byDef = new Map<string, { info: PartTypeInfo; perModule: Map<string, number> }>();
  for (const n of index.nodes) {
    if (!n.definition || n.role === 'module' || n.role === 'context' || n.role === 'wrapper' || !n.moduleId || !n.bboxMm) continue;
    let e = byDef.get(n.definition);
    if (!e) {
      const t = tags.ownTag(n.id);
      e = {
        info: {
          definition: n.definition,
          label: displayLabel(n),
          category: look.categoryOf(n.id),
          tag: t?.tag ?? null,
          perModule: 0,
          total: 0,
          heightFromFloor: [Infinity, -Infinity],
          inViewbox: n.assignment === 'hierarchy',
          ...(n.materialNames?.length ? { materials: n.materialNames.slice(0, 4) } : {}),
        },
        perModule: new Map(),
      };
      byDef.set(n.definition, e);
    }
    e.info.total++;
    e.perModule.set(n.moduleId, (e.perModule.get(n.moduleId) ?? 0) + 1);
    const base = floorTop.get(n.moduleId) ?? 0;
    e.info.heightFromFloor = [Math.min(e.info.heightFromFloor[0], r10(n.bboxMm[1] - base)), Math.max(e.info.heightFromFloor[1], r10(n.bboxMm[4] - base))];
  }
  const partTypes = [...byDef.values()]
    .map(({ info, perModule }) => ({ ...info, perModule: Math.max(0, ...perModule.values()), inViewbox: info.inViewbox && perModule.size >= 2 }))
    .sort((a, b) => Number(!!b.tag) - Number(!!a.tag) || b.total - a.total)
    .slice(0, MAX_PART_TYPES);

  const commonCounts = new Map<string, { label: string; category: string | null; count: number }>();
  for (const id of index.commonIds) {
    const n = look.byId.get(id);
    if (!n) continue;
    const label = displayLabel(n);
    const c = commonCounts.get(label) ?? { label, category: look.categoryOf(id), count: 0 };
    c.count++;
    commonCounts.set(label, c);
  }
  const categories = [...new Set(index.nodes.map((n) => (n.categorySource && n.categorySource !== 'inherited' ? n.category : null)).filter((c): c is string => !!c))].sort();
  const tagList = tags.all().map((t) => ({ ...t, count: tags.nodesWithTag(t.tag).length })).filter((t) => t.count > 0);
  const firstRefs = mods[0] ? refs.get(mods[0].id) : undefined;
  const heights: Record<string, number> = {};
  if (firstRefs) for (const [k, v] of Object.entries(firstRefs)) heights[k] = Math.round(v.local);
  return {
    modules,
    partTypes,
    common: [...commonCounts.values()],
    categories,
    tags: tagList,
    heights,
    maxHeight: Math.max(3000, ...mods.map((m) => Math.round(m.heightMm))),
    presets: presets.map((p) => ({ key: p.key, name: p.name, description: p.description })),
    current: {
      name: spec.name,
      camera: spec.camera,
      cuts: spec.cuts,
      layout: spec.layout,
      style: spec.style,
      scope: spec.scope,
      rules: spec.visibility.map((r) => ({ id: r.id, op: r.op, label: r.label })),
      ...(spec.box?.moduleId ? { box: spec.box.moduleId } : {}),
    },
    allowed: {
      ops: [...VIEW_AI_OPS],
      cameraDirs: CAMERA_DIRS.filter((d) => d !== 'custom'),
      cutAxes: CUT_AXES.filter((a) => a !== 'custom'),
      levelRefs: LEVEL_REFS,
      moduleRefs: MODULE_REFS,
      visibilityOps: VISIBILITY_OPS,
      layoutModes: LAYOUT_MODES,
      cutFills: CUT_FILLS,
    },
  };
}

/** Taille du JSON envoyé (octets). */
export const payloadBytes = (p: ViewAiPayload) => new TextEncoder().encode(JSON.stringify(p)).length;
