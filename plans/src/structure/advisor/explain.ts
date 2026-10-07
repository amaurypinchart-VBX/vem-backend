// Fiche d'une Viewbox dans les résultats : pourquoi elle a sa couleur (vérification déterminante dite en mots simples,
// cas de charge, endroit), ce qui arrive si le taux dépasse 1, les causes reconnues dans le calcul (appui du milieu
// excentré, vent, foule, Viewbox au-dessus…), les pistes à simuler et, pour situer, les taux des études statico de
// référence. Aucun chiffre inventé : les taux, réactions et moments viennent du calcul ; les repères statico sont
// ceux relevés dans les notes 18-0573, 24-0569 (Qatar) et 24-0571 (Hoka). Fonctions pures ; N, mm.
import type { StudyRun } from '../studyRun';
import type { CheckItem, ItemState } from '../core/results';
import type { MemberFamily } from '../core/assemble';
import { FAMILY_LABEL } from '../core/assemble';
import { DIRECTION_LABEL } from '../core/loads';
import { verdictOf } from '../core/records';
import { fmtNumber } from '../core/units';
import type { Remedy } from './diagnose';
import { comboText, diagnose } from './diagnose';

/** Couleur de la vue 3D (mêmes seuils que `etaColor`). */
export type EtaBand = 'green' | 'yellow' | 'orange' | 'red' | 'blocked';

export const BAND_TEXT: Record<EtaBand, string> = {
  green: 'Vert (η ≤ 0,50) : la pièce la plus chargée travaille à moins de la moitié de sa capacité — large réserve.',
  yellow: 'Jaune (0,50 < η ≤ 0,90) : passe avec une réserve normale.',
  orange: 'Orange (0,90 < η ≤ 1,00) : passe, mais de justesse — aucune réserve si une charge est mal connue (poids d’un mur, public, vent).',
  red: 'Rouge (η > 1,00) : ne passe pas — la pièce est plus chargée que ce qu’elle peut reprendre avec les coefficients de sécurité.',
  blocked: 'Violet : vérification impossible (donnée manquante ou structure instable dans un cas de charge).',
};

export function bandOf(eta: number | undefined): EtaBand {
  if (eta === undefined || !Number.isFinite(eta)) return 'blocked';
  return eta <= 0.5 ? 'green' : eta <= 0.9 ? 'yellow' : eta <= 1 ? 'orange' : 'red';
}

/** Catégorie d'une vérification : type d'assemblage, sinon famille de la barre. */
export type CheckCategory = Exclude<CheckItem['kind'], 'member'> | MemberFamily;

export function categoryOf(run: StudyRun, item: CheckItem): CheckCategory {
  if (item.kind !== 'member') return item.kind;
  return run.structure.meta[item.members[0]]?.family ?? 'rim-floor';
}

export interface CheckExplain {
  /** indice de la vérification (ItemIndex.items) */
  t: number;
  item: CheckItem;
  state: ItemState;
  category: CheckCategory;
  /** ce qu'est la pièce */
  what: string;
  /** ce que mesure la vérification déterminante */
  check: string;
  /** cas de charge déterminant, en mots simples */
  scenario: string;
  /** ce qui arrive si le taux dépasse 1 */
  risk: string;
  /** pour situer : taux des études statico de référence */
  statico?: string;
}

export interface ModuleExplain {
  module: string;
  level: number;
  eta: number;
  band: EtaBand;
  /** comment la Viewbox est posée (appuis du calcul) */
  supports: string;
  worst: CheckExplain | null;
  /** causes reconnues dans le calcul, en mots simples */
  causes: string[];
  /** une ligne par famille de vérifications de cette Viewbox, la plus chargée d'abord */
  families: CheckExplain[];
  remedies: Remedy[];
}

const f2 = (v: number, d = 2) => fmtNumber(v, d);
const kN = (v: number) => `${f2(v / 1e3, 1)} kN`;

