// Plan des appuis (écran et PDF) et fiche de calage A4 d'une page : hypothèses, plan, calage par type d'appui,
// matériel à préparer, réserves. SVG en mm (viewBox 210 × 297), converti en PDF vectoriel par sheets/pdf/pdf.ts.
import type { ReactNode } from 'react';
import type { CalageResult, SupportCheck } from '../core/calage';
import type { EstimateModule, GroupReaction, P2 } from '../core/estimate';
import { groupTypeKey } from '../core/estimate';
import { GROUND_NOTE } from '../core/ground';
import type { Lang } from './i18n';
import { LABELS, num } from './i18n';
import { CALAGE_LABELS } from './calageI18n';
import { translate } from './translate';
import { typeColor } from './calagePlan';
import { verdictOf } from '../core/records';
import { fmtNumber } from '../core/units';
import { FONT_SANS } from '../../sheets/template';
import { LOGO_COLOR, VIEWBOX_WORDMARK } from '../../sheets/logos';

/** Couleur d'un taux de travail sur les plans (vert ≤ 0,90, orange ≤ 1,00, rouge au-delà) : écran et PDF. */
export const CHECK_COLORS = { ok: '#16a34a', limit: '#d97706', fail: '#dc2626' } as const;
export const checkColor = (eta: number) => CHECK_COLORS[verdictOf(eta) === 'ok' ? 'ok' : verdictOf(eta) === 'limit' ? 'limit' : 'fail'];

/** Mots des plans d'appuis (écran, fiche) dans la langue du document. */
const PLAN_WORDS: Record<Lang, { slab: string; roadway: string; colon: string }> = {
  fr: { slab: 'Dalle', roadway: 'Plaques de roulage sur toute la surface', colon: ' : ' },
  de: { slab: 'Decke', roadway: 'Fahrplatten auf der ganzen Fläche', colon: ': ' },
  en: { slab: 'Slab', roadway: 'Roadway plates over the whole area', colon: ': ' },
};

export const TYPE_COLORS: Record<string, string> = { '1': '#2563eb', '2': '#16a34a', '3': '#d97706', '4': '#dc2626', M: '#7c3aed', E: '#0891b2' };
export const typeKey = (r: GroupReaction) => groupTypeKey(r.group);

const n1 = (v: number, d = 1) => fmtNumber(v, d);

interface PlanProps {
  modules: EstimateModule[];
  reactions: GroupReaction[];
  /** cadre de dessin (unités de l'appelant : px à l'écran, mm dans le PDF) */
  x: number;
  y: number;
  w: number;
  h: number;
  /** taille des textes (mêmes unités) */
  text: number;
  selected?: string | null;
  onSelect?: (id: string) => void;
  /** texte au centre de l'emprise au sol (sinon le nombre de niveaux) et teinte de l'emprise */
  zoneLabel?: (m: EstimateModule, levels: number) => string[];
  zoneFill?: (m: EstimateModule) => string | undefined;
  /** repère d'implantation : origine en bas à gauche, x vers la droite, y vers le haut */
  axes?: boolean;
  /** couleur de chaque appui (sinon celle de son type) et seconde ligne de son étiquette (sinon Rz,k) */
  pointColor?: (r: GroupReaction) => string | undefined;
  pointSub?: (r: GroupReaction) => string | undefined;
  /** plaques de calage à l'échelle, à leur place (sous les points) */
  plates?: PlanPlate[];
}

/** Plaque de calage en plan (mêmes coordonnées que les Viewbox). */
export interface PlanPlate {
  id: string;
  corners: P2[];
  color: string;
  /** centrée sous l'appui (dépasse de l'installation) */
  centered?: boolean;
  /** texte écrit dans la plaque (pression au sol…) */
  label?: string[];
  /** zone de dalle d'une Viewbox (charge répartie) : fond léger, trait fin, texte au centre */
  zone?: boolean;
  /** zone de dalle : Viewbox dont c'est la dalle (son poids au m² est écrit avec le numéro de la Viewbox) */
  zoneOf?: string;
  /** plaques de roulage sur toute la surface : contour de la surface couverte, légende dans un coin du plan */
  roadway?: boolean;
}

/** Couleur des madriers de la solution retenue (grille, plateau) sur les plans. */
export const TIMBER_COLOR = '#a16207';

/**
 * Plaques de calage des appuis (couche du dessous), pour les plans A4 ; madriers de la solution retenue
 * (`CalageResult.remedy`) dessous, le contour d'ensemble avec son libellé.
 */
