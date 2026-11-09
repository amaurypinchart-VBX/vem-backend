// Coupe du calage (de la dalle à la Viewbox) et bilan des charges sur la dalle par Viewbox, pour la fiche de calage
// et le rapport : textes fixes FR / DE / EN, croquis vectoriel des couches (SVG en mm, polices Arimo) et lignes des
// tableaux. Les textes du moteur (couches, postes) sont en français et passent par `translate`. Fonctions pures.
import type { CalageResult } from '../core/calage';
import type { CalageStack } from '../core/calageStack';
import { FONT, esc, r2 } from './doc';
import type { Lang } from './i18n';
import { num } from './i18n';
import { translate } from './translate';

export const STACK_LABELS: Record<
  Lang,
  {
    stackTitle: string;
    stackIntro: string;
    slabTitle: string;
    slabIntro: string;
    colSupports: string;
    colLayers: string;
    colHeight: string;
    colItem: string;
    total: string;
    area: string;
    perM2: string;
    allowable: string;
    proposed: string;
    plusRoadway: string;
    toProfiles: string;
    unknownThickness: string;
    short: Record<'slab' | 'roadway' | 'plate' | 'block' | 'packing' | 'jack' | 'foot' | 'viewbox' | 'profiles', string>;
    figure: string;
  }
> = {
  fr: {
    stackTitle: 'Coupe du calage — de la dalle à la Viewbox',
    stackIntro: 'Ce qui est posé sur la dalle, couche par couche de bas en haut, sous chaque appui (appuis identiques regroupés). Épaisseurs : calage retenu et dessin du modèle (blocs, vide entre le bloc et la Viewbox).',
    slabTitle: 'Charge sur la dalle sous chaque Viewbox',
    slabIntro: 'Poids posé sur la dalle sous chaque Viewbox, poste par poste, dans la combinaison la plus lourde (caractéristique), rapporté à la surface de dalle qu’elle charge.',
    colSupports: 'Appuis',
    colLayers: 'Couches, de bas en haut',
    colHeight: 'Hauteur',
    colItem: 'Poste',
    total: 'Total',
    area: 'Surface de dalle',
    perM2: 'Charge au m²',
    allowable: 'admissible',
    proposed: 'poids type, à confirmer',
    plusRoadway: '+ plaques de roulage',
    toProfiles: 'jusqu’au dessous des profils du plancher',
    unknownThickness: 'ép. ?',
    short: { slab: 'Dalle', roadway: 'Plaques de roulage', plate: 'Plaques', block: 'Bloc bois', packing: 'Cales', jack: 'Vérin', foot: 'Pied', viewbox: 'Viewbox (UNP)', profiles: 'Profils du plancher' },
    figure: 'Coupe du calage (échelle des hauteurs, largeurs schématiques)',
  },
  de: {
    stackTitle: 'Unterpallung im Schnitt — von der Decke bis zur Viewbox',
    stackIntro: 'Was auf der Decke liegt, Lage für Lage von unten nach oben, unter jedem Auflager (gleiche Auflager zusammengefasst). Dicken: gewählte Unterpallung und Zeichnung des Modells (Klötze, Abstand zwischen Klotz und Viewbox).',
    slabTitle: 'Last auf der Decke unter jeder Viewbox',
    slabIntro: 'Last auf der Decke unter jeder Viewbox, Posten für Posten, in der ungünstigsten Kombination (charakteristisch), bezogen auf die von ihr belastete Deckenfläche.',
    colSupports: 'Auflager',
    colLayers: 'Lagen, von unten nach oben',
    colHeight: 'Höhe',
    colItem: 'Posten',
    total: 'Summe',
    area: 'Deckenfläche',
    perM2: 'Last je m²',
    allowable: 'zulässig',
    proposed: 'Typgewicht, zu bestätigen',
    plusRoadway: '+ Fahrplatten',
    toProfiles: 'bis Unterkante der Bodenträger',
    unknownThickness: 'Dicke ?',
    short: { slab: 'Decke', roadway: 'Fahrplatten', plate: 'Platten', block: 'Holzklotz', packing: 'Keile', jack: 'Spindel', foot: 'Fuß', viewbox: 'Viewbox (UNP)', profiles: 'Bodenträger' },
    figure: 'Unterpallung im Schnitt (Höhen maßstäblich, Breiten schematisch)',
  },
  en: {
    stackTitle: 'Packing section — from the slab to the Viewbox',
    stackIntro: 'What is laid on the slab, layer by layer from bottom to top, under each support (identical supports grouped). Thicknesses: chosen packing and model drawing (blocks, gap between the block and the Viewbox).',
    slabTitle: 'Load on the slab under each Viewbox',
    slabIntro: 'Weight on the slab under each Viewbox, item by item, in the heaviest combination (characteristic), divided by the slab area it loads.',
    colSupports: 'Supports',
    colLayers: 'Layers, bottom to top',
    colHeight: 'Height',
    colItem: 'Item',
    total: 'Total',
    area: 'Slab area',
    perM2: 'Load per m²',
    allowable: 'allowable',
    proposed: 'typical weight, to be confirmed',
    plusRoadway: '+ roadway plates',
    toProfiles: 'to the underside of the floor members',
    unknownThickness: 'thickn. ?',
    short: { slab: 'Slab', roadway: 'Roadway plates', plate: 'Plates', block: 'Timber block', packing: 'Packing', jack: 'Jack', foot: 'Foot', viewbox: 'Viewbox (UNP)', profiles: 'Floor members' },
    figure: 'Packing section (heights to scale, widths schematic)',
  },
};

