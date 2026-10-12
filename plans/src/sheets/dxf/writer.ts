// Écriture d'un fichier DXF ASCII (AutoCAD 2007, AC1021 : textes en UTF-8), sans dépendance. Structure attendue par
// AutoCAD / DWG TrueView (tables VPORT … BLOCK_RECORD, blocs *Model_Space / *Paper_Space, classes, dictionnaire racine
// avec ACAD_GROUP, ACAD_LAYOUT (présentations Model / Layout1, reliées aux BLOCK_RECORD par 340) et ACAD_PLOTSTYLENAME
// (style de tracé « Normal » auquel chaque calque renvoie par 390) — sans ces objets AutoCAD refuse le fichier alors
// que des lecteurs tolérants (LibreCAD, ezdxf) l'ouvrent), unités mm. Entités utilisées : LWPOLYLINE, CIRCLE, TEXT, HATCH (remplissage plein), avec calque,
// type de ligne, épaisseur de trait (370), couleur vraie (420) et transparence (440).

export interface DxfStyle {
  /** calque (créé à la première utilisation) */
  layer: string;
  /** couleur RVB 0xRRGGBB ; noir = « DuCalque » si le calque est noir */
  color?: number;
  /** épaisseur de trait en mm papier (arrondie à la valeur normalisée la plus proche) */
  weightMm?: number;
  /** type de ligne (nom renvoyé par `linetype`) */
  linetype?: string;
  /** opacité 0…1 (remplissages) */
  opacity?: number;
}

export interface DxfTextOptions {
  /** police : style de texte (renvoyé par `textStyle`) */
  style: string;
  /** hauteur des majuscules (unités du dessin) */
  height: number;
  /** degrés, sens trigonométrique */
  rotation?: number;
  align?: 'start' | 'middle' | 'end';
}

/** Épaisseurs de trait normalisées (centièmes de mm). */
const LINEWEIGHTS = [0, 5, 9, 13, 15, 18, 20, 25, 30, 35, 40, 50, 53, 60, 70, 80, 90, 100, 106, 120, 140, 158, 200, 211];

export function lineweightOf(mm: number): number {
  const v = mm * 100;
  let best = LINEWEIGHTS[0];
  for (const w of LINEWEIGHTS) if (Math.abs(w - v) < Math.abs(best - v)) best = w;
  return best;
}

