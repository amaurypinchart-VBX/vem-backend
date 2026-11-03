// Calage d'une installation : estimation des réactions → types de groupes d'appuis (1, 2, 3, 4 angles, pieds centraux)
// → solutions de répartition par type, longrines sous les grands côtés, diffusion par couches (option) → solution
// retenue et liste de matériel. Les choix de l'utilisateur (plaques par type ou par appui, plaques de roulage sur toute
// la surface) remplacent la solution automatique ; chaque appui est vérifié sous sa propre réaction (chaîne pied →
// plaques → sol, `spreading.ts`) avec un diagnostic. Utilisé par le panneau « Sol & calage », la fiche PDF et le
// rapport. Fonctions pures.
import type { CalcRecord } from './records';
import type { Estimate, EstimateModule, EstimateOptions, GroupReaction, P2 } from './estimate';
import type { AddedSupport } from './estimate';
import { addSupports, estimateReactions, fullPublic, limitPublic } from './estimate';
import type { CommercialPlate, LongrineResult, MaterialLine, PanelMaterial, PlateResult, Solution, SolutionKind, SpreadLayer, StockPlate, TimberBeam } from './ground';
import { C24_BEAMS, PANELS, PLATE_LABEL, isWoodPlate, chooseLongrine, designGroup, diffusionDepth, leastBad, recommended, sizePlate, stockLayer } from './ground';
import type { RoadwayResult } from './roadway';
import { roadwayPressure } from './roadway';
import type { CalageChoices, ChainResult, LayerRef } from './spreading';
import { adviseChain, bestStockForAll, bestStockLayers, checkChain, dimsCm, pressureText, resolveLayers } from './spreading';
import type { BlockChain, BlockSupport, DrawnBlock } from './blocks';
import { assignBlocks, blockAxes, blockChain, blockDimsText, blockMaterial, blockOutline, centredBlock } from './blocks';
import type { PlateGroup, PlatePlacement, PlatePlan, SupportGeometry } from './placement';
import { flushCaps, plateGroups, platePlan, supportGeometry } from './placement';
import type { TuvCheck } from './tuv';
import { TUV, tuvConformity, tuvPlate } from './tuv';
import type { GroundLevel, LevelSurvey } from './groundLevels';
import { JACK_MAX_EXTENSION, levelSurvey } from './groundLevels';
import { verdictOf } from './records';
import { fmtNumber } from './units';

/** Surface de contact (mm) selon le nombre d'angles posés sur la même plaque (statico 24-0571 § 3.12). */
export function contactArea(corners: number, middle: boolean, jack = false, stair = false): { a1: number; a2: number; confirmed: boolean } {
  // pied d'escalier (platine Layher, talon de limon) : 15 × 15 cm (statico 24-0569 § 3.10.3, 24-0571 A34)
  if (stair) return { a1: 150, a2: 150, confirmed: true };
  // platine de vérin 7-309-002 et réception centrale : 15 × 15 cm supposés
  if (middle || jack) return { a1: 150, a2: 150, confirmed: false };
  if (corners <= 1) return { a1: 210, a2: 210, confirmed: true };
  if (corners === 2) return { a1: 420, a2: 210, confirmed: true };
  // 3 angles : surface prise comme pour 2 angles (côté de la sécurité)
  if (corners === 3) return { a1: 420, a2: 210, confirmed: true };
  return { a1: 420, a2: 420, confirmed: true };
}

export interface CalageInput {
  modules: EstimateModule[];
  estimate: EstimateOptions;
  /** portance admissible (N/mm²) et charge ponctuelle admissible (N, dalles) */
  bearing: number;
  pointLoadMax?: number;
  /** Rz,k = Rz,Ed / 1,35 (méthode statico) au lieu de la réaction caractéristique calculée */
  staticoConversion: boolean;
  thicknesses: number[];
  stock: StockPlate[];
  commercial: CommercialPlate[];
  longrine: { k: number; beams: Array<Pick<TimberBeam, 'b' | 'h'>>; overhang: number; maxCount: number };
  diffusion: boolean;
  /** réactions du calcul complet (groupes d'appuis) à la place de l'estimation instantanée */
  reactions?: Estimate;
  /** appuis hors des Viewbox ajoutés au calage (pieds des éléments terrasse posés au sol) */
  extraSupports?: AddedSupport[];
  /** calage choisi par type d'appui ou par appui, plaques de roulage */
  choices?: CalageChoices;
  /** poids propre des plaques de roulage (N/mm²) */
  roadwayPlates?: number;
  /** public limité à un nombre de personnes (toute l'installation) au lieu de la charge d'exploitation réglementaire */
  publicLimit?: { persons: number; kg: number };
  /** sans les phrases de diagnostic (recherche du public maximal) */
  noAdvice?: boolean;
  /**
   * position des plaques : à fleur de la Viewbox (ne dépassent pas de l'installation), centrées sous l'appui (statico,
   * plan TÜV : elles dépassent), ou automatique = à fleur quand elles suffisent, sinon centrées (défaut)
   */
  placement?: PlatePlacement;
  /** préférer un calage conforme au minimum du Prüfbuch TÜV (plan 18-0573-03) et signaler les écarts (défaut oui) */
  tuvMinimum?: boolean;
  /** niveaux du sol relevés sous les pieds (mm, relatifs) et sortie de vérin vérifiée (mm, défaut 50) */
  levels?: GroundLevel[];
  jackMax?: number;
  /**
   * blocs de calage bois dessinés dans le modèle (sous les pieds) : les appuis posés sur un bloc forment un appui de
   * calage « B… » réparti par le bloc ; les plaques choisies se posent sous le bloc
   */
  blocks?: DrawnBlock[];
}