const cmText = (lang: Lang, mm: number) => `${num(lang, Math.round(mm) / 10, 1)} cm`;

/** Hauteur d'une coupe : « 33,9 cm », « 33,9 cm + plaques de roulage ». */
export function stackHeightText(s: CalageStack, lang: Lang): string {
  const S = STACK_LABELS[lang];
  const unknown = s.layers.filter((l) => l.thickness === null);
  const base = cmText(lang, s.known);
  const tail = unknown.length ? (unknown.every((l) => l.kind === 'roadway') ? ` ${S.plusRoadway}` : ' + …') : '';
  return `${base}${tail}${s.underside ? '' : ` (${S.toProfiles})`}`;
}

/** Lignes d'une coupe pour un tableau : « 1. Bloc bois 100 × 100 × 24,4 cm — 24,4 cm » … « → Rive UNP … ». */
export function stackLines(s: CalageStack, lang: Lang): string[] {
  const E = (t: string) => translate(lang, t);
  return [
    ...s.layers.map((l, i) => `${i + 1}. ${E(l.label)} — ${l.thickness !== null ? cmText(lang, l.thickness) : E(l.note ?? '?')}${l.thickness !== null && l.note ? ` (${E(l.note)})` : ''}`),
    `→ ${E(s.top)}`,
  ];
}

/** Libellé des appuis d'une coupe : « B1, B7, B9 — bloc bois sous un vérin d’angle ; … ». */
export function stackSupports(s: CalageStack, lang: Lang): string {
  return `${s.supports.join(', ')} — ${s.types.map((t) => translate(lang, t)).join(' ; ')}`;
}

const text = (x: number, y: number, t: string, size: number, o: { bold?: boolean; color?: string; anchor?: 'start' | 'middle' | 'end' } = {}) =>
  `<text x="${r2(x)}" y="${r2(y)}" font-family="${FONT}" font-size="${r2(size)}"${o.bold ? ' font-weight="700"' : ''} fill="${o.color ?? '#111827'}"${o.anchor && o.anchor !== 'start' ? ` text-anchor="${o.anchor}"` : ''}>${esc(t)}</text>`;
const rect = (x: number, y: number, w: number, h: number, fill: string, stroke = '#374151', sw = 0.2, dash = false) =>
  `<rect x="${r2(x)}" y="${r2(y)}" width="${r2(w)}" height="${r2(Math.max(h, 0.2))}" fill="${fill}" stroke="${stroke}" stroke-width="${r2(sw)}"${dash ? ' stroke-dasharray="0.8 0.6"' : ''}/>`;
const line = (x1: number, y1: number, x2: number, y2: number, color = '#374151', w = 0.2) => `<line x1="${r2(x1)}" y1="${r2(y1)}" x2="${r2(x2)}" y2="${r2(y2)}" stroke="${color}" stroke-width="${r2(w)}"/>`;

