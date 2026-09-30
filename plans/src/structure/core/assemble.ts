// Assemblage du modèle filaire de l'installation (§6) : le gabarit Viewbox est posé sur chaque module, puis les
// liaisons sont créées comme dans le modèle SCIA statico —
//   · Viewbox juxtaposées (côtés parallèles à ≤ 30 mm) : boulons horizontaux M20 (barres RD 20 sans masse, ressorts
//     50 kN/cm aux deux bouts sur les grands côtés, à un bout sur les petits) et contacts d'angle en compression seule ;
//   · Viewbox empilées : liaison d'angle (QRO 100 × 4 sans masse de la toiture du dessous au plancher du dessus,
//     raide en axial, ressorts 10 kN/cm en cisaillement) ;
//   · appuis des Viewbox au sol : aux angles (ou aux pieds sur vérins), ressorts horizontaux 50 kN/cm, vertical en
//     compression seule.
// Les côtés restés libres reçoivent le vent (intervalles exposés). Fonction pure ; repère monde Y vers le haut.
import type { EndSpec, FemMember, FemModel, FemNode, FemSupport, Vec3 } from './fem/types';
import type { ModuleFrame } from '../../core/views';
import type { LibraryEntry, ModuleTypeEntry, SectionEntry, ViewboxTemplateParams } from './library';
import { materialByKey, steelStrength } from './materials';
import type { RimExtras, Side, TemplateFace, TemplateFamily, ViewboxTemplate } from './templates/viewboxEU';
import { viewboxTemplate } from './templates/viewboxEU';

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

export type MemberFamily = TemplateFamily | 'corner-link' | 'vertical-contact' | 'bolt' | 'contact';

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
}

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
  /** pieds à vérin utilisés : appuis aux nœuds des réceptions de pied au lieu des angles */
  jacks: boolean;
  /** pieds centraux des grands côtés calés (appuis supplémentaires) */
  middleFeet: boolean;
  /** appui soulevé : libérer aussi les ressorts horizontaux (prudent) ou seulement le vertical (comme SCIA) */
  upliftReleases: 'all' | 'vertical';
  /** calage statico : nuances et courbes de flambement de l'annexe SCIA (S275, courbes a) */
  calibration: boolean;
  /**
   * contacts (angles voisins, Viewbox empilées) : 'truss' = compression seule sans cisaillement (défaut : l'effort
   * horizontal passe par les boulons et les liaisons d'angle) ; 'beam' = barre encastrée comme dans SCIA
   */
  contactModel?: 'truss' | 'beam';
  /** boulons de toiture entre deux Viewbox qui portent chacune une Viewbox (défaut : non, comme statico) */
  roofBoltsUnderStack?: boolean;
  gapTolerance?: number;
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
  supportMeta: Array<{ module: string; corner: number; kind: 'corner' | 'foot' | 'middle' }>;
  /** modules sans rien au-dessus (toiture exposée, dernier niveau évacué) */
  topModules: Set<string>;
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
  // contacts : barres articulées (effort normal seul, défaut) ou barres encastrées comme dans SCIA (calage)
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
          addMember(na, nb, A.pm.params.sections.bolt, { family: 'bolt', module: A.pm.id, line: `bolt:${A.pm.id}/${B.pm.id}/${bolts}`, side: A.side, label: `boulon ${A.pm.id} / ${B.pm.id}` }, { endJ: boltEnd(long ? k / 2 : k), geometric: false });
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
      addMember(best.n, nu, U.params.sections.cornerLink, { family: 'corner-link', module: U.id, line: `link:${U.id}/${c}`, label: `${best.L.id} / ${U.id} · liaison d’angle ${c + 1}` }, {
        ref: U.u,
        endJ: ['rigid', sh, sh, 'free', 'free', 'free'],
      });
    });
    // pas de contacts verticaux le long des rives entre Viewbox empilées (statico Qatar : les efforts passent par
    // les angles) ; les nœuds `contacts` du gabarit servent aux terrasses posées sur les toitures
  }

  // ─── appuis des Viewbox posées au sol ───
  for (const pm of modules) {
    if (pm.level !== 0) continue;
    const tpl = tplOf.get(pm)!;
    const kh = pm.params.springs.supportHorizontal;
    const place = (key: string, corner: number, kind: 'corner' | 'foot' | 'middle') => {
      supports.push({ node: P(pm, key), dofs: [kh, 'fixed', kh, 'free', 'free', 'free'], compressionOnly: true, upliftReleases: opt.upliftReleases });
      supportMeta.push({ module: pm.id, corner, kind });
    };
    (opt.jacks ? tpl.footNodes : tpl.cornerFloor).forEach((k, c) => place(k, c, opt.jacks ? 'foot' : 'corner'));
    if (opt.middleFeet) tpl.middleFeet.forEach((k, c) => place(k, 4 + c, 'middle'));
  }
  if (!supports.length) errors.push('Aucune Viewbox posée au sol : le modèle n’a pas d’appui.');

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
    topModules,
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