const WHAT: Partial<Record<CheckCategory, string>> = {
  'rim-floor': 'Rive de plancher : le profil en U (UNP 220) qui fait le tour du plancher. Elle porte le plancher, les murs et vitrages posés dessus, et descend tout vers les angles et les pieds.',
  'rim-roof': 'Rive de toiture : le profil en U (UNP 220) qui fait le tour du toit. Elle porte le toit et, quand une Viewbox est posée dessus, ses angles.',
  'secondary-floor': 'Traverse ou lisse du plancher (tube RHP 120 × 60) : barre intérieure qui porte le contreplaqué du plancher entre les rives.',
  'secondary-roof': 'Traverse ou lisse du toit (tube RHP 120 × 60) : barre intérieure du toit entre les rives.',
  column: 'Poteau d’angle (tube carré QHP 100 × 5) : il descend le poids des étages et, avec les assemblages d’angle, fait travailler la Viewbox en cadre contre le vent.',
  'foot-corner': 'Réception de pied d’angle : pièce soudée sous l’angle qui reçoit le vérin ou la cale.',
  'foot-plate': 'Plat de réception : plat soudé qui relie la réception de pied aux deux rives.',
  'foot-middle': 'Réception centrale : pièce soudée au milieu du grand côté, à l’intérieur de la rive, qui reçoit le vérin ou la cale du milieu.',
  corner: 'Assemblage d’angle poteau / rive (platine et 4 boulons M16 en haut et en bas du poteau) : c’est lui qui rend le cadre de la Viewbox rigide.',
  vlink: 'Liaison verticale entre Viewbox empilées : angle du dessus posé sur l’angle du dessous, retenu par les plats d’empilement.',
  stack: 'Plats d’empilement (100 × 10, 2 × M20) entre la Viewbox du dessus et celle du dessous : ils l’empêchent de glisser.',
  bolt: 'Boulon M16 × 150 classe 10.9 entre deux Viewbox côte à côte (dans les écrous M20 soudés).',
  jack: 'Tige filetée du pied à vérin (Tr 24 × 5).',
  brace: 'Croix de contreventement ajoutée (plat 60 × 6 + ridoir).',
  'raise-column': 'Poteau de surélévation sous la Viewbox.',
  'raise-bracing': 'Croix entre les poteaux de surélévation.',
  stairhook: 'Crochets qui accrochent les limons de l’escalier au palier.',
  stairlink: 'Attache du palier d’escalier à la Viewbox.',
  stairjack: 'Vérin Layher sous un montant de l’escalier.',
};

const RISK: Partial<Record<CheckCategory, string>> = {
  'rim-floor': 'la rive se déforme durablement (elle vrille ou plie) : le plancher s’affaisse à cet endroit, portes et vitrages posés dessus peuvent coincer ou casser. Pas de rupture brutale, mais la Viewbox est abîmée.',
  'rim-roof': 'la rive de toit se déforme durablement ; si une Viewbox est posée dessus, son angle s’enfonce.',
  'secondary-floor': 'le plancher fléchit trop et se déforme durablement.',
  'secondary-roof': 'le toit fléchit trop et se déforme durablement.',
  column: 'risque majeur : un poteau comprimé qui flambe plie d’un coup, l’angle de la Viewbox et tout ce qui est au-dessus s’affaisse.',
  'foot-corner': 'la pièce soudée plie ou la soudure se fissure : l’angle s’affaisse sur son vérin ou sa cale.',
  'foot-plate': 'le plat se plie ou la soudure se fissure : l’angle s’affaisse sur son vérin ou sa cale.',
  'foot-middle': 'la réception plie ou sa soudure se fissure : le milieu du grand côté s’affaisse sur son vérin ou sa cale.',
  corner: 'la platine plie ou les M16 cèdent : le cadre perd sa rigidité et la Viewbox se met en parallélogramme sous le vent.',
  vlink: 'l’angle s’écrase, ou la Viewbox du dessus se soulève sous le vent (elle peut se décoller et basculer).',
  stack: 'la Viewbox du dessus glisse sur celle du dessous.',
  bolt: 'le boulon casse : les Viewbox voisines ne travaillent plus ensemble.',
  jack: 'la tige du vérin plie : l’appui s’affaisse.',
  brace: 'la croix ou le ridoir cède : le contreventement ne travaille plus.',
  'raise-column': 'le poteau de surélévation flambe : la Viewbox s’affaisse.',
  stairhook: 'l’escalier se décroche du palier — danger pour les personnes.',
  stairlink: 'le palier se détache de la Viewbox — danger pour les personnes.',
  stairjack: 'le vérin de l’escalier plie — l’escalier s’affaisse.',
};

