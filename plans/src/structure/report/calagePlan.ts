// Plan de calage A3 (§14) : une planche du moteur de planches existant — cartouche Viewbox, vue de dessus du niveau 0
// (pieds) avec le contour des Viewbox, plaques de calage dessinées à l'échelle en surcouche (décoration, ne touche pas
// au moteur 2D) et étiquetées « P1 · 2 × 55 × 55 × 40 mm · Rz,k 54 kN », légende par type d'appui, notes de calage.
// Exportable seule pour l'équipe de montage ou jointe au rapport. Fonctions pures.
import type { StructuralModel } from '../core/assemble';
import type { CalageResult } from '../core/calage';
import { GROUND_NOTE } from '../core/ground';
import type { Vec3 } from '../core/fem/types';
import { groupTypeKey } from '../core/estimate';
import type { LineworkRequest, Linework2D } from '../../linework/types';
import { DEFAULT_LINE_STYLE } from '../../linework/types';
import type { ViewBasis } from '../../core/views';
import { projectPoint } from '../../core/views';
import type { LegendEntry } from '../../sheets/SheetSvg';
import type { CalagePlateSpec, Sheet, TitleBlockData, ViewportItem } from '../../sheets/types';
import { DRAW_AREA, scaleRect, templateScale } from '../../sheets/template';
import { groupType, TYPE_HEX } from './figures';
import type { Lang } from './i18n';
import { LABELS, num } from './i18n';
import { wrapText } from './metrics';
import { translate } from './translate';

/** Plaques (ou longrines) de la solution retenue, en plan, aux groupes d'appuis. */
export function calagePlates(s: Pick<StructuralModel, 'modules' | 'baseY'>, calage: CalageResult, lang: Lang): CalagePlateSpec[] {
  const out: CalagePlateSpec[] = [];
  const N = (v: number, d = 0) => num(lang, v, d);
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
  for (const t of calage.types)
    for (const r of t.reactions) {
      const m = s.modules.find((q) => q.id === r.group.moduleIds[0]);
      if (!m) continue;
      const fp = t.chosen?.footprint ?? { l: t.a1, w: t.a2 };
      const [cx, cz] = r.group.position;
      const hu = fp.l / 2;
      const hv = fp.w / 2;
      const at = (a: number, b: number): Vec3 => [cx + m.u[0] * a + m.v[0] * b, y, cz + m.u[2] * a + m.v[2] * b];
      out.push({
        id: r.group.id,
        label: t.chosen ? translate(lang, t.chosen.summary.replace(/ par (angle|groupe|pied central|vérin)/, '')) : '—',
        sub: `Rz,k ${N(r.Rk / 1e3)} kN`,
        color: TYPE_HEX[groupType(r)],
        corners: [at(-hu, -hv), at(hu, -hv), at(hu, hv), at(-hu, hv)],
        at: at(0, 0),
      });
    }
  return out;
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
  calage: CalageResult;
  bearing: { value: number; label: string } | null;
  jacks: boolean;
  number: string;
  title?: string;
}

/** Planche A3 du plan de calage (la vue est calculée ensuite par le moteur 2D, comme les autres planches). */
export function calageSheet(inp: CalageSheetInput): { sheet: Sheet; notes: string; legend: LegendEntry[]; viewport: ViewportItem } {
  const L = LABELS[inp.lang];
  const E = (t: string) => translate(inp.lang, t);
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
    rect: scaleRect({ x: DRAW_AREA.x + 4, y: DRAW_AREA.y + 18, w: DRAW_AREA.w - 8, h: DRAW_AREA.h - 22 }, k),
    request,
    scale: 0,
    label: inp.title ?? L.calagePlanTitle,
    showLabel: true,
    renderStyle: 'trait',
    overlays: { moduleOutlines: true, calage: inp.plates },
  };
  const sheet: Sheet = { id: 'calage', number: inp.number, title: `${L.calagePlan}`, paper: 'A3', orientation: 'landscape', kind: 'standard', items: [viewport] };
  // notes : portance, vérins, solution par type, matériel
  const lines: string[] = [];
  if (inp.bearing) lines.push(`${L.bearing} : ${L.bearingValue(num(inp.lang, inp.bearing.value, 0), inp.bearing.label)}`);
  lines.push(inp.jacks ? L.jacksUsed : L.jacksForbidden);
  for (const t of inp.calage.types) lines.push(`${E(t.label)} (${t.reactions.length}) : ${t.chosen ? E(t.chosen.summary) : L.noStandardSolution}`);
  if (!inp.calage.allPlates && inp.calage.longrine) lines.push(`${L.longrine} : ${E(inp.calage.longrine.solution.summary)}`);
  for (const m of inp.calage.materials) lines.push(`${m.quantity} × ${E(m.label)} ${m.dims}`);
  lines.push(inp.lang === 'fr' ? GROUND_NOTE : L.groundNote);
  lines.push(L.watermark);
  // colonne des notes du cartouche (≈ 100 mm en A1, corps 2,9 mm) : lignes coupées à la largeur
  const notes = lines.flatMap((l) => wrapText(l, 100, 2.9)).slice(0, 20).join('\n');
  const legend: LegendEntry[] = inp.calage.types.map((t) => ({
    key: `calage-${t.key}`,
    label: `${E(t.label)} — ${t.reactions.length}`,
    color: TYPE_HEX[groupTypeKey(t)],
  }));
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
