// Relevé de la structure dessinée d'un module (S12.5) → `FrameLayout` : chaque pièce est découpée en solides, chaque
// solide allongé devient une barre (axe passant par le centre de gravité de sa coupe, section du catalogue ou relevée),
// son rôle est proposé par la géométrie (plancher / toiture, rive / traverse / lisse, poteau, diagonale), puis les barres
// sont recalées sur les lignes de système comme dans un modèle SCIA : plans du plancher et de la toiture = centres de
// gravité moyens des rives, lignes x0 / x1 / y0 / y1 = axes des rives, extrémités prolongées jusqu'à l'axe de la barre
// porteuse, poteaux ramenés aux nœuds d'angle (excentricité notée). Fonctions pures ; repère du module (u grand côté,
// v petit côté, z vers le haut, origine au coin bas de la boîte du module), mm.
import type { DeckSpec, FrameBar, FrameFoot, FrameLayout, FrameRole, LibraryEntry, SectionEntry, ViewboxTemplateParams } from './library';
import type { DetectedSection, MemberSection, SectionCandidate, V3 } from './sectionDetect';
import { catalogueCandidates, components, detectedName, measuredRoll, measuredSectionEntry, memberSection, sectionHintFromName } from './sectionDetect';
import type { FrameParams } from './templates/frameModule';
import { viewboxPresetFrame } from './templates/frameModule';

export interface RawMember {
  id: string;
  name?: string;
  definition?: string;
  roleHint?: FrameRole;
  sectionHint?: string;
  gradeHint?: string;
  /** triangles à plat dans le repère du module (mm) */
  triangles: Float32Array;
}

export interface ExtractedBar {
  id: string;
  source: { node: string; name?: string; definition?: string };
  role: FrameRole;
  side?: 'u0' | 'u1' | 'v0' | 'v1';
  corner?: 0 | 1 | 2 | 3;
  /** axe mesuré (centre de gravité de la coupe) et axe recalé */
  measured: { a: V3; b: V3 };
  a: V3;
  b: V3;
  section: DetectedSection | null;
  candidates: SectionCandidate[];
  /** clé retenue : CAT-… (catalogue, à confirmer) ou SEC-SKP-… (relevée) */
  sectionKey: string | null;
  sectionStatus: 'catalogue' | 'measured';
  roll: number;
  eccentricity: number;
  variable: boolean;
  warnings: string[];
}

export interface FrameExtraction {
  bars: ExtractedBar[];
  /** pièces non allongées (plats, goussets, platines, panneaux) : non porteuses dans le calcul */
  pieces: Array<{ id: string; name?: string; dims: [number, number, number] }>;
  /** sections relevées (non trouvées dans le catalogue) à enregistrer avec le type */
  newSections: SectionEntry[];
  /** frame prêt pour l'atelier (null : pas de structure relevée exploitable) */
  params: FrameParams | null;
  warnings: string[];
  maxEccentricity: number;
}

const ROLE_SHORT: Record<FrameRole, string> = {
  'rim-floor': 'RP',
  'rim-roof': 'RT',
  'transverse-floor': 'TP',
  'transverse-roof': 'TT',
  'stringer-floor': 'LP',
  'stringer-roof': 'LT',
  column: 'P',
  foot: 'F',
  brace: 'D',
  other: 'B',
  none: 'N',
};

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);

export interface ExtractOptions {
  /** dimensions de la boîte du module (pieds exclus) */
  long: number;
  short: number;
  height: number;
  /** paramètres de base pour les liaisons de calcul et raideurs (Viewbox) */
  base: Pick<ViewboxTemplateParams, 'sections' | 'springs' | 'plywood'>;
  file?: string;
  date: string;
}

