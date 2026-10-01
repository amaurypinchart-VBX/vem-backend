// Numérotation des nœuds pour la factorisation creuse : degré minimum (graphe d'élimination exact), dissection
// emboîtée géométrique et Reverse Cuthill-McKee (profil). On garde celle qui remplit le moins le facteur.
// Graphe au niveau des nœuds (un bloc 6 × 6 par nœud). Fonctions pures.

export interface Graph {
  n: number;
  /** voisins du nœud v : idx[ptr[v]] … idx[ptr[v + 1] − 1] (sans le nœud lui-même, sans doublon) */
  ptr: Int32Array;
  idx: Int32Array;
}

export function buildGraph(n: number, edges: ArrayLike<number>): Graph {
  const sets: Array<Set<number>> = Array.from({ length: n }, () => new Set<number>());
  for (let e = 0; e + 1 < edges.length; e += 2) {
    const a = edges[e];
    const b = edges[e + 1];
    if (a === b) continue;
    sets[a].add(b);
    sets[b].add(a);
  }
  const ptr = new Int32Array(n + 1);
  for (let v = 0; v < n; v++) ptr[v + 1] = ptr[v] + sets[v].size;
  const idx = new Int32Array(ptr[n]);
  for (let v = 0; v < n; v++) {
    const s = [...sets[v]].sort((x, y) => x - y);
    idx.set(s, ptr[v]);
  }
  return { n, ptr, idx };
}

const degree = (g: Graph, v: number) => g.ptr[v + 1] - g.ptr[v];

/** Reverse Cuthill-McKee, composante par composante (départ : nœud pseudo-périphérique). Retourne ordre[nouveau] = ancien. */
export function rcm(g: Graph): Int32Array {
  const order: number[] = [];
  const seen = new Uint8Array(g.n);
  const bfs = (start: number, mark: Uint8Array): { last: number[]; levels: number } => {
    let frontier = [start];
    mark[start] = 1;
    let levels = 0;
    let last = frontier;
    while (frontier.length) {
      last = frontier;
      levels++;
      const next: number[] = [];
      for (const v of frontier)
        for (let p = g.ptr[v]; p < g.ptr[v + 1]; p++) {
          const w = g.idx[p];
          if (!mark[w]) {
            mark[w] = 1;
            next.push(w);
          }
        }
      frontier = next;
    }
    return { last, levels };
  };
  for (let s = 0; s < g.n; s++) {
    if (seen[s]) continue;
    // nœud pseudo-périphérique : on repart du plus petit degré du dernier niveau tant que la profondeur augmente
    let start = s;
    let depth = 0;
    for (let k = 0; k < 5; k++) {
      const mark = new Uint8Array(g.n);
      const { last, levels } = bfs(start, mark);
      if (levels <= depth) break;
      depth = levels;
      start = last.reduce((best, v) => (degree(g, v) < degree(g, best) ? v : best), last[0]);
    }
    const queue = [start];
    seen[start] = 1;
    for (let h = 0; h < queue.length; h++) {
      const v = queue[h];
      order.push(v);
      const nb: number[] = [];
      for (let p = g.ptr[v]; p < g.ptr[v + 1]; p++) if (!seen[g.idx[p]]) nb.push(g.idx[p]);
      nb.sort((x, y) => degree(g, x) - degree(g, y));
      for (const w of nb) {
        seen[w] = 1;
        queue.push(w);
      }
    }
  }
  return Int32Array.from(order.reverse());
}

/**
 * Dissection emboîtée géométrique : on coupe l'ensemble des nœuds en deux par la médiane de sa plus grande dimension,
 * les nœuds de la frontière forment le séparateur, numéroté après les deux moitiés (récursivement).
 */
export function nestedDissection(g: Graph, coords: ArrayLike<number>, leaf = 48): Int32Array {
  const out: number[] = [];
  const inSet = new Int32Array(g.n).fill(-1);
  let stamp = 0;
  const rec = (nodes: number[]) => {
    if (nodes.length <= leaf) {
      out.push(...nodes);
      return;
    }
    let axis = 0;
    let best = -1;
    for (let a = 0; a < 3; a++) {
      let lo = Infinity;
      let hi = -Infinity;
      for (const v of nodes) {
        const c = coords[v * 3 + a];
        if (c < lo) lo = c;
        if (c > hi) hi = c;
      }
      if (hi - lo > best) [best, axis] = [hi - lo, a];
    }
    const sorted = [...nodes].sort((u, v) => coords[u * 3 + axis] - coords[v * 3 + axis] || u - v);
    const mid = sorted.length >> 1;
    const idL = ++stamp;
    const idR = ++stamp;
    for (let k = 0; k < sorted.length; k++) inSet[sorted[k]] = k < mid ? idL : idR;
    // frontière de chaque côté : nœuds reliés à l'autre moitié ; on garde la plus petite comme séparateur
    const borderOf = (side: number, other: number) =>
      sorted.filter((v) => {
        if (inSet[v] !== side) return false;
        for (let p = g.ptr[v]; p < g.ptr[v + 1]; p++) if (inSet[g.idx[p]] === other) return true;
        return false;
      });
    const bl = borderOf(idL, idR);
    const br = borderOf(idR, idL);
    const sep = bl.length <= br.length ? bl : br;
    if (sep.length >= nodes.length * 0.5) {
      out.push(...nodes);
      return;
    }
    const sepSet = new Set(sep);
    const left = sorted.slice(0, mid).filter((v) => !sepSet.has(v));
    const right = sorted.slice(mid).filter((v) => !sepSet.has(v));
    rec(left);
    rec(right);
    out.push(...sep);
  };
  rec(Array.from({ length: g.n }, (_, v) => v));
  return Int32Array.from(out);
}