export function planPlates(
  checks: SupportCheck[],
  opts: {
    color?: (c: SupportCheck) => string;
    label?: (c: SupportCheck) => string[];
    remedy?: CalageResult['remedy'];
    slab?: CalageResult['slab'];
    zoneColor?: (eta: number) => string;
    /** plaques de roulage retenues : contour de la surface couverte (`CalageResult.roadwayOutline`) */
    roadway?: P2[][];
    lang?: Lang;
  } = {},
): PlanPlate[] {
  const lang = opts.lang ?? 'fr';
  const roadway: PlanPlate[] = (opts.roadway ?? []).map((corners, k) => ({
    id: `RW${k}`,
    corners,
    color: '#475569',
    roadway: true,
    ...(k === 0 ? { label: [PLAN_WORDS[lang].roadway] } : {}),
  }));
  // dalle en charge répartie : la dalle sous chaque Viewbox, avec son poids au m² (texte dans le plus grand morceau)
  const zones: PlanPlate[] = (opts.slab?.zones ?? []).flatMap((z) => {
    const area = (p: P2[]) => Math.abs(p.reduce((s, a, i) => s + a[0] * p[(i + 1) % p.length][1] - p[(i + 1) % p.length][0] * a[1], 0)) / 2;
    const big = z.pieces.reduce((a, p) => (area(p) > area(a) ? p : a), z.pieces[0] ?? []);
    return z.pieces.map((p, k) => ({
      id: `Z${z.id}-${k}`,
      corners: p,
      color: opts.zoneColor?.(z.eta) ?? '#64748b',
      zone: true,
      zoneOf: z.id,
      ...(p === big ? { label: zoneLines(z, lang) } : {}),
    }));
  });
  const timber: PlanPlate[] = (opts.remedy?.outlines ?? []).map((o) => ({
    id: `T${o.id}`,
    corners: o.corners,
    color: TIMBER_COLOR,
    ...(o.id === 'PL' || o.id.startsWith('G') ? { label: [o.label, ...(o.sub ? [o.sub] : [])] } : {}),
  }));
  // tronçon de rive / profil posé directement au sol (sans plaque) : sa semelle
  const outline = (c: SupportCheck): P2[] | null => {
    if (c.plan) return c.plan.corners;
    if (!c.reaction.group.strip) return null;
    const { u, v, center, contact } = c.geometry;
    const P = (a: number, b: number): P2 => [u[0] * a + v[0] * b, u[1] * a + v[1] * b];
    const [a0, a1, b0, b1] = [center[0] - contact[0] / 2, center[0] + contact[0] / 2, center[1] - contact[1] / 2, center[1] + contact[1] / 2];
    return [P(a0, b0), P(a1, b0), P(a1, b1), P(a0, b1)];
  };
  return [...roadway, ...zones, ...timber, ...checks
    .filter((c) => outline(c))
    .map((c) => ({
      id: c.id,
      corners: outline(c)!,
      color: opts.color?.(c) ?? typeColor(c.typeKey),
      centered: !!c.plan && c.plan.placement === 'centered' && c.plan.overhang > 5,
      ...(opts.label ? { label: opts.label(c) } : {}),
    }))];
}

/** « Dalle : 292 kg/m² » / « 4 750 kg / 17,61 m² » : poids au m² sur la dalle sous une Viewbox (au milieu de sa zone). */
export const zoneLines = (z: NonNullable<SupportCheck['zone']>, lang: Lang = 'fr'): string[] => {
  const w = PLAN_WORDS[lang];
  return [`${w.slab}${w.colon}${num(lang, (z.q * 1e6) / 9.81, 0)} kg/m²`, `${num(lang, z.load / 9.81, 0)} kg / ${num(lang, z.area / 1e6, 2)} m²`];
};

/**
 * Texte d'un appui sur le plan. Sol : pression au sol finale (après bloc et plaques), « 148 kN/m² » / « 15 090 kg/m² ».
 * Dalle en charge répartie : pas de pression — le poids réparti sur la dalle à cet endroit, celui de la Viewbox sous
 * laquelle est l'appui (« 270 kg/m² »), le même que celui écrit au milieu de sa zone.
 */
export const pressureLines = (c: SupportCheck, lang: Lang = 'fr'): string[] => {
  if (c.zone) return [`${num(lang, (c.zone.q * 1e6) / 9.81, 0)} kg/m²`];
  return [`${num(lang, c.pressure * 1e3, c.pressure * 1e3 < 10 ? 1 : 0)} kN/m²`, `${num(lang, (c.pressure * 1e6) / 9.81, 0)} kg/m²`];
};

/**
 * Plan « pression au sol » : le même à l'écran (étape 5) et dans la fiche PDF — plaques et blocs colorés par leur
 * taux, leur poids au m² (dalle) ou leur pression (sol), les zones de dalle, les madriers retenus, les plaques de
 * roulage, et à chaque point « 5 kN · η 0,60 ».
 */
export function checkPlan(result: CalageResult, lang: Lang = 'fr') {
  const byId = new Map(result.checks.flatMap((c) => [c.id, ...c.members].map((id) => [id, c] as const)));
  return {
    plates: planPlates(result.checks, {
      color: (c) => checkColor(c.eta),
      label: (c) => pressureLines(c, lang),
      remedy: result.remedy,
      slab: result.slab,
      zoneColor: checkColor,
      roadway: result.roadwayOn ? result.roadwayOutline : undefined,
      lang,
    }),
    pointColor: (r: GroupReaction) => {
      const c = byId.get(r.group.id);
      return c ? checkColor(c.eta) : undefined;
    },
    pointSub: (r: GroupReaction) => {
      const c = byId.get(r.group.id);
      return c ? `${num(lang, r.Rk / 1e3, 0)} kN · η ${num(lang, c.eta, 2)}` : undefined;
    },
  };
}

/** « VBX-01/04 » : numéros des Viewbox d'une même emprise, triés (même préfixe regroupé). */
export function compactModuleIds(ids: string[]): string {
  const sorted = [...ids].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const m = sorted.map((id) => /^(.*?)(\d+)$/.exec(id));
  if (sorted.length > 1 && m.every((x) => x && x[1] === m[0]![1])) return m[0]![1] + m.map((x) => x![2]).join('/');
  return sorted.join(', ');
}

