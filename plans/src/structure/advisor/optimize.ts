// Optimiseur de l'étude (phase S10d) : à partir d'un calcul qui ne passe pas, cherche les changements les plus petits
// qui le font passer (η ≤ taux cible, 1,00 par défaut = taux maximal admissible). Leviers : section supérieure dans la
// même famille (catalogue ordonné par masse), nuance supérieure, contreplaqué plus épais, et les pistes chiffrées du
// diagnostic (contreventement, plats d'empilement, lest, base élargie, vérins…). Chaque essai est recalculé (une
// section plus rigide attire plus d'effort) : d'abord sur les combinaisons déterminantes (rapide), puis les meilleures
// solutions sont vérifiées par un calcul complet avant d'être proposées. Glouton, 3 leviers au plus, déterministe,
// durée bornée et annulable. Les leviers « changement d'usage » (moins de public…) sont proposés à part, jamais
// mélangés aux changements de matière. Rien n'est appliqué : l'utilisateur teste puis applique.
import type { StudyInputs, StudyRun } from '../studyRun';
import { runStudy } from '../studyRun';
import type { StudyRunner } from '../worker/study';
import type { MemberFamily } from '../core/assemble';
import type { SectionSlot } from '../core/mods';
import { PLYWOOD_THICKNESSES, mergeMods, SLOT_LABEL } from '../core/mods';
import type { SectionEntry } from '../core/library';
import { strongerSections } from '../core/sectionCatalog';
import { fmtNumber } from '../core/units';
import type { Issue, VariantChanges } from './diagnose';
import { diagnose } from './diagnose';

export interface Lever {
  id: string;
  /** texte court : « rives du plancher en UPN 240 (VBX-01) » */
  title: string;
  changes: VariantChanges;
  /** structure = matière / pièces ; site = calage, frottement, lest ; usage = exploitation (à part) */
  category: 'structure' | 'site' | 'usage';
  /** pièce hors série ou du catalogue non confirmée */
  special?: boolean;
}

export interface Proposal {
  id: string;
  levers: Lever[];
  changes: VariantChanges;
  /** verdict et taux du calcul complet */
  verdict: StudyRun['verdict']['verdict'];
  etaMax: number;
  run: StudyRun;
  /** masse ajoutée (kg) et nombre de pièces modifiées ou ajoutées (estimation) */
  addedKg: number;
  pieces: number;
  /** avertissements : assemblage hors gabarit, pièce du catalogue à confirmer, problème déplacé */
  flags: string[];
  /** texte : « Passe avec : rives du plancher en UPN 240 (η 0,95, +38 kg) » */
  text: string;
  category: Lever['category'];
}

export interface OptimizeResult {
  proposals: Proposal[];
  /** pistes « changement d'usage » vérifiées séparément */
  usage: Proposal[];
  /** aucune solution : causes restantes */
  notes: string[];
  /** arrêté par la durée maxi ou l'utilisateur : résultats partiels */
  partial: boolean;
  runs: number;
  /** essais faits (levier → problèmes restants et pire taux du calcul rapide) */
  tried: Array<{ title: string; result: string }>;
}

export interface OptimizeOptions {
  /** taux à atteindre (≤ 1) */
  target?: number;
  maxLevers?: number;
  timeLimitMs?: number;
  /** essais au plus par étape (les leviers sont rangés du plus probable au moins probable) */
  maxTries?: number;
  friction: number;
  signal?: AbortSignal;
  onProgress?: (text: string) => void;
}

const f2 = (v: number, d = 2) => fmtNumber(v, d);

const SLOT_OF: Partial<Record<MemberFamily, SectionSlot>> = {
  'rim-floor': 'rim-floor',
  'rim-roof': 'rim-roof',
  'secondary-floor': 'secondary-floor',
  'secondary-roof': 'secondary-roof',
  column: 'column',
  'foot-corner': 'foot-corner',
  'foot-middle': 'foot-middle',
};

const SLOT_FIELD: Record<SectionSlot, (s: StudyInputs['modules'][number]['params']['sections']) => string> = {
  'rim-floor': (s) => s.rim,
  'rim-roof': (s) => s.rimRoof ?? s.rim,
  'secondary-floor': (s) => s.secondary,
  'secondary-roof': (s) => s.secondaryRoof ?? s.secondary,
  column: (s) => s.column,
  'foot-corner': (s) => s.footCorner,
  'foot-middle': (s) => s.footMiddle,
};

