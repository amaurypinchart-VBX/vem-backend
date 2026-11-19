// Trous et taraudages dits dans l'application (A. Pinchart 19.11.2026 : « faudrait pouvoir dire sur l'app les
// différents trous et taraudages ») — pur. Le modèle donne la position et le diamètre dessiné de chaque trou ; ce qu'on
// en fait (perçage, taraudage M8, fraisage, vis autoperceuse, rivet, rien) est choisi ici et enregistré avec le modèle
// (`plans_model_versions.settings.holeSpecs`, recopié à la version suivante comme les autres réglages) :
// - pour tout le modèle, par diamètre dessiné (« tous les Ø6,6 = M8 ») : clé `d6.6`, retrouvée à ± 0,12 mm ;
// - pour une pièce (son empreinte de forme) et un groupe de trous (axe, désignation détectée, parois) : gagne sur le modèle.
// Les repères des pièces (P01…) ne dépendent pas de ces choix : seuls les textes des planches changent.
import { stableId } from '../core/hash';
import type { Hole } from './analyze';
import { ISO, holeName, niceDiameter } from './analyze';
import type { PartType } from './parts';
import { partKey } from './parts';

export const HOLE_OPS = ['drill', 'tap', 'countersink', 'screw', 'rivet', 'none'] as const;
export type HoleOp = (typeof HOLE_OPS)[number];

export const HOLE_OP_LABEL: Record<HoleOp, string> = {
  drill: 'Perçage',
  tap: 'Taraudage',
  countersink: 'Perçage + fraisage (vis tête fraisée)',
  screw: 'Vis autoperceuse / préperçage',
  rivet: 'Rivet aveugle',
  none: 'Rien à usiner (ne pas mettre sur les plans)',
};

export interface HoleSpec {
  op: HoleOp;
  /** Ø de perçage (perçage, passage de vis fraisée, préperçage, rivet) — mm */
  d?: number;
  /** taille métrique : taraudage M8 = 8, vis fraisée M6 = 6 */
  size?: number;
  /** pas (taraudage fin), sinon pas gros ISO */
  pitch?: number;
  /** Ø de fraisage (vis tête fraisée) */
  head?: number;
  /** précision libre : « vis autoperceuse 5,5 × 25 », « depuis l'intérieur »… */
  note?: string;
}

export interface HoleSpecs {
  /** clé `d6.6` = diamètre dessiné (0,1 mm) */
  byDiameter: Record<string, HoleSpec>;
  /** clé `<empreinte de la pièce>|<axe>|<désignation détectée>|<parois>` */
  byPart: Record<string, HoleSpec>;
}

export const EMPTY_HOLE_SPECS: HoleSpecs = { byDiameter: {}, byPart: {} };

/** Ø dessiné retrouvé d'une analyse à l'autre (bruit de mesure ≤ 0,05 mm). */
export const DIAMETER_TOL = 0.12;

/** Tailles métriques proposées. */
export const METRIC_SIZES = ISO.map((t) => t.m);

/** Passage de vis ISO 273 série moyenne. */
const CLEARANCE: Record<number, number> = { 3: 3.4, 4: 4.5, 5: 5.5, 6: 6.6, 8: 9, 10: 11, 12: 13.5, 14: 15.5, 16: 17.5, 20: 22, 24: 26 };
/** Ø de fraisage à 90° pour vis à tête fraisée ISO 10642 (ISO 15065), valeur proposée, modifiable. */
const CSK: Record<number, number> = { 3: 6.3, 4: 9.4, 5: 10.4, 6: 12.6, 8: 17.3, 10: 20, 12: 24, 16: 31, 20: 40 };

export const coarsePitch = (m: number) => ISO.find((t) => t.m === m)?.p;
export const tapDrill = (m: number, pitch?: number) => {
  const iso = ISO.find((t) => t.m === m);
  // pas fin : perçage = M − pas
  if (pitch && iso && Math.abs(pitch - iso.p) > 1e-6) return Math.round((m - pitch) * 10) / 10;
  return iso?.drill;
};
export const clearanceFor = (m: number) => CLEARANCE[m];
export const countersinkFor = (m: number) => CSK[m];

const num = (v: unknown, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : undefined);

