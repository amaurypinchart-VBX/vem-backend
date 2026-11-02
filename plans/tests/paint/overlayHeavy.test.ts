// Peinture sur une façade de toute l'installation (16 Viewbox, petites pièces) : la vitre peinte « dans toutes les
// Viewbox identiques » — le cas qui figeait la page (A. Pinchart 02.11.2026). Même résultat qu'une soustraction
// triangle par triangle, vitre de devant entière (l'ancien calcul y laissait des trous), calcul découpé en étapes.
import { beforeAll, describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { Clipper, FillRule, Paths64 } from 'clipper2-js';
import { ingest } from '../../src/ingest/pipeline';
import { inlineRunner } from '../../src/ingest/cleanup';
import { exportPackage, loadPackage } from '../../src/ingest/package';
import { DEFAULT_RULES, compileRules } from '../../src/core/classification';
import type { LoadedScene } from '../../src/scene/loadedScene';
import { makeLoadedScene, meshesOfNode } from '../../src/scene/loadedScene';
import { makeSketchupDae } from '../fixtures/sketchupDae';
import { nodeSoup, paintScene, worldTriangle } from '../../src/linework/paintScene';
import type { PaintedScene } from '../../src/linework/paintScene';
import { computePaintOverlay, paintOverlaySteps } from '../../src/linework/paintOverlay';
import { faceSelector } from '../../src/core/paint/region';
import { paintContext } from '../../src/core/paint/resolve';
import { targetOptions } from '../../src/core/paint/targets';
import type { PaintSettings, Vec3 } from '../../src/core/paint/types';
import type { ViewBasis } from '../../src/core/views';
import { viewBasis } from '../../src/core/views';
import { resolveMeshes } from '../../src/core/subset';
import { makeGlassTest } from '../../src/linework/packets';
import type { BufferGeometry, Mesh } from 'three';

let s: LoadedScene;
let meshIds: string[];
const glassTest = makeGlassTest(compileRules(DEFAULT_RULES).glassMaterial);

beforeAll(async () => {
  const res = await ingest({ fileName: 'h.dae', data: new TextEncoder().encode(makeSketchupDae({ twoSided: false, modules: 16, detail: 300 })).buffer as ArrayBuffer, sha256: 'h', rules: DEFAULT_RULES, runner: inlineRunner, skipTextures: true });
  const pkg = await loadPackage(await exportPackage(res.root));
  s = makeLoadedScene(pkg.root, pkg.objectsById, res.index, 'h');
  meshIds = resolveMeshes(s.index, s.look, s.index.modules.map((m) => m.nodeId), [], undefined);
}, 120000);

/** vitre de VBX-06 peinte dans toutes les Viewbox, sur sa face tournée vers la vue */
function glassEverywhere(basis: ViewBasis): PaintedScene {
  const byId = new Map(s.index.nodes.map((n) => [n.id, n]));
  const isGlass = (id: string | null | undefined): boolean => !!id && (/VITRE/.test(byId.get(id)!.name) || isGlass(byId.get(id)!.parentId));
  const glass = s.index.nodes.find((n) => n.kind === 'mesh' && n.moduleId === 'VBX-06' && isGlass(n.id))!;
  const ns = nodeSoup(s, glass.id)!;
  const w = [new Vector3(), new Vector3(), new Vector3()];
  let seed: Vec3 = [0, 0, 0];
  let best = -2;
  for (let t = 0; t < ns.soup.index.length / 3; t++) {
    worldTriangle(ns, t, w);
    const n = new Vector3().subVectors(w[1], w[0]).cross(new Vector3().subVectors(w[2], w[0])).normalize();
    const d = n.dot(new Vector3(...basis.toward));
    if (d > best) {
      best = d;
      const c = new Vector3().add(w[0]).add(w[1]).add(w[2]).divideScalar(3).applyMatrix4(ns.toLocal);
      seed = [c.x, c.y, c.z];
    }
  }
  const ctx = paintContext(s.index);
  const face = faceSelector(ns.soup, seed, 30)!;
  const all = targetOptions(ctx, glass.id, face).find((o) => o.key === 'face-all')!;
  expect(all.count).toBe(16);
  const paint: PaintSettings = {
    v: 1,
    colors: [{ id: 'c', tag: 'P1', name: 'RAL 9005', system: 'RAL', code: '9005', hex: '#0E0E10', createdAt: '' }],
    zones: [{ id: 'z', colorId: 'c', target: all.target, label: '', source: 'click', createdAt: '' }],
    updatedAt: '',
  };
  return paintScene(s, paint, ctx);
}

/** copie d'un résultat de Clipper (clipper2-js modifie après coup les points de ses résultats) */
const own = (ps: Paths64) => {
  const out = new Paths64();
  for (const q of ps) out.push(Clipper.makePath(q.flatMap((pt) => [pt.x, pt.y])));
  return out;
};

/** référence : chaque triangle peint − union de tous les triangles devant lui (méthode directe, lente) */
function reference(painted: PaintedScene, basis: ViewBasis): number {
  const [R, U, T] = [new Vector3(...basis.right), new Vector3(...basis.up), new Vector3(...basis.toward)];
  const occ: number[][] = [];
  const v = new Vector3();
  for (const id of meshIds)
    for (const mesh of meshesOfNode(s.objectsById.get(id)) as Mesh[]) {
      if (glassTest((Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as never)) continue;
      const g = mesh.geometry as BufferGeometry;
      const pos = g.attributes.position;
      const at = (i: number) => (v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld), [v.dot(R), v.dot(U), v.dot(T)]);
      const tri = g.index ? g.index.count / 3 : pos.count / 3;
      for (let t = 0; t < tri; t++) {
        const [a, b, c] = [0, 1, 2].map((k) => at(g.index ? g.index.getX(t * 3 + k) : t * 3 + k));
        if (Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) < 1e-6) continue;
        occ.push([...a, ...b, ...c]);
      }
    }
  const path = (p: number[]) => {
    const cross = (p[2] - p[0]) * (p[5] - p[1]) - (p[3] - p[1]) * (p[4] - p[0]);
    const q = cross >= 0 ? p : [p[0], p[1], p[4], p[5], p[2], p[3]];
    return Clipper.makePath(q.map((x) => Math.round(x * 100)));
  };
  // morceaux visibles, réunis deux à deux à la fin (clipper2-js se trompe sur une grande union d'un coup)
  const pieces: Paths64[] = [];
  const w = [new Vector3(), new Vector3(), new Vector3()];
  for (const [id, tris] of painted.nodes) {
    const ns = nodeSoup(s, id)!;
    for (const [t] of tris) {
      worldTriangle(ns, t, w);
      const n = new Vector3().subVectors(w[1], w[0]).cross(new Vector3().subVectors(w[2], w[0])).normalize();
      if (n.dot(T) <= 0.05) continue;
      const p = w.flatMap((x) => [x.dot(R), x.dot(U)]);
      const [a, b, cz, c] = [n.dot(R), n.dot(U), n.dot(T), n.dot(w[0])];
      const depthAt = (x: number, y: number) => (c - a * x - b * y) / cz;
      const clip = new Paths64();
      for (const o of occ) {
        const xs = [o[0], o[3], o[6]];
        const ys = [o[1], o[4], o[7]];
        if (Math.max(...xs) <= Math.min(p[0], p[2], p[4]) || Math.min(...xs) >= Math.max(p[0], p[2], p[4]) || Math.max(...ys) <= Math.min(p[1], p[3], p[5]) || Math.min(...ys) >= Math.max(p[1], p[3], p[5])) continue;
        let front = 0;
        for (let k = 0; k < 3; k++) if (o[k * 3 + 2] > depthAt(o[k * 3], o[k * 3 + 1]) + 0.5) front++;
        if (front === 0) continue;
        if (front < 3 && (o[2] + o[5] + o[8]) / 3 <= depthAt((o[0] + o[3] + o[6]) / 3, (o[1] + o[4] + o[7]) / 3) + 0.5) continue;
        clip.push(path([o[0], o[1], o[3], o[4], o[6], o[7]]));
      }
      const subject = new Paths64();
      subject.push(path(p));
      pieces.push(own(Clipper.Difference(subject, clip, FillRule.NonZero)));
    }
  }
  while (pieces.length > 1) pieces.push(own(Clipper.Union(pieces.shift()!, pieces.shift()!, FillRule.NonZero)));
  return Clipper.areaPaths(pieces[0]) / 1e4;
}

