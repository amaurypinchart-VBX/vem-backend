// Catalogue des sections acier du commerce (« Base métaux Belgique », Socacier, 06.10.2026) : les fiches donnent les
// dimensions (et pour les poutrelles A, Iy, Wel,y) ; les propriétés de calcul sont recalculées ici à partir du contour
// (sectionGeometry), les valeurs publiées servent de contrôle (écart affiché dans les notes, < 2 % attendu). Nuance,
// procédé et stock ne sont pas confirmés par la base : nuance par défaut S235, tubes pris formés à froid (EN 10219,
// courbe c, prudent), statut « proposé ». Chaque famille est ordonnée par masse : c'est l'ordre des sections
// supérieures que l'optimiseur essaie. Fonctions pures ; mm.
import type { BucklingCurve, Section, SectionShape } from './catalog';
import { chs, rectangle, rhs, roundBar } from './catalog';
import type { SectionEntry } from './library';
import { angleContour, iContour, iRootRadius, iTorsion, iWarping, polygonProps, tContour, uContour, upnContour, upnTorsion, upnWarping } from './sectionGeometry';
import { CATALOG_BE, CATALOG_BE_DATE, CATALOG_BE_URLS } from '../library/catalogBE.data';
import type { CatalogRow } from '../library/catalogBE.data';
import { fmtNumber } from './units';

export type CatalogFamily = 'UPN' | 'U_MARCHAND' | 'IPE' | 'HEA' | 'HEB' | 'HEM' | 'SHS' | 'RHS' | 'CHS' | 'L' | 'T' | 'PLAT' | 'CARRE' | 'ROND';

export const FAMILY_NAME: Record<CatalogFamily, string> = {
  UPN: 'UPN (U à ailes inclinées)',
  U_MARCHAND: 'U marchands',
  IPE: 'IPE',
  HEA: 'HEA',
  HEB: 'HEB',
  HEM: 'HEM',
  SHS: 'Tubes carrés',
  RHS: 'Tubes rectangulaires',
  CHS: 'Tubes ronds',
  L: 'Cornières',
  T: 'Fers T',
  PLAT: 'Plats',
  CARRE: 'Carrés pleins',
  ROND: 'Ronds pleins',
};

const RHO = 7850;

export interface CatalogCheck {
  /** propriété publiée, valeur calculée, écart relatif */
  prop: 'A' | 'Iy' | 'Wely' | 'kgPerM';
  published: number;
  computed: number;
  deviation: number;
}

export interface CatalogSection extends SectionEntry {
  family: CatalogFamily;
  /** recoupement avec les valeurs publiées par le fournisseur */
  checks: CatalogCheck[];
}

const slug = (name: string) => `CAT-${name.replace(/^U_MARCHAND /, 'U ').replace(/\s+/g, '').replace(/[^A-Za-z0-9x.,_-]/g, '')}`;

/** Courbes de flambement (DIN EN 1993-1-1 tab. 6.2, S235 à S420). */
function curves(family: CatalogFamily, h: number, b: number, tf: number): [BucklingCurve, BucklingCurve] {
  if (family === 'IPE' || family === 'HEA' || family === 'HEB' || family === 'HEM') {
    if (h / b > 1.2) return tf <= 40 ? ['a', 'b'] : ['b', 'c'];
    return tf <= 100 ? ['b', 'c'] : ['d', 'd'];
  }
  if (family === 'L') return ['b', 'b'];
  // U, T, pleins ; tubes formés à froid (procédé non confirmé : prudent)
  return ['c', 'c'];
}

