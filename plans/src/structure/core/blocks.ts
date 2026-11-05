// Blocs de calage bois dessinés dans le modèle (plots, cales, « sous-bois » sous les pieds des Viewbox) : chaque bloc
// est un appui de calage à part entière. Les appuis (angles, vérins, pieds centraux) posés sur un même bloc forment un
// seul appui de calage (réactions additionnées par combinaison) ; la chaîne de répartition est alors
//   pieds → compression transversale du bois sous chaque pied → diffusion à 45° dans la hauteur du bloc, limitée au
//   bloc et centrée sur la résultante (B' = B − 2 e, EN 1997-1 annexe D) → poids propre du bloc réparti sur toute sa
//   base → sol, ou → plaques de répartition sous le bloc (centrées sur le bloc) → sol.
// Fonctions pures ; mm, N, N/mm². Le calcul de la structure n'est pas modifié (appuis aux pieds, comme avant).
import type { EstimateModule, GroupReaction, P2 } from './estimate';
import type { PlateGroup, SupportGeometry } from './placement';
import { moduleAxes, sumReactions, supportGeometry } from './placement';
import { MATERIALS } from './materials';
import { fmtNumber } from './units';

/** Masse volumique par défaut d'un bloc bois (kg/m³) : C24, EN 338 (valeur de l'annexe SCIA statico). */
export const BLOCK_DEFAULT_MATERIAL = 'C24';

/** Bloc de calage dessiné (emprise en plan dans le repère du monde : x, z ; hauteurs selon y). */
export interface DrawnBlock {
  id: string;
  /** désignation du type de pièce (étape 1) */
  label: string;
  /** rectangle englobant en plan (mm) */
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  /** dessous et dessus du bloc (mm) */
  bottom: number;
  top: number;
  /** masse du bloc (kg) et son origine : saisie à l'étape 1, ou volume dessiné × masse volumique */
  massKg: number;
  massSource: 'given' | 'computed';
  /** matériau (clé du catalogue des matériaux, bois ou contreplaqué) */
  material: string;
  /** pièces dessinées qui composent le bloc (madriers d'une pile…) */
  pieces: number;
}

export interface BoxMm {
  min: [number, number, number];
  max: [number, number, number];
  /** volume de matière de la pièce (mm³) : boîte de la pièce */
  volume: number;
}

/**
 * Pièces dessinées → blocs : les pièces qui se touchent ou se chevauchent en plan (à `tol` près) et en hauteur forment
 * un bloc (une pile de madriers = un bloc). Volume = somme des volumes des pièces, au plus le volume du bloc.
 */
export function clusterBlocks(boxes: BoxMm[], tol = 20): Array<BoxMm & { pieces: number }> {
  const n = boxes.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const touch = (a: BoxMm, b: BoxMm) => [0, 1, 2].every((k) => a.min[k] <= b.max[k] + tol && b.min[k] <= a.max[k] + tol);
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (touch(boxes[i], boxes[j])) parent[find(i)] = find(j);
  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r)!.push(i);
  }
  return [...groups.values()].map((idx) => {
    const min: [number, number, number] = [Infinity, Infinity, Infinity];
    const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
    let volume = 0;
    for (const i of idx) {
      for (let k = 0; k < 3; k++) {
        min[k] = Math.min(min[k], boxes[i].min[k]);
        max[k] = Math.max(max[k], boxes[i].max[k]);
      }
      volume += boxes[i].volume;
    }
    const whole = (max[0] - min[0]) * (max[1] - min[1]) * (max[2] - min[2]);
    return { min, max, volume: Math.min(volume, whole), pieces: idx.length };
  });
}

/** Masse volumique (kg/m³) du matériau d'un bloc (bois ou contreplaqué du catalogue, sinon C24). */
export function blockMaterial(key: string | undefined) {
  const m = MATERIALS.find((x) => x.key === key && (x.family === 'timber' || x.family === 'plywood'));
  return m ?? MATERIALS.find((x) => x.key === BLOCK_DEFAULT_MATERIAL)!;
}

/**
 * Blocs d'une instance (pièce du modèle) : masse saisie (kg pour toute l'instance, répartie au volume ; kg/m² sur
 * l'emprise de chaque bloc), sinon volume dessiné × masse volumique du matériau.
 */