const GRADES = ['S235', 'S275', 'S355'];

/** Taux le plus élevé d'un calcul (barres, assemblages, plancher, glissement) ; ∞ si bloqué ou instable. */
export function worstEta(run: StudyRun): number {
  let w = 0;
  for (const s of run.summary.states) if (s) w = Math.max(w, s.blocked ? Infinity : s.eta);
  if (run.summary.errors.some((e) => e.cls !== 'SLS')) w = Infinity;
  if (run.stability.overturning.verdict === 'fail') w = Infinity;
  w = Math.max(w, run.stability.sliding.eta || 0, run.plywood.blocked ? Infinity : run.plywood.eta);
  for (const c of [run.facade, run.terraces]) if (c.records.length) w = Math.max(w, c.eta);
  return w;
}

/** Problèmes au-dessus du taux cible : familles de vérifications, stabilité, plancher. */
function problems(run: StudyRun, target: number) {
  const out: Array<{ key: string; eta: number; items: number[] }> = [];
  const byFam = new Map<string, number[]>();
  run.index.items.forEach((it, t) => {
    const s = run.summary.states[t];
    if (s && (s.blocked || s.eta > target + 1e-9)) byFam.set(it.family, [...(byFam.get(it.family) ?? []), t]);
  });
  for (const [fam, items] of byFam) out.push({ key: `family:${fam}`, eta: Math.max(...items.map((t) => run.summary.states[t]!.eta)), items });
  if (run.summary.errors.some((e) => e.cls === 'ULS')) out.push({ key: 'fem-error', eta: Infinity, items: [] });
  if (run.stability.overturning.verdict === 'fail') out.push({ key: 'overturning', eta: Infinity, items: [] });
  if (run.stability.sliding.eta > target + 1e-9) out.push({ key: 'sliding', eta: run.stability.sliding.eta, items: [] });
  if (run.plywood.eta > target + 1e-9) out.push({ key: 'plywood', eta: run.plywood.eta, items: [] });
  return out.sort((a, b) => b.eta - a.eta);
}

type Score = [number, number, number];

/** Score d'un calcul : [problèmes infinis, problèmes, plus grand taux fini au-dessus de la cible]. */
function score(run: StudyRun, target: number): Score {
  const ps = problems(run, target);
  // combinaisons instables ou en basculement, vérifications bloquées : plus elles sont nombreuses, plus on est loin
  const inf = run.summary.errors.filter((e) => e.cls !== 'SLS').length + (run.stability.overturning.verdict === 'fail' ? Math.max(1, run.stability.overturning.combos.length) : 0) + run.summary.states.filter((s) => s?.blocked).length;
  const fin = ps.filter((p) => Number.isFinite(p.eta)).map((p) => p.eta);
  // taux fini : le pire de tout le calcul (même sous la cible) pour départager
  let worst = 0;
  for (const s of run.summary.states) if (s && !s.blocked && Number.isFinite(s.eta)) worst = Math.max(worst, s.eta);
  return [inf, ps.length, Math.max(worst, ...fin)];
}
const better = (a: Score, b: Score) => a[0] < b[0] || (a[0] === b[0] && (a[1] < b[1] || (a[1] === b[1] && a[2] < b[2] - 1e-3)));

/** Combinaisons déterminantes : celles des vérifications au-dessus de 0,7 · cible, plus la stabilité au besoin. */
function governingCombos(run: StudyRun, target: number): string[] {
  const ids = new Set<string>();
  run.summary.states.forEach((s) => {
    if (s && s.eta > 0.7 * target && s.combo) ids.add(s.combo);
  });
  for (const t of run.verdict.ranking.slice(0, 12)) {
    const s = run.summary.states[t];
    if (s?.combo) ids.add(s.combo);
  }
  if (run.stability.sliding.combo) ids.add(run.stability.sliding.combo);
  for (const c of run.stability.overturning.combos) ids.add(c);
  for (const e of run.summary.errors) ids.add(e.combo);
  // le plancher et la stabilité ne dépendent pas des combinaisons ; au moins une ELU
  if (!ids.size) for (const c of run.combos.slice(0, 4)) ids.add(c.id);
  return [...ids].filter((id) => run.combos.some((c) => c.id === id));
}

