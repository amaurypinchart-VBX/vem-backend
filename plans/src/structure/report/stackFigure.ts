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
    /** posé sur le sol (portance en pression, pas une dalle) */
    stackTitleGround: string;
    stackIntroGround: string;
    slabTitle: string;
    slabIntro: string;
    /** descente de charges par appui (charge locale sous chaque plaque) */
    localTitle: string;
    localIntro: (checked: boolean) => string;
    localCols: [string, string, string, string, string, string];
    localSum: (sum: string, total: string) => string;
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
    short: Record<'slab' | 'ground' | 'roadway' | 'timber' | 'plate' | 'block' | 'packing' | 'jack' | 'foot' | 'viewbox' | 'profiles' | 'joists' | 'cale', string>;
    figure: string;
  }
> = {
  fr: {
    stackTitle: 'Coupe du calage — de la dalle à la Viewbox',
    stackIntro: 'Ce qui est posé sur la dalle, couche par couche de bas en haut, sous chaque appui (appuis identiques regroupés). Épaisseurs : calage retenu et dessin du modèle (blocs, vide entre le bloc et la Viewbox).',
    stackTitleGround: 'Coupe du calage — du sol à la Viewbox',
    stackIntroGround: 'Ce qui est posé sur le sol, couche par couche de bas en haut, sous chaque appui (appuis identiques regroupés). Épaisseurs : calage retenu et dessin du modèle (blocs, vide entre le bloc et la Viewbox).',
    slabTitle: 'Charge sur la dalle sous chaque Viewbox',
    slabIntro: 'Poids posé sur la dalle sous chaque Viewbox, poste par poste, dans la combinaison la plus lourde (caractéristique), rapporté à la surface de dalle qu’elle charge.',
    localTitle: 'Descente de charges par appui — charge locale sous chaque plaque',
    localIntro: (checked) =>
      `Charge de chaque appui (la plus forte de ses combinaisons) + son calage, divisée par la surface de la plaque qui le pose sur la dalle (élargie à 45° dans l’épaisseur des plaques de roulage, dont le poids réparti s’ajoute), comparée au poids admis par m² ; « surface nécessaire » = plaque qu’il faudrait pour rester sous l’admissible. ${checked ? 'Critère exigé : chaque plaque doit passer.' : 'Pour information (le critère est la dalle sous chaque Viewbox) : au-dessus de 1, charge locale à faire accepter par l’exploitant, ou plaque plus grande / appuis ajoutés.'}`,
    localCols: ['Appui', 'Charge', 'Calage', 'Plaque sous l’appui', 'Charge locale', 'Surface nécessaire'],
    localSum: (sum, total) => `Somme des charges par appui : ${sum} (maxima de chaque appui, pas simultanés) ; poids total simultané (combinaison la plus lourde + calage) : ${total}.`,
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
    short: { slab: 'Dalle', ground: 'Sol', roadway: 'Plaques de roulage', timber: 'Madriers', plate: 'Plaques', block: 'Bloc bois', packing: 'Cales', jack: 'Vérin', foot: 'Pied', viewbox: 'Viewbox (UNP)', profiles: 'Profils du plancher', joists: 'Madriers', cale: 'Cale composée' },
    figure: 'Coupe du calage (échelle des hauteurs, largeurs schématiques)',
  },
  de: {
    stackTitle: 'Unterpallung im Schnitt — von der Decke bis zur Viewbox',
    stackIntro: 'Was auf der Decke liegt, Lage für Lage von unten nach oben, unter jedem Auflager (gleiche Auflager zusammengefasst). Dicken: gewählte Unterpallung und Zeichnung des Modells (Klötze, Abstand zwischen Klotz und Viewbox).',
    stackTitleGround: 'Unterpallung im Schnitt — vom Boden bis zur Viewbox',
    stackIntroGround: 'Was auf dem Boden liegt, Lage für Lage von unten nach oben, unter jedem Auflager (gleiche Auflager zusammengefasst). Dicken: gewählte Unterpallung und Zeichnung des Modells (Klötze, Abstand zwischen Klotz und Viewbox).',
    slabTitle: 'Last auf der Decke unter jeder Viewbox',
    slabIntro: 'Last auf der Decke unter jeder Viewbox, Posten für Posten, in der ungünstigsten Kombination (charakteristisch), bezogen auf die von ihr belastete Deckenfläche.',
    localTitle: 'Lastabtrag je Auflager — örtliche Last unter jeder Platte',
    localIntro: (checked) =>
      `Last jedes Auflagers (die größte seiner Kombinationen) + seine Unterpallung, geteilt durch die Fläche der Platte, mit der es auf der Decke steht (unter 45° durch die Dicke der Fahrplatten verbreitert, deren verteiltes Gewicht hinzukommt), verglichen mit der zulässigen Last je m²; „erf. Fläche“ = Platte, die für die zulässige Last nötig wäre. ${checked ? 'Gefordertes Kriterium: jede Platte muss bestehen.' : 'Zur Information (Kriterium ist die Decke unter jeder Viewbox): über 1 muss der Betreiber die örtliche Last freigeben, oder größere Platte / zusätzliche Auflager.'}`,
    localCols: ['Auflager', 'Last', 'Unterpallung', 'Platte unter dem Auflager', 'Örtliche Last', 'Erf. Fläche'],
    localSum: (sum, total) => `Summe der Auflagerlasten: ${sum} (Größtwerte je Auflager, nicht gleichzeitig); gleichzeitige Gesamtlast (ungünstigste Kombination + Unterpallung): ${total}.`,
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
    short: { slab: 'Decke', ground: 'Boden', roadway: 'Fahrplatten', timber: 'Kanthölzer', plate: 'Platten', block: 'Holzklotz', packing: 'Keile', jack: 'Spindel', foot: 'Fuß', viewbox: 'Viewbox (UNP)', profiles: 'Bodenträger', joists: 'Kanthölzer', cale: 'Zusammengesetzter Klotz' },
    figure: 'Unterpallung im Schnitt (Höhen maßstäblich, Breiten schematisch)',
  },
  en: {
    stackTitle: 'Packing section — from the slab to the Viewbox',
    stackIntro: 'What is laid on the slab, layer by layer from bottom to top, under each support (identical supports grouped). Thicknesses: chosen packing and model drawing (blocks, gap between the block and the Viewbox).',
    stackTitleGround: 'Packing section — from the ground to the Viewbox',
    stackIntroGround: 'What is laid on the ground, layer by layer from bottom to top, under each support (identical supports grouped). Thicknesses: chosen packing and model drawing (blocks, gap between the block and the Viewbox).',
    slabTitle: 'Load on the slab under each Viewbox',
    slabIntro: 'Weight on the slab under each Viewbox, item by item, in the heaviest combination (characteristic), divided by the slab area it loads.',
    localTitle: 'Load take-down per support — local load under each plate',
    localIntro: (checked) =>
      `Load of each support (the highest of its combinations) + its packing, divided by the area of the plate that sets it on the slab (widened at 45° through the thickness of the roadway plates, whose distributed weight is added), compared with the allowable weight per m²; “area needed” = plate that would keep it under the allowable. ${checked ? 'Required criterion: every plate must pass.' : 'For information (the criterion is the slab under each Viewbox): above 1, the local load must be accepted by the operator, or a larger plate / added supports.'}`,
    localCols: ['Support', 'Load', 'Packing', 'Plate under the support', 'Local load', 'Area needed'],
    localSum: (sum, total) => `Sum of the support loads: ${sum} (maxima of each support, not simultaneous); simultaneous total weight (heaviest combination + packing): ${total}.`,
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
    short: { slab: 'Slab', ground: 'Ground', roadway: 'Roadway plates', timber: 'Sleepers', plate: 'Plates', block: 'Timber block', packing: 'Packing', jack: 'Jack', foot: 'Foot', viewbox: 'Viewbox (UNP)', profiles: 'Floor members', joists: 'Joists', cale: 'Built-up block' },
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

const FILL: Record<string, string> = { roadway: '#9ca3af', timber: '#e8c58f', joists: '#e8c58f', plate: '#fcd34d', block: '#d6a76c', packing: '#f59e0b', jack: '#6b7280', foot: '#6b7280' };
/** Couleur du trait des madriers (comme sur les plans). */
const TIMBER_STROKE = '#a16207';

/**
 * Croquis d'une coupe dans le cadre (x, y, w, h) en mm : dalle hachurée en bas, couches à l'échelle des hauteurs
 * (épaisseur inconnue : 1,5 cm en pointillés), élément de la Viewbox en haut, cotes à droite, hauteur totale à gauche.
 */
export function stackSketchSvg(s: CalageStack, x: number, y: number, w: number, h: number, lang: Lang, title?: string, slab = true): string {
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
  out.push(text(x + w * 0.06, yy + slabH - 1, slab ? S.short.slab : S.short.ground, size * 0.85, { color: '#374151' }));
  // couches d'une cale composée : même largeur (plaques et madriers à la taille du bloc)
  const widthOf = (kind: string, group?: string) => (group && kind !== 'jack' ? full * 0.66 : ({ roadway: full, timber: full * 0.92, joists: full * 0.78, plate: full * 0.78, block: full * 0.62, packing: full * 0.5, jack: full * 0.12, foot: full * 0.2 })[kind] ?? full * 0.5);
  const groups: Array<{ name: string; top: number; bottom: number }> = [];
  s.layers.forEach((l, i) => {
    const lh = shown[i] * k;
    yy -= lh;
    const lw = widthOf(l.kind, l.group);
    if (l.group) {
      const g = groups[groups.length - 1];
      if (g && g.name === l.group && Math.abs(g.top - (yy + lh)) < 1e-6) g.top = yy;
      else groups.push({ name: l.group, top: yy, bottom: yy + lh });
    }
    if (l.kind === 'joists' && l.joists) {
      // madriers sur chant coupés : un à chaque bord, les autres à intervalles égaux, croix = bois coupé
      const n = Math.max(1, l.joists.n);
      const pw = Math.max(0.8, Math.min(lw / n, (lw * l.joists.b) / Math.max(l.joists.width, 1)));
      for (let j = 0; j < n; j++) {
        const px = n === 1 ? cx - pw / 2 : cx - lw / 2 + (j * (lw - pw)) / (n - 1);
        out.push(rect(px, yy, pw, lh, FILL.joists, TIMBER_STROKE, 0.18));
        out.push(line(px, yy, px + pw, yy + lh, TIMBER_STROKE, 0.1), line(px + pw, yy, px, yy + lh, TIMBER_STROKE, 0.1));
      }
    } else if (l.kind === 'plate' && l.count && l.count > 1) {
      // plaques empilées : une ligne entre chaque plaque
      out.push(rect(cx - lw / 2, yy, lw, lh, FILL.plate, '#374151', 0.2));
      for (let j = 1; j < l.count; j++) out.push(line(cx - lw / 2, yy + (j * lh) / l.count, cx + lw / 2, yy + (j * lh) / l.count, '#374151', 0.12));
    } else if (l.kind === 'jack') {
      // platine + tige
      const ph = Math.min(lh * 0.25, 1.2);
      out.push(rect(cx - full * 0.13, yy + lh - ph, full * 0.26, ph, FILL.jack));
      out.push(rect(cx - lw / 4, yy, lw / 2, lh - ph, FILL.jack));
    } else if (l.kind === 'timber' && l.section === 'cut') {
      // madriers coupés : sections côte à côte (nombre schématique)
      const n = Math.max(3, Math.min(8, Math.round(lw / Math.max(lh, 0.5))));
      const pw = lw / n;
      for (let i = 0; i < n; i++) out.push(rect(cx - lw / 2 + i * pw, yy, pw, lh, FILL.timber, TIMBER_STROKE, 0.18));
    } else if (l.kind === 'timber') {
      // madrier vu en long : un trait de fil du bois au milieu
      out.push(rect(cx - lw / 2, yy, lw, lh, FILL.timber, TIMBER_STROKE, 0.2));
      out.push(line(cx - lw / 2 + 0.6, yy + lh / 2, cx + lw / 2 - 0.6, yy + lh / 2, TIMBER_STROKE, 0.1));
    } else out.push(rect(cx - lw / 2, yy, lw, lh, FILL[l.kind] ?? '#e5e7eb', '#374151', 0.2, l.thickness === null));
    const label =
      l.kind === 'joists' && l.joists && l.thickness !== null
        ? `${S.short.joists} ${l.joists.n} × ${l.joists.b}×${Math.round(l.thickness)} mm`
        : l.kind === 'plate' && l.count && l.count > 1 && l.thickness !== null
          ? `${S.short.plate} ${l.count} × ${cmText(lang, l.thickness / l.count)}`
          : `${S.short[l.kind as keyof typeof S.short] ?? ''}${l.thickness !== null ? ` ${cmText(lang, l.thickness)}` : ` (${S.unknownThickness})`}`;
    // étiquette à droite de la couche, réduite si elle déborderait du cadre
    const lx = cx + full / 2 + 1;
    const ls = Math.min(size * 0.85, (x + w - lx) / Math.max(1, label.length * 0.5));
    out.push(text(lx, yy + lh / 2 + ls * 0.35, label, ls));
  });
  // cale composée : cadre en tirets autour de ses couches, nom au-dessus à gauche
  for (const g of groups) {
    const gw = full * 0.66 + 1.6;
    out.push(rect(cx - gw / 2, g.top - 0.5, gw, g.bottom - g.top + 1, 'none', '#7c2d12', 0.18, true));
    out.push(text(cx - gw / 2 + 0.4, g.top - 0.9, S.short.cale, size * 0.7, { color: '#7c2d12' }));
  }
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

/**
 * Toutes les coupes côte à côte (au plus 4 par rangée), avec le nom des appuis au-dessus de chacune. `slab` : posé sur
 * une dalle (sinon « Sol » en bas de la coupe).
 */
export function stacksFigureSvg(stacks: CalageStack[], lang: Lang, slab = true) {
  return (x: number, y: number, w: number, h: number) => {
    const per = Math.min(4, Math.max(1, stacks.length));
    const rows = Math.ceil(stacks.length / per);
    const cw = w / per;
    const rh = h / rows;
    return stacks.map((s, i) => stackSketchSvg(s, x + (i % per) * cw + 1, y + Math.floor(i / per) * rh, cw - 2, rh - 1, lang, s.supports.length > 3 ? `${s.supports.slice(0, 3).join(', ')}…` : s.supports.join(', '), slab)).join('');
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

/** Tableau de la descente de charges par appui (charge locale sous chaque plaque), dans la langue du document. */
export function supportLoadTable(res: CalageResult, lang: Lang): { cols: string[]; rows: string[][]; sum: string; checked: boolean } | null {
  const slab = res.slab;
  if (!slab?.supports?.length) return null;
  const S = STACK_LABELS[lang];
  const E = (t: string) => translate(lang, t);
  const kg = (N: number) => `${num(lang, N / 9.81, 0)} kg`;
  const rows = slab.supports.map((l) => [
    l.members.length > 1 || (l.members[0] && l.members[0] !== l.id) ? `${l.id} (${l.members.join(', ')})` : l.id,
    kg(l.reaction),
    kg(l.calage),
    `${E(l.plate.label)} → ${num(lang, l.plate.area / 1e6, 2)} m²`,
    `${num(lang, (l.q * 1e6) / 9.81, 0)} kg/m² — η ${num(lang, l.eta, 2)}`,
    Number.isFinite(l.areaNeeded) ? `${num(lang, l.areaNeeded / 1e6, 2)} m²` : '—',
  ]);
  const sumN = slab.supports.reduce((a, l) => a + l.reaction + l.calage, 0);
  return { cols: [...S.localCols], rows, sum: S.localSum(kg(sumN), kg(slab.global.load)), checked: !!slab.local };
}
