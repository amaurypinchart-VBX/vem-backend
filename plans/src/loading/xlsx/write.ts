// Écrivain .xlsx minimal (Office Open XML) sur fflate : chaînes en ligne, nombres, styles nommés (police, fond,
// bordure, alignement, retour à la ligne), largeurs de colonnes, cellules fusionnées, volets figés, lignes d'en-tête
// répétées à l'impression, mise en page A4 ajustée à la largeur. Ce que le bordereau de loading liste demande, sans
// dépendance. Relu par xlsx/read.ts dans les tests. Fonctions pures.
import { strToU8, zipSync } from 'fflate';
import { colName } from './read';

export interface XStyle {
  bold?: boolean;
  italic?: boolean;
  size?: number;
  /** couleur du texte RRGGBB */
  color?: string;
  /** couleur de fond RRGGBB */
  fill?: string;
  border?: boolean;
  wrap?: boolean;
  align?: 'left' | 'center' | 'right';
  valign?: 'top' | 'center';
  /** format des nombres : entier, ou 2 décimales au plus */
  number?: 'int' | 'dec';
}

export type XValue = string | number | null;
export interface XCell {
  v: XValue;
  s?: string;
}

export interface XSheet {
  name: string;
  /** largeur des colonnes (caractères) */
  columns: number[];
  rows: (XCell | XValue)[][];
  /** plages fusionnées « A1:G1 » */
  merges?: string[];
  /** volets figés sous la ligne `row` (1-based : lignes 1..row figées) */
  freezeRows?: number;
  /** lignes répétées en haut de chaque page imprimée [de, à] (1-based) */
  printTitleRows?: [number, number];
  landscape?: boolean;
  /** hauteur de certaines lignes (points), index 0-based */
  rowHeights?: Record<number, number>;
}

const esc = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    // caractères de contrôle interdits en XML
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');

const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

interface StyleTable {
  xml: string;
  index: Map<string, number>;
}

function buildStyles(styles: Record<string, XStyle>): StyleTable {
  const fonts: string[] = ['<font><sz val="10"/><name val="Arial"/><family val="2"/></font>'];
  const fills: string[] = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'];
  const borders: string[] = ['<border><left/><right/><top/><bottom/><diagonal/></border>'];
  const thin = '<border><left style="thin"><color rgb="FFBFBFBF"/></left><right style="thin"><color rgb="FFBFBFBF"/></right><top style="thin"><color rgb="FFBFBFBF"/></top><bottom style="thin"><color rgb="FFBFBFBF"/></bottom><diagonal/></border>';
  const xfs: string[] = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'];
  const index = new Map<string, number>();
  const find = (list: string[], x: string) => {
    const i = list.indexOf(x);
    if (i >= 0) return i;
    list.push(x);
    return list.length - 1;
  };
  for (const [name, st] of Object.entries(styles)) {
    const font = `<font>${st.bold ? '<b/>' : ''}${st.italic ? '<i/>' : ''}<sz val="${st.size ?? 10}"/>${st.color ? `<color rgb="FF${st.color}"/>` : ''}<name val="Arial"/><family val="2"/></font>`;
    const fontId = find(fonts, font);
    const fillId = st.fill ? find(fills, `<fill><patternFill patternType="solid"><fgColor rgb="FF${st.fill}"/><bgColor indexed="64"/></patternFill></fill>`) : 0;
    const borderId = st.border ? find(borders, thin) : 0;
    const numFmtId = st.number === 'int' ? 1 : st.number === 'dec' ? 164 : 0;
    const align =
      st.wrap || st.align || st.valign
        ? `<alignment${st.align ? ` horizontal="${st.align}"` : ''}${st.valign ? ` vertical="${st.valign}"` : ''}${st.wrap ? ' wrapText="1"' : ''}/>`
        : '';
    xfs.push(
      `<xf numFmtId="${numFmtId}" fontId="${fontId}" fillId="${fillId}" borderId="${borderId}" xfId="0"${numFmtId ? ' applyNumberFormat="1"' : ''}${fontId ? ' applyFont="1"' : ''}${fillId ? ' applyFill="1"' : ''}${borderId ? ' applyBorder="1"' : ''}${align ? ' applyAlignment="1">' + align + '</xf>' : '/>'}`,
    );
    index.set(name, xfs.length - 1);
  }
  const xml =
    XML +
    `<styleSheet xmlns="${NS}"><numFmts count="1"><numFmt numFmtId="164" formatCode="0.##"/></numFmts>` +
    `<fonts count="${fonts.length}">${fonts.join('')}</fonts><fills count="${fills.length}">${fills.join('')}</fills>` +
    `<borders count="${borders.length}">${borders.join('')}</borders>` +
    `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
    `<cellXfs count="${xfs.length}">${xfs.join('')}</cellXfs>` +
    `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  return { xml, index };
}