/** Vérification d'un appui de calage (une plaque) sous sa propre réaction avec le calage qui lui est appliqué. */
export interface SupportCheck extends ChainResult {
  id: string;
  reaction: GroupReaction;
  /** type d'appui (« 1 »…« 4 », « M », « M2 ») */
  typeKey: string;
  /** calage automatique, choisi pour le type, choisi pour cet appui */
  source: 'auto' | 'type' | 'support';
  layerList: SpreadLayer[];
  Rzk: number;
  REd: number;
  advice: string;
  /** points d'appui (plan des appuis) posés sur cette plaque : un angle / groupe d'angles, ou les vérins voisins */
  members: string[];
  geometry: SupportGeometry;
  /** plaque du dessous en plan (null : pied posé directement au sol ou sur les plaques de roulage) */
  plan: PlatePlan | null;
  placement: 'flush' | 'centered';
  /** conformité au minimum du Prüfbuch (null : pied central, non prévu) */
  tuv: TuvCheck | null;
  /** appui posé sur un bloc de calage bois dessiné : le bloc (contour en plan, dimensions, masse) */
  block?: { id: string; label: string; dims: string; massKg: number; massSource: DrawnBlock['massSource']; outline: [P2, P2, P2, P2]; feet: string[] };
}

export interface CalageType {
  key: string;
  label: string;
  corners: number;
  middle: boolean;
  jack: boolean;
  /** pieds d'escalier */
  stair?: boolean;
  reactions: GroupReaction[];
  RzEd: number;
  Rzk: number;
  a1: number;
  a2: number;
  plate: PlateResult;
  solutions: Solution[];
  /** solution retenue : faisable, sinon la moins mauvaise (standard = false) */
  chosen?: Solution;
  standard: boolean;
  extra: CalcRecord[];
  /** type d'appui de base (« 1 »…« 4 », « M ») ; calage choisi (sinon automatique) et couches choisies */
  typeKey: string;
  custom: boolean;
  refs?: LayerRef[];
  /** chaque appui du groupe et diagnostic de l'appui le plus défavorable */
  checks: SupportCheck[];
  advice: string;
  /** containers posés sur une plaque de ce type (angles ou vérins d'angle) et conformité au Prüfbuch de la solution retenue */
  containers: number;
  tuv: TuvCheck | null;
  /** appuis posés sur des blocs de calage bois dessinés (plaques éventuelles sous les blocs) */
  block?: true;
}

export interface CalageResult {
  /** réactions par point d'appui (plan des appuis : chaque angle ou chaque vérin) */
  estimate: Estimate;
  types: CalageType[];
  longrine: null | {
    beam: Pick<TimberBeam, 'b' | 'h'>;
    count: number;
    pieces: number;
    length: number;
    result: LongrineResult;
    solution: Solution;
  };
  /** longrines retenues à la place des plaques (choix `CalageChoices.longrine`) ; sinon elles restent une variante */
  longrineChosen: boolean;
  /** matériel de la solution retenue pour chaque type */
  materials: MaterialLine[];
  /** tout est calé par des plaques faisables */
  allPlates: boolean;
  warnings: string[];
  /** chaque appui de calage (une plaque) ; plaques de roulage (toujours calculées, retenues si `roadwayOn`) */
  checks: SupportCheck[];
  roadway: RoadwayResult;
  roadwayOn: boolean;
  /** public limité retenu pour le sol (charge totale en N) */
  publicLimit?: { persons: number; kg: number; load: number };
  placement: PlatePlacement;
  /** Prüfbuch : portance ≥ 200 kN/m², calage conforme partout (null : rien de comparable) */
  /** `notApplicable` : aucune Viewbox (types personnalisés seulement) — ni Prüfbuch ni texte TÜV / statico */
  tuv: { bearingOk: boolean; ok: boolean | null; tuvMinimum: boolean; notApplicable?: true };
  /** niveaux du sol relevés et rattrapage par pied (null : aucun relevé saisi) */
  levels: LevelSurvey | null;
}

const typeLabel = (corners: number, middle: boolean, jack = false, stair = false) =>
  stair
    ? 'pied d’escalier'
    : jack
    ? middle
      ? corners > 1
        ? `${corners} vérins centraux sur une plaque`
        : 'vérin central'
      : corners > 1
        ? `${corners} vérins d’angle sur une plaque`
        : 'vérin d’angle'
    : middle
      ? 'pied central'
      : corners === 1
        ? 'angle seul'
        : `${corners} angles sur une plaque`;

/** Clé du type d'appui de calage : nombre d'angles (1…4) ou pied central (M, M2 = deux vérins centraux sur une plaque). */
export const calageTypeKey = (r: GroupReaction, members = 1): string =>
  r.group.block
    ? `B${r.group.middle ? (members > 1 ? `M${members}` : 'M') : String(Math.max(1, Math.min(4, r.group.corners)))}${r.group.post ? 'R' : ''}`
    : r.group.terrace ? (r.group.middle ? 'TM' : 'T') : r.group.post ? 'R' : r.group.stair ? 'E' : r.group.middle ? (members > 1 ? `M${members}` : 'M') : String(Math.min(4, r.group.corners));

