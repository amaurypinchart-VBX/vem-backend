// Assemblage du modèle filaire de l'installation (§6) : le gabarit Viewbox est posé sur chaque module, puis les
// liaisons sont créées comme dans le modèle SCIA statico —
//   · Viewbox juxtaposées (côtés parallèles à ≤ 30 mm) : boulons horizontaux M20 (barres RD 20 sans masse, ressorts
//     50 kN/cm aux deux bouts sur les grands côtés, à un bout sur les petits) et contacts d'angle en compression seule ;
//   · Viewbox empilées : liaison d'angle (QRO 100 × 4 sans masse de la toiture du dessous au plancher du dessus,
//     raide en axial, ressorts 10 kN/cm en cisaillement) ;
//   · appuis des Viewbox au sol : aux angles (ou aux pieds sur vérins), ressorts horizontaux 50 kN/cm, vertical en
//     compression seule.
// Les côtés restés libres reçoivent le vent (intervalles exposés). Fonction pure ; repère monde Y vers le haut.
import type { EndSpec, FemMember, FemModel, FemNode, FemSupport, SupportDof, Vec3 } from './fem/types';
import type { ModuleFrame } from '../../core/views';
import type { LibraryEntry, ModuleTypeEntry, SectionEntry, ViewboxTemplateParams } from './library';
import { materialByKey, steelStrength } from './materials';
import type { RimExtras, Side, TemplateFace, TemplateFamily, ViewboxTemplate } from './templates/viewboxEU';
import { viewboxTemplate } from './templates/viewboxEU';
import type { StairFamily, StairKitParams } from './templates/stair';
import { stairGeometry } from './templates/stair';
import { fmtNumber, KN_PER_CM } from './units';

/** raideur horizontale des appuis des annexes SCIA Hoka / Qatar (calage statico) : 50 kN/cm */
const HOKA_SUPPORT_K = 50 * KN_PER_CM;

export interface PlacedModule {
  id: string;
  level: number;
  /** coin extérieur bas du module (monde, mm), axes unitaires en plan : u le long du grand côté, v le petit côté */
  origin: Vec3;
  u: Vec3;
  v: Vec3;
  params: ViewboxTemplateParams;
  templateKey: string;
}

export type MemberFamily = TemplateFamily | StairFamily | 'corner-link' | 'vertical-contact' | 'bolt' | 'contact' | 'bracing' | 'raise-column' | 'raise-bracing';

export interface MemberMeta {
  family: MemberFamily;
  module: string;
  /** barre physique (clé unique) et tronçon de flambement (entre deux attaches) */
  line: string;
  span: string;
  /** longueur du tronçon de flambement (mm) */
  spanLength: number;
  section: string;
  material: string;
  massless: boolean;
  label: string;
  /** côté du module (rives, boulons) */
  side?: Side;
  /** liaison d'angle entre Viewbox empilées : numéro d'angle de la Viewbox du dessus (0…3) */
  corner?: number;
}

/** Côtés voisins d'un angle du gabarit (angles 0…3 = (x0, y0), (x1, y0), (x1, y1), (x0, y1)) : grand côté, petit côté. */
export const CORNER_SIDES: Array<{ long: Side; short: Side }> = [
  { long: 'v0', short: 'u0' },
  { long: 'v0', short: 'u1' },
  { long: 'v1', short: 'u1' },
  { long: 'v1', short: 'u0' },
];

export interface FaceInfo {
  module: string;
  side: Side;
  /** normale sortante (monde, plan) */
  normal: Vec3;
  /** longueur et intervalles exposés au vent le long du côté (mm depuis le premier angle) */
  length: number;
  exposed: Array<[number, number]>;
  /** altitude du haut du module (mm, monde) */
  top: number;
}

export interface EdgeLoadTarget {
  member: number;
  /** abscisse le long de la ligne (mm, repère local du module) des deux nœuds de la barre */
  s0: number;
  s1: number;
}

export interface AssembleOptions {
  sections: ReadonlyMap<string, SectionEntry>;
  /** pieds à vérin utilisés : appuis aux nœuds des réceptions de pied au lieu des angles, pieds centraux compris (6 par Viewbox) */
  jacks: boolean;
  /** pieds centraux des grands côtés calés (appuis supplémentaires ; toujours avec les vérins) */
  middleFeet: boolean;
  /** appui soulevé : libérer aussi les ressorts horizontaux (prudent) ou seulement le vertical (comme SCIA) */
  upliftReleases: 'all' | 'vertical';
  /** calage statico : nuances et courbes de flambement de l'annexe SCIA (S275, courbes a) */
  calibration: boolean;
  /**
   * contacts (angles voisins, Viewbox empilées) : 'truss' = compression seule sans cisaillement (défaut, comme les
   * « Druckkontakt » de l'annexe SCIA, de type « Zentrische Normalkraft ») ; 'beam' = barre encastrée (variante)
   */
  contactModel?: 'truss' | 'beam';
  /** boulons de toiture entre deux Viewbox qui portent chacune une Viewbox (défaut : non, comme statico) */
  roofBoltsUnderStack?: boolean;
  gapTolerance?: number;
  /** contreventements ajoutés par l'étude : croix en plat + ridoir dans le plan d'un côté de Viewbox (traction seule) */
  bracings?: BracingSpec[];
  /** surélévation : un poteau sous chaque appui des Viewbox posées au sol */
  raise?: RaiseSpec | null;
  /** escaliers extérieurs (kit avec palier) attachés à un côté de Viewbox */
  stairs?: PlacedStair[];
}