function sheetXml(sh: XSheet, styles: StyleTable): string {
  const rows = sh.rows
    .map((row, r) => {
      const cells = row
        .map((c, k) => {
          if (c === null || c === undefined) return '';
          const cell: XCell = typeof c === 'object' ? c : { v: c };
          const ref = `${colName(k)}${r + 1}`;
          const s = cell.s ? styles.index.get(cell.s) : undefined;
          if (cell.s && s === undefined) throw new Error(`Style xlsx inconnu : ${cell.s}`);
          const sa = s ? ` s="${s}"` : '';
          if (cell.v === null || cell.v === '') return s ? `<c r="${ref}"${sa}/>` : '';
          if (typeof cell.v === 'number') return Number.isFinite(cell.v) ? `<c r="${ref}"${sa}><v>${cell.v}</v></c>` : '';
          return `<c r="${ref}"${sa} t="inlineStr"><is><t xml:space="preserve">${esc(cell.v)}</t></is></c>`;
        })
        .join('');
      const ht = sh.rowHeights?.[r];
      return `<row r="${r + 1}"${ht ? ` ht="${ht}" customHeight="1"` : ''}>${cells}</row>`;
    })
    .join('');
  const freeze = sh.freezeRows
    ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${sh.freezeRows}" topLeftCell="A${sh.freezeRows + 1}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${sh.freezeRows + 1}" sqref="A${sh.freezeRows + 1}"/></sheetView></sheetViews>`
    : '<sheetViews><sheetView workbookViewId="0"/></sheetViews>';
  const cols = `<cols>${sh.columns.map((w, k) => `<col min="${k + 1}" max="${k + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`;
  const merges = sh.merges?.length ? `<mergeCells count="${sh.merges.length}">${sh.merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : '';
  return (
    XML +
    `<worksheet xmlns="${NS}" xmlns:r="${NS_R}"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>${freeze}<sheetFormatPr defaultRowHeight="13.2"/>${cols}` +
    `<sheetData>${rows}</sheetData>${merges}` +
    `<printOptions horizontalCentered="1"/><pageMargins left="0.4" right="0.4" top="0.5" bottom="0.6" header="0.3" footer="0.3"/>` +
    `<pageSetup paperSize="9" orientation="${sh.landscape ? 'landscape' : 'portrait'}" fitToWidth="1" fitToHeight="0"/>` +
    `<headerFooter><oddFooter>&amp;L&amp;8&amp;F&amp;R&amp;8Page &amp;P / &amp;N</oddFooter></headerFooter></worksheet>`
  );
}

/** Classeur .xlsx (octets) à partir de feuilles et de styles nommés. */
export function writeXlsx(sheets: XSheet[], styles: Record<string, XStyle>): Uint8Array {
  const st = buildStyles(styles);
  const files: Record<string, Uint8Array> = {};
  files['[Content_Types].xml'] = strToU8(
    XML +
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>` +
      `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
      `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
      sheets.map((_, k) => `<Override PartName="/xl/worksheets/sheet${k + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') +
      `</Types>`,
  );
  files['_rels/.rels'] = strToU8(
    XML + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${NS_R}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
  );
  const names = sheets
    .map((s, k) => (s.printTitleRows ? `<definedName name="_xlnm.Print_Titles" localSheetId="${k}">'${esc(s.name).replace(/'/g, "''")}'!$${s.printTitleRows[0]}:$${s.printTitleRows[1]}</definedName>` : ''))
    .join('');
  files['xl/workbook.xml'] = strToU8(
    XML +
      `<workbook xmlns="${NS}" xmlns:r="${NS_R}"><bookViews><workbookView/></bookViews><sheets>${sheets.map((s, k) => `<sheet name="${esc(s.name.slice(0, 31))}" sheetId="${k + 1}" r:id="rId${k + 1}"/>`).join('')}</sheets>` +
      (names ? `<definedNames>${names}</definedNames>` : '') +
      `</workbook>`,
  );
  files['xl/_rels/workbook.xml.rels'] = strToU8(
    XML +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      sheets.map((_, k) => `<Relationship Id="rId${k + 1}" Type="${NS_R}/worksheet" Target="worksheets/sheet${k + 1}.xml"/>`).join('') +
      `<Relationship Id="rId${sheets.length + 1}" Type="${NS_R}/styles" Target="styles.xml"/></Relationships>`,
  );
  files['xl/styles.xml'] = strToU8(st.xml);
  sheets.forEach((s, k) => (files[`xl/worksheets/sheet${k + 1}.xml`] = strToU8(sheetXml(s, st))));
  return zipSync(files, { level: 6 });
}