const FILL: Record<string, string> = { roadway: '#9ca3af', plate: '#fcd34d', block: '#d6a76c', packing: '#f59e0b', jack: '#6b7280', foot: '#6b7280' };

/**
 * Croquis d'une coupe dans le cadre (x, y, w, h) en mm : dalle hachurée en bas, couches à l'échelle des hauteurs
 * (épaisseur inconnue : 1,5 cm en pointillés), élément de la Viewbox en haut, cotes à droite, hauteur totale à gauche.
 */
export function stackSketchSvg(s: CalageStack, x: number, y: number, w: number, h: number, lang: Lang, title?: string): string {
  const S = STACK_LABELS[lang];
  const out: string[] = [];
  const size = Math.min(2.3, w / 16);
  const top0 = y + (title ? size * 2.2 : 0.5);
  if (title) out.push(text(x + w / 2, y + size * 1.2, title, size, { bold: true, anchor: 'middle' }));
  const shown = s.layers.map((l) => (l.thickness !== null && l.thickness > 0 ? l.thickness : 15));
  const topH = 80;
  const total = shown.reduce((a, b) => a + b, 0) + topH;
  const slabH = 4;
  const k = (y + h - slabH - top0 - size * 1.5) / total;
  const cx = x + w * 0.36;
  const full = w * 0.5;
  let yy = y + h - slabH;
  // dalle
  out.push(rect(x + w * 0.04, yy, w * 0.92 - 0.2, slabH, '#e5e7eb', '#6b7280'));
  for (let hx = x + w * 0.06; hx < x + w * 0.95; hx += 2) out.push(line(hx, yy + slabH, Math.min(hx + 2, x + w * 0.96), yy, '#9ca3af', 0.15));
  out.push(text(x + w * 0.06, yy + slabH - 1, S.short.slab, size * 0.85, { color: '#374151' }));
  const widthOf = (kind: string) => ({ roadway: full, plate: full * 0.78, block: full * 0.62, packing: full * 0.5, jack: full * 0.12, foot: full * 0.2 })[kind] ?? full * 0.5;
  s.layers.forEach((l, i) => {
    const lh = shown[i] * k;
    yy -= lh;
    const lw = widthOf(l.kind);
    if (l.kind === 'jack') {
      // platine + tige
      const ph = Math.min(lh * 0.25, 1.2);
      out.push(rect(cx - full * 0.13, yy + lh - ph, full * 0.26, ph, FILL.jack));
      out.push(rect(cx - lw / 4, yy, lw / 2, lh - ph, FILL.jack));
    } else out.push(rect(cx - lw / 2, yy, lw, lh, FILL[l.kind] ?? '#e5e7eb', '#374151', 0.2, l.thickness === null));
    const label = `${S.short[l.kind as keyof typeof S.short] ?? ''}${l.thickness !== null ? ` ${cmText(lang, l.thickness)}` : ` (${S.unknownThickness})`}`;
    // étiquette à droite de la couche, réduite si elle déborderait du cadre
    const lx = cx + full / 2 + 1;
    const ls = Math.min(size * 0.85, (x + w - lx) / Math.max(1, label.length * 0.5));
    out.push(text(lx, yy + lh / 2 + ls * 0.35, label, ls));
  });
  // élément de la Viewbox qui porte : profil en U (rive) ou rectangle (profils du plancher)
  const vy = yy - 6;
  const vw = full * 1.05;
  if (s.underside) {
    out.push(`<path d="M${r2(cx - vw / 2)} ${r2(vy)}L${r2(cx + vw / 2)} ${r2(vy)}L${r2(cx + vw / 2)} ${r2(yy)}L${r2(cx - vw / 2)} ${r2(yy)}Z" fill="#1f2937" fill-opacity="0.85" stroke="#111827" stroke-width="0.2"/>`);
    out.push(text(cx, vy - 0.8, S.short.viewbox, size * 0.85, { anchor: 'middle', bold: true }));
  } else {
    out.push(rect(cx - vw / 2, vy, vw, 6, '#1f2937'));
    out.push(text(cx, vy - 0.8, S.short.profiles, size * 0.85, { anchor: 'middle', bold: true }));
  }
  // hauteur totale (cote à gauche)
  const bx = x + w * 0.07;
  const ytop = yy;
  const ybot = y + h - slabH;
  out.push(line(bx, ytop, bx, ybot, '#1a021d', 0.2), line(bx - 1, ytop, bx + 1, ytop, '#1a021d', 0.2), line(bx - 1, ybot, bx + 1, ybot, '#1a021d', 0.2));
  const ht = cmText(lang, s.known) + (s.layers.some((l) => l.thickness === null) ? '+' : '');
  out.push(`<text x="${r2(bx - 0.8)}" y="${r2((ytop + ybot) / 2)}" font-family="${FONT}" font-size="${r2(size)}" font-weight="700" fill="#1a021d" text-anchor="middle" transform="rotate(-90 ${r2(bx - 0.8)} ${r2((ytop + ybot) / 2)})">${esc(ht)}</text>`);
  return out.join('');
}