/** Vue de dessus : emprises des Viewbox (nombre de niveaux au centre), groupes d'appuis colorés par type avec Rz,k. */
export function GroundPlan({ modules, reactions, x, y, w, h, text, selected, onSelect, zoneLabel, zoneFill, axes, pointColor, pointSub, plates }: PlanProps) {
  const pts = [...modules.flatMap((m) => m.corners), ...(plates ?? []).flatMap((p) => p.corners)];
  if (!pts.length) return null;
  const minX = Math.min(...pts.map((p) => p[0]));
  const maxX = Math.max(...pts.map((p) => p[0]));
  const minY = Math.min(...pts.map((p) => p[1]));
  const maxY = Math.max(...pts.map((p) => p[1]));
  const margin = text * 3;
  const s = Math.min((w - 2 * margin) / Math.max(maxX - minX, 1), (h - 2 * margin) / Math.max(maxY - minY, 1));
  const ox = x + (w - (maxX - minX) * s) / 2;
  const oy = y + (h - (maxY - minY) * s) / 2;
  const X = (v: number) => ox + (v - minX) * s;
  const Y = (v: number) => oy + (v - minY) * s;
  // niveaux par emprise (Viewbox empilées au même endroit)
  const stacks = new Map<string, { m: EstimateModule; n: number; ids: string[] }>();
  for (const m of modules) {
    const cx = Math.round(m.corners.reduce((a, p) => a + p[0], 0) / 4 / 200);
    const cy = Math.round(m.corners.reduce((a, p) => a + p[1], 0) / 4 / 200);
    const k = `${cx},${cy}`;
    const e = stacks.get(k);
    if (!e) stacks.set(k, { m, n: 1, ids: [m.id] });
    else {
      e.n++;
      e.ids.push(m.id);
      if (m.level < e.m.level) e.m = m;
    }
  }
  // pastilles plus petites quand des appuis sont très proches (vérins de Viewbox voisines, 31 cm)
  const P = reactions.map((re) => [X(re.group.position[0]), Y(re.group.position[1])] as const);
  let dmin = Infinity;
  for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) dmin = Math.min(dmin, Math.hypot(P[i][0] - P[j][0], P[i][1] - P[j][1]));
  const r = Math.max(text * 0.45, Math.min(Math.max(text * 0.9, 250 * s), 0.4 * dmin));
  // étiquettes des points (numéro, charge) : à côté du point, au-dessus ou au-dessous ; vers l'extérieur d'un groupe serré
  const pointLabels = reactions.map((re, k) => {
    const [qx, qy] = P[k];
    // appuis voisins très proches (vérins de Viewbox côte à côte) : étiquettes vers l'extérieur du groupe
    const group = P.filter(([ox, oy]) => Math.hypot(ox - qx, oy - qy) < text * 3.5);
    const gx = group.reduce((a, g) => a + g[0], 0) / group.length;
    const gy = group.reduce((a, g) => a + g[1], 0) / group.length;
    const sx = group.length < 2 || Math.abs(qx - gx) < text * 0.1 ? 0 : Math.sign(qx - gx);
    const sy = group.length < 2 || Math.abs(qy - gy) < text * 0.1 ? 0 : Math.sign(qy - gy);
    const lx = sx ? qx + sx * (r + text * 0.25) : qx;
    const anchor: 'middle' | 'start' | 'end' = sx < 0 ? 'end' : sx > 0 ? 'start' : 'middle';
    const [y1, y2] =
      group.length < 2
        ? [qy - r - text * 0.3, qy + r + text * 0.95]
        : sx
          ? [qy - text * 0.1 + sy * text * 0.8, qy + text * 0.8 + sy * text * 0.8]
          : sy < 0
            ? [qy - r - text * 1.15, qy - r - text * 0.3]
            : [qy + r + text * 0.95, qy + r + text * 1.8];
    const labels = [
      { t: re.group.id, yy: y1, size: text * 0.85, bold: true },
      { t: pointSub?.(re) ?? `${n1(re.Rk / 1e3, 0)} kN`, yy: y2, size: text * 0.8, bold: false },
    ];
    return { lx, anchor, labels };
  });
  // texte des plaques : dedans quand il y tient, sinon dessous, dessus, à droite, à gauche — la première place libre
  // (ni sur un point d'appui, ni sur ses étiquettes, ni sur le texte d'une autre plaque) ; zones de dalle au milieu
  type Box = [number, number, number, number];
  const hit = (a: Box, b: Box) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
  const taken: Box[] = [];
  P.forEach(([px, py], k) => {
    taken.push([px - r, py - r, px + r, py + r]);
    const { lx, anchor, labels } = pointLabels[k];
    for (const l of labels) {
      const w = l.t.length * l.size * 0.58;
      const x0 = anchor === 'end' ? lx - w : anchor === 'start' ? lx : lx - w / 2;
      taken.push([x0, l.yy - l.size * 0.85, x0 + w, l.yy + l.size * 0.2]);
    }
  });
  type Spot = { ax: number; anchor: 'middle' | 'start' | 'end'; top: number; inside: boolean; bg: boolean };
  const at = (ax: number, anchor: Spot['anchor'], top: number, inside: boolean, bg = !inside): Spot => ({ ax, anchor, top, inside, bg });
  // positions d'un bloc de texte (largeur tw, hauteur th) centrées sur une grille autour d'un point, de la plus proche à la plus lointaine
  const around = (px: number, py: number, rx: number, ry: number, th: number, inside: boolean, bg: boolean): Spot[] => {
    const out: Array<Spot & { d: number }> = [];
    const steps = 6;
    for (let i = -steps; i <= steps; i++)
      for (let j = -steps; j <= steps; j++) {
        const dx = (i / steps) * Math.max(0, rx);
        const dy = (j / steps) * Math.max(0, ry);
        out.push({ ...at(px + dx, 'middle', py + dy - th / 2, inside, bg), d: Math.hypot(dx, dy * 1.5) });
      }
    return out.sort((u, v) => u.d - v.d);
  };
  // la première place libre : dans la zone demandée (`inside` : dans [x0, x1] × [y0, y1]), dans le cadre, sans rien toucher
  const place = (tries: Spot[], tw: number, th: number, bounds: Box, pad = 0): Spot => {
    const boxOf = (t: Spot): Box => {
      const bx = t.anchor === 'middle' ? t.ax - tw / 2 : t.anchor === 'start' ? t.ax : t.ax - tw;
      return [bx, t.top, bx + tw, t.top + th];
    };
    const fits = (t: Spot) => {
      const b = boxOf(t);
      if (t.inside && (b[0] < bounds[0] || b[2] > bounds[2] || b[1] < bounds[1] || b[3] > bounds[3])) return false;
      if (b[0] < x || b[2] > x + w || b[1] < y || b[3] > y + h) return false;
      return !taken.some((o) => hit(b, o));
    };
    const pick = tries.find(fits) ?? tries[0];
    const b = boxOf(pick);
    taken.push([b[0] - pad, b[1] - pad, b[2] + pad, b[3] + pad]);
    return pick;
  };
  const bboxOf = (corners: P2[]): Box => {
    const xs = corners.map((q) => X(q[0]));
    const ys = corners.map((q) => Y(q[1]));
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  };
  // dalle en charge répartie : le poids au m² de la dalle d'une Viewbox est écrit avec son numéro (un seul bloc)
  const zoneText = new Map<string, PlanPlate>();
  for (const p of plates ?? []) if (p.zone && p.zoneOf && p.label?.length) zoneText.set(p.zoneOf, p);
  // bloc de chaque emprise : numéro des Viewbox (« VBX-01/04 »), poids sur la dalle, puis le texte de l'appelant
  const big = text * 0.9;
  const bigLh = text * 1.1;
  const consumed = new Set<string>();
  const stackBlocks = [...stacks.values()].map(({ m, n, ids }) => {
    const zp = ids.map((id) => zoneText.get(id)).find(Boolean);
    if (zp) consumed.add(zp.id);
    const extra = zoneLabel?.(m, n) ?? [n > 1 ? `${n} niveaux` : m.level > 0 ? `niveau ${m.level}` : '1 niveau'];
    const all: Array<{ t: string; bold: boolean; fill: string }> = [
      { t: compactModuleIds(ids), bold: true, fill: '#1a021d' },
      ...(zp?.label ?? []).map((t, k) => ({ t, bold: k === 0, fill: k === 0 ? zp!.color : '#374151' })),
      ...extra.map((t, k) => ({ t, bold: k === 0 && !!zoneLabel, fill: k === 0 && zoneLabel ? '#111827' : '#6b7280' })),
    ];
    const bb = bboxOf(m.corners);
    const [bx0, by0, bx1, by1] = bb;
    const cx = (bx0 + bx1) / 2;
    const cy = (by0 + by1) / 2;
    // bloc complet dans l'emprise, sinon raccourci (numéro + poids sur la dalle), sinon à côté de l'emprise
    const variants = zp ? [all, all.slice(0, 2)] : [all];
    const sizeOf = (ls: typeof all) => ({ tw: Math.max(...ls.map((l) => l.t.length)) * big * 0.58, th: ls.length * bigLh });
    const freeSpot = (ls: typeof all, spots: (tw: number, th: number) => Spot[]) => {
      const { tw, th } = sizeOf(ls);
      return spots(tw, th).find((t) => {
        const b: Box = [t.ax - tw / 2, t.top, t.ax + tw / 2, t.top + th];
        if (t.inside && (b[0] < bx0 || b[2] > bx1 || b[1] < by0 || b[3] > by1)) return false;
        if (b[0] < x || b[2] > x + w || b[1] < y || b[3] > y + h) return false;
        return !taken.some((o) => hit(b, o));
      });
    };
    const inside = (tw: number, th: number) => around(cx, cy, (bx1 - bx0) / 2 - tw / 2, (by1 - by0) / 2 - th / 2, th, true, true);
    const beside = (tw: number, th: number) => [
      ...around(bx1 + text * 4 + tw / 2, cy, text * 3, (by1 - by0) / 2, th, false, true),
      ...around(bx0 - text * 4 - tw / 2, cy, text * 3, (by1 - by0) / 2, th, false, true),
    ];
    let lines = all;
    let pos: Spot | undefined;
    for (const v of variants) {
      pos = freeSpot(v, inside);
      if (pos) {
        lines = v;
        break;
      }
    }
    if (!pos && zp) {
      lines = variants[variants.length - 1];
      pos = freeSpot(lines, beside);
    }
    const { tw, th } = sizeOf(lines);
    pos ??= at(cx, 'middle', cy - th / 2, true, !!zp);
    taken.push([pos.ax - tw / 2 - text * 0.4, pos.top - text * 0.4, pos.ax + tw / 2 + text * 0.4, pos.top + th + text * 0.4]);
    return { m, lines, pos, tw, bg: !!zp };
  });
  // texte des plaques : dedans quand il y tient (au milieu de préférence), sinon à côté — la première place libre
  const small = text * 0.72;
  const lh = text * 0.85;
  const plateText = new Map<string, Spot>();
  for (const p of plates ?? []) {
    // déjà écrit avec le numéro de sa Viewbox, ou légende (plaques de roulage)
    if (!p.label?.length || p.roadway || consumed.has(p.id)) continue;
    const n = p.label.length;
    const tw = Math.max(...p.label.map((t) => t.length)) * small * 0.56;
    const th = n * lh + text * 0.1;
    const bb = bboxOf(p.corners);
    const [x0, y0, x1, y1] = bb;
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const g = text * 0.3;
    const tries = p.zone
      ? around(cx, cy, (x1 - x0) / 2 - tw / 2, (y1 - y0) / 2 - th / 2, th, true, true)
      : [
          ...around(cx, cy, (x1 - x0) / 2 - tw / 2, (y1 - y0) / 2 - th / 2, th, true, false),
          at(cx, 'middle', y1 + g, false),
          at(cx, 'middle', y0 - th - g, false),
          at(x1 + g, 'start', cy - th / 2, false),
          at(x0 - g, 'end', cy - th / 2, false),
          ...around(cx, cy, (x1 - x0) / 2 + tw, (y1 - y0) / 2 + th * 2, th, false, true),
        ];
    plateText.set(p.id, place(tries, tw, th, bb, text * 0.15));
  }
  // plaques de roulage : une légende (trait en tirets + texte) dans un coin libre du cadre
  const roadwayPlate = (plates ?? []).find((p) => p.roadway && p.label?.length);
  const legend = (() => {
    if (!roadwayPlate) return null;
    const t = roadwayPlate.label![0];
    const sw = text * 2.2;
    const tw = sw + text * 0.4 + t.length * small * 0.56;
    const th = lh + text * 0.2;
    const g = text * 0.3;
    const pos = place([at(x + g, 'start', y + g, false), at(x + g, 'start', y + h - th - g, false), at(x + w - g, 'end', y + g, false), at(x + w - g, 'end', y + h - th - g, false)], tw, th, [x, y, x + w, y + h]);
    const bx = pos.anchor === 'end' ? pos.ax - tw : pos.ax;
    const ly = pos.top + th / 2;
    return (
      <g key="rw-legend">
        <rect x={bx} y={pos.top} width={tw} height={th} fill="#ffffff" />
        <line x1={bx} x2={bx + sw} y1={ly} y2={ly} stroke={roadwayPlate.color} strokeWidth={text * 0.12} strokeDasharray={`${text * 0.7} ${text * 0.25}`} />
        <text fontFamily={FONT_SANS} x={bx + sw + text * 0.4} y={ly + small * 0.35} fontSize={small} fontWeight={700} fill="#334155">
          {t}
        </text>
      </g>
    );
  })();
  const plateLabel = (p: PlanPlate, lines: string[]) => {
    const pos = plateText.get(p.id);
    if (!pos) return null;
    return lines.map((t, k) => {
      const ty = pos.top + (k + 1) * lh - text * 0.1;
      const tw = t.length * small * 0.56;
      const bx = pos.anchor === 'middle' ? pos.ax - tw / 2 : pos.anchor === 'start' ? pos.ax : pos.ax - tw;
      return (
        <g key={`lb${k}`}>
          {/* hors de la plaque ou sur une zone : fond blanc, le texte reste lisible sur les rives */}
          {pos.bg && <rect x={bx} y={ty - small * 0.85} width={tw} height={small * 1.05} fill="#ffffff" />}
          <text fontFamily={FONT_SANS} x={pos.ax} y={ty} fontSize={small} textAnchor={pos.anchor} fontWeight={k === 0 ? 700 : undefined} fill={k === 0 ? p.color : '#374151'}>
            {t}
          </text>
        </g>
      );
    });
  };
  return (
    <g fontFamily={FONT_SANS}>
      {[...stacks.values()].map(({ m }) => (
        <polygon
          key={m.id}
          points={m.corners.map((p) => `${X(p[0]).toFixed(2)},${Y(p[1]).toFixed(2)}`).join(' ')}
          fill={m.level === 0 ? (zoneFill?.(m) ?? '#eef1f6') : 'none'}
          stroke="#1a021d"
          strokeWidth={text * 0.08}
          strokeDasharray={m.level === 0 ? undefined : `${text * 0.4} ${text * 0.3}`}
        />
      ))}
      {(plates ?? []).map((p) => (
        <g key={`pl${p.id}`}>
          <polygon
            points={p.corners.map((q) => `${X(q[0]).toFixed(2)},${Y(q[1]).toFixed(2)}`).join(' ')}
            fill={p.color}
            fillOpacity={p.roadway ? 0.06 : p.zone ? 0.1 : 0.22}
            stroke={p.color}
            strokeWidth={text * (p.roadway ? 0.12 : p.zone ? 0.05 : 0.09)}
            strokeDasharray={p.roadway ? `${text * 0.7} ${text * 0.25}` : p.centered ? `${text * 0.35} ${text * 0.2}` : p.zone ? `${text * 0.2} ${text * 0.15}` : undefined}
          />
          {p.label && plateLabel(p, p.label)}
          {p.centered && (
            <text fontFamily={FONT_SANS} x={X(Math.max(...p.corners.map((q) => q[0])))} y={Y(Math.min(...p.corners.map((q) => q[1]))) + text * 0.7} fontSize={text * 0.75} textAnchor="end" fill={p.color}>
              ▲
            </text>
          )}
        </g>
      ))}
      {/* numéro de chaque emprise (+ poids sur la dalle), au-dessus des plaques, sur une place libre */}
      {stackBlocks.map(({ m, lines, pos, tw, bg }) => (
        <g key={`t${m.id}`}>
          {bg && <rect x={pos.ax - tw / 2} y={pos.top} width={tw} height={lines.length * bigLh + text * 0.1} fill="#ffffff" fillOpacity={0.85} />}
          {lines.map((l, k) => (
            <text key={k} fontFamily={FONT_SANS} x={pos.ax} y={pos.top + (k + 1) * bigLh - text * 0.25} fontSize={big} textAnchor="middle" fontWeight={l.bold ? 700 : undefined} fill={l.fill}>
              {l.t}
            </text>
          ))}
        </g>
      ))}
      {legend}
      {reactions.map((re, k) => {
        const col = pointColor?.(re) ?? TYPE_COLORS[typeKey(re)];
        const sel = selected === re.group.id;
        // appuis voisins très proches (vérins de Viewbox côte à côte) : étiquettes vers l'extérieur du groupe
        const [qx, qy] = P[k];
        const { lx, anchor, labels } = pointLabels[k];
        return (
          <g key={re.group.id} onClick={onSelect ? () => onSelect(re.group.id) : undefined} style={onSelect ? { cursor: 'pointer' } : undefined}>
            <circle cx={qx} cy={qy} r={r} fill={col} stroke={sel ? '#111827' : '#ffffff'} strokeWidth={sel ? text * 0.2 : text * 0.08} />
            {labels.map((l, i) => {
              const w = l.t.length * l.size * 0.58;
              const x0 = anchor === 'end' ? lx - w : anchor === 'start' ? lx : lx - w / 2;
              return (
                <g key={i}>
                  {/* fond blanc : l'étiquette reste lisible sur les rives */}
                  <rect x={x0} y={l.yy - l.size * 0.85} width={w} height={l.size * 1.05} fill="#ffffff" />
                  <text fontFamily={FONT_SANS} x={lx} y={l.yy} fontSize={l.size} textAnchor={anchor} fontWeight={l.bold ? 700 : undefined} fill="#111827">
                    {l.t}
                  </text>
                </g>
              );
            })}
          </g>
        );
      })}
      {axes && (
        <g stroke="#111827" strokeWidth={text * 0.08} fill="none">
          {/* origine ⊕ au coin bas gauche ; flèches x / y à côté, hors du plan */}
          <circle cx={X(minX)} cy={Y(maxY)} r={r * 1.2} />
          <path d={`M ${X(minX) - r * 1.8} ${Y(maxY)} H ${X(minX) + r * 1.8} M ${X(minX)} ${Y(maxY) - r * 1.8} V ${Y(maxY) + r * 1.8}`} />
          <path
            d={`M ${X(minX) - text * 2.6} ${Y(maxY) + text * 2.6} h ${text * 2} m ${-text * 0.5} ${-text * 0.25} l ${text * 0.5} ${text * 0.25} l ${-text * 0.5} ${text * 0.25} M ${X(minX) - text * 2.6} ${Y(maxY) + text * 2.6} v ${-text * 2} m ${-text * 0.25} ${text * 0.5} l ${text * 0.25} ${-text * 0.5} l ${text * 0.25} ${text * 0.5}`}
          />
          <text fontFamily={FONT_SANS} x={X(minX) - text * 0.45} y={Y(maxY) + text * 2.9} fontSize={text * 0.8} fill="#111827" stroke="none">
            x
          </text>
          <text fontFamily={FONT_SANS} x={X(minX) - text * 2.85} y={Y(maxY) + text * 0.35} fontSize={text * 0.8} textAnchor="end" fill="#111827" stroke="none">
            y
          </text>
          <text fontFamily={FONT_SANS} x={X(minX) - r * 1.9} y={Y(maxY) - r * 1.1} fontSize={text * 0.75} textAnchor="end" fill="#111827" stroke="none">
            0,0
          </text>
        </g>
      )}
    </g>
  );
}