/** Relevé des barres et recalage. */
export function extractFrame(raw: readonly RawMember[], o: ExtractOptions): FrameExtraction {
  const warnings: string[] = [];
  const pieces: FrameExtraction['pieces'] = [];
  type Solid = { raw: RawMember; k: number; m: MemberSection };
  const solids: Solid[] = [];
  for (const r of raw) {
    const comps = components(r.triangles);
    comps.forEach((tri, k) => {
      const m = memberSection(tri);
      const sec = m.section;
      // pas une barre : pièce courte (boulon, goujon, gousset), panneau large (sandwich, remplissage), tôle mince
      const panel = !!sec && (sec.shape === 'flat' || sec.shape === 'solid-rect') && Math.max(sec.dims.h, sec.dims.b) > 250;
      const sheet = !!sec && sec.shape === 'flat' && (sec.dims.t ?? sec.dims.b) <= 4;
      if (!m.axis.elongated || !sec || m.axis.length < 300 || panel || sheet) {
        pieces.push({ id: `${r.id}#${k}`, name: r.definition ?? r.name, dims: m.axis.extents });
        return;
      }
      solids.push({ raw: r, k, m });
    });
  }
  // axe passant par le centre de gravité de la coupe (et non le centre de la boîte : U, L…)
  const axisOf = (m: MemberSection): { a: V3; b: V3 } => {
    const [cy, cz] = m.section!.centroid;
    const off: V3 = [m.y[0] * cy + m.z[0] * cz, m.y[1] * cy + m.z[1] * cz, m.y[2] * cy + m.z[2] * cz];
    const add = (p: V3): V3 => [p[0] + off[0], p[1] + off[1], p[2] + off[2]];
    return { a: add(m.axis.a), b: add(m.axis.b) };
  };
  const { long: L, short: W, height: H } = o;
  // ─── rôles proposés par la géométrie (l'indice saisi dans SketchUp l'emporte) ───
  type Pre = { s: Solid; ax: { a: V3; b: V3 }; role: FrameRole; side?: ExtractedBar['side']; corner?: 0 | 1 | 2 | 3 };
  const pre: Pre[] = solids.map((s) => {
    const ax = axisOf(s.m);
    const d = s.m.axis.dir;
    const zc = (ax.a[2] + ax.b[2]) / 2;
    const uc = (ax.a[0] + ax.b[0]) / 2;
    const vc = (ax.a[1] + ax.b[1]) / 2;
    const width = Math.max(s.m.section!.dims.b, 60);
    let role: FrameRole = 'other';
    let side: ExtractedBar['side'];
    let corner: 0 | 1 | 2 | 3 | undefined;
    if (Math.abs(d[2]) > 0.95) {
      role = 'column';
      const cs: Array<[number, number]> = [
        [0, 0],
        [L, 0],
        [L, W],
        [0, W],
      ];
      const k = cs.findIndex(([u, v]) => Math.hypot(uc - u, vc - v) <= 150 + width);
      if (k >= 0) corner = k as 0 | 1 | 2 | 3;
      else side = Math.abs(vc) <= width + 60 ? 'v0' : Math.abs(vc - W) <= width + 60 ? 'v1' : Math.abs(uc) <= width + 60 ? 'u0' : Math.abs(uc - L) <= width + 60 ? 'u1' : undefined;
    } else if (Math.abs(d[2]) < 0.1) {
      const lvl = zc < H * 0.35 ? 'floor' : zc > H * 0.65 ? 'roof' : null;
      const alongU = Math.abs(d[0]) > 0.95;
      const alongV = Math.abs(d[1]) > 0.95;
      if (!lvl) role = 'other';
      else if (alongU && Math.abs(vc) <= width + 60) [role, side] = [`rim-${lvl}` as FrameRole, 'v0'];
      else if (alongU && Math.abs(vc - W) <= width + 60) [role, side] = [`rim-${lvl}` as FrameRole, 'v1'];
      else if (alongV && Math.abs(uc) <= width + 60) [role, side] = [`rim-${lvl}` as FrameRole, 'u0'];
      else if (alongV && Math.abs(uc - L) <= width + 60) [role, side] = [`rim-${lvl}` as FrameRole, 'u1'];
      else if (alongV) role = `transverse-${lvl}` as FrameRole;
      else if (alongU) role = `stringer-${lvl}` as FrameRole;
      else role = 'other';
      // pièce courte sous le plancher : réception de pied
      if (lvl === 'floor' && zc < 0 && s.m.axis.length < 600) role = 'foot';
    } else role = 'brace';
    if (s.raw.roleHint) role = s.raw.roleHint;
    return { s, ax, role, side, corner };
  });
  // ─── lignes de système ───
  const zOf = (p: Pre) => (p.ax.a[2] + p.ax.b[2]) / 2;
  const floorRims = pre.filter((p) => p.role === 'rim-floor');
  const roofRims = pre.filter((p) => p.role === 'rim-roof');
  if (floorRims.length < 4 || roofRims.length < 4) warnings.push(`Rives relevées : ${floorRims.length} au plancher, ${roofRims.length} en toiture (4 attendues à chaque niveau) — à compléter dans l’atelier.`);
  const floorZ = Number.isFinite(mean(floorRims.map(zOf))) ? mean(floorRims.map(zOf)) : 0;
  const roofZ = Number.isFinite(mean(roofRims.map(zOf))) ? mean(roofRims.map(zOf)) : H - 150;
  const lineOf = (side: 'u0' | 'u1' | 'v0' | 'v1', fallback: number) => {
    const xs = pre.filter((p) => (p.role === 'rim-floor' || p.role === 'rim-roof') && p.side === side).map((p) => (side[0] === 'u' ? (p.ax.a[0] + p.ax.b[0]) / 2 : (p.ax.a[1] + p.ax.b[1]) / 2));
    return xs.length ? mean(xs) : fallback;
  };
  const x0 = lineOf('u0', 40);
  const x1 = lineOf('u1', L - 40);
  const y0 = lineOf('v0', 40);
  const y1 = lineOf('v1', W - 40);
  const zTop = Math.max(...solids.map((s) => Math.max(s.m.axis.a[2], s.m.axis.b[2])), H);
  // plan du plancher du module du dessus = haut de ce module + (ligne de plancher − bas du module)
  const topZ = Math.round(zTop + floorZ - 0);
  const snapEnd = (x: number, lo: number, hi: number, reach: number) => (Math.abs(x - lo) <= reach ? lo : Math.abs(x - hi) <= reach ? hi : x);
  const levelZ = (r: FrameRole) => (/-floor$/.test(r) ? floorZ : roofZ);

  // ─── sections ───
  const newSections = new Map<string, SectionEntry>();
  const bars: ExtractedBar[] = [];
  let n = 0;
  for (const p of pre) {
    const m = p.s.m;
    const s = m.section!;
    const warns: string[] = [];
    const candidates = catalogueCandidates(s);
    let sectionKey: string | null = null;
    let sectionStatus: ExtractedBar['sectionStatus'] = 'measured';
    let roll = 0;
    if (candidates[0]?.match) {
      sectionKey = candidates[0].entry.key;
      sectionStatus = 'catalogue';
      roll = candidates[0].roll;
    } else {
      const e = measuredSectionEntry(s, { file: o.file, date: o.date });
      newSections.set(e.key, e);
      sectionKey = e.key;
      roll = measuredRoll(s);
      if (s.shape === 'other') warns.push(`forme de section non reconnue (${detectedName(s)}) : choisir la section`);
    }
    const hint = sectionHintFromName(p.s.raw.definition ?? p.s.raw.name ?? '');
    if (hint?.h && Math.abs(hint.h - s.dims.h) > 5 && Math.abs(hint.h - s.dims.b) > 5) warns.push(`nom « ${p.s.raw.definition ?? p.s.raw.name} », mesuré ${detectedName(s)}`);
    if (m.variable) warns.push('section variable le long de la barre (coupes à 25 / 50 / 75 % différentes) : à confirmer');
    if (s.slotted) warns.push(`tube fendu ${detectedName(s)} : calculé comme un profil ouvert en torsion (prudent)`);
    // ─── recalage ───
    let a: V3 = [...p.ax.a];
    let b: V3 = [...p.ax.b];
    let ecc = 0;
    const reach = (other: number) => other / 2 + 60;
    if (p.role === 'rim-floor' || p.role === 'rim-roof') {
      const z = levelZ(p.role);
      if (p.side === 'v0' || p.side === 'v1') {
        const v = p.side === 'v0' ? y0 : y1;
        ecc = Math.abs((a[1] + b[1]) / 2 - v);
        [a, b] = [
          [x0, v, z],
          [x1, v, z],
        ];
      } else {
        const u = p.side === 'u0' ? x0 : x1;
        ecc = Math.abs((a[0] + b[0]) / 2 - u);
        [a, b] = [
          [u, y0, z],
          [u, y1, z],
        ];
      }
    } else if (/^(transverse|stringer)-/.test(p.role)) {
      const z = levelZ(p.role);
      ecc = Math.abs((a[2] + b[2]) / 2 - z);
      if (p.role.startsWith('transverse')) {
        const u = (a[0] + b[0]) / 2;
        const r = reach(120) + Math.max(Math.abs(y0), Math.abs(W - y1));
        [a, b] = [
          [u, snapEnd(Math.min(a[1], b[1]), y0, y1, r), z],
          [u, snapEnd(Math.max(a[1], b[1]), y0, y1, r), z],
        ];
      } else {
        const v = (a[1] + b[1]) / 2;
        const r = reach(120) + Math.max(Math.abs(x0), Math.abs(L - x1));
        [a, b] = [
          [snapEnd(Math.min(a[0], b[0]), x0, x1, r), v, z],
          [snapEnd(Math.max(a[0], b[0]), x0, x1, r), v, z],
        ];
      }
    } else if (p.role === 'column') {
      const [u, v] = p.corner !== undefined ? ([[x0, y0], [x1, y0], [x1, y1], [x0, y1]] as Array<[number, number]>)[p.corner] : [(a[0] + b[0]) / 2, p.side === 'v0' ? y0 : p.side === 'v1' ? y1 : (a[1] + b[1]) / 2];
      ecc = Math.hypot((a[0] + b[0]) / 2 - u, (a[1] + b[1]) / 2 - v);
      const [lo, hi] = [Math.min(a[2], b[2]), Math.max(a[2], b[2])];
      [a, b] = [
        [u, v, snapEnd(lo, floorZ, roofZ, 300)],
        [u, v, snapEnd(hi, floorZ, roofZ, 300)],
      ];
    }
    if (ecc > 100) warns.push(`excentricité ${Math.round(ecc)} mm entre l’axe dessiné et la ligne de système`);
    bars.push({
      id: `${ROLE_SHORT[p.role]}-${String(++n).padStart(2, '0')}`,
      source: { node: p.s.raw.id, name: p.s.raw.name, definition: p.s.raw.definition },
      role: p.role,
      ...(p.side ? { side: p.side } : {}),
      ...(p.corner !== undefined ? { corner: p.corner } : {}),
      measured: p.ax,
      a,
      b,
      section: s,
      candidates,
      sectionKey,
      sectionStatus,
      roll,
      eccentricity: ecc,
      variable: m.variable,
      warnings: warns,
    });
  }
  const maxEccentricity = Math.max(0, ...bars.map((b) => b.eccentricity));
  const usable = bars.filter((b) => b.role !== 'none' && b.role !== 'other');
  if (usable.length < 8) return { bars, pieces, newSections: [...newSections.values()], params: null, warnings: [...warnings, 'Moins de 8 barres porteuses relevées : pas de structure exploitable.'], maxEccentricity };

  // ─── frame ───
  const frameBars: FrameBar[] = bars.map((b) => ({
    id: b.id,
    role: b.role,
    a: b.a.map((x) => Math.round(x * 10) / 10) as V3,
    b: b.b.map((x) => Math.round(x * 10) / 10) as V3,
    section: b.sectionKey ?? 'inconnue',
    ...(b.roll ? { roll: b.roll } : {}),
    ...(b.side ? { side: b.side } : {}),
    ...(b.corner !== undefined ? { corner: b.corner } : {}),
    ...(b.role === 'brace' ? { tensionOnly: false } : {}),
    source: { node: b.source.node, definition: b.source.definition, name: b.source.name, eccentricity: Math.round(b.eccentricity), sectionStatus: b.sectionStatus === 'catalogue' ? 'catalogue' : 'measured' },
  }));
  const corners: Array<[number, number]> = [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ];
  const feet: FrameFoot[] = corners.map(([u, v], c) => ({ id: `F-${c}`, u: Math.round(u * 10) / 10, v: Math.round(v * 10) / 10, kind: 'corner', corner: c as 0 | 1 | 2 | 3 }));
  const hasStringers = bars.some((b) => b.role === 'stringer-floor');
  const hasTransverses = bars.some((b) => b.role === 'transverse-floor');
  const deck: DeckSpec = { material: o.base.plywood.material, thickness: o.base.plywood.thickness, layers: o.base.plywood.floorLayers, span: hasTransverses && !hasStringers ? 'u' : !hasTransverses && hasStringers ? 'v' : 'two-way' };
  const frame: FrameLayout = {
    v: 1,
    origin: 'mesh',
    bars: frameBars,
    feet,
    deck: { floor: deck, roof: null },
    joints: { column: { model: 'semi', stiffness: o.base.springs.columnRotation }, secondary: { model: 'pinned' }, side: { model: 'bolts' } },
    survey: { snapTol: 60, maxEccentricity: Math.round(maxEccentricity), warnings: [...warnings, ...bars.flatMap((b) => b.warnings.map((w) => `${b.id} : ${w}`))], ...(o.file ? { extractedFrom: o.file } : {}), extractedAt: o.date },
  };
  const first = (r: FrameRole) => bars.find((b) => b.role === r)?.sectionKey ?? undefined;
  const near = 205;
  const params: FrameParams = {
    x0: Math.round(x0 * 10) / 10,
    x1: Math.round(x1 * 10) / 10,
    y0: Math.round(y0 * 10) / 10,
    y1: Math.round(y1 * 10) / 10,
    floorZ: Math.round(floorZ * 10) / 10,
    roofZ: Math.round(roofZ * 10) / 10,
    topZ,
    transverseX: bars.filter((b) => b.role === 'transverse-floor').map((b) => Math.round(b.a[0])).sort((a, b) => a - b),
    longitudinalY: bars.filter((b) => b.role === 'stringer-floor').map((b) => Math.round(b.a[1])).sort((a, b) => a - b),
    footOffset: 0,
    middleFootX: Math.round((x0 + x1) / 2),
    boltLongX: [Math.round(x0 + near), Math.round(x1 - near)],
    boltShortY: [Math.round(y0 + near), Math.round(y1 - near)],
    verticalContactX: [],
    gap: 10,
    sections: {
      ...o.base.sections,
      rim: first('rim-floor') ?? o.base.sections.rim,
      rimRoof: first('rim-roof') ?? first('rim-floor') ?? o.base.sections.rim,
      secondary: first('transverse-floor') ?? first('stringer-floor') ?? o.base.sections.secondary,
      secondaryRoof: first('transverse-roof') ?? first('stringer-roof') ?? o.base.sections.secondary,
      column: first('column') ?? o.base.sections.column,
    },
    springs: { ...o.base.springs },
    plywood: { ...o.base.plywood },
    frame,
  };
  return { bars, pieces, newSections: [...newSections.values()], params, warnings, maxEccentricity };
}