/**
 * Degré minimum : on élimine à chaque pas le nœud qui a le moins de voisins dans le graphe d'élimination, ses voisins
 * formant ensuite une clique (remplissage). Égalités départagées par le numéro du nœud (résultat déterministe).
 */
export function minimumDegree(g: Graph): Int32Array {
  const n = g.n;
  const adj = Array.from({ length: n }, (_, v) => new Set<number>(g.idx.subarray(g.ptr[v], g.ptr[v + 1])));
  const alive = new Uint8Array(n).fill(1);
  const order = new Int32Array(n);
  for (let step = 0; step < n; step++) {
    let best = -1;
    let bestDeg = Infinity;
    for (let v = 0; v < n; v++)
      if (alive[v] && adj[v].size < bestDeg) {
        bestDeg = adj[v].size;
        best = v;
      }
    const nb = [...adj[best]];
    for (const a of nb) {
      const s = adj[a];
      s.delete(best);
      for (const b of nb) if (a !== b) s.add(b);
    }
    adj[best].clear();
    alive[best] = 0;
    order[step] = best;
  }
  return order;
}

export interface Symbolic {
  /** parent dans l'arbre d'élimination (−1 = racine) */
  parent: Int32Array;
  /** Lp[k] = début de la colonne k de L (blocs sous la diagonale) ; Lp[n] = nombre total de blocs */
  Lp: Int32Array;
}

/** Arbre d'élimination et nombre de blocs par colonne de L (algorithme de T. Davis, LDL), graphe déjà renuméroté. */
export function symbolic(n: number, colPtr: Int32Array, rowIdx: Int32Array): Symbolic {
  const parent = new Int32Array(n).fill(-1);
  const flag = new Int32Array(n);
  const lnz = new Int32Array(n);
  for (let k = 0; k < n; k++) {
    flag[k] = k;
    for (let p = colPtr[k]; p < colPtr[k + 1]; p++) {
      let i = rowIdx[p];
      if (i >= k) continue;
      for (; flag[i] !== k; i = parent[i]) {
        if (parent[i] === -1) parent[i] = k;
        lnz[i]++;
        flag[i] = k;
      }
    }
  }
  const Lp = new Int32Array(n + 1);
  for (let k = 0; k < n; k++) Lp[k + 1] = Lp[k] + lnz[k];
  return { parent, Lp };
}

/** Structure triangulaire supérieure (colonne par colonne, lignes triées, diagonale comprise) après renumérotation. */
export function upperPattern(g: Graph, perm: Int32Array): { iperm: Int32Array; colPtr: Int32Array; rowIdx: Int32Array } {
  const n = g.n;
  const iperm = new Int32Array(n);
  for (let k = 0; k < n; k++) iperm[perm[k]] = k;
  const cols: number[][] = Array.from({ length: n }, (_, k) => [k]);
  for (let v = 0; v < n; v++)
    for (let p = g.ptr[v]; p < g.ptr[v + 1]; p++) {
      const a = iperm[v];
      const b = iperm[g.idx[p]];
      if (a < b) cols[b].push(a);
    }
  const colPtr = new Int32Array(n + 1);
  for (let k = 0; k < n; k++) colPtr[k + 1] = colPtr[k] + cols[k].length;
  const rowIdx = new Int32Array(colPtr[n]);
  for (let k = 0; k < n; k++) rowIdx.set(cols[k].sort((x, y) => x - y), colPtr[k]);
  return { iperm, colPtr, rowIdx };
}

export type OrderingMethod = 'md' | 'nd' | 'rcm';

/** Meilleure numérotation : le moins d'opérations de factorisation (Σ blocs par colonne²) entre les trois méthodes. */
export function bestOrdering(g: Graph, coords: ArrayLike<number>): { perm: Int32Array; fill: number; method: OrderingMethod } {
  const cand = [
    { method: 'md' as const, perm: minimumDegree(g) },
    { method: 'nd' as const, perm: nestedDissection(g, coords, 16) },
    { method: 'rcm' as const, perm: rcm(g) },
  ].map((c) => {
    const up = upperPattern(g, c.perm);
    const s = symbolic(g.n, up.colPtr, up.rowIdx);
    let cost = 0;
    for (let k = 0; k < g.n; k++) cost += (s.Lp[k + 1] - s.Lp[k] + 1) ** 2;
    return { ...c, fill: s.Lp[g.n], cost };
  });
  const best = cand.reduce((a, b) => (b.cost < a.cost ? b : a));
  return { perm: best.perm, fill: best.fill, method: best.method };
}
