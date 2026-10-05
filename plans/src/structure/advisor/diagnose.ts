// Diagnostic d'une étude calculée, comme un ingénieur qui lit la note : ce qui ne passe pas (ou passe de justesse),
// où, pourquoi (vérification et combinaison déterminantes), et les pistes pour que ça passe — chacune avec les
// modifications à simuler (le calcul complet dira si elles suffisent). Aucun chiffre inventé : les taux, efforts et
// quantités viennent du calcul ou de formules exactes (lest contre le glissement). Fonctions pures ; N, mm.
import type { StudyRun, CalcOptions } from '../studyRun';
import type { CheckItem } from '../core/results';
import type { StudyMods } from '../core/mods';
import type { Side } from '../core/templates/viewboxEU';
import type { Direction } from '../core/loads';
import { DIRECTION_LABEL } from '../core/loads';
import { SIDE_NAME } from '../core/assemble';
import { verdictOf } from '../core/records';
import { fmtNumber } from '../core/units';

/** Modifications d'une variante : hypothèses du site (clés de l'onglet Site & hypothèses), options de calcul, étude. */
export interface VariantChanges {
  hyp?: Record<string, unknown>;
  roof?: boolean;
  calc?: Partial<CalcOptions>;
  mods?: StudyMods;
}

export interface Remedy {
  id: string;
  title: string;
  detail: string;
  /** 'simulate' : modifications prêtes à simuler ; 'ballast' : quantité à chercher par le calcul ; 'info' : conseil seul */
  action: 'simulate' | 'ballast' | 'info';
  changes?: VariantChanges;
  /** Viewbox concernées (recherche de lest) */
  modules?: string[];
  /** hors du produit Viewbox de série (pièce spéciale, fabrication) */
  special?: boolean;
}

export interface Issue {
  id: string;
  severity: 'fail' | 'limit' | 'incomplete';
  title: string;
  /** éléments et Viewbox concernés */
  where: string[];
  modules: string[];
  why: string;
  remedies: Remedy[];
}

const f2 = (v: number, d = 2) => fmtNumber(v, d);
const kN = (v: number) => `${f2(v / 1e3, 1)} kN`;

/** Libellé d'une combinaison : « CO102 — 1,1 ΣG + 1,35 W1.1 (en service, x+) ». */
export function comboText(run: StudyRun, id: string): string {
  const c = run.combos.find((x) => x.id === id);
  return c ? `${id} — ${c.label}` : id;
}

/** Lest (N) nécessaire contre le glissement global : max(0 ; H / μ − V) sur les combinaisons de stabilité. */
export function slidingBallastN(run: StudyRun, mu: number): number {
  let need = 0;
  for (const c of run.combos) {
    if (c.cls !== 'STAB') continue;
    const R = run.summary.reactions[c.id];
    if (!R) continue;
    const s = R.reduce((a, r) => [a[0] + r.R[0], a[1] + r.R[1], a[2] + r.R[2]], [0, 0, 0]);
    need = Math.max(need, Math.hypot(s[0], s[2]) / mu - s[1]);
  }
  return need;
}

/** Emprise de l'installation dans ses axes x / y, hauteur, Viewbox du bas sur chaque bord (côté exposé du bord). */
export function installationShape(run: StudyRun) {
  const { axes } = run.loads;
  const s = run.structure;
  const proj = (p: readonly number[], a: readonly number[]) => p[0] * a[0] + p[2] * a[2];
  let [x0, x1, y0, y1] = [Infinity, -Infinity, Infinity, -Infinity];
  for (const n of s.fem.nodes) {
    const x = proj([n.x, n.y, n.z], axes.x);
    const y = proj([n.x, n.y, n.z], axes.y);
    [x0, x1, y0, y1] = [Math.min(x0, x), Math.max(x1, x), Math.min(y0, y), Math.max(y1, y)];
  }
  const levels = Math.max(0, ...s.modules.map((m) => m.level)) + 1;
  // bords : côtés entièrement exposés des Viewbox du bas dont la normale suit ±x ou ±y
  const edges: Record<Direction, Array<{ module: string; side: Side }>> = { 1: [], 2: [], 3: [], 4: [] };
  for (const f of s.faces) {
    const pm = s.modules.find((m) => m.id === f.module);
    if (!pm || pm.level !== 0) continue;
    const full = f.exposed.reduce((a, [p, q]) => a + q - p, 0) >= f.length - 50;
    if (!full) continue;
    const nx = proj(f.normal, axes.x);
    const ny = proj(f.normal, axes.y);
    const d: Direction | null = nx > 0.9 ? 1 : nx < -0.9 ? 2 : ny > 0.9 ? 3 : ny < -0.9 ? 4 : null;
    if (d) edges[d].push({ module: f.module, side: f.side });
  }
  return { widthX: x1 - x0, widthY: y1 - y0, height: s.topY - s.baseY, levels, edges };
}

