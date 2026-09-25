// Nettoyage de géométrie (fonction pure, testée, exécutée dans un Web Worker).
// - supprime les triangles dégénérés (deux sommets confondus ou aire nulle)
// - supprime les triangles en double, y compris les faces doublées "dos à dos" produites par l'option
//   SketchUp "Export Two-Sided Faces" (même 3 sommets, ordre inversé) : on garde la première.
// Les sommets eux-mêmes ne sont pas modifiés ici (la fusion des sommets est faite avant, par
// mergeVertices, qui préserve les normales des arêtes vives).

export interface GeometryGroup {
  start: number;
  count: number;
  materialIndex: number;
}

export interface CleanResult {
  index: Uint32Array;
  groups: GeometryGroup[];
  degenerate: number;
  duplicate: number;
  backToBack: number;
}

/** Parité de la permutation qui trie (a, b, c) : +1 paire, -1 impaire. */
function permutationParity(a: number, b: number, c: number): 1 | -1 {
  let inversions = 0;
  if (a > b) inversions++;
  if (a > c) inversions++;
  if (b > c) inversions++;
  return inversions % 2 === 0 ? 1 : -1;
}

export function cleanTriangles(
  positions: ArrayLike<number>,
  index: ArrayLike<number> | null,
  groups: GeometryGroup[],
  tolerance: number,
): CleanResult {
  const vertexCount = Math.floor(positions.length / 3);
  const idx: ArrayLike<number> = index ?? Uint32Array.from({ length: vertexCount }, (_, i) => i);
  const tol = tolerance > 0 ? tolerance : 1e-6;

  // Identifiant de position quantifiée par sommet (deux sommets à moins de `tol` → même identifiant).
  const posKey = new Int32Array(vertexCount);
  const keyMap = new Map<string, number>();
  for (let v = 0; v < vertexCount; v++) {
    const k =
      Math.round(positions[v * 3] / tol) + ',' + Math.round(positions[v * 3 + 1] / tol) + ',' + Math.round(positions[v * 3 + 2] / tol);
    let id = keyMap.get(k);
    if (id === undefined) {
      id = keyMap.size;
      keyMap.set(k, id);
    }
    posKey[v] = id;
  }

  const ranges: GeometryGroup[] = groups.length ? groups : [{ start: 0, count: idx.length, materialIndex: 0 }];
  const out = new Uint32Array(idx.length);
  const outGroups: GeometryGroup[] = [];
  const seen = new Map<string, 1 | -1>();
  const areaEps = tol * tol * 1e-3;
  let w = 0;
  let degenerate = 0;
  let duplicate = 0;
  let backToBack = 0;

  for (const g of ranges) {
    const start = w;
    const end = Math.min(g.start + g.count, idx.length);
    for (let t = g.start; t + 2 < end; t += 3) {
      const i0 = idx[t];
      const i1 = idx[t + 1];
      const i2 = idx[t + 2];
      const k0 = posKey[i0];
      const k1 = posKey[i1];
      const k2 = posKey[i2];
      if (k0 === k1 || k1 === k2 || k0 === k2) {
        degenerate++;
        continue;
      }
      const ax = positions[i1 * 3] - positions[i0 * 3];
      const ay = positions[i1 * 3 + 1] - positions[i0 * 3 + 1];
      const az = positions[i1 * 3 + 2] - positions[i0 * 3 + 2];
      const bx = positions[i2 * 3] - positions[i0 * 3];
      const by = positions[i2 * 3 + 1] - positions[i0 * 3 + 1];
      const bz = positions[i2 * 3 + 2] - positions[i0 * 3 + 2];
      const cx = ay * bz - az * by;
      const cy = az * bx - ax * bz;
      const cz = ax * by - ay * bx;
      if (cx * cx + cy * cy + cz * cz <= areaEps * areaEps) {
        degenerate++;
        continue;
      }
      const sorted = [k0, k1, k2].sort((p, q) => p - q);
      const triKey = sorted[0] + ',' + sorted[1] + ',' + sorted[2];
      const parity = permutationParity(k0, k1, k2);
      const prev = seen.get(triKey);
      if (prev !== undefined) {
        duplicate++;
        if (prev !== parity) backToBack++;
        continue;
      }
      seen.set(triKey, parity);
      out[w++] = i0;
      out[w++] = i1;
      out[w++] = i2;
    }
    if (groups.length && w > start) outGroups.push({ start, count: w - start, materialIndex: g.materialIndex });
  }

  return { index: out.slice(0, w), groups: outGroups, degenerate, duplicate, backToBack };
}