/** Repères statico (notes de lecture 18-0573, Qatar 24-0569, Hoka 24-0571) — pour situer, pas des valeurs comparables une à une. */
const STATICO: Partial<Record<CheckCategory, string>> = {
  'rim-floor':
    'statico 18-0573 (calcul de type du livre TÜV) : rives UNP η 0,63 ; Qatar 24-0569 : rive B404 η 0,90 en flexion (Viewbox du dessus posée en T). statico pose les Viewbox sur leurs 4 angles seulement (Hoka et Qatar : « Fußspindeln dürfen nicht verwendet werden … Ecken direkt unterpallen ») : aucun appui au milieu, donc jamais de torsion de la rive par un pied central dans ses calculs.',
  'rim-roof': 'statico 18-0573 : rives UNP η 0,63 ; Qatar 24-0569 : rive la plus chargée η 0,90.',
  'secondary-floor': 'statico 18-0573 : traverses η 0,50.',
  'secondary-roof': 'statico 18-0573 : traverses η 0,50.',
  column: 'statico 18-0573 : poteaux η 0,69 ; Qatar 24-0569 : poteau B107 η 0,76.',
  corner: 'statico 18-0573 : angle η 0,67, M16 d’angle η 0,84 ; Qatar 24-0569 : angles η 0,96.',
  'foot-corner': 'statico 18-0573 § 3.1.4 : réception de vérin (Spindelaufnahme) η 0,54.',
  'foot-plate': 'statico 18-0573 § 3.1.4 : réception de vérin (Spindelaufnahme) η 0,54.',
  'foot-middle': 'statico 18-0573 § 3.1.4 : réception de vérin η 0,54 ; Hoka et Qatar : vérins des Viewbox interdits, pas d’appui au milieu.',
  vlink: 'Qatar 24-0569 : plats verticaux η 0,81 (8 plats, 2 par côté).',
  stack: 'Qatar 24-0569 : plats verticaux η 0,81 (8 plats, 2 par côté).',
  bolt: 'statico 18-0573 : boulons horizontaux η 0,34.',
  jack: 'Hoka et Qatar : vérins des Viewbox interdits (angles posés directement sur le calage) ; Qatar admet 5 cm de sortie au plus.',
  brace: 'statico 18-0573 : contreventement 60 × 6 + ridoir 39,8 kN, η 0,98 à 1,00.',
  stairhook: 'Qatar 24-0569 : escalier η 0,93.',
  stairlink: 'Qatar 24-0569 : escalier η 0,93.',
  stairjack: 'statico 18-0573 : vérin Layher 60 η 0,50.',
  'stair-stringer': 'Qatar 24-0569 : limon η 0,93 (dont torsion 0,91).',
};