/** Leviers pour un problème, du moins coûteux au plus coûteux. */
function leversFor(run: StudyRun, inputs: StudyInputs, problem: { key: string; items: number[] }, issues: Issue[], friction: number): Lever[] {
  const out: Lever[] = [];
  const sec = (k: string) => inputs.sections.get(k) as SectionEntry | undefined;
  // ─── barres : section supérieure, nuance supérieure (Viewbox concernées seulement) ───
  const bySlot = new Map<SectionSlot, Set<string>>();
  const addSlot = (slot: SectionSlot, module: string) => {
    if (!bySlot.has(slot)) bySlot.set(slot, new Set());
    bySlot.get(slot)!.add(module);
  };
  for (const t of problem.items) {
    const it = run.index.items[t];
    if (it.kind === 'member') {
      const fam = run.structure.meta[it.members[0]]?.family;
      const slot = fam ? SLOT_OF[fam] : undefined;
      if (slot) addSlot(slot, it.module);
    }
    // assemblages : leur capacité hors gabarit dépend des profils voisins (angle : poteau et rives ; plats, boulons : rives)
    else if (it.kind === 'corner') for (const slot of ['column', 'rim-floor', 'rim-roof'] as const) addSlot(slot, it.module);
    else if (it.kind === 'vlink' || it.kind === 'stack' || it.kind === 'bolt') for (const slot of ['rim-floor', 'rim-roof'] as const) addSlot(slot, it.module);
  }
  const jointProblem = problem.items.some((t) => run.index.items[t].kind !== 'member');
  for (const [slot, mods] of bySlot) {
    const modules = [...mods].sort();
    const pm = inputs.modules.find((m) => m.id === modules[0]);
    if (!pm) continue;
    const curKey = SLOT_FIELD[slot](pm.params.sections);
    const cur = sec(curKey);
    if (!cur) continue;
    const where = modules.length === inputs.modules.length ? '' : ` (${modules.join(', ')})`;
    for (const c of strongerSections(cur).slice(0, 5))
      out.push({
        id: `section:${slot}:${c.key}`,
        title: `${SLOT_LABEL[slot]} en ${c.section.name}${where}`,
        changes: { mods: { sections: [{ slot, section: c.key, modules: where ? modules : undefined }] } },
        category: 'structure',
        special: true,
      });
    const g = GRADES.indexOf(cur.material);
    for (const mat of g >= 0 ? GRADES.slice(g + 1) : [])
      out.push({ id: `grade:${slot}:${mat}`, title: `${SLOT_LABEL[slot]} en acier ${mat}${where}`, changes: { mods: { grades: [{ slot, material: mat, modules: where ? modules : undefined }] } }, category: 'structure', special: true });
  }
  // ─── plancher : contreplaqué plus épais ───
  if (problem.key === 'plywood') {
    const t0 = inputs.modules[0]?.params.plywood.thickness ?? 18;
    for (const t of PLYWOOD_THICKNESSES.filter((x) => x > t0)) out.push({ id: `plywood:${t}`, title: `plancher en contreplaqué de ${t} mm`, changes: { mods: { plywood: { thickness: t } } }, category: 'structure', special: true });
  }
  // ─── pistes du diagnostic pour ce problème (en tête pour un assemblage ou la stabilité : contreventer d'abord) ───
  const issue = issues.find((i) => i.id === problem.key || (problem.key === 'fem-error' && i.id === 'fem-error'));
  const remedies: Lever[] = [];
  for (const r of issue?.remedies ?? []) {
    if (r.action !== 'simulate' || !r.changes) continue;
    const usage = !!r.changes.hyp?.live || r.changes.roof === false;
    const site = !!r.changes.calc || !!r.changes.mods?.ballast;
    remedies.push({ id: `remedy:${problem.key}:${r.id}`, title: r.title, changes: r.changes, category: usage ? 'usage' : site ? 'site' : 'structure', special: r.special });
  }
  if (jointProblem || !problem.items.length) out.unshift(...remedies);
  else out.push(...remedies);
  // basculement : lest sur les Viewbox du rez-de-chaussée (statico 18-0573 § 5.3), quantités croissantes
  if (problem.key === 'overturning') {
    const ground = inputs.modules.filter((m) => m.level === 0).map((m) => m.id);
    for (const kg of [500, 1000, 2000, 3000]) out.push({ id: `ballast:${kg}`, title: `lest de ${kg} kg sur chaque Viewbox du rez-de-chaussée`, changes: { mods: { ballast: ground.map((module) => ({ module, kg })) } }, category: 'site' });
  }
  // glissement : le lest exact est déjà une piste ; frottement 0,6 si plus bas
  if (problem.key === 'sliding' && friction < 0.6 && !out.some((l) => l.changes.calc?.friction)) out.push({ id: 'friction', title: 'frottement 0,6 (couches de bois vissées)', changes: { calc: { friction: 0.6 } }, category: 'site' });
  return out;
}

