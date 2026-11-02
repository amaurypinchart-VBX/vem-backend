// Lecture d'une liste réelle (ce qui est vraiment parti à l'entrepôt) : bordereau Excel (le nôtre ou un ancien),
// export Odoo des mouvements de stock (« [4-700-065] RUBBER … » + Demand / Quantity), CSV, ou texte copié d'un PDF
// (bon de livraison Odoo « Rental Delivery Slip »). Le tableau est lu tel quel, les colonnes Référence / Quantité /
// Désignation / Unité sont devinées puis corrigeables à la main (choix mémorisé par en-tête dans l'interface).
// Une même référence sur plusieurs lignes est additionnée ; une ligne sans référence est listée à part, jamais
// devinée. Fonctions pures.
import type { Workbook } from '../xlsx/read';
import { cellText } from '../xlsx/read';

/** Référence Viewbox / Odoo (« 4-700-065 », « 7-962-016 »). */
export const REF_RE = /\b(\d-\d{3}-\d{3,5})\b/;
/** Numéro de bon Odoo (« RVIE/OUT/00066 »). */
export const PICKING_RE = /\b([A-Z]{2,6}\/(?:OUT|PICK|INT|IN)\/\d{3,6})\b/;

export interface RealTable {
  /** feuille Excel, « CSV » ou « Texte collé » */
  name: string;
  rows: string[][];
}

export interface ColumnMap {
  /** index de la ligne d'en-tête (-1 = pas d'en-tête : les données commencent à la 1re ligne) */
  headerRow: number;
  ref: number;
  qty: number;
  designation?: number;
  unit?: number;
}

export interface RealListLine {
  article: string;
  qty: number;
  designation?: string;
  unit?: string;
  /** lignes du tableau (index 0) additionnées dans cette ligne */
  rows: number[];
}

export interface IgnoredRow {
  row: number;
  text: string;
  reason: string;
}

