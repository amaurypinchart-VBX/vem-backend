// Gabarit « escalier extérieur Viewbox » (kit escalier + palier), relevé sur le modèle SCIA de la note statico 24-0569
// « Viewbox – Qatar » (annexe B, Treppenwange / Treppenstütze / Ersatz_Treppenstufe / Ersatz_Anbindung) :
//   · palier : cadre en U plié 200 × 80 × 5 de 1,20 × 2,34 m au niveau du plancher de la Viewbox du dessus, attaché au
//     grand côté de la Viewbox par 2 boulons M20 aux perçages (attaches sans masse : effort normal et effort tranchant
//     horizontal transmis, vertical et rotations libres), porté par 4 montants pendulaires QHP 80 × 3 (rotules en tête,
//     pieds sur vérins Layher 60, attache U 125 × 92 × 5 de 38 mm entre le montant et le cadre) ;
//   · volée : deux limons U 200 × 80 × 5 accrochés au palier (crochets : rotule à 250 mm du bord du palier), posés au sol
//     par un talon de 176 mm (appui transversal et vertical, libre dans le sens de la volée), deux montants pendulaires
//     intermédiaires à 1,227 m de l'accroche ;
//   · marches et platelage : barres équivalentes sans masse entre les limons (rotule autour de l'axe local y, comme SCIA),
//     17 marches sur la volée, 9 lattes au palier entre les deux perçages.
// Repère local de l'escalier : r le long de la volée (du palier vers le pied), w perpendiculaire à la Viewbox (vers
// l'extérieur), z vers le haut ; origine au perçage extérieur, sur la ligne de système de la rive, au niveau du palier.
// Fonction pure, N et mm.
import type { EndSpec, Vec3 } from '../fem/types';

export interface StairKitParams {
  key: string;
  name: string;
  /** entraxe des limons, et écart de la ligne de système de la rive Viewbox au premier limon */
  width: number;
  gap: number;
  /** écart des deux perçages d'attache (grand côté Viewbox) ; débord du cadre de palier au-delà des perçages */
  boltSpacing: number;
  landingMargin: number;
  /** prolongement du limon sous le palier jusqu'à l'accroche (rotule) */
  hookExtension: number;
  /** volée : longueur en plan par mm de montée (giron / hauteur), talon au sol */
  runPerRise: number;
  footHeight: number;
  /** montants intermédiaires sous les limons, depuis l'accroche (plan) */
  middlePost: number;
  /** montants du palier : retrait par rapport aux limons (vers l'intérieur du palier) */
  postInset: number;
  /** giron des marches (nombre de marches = volée / giron, arrondi) ; lattes du palier */
  stepGoing: number;
  landingBars: number;
  /** relevés sur le modèle SketchUp du kit : débord du palier au-delà du cadre (bout de la boîte), débord de la boîte
   * au-delà du pied des limons, garde-corps extérieur au-delà du limon extérieur — pour mesurer largeur et volée */
  landingEndOffset: number;
  footOverhang: number;
  outerRail: number;
  sections: { stringer: string; post: string; head: string; step: string; link: string };
  /** marches et platelage (N/mm²), garde-corps (N/mm) */
  treads: number;
  railing: number;
  source: string;
}

export type StairFamily = 'stair-stringer' | 'stair-landing' | 'stair-post' | 'stair-head' | 'stair-step' | 'stair-link';

export interface StairNode {
  key: string;
  p: Vec3;
}

export interface StairMember {
  family: StairFamily;
  section: string;
  i: string;
  j: string;
  endI?: EndSpec;
  endJ?: EndSpec;
  line: string;
  label: string;
  /** barre verticale : axe local z de référence */
  vertical?: boolean;
}

export interface StairSupport {
  node: string;
  kind: 'post' | 'foot';
  label: string;
}

/** Barre recevant les charges surfaciques des marches / du palier : largeur d'influence (mm, en plan). */
export interface StairGeometry {
  nodes: StairNode[];
  members: StairMember[];
  supports: StairSupport[];
  /** barres d'attache du palier (nœud du palier) → nœud de rive de la Viewbox (fourni par l'assemblage) */
  links: Array<{ node: string; r: number }>;
  /** indices (dans members) des marches / lattes et leur largeur d'influence */
  bars: Array<{ index: number; width: number; region: 'flight' | 'landing' }>;
  /** limons et bord extérieur du palier (garde-corps), et barres prises au vent */
  railingMembers: number[];
  windMembers: number[];
  /** surfaces en plan (mm²) : volée, palier (avec la bande entre la Viewbox et le palier) */
  areas: { flight: number; landing: number };
  /** longueur de la volée en plan, abscisse du pied (repère local) */
  flightLength: number;
  footR: number;
}

