// Lecteur .xlsx : chaînes partagées (texte riche), chaînes en ligne, nombres, booléens, couleurs de fond, entités.
import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { cellRef, cellText, colName, readXlsx } from '../../src/loading/xlsx/read';

const xml = (s: string) => strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n${s}`);

function workbook(): Uint8Array {
  return zipSync({
    'xl/workbook.xml': xml(
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Règles &amp; co" sheetId="1" r:id="rId1"/><sheet name="Vide" sheetId="2" r:id="rId2"/></sheets></workbook>',
    ),
    'xl/_rels/workbook.xml.rels': xml(
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="worksheet" Target="/xl/worksheets/sheet2.xml"/></Relationships>',
    ),
    'xl/sharedStrings.xml': xml(
      '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><t>Réf.</t></si><si><r><t>Plaque </t></r><r><rPr><b/></rPr><t xml:space="preserve">« 40 × 40 »</t></r></si><si><t/></si></sst>',
    ),
    'xl/styles.xml': xml(
      '<styleSheet><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="00DDEBF7"/><bgColor indexed="64"/></patternFill></fill></fills><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0"/><xf numFmtId="0" fontId="0" fillId="2" applyFill="1"/></cellXfs></styleSheet>',
    ),
    'xl/worksheets/sheet1.xml': xml(
      '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s" s="1"><v>1</v></c></row><row r="3"><c r="A3" s="1"/><c r="B3"><v>2.53</v></c><c r="C3" t="inlineStr"><is><t>~10/jonction</t></is></c><c r="D3" t="b"><v>1</v></c><c r="AA3" t="str"><v>a &lt; b</v></c></row></sheetData></worksheet>',
    ),
    'xl/worksheets/sheet2.xml': xml('<worksheet><sheetData/></worksheet>'),
  });
}

describe('lecteur xlsx', () => {
  const wb = readXlsx(workbook());
  it('onglets et cellules', () => {
    expect(wb.sheets.map((s) => s.name)).toEqual(['Règles & co', 'Vide']);
    const r = wb.sheets[0].rows;
    expect(cellText(r[0][0])).toBe('Réf.');
    expect(r[0][2]).toEqual({ v: 'Plaque « 40 × 40 »', fill: '00DDEBF7' });
    expect(r[1]).toEqual([]);
    expect(r[2][0]).toEqual({ v: null, fill: '00DDEBF7' });
    expect(r[2][1]?.v).toBe(2.53);
    expect(cellText(r[2][2])).toBe('~10/jonction');
    expect(r[2][3]?.v).toBe(true);
    expect(cellText(r[2][26])).toBe('a < b');
    expect(wb.sheets[1].rows).toEqual([]);
  });
  it('références de cellules', () => {
    expect(cellRef('B12')).toEqual([11, 1]);
    expect(cellRef('AA3')).toEqual([2, 26]);
    expect(colName(0)).toBe('A');
    expect(colName(26)).toBe('AA');
  });
  it('refuse un fichier qui n’est pas un classeur', () => {
    expect(() => readXlsx(zipSync({ 'a.txt': strToU8('x') }))).toThrow(/pas un classeur/);
  });
});