function build(row: CatalogRow): CatalogSection | null {
  const [family, name, h, b, t, d, tw, tf, Apub, Iypub, Welypub, kg, url] = row;
  const fam = family as CatalogFamily;
  let shape: SectionShape;
  let dims: Record<string, number>;
  let props: Omit<Section, 'key' | 'name' | 'shape' | 'fabrication' | 'dims'>;
  let fabrication: Section['fabrication'] = 'hot-rolled';
  const notes: string[] = [];
  switch (fam) {
    case 'UPN': {
      if (!(h && b && tw && tf)) return null;
      const p = polygonProps(upnContour(h, b, tw, tf));
      shape = 'UNP';
      dims = { h, b, tw, tf, r: tf };
      props = { ...p, It: upnTorsion(h, b, tw, tf), Iw: upnWarping(h, b, tw, tf) };
      notes.push('ailes inclinées 8 %, congés r1 = tf et r2 = tf / 2 (DIN 1026-1) ; It sans les congés (prudent)');
      break;
    }
    case 'IPE':
    case 'HEA':
    case 'HEB':
    case 'HEM': {
      if (!(h && b && tw && tf)) return null;
      const r = Apub ? iRootRadius(h, b, tw, tf, Apub) : null;
      if (r === null) return null;
      const p = polygonProps(iContour(h, b, tw, tf, r));
      shape = 'I';
      dims = { h, b, tw, tf, r: Math.round(r * 10) / 10 };
      props = { ...p, It: iTorsion(h, b, tw, tf), Iw: iWarping(p.Iz, h, tf) };
      notes.push(`congé r = ${fmtNumber(r, 1)} mm retrouvé à partir de l’aire publiée ; It sans les congés (prudent)`);
      break;
    }
    case 'U_MARCHAND': {
      if (!(h && b && t)) return null;
      const p = polygonProps(uContour(h, b, t));
      shape = 'UNP';
      dims = { h, b, tw: t, tf: t, r: 0 };
      props = { ...p, It: upnTorsion(h, b, t, t), Iw: upnWarping(h, b, t, t) };
      notes.push('angles vifs (rayons non publiés)');
      break;
    }
    case 'L': {
      if (!(h && b && t)) return null;
      // axes principaux : y = axe fort u, z = axe faible v (flambement autour de v)
      const p = polygonProps(angleContour(h, b, t), true);
      shape = 'ANGLE';
      dims = { h, b, t };
      props = { ...p, It: ((h + b - t) * t ** 3) / 3, Iw: 0 };
      notes.push('angles vifs (rayons non publiés) ; inerties dans les axes principaux (u fort, v faible)');
      break;
    }
    case 'T': {
      if (!(h && b && t)) return null;
      const p = polygonProps(tContour(h, b, t, t));
      shape = 'T';
      dims = { h, tw: t, b, tf: t };
      props = { ...p, It: (b * t ** 3 + (h - t) * t ** 3) / 3, Iw: 0 };
      notes.push('angles vifs, ailes et âme d’épaisseur t (rayons non publiés)');
      break;
    }
    case 'SHS':
    case 'RHS': {
      if (!(h && b && t) || 2 * t >= Math.min(h, b)) return null;
      shape = fam;
      fabrication = 'cold-formed';
      dims = { h, b, t };
      props = rhs(h, b, t, 'cold-formed');
      notes.push('procédé non précisé : pris formé à froid EN 10219 (rayons et courbe c, prudent)');
      break;
    }
    case 'CHS': {
      if (!(d && t) || 2 * t >= d) return null;
      shape = 'CHS';
      fabrication = 'cold-formed';
      dims = { d, t };
      props = chs(d, t);
      notes.push('procédé non précisé : pris formé à froid EN 10219 (courbe c, prudent)');
      break;
    }
    case 'PLAT':
    case 'CARRE': {
      const w = fam === 'PLAT' ? b : h;
      const th = fam === 'PLAT' ? t : h;
      if (!(w && th)) return null;
      shape = 'FLAT';
      dims = { b: w, t: th };
      props = rectangle(w, th);
      break;
    }
    case 'ROND': {
      if (!d) return null;
      shape = 'ROUND';
      dims = { d };
      props = roundBar(d);
      break;
    }
    default:
      return null;
  }
  const [cy, cz] = curves(fam, h ?? 0, b ?? 1, tf ?? t ?? 0);
  const key = slug(name);
  const checks: CatalogCheck[] = [];
  const check = (prop: CatalogCheck['prop'], published: number | null, computed: number) => {
    if (published && published > 0) checks.push({ prop, published, computed, deviation: computed / published - 1 });
  };
  check('A', Apub, props.A);
  check('Iy', Iypub, props.Iy);
  check('Wely', Welypub, props.Wely);
  check('kgPerM', kg, (props.A * RHO) / 1e6);
  const pct = (c: CatalogCheck) => `${c.prop} ${c.deviation >= 0 ? '+' : '−'}${fmtNumber(Math.abs(c.deviation) * 100, 1)} %`;
  if (checks.length) notes.push(`recoupement avec la fiche du fournisseur (calculé / publié) : ${checks.map(pct).join(', ')}`);
  const display = name.replace(/^U_MARCHAND /, 'U ').replace(/^PLAT /, 'Plat ').replace(/^CARRE /, 'Carré plein ').replace(/^ROND /, 'Rond plein Ø ');
  const section: Section = { key, name: display, shape, fabrication, dims, curveY: cy, curveZ: cz, ...(kg ? { kgPerM: kg } : {}), ...props };
  return {
    kind: 'section',
    key,
    name: display,
    status: 'suggested',
    material: 'S235',
    section,
    family: fam,
    checks,
    source: [{ ref: 'catalogue:Socacier', page: CATALOG_BE_URLS[url], note: `Base métaux Belgique ${CATALOG_BE_DATE} : dimensions du commerce, nuance / procédé / stock à confirmer` }],
    notes,
  };
}

