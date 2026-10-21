// Lecture tolérante de la peinture, opérations (ajout / modification / suppression par id) et leurs inverses
// (annuler / rétablir du panneau Peinture), repères P1, P2…
import type { FaceSelector, PaintColor, PaintMatch, PaintOp, PaintSettings, PaintTarget, PaintZone, Vec3 } from './types';
import { DEFAULT_CREASE_DEG, PAINT_FINISHES, emptyPaint } from './types';

const str = (v: unknown, max = 200): string | undefined => (typeof v === 'string' && v.trim() ? v.slice(0, max) : undefined);
const strs = (v: unknown): string[] | undefined => {
  if (!Array.isArray(v)) return undefined;
  const out = v.filter((x): x is string => typeof x === 'string' && !!x).slice(0, 500);
  return out.length ? out : undefined;
};
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const vec = (v: unknown): Vec3 | undefined => (Array.isArray(v) && v.length === 3 && v.every((x) => typeof x === 'number' && Number.isFinite(x)) ? [v[0], v[1], v[2]] : undefined);
const HEX = /^#[0-9a-fA-F]{6}$/;

export function cleanColor(v: unknown): PaintColor | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const id = str(o.id, 80);
  const tag = str(o.tag, 12);
  const hex = typeof o.hex === 'string' && HEX.test(o.hex) ? o.hex.toUpperCase() : undefined;
  if (!id || !tag || !hex) return null;
  const system = (['RAL', 'NCS', 'Pantone', 'fournisseur', 'autre'] as const).find((s) => s === o.system) ?? 'autre';
  const finish = PAINT_FINISHES.find((f) => f === o.finish);
  return {
    id,
    tag,
    name: str(o.name) ?? tag,
    system,
    ...(str(o.code, 40) ? { code: str(o.code, 40) } : {}),
    hex,
    ...(finish ? { finish } : {}),
    ...(str(o.product) ? { product: str(o.product) } : {}),
    ...(str(o.note, 500) ? { note: str(o.note, 500) } : {}),
    createdAt: str(o.createdAt, 40) ?? '',
    ...(str(o.by, 120) ? { by: str(o.by, 120) } : {}),
  };
}

function cleanMatch(v: unknown): PaintMatch | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const m: PaintMatch = {};
  for (const k of ['nodeIds', 'modulePaths', 'moduleIds', 'definitions'] as const) {
    const l = strs(o[k]);
    if (l) m[k] = l;
  }
  return m.nodeIds || m.modulePaths || m.definitions ? m : null;
}

function cleanFace(v: unknown): FaceSelector | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  const normal = vec(o.normal);
  const seed = vec(o.seed);
  const d = num(o.d);
  if (!normal || !seed || d === undefined) return undefined;
  const sideDeg = num(o.sideDeg);
  return { normal, d, seed, creaseDeg: num(o.creaseDeg) ?? DEFAULT_CREASE_DEG, ...(sideDeg !== undefined ? { sideDeg } : {}) };
}

export function cleanZone(v: unknown): PaintZone | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const id = str(o.id, 80);
  const colorId = str(o.colorId, 80);
  const t = o.target as Record<string, unknown> | undefined;
  const scope = t && (['face', 'side', 'node'] as const).find((s) => s === t.scope);
  const match = t ? cleanMatch(t.match) : null;
  const face = t ? cleanFace(t.face) : undefined;
  if (!id || !colorId || !scope || !match || (scope !== 'node' && !face)) return null;
  const target: PaintTarget = { scope, match, ...(face ? { face } : {}) };
  const source = (['click', 'duplicate', 'import'] as const).find((s) => s === o.source) ?? 'click';
  return { id, colorId, target, label: str(o.label, 300) ?? '', source, createdAt: str(o.createdAt, 40) ?? '', ...(str(o.by, 120) ? { by: str(o.by, 120) } : {}) };
}

/** Peinture lue telle quelle depuis les réglages : champs inconnus ignorés, entrées invalides retirées. */
export function cleanPaint(v: unknown): PaintSettings {
  if (!v || typeof v !== 'object') return emptyPaint();
  const o = v as Record<string, unknown>;
  const colors = (Array.isArray(o.colors) ? o.colors : []).map(cleanColor).filter((c): c is PaintColor => !!c);
  const ids = new Set(colors.map((c) => c.id));
  const zones = (Array.isArray(o.zones) ? o.zones : []).map(cleanZone).filter((z): z is PaintZone => !!z && ids.has(z.colorId));
  return { v: 1, colors, zones, updatedAt: str(o.updatedAt, 40) ?? '', ...(str(o.updatedBy, 120) ? { updatedBy: str(o.updatedBy, 120) } : {}) };
}