/** Lecture tolérante d'un choix. */
export function cleanHoleSpec(v: unknown): HoleSpec | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const op = HOLE_OPS.find((x) => x === o.op);
  if (!op) return null;
  const s: HoleSpec = { op };
  const d = num(o.d, 0.5, 200);
  const size = num(o.size, 1, 64);
  const pitch = num(o.pitch, 0.2, 6);
  const head = num(o.head, 1, 200);
  if (d !== undefined) s.d = d;
  if (size !== undefined) s.size = size;
  if (pitch !== undefined) s.pitch = pitch;
  if (head !== undefined) s.head = head;
  if (typeof o.note === 'string' && o.note.trim()) s.note = o.note.trim().slice(0, 120);
  if (op === 'tap' && !s.size) return null;
  return s;
}

/** Lecture tolérante des réglages. */
export function cleanHoleSpecs(v: unknown): HoleSpecs {
  const out: HoleSpecs = { byDiameter: {}, byPart: {} };
  if (!v || typeof v !== 'object') return out;
  const o = v as Record<string, unknown>;
  for (const k of ['byDiameter', 'byPart'] as const) {
    const m = o[k];
    if (!m || typeof m !== 'object') continue;
    for (const [key, val] of Object.entries(m as Record<string, unknown>)) {
      if (key.length > 200) continue;
      if (k === 'byDiameter' && !/^d\d+(\.\d)?$/.test(key)) continue;
      const s = cleanHoleSpec(val);
      if (s) out[k][key] = s;
    }
  }
  return out;
}

/** « d6.6 » */
export function diameterKey(d: number): string {
  return `d${Math.round(d * 10) / 10}`;
}

/** Empreinte stable d'un type de pièce (forme, dimensions, perçages). */
export function partSignature(t: Pick<PartType, 'rep'>): string {
  return stableId(partKey(t.rep));
}

/** Clé d'un groupe de trous d'une pièce (désignation détectée, jamais celle d'un choix). */
export function partHoleKey(sig: string, h: Pick<Hole, 'axis' | 'd' | 'thread' | 'walls'>): string {
  return `${sig}|${h.axis}|${holeName({ d: h.d, thread: h.thread })}|${h.walls}`;
}

/** Choix du modèle pour un Ø dessiné (le plus proche à ± 0,12 mm). */
export function diameterSpec(specs: HoleSpecs, d: number): { key: string; spec: HoleSpec } | undefined {
  let best: { key: string; spec: HoleSpec; e: number } | undefined;
  for (const [key, spec] of Object.entries(specs.byDiameter)) {
    const e = Math.abs(Number(key.slice(1)) - d);
    if (e <= DIAMETER_TOL && (!best || e < best.e)) best = { key, spec, e };
  }
  return best && { key: best.key, spec: best.spec };
}

/** Choix qui s'applique à un trou d'une pièce : celui de la pièce, sinon celui du Ø dans le modèle. */
export function specFor(specs: HoleSpecs, sig: string, h: Hole): { spec: HoleSpec; scope: 'part' | 'model' } | undefined {
  const p = specs.byPart[partHoleKey(sig, h)];
  if (p) return { spec: p, scope: 'part' };
  const m = diameterSpec(specs, h.d);
  return m && { spec: m.spec, scope: 'model' };
}

const f1 = (v: number) => String(Math.round(v * 10) / 10);

/** Désignation courte (repères, liste de débit) : « M8 », « Ø10 », « CSK M6 », « Rivet Ø4.1 ». */
export function specName(s: HoleSpec, drawn: number): string {
  const d = s.d ?? niceDiameter(drawn);
  switch (s.op) {
    case 'tap': {
      const p = s.pitch ?? coarsePitch(s.size!);
      return p !== undefined && p !== coarsePitch(s.size!) ? `M${s.size}×${p}` : `M${s.size}`;
    }
    case 'countersink':
      return s.size ? `CSK M${s.size}` : `Ø${f1(d)} CSK`;
    case 'screw':
      return s.d ? `Screw Ø${f1(s.d)}` : 'Screw';
    case 'rivet':
      return `Rivet Ø${f1(d)}`;
    case 'none':
      return '';
    default:
      return `Ø${f1(d)}`;
  }
}

