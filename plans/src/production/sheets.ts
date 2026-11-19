// Planches des plans de production (pur, en anglais, gabarit Viewbox A1) : une liste de débit (repère, quantité par
// Viewbox, désignation, longueur / dimensions, coupes, perçages) puis une planche par pièce : vues dans les axes de la
// pièce (élévation, dessus, bout pour un profil ; face + chant pour une plaque), image 3D, cotes de longueur et de
// position des perçages (posées après le calcul des vues : autoDim `part`), données de la pièce et tableau des perçages.
// La matière, la finition et les soudures ne sont pas dans le modèle : champs à remplir sur la planche.
import type { Vec3 } from '../core/views';
import type { LineStyleSpec } from '../linework/types';
import type { Image3dItem, Paper, PartViewHole, RectMm, Sheet, ShapeItem, TextItem, ViewportItem } from '../sheets/types';
import { DRAW_AREA, scaleRect, templateScale } from '../sheets/template';
import { FLOOR_CUT_DEFAULT } from '../core/subsetHide';
import type { ViewKind } from '../core/views';
import type { CaptureJob } from '../sheets/generate';
import { newId } from '../sheets/generate';
import type { PartAxis, V3 } from './analyze';
import { axisVector, toWorld } from './analyze';
import type { HoleGroup, PartType } from './parts';
import type { PartZone } from './parts';
import { fmtMm, holeAction, holeCallout, holeGroups } from './parts';

export interface ProductionOptions {
  paper: Paper;
  modelKey: string;
  style: LineStyleSpec;
  /** Viewbox représentée : « VBX-01 » */
  moduleLabel: string;
  /** type de la Viewbox (« Permabox V1B ») : titres des planches */
  typeLabel: string;
  /**
   * Viewbox mesurée : plan d'assemblage (vues de la box entière, bulles, nomenclature) ; `zoneOf` = zone de chaque pièce
   * (nœud) dans la hauteur de la box → plans des sous-ensembles plancher et toit
   */
  module?: { id: string; nodeId: string; zoneOf?: Record<string, PartZone> };
}

export interface ProductionResult {
  sheets: Sheet[];
  captures: CaptureJob[];
  /** fenêtres de vue à coter une fois calculées */
  dimensioned: string[];
}

const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const neg = (a: V3): V3 => [-a[0], -a[1], -a[2]];

/** Vue d'une pièce : on regarde dans la direction −toward, `right` est la droite du dessin. */
export function partViewSpec(toward: V3, right: V3): { kind: 'custom'; direction: Vec3; up: Vec3 } {
  return { kind: 'custom', direction: neg(toward), up: cross(toward, right) };
}

/**
 * Habillage : panneaux sandwich, contreplaqué, membranes (plaques larges ≥ 600 mm ou épaisses > 25 mm). Le plan
 * d'assemblage dessine la structure sans eux (sinon on ne voit que les panneaux), ils restent dans la nomenclature.
 */
export function isCladding(t: PartType): boolean {
  const g = t.rep.geo;
  return g.kind === 'plate' && (g.size[1] >= 600 || g.size[2] > 25);
}

/** Une petite pièce sans nom (morceau d'un export STL) : dans la liste de débit, sans planche. */
export function noSheet(t: PartType): boolean {
  return !t.name && Math.max(...t.rep.geo.size) < 80;
}

/** Vues d'une pièce : axe vu de face par chaque vue, et rôle. */
export interface PartViewPlan {
  key: 'elevation' | 'plan' | 'end' | 'face' | 'edge';
  title: string;
  toward: PartAxis;
  /** sens du dessin : axe de la pièce et signe */
  right: { axis: PartAxis; sign: 1 | -1 };
  common: boolean;
}