export function computeCalage(inp: CalageInput): CalageResult {
  const est0 = addSupports(inp.reactions ?? estimateReactions(inp.modules, inp.estimate), inp.extraSupports, inp.estimate.groupTolerance);
  const publicLoad = inp.publicLimit ? Math.max(0, inp.publicLimit.persons) * inp.publicLimit.kg * 9.81 : undefined;
  const limit = (e: Estimate) => (publicLoad === undefined ? e : limitPublic(e, publicLoad));
  const est = limit(est0);
  const placementMode: PlatePlacement = inp.placement ?? 'auto';
  // Prüfbuch TÜV 190060 B : seulement sous des Viewbox (types personnalisés S12 : « non comparable », aucun texte TÜV)
  const custom = new Set(inp.modules.filter((m) => m.family === 'other').map((m) => m.id));
  const viewboxPresent = !inp.modules.length || inp.modules.some((m) => m.family !== 'other');
  const tuvOn = (inp.tuvMinimum ?? true) && viewboxPresent;
  const unknownContact = inp.modules.filter((m) => m.contact === null).map((m) => m.id);
  // appuis de calage : vérins voisins sur une même plaque, réactions additionnées par combinaison (avant le public limité)
  const groupsP = plateGroups(est0.reactions, inp.modules, inp.estimate.groupTolerance);
  // blocs de calage dessinés : les appuis posés sur un même bloc = un appui de calage (réactions additionnées)
  const blk = inp.blocks?.length ? assignBlocks(groupsP, inp.modules, inp.blocks) : null;
  const groups0 = blk ? blk.groups : groupsP;
  const plateEst = limit({ ...est0, reactions: groups0.map((g) => g.reaction) });
  const groups: PlateGroup[] = groups0.map((g, k) => ({ reaction: plateEst.reactions[k], members: g.members }));
  const blockOf = new Map<PlateGroup, { s: BlockSupport; scale: number }>();
  groups0.forEach((g, k) => {
    const s = blk?.support.get(g);
    if (s) blockOf.set(groups[k], { s, scale: g.reaction.REd > 0 ? groups[k].reaction.REd / g.reaction.REd : 1 });
  });
  const warnings = [...new Set([...est.warnings, ...plateEst.warnings])];
  if (blk) {
    warnings.push(...blk.warnings);
    if (blk.unused.length)
      warnings.push(
        `${blk.unused.length} bloc(s) de calage sous aucun appui (${blk.unused.map((b) => b.id).join(', ')})${inp.estimate.middleFeet || inp.estimate.jacks ? '' : ' : si les pieds centraux des Viewbox posent sur ces blocs, cocher « pieds centraux » (étape 2)'} — leur poids n’est pas compté.`,
      );
  }
  if (unknownContact.length) warnings.push(`Surface d’appui d’un pied à renseigner pour ${unknownContact.join(', ')} (type de structure personnalisé) : calage indicatif, 21 × 21 cm supposés.`);
  const reach = 2 * inp.estimate.groupTolerance + (est.reactions.some((r) => r.group.jack) ? 250 : 0);
  const byType = new Map<string, PlateGroup[]>();
  for (const g of groups) {
    const key = calageTypeKey(g.reaction, g.members.length);
    if (!byType.has(key)) byType.set(key, []);
    byType.get(key)!.push(g);
  }
  const choices = inp.choices ?? {};
  // poids des blocs dessinés (posés au sol sous les pieds) compté dans la charge totale et dans leur emprise
  const roadway = roadwayPressure(inp.modules, est, inp.bearing, inp.roadwayPlates ?? 0, (inp.blocks ?? []).map((b) => ({ at: [(b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2] as P2, N: b.massKg * 9.81 })));
  // plaques de roulage : il faut l'emprise au sol des Viewbox
  const roadwayOn = !!choices.roadway && roadway.area > 0;
  if (choices.roadway && !roadwayOn) warnings.push('Plaques de roulage : emprise au sol des Viewbox inconnue, non prises en compte.');
  const rw = { mean: roadway.mean, area: roadway.area, load: roadway.load };
  // blocs dessinés : la charge n'arrive au sol que par les blocs ; des plaques de roulage posées dessous ne
  // répartissent pas la charge de toute l'installation sur toute la surface (il faudrait un plateau rigide)
  if (roadwayOn && blk && blockOf.size)
    warnings.push(
      `Plaques de roulage et blocs de calage : la charge n’arrive au sol que par les ${blockOf.size} bloc(s) ; des plaques de roulage posées sous les blocs ne la répartissent pas uniformément sur toute la surface (il faudrait un plateau rigide). Chaque bloc est donc vérifié avec sa propre emprise (+ les plaques choisies sous lui) ; la répartition uniforme reste affichée pour information (moyenne sur l’emprise, utile pour une dalle de bâtiment).`,
    );
  const types: CalageType[] = [];
  const order = (k: string): number => (k.startsWith('B') ? 30 + order(k.slice(1).replace(/R$/, '')) + (k.endsWith('R') ? 0.5 : 0) : k === 'R' ? 21 : k === 'E' ? 20 : k === 'T' ? 18 : k === 'TM' ? 19 : k.startsWith('M') ? 9 + k.length : Number(k));
  for (const [key, all] of [...byType.entries()].sort((a, b) => order(a[0]) - order(b[0]))) {
    const r0 = all[0].reaction;
    const middle = r0.group.middle;
    const jack = !!r0.group.jack;
    const terrace = !!r0.group.terrace;
    // pied de terrasse : platine de vérin centrée, comme un pied d'escalier
    const stair = !!r0.group.stair || terrace;
    const onBlock = !!r0.group.block;
    const n = middle ? all[0].members.length : r0.group.corners;
    // pied d'escalier : pas de plaque minimale du Prüfbuch (traité comme un pied central) ; terrasse : milieu 55 × 55
    const containers = stair ? 0 : jack ? all[0].members.length : r0.group.corners;
    const geos = new Map(all.map((g) => [g, blockOf.get(g)?.s.geometry ?? supportGeometry(g, inp.modules)]));
    // appuis qui ne portent que des Viewbox : comparables au Prüfbuch (pas les appuis sur blocs dessinés)
    const vbxOnly = !onBlock && all.every((g) => g.reaction.group.moduleIds.every((id) => !custom.has(id)));
    // surface de contact du type : la plus petite des appuis du type (côté de la sécurité)
    const smallest = [...geos.values()].reduce((a, g) => (g.contact[0] * g.contact[1] < a.contact[0] * a.contact[1] ? g : a));
    const [a1, a2] = [Math.max(...smallest.contact), Math.min(...smallest.contact)];
    if (terrace) {
      const w = 'Pieds des éléments terrasse : platine de vérin 15 × 15 cm supposée (à confirmer).';
      if (!warnings.includes(w)) warnings.push(w);
    }
    if (!stair && (jack || middle)) {
      const w = jack ? 'Pieds à vérin : platine 15 × 15 cm supposée (7-309-002, à confirmer).' : 'Pieds centraux : surface de contact 15 × 15 cm supposée (à confirmer).';
      if (!warnings.includes(w)) warnings.push(w);
    }
    const withPost = onBlock && !!r0.group.post;
    const baseLabel = onBlock
      ? `bloc bois sous ${blockTypeLabel(n, middle, jack)}${withPost ? ' et un pied de poteau' : ''}`
      : terrace ? (middle ? 'pied central de terrasse' : 'pied d’angle de terrasse') : r0.group.post ? 'pied de poteau' : typeLabel(n, middle, jack, stair);
    const unit = onBlock ? 'bloc' : terrace ? 'pied de terrasse' : r0.group.post ? 'pied de poteau' : stair ? 'pied d’escalier' : jack ? (n > 1 ? 'groupe' : 'vérin') : middle ? 'pied central' : r0.group.corners === 1 ? 'angle' : 'groupe';
    const contactLabelOf = (g: SupportGeometry) => onBlock ? `${blockTypeLabel(n, middle, jack, true)}${withPost ? ' + pied de poteau' : ''} sur le bloc, ${Math.round(g.contact[0] / 10)} × ${Math.round(g.contact[1] / 10)} cm` : `${terrace ? 'Pied de terrasse' : r0.group.post ? 'Pied de poteau' : stair ? 'Pied d’escalier' : jack ? (n > 1 ? `${n} platines de vérin` : 'Platine de vérin') : middle ? 'Pied central' : r0.group.corners === 1 ? 'Angle' : `${r0.group.corners} angles`} ${Math.round(g.contact[0] / 10)} × ${Math.round(g.contact[1] / 10)} cm`;
    // appuis du type regroupés par calage : automatique, choix du type, choix propre à un appui
    const parts = new Map<string, { refs: LayerRef[] | null; groups: PlateGroup[]; own: boolean }>();
    for (const g of all) {
      const own = choices.bySupport?.[g.reaction.group.id];
      const refs = own ?? choices.byType?.[key] ?? null;
      const k = refs ? JSON.stringify(refs) : 'auto';
      if (!parts.has(k)) parts.set(k, { refs, groups: [], own: false });
      const p = parts.get(k)!;
      p.groups.push(g);
      if (own && JSON.stringify(own) !== JSON.stringify(choices.byType?.[key] ?? null)) p.own = true;
    }
    // automatique, puis le choix du type, puis les appuis choisis à part
    const rank = ([k, p]: [string, { own: boolean }]) => (k === 'auto' ? 0 : p.own ? 2 : 1);
    for (const [pk, part] of [...parts.entries()].sort((a, b) => rank(a) - rank(b))) {
      const reactions = part.groups.map((g) => g.reaction);
      const RzEd = Math.max(...reactions.map((r) => r.REd));
      const Rzk = Math.max(...reactions.map((r) => r.Rk));
      const d = designGroup({
        label: unit,
        groups: reactions.length,
        RzEd,
        Rzk: inp.staticoConversion ? undefined : Rzk,
        bearing: inp.bearing,
        pointLoadMax: inp.pointLoadMax,
        a1,
        a2,
        thicknesses: inp.thicknesses,
        stock: inp.stock,
        commercial: inp.commercial,
      });
      // plaques aux dimensions minimales du Prüfbuch (plan 18-0573-03) : du stock si possible, sinon contreplaqué F40/30 découpé
      const tp = tuvOn && vbxOnly ? tuvPlate(containers, middle || stair, terrace && middle) : null;
      // appuis sur blocs : seules les plaques posées sous le bloc comptent (les plaques dimensionnées pour un pied ne s'y appliquent pas)
      if (onBlock) d.solutions = [];
      if (tp) {
        const stockOk = inp.stock
          .filter((st) => isWoodPlate(st.material) && Math.min(st.length, st.width) >= tp.side && st.thickness > 0)
          .flatMap((st) => [1, 2, 3].filter((k) => st.thickness >= tp.t[k - 1]).slice(0, 1).map((k) => ({ st, k })))
          .sort((a, b) => a.k - b.k || a.st.length * a.st.width - b.st.length * b.st.width || a.st.thickness - b.st.thickness)[0];
        const pick = [1, 2, 3].map((k) => ({ k, t: inp.thicknesses.find((t) => t >= tp.t[k - 1]) })).find((x) => x.t !== undefined);
        const tuvSolution = (layer: SpreadLayer, kind: SolutionKind, label: string, k: number, matLabel = materialLabel(layer)): Solution => {
          // vérification statico de cette plaque (taille réelle, matériau réel)
          const sized = sizePlate({ RzEd, Rzk: inp.staticoConversion ? undefined : Rzk, bearing: inp.bearing, a1, a2, side: Math.min(layer.l, layer.w), panel: PANELS[layer.material as PanelMaterial]?.panel });
          return {
            kind,
            title: `${label} selon le Prüfbuch (plan ${TUV.calagePlan})`,
            summary: `${k} × ${layer.l / 10} × ${layer.w / 10} × ${layer.t} mm par ${unit}`,
            feasible: true,
            remarks: [],
            eta: Math.max(sized.etaGround, sized.etaC90, (6 * sized.Wreq) / (k * layer.t * layer.t)),
            materials: [{ label: matLabel, dims: `${layer.l} × ${layer.w} × ${layer.t} mm`, quantity: k * reactions.length, massKg: layer.massKg * k * reactions.length }],
            records: sized.records,
            footprint: { l: layer.l, w: layer.w },
            layers: [layer],
          };
        };
        if (stockOk) {
          const mat = PANELS[(stockOk.st.material ?? 'F40') as PanelMaterial];
          d.solutions.push(
            tuvSolution(stockLayer(stockOk.st, stockOk.k), 'plywood-stock', `Plaques du stock${stockOk.st.label ? ` « ${stockOk.st.label} »` : ''}`, stockOk.k, `${mat.label} (stock${stockOk.st.quantity > 0 ? '' : ', quantité à vérifier au dépôt'})`),
          );
        }
        else if (pick) {
          const s10 = tp.side / 10;
          const mass = (tp.side * tp.side * pick.t! * PANELS.F40.panel.rho) / 1e9;
          const layer: SpreadLayer = { key: `cut:F40:${tp.side}x${tp.side}x${pick.t}`, label: `Contreplaqué F40/30 ${s10} × ${s10} × ${pick.t} mm`, l: tp.side, w: tp.side, t: pick.t!, n: pick.k, material: 'F40', massKg: mass };
          d.solutions.push(tuvSolution(layer, 'plywood', 'Contreplaqué F40/30', pick.k));
        }
      }
      const extra: CalcRecord[] = [];
      if (d.point) extra.push(d.point);
      if (inp.diffusion && !onBlock) {
        const df = diffusionDepth(d.plate.Rzk, inp.bearing, a1, a2);
        extra.push(df.record);
        d.solutions.push({
          kind: 'diffusion',
          title: 'Couches continues (diffusion à 45°)',
          summary: `épaisseur totale ≥ ${Math.ceil(df.H / 10)} cm sous chaque ${middle ? 'pied' : 'groupe'}`,
          feasible: false,
          remarks: ['hypothèse de diffusion à 45° : à valider pour le matériau des couches'],
          eta: 1,
          materials: [],
          records: [df.record],
        });
      }
      // un appui avec un calage donné : à fleur, centré, ou automatique (à fleur s'il suffit, sinon centré)
      const evaluate = (g: PlateGroup, layers: SpreadLayer[]) => {
        const r = g.reaction;
        const geo = geos.get(g)!;
        const Rk = inp.staticoConversion ? r.REd / 1.35 : r.Rk;
        const bs = blockOf.get(g);
        if (bs) {
          // bloc dessiné : pieds → bloc → (plaques sous le bloc, centrées sur lui) → sol
          // pas de répartition uniforme sous un bloc (voir l'avertissement plaques de roulage + blocs)
          const base = { Rzk: Rk, REd: r.REd, contact: geo.contact, contactLabel: contactLabelOf(geo), bearing: inp.bearing, roadway: null, pointLoadMax: inp.pointLoadMax, subgrade: inp.longrine.k, block: blockChain(bs.s, bs.scale) };
          const chain = checkChain({ ...base, layers });
          const bottom = layers[layers.length - 1];
          return { r, geo, Rk, base, flushBase: base, centeredBase: base, chain, atFlush: chain, atCenter: chain, placement: 'centered' as const, eccentric: false, bottom };
        }
        const flush = flushCaps(geo);
        const base = { Rzk: Rk, REd: r.REd, contact: geo.contact, contactLabel: contactLabelOf(geo), bearing: inp.bearing, roadway: roadwayOn ? rw : null, pointLoadMax: inp.pointLoadMax, subgrade: inp.longrine.k };
        const bottom = layers[layers.length - 1];
        const flushBase = { ...base, caps: flush.caps, edgeDist: flush.edgeDist };
        const atFlush = checkChain({ ...flushBase, layers });
        const atCenter = checkChain({ ...base, layers });
        const eccentric = layers.length > 0 && flush.caps.some((c, k) => c < [bottom.l, bottom.w][k]);
        let placement: 'flush' | 'centered' = placementMode === 'centered' ? 'centered' : 'flush';
        if (placementMode === 'auto' && eccentric && atFlush.eta > 1 && atCenter.eta < atFlush.eta) placement = 'centered';
        const chain = placement === 'flush' ? atFlush : atCenter;
        return { r, geo, Rk, base: placement === 'flush' ? flushBase : base, flushBase, centeredBase: base, chain, atFlush, atCenter, placement, eccentric, bottom };
      };
      const passes = (layers: SpreadLayer[]) => part.groups.every((g) => evaluate(g, layers).chain.eta <= 1);
      // blocs : sans plaque si le bloc suffit, sinon les plaques du stock (sous le bloc) qui suffisent à tous les blocs du type
      let blockAuto: SpreadLayer[] | null = null;
      if (onBlock && !part.refs) {
        if (passes([])) blockAuto = [];
        else blockAuto = bestStockForAll(part.groups.map((g) => evaluate(g, []).base), inp.stock)?.layers ?? [];
      }
      const conformTuv = (layers: SpreadLayer[]) => tuvConformity(containers, middle || stair, layers, terrace && middle)?.ok === true;
      const auto0 = recommended(d.solutions);
      let autoChosen = auto0 ?? leastBad(d.solutions);
      if (!part.refs && !roadwayOn) {
        // solution automatique : la première qui passe pour chaque appui de la partie (position des plaques comprise),
        // conforme au Prüfbuch si possible
        const kinds: SolutionKind[] = ['plywood-stock', 'plywood', 'commercial', 'steel'];
        const cands = d.solutions.filter((x) => x.feasible && x.layers?.length).sort((a, b) => kinds.indexOf(a.kind) - kinds.indexOf(b.kind));
        const ok = cands.filter((x) => passes(x.layers!));
        const pick = (tp ? ok.find((x) => conformTuv(x.layers!)) : undefined) ?? ok[0];
        if (pick) autoChosen = pick;
        else if (tp) autoChosen = cands.find((x) => conformTuv(x.layers!)) ?? autoChosen;
      }
      // couches appliquées : choix de l'utilisateur, sinon celles de la solution automatique (aucune sur plaques de roulage)
      let layers: SpreadLayer[] = [];
      if (part.refs) {
        const res = resolveLayers(part.refs, inp.stock);
        layers = res.layers;
        for (const m of res.missing) warnings.push(`Calage choisi : la plaque « ${m} » n’est plus dans le stock, elle est ignorée.`);
      } else if (blockAuto) layers = blockAuto;
      else if (!roadwayOn) layers = autoChosen?.layers ?? [];
      const custom = !!part.refs || (roadwayOn && !onBlock);
      const checks = part.groups.map((g): SupportCheck => {
        const e = evaluate(g, layers);
        const r = e.r;
        const source = choices.bySupport?.[r.group.id] ? 'support' : choices.byType?.[key] ? 'type' : 'auto';
        const ctx = { stock: inp.stock, roadway: rw, roadwayOn: roadwayOn && !onBlock, custom: !!part.refs };
        let advice = inp.noAdvice ? '' : adviseChain(r.group.id, e.chain, layers, { ...ctx, base: e.base });
        // automatique : aucune plaque du stock ne suffit à fleur de la Viewbox (charge près du bord) → conseil en plaque centrée
        if (!inp.noAdvice && !onBlock && placementMode === 'auto' && e.placement === 'flush' && e.chain.eta > 1 && !roadwayOn && !bestStockLayers(e.flushBase, inp.stock) && bestStockLayers(e.centeredBase, inp.stock))
          advice = `${adviseChain(r.group.id, e.atCenter, layers, { ...ctx, base: e.centeredBase })} (plaque centrée sous l’appui : à fleur de la Viewbox, aucune plaque ne suffit, la charge est trop près du bord).`;
        const bs = blockOf.get(g)?.s;
        const plan = bs ? blockPlan(bs, e.bottom) : e.bottom ? platePlan(e.geo, e.bottom.l, e.bottom.w, e.placement) : null;
        // bloc excentré qui ne passe pas : le même bloc centré sous la résultante des pieds
        const bc = (e.base as { block?: BlockChain }).block;
        if (!inp.noAdvice && bs && e.chain.eta > 1 && e.chain.etaGround > 1 && bc) {
          const off = Math.max(...bc.offset.map(Math.abs));
          if (off > 50) {
            const moved = checkChain({ ...e.base, layers, block: blockChain(centredBlock(bs), blockOf.get(g)!.scale) });
            if (moved.etaGround < e.chain.etaGround)
              advice += ` La charge est à ${Math.round(off / 10)} cm du centre du bloc : seule la zone centrée sur la charge porte (${dimsCm(e.chain.steps[1].dims ?? [0, 0])}). Bloc centré sous l’appui : ${pressureText(moved.pressure)}${moved.eta <= 1 ? ', OK' : ', insuffisant aussi'} (η ${fmtNumber(moved.eta, 2)}).`;
          }
        }
        if (!inp.noAdvice && e.eccentric && plan) {
          const q = (c: ChainResult) => pressureText(c.pressure);
          const over = platePlan(e.geo, e.bottom.l, e.bottom.w, 'centered').overhang;
          if (e.placement === 'centered')
            advice += ` À fleur de la Viewbox, la plaque ne répartirait que sur ${dimsCm(e.atFlush.layers[e.atFlush.layers.length - 1].footprint)} (charge près du bord) → ${q(e.atFlush)} : plaque centrée sous l’appui, elle dépasse de ${Math.round(over / 10)} cm.`;
          else if (e.chain.eta > 1 && e.atCenter.eta <= 1) advice += ` → Centrer la plaque sous l’appui (elle dépasse alors de ${Math.round(over / 10)} cm) : ${q(e.atCenter)}, OK.`;
        }
        return {
          ...e.chain,
          id: r.group.id,
          reaction: r,
          typeKey: key,
          source,
          layerList: layers,
          Rzk: e.Rk,
          REd: r.REd,
          advice: advice.trim(),
          members: g.members.map((m) => m.group.id),
          geometry: e.geo,
          plan,
          placement: e.placement,
          tuv: tuvOn && vbxOnly ? tuvConformity(containers, middle || stair, layers, terrace && middle) : null,
          ...(bs
            ? {
                block: {
                  id: bs.block.id,
                  label: bs.block.label,
                  dims: blockDimsText(bs.block, bs.geometry.u),
                  massKg: bs.block.massKg,
                  massSource: bs.block.massSource,
                  outline: blockOutline(bs.block),
                  feet: bs.feet.map((f) => f.id),
                },
              }
            : {}),
        };
      });
      const worst = checks.reduce((a, c) => (c.eta > a.eta ? c : a));
      const placeText = (() => {
        if (!layers.length) return '';
        const flushN = checks.filter((c) => c.placement === 'flush').length;
        if (flushN === checks.length) return ', à fleur de la Viewbox';
        if (!flushN) return ', centré sous l’appui';
        return `, à fleur (${flushN}) ou centré (${checks.length - flushN})`;
      })();
      let chosen = autoChosen;
      let solutions = d.solutions;
      if (custom || layers.length || onBlock) {
        const bottom = layers[layers.length - 1];
        const stack = layers.map((l) => `${l.n} × ${l.l / 10} × ${l.w / 10}${l.t ? ` × ${l.t} mm` : ' cm'}`).join(' + ');
        const title = onBlock && !part.refs
          ? layers.length
            ? 'Bloc bois dessiné + plaques de répartition sous le bloc'
            : 'Bloc bois dessiné, sans plaque'
          : custom
          ? layers.length
            ? roadwayOn
              ? 'Calage choisi, sur plaques de roulage'
              : 'Calage choisi'
            : roadwayOn
              ? 'Plaques de roulage sur toute la surface'
              : 'Sans plaque'
          : (autoChosen?.title ?? 'Calage');
        chosen = {
          kind: onBlock ? 'custom' : custom ? (layers.length ? 'custom' : 'roadway') : (autoChosen?.kind ?? 'custom'),
          title,
          summary: onBlock
            ? layers.length
              ? `${stack} sous chaque bloc, centrées sur le bloc`
              : 'bloc posé directement au sol'
            : layers.length ? `${stack} par ${unit}${placeText}${roadwayOn ? ', sur plaques de roulage' : ''}` : roadwayOn ? 'pied posé sur les plaques de roulage' : 'pied posé directement au sol',
          feasible: worst.eta <= 1,
          remarks: worst.problems,
          eta: worst.eta,
          // automatique : le matériel de la solution (libellés du stock, quantités à vérifier) ; choisi : les couches
          materials:
            !custom && !onBlock && autoChosen?.materials.length
              ? autoChosen.materials
              : layers.map((l) => ({
                  label: materialLabel(l),
                  dims: l.material === 'commercial' ? `${l.l} × ${l.w} mm` : `${l.l} × ${l.w} × ${l.t} mm`,
                  quantity: l.n * reactions.length,
                  massKg: l.massKg * l.n * reactions.length,
                })),
          // automatique : vérification statico de la plaque retenue, puis la chaîne de l'appui le plus chargé
          records: !custom && !onBlock && autoChosen ? [...autoChosen.records, ...worst.records] : worst.records,
          ...(bottom ? { footprint: { l: bottom.l, w: bottom.w } } : {}),
          layers,
        };
        solutions = [chosen, ...d.solutions.filter((x) => x !== autoChosen)];
        if (onBlock && !custom && !layers.length && worst.eta > 1) chosen.remarks = [...chosen.remarks, 'plaques de répartition à poser sous le bloc (aucune plaque du stock ne suffit : plaque sur mesure ou plaques de roulage)'];
      }
      const standard = verdictOf(worst.eta) !== 'fail' && (custom || !!chosen?.feasible);
      const ids = reactions.map((r) => r.group.id);
      const tuv = tuvOn && vbxOnly ? tuvConformity(containers, middle || stair, layers, terrace && middle) : null;
      types.push({
        key: pk === 'auto' ? key : `${key}:${pk}`,
        label: part.own ? `${baseLabel} — ${ids.join(', ')}` : baseLabel,
        corners: r0.group.corners,
        middle,
        jack,
        ...(stair ? { stair } : {}),
        reactions,
        RzEd,
        Rzk: d.plate.Rzk,
        a1,
        a2,
        plate: d.plate,
        solutions,
        chosen,
        standard,
        extra,
        typeKey: key,
        custom: !!part.refs,
        ...(part.refs ? { refs: part.refs } : {}),
        checks,
        advice: worst.advice,
        containers,
        tuv,
        ...(onBlock ? { block: true as const } : {}),
      });
    }
  }
  const checks = types.flatMap((t) => t.checks).sort((a, b) => groups.findIndex((g) => g.reaction.group.id === a.id) - groups.findIndex((g) => g.reaction.group.id === b.id));

  // ─── longrines sous les grands côtés des Viewbox posées au sol ───
  let longrine: CalageResult['longrine'] = null;
  const groundMods = inp.modules.filter((m) => m.level === 0);
  const groupAt = (p: P2) => {
    let best: GroupReaction | undefined;
    let bd = Infinity;
    for (const r of est.reactions) {
      if (r.group.middle || r.group.stair || r.group.terrace) continue;
      const d = Math.hypot(r.group.position[0] - p[0], r.group.position[1] - p[1]);
      if (d < bd) [bd, best] = [d, r];
    }
    return bd <= reach ? best : undefined;
  };
  const sides: Array<{ a: P2; b: P2 }> = [];
  for (const m of groundMods) {
    const c = m.corners;
    const edges: Array<[P2, P2]> = [
      [c[0], c[1]],
      [c[1], c[2]],
      [c[2], c[3]],
      [c[3], c[0]],
    ];
    edges.sort((x, y) => Math.hypot(y[1][0] - y[0][0], y[1][1] - y[0][1]) - Math.hypot(x[1][0] - x[0][0], x[1][1] - x[0][1]));
    for (const [a, b] of edges.slice(0, 2)) sides.push({ a, b });
  }
  const share = new Map<GroupReaction, number>();
  for (const s of sides)
    for (const p of [s.a, s.b]) {
      const g = groupAt(p);
      if (g) share.set(g, (share.get(g) ?? 0) + 1);
    }
  let worst: { L: number; loads: Array<{ x: number; Pk: number; PEd: number }> } | null = null;
  let worstSum = -Infinity;
  const oh = inp.longrine.overhang;
  for (const s of sides) {
    const len = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]);
    const L = len + 2 * oh;
    const loads: Array<{ x: number; Pk: number; PEd: number }> = [];
    [s.a, s.b].forEach((p, k) => {
      const g = groupAt(p);
      if (!g) return;
      const n = share.get(g) ?? 1;
      loads.push({ x: k === 0 ? oh + 100 : L - oh - 100, Pk: g.Rk / n, PEd: g.REd / n });
    });
    if (inp.estimate.middleFeet || inp.estimate.jacks) {
      const mid: P2 = [(s.a[0] + s.b[0]) / 2, (s.a[1] + s.b[1]) / 2];
      const g = est.reactions.find((r) => r.group.middle && Math.hypot(r.group.position[0] - mid[0], r.group.position[1] - mid[1]) <= reach);
      if (g) loads.push({ x: L / 2, Pk: g.Rk / g.group.moduleIds.length, PEd: g.REd / g.group.moduleIds.length });
    }
    const sum = loads.reduce((a, l) => a + l.PEd, 0);
    if (loads.length >= 2 && sum > worstSum) [worstSum, worst] = [sum, { L, loads }];
  }
  if (worst) {
    const best = chooseLongrine(
      { loads: worst.loads, length: worst.L, k: inp.longrine.k, bearing: inp.bearing, contact: 210 },
      inp.longrine.beams.length ? inp.longrine.beams : C24_BEAMS,
      inp.longrine.maxCount,
    );
    if (best) {
      const pieces = sides.length * best.count;
      const massEach = best.result.massKg / best.count;
      longrine = {
        ...best,
        pieces,
        length: worst.L,
        solution: {
          kind: 'longrine',
          title: 'Longrines bois C24 sous les grands côtés',
          summary: `${best.count} × ${best.beam.b} × ${best.beam.h} mm, L = ${(worst.L / 1000).toFixed(2).replace('.', ',')} m, sous chaque grand côté`,
          feasible: true,
          remarks: best.result.records.some((r) => r.key === 'longrine.c90' && (r.eta ?? 0) > 0.9) ? ['prévoir une tôle sous les angles (compression transversale du bois)'] : [],
          eta: best.result.eta,
          materials: [{ label: 'Bois C24', dims: `${best.beam.b} × ${best.beam.h} × ${Math.round(worst.L)} mm`, quantity: pieces, massKg: massEach * pieces }],
          records: best.result.records,
        },
      };
    } else warnings.push('Longrines : aucune section de la liste ne suffit (6 pièces côte à côte au plus).');
  }

  const allPlates = types.every((t) => t.standard);
  // les plaques restent la solution retenue (plan de calage par type d'appui, Prüfbuch) ; les longrines seulement sur choix
  const longrineChosen = !!choices.longrine && !!longrine && !roadwayOn;
  if (choices.longrine && !longrine) warnings.push('Longrines choisies mais impossibles à calculer : les plaques sont gardées.');
  const materials = mergeMaterials(longrineChosen ? longrine!.solution.materials : types.flatMap((t) => t.chosen?.materials ?? []));
  // blocs de calage dessinés dans le modèle (posés sous les pieds), avec leur masse
  if (inp.blocks?.length) {
    const u = blockAxes(inp.modules);
    materials.unshift(
      ...mergeMaterials(
        inp.blocks.map((b) => ({ label: `Bloc de calage ${blockMaterial(b.material).name.toLowerCase()} (dessiné dans le modèle)`, dims: blockDimsText(b, u), quantity: 1, massKg: b.massKg })),
      ),
    );
    if (tuvOn && blockOf.size)
      warnings.push(`Appuis sur blocs de calage bois dessinés (${[...blockOf.keys()].map((g) => g.reaction.group.id).join(', ')}) : hors du plan de calage du Prüfbuch ${TUV.prufbuch} (plaques), à faire valider.`);
  }
  if (roadwayOn)
    materials.push({
      label: 'Plaques de roulage jointives',
      dims: `${(roadway.area / 1e6).toFixed(1).replace('.', ',')} m² à couvrir (toute l’emprise au sol)`,
      quantity: 1,
      massKg: (roadway.plates * roadway.area) / 9.81,
    });
  if (!allPlates && !longrineChosen) {
    warnings.push('Aucune solution standard pour tous les appuis : la moins mauvaise est chiffrée, une étude de répartition spécifique est nécessaire.');
    if (longrine && longrine.result.eta <= 1) warnings.push(`La variante longrines passe (η = ${fmtNumber(longrine.result.eta, 2)}) : elle peut être retenue à l’étape Sol & calage.`);
  }
  // Prüfbuch TÜV : portance minimale (Auflage 4.9) et plaques minimales du plan 18-0573-03
  const bearingOk = inp.bearing >= TUV.minBearing - 1e-9;
  const tuvList = types.map((t) => t.tuv).filter((x): x is TuvCheck => !!x);
  const tuvOk = !tuvList.length ? null : tuvList.some((x) => x.ok === false) ? false : tuvList.every((x) => x.ok === true) ? true : null;
  if (tuvOn && !bearingOk)
    warnings.push(`Prüfbuch ${TUV.prufbuch}, Auflage 4.9 : la portance admissible doit être d’au moins 200 kN/m² ; avec ${pressureText(inp.bearing)}, l’installation sort du Prüfbuch (étude spécifique du sol).`);
  if (tuvOn && tuvOk === false)
    warnings.push(`Calage inférieur au minimum du Prüfbuch ${TUV.prufbuch} (plan ${TUV.calagePlan}) pour ${types.filter((t) => t.tuv?.ok === false).map((t) => t.label).join(', ')} : ${types.find((t) => t.tuv?.ok === false)!.tuv!.text}.`);
  return {
    estimate: est,
    types,
    longrine,
    longrineChosen,
    materials,
    allPlates,
    warnings,
    checks,
    roadway,
    roadwayOn,
    ...(inp.publicLimit && publicLoad !== undefined ? { publicLimit: { ...inp.publicLimit, load: publicLoad } } : {}),
    placement: placementMode,
    tuv: { bearingOk, ok: tuvOk, tuvMinimum: tuvOn, ...(viewboxPresent ? {} : { notApplicable: true }) },
    levels: inp.levels?.length ? levelSurvey(est.reactions.map((r) => ({ id: r.group.id, position: r.group.position, jack: !!r.group.jack })), inp.levels, inp.jackMax ?? JACK_MAX_EXTENSION) : null,
  };
}