/** Côtés d'une Viewbox dont le plan contient la direction d (contreventer contre un effort selon d). */
function sidesAlong(run: StudyRun, module: string, d: Direction): Side[] {
  const pm = run.structure.modules.find((m) => m.id === module);
  if (!pm) return [];
  const a = d <= 2 ? run.loads.axes.x : run.loads.axes.y;
  const along = Math.abs(pm.u[0] * a[0] + pm.u[2] * a[2]);
  // u parallèle à la direction : les grands côtés (v0, v1) sont dans le plan de l'effort
  return along > 0.7 ? ['v0', 'v1'] : ['u0', 'u1'];
}

const comboDirection = (run: StudyRun, id: string): Direction | undefined => run.combos.find((c) => c.id === id)?.direction;

/** Pistes pour une famille de barres ou d'assemblages trop chargée. */
function memberRemedies(run: StudyRun, items: Array<{ item: CheckItem; eta: number; combo: string; governing: string }>): Remedy[] {
  const out: Remedy[] = [];
  const first = items[0];
  const d = comboDirection(run, first.combo);
  const combo = run.combos.find((c) => c.id === first.combo);
  const wind = combo?.factors.some(([id, f]) => id.startsWith('W') && f) ?? false;
  const crowd = combo?.factors.some(([id, f]) => id.startsWith('Q') && f) ?? false;
  const modules = [...new Set(items.map((x) => x.item.module))];
  const kind = first.item.kind;
  const family = run.structure.meta[first.item.members[0]]?.family;
  // contreventement : réduit les moments de cadre des poteaux / angles et les efforts dans les liaisons
  if (d && (kind === 'corner' || family === 'column' || kind === 'vlink' || kind === 'bolt' || kind === 'jack' || family === 'foot-corner')) {
    const bracings = modules.slice(0, 4).flatMap((m) => sidesAlong(run, m, d).map((side) => ({ module: m, side })));
    out.push({
      id: 'brace',
      title: `Contreventer ${modules.slice(0, 4).join(', ')} dans la direction ${DIRECTION_LABEL[d]}`,
      detail: `Croix en plat 60 × 6 + ridoir ¾″ (statico Qatar § 3.9) sur ${bracings.map((b) => `${b.module} ${SIDE_NAME[b.side]}`).join(', ')} : le cadre ne travaille plus seul en flexion. La face contreventée est fermée (mur, pas de porte ni de vitrage).`,
      action: 'simulate',
      changes: { mods: { bracings } },
    });
  }
  if (crowd && !wind) out.push({ id: 'public', title: 'Réduire la charge d’exploitation', detail: 'Le cas déterminant est la foule : limiter le public (charge d’exploitation plus faible, justifiée par un nombre de personnes) ou fermer la toiture au public.', action: 'simulate', changes: { hyp: { live: 2.5 }, roof: false } });
  if (wind) out.push({ id: 'wind', title: 'Consigne de vent', detail: `Le cas déterminant comprend le vent (${comboText(run, first.combo)}) : une vitesse d’arrêt plus basse ou une évacuation plus tôt réduit l’effort en service ; hors service, seul le renfort de la structure ou le lest aide.`, action: 'info' });
  if (kind === 'jack') {
    const e = 30;
    out.push({ id: 'jack', title: `Sortir moins les vérins (${e / 10} cm)`, detail: 'La tige Tr 24 travaille en console : le moment vaut H × sortie. Caler plus haut (plaques) pour sortir les tiges de moins de 5 cm, ou poser les angles directement sur le calage.', action: 'simulate', changes: { calc: { jackExtension: e } } });
    out.push({ id: 'nojack', title: 'Sans vérins : angles posés sur le calage', detail: 'Comme statico Hoka : les angles reposent directement sur les plaques de calage.', action: 'simulate', changes: { calc: { jacks: false } } });
  }
  if (kind === 'vlink' || kind === 'stack') {
    const T = first.governing.startsWith('T');
    out.push({
      id: 'plates',
      title: T ? 'Plus de plats d’empilement (soulèvement)' : 'Plus de plats d’empilement',
      detail: 'Passer à 6 plats par grand côté et 3 par petit côté sur les faces extérieures (perçages et écrous à prévoir). Un angle enfermé entre d’autres Viewbox n’a pas de plat : l’ouvrir sur l’extérieur ou contreventer.',
      action: 'simulate',
      special: true,
      changes: { mods: { stackPlates: { perLongSide: 6, perShortSide: 3 } } },
    });
    // pas de lest sur la Viewbox du dessus : statico 18-0573 § 5.3, lest seulement au rez-de-chaussée
    out.push({
      id: 'brace-stack',
      title: T ? 'Contreventer la Viewbox du dessus (soulèvement)' : 'Contreventer la Viewbox du dessus',
      detail: 'Le lest n’est admis que dans les Viewbox du rez-de-chaussée (statico 18-0573 § 5.3) : contre le soulèvement ou le glissement de la Viewbox du dessus, ajouter des plats d’empilement ou contreventer ses côtés.',
      action: 'info',
    });
  }
  if (kind === 'bolt')
    out.push({ id: 'bolt', title: 'Boulon supplémentaire entre les Viewbox', detail: 'Ajouter une position de boulon (perçage sur site, comme statico Qatar § 3.8) : le calcul compte les M16 × 150 classe 10.9 dans les écrous M20 soudés.', action: 'info' });
  if (family === 'raise-column') out.push({ id: 'raise', title: 'Poteaux de surélévation plus forts ou contreventés', detail: 'Choisir une section plus forte (tube carré plus épais ou plus large, acier S355) ou ajouter des croix entre les poteaux.', action: 'info' });
  if (family === 'column' || family === 'rim-floor' || family === 'rim-roof' || family === 'secondary-floor' || family === 'secondary-roof')
    out.push({ id: 'section', title: 'Renfort de la barre (Viewbox spéciale)', detail: `Pièce de série de la Viewbox : un renfort (section plus forte) demande une fabrication spéciale ; préférer d’abord contreventement, lest ou réduction des charges.`, action: 'info', special: true });
  return out;
}

