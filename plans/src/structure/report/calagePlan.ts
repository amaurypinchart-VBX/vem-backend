// Plan de calage A3 (§14) : une planche du moteur de planches existant — cartouche Viewbox, vue de dessus du niveau 0
// (pieds) avec le contour des Viewbox, plaques de calage dessinées à l'échelle à leur place (à fleur de la Viewbox, ou
// centrées ▲ quand la charge est trop près du bord ; une plaque sous les vérins voisins) en surcouche (décoration, ne
// touche pas au moteur 2D) et étiquetées « C1 · 3 × 70 × 70 × 36 mm · Rz,k 54 kN », colonne de texte dans la planche
// (types d'appui, matériel, pose, références du Prüfbuch TÜV). Exportable seule pour l'équipe de montage, jointe au
// rapport, ou ajoutée à un jeu de plans 2D. Fonctions pures.
import type { StructuralModel } from '../core/assemble';
import type { CalageResult } from '../core/calage';
import { GROUND_NOTE } from '../core/ground';
import type { Vec3 } from '../core/fem/types';
import type { LineworkRequest, Linework2D } from '../../linework/types';
import { DEFAULT_LINE_STYLE } from '../../linework/types';
import type { ViewBasis } from '../../core/views';
import { projectPoint } from '../../core/views';
import type { LegendEntry } from '../../sheets/SheetSvg';
import { wrapText as sheetWrap } from '../../sheets/SheetSvg';
import type { CalagePlateSpec, LevelMarkSpec, RectMm, Sheet, SheetItem, TitleBlockData, ViewportItem } from '../../sheets/types';
import { formatLevel } from '../core/groundLevels';
import { DRAW_AREA, scaleRect, templateScale } from '../../sheets/template';
import { TYPE_HEX } from './figures';
import { CALAGE_LABELS, LEVEL_LABELS } from './calageI18n';
import type { SpreadLayer } from '../core/ground';
import { TUV } from '../core/tuv';
import type { Lang } from './i18n';
import { LABELS, num } from './i18n';
import { wrapText } from './metrics';
import { translate, typo } from './translate';

/** Couleur d'un type d'appui de calage (« 1 »…« 4 », « M », « M2 »). */
export const typeColor = (key: string) => TYPE_HEX[key] ?? TYPE_HEX[key.startsWith('M') ? 'M' : String(Math.min(4, Number(key) || 1))];

/** « 3 × 70 × 70 × 36 mm » : couches d'un appui (plaque du dessus d'abord). */
export function layersShort(layers: SpreadLayer[]): string {
  return layers.map((l) => (l.material === 'commercial' ? `${l.n} × ${l.label}` : `${l.n} × ${l.l / 10} × ${l.w / 10} × ${l.t} mm`)).join(' + ');
}

/** Plaques (ou longrines) de la solution retenue, en plan, à leur place : à fleur de la Viewbox ou centrées (▲). */
export function calagePlates(s: Pick<StructuralModel, 'modules' | 'baseY'>, calage: CalageResult, lang: Lang): CalagePlateSpec[] {
  const out: CalagePlateSpec[] = [];
  const N = (v: number, d = 0) => num(lang, v, d);
  const C = CALAGE_LABELS[lang];
  const y = s.baseY;
  if (!calage.allPlates && calage.longrine) {
    // longrines sous les grands côtés des Viewbox du niveau 0
    const lg = calage.longrine;
    const width = lg.beam.b * lg.count;
    let k = 0;
    for (const m of s.modules.filter((q) => q.level === 0)) {
      const p = m.params;
      for (const v of [p.y0, p.y1]) {
        const mid = (p.x0 + p.x1) / 2;
        const half = lg.length / 2;
        const at = (u: number, w: number): Vec3 => [m.origin[0] + m.u[0] * u + m.v[0] * w, y, m.origin[2] + m.u[2] * u + m.v[2] * w];
        out.push({
          id: `L${++k}`,
          label: `${lg.count} × ${lg.beam.b} × ${lg.beam.h} mm`,
          sub: `L = ${N(lg.length / 1e3, 2)} m`,
          color: '#92400e',
          corners: [at(mid - half, v - width / 2), at(mid + half, v - width / 2), at(mid + half, v + width / 2), at(mid - half, v + width / 2)],
          at: at(p.x0 + 300, v),
        });
      }
    }
    return out;
  }
  const W = (p: readonly [number, number]): Vec3 => [p[0], y, p[1]];
  for (const c of calage.checks) {
    const g = c.geometry;
    // sans plaque : la surface de contact
    const rect = c.plan?.corners ?? (() => {
      const [cu, cv] = g.center;
      const [a, b] = [g.contact[0] / 2, g.contact[1] / 2];
      const P = (du: number, dv: number): [number, number] => [g.u[0] * (cu + du) + g.v[0] * (cv + dv), g.u[1] * (cu + du) + g.v[1] * (cv + dv)];
      return [P(-a, -b), P(a, -b), P(a, b), P(-a, b)];
    })();
    const cx = rect.reduce((a, p) => a + p[0], 0) / 4;
    const cz = rect.reduce((a, p) => a + p[1], 0) / 4;
    const over = c.plan && c.plan.placement === 'centered' && c.plan.overhang > 5 ? ` · ${C.overhang(N(c.plan.overhang / 10))}` : '';
    out.push({
      id: c.id,
      label: c.layerList.length ? layersShort(c.layerList) : C.noPlate,
      sub: `Rz,k ${N(c.Rzk / 1e3)} kN${over}`,
      color: typeColor(c.typeKey),
      corners: rect.map(W),
      at: W([cx, cz]),
    });
  }
  return out;
}