/** Toutes les coupes côte à côte (au plus 4 par rangée), avec le nom des appuis au-dessus de chacune. */
export function stacksFigureSvg(stacks: CalageStack[], lang: Lang) {
  return (x: number, y: number, w: number, h: number) => {
    const per = Math.min(4, Math.max(1, stacks.length));
    const rows = Math.ceil(stacks.length / per);
    const cw = w / per;
    const rh = h / rows;
    return stacks.map((s, i) => stackSketchSvg(s, x + (i % per) * cw + 1, y + Math.floor(i / per) * rh, cw - 2, rh - 1, lang, s.supports.length > 3 ? `${s.supports.slice(0, 3).join(', ')}…` : s.supports.join(', '))).join('');
  };
}

/**
 * Tableau du bilan des charges sur la dalle (une colonne par Viewbox) : postes (lignes, réunies par libellé), total,
 * surface, charge au m² et taux. Null sans dalle en charge répartie.
 */
export function slabBudgetTable(res: CalageResult, lang: Lang): { cols: string[]; rows: Array<{ label: string; values: string[]; bold?: boolean; proposed?: boolean }> } | null {
  const slab = res.slab;
  if (!slab) return null;
  const zones = slab.zones.filter((z) => z.budget?.length);
  if (!zones.length) return null;
  const S = STACK_LABELS[lang];
  const E = (t: string) => translate(lang, t);
  const kg = (N: number) => `${num(lang, N / 9.81, 0)} kg`;
  // postes : même clé et même libellé (sans le numéro de la Viewbox) sur une ligne
  const keyOf = (l: { key: string; label: string }) => (l.key === 'box' ? 'box' : l.key === 'redistribution' ? 'redistribution' : l.key === 'block' ? 'block' : `${l.key}|${l.label}`);
  const order: Array<{ k: string; label: string; proposed?: boolean }> = [];
  for (const z of zones)
    for (const l of z.budget!) {
      const k = keyOf(l);
      if (!order.some((o) => o.k === k)) order.push({ k, label: l.key === 'box' ? 'Viewbox, pesée (structure, plancher, sol, plafond, isolants)' : l.key === 'redistribution' ? 'Report de charge (vent, raideurs : combinaison la plus lourde de la zone)' : l.key === 'block' ? 'Blocs de calage bois' : l.label, ...(l.proposed ? { proposed: true } : {}) });
    }
  const rows: Array<{ label: string; values: string[]; bold?: boolean; proposed?: boolean }> = order.map((o) => ({
    label: `${E(o.label)}${o.proposed ? ` (${S.proposed})` : ''}`,
    values: zones.map((z) => {
      const l = z.budget!.find((x) => keyOf(x) === o.k);
      return l ? `${kg(l.N)}${l.count && l.count > 1 ? ` (${l.count} ×)` : ''}` : '—';
    }),
    ...(o.proposed ? { proposed: true } : {}),
  }));
  rows.push({ label: S.total, values: zones.map((z) => kg(z.load)), bold: true });
  rows.push({ label: S.area, values: zones.map((z) => `${num(lang, z.area / 1e6, 2)} m²`) });
  rows.push({ label: `${S.perM2} (${S.allowable} ${num(lang, (slab.bearing * 1e6) / 9.81, 0)} kg/m²)`, values: zones.map((z) => `${num(lang, (z.q * 1e6) / 9.81, 0)} kg/m² — η ${num(lang, z.eta, 2)}`), bold: true });
  return { cols: [S.colItem, ...zones.map((z) => z.id)], rows };
}
