// Bibliothèque de départ (annexe A du cahier des charges), relevée dans les notes statico 24-0571 « Viewbox – Hoka »
// (17.06.2024, Entwurf) et 24-0569 « Viewbox – Qatar », et sur les plans Spantech visés TÜV (7-364-27).
// Importée une fois en base si absente (phase S3), jamais écrasée ensuite. Unités : N, mm.
import type { Section } from '../core/catalog';
import type { ConnectionEntry, LibraryEntry, ModuleTypeEntry, SectionEntry, SpreadingEntry } from '../core/library';
import { MATERIALS } from '../core/materials';
import { KN, KN_PER_CM, KNCM_PER_DEG, KNM } from '../core/units';
import type { StairKitParams } from '../core/templates/stair';

const HOKA = (page: string, note?: string) => ({ ref: 'report:24-0571', page, note });
const STATIC_TUV = (page: string, note?: string) => ({ ref: 'report:18-0573', page, note });
const cm2 = 1e2;
const cm3 = 1e3;
const cm4 = 1e4;
const cm6 = 1e6;

interface Props {
  A: number;
  Iy: number;
  Iz: number;
  Wely: number;
  Welz: number;
  Wply?: number;
  Wplz?: number;
  It: number;
  Iw?: number;
}
/** Propriétés données en cm (comme les annexes SCIA) → mm. */
const cm = (p: Props) => ({
  A: p.A * cm2,
  Iy: p.Iy * cm4,
  Iz: p.Iz * cm4,
  Wely: p.Wely * cm3,
  Welz: p.Welz * cm3,
  Wply: p.Wply === undefined ? undefined : p.Wply * cm3,
  Wplz: p.Wplz === undefined ? undefined : p.Wplz * cm3,
  It: p.It * cm4,
  Iw: p.Iw === undefined ? undefined : p.Iw * cm6,
});

const section = (
  e: Omit<SectionEntry, 'kind' | 'status' | 'section'> & { section: Omit<Section, 'key' | 'name'> },
  status: SectionEntry['status'] = 'known',
): SectionEntry => ({ kind: 'section', status, ...e, section: { key: e.key, name: e.name, ...e.section } });

