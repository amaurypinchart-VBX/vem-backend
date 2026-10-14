// Loading liste → classeur Excel au format bordereau : en-tête (chantier, n° d'order, client, date d'expédition,
// fichier 3D, version des règles, topologie), lignes par catégorie dans l'ordre du bordereau avec sous-totaux, puis
// « À valider — appréciation », « À confirmer », « Règle manquante », questions, remarques, légende. Couleurs douces
// et statut écrit en texte (lisible imprimé en noir et blanc). A4 portrait ajusté à la largeur, en-têtes répétés,
// volets figés. Fonctions pures.
import type { LoadingCategory } from '../core/types';
import { LOADING_CATEGORIES } from '../core/types';
import type { LoadingLine, LoadingList } from '../engine/generate';
import type { XCell, XSheet, XStyle } from './write';
import { writeXlsx } from './write';
import type { OdooProduct } from '../library/odoo';
import { odooKnown } from '../library/odoo';
import { ODOO_PRODUCTS } from '../library/odoo.data';

export interface BordereauMeta {
  chantier: string;
  orderNo: string;
  client: string;
  shippingDate: string;
  modelFile: string;
  modelDate?: string;
  topology: string;
  revision: number;
  /** « Brouillon » / « Validée le … » */
  state: string;
}

/** Couleurs de confiance (fiche 02) : bleu confirmé, ambre à confirmer, vert nouvelle règle à valider, mauve régime connecté observé. */
export const LEGEND_COLORS = {
  confirme: 'DDEBF7',
  a_confirmer: 'FFF2CC',
  nouvelle: 'E2EFDA',
  observe: 'E6E0F8',
} as const;

const HEAD = '1F4E78';
const STYLES: Record<string, XStyle> = {
  title: { bold: true, size: 14, color: HEAD },
  label: { bold: true, color: '595959' },
  value: {},
  valueWrap: { wrap: true, valign: 'top' },
  th: { bold: true, color: 'FFFFFF', fill: HEAD, border: true, valign: 'center', wrap: true },
  section: { bold: true, size: 11, color: HEAD, fill: 'F2F2F2', border: true },
  subtotal: { italic: true, color: '595959', align: 'right' },
  note: { italic: true, color: '595959', wrap: true, valign: 'top' },
};
// une famille de styles par couleur de ligne
for (const [k, fill] of Object.entries({ blanc: '', ...LEGEND_COLORS })) {
  const f = fill || undefined;
  STYLES[`ref-${k}`] = { bold: true, border: true, fill: f, valign: 'top' };
  STYLES[`txt-${k}`] = { border: true, fill: f, wrap: true, valign: 'top' };
  STYLES[`qty-${k}`] = { bold: true, border: true, fill: f, number: 'dec', align: 'right', valign: 'top' };
  STYLES[`small-${k}`] = { border: true, fill: f, wrap: true, valign: 'top', size: 8, color: '404040' };
}

const STATUS_TEXT: Record<LoadingLine['status'], string> = {
  calcule: 'confirmé',
  jugement: 'corrigé pour ce chantier',
  appreciation: 'appréciation',
  a_confirmer: 'à confirmer',
  regle_manquante: 'règle manquante',
};
const UNIT_TEXT = { pce: 'pce', m: 'm', m2: 'm²', L: 'L' } as const;

function colorOf(l: LoadingLine): keyof typeof LEGEND_COLORS | 'blanc' {
  if (l.status === 'regle_manquante') return 'observe';
  if (l.status === 'a_confirmer') return 'a_confirmer';
  if (l.status === 'calcule') return 'confirme';
  return 'blanc';
}

export const COLUMNS = ['Référence', 'Désignation', 'Quantité', 'Unité', 'Catégorie', 'Détail du calcul', 'Confiance'];