/** Masse ajoutée (kg) et pièces modifiées d'une variante, d'après ses entrées. */
export function costOf(inputs: StudyInputs, base: StudyInputs, changes: VariantChanges): { kg: number; pieces: number } {
  let kg = 0;
  for (const m of inputs.modules) kg += (m.weightDelta ?? 0) / 10;
  for (const m of base.modules) kg -= (m.weightDelta ?? 0) / 10;
  const mods = changes.mods ?? {};
  kg += (mods.ballast ?? []).reduce((a, b) => a + b.kg, 0);
  // croix : 2 plats 60 × 6 (2,83 kg/m) en diagonale + 2 ridoirs ≈ 3 kg
  for (const b of mods.bracings ?? []) {
    const pm = inputs.modules.find((m) => m.id === b.module);
    const L = pm ? (b.side[0] === 'v' ? pm.params.x1 - pm.params.x0 : pm.params.y1 - pm.params.y0) : 5890;
    const H = pm ? pm.params.roofZ - pm.params.floorZ : 2790;
    kg += 2 * (Math.hypot(L, H) / 1e3) * 2.83 + 6;
  }
  kg += (mods.addedModules ?? []).length * 2564;
  if (mods.stackPlates) kg += 0; // plats ajoutés : quelques kg, comptés en pièces
  let pieces = 0;
  for (const s of mods.sections ?? []) pieces += (s.modules?.length ?? inputs.modules.length) * (s.slot.startsWith('rim') ? 4 : s.slot === 'column' ? 4 : 6);
  for (const g of mods.grades ?? []) pieces += (g.modules?.length ?? inputs.modules.length) * 4;
  pieces += (mods.bracings ?? []).length * 2 + (mods.ballast ?? []).length + (mods.addedModules ?? []).length + (mods.stackPlates ? 4 : 0) + (mods.plywood ? inputs.modules.length : 0);
  return { kg, pieces };
}