export const SEED_SECTIONS: SectionEntry[] = [
  section({
    key: 'UNP220',
    name: 'UNP 220 (rives plancher / toiture)',
    material: 'S235',
    source: [HOKA('B5'), { ref: 'drawing:7-364-27', note: 'UPN = S235' }],
    section: {
      shape: 'UNP',
      fabrication: 'hot-rolled',
      // r = rayon de congé (DIN 1026-1) : largeurs c de la classification (SCIA : âme 170, aile 58,5 mm)
      dims: { h: 220, b: 80, tw: 9, tf: 12.5, r: 12.5 },
      curveY: 'c',
      curveZ: 'c',
      kgPerM: 29.4,
      ...cm({ A: 37.4, Iy: 2690, Iz: 197, Wely: 245, Welz: 33.6, Wply: 292, Wplz: 64.1, It: 16.2, Iw: 16831.71 }),
    },
  }),
  section({
    key: 'QHP100x5',
    name: 'QHP 100×5 (poteaux)',
    material: 'S275',
    // statico 18-0573 (calcul de type visé TÜV), annexe SCIA « Stütze » : QRO100X5 S 275, courbes a / a (Hoka : idem)
    source: [STATIC_TUV('B8', 'QRO100X5, S 275, courbes a'), HOKA('B5'), HOKA('A4', 'kaltgefertigte Hohlprofile')],
    section: {
      shape: 'SHS',
      fabrication: 'cold-formed',
      dims: { h: 100, b: 100, t: 5 },
      curveY: 'a',
      curveZ: 'a',
      kgPerM: 14.8,
      ...cm({ A: 18.8, Iy: 281, Iz: 281, Wely: 56.3, Welz: 56.3, Wply: 66.7, Wplz: 66.7, It: 433 }),
    },
  }),
  section({
    key: 'RHP120x60x4',
    name: 'RHP 120×60×4 (traverses et lisses plancher / toiture)',
    // statico 18-0573 § 3.1.3 et annexe SCIA « CS2 » : RRO120X60X4 S 275, courbes a / a ; plan Spantech 7-364-27 : S275
    material: 'S275',
    source: [STATIC_TUV('A25', 'QHP 120x60x4 S275'), STATIC_TUV('B7', 'RRO120X60X4, S 275, courbes a'), HOKA('B6', 'S275, courbes a'), { ref: 'drawing:7-364-27', note: '120x60 = S275' }],
    section: {
      shape: 'RHS',
      fabrication: 'cold-formed',
      dims: { h: 120, b: 60, t: 4 },
      curveY: 'a',
      curveZ: 'a',
      kgPerM: 10.6,
      ...cm({ A: 13.5, Iy: 247, Iz: 82.7, Wely: 41.1, Welz: 27.6, Wply: 51.5, Wplz: 31.6, It: 199 }),
    },
  }),
  section({
    key: 'T-FOOT-CORNER',
    name: 'Réception de pied d’angle (T soudé 215 × 10 / 130 × 15, avec voute)',
    material: 'S235',
    source: [HOKA('B6–B7', 'Tw (215; 10; 130; 15)')],
    section: {
      shape: 'T',
      fabrication: 'welded',
      dims: { h: 215, tw: 10, b: 130, tf: 15 },
      curveY: 'c',
      curveZ: 'c',
      kgPerM: 31.0,
      ...cm({ A: 39.5, Iy: 1811.32, Iz: 276.29, Wely: 118.33, Welz: 42.51, Wply: 214.56, Wplz: 68.37, It: 21.54 }),
    },
  }),
  section({
    key: 'FLA130/15',
    name: 'Plat 130 × 15 (réception de pied, plat équivalent)',
    material: 'S235',
    source: [HOKA('B7')],
    section: {
      shape: 'FLAT',
      fabrication: 'hot-rolled',
      dims: { b: 130, t: 15 },
      curveY: 'c',
      curveZ: 'c',
      kgPerM: 15.3,
      ...cm({ A: 19.5, Iy: 3.66, Iz: 274.63, Wely: 4.88, Welz: 42.25, Wply: 7.31, Wplz: 63.37, It: 14.63 }),
    },
  }),
  section({
    key: 'T-FOOT-MIDDLE',
    name: 'Réception de pied centrale (T soudé 55 × 10 / 130 × 15)',
    material: 'S235',
    source: [HOKA('B7', 'Tw (55; 10; 130; 15)')],
    section: {
      shape: 'T',
      fabrication: 'welded',
      dims: { h: 55, tw: 10, b: 130, tf: 15 },
      curveY: 'c',
      curveZ: 'c',
      kgPerM: 18.4,
      ...cm({ A: 23.5, Iy: 34.09, Iz: 274.96, Wely: 7.96, Welz: 42.3, Wply: 18.0, Wplz: 64.37, It: 16.21 }),
    },
  }),
  section({
    key: 'FLA60/6',
    name: 'Plat 60 × 6 (contreventement)',
    material: 'S235',
    source: [HOKA('B13'), HOKA('A26')],
    section: {
      shape: 'FLAT',
      fabrication: 'hot-rolled',
      dims: { b: 60, t: 6 },
      curveY: 'c',
      curveZ: 'c',
      kgPerM: 2.8,
      ...cm({ A: 3.6, Iy: 0.11, Iz: 10.8, Wely: 0.36, Welz: 3.6, Wply: 0.54, Wplz: 5.4, It: 0.43 }),
    },
  }),
  section({
    key: 'U200x80x5-CF',
    name: 'U plié 200 × 80 × 5 (limon d’escalier, cadre de palier)',
    material: 'S235',
    source: [HOKA('B9'), HOKA('A12')],
    section: {
      shape: 'U_COLD',
      fabrication: 'cold-formed',
      dims: { h: 200, b: 80, t: 5 },
      curveY: 'c',
      curveZ: 'c',
      kgPerM: 13.4,
      ...cm({ A: 17.06, Iy: 1003.33, Iz: 102.34, Wely: 100.33, Welz: 17.09, Wply: 118.78, Wplz: 30.43, It: 1.46, Iw: 6955.98 }),
    },
  }),
  section({
    key: 'QHP80x3-CF',
    name: 'QHP 80 × 3 formé à froid (montant pendulaire d’escalier)',
    material: 'S235',
    calibrationMaterial: 'S275',
    calibrationCurves: { y: 'a', z: 'a' },
    source: [HOKA('A12', 'S235 dans le texte'), HOKA('B11–B12', 'QRO80X3K, S275, courbes a')],
    section: {
      shape: 'SHS',
      fabrication: 'cold-formed',
      dims: { h: 80, b: 80, t: 3 },
      curveY: 'c',
      curveZ: 'c',
      kgPerM: 7.1,
      ...cm({ A: 9.01, Iy: 87.84, Iz: 87.84, Wely: 21.96, Welz: 21.96, Wply: 25.78, Wplz: 25.78, It: 139.47, Iw: 819.2 }),
    },
  }),
  section({
    key: 'U125x92x5-CF',
    name: 'U plié 125 × 92 × 5 (attache de montant de palier, L = 80 mm)',
    material: 'S235',
    source: [HOKA('B11'), HOKA('A14')],
    section: {
      shape: 'U_COLD',
      fabrication: 'cold-formed',
      dims: { h: 125, b: 92, t: 5 },
      curveY: 'c',
      curveZ: 'c',
      kgPerM: 12.7,
      ...cm({ A: 16.16, Iy: 250.8, Iz: 264.08, Wely: 54.52, Welz: 34.73, Wply: 60.8, Wplz: 57.6, It: 1.38, Iw: 3819.11 }),
    },
  }),
  section({
    key: 'C220x80x4-CF',
    name: 'C plié 220 × 80 × 4 (rive de terrasse)',
    material: 'S235',
    source: [HOKA('B10'), HOKA('A19')],
    section: {
      shape: 'U_COLD',
      fabrication: 'cold-formed',
      dims: { h: 220, b: 80, t: 4 },
      curveY: 'c',
      curveZ: 'c',
      kgPerM: 11.5,
      ...cm({ A: 14.6, Iy: 1030.66, Iz: 86.02, Wely: 93.7, Welz: 14.03, Wply: 111.0, Wplz: 24.72, It: 0.79, Iw: 7186.02 }),
    },
  }),
  section({
    key: 'C24-150x50',
    name: 'Solive bois 150 × 50 C24 (terrasse)',
    material: 'C24',
    source: [HOKA('B10'), HOKA('A20')],
    section: {
      shape: 'RECT',
      fabrication: 'timber',
      dims: { h: 150, b: 50 },
      kgPerM: 3.2,
      ...cm({ A: 75, Iy: 1406.25, Iz: 156.25, Wely: 187.5, Welz: 62.5, Wply: 281.25, Wplz: 93.75, It: 493.77 }),
    },
  }),
  section({
    key: 'FLA150/12',
    name: 'Plat 150 × 12 (répartition pied d’escalier intérieur)',
    material: 'S235',
    source: [HOKA('B12'), HOKA('A17')],
    section: {
      shape: 'FLAT',
      fabrication: 'hot-rolled',
      dims: { b: 150, t: 12 },
      curveY: 'c',
      curveZ: 'c',
      kgPerM: 14.1,
      ...cm({ A: 18.0, Iy: 2.16, Iz: 337.5, Wely: 3.6, Welz: 45.0, Wply: 5.4, Wplz: 67.5, It: 8.64 }),
    },
  }),
  section({
    key: 'QRO100x4-EQ',
    name: 'Barre équivalente sans masse QRO 100 × 4 (liaisons d’angle, contacts)',
    material: 'MASSLESS',
    source: [HOKA('B4', 'Ersatzstab_Deko, Verbindung_Ecke, Druckkontakt')],
    section: {
      shape: 'SHS',
      fabrication: 'equivalent',
      massless: true,
      dims: { h: 100, b: 100, t: 4 },
      ...cm({ A: 15.2, Iy: 233, Iz: 233, Wely: 46.6, Welz: 46.6, Wply: 54.7, Wplz: 54.7, It: 357 }),
    },
  }),
  section({
    key: 'RD20-EQ',
    name: 'Barre équivalente sans masse RD 20 (boulons horizontaux)',
    material: 'MASSLESS',
    source: [HOKA('B8', 'Verschraubung')],
    section: {
      shape: 'ROUND',
      fabrication: 'equivalent',
      massless: true,
      dims: { d: 20 },
      ...cm({ A: 3.14, Iy: 0.77, Iz: 0.77, Wely: 0.77, Welz: 0.77, Wply: 1.31, Wplz: 1.31, It: 1.57 }),
    },
  }),
  section({
    key: 'AQ-STEP-EQ',
    name: 'Barre équivalente sans masse (marche d’escalier)',
    material: 'MASSLESS',
    source: [HOKA('B12', 'Ersatz_Treppenstufe AQ')],
    section: {
      shape: 'GENERIC',
      fabrication: 'equivalent',
      massless: true,
      dims: {},
      ...cm({ A: 10.32, Iy: 17.46, Iz: 828.65, Wely: 4.77, Welz: 64.99, Wply: 7.57, Wplz: 81.99, It: 0.32, Iw: 2490.27 }),
    },
  }),
];