/** Vues retenues selon la nature de la pièce ; un profil est vu de face côté où il a le plus de perçages. */
export function partViews(t: PartType): PartViewPlan[] {
  const g = t.rep.geo;
  if (g.kind === 'profile') {
    const nv = g.holes.filter((h) => h.axis === 'v').length;
    const nw = g.holes.filter((h) => h.axis === 'w').length;
    const X: PartAxis = nv > nw ? 'v' : 'w';
    const Y: PartAxis = X === 'v' ? 'w' : 'v';
    return [
      { key: 'elevation', title: 'ELEVATION', toward: X, right: { axis: 'u', sign: 1 }, common: true },
      { key: 'plan', title: 'PLAN', toward: Y, right: { axis: 'u', sign: 1 }, common: true },
      { key: 'end', title: 'END VIEW', toward: 'u', right: { axis: X, sign: -1 }, common: false },
    ];
  }
  if (g.kind === 'plate')
    return [
      { key: 'face', title: 'FACE', toward: 'w', right: { axis: 'u', sign: 1 }, common: true },
      { key: 'edge', title: 'EDGE', toward: 'v', right: { axis: 'u', sign: 1 }, common: true },
    ];
  return [
    { key: 'face', title: 'FRONT', toward: 'w', right: { axis: 'u', sign: 1 }, common: true },
    { key: 'edge', title: 'TOP', toward: 'v', right: { axis: 'u', sign: 1 }, common: true },
    { key: 'end', title: 'SIDE', toward: 'u', right: { axis: 'w', sign: -1 }, common: false },
  ];
}

/** Longueur minimale d'un profil pour des détails de bout, et zone d'un bout où l'on cherche des perçages (mm). */
export const DETAIL_MIN_LENGTH = 1200;
export const DETAIL_ZONE = 600;

/**
 * Détails agrandis des bouts d'un profil (« DETAIL A — LEFT END ») : un par bout qui a des perçages vus en élévation dans
 * ses 600 premiers mm ; la région va du bout jusqu'au-delà du dernier de ces perçages (200 à 600 mm), en u (repère de
 * la pièce).
 */
export function endDetails(t: PartType, elevationAxis: PartAxis): Array<{ side: 'start' | 'end'; u0: number; u1: number }> {
  const g = t.rep.geo;
  const L = g.size[0];
  if (g.kind !== 'profile' || L < DETAIL_MIN_LENGTH) return [];
  const us = g.holes.filter((h) => h.axis === elevationAxis).map((h) => h.c[0]);
  const out: Array<{ side: 'start' | 'end'; u0: number; u1: number }> = [];
  const near = us.filter((u) => u <= DETAIL_ZONE);
  if (near.length) out.push({ side: 'start', u0: -20, u1: Math.min(L / 2, Math.max(200, Math.max(...near) + 80)) });
  const far = us.filter((u) => u >= L - DETAIL_ZONE);
  if (far.length) out.push({ side: 'end', u0: Math.max(L / 2, Math.min(L - 200, Math.min(...far) - 80)), u1: L + 20 });
  return out;
}

const VIEW_NAMES: Record<PartViewPlan['key'], string> = { elevation: 'Elevation', plan: 'Plan', end: 'End view', face: 'Face', edge: 'Edge' };

/** Vue où un perçage d'axe `axis` se voit en rond. */
export function seenIn(views: PartViewPlan[], axis: PartAxis): string {
  const v = views.find((x) => x.toward === axis);
  return v ? VIEW_NAMES[v.key] : '—';
}

const r1 = (v: number) => Math.round(v);

/** Positions d'un groupe de perçages : le long de la pièce (profil) ou (x, y) dans la vue de face. */
export function holePositions(t: PartType, g: HoleGroup, max = 14): string {
  const kind = t.rep.geo.kind;
  const pts =
    kind === 'profile'
      ? [...new Set(g.holes.map((h) => r1(h.c[0])))].sort((a, b) => a - b).map((x) => fmtMm(x))
      : g.holes.map((h) => {
          const other = (['u', 'v', 'w'] as const).filter((a) => a !== g.axis);
          const i = (a: PartAxis) => ['u', 'v', 'w'].indexOf(a);
          return `(${fmtMm(h.c[i(other[0])])}, ${fmtMm(h.c[i(other[1])])})`;
        });
  return pts.length > max ? `${pts.slice(0, max).join(', ')}, … (${pts.length})` : pts.join(', ');
}

export function endsText(ends?: [number, number]): string {
  if (!ends) return '—';
  if (ends[0] === 90 && ends[1] === 90) return 'Square cut both ends (90°)';
  return `${ends[0]}° / ${ends[1]}° (angle of cut to the axis)`;
}