export function diagnose(run: StudyRun, opts: { friction: number }): Issue[] {
  const issues: Issue[] = [];
  const { index, summary, verdict, stability } = run;
  const shape = installationShape(run);

  // ─── familles de vérifications ───
  for (const fam of verdict.families) {
    if (fam.verdict === 'ok') continue;
    const rows = index.items
      .map((item, t) => ({ item, t, st: summary.states[t] }))
      .filter((x) => x.item.family === fam.family && x.st)
      .sort((a, b) => (b.st!.eta || 0) - (a.st!.eta || 0));
    const blocked = rows.filter((r) => r.st!.blocked);
    if (fam.verdict === 'incomplete' && blocked.length) {
      issues.push({
        id: `blocked:${fam.family}`,
        severity: 'incomplete',
        title: `${fam.family} : vérification impossible`,
        where: blocked.slice(0, 5).map((r) => r.item.label),
        modules: [...new Set(blocked.map((r) => r.item.module))],
        why: [...new Set(blocked.map((r) => r.st!.blocked!))].slice(0, 3).join(' ; '),
        remedies: [{ id: 'data', title: 'Compléter les données', detail: 'Renseigner la capacité ou la section manquante dans Réglages › Bibliothèque structure, ou corriger la reconnaissance.', action: 'info' }],
      });
      continue;
    }
    const over = rows.filter((r) => r.st!.eta > (fam.verdict === 'fail' ? 1 : 0.9));
    if (!over.length) continue;
    const w = over[0];
    const list = over.map((r) => ({ item: r.item, eta: r.st!.eta, combo: r.st!.combo, governing: r.st!.governing }));
    issues.push({
      id: `family:${fam.family}`,
      severity: fam.verdict === 'fail' ? 'fail' : 'limit',
      title: `${fam.family} : η max ${f2(w.st!.eta)} (${over.length} élément(s) au-dessus de ${fam.verdict === 'fail' ? '1,00' : '0,90'})`,
      where: over.slice(0, 6).map((r) => `${r.item.label} (η ${f2(r.st!.eta)})`),
      modules: [...new Set(over.map((r) => r.item.module))],
      why: `Vérification déterminante « ${w.st!.governing} », combinaison ${comboText(run, w.st!.combo)}.`,
      remedies: memberRemedies(run, list),
    });
  }

  // ─── calcul impossible pour certaines combinaisons (mécanisme, instabilité) ───
  const ulsErr = summary.errors.filter((e) => e.cls === 'ULS');
  if (ulsErr.length) {
    const e = ulsErr[0];
    const d = comboDirection(run, e.combo);
    const mods = [...new Set(e.nodes.map((n) => n.split(':')[0]))].filter((m) => run.structure.modules.some((x) => x.id === m));
    issues.push({
      id: 'fem-error',
      severity: 'fail',
      title: `Structure instable dans ${ulsErr.length} combinaison(s)`,
      where: mods.length ? mods : e.nodes.slice(0, 5),
      modules: mods,
      why: `${comboText(run, e.combo)} : ${e.message}`,
      remedies: d && mods.length ? [{ id: 'brace-err', title: 'Contreventer la zone instable', detail: 'Ajouter des croix dans les côtés concernés.', action: 'simulate', changes: { mods: { bracings: mods.slice(0, 3).flatMap((m) => sidesAlong(run, m, d).map((side) => ({ module: m, side }))) } } }] : [],
    });
  }

  // ─── stabilité d'ensemble ───
  const ground = run.structure.modules.filter((m) => m.level === 0).map((m) => m.id);
  if (stability.overturning.verdict === 'fail') {
    const dirs = [...new Set(stability.overturning.combos.map((c) => comboDirection(run, c)).filter((d): d is Direction => !!d))];
    const narrow: 'x' | 'y' = shape.widthX < shape.widthY ? 'x' : 'y';
    const remedies: Remedy[] = [{ id: 'ballast-overturn', title: 'Lest sur les Viewbox du bas', detail: 'Le lest (blocs béton sur les planchers du bas) augmente le moment stabilisant ; la quantité est cherchée par le calcul de stabilité.', action: 'ballast', modules: ground }];
    // élargir la base : une Viewbox contre chaque bord exposé dans la direction étroite
    const [dPlus, dMinus] = narrow === 'x' ? ([1, 2] as const) : ([3, 4] as const);
    const plus = shape.edges[dPlus].slice(0, 3);
    const minus = shape.edges[dMinus].slice(0, 3);
    if (plus.length || minus.length) {
      let n = 1;
      const added = [...plus, ...minus].map((e) => ({ id: `VBX-N${n++}`, from: e.module, side: e.side }));
      remedies.push({
        id: 'widen',
        title: `Élargir la base : ${added.length} Viewbox au sol de part et d’autre (direction ${narrow})`,
        detail: `Installation de ${f2(shape.widthX / 1e3)} × ${f2(shape.widthY / 1e3)} m pour ${f2(shape.height / 1e3)} m de haut : une base plus large dans la direction ${narrow} éloigne l’arête de basculement. Viewbox ajoutées contre ${added.map((a) => `${a.from} (${SIDE_NAME[a.side as Side]})`).join(', ')}.`,
        action: 'simulate',
        changes: { mods: { addedModules: added } },
      });
    }
    remedies.push({ id: 'anchor', title: 'Ancrage au sol', detail: 'Ancrages (pieux, dalle) dimensionnés par un ingénieur : non modélisés par l’outil.', action: 'info' });
    if (shape.levels > 1) remedies.push({ id: 'evacuate', title: 'Réduire la prise au vent', detail: 'Moins de faces fermées en hauteur (bâches retirées hors service) ou un niveau de moins.', action: 'info' });
    issues.push({
      id: 'overturning',
      severity: 'fail',
      title: `Basculement sous le vent hors service${dirs.length ? ` (${dirs.map((d) => DIRECTION_LABEL[d]).join(', ')})` : ''}`,
      where: stability.overturning.combos.map((c) => comboText(run, c)),
      modules: ground,
      why: stability.overturning.text,
      remedies,
    });
  }
  if (stability.sliding.eta > 0.9) {
    const need = slidingBallastN(run, opts.friction);
    const kg = Math.ceil(need / 9.81 / 50) * 50;
    const per = ground.length ? Math.ceil(kg / ground.length / 50) * 50 : 0;
    const remedies: Remedy[] = [];
    if (need > 0 && ground.length)
      remedies.push({
        id: 'ballast-slide',
        title: `Lest : ${f2(kg, 0)} kg au total (${f2(per, 0)} kg par Viewbox du bas)`,
        detail: `Lest nécessaire = H / μ − V = ${kN(need)} avec μ = ${f2(opts.friction)} (formule exacte, statico § 4), réparti sur ${ground.length} Viewbox posées au sol.`,
        action: 'simulate',
        changes: { mods: { ballast: ground.map((module) => ({ module, kg: per })) } },
      });
    if (opts.friction < 0.6)
      remedies.push({ id: 'friction', title: 'Frottement 0,6 (bois sur béton, couches vissées)', detail: 'DIN EN 13814 tab. 3 / statico 18-0573 § 4 : μ 0,6 entre bois et béton ou asphalte si les couches de bois sont vissées entre elles et au pied.', action: 'simulate', changes: { calc: { friction: 0.6 } } });
    else remedies.push({ id: 'friction', title: 'Frottement plus élevé (tapis anti-glisse)', detail: 'Au-delà de μ 0,6 : tapis caoutchouc certifiés sous le calage, à justifier par la fiche du fabricant.', action: 'info' });
    remedies.push({ id: 'stops', title: 'Butées ou ancrages', detail: 'Butées contre un élément fixe ou ancrages : non modélisés.', action: 'info' });
    issues.push({
      id: 'sliding',
      severity: stability.sliding.eta > 1 ? 'fail' : 'limit',
      title: `Glissement global : μ requis ${f2(stability.sliding.muReq)} pour μ ${f2(opts.friction)} (η ${f2(stability.sliding.eta)})`,
      where: [comboText(run, stability.sliding.combo)],
      modules: ground,
      why: 'Le vent hors service pousse l’installation ; seul le frottement sous les appuis la retient (poids × μ).',
      remedies,
    });
  }
  if (run.plywood.eta > 0.9 || run.plywood.blocked)
    issues.push({
      id: 'plywood',
      severity: run.plywood.blocked ? 'incomplete' : verdictOf(run.plywood.eta) === 'fail' ? 'fail' : 'limit',
      title: `Plancher contreplaqué : η ${f2(run.plywood.eta)}`,
      where: ['Planchers'],
      modules: [],
      why: run.plywood.blocked ?? 'Bande de plancher entre traverses sous la charge d’exploitation.',
      remedies: [{ id: 'live', title: 'Charge d’exploitation plus faible', detail: 'Réduire la charge d’exploitation (public limité) ou ajouter une couche de contreplaqué (non modélisé).', action: 'simulate', changes: { hyp: { live: 2.5 } } }],
    });
  const order = { fail: 0, incomplete: 1, limit: 2 } as const;
  return issues.sort((a, b) => order[a.severity] - order[b.severity]);
}