/** Ce que mesure la vérification déterminante, en mots simples. */
function checkText(category: CheckCategory, item: CheckItem, st: ItemState): string {
  const g = st.governing;
  if (st.blocked || g === 'bloqué') return `Vérification impossible : ${st.blocked ?? 'donnée manquante'}.`;
  if (item.kind === 'member') {
    // profils en U du gabarit (rives UNP 220, limons et cadre de palier en U plié), réceptions en T
    const open = ['rim-floor', 'rim-roof', 'stair-stringer', 'stair-landing', 'foot-corner', 'foot-middle'].includes(category);
    if (g === 'T')
      return `Torsion : la barre est vrillée sur elle-même. Ça arrive quand une charge ou un appui est décalé par rapport à l’axe de la barre.${open ? ' Un profil ouvert (U, T) résiste très mal à la torsion : il est fait pour plier, pas pour tourner.' : ''}`;
    if (g === '6.61' || g === '6.62') return 'Flambement : la barre est comprimée et pliée en même temps ; elle risque de se dérober d’un coup sur le côté.';
    if (g === '6.54') return 'Déversement : la barre pliée risque de se coucher sur le côté (profil ouvert peu tenu latéralement).';
    if (g === 'Vz' || g === 'Vy') return 'Effort tranchant : la barre est cisaillée près d’un appui ou d’une charge concentrée.';
    if (g === 'My') return 'Flexion verticale : la barre plie vers le bas sous les charges.';
    if (g === 'Mz') return 'Flexion de côté : la barre plie dans le plan horizontal.';
    if (g === 'N') return 'Effort normal : la barre est très comprimée ou tirée.';
    return 'Résistance de la section : flexion et effort normal ensemble, au point le plus chargé de la barre (contrainte comparée à la limite de l’acier).';
  }
  if (item.kind === 'corner') return g.startsWith('M') ? 'Moment dans l’assemblage d’angle : le cadre travaille en portique (vent, défaut d’aplomb, charges décalées) et l’angle fait plier la platine et tire sur les M16.' : g === 'N traction' ? 'Traction dans le poteau à l’assemblage d’angle (soulèvement).' : 'Compression transmise par contact à l’angle.';
  if (item.kind === 'vlink') return g.startsWith('T') ? 'Soulèvement : le vent cherche à soulever la Viewbox du dessus ; seuls les plats d’empilement la retiennent.' : 'Compression de l’angle du dessus posé sur celui du dessous.';
  if (item.kind === 'stack') return 'Glissement : le vent pousse la Viewbox du dessus ; les plats d’empilement (et le frottement) la retiennent.';
  if (item.kind === 'bolt') return g === 'T' ? 'Traction du boulon entre les deux Viewbox.' : 'Cisaillement et traction du boulon entre les deux Viewbox.';
  if (item.kind === 'jack') return 'Tige du vérin : compression et flexion — l’effort horizontal fait plier la partie de tige qui dépasse.';
  if (item.kind === 'brace') return 'Traction dans la croix : elle retient le cadre contre le vent.';
  return g;
}

const CASE_WORDS: Array<[RegExp, string]> = [
  [/^GB$/, 'le lest'],
  [/^G/, 'le poids propre (Viewbox, murs, vitrages, plafond…)'],
  [/^Q1\./, 'le public sur les planchers'],
  [/^Q2\./, 'les charges d’exploitation laissées hors service'],
  [/^W1\./, 'le vent en service (jusqu’à la vitesse d’arrêt)'],
  [/^W2\./, 'la tempête hors service (installation fermée, vent de calcul du site)'],
  [/^W0$/, 'l’aspiration du vent sur les toits'],
  [/^S$/, 'la neige'],
];

/** Cas de charge en mots simples : « poids propre + public + vent en service, direction x+ (charges majorées…) ». */
export function scenarioText(run: StudyRun, comboId: string): string {
  const c = run.combos.find((x) => x.id === comboId);
  if (!c) return comboId;
  const words: string[] = [];
  const empty = (id: string) => {
    const lc = run.loads.cases.find((x) => x.id === id);
    return !lc || (!lc.nodal.length && !lc.member.length);
  };
  for (const [id, f] of c.factors) {
    if (!f || empty(id)) continue;
    const w = CASE_WORDS.find(([re]) => re.test(id))?.[1];
    if (w && !words.includes(w)) words.push(w);
  }
  const dir = c.direction ? `, direction ${DIRECTION_LABEL[c.direction]}` : '';
  const cls = c.cls === 'ULS' ? 'charges majorées par les coefficients de sécurité, défaut d’aplomb 1/200' : c.cls === 'STAB' ? 'vérification de stabilité' : 'charges réelles (service)';
  return `${comboText(run, comboId)} — ${words.join(' + ')}${dir} (${cls}).`;
}

function explainCheck(run: StudyRun, t: number): CheckExplain | null {
  const item = run.index.items[t];
  const state = run.summary.states[t];
  if (!item || !state) return null;
  const category = categoryOf(run, item);
  const fam = item.kind === 'member' ? (run.structure.meta[item.members[0]]?.family as MemberFamily | undefined) : undefined;
  return {
    t,
    item,
    state,
    category,
    what: WHAT[category] ?? `${fam ? FAMILY_LABEL[fam] : item.family}.`,
    check: checkText(category, item, state),
    scenario: scenarioText(run, state.combo),
    risk: `Si η dépasse 1 : ${RISK[category] ?? 'la pièce est trop sollicitée — déformation durable ou rupture.'}`,
    statico: STATICO[category],
  };
}