/** Lignes estimées d'un texte dans une largeur (0,5 × hauteur par caractère, comme le rendu). */
function lines(text: string, width: number, size: number): number {
  const max = Math.max(4, Math.floor(width / (size * 0.5)));
  return text.split('\n').reduce((n, l) => n + Math.max(1, Math.ceil(l.length / max)), 0);
}

const NOTE =
  'Generated from the 3D model: dimensions and holes are measured on the drawing (mm). Threads marked « to confirm » are proposed from the drawn hole diameter — check before production; the other hole operations were set in VEM. Material, finish and welds are not in the model: fill in by hand.';

/** Liste de débit + une planche par pièce. */
export function productionSheets(types: PartType[], opts: ProductionOptions): ProductionResult {
  const k = templateScale(opts.paper);
  const area = DRAW_AREA;
  const sheets: Sheet[] = [];
  const captures: CaptureJob[] = [];
  const dimensioned: string[] = [];
  if (!types.length) return { sheets, captures, dimensioned };
  const newSheet = (title: string): Sheet => {
    const s: Sheet = { id: newId('s'), number: '', title, paper: opts.paper, orientation: 'landscape', kind: 'standard', role: 'production', items: [] };
    sheets.push(s);
    return s;
  };
  const text = (rect: RectMm, t: string, size: number, extra: Partial<TextItem> = {}): TextItem => ({ id: newId('t'), type: 'text', rect: scaleRect(rect, k), text: t, size: size * k, font: 'sans', ...extra });
  const line = (x0: number, y0: number, x1: number, y1: number, w = 0.25): ShapeItem => ({ id: newId('h'), type: 'shape', shape: 'line', rect: scaleRect({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, k), strokeMm: w * k });

  /** Tableau (colonnes en mm A1, la dernière prend le reste) ; suite sur une nouvelle planche si besoin. */
  const table = (
    first: Sheet,
    title: string,
    cols: string[],
    fixed: number[],
    rows: string[][],
    box: { x: number; y: number; w: number; bottom: number },
    size: number,
    more: () => Sheet,
  ): { sheet: Sheet; y: number } => {
    let sheet = first;
    const pad = 1.4;
    const widths = [...fixed, box.w - fixed.reduce((a, b) => a + b, 0)];
    const xs = widths.reduce<number[]>((acc, w) => [...acc, acc[acc.length - 1] + w], [box.x]);
    const headerH = size * 1.2 + 2 * pad;
    let y = box.y;
    let rowTop = 0;
    let rowLines: number[] = [];
    const close = () => {
      for (const ly of rowLines) sheet.items.push(line(box.x, ly, box.x + box.w, ly, ly === rowLines[1] ? 0.35 : 0.18));
      for (const lx of xs) sheet.items.push(line(lx, rowTop, lx, y, 0.18));
    };
    const open = (cont: boolean) => {
      sheet.items.push(text({ x: box.x, y, w: box.w, h: 7 }, cont ? `${title} (continued)` : title, size * 1.45, { bold: true }));
      y += size * 1.45 + 3;
      rowTop = y;
      cols.forEach((c, i) => sheet.items.push(text({ x: xs[i] + pad, y: y + pad, w: widths[i] - 2 * pad, h: headerH }, c, size, { bold: true })));
      y += headerH;
      rowLines = [rowTop, y];
    };
    open(false);
    for (const cells of rows) {
      const n = Math.max(...cells.map((c, i) => lines(c, widths[i] - 2 * pad, size)));
      const h = n * size * 1.2 + 2 * pad;
      if (y + h > box.bottom) {
        close();
        sheet = more();
        y = area.y + 8;
        open(true);
      }
      cells.forEach((c, i) => sheet.items.push(text({ x: xs[i] + pad, y: y + pad, w: widths[i] - 2 * pad, h }, c, size, i === 0 ? { bold: true } : {})));
      y += h;
      rowLines.push(y);
    }
    close();
    return { sheet, y };
  };

  // ─── liste de débit ───
  const listTitle = `Production - Cut list - ${opts.typeLabel}`;
  const list = newSheet(listTitle);
  const x0 = area.x + 6;
  const width = area.w - 12;
  const intro = `Parts of one Viewbox ${opts.typeLabel} (measured on ${opts.moduleLabel}) · ${types.length} part types · ${types.reduce((a, t) => a + t.qty, 0)} parts per Viewbox`;
  list.items.push(text({ x: x0, y: area.y + 4, w: width, h: 6 }, intro, 3.4));
  const sheetOf = new Map<string, string>();
  const listRows = types.map((t) => {
    const g = t.rep.geo;
    const groups = holeGroups(g.holes);
    const holes = groups.length ? groups.map((h) => `${h.holes.length}× ${holeCallout(h)}`).join(', ') : '—';
    const size = g.kind === 'profile' ? `${fmtMm(g.size[0])}` : `${fmtMm(g.size[0])} × ${fmtMm(g.size[1])} × ${fmtMm(g.size[2])}`;
    return [t.mark, String(t.qty), t.description, t.name || '—', size, g.kind === 'profile' ? endsText(g.ends).replace(' (angle of cut to the axis)', '') : '—', holes, noSheet(t) ? 'small unnamed piece — no sheet' : `@${t.mark}`];
  });
  const listed = table(
    list,
    'CUT LIST',
    ['Mark', 'Qty / VBX', 'Description', 'Name in model', 'Length / size (mm)', 'Ends', 'Holes', 'Sheet'],
    [16, 18, 150, 105, 52, 70, 120],
    listRows,
    { x: x0, y: area.y + 14, w: width, bottom: area.y + area.h - 18 },
    3,
    () => newSheet(`${listTitle} (continued)`),
  );
  listed.sheet.items.push(text({ x: x0, y: Math.min(listed.y + 3, area.y + area.h - 14), w: width, h: 12 }, NOTE, 2.8));

  // ─── plans d'assemblage : une feuille avec bulles (posées avec les cotes, une fois les vues calculées : autoDim +
  // sheets/balloons.ts) et nomenclature, pour une sélection de pièces ───
  const titleSize = 5;
  const assemblySheet = (
    title: string,
    picked: Array<{ t: PartType; nodeIds: string[] }>,
    views: Array<{ r: RectMm; kind: ViewKind; title: string; extra?: Partial<ViewportItem['request']> }>,
    drawCladding: boolean,
    note: string,
    layout: { img: RectMm; listBottom: number } = { img: { x: 247, y: 416, w: 215, h: 162 }, listBottom: area.y + area.h - 18 },
  ) => {
    const mod = opts.module!;
    const sheet = newSheet(title);
    const parts = picked.flatMap(({ t, nodeIds }) => nodeIds.map((nodeId) => ({ nodeId, mark: t.mark })));
    // dessinées : la structure seule (sans l'habillage) sauf pour un sous-ensemble (plancher, toit), où l'habillage en fait
    // partie ; toute la box si rien n'est dessinable
    const drawn = picked.filter(({ t }) => drawCladding || !isCladding(t)).flatMap(({ nodeIds }) => nodeIds);
    const include = drawn.length ? drawn : [mod.nodeId];
    for (const v of views) {
      const r = v.r;
      const vp: ViewportItem = {
        id: newId('v'),
        type: 'viewport',
        rect: scaleRect({ x: r.x, y: r.y + titleSize + 3, w: r.w, h: r.h - titleSize - 3 }, k),
        request: { modelId: opts.modelKey, subset: { include }, view: { kind: v.kind, frame: { moduleId: mod.id } }, style: { ...opts.style, colorByCategory: false, facadeMarks: false, hiddenLines: false }, ...(v.extra ?? {}) },
        scale: 0,
        label: v.title,
        showLabel: true,
        labelPos: { x: r.x * k, y: (r.y + titleSize) * k },
        labelSize: titleSize * k,
        renderStyle: 'trait',
        assembly: { parts },
      };
      sheet.items.push(vp);
      dimensioned.push(vp.id);
    }
    const img: Image3dItem = { id: newId('c'), type: 'image3d', rect: scaleRect(layout.img, k), url: '', width: 0, height: 0 };
    sheet.items.push(img);
    captures.push({ sheetId: sheet.id, itemId: img.id, include: drawCladding ? include : [mod.nodeId], hideCategories: [], view: 'iso-ne', projection: 'orthographic' });
    sheet.items.push(line(470, 40, 470, area.y + area.h - 4, 0.25));
    const bomRows = picked.map(({ t, nodeIds }) => [
      t.mark,
      String(nodeIds.length),
      isCladding(t) && !drawCladding ? `${t.description} (cladding, not drawn)` : t.description,
      t.name || '—',
      noSheet(t) ? '—' : `@${t.mark}`,
    ]);
    const bom = table(
      sheet,
      'PARTS LIST',
      ['Mark', 'Qty', 'Description', 'Name in model', 'Sheet'],
      [13, 10, 92, 62],
      bomRows,
      { x: 476, y: 44, w: 224, bottom: layout.listBottom },
      2.6,
      () => newSheet(`${title} (parts list continued)`),
    );
    bom.sheet.items.push(text({ x: 476, y: Math.min(bom.y + 3, layout.listBottom + 4), w: 224, h: 12 }, note, 2.4));
  };

  if (opts.module) {
    const all = types.map((t) => ({ t, nodeIds: t.nodeIds }));
    const cladding = types.filter(isCladding).map((t) => t.mark);
    // vue d'ensemble : dessus, plan coupé à 1,20 m, grand côté, petit côté, 3D
    assemblySheet(
      `Production - Assembly - ${opts.typeLabel}`,
      all,
      [
        { r: { x: 22, y: 44, w: 215, h: 178 }, kind: 'top', title: 'TOP VIEW' },
        { r: { x: 247, y: 44, w: 215, h: 178 }, kind: 'top', title: 'PLAN — CUT AT 1.20 m', extra: { floorCut: FLOOR_CUT_DEFAULT } },
        { r: { x: 22, y: 230, w: 440, h: 172 }, kind: 'left', title: 'LONG SIDE' },
        { r: { x: 22, y: 410, w: 215, h: 168 }, kind: 'front', title: 'SHORT SIDE' },
      ],
      false,
      `Qty per Viewbox. Views show the structure without the cladding${cladding.length ? ` (${cladding.join(', ')}: panels, boards, membranes)` : ''}. Balloons show each mark once on this sheet, where the part is seen; parts hidden in every view are only in the list. Details on the part sheets.`,
    );
    // sous-ensembles plancher et toit (comme les plans « Floor platform » / « Roof platform ») : dessus, dessous (l'ossature
    // vue d'en bas), grand côté, petit côté, avec leur habillage (contreplaqué, isolation, EPDM)
    const zoneOf = opts.module.zoneOf;
    if (zoneOf) {
      for (const [zone, name] of [
        ['floor', 'Floor platform'],
        ['roof', 'Roof platform'],
      ] as const) {
        const picked = types.map((t) => ({ t, nodeIds: t.nodeIds.filter((id) => zoneOf[id] === zone) })).filter((x) => x.nodeIds.length);
        if (picked.length < 2) continue;
        assemblySheet(
          `Production - Assembly - ${name} - ${opts.typeLabel}`,
          picked,
          // dessus et dessous en grand à gauche, grand côté dessous ; petit côté et 3D sous la nomenclature (toutes les vues
          // d'une planche par Viewbox sont à la même échelle : aucune vue trop basse pour ses cotes et bulles)
          [
            { r: { x: 22, y: 44, w: 440, h: 205 }, kind: 'top', title: 'TOP VIEW' },
            { r: { x: 22, y: 253, w: 440, h: 205 }, kind: 'bottom', title: 'BOTTOM VIEW' },
            { r: { x: 22, y: 462, w: 440, h: 116 }, kind: 'left', title: 'LONG SIDE' },
            { r: { x: 476, y: 384, w: 224, h: 104 }, kind: 'front', title: 'SHORT SIDE' },
          ],
          true,
          `${name}: parts of one Viewbox whose height lies in the ${zone === 'floor' ? 'floor' : 'roof'} zone (qty in this sub-assembly). The bottom view shows the frame from underneath. Details on the part sheets.`,
          { img: { x: 476, y: 492, w: 224, h: 86 }, listBottom: 362 },
        );
      }
    }
  }

  // ─── une planche par pièce ───
  const size = 3;
  for (const t of types) {
    if (noSheet(t)) continue;
    const g = t.rep.geo;
    const views = partViews(t);
    const groups = holeGroups(g.holes);
    const refOf = new Map<object, HoleGroup>();
    for (const hg of groups) for (const h of hg.holes) refOf.set(h, hg);
    const sheet = newSheet(`Production - ${t.mark} - ${t.name || t.description}`);
    sheetOf.set(t.mark, sheet.id);
    const f = g.frame;
    const holes: PartViewHole[] = g.holes.map((h) => {
      const hg = refOf.get(h)!;
      return { c: toWorld(f, h.c) as Vec3, axis: axisVector(f, h.axis) as Vec3, ref: hg.ref, name: holeCallout(hg) };
    });
    // cadres des vues (A1) : profil = élévation et dessus sur toute la largeur, bout + 3D dessous ; plaque / bloc =
    // face en grand, chant dessous, 3D à droite
    const rects: Record<PartViewPlan['key'], RectMm> =
      g.kind === 'profile'
        ? {
            elevation: { x: 22, y: 44, w: 678, h: 124 },
            plan: { x: 22, y: 172, w: 678, h: 120 },
            end: { x: 22, y: 296, w: 230, h: 86 },
            face: { x: 0, y: 0, w: 0, h: 0 },
            edge: { x: 0, y: 0, w: 0, h: 0 },
          }
        : {
            face: { x: 22, y: 50, w: 420, h: 236 },
            edge: { x: 22, y: 306, w: 420, h: 68 },
            end: { x: 460, y: 306, w: 240, h: 68 },
            elevation: { x: 0, y: 0, w: 0, h: 0 },
            plan: { x: 0, y: 0, w: 0, h: 0 },
          };
    // détails des bouts : la rangée du bas devient vue de bout · détail(s) · 3D
    const elevation = views.find((v) => v.key === 'elevation');
    const details = elevation ? endDetails(t, elevation.toward) : [];
    if (details.length) rects.end = { x: 22, y: 296, w: 150, h: 86 };
    const imgRect: RectMm =
      g.kind !== 'profile' ? { x: 460, y: 50, w: 240, h: 236 } : details.length ? { x: 180 + details.length * 178, y: 296, w: 700 - (180 + details.length * 178), h: 86 } : { x: 262, y: 296, w: 260, h: 86 };
    const titleSize = 5;
    for (const v of views) {
      const r = rects[v.key];
      const toward = axisVector(f, v.toward);
      const right = axisVector(f, v.right.axis);
      const vp: ViewportItem = {
        id: newId('v'),
        type: 'viewport',
        rect: scaleRect({ x: r.x, y: r.y + titleSize + 3, w: r.w, h: r.h - titleSize - 3 }, k),
        request: {
          modelId: opts.modelKey,
          subset: { include: [t.rep.nodeId] },
          view: partViewSpec(toward, v.right.sign > 0 ? right : neg(right)),
          style: { ...opts.style, hiddenLines: true, colorByCategory: false, facadeMarks: false, fineThresholdPaperMm: 0.2, detailMinPaperMm: 0 },
        },
        scale: 0,
        label: v.title,
        showLabel: true,
        labelPos: { x: r.x * k, y: (r.y + titleSize) * k },
        labelSize: titleSize * k,
        renderStyle: 'trait',
        partView: { nodeId: t.rep.nodeId, mark: t.mark, holes, ...(v.common ? { common: true } : {}) },
      };
      sheet.items.push(vp);
      dimensioned.push(vp.id);
    }
    // détails agrandis des bouts : même vue que l'élévation, cadrée sur le bout
    if (elevation)
      details.forEach((d, i) => {
        const r: RectMm = { x: 180 + i * 178, y: 296, w: 170, h: 86 };
        const letter = String.fromCharCode(65 + i);
        const [B, H] = [g.size[1], g.size[2]];
        const a = toWorld(f, [d.u0, -20, -20]) as Vec3;
        const b = toWorld(f, [d.u1, B + 20, H + 20]) as Vec3;
        const end = toWorld(f, [d.side === 'start' ? 0 : g.size[0], B / 2, H / 2]) as Vec3;
        const toward = axisVector(f, elevation.toward);
        const vp: ViewportItem = {
          id: newId('v'),
          type: 'viewport',
          rect: scaleRect({ x: r.x, y: r.y + titleSize + 3, w: r.w, h: r.h - titleSize - 3 }, k),
          request: {
            modelId: opts.modelKey,
            subset: { include: [t.rep.nodeId] },
            view: partViewSpec(toward, axisVector(f, 'u')),
            style: { ...opts.style, hiddenLines: true, colorByCategory: false, facadeMarks: false, fineThresholdPaperMm: 0.2, detailMinPaperMm: 0 },
          },
          scale: 0,
          label: `DETAIL ${letter} — ${d.side === 'start' ? 'LEFT' : 'RIGHT'} END`,
          showLabel: true,
          labelPos: { x: r.x * k, y: (r.y + titleSize) * k },
          labelSize: titleSize * k,
          renderStyle: 'trait',
          partView: { nodeId: t.rep.nodeId, mark: t.mark, holes, window: { a, b, end } },
        };
        sheet.items.push(vp);
        dimensioned.push(vp.id);
      });
    const img: Image3dItem = { id: newId('c'), type: 'image3d', rect: scaleRect(imgRect, k), url: '', width: 0, height: 0 };
    sheet.items.push(img);
    captures.push({ sheetId: sheet.id, itemId: img.id, include: [t.rep.nodeId], hideCategories: [], view: 'iso-ne', projection: 'orthographic' });

    // ─── données de la pièce (gauche) et perçages (droite) ───
    const top = 392;
    const bottom = area.y + area.h - 4;
    sheet.items.push(line(22, top - 6, 700, top - 6, 0.35));
    sheet.items.push(text({ x: 22, y: top, w: 230, h: 10 }, `${t.mark}  ·  QTY ${t.qty} PER VIEWBOX`, 6, { bold: true }));
    const data: Array<[string, string]> = [
      ['Description', t.description],
      ['Name in model', t.name || '—'],
      [g.kind === 'profile' ? 'Cut length' : 'Overall size', g.kind === 'profile' ? `${fmtMm(g.size[0])} mm` : `${fmtMm(g.size[0])} × ${fmtMm(g.size[1])} × ${fmtMm(g.size[2])} mm`],
      ...(g.kind === 'profile' ? ([['Ends', endsText(g.ends)]] as Array<[string, string]>) : []),
      ['Holes', groups.length ? `${g.holes.length} in ${groups.length} operation${groups.length > 1 ? 's' : ''} (table)` : 'None in the model'],
      ...(g.solids > 1 ? ([['Assembly', `Welded assembly of ${g.solids} pieces — weld details to add`]] as Array<[string, string]>) : []),
      ['Material', '______________________'],
      ['Finish', '______________________'],
    ];
    let y = top + 12;
    for (const [kk, vv] of data) {
      const h = lines(vv, 150, size) * size * 1.25 + 1.6;
      sheet.items.push(text({ x: 22, y, w: 48, h }, kk, size, { bold: true }));
      sheet.items.push(text({ x: 72, y, w: 160, h }, vv, size));
      y += h;
    }
    sheet.items.push(text({ x: 22, y: Math.min(y + 2, bottom - 14), w: 210, h: 14 }, NOTE, 2.5));
    if (groups.length) {
      const rows = groups.map((hg) => [hg.ref, String(hg.holes.length), holeAction(hg), seenIn(views, hg.axis), holePositions(t, hg)]);
      table(
        sheet,
        'HOLES',
        ['Ref', 'Qty', 'Operation', 'Seen in', g.kind === 'profile' ? 'Position from left end (mm)' : 'Position x, y from bottom-left corner (mm)'],
        [12, 12, 92, 30],
        rows,
        { x: 250, y: top, w: 450, bottom },
        size,
        () => newSheet(`Production - ${t.mark} - holes (continued)`),
      );
    } else sheet.items.push(text({ x: 250, y: top, w: 450, h: 8 }, 'HOLES: none drawn in the model', size * 1.45, { bold: true }));
  }
  // liste de débit : numéro de planche de chaque pièce, connu une fois toutes les planches créées (numérotation PR.n
  // dans l'ordre de la série, voir renumber)
  const numberOf = (id: string) => `PR.${sheets.findIndex((s) => s.id === id) + 1}`;
  for (const s of sheets)
    for (const it of s.items) if (it.type === 'text' && it.text.startsWith('@')) it.text = sheetOf.has(it.text.slice(1)) ? numberOf(sheetOf.get(it.text.slice(1))!) : '—';
  return { sheets, captures, dimensioned };
}