export async function optimize(
  base: { changes: VariantChanges; run: StudyRun; build: (changes: VariantChanges) => StudyInputs },
  runner: StudyRunner,
  opts: OptimizeOptions,
): Promise<OptimizeResult> {
  const target = Math.min(1, opts.target ?? 1);
  const maxLevers = opts.maxLevers ?? 3;
  const t0 = Date.now();
  const deadline = t0 + (opts.timeLimitMs ?? 120000);
  let runs = 0;
  let partial = false;
  const failures: string[] = [];
  const triedLog: OptimizeResult['tried'] = [];
  const baseInputs = base.build(base.changes);
  const stack = (a: VariantChanges, b: VariantChanges): VariantChanges => ({
    hyp: { ...(a.hyp ?? {}), ...(b.hyp ?? {}) },
    roof: b.roof ?? a.roof,
    calc: { ...(a.calc ?? {}), ...(b.calc ?? {}) },
    mods: mergeMods(a.mods, b.mods),
  });
  const timeUp = () => {
    if (opts.signal?.aborted || Date.now() > deadline) {
      partial = true;
      return true;
    }
    return false;
  };
  const evaluate = async (changes: VariantChanges, comboIds?: string[]): Promise<StudyRun | null> => {
    if (timeUp()) return null;
    runs++;
    try {
      const inputs = base.build(changes);
      return await runStudy(comboIds ? { ...inputs, comboIds } : inputs, runner, undefined, opts.signal);
    } catch (e) {
      if ((e as Error).name === 'AbortError') {
        partial = true;
        return null;
      }
      failures.push((e as Error).message);
      return null;
    }
  };

  // ─── chemins gloutons : un par premier levier efficace (3 au plus) ───
  interface Path {
    levers: Lever[];
    changes: VariantChanges;
    run: StudyRun;
    /** « corrige X mais fait passer Y à η … » */
    moved: string[];
  }
  const movedNotes: string[] = [];
  let best: { path: Path; score: Score } | null = null;
  const finished: Path[] = [];
  const firstProblems = problems(base.run, target);
  if (!firstProblems.length) return { proposals: [], usage: [], notes: ['Tout passe déjà (η ≤ cible) : rien à optimiser.'], partial: false, runs: 0, tried: [] };
  const usageLevers: Lever[] = [];

  const step = async (path: Path, depth: number, branch: number): Promise<void> => {
    const probs = problems(path.run, target);
    if (!probs.length) {
      finished.push(path);
      return;
    }
    if (path.levers.length) {
      const sc = score(path.run, target);
      if (!best || better(sc, best.score)) best = { path, score: sc };
    }
    if (depth >= maxLevers || timeUp()) return;
    const issues = diagnose(path.run, { friction: opts.friction });
    const inputs = base.build(path.changes);
    // leviers de tous les problèmes restants (un levier peut en régler plusieurs)
    const all: Lever[] = [];
    for (const p of probs) for (const l of leversFor(path.run, inputs, p, issues, opts.friction)) if (!all.some((x) => x.id === l.id) && !path.levers.some((x) => x.id === l.id)) all.push(l);
    for (const l of all) if (l.category === 'usage' && !usageLevers.some((u) => u.id === l.id)) usageLevers.push(l);
    const levers = all.filter((l) => l.category !== 'usage');
    const combos = governingCombos(path.run, target);
    const worst = probs[0];
    opts.onProgress?.(`${probs.length} problème(s), le pire : ${worst.key.replace(/^family:/, '')} (η ${Number.isFinite(worst.eta) ? f2(worst.eta) : '∞'}) — ${levers.length} levier(s) à essayer`);
    const tried: Array<{ lever: Lever; changes: VariantChanges; run: StudyRun; left: number; eta: number; score: Score }> = [];
    {
      const sc = score(path.run, target);
      triedLog.push({ title: path.levers.length ? `départ : ${path.levers.map((x) => x.title).join(' + ')}` : 'situation de départ', result: `${sc[0] ? `${sc[0]} combinaison(s) instable(s) ou bloquée(s), ` : ''}${probs.length} problème(s), pire taux ${Number.isFinite(sc[2]) ? f2(sc[2]) : '∞'}` });
    }
    const doneSlots = new Set<string>();
    let triesHere = 0;
    for (const l of levers) {
      if (triesHere >= (opts.maxTries ?? 14)) break;
      // échelles (sections d'une barre par masse croissante, lest, contreplaqué) : la première qui suffit, pas les suivantes
      const slotKey = l.id.startsWith('section:') ? l.id.split(':').slice(0, 2).join(':') : l.id.startsWith('ballast:') ? 'ballast' : l.id.startsWith('plywood:') ? 'plywood' : null;
      if (slotKey && doneSlots.has(slotKey)) continue;
      if (timeUp()) break;
      const changes = stack(path.changes, l.changes);
      opts.onProgress?.(`Essai : ${l.title}`);
      triesHere++;
      const r = await evaluate(changes, combos);
      if (!r) continue;
      const left = problems(r, target);
      const sc = score(r, target);
      tried.push({ lever: l, changes, run: r, left: left.length, eta: worstEta(r), score: sc });
      triedLog.push({ title: [...path.levers.map((x) => x.title), l.title].join(' + '), result: `${sc[0] ? `${sc[0]} combinaison(s) instable(s) ou bloquée(s), ` : ''}${left.length} problème(s), pire taux ${Number.isFinite(sc[2]) ? f2(sc[2]) : '∞'}` });
      if (slotKey === 'ballast' || slotKey === 'plywood') {
        if (!left.some((x) => x.key === (slotKey === 'ballast' ? 'overturning' : 'plywood'))) doneSlots.add(slotKey);
      } else if (slotKey) {
        const slot = slotKey.split(':')[1] as SectionSlot;
        const stillSlot = left.some((x) => x.items.some((t) => {
          const it = r.index.items[t];
          const fam = it.kind === 'member' ? r.structure.meta[it.members[0]]?.family : undefined;
          return fam ? SLOT_OF[fam] === slot : false;
        }));
        if (!stillSlot) doneSlots.add(slotKey);
      }
    }
    // meilleur progrès (ordre lexicographique) : moins de problèmes « infinis » (instabilité, basculement, bloqué),
    // moins de problèmes, puis taux fini le plus bas ; un levier sans progrès est écarté
    const here = score(path.run, target);
    const useful = tried.filter((x) => better(x.score, here)).sort((a, b) => (better(a.score, b.score) ? -1 : better(b.score, a.score) ? 1 : 0));
    const picks: typeof useful = [];
    for (const u of useful) {
      // branches distinctes : pas deux sections de la même barre
      const fam = u.lever.id.split(':').slice(0, 2).join(':');
      if (picks.some((x) => x.lever.id.split(':').slice(0, 2).join(':') === fam)) continue;
      picks.push(u);
      if (picks.length >= branch) break;
    }
    for (const g of picks) {
      // le calcul rapide ne couvre que les combinaisons déterminantes : on repart d'un calcul complet de cette étape
      const full = await evaluate(g.changes);
      if (!full) continue;
      const before = new Set(probs.map((x) => x.key));
      const moved = problems(full, target)
        .filter((x) => !before.has(x.key))
        .map((x) => `« ${g.lever.title} » fait passer ${x.key.replace(/^family:/, '')} à η ${Number.isFinite(x.eta) ? f2(x.eta) : '∞'}`);
      movedNotes.push(...moved);
      // une section ou une nuance plus forte pour la même barre remplace le choix précédent (une seule ligne)
      const leverTarget = (l: Lever) => (l.id.startsWith('section:') || l.id.startsWith('grade:') ? l.id.split(':').slice(0, 2).join(':') : l.id);
      const levers = [...path.levers.filter((x) => leverTarget(x) !== leverTarget(g.lever)), g.lever];
      await step({ levers, changes: g.changes, run: full, moved: [...path.moved, ...moved] }, depth + 1, 1);
    }
  };
  await step({ levers: [], changes: base.changes, run: base.run, moved: [] }, 0, 3);

  // ─── propositions vérifiées (calcul complet déjà fait à chaque étape) ───
  const toProposal = (p: Path, k: number, category: Lever['category']): Proposal => {
    const inputs = base.build(p.changes);
    const cost = costOf(inputs, baseInputs, stackOnly(p.levers));
    const flags: string[] = [];
    for (const r of inputs.joints?.rows ?? []) if (r.status === 'unknown' || r.status === 'indicative' || r.status === 'user') flags.push(`${r.name} (${r.modules.join(', ')}) : ${r.status === 'unknown' ? 'capacité inconnue — à saisir ou faire valider' : 'capacité indicative — à valider par un ingénieur'}`);
    for (const l of p.levers) for (const key of Object.values(l.changes.mods?.sections ?? []).map((s) => s.section)) if (key.startsWith('CAT-')) flags.push(`${inputs.sections.get(key)?.section.name ?? key} : section du catalogue du commerce, nuance et disponibilité à confirmer`);
    const eta = worstEta(p.run);
    const what = p.levers.map((l) => l.title).join(' + ');
    const kgTxt = cost.kg >= 0.5 ? `, +${f2(cost.kg, 0)} kg` : '';
    return {
      id: `P${k + 1}`,
      levers: p.levers,
      changes: p.changes,
      verdict: p.run.verdict.verdict,
      etaMax: eta,
      run: p.run,
      addedKg: cost.kg,
      pieces: cost.pieces,
      flags: [...new Set([...flags, ...p.moved.map((m) => `${m} (réglé ensuite)`)])],
      text: `Passe avec : ${what} (η max ${Number.isFinite(eta) ? f2(eta) : '∞'}${kgTxt})`,
      category,
    };
  };
  const stackOnly = (levers: Lever[]): VariantChanges => levers.reduce<VariantChanges>((a, l) => stack(a, l.changes), {});
  const ranked = finished
    .map((p, k) => ({ p, prop: toProposal(p, k, p.levers.some((l) => l.category === 'site') ? 'site' : 'structure') }))
    .filter((x) => x.prop.etaMax <= target + 1e-9)
    .sort(
      (a, b) =>
        (a.prop.verdict === 'ok' ? 0 : 1) - (b.prop.verdict === 'ok' ? 0 : 1) ||
        a.prop.flags.filter((f) => f.includes('inconnue')).length - b.prop.flags.filter((f) => f.includes('inconnue')).length ||
        a.prop.addedKg - b.prop.addedKg ||
        a.prop.pieces - b.prop.pieces ||
        a.prop.levers.filter((l) => l.special).length - b.prop.levers.filter((l) => l.special).length,
    );
  // doublons (même ensemble de leviers) et solutions dominées (mêmes leviers qu'une autre, plus d'autres)
  const seen = new Set<string>();
  const ids = (p: Proposal) => new Set(p.levers.map((l) => l.id));
  const proposals = ranked
    .filter((x) => {
      const k = x.prop.levers.map((l) => l.id).sort().join('|');
      return seen.has(k) ? false : (seen.add(k), true);
    })
    .filter((x, _, arr) => {
      const mine = ids(x.prop);
      return !arr.some((y) => y !== x && y.prop.levers.length < x.prop.levers.length && [...ids(y.prop)].every((id) => mine.has(id)));
    })
    .slice(0, 3)
    .map((x, k) => ({ ...x.prop, id: `P${k + 1}` }));

  // ─── changement d'usage : vérifié à part ───
  const usage: Proposal[] = [];
  for (const l of usageLevers.slice(0, 2)) {
    const changes = stack(base.changes, l.changes);
    const r = await evaluate(changes);
    if (!r) break;
    const eta = worstEta(r);
    usage.push({ id: `U${usage.length + 1}`, levers: [l], changes, verdict: r.verdict.verdict, etaMax: eta, run: r, addedKg: 0, pieces: 0, flags: ['changement d’usage : à décider avec l’exploitant, pas un renfort'], text: `${eta <= target ? 'Passe' : 'Ne suffit pas'} en changeant l’usage : ${l.title} (η max ${Number.isFinite(eta) ? f2(eta) : '∞'})`, category: 'usage' });
  }

  const notes: string[] = [];
  if (!proposals.length) {
    const rest = problems(base.run, target);
    notes.push(`Aucune solution simple trouvée avec les leviers disponibles (sections du catalogue, nuances, contreplaqué, contreventement, plats, lest) en ${runs} calculs.`);
    for (const p of rest.slice(0, 4)) notes.push(`Reste : ${p.key.replace(/^family:/, '')} (η ${Number.isFinite(p.eta) ? f2(p.eta) : '∞'})${p.key === 'overturning' || p.key === 'sliding' || p.key === 'fem-error' ? ' — cause globale (stabilité d’ensemble)' : ''}`);
  }
  if (!proposals.length && best) {
    const b = best as { path: Path; score: Score };
    const rest = problems(b.path.run, target);
    notes.push(`Meilleure piste (ne passe pas encore, à compléter) : ${b.path.levers.map((l) => l.title).join(' + ')} — reste ${rest.map((p) => `${p.key.replace(/^family:/, '')} (η ${Number.isFinite(p.eta) ? f2(p.eta) : '∞'})`).join(', ')}`);
  }
  if (!proposals.length) notes.push(...[...new Set(movedNotes)].slice(0, 3));
  if (partial) notes.push('Recherche arrêtée par la durée maximale : relancer avec plus de temps pour explorer davantage.');
  if (failures.length) notes.push(`${failures.length} essai(s) impossibles à calculer : ${[...new Set(failures)].slice(0, 2).join(' ; ')}`);
  return { proposals, usage, notes, partial, runs, tried: triedLog };
}