/** Escalier du modèle placé contre une Viewbox (scene/studyModel). */
export interface PlacedStair {
  id: string;
  /** nom de l'objet SketchUp */
  label: string;
  kit: StairKitParams;
  /** Viewbox et côté portant le palier ; rive du plancher (Viewbox du dessus) ou de la toiture (Viewbox du dessous) */
  module: string;
  side: Side;
  level: 'floor' | 'roof';
  /** sens de la volée (monde, horizontal unitaire) : du palier vers le pied */
  run: Vec3;
  /** abscisse le long de `run` (monde, mm) du bout du palier opposé à la volée */
  landingEnd: number;
  /** longueur de la volée en plan mesurée sur le modèle (mm) ; absente = pente du kit */
  flight?: number;
}

/** Escalier assemblé : barres et appuis dans le modèle, pour les charges et les vérifications. */
export interface StairModel {
  id: string;
  label: string;
  kit: StairKitParams;
  /** barres recevant marches / platelage (largeur d'influence en plan, mm) */
  bars: Array<{ member: number; width: number; region: 'flight' | 'landing' }>;
  railing: number[];
  wind: number[];
  /** accroches des limons (barre de prolongement, rotule au nœud i), attaches palier ↔ Viewbox */
  hooks: number[];
  links: number[];
  /** appuis (indices dans fem.supports) */
  supports: number[];
  areas: { flight: number; landing: number };
  rise: number;
  /** cote du sol sous l'escalier (monde, mm) */
  groundY: number;
}

export interface BracingSpec {
  module: string;
  side: Side;
  /** section du plat (défaut FLA60/6, assemblage VBX-BRACING) */
  section?: string;
}

export interface RaiseSpec {
  /** hauteur ajoutée sous les appuis (mm) */
  height: number;
  /** section des poteaux (clé de la bibliothèque ou section créée par l'étude) */
  section: string;
  /** liaison en tête avec la Viewbox : encastrée ou articulée ; pied toujours articulé (posé sur calage) */
  top: 'rigid' | 'pinned';
  /** croix de contreventement entre les poteaux, dans le plan de chaque côté des Viewbox au sol */
  bracing: boolean;
  braceSection?: string;
}

export interface StructuralModel {
  fem: FemModel;
  meta: MemberMeta[];
  modules: PlacedModule[];
  /** nœud FEM de chaque nœud du gabarit : `${module}|${clé}` */
  nodeOf: Map<string, number>;
  /** lignes de barres dans le repère du module, pour répartir les charges : `${module}|${z}|${u|v}=${c}` */
  lines: Map<string, EdgeLoadTarget[]>;
  faces: FaceInfo[];
  /** appuis : Viewbox et angle */
  supportMeta: Array<{ module: string; corner: number; kind: 'corner' | 'foot' | 'middle' | 'stair'; jack: boolean; label?: string }>;
  /** escaliers extérieurs du modèle */
  stairs: StairModel[];
  /** modules sans rien au-dessus (toiture exposée, dernier niveau évacué) */
  topModules: Set<string>;
  /** côtés extérieurs (libres sur au moins la moitié de leur longueur) de chaque Viewbox : plats d'empilement posables */
  outerSides: Map<string, Record<Side, boolean>>;
  baseY: number;
  topY: number;
  warnings: string[];
  errors: string[];
}

/** Sections actives de la bibliothèque, par clé. */
export function sectionMap(library: readonly LibraryEntry[]): Map<string, SectionEntry> {
  return new Map(library.filter((e): e is SectionEntry => e.kind === 'section' && !e.disabled).map((e) => [e.key, e]));
}

/**
 * Viewbox du modèle → module placé : origine au coin bas de sa boîte (pieds exclus), u le long du grand côté.
 * Refuse (null + raison) une Viewbox dont les dimensions ne sont pas celles du gabarit (± 50 mm).
 */
export function placeFromFrame(f: ModuleFrame, level: number, entry: ModuleTypeEntry): { module: PlacedModule | null; reason?: string } {
  if (!entry.params) return { module: null, reason: `${f.moduleId} : ${entry.name} sans gabarit de calcul (données de structure inconnues).` };
  const size = [f.max[0] - f.min[0], f.max[1] - f.min[1], f.max[2] - f.min[2]];
  const [long, short] = f.longAxis === 'x' ? [size[0], size[1]] : [size[1], size[0]];
  if (Math.abs(long - entry.nominal.long) > 50 || Math.abs(short - entry.nominal.short) > 50)
    return { module: null, reason: `${f.moduleId} : ${Math.round(long)} × ${Math.round(short)} mm, gabarit ${entry.nominal.long} × ${entry.nominal.short} mm.` };
  const origin = add(add(add(f.origin, mul(f.xAxis, f.min[0])), mul(f.yAxis, f.min[1])), mul(f.up, f.min[2]));
  const [u, v] = f.longAxis === 'x' ? [f.xAxis, f.yAxis] : [f.yAxis, f.xAxis];
  return { module: { id: f.moduleId, level, origin, u, v, params: entry.params, templateKey: entry.key } };
}

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const planDist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const SIDES: Side[] = ['u0', 'u1', 'v0', 'v1'];
export const SIDE_NAME: Record<Side, string> = { v0: 'grand côté 1', v1: 'grand côté 2', u0: 'petit côté 1', u1: 'petit côté 2' };