export function bordereauSheet(list: LoadingList, meta: BordereauMeta): XSheet {
  const rows: (XCell | string | number | null)[][] = [];
  const merges: string[] = [];
  const catLabel = (c: LoadingCategory) => LOADING_CATEGORIES.find((x) => x.key === c)?.label ?? c;
  const row = (...cells: (XCell | string | number | null)[]) => rows.push(cells);
  const wide = (text: string, s: string) => {
    rows.push([{ v: text, s }]);
    merges.push(`A${rows.length}:G${rows.length}`);
  };
  row({ v: 'LOADING LISTE', s: 'title' }, null, null, null, null, { v: meta.state, s: 'label' });
  const info = (label: string, value: string) => {
    rows.push([{ v: label, s: 'label' }, { v: value, s: 'valueWrap' }]);
    merges.push(`B${rows.length}:G${rows.length}`);
  };
  info('Chantier', meta.chantier);
  info('N° d’order', meta.orderNo);
  info('Client', meta.client);
  info('Date d’expédition', meta.shippingDate);
  info('Fichier 3D', `${meta.modelFile}${meta.modelDate ? ` (analyse du ${meta.modelDate})` : ''}`);
  info('Règles', `version ${list.rulesVersion} · liste v${meta.revision}`);
  info('Topologie', meta.topology);
  row();
  row(...COLUMNS.map((c) => ({ v: c, s: 'th' })));
  const headerRow = rows.length;
  const lineRow = (l: LoadingLine) => {
    const c = colorOf(l);
    row(
      { v: l.article, s: `ref-${c}` },
      { v: l.designation, s: `txt-${c}` },
      { v: l.qty, s: `qty-${c}` },
      { v: UNIT_TEXT[l.unit], s: `txt-${c}` },
      { v: catLabel(l.categorie), s: `txt-${c}` },
      { v: l.detail, s: `small-${c}` },
      { v: STATUS_TEXT[l.status], s: `txt-${c}` },
    );
  };
  const main = list.lines.filter((l) => l.status === 'calcule' || l.status === 'jugement');
  for (const cat of LOADING_CATEGORIES) {
    const ls = main.filter((l) => l.categorie === cat.key && l.qty !== 0);
    if (!ls.length) continue;
    wide(cat.label, 'section');
    ls.forEach(lineRow);
    rows.push([null, null, null, null, null, { v: `Sous-total ${cat.label} : ${ls.length} ligne(s)`, s: 'subtotal' }]);
    merges.push(`F${rows.length}:G${rows.length}`);
  }
  const sections: [string, LoadingLine[]][] = [
    ['À valider — appréciation (jamais calculé seul)', list.lines.filter((l) => l.status === 'appreciation')],
    ['À confirmer (règle pas encore verrouillée, ou question sans réponse)', list.lines.filter((l) => l.status === 'a_confirmer')],
    ['Règle manquante (rien d’inventé : valeurs observées en repère)', list.lines.filter((l) => l.status === 'regle_manquante')],
  ];
  for (const [title, ls] of sections) {
    if (!ls.length) continue;
    row();
    wide(title, 'section');
    ls.forEach(lineRow);
  }
  if (list.questions.length) {
    row();
    wide('Questions encore ouvertes', 'section');
    for (const q of list.questions) wide(`• ${q.text}`, 'note');
  }
  if (list.notes.length) {
    row();
    wide('Remarques', 'section');
    for (const n of list.notes) wide(`• ${n}`, 'note');
  }
  row();
  wide('Légende', 'section');
  for (const [k, text] of [
    ['confirme', 'Bleu : règle confirmée'],
    ['a_confirmer', 'Ambre : à confirmer'],
    ['nouvelle', 'Vert : nouvelle règle à valider'],
    ['observe', 'Mauve : régime connecté observé, à re-caler'],
  ] as const) {
    rows.push([{ v: '', s: `ref-${k}` }, { v: text, s: 'value' }]);
    merges.push(`B${rows.length}:G${rows.length}`);
  }
  return {
    name: 'Loading liste',
    columns: [16, 46, 9, 6, 16, 58, 13],
    rows,
    merges,
    freezeRows: headerRow,
    printTitleRows: [headerRow, headerRow],
    rowHeights: { 0: 22 },
  };
}

/** Onglet « Odoo » : les lignes à quantité connue, au format des produits Odoo (Product Reference Code = référence
 *  Viewbox, Product = « [réf] nom Odoo »), prêtes à importer ; en dessous, les lignes dont la référence est inconnue
 *  d'Odoo (à créer dans Odoo ou à corriger), jamais mêlées aux autres. */
export function odooSheet(list: LoadingList, products: readonly OdooProduct[] = odooKnown(ODOO_PRODUCTS)): XSheet {
  const odoo = new Map(products.map((p) => [p.ref, p]));
  const lines = list.lines.filter((l) => l.qty !== null && l.qty > 0);
  const known = lines.filter((l) => odoo.has(l.article));
  const unknown = lines.filter((l) => !odoo.has(l.article));
  const rows: XCell[][] = [
    [
      { v: 'Product Reference Code', s: 'th' },
      { v: 'Product', s: 'th' },
      { v: 'Quantity', s: 'th' },
      { v: 'Unité', s: 'th' },
    ],
    ...known.map((l) => [
      { v: l.article, s: 'txt-blanc' },
      { v: `[${l.article}] ${odoo.get(l.article)!.name}`, s: 'txt-blanc' },
      { v: l.qty, s: 'qty-blanc' },
      { v: UNIT_TEXT[l.unit], s: 'txt-blanc' },
    ]),
  ];
  if (unknown.length) {
    rows.push([], [{ v: `Pas dans Odoo (${unknown.length}) — à créer dans Odoo ou à corriger avant l’import`, s: 'section' }]);
    for (const l of unknown)
      rows.push([
        { v: l.article, s: 'txt-blanc' },
        { v: l.designation, s: 'txt-blanc' },
        { v: l.qty, s: 'qty-blanc' },
        { v: UNIT_TEXT[l.unit], s: 'txt-blanc' },
      ]);
  }
  return { name: 'Odoo', columns: [22, 80, 10, 8], rows, freezeRows: 1 };
}

export function bordereauXlsx(list: LoadingList, meta: BordereauMeta): Uint8Array {
  return writeXlsx([bordereauSheet(list, meta), odooSheet(list)], STYLES);
}

/** « 6055RKLOKVIE_loading_v2.xlsx » (caractères sûrs pour un nom de fichier). */
export function bordereauFileName(orderNo: string, revision: number): string {
  const base = (orderNo || 'chantier').replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '') || 'chantier';
  return `${base}_loading_v${revision}.xlsx`;
}