export interface SheetInfo {
  project: string;
  client?: string;
  source: string;
  date: string;
  /** hypothèses : lignes « libellé : valeur » */
  assumptions: Array<[string, string]>;
}

/** Découpe un texte en lignes d'au plus `max` caractères (largeur moyenne d'Arimo ≈ 0,5 × corps). */
export function wrap(text: string, max: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    if (!word) continue;
    if ((line + ' ' + word).trim().length > max && line) {
      out.push(line);
      line = word;
    } else line = (line + ' ' + word).trim();
  }
  if (line) out.push(line);
  return out;
}

const W = 210;
const H = 297;
const M = 12;

const typeCols = (lang: Lang): Array<{ title: string; w: number; align?: 'end' }> => {
  const C = CALAGE_LABELS[lang].sheetCols;
  return [
    { title: C.type, w: 34 },
    { title: C.count, w: 9, align: 'end' },
    { title: 'Rz,k', w: 17, align: 'end' },
    { title: 'Rz,Ed', w: 17, align: 'end' },
    { title: `   ${C.solution}`, w: 76 },
    { title: 'η', w: 9, align: 'end' },
    { title: `  ${C.state}`, w: 24 },
  ];
};

/** Lignes d'un tableau : une cellule trop longue pour sa colonne passe à la ligne (Arimo ≈ 0,5 × corps par caractère). */
export function tableLines(cols: Array<{ w: number }>, rows: string[][], size: number): string[][][] {
  return rows.map((r) => r.map((t, i) => (t.length * size * 0.5 > cols[i].w - 1.5 ? wrap(t, Math.max(8, Math.floor((cols[i].w - 1.5) / (size * 0.5)))) : [t])));
}