const cap = (key: string, label: string, value: number, unit: ConnectionEntry['capacities'][number]['unit'], page: string, formula?: string) => ({
  key,
  label,
  value,
  unit,
  formula,
  source: HOKA(page),
});

export const SEED_CONNECTIONS: ConnectionEntry[] = [
  {
    kind: 'connection',
    key: 'VBX-CORNER',
    name: 'Angle poteau / cadre Viewbox',
    status: 'known',
    composition: 'platines 10 mm soudées sur les rives (S235), 4 × M16-8.8 à chaque extrémité du poteau — en pied (plancher) et en tête (toiture) — (entraxe 110 mm), 2 plats 180 × 50 × 15 intérieurs, trous oblongs verticaux 8 mm, implantation ≥ 15 mm',
    capacities: [
      cap('N', 'effort normal transmis par les boulons', 70 * KN, 'N', 'A22–A23', 'au-delà : contact poteau / couvercle'),
      cap('M_biax', 'moment biaxial My et Mz (chacun)', 8.0 * KNM, 'N·mm', 'A22'),
      cap('M_uniax_max', 'moment dominant (uniaxial)', 11.5 * KNM, 'N·mm', 'A22'),
      cap('M_uniax_min', 'moment secondaire (uniaxial)', 3.3 * KNM, 'N·mm', 'A22'),
      cap('k_rot', 'raideur en rotation (ideaStatiCa)', 3500 * KNCM_PER_DEG, 'N·mm/rad', 'A22'),
    ],
    rule: {
      check: 'viewboxCorner',
      text: 'η = min(η₂ₐₓ, η₁ₐₓ) ; η₂ₐₓ = max(|My|, |Mz|) / 8,0 kNm ; η₁ₐₓ = max(max(|My|, |Mz|) / 11,5 ; min(|My|, |Mz|) / 3,3)',
    },
    source: [HOKA('A22–A23')],
  },
  {
    kind: 'connection',
    key: 'VBX-VERTICAL-CONTACT',
    name: 'Contact vertical entre Viewbox empilées',
    status: 'known',
    composition: 'plat 50 × 10 (larmier, soudé aw ≥ 3 mm sur ≥ 30 cm, 2 appuis ≥ 85 × 5 mm) + couvercle 100 × 100 × 10 (2 cordons aw ≥ 5 mm, Lw ≥ 85 mm)',
    capacities: [
      cap('NRd_flat', 'appui du plat 50 × 10', 181 * KN, 'N', 'A23', '2 · 8,5 cm · 0,5 cm · 23,5 kN/cm² / 1,1'),
      cap('NRd_buckling', 'flambement du plat (console)', 332 * KN, 'N', 'A23', '2 · 0,914 · 8,5 cm · 1 cm · 23,5 kN/cm² / 1,1'),
      cap('NRd_weld', 'soudure du couvercle', 176 * KN, 'N', 'A23', '2 · 8,5 cm · 10,39 kN/cm'),
      cap('VRd_cover', 'cisaillement du couvercle', 230 * KN, 'N', 'A23', '2 · 8,5 cm · 1 cm · 23,5 kN/cm² / √3 / 1,0'),
      cap('NRd_wall', 'introduction dans la paroi du poteau', 250 * KN, 'N', 'A23', '2 · 10 cm · 0,5 cm · 27,5 kN/cm² / 1,1'),
    ],
    rule: { check: 'minCapacity', text: 'NRd = min(181 ; 332 ; 176 ; 230 ; 250) = 176 kN' },
    source: [HOKA('A23')],
  },
  {
    kind: 'connection',
    key: 'VBX-VERTICAL-PLATE',
    name: 'Plats de liaison verticale (Viewbox empilées)',
    status: 'known',
    // disposition Viewbox (A. Pinchart 01.10.2026) : 4 plats par grand côté et 2 par petit côté, sur les faces
    // extérieures seulement (inaccessibles entre deux Viewbox), 10 mm, 2 × M20 chacun ; statico 24-0569 § 3.7 : 2 par côté
    composition: 'plats 100 × 10 L = 400 mm S235, 2 × M20-8.8 par plat (1 dans chaque Viewbox, entraxe 290 mm) ; 4 plats par grand côté et 2 par petit côté, sur les faces extérieures seulement',
    capacities: [
      cap('HRd', 'effort horizontal par plat, perpendiculaire à son côté', 5.81 * KN, 'N', 'A24', '(45,82 kNcm + 58,75 kNcm) / 18 cm'),
      cap('FvRd_M20', 'cisaillement M20-8.8 (filetage dans le plan de cisaillement)', 94.1 * KN, 'N', 'A26', '0,6 · 80 kN/cm² · 2,45 cm² / 1,25'),
      { key: 'FbRd_plate', label: 'pression diamétrale dans le plat 10 mm (e1 = 55 mm, e2 = 50 mm)', value: 120.0 * KN, unit: 'N', formula: '2,5 · 0,83 · 36 kN/cm² · 2,0 cm · 1,0 cm / 1,25 (αd = e1 / 3 d0 = 55 / 66)', source: { ref: 'standard:EN 1993-1-8 tab. 3.4' } },
      { key: 'FbRd_web', label: 'pression diamétrale dans l’âme de l’UNP 220 (tw 9 mm)', value: 129.6 * KN, unit: 'N', formula: '2,5 · 1,0 · 36 kN/cm² · 2,0 cm · 0,9 cm / 1,25', source: { ref: 'standard:EN 1993-1-8 tab. 3.4' } },
      { key: 'NuRd_plate', label: 'section nette du plat', value: 202.2 * KN, unit: 'N', formula: '0,9 · (10 cm − 2,2 cm) · 1,0 cm · 36 kN/cm² / 1,25', source: { ref: 'standard:EN 1993-1-1 6.2.3' } },
      { key: 'perLongSide', label: 'plats par grand côté extérieur', value: 4, unit: '-', source: { ref: 'user', note: 'A. Pinchart 01.10.2026 : 4 sur les grands côtés, faces extérieures' } },
      { key: 'perShortSide', label: 'plats par petit côté extérieur', value: 2, unit: '-', source: { ref: 'user', note: 'A. Pinchart 01.10.2026 : 2 sur les petits côtés, faces extérieures' } },
      cap('FtRd_M20', 'traction M20-8.8', 141.1 * KN, 'N', 'A24'),
      cap('mu', 'frottement acier / acier', 0.1, '-', 'A24'),
      cap('k_shear', 'raideur en cisaillement de la liaison d’angle (modèle)', 10 * KN_PER_CM, 'N/mm', 'B59–B78', 'Verbindung_Ecke : uy, uz nachgiebig 10 kN/cm'),
    ],
    rule: {
      check: 'verticalPlate',
      text: 'soulèvement par angle : T / (n · TRd), n = plats des demi-côtés extérieurs voisins, TRd = min(Fv,Rd M20 ; Fb,Rd plat ; Fb,Rd âme ; Nu,Rd) ; glissement entre les deux Viewbox (somme des 4 angles) : (H − 0,1 · ΣRz) / (n · 5,81 kN) par direction, n = plats des côtés extérieurs perpendiculaires à l’effort',
    },
    notes: ['plats sur les faces extérieures seulement : une Viewbox du dessus entourée de voisines n’en a que sur ses côtés libres', 'un plat ne reprend l’effort horizontal perpendiculaire à son côté que dans un sens (statico) : moitié des plats par sens, prudent'],
    source: [HOKA('A24'), { ref: 'report:24-0569', page: '§ 3.7' }, { ref: 'user', note: 'A. Pinchart 01.10.2026 : 4 plats par grand côté, 2 par petit côté, faces extérieures, 10 mm, 2 × M20' }],
  },
  {
    kind: 'connection',
    key: 'VBX-HORIZONTAL-BOLT',
    name: 'Boulons horizontaux entre Viewbox juxtaposées',
    status: 'known',
    // pratique Viewbox (A. Pinchart 30.09 et 01.10.2026) : M16 × 150 classe 10.9, passés dans les écrous M20 soudés des
    // rives (passage 18 mm, peu de jeu), au plancher et en toiture — statico les comptait en M20-8.8
    composition: 'M16 × 150 mm classe 10.9 passés dans les écrous M20 soudés des rives (passage Ø 18 mm), âme des UNP 220 (tw = 9 mm), serrant les Viewbox entre elles au plancher et en toiture',
    capacities: [
      { key: 'd', label: 'diamètre du boulon', value: 16, unit: 'mm', source: { ref: 'user', note: 'A. Pinchart 30.09.2026 : M16 de 150 mm' } },
      { key: 'd0', label: 'passage (écrou M20 soudé)', value: 18, unit: 'mm', source: { ref: 'user', note: 'A. Pinchart 01.10.2026 : écrous M20 soudés, 18 mm pour passer' } },
      { key: 'FtRd', label: 'traction M16-10.9', value: 113.0 * KN, unit: 'N', formula: '0,9 · 100 kN/cm² · 1,57 cm² / 1,25', source: { ref: 'standard:EN 1993-1-8 tab. 3.4' } },
      { key: 'FvRd', label: 'cisaillement M16-10.9 (filetage dans le plan de cisaillement, αv = 0,5)', value: 62.8 * KN, unit: 'N', formula: '0,5 · 100 kN/cm² · 1,57 cm² / 1,25', source: { ref: 'standard:EN 1993-1-8 tab. 3.4' } },
      { key: 'FbRd', label: 'pression diamétrale dans l’âme tw 9 mm (trou normal)', value: 103.7 * KN, unit: 'N', formula: '2,5 · 1,0 · 36 kN/cm² · 1,6 cm · 0,9 cm / 1,25', source: { ref: 'standard:EN 1993-1-8 tab. 3.4' } },
      { key: 'BpRd', label: 'poinçonnement de l’âme sous la tête ou l’écrou', value: 124.0 * KN, unit: 'N', formula: '0,6 · π · 2,54 cm · 0,9 cm · 36 kN/cm² / 1,25', source: { ref: 'standard:EN 1993-1-8 tab. 3.4' } },
      { key: 'length', label: 'longueur du boulon', value: 150, unit: 'mm', source: { ref: 'user', note: 'A. Pinchart 30.09.2026' } },
      cap('k', 'raideur des ressorts du modèle (ux, uy, uz)', 50 * KN_PER_CM, 'N/mm', 'B59'),
    ],
    rule: { check: 'bolt', text: 'DIN EN 1993-1-8 tab. 3.4 : Fv / min(Fv,Rd ; Fb,Rd) + Ft / (1,4 · min(Ft,Rd ; Bp,Rd)) ≤ 1' },
    source: [HOKA('A25'), { ref: 'user', note: 'A. Pinchart 30.09.2026 : M16 de 150 mm, plancher et toiture' }, { ref: 'user', note: 'A. Pinchart 01.10.2026 : classe 10.9, écrous M20 soudés, passage 18 mm' }],
    notes: ['Qatar § 3.8 : une position de boulon n’existe pas en série et doit être percée sur site'],
  },
  {
    kind: 'connection',
    key: 'VBX-BRACING',
    name: 'Contreventement plat 60 × 6 + ridoir ¾″',
    status: 'known',
    composition: 'FLA 60 × 6 S235, trous Ø 24 (e1 ≥ 50 mm) pour M20-8.8 côté Viewbox, Ø 16 (e1 ≥ 30 mm) côté ridoir, ridoir ¾″',
    capacities: [
      cap('NplRd', 'section brute', 84.6 * KN, 'N', 'A26', '6,0 cm · 0,6 cm · 23,5 kN/cm² / 1,0'),
      cap('NuRd', 'section nette', 56.0 * KN, 'N', 'A26', '0,9 · (6,0 cm − 2,4 cm) · 0,6 cm · 36 kN/cm² / 1,25'),
      cap('FbRd_vbx', 'pression diamétrale côté Viewbox', 43.2 * KN, 'N', 'A26', '1,80 · 0,69 · 36 kN/cm² · 2,0 cm · 0,6 cm / 1,25'),
      cap('FbRd_turnbuckle', 'pression diamétrale côté ridoir', 40.5 * KN, 'N', 'A26', '2,50 · 0,63 · 36 kN/cm² · 1,5 cm · 0,6 cm / 1,25'),
      cap('FRd_turnbuckle', 'ridoir ¾″', 39.8 * KN, 'N', 'A26'),
      cap('FvRd_M20', 'boulon M20-8.8', 94.1 * KN, 'N', 'A26'),
      cap('k_end', 'raideur axiale par extrémité (jeu 1 mm)', 400 * KN_PER_CM, 'N/mm', 'A26', 'k ≈ 40 kN / 0,1 cm'),
    ],
    rule: { check: 'minCapacity', text: 'NRd = min(84,6 ; 56,0 ; 43,2 ; 40,5 ; 39,8 ; 94,1) = 39,8 kN (ridoir), traction seule' },
    source: [HOKA('A26')],
  },
  {
    kind: 'connection',
    key: 'STAIR-HOOK-LANDING',
    name: 'Limon d’escalier accroché au palier (crochets + 2 × M12)',
    status: 'known',
    composition: '2 crochets en plat 80 × 5 (S235) + 2 × M12-8.8 dans la platine 80 × 8 du cadre de palier',
    capacities: [cap('VzRd', 'effort tranchant par limon', 5.88 * KN, 'N', 'A13', 'MRd = 8 cm · (0,5 cm)² / 4 · 23,5 kN/cm² / 1,0 = 11,75 kNcm ; Vz,Rd = 11,75 · 4 / 8')],
    source: [HOKA('A13')],
  },
  {
    kind: 'connection',
    key: 'STAIR-HOOK-ONLY',
    name: 'Limon d’escalier de terrasse simplement accroché',
    status: 'known',
    composition: 'crochet en plat 80 × 5 (S235), bras de levier 3,6 cm',
    capacities: [cap('VzRd', 'effort tranchant par limon', 3.26 * KN, 'N', 'A16', '8 cm · (0,5 cm)² / 4 · 23,5 kN/cm² / 1,0 / 3,6 cm')],
    notes: ['Hoka : Vz,Ed 7,40 kN ≫ 3,26 kN → limons obligatoirement boulonnés 2 × M12-8.8'],
    source: [HOKA('A16')],
  },
  {
    kind: 'connection',
    key: 'STAIR-LANDING-VBX',
    name: 'Palier d’escalier boulonné à la Viewbox',
    status: 'known',
    composition: '2 × M20-8.8, capot plié 155 × 105 × 3 renforcé par un U en plat 100 × 8 (S235)',
    capacities: [
      cap('FtRd_cover', 'capot plié seul, par boulon', 1.32 * KN, 'N', 'A15', '7,93 kNcm · 4 / (10,85 cm + 13,1 cm)'),
      cap('FtRd', 'avec U 100 × 8, par boulon', 10.9 * KN, 'N', 'A15', '(2 · 29,3 kNcm + 2 · 37,6 kNcm) / (5 cm + 7,25 cm)'),
    ],
    source: [HOKA('A15')],
  },
  {
    kind: 'connection',
    key: 'STAIR-INNER-FOOT',
    name: 'Pied d’escalier intérieur sur plat 150 × 12',
    status: 'known',
    composition: 'plat de répartition 150 × 12 (S235), porte-à-faux ≈ 30 cm',
    capacities: [cap('RzRd', 'réaction verticale', 4.23 * KN, 'N', 'A17', '15 cm · (1,2 cm)² / 4 · 23,5 kN/cm² / 1,0 / 30 cm')],
    source: [HOKA('A17')],
  },
  {
    kind: 'connection',
    key: 'STAIR-JACK-LAYHER60',
    name: 'Pied de montant d’escalier sur vérin Layher 60',
    status: 'known',
    composition: 'couvercle 90 × 90 × 10 + fourreau 42,4 × 2,0 L = 460 mm (S235), vérin Layher 60',
    capacities: [
      cap('extensionMax', 'sortie maxi du vérin', 300, '-', 'A14', 'constructivement limitée à 30 cm'),
      // tige du vérin Layher 60 (S235 JRH, fy,k = 28 kN/cm² Layher, courbe c) : statico 18-0573 § 3.8.3 (A62)
      { key: 'A', label: 'section de la tige', value: 384, unit: 'mm²', source: { ref: 'report:18-0573', page: 'A62' } },
      { key: 'Wpl', label: 'module plastique de la tige', value: 3260, unit: 'mm³', source: { ref: 'report:18-0573', page: 'A62' } },
      { key: 'i', label: 'rayon de giration', value: 9.9, unit: 'mm', source: { ref: 'report:18-0573', page: 'A62' } },
      { key: 'fy', label: 'limite d’élasticité (Layher)', value: 280, unit: 'N/mm²', source: { ref: 'report:18-0573', page: 'A62' } },
      { key: 'nut', label: 'hauteur de l’écrou à ailettes', value: 32, unit: 'mm', source: { ref: 'report:18-0573', page: 'A62' } },
    ],
    source: [HOKA('A14')],
  },
  {
    kind: 'connection',
    key: 'VBX-JACK',
    name: 'Pieds à vérin intégrés des Viewbox',
    // hypothèse de base (A. Pinchart 30.09.2026) : tige Tr 24 × 5, sortie 5 cm au plus, 6 vérins par Viewbox
    status: 'known',
    composition: 'pied acier 7-355-014, tige filetée trapézoïdale Tr 24 × 5 classe 10.9 (fy 900, fu 1 000 N/mm², 7-366-001), platine 7-309-002 ; 6 par Viewbox (4 angles + milieu des 2 grands côtés)',
    capacities: [
      { key: 'd', label: 'diamètre nominal de la tige', value: 24, unit: 'mm', formula: 'Tr 24 × 5 (DIN 103)', source: { ref: 'user', note: 'A. Pinchart 30.09.2026' } },
      { key: 'd3', label: 'diamètre du noyau', value: 18.5, unit: 'mm', formula: 'd3 = d − 2 · h3 = 24 − 2 · (0,5 · 5 + 0,25) (DIN 103-1)', source: { ref: 'standard:DIN 103-1' } },
      { key: 'fyb', label: 'limite d’élasticité (classe 10.9)', value: 900, unit: 'N/mm²', source: { ref: 'user', note: 'A. Pinchart 29.09.2026 : classe 10.9' } },
      { key: 'extensionMax', label: 'sortie maxi de la tige', value: 50, unit: 'mm', source: { ref: 'user', note: 'A. Pinchart 30.09.2026 : sortie 5 cm au plus' } },
      { key: 'perModule', label: 'vérins par Viewbox', value: 6, unit: '-', formula: '4 angles + milieu des 2 grands côtés', source: { ref: 'user', note: 'A. Pinchart 30.09.2026' } },
    ],
    rule: {
      check: 'jack',
      text: 'tige console encastrée dans le pied, posée sur sa platine : Lcr = 2 · sortie, M = H · sortie ; compression + flexion sur le noyau (EC3 6.2.1(7), 6.3.3 annexe B, courbe c, flexion élastique)',
    },
    notes: [
      'Hoka : vérins interdits, angles directement sur la plaque de calage (réceptions de pied surchargées) — avec les vérins, les réceptions de pied sont vérifiées dans le calcul',
      'Qatar : sortie maxi 5 cm (§ 1.4.4) mais vérins interdits en § 3.6 / § 3.10',
      'filetage de la douille du pied non vérifié (longueur en prise non renseignée) ; platine 7-309-002 prise 15 × 15 cm pour le calage (à confirmer)',
    ],
    source: [
      HOKA('A4'),
      { ref: 'drawing:ensemble VIEWBOX M16 60MM' },
      { ref: 'user', note: 'A. Pinchart 29.09.2026 : filetage trapézoïdal gros pas, classe 10.9' },
      { ref: 'user', note: 'A. Pinchart 30.09.2026 : toujours des tiges Tr 24, sortie 5 cm maxi, 6 par Viewbox' },
      { ref: 'report:24-0569', page: '§ 1.4.4, § 3.6, § 3.10' },
    ],
  },
];

