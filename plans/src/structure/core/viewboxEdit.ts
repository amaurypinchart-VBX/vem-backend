// Structure d'un type de Viewbox rendue lisible et modifiable (étape 1 et bibliothèque) : section de chaque famille de
// barres (rives, traverses et lisses, poteaux, réceptions de pied), positions des traverses et des lisses, hauteurs,
// raideurs des assemblages semi-rigides, contreplaqué du plancher, poids pesé. L'outil contrôle la cohérence de ce qui
// est saisi et trace chaque modification dans les sources de l'entrée (le rapport le signale). Sections nouvelles :
// propriétés calculées par l'outil depuis les dimensions (tubes, plats, ronds, U / C pliés, T soudés) ou reprises de
// la fiche du fournisseur (profils laminés). Fonctions pures.
import type { ExtractedSection } from './ai';
import { sectionFromExtract, slug } from './ai';
import type { BucklingCurve } from './catalog';
import type { LibraryEntry, ModuleTypeEntry, SectionEntry, ViewboxTemplateParams } from './library';
import { designation } from './library';
import { MATERIALS } from './materials';
import type { TemplateFamily } from './templates/viewboxEU';
import { KNCM_PER_DEG, KN_PER_CM, fmtNumber } from './units';

export type SectionSlot = keyof ViewboxTemplateParams['sections'];

export interface FamilySlot {
  family: TemplateFamily;
  slot: SectionSlot;
  /** section reprise quand la case est vide (toiture = plancher, comme les notes statico) */
  fallback?: SectionSlot;
  label: string;
  hint: string;
}

/** Familles de barres d'une Viewbox, dans l'ordre de la fiche. */
export const FAMILY_SLOTS: FamilySlot[] = [
  { family: 'rim-floor', slot: 'rim', label: 'Rives du plancher', hint: 'cadre bas, 4 côtés' },
  { family: 'rim-roof', slot: 'rimRoof', fallback: 'rim', label: 'Rives de toiture', hint: 'cadre haut, 4 côtés' },
  { family: 'secondary-floor', slot: 'secondary', label: 'Traverses et lisses du plancher', hint: 'barres du milieu, sous le contreplaqué' },
  { family: 'secondary-roof', slot: 'secondaryRoof', fallback: 'secondary', label: 'Traverses et lisses de toiture', hint: 'barres du milieu de la toiture' },
  { family: 'column', slot: 'column', label: 'Poteaux d’angle', hint: '4 poteaux, assemblages semi-rigides en haut et en bas' },
  { family: 'foot-corner', slot: 'footCorner', label: 'Réceptions de pied d’angle', hint: 'T soudé en diagonale sous chaque angle' },
  { family: 'foot-plate', slot: 'footPlate', label: 'Plats des réceptions de pied', hint: 'vers les deux rives' },
  { family: 'foot-middle', slot: 'footMiddle', label: 'Réceptions centrales', hint: 'milieu des grands côtés' },
];

/** Section d'une famille (clé), avec la section de repli pour la toiture. */
export function slotSection(p: ViewboxTemplateParams, f: Pick<FamilySlot, 'slot' | 'fallback'>): string {
  return p.sections[f.slot] ?? (f.fallback ? p.sections[f.fallback] : undefined) ?? '';
}

/** Paramètres avec une autre section pour une famille. */
export function withSection(p: ViewboxTemplateParams, slot: SectionSlot, key: string): ViewboxTemplateParams {
  return { ...p, sections: { ...p.sections, [slot]: key } };
}