export function makeBlocks(
  clusters: Array<BoxMm & { pieces: number }>,
  opts: { label: string; material?: string; weight?: { value: number; unit: 'kg' | 'kg/m' | 'kg/m²' }; firstIndex: number },
): DrawnBlock[] {
  const mat = blockMaterial(opts.material);
  const totalV = clusters.reduce((a, c) => a + c.volume, 0) || 1;
  return clusters.map((c, k) => {
    const plan = (c.max[0] - c.min[0]) * (c.max[2] - c.min[2]);
    const w = opts.weight;
    let massKg = (c.volume * mat.rho) / 1e9;
    let massSource: DrawnBlock['massSource'] = 'computed';
    if (w && w.value > 0 && w.unit === 'kg') [massKg, massSource] = [(w.value * c.volume) / totalV, 'given'];
    else if (w && w.value > 0 && w.unit === 'kg/m²') [massKg, massSource] = [(w.value * plan) / 1e6, 'given'];
    return {
      id: `BL${opts.firstIndex + k}`,
      label: opts.label,
      x0: c.min[0],
      x1: c.max[0],
      z0: c.min[2],
      z1: c.max[2],
      bottom: c.min[1],
      top: c.max[1],
      massKg,
      massSource,
      material: mat.key,
      pieces: c.pieces,
    };
  });
}

/** Surface de l'union de rectangles [u0, u1, v0, v1] (compression de coordonnées). */
export function unionArea(rects: ReadonlyArray<readonly [number, number, number, number] | readonly number[]>): number {
  const xs = [...new Set(rects.flatMap((r) => [r[0], r[1]]))].sort((a, b) => a - b);
  const ys = [...new Set(rects.flatMap((r) => [r[2], r[3]]))].sort((a, b) => a - b);
  let a = 0;
  for (let i = 0; i + 1 < xs.length; i++)
    for (let j = 0; j + 1 < ys.length; j++) {
      const cx = (xs[i] + xs[i + 1]) / 2;
      const cy = (ys[j] + ys[j + 1]) / 2;
      if (rects.some((r) => cx > r[0] && cx < r[1] && cy > r[2] && cy < r[3])) a += (xs[i + 1] - xs[i]) * (ys[j + 1] - ys[j]);
    }
  return a;
}

const cm = (mm: number) => fmtNumber(mm / 10, mm % 10 ? 1 : 0);

/** « 100 × 100 × 64,5 cm » (plan le long des axes de la Viewbox, puis hauteur). */
export function blockDimsText(b: DrawnBlock, u: P2 = [1, 0]): string {
  const [l, w] = blockDims(b, u);
  return `${cm(l)} × ${cm(w)} × ${cm(b.top - b.bottom)} cm`;
}

/** Côtés du bloc le long de u et de v (mm). */
export function blockDims(b: DrawnBlock, u: P2 = [1, 0]): [number, number] {
  const r = blockRect(b, u, [-u[1], u[0]]);
  return [r[1] - r[0], r[3] - r[2]];
}

/** Rectangle du bloc dans les axes (u, v) : [u0, u1, v0, v1]. */
export function blockRect(b: DrawnBlock, u: P2, v: P2): [number, number, number, number] {
  const pts: P2[] = [
    [b.x0, b.z0],
    [b.x1, b.z0],
    [b.x1, b.z1],
    [b.x0, b.z1],
  ];
  const us = pts.map((p) => p[0] * u[0] + p[1] * u[1]);
  const vs = pts.map((p) => p[0] * v[0] + p[1] * v[1]);
  return [Math.min(...us), Math.max(...us), Math.min(...vs), Math.max(...vs)];
}

/** Contour du bloc en plan (monde x, z). */
export function blockOutline(b: DrawnBlock): [P2, P2, P2, P2] {
  return [
    [b.x0, b.z0],
    [b.x1, b.z0],
    [b.x1, b.z1],
    [b.x0, b.z1],
  ];
}

/** Pied (ou groupe de pieds) posé sur un bloc : surface de contact sur le bloc et réaction de calcul. */
export interface BlockFoot {
  id: string;
  /** rectangle de contact dans les axes (u, v) du bloc, coupé au bloc [u0, u1, v0, v1] */
  rect: [number, number, number, number];
  /** part de la surface de contact du pied qui porte sur le bloc (1 = entièrement sur le bloc) */
  coverage: number;
  /** tronçon de rive / profil posé sur le bloc (semelle sur la largeur du bloc), pas un pied ponctuel */
  strip?: boolean;
  REd: number;
  Rk: number;
}