export const SEED_SPREADING: SpreadingEntry[] = [
  {
    kind: 'spreading',
    key: 'CP-F40/30',
    name: 'Contreplaqué F40/30 non revêtu (plaques de calage)',
    status: 'known',
    material: 'CP-F40/30',
    thicknesses: [18, 21, 24, 27, 30, 40],
    minThickness: 12,
    sideStep: 50,
    thicknessStep: 1,
    kmod: 0.9,
    gammaM: 1.3,
    source: [HOKA('A28–A34')],
  },
];

/** Surfaces de contact (mm) d'un groupe d'angles posés sur une même plaque, et d'un pied d'escalier. */
/**
 * Kit escalier extérieur Viewbox (« StairwayKIT with plateform ») : géométrie du modèle SCIA de statico 24-0569
 * (Qatar, annexe B 3.3–3.4) — limons à x 8,597 / 9,797 m (ligne de rive 8,395), palier 2,58 → 4,92 m, perçages 2,71 /
 * 4,79 m, accroche 2,33 m, pied −1,78 m à 0,176 m, montants intermédiaires 1,103 m, 17 marches, 9 lattes ; charges
 * § 2.1 (marches 0,42 kN/m²) ; garde-corps 0,10 kN/m (comme ceux des Viewbox).
 */
