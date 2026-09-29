// Matrice de rigidité creuse par blocs 6 × 6 (un bloc par couple de nœuds reliés) et factorisation LDLᵀ par blocs
// (algorithme « up-looking » de T. Davis, LDL, transposé aux blocs : L unitaire, D bloc-diagonale 6 × 6 inversée par
// Cholesky). Un pivot nul ou négatif signale un mécanisme ou une instabilité (ddl et nœud renvoyés). Fonctions pures.
import type { Graph, OrderingMethod } from './ordering';
import { bestOrdering, symbolic, upperPattern } from './ordering';

const B = 6;
const BB = 36;

export interface BlockPattern {
  n: number;
  /** perm[nouveau] = ancien, iperm[ancien] = nouveau */
  perm: Int32Array;
  iperm: Int32Array;
  /** triangle supérieur par colonnes (numérotation nouvelle), diagonale comprise */
  colPtr: Int32Array;
  rowIdx: Int32Array;
  parent: Int32Array;
  Lp: Int32Array;
  method: OrderingMethod;
}

export function makePattern(g: Graph, coords: ArrayLike<number>): BlockPattern {
  const { perm, method } = bestOrdering(g, coords);
  const { iperm, colPtr, rowIdx } = upperPattern(g, perm);
  const { parent, Lp } = symbolic(g.n, colPtr, rowIdx);
  return { n: g.n, perm, iperm, colPtr, rowIdx, parent, Lp, method };
}

/** Position du bloc (a, b) (nœuds d'origine) dans le stockage supérieur, et s'il est stocké transposé. */
export function blockSlot(p: BlockPattern, a: number, b: number): { slot: number; transposed: boolean } {
  let i = p.iperm[a];
  let k = p.iperm[b];
  const transposed = i > k;
  if (transposed) [i, k] = [k, i];
  let lo = p.colPtr[k];
  let hi = p.colPtr[k + 1] - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const r = p.rowIdx[mid];
    if (r === i) return { slot: mid, transposed };
    if (r < i) lo = mid + 1;
    else hi = mid - 1;
  }
  throw new Error(`Bloc (${a}, ${b}) absent de la structure creuse`);
}

export class SingularError extends Error {
  constructor(
    /** nœud d'origine et ddl (0–5) du pivot nul */
    readonly node: number,
    readonly dof: number,
    readonly negative: boolean,
  ) {
    super(`Pivot ${negative ? 'négatif' : 'nul'} au nœud ${node}, ddl ${dof}`);
    this.name = 'SingularError';
  }
}

export interface BlockFactor {
  p: BlockPattern;
  Li: Int32Array;
  Lx: Float64Array;
  Dinv: Float64Array;
}

/** Cholesky 6 × 6 en place (triangle inférieur) puis inverse complète ; renvoie le ddl du premier pivot insuffisant. */
function invertDiag(D: Float64Array, off: number, orig: Float64Array, out: Float64Array, outOff: number, tol: number): { dof: number; negative: boolean } | null {
  const Lc = new Float64Array(BB);
  for (let j = 0; j < B; j++) {
    let d = D[off + j * B + j];
    for (let k = 0; k < j; k++) d -= Lc[j * B + k] * Lc[j * B + k];
    if (!(d > tol * Math.max(Math.abs(orig[j]), 1e-300))) return { dof: j, negative: d < 0 };
    const ljj = Math.sqrt(d);
    Lc[j * B + j] = ljj;
    for (let i = j + 1; i < B; i++) {
      let s = D[off + i * B + j];
      for (let k = 0; k < j; k++) s -= Lc[i * B + k] * Lc[j * B + k];
      Lc[i * B + j] = s / ljj;
    }
  }
  // inverse de L (triangulaire inférieure), puis D⁻¹ = L⁻ᵀ L⁻¹
  const Li = new Float64Array(BB);
  for (let j = 0; j < B; j++) {
    Li[j * B + j] = 1 / Lc[j * B + j];
    for (let i = j + 1; i < B; i++) {
      let s = 0;
      for (let k = j; k < i; k++) s -= Lc[i * B + k] * Li[k * B + j];
      Li[i * B + j] = s / Lc[i * B + i];
    }
  }
  for (let r = 0; r < B; r++)
    for (let c = r; c < B; c++) {
      let s = 0;
      for (let k = c; k < B; k++) s += Li[k * B + r] * Li[k * B + c];
      out[outOff + r * B + c] = s;
      out[outOff + c * B + r] = s;
    }
  return null;
}

/**
 * Factorisation A = L D Lᵀ. `values` = blocs du triangle supérieur (36 valeurs par bloc, ligne par ligne :
 * valeur (r, c) = terme (ddl r du nœud ligne, ddl c du nœud colonne)).
 */