/** « 1144 ; 2344 ; 3544 » → [1144, 2344, 3544] (mm, triés) ; null si un élément n'est pas un nombre. */
export function parseList(text: string): number[] | null {
  const parts = text
    .split(/[;,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const xs = parts.map(Number);
  if (xs.some((x) => !Number.isFinite(x))) return null;
  return [...new Set(xs.map((x) => Math.round(x)))].sort((a, b) => a - b);
}

export const listText = (xs: readonly number[]) => xs.map((x) => String(Math.round(x))).join(' ; ');

/** Plus grand écart entre deux lignes voisines de la grille (rives comprises), mm. */
export function maxSpacing(lines: readonly number[], a: number, b: number): number {
  const xs = [...new Set([a, b, ...lines])].sort((x, y) => x - y);
  let m = 0;
  for (let k = 0; k + 1 < xs.length; k++) m = Math.max(m, xs[k + 1] - xs[k]);
  return m;
}

/** Valeurs affichées dans les unités de l'ingénieur (kNcm/deg, kN/cm, kg). */
export const toUser = {
  rotation: (v: number) => v / KNCM_PER_DEG,
  stiffness: (v: number) => v / KN_PER_CM,
  kg: (N: number) => N / 9.81,
};
export const fromUser = {
  rotation: (v: number) => v * KNCM_PER_DEG,
  stiffness: (v: number) => v * KN_PER_CM,
  kg: (kg: number) => kg * 9.81,
};

export interface TemplateCheck {
  errors: string[];
  warnings: string[];
}

/** Cohérence d'un gabarit saisi : une erreur empêche l'enregistrement, un avertissement est affiché. */
export function checkTemplate(p: ViewboxTemplateParams, library: readonly LibraryEntry[], weighedN?: number): TemplateCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  const sections = new Map(library.filter((e): e is SectionEntry => e.kind === 'section' && !e.disabled).map((e) => [e.key, e]));
  for (const f of FAMILY_SLOTS) {
    const k = slotSection(p, f);
    const s = sections.get(k);
    if (!s) errors.push(`${f.label} : section ${k || '—'} absente de la bibliothèque`);
    else if (s.section.massless) errors.push(`${f.label} : ${s.name} est une barre de liaison sans masse, pas une section de barre`);
    else if (s.status !== 'known') warnings.push(`${f.label} : section « ${designation(s.name)} » à vérifier dans la bibliothèque`);
  }
  const inside = (xs: readonly number[], a: number, b: number, what: string) => {
    for (const x of xs) if (!(x > a + 50 && x < b - 50)) errors.push(`${what} à ${Math.round(x)} mm : hors de la Viewbox (entre ${Math.round(a + 50)} et ${Math.round(b - 50)} mm)`);
    const s = [...xs].sort((u, v) => u - v);
    for (let k = 0; k + 1 < s.length; k++) if (s[k + 1] - s[k] < 100) errors.push(`${what} : deux lignes à moins de 100 mm (${Math.round(s[k])} et ${Math.round(s[k + 1])} mm)`);
  };
  inside(p.transverseX, p.x0, p.x1, 'Traverse');
  inside(p.longitudinalY, p.y0, p.y1, 'Lisse');
  if (!(p.middleFootX > p.x0 && p.middleFootX < p.x1)) errors.push('Réception centrale hors du grand côté');
  if (!(p.roofZ > p.floorZ + 1000)) errors.push('Hauteur de la toiture : au moins 1 000 mm au-dessus du plancher');
  if (!(p.topZ >= p.roofZ)) errors.push('Haut de la Viewbox (appui de la Viewbox du dessus) : pas plus bas que la toiture');
  const springs: Array<[number, string]> = [
    [p.springs.columnRotation, 'Raideur des angles poteau / cadre'],
    [p.springs.cornerLinkShear, 'Raideur des liaisons d’angle entre Viewbox empilées'],
    [p.springs.boltTranslation, 'Raideur des boulons entre Viewbox'],
    [p.springs.supportHorizontal, 'Raideur horizontale des appuis'],
  ];
  for (const [v, what] of springs) if (!(v > 0 && Number.isFinite(v))) errors.push(`${what} : valeur positive attendue`);
  const pw = p.plywood;
  if (!(pw.thickness > 0)) errors.push('Épaisseur du contreplaqué : valeur positive attendue');
  if (!(pw.floorLayers >= 1)) errors.push('Plancher : au moins une couche de contreplaqué');
  if (!(pw.maxSpan > 0)) errors.push('Portée du contreplaqué : valeur positive attendue');
  const grid = Math.min(maxSpacing(p.transverseX, p.x0, p.x1), maxSpacing(p.longitudinalY, p.y0, p.y1));
  if (pw.maxSpan > 0 && pw.maxSpan < grid - 100)
    warnings.push(`Portée du contreplaqué ${Math.round(pw.maxSpan)} mm, alors que les barres du plancher sont espacées jusqu’à ${Math.round(grid)} mm : à vérifier`);
  if (weighedN !== undefined && !(weighedN > 0)) errors.push('Poids d’une Viewbox : valeur positive attendue');
  return { errors, warnings };
}

const n0 = (v: number) => fmtNumber(v, 0);

/** Différences lisibles entre deux versions d'un type de Viewbox (trace dans les sources). */
export function templateChanges(before: ModuleTypeEntry, after: ModuleTypeEntry, library: readonly LibraryEntry[]): string[] {
  const a = before.params;
  const b = after.params;
  if (!a || !b) return [];
  const name = (k: string) => {
    const s = library.find((e): e is SectionEntry => e.kind === 'section' && e.key === k);
    return s ? designation(s.name) : k;
  };
  const out: string[] = [];
  for (const f of FAMILY_SLOTS) {
    const x = slotSection(a, f);
    const y = slotSection(b, f);
    if (x !== y) out.push(`${f.label.toLowerCase()} ${name(x)} → ${name(y)}`);
  }
  const list = (xs: readonly number[]) => xs.map(n0).join(' ; ');
  if (list(a.transverseX) !== list(b.transverseX)) out.push(`traverses x ${list(a.transverseX)} → ${list(b.transverseX)} mm`);
  if (list(a.longitudinalY) !== list(b.longitudinalY)) out.push(`lisses y ${list(a.longitudinalY)} → ${list(b.longitudinalY)} mm`);
  if (a.roofZ !== b.roofZ) out.push(`toiture z ${n0(a.roofZ)} → ${n0(b.roofZ)} mm`);
  if (a.topZ !== b.topZ) out.push(`haut z ${n0(a.topZ)} → ${n0(b.topZ)} mm`);
  const k = (v: number, u: (x: number) => number) => fmtNumber(u(v), 0);
  if (a.springs.columnRotation !== b.springs.columnRotation) out.push(`angles poteau / cadre ${k(a.springs.columnRotation, toUser.rotation)} → ${k(b.springs.columnRotation, toUser.rotation)} kNcm/deg`);
  if (a.springs.cornerLinkShear !== b.springs.cornerLinkShear) out.push(`liaisons d’angle ${k(a.springs.cornerLinkShear, toUser.stiffness)} → ${k(b.springs.cornerLinkShear, toUser.stiffness)} kN/cm`);
  if (a.springs.boltTranslation !== b.springs.boltTranslation) out.push(`boulons ${k(a.springs.boltTranslation, toUser.stiffness)} → ${k(b.springs.boltTranslation, toUser.stiffness)} kN/cm`);
  if (a.springs.supportHorizontal !== b.springs.supportHorizontal) out.push(`appuis horizontaux ${k(a.springs.supportHorizontal, toUser.stiffness)} → ${k(b.springs.supportHorizontal, toUser.stiffness)} kN/cm`);
  if (a.springs.supportVertical !== b.springs.supportVertical)
    out.push(`appuis verticaux ${a.springs.supportVertical ? `${k(a.springs.supportVertical, toUser.stiffness)} kN/cm` : 'rigides'} → ${b.springs.supportVertical ? `${k(b.springs.supportVertical, toUser.stiffness)} kN/cm` : 'rigides'}`);
  const pa = a.plywood;
  const pb = b.plywood;
  if (pa.floorLayers !== pb.floorLayers || pa.thickness !== pb.thickness || pa.material !== pb.material)
    out.push(`plancher ${pa.floorLayers} × ${n0(pa.thickness)} mm ${pa.material} → ${pb.floorLayers} × ${n0(pb.thickness)} mm ${pb.material}`);
  if (pa.maxSpan !== pb.maxSpan) out.push(`portée du contreplaqué ${n0(pa.maxSpan)} → ${n0(pb.maxSpan)} mm`);
  if ((before.weighedN ?? 0) !== (after.weighedN ?? 0)) out.push(`poids ${n0(toUser.kg(before.weighedN ?? 0))} → ${n0(toUser.kg(after.weighedN ?? 0))} kg`);
  return out;
}

/** Note de source d'un type de Viewbox modifié (reconnue par le rapport). */
export const MODIFIED_NOTE = 'modifié';

/**
 * Nouvelle version d'un type de Viewbox après modification : confirmée par la personne qui l'enregistre (« connue »),
 * chaque modification tracée dans les sources. `asNew` = copie sous une autre clé (l'original reste inchangé).
 */
export function editedModuleEntry(
  before: ModuleTypeEntry,
  edit: { params: ViewboxTemplateParams; weighedN?: number },
  ctx: { library: readonly LibraryEntry[]; who: string; date: string; asNew?: { name: string } },
): ModuleTypeEntry {
  const after: ModuleTypeEntry = { ...before, params: edit.params, weighedN: edit.weighedN ?? before.weighedN };
  const changes = templateChanges(before, after, ctx.library);
  const note = `${MODIFIED_NOTE} le ${ctx.date} par ${ctx.who}${changes.length ? ` : ${changes.join(' ; ')}` : ''}`;
  const out: ModuleTypeEntry = {
    ...after,
    status: 'known',
    template: before.template ?? 'viewbox-eu',
    source: [...before.source, { ref: 'user', note: ctx.asNew ? `copie de « ${before.name} » ${note}` : note }],
  };
  delete out.origin;
  delete out.id;
  delete out.confirmedAt;
  if (ctx.asNew) {
    out.name = ctx.asNew.name;
    out.key = `VIEWBOX-${slug(ctx.asNew.name)}`;
  }
  return out;
}

/** Type de Viewbox modifié par rapport aux notes de référence (dernière modification tracée). */
export function lastModification(e: Pick<ModuleTypeEntry, 'source'>): string | null {
  const s = [...e.source].reverse().find((x) => x.ref === 'user' && (x.note ?? '').includes(`${MODIFIED_NOTE} le `));
  return s?.note ?? null;
}

// ─── sections saisies ───

export type UserShape = 'RHS' | 'SHS' | 'CHS' | 'FLAT' | 'ROUND' | 'U_COLD' | 'C_COLD' | 'T' | 'UNP' | 'I';

export const USER_SHAPES: Array<{ shape: UserShape; label: string; dims: Array<'h' | 'b' | 't' | 'tw' | 'tf' | 'd' | 'r'>; computed: boolean }> = [
  { shape: 'RHS', label: 'Tube rectangulaire', dims: ['h', 'b', 't'], computed: true },
  { shape: 'SHS', label: 'Tube carré', dims: ['h', 't'], computed: true },
  { shape: 'CHS', label: 'Tube rond', dims: ['d', 't'], computed: true },
  { shape: 'FLAT', label: 'Plat', dims: ['b', 't'], computed: true },
  { shape: 'ROUND', label: 'Rond plein', dims: ['d'], computed: true },
  { shape: 'U_COLD', label: 'U plié à froid', dims: ['h', 'b', 't'], computed: true },
  { shape: 'C_COLD', label: 'C plié à froid (sans retours)', dims: ['h', 'b', 't'], computed: true },
  { shape: 'T', label: 'T soudé', dims: ['h', 'tw', 'b', 'tf'], computed: true },
  { shape: 'UNP', label: 'U laminé (UNP, UPE) — valeurs de la fiche', dims: ['h', 'b', 'tw', 'tf', 'r'], computed: false },
  { shape: 'I', label: 'I / H laminé (IPE, HEA, HEB) — valeurs de la fiche', dims: ['h', 'b', 'tw', 'tf', 'r'], computed: false },
];

export interface UserSectionInput {
  designation: string;
  shape: UserShape;
  /** tubes : fini à chaud ou formé à froid */
  hotFinished?: boolean;
  dims: Partial<Record<'h' | 'b' | 't' | 'tw' | 'tf' | 'd' | 'r', number>>;
  material: string;
  /** valeurs de la fiche (cm², cm⁴, cm³, kg/m) : obligatoires pour les profils laminés, contrôle sinon */
  values?: Partial<Record<'A' | 'Iy' | 'Iz' | 'Wely' | 'Welz' | 'Wply' | 'Wplz' | 'It' | 'kgPerM', number>>;
  curves?: { y?: BucklingCurve; z?: BucklingCurve };
  /** fiche du fournisseur, catalogue… */
  sourceNote?: string;
}

/** Courbes de flambement par défaut (EN 1993-1-1 tableau 6.2). */
export function defaultCurves(x: Pick<UserSectionInput, 'shape' | 'hotFinished' | 'dims'>): { y: BucklingCurve; z: BucklingCurve } {
  if (x.shape === 'RHS' || x.shape === 'SHS' || x.shape === 'CHS') return x.hotFinished ? { y: 'a', z: 'a' } : { y: 'c', z: 'c' };
  if (x.shape === 'I') {
    const h = x.dims.h ?? 0;
    const b = x.dims.b ?? 1;
    const tf = x.dims.tf ?? 0;
    if (h / b > 1.2) return tf <= 40 ? { y: 'a', z: 'b' } : { y: 'b', z: 'c' };
    return tf <= 100 ? { y: 'b', z: 'c' } : { y: 'd', z: 'd' };
  }
  return { y: 'c', z: 'c' };
}

/** Section saisie → entrée de bibliothèque « connue » (clé SEC-…) ; null + problèmes si elle est inutilisable. */
export function sectionFromUser(x: UserSectionInput, who: string, date: string): { entry: SectionEntry | null; problems: string[]; computed: boolean } {
  const shape: ExtractedSection['shape'] = x.shape === 'U_COLD' || x.shape === 'UNP' ? 'U' : x.shape === 'C_COLD' ? 'C' : x.shape;
  const fabrication: ExtractedSection['fabrication'] =
    x.shape === 'U_COLD' || x.shape === 'C_COLD' ? 'cold' : x.shape === 'T' ? 'welded' : x.shape === 'RHS' || x.shape === 'SHS' || x.shape === 'CHS' ? (x.hotFinished ? 'hot' : 'cold') : 'hot';
  const curves = { ...defaultCurves(x), ...(x.curves ?? {}) };
  const r = sectionFromExtract(
    {
      designation: x.designation.trim(),
      role: '',
      shape,
      fabrication,
      dims: x.dims,
      material: x.material,
      values: x.values ?? {},
      curves,
      page: '',
      quote: '',
      check: { verified: 'citation', missing: [] },
    },
    'user',
  );
  // sans valeur de fiche, un profil calculé depuis ses dimensions n'a rien à comparer : ce n'est pas un problème ici
  const problems = r.problems.filter((p) => !p.startsWith('aucune valeur imprimée') && !p.startsWith('nuance d’acier non lue'));
  if (!MATERIALS.some((m) => m.key === x.material)) problems.push(`matériau ${x.material} inconnu`);
  if (!x.designation.trim()) problems.push('désignation à saisir');
  if (!r.entry || !x.designation.trim()) return { entry: null, problems, computed: r.computed };
  const note = r.computed
    ? `saisi le ${date} par ${who} : propriétés calculées par l’outil depuis les dimensions${x.sourceNote ? ` (${x.sourceNote})` : ''}`
    : `saisi le ${date} par ${who} : valeurs de la fiche${x.sourceNote ? ` ${x.sourceNote}` : ''}`;
  const key = `SEC-${slug(x.designation)}`;
  const entry: SectionEntry = {
    ...r.entry,
    key,
    name: x.designation.trim(),
    status: 'known',
    material: x.material,
    section: { ...r.entry.section, key, name: x.designation.trim() },
    source: [{ ref: 'user', note }],
    notes: problems.length ? problems : undefined,
  };
  if (!entry.notes) delete entry.notes;
  return { entry, problems, computed: r.computed };
}
