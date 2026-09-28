// Repères façade : hachure « // » des vitres visibles, vitres cachées ou vues de profil non marquées, croix noire sur
// les murs visibles, portes reprises dans leur couleur de légende.
import { describe, expect, it } from 'vitest';
import { BoxGeometry, Mesh, MeshBasicMaterial } from 'three';
import { acceleratedRaycast } from 'three-mesh-bvh';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { viewBasis } from '../src/core/views';
import { WALL_CROSS_LAYER, clipSegment, facadeMarkLayers, glassHatch, glassPanes, isElevation, wallCross } from '../src/linework/facadeMarks';
import { makeGlassTest } from '../src/linework/packets';
import { inkOf, markColor } from '../src/linework/svg';
import type { LoadedScene } from '../src/scene/loadedScene';
import type { Linework2D } from '../src/linework/types';

Mesh.prototype.raycast = acceleratedRaycast;
const glassMat = new MeshBasicMaterial({ name: 'VITRE' });
const wallMat = new MeshBasicMaterial({ name: 'ALU' });

/** Boîte w × h × e mm centrée en (x, y, z) (repère monde Y en haut). */
function box(id: string, w: number, h: number, e: number, x: number, y: number, z: number, mat = glassMat): Mesh {
  const m = new Mesh(new BoxGeometry(w, h, e), mat);
  m.position.set(x, y, z);
  m.userData.vbxId = id;
  m.updateMatrixWorld(true);
  return m;
}

function fakeScene(meshes: Mesh[], cats: Record<string, string>): LoadedScene {
  return {
    objectsById: new Map(meshes.map((m) => [m.userData.vbxId as string, m])),
    look: { byId: new Map(), categoryOf: (id: string) => cats[id] ?? null, itemOf: (id: string) => id, inSet: () => false },
  } as unknown as LoadedScene;
}

const emptyLw: Linework2D = {
  boundsMm: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
  layers: [],
  snapPoints: new Float64Array(),
  meta: { provider: 't', durationMs: 0, segmentCount: 0, cacheKey: '', basis: viewBasis({ kind: 'front', frame: 'world' }), objectCount: 0 },
};

describe('hachure de vitrage', () => {
  it('3 traits parallèles à 63°, tous dans la vitre', () => {
    const segs = glassHatch(0, 0, 1000, 2200);
    expect(segs).toHaveLength(3);
    for (const [ax, ay, bx, by] of segs) {
      for (const [x, y] of [
        [ax, ay],
        [bx, by],
      ]) {
        expect(x).toBeGreaterThanOrEqual(59);
        expect(x).toBeLessThanOrEqual(941);
        expect(y).toBeGreaterThanOrEqual(59);
        expect(y).toBeLessThanOrEqual(2141);
      }
      expect((Math.atan2(by - ay, bx - ax) * 180) / Math.PI).toBeCloseTo(63, 5);
    }
  });
  it('découpe d’un segment au cadre', () => {
    expect(clipSegment(-10, 5, 20, 5, 0, 0, 10, 10)).toEqual([0, 5, 10, 5]);
    expect(clipSegment(-10, 20, 20, 20, 0, 0, 10, 10)).toBeNull();
  });
});

describe('vitres d’un maillage', () => {
  it('une vitre par groupe de triangles reliés (deux vitres dans le même maillage)', () => {
    const merged = mergeGeometries([new BoxGeometry(1000, 2000, 10), new BoxGeometry(1000, 2000, 10).translate(1200, 0, 0)]);
    const two = new Mesh(merged, glassMat);
    two.updateMatrixWorld(true);
    const panes = glassPanes(two);
    expect(panes).toHaveLength(2);
    expect(panes.every((p) => p.length === 36 * 3)).toBe(true);
  });
});