/** Couleur AutoCAD (ACI) la plus proche d'une couleur RVB, pour les logiciels qui ignorent les couleurs vraies. */
export function aciOf(rgb: number): number {
  const r = (rgb >> 16) & 255;
  const g = (rgb >> 8) & 255;
  const b = rgb & 255;
  if (Math.max(r, g, b) - Math.min(r, g, b) < 24) {
    // gris : noir / blanc (7) ou gris 8 / 9 / 250-255
    const l = (r + g + b) / 3;
    if (l < 40 || l > 235) return 7;
    return l < 150 ? 8 : 9;
  }
  let best = 1;
  let bestD = Infinity;
  for (let i = 1; i < 250; i++) {
    const [cr, cg, cb] = aciRgb(i);
    const d = (cr - r) ** 2 + (cg - g) ** 2 + (cb - b) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/** RVB d'une couleur ACI 1…249 (roue standard : 1-9 de base, puis 24 teintes × 5 luminosités × 2 saturations). */
function aciRgb(i: number): [number, number, number] {
  const base: Record<number, [number, number, number]> = {
    1: [255, 0, 0],
    2: [255, 255, 0],
    3: [0, 255, 0],
    4: [0, 255, 255],
    5: [0, 0, 255],
    6: [255, 0, 255],
    7: [255, 255, 255],
    8: [128, 128, 128],
    9: [192, 192, 192],
  };
  if (i < 10) return base[i];
  const hue = Math.floor((i - 10) / 10) * 15;
  const rest = (i - 10) % 10;
  const value = [1, 1, 0.8, 0.8, 0.6, 0.6, 0.5, 0.5, 0.3, 0.3][rest];
  const sat = rest % 2 === 0 ? 1 : 0.5;
  // TSV → RVB
  const c = value * sat;
  const h = hue / 60;
  const x = c * (1 - Math.abs((h % 2) - 1));
  const [r1, g1, b1] = h < 1 ? [c, x, 0] : h < 2 ? [x, c, 0] : h < 3 ? [0, c, x] : h < 4 ? [0, x, c] : h < 5 ? [x, 0, c] : [c, 0, x];
  const m = value - c;
  return [Math.round((r1 + m) * 255), Math.round((g1 + m) * 255), Math.round((b1 + m) * 255)];
}

/** Nom de calque / type de ligne / style admis par AutoCAD (sans < > / \ " : ; ? * | = `). */
export function symbolName(name: string): string {
  const s = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[<>/\\":;?*|=`,]+/g, '-')
    .replace(/\s+/g, '_')
    .trim();
  return (s || 'SANS-NOM').slice(0, 250);
}

const n = (v: number) => {
  const r = Math.round(v * 10000) / 10000;
  return Object.is(r, -0) ? '0' : String(r);
};

/** Contour fermé x0, y0, x1, y1… sans points consécutifs confondus (< 0,01 unité) ni point final égal au premier. */
export function cleanLoop(l: ArrayLike<number>, tol = 0.01): number[] {
  const out: number[] = [];
  for (let i = 0; i + 1 < l.length; i += 2) {
    const k = out.length;
    if (k && Math.abs(l[i] - out[k - 2]) <= tol && Math.abs(l[i + 1] - out[k - 1]) <= tol) continue;
    out.push(l[i], l[i + 1]);
  }
  while (out.length > 6 && Math.abs(out[0] - out[out.length - 2]) <= tol && Math.abs(out[1] - out[out.length - 1]) <= tol) out.length -= 2;
  return out;
}

const loopArea = (l: ArrayLike<number>) => {
  let a = 0;
  for (let i = 0; i < l.length; i += 2) {
    const j = (i + 2) % l.length;
    a += l[i] * l[j + 1] - l[j] * l[i + 1];
  }
  return a / 2;
};

function insideLoop(x: number, y: number, l: ArrayLike<number>): boolean {
  let c = false;
  for (let i = 0, j = l.length - 2; i < l.length; j = i, i += 2) {
    const [xi, yi, xj, yj] = [l[i], l[i + 1], l[j], l[j + 1]];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

const reversed = (l: number[]) => {
  const r: number[] = [];
  for (let i = l.length - 2; i >= 0; i -= 2) r.push(l[i], l[i + 1]);
  return r;
};

/**
 * Contours d'un remplissage pair-impair → régions : chaque contour à profondeur paire (0, 2…) est un contour extérieur
 * (sens trigonométrique), chaque contour à profondeur impaire un trou (sens horaire) rattaché au plus petit contour
 * extérieur qui le contient. Les contours ne se croisent pas (tracés SVG de logos / flèches).
 */
export function hatchRegions(loops: number[][]): number[][][] {
  const area = loops.map((l) => Math.abs(loopArea(l)));
  const holders = loops.map((l, i) => loops.map((_, j) => j).filter((j) => j !== i && area[j] > area[i] && insideLoop(l[0], l[1], loops[j])));
  const depth = holders.map((h) => h.length);
  const regions = new Map<number, number[][]>();
  loops.forEach((l, i) => {
    if (depth[i] % 2 === 0) regions.set(i, [loopArea(l) >= 0 ? l : reversed(l)]);
  });
  loops.forEach((l, i) => {
    if (depth[i] % 2 === 0) return;
    const parent = holders[i].filter((j) => depth[j] === depth[i] - 1).sort((a, b) => area[a] - area[b])[0];
    if (parent !== undefined) regions.get(parent)!.push(loopArea(l) <= 0 ? l : reversed(l));
  });
  return [...regions.values()];
}

/** Texte d'une entité TEXT : une ligne, « %% » échappé (codes de contrôle AutoCAD). */
function textValue(s: string): string {
  return s.replace(/[\r\n]+/g, ' ').replace(/%%/g, '%%%');
}

interface LayerDef {
  name: string;
  color: number;
}

interface LinetypeDef {
  name: string;
  pattern: number[];
}

interface FontDef {
  name: string;
  file: string;
}

export class DxfDocument {
  private body: string[] = [];
  private handle = 0x1000;
  private layers = new Map<string, LayerDef>();
  private linetypes = new Map<string, LinetypeDef>();
  private fonts = new Map<string, FontDef>();
  private min = [Infinity, Infinity];
  private max = [-Infinity, -Infinity];
  /** BLOCK_RECORD *Model_Space : propriétaire des entités */
  private static readonly MODEL = '1F';
  entityCount = 0;

  private next(): string {
    return (this.handle++).toString(16).toUpperCase();
  }

  private grow(x: number, y: number) {
    if (x < this.min[0]) this.min[0] = x;
    if (y < this.min[1]) this.min[1] = y;
    if (x > this.max[0]) this.max[0] = x;
    if (y > this.max[1]) this.max[1] = y;
  }

  /** Calque (couleur RVB du calque : celle de son premier élément). */
  layer(name: string, color = 0): string {
    const key = symbolName(name);
    if (!this.layers.has(key)) this.layers.set(key, { name: key, color });
    return key;
  }

  /** Type de ligne tirets / points : longueurs en unités du dessin (traits > 0, blancs < 0, 0 = point). */
  linetype(pattern: number[]): string {
    const p = pattern.map((v) => Math.round(v * 1000) / 1000);
    const name = symbolName(`VBX_TIRETS_${p.map((v) => String(Math.abs(v)).replace('.', 'p')).join('_')}`);
    if (!this.linetypes.has(name)) this.linetypes.set(name, { name, pattern: p });
    return name;
  }

  /** Style de texte TrueType (fichier de police Windows : arial.ttf, georgia.ttf…). */
  textStyle(name: string, file: string): string {
    const key = symbolName(name);
    if (!this.fonts.has(key)) this.fonts.set(key, { name: key, file });
    return key;
  }

  private common(type: string, subclass: string, st: DxfStyle, fill = false): string[] {
    const layer = this.layer(st.layer, st.color ?? 0);
    const out = ['0', type, '5', this.next(), '330', DxfDocument.MODEL, '100', 'AcDbEntity', '8', layer];
    if (st.linetype) out.push('6', st.linetype);
    const color = st.color ?? 0;
    if (color !== this.layers.get(layer)!.color) out.push('62', String(aciOf(color)), '420', String(color));
    if (!fill && st.weightMm !== undefined) out.push('370', String(lineweightOf(st.weightMm)));
    if (st.opacity !== undefined && st.opacity < 0.999) out.push('440', String(0x02000000 | Math.round(Math.max(0, st.opacity) * 255)));
    out.push('100', subclass);
    this.entityCount++;
    return out;
  }

  /** Polyligne 2D (points x0, y0, x1, y1…). */
  polyline(pts: ArrayLike<number>, closed: boolean, st: DxfStyle) {
    const count = pts.length / 2;
    if (count < 2) return;
    // tirets continus d'un sommet à l'autre (« génération du type de ligne »)
    const flags = (closed ? 1 : 0) | (st.linetype ? 128 : 0);
    const out = this.common('LWPOLYLINE', 'AcDbPolyline', st);
    out.push('90', String(count), '70', String(flags), '43', '0');
    for (let i = 0; i < pts.length; i += 2) {
      out.push('10', n(pts[i]), '20', n(pts[i + 1]));
      this.grow(pts[i], pts[i + 1]);
    }
    this.body.push(out.join('\n'));
  }

  circle(cx: number, cy: number, r: number, st: DxfStyle) {
    const out = this.common('CIRCLE', 'AcDbCircle', st);
    out.push('10', n(cx), '20', n(cy), '30', '0', '40', n(r));
    this.grow(cx - r, cy - r);
    this.grow(cx + r, cy + r);
    this.body.push(out.join('\n'));
  }

  text(x: number, y: number, value: string, opt: DxfTextOptions, st: DxfStyle) {
    const v = textValue(value);
    if (!v.trim() || !(opt.height > 0)) return;
    const out = this.common('TEXT', 'AcDbText', st, true);
    out.push('10', n(x), '20', n(y), '30', '0', '40', n(opt.height), '1', v);
    if (opt.rotation) out.push('50', n(opt.rotation));
    out.push('7', opt.style);
    const h = opt.align === 'middle' ? 1 : opt.align === 'end' ? 2 : 0;
    if (h) out.push('72', String(h), '11', n(x), '21', n(y), '31', '0');
    out.push('100', 'AcDbText');
    this.grow(x, y);
    this.grow(x, y + opt.height);
    this.body.push(out.join('\n'));
  }

  /**
   * Remplissage plein : contours fermés (règle pair-impair, les trous sont des contours intérieurs). Chaque contour est
   * nettoyé : points consécutifs confondus et point final répété (segment de longueur nulle) retirés — DWG TrueView /
   * AutoCAD plantent à l'ouverture sur un contour de remplissage qui en contient.
   */
  hatch(loops: Array<ArrayLike<number>>, st: DxfStyle) {
    const valid = loops.map((l) => cleanLoop(l)).filter((l) => l.length >= 6);
    // un remplissage par région (contour extérieur + ses trous) : DWG TrueView plante sur un remplissage qui regroupe
    // plusieurs régions séparées (les lettres d'un logo), il accepte une lettre avec ses trous
    for (const region of hatchRegions(valid)) this.hatchRegion(region, st);
  }

  private hatchRegion(valid: number[][], st: DxfStyle) {
    if (!valid.length) return;
    const out = this.common('HATCH', 'AcDbHatch', st, true);
    out.push('10', '0', '20', '0', '30', '0', '210', '0', '220', '0', '230', '1', '2', 'SOLID', '70', '1', '71', '0', '91', String(valid.length));
    for (const [i, l] of valid.entries()) {
      out.push('92', i === 0 ? '3' : '2', '72', '0', '73', '1', '93', String(l.length / 2));
      for (let j = 0; j < l.length; j += 2) {
        out.push('10', n(l[j]), '20', n(l[j + 1]));
        this.grow(l[j], l[j + 1]);
      }
      out.push('97', '0');
    }
    // un point de départ (comme AutoCAD) : premier sommet du contour extérieur
    out.push('75', '0', '76', '1', '47', '1', '98', '1', '10', n(valid[0][0]), '20', n(valid[0][1]));
    this.body.push(out.join('\n'));
  }

  get extents(): { minX: number; minY: number; maxX: number; maxY: number } | null {
    if (this.min[0] > this.max[0]) return null;
    return { minX: this.min[0], minY: this.min[1], maxX: this.max[0], maxY: this.max[1] };
  }

  toString(): string {
    const ext = this.extents ?? { minX: 0, minY: 0, maxX: 100, maxY: 100 };
    // handles fixes des tables / blocs / objets (les entités commencent à 0x1000)
    const H = { vport: '1', ltype: '2', layer: '3', style: '4', view: '5', ucs: '6', appid: '7', dimstyle: '8', blockRecord: '9' };
    // objets : dictionnaire racine, groupes, présentations, styles de tracé (« Normal »), présentations Model / Layout1
    const O = { root: 'A', group: 'B', layouts: 'C', plotStyles: 'D', normal: 'E', layoutModel: 'F', layoutPaper: '10' };
    let fixed = 0x20;
    const h = () => (fixed++).toString(16).toUpperCase();
    const g: string[] = [];
    const push = (...kv: Array<string | number>) => {
      for (const v of kv) g.push(typeof v === 'number' ? n(v) : v);
    };
    const table = (name: string, handle: string, count: number, extra: string[] = []) =>
      push('0', 'TABLE', '2', name, '5', handle, '330', '0', '100', 'AcDbSymbolTable', '70', String(count), ...extra);
    const record = (type: string, owner: string, subclass: string, handle = h()) => {
      push('0', type, '5', handle, '330', owner, '100', 'AcDbSymbolTableRecord', '100', subclass);
      return handle;
    };

    // ─── HEADER ───
    const handseed = this.handle.toString(16).toUpperCase();
    push('0', 'SECTION', '2', 'HEADER');
    push('9', '$ACADVER', '1', 'AC1021');
    push('9', '$DWGCODEPAGE', '3', 'ANSI_1252');
    push('9', '$LASTSAVEDBY', '1', 'VEM Plans Viewbox');
    push('9', '$INSBASE', '10', '0', '20', '0', '30', '0');
    push('9', '$EXTMIN', '10', ext.minX, '20', ext.minY, '30', '0');
    push('9', '$EXTMAX', '10', ext.maxX, '20', ext.maxY, '30', '0');
    push('9', '$LIMMIN', '10', ext.minX, '20', ext.minY);
    push('9', '$LIMMAX', '10', ext.maxX, '20', ext.maxY);
    push('9', '$LTSCALE', '40', '1');
    push('9', '$INSUNITS', '70', '4');
    push('9', '$MEASUREMENT', '70', '1');
    push('9', '$LUNITS', '70', '2');
    push('9', '$LUPREC', '70', '1');
    push('9', '$LWDISPLAY', '290', '1');
    push('9', '$CLAYER', '8', '0');
    push('9', '$HANDSEED', '5', handseed);
    push('0', 'ENDSEC');
    push('0', 'SECTION', '2', 'CLASSES');
    for (const [dxf, cpp] of [
      ['ACDBDICTIONARYWDFLT', 'AcDbDictionaryWithDefault'],
      ['ACDBPLACEHOLDER', 'AcDbPlaceHolder'],
      ['LAYOUT', 'AcDbLayout'],
    ])
      push('0', 'CLASS', '1', dxf, '2', cpp, '3', 'ObjectDBX Classes', '90', '0', '91', '0', '280', '0', '281', '0');
    push('0', 'ENDSEC');

    // ─── TABLES ───
    push('0', 'SECTION', '2', 'TABLES');
    const w = Math.max(1, ext.maxX - ext.minX);
    const hh = Math.max(1, ext.maxY - ext.minY);
    table('VPORT', H.vport, 1);
    record('VPORT', H.vport, 'AcDbViewportTableRecord');
    push('2', '*Active', '70', '0', '10', '0', '20', '0', '11', '1', '21', '1');
    push('12', (ext.minX + ext.maxX) / 2, '22', (ext.minY + ext.maxY) / 2, '13', '0', '23', '0', '14', '10', '24', '10', '15', '10', '25', '10');
    push('16', '0', '26', '0', '36', '1', '17', '0', '27', '0', '37', '0');
    push('40', Math.max(hh, w / 1.6) * 1.05, '41', '1.6', '42', '50', '43', '0', '44', '0', '50', '0', '51', '0');
    push('71', '0', '72', '100', '73', '1', '74', '3', '75', '0', '76', '0', '77', '0', '78', '0', '281', '0', '65', '1');
    push('110', '0', '120', '0', '130', '0', '111', '1', '121', '0', '131', '0', '112', '0', '122', '1', '132', '0', '79', '0', '146', '0');
    push('0', 'ENDTAB');

    table('LTYPE', H.ltype, 3 + this.linetypes.size);
    for (const name of ['ByBlock', 'ByLayer', 'Continuous']) {
      record('LTYPE', H.ltype, 'AcDbLinetypeTableRecord');
      push('2', name, '70', '0', '3', name === 'Continuous' ? 'Solid line' : '', '72', '65', '73', '0', '40', '0');
    }
    for (const lt of this.linetypes.values()) {
      record('LTYPE', H.ltype, 'AcDbLinetypeTableRecord');
      const total = lt.pattern.reduce((s, v) => s + Math.abs(v), 0);
      push('2', lt.name, '70', '0', '3', lt.pattern.map((v) => (v > 0 ? '__' : v < 0 ? ' ' : '.')).join(''), '72', '65', '73', String(lt.pattern.length), '40', total);
      for (const v of lt.pattern) push('49', v, '74', '0');
    }
    push('0', 'ENDTAB');

    table('LAYER', H.layer, 1 + this.layers.size);
    const layerRec = (name: string, color: number) => {
      record('LAYER', H.layer, 'AcDbLayerTableRecord');
      push('2', name, '70', '0', '62', String(aciOf(color)));
      if (color !== 0) push('420', String(color));
      push('6', 'Continuous', '370', '-3', '390', O.normal);
    };
    layerRec('0', 0);
    for (const l of this.layers.values()) if (l.name !== '0') layerRec(l.name, l.color);
    push('0', 'ENDTAB');

    table('STYLE', H.style, 1 + this.fonts.size);
    const standard = record('STYLE', H.style, 'AcDbTextStyleTableRecord');
    push('2', 'Standard', '70', '0', '40', '0', '41', '1', '50', '0', '71', '0', '42', '2.5', '3', 'arial.ttf', '4', '');
    for (const f of this.fonts.values()) {
      record('STYLE', H.style, 'AcDbTextStyleTableRecord');
      push('2', f.name, '70', '0', '40', '0', '41', '1', '50', '0', '71', '0', '42', '2.5', '3', f.file, '4', '');
    }
    push('0', 'ENDTAB');

    table('VIEW', H.view, 0);
    push('0', 'ENDTAB');
    table('UCS', H.ucs, 0);
    push('0', 'ENDTAB');
    table('APPID', H.appid, 1);
    record('APPID', H.appid, 'AcDbRegAppTableRecord');
    push('2', 'ACAD', '70', '0');
    push('0', 'ENDTAB');
    table('DIMSTYLE', H.dimstyle, 1, ['100', 'AcDbDimStyleTable']);
    push('0', 'DIMSTYLE', '105', h(), '330', H.dimstyle, '100', 'AcDbSymbolTableRecord', '100', 'AcDbDimStyleTableRecord');
    push('2', 'Standard', '70', '0', '340', standard);
    push('0', 'ENDTAB');
    table('BLOCK_RECORD', H.blockRecord, 2);
    record('BLOCK_RECORD', H.blockRecord, 'AcDbBlockTableRecord', DxfDocument.MODEL);
    push('2', '*Model_Space', '340', O.layoutModel, '70', '0', '280', '1', '281', '0');
    const paper = record('BLOCK_RECORD', H.blockRecord, 'AcDbBlockTableRecord');
    push('2', '*Paper_Space', '340', O.layoutPaper, '70', '0', '280', '1', '281', '0');
    push('0', 'ENDTAB');
    push('0', 'ENDSEC');

    // ─── BLOCKS ───
    push('0', 'SECTION', '2', 'BLOCKS');
    for (const [name, owner] of [
      ['*Model_Space', DxfDocument.MODEL],
      ['*Paper_Space', paper],
    ]) {
      push('0', 'BLOCK', '5', h(), '330', owner, '100', 'AcDbEntity', '8', '0', '100', 'AcDbBlockBegin', '2', name, '70', '0', '10', '0', '20', '0', '30', '0', '3', name, '1', '');
      push('0', 'ENDBLK', '5', h(), '330', owner, '100', 'AcDbEntity', '8', '0', '100', 'AcDbBlockEnd');
    }
    push('0', 'ENDSEC');
    if (fixed >= 0x1000) throw new Error('DXF : trop de styles ou de types de ligne');

    // ─── ENTITIES ───
    const head = g.join('\n');
    const objects = ['0', 'SECTION', '2', 'OBJECTS'];
    objects.push('0', 'DICTIONARY', '5', O.root, '330', '0', '100', 'AcDbDictionary', '281', '1');
    objects.push('3', 'ACAD_GROUP', '350', O.group, '3', 'ACAD_LAYOUT', '350', O.layouts, '3', 'ACAD_PLOTSTYLENAME', '350', O.plotStyles);
    objects.push('0', 'DICTIONARY', '5', O.group, '330', O.root, '100', 'AcDbDictionary', '281', '1');
    objects.push('0', 'DICTIONARY', '5', O.layouts, '330', O.root, '100', 'AcDbDictionary', '281', '1', '3', 'Model', '350', O.layoutModel, '3', 'Layout1', '350', O.layoutPaper);
    objects.push('0', 'ACDBDICTIONARYWDFLT', '5', O.plotStyles, '330', O.root, '100', 'AcDbDictionary', '281', '1', '3', 'Normal', '350', O.normal, '100', 'AcDbDictionaryWithDefault', '340', O.normal);
    objects.push('0', 'ACDBPLACEHOLDER', '5', O.normal, '330', O.plotStyles);
    // présentations : réglages de tracé par défaut (A3 paysage), comme un dessin neuf d'AutoCAD
    const layout = (handle: string, name: string, tab: number, owner: string, model: boolean) => {
      objects.push('0', 'LAYOUT', '5', handle, '330', O.layouts, '100', 'AcDbPlotSettings', '1', '', '4', 'A3', '6', '');
      objects.push('40', '7.5', '41', '20', '42', '7.5', '43', '20', '44', '420', '45', '297', '46', '0', '47', '0', '48', '0', '49', '0');
      objects.push('140', '0', '141', '0', '142', '1', '143', '1', '70', model ? '1024' : '0', '72', '1', '73', '0', '74', '5', '7', '', '75', '16', '76', '0', '77', '2', '78', '300');
      objects.push('147', '1', '148', '0', '149', '0', '100', 'AcDbLayout', '1', name, '70', '1', '71', String(tab));
      objects.push('10', '0', '20', '0', '11', '420', '21', '297', '12', '0', '22', '0', '32', '0');
      objects.push('14', '1e+20', '24', '1e+20', '34', '1e+20', '15', '-1e+20', '25', '-1e+20', '35', '-1e+20', '146', '0');
      objects.push('13', '0', '23', '0', '33', '0', '16', '1', '26', '0', '36', '0', '17', '0', '27', '1', '37', '0', '76', '1', '330', owner);
    };
    layout(O.layoutModel, 'Model', 0, DxfDocument.MODEL, true);
    layout(O.layoutPaper, 'Layout1', 1, paper, false);
    objects.push('0', 'ENDSEC', '0', 'EOF');
    const parts = [head, '0\nSECTION\n2\nENTITIES'];
    if (this.body.length) parts.push(this.body.join('\n'));
    parts.push('0\nENDSEC', objects.join('\n'));
    return parts.join('\n') + '\n';
  }
}