/** Réaction verticale (N, vers le haut) de chaque appui de la Viewbox dans une combinaison. */
function moduleReactions(run: StudyRun, module: string, comboId: string, kind?: string): Array<{ k: number; Rz: number; lifted: boolean }> {
  const s = run.structure;
  const R = run.summary.reactions[comboId] ?? [];
  const out: Array<{ k: number; Rz: number; lifted: boolean }> = [];
  s.supportMeta.forEach((m, k) => {
    if (m.module !== module || (kind && m.kind !== kind)) return;
    const node = s.fem.supports[k]?.node;
    const r = R.find((x) => x.node === node);
    if (r) out.push({ k, Rz: r.R[1], lifted: r.lifted });
  });
  return out;
}

/** Fiche d'une Viewbox (null si le calcul ne la connaît pas). */
export function explainModule(run: StudyRun, module: string, opts: { friction: number }): ModuleExplain | null {
  const pm = run.structure.modules.find((m) => m.id === module);
  const rows = run.index.items.map((it, t) => ({ it, t })).filter((x) => x.it.module === module && run.summary.states[x.t]);
  if (!pm && !rows.length) return null;
  const etaOf = (t: number) => run.summary.states[t]?.eta ?? Infinity;
  rows.sort((a, b) => etaOf(b.t) - etaOf(a.t));
  // une ligne par famille, la plus chargée d'abord
  const seen = new Set<string>();
  const families: CheckExplain[] = [];
  for (const r of rows) {
    if (seen.has(r.it.family)) continue;
    seen.add(r.it.family);
    const e = explainCheck(run, r.t);
    if (e) families.push(e);
  }
  const worst = families[0] ?? null;
  const eta = worst ? worst.state.eta : 0;

  // ─── appuis ───
  const level = pm?.level ?? 0;
  const metas = run.structure.supportMeta.filter((m) => m.module === module);
  const middle = metas.filter((m) => m.kind === 'middle').length;
  const jacks = metas.some((m) => m.jack);
  const offset = pm?.params.footOffset ?? 155;
  const middleNodes = run.structure.fem.supports.filter((_, k) => run.structure.supportMeta[k]?.module === module && run.structure.supportMeta[k]?.kind === 'middle').map((sp) => sp.node);
  const underRim = middleNodes.length > 0 && middleNodes.every((n) => isRimNode(run, module, n));
  const below = run.structure.modules.filter((m) => m.level === level - 1).length;
  let supports: string;
  if (level > 0) supports = `Viewbox à l’étage (niveau ${level}) : posée par ses angles sur la Viewbox du dessous${below ? '' : ' (ou sur des appuis ajoutés)'}.`;
  else if (!metas.length) supports = 'Pas d’appui au sol propre à cette Viewbox dans le calcul.';
  else
    supports = `Posée au sol sur ${metas.length} points : ${metas.length - middle} angle${metas.length - middle > 1 ? 's' : ''}${middle ? ` + ${middle} au milieu des grands côtés` : ''}${jacks ? ', sur pieds à vérin' : ', calés directement'}.${
      middle ? (underRim ? ' Cales du milieu directement sous la rive (UNP).' : ` Appuis du milieu sous la réception centrale, ${f2(offset, 0)} mm à l’intérieur de la rive.`) : ' Pas d’appui au milieu des grands côtés (comme statico).'
    }`;

  // ─── causes reconnues ───
  const causes: string[] = [];
  if (worst) {
    const c = run.combos.find((x) => x.id === worst.state.combo);
    const wind = c?.factors.some(([id, f]) => id.startsWith('W') && f) ?? false;
    // public = exploitation en service (Q1) ; hors service (Q2) l'installation est fermée
    const crowd = c?.factors.some(([id, f]) => id.startsWith('Q1') && f) ?? false;
    if (worst.category === 'rim-floor' && worst.state.governing === 'T' && middle && !underRim) {
      const rs = moduleReactions(run, module, worst.state.combo, 'middle').filter((r) => !r.lifted);
      const R = Math.max(0, ...rs.map((r) => r.Rz));
      causes.push(
        `La rive est tordue par l’appui du milieu : le ${jacks ? 'vérin' : 'calage'} du milieu porte sous la réception centrale, ${f2(offset, 0)} mm à l’intérieur de la rive. ` +
          (R > 0 ? `Sa réaction (${kN(R)} dans ce cas) fait tourner l’UNP sur lui-même (≈ ${kN(R)} × ${f2(offset / 1000, 3)} m = ${f2((R * offset) / 1e6, 2)} kNm) ` : 'Sa réaction fait tourner l’UNP sur lui-même ') +
          'entre les deux traverses les plus proches, de part et d’autre du milieu. Un U ouvert résiste mal à la torsion. Sans appui au milieu, ou avec la cale directement sous l’UNP, la rive ne travaille plus qu’en flexion.',
      );
    }
    if (crowd && !wind) causes.push('Le cas le plus défavorable est le public : la charge d’exploitation des planchers (5,0 kN/m² au rez-de-chaussée, 3,5 aux étages, statico 18-0573) pèse le plus sur cette pièce.');
    if (crowd && wind) causes.push('Le cas le plus défavorable cumule le public et le vent en service.');
    if (wind && !crowd) causes.push(c?.service === 'out' ? 'Le cas le plus défavorable est la tempête hors service (installation fermée) : seul le renfort de la structure ou le lest aide.' : 'Le cas le plus défavorable est le vent en service : une vitesse d’arrêt plus basse réduit l’effort.');
    if (level === 0 && run.structure.modules.some((m) => m.level === 1 && m.id !== module) && ['column', 'corner', 'rim-roof', 'vlink'].includes(worst.category))
      causes.push('Cette Viewbox est au rez-de-chaussée d’un ensemble à étage : ses poteaux et angles reçoivent aussi le poids et le vent des Viewbox du dessus.');
    if (run.structure.meta.some((m) => m.family === 'stair-link' && m.label.includes(`/ ${module} `)))
      causes.push('Un escalier est attaché à cette Viewbox : son palier lui transmet une partie du poids et des efforts horizontaux de l’escalier.');
  }

  // ─── pistes ───
  const remedies: Remedy[] = [];
  const add = (r: Remedy) => {
    if (!remedies.some((x) => x.id === r.id)) remedies.push(r);
  };
  if (worst && worst.category === 'rim-floor' && worst.state.governing === 'T' && middle && !underRim) {
    if (!jacks)
      add({
        id: 'middle-under-rim',
        title: 'Caler le milieu directement sous l’UNP',
        detail: 'La cale du milieu sous la rive (et non sous la réception centrale) supprime la torsion. Si c’est déjà la pratique sur chantier, cocher « Cale du milieu sous la rive » à l’étape 3.',
        action: 'simulate',
        changes: { calc: { middleUnderRim: true } },
      });
    else
      add({
        id: 'middle-under-rim-nojack',
        title: 'Sans vérins : caler les 6 points, le milieu directement sous l’UNP',
        detail: 'Les angles posés sur le calage (comme statico) et la cale du milieu sous la rive : plus de torsion de la rive par le pied central.',
        action: 'simulate',
        changes: { calc: { jacks: false, middleUnderRim: true }, hyp: { middleFeet: true } },
      });
    add({
      id: 'corners-only',
      title: 'Ne pas caler le milieu (4 angles seuls, comme statico)',
      detail: 'La rive ne travaille plus qu’en flexion ; en contrepartie les angles portent tout le poids (calage des angles à revoir).',
      action: 'simulate',
      changes: { calc: { jacks: false }, hyp: { middleFeet: false } },
    });
  }
  if (worst && eta > 0.9)
    for (const issue of diagnose(run, { friction: opts.friction })) if (issue.modules.includes(module)) for (const r of issue.remedies) add(r);

  return { module, level, eta, band: bandOf(worst ? eta : 0), supports, worst, causes, families, remedies };
}

/** Le nœud d'appui est-il un nœud de rive (cale sous l'UNP) plutôt que la réception centrale ? */
function isRimNode(run: StudyRun, module: string, node: number): boolean {
  return run.structure.fem.members.some((b, k) => (b.i === node || b.j === node) && run.structure.meta[k]?.module === module && run.structure.meta[k]?.family === 'rim-floor');
}

/** Taux → verdict lisible (✅ ⚠️ ❌ ⛔). */
export function etaIcon(eta: number | undefined): string {
  const v = verdictOf(eta);
  return v === 'ok' ? '✅' : v === 'limit' ? '⚠️' : eta === undefined || !Number.isFinite(eta) ? '⛔' : '❌';
}