/** Appui de calage sur un bloc : le bloc, ses pieds, la géométrie de l'appui et l'emprise efficace sous le bloc. */
export interface BlockSupport {
  block: DrawnBlock;
  feet: BlockFoot[];
  geometry: SupportGeometry;
  /** rectangle du bloc dans les axes (u, v) */
  rect: [number, number, number, number];
  /** bord extérieur de l'installation le long de u, v (coordonnée), null = Viewbox des deux côtés */
  edges: [number | null, number | null];
}

/** Résistance de calcul en compression transversale du bois du bloc (N/mm²) : kc,90 = 1,0 (sens du fil inconnu). */
export function blockFc90d(b: DrawnBlock): { fc90d: number; fc90k: number; kmod: number; gammaM: number } {
  const m = blockMaterial(b.material);
  const fc90k = m.strength?.fc90k ?? 2.5;
  const kmod = 0.9;
  const gammaM = 1.3;
  return { fc90d: (kmod * fc90k) / gammaM, fc90k, kmod, gammaM };
}

export interface BlockAssignment {
  /** appuis de calage : ceux qui ne sont sur aucun bloc, puis un appui par bloc chargé (id « B1 »…) */
  groups: PlateGroup[];
  /** appui de calage → son bloc */
  support: Map<PlateGroup, BlockSupport>;
  /** blocs sous aucun appui */
  unused: DrawnBlock[];
  warnings: string[];
}