/** Couleurs des repères de niveau : référence (point haut), relevé, au-delà de la sortie de vérin. */
export const LEVEL_MARK_COLORS = { ref: '#15803d', known: '#0e7490', over: '#dc2626' };

/** Repères ▽ des niveaux du sol relevés (pieds sans relevé : rien), à la cote du dessous des Viewbox. */
export function calageLevelMarks(s: Pick<StructuralModel, 'baseY'>, calage: CalageResult, lang: Lang = 'fr'): LevelMarkSpec[] {
  const lv = calage.levels;
  if (!lv?.known) return [];
  return lv.rows
    .filter((r) => r.level !== undefined)
    .map((r) => ({
      id: r.id,
      text: formatLevel(r.level!),
      ...(r.makeUp ? { sub: `↑${r.makeUp}${r.shims ? ` · ${LEVEL_LABELS[lang].shim} ${r.shims}` : ''}` } : {}),
      color: r.shims ? LEVEL_MARK_COLORS.over : r.level === lv.ref ? LEVEL_MARK_COLORS.ref : LEVEL_MARK_COLORS.known,
      at: [r.position[0], s.baseY, r.position[1]] as Vec3,
    }));
}

/** Contour des Viewbox du niveau 0 comme traits d'une vue (quand le moteur 2D ne peut rien dessiner). */
export function outlineLinework(s: Pick<StructuralModel, 'modules' | 'baseY'>, basis: ViewBasis): Linework2D {
  const polylines: Float64Array[] = [];
  let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const m of s.modules.filter((q) => q.level === 0)) {
    const p = m.params;
    const pts = [
      [p.x0, p.y0],
      [p.x1, p.y0],
      [p.x1, p.y1],
      [p.x0, p.y1],
      [p.x0, p.y0],
    ].map(([u, v]) => projectPoint(basis, [m.origin[0] + m.u[0] * u + m.v[0] * v, s.baseY, m.origin[2] + m.u[2] * u + m.v[2] * v]));
    for (const q of pts) [minX, minY, maxX, maxY] = [Math.min(minX, q.x), Math.min(minY, q.y), Math.max(maxX, q.x), Math.max(maxY, q.y)];
    polylines.push(Float64Array.from(pts.flatMap((q) => [q.x, q.y])));
  }
  return {
    boundsMm: { minX, minY, maxX, maxY },
    layers: [{ key: 'visible', polylines }],
    snapPoints: new Float64Array(0),
    meta: { provider: 'outline', durationMs: 0, segmentCount: polylines.length * 4, cacheKey: 'calage-outline', basis, objectCount: polylines.length },
  };
}

/** Encombrement (repère du dessin) des plaques, pour choisir l'échelle. */
export function platesBounds(plates: CalagePlateSpec[], basis: ViewBasis) {
  let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const p of plates)
    for (const c of p.corners) {
      const q = projectPoint(basis, c);
      [minX, minY, maxX, maxY] = [Math.min(minX, q.x), Math.min(minY, q.y), Math.max(maxX, q.x), Math.max(maxY, q.y)];
    }
  return { minX, minY, maxX, maxY };
}

export interface CalageSheetInput {
  lang: Lang;
  modelKey: string;
  /** nœuds du niveau 0 (Viewbox et pieds) */
  include: string[];
  plates: CalagePlateSpec[];
  /** repères des niveaux du sol relevés (calageLevelMarks) */
  levels?: LevelMarkSpec[];
  calage: CalageResult;
  bearing: { value: number; label: string } | null;
  jacks: boolean;
  number: string;
  title?: string;
}

/** Colonne de texte de la planche (A1, mm) : types d'appui, matériel, pose, références TÜV. */
const COLUMN = { x: 522, y: 40, w: 180, bottom: 574 };

/**
 * Planche A3 du plan de calage (la vue est calculée ensuite par le moteur 2D, comme les autres planches). Tout ce qui
 * est propre au calage est dans la planche elle-même (colonne de texte, légende des types) : elle peut être ajoutée
 * telle quelle à un jeu de plans 2D. `notes` et `legend` servent au cartouche du rapport.
 */