// ─── conformité d'une structure relevée avec un type de la bibliothèque ───

export interface Conformity {
  ok: boolean;
  /** 0 … 1 */
  score: number;
  differences: string[];
  /** écarts de section relevés (informatifs : un dessin détaillé a des rails et des pièces de rive séparées) */
  notes: string[];
}

const LEVEL_NAME = { floor: 'plancher', roof: 'toiture' } as const;

/**
 * Compare la structure relevée au gabarit d'un type. Critères robustes seulement (une Viewbox dessinée en détail a des
 * rives en plusieurs pièces, des rails, des cornières : ses coupes ne sont pas fiables) : nombre et positions des
 * traverses par niveau, présence de lisses, poteaux présents ; sections comparées seulement pour un profil net (U, I,
 * tube) d'une rive ou d'un poteau.
 */
export function frameConformity(extracted: FrameExtraction, reference: { name: string; frame: FrameLayout; sectionDims: (key: string) => { h: number; b: number } | null }): Conformity {
  const diffs: string[] = [];
  const notes: string[] = [];
  let checks = 0;
  let good = 0;
  const bars = extracted.bars.filter((b) => b.role !== 'other' && b.role !== 'none');
  const refBars = reference.frame.bars.filter((b) => b.role !== 'none');
  const check = (ok: boolean, text: string) => {
    checks++;
    if (ok) good++;
    else diffs.push(text);
  };
  const note = (ok: boolean, text: string) => {
    if (!ok) notes.push(text);
  };
  const clean = (s: DetectedSection | null | undefined) => !!s && (s.shape === 'U' || s.shape === 'I' || s.shape === 'tube-rect');
  for (const lvl of ['floor', 'roof'] as const) {
    const count = (list: Array<{ role: FrameRole }>, r: string) => list.filter((b) => b.role === `${r}-${lvl}`).length;
    const [tm, tr] = [count(bars, 'transverse'), count(refBars, 'transverse')];
    const [lm, lr] = [count(bars, 'stringer'), count(refBars, 'stringer')];
    check(tm === tr && lm > 0 === lr > 0, `${LEVEL_NAME[lvl]} : ${tm} traverse(s), ${lm ? `${lm} lisse(s)` : 'aucune lisse'} ; ${reference.name} : ${tr} traverse(s) + ${lr} lisse(s)`);
    // positions des traverses (± 60 mm)
    if (tm === tr && tm > 0) {
      const pm = bars.filter((b) => b.role === `transverse-${lvl}`).map((b) => b.a[0]).sort((a, b) => a - b);
      const pr = refBars.filter((b) => b.role === `transverse-${lvl}`).map((b) => b.a[0]).sort((a, b) => a - b);
      const flip = pm.map((x) => (pm[0] + pm[pm.length - 1]) - x).sort((a, b) => a - b);
      const near = (xs: number[]) => xs.every((x, k) => Math.abs(x - pr[k]) <= 60);
      check(near(pm) || near(flip), `${LEVEL_NAME[lvl]} : traverses à ${pm.map((x) => Math.round(x)).join(' / ')} mm ; ${reference.name} : ${pr.map((x) => Math.round(x)).join(' / ')} mm`);
    }
    // rives : hauteur et largeur d'un profil net (± 10 mm)
    const rm = bars.find((b) => b.role === `rim-${lvl}` && clean(b.section));
    const rr = refBars.find((b) => b.role === `rim-${lvl}`);
    const dr = rr ? reference.sectionDims(rr.section) : null;
    if (rm?.section && dr) {
      const [h, b] = [rm.section.dims.h, rm.section.dims.b];
      note(Math.abs(h - dr.h) <= 10 && Math.abs(b - dr.b) <= 10, `rives ${LEVEL_NAME[lvl]} ≈ ${detectedName(rm.section)} au lieu de ${Math.round(dr.h)} × ${Math.round(dr.b)}`);
    }
  }
  const cm = bars.filter((b) => b.role === 'column');
  check(cm.length >= 2, `${cm.length} poteau(x) relevé(s)`);
  const c0 = cm.find((b) => clean(b.section))?.section;
  const cr = refBars.find((b) => b.role === 'column');
  const d0 = cr ? reference.sectionDims(cr.section) : null;
  if (c0 && d0) note(Math.abs(c0.dims.h - d0.h) <= 10 && Math.abs(c0.dims.b - d0.b) <= 10, `poteaux ≈ ${detectedName(c0)} au lieu de ${Math.round(d0.h)} × ${Math.round(d0.b)}`);
  const score = checks ? good / checks : 0;
  return { ok: diffs.length === 0, score, differences: [...diffs, ...(diffs.length ? notes : [])], notes };
}

/** Conformité d'une structure relevée à chaque type de module de la bibliothèque (Viewbox : son gabarit en barres). */
export function structureCheck(ex: FrameExtraction, library: readonly LibraryEntry[], sections: ReadonlyMap<string, SectionEntry>): { bars: number; byTemplate: Record<string, Conformity> } {
  const bars = ex.bars.filter((b) => b.role !== 'other' && b.role !== 'none').length;
  const byTemplate: Record<string, Conformity> = {};
  if (!ex.params) return { bars, byTemplate };
  const dims = (k: string) => {
    const s = sections.get(k)?.section;
    return s ? { h: s.dims.h ?? s.dims.d ?? 0, b: s.dims.b ?? s.dims.d ?? 0 } : null;
  };
  for (const e of library) {
    if (e.kind !== 'module_type' || e.disabled || !e.params) continue;
    const frame = e.params.frame ?? (e.template === 'viewbox-eu' ? viewboxPresetFrame(e.params) : null);
    if (frame) byTemplate[e.key] = frameConformity(ex, { name: e.name, frame, sectionDims: dims });
  }
  return { bars, byTemplate };
}
