// Lecteur .xlsx minimal (Office Open XML) sur fflate : valeurs des cellules + couleur de fond (les couleurs du
// classeur de règles ont un sens : bleu confirmé, ambre à confirmer, mauve observé). Sert au script d'import du
// classeur (Node) et à la lecture des bordereaux réels (navigateur). Pas de formules recalculées : on lit la valeur
// enregistrée par Excel. Fonctions pures.
import { strFromU8, unzipSync } from 'fflate';

export type CellValue = string | number | boolean | null;

export interface Cell {
  v: CellValue;
  /** couleur de fond ARGB (« FFDDEBF7 ») ou null */
  fill: string | null;
}

export interface Sheet {
  name: string;
  /** lignes (index 0 = ligne 1) ; colonnes par index (0 = A) ; trous = undefined */
  rows: (Cell | undefined)[][];
}

export interface Workbook {
  sheets: Sheet[];
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

export function decodeXml(s: string): string {
  return s
    .replace(/&(#x[0-9a-fA-F]+|#\d+|[a-z]+);/g, (m, e: string) => {
      if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
      return ENTITIES[e] ?? m;
    })
    .replace(/_x([0-9A-F]{4})_/g, (_m, h: string) => String.fromCharCode(parseInt(h, 16)));
}

function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(/([\w:]+)\s*=\s*"([^"]*)"/g)) out[m[1]] = decodeXml(m[2]);
  return out;
}

/** Texte d'un élément `<si>` / `<is>` : tous les `<t>` (texte riche = plusieurs runs). */
function textOf(xml: string): string {
  let s = '';
  for (const m of xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t(?:\s[^>]*)?\/>/g)) s += decodeXml(m[1] ?? '');
  return s;
}

/** « B12 » → [ligne 11, colonne 1]. */
export function cellRef(ref: string): [number, number] {
  const m = /^([A-Z]+)(\d+)$/.exec(ref);
  if (!m) throw new Error(`Référence de cellule invalide : ${ref}`);
  let col = 0;
  for (const ch of m[1]) col = col * 26 + (ch.charCodeAt(0) - 64);
  return [Number(m[2]) - 1, col - 1];
}

export function colName(i: number): string {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

function resolveTarget(target: string): string {
  const t = target.replace(/^\//, '');
  return t.startsWith('xl/') ? t : `xl/${t}`;
}

/** Couleur de fond de chaque style de cellule (index de cellXfs → ARGB ou null). */
function fillsByStyle(styles: string | undefined): (string | null)[] {
  if (!styles) return [];
  const fillsXml = /<fills[^>]*>([\s\S]*?)<\/fills>/.exec(styles)?.[1] ?? '';
  const fills = [...fillsXml.matchAll(/<fill>([\s\S]*?)<\/fill>|<fill\/>/g)].map((m) => {
    const body = m[1] ?? '';
    const pattern = /<patternFill([^>]*)/.exec(body);
    if (!pattern || /patternType="none"/.test(pattern[1])) return null;
    const fg = /<fgColor([^>]*)\/?>/.exec(body);
    const rgb = fg ? attrs(fg[1]).rgb : undefined;
    return rgb ? rgb.toUpperCase() : null;
  });
  const xfsXml = /<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/.exec(styles)?.[1] ?? '';
  return [...xfsXml.matchAll(/<xf\b([^>]*?)\/?>/g)].map((m) => {
    const a = attrs(m[1]);
    return fills[Number(a.fillId ?? 0)] ?? null;
  });
}

function parseSheet(name: string, xml: string, shared: string[], fills: (string | null)[]): Sheet {
  const rows: (Cell | undefined)[][] = [];
  for (const m of xml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const a = attrs(m[1]);
    if (!a.r) continue;
    const [r, c] = cellRef(a.r);
    const body = m[2] ?? '';
    const raw = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
    let v: CellValue = null;
    switch (a.t) {
      case 's':
        v = raw === undefined ? null : (shared[Number(raw)] ?? null);
        break;
      case 'inlineStr':
        v = textOf(/<is>([\s\S]*?)<\/is>/.exec(body)?.[1] ?? '');
        break;
      case 'str':
      case 'e':
        v = raw === undefined ? null : decodeXml(raw);
        break;
      case 'b':
        v = raw === '1';
        break;
      default:
        v = raw === undefined || raw === '' ? null : Number(raw);
    }
    const fill = fills[Number(a.s ?? 0)] ?? null;
    if (v === null && !fill) continue;
    (rows[r] ??= [])[c] = { v, fill };
  }
  for (let i = 0; i < rows.length; i++) rows[i] ??= [];
  return { name, rows };
}

export function readXlsx(data: ArrayBuffer | Uint8Array): Workbook {
  const files = unzipSync(data instanceof Uint8Array ? data : new Uint8Array(data));
  const text = (p: string) => (files[p] ? strFromU8(files[p]) : undefined);
  const workbook = text('xl/workbook.xml');
  if (!workbook) throw new Error('Ce fichier n’est pas un classeur Excel (.xlsx)');
  const rels = new Map<string, string>();
  for (const m of (text('xl/_rels/workbook.xml.rels') ?? '').matchAll(/<Relationship\b([^>]*?)\/?>/g)) {
    const a = attrs(m[1]);
    if (a.Id && a.Target) rels.set(a.Id, resolveTarget(a.Target));
  }
  const shared = [...(text('xl/sharedStrings.xml') ?? '').matchAll(/<si>([\s\S]*?)<\/si>|<si\/>/g)].map((m) => textOf(m[1] ?? ''));
  const fills = fillsByStyle(text('xl/styles.xml'));
  const sheets: Sheet[] = [];
  for (const m of workbook.matchAll(/<sheet\b([^>]*?)\/?>/g)) {
    const a = attrs(m[1]);
    const path = rels.get(a['r:id']);
    const xml = path ? text(path) : undefined;
    if (a.name && xml) sheets.push(parseSheet(a.name, xml, shared, fills));
  }
  return { sheets };
}

/** Valeur d'une cellule en texte (nombres sans « .0 »), '' si vide. */
export function cellText(c: Cell | undefined): string {
  if (!c || c.v === null) return '';
  return typeof c.v === 'string' ? c.v.trim() : String(c.v);
}