const overlap = (a: readonly number[], b: readonly number[]): [number, number, number, number] => [Math.max(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.min(a[3], b[3])];
const areaOf = (r: readonly number[]) => Math.max(0, r[1] - r[0]) * Math.max(0, r[3] - r[2]);

/**
 * Appuis de calage → blocs : un appui dont la surface de contact porte sur un bloc dessiné (le plus recouvert) y est
 * posé ; tous les appuis d'un même bloc deviennent un seul appui de calage (réactions additionnées combinaison par
 * combinaison). Un appui à moins de 30 cm d'un bloc sans le toucher est signalé (dessin à vérifier).
 */
export function assignBlocks(groups: PlateGroup[], modules: EstimateModule[], blocks: DrawnBlock[], tol = 300): BlockAssignment {
  const warnings: string[] = [];
  const onBlock = new Map<DrawnBlock, Array<{ g: PlateGroup; geo: SupportGeometry; geo0: SupportGeometry; rect: number[]; coverage: number }>>();
  const free: PlateGroup[] = [];
  for (const g of groups) {
    const geo0 = supportGeometry(g, modules);
    // pieds centraux de deux Viewbox voisines (un seul groupe d'appuis) : deux platines côte à côte sur le bloc
    const r0 = g.reaction.group;
    const geo: SupportGeometry =
      r0.middle && !r0.jack && !r0.strip && r0.moduleIds.length > 1
        ? { ...geo0, contact: [geo0.contact[0], 2 * geo0.contact[1]] }
        : geo0;
    const { u, v } = geo;
    const rect = [geo.center[0] - geo.contact[0] / 2, geo.center[0] + geo.contact[0] / 2, geo.center[1] - geo.contact[1] / 2, geo.center[1] + geo.contact[1] / 2];
    let best: { b: DrawnBlock; a: number } | null = null;
    let near: { b: DrawnBlock; d: number } | null = null;
    // tronçon de rive / profil posé sur une plaque connue : cette plaque
    const own = r0.strip?.pad ? blocks.find((b) => b.id === r0.strip!.pad) : undefined;
    for (const b of own ? [own] : blocks) {
      const br = blockRect(b, u, v);
      const a = areaOf(overlap(rect, br));
      if (a > 0 && (!best || a > best.a)) best = { b, a };
      const du = Math.max(br[0] - rect[1], 0, rect[0] - br[1]);
      const dv = Math.max(br[2] - rect[3], 0, rect[2] - br[3]);
      const d = Math.hypot(du, dv);
      if (!near || d < near.d) near = { b, d };
    }
    if (best) {
      if (!onBlock.has(best.b)) onBlock.set(best.b, []);
      onBlock.get(best.b)!.push({ g, geo, geo0, rect, coverage: best.a / (geo.contact[0] * geo.contact[1]) });
    } else {
      free.push(g);
      if (near && near.d <= tol)
        warnings.push(`Appui ${g.reaction.group.id} : à ${cm(near.d)} cm du bloc ${near.b.id} sans le toucher — calé comme s’il n’y avait pas de bloc (dessin à vérifier).`);
    }
  }
  const support = new Map<PlateGroup, BlockSupport>();
  const out: PlateGroup[] = [...free];
  let k = 0;
  // ordre du plan : par rangées puis de gauche à droite
  const used = [...onBlock.entries()].sort((a, b) => Math.round((a[0].z0 + a[0].z1) / 1000) - Math.round((b[0].z0 + b[0].z1) / 1000) || a[0].x0 - b[0].x0);
  for (const [b, list] of used) {
    const rs: GroupReaction[] = list.map((x) => x.g.reaction);
    const sum = sumReactions(rs);
    const first = list[0];
    const { u, v } = first.geo;
    const br = blockRect(b, u, v);
    const feet: BlockFoot[] = list.map((x) => {
      const r = overlap(x.rect, br) as [number, number, number, number];
      return { id: x.g.reaction.group.id, rect: r, coverage: x.coverage, REd: x.g.reaction.REd, Rk: x.g.reaction.Rk, ...(x.g.reaction.group.strip ? { strip: true } : {}) };
    });
    for (const f of feet)
      if (f.coverage < 0.999) warnings.push(`Appui ${f.id} : seulement ${fmtNumber(f.coverage * 100, 0)} % de sa surface d’appui porte sur le bloc ${b.id} (pied au bord du bloc, dessin à vérifier).`);
    // résultante des pieds (pondérée par Rz,k) et rectangle englobant les contacts
    const wsum = feet.reduce((a, f) => a + Math.max(f.Rk, 1), 0);
    const cu = feet.reduce((a, f) => a + Math.max(f.Rk, 1) * ((f.rect[0] + f.rect[1]) / 2), 0) / wsum;
    const cv = feet.reduce((a, f) => a + Math.max(f.Rk, 1) * ((f.rect[2] + f.rect[3]) / 2), 0) / wsum;
    const box = [Math.min(...feet.map((f) => f.rect[0])), Math.max(...feet.map((f) => f.rect[1])), Math.min(...feet.map((f) => f.rect[2])), Math.max(...feet.map((f) => f.rect[3]))];
    const middle = rs.every((r) => r.group.middle);
    const corners = rs.reduce((a, r) => a + (r.group.middle ? 0 : r.group.corners), 0);
    const id = `B${++k}`;
    const reaction: GroupReaction = {
      ...rs[0],
      ...sum,
      group: {
        id,
        position: [(b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2],
        corners: middle ? 0 : corners,
        middle,
        ...(rs.some((r) => r.group.jack) ? { jack: true } : {}),
        // pied de poteau du modèle posé sur le même bloc (libellé « … et un pied de poteau »)
        ...(rs.some((r) => r.group.post) && rs.some((r) => !r.group.post) ? { post: true } : {}),
        // tronçons de rive / profils posés sur la plaque : résumé (angle, milieu, profils seulement)
        ...(rs.every((r) => r.group.strip)
          ? {
              strip: {
                ...rs[0].group.strip!,
                kind: rs.every((r) => r.group.strip!.kind === 'secondary') ? ('secondary' as const) : ('rim' as const),
                corner: rs.some((r) => r.group.strip!.corner),
                middle: rs.some((r) => r.group.strip!.middle) && !rs.some((r) => r.group.strip!.corner),
                length: rs.reduce((a, r) => a + r.group.strip!.length, 0),
              },
            }
          : {}),
        block: b.id,
        moduleIds: [...new Set(rs.flatMap((r) => r.group.moduleIds))],
      },
    };
    const geometry: SupportGeometry = {
      u,
      v,
      center: [cu, cv],
      contact: [box[1] - box[0], box[3] - box[2]],
      sides: [
        { side: 'both', edge: cu },
        { side: 'both', edge: cv },
      ],
    };
    const pg: PlateGroup = { reaction, members: list.flatMap((x) => x.g.members) };
    out.push(pg);
    // bord extérieur de l'installation vu de l'appui (pose des plaques à fleur de la Viewbox)
    const edges = first.geo0.sides.map((sd) => (sd.side === 'both' ? null : sd.edge)) as [number | null, number | null];
    support.set(pg, { block: b, feet, geometry, rect: br, edges });
  }
  const unused = blocks.filter((b) => !onBlock.has(b));
  return { groups: out, support, unused, warnings };
}

/** Données de la chaîne de répartition d'un appui sur bloc (voir `ChainInput.block`). */
export interface BlockChain {
  label: string;
  /** côtés du bloc (u, v) et hauteur (mm) */
  dims: [number, number];
  height: number;
  /** emprise efficace sous le bloc, centrée sur la résultante des pieds (mm) */
  eff: [number, number];
  /** écart de la résultante au centre du bloc (mm, u, v) */
  offset: [number, number];
  /** poids propre du bloc : caractéristique, de calcul (× 1,35) (N) */
  weightK: number;
  weightD: number;
  /** compression transversale sous le pied le plus défavorable */
  c90: { foot: string; sigma: number; fc90d: number; area: number; REd: number };
  /** la diffusion à 45° (et non le bloc) limite l'emprise */
  diffusionLimited: boolean;
  /**
   * plaques sous le bloc : centrées sur le bloc, ou à fleur de la Viewbox (elles partent du bord extérieur de
   * l'installation et ne dépassent pas) ; distance de la résultante à ce bord (mm, null = pas de bord de ce côté)
   */
  plate: 'centered' | 'flush';
  edge: [number | null, number | null];
  /** tronçons de rive / profils posés sur la plaque : portée de la répartition de chaque côté de la semelle (mm) */
  stripReach?: number;
}

/**
 * Chaîne d'un appui sur bloc : compression ⊥ sous chaque pied (σc,90,d = REd / surface sur le bloc ≤ kmod · fc,90,k /
 * γM), diffusion à 45° sur la hauteur du bloc depuis le rectangle des pieds, limitée au bloc, emprise efficace
 * centrée sur la résultante (B' = 2 × distance au bord le plus proche), poids du bloc. `scale` = rapport réaction
 * limitée / réaction complète (public limité), appliqué aux pieds.
 */
export function blockChain(s: BlockSupport, scale = 1, plate: 'centered' | 'flush' = 'centered'): BlockChain {
  const b = s.block;
  const h = Math.max(0, b.top - b.bottom);
  const [u0, u1, v0, v1] = s.rect;
  const [cu, cv] = s.geometry.center;
  const fr = [
    Math.min(...s.feet.map((f) => f.rect[0])) - h,
    Math.max(...s.feet.map((f) => f.rect[1])) + h,
    Math.min(...s.feet.map((f) => f.rect[2])) - h,
    Math.max(...s.feet.map((f) => f.rect[3])) + h,
  ];
  const reg = [Math.max(u0, fr[0]), Math.min(u1, fr[1]), Math.max(v0, fr[2]), Math.min(v1, fr[3])];
  let eu = 2 * Math.max(0, Math.min(cu - reg[0], reg[1] - cu));
  let ev = 2 * Math.max(0, Math.min(cv - reg[2], reg[3] - cv));
  const byBlock = [2 * Math.max(0, Math.min(cu - u0, u1 - cu)), 2 * Math.max(0, Math.min(cv - v0, v1 - cv))];
  // tronçons de rive / profils posés sur la plaque (semelles étroites en L, en ligne…) : l'emprise efficace ne dépasse
  // pas l'union des semelles élargies à 45° sur la hauteur de la plaque (une plaque mince ne porte pas le coin
  // intérieur entre deux rives, une épaisse oui) — même aire, mêmes proportions
  // Une plaque mince répartit aussi en flexion : console c = t · √(fm,d / (3 q)) au-delà de la semelle (pression q
  // sous la plaque, M = q c² / 2 ≤ fm,d t² / 6) — point fixe sur q, au moins la diffusion à 45° (c ≥ h).
  let stripLimited = false;
  let stripReach = h;
  if (s.feet.length && s.feet.every((f) => f.strip)) {
    const m = blockMaterial(b.material);
    const fmd = (0.9 * (m.strength?.fmk ?? 24)) / 1.3;
    const Rk = s.feet.reduce((a, f) => a + Math.max(0, f.Rk), 0) * scale;
    const Wb = b.massKg * 9.81;
    const blockArea = Math.max(1, (u1 - u0) * (v1 - v0));
    const unionWith = (c: number) => unionArea(s.feet.map((f) => [Math.max(u0, f.rect[0] - c), Math.min(u1, f.rect[1] + c), Math.max(v0, f.rect[2] - c), Math.min(v1, f.rect[3] + c)] as const));
    let A = unionWith(h);
    let c = h;
    for (let it = 0; it < 30 && Rk > 0; it++) {
      const q = Rk / Math.max(1, Math.min(A, eu * ev)) + Wb / blockArea;
      const next = Math.max(h, h * Math.sqrt(fmd / (3 * Math.max(q, 1e-9))));
      if (Math.abs(next - c) < 1) break;
      c = next;
      A = unionWith(c);
    }
    stripReach = c;
    if (A > 0 && eu * ev > A) {
      const k = Math.sqrt(A / (eu * ev));
      eu *= k;
      ev *= k;
      stripLimited = true;
    }
  }
  const { fc90d } = blockFc90d(b);
  let c90 = { foot: s.feet[0]?.id ?? '', sigma: 0, fc90d, area: 1, REd: 0 };
  for (const f of s.feet) {
    const area = Math.max(1, areaOf(f.rect));
    const sigma = (f.REd * scale) / area;
    if (sigma >= c90.sigma) c90 = { foot: f.id, sigma, fc90d, area, REd: f.REd * scale };
  }
  const W = b.massKg * 9.81;
  return {
    label: `${b.id.startsWith('PL') ? 'Plaque bois' : 'Bloc bois'} ${b.id} ${cm(u1 - u0)} × ${cm(v1 - v0)} × ${cm(h)} cm (${fmtNumber(b.massKg, 0)} kg)`,
    dims: [u1 - u0, v1 - v0],
    height: h,
    eff: [eu, ev],
    offset: [cu - (u0 + u1) / 2, cv - (v0 + v1) / 2],
    weightK: W,
    weightD: 1.35 * W,
    c90,
    diffusionLimited: stripLimited || eu < byBlock[0] - 1 || ev < byBlock[1] - 1,
    ...(s.feet.length && s.feet.every((f) => f.strip) ? { stripReach } : {}),
    plate,
    edge: [s.edges[0] === null ? null : Math.abs(cu - s.edges[0]), s.edges[1] === null ? null : Math.abs(cv - s.edges[1])],
  };
}

/** Emprise efficace maximale d'une plaque l × w sous le bloc (B' = B − 2 e, e = écart charge ↔ centre de la plaque). */
export function blockPlateCaps(b: BlockChain, l: number, w: number): [number, number] {
  const dims = [l, w];
  return [0, 1].map((k) => {
    const L = dims[k];
    const d = b.edge[k];
    // à fleur : la plaque part du bord extérieur, son centre est à L/2 du bord
    const e = b.plate === 'flush' && d !== null ? Math.abs(L / 2 - d) : Math.abs(b.offset[k]);
    return Math.max(1, L - 2 * e);
  }) as [number, number];
}

/** Même bloc déplacé pour que son centre soit sous la résultante des pieds (conseil « centrer le bloc »). */
export function centredBlock(s: BlockSupport): BlockSupport {
  const [du, dv] = [s.geometry.center[0] - (s.rect[0] + s.rect[1]) / 2, s.geometry.center[1] - (s.rect[2] + s.rect[3]) / 2];
  const { u, v } = s.geometry;
  const dx = u[0] * du + v[0] * dv;
  const dz = u[1] * du + v[1] * dv;
  const block = { ...s.block, x0: s.block.x0 + dx, x1: s.block.x1 + dx, z0: s.block.z0 + dz, z1: s.block.z1 + dz };
  const rect: [number, number, number, number] = [s.rect[0] + du, s.rect[1] + du, s.rect[2] + dv, s.rect[3] + dv];
  return { ...s, block, rect };
}

/** Axes de la première Viewbox (pour l'affichage des dimensions d'un bloc). */
export function blockAxes(modules: EstimateModule[]): P2 {
  const m = modules.find((x) => x.level === 0) ?? modules[0];
  return m ? moduleAxes(m).u : [1, 0];
}