export function factorize(p: BlockPattern, values: Float64Array, tol = 1e-11): BlockFactor {
  const n = p.n;
  const Lnnz = p.Lp[n];
  const Li = new Int32Array(Lnnz);
  const Lx = new Float64Array(Lnnz * BB);
  const Dinv = new Float64Array(n * BB);
  const Y = new Float64Array(n * BB);
  const flag = new Int32Array(n);
  const pattern = new Int32Array(n);
  const lnz = new Int32Array(n);
  const D = new Float64Array(BB);
  const yi = new Float64Array(BB);
  const lki = new Float64Array(BB);
  const orig = new Float64Array(B);
  for (let k = 0; k < n; k++) {
    let top = n;
    flag[k] = k;
    for (let q = p.colPtr[k]; q < p.colPtr[k + 1]; q++) {
      let i = p.rowIdx[q];
      const yo = i * BB;
      const vo = q * BB;
      for (let t = 0; t < BB; t++) Y[yo + t] += values[vo + t];
      let len = 0;
      for (; flag[i] !== k; i = p.parent[i]) {
        pattern[len++] = i;
        flag[i] = k;
      }
      while (len > 0) pattern[--top] = pattern[--len];
    }
    const ko = k * BB;
    for (let t = 0; t < BB; t++) {
      D[t] = Y[ko + t];
      Y[ko + t] = 0;
    }
    for (let j = 0; j < B; j++) orig[j] = D[j * B + j];
    for (; top < n; top++) {
      const i = pattern[top];
      const io = i * BB;
      for (let t = 0; t < BB; t++) {
        yi[t] = Y[io + t];
        Y[io + t] = 0;
      }
      const end = p.Lp[i] + lnz[i];
      for (let q = p.Lp[i]; q < end; q++) {
        // Y[r] −= L(r, i) · yi
        const ro = Li[q] * BB;
        const lo = q * BB;
        for (let r = 0; r < B; r++)
          for (let c = 0; c < B; c++) {
            let s = 0;
            for (let t = 0; t < B; t++) s += Lx[lo + r * B + t] * yi[t * B + c];
            Y[ro + r * B + c] -= s;
          }
      }
      // L(k, i) = yiᵀ D_i⁻¹ ; D_k −= L(k, i) · yi
      for (let r = 0; r < B; r++)
        for (let c = 0; c < B; c++) {
          let s = 0;
          for (let t = 0; t < B; t++) s += yi[t * B + r] * Dinv[io + t * B + c];
          lki[r * B + c] = s;
        }
      for (let r = 0; r < B; r++)
        for (let c = 0; c < B; c++) {
          let s = 0;
          for (let t = 0; t < B; t++) s += lki[r * B + t] * yi[t * B + c];
          D[r * B + c] -= s;
        }
      const q = p.Lp[i] + lnz[i]++;
      Li[q] = k;
      Lx.set(lki, q * BB);
    }
    const bad = invertDiag(D, 0, orig, Dinv, ko, tol);
    if (bad) throw new SingularError(p.perm[k], bad.dof, bad.negative);
  }
  return { p, Li, Lx, Dinv };
}

/** Résout A x = b (vecteurs de 6 n valeurs, numérotation d'origine des nœuds). */
export function solveFactor(f: BlockFactor, b: ArrayLike<number>): Float64Array {
  const { p, Li, Lx, Dinv } = f;
  const n = p.n;
  const x = new Float64Array(n * B);
  for (let k = 0; k < n; k++) for (let d = 0; d < B; d++) x[k * B + d] = b[p.perm[k] * B + d];
  const t = new Float64Array(B);
  for (let i = 0; i < n; i++) {
    const xo = i * B;
    for (let q = p.Lp[i]; q < p.Lp[i + 1]; q++) {
      const ro = Li[q] * B;
      const lo = q * BB;
      for (let r = 0; r < B; r++) {
        let s = 0;
        for (let c = 0; c < B; c++) s += Lx[lo + r * B + c] * x[xo + c];
        x[ro + r] -= s;
      }
    }
  }
  for (let i = 0; i < n; i++) {
    const xo = i * B;
    const dO = i * BB;
    for (let r = 0; r < B; r++) {
      let s = 0;
      for (let c = 0; c < B; c++) s += Dinv[dO + r * B + c] * x[xo + c];
      t[r] = s;
    }
    for (let r = 0; r < B; r++) x[xo + r] = t[r];
  }
  for (let i = n - 1; i >= 0; i--) {
    const xo = i * B;
    for (let q = p.Lp[i]; q < p.Lp[i + 1]; q++) {
      const ro = Li[q] * B;
      const lo = q * BB;
      // x_i −= L(r, i)ᵀ x_r
      for (let c = 0; c < B; c++) {
        let s = 0;
        for (let r = 0; r < B; r++) s += Lx[lo + r * B + c] * x[ro + r];
        x[xo + c] -= s;
      }
    }
  }
  const out = new Float64Array(n * B);
  for (let k = 0; k < n; k++) for (let d = 0; d < B; d++) out[p.perm[k] * B + d] = x[k * B + d];
  return out;
}