export const STAIR_KITS: StairKitParams[] = [
  {
    key: 'STAIR-KIT-VBX',
    name: 'Escalier extérieur Viewbox avec palier (kit)',
    width: 1200,
    gap: 202,
    boltSpacing: 2080,
    landingMargin: 130,
    hookExtension: 250,
    runPerRise: 4110 / 2904,
    footHeight: 176,
    middlePost: 1227,
    postInset: 38,
    stepGoing: 242,
    landingBars: 9,
    landingEndOffset: 173,
    footOverhang: 107,
    outerRail: 167,
    sections: { stringer: 'U200x80x5-CF', post: 'QHP80x3-CF', head: 'U125x92x5-CF', step: 'AQ-STEP-EQ', link: 'QRO100x4-EQ' },
    treads: 0.42e-3,
    railing: 0.1,
    source: 'statico 24-0569 (Qatar) annexe B 3.3–3.6 et § 2.1 ; 24-0571 (Hoka) § 3.2',
  },
];

export const CONTACT_AREAS = {
  corner1: { a1: 210, a2: 210, source: HOKA('A28') },
  corner2: { a1: 420, a2: 210, source: HOKA('A30', 'la page A30 prend 42 × 42 pour σc,90 : erreur, 42 × 21 retenu') },
  corner4: { a1: 420, a2: 420, source: HOKA('A32') },
  stairFoot: { a1: 150, a2: 150, source: HOKA('A34') },
} as const;