export const FAMILY_LABEL: Record<MemberFamily, string> = {
  'rim-floor': 'rive plancher',
  'rim-roof': 'rive toiture',
  'secondary-floor': 'traverse / lisse plancher',
  'secondary-roof': 'traverse / lisse toiture',
  column: 'poteau',
  'foot-corner': 'réception de pied',
  'foot-plate': 'plat de réception',
  'foot-middle': 'réception centrale',
  'corner-link': 'liaison verticale d’angle',
  'vertical-contact': 'contact vertical',
  bolt: 'boulon horizontal',
  contact: 'contact d’angle',
  bracing: 'contreventement ajouté',
  'raise-column': 'poteau de surélévation',
  'raise-bracing': 'contreventement de surélévation',
  'stair-stringer': 'limon d’escalier',
  'stair-landing': 'cadre de palier',
  'stair-post': 'montant d’escalier',
  'stair-head': 'attache de montant de palier',
  'stair-step': 'marche (barre équivalente)',
  'stair-link': 'attache du palier à la Viewbox',
};

/**
 * Viewbox empilées : le plancher de celle du dessus est posé sur le haut de celle du dessous (topZ du gabarit). Un écart
 * de modélisation jusqu'à 400 mm est corrigé, avec un avertissement au-delà de 20 mm.
 */
export function snapStacks(modules: PlacedModule[], gapTol: number, warnings: string[]): PlacedModule[] {
  const out = modules.map((m) => ({ ...m, origin: [...m.origin] as Vec3 }));
  const plan = (pm: PlacedModule) => {
    const { x0, x1, y0, y1 } = pm.params;
    return [
      [x0, y0],
      [x1, y0],
      [x1, y1],
      [x0, y1],
    ].map(([u, v]) => add(add(pm.origin, mul(pm.u, u)), mul(pm.v, v)));
  };
  for (const U of [...out].sort((a, b) => a.level - b.level)) {
    if (U.level === 0) continue;
    const cu = plan(U);
    let best: PlacedModule | null = null;
    for (const L of out) {
      if (L === U || L.level >= U.level) continue;
      const cl = plan(L);
      const shared = cu.filter((c) => cl.some((l) => planDist(c, l) <= gapTol + 10)).length;
      if (shared >= 2 && (!best || L.origin[1] > best.origin[1])) best = L;
    }
    if (!best) continue;
    const target = best.origin[1] + best.params.topZ;
    const diff = U.origin[1] - target;
    if (Math.abs(diff) > 400) continue;
    if (Math.abs(diff) > 20) warnings.push(`${U.id} : posée ${Math.round(Math.abs(diff))} mm ${diff < 0 ? 'plus bas' : 'plus haut'} que le haut de ${best.id} dans le modèle (gabarit ${best.params.topZ} mm) — replacée sur ${best.id}.`);
    U.origin[1] = target;
  }
  return out;
}