export function calageSheet(inp: CalageSheetInput): { sheet: Sheet; notes: string; legend: LegendEntry[]; viewport: ViewportItem } {
  const L = LABELS[inp.lang];
  const C = CALAGE_LABELS[inp.lang];
  const E = (t: string) => translate(inp.lang, t);
  const N = (v: number, d = 0) => num(inp.lang, v, d);
  const k = templateScale('A3');
  const request: LineworkRequest = {
    modelId: inp.modelKey,
    subset: { include: inp.include, onlyCategories: ['PIED'] },
    view: { kind: 'top', frame: 'world' },
    style: { ...DEFAULT_LINE_STYLE, scaleDenominator: 100 },
  };
  const viewport: ViewportItem = {
    id: 'calage-plan',
    type: 'viewport',
    rect: scaleRect({ x: DRAW_AREA.x + 4, y: DRAW_AREA.y + 18, w: COLUMN.x - DRAW_AREA.x - 12, h: DRAW_AREA.h - 22 }, k),
    request,
    scale: 0,
    label: inp.title ?? L.calagePlanTitle,
    showLabel: true,
    renderStyle: 'trait',
    overlays: { moduleOutlines: true, calage: inp.plates, ...(inp.levels?.length ? { levels: inp.levels } : {}) },
  };
  const c = inp.calage;
  // ─── colonne de texte ───
  type Block = { title?: string; lines: Array<{ text: string; color?: string; bold?: boolean }> };
  const blocks: Block[] = [];
  blocks.push({
    title: C.typesTitle,
    lines: c.types.map((t) => ({
      text: `${E(t.label)} (${t.reactions.length}) — ${C.pointsOf(t.reactions.map((r) => r.group.id).join(', '))} : ${t.chosen ? E(t.chosen.summary) : L.noStandardSolution} ; Rz,k ≤ ${N(t.Rzk / 1e3)} kN${t.tuv?.ok === false ? ' (< Prüfbuch)' : ''}`,
      color: typeColor(t.typeKey),
    })),
  });
  if (!c.allPlates && c.longrine) blocks[0].lines.push({ text: `${L.longrine} : ${E(c.longrine.solution.summary)}` });
  blocks.push({ title: C.materialsTitle, lines: c.materials.map((m) => ({ text: `${m.quantity} × ${E(m.label)} ${E(m.dims)}` })) });
  const centered = c.checks.filter((x) => x.plan?.placement === 'centered');
  const lay: Block['lines'] = [];
  if (c.checks.some((x) => x.plan)) {
    if (!centered.length) lay.push({ text: C.flushAll });
    else if (centered.length === c.checks.filter((x) => x.plan).length && c.placement === 'centered') lay.push({ text: C.centeredAll });
    else {
      lay.push({ text: C.flushAll });
      lay.push({ text: C.centeredSome(centered.length, N(Math.max(...centered.map((x) => x.plan!.overhang)) / 10)) });
    }
    lay.push({ text: C.stacked });
  }
  if (inp.bearing) lay.push({ text: `${L.bearing} : ${L.bearingValue(N(inp.bearing.value), inp.bearing.label)}` });
  lay.push({ text: `${L.jacks} : ${inp.jacks ? L.jacksYes : L.jacksNo}` });
  blocks.push({ title: C.layingTitle, lines: lay });
  // niveaux du sol relevés : référence, dénivelé, pente, rattrapage (vérins / cales)
  const sv = c.levels;
  if (sv?.known && sv.ref !== undefined) {
    const V = LEVEL_LABELS[inp.lang];
    const lv: Block['lines'] = [{ text: V.legend }, { text: V.ref(formatLevel(sv.ref), sv.refIds.join(', ')), color: LEVEL_MARK_COLORS.ref }];
    if (sv.known > 1) lv.push({ text: V.spread(N(sv.spread ?? 0)) });
    if (sv.slope) lv.push({ text: V.slope(N(sv.slope.pct, 1), sv.slope.a, sv.slope.b) });
    if (inp.jacks) lv.push(sv.overJack.length ? { text: V.jacksOver(N(sv.jackMax), sv.overJack.join(', ')), color: LEVEL_MARK_COLORS.over, bold: true } : { text: V.jacksOk(N(sv.jackMax)) });
    else if ((sv.maxMakeUp ?? 0) > 0) lv.push({ text: V.shimsNoJack(N(sv.maxMakeUp!)) });
    if (sv.known < sv.rows.length) lv.push({ text: V.unknown(sv.rows.length - sv.known) });
    blocks.push({ title: V.title, lines: lv });
  }
  const tuvLine = !c.tuv.tuvMinimum ? C.tuvOff : c.tuv.ok === false ? C.tuvKo(c.types.filter((t) => t.tuv?.ok === false).map((t) => E(t.label)).join(', ')) : c.tuv.ok ? C.tuvOk : '';
  blocks.push({
    title: C.legalTitle,
    lines: [...C.legal(inp.jacks).map((text) => ({ text: `• ${text}` })), ...(tuvLine ? [{ text: tuvLine, bold: true, color: c.tuv.ok === false ? '#b91c1c' : undefined }] : [])],
  });
  blocks.push({ lines: [{ text: inp.lang === 'fr' ? GROUND_NOTE : L.groundNote }, { text: L.watermark, bold: true }] });
  // taille du texte : la plus grande qui tient dans la colonne
  const swatch = 4;
  const layout = (size: number) => {
    const items: SheetItem[] = [];
    let y = COLUMN.y;
    let id = 0;
    for (const b of blocks) {
      if (b.title) {
        items.push({ id: `calage-t${id++}`, type: 'text', rect: { x: COLUMN.x, y, w: COLUMN.w, h: size * 1.6 }, text: b.title, size: size * 1.15, bold: true, font: 'sans' });
        y += size * 1.15 * 1.2 + size * 0.5;
      }
      for (const l of b.lines) {
        const indent = l.color ? swatch + 2 : 0;
        l.text = typo(inp.lang, l.text);
        // même coupure des lignes que le rendu des textes de planche (SheetSvg)
        const n = sheetWrap(l.text, COLUMN.w - indent, size).length;
        if (l.color) items.push({ id: `calage-s${id++}`, type: 'shape', shape: 'rect', rect: { x: COLUMN.x, y: y + size * 0.1, w: swatch, h: swatch }, strokeMm: 0.35, stroke: l.color, fill: l.color });
        items.push({ id: `calage-l${id++}`, type: 'text', rect: { x: COLUMN.x + indent, y, w: COLUMN.w - indent, h: n * size * 1.2 }, text: l.text, size, bold: l.bold, font: 'sans' });
        y += n * size * 1.2 + size * 0.35;
      }
      y += size * 0.9;
    }
    return { items, bottom: y };
  };
  let size = 4.6;
  let col = layout(size);
  while (col.bottom > COLUMN.bottom && size > 3.2) col = layout((size -= 0.2));
  const columnItems = col.items.map((it) => {
    const r = (it as { rect: RectMm }).rect;
    const scaled = { ...it, rect: scaleRect(r, k) } as SheetItem;
    if (scaled.type === 'text') scaled.size *= k;
    if (scaled.type === 'shape') scaled.strokeMm *= k;
    return scaled;
  });
  const sheet: Sheet = { id: 'calage', number: inp.number, title: `${L.calagePlan}`, paper: 'A3', orientation: 'landscape', kind: 'standard', items: [viewport, ...columnItems] };
  // notes du cartouche (rapport) : portance et réserve
  const lines: string[] = [];
  if (inp.bearing) lines.push(`${L.bearing} : ${L.bearingValue(N(inp.bearing.value), inp.bearing.label)}`);
  lines.push(`Prüfbuch ${TUV.prufbuch} (TÜV Rheinland) · ${TUV.statics}`);
  lines.push(L.watermark);
  const notes = lines.flatMap((l) => wrapText(l, 100, 2.9)).slice(0, 20).join('\n');
  const legend: LegendEntry[] = c.types.map((t) => ({ key: `calage-${t.key}`, label: `${E(t.label)} — ${t.reactions.length}`, color: typeColor(t.typeKey) }));
  return { sheet, notes, legend, viewport };
}

/** Cartouche du plan de calage : champs du projet, version, date. */
export function calageTitleBlock(tb: TitleBlockData, lang: Lang): TitleBlockData {
  return { ...tb, description: LABELS[lang].calagePlan, issue: tb.issue || LABELS[lang].calagePlan };
}

/** Échelle normalisée et centrage de la vue du plan de calage (traits + plaques), échelle ajoutée au titre. */
export function fitCalageViewport(vp: ViewportItem, lw: Linework2D, plates: CalagePlateSpec[], basis: ViewBasis, fit: (b: Linework2D['boundsMm'], rect: ViewportItem['rect'], margin: number) => number): void {
  const pb = platesBounds(plates, basis);
  const b = {
    minX: Math.min(lw.boundsMm.minX, pb.minX),
    minY: Math.min(lw.boundsMm.minY, pb.minY),
    maxX: Math.max(lw.boundsMm.maxX, pb.maxX),
    maxY: Math.max(lw.boundsMm.maxY, pb.maxY),
  };
  // marge pour les étiquettes au-dessus des plaques
  vp.scale = fit(b, vp.rect, 14);
  vp.center = [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2];
  vp.label = `${vp.label ?? ''} — 1:${vp.scale}`;
}