export interface PublicMax {
  /** nombre de personnes maximal pour que tous les appuis passent avec le calage choisi (sinon automatique) */
  persons: number;
  /** le public réglementaire complet passe déjà ; ne passe pas même sans public */
  full: boolean;
  empty: boolean;
  /** public réglementaire exprimé en personnes */
  fullPersons: number;
}

/** Public maximal admissible (personnes de `kg` kg) avec le sol et le calage choisis : recherche par dichotomie. */
export function maxPublic(inp: CalageInput, kg: number): PublicMax | null {
  const est = addSupports(inp.reactions ?? estimateReactions(inp.modules, inp.estimate), inp.extraSupports, inp.estimate.groupTolerance);
  if (!est.reactions.length || !est.reactions.every((r) => r.combos?.length) || !(kg > 0)) return null;
  const fullPersons = Math.ceil(fullPublic(est) / (kg * 9.81) - 1e-9);
  const ok = (persons: number) => computeCalage({ ...inp, reactions: est, extraSupports: undefined, publicLimit: { persons, kg }, noAdvice: true }).checks.every((c) => c.eta <= 1);
  if (ok(fullPersons)) return { persons: fullPersons, full: true, empty: false, fullPersons };
  if (!ok(0)) return { persons: 0, full: false, empty: true, fullPersons };
  let lo = 0;
  let hi = fullPersons;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (ok(mid)) lo = mid;
    else hi = mid;
  }
  return { persons: lo, full: false, empty: false, fullPersons };
}