export interface ParsedRealList {
  lines: RealListLine[];
  ignored: IgnoredRow[];
  /** n° de bon trouvé dans le fichier (« RVIE/OUT/00066 ») */
  picking?: string;
}

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Nombre écrit à la française ou à l'anglaise : « 20 », « 20,00 », « 1 234,5 », « 1,234.50 », « 2.53 ». */
export function parseNumber(raw: string): number | null {
  let s = raw.replace(/[\s  ]/g, '');
  if (!/^-?[\d.,]+$/.test(s) || !/\d/.test(s)) return null;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    // le dernier séparateur est le séparateur décimal
    if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (lastComma >= 0) {
    // « 1,234 » (milliers à l'anglaise) seulement s'il y a plusieurs groupes de 3 ; sinon décimale
    s = /^-?\d{1,3}(,\d{3}){2,}$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
  } else if ((s.match(/\./g) ?? []).length > 1) s = s.replace(/\./g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Tableaux d'un classeur (une feuille = un tableau, cellules en texte). */
export function tablesFromWorkbook(wb: Workbook): RealTable[] {
  return wb.sheets
    .map((s) => ({ name: s.name, rows: s.rows.map((r) => Array.from({ length: r.length }, (_x, i) => cellText(r[i]))) }))
    .filter((t) => t.rows.some((r) => r.some((c) => c)));
}

/** CSV / texte collé (Excel → tabulations, CSV → « ; » ou « , ») ; sans séparateur régulier = une colonne par ligne. */
export function tableFromText(text: string, name = 'Texte collé'): RealTable {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const filled = lines.filter((l) => l.trim());
  // une virgule décimale suivie d'un espace (« 4,00 Units ») n'est pas un séparateur de colonnes
  const count = (sep: string) => filled.filter((l) => (sep === ',' ? l.replace(/(\d),(\d+)(?=\s)/g, '$1.$2') : l).split(sep).length > 1).length;
  const seps = ['\t', ';', ','].map((s) => ({ s, n: count(s) })).sort((a, b) => b.n - a.n);
  // un séparateur doit couper au moins la moitié des lignes (une virgule décimale isolée ne suffit pas)
  const sep = seps[0].n >= Math.max(2, filled.length / 2) ? seps[0].s : null;
  return { name, rows: lines.map((l) => (sep ? splitCsv(l, sep) : [l.trim()])) };
}

function splitCsv(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (q && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else q = !q;
    } else if (ch === sep && !q) {
      out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

/** Libellés d'en-tête : exacts (après normalisation) puis « contient ». */
const HEADS: Record<'ref' | 'qty' | 'designation' | 'unit', { exact: string[]; contains: RegExp }> = {
  ref: {
    exact: ['ref', 'reference', 'product reference code', 'code', 'article', 'sku', 'internal reference', 'default code', 'ref interne', 'referentie', 'product', 'produit', 'item'],
    contains: /reference|^product|^produit|^article/,
  },
  qty: {
    exact: ['qty', 'qte', 'quantite', 'quantity', 'demand', 'demande', 'done', 'quantite livree', 'quantity done', 'aantal', 'menge', 'nombre'],
    contains: /quantit|demand|^qt/,
  },
  designation: { exact: ['designation', 'description', 'libelle', 'name', 'nom', 'omschrijving', 'product name', 'naam'], contains: /designation|description|libelle/ },
  unit: { exact: ['unite', 'unit', 'uom', 'unit of measure', 'unite de mesure', 'eenheid', 'um', 'units'], contains: /unit of measure|^unite/ },
};

/** Colonnes devinées : la ligne d'en-tête qui nomme une référence et une quantité, sinon les colonnes dont le
 *  contenu ressemble à des références / des nombres. null = rien trouvé (choix à la main). */
export function guessColumns(t: RealTable): ColumnMap | null {
  const scan = Math.min(t.rows.length, 40);
  for (let r = 0; r < scan; r++) {
    const cells = t.rows[r].map(norm);
    const find = (k: keyof typeof HEADS, not: number[] = []) => {
      // libellé exact d'abord, puis contenant
      const exact = cells.findIndex((c, i) => !not.includes(i) && HEADS[k].exact.includes(c));
      return exact >= 0 ? exact : cells.findIndex((c, i) => !not.includes(i) && !!c && HEADS[k].contains.test(c));
    };
    const qty = find('qty');
    if (qty < 0) continue;
    let ref = find('ref', [qty]);
    if (ref < 0) continue;
    // « Product » d'Odoo et « Référence » peuvent coexister : la colonne qui contient vraiment des références gagne
    const data = t.rows.slice(r + 1, r + 60);
    const hits = (c: number) => data.filter((row) => REF_RE.test(row[c] ?? '')).length;
    const best = t.rows[r].map((_x, i) => i).filter((i) => i !== qty).sort((a, b) => hits(b) - hits(a))[0];
    if (best !== undefined && hits(best) > hits(ref)) ref = best;
    if (!hits(ref)) continue;
    const designation = find('designation', [qty, ref]);
    const unit = find('unit', [qty, ref, designation]);
    return { headerRow: r, ref, qty, ...(designation >= 0 ? { designation } : {}), ...(unit >= 0 ? { unit } : {}) };
  }
  // sans en-tête : colonne la plus riche en références, puis la colonne de nombres la plus remplie sur ces lignes
  const width = Math.max(0, ...t.rows.map((r) => r.length));
  if (width < 2) return null;
  const refRows = (c: number) => t.rows.filter((row) => REF_RE.test(row[c] ?? '')).length;
  const ref = [...Array(width).keys()].sort((a, b) => refRows(b) - refRows(a))[0];
  if (!refRows(ref)) return null;
  const withRef = t.rows.filter((row) => REF_RE.test(row[ref] ?? ''));
  const numRows = (c: number) => withRef.filter((row) => parseNumber(row[c] ?? '') !== null).length;
  const qty = [...Array(width).keys()].filter((c) => c !== ref).sort((a, b) => numRows(b) - numRows(a) || a - b)[0];
  if (qty === undefined || !numRows(qty)) return null;
  return { headerRow: -1, ref, qty };
}

/** Signature de l'en-tête (pour mémoriser le choix des colonnes d'un même type de fichier). */
export function headerSignature(t: RealTable, map: Pick<ColumnMap, 'headerRow'>): string {
  if (map.headerRow < 0) return `sans-entete:${Math.max(0, ...t.rows.map((r) => r.length))}`;
  return t.rows[map.headerRow].map(norm).join('|');
}

/** Un choix mémorisé s'applique s'il pointe sur des colonnes présentes. */
export function applySavedMap(t: RealTable, saved: ColumnMap | undefined): ColumnMap | null {
  if (!saved) return null;
  const width = Math.max(0, ...t.rows.map((r) => r.length));
  if (saved.headerRow >= t.rows.length || saved.ref >= width || saved.qty >= width) return null;
  return saved;
}

const unitAfter = /^(units?|unites?|unités?|pce|pcs|pieces?|pièces?|stk|st|m|m2|m²|l|kg|rolls?|rouleaux?)\b/i;

/** Texte libre (copié d'un PDF) : par ligne, la référence, puis la quantité = dernier nombre suivi d'une unité, sinon le
 *  dernier nombre de la ligne ; la désignation = le texte entre les deux. */
function parseFreeLine(text: string): { article: string; qty: number | null; designation: string; unit?: string } | null {
  const m = REF_RE.exec(text);
  if (!m) return null;
  const after = text.slice(m.index + m[0].length).replace(/^\s*\]\s*/, ' ');
  const nums = [...after.matchAll(/(?<![\w-])(\d{1,3}(?:[   ]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?)(?![\w-])/g)];
  let pick: RegExpMatchArray | undefined;
  let unit: string | undefined;
  // la quantité livrée est en fin de ligne : le dernier nombre suivi d'une unité (« 2 PCS », « 2,53 M » de la
  // désignation viennent avant)
  for (const n of nums) {
    const rest = after.slice((n.index ?? 0) + n[0].length).trim();
    const u = unitAfter.exec(rest);
    if (u) {
      pick = n;
      unit = u[1];
    }
  }
  pick ??= nums[nums.length - 1];
  // pas de nombre après la référence : un nombre avant (colonne « Qté » en tête de ligne)
  const before = text.slice(0, m.index);
  const lead = /(\d+(?:[.,]\d+)?)\s*(?:x|×)?\s*\[?$/.exec(before.trim());
  const qty = pick ? parseNumber(pick[1]) : lead ? parseNumber(lead[1]) : null;
  const designation = (pick ? after.slice(0, pick.index) : after).replace(/\s+/g, ' ').replace(/[\s|:;-]+$/, '').trim();
  return { article: m[1], qty, designation, unit };
}

/** Lignes réelles d'un tableau selon le choix des colonnes. `map` null = texte libre (une ligne = une ligne de bon). */
export function extractRealLines(t: RealTable, map: ColumnMap | null): ParsedRealList {
  const byRef = new Map<string, RealListLine>();
  const ignored: IgnoredRow[] = [];
  let picking: string | undefined;
  for (const row of t.rows)
    for (const c of row) {
      const p = PICKING_RE.exec(c);
      if (p) {
        picking = p[1];
        break;
      }
    }
  const add = (article: string, qty: number, r: number, designation?: string, unit?: string) => {
    const cur = byRef.get(article);
    if (cur) {
      cur.qty = Math.round((cur.qty + qty) * 1000) / 1000;
      cur.rows.push(r);
    } else byRef.set(article, { article, qty, rows: [r], ...(designation ? { designation } : {}), ...(unit ? { unit } : {}) });
  };
  const start = map ? map.headerRow + 1 : 0;
  for (let r = start; r < t.rows.length; r++) {
    const row = t.rows[r];
    const text = row.filter((c) => c).join(' · ');
    if (!text.trim()) continue;
    if (!map) {
      const f = parseFreeLine(row.join(' '));
      if (!f) {
        if (/\d/.test(text) && text.length < 300) ignored.push({ row: r, text, reason: 'pas de référence' });
        continue;
      }
      if (f.qty === null) ignored.push({ row: r, text, reason: 'pas de quantité' });
      else add(f.article, f.qty, r, f.designation || undefined, f.unit);
      continue;
    }
    const refCell = row[map.ref] ?? '';
    const m = REF_RE.exec(refCell);
    if (!m) {
      // sous-totaux, titres de section, lignes vides : ignorés ; une ligne avec une quantité est signalée
      if (parseNumber(row[map.qty] ?? '') !== null && refCell) ignored.push({ row: r, text, reason: 'pas de référence' });
      continue;
    }
    const qty = parseNumber(row[map.qty] ?? '');
    if (qty === null) {
      ignored.push({ row: r, text, reason: row[map.qty] ? `quantité illisible « ${row[map.qty]} »` : 'pas de quantité' });
      continue;
    }
    // « [4-700-065] RUBBER … » d'Odoo : la désignation est dans la même cellule que la référence
    const inline = refCell.replace(/^\s*\[?\s*\d-\d{3}-\d{3,5}\s*\]?\s*/, '').trim();
    const designation = (map.designation !== undefined ? row[map.designation] : '') || inline || undefined;
    add(m[1], qty, r, designation, map.unit !== undefined ? row[map.unit] || undefined : undefined);
  }
  return { lines: [...byRef.values()], ignored, ...(picking ? { picking } : {}) };
}

/** Tableau le plus probable d'un fichier : celui qui contient le plus de références. */
export function bestTable(tables: readonly RealTable[]): number {
  let best = 0;
  let n = -1;
  tables.forEach((t, i) => {
    const k = t.rows.filter((r) => r.some((c) => REF_RE.test(c))).length;
    if (k > n) {
      n = k;
      best = i;
    }
  });
  return best;
}