describe('peinture sur une façade de toute l’installation', () => {
  it('vitre de devant entière (aucun trou) ; même surface que la méthode directe', () => {
    const basis = viewBasis({ kind: 'front', frame: 'world' });
    const painted = glassEverywhere(basis);
    const r = computePaintOverlay({ scene: s, painted, meshIds, basis, isGlass: glassTest, glassTransparent: true });
    // 4 colonnes de 4 vitres : celle de devant se voit entière (5 700 × 2 550 mm) et couvre les 3 autres
    expect(r.length).toBe(4);
    for (const reg of r) {
      expect(reg.loops.length).toBe(1);
      expect(reg.area).toBeCloseTo(5700 * 2550, -1);
    }
    expect(r.reduce((a, x) => a + x.area, 0)).toBeCloseTo(reference(painted, basis), -2);
  }, 120000);

  it('vue de derrière : vitres derrière des pièces (trous) ; même surface que la méthode directe', () => {
    const basis = viewBasis({ kind: 'back', frame: 'world' });
    const painted = glassEverywhere(basis);
    const r = computePaintOverlay({ scene: s, painted, meshIds, basis, isGlass: glassTest, glassTransparent: true });
    expect(r.length).toBeGreaterThan(0);
    expect(r.some((x) => x.loops.length > 1)).toBe(true);
    expect(r.reduce((a, x) => a + x.area, 0)).toBeCloseTo(reference(painted, basis), -2);
  }, 120000);

  it('calcul en étapes courtes : même résultat que d’un seul tenant', () => {
    const basis = viewBasis({ kind: 'back', frame: 'world' });
    const painted = glassEverywhere(basis);
    const inp = { scene: s, painted, meshIds, basis, isGlass: glassTest, glassTransparent: true };
    const job = paintOverlaySteps(inp);
    let steps = 0;
    let r = job.next();
    while (!r.done) {
      steps++;
      r = job.next();
    }
    expect(steps).toBeGreaterThan(5);
    expect(r.value).toEqual(computePaintOverlay(inp));
  }, 120000);
});