export function assembleStructure(input: PlacedModule[], opt: AssembleOptions): StructuralModel {
  const gapTol = opt.gapTolerance ?? 30;
  const earlyWarnings: string[] = [];
  const modules = snapStacks(input, gapTol, earlyWarnings);
  // contacts : barres articulées (effort normal seul, défaut, comme SCIA) ou barres encastrées (variante)
  const contactKind = (opt.contactModel ?? 'truss') === 'truss' ? ('truss' as const) : ('beam' as const);
  const warnings: string[] = [...earlyWarnings];
  const errors: string[] = [];
  const nodes: FemNode[] = [];
  const members: FemMember[] = [];
  const meta: Array<Omit<MemberMeta, 'span' | 'spanLength'>> = [];
  const supports: FemSupport[] = [];
  const supportMeta: StructuralModel['supportMeta'] = [];
  const nodeOf = new Map<string, number>();
  const lines = new Map<string, EdgeLoadTarget[]>();
  const up: Vec3 = [0, 1, 0];

  const sectionProps = (key: string) => {
    const s = opt.sections.get(key);
    if (!s) throw new Error(`Section ${key} absente de la bibliothèque`);
    const matKey = opt.calibration && s.calibrationMaterial ? s.calibrationMaterial : s.material;
    const mat = materialByKey(matKey);
    if (!mat) throw new Error(`Matériau ${matKey} inconnu`);
    return { s, mat, matKey };
  };
  const addMember = (
    i: number,
    j: number,
    sectionKey: string,
    m: Omit<MemberMeta, 'span' | 'spanLength' | 'section' | 'material' | 'massless' | 'label'> & { label?: string },
    extra: Partial<FemMember> = {},
  ) => {
    const { s, mat, matKey } = sectionProps(sectionKey);
    members.push({ id: `B${members.length + 1}`, i, j, E: mat.E, G: mat.G, A: s.section.A, Iy: s.section.Iy, Iz: s.section.Iz, It: s.section.It, tag: m.family, ...extra });
    meta.push({
      ...m,
      section: sectionKey,
      material: matKey,
      massless: !!s.section.massless || mat.rho === 0,
      label: m.label ?? `${m.module} · ${FAMILY_LABEL[m.family]}`,
    });
    return members.length - 1;
  };

  const worldOf = (pm: PlacedModule, u: number, v: number, z: number): Vec3 => add(add(add(pm.origin, mul(pm.u, u)), mul(pm.v, v)), mul(up, z));

  // ─── côtés de chaque Viewbox en plan (avant les gabarits : une jonction en T ajoute des nœuds de rive) ───
  interface FaceGeo {
    pm: PlacedModule;
    side: Side;
    /** premier angle (monde), direction le long du côté et normale sortante (plan) */
    a: Vec3;
    dir: Vec3;
    normal: Vec3;
    length: number;
    /** abscisse locale du premier angle le long de la rive */
    offset: number;
    face?: TemplateFace;
    covered: Array<[number, number]>;
  }
  const faceGeo: FaceGeo[] = [];
  for (const pm of modules) {
    const { x0, x1, y0, y1 } = pm.params;
    const ends: Record<Side, [[number, number], [number, number]]> = {
      u0: [
        [x0, y0],
        [x0, y1],
      ],
      u1: [
        [x1, y0],
        [x1, y1],
      ],
      v0: [
        [x0, y0],
        [x1, y0],
      ],
      v1: [
        [x0, y1],
        [x1, y1],
      ],
    };
    for (const side of SIDES) {
      const [[ua, va], [ub, vb]] = ends[side];
      const a = worldOf(pm, ua, va, 0);
      const b = worldOf(pm, ub, vb, 0);
      const length = planDist(a, b);
      const dir: Vec3 = [(b[0] - a[0]) / length, 0, (b[2] - a[2]) / length];
      const normal = side === 'u0' ? mul(pm.u, -1) : side === 'u1' ? pm.u : side === 'v0' ? mul(pm.v, -1) : pm.v;
      faceGeo.push({ pm, side, a, dir, normal, length, offset: side === 'v0' || side === 'v1' ? x0 : y0, covered: [] });
    }
  }
  const sameLevel = (A: PlacedModule, B: PlacedModule) => Math.abs(A.origin[1] - B.origin[1]) < 50;
  // Viewbox portant une autre Viewbox (au moins un angle du plancher du dessus sur un angle de sa toiture)
  const cornersOf = (pm: PlacedModule, z: number) => {
    const { x0, x1, y0, y1 } = pm.params;
    return [
      [x0, y0],
      [x1, y0],
      [x1, y1],
      [x0, y1],
    ].map(([u, v]) => worldOf(pm, u, v, z));
  };
  // (chaque angle du dessus sur l'angle de toiture le plus proche, comme les liaisons d'angle)
  const covered = new Set<PlacedModule>();
  for (const U of modules)
    for (const c of cornersOf(U, U.params.floorZ)) {
      let best: PlacedModule | null = null;
      let bd = Infinity;
      for (const L of modules) {
        if (L === U) continue;
        for (const l of cornersOf(L, L.params.roofZ)) {
          const d = planDist(c, l);
          if (c[1] - l[1] > 150 && c[1] - l[1] < 450 && d <= gapTol + 10 && d < bd) [best, bd] = [L, d];
        }
      }
      if (best) covered.add(best);
    }
  const along = (f: FaceGeo, p: Vec3) => dot([p[0] - f.a[0], 0, p[2] - f.a[2]], f.dir);
  const at = (f: FaceGeo, s: number): Vec3 => add(f.a, mul(f.dir, s));
  const pairs: Array<[FaceGeo, FaceGeo]> = [];
  const extras = new Map<PlacedModule, RimExtras>();
  const addExtra = (f: FaceGeo, s: number) => {
    if (s <= 20 || s >= f.length - 20) return;
    const e = extras.get(f.pm) ?? {};
    (e[f.side] ??= []).push(Math.round(f.offset + s));
    extras.set(f.pm, e);
  };
  for (let x = 0; x < faceGeo.length; x++)
    for (let y = x + 1; y < faceGeo.length; y++) {
      const A = faceGeo[x];
      const B = faceGeo[y];
      if (A.pm === B.pm || !sameLevel(A.pm, B.pm)) continue;
      if (dot(A.normal, B.normal) > -0.99) continue;
      const gap = dot([B.a[0] - A.a[0], 0, B.a[2] - A.a[2]], A.normal);
      if (gap < -1 || gap > gapTol) continue;
      // recouvrement le long des deux côtés
      const sB0 = along(A, B.a);
      const sB1 = along(A, at(B, B.length));
      const lo = Math.max(0, Math.min(sB0, sB1));
      const hi = Math.min(A.length, Math.max(sB0, sB1));
      if (hi - lo < 100) continue;
      A.covered.push([lo, hi]);
      const aB0 = along(B, A.a);
      const aB1 = along(B, at(A, A.length));
      B.covered.push([Math.max(0, Math.min(aB0, aB1)), Math.min(B.length, Math.max(aB0, aB1))]);
      pairs.push([A, B]);
      // angle d'une Viewbox contre le milieu du côté de l'autre (jonction en T) : nœud de contact sur la rive
      for (const [F, G] of [
        [A, B],
        [B, A],
      ] as const)
        for (const s0 of [0, F.length]) {
          const sG = along(G, at(F, s0));
          if (sG > -1 && sG < G.length + 1) addExtra(G, sG);
        }
    }

  // ─── escaliers : perçages d'attache du palier sur le côté de la Viewbox (nœuds de rive ajoutés si besoin) ───
  const stairAttach = new Map<PlacedStair, { f: FaceGeo; s: [number, number] }>();
  for (const st of opt.stairs ?? []) {
    const f = faceGeo.find((x) => x.pm.id === st.module && x.side === st.side);
    if (!f) {
      errors.push(`${st.label} : Viewbox ${st.module} absente du modèle — escalier non calculé.`);
      continue;
    }
    const p = f.pm.params;
    const long = f.side === 'v0' || f.side === 'v1';
    const drill = (long ? p.boltLongX : p.boltShortY).map((x) => x - f.offset);
    const sign = Math.sign(dot(f.dir, st.run)) || 1;
    // abscisses le long du côté : premier perçage à ≈ 300 mm du bout du palier, second à l'écart du kit
    const s1Target = (st.landingEnd + 303 - dot(f.a, st.run)) * sign;
    const D = st.kit.boltSpacing;
    let pair: [number, number] | null = null;
    for (const a of drill)
      for (const b of drill)
        if (Math.abs((b - a) * sign - D) <= 50 && Math.abs(a - s1Target) <= 600 && (!pair || Math.abs(a - s1Target) < Math.abs(pair[0] - s1Target))) pair = [a, b];
    if (!pair) {
      pair = [s1Target, s1Target + sign * D];
      if (pair.some((s) => s < 0 || s > f.length)) {
        errors.push(`${st.label} : palier hors du côté de ${st.module} — escalier non calculé.`);
        continue;
      }
      warnings.push(`${st.label} : aucun perçage de ${st.module} en face du palier — attaches placées à ${fmtNumber(pair[0] / 1e3, 2)} et ${fmtNumber(pair[1] / 1e3, 2)} m du coin (perçages à faire sur site).`);
      for (const s of pair) addExtra(f, s);
    }
    stairAttach.set(st, { f, s: pair });
  }

  // ─── gabarit posé sur chaque Viewbox ───
  const tplCache = new Map<string, ViewboxTemplate>();
  const tplOf = new Map<PlacedModule, ViewboxTemplate>();
  for (const pm of modules) {
    const ex = extras.get(pm) ?? {};
    const key = `${pm.templateKey}|${SIDES.map((sd) => [...new Set(ex[sd] ?? [])].sort((a, b) => a - b).join(',')).join('|')}`;
    let tpl = tplCache.get(key);
    if (!tpl) tplCache.set(key, (tpl = viewboxTemplate(pm.params, ex)));
    tplOf.set(pm, tpl);
    for (const n of tpl.nodes) {
      const [x, y, z] = worldOf(pm, n.u, n.v, n.z);
      nodes.push({ id: `${pm.id}:${n.key}`, x, y, z });
      nodeOf.set(`${pm.id}|${n.key}`, nodes.length - 1);
    }
    const tn = new Map(tpl.nodes.map((n) => [n.key, n]));
    for (const tm of tpl.members) {
      const a = tn.get(tm.i)!;
      const b = tn.get(tm.j)!;
      const vertical = Math.abs(a.z - b.z) > 1;
      const idx = addMember(
        nodeOf.get(`${pm.id}|${tm.i}`)!,
        nodeOf.get(`${pm.id}|${tm.j}`)!,
        tm.section,
        { family: tm.family, module: pm.id, line: `${pm.id}/${tm.line}`, side: /^(floor|roof):(u0|u1|v0|v1)$/.test(tm.line) ? (tm.line.split(':')[1] as Side) : undefined },
        { endI: tm.endI, endJ: tm.endJ, ref: vertical ? pm.u : undefined },
      );
      // lignes horizontales pour la répartition des charges
      if (!vertical) {
        if (Math.abs(a.v - b.v) < 0.5) {
          const k = `${pm.id}|${Math.round(a.z)}|v=${Math.round(a.v)}`;
          if (!lines.has(k)) lines.set(k, []);
          lines.get(k)!.push({ member: idx, s0: a.u, s1: b.u });
        } else if (Math.abs(a.u - b.u) < 0.5) {
          const k = `${pm.id}|${Math.round(a.z)}|u=${Math.round(a.u)}`;
          if (!lines.has(k)) lines.set(k, []);
          lines.get(k)!.push({ member: idx, s0: a.v, s1: b.v });
        }
      }
    }
  }
  for (const f of faceGeo) f.face = tplOf.get(f.pm)!.faces.find((x) => x.side === f.side)!;
  const P = (pm: PlacedModule, key: string) => nodeOf.get(`${pm.id}|${key}`)!;
  const pos = (i: number): Vec3 => [nodes[i].x, nodes[i].y, nodes[i].z];

  // ─── Viewbox juxtaposées : boulons alignés, contacts aux angles ───
  // boulon : barre encastrée côté i (console, comme les demi-boulons SCIA), ressorts en translation et rotations libres
  // côté j. Libérer les rotations aux deux bouts ferait une bielle sans aucune raideur en cisaillement.
  const boltEnd = (k: number): EndSpec => [k, k, k, 'free', 'free', 'free'];
  for (const [A, B] of pairs) {
    const fa = A.face!;
    const fb = B.face!;
    const long = A.side === 'v0' || A.side === 'v1';
    const k = A.pm.params.springs.boltTranslation;
    let bolts = 0;
    for (const ba of fa.bolts)
      for (const bb of fb.bolts)
        for (const lvl of ['floor', 'roof'] as const) {
          // statico : pas de boulons en toiture entre deux Viewbox qui en portent une autre (inaccessibles)
          if (lvl === 'roof' && !opt.roofBoltsUnderStack && covered.has(A.pm) && covered.has(B.pm)) continue;
          const na = P(A.pm, ba[lvl]);
          const nb = P(B.pm, bb[lvl]);
          if (planDist(pos(na), pos(nb)) > gapTol + 10 || Math.abs(pos(na)[1] - pos(nb)[1]) > 20) continue;
          // grands côtés : deux demi-boulons à ressort k en série (SCIA) → k / 2 ; petits côtés : un boulon, un ressort k
          addMember(na, nb, A.pm.params.sections.bolt, { family: 'bolt', module: A.pm.id, line: `bolt:${A.pm.id}/${B.pm.id}/${bolts}`, side: A.side, label: `boulon ${A.pm.id} / ${B.pm.id} · ${lvl === 'floor' ? 'plancher' : 'toiture'}, ${long ? 'x' : 'y'} = ${fmtNumber((ba.s + (long ? A.pm.params.x0 : A.pm.params.y0)) / 1e3, 2)} m` }, { endJ: boltEnd(long ? k / 2 : k), geometric: false });
          bolts++;
        }
    // contacts (SCIA Druckkontakt_horizontal) : de chaque angle au nœud en regard de l'autre rive, compression seule
    for (const lvl of ['floor', 'roof'] as const) {
      const rim = (f: TemplateFace, pm: PlacedModule) => (lvl === 'floor' ? f.rimFloor : f.rimRoof).map((key) => P(pm, key));
      const corners = (f: TemplateFace, pm: PlacedModule) => (lvl === 'floor' ? f.cornersFloor : f.cornersRoof).map((key) => P(pm, key));
      const done = new Set<string>();
      const link = (na: number, candidates: number[], flip: boolean) => {
        let nb = -1;
        let d = Infinity;
        for (const c of candidates) {
          const dc = planDist(pos(na), pos(c));
          if (dc < d && Math.abs(pos(na)[1] - pos(c)[1]) <= 20) [nb, d] = [c, dc];
        }
        if (nb < 0 || d > gapTol + 10 || d < 0.5) return;
        const [i, j] = flip ? [nb, na] : [na, nb];
        if (done.has(`${i}:${j}`)) return;
        done.add(`${i}:${j}`);
        addMember(i, j, A.pm.params.sections.contact, { family: 'contact', module: A.pm.id, line: `contact:${A.pm.id}/${B.pm.id}/${i}`, label: `contact ${A.pm.id} / ${B.pm.id}` }, { kind: contactKind, nonlinear: 'compressionOnly', geometric: false });
      };
      for (const na of corners(fa, A.pm)) link(na, rim(fb, B.pm), false);
      for (const nb of corners(fb, B.pm)) link(nb, rim(fa, A.pm), true);
    }
    if (!bolts) warnings.push(`Aucune liaison horizontale entre ${A.pm.id} et ${B.pm.id} (perçages non alignés) : Viewbox reliées par contact seulement.`);
  }

  // ─── contreventements ajoutés : deux diagonales tendues dans le plan du côté (plancher ↔ toiture) ───
  for (const b of opt.bracings ?? []) {
    const pm = modules.find((m) => m.id === b.module);
    if (!pm) {
      warnings.push(`Contreventement sur ${b.module} : Viewbox absente du modèle, ignoré.`);
      continue;
    }
    const face = tplOf.get(pm)!.faces.find((f) => f.side === b.side)!;
    const [c1, c2] = face.cornersFloor.map((k) => P(pm, k));
    const [r1, r2] = face.cornersRoof.map((k) => P(pm, k));
    const sec = b.section ?? 'FLA60/6';
    for (const [i, j, t] of [
      [c1, r2, 1],
      [c2, r1, 2],
    ] as const)
      addMember(i, j, sec, { family: 'bracing', module: pm.id, line: `brace:${pm.id}/${b.side}/${t}`, side: b.side, label: `${pm.id} · contreventement ${SIDE_NAME[b.side]}, diagonale ${t}` }, { kind: 'truss', nonlinear: 'tensionOnly', geometric: false });
  }

  // ─── Viewbox empilées : liaison d'angle de la toiture du dessous au plancher du dessus ───
  const topModules = new Set(modules.map((m) => m.id));
  for (const U of modules) {
    if (U.level === 0) continue;
    const tplU = tplOf.get(U)!;
    tplU.cornerFloor.forEach((ck, c) => {
      const nu = P(U, ck);
      let best: { L: PlacedModule; n: number; d: number } | null = null;
      for (const L of modules) {
        if (L === U) continue;
        const tplL = tplOf.get(L)!;
        for (const rk of tplL.cornerRoof) {
          const nl = P(L, rk);
          const dz = pos(nu)[1] - pos(nl)[1];
          const d = planDist(pos(nu), pos(nl));
          if (dz < 150 || dz > 450 || d > gapTol + 10) continue;
          if (!best || d < best.d) best = { L, n: nl, d };
        }
      }
      if (!best) {
        errors.push(`${U.id} : aucun angle de Viewbox sous son angle ${c + 1} (empilement décalé ou appui non modélisé).`);
        return;
      }
      topModules.delete(best.L.id);
      const sh = U.params.springs.cornerLinkShear;
      addMember(best.n, nu, U.params.sections.cornerLink, { family: 'corner-link', module: U.id, line: `link:${U.id}/${c}`, corner: c, label: `${best.L.id} / ${U.id} · liaison d’angle ${c + 1}` }, {
        ref: U.u,
        endJ: ['rigid', sh, sh, 'free', 'free', 'free'],
      });
    });
    // pas de contacts verticaux le long des rives entre Viewbox empilées (statico Qatar : les efforts passent par
    // les angles) ; les nœuds `contacts` du gabarit servent aux terrasses posées sur les toitures
  }

  // ─── appuis des Viewbox posées au sol (surélévation : poteau sous chaque appui, pied articulé sur le calage) ───
  const raise = opt.raise && opt.raise.height > 0 ? opt.raise : null;
  for (const pm of modules) {
    if (pm.level !== 0) continue;
    const tpl = tplOf.get(pm)!;
    // calage statico : appuis de l'annexe SCIA Hoka / Qatar (50 kN/cm horizontalement, rigides verticalement) ;
    // sinon ceux du gabarit (Viewbox 5900 : statico 18-0573, 100 kN/cm en X / Y, 1 000 kN/cm en Z)
    const kh = opt.calibration ? HOKA_SUPPORT_K : pm.params.springs.supportHorizontal;
    const kv: SupportDof = opt.calibration ? 'fixed' : (pm.params.springs.supportVertical ?? 'fixed');
    const posts = new Map<number, number>();
    const place = (key: string, corner: number, kind: 'corner' | 'foot' | 'middle') => {
      let node = P(pm, key);
      if (raise) {
        const top = node;
        nodes.push({ id: `${pm.id}:raise:${key}`, x: nodes[top].x, y: nodes[top].y - raise.height, z: nodes[top].z });
        node = nodes.length - 1;
        const pinned: EndSpec = ['rigid', 'rigid', 'rigid', 'rigid', 'free', 'free'];
        addMember(node, top, raise.section, { family: 'raise-column', module: pm.id, line: `raise:${pm.id}/${corner}`, label: `${pm.id} · poteau de surélévation ${kind === 'middle' ? `central ${corner - 3}` : `d’angle ${corner + 1}`}` }, {
          ref: pm.u,
          endI: pinned,
          endJ: raise.top === 'pinned' ? pinned : undefined,
        });
        posts.set(corner, node);
      }
      supports.push({ node, dofs: [kh, kv, kh, 'free', 'free', 'free'], compressionOnly: true, upliftReleases: opt.upliftReleases });
      supportMeta.push({ module: pm.id, corner, kind, jack: opt.jacks && !raise });
    };
    (opt.jacks ? tpl.footNodes : tpl.cornerFloor).forEach((k, c) => place(k, c, opt.jacks ? 'foot' : 'corner'));
    if (opt.middleFeet || opt.jacks) tpl.middleFeet.forEach((k, c) => place(k, 4 + c, 'middle'));
    // croix entre les pieds des poteaux et la tête des poteaux voisins, dans le plan de chaque côté (angles 1-2, 2-3, 3-4, 4-1)
    if (raise?.bracing)
      for (let c = 0; c < 4; c++) {
        const a = posts.get(c);
        const b = posts.get((c + 1) % 4);
        if (a === undefined || b === undefined) continue;
        const topOf = (k: number) => members.find((m, x) => meta[x].family === 'raise-column' && m.i === k)!.j;
        for (const [i, j, t] of [
          [a, topOf(b), 1],
          [b, topOf(a), 2],
        ] as const)
          addMember(i, j, raise.braceSection ?? 'FLA60/6', { family: 'raise-bracing', module: pm.id, line: `raise-brace:${pm.id}/${c}/${t}`, label: `${pm.id} · croix de surélévation ${c + 1}–${((c + 1) % 4) + 1}, diagonale ${t}` }, { kind: 'truss', nonlinear: 'tensionOnly', geometric: false });
      }
  }
  if (!supports.length) errors.push('Aucune Viewbox posée au sol : le modèle n’a pas d’appui.');

  // ─── escaliers extérieurs ───
  // sol : sous les Viewbox posées au sol (surélévation : au pied des poteaux)
  const ground = Math.min(...modules.filter((m) => m.level === 0).map((m) => m.origin[1]), Infinity) - (raise?.height ?? 0);
  const stairs: StairModel[] = [];
  for (const st of opt.stairs ?? []) {
    const att = stairAttach.get(st);
    if (!att || !Number.isFinite(ground)) continue;
    const { f, s: pair } = att;
    const pm = f.pm;
    const rimKeys = st.level === 'floor' ? f.face!.rimFloor : f.face!.rimRoof;
    const rimNode = (s: number) => {
      const target = at(f, s);
      let best = -1;
      let bd = Infinity;
      for (const k of rimKeys) {
        const n = P(pm, k);
        const d = planDist(pos(n), target);
        if (d < bd) [best, bd] = [n, d];
      }
      return bd <= 5 ? best : -1;
    };
    const H = pm.origin[1] + (st.level === 'floor' ? pm.params.floorZ : pm.params.topZ);
    const rise = H - ground;
    const o = at(f, pair[0]);
    const out = f.normal;
    const geo = stairGeometry(st.kit, st.id, [o[0], H, o[2]], st.run, out, rise, st.flight);
    const local = new Map<string, number>();
    for (const n of geo.nodes) {
      nodes.push({ id: n.key, x: n.p[0], y: n.p[1], z: n.p[2] });
      local.set(n.key, nodes.length - 1);
    }
    const idx = geo.members.map((m) =>
      addMember(local.get(m.i)!, local.get(m.j)!, m.section, { family: m.family, module: st.id, line: m.line, label: m.label }, { endI: m.endI, endJ: m.endJ, ref: m.vertical ? st.run : undefined, geometric: m.family !== 'stair-step' }),
    );
    // attaches du palier : effort normal et effort tranchant horizontal, vertical et rotations libres (SCIA Ersatz_Anbindung)
    const links: number[] = [];
    geo.links.forEach((l, k) => {
      const rn = rimNode(pair[k]);
      if (rn < 0) {
        errors.push(`${st.label} : nœud d'attache introuvable sur la rive de ${pm.id}.`);
        return;
      }
      links.push(addMember(local.get(l.node)!, rn, st.kit.sections.link, { family: 'stair-link', module: st.id, line: `${st.id}/link:${k + 1}`, label: `${st.id} / ${pm.id} · attache du palier ${k + 1}` }, { endJ: ['rigid', 'rigid', 'free', 'free', 'free', 'free'], geometric: false }));
    });
    const across = Math.abs(out[0]) > 0.99 ? 0 : Math.abs(out[2]) > 0.99 ? 2 : -1;
    if (across < 0) {
      errors.push(`${st.label} : escalier non parallèle aux axes du modèle — non calculé.`);
      continue;
    }
    const sup: number[] = [];
    geo.supports.forEach((sp, k) => {
      const dofs: FemSupport['dofs'] = sp.kind === 'post' ? ['fixed', 'fixed', 'fixed', 'free', 'free', 'free'] : across === 0 ? ['fixed', 'fixed', 'free', 'free', 'free', 'free'] : ['free', 'fixed', 'fixed', 'free', 'free', 'free'];
      supports.push({ node: local.get(sp.node)!, dofs, compressionOnly: true, upliftReleases: 'vertical' });
      supportMeta.push({ module: st.id, corner: k, kind: 'stair', jack: false, label: sp.label });
      sup.push(supports.length - 1);
    });
    stairs.push({
      id: st.id,
      label: st.label,
      kit: st.kit,
      bars: geo.bars.map((b) => ({ member: idx[b.index], width: b.width, region: b.region })),
      railing: geo.railingMembers.map((k) => idx[k]),
      wind: geo.windMembers.map((k) => idx[k]),
      hooks: geo.members.map((m, k) => (m.line.includes('/landing:ext:') ? idx[k] : -1)).filter((k) => k >= 0),
      links,
      supports: sup,
      areas: geo.areas,
      rise,
      groundY: ground,
    });
    if (Math.abs(rise - 3080) > 50 && st.flight === undefined) warnings.push(`${st.label} : palier à ${fmtNumber(rise / 1e3, 2)} m du sol — kit relevé pour 3,08 m, volée recalculée à la même pente.`);
  }

  // ─── tronçons de flambement : entre deux attaches d'une barre physique ───
  const linesOfNode = new Map<number, Set<string>>();
  meta.forEach((m, k) => {
    if (m.massless) return;
    for (const n of [members[k].i, members[k].j]) {
      if (!linesOfNode.has(n)) linesOfNode.set(n, new Set());
      linesOfNode.get(n)!.add(m.line);
    }
  });
  const spans: MemberMeta[] = [];
  const byLine = new Map<string, number[]>();
  meta.forEach((m, k) => {
    if (!byLine.has(m.line)) byLine.set(m.line, []);
    byLine.get(m.line)!.push(k);
  });
  const spanOf = new Array<{ span: string; length: number }>(meta.length);
  for (const [line, ids] of byLine) {
    // ordre le long de la ligne : chaînage par nœuds communs
    const nodeCount = new Map<number, number>();
    for (const k of ids) for (const n of [members[k].i, members[k].j]) nodeCount.set(n, (nodeCount.get(n) ?? 0) + 1);
    const ends = [...nodeCount].filter(([, c]) => c === 1).map(([n]) => n);
    const start = ends[0] ?? members[ids[0]].i;
    const remaining = new Set(ids);
    let cur = start;
    let spanNo = 0;
    let acc: number[] = [];
    let accLen = 0;
    const flush = () => {
      for (const k of acc) spanOf[k] = { span: `${line}#${spanNo}`, length: accLen };
      spanNo++;
      acc = [];
      accLen = 0;
    };
    while (remaining.size) {
      const k = [...remaining].find((x) => members[x].i === cur || members[x].j === cur);
      if (k === undefined) {
        // ligne non chaînée (ne devrait pas arriver) : chaque barre est son propre tronçon
        for (const x of remaining) spanOf[x] = { span: `${line}#x${x}`, length: Math.hypot(...([0, 1, 2] as const).map((d) => pos(members[x].j)[d] - pos(members[x].i)[d])) };
        break;
      }
      remaining.delete(k);
      const next = members[k].i === cur ? members[k].j : members[k].i;
      acc.push(k);
      accLen += Math.hypot(...([0, 1, 2] as const).map((d) => pos(next)[d] - pos(cur)[d]));
      cur = next;
      const joint = (linesOfNode.get(cur)?.size ?? 0) > 1;
      if (joint || !remaining.size) flush();
    }
    if (acc.length) flush();
  }
  meta.forEach((m, k) => spans.push({ ...m, span: spanOf[k]?.span ?? `${m.line}#0`, spanLength: spanOf[k]?.length ?? 0 }));

  // ─── côtés exposés au vent ───
  const faces: FaceInfo[] = faceGeo.map((f) => {
    const cov = f.covered.sort((p, q) => p[0] - q[0]);
    const exposed: Array<[number, number]> = [];
    let s = 0;
    for (const [a, b] of cov) {
      if (a > s + 1) exposed.push([s, a]);
      s = Math.max(s, b);
    }
    if (s < f.length - 1) exposed.push([s, f.length]);
    return { module: f.pm.id, side: f.side, normal: f.normal, length: f.length, exposed, top: f.pm.origin[1] + f.pm.params.topZ };
  });
  const outerSides = new Map<string, Record<Side, boolean>>();
  for (const f of faces) {
    const free = f.exposed.reduce((a, [p, q]) => a + q - p, 0);
    const rec = outerSides.get(f.module) ?? { u0: false, u1: false, v0: false, v1: false };
    rec[f.side] = free >= f.length / 2;
    outerSides.set(f.module, rec);
  }
  const ys = nodes.map((n) => n.y);
  // limite d'élasticité : épaisseur maxi des sections utilisées (contrôle des tranches d'épaisseur)
  for (const key of new Set(meta.map((m) => m.section))) {
    const { s, mat } = sectionProps(key);
    const t = Math.max(s.section.dims.t ?? 0, s.section.dims.tf ?? 0, s.section.dims.tw ?? 0);
    if (mat.family === 'steel' && t && !steelStrength(mat, t)) warnings.push(`${s.name} : épaisseur ${t} mm hors des tranches de ${mat.name}.`);
  }
  return {
    fem: { nodes, members, supports },
    meta: spans,
    modules,
    nodeOf,
    lines,
    faces,
    supportMeta,
    stairs,
    topModules,
    outerSides,
    baseY: Math.min(...ys),
    topY: Math.max(...ys),
    warnings,
    errors,
  };
}

/** Modèle déformé par un défaut d'aplomb φ dans la direction horizontale d (monde) : x += φ · (y − y0) · d. */
export function withSway(fem: FemModel, phi: number, d: Vec3, baseY: number): FemModel {
  return { ...fem, nodes: fem.nodes.map((n) => ({ ...n, x: n.x + phi * (n.y - baseY) * d[0], z: n.z + phi * (n.y - baseY) * d[2] })) };
}