export const SEED_MODULES: ModuleTypeEntry[] = [
  {
    kind: 'module_type',
    key: 'VIEWBOX-5900-EU',
    name: 'Viewbox 5900 × 2500 (EU, M16)',
    status: 'known',
    template: 'viewbox-eu',
    nominal: { long: 5900, short: 2500, height: 3080 },
    // poids confirmé par Viewbox (29.09.2026) : planchers + isolants compris ; statico : GWaage ≈ 20 kN (toit + plancher + poteaux)
    weighedN: 2564 * 9.81,
    params: {
      x0: 5,
      x1: 5895,
      y0: 5,
      y1: 2495,
      floorZ: 0,
      roofZ: 2790,
      topZ: 3080,
      transverseX: [1144, 2344, 3544, 4745],
      longitudinalY: [835, 1665],
      footOffset: 155,
      middleFootX: 2950,
      boltLongX: [210, 2290, 3610, 5690],
      boltShortY: [210, 2290],
      verticalContactX: [1360, 2950, 4540],
      gap: 10,
      sections: {
        rim: 'UNP220',
        secondary: 'RHP120x60x4',
        column: 'QHP100x5',
        footCorner: 'T-FOOT-CORNER',
        footPlate: 'FLA130/15',
        footMiddle: 'T-FOOT-MIDDLE',
        cornerLink: 'QRO100x4-EQ',
        bolt: 'RD20-EQ',
        contact: 'QRO100x4-EQ',
      },
      springs: {
        columnRotation: 3500 * KNCM_PER_DEG,
        cornerLinkShear: 10 * KN_PER_CM,
        boltTranslation: 50 * KN_PER_CM,
        // statico 18-0573 annexe SCIA § 3.9 « Knotenauflager » : X / Y 100 kN/cm, Z 1 000 kN/cm en compression seule
        supportHorizontal: 100 * KN_PER_CM,
        supportVertical: 1000 * KN_PER_CM,
      },
      plywood: { floorLayers: 2, roofLayers: 1, thickness: 18, material: 'CP-F20/15', maxSpan: 800 },
    },
    source: [
      { ref: 'user', note: 'A. Pinchart 29.09.2026 : 2 564 kg planchers + isolants compris' },
      HOKA('A8', 'GWaage ≈ 20 kN (toit + plancher + poteaux, sans murs)'),
      HOKA('B13–B82', 'nœuds, barres, articulations, appuis'),
      STATIC_TUV('B36–B37', 'appuis : 100 kN/cm en X / Y, 1 000 kN/cm en compression seule en Z'),
      { ref: 'drawing:7-364-27', note: 'toiture 886,432 kg ; ensemble planchers + isolants 2 563,752 kg' },
    ],
  },
  {
    kind: 'module_type',
    key: 'VIEWBOX-8400-EU',
    name: 'Viewbox 8400 × 2500',
    status: 'unknown',
    template: null,
    nominal: { long: 8400, short: 2500, height: 3080 },
    source: [{ ref: 'user', note: 'données de structure inconnues : l’outil demande' }],
  },
  {
    kind: 'module_type',
    key: 'VIEWBOX-US-INV2023',
    name: 'Viewbox US « INV_2023 TEMP_V2504 »',
    // relevé du cahier des charges, à vérifier dans le submittal avant usage
    status: 'suggested',
    template: 'viewbox-us',
    nominal: { long: 5900, short: 2500, height: 3080 },
    notes: [
      'rives MC 8×20 (A36), secondaires HSS 5×2½×3/16 (A500 Gr C), poteaux HSS 4×4×3/16 (A500 Gr C)',
      '4 × 5/8″-11 UNC SAE J429 Gr 5 par angle (6 en option)',
      'plancher 2 × 18 mm + isolation 100 mm ; toiture panneau sandwich 50 mm + bitume',
    ],
    source: [{ ref: 'report:25.601.18', note: 'non relu : à vérifier' }],
  },
];

export const SEED: LibraryEntry[] = [
  ...MATERIALS.map((m) => ({ kind: 'material' as const, key: m.key, name: m.name, status: (m.unverified ? 'suggested' : 'known') as 'suggested' | 'known', material: m.key, source: [{ ref: m.source }] })),
  ...SEED_SECTIONS,
  ...SEED_CONNECTIONS,
  ...SEED_SPREADING,
  ...SEED_MODULES,
];

export function seedSection(key: string): SectionEntry {
  const s = SEED_SECTIONS.find((x) => x.key === key);
  if (!s) throw new Error(`Section ${key} absente de la bibliothèque`);
  return s;
}