function Table({ x, y, cols, rows, size }: { x: number; y: number; cols: Array<{ title: string; w: number; align?: 'end' }>; rows: string[][]; size: number }) {
  const lh = size * 1.55;
  const cells: ReactNode[] = [];
  const lines = tableLines(cols, rows, size);
  // première ligne de chaque rangée (rangées de plusieurs lignes)
  const start: number[] = [];
  lines.reduce((at, r) => (start.push(at), at + Math.max(1, ...r.map((c) => c.length))), 1);
  let cx = x;
  cols.forEach((c, i) => {
    const tx = c.align === 'end' ? cx + c.w - 1 : cx + 1;
    cells.push(
      <text fontFamily={FONT_SANS} key={`h${i}`} x={tx} y={y + size} fontSize={size} fontWeight={700} textAnchor={c.align === 'end' ? 'end' : 'start'} fill="#374151">
        {c.title}
      </text>,
    );
    lines.forEach((r, k) =>
      r[i].forEach((t, j) =>
        cells.push(
          <text fontFamily={FONT_SANS} key={`c${i}-${k}-${j}`} x={tx} y={y + size + lh * (start[k] + j)} fontSize={size} textAnchor={c.align === 'end' ? 'end' : 'start'} fill="#111827">
            {j ? `  ${t.trim()}` : t}
          </text>,
        ),
      ),
    );
    cx += c.w;
  });
  const total = cols.reduce((a, c) => a + c.w, 0);
  return (
    <g>
      <line x1={x} x2={x + total} y1={y + size * 1.45} y2={y + size * 1.45} stroke="#9ca3af" strokeWidth={0.2} />
      {cells}
    </g>
  );
}