const PIN_Y: EndSpec = ['rigid', 'rigid', 'rigid', 'rigid', 'free', 'rigid'];
const PINNED: EndSpec = ['rigid', 'rigid', 'rigid', 'rigid', 'free', 'free'];

/**
 * Escalier dans son repère local, converti en monde : `origin` (perçage extérieur, ligne de système, niveau du palier),
 * `run` et `out` unitaires horizontaux, `rise` = hauteur du palier au-dessus du sol (mm).
 */
export function stairGeometry(kit: StairKitParams, id: string, origin: Vec3, run: Vec3, out: Vec3, rise: number, flight?: number): StairGeometry {
  const nodes = new Map<string, StairNode>();
  const at = (r: number, w: number, z: number): Vec3 => [origin[0] + run[0] * r + out[0] * w, origin[1] + z - rise, origin[2] + run[2] * r + out[2] * w];
  const node = (r: number, w: number, z: number) => {
    const key = `${id}:${Math.round(r)}:${Math.round(w)}:${Math.round(z)}`;
    if (!nodes.has(key)) nodes.set(key, { key, p: at(r, w, z) });
    return key;
  };
  const members: StairMember[] = [];
  const add = (m: StairMember) => members.push(m) - 1;
  const chain = (pts: string[], m: Omit<StairMember, 'i' | 'j'>) => {
    const idx: number[] = [];
    for (let k = 0; k + 1 < pts.length; k++) idx.push(add({ ...m, i: pts[k], j: pts[k + 1] }));
    return idx;
  };
  const H = rise;
  const { width: W, gap: g, boltSpacing: D, landingMargin: m0 } = kit;
  const wA = g;
  const wB = g + W;
  const r0 = -m0;
  const r1 = D + m0;
  const rHook = r1 + kit.hookExtension;
  // volée : mesurée sur le modèle si elle est donnée, sinon à la pente du kit
  const L = Math.max(0, flight ?? (H - kit.footHeight) * kit.runPerRise);
  const rFoot = rHook + L;
  const zOn = (r: number) => H - ((r - rHook) / L) * (H - kit.footHeight);
  const nSteps = Math.max(1, Math.round(L / kit.stepGoing));
  const going = L / nSteps;
  const stepR = Array.from({ length: nSteps }, (_, k) => rHook + going * (k + 0.5));
  const barR = Array.from({ length: kit.landingBars }, (_, k) => (kit.landingBars === 1 ? D / 2 : (D * k) / (kit.landingBars - 1)));
  // montants intermédiaires : à la même proportion de la volée que dans le kit (aucun si la volée est courte)
  const kitL = (3080 - kit.footHeight) * kit.runPerRise;
  const rMid = L >= 2500 ? rHook + (kit.middlePost * L) / kitL : Infinity;
  const S = kit.sections;

  // ─── palier : cadre, lattes ───
  const landingW = (w: number) => [r0, ...barR, r1].map((r) => node(r, w, H));
  const inner = chain(landingW(wA), { family: 'stair-landing', section: S.stringer, line: `${id}/landing:inner`, label: `${id} · cadre de palier, côté Viewbox` });
  const outer = chain(landingW(wB), { family: 'stair-landing', section: S.stringer, line: `${id}/landing:outer`, label: `${id} · cadre de palier, côté extérieur` });
  const far = add({ family: 'stair-landing', section: S.stringer, i: node(r0, wA, H), j: node(r0, wB, H), line: `${id}/landing:far`, label: `${id} · cadre de palier, about` });
  add({ family: 'stair-landing', section: S.stringer, i: node(r1, wA, H), j: node(r1, wB, H), line: `${id}/landing:near`, label: `${id} · cadre de palier, côté volée` });
  const bars: StairGeometry['bars'] = [];
  barR.forEach((r, k) => {
    const width = kit.landingBars === 1 ? r1 - r0 : (r1 - r0) / kit.landingBars;
    bars.push({ index: add({ family: 'stair-step', section: S.step, i: node(r, wA, H), j: node(r, wB, H), endI: PIN_Y, endJ: PIN_Y, line: `${id}/lbar:${k}`, label: `${id} · latte de palier ${k + 1}` }), width, region: 'landing' });
  });

  // ─── limons : prolongement sous le palier, accroche (rotule), volée, talon ───
  const stringer = (w: number, side: 'a' | 'b') => {
    const ext = add({ family: 'stair-stringer', section: S.stringer, i: node(rHook, w, H), j: node(r1, w, H), endI: PINNED, line: `${id}/landing:ext:${side}`, label: `${id} · limon ${side === 'a' ? 'côté Viewbox' : 'extérieur'}, sous le palier` });
    const rs = [rHook, ...stepR, ...(rMid > rHook && rMid < rFoot ? [rMid] : []), rFoot].sort((x, y) => x - y);
    const pts = rs.map((r) => node(r, w, zOn(r)));
    const flight = chain(pts, { family: 'stair-stringer', section: S.stringer, line: `${id}/stringer:${side}`, label: `${id} · limon ${side === 'a' ? 'côté Viewbox' : 'extérieur'}` });
    const heel = add({ family: 'stair-stringer', section: S.stringer, i: node(rFoot, w, kit.footHeight), j: node(rFoot, w, 0), line: `${id}/stringer:${side}`, label: `${id} · limon ${side === 'a' ? 'côté Viewbox' : 'extérieur'}`, vertical: true });
    return { ext, flight, heel };
  };
  const A = stringer(wA, 'a');
  const B = stringer(wB, 'b');
  stepR.forEach((r, k) => bars.push({ index: add({ family: 'stair-step', section: S.step, i: node(r, wA, zOn(r)), j: node(r, wB, zOn(r)), endI: PIN_Y, endJ: PIN_Y, line: `${id}/step:${k}`, label: `${id} · marche ${k + 1}` }), width: going, region: 'flight' }));

  // ─── montants pendulaires (rotule en tête, pied sur vérin Layher) ───
  const supports: StairSupport[] = [];
  let post = 0;
  for (const [r, w, wFrame] of [
    [0, wA + kit.postInset, wA],
    [D, wA + kit.postInset, wA],
    [0, wB - kit.postInset, wB],
    [D, wB - kit.postInset, wB],
  ] as const) {
    post++;
    const foot = node(r, w, 0);
    const head = node(r, w, H);
    add({ family: 'stair-post', section: S.post, i: foot, j: head, endJ: PINNED, line: `${id}/post:${post}`, label: `${id} · montant de palier ${post}`, vertical: true });
    add({ family: 'stair-head', section: S.head, i: head, j: node(r, wFrame, H), line: `${id}/head:${post}`, label: `${id} · attache du montant de palier ${post}` });
    supports.push({ node: foot, kind: 'post', label: `${id} · pied de montant de palier ${post}` });
  }
  if (rMid > rHook && rMid < rFoot)
    for (const [w, side] of [
      [wA, 'a'],
      [wB, 'b'],
    ] as const) {
      post++;
      const foot = node(rMid, w, 0);
      add({ family: 'stair-post', section: S.post, i: foot, j: node(rMid, w, zOn(rMid)), endJ: PINNED, line: `${id}/post:${post}`, label: `${id} · montant intermédiaire ${side === 'a' ? 'côté Viewbox' : 'extérieur'}`, vertical: true });
      supports.push({ node: foot, kind: 'post', label: `${id} · pied de montant intermédiaire ${side === 'a' ? 'côté Viewbox' : 'extérieur'}` });
    }
  for (const [side, label] of [
    ['a', 'côté Viewbox'],
    ['b', 'extérieur'],
  ] as const)
    supports.push({ node: node(rFoot, side === 'a' ? wA : wB, 0), kind: 'foot', label: `${id} · pied de limon ${label}` });

  const railingMembers = [...A.flight, ...B.flight, ...outer, far];
  const windMembers = [...A.flight, A.heel, ...B.flight, B.heel, ...inner, ...outer, far];
  return {
    nodes: [...nodes.values()],
    members,
    supports,
    links: [
      { node: node(0, wA, H), r: 0 },
      { node: node(D, wA, H), r: D },
    ],
    bars,
    railingMembers,
    windMembers,
    areas: { flight: W * L, landing: (W + g) * (r1 - r0) },
    flightLength: L,
    footR: rFoot,
  };
}
