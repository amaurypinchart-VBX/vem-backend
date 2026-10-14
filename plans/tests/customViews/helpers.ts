// Index de scène synthétique pour les vues spéciales : Viewbox de même définition (rangées × colonnes, niveaux),
// composant Viewbox (item) avec plancher, toiture, plafond tendu + fixations, rail de spots ; murs rattachés par
// position ; un escalier commun.
import { Matrix4 } from 'three';
import type { BBox, ModuleInfo, NodeInfo, SceneIndex } from '../../src/core/types';
import type { ModuleFrame } from '../../src/core/views';
import { frameAxesFromMatrix, makeModuleFrame } from '../../src/core/views';

export interface FakeModule {
  id: string;
  /** coin (x, z) monde, niveau */
  x: number;
  z: number;
  level?: number;
  /** rotation autour de Y (degrés) */
  rot?: number;
  /** pas de plafond dans cette Viewbox */
  noCeiling?: boolean;
  /** définition différente */
  definition?: string;
}

const L = 5900;
const W = 2500;
const H = 3080;

export function fakeScene(mods: FakeModule[], opts: { wallOn?: string[]; glassOn?: string[]; common?: boolean } = {}): { index: SceneIndex; frames: Map<string, ModuleFrame> } {
  const nodes: NodeInfo[] = [];
  const modules: ModuleInfo[] = [];
  const frames = new Map<string, ModuleFrame>();
  let n = 0;
  const add = (p: Partial<NodeInfo> & { name: string; parentId: string | null }): NodeInfo => {
    const node: NodeInfo = {
      id: `n${++n}`,
      kind: 'group',
      role: 'part',
      category: null,
      categorySource: null,
      moduleId: null,
      assignment: null,
      level: null,
      bboxMm: null,
      triangles: 0,
      ...p,
    };
    nodes.push(node);
    return node;
  };
  const root = add({ name: 'root', parentId: null, role: 'wrapper' });
  for (const m of mods) {
    const level = m.level ?? 0;
    const y0 = level * H;
    const rot = ((m.rot ?? 0) * Math.PI) / 180;
    const mat = new Matrix4().makeRotationY(rot).setPosition(m.x, y0, m.z);
    const axes = frameAxesFromMatrix(mat.elements);
    // boîte monde (approchée : axes alignés quand rot = 0 / 90)
    const box = (lx0: number, lx1: number, ly0: number, ly1: number, h0: number, h1: number): BBox => {
      const pts = [
        [lx0, ly0],
        [lx1, ly0],
        [lx0, ly1],
        [lx1, ly1],
      ].map(([a, b]) => [axes.origin[0] + a * axes.xAxis[0] + b * axes.yAxis[0], axes.origin[2] + a * axes.xAxis[2] + b * axes.yAxis[2]]);
      const xs = pts.map((p) => p[0]);
      const zs = pts.map((p) => p[1]);
      return [Math.min(...xs), y0 + h0, Math.min(...zs), Math.max(...xs), y0 + h1, Math.max(...zs)];
    };
    const common = { moduleId: m.id, level, assignment: 'hierarchy' as const };
    const mod = add({ name: m.id, parentId: root.id, role: 'module', definition: m.definition ?? 'VBXM16FULL_COMPLETE', bboxMm: box(0, L, 0, W, 0, H), ...common });
    const item = add({ name: `VBXE-${modules.length + 1}`, definition: '7-962-016 VIEWBOX STANDARD M16', parentId: mod.id, role: 'item', category: 'STRUCTURE', categorySource: 'manifest', ...common });
    const mesh = (parent: NodeInfo, name: string, bb: BBox, extra: Partial<NodeInfo> = {}) =>
      add({ name: '', parentId: add({ name, definition: name, parentId: parent.id, category: parent.category, categorySource: 'inherited', bboxMm: bb, ...common, ...extra }).id, kind: 'mesh', triangles: 12, bboxMm: bb, category: parent.category, categorySource: 'inherited', ...common });
    const floor = add({ name: 'floor', definition: '_7-632-001_Floor_module', parentId: item.id, category: 'PLANCHER', categorySource: 'name', bboxMm: box(0, L, 0, W, 0, 238), ...common });
    add({ name: '', parentId: floor.id, kind: 'mesh', triangles: 12, bboxMm: box(0, L, 0, W, 0, 238), category: 'PLANCHER', categorySource: 'inherited', ...common });
    const roof = add({ name: 'roof', definition: '_7-632-002_Roof_module', parentId: item.id, category: 'TOIT', categorySource: 'name', bboxMm: box(0, L, 0, W, 2750, 3080), ...common });
    add({ name: '', parentId: roof.id, kind: 'mesh', triangles: 12, bboxMm: box(0, L, 0, W, 2750, 3080), category: 'TOIT', categorySource: 'inherited', ...common });
    const inner = add({ name: 'SketchUp_Instance_17', definition: 'VBXM16FULL', parentId: item.id, category: 'STRUCTURE', categorySource: 'inherited', ...common });
    if (!m.noCeiling) mesh(inner, 'black_cieling', box(100, L - 100, 150, W - 150, 2748, 2750));
    mesh(inner, 'tension_ceiling_large', box(100, L - 100, 150, 160, 2750, 2780));
    mesh(inner, 'tension_ceiling_large', box(100, L - 100, W - 160, W - 150, 2750, 2780));
    mesh(inner, 'LIght_Rail_3P', box(1000, 5000, 1200, 1300, 2749, 2788));
    for (const k of [0, 1, 2, 3])
      mesh(add({ name: `foot${k}`, definition: 'PIED_REGLABLE', parentId: item.id, category: 'PIED', categorySource: 'name', ...common }), 'jack', box(k % 2 ? L - 150 : 0, k % 2 ? L : 150, k > 1 ? W - 150 : 0, k > 1 ? W : 150, -100, 0), { category: 'PIED' });
    const itemIds = [item.id];
    if (opts.wallOn?.includes(m.id)) {
      const wall = add({ name: `VBXE-W${m.id}`, definition: '7-636-008 NIDAPLAST WALL', parentId: root.id, role: 'item', category: 'MUR-LEGER', categorySource: 'manifest', moduleId: m.id, level, assignment: 'spatial', bboxMm: box(0, 1130, -30, 0, 238, 2750) });
      add({ name: '', parentId: wall.id, kind: 'mesh', triangles: 12, bboxMm: wall.bboxMm, category: 'MUR-LEGER', categorySource: 'inherited', moduleId: m.id, level, assignment: 'spatial' });
      itemIds.push(wall.id);
    }
    if (opts.glassOn?.includes(m.id)) {
      const glass = add({ name: `VBXE-G${m.id}`, definition: '7-637-010 Glasswall Seamless', parentId: root.id, role: 'item', category: 'VITRE-SEAMLESS', categorySource: 'manifest', moduleId: m.id, level, assignment: 'spatial', bboxMm: box(0, 1130, W, W + 20, 238, 2750), glass: true });
      add({ name: '', parentId: glass.id, kind: 'mesh', triangles: 12, bboxMm: glass.bboxMm, category: 'VITRE-SEAMLESS', categorySource: 'inherited', moduleId: m.id, level, assignment: 'spatial' });
      itemIds.push(glass.id);
    }
    modules.push({
      id: m.id,
      nodeId: mod.id,
      name: m.id,
      level,
      planDimsMm: [L, W],
      heightMm: H,
      expected: { label: '5900', long: L, short: W, source: 'standard' },
      dimsOk: true,
      bboxMm: mod.bboxMm!,
      itemIds,
      detectedBy: 'name',
    });
    frames.set(m.id, makeModuleFrame(m.id, axes, [0, 0, -100], [L, W, H]));
  }
  const commonIds: string[] = [];
  if (opts.common) {
    const st = add({ name: 'VBXE-ST', definition: 'Escalier', parentId: root.id, role: 'item', category: 'ESCALIER', categorySource: 'manifest', assignment: 'common', level: 0, bboxMm: [-2000, 0, 0, -100, 3000, 1200] });
    add({ name: '', parentId: st.id, kind: 'mesh', triangles: 12, bboxMm: st.bboxMm, category: 'ESCALIER', categorySource: 'inherited', assignment: 'common', level: 0 });
    commonIds.push(st.id);
  }
  const levels = [...new Set(modules.map((m) => m.level))].sort().map((l) => ({ level: l, label: `Niveau ${l}`, minYmm: l * H, moduleIds: modules.filter((m) => m.level === l).map((m) => m.id) }));
  const index: SceneIndex = {
    schema: 'vem-plans-index/1',
    engineVersion: 'test',
    createdAt: '',
    source: { fileName: 't', sha256: 't', sizeBytes: 0, format: 'dae', unitMeter: 0.001, unitName: 'mm', upAxis: 'Y_UP', loaderAppliedUnit: true, hasManifest: true, hasEdges: false },
    stats: { nodes: nodes.length, meshes: 0, triangles: 0, degenerateRemoved: 0, duplicateRemoved: 0, backToBackRemoved: 0, modules: modules.length, levels: levels.length, items: 0, unclassified: 0, durationMs: 0 },
    nodes,
    modules,
    levels,
    commonIds,
    contextIds: [],
    warnings: [],
  };
  return { index, frames };
}

/** Grille 2 rangées × 3 colonnes de Viewbox qui se touchent (comme le modèle des captures). */
export function grid2x3(): FakeModule[] {
  const out: FakeModule[] = [];
  let k = 1;
  for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) out.push({ id: `VBX-0${k++}`, x: c * W, z: -r * L, rot: 90 });
  return out;
}