/** « 2 angles », « vérin d’angle », « 2 pieds centraux »… posés sur un bloc. */
function blockTypeLabel(n: number, middle: boolean, jack: boolean, capital = false): string {
  const t = jack
    ? middle
      ? n > 1 ? `${n} vérins centraux` : 'un vérin central'
      : n > 1 ? `${n} vérins d’angle` : 'un vérin d’angle'
    : middle
      ? n > 1 ? `${n} pieds centraux` : 'un pied central'
      : n > 1 ? `${n} angles` : 'un angle';
  if (!capital) return t;
  const s = t.replace(/^un /, '');
  return s[0].toUpperCase() + s.slice(1);
}

/** Contour en plan d'un appui sur bloc : la plaque du dessous (centrée sur le bloc), sinon le bloc lui-même. */
function blockPlan(bs: BlockSupport, bottom: SpreadLayer | undefined): PlatePlan {
  const b = bs.block;
  const { u, v } = bs.geometry;
  const [u0, u1, v0, v1] = bs.rect;
  const [cu, cv] = [(u0 + u1) / 2, (v0 + v1) / 2];
  const [l, w] = bottom ? [Math.max(bottom.l, u1 - u0), Math.max(bottom.w, v1 - v0)] : [u1 - u0, v1 - v0];
  const P = (a: number, c: number): P2 => [u[0] * a + v[0] * c, u[1] * a + v[1] * c];
  return {
    placement: 'centered',
    corners: bottom ? [P(cu - l / 2, cv - w / 2), P(cu + l / 2, cv - w / 2), P(cu + l / 2, cv + w / 2), P(cu - l / 2, cv + w / 2)] : blockOutline(b),
    caps: [Infinity, Infinity],
    edgeDist: [Infinity, Infinity],
    overhang: 0,
  };
}

function materialLabel(l: SpreadLayer): string {
  if (l.material === 'commercial') return l.label;
  if (l.material === 'steel') return 'Tôle acier S235';
  return PLATE_LABEL[l.material];
}

/** Lignes de matériel identiques (même désignation et mêmes dimensions) additionnées. */
function mergeMaterials(lines: MaterialLine[]): MaterialLine[] {
  const out: MaterialLine[] = [];
  for (const m of lines) {
    const same = out.find((o) => o.label === m.label && o.dims === m.dims);
    if (same) {
      same.quantity += m.quantity;
      same.massKg += m.massKg;
    } else out.push({ ...m });
  }
  return out;
}