describe('repères façade', () => {
  const basis = viewBasis({ kind: 'front', frame: 'world' });
  const t = basis.toward;
  // position le long de la direction de regard : +profondeur = vers l'observateur
  const at = (x: number, depth: number): [number, number, number] => [basis.right[0] * x + t[0] * depth, 1100, basis.right[2] * x + t[2] * depth];
  const place = (m: Mesh, p: [number, number, number]) => (m.position.set(...p), m.updateMatrixWorld(true), m);
  const facing = (id: string, x: number, depth: number, mat = glassMat) => {
    const m = box(id, 1000, 2200, 10, 0, 0, 0, mat);
    // la boîte doit faire face à l'observateur : sa petite épaisseur le long de `toward`
    if (Math.abs(t[0]) > 0.5) m.rotation.y = Math.PI / 2;
    return place(m, at(x, depth));
  };
  const isGlass = makeGlassTest(/VITRE|GLASS/);

  it('vue de face uniquement', () => {
    expect(isElevation(basis)).toBe(true);
    expect(isElevation(viewBasis({ kind: 'top', frame: 'world' }))).toBe(false);
  });

  it('vitre visible marquée, vitre derrière un mur ou derrière une autre vitre non marquée, vitre de profil ignorée', () => {
    const visible = facing('g1', 0, 0);
    const behindWall = facing('g2', 2000, 0);
    const wall = facing('w1', 2000, 500, wallMat);
    const front = facing('g3', 4000, 600);
    const back = facing('g4', 4000, 0);
    const side = place(box('g5', 1000, 2200, 10, 0, 0, 0), at(6000, 0));
    if (Math.abs(t[0]) <= 0.5) side.rotation.y = Math.PI / 2;
    side.updateMatrixWorld(true);
    const meshes = [visible, behindWall, wall, front, back, side];
    const scene = fakeScene(meshes, { g1: 'VITRE-SEAMLESS', g2: 'VITRE-SEAMLESS', g3: 'VITRE', g4: 'VITRE', g5: 'VITRE', w1: 'MUR-LOURD' });
    const layers = facadeMarkLayers(scene, meshes.map((m) => m.userData.vbxId), basis, emptyLw, isGlass, { 'VITRE-SEAMLESS': '#1030FF', VITRE: '#1EAAF1' });
    const marked = new Set(layers.filter((l) => l.key !== WALL_CROSS_LAYER).flatMap((l) => l.sourceNodeIds ?? []));
    expect([...marked].sort()).toEqual(['g1', 'g3']);
    expect(layers.find((l) => l.key === 'mark:VITRE-SEAMLESS')?.polylines).toHaveLength(3);
  });

  it('portes : leurs traits dans leur couleur ; murs, structure : pas de traits en couleur', () => {
    const lw: Linework2D = {
      ...emptyLw,
      layers: [{ key: 'visible', polylines: [Float64Array.from([0, 0, 1, 0]), Float64Array.from([0, 1, 1, 1]), Float64Array.from([0, 2, 1, 2])], sourceNodeIds: ['door', 'wall', 'struct'] }],
    };
    const scene = fakeScene([], { door: 'PORTE-DOUBLE', wall: 'MUR-LEGER', struct: 'STRUCTURE' });
    const layers = facadeMarkLayers(scene, [], basis, lw, isGlass, { 'PORTE-DOUBLE': '#FF3712', 'MUR-LEGER': '#FFFB14' });
    expect(layers.map((l) => [l.key, l.sourceNodeIds])).toEqual([['mark:PORTE-DOUBLE', ['door']]]);
  });

  it('murs : croix noire d’angle à angle sur le mur visible, pas sur le mur caché, vu de profil ou derrière une vitre', () => {
    const wall = facing('w1', 0, 0, wallMat);
    const behindWall = facing('w2', 2000, 0, wallMat);
    const front = facing('w3', 2000, 500, wallMat);
    const behindGlass = facing('w4', 4000, 0, wallMat);
    const glassFront = facing('g1', 4000, 600);
    const side = place(box('w5', 1000, 2200, 10, 0, 0, 0, wallMat), at(6000, 0));
    if (Math.abs(t[0]) <= 0.5) side.rotation.y = Math.PI / 2;
    side.updateMatrixWorld(true);
    const meshes = [wall, behindWall, front, behindGlass, glassFront, side];
    const scene = fakeScene(meshes, { w1: 'MUR-LEGER', w2: 'MUR-LOURD', w3: 'MUR-LOURD', w4: 'MUR-LEGER', g1: 'VITRE', w5: 'MUR-LEGER' });
    const layers = facadeMarkLayers(scene, meshes.map((m) => m.userData.vbxId), basis, emptyLw, isGlass, { 'MUR-LEGER': '#FFFB14', 'MUR-LOURD': '#17FF28' });
    const cross = layers.find((l) => l.key === WALL_CROSS_LAYER)!;
    expect([...new Set(cross.sourceNodeIds)].sort()).toEqual(['w1', 'w3']);
    expect(cross.polylines).toHaveLength(4);
    // w1 : 1000 × 2200 mm centré en x = 0 → diagonales d'angle à angle
    const w1 = cross.polylines.filter((_, i) => cross.sourceNodeIds![i] === 'w1').map((pl) => [...pl].map(Math.round));
    expect(w1).toEqual([
      [-500, 0, 500, 2200],
      [-500, 2200, 500, 0],
    ]);
    expect(layers.some((l) => l.key.startsWith('mark:MUR'))).toBe(false);
    expect(markColor(WALL_CROSS_LAYER, {})).toBe('#000');
    expect(wallCross(0, 0, 10, 20).map((pl) => [...pl])).toEqual([
      [0, 0, 10, 20],
      [0, 20, 10, 0],
    ]);
  });

  it('couleur lisible sur blanc : le jaune est foncé, les autres couleurs gardées', () => {
    expect(inkOf('#FFFB14')).not.toBe('#FFFB14');
    expect(inkOf('#1030FF')).toBe('#1030FF');
  });
});