/** Opération pour la table HOLES (anglais). */
export function specAction(s: HoleSpec, drawn: number, walls: number): string {
  const through = walls > 1 ? ` through ${walls} walls` : '';
  const note = s.note ? ` — ${s.note}` : '';
  const d = s.d ?? niceDiameter(drawn);
  switch (s.op) {
    case 'tap': {
      const p = s.pitch ?? coarsePitch(s.size!) ?? 0;
      const drill = s.d ?? tapDrill(s.size!, s.pitch);
      return `${drill ? `Drill Ø${f1(drill)} + ` : ''}tap M${s.size}×${p}${through}${note}`;
    }
    case 'countersink': {
      const hole = s.d ?? (s.size ? clearanceFor(s.size) : undefined) ?? d;
      const head = s.head ?? (s.size ? countersinkFor(s.size) : undefined);
      return `Drill Ø${f1(hole)}${through} + countersink 90°${head ? ` Ø${f1(head)}` : ''}${s.size ? ` (M${s.size} flat head screw)` : ''}${note}`;
    }
    case 'screw':
      return `${s.d ? `Pre-drill Ø${f1(s.d)} for` : 'No drilling —'} self-drilling screw${through}${note}`;
    case 'rivet':
      return `Drill Ø${f1(d)}${through} for blind rivet${note}`;
    case 'none':
      return `Not machined${note}`;
    default:
      return `Drill Ø${f1(d)}${through}${note}`;
  }
}

/** Choix complet, avec les valeurs par défaut écrites (Ø de taraudage, passage, fraisage) : pour l'écran. */
export function specSummary(s: HoleSpec, drawn: number, walls = 1): string {
  return s.op === 'none' ? 'rien à usiner' : specAction(s, drawn, walls);
}

/**
 * Types de pièces avec les choix appliqués : chaque trou porte son choix (`Hole.spec`), les trous « rien à usiner » sont
 * retirés (pas de cote, pas de repère, pas de ligne HOLES). Les repères P01… et l'ordre restent ceux de la détection.
 */
export function applyHoleSpecs(types: PartType[], specs: HoleSpecs | undefined): PartType[] {
  if (!specs || (!Object.keys(specs.byDiameter).length && !Object.keys(specs.byPart).length)) return types;
  return types.map((t) => {
    const sig = partSignature(t);
    let changed = false;
    const holes: Hole[] = [];
    for (const h of t.rep.geo.holes) {
      const hit = specFor(specs, sig, h);
      if (!hit) {
        holes.push(h);
        continue;
      }
      changed = true;
      if (hit.spec.op === 'none') continue;
      holes.push({ ...h, spec: hit.spec });
    }
    return changed ? { ...t, rep: { ...t.rep, geo: { ...t.rep.geo, holes } } } : t;
  });
}

/** Trous du modèle regroupés par Ø dessiné (classes à ± 0,15 mm) : la liste « pour tout le modèle » de l'écran. */
export interface DiameterClass {
  key: string;
  /** Ø moyen dessiné */
  d: number;
  holes: number;
  parts: string[];
  /** proposition de la détection : « M8×1.25 », « Ø10 » */
  detected: string;
}

export function diameterClasses(types: PartType[]): DiameterClass[] {
  const all: Array<{ d: number; mark: string; qty: number; name: string }> = [];
  for (const t of types) for (const h of t.rep.geo.holes) all.push({ d: h.d, mark: t.mark, qty: t.qty, name: holeName(h) });
  all.sort((a, b) => a.d - b.d);
  const out: Array<{ ds: number[]; marks: Set<string>; holes: number; names: Map<string, number> }> = [];
  for (const h of all) {
    const last = out[out.length - 1];
    if (last && h.d - last.ds[last.ds.length - 1] <= 0.15) {
      last.ds.push(h.d);
      last.marks.add(h.mark);
      last.holes += h.qty;
      last.names.set(h.name, (last.names.get(h.name) ?? 0) + 1);
    } else out.push({ ds: [h.d], marks: new Set([h.mark]), holes: h.qty, names: new Map([[h.name, 1]]) });
  }
  return out.map((c) => {
    const d = c.ds.reduce((a, b) => a + b, 0) / c.ds.length;
    const detected = [...c.names.entries()].sort((a, b) => b[1] - a[1])[0][0];
    return { key: diameterKey(d), d, holes: c.holes, parts: [...c.marks].sort(), detected };
  });
}