let cache: CatalogSection[] | null = null;

/** Toutes les sections du catalogue, par famille puis masse croissante. */
export function catalogSections(): CatalogSection[] {
  if (!cache) cache = CATALOG_BE.map(build).filter((x): x is CatalogSection => !!x);
  return cache;
}

let byKey: Map<string, CatalogSection> | null = null;
export function catalogEntry(key: string): CatalogSection | undefined {
  if (!byKey) byKey = new Map(catalogSections().map((s) => [s.key, s]));
  return byKey.get(key);
}

/** Sections d'une famille, de la plus légère à la plus lourde. */
export function familySections(family: CatalogFamily): CatalogSection[] {
  return catalogSections()
    .filter((s) => s.family === family)
    .sort((a, b) => massOf(a) - massOf(b));
}

const massOf = (s: SectionEntry) => s.section.kgPerM ?? (s.section.A * RHO) / 1e6;

/**
 * Famille du catalogue d'une section quelconque (bibliothèque ou catalogue) : UNP 220 de la bibliothèque → UPN,
 * QHP 100 × 5 → SHS, RHP 120 × 60 × 4 → RHS… null si la forme n'a pas d'équivalent dans le catalogue.
 */
export function familyOf(s: SectionEntry): CatalogFamily | null {
  const c = s as CatalogSection;
  if (c.family) return c.family;
  switch (s.section.shape) {
    case 'UNP':
      return 'UPN';
    case 'SHS':
      return 'SHS';
    case 'RHS':
      return 'RHS';
    case 'CHS':
      return 'CHS';
    case 'ANGLE':
      return 'L';
    case 'FLAT':
      return 'PLAT';
    case 'ROUND':
      return 'ROND';
    case 'I': {
      const m = s.name.match(/^(IPE|HEA|HEB|HEM)/);
      return m ? (m[1] as CatalogFamily) : 'IPE';
    }
    default:
      return null;
  }
}

/**
 * Sections plus fortes que `s` dans sa famille (inerties forte et faible au moins égales, masse supérieure), de la
 * plus légère à la plus lourde : l'ordre des essais de l'optimiseur. Tubes rectangulaires : aussi les tubes carrés.
 */
export function strongerSections(s: SectionEntry): CatalogSection[] {
  const fam = familyOf(s);
  if (!fam) return [];
  const fams: CatalogFamily[] = fam === 'RHS' ? ['RHS', 'SHS'] : fam === 'SHS' ? ['SHS', 'RHS'] : [fam];
  const m0 = massOf(s);
  const p = s.section;
  return fams
    .flatMap(familySections)
    .filter((c) => massOf(c) > m0 + 1e-9 && c.section.Iy >= p.Iy * 0.999 && c.section.Iz >= p.Iz * 0.999 && c.section.Wely >= p.Wely * 0.999)
    .sort((a, b) => massOf(a) - massOf(b));
}

/** Toutes les sections d'une même famille que `s` (choix dans l'éditeur de module), de la plus légère à la plus lourde. */
export function sameFamily(s: SectionEntry): CatalogSection[] {
  const fam = familyOf(s);
  return fam ? familySections(fam) : [];
}

/** Masse linéique (kg/m) d'une section de la bibliothèque ou du catalogue. */
export const sectionMass = massOf;