/** Fiche de calage A4 portrait (une page), en français, allemand ou anglais. */
export function GroundSheetSvg({ result, modules, info, lang = 'fr' }: { result: CalageResult; modules: EstimateModule[]; info: SheetInfo; lang?: Lang }) {
  const C = CALAGE_LABELS[lang];
  const L = LABELS[lang];
  const E = (t: string) => translate(lang, t);
  const N = (v: number, d = 1) => num(lang, v, d);
  const logoW = 34;
  const body = 2.6;
  const title = (t: string, y: number) => (
    <text fontFamily={FONT_SANS} x={M} y={y} fontSize={3.4} fontWeight={700} fill="#1a021d">
      {t}
    </text>
  );
  let y = 38;
  const blocks: ReactNode[] = [];
  // 1. hypothèses
  blocks.push(<g key="t1">{title(C.s1, y)}</g>);
  y += 5;
  // une ligne par hypothèse (les valeurs sont parfois longues)
  info.assumptions.forEach(([k, v], i) => {
    blocks.push(
      <g key={`a${i}`}>
        <text fontFamily={FONT_SANS} x={M} y={y + i * 3.6} fontSize={body} fill="#6b7280">
          {k}
        </text>
        <text fontFamily={FONT_SANS} x={M + 48} y={y + i * 3.6} fontSize={body} fill="#111827">
          {v}
        </text>
      </g>,
    );
  });
  y += info.assumptions.length * 3.6 + 3;
  // 2. plan des appuis et des plaques
  const fem = result.estimate.method === 'fem';
  blocks.push(<g key="t2">{title(C.s2(fem), y)}</g>);
  const planH = 66;
  blocks.push(
    <g key="plan">
      <rect x={M} y={y + 2} width={W - 2 * M} height={planH} fill="none" stroke="#d1d5db" strokeWidth={0.2} />
      <GroundPlan modules={modules} reactions={result.estimate.reactions} x={M} y={y + 2} w={W - 2 * M} h={planH} text={2.4} {...checkPlan(result, lang)} zoneLabel={(m, n) => [n > 1 ? C.levels(n) : m.level > 0 ? C.level(m.level) : C.levels(1)]} />
    </g>,
  );
  y += planH + 8;
  // 3. calage par type
  blocks.push(<g key="t3">{title(C.s3, y)}</g>);
  y += 3;
  const cols = typeCols(lang);
  const typeRows = result.types.map((t) => [
    E(t.label),
    String(t.reactions.length),
    `${N(t.Rzk / 1e3)} kN`,
    `${N(t.RzEd / 1e3)} kN`,
    `   ${t.chosen ? E(t.chosen.summary) : '—'}`,
    t.chosen ? N(t.chosen.eta, 2) : '—',
    `  ${t.chosen ? (t.standard ? (verdictOf(t.chosen.eta) === 'limit' ? C.stateLimit : C.stateOk) : C.stateOut) : C.stateNone}`,
  ]);
  blocks.push(<Table key="types" x={M} y={y} size={2.4} cols={cols} rows={typeRows} />);
  y += 2.4 * 1.55 * (tableLines(cols, typeRows, 2.4).reduce((a, r) => a + Math.max(1, ...r.map((c) => c.length)), 0) + 1) + 4;
  if (result.longrine) {
    blocks.push(
      <text fontFamily={FONT_SANS} key="lg" x={M} y={y} fontSize={body} fill="#111827">
        {C.longrineVariant(E(result.longrine.solution.summary), N(result.longrine.result.eta, 2))}
      </text>,
    );
    y += 5;
  }
  // 4. matériel
  blocks.push(<g key="t4">{title(C.s4, y)}</g>);
  y += 3;
  const mats = result.materials;
  const SC = C.sheetCols;
  const matCols: Array<{ title: string; w: number; align?: 'end' }> = [
    { title: SC.designation, w: 60 },
    { title: SC.dims, w: 60 },
    { title: SC.qty, w: 26, align: 'end' },
    { title: SC.mass, w: 40, align: 'end' },
  ];
  const matRows = mats.length ? mats.map((m) => [E(m.label), E(m.dims), String(m.quantity), `${N(m.massKg, 0)} kg`]) : [[C.none, '', '', '']];
  blocks.push(<Table key="mat" x={M} y={y} size={2.4} cols={matCols} rows={matRows} />);
  y += 2.4 * 1.55 * (tableLines(matCols, matRows, 2.4).reduce((a, r) => a + Math.max(1, ...r.map((c) => c.length)), 0) + 1) + 5;
  const jacks = result.estimate.reactions.some((r) => r.group.jack);
  const para = (key: string, lines: string[], size: number, step: number, color = '#374151', width = 125) => {
    for (const [i, n] of lines.entries())
      for (const [k, line] of wrap(n, width).entries()) {
        if (y > H - 16) return;
        blocks.push(
          <text fontFamily={FONT_SANS} key={`${key}${i}-${k}`} x={M + (k ? 3 : 0)} y={y} fontSize={size} fill={color}>
            {k ? line : `• ${line}`}
          </text>,
        );
        y += step;
      }
  };
  // 5. références réglementaires (Prüfbuch TÜV) : seulement avec des Viewbox
  if (!result.tuv.notApplicable) {
    blocks.push(<g key="t5">{title(C.s5, y)}</g>);
    y += 4.2;
    const tuvLine = !result.tuv.tuvMinimum ? C.tuvOff : result.tuv.ok === false ? C.tuvKo(result.types.filter((t) => t.tuv?.ok === false).map((t) => E(t.label)).join(', ')) : result.tuv.ok ? C.tuvOk : '';
    para('lg', [...C.legal(jacks), ...(tuvLine ? [tuvLine] : [])], 2.1, 2.9, '#374151', 140);
    y += 2;
  }
  // 6. réserves
  blocks.push(<g key="t6">{title(C.s6, y)}</g>);
  y += 4.2;
  const notes = [
    ...result.warnings.map(E),
    lang === 'fr' ? GROUND_NOTE : L.groundNote,
    fem ? C.femNote : C.estimateNote,
    C.platesNote,
    ...(result.roadwayOn ? [C.roadwayUsed(N(result.roadway.load / 1e3, 0), N(result.roadway.area / 1e6, 1), N(result.roadway.mean * 1e3, 1))] : []),
  ];
  para('n', notes, 2.2, 3.1);
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={`${W}mm`} height={`${H}mm`} viewBox={`0 0 ${W} ${H}`} fontFamily={FONT_SANS}>
      <rect x={0} y={0} width={W} height={H} fill="#ffffff" />
      <text fontFamily={FONT_SANS} x={W / 2} y={H / 2} fontSize={8} fill="#9ca3af" fillOpacity={0.18} textAnchor="middle" fontWeight={700} transform={`rotate(-55 ${W / 2} ${H / 2})`}>
        {C.watermark}
      </text>
      <text fontFamily={FONT_SANS} x={M} y={M + 6} fontSize={6} fontWeight={700} fill="#1a021d">
        {C.sheetTitle}
      </text>
      <text fontFamily={FONT_SANS} x={M} y={M + 11.5} fontSize={3} fill="#111827">
        {info.project}
        {info.client ? ` — ${info.client}` : ''}
      </text>
      <text fontFamily={FONT_SANS} x={M} y={M + 16} fontSize={2.5} fill="#6b7280">
        {`${info.source} · ${info.date}`}
      </text>
      <g transform={`translate(${W - M - logoW} ${M - 2}) scale(${logoW / VIEWBOX_WORDMARK.width})`}>
        <path d={VIEWBOX_WORDMARK.d} transform={VIEWBOX_WORDMARK.transform} fill={LOGO_COLOR} />
      </g>
      <line x1={M} x2={W - M} y1={M + 18} y2={M + 18} stroke="#1a021d" strokeWidth={0.3} />
      {blocks}
      <line x1={M} x2={W - M} y1={H - 12} y2={H - 12} stroke="#d1d5db" strokeWidth={0.2} />
      <text fontFamily={FONT_SANS} x={M} y={H - 8} fontSize={2.2} fill="#6b7280">
        {C.footerSheet(fem)}
      </text>
      <text fontFamily={FONT_SANS} x={W - M} y={H - 8} fontSize={2.2} fill="#6b7280" textAnchor="end">
        1 / 1
      </text>
    </svg>
  );
}