/** Applique des opérations (pur) : put = ajoute ou remplace par id (à sa place), del = retire. */
export function applyOps(p: PaintSettings, ops: PaintOp[]): PaintSettings {
  let colors = [...p.colors];
  let zones = [...p.zones];
  for (const o of ops) {
    if (o.op === 'color.put') {
      const i = colors.findIndex((c) => c.id === o.color.id);
      if (i >= 0) colors[i] = o.color;
      else colors.push(o.color);
    } else if (o.op === 'color.del') colors = colors.filter((c) => c.id !== o.id);
    else if (o.op === 'zone.put') {
      const i = zones.findIndex((z) => z.id === o.zone.id);
      if (i >= 0) zones[i] = o.zone;
      else zones.push(o.zone);
    } else if (o.op === 'zone.del') zones = zones.filter((z) => z.id !== o.id);
  }
  const ids = new Set(colors.map((c) => c.id));
  zones = zones.filter((z) => ids.has(z.colorId));
  return { ...p, colors, zones };
}

/** Opérations qui annulent `ops` appliquées sur `before` (dans l'ordre inverse). */
export function inverseOps(before: PaintSettings, ops: PaintOp[]): PaintOp[] {
  const inv: PaintOp[] = [];
  let state = before;
  for (const o of ops) {
    if (o.op === 'color.put') {
      const prev = state.colors.find((c) => c.id === o.color.id);
      inv.unshift(prev ? { op: 'color.put', color: prev } : { op: 'color.del', id: o.color.id });
    } else if (o.op === 'color.del') {
      const prev = state.colors.find((c) => c.id === o.id);
      // une couleur supprimée emporte ses zones : on les remet aussi
      const lost = state.zones.filter((z) => z.colorId === o.id);
      if (prev) inv.unshift({ op: 'color.put', color: prev }, ...lost.map((zone) => ({ op: 'zone.put' as const, zone })));
    } else if (o.op === 'zone.put') {
      const prev = state.zones.find((z) => z.id === o.zone.id);
      inv.unshift(prev ? { op: 'zone.put', zone: prev } : { op: 'zone.del', id: o.zone.id });
    } else if (o.op === 'zone.del') {
      const prev = state.zones.find((z) => z.id === o.id);
      if (prev) inv.unshift({ op: 'zone.put', zone: prev });
    }
    state = applyOps(state, [o]);
  }
  return inv;
}

/** Prochain repère libre : P1, P2… (un repère supprimé n'est pas réutilisé tant qu'un plus grand existe). */
export function nextTag(colors: PaintColor[]): string {
  const n = colors.reduce((m, c) => Math.max(m, Number(/^P(\d+)$/.exec(c.tag)?.[1] ?? 0)), 0);
  return `P${n + 1}`;
}

/** « RAL 9005 » ou le code libre. */
export function colorCode(c: Pick<PaintColor, 'system' | 'code'>): string {
  if (!c.code) return '';
  return c.system === 'RAL' ? `RAL ${c.code}` : c.system === 'autre' || c.system === 'fournisseur' ? c.code : `${c.system} ${c.code}`;
}

/** « RAL 9005 → RAL 7016 partout » : les zones d'une couleur passent à une autre (puis la première peut être retirée). */
export function reassignOps(p: PaintSettings, fromId: string, toId: string): PaintOp[] {
  return p.zones.filter((z) => z.colorId === fromId).map((z) => ({ op: 'zone.put' as const, zone: { ...z, colorId: toId } }));
}

/** Luminance relative (0 noir → 1 blanc) d'une couleur d'écran. */
export function luminance(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

/** Couleur d'écran mélangée avec le blanc (`t` = part de couleur), même rendu à l'écran, au PDF et au DXF. */
export function mixWhite(hex: string, t: number): string {
  const out = [1, 3, 5].map((i) => Math.round(255 - (255 - parseInt(hex.slice(i, i + 2), 16)) * t));
  return '#' + out.map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();
}
