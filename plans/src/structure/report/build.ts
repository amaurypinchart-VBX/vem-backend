// Rapport de l'étude structure (§14) : même plan que les notes de calcul statico, précédé d'une synthèse —
// page de garde (verdict, sommaire), synthèse, 1 remarques préliminaires / bases / consignes (description, vues, faces
// habillées, consignes, vent et plan d'action vent fort, résumé ancrage et calage, normes), 2 hypothèses de charges,
// 3 vérifications (planchers, barres, angles, liaisons, calage), 4 stabilité d'ensemble, 5 conclusion ; version
// détaillée : annexe « B » (modèle, cas de charge, combinaisons, toutes les vérifications, réactions, messages).
// Tous les chiffres viennent du calcul (StudyRun, CalageResult) : le rapport ne fait que les mettre en page.
// Fonction pure : pages SVG A4 (+ le plan de calage A3 fourni par l'appelant).
import type { CalageResult, CalageType } from '../core/calage';
import { CALAGE_LABELS } from './calageI18n';
import type { Combination } from '../core/combos';
import type { CalcRecord, Verdict } from '../core/records';
import { verdictOf, worstVerdict } from '../core/records';
import type { ModuleTypeEntry } from '../core/library';
import { designation } from '../core/library';
import { lastModification } from '../core/viewboxEdit';
import { materialByKey } from '../core/materials';
import { speedLimit } from '../core/wind';
import type { StudyInputs, StudyRun } from '../studyRun';
import type { Block, Cell, LaidPage, TableCell } from './doc';
import { A4, BRAND, GREY, INK, PAGE, SIZE, VERDICT_COLORS, paginate, r2, renderPage, svgLine, svgRect, svgText, tocEntries, verdictIcon, watermarkSvg, wordmark } from './doc';
import { etaLevelsSvg, faceStates, facesSvg, imageSvg, planModules, planSvg, plateSvg, supportsSvg } from './figures';
import type { Labels, Lang } from './i18n';
import { LABELS, num } from './i18n';
import { TUV_LABELS } from './tuvI18n';
import { ellipsis, textWidth, wrapText } from './metrics';
import { translate } from './translate';

export type ReportVariant = 'compact' | 'detailed';

export interface ReportImage {
  href: string;
  width: number;
  height: number;
}

export interface ReportInput {
  lang: Lang;
  variant: ReportVariant;
  project: { name: string; number: string; client: string; address: string; installation: string };
  author: string;
  date: Date;
  model: { fileName: string; date: string };
  /** version du logiciel (« v1.0 ») */
  version: string;
  study: StudyInputs;
  run: StudyRun;
  /** calage calculé avec les réactions du calcul (null : portance non renseignée) */
  calage: CalageResult | null;
  /** portance admissible (kN/m²) et type de sol */
  bearing: { value: number; label: string } | null;
  moduleWeightKg: number;
  /** avertissements du modèle (reconnaissance, pièces au vent seules…) */
  sceneWarnings: string[];
  /** pièces porteuses du modèle ignorées par l'utilisateur (escalier…) : listées dans « Non vérifié » */
  ignoredParts?: Array<{ label: string; count: number }>;
  images?: { view3d?: ReportImage; eta3d?: ReportImage };
  /** plan de calage A3 (planche du moteur de planches) : SVG rendu par l'appelant avec le numéro donné */
  calagePlan?: (pageLabel: string) => string;
  /** textes rédigés par l'IA (contrôlés : aucun nombre hors des données du calcul), relus par l'utilisateur */
  texts?: { description?: string; instructions?: string[]; conclusion?: string };
  /** modifications de l'étude hors modèle SketchUp (lest, contreventements, Viewbox ajoutées…), en français */
  modifications?: string[];
}

export interface ReportPage {
  svg: string;
  size: { w: number; h: number };
}

export interface ReportOutput {
  pages: ReportPage[];
  mainPages: number;
  annexPages: number;
  verdict: Verdict;
  toc: Array<{ level: number; num: string; text: string; page: string }>;
}

const GRAVITY = 9.81;

/** Verdict du calage : plaques standard partout (ou longrines), sinon « ne passe pas » sans étude spécifique. */
export function calageVerdict(c: CalageResult | null): { verdict: Verdict; eta: number; worst?: CalageType } {
  if (!c || !c.types.length) return { verdict: 'incomplete', eta: NaN };
  const worst = c.types.reduce((a, t) => ((t.chosen?.eta ?? Infinity) > (a.chosen?.eta ?? Infinity) ? t : a));
  if (c.allPlates) {
    const eta = Math.max(...c.types.map((t) => t.chosen!.eta));
    return { verdict: verdictOf(eta), eta, worst };
  }
  if (c.longrine) return { verdict: verdictOf(c.longrine.result.eta), eta: c.longrine.result.eta, worst };
  return { verdict: 'fail', eta: worst.chosen?.eta ?? Infinity, worst };
}

/** Lest nécessaire contre le glissement global (N, charges permanentes favorables γ = 1,0) : max(0 ; H / μ − V). */
export function slidingBallast(run: StudyRun, mu: number): number {
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

/** Formule d'une combinaison avec les coefficients : « 1,10 ΣG + 1,35 Q1.1 ». */
export function comboFormula(c: Combination, lang: Lang, cases?: ReadonlySet<string>): string {
  // lest GB, marches d'escalier G6 : écrits seulement s'il y en a dans l'étude
  const optional = ['G6', 'GB'];
  const G = ['G1', 'Gc', 'G2', 'G3', 'G4', 'G5', ...(cases?.has('G6') ? ['G6'] : []), 'G7', ...(cases?.has('GB') ? ['GB'] : [])];
  const f = new Map(c.factors.filter(([id]) => !optional.includes(id) || cases?.has(id)));
  const gs = G.map((g) => f.get(g) ?? 0);
  const parts: string[] = [];
  if (gs.every((x) => x === gs[0])) parts.push(`${num(lang, gs[0])} ΣG`);
  else {
    const groups = new Map<number, string[]>();
    G.forEach((g, k) => {
      if (!gs[k]) return;
      if (!groups.has(gs[k])) groups.set(gs[k], []);
      groups.get(gs[k])!.push(g);
    });
    for (const [k, ids] of groups) parts.push(`${num(lang, k)} (${ids.join(' + ')})`);
  }
  const rest = [...f].filter(([id, k]) => !G.includes(id) && k);
  const byK = new Map<number, string[]>();
  for (const [id, k] of rest) {
    if (!byK.has(k)) byK.set(k, []);
    byK.get(k)!.push(id);
  }
  for (const [k, ids] of byK) parts.push(ids.length > 1 ? `${num(lang, k)} (${ids.join(' + ')})` : `${num(lang, k)} ${ids[0]}`);
  return parts.join(' + ');
}

export function buildReport(inp: ReportInput): ReportOutput {
  const { lang, run, study } = inp;
  const L: Labels = LABELS[lang];
  const T = TUV_LABELS[lang];
  const E = (s: string) => translate(lang, s);
  const N = (v: number, d = 2) => num(lang, v, d);
  const kN = (v: number, d = 1) => `${N(v / 1e3, d)} kN`;
  const blocks: Block[] = [];
  const rec = (r: CalcRecord): Block => ({
    t: 'record',
    rec: { ...r, title: E(r.title), clause: E(r.clause), formula: E(r.formula), withValues: E(r.withValues) },
    labels: { combination: L.combination, elements: L.elements },
  });
  const etaCell = (eta: number | undefined, blocked?: boolean): TableCell => {
    const v: Verdict = blocked ? 'incomplete' : verdictOf(eta);
    return { text: blocked || eta === undefined || !Number.isFinite(eta) ? L.verdict.incomplete : N(eta), icon: v, color: VERDICT_COLORS[v], bold: true };
  };
  const verdictCell = (v: Verdict): TableCell => ({ text: L.verdict[v], icon: v, color: VERDICT_COLORS[v], bold: true });

  const s = run.structure;
  const mods = planModules(s);
  const levels = new Set(s.modules.map((m) => m.level)).size;
  const idx = run.index;
  const st = run.summary.states;
  const loads = study.loads;
  const mu = study.options.friction;
  const ground = calageVerdict(inp.calage);
  const verdict = worstVerdict([run.verdict.verdict, ground.verdict]);
  const H = Math.max(...s.modules.map((m) => m.origin[1] + m.params.topZ)) - Math.min(...s.modules.map((m) => m.origin[1]));
  const vStop = speedLimit(loads.windInService);
  const vWatch = speedLimit(loads.windInService, 0.75);
  const vOut = speedLimit(loads.windOutOfService);
  const surfaces = loads.evacuateTopLevel && levels > 1 ? L.topLevelAndOutdoor : L.outdoorSurfaces;
  const closedNames = (loads.closedLevels ?? []).filter((l) => l > 0 && l < levels).map((l) => L.levelName(l)).join(', ');
  const ballast = slidingBallast(run, mu);
  const gTotal = run.loads.cases.filter((c) => c.group === 'G').reduce((a, c) => a - c.resultant[1], 0);
  const maxEta = Math.max(0, ...run.verdict.families.map((f) => (Number.isFinite(f.eta) ? f.eta : 0)), Number.isFinite(run.plywood.eta) ? run.plywood.eta : 0, run.stability.sliding.eta);
  const entry = inp.study.library.find((e): e is ModuleTypeEntry => e.kind === 'module_type' && e.key === s.modules[0]?.templateKey);

  // dimensions de l'ensemble dans les axes de l'installation
  const ax = run.loads.axes;
  const proj = (v: [number, number], a: number[]) => v[0] * a[0] + v[1] * a[2];
  const pts = mods.flatMap((m) => m.corners);
  const ext = (a: number[]) => Math.max(...pts.map((p) => proj(p, a))) - Math.min(...pts.map((p) => proj(p, a)));
  const [dimA, dimB] = [ext(ax.x), ext(ax.y)].sort((a, b) => b - a);
  const overall = L.approxDims(N(dimA / 1e3, 1), N(dimB / 1e3, 1), N(H / 1e3, 1));
  const moduleDims = entry ? L.approxDims(N(entry.nominal.long / 1e3), N(entry.nominal.short / 1e3), N((entry.params?.topZ ?? 3080) / 1e3)) : '—';

  // remarques (avertissements du calcul et du modèle, contrôles du rapport)
  // longueur > 30 m : consigne du § 1.2, pas de doublon dans les remarques
  const remarks: string[] = [...new Set([...inp.sceneWarnings, ...run.warnings.filter((w) => !w.startsWith('Longueur de l’installation')), ...(inp.calage?.warnings ?? [])].map(E))];
  if (H > 8000 + 1 && loads.windInService < 0.3e-3 - 1e-9) remarks.unshift(L.heightWindWarning(N(H / 1e3, 1), N(loads.windInService * 1e3)));
  if (!inp.bearing) remarks.unshift(L.bearingMissing);
  // structure d'un type de Viewbox modifiée dans la bibliothèque : toujours signalée en tête
  for (const key of new Set(s.modules.map((m) => m.templateKey))) {
    const t = inp.study.library.find((e): e is ModuleTypeEntry => e.kind === 'module_type' && e.key === key);
    const mod = t && lastModification(t);
    if (mod) remarks.unshift(L.templateModified(E(t.name), mod));
  }
  // basculement : phrase courte (les messages du calcul sont au chapitre 4 et en annexe)
  const stabErrors = run.summary.errors.filter((e) => e.cls === 'STAB');
  const tipped = [...new Set(stabErrors.flatMap((e) => e.nodes.map((n) => n.split(':')[0])))].filter((m) => s.modules.some((q) => q.id === m));
  const overturnText = run.stability.overturning.verdict === 'fail' ? L.overturningFail(stabErrors.map((e) => e.combo).join(', '), tipped.join(', ') || '—') : E(run.stability.overturning.text);
  const reasons = [
    ...run.verdict.reasons.filter((r) => !r.startsWith('Basculement :')).map(E),
    ...(run.stability.overturning.verdict === 'fail' ? [overturnText] : []),
    ...(ground.verdict === 'fail' ? [`${L.groundRow} : ${L.noStandardSolution}`] : []),
  ];

  // ─── synthèse ───
  blocks.push({ t: 'heading', level: 1, num: '', text: L.summary });
  blocks.push({ t: 'callout', verdict, title: L.verdictSentence[verdict], lines: reasons.length ? reasons : [L.conclusion[verdict](N(maxEta))] });
  blocks.push({
    t: 'kv',
    rows: [
      [L.installation, L.modulesOnLevels(s.modules.length, levels)],
      [L.overallDims, overall],
      [L.totalPermanent, `ΣG = ${kN(gTotal, 0)}`],
      [L.imposed, T.imposedLevels(N((loads.liveGround ?? loads.live) * 1e3), N(loads.live * 1e3))],
      [L.windInOut, `${N(loads.windInService * 1e3)} / ${N(loads.windOutOfService * 1e3)} kN/m²`],
      ...(inp.bearing ? ([[L.bearing, L.bearingValue(N(inp.bearing.value, 0), inp.bearing.label)]] as Array<[string, string]>) : []),
    ],
  });
  const familyRows: Cell[][] = run.verdict.families.map((f) => {
    const state = st[f.item];
    return [E(familyName(f.family)), String(f.count), etaCell(state?.eta, !!state?.blocked || !state), E(idx.items[f.item].label), state?.combo ?? '—'];
  });
  familyRows.push([L.plywoodRow, '—', etaCell(run.plywood.eta, !!run.plywood.blocked), L.floors, '—']);
  for (const [label, c] of [
    [T.facadeTitle, run.facade],
    [T.terraceTitle, run.terraces],
  ] as const)
    if (c?.records.length) {
      const worst = c.records.reduce((a, r) => ((r.eta ?? 0) > (a.eta ?? 0) ? r : a));
      familyRows.push([label, String(c.records.length), c.failures.length ? verdictCell('fail') : etaCell(c.eta), E(worst.title), '—']);
    }
  familyRows.push([L.slidingRow(N(mu)), '—', etaCell(run.stability.sliding.eta), `${L.slidingValue(N(run.stability.sliding.muReq), N(mu))}`, run.stability.sliding.combo || '—']);
  familyRows.push([L.overturningRow, '—', verdictCell(run.stability.overturning.verdict), overturnText, run.stability.overturning.combos.join(', ') || '—']);
  if (inp.calage) familyRows.push([L.groundRow, String(inp.calage.estimate.groups.length), ground.verdict === 'fail' ? verdictCell('fail') : etaCell(ground.eta), ground.worst ? E(ground.worst.label) : '—', ground.worst?.reactions[0]?.combo ?? '—']);
  blocks.push({ t: 'heading', level: 3, num: '', text: L.maxEta });
  blocks.push({
    t: 'table',
    cols: [
      { title: L.colCheck, w: 34 },
      { title: L.colCount, w: 7, align: 'end' },
      { title: L.colEta, w: 16, align: 'end' },
      { title: L.colElement, w: 50 },
      { title: L.colCombo, w: 11 },
    ],
    rows: familyRows,
  });
  if (inp.images?.eta3d) blocks.push({ t: 'figure', h: 70, svg: imageSvg(inp.images.eta3d), caption: `${L.figureEta} — ${L.etaLegend}` });
  const calageTables = (): Block[] => {
    if (!inp.calage) return [{ t: 'para', text: L.bearingMissing, color: VERDICT_COLORS.incomplete }];
    const c = inp.calage;
    const out: Block[] = [
      {
        t: 'table',
        cols: [
          { title: L.colSupport, w: 26 },
          { title: L.colCount, w: 7, align: 'end' },
          { title: 'Rz,k max', w: 14, align: 'end' },
          { title: 'Rz,Ed max', w: 14, align: 'end' },
          { title: L.colSolution, w: 42 },
          { title: 'η', w: 14, align: 'end' },
        ],
        rows: c.types.map((t) => [E(t.label), String(t.reactions.length), kN(t.Rzk), kN(t.RzEd), t.chosen ? E(t.chosen.summary) + (t.standard ? '' : ` (${E('hors standard')})`) : L.noStandardSolution, t.chosen ? etaCell(t.chosen.eta) : verdictCell('fail')]),
      },
    ];
    if (c.longrine) out.push({ t: 'para', text: `${L.longrine} : ${E(c.longrine.solution.summary)} (η = ${N(c.longrine.result.eta)}).`, size: SIZE.small });
    out.push({
      t: 'table',
      cols: [
        { title: L.colDesignation, w: 30 },
        { title: L.colDims, w: 34 },
        { title: L.colQty, w: 12, align: 'end' },
        { title: L.colMass, w: 14, align: 'end' },
      ],
      rows: c.materials.length ? c.materials.map((m) => [E(m.label), E(m.dims), String(m.quantity), `${N(m.massKg, 0)} kg`]) : [[L.noStandardSolution, '', '', '']],
    });
    return out;
  };
  blocks.push({ t: 'heading', level: 3, num: '', text: L.groundTitle });
  blocks.push(...calageTables());
  blocks.push({ t: 'heading', level: 3, num: '', text: L.windOperation });
  blocks.push({ t: 'para', text: L.shutdown(N(vStop, 1), surfaces) });
  blocks.push({ t: 'heading', level: 3, num: '', text: L.notCovered });
  const hasGlazing = study.edgeItems.some((i) => /vitr|glas|verre|VITRE/i.test(i.label));
  blocks.push({
    t: 'bullets',
    size: SIZE.small,
    items: [
      ...(hasGlazing ? [L.notCoveredItems.glazing] : []),
      L.notCoveredItems.cladding,
      L.notCoveredItems.logo,
      L.notCoveredItems.railings,
      ...((run.structure.stairs ?? []).length ? [L.notCoveredItems.steps, study.options.stairClad ? L.stairCladCalc : L.stairClad] : []),
      ...study.blocking.map((b) => `${L.notCoveredItems.blocking} : ${E(b)}`),
      ...(inp.ignoredParts ?? []).map((p) => L.notCoveredItems.ignored(p.label, p.count)),
    ],
  });

  // ─── 1 remarques préliminaires ───
  blocks.push({ t: 'pagebreak' });
  blocks.push({ t: 'heading', level: 1, num: '1', text: L.ch1 });
  blocks.push({ t: 'heading', level: 2, num: '1.1', text: L.s11 });
  blocks.push({ t: 'para', text: L.basisText(inp.model.fileName, inp.model.date) });
  blocks.push({ t: 'para', text: L.descriptionTitle, bold: true, after: 0.6 });
  blocks.push({ t: 'para', text: inp.texts?.description?.trim() || L.descriptionText(s.modules.length, levels) });
  if (inp.texts?.description?.trim()) blocks.push({ t: 'para', text: L.aiNote, size: SIZE.small, color: GREY });
  blocks.push({ t: 'kv', rows: [[L.moduleDims, moduleDims], [L.overallDims, overall]] });
  if (inp.images?.view3d) blocks.push({ t: 'figure', h: 78, svg: imageSvg(inp.images.view3d), caption: L.figure3d });
  const axesOpt = { x: [ax.x[0], ax.x[2]] as [number, number], y: [ax.y[0], ax.y[2]] as [number, number], labels: ['x', 'y'] as [string, string] };
  blocks.push({ t: 'figure', h: planHeight(mods, 150, 95), svg: planSvg(mods, { axes: axesOpt }), caption: L.figurePlan });
  const faces = faceStates(s, study.edgeItems);
  blocks.push({ t: 'figure', h: Math.ceil(levels / 3) * Math.min(58, planHeight(mods, 150 / Math.min(levels, 3), 58) + 8) + 6, svg: facesSvg(mods, faces, L.levelName, L.facesLegend), caption: L.figureFaces });
  blocks.push({ t: 'para', text: L.claddingNote, size: SIZE.small, color: GREY });

  blocks.push({ t: 'heading', level: 2, num: '1.2', text: L.s12 });
  blocks.push({
    t: 'bullets',
    items: [
      ...L.generalNotes.slice(0, 3),
      study.options.jacks ? L.jacksUsed : L.jacksForbidden,
      ...L.generalNotes.slice(3),
      ...(hasGlazing ? [L.glazingNote] : []),
      L.impactNote,
      (study.loads.snowRoof ?? 0) > 0 ? L.snowNoteWith : L.snowNote,
      ...(closedNames ? [L.closedLevelsNote(closedNames)] : []),
      ...(levels >= 3 ? [L.beyondPrufbuch(levels)] : []),
      ...(dimA > 30000 + 1 ? [T.beyond30m(N(dimA / 1e3, 1))] : []),
      T.frictionNote(N(mu), mu >= 0.6 - 1e-9),
      T.ballastGroundOnly,
      ...(() => {
        const feet = (run.stairFeet ?? []).filter((f) => f.lifted || f.need > 0);
        return feet.length ? [L.stairFeetInstruction(feet.map((f) => `${E(f.label)} ${f.lifted ? `(${L.stairFeetLifted})` : `${N(Math.ceil(f.need / GRAVITY / 10) * 10, 0)} kg`}`).join(', '))] : [];
      })(),
      ...(inp.texts?.instructions ?? []).map((t) => t.trim()).filter(Boolean),
    ],
  });

  blocks.push({ t: 'heading', level: 2, num: '1.3', text: L.s13 });
  blocks.push({
    t: 'bullets',
    items: [L.windConditions(N(loads.windOutOfService * 1e3), N(vOut, 1)), L.windInService(N(loads.windInService * 1e3), N(vStop, 1), surfaces), L.windTerrain, L.windWater],
  });
  blocks.push({ t: 'para', text: L.windPlanTitle, bold: true, after: 0.6 });
  blocks.push({
    t: 'table',
    cols: [
      { title: L.colThreshold, w: 22 },
      { title: L.colSpeed, w: 14, align: 'end' },
      { title: L.colAction, w: 80 },
    ],
    rows: [
      [{ text: L.windPlan.watch[0], bold: true, color: VERDICT_COLORS.limit }, `≥ ${N(vWatch, 1)} m/s`, L.windPlan.watch[1]],
      [{ text: L.windPlan.stop[0], bold: true, color: VERDICT_COLORS.fail }, `≥ ${N(vStop, 1)} m/s`, L.windPlan.stop[1]],
      [{ text: L.windPlan.limit[0], bold: true, color: VERDICT_COLORS.incomplete }, `≥ ${N(vOut, 1)} m/s`, L.windPlan.limit[1]],
    ],
  });
  blocks.push({ t: 'bullets', items: L.windPlanNotes, size: SIZE.small });

  blocks.push({ t: 'heading', level: 2, num: '1.4', text: L.s14 });
  blocks.push({
    t: 'kv',
    rows: [
      [L.overturning, `${L.verdict[run.stability.overturning.verdict]} — ${overturnText}`],
      [L.sliding, `${L.slidingValue(N(run.stability.sliding.muReq), N(mu))} (${run.stability.sliding.combo || '—'})`],
      [L.ballast, run.stability.overturning.verdict === 'fail' ? L.ballastOverturning : ballast > 0 ? L.ballastRequired(N(ballast / 1e3, 1), N(Math.ceil(ballast / GRAVITY / 10) * 10, 0)) : L.ballastNone],
      [L.jacks, study.options.jacks ? L.jacksYes : L.jacksNo],
      ...(inp.bearing ? ([[L.bearing, L.bearingValue(N(inp.bearing.value, 0), inp.bearing.label)]] as Array<[string, string]>) : []),
    ],
  });
  blocks.push(...calageTables());
  blocks.push({ t: 'para', text: L.groundNote, size: SIZE.small, color: GREY });
  // références réglementaires du calage (Prüfbuch TÜV, calcul statico 18-0573)
  {
    const CL = CALAGE_LABELS[inp.lang];
    const c = inp.calage;
    const tuvLine = !c ? '' : !c.tuv.tuvMinimum ? CL.tuvOff : c.tuv.ok === false ? CL.tuvKo(c.types.filter((t) => t.tuv?.ok === false).map((t) => E(t.label)).join(', ')) : c.tuv.ok ? CL.tuvOk : '';
    blocks.push({ t: 'para', text: CL.legalTitle, bold: true, after: 0.6 });
    blocks.push({ t: 'bullets', items: CL.legal(study.options.jacks), size: SIZE.small });
    if (tuvLine) blocks.push({ t: 'para', text: tuvLine, bold: true, size: SIZE.small, color: c?.tuv.ok === false ? VERDICT_COLORS.fail : undefined });
  }

  blocks.push({ t: 'heading', level: 2, num: '1.5', text: L.s15 });
  blocks.push({ t: 'para', text: L.materialsText });
  if (inp.modifications?.length) {
    blocks.push({ t: 'para', text: L.modsTitle, bold: true, after: 0.6 });
    blocks.push({ t: 'para', text: L.modsText });
    blocks.push({ t: 'bullets', items: inp.modifications.map((m) => E(m)) });
  }
  blocks.push({ t: 'para', text: L.normsTitle, bold: true, after: 0.6 });
  blocks.push({ t: 'kv', rows: L.norms, labelWidth: 32 });
  blocks.push({ t: 'para', text: L.docsTitle, bold: true, after: 0.6 });
  blocks.push({ t: 'bullets', items: L.docs });
  blocks.push({ t: 'para', text: L.softwareTitle, bold: true, after: 0.6 });
  blocks.push({ t: 'para', text: L.softwareText(inp.version) });

  // ─── 2 hypothèses de charges ───
  blocks.push({ t: 'pagebreak' });
  blocks.push({ t: 'heading', level: 1, num: '2', text: L.ch2 });
  blocks.push({ t: 'heading', level: 2, num: '2.1', text: L.s21 });
  blocks.push({ t: 'para', text: L.weighed(N((inp.moduleWeightKg * GRAVITY) / 1e3, 2), N(inp.moduleWeightKg, 0)) });
  blocks.push({ t: 'para', text: L.steelWeight });
  for (const r of run.loads.records.filter((x) => x.key === 'loads.moduleWeight')) blocks.push(rec(r));
  const walls = aggregateEdges(study.edgeItems.filter((i) => i.loadCase === 'G3'));
  const rails = aggregateEdges(study.edgeItems.filter((i) => i.loadCase === 'G5'));
  const points = aggregatePoints(study.pointItems);
  blocks.push({
    t: 'kv',
    rows: [
      [L.ceiling, `gk = ${N(loads.ceiling * 1e3)} kN/m²`],
      [L.floor, `gk = ${N(loads.floorFinish * 1e3)} kN/m²`],
      [L.walls, walls.length ? walls.map((w) => L.wallRow(E(w.label), N(w.q), N(w.length / 1e3, 1))).join(' ; ') : L.wallsNone],
      [L.railings, rails.length ? rails.map((w) => L.wallRow(E(w.label), N(w.q), N(w.length / 1e3, 1))).join(' ; ') : L.wallsNone],
      [L.logos, points.length ? points.map((p) => L.pointRow(E(p.label), N(p.F / 1e3))).join(' ; ') : L.wallsNone],
    ],
  });
  blocks.push({ t: 'heading', level: 2, num: '2.2', text: L.s22 });
  blocks.push({ t: 'heading', level: 3, num: '2.2.1', text: L.s221 });
  blocks.push({
    t: 'kv',
    rows: [
      [T.liveGround, `qk = ${N((loads.liveGround ?? loads.live) * 1e3)} kN/m²`],
      [T.liveUpper, `qk = ${N(loads.live * 1e3)} kN/m²`],
      ...(loads.roofAccessible ? ([[L.roofLive, `qk = ${N(loads.roofLive * 1e3)} kN/m²`]] as Array<[string, string]>) : []),
      ...(closedNames ? ([[L.closedLevels, closedNames]] as Array<[string, string]>) : []),
    ],
    labelWidth: 70,
  });
  blocks.push({ t: 'para', text: L.outOfServiceLive(loads.evacuateTopLevel && levels > 1 ? L.evacuatedTop : L.evacuatedOutdoor) });
  blocks.push({ t: 'heading', level: 3, num: '2.2.2', text: L.s222 });
  blocks.push({ t: 'bullets', items: [L.horizontalText, L.handrail, L.impact] });
  blocks.push({ t: 'heading', level: 2, num: '2.3', text: L.s23 });
  blocks.push({ t: 'para', text: (study.loads.snowRoof ?? 0) > 0 ? L.snowWith(N((study.loads.snowRoof! / 0.8) * 1e3), N(study.loads.snowRoof! * 1e3), N((study.loads.snowRoof! * 1e6) / 9.81, 0)) : L.snowText });
  blocks.push({ t: 'heading', level: 2, num: '2.4', text: L.s24 });
  blocks.push({ t: 'para', text: L.windTwoStates });
  blocks.push({ t: 'para', text: L.inServiceTitle, bold: true, after: 0.6 });
  blocks.push({ t: 'kv', rows: [['q', `${N(loads.windInService * 1e3)} kN/m² (h = ${N(H / 1e3, 1)} m)`]], labelWidth: 20 });
  blocks.push({ t: 'para', text: L.outOfServiceTitle, bold: true, after: 0.6 });
  blocks.push({ t: 'para', text: loads.windProfile ? T.outOfService[loads.windProfile] : L.outOfServiceText });
  blocks.push({ t: 'kv', rows: [['qp,k', `${N(loads.windOutOfService * 1e3)} kN/m²`]], labelWidth: 20 });
  blocks.push({ t: 'para', text: L.cpTitle, bold: true, after: 0.6 });
  blocks.push({ t: 'kv', rows: L.cpRows.map(([a, b]) => [lang === 'en' ? a.replace(/(\d),(\d)/g, '$1.$2') : a, b] as [string, string]), labelWidth: 26 });
  blocks.push({ t: 'bullets', items: [L.internalPressure, L.roofSuction], size: SIZE.small });
  for (const r of run.loads.records.filter((x) => x.key === 'loads.wind.faces')) blocks.push(rec(r));
  blocks.push({ t: 'heading', level: 2, num: '2.5', text: L.s25 });
  blocks.push({ t: 'para', text: L.imperfection });
  blocks.push({ t: 'para', text: L.combosText });
  const caseIds = new Set(run.loads.cases.map((x) => x.id));
  const comboRows = (list: Combination[]): Cell[][] => list.map((c) => [c.id, L.comboClass[c.cls], comboFormula(c, lang, caseIds)]);
  // version compacte : une direction représentative (les 3 autres sont identiques au sens près)
  const shown = inp.variant === 'detailed' ? run.combos : run.combos.filter((c) => !c.direction || c.direction === 1);
  blocks.push({
    t: 'table',
    cols: [
      { title: L.colId, w: 12 },
      { title: L.colClass, w: 16 },
      { title: L.colFactors, w: 72 },
    ],
    rows: comboRows(shown),
    note: inp.variant === 'detailed' ? undefined : L.combosNote(run.combos.length),
  });

  // ─── 3 vérifications ───
  blocks.push({ t: 'pagebreak' });
  blocks.push({ t: 'heading', level: 1, num: '3', text: L.ch3 });
  blocks.push({ t: 'para', text: L.ch3Intro(L.method[study.options.ec3Method]) });
  let sec = 0;
  const h2 = (text: string) => blocks.push({ t: 'heading', level: 2, num: `3.${++sec}`, text });
  // 3.1 planchers
  h2(L.floors);
  blocks.push({ t: 'para', text: L.floorsText });
  if (run.plywood.blocked) blocks.push({ t: 'para', text: E(run.plywood.blocked), color: VERDICT_COLORS.incomplete });
  for (const r of run.plywood.records) blocks.push(rec(r));
  // 3.2 barres
  // escaliers : chapitre à part
  const stairIds = new Set((s.stairs ?? []).map((x) => x.id));
  const inStair = (t: number) => stairIds.has(idx.items[t].module);
  const memberFamilies = run.verdict.families.filter((f) => idx.items[f.item].kind === 'member' && !inStair(f.item));
  if (memberFamilies.length) {
    h2(L.viewbox);
    const used = new Map<string, { section: string; material: string; family: string }>();
    s.meta.forEach((m) => {
      if (m.massless || stairIds.has(m.module)) return;
      const k = `${m.family}|${m.section}|${m.material}`;
      if (!used.has(k)) used.set(k, { section: study.sections.get(m.section)?.section.name ?? m.section, material: materialByKey(m.material)?.name ?? m.material, family: m.family });
    });
    blocks.push({ t: 'para', text: L.sectionsTitle, bold: true, after: 0.6 });
    blocks.push({
      t: 'table',
      cols: [
        { title: L.colRole, w: 40 },
        { title: L.colSection, w: 40 },
        { title: L.colMaterial, w: 20 },
      ],
      rows: [...used.values()].map((u) => [E(capitalize(FAMILY_FR[u.family] ?? u.family)), E(designation(u.section)), E(designation(u.material))]),
    });
    // taux des barres de chaque Viewbox, un plan par niveau
    const byModule = new Map<string, number>();
    idx.items.forEach((it, t) => {
      if (it.kind === 'member') byModule.set(it.module, Math.max(byModule.get(it.module) ?? 0, st[t]?.eta ?? Infinity));
    });
    blocks.push({ t: 'figure', h: Math.ceil(levels / 3) * Math.min(55, planHeight(mods, 150 / Math.min(levels, 3), 55) + 6), svg: etaLevelsSvg(mods, byModule, L.levelName, (v) => N(v)), caption: `${L.figureEtaMembers} — ${L.etaLegend}` });
    blocks.push({ t: 'eta', eta: Math.max(...memberFamilies.map((f) => f.eta)) });
    blocks.push({ t: 'para', text: L.mostLoaded, bold: true, after: 0.6 });
    const top = run.verdict.ranking.filter((t) => idx.items[t].kind === 'member' && !inStair(t)).slice(0, inp.variant === 'detailed' ? 25 : 12);
    blocks.push({
      t: 'table',
      cols: [
        { title: L.colElement, w: 56 },
        { title: L.colEta, w: 13, align: 'end' },
        { title: L.colCombo, w: 11 },
        { title: L.colCheck, w: 22 },
      ],
      rows: top.map((t) => [E(idx.items[t].label), etaCell(st[t]?.eta, !!st[t]?.blocked), st[t]?.combo ?? '—', E(governingLabel(st[t]?.governing))]),
    });
    blocks.push({ t: 'para', text: L.governingPerFamily, bold: true, after: 0.6 });
    const detailed = inp.variant === 'detailed' ? memberFamilies : memberFamilies.filter((f, k) => k < 3 || f.verdict !== 'ok');
    for (const f of detailed) {
      const state = st[f.item];
      if (state?.blocked) blocks.push({ t: 'para', text: E(state.blocked), color: VERDICT_COLORS.incomplete });
      for (const r of state?.records ?? []) blocks.push(rec(r));
    }
  }
  // 3.x assemblages
  const joint = (kind: 'corner' | 'vlink' | 'bolt' | 'jack', title: string, text: string) => {
    const fams = run.verdict.families.filter((f) => idx.items[f.item].kind === kind);
    if (!fams.length) return;
    h2(title);
    blocks.push({ t: 'para', text });
    const items = run.verdict.ranking.filter((t) => idx.items[t].kind === kind).slice(0, inp.variant === 'detailed' ? 20 : 8);
    blocks.push({
      t: 'table',
      cols: [
        { title: L.colElement, w: 56 },
        { title: L.colEta, w: 13, align: 'end' },
        { title: L.colCombo, w: 11 },
        { title: L.colCheck, w: 22 },
      ],
      rows: items.map((t) => [E(idx.items[t].label), etaCell(st[t]?.eta, !!st[t]?.blocked), st[t]?.combo ?? '—', E(governingLabel(st[t]?.governing))]),
    });
    const worst = fams.reduce((a, f) => ((st[f.item]?.eta ?? Infinity) > (st[a.item]?.eta ?? Infinity) ? f : a));
    const ws = st[worst.item];
    blocks.push({ t: 'eta', eta: ws?.blocked ? undefined : ws?.eta, label: ws?.blocked ? L.verdict.incomplete : undefined, verdict: ws?.blocked || !ws ? 'incomplete' : undefined });
    for (const f of fams) {
      const state = st[f.item];
      if (state?.blocked) blocks.push({ t: 'para', text: E(state.blocked), color: VERDICT_COLORS.incomplete });
      for (const r of state?.records ?? []) blocks.push(rec(r));
    }
  };
  joint('corner', L.corners, L.cornersText);
  joint('vlink', L.vlinks, L.vlinksText);
  joint('bolt', L.bolts, L.boltsText);
  joint('jack', L.jacksTitle, L.jacksText);
  // 3.x escaliers extérieurs : barres (EC3), accroches, attaches du palier, vérins Layher
  if (stairIds.size) {
    h2(L.stairTitle);
    const stairs = s.stairs ?? [];
    const attached = [...new Set(stairs.map((x) => s.meta[x.links[0]]?.label.split(' / ')[1]?.split(' · ')[0]).filter(Boolean))];
    blocks.push({ t: 'para', text: L.stairText(stairs.map((x) => x.id).join(', '), attached.join(', ') || '—') });
    const used = new Map<string, { section: string; material: string; family: string }>();
    s.meta.forEach((m) => {
      if (m.massless || !stairIds.has(m.module)) return;
      const k = `${m.family}|${m.section}|${m.material}`;
      if (!used.has(k)) used.set(k, { section: study.sections.get(m.section)?.section.name ?? m.section, material: materialByKey(m.material)?.name ?? m.material, family: m.family });
    });
    blocks.push({
      t: 'table',
      cols: [
        { title: L.colRole, w: 40 },
        { title: L.colSection, w: 40 },
        { title: L.colMaterial, w: 20 },
      ],
      rows: [...used.values()].map((u) => [E(capitalize(FAMILY_ALL[u.family] ?? u.family)), E(designation(u.section)), E(designation(u.material))]),
    });
    const fams = run.verdict.families.filter((f) => inStair(f.item));
    const items = run.verdict.ranking.filter((t) => inStair(t)).slice(0, inp.variant === 'detailed' ? 30 : 14);
    blocks.push({
      t: 'table',
      cols: [
        { title: L.colElement, w: 56 },
        { title: L.colEta, w: 13, align: 'end' },
        { title: L.colCombo, w: 11 },
        { title: L.colCheck, w: 22 },
      ],
      rows: items.map((t) => [E(idx.items[t].label), etaCell(st[t]?.eta, !!st[t]?.blocked), st[t]?.combo ?? '—', E(governingLabel(st[t]?.governing))]),
    });
    if (fams.length) {
      const worst = fams.reduce((a, f) => ((st[f.item]?.eta ?? Infinity) > (st[a.item]?.eta ?? Infinity) ? f : a));
      const ws = st[worst.item];
      blocks.push({ t: 'eta', eta: ws?.blocked ? undefined : ws?.eta, label: ws?.blocked ? L.verdict.incomplete : undefined, verdict: ws?.blocked || !ws ? 'incomplete' : undefined });
    }
    for (const f of fams) {
      const state = st[f.item];
      if (state?.blocked) blocks.push({ t: 'para', text: E(state.blocked), color: VERDICT_COLORS.incomplete });
      for (const r of state?.records ?? []) blocks.push(rec(r));
    }
    // lest des pieds contre le glissement
    if (run.stairFeet?.length) {
      blocks.push({ t: 'para', text: L.stairFeetTitle, bold: true, after: 0.6 });
      blocks.push({ t: 'para', text: L.stairFeetText(N(study.options.friction, 2)) });
      blocks.push({
        t: 'table',
        cols: [
          { title: L.stairFeetCols.foot, w: 46 },
          { title: L.stairFeetCols.rz, w: 18, align: 'end' },
          { title: L.stairFeetCols.rh, w: 14, align: 'end' },
          { title: L.stairFeetCols.need, w: 22, align: 'end' },
        ],
        rows: run.stairFeet.map((f) => [E(f.label), kN(f.Rz, 2), kN(f.Rh, 2), f.lifted ? L.stairFeetLifted : f.need > 0 ? `${N(Math.ceil(f.need / GRAVITY / 10) * 10, 0)} kg (${f.combo})` : '—']),
      });
    }
  }
  // 3.x éléments de façade et garde-corps, éléments terrasse (justifications du calcul de type statico 18-0573)
  for (const [title, intro, c] of [
    [T.facadeTitle, T.facadeIntro, run.facade],
    [T.terraceTitle, T.terraceIntro, run.terraces],
  ] as const) {
    if (!c || !(c.records.length || c.notes.length || c.failures.length || c.missing.length)) continue;
    h2(title);
    blocks.push({ t: 'para', text: intro });
    for (const m of [...c.failures, ...c.missing]) blocks.push({ t: 'para', text: E(m), color: VERDICT_COLORS.fail });
    if (c.records.length) blocks.push({ t: 'eta', eta: c.eta });
    for (const r of c.records) blocks.push(rec(r));
    if (c.notes.length) {
      blocks.push({ t: 'para', text: T.facadeNotes, bold: true, after: 0.6 });
      blocks.push({ t: 'bullets', items: c.notes.map(E), size: SIZE.small });
    }
  }
  // 3.x sol et calage
  h2(L.ground);
  blocks.push({ t: 'para', text: T.groundRule, size: SIZE.small });
  blocks.push({ t: 'para', text: L.groundIntro(study.sls ? L.groundSourceSls : L.groundSourceStatico) });
  if (inp.calage?.publicLimit) {
    const p = inp.calage.publicLimit;
    blocks.push({ t: 'para', text: L.groundPublic(String(p.persons), N(p.kg, 0), N(p.load / 1e3, 1)), bold: true });
  }
  if (inp.calage) {
    const c = inp.calage;
    blocks.push({ t: 'figure', h: planHeight(mods.filter((m) => m.level === 0), 150, 90), svg: supportsSvg(mods, c.estimate.reactions, (v) => kN(v, 0)), caption: L.supportsFigure });
    let k = 0;
    for (const t of c.types) {
      blocks.push({ t: 'heading', level: 3, num: `3.${sec}.${++k}`, text: L.groundCase(E(t.label), N(inp.bearing?.value ?? 0, 0)) });
      const CL = CALAGE_LABELS[inp.lang];
      const placed = t.checks.filter((x) => x.plan);
      const centered = placed.filter((x) => x.plan!.placement === 'centered');
      blocks.push({
        t: 'kv',
        rows: [
          [L.actions, `Rz,Ed ≤ ${kN(t.RzEd, 2)} ; Rz,k ≈ ${kN(t.Rzk, 2)} (${t.reactions.length} × ${E(t.label)})`],
          [L.contactArea, `a1 × a2 = ${N(t.a1 / 10, 0)} × ${N(t.a2 / 10, 0)} cm`],
          [CL.timberRow, CL.timberValue],
          ...(placed.length ? ([[CL.placementRow, CL.placementValue(placed.length - centered.length, centered.length, N(Math.max(0, ...centered.map((x) => x.plan!.overhang)) / 10, 0))]] as Array<[string, string]>) : []),
          ...(c.tuv.tuvMinimum ? ([[CL.tuvRow, t.tuv ? E(t.tuv.text) : CL.tuvNone]] as Array<[string, string]>) : []),
        ],
      });
      blocks.push({
        t: 'figure',
        h: 46,
        svg: plateSvg(t.a1, t.a2, t.plate.side, t.plate.side, { e: `e = ${N(t.plate.e / 10)} cm`, section: `b = l = ${N(t.plate.side / 10, 0)} cm`, rz: 'Rz,Ed', sigma: 'σB' }),
        caption: L.plateFigure,
      });
      for (const r of t.plate.records) blocks.push(rec(r));
      for (const r of t.extra) blocks.push(rec(r));
      blocks.push({
        t: 'table',
        cols: [
          { title: L.plateTable.stack, w: 30, align: 'middle' },
          { title: L.plateTable.dims, w: 30, align: 'middle' },
          { title: L.plateTable.thickness, w: 40, align: 'middle' },
        ],
        rows: t.plate.h.map((h, n) => [String(n + 1), `${N(t.plate.side / 10, 0)} × ${N(t.plate.side / 10, 0)} cm`, `${N(h / 10, 1)} cm`]),
      });
      if (t.chosen) {
        blocks.push({ t: 'para', text: `${L.chosenSolution} : ${E(t.chosen.title)} — ${E(t.chosen.summary)}${t.chosen.remarks.length ? ` (${t.chosen.remarks.map(E).join(' ; ')})` : ''}`, bold: true });
        if (t.chosen.records !== t.plate.records) for (const r of t.chosen.records) blocks.push(rec(r));
        blocks.push({ t: 'eta', eta: t.chosen.eta, verdict: t.standard ? undefined : 'fail' });
      } else blocks.push({ t: 'para', text: L.noStandardSolution, color: VERDICT_COLORS.fail });
      const others = t.solutions.filter((x) => x !== t.chosen);
      if (others.length)
        blocks.push({
          t: 'bullets',
          size: SIZE.small,
          items: others.map((x) => `${L.otherSolutions} : ${E(x.title)} — ${E(x.summary)} — η = ${N(x.eta)}${x.feasible ? '' : ` (${x.remarks.map(E).join(' ; ') || E('hors standard')})`}`),
        });
    }
    if (c.longrine) {
      blocks.push({ t: 'heading', level: 3, num: `3.${sec}.${++k}`, text: L.longrine });
      blocks.push({ t: 'para', text: `${E(c.longrine.solution.title)} — ${E(c.longrine.solution.summary)}` });
      for (const r of c.longrine.solution.records) blocks.push(rec(r));
      blocks.push({ t: 'eta', eta: c.longrine.result.eta });
    }
  } else blocks.push({ t: 'para', text: L.bearingMissing, color: VERDICT_COLORS.incomplete });

  // ─── 4 stabilité ───
  blocks.push({ t: 'pagebreak' });
  blocks.push({ t: 'heading', level: 1, num: '4', text: L.ch4 });
  blocks.push({ t: 'para', text: L.stabilityBasis, after: 0.6 });
  blocks.push({ t: 'kv', rows: L.stabilityFactors });
  blocks.push({ t: 'para', text: L.stabilityFootnote, size: SIZE.small, color: GREY });
  blocks.push({ t: 'para', text: L.overturningTitle, bold: true, after: 0.6 });
  blocks.push({ t: 'para', text: E(run.stability.overturning.text) });
  blocks.push({ t: 'eta', eta: undefined, label: L.verdict[run.stability.overturning.verdict], verdict: run.stability.overturning.verdict });
  blocks.push({ t: 'para', text: L.slidingTitle, bold: true, after: 0.6 });
  if (run.stability.sliding.record) blocks.push(rec(run.stability.sliding.record));
  blocks.push({ t: 'kv', rows: [[L.ballast, run.stability.overturning.verdict === 'fail' ? L.ballastOverturning : ballast > 0 ? L.ballastRequired(N(ballast / 1e3, 1), N(Math.ceil(ballast / GRAVITY / 10) * 10, 0)) : L.ballastNone]] });

  // ─── 5 conclusion ───
  blocks.push({ t: 'heading', level: 1, num: '5', text: L.ch5 });
  blocks.push({ t: 'para', text: inp.texts?.conclusion?.trim() || L.conclusion[verdict](N(maxEta)) });
  if (inp.texts?.conclusion?.trim()) blocks.push({ t: 'para', text: L.aiNote, size: SIZE.small, color: GREY });
  if (reasons.length) {
    blocks.push({ t: 'para', text: L.reasons, bold: true, after: 0.6 });
    blocks.push({ t: 'bullets', items: reasons });
  }
  const hints = hintsFor(inp, L, ballast, ground.verdict, N);
  if (hints.length) {
    blocks.push({ t: 'para', text: L.hintsTitle, bold: true, after: 0.6 });
    blocks.push({ t: 'bullets', items: hints });
  }
  blocks.push({ t: 'callout', verdict: 'incomplete', title: L.watermark, lines: [L.reserve] });
  if (remarks.length) {
    blocks.push({ t: 'para', text: L.remarksTitle, bold: true, after: 0.6 });
    blocks.push({ t: 'bullets', items: remarks.slice(0, inp.variant === 'detailed' ? 60 : 15), size: SIZE.small, color: GREY });
  }

  // ─── annexe (version détaillée) ───
  if (inp.variant === 'detailed') annex(blocks, inp, L, E, N, kN);

  // ─── pages ───
  const laid = paginate(blocks, N);
  const mainPages = laid.filter((p) => p.prefix === 'A').length;
  const annexPages = laid.filter((p) => p.prefix === 'B').length;
  const planLabel = inp.calagePlan ? `A ${mainPages + 1}` : '';
  const toc = tocEntries(laid);
  if (inp.calagePlan) {
    const at = toc.findIndex((e) => e.page.startsWith('B'));
    const item = { level: 1 as const, num: '', text: L.calagePlan, page: planLabel };
    if (at < 0) toc.push(item);
    else toc.splice(at, 0, item);
  }
  const template = {
    header: [
      [L.header.number, inp.project.number || '—'],
      [L.header.client, inp.project.client || '—'],
      [L.header.project, inp.project.name || '—'],
    ] as Array<[string, string]>,
    footer: L.footer,
    watermark: L.watermark,
  };
  const pages: ReportPage[] = [];
  const counts = { main: mainPages + (inp.calagePlan ? 1 : 0), annex: annexPages };
  pages.push({ svg: renderCover(inp, L, verdict, reasons, toc, counts), size: A4 });
  const pushLaid = (p: LaidPage) => pages.push({ svg: renderPage(p, template), size: A4 });
  laid.filter((p) => p.prefix === 'A').forEach(pushLaid);
  if (inp.calagePlan) pages.push({ svg: inp.calagePlan(planLabel), size: { w: 420, h: 297 } });
  laid.filter((p) => p.prefix !== 'A').forEach(pushLaid);
  return { pages, mainPages: counts.main, annexPages, verdict, toc };
}

const capitalize = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** Vérification déterminante lisible : « 6.61 » → « flambement (6.61) », « My » → « section (My) ». */
export function governingLabel(key: string | undefined): string {
  if (!key) return '—';
  if (key === '6.61' || key === '6.62') return `flambement (${key})`;
  if (key === '6.54') return 'déversement (6.54)';
  if (['6.41', '6.2', 'N', 'My', 'Mz', 'Vy', 'Vz', 'T'].includes(key)) return `section (${key})`;
  return key;
}

/** Famille « Rive plancher — UNP 220 (rives plancher / toiture) » → « Rive plancher — UNP 220 ». */
export const familyName = (f: string) => {
  const k = f.indexOf(' — ');
  return k < 0 ? f : `${f.slice(0, k)} — ${designation(f.slice(k + 3))}`;
};

/** Libellés français des familles de barres (traduits ensuite comme les autres textes du moteur). */
const FAMILY_FR: Record<string, string> = {
  'rim-floor': 'rive plancher',
  'rim-roof': 'rive toiture',
  'secondary-floor': 'traverse / lisse plancher',
  'secondary-roof': 'traverse / lisse toiture',
  column: 'poteau',
  'foot-corner': 'réception de pied',
  'foot-plate': 'plat de réception',
  'foot-middle': 'réception centrale',
};

/** Hauteur (mm papier) d'un plan de l'installation dessiné sur une largeur donnée, bornée. */
function planHeight(mods: ReturnType<typeof planModules>, width: number, max: number): number {
  if (!mods.length) return 20;
  const xs = mods.flatMap((m) => m.corners.map((p) => p[0]));
  const zs = mods.flatMap((m) => m.corners.map((p) => p[1]));
  const w = Math.max(...xs) - Math.min(...xs);
  const h = Math.max(...zs) - Math.min(...zs);
  return Math.max(30, Math.min(max, (width * h) / Math.max(w, 1) + 14));
}

function aggregateEdges(items: StudyInputs['edgeItems']) {
  const m = new Map<string, { label: string; q: number; length: number }>();
  for (const it of items) {
    const k = `${it.label}|${it.q.toFixed(4)}`;
    const e = m.get(k) ?? { label: it.label, q: it.q, length: 0 };
    e.length += it.to - it.from;
    m.set(k, e);
  }
  return [...m.values()];
}

function aggregatePoints(items: StudyInputs['pointItems']) {
  const m = new Map<string, { label: string; F: number }>();
  for (const it of items) {
    const e = m.get(it.label) ?? { label: it.label, F: 0 };
    e.F += it.F;
    m.set(it.label, e);
  }
  return [...m.values()];
}

/** Pistes de correction chiffrées (§10.5) selon ce qui ne passe pas. */
function hintsFor(inp: ReportInput, L: Labels, ballast: number, ground: Verdict, N: (v: number, d?: number) => string): string[] {
  const run = inp.run;
  const out: string[] = [];
  const bad = (v: Verdict) => v === 'fail' || v === 'limit';
  if (run.stability.sliding.eta > 1 && ballast > 0) out.push(L.hints.sliding(N(Math.ceil(ballast / GRAVITY / 10) * 10, 0)));
  if (run.stability.overturning.verdict === 'fail') out.push(L.hints.overturning);
  const kinds = new Set(run.verdict.families.filter((f) => bad(f.verdict)).map((f) => run.index.items[f.item].kind));
  if (kinds.has('corner') || kinds.has('vlink')) out.push(L.hints.corners);
  if (kinds.has('member') || kinds.has('bolt')) out.push(L.hints.members);
  if (kinds.has('jack')) out.push(L.hints.jacks);
  if (bad(verdictOf(run.plywood.eta))) out.push(L.hints.plywood);
  if (ground === 'fail') out.push(L.hints.ground);
  if (run.verdict.blocked.length || inp.study.blocking.length) out.push(L.hints.blocked);
  return [...new Set(out)];
}

function annex(blocks: Block[], inp: ReportInput, L: Labels, E: (s: string) => string, N: (v: number, d?: number) => string, kN: (v: number, d?: number) => string) {
  const { run, study } = inp;
  const s = run.structure;
  const idx = run.index;
  const st = run.summary.states;
  blocks.push({ t: 'series', prefix: 'B' });
  blocks.push({ t: 'heading', level: 1, num: 'B', text: L.annex });
  blocks.push({ t: 'heading', level: 2, num: 'B.1', text: L.b1 });
  // raideurs des appuis du modèle (premier appui de Viewbox : 18-0573 100 / 1 000 kN/cm, calage statico 50 kN/cm / rigide)
  const sup = s.fem.supports.find((_, k) => s.supportMeta[k]?.kind !== 'stair') ?? s.fem.supports[0];
  const kh = typeof sup?.dofs[0] === 'number' ? N(sup.dofs[0] / 100, 0) : '—';
  const kv = typeof sup?.dofs[1] === 'number' ? N(sup.dofs[1] / 100, 0) : null;
  blocks.push({ t: 'para', text: L.modelCounts(s.fem.nodes.length, s.fem.members.length, s.fem.supports.length, kh, kv) });
  // sections et matériaux utilisés
  const secKeys = [...new Set(s.meta.filter((m) => !m.massless).map((m) => m.section))];
  const cm = (v: number | undefined, p: number, d = 1) => (v === undefined ? '—' : N(v / 10 ** p, d));
  blocks.push({ t: 'para', text: L.sectionsAnnex, bold: true, after: 0.6 });
  blocks.push({
    t: 'table',
    size: SIZE.table * 0.92,
    cols: [
      { title: L.colSection, w: 26 },
      { title: 'A cm²', w: 10, align: 'end' },
      { title: 'Iy cm⁴', w: 11, align: 'end' },
      { title: 'Iz cm⁴', w: 11, align: 'end' },
      { title: 'Wel,y / Wel,z cm³', w: 18, align: 'end' },
      { title: 'Wpl,y / Wpl,z cm³', w: 18, align: 'end' },
      { title: 'It cm⁴', w: 10, align: 'end' },
      { title: L.curves, w: 9, align: 'middle' },
    ],
    rows: secKeys.map((k) => {
      const sec = study.sections.get(k)?.section;
      if (!sec) return [k, '—', '—', '—', '—', '—', '—', '—'];
      return [
        E(designation(sec.name)),
        cm(sec.A, 2, 2),
        cm(sec.Iy, 4),
        cm(sec.Iz, 4),
        `${cm(sec.Wely, 3)} / ${cm(sec.Welz, 3)}`,
        `${cm(sec.Wply, 3)} / ${cm(sec.Wplz, 3)}`,
        cm(sec.It, 4, 2),
        `${sec.curveY ?? '—'} / ${sec.curveZ ?? '—'}`,
      ];
    }),
  });
  const matKeys = [...new Set(s.meta.filter((m) => !m.massless).map((m) => m.material))];
  blocks.push({ t: 'para', text: L.materialsAnnex, bold: true, after: 0.6 });
  blocks.push({
    t: 'table',
    cols: [
      { title: L.colMaterial, w: 20 },
      { title: 'fy / fu N/mm²', w: 26, align: 'end' },
      { title: 'E N/mm²', w: 16, align: 'end' },
      { title: 'G N/mm²', w: 16, align: 'end' },
      { title: 'ρ kg/m³', w: 14, align: 'end' },
    ],
    rows: matKeys.map((k) => {
      const m = materialByKey(k);
      if (!m) return [k, '—', '—', '—', '—'];
      const r = m.ranges?.[0];
      return [E(designation(m.name)), r ? `${N(r.fy, 0)} / ${N(r.fu, 0)} (t ≤ ${N(r.tMax, 0)} mm)` : '—', N(m.E, 0), N(m.G, 0), N(m.rho, 0)];
    }),
  });
  blocks.push({ t: 'para', text: L.springsTitle, bold: true, after: 0.6 });
  blocks.push({ t: 'kv', rows: L.springs(kh, kv), labelWidth: 44, size: SIZE.small });
  // longueurs par famille
  const fam = new Map<string, { n: number; len: number }>();
  s.meta.forEach((m, k) => {
    const b = s.fem.members[k];
    const A = s.fem.nodes[b.i];
    const B = s.fem.nodes[b.j];
    const e = fam.get(m.family) ?? { n: 0, len: 0 };
    e.n++;
    e.len += Math.hypot(B.x - A.x, B.y - A.y, B.z - A.z);
    fam.set(m.family, e);
  });
  blocks.push({
    t: 'table',
    cols: [
      { title: L.colFamily, w: 50 },
      { title: L.colMembers, w: 14, align: 'end' },
      { title: L.colLength, w: 20, align: 'end' },
    ],
    rows: [...fam].map(([f, e]) => [E(capitalize(FAMILY_ALL[f] ?? f)), String(e.n), `${N(e.len / 1e3, 1)} m`]),
  });
  // cas de charge (Z vers le haut comme SCIA : X = x monde, Y = −z monde, Z = y monde)
  blocks.push({ t: 'heading', level: 2, num: 'B.2', text: L.b2 });
  blocks.push({
    t: 'table',
    cols: [
      { title: L.colCase, w: 10 },
      { title: L.colLabel, w: 44 },
      { title: 'ΣFx kN', w: 14, align: 'end' },
      { title: 'ΣFy kN', w: 14, align: 'end' },
      { title: 'ΣFz kN', w: 14, align: 'end' },
    ],
    rows: run.loads.cases.map((c) => [c.id, E(c.label), N(c.resultant[0] / 1e3), N(-c.resultant[2] / 1e3), N(c.resultant[1] / 1e3)]),
  });
  blocks.push({ t: 'heading', level: 2, num: 'B.3', text: L.b3 });
  blocks.push({
    t: 'table',
    cols: [
      { title: L.colId, w: 12 },
      { title: L.colClass, w: 16 },
      { title: L.colFactors, w: 72 },
    ],
    rows: run.combos.map((c) => [c.id, L.comboClass[c.cls], comboFormula(c, inp.lang, new Set(run.loads.cases.map((x) => x.id)))]),
  });
  blocks.push({ t: 'heading', level: 2, num: 'B.4', text: L.b4 });
  for (const f of run.verdict.families) {
    blocks.push({ t: 'para', text: `${E(familyName(f.family))} (${f.count})`, bold: true, after: 0.6 });
    const items = idx.items.map((it, t) => ({ it, t })).filter((x) => x.it.family === f.family);
    items.sort((a, b) => (st[b.t]?.eta ?? Infinity) - (st[a.t]?.eta ?? Infinity));
    blocks.push({
      t: 'table',
      size: SIZE.table * 0.92,
      cols: [
        { title: L.colElement, w: 56 },
        { title: L.colEta, w: 13, align: 'end' },
        { title: L.colCombo, w: 11 },
        { title: L.colCheck, w: 22 },
      ],
      rows: items.map(({ it, t }) => {
        const state = st[t];
        const v: Verdict = state?.blocked || !state ? 'incomplete' : verdictOf(state.eta);
        return [E(it.label), { text: state && !state.blocked ? N(state.eta) : L.verdict.incomplete, color: VERDICT_COLORS[v], bold: v !== 'ok' }, state?.combo ?? '—', E(state?.governing ?? '—')];
      }),
    });
  }
  blocks.push({ t: 'heading', level: 2, num: 'B.5', text: L.b5 });
  blocks.push({
    t: 'table',
    cols: [
      { title: L.colGroup, w: 9 },
      { title: L.colModules, w: 30 },
      { title: 'Rz,Ed max', w: 22, align: 'end' },
      { title: 'Rz,Ed min', w: 13, align: 'end' },
      { title: 'Rz,k max', w: 22, align: 'end' },
      { title: 'Rz,k min', w: 13, align: 'end' },
    ],
    rows: run.ground.reactions.map((r) => [r.group.id, r.group.moduleIds.join(', '), `${kN(r.REd)} (${r.combo})`, kN(r.REdMin), `${kN(r.Rk)} (${E(r.comboK)})`, kN(r.RkMin)]),
  });
  blocks.push({ t: 'heading', level: 2, num: 'B.6', text: L.b6 });
  const msgs = [...run.summary.errors.map((e) => `${e.combo} : ${E(e.message)}`), ...run.warnings.map(E)];
  blocks.push(msgs.length ? { t: 'bullets', items: msgs, size: SIZE.small } : { t: 'para', text: L.none });
}

const FAMILY_ALL: Record<string, string> = {
  ...FAMILY_FR,
  'stair-stringer': 'limon d’escalier',
  'stair-landing': 'cadre de palier',
  'stair-post': 'montant d’escalier',
  'stair-head': 'attache de montant de palier',
  'corner-link': 'liaison verticale d’angle',
  'vertical-contact': 'contact vertical',
  bolt: 'boulon horizontal',
  contact: 'contact d’angle',
};

/** Page de garde : logo, titre, avertissement, données du projet, verdict, sommaire. */
function renderCover(inp: ReportInput, L: Labels, verdict: Verdict, reasons: string[], toc: ReportOutput['toc'], counts: { main: number; annex: number }): string {
  const W = A4.w;
  const x = PAGE.left;
  const right = W - PAGE.right;
  const p: string[] = [];
  p.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${A4.h}mm" viewBox="0 0 ${W} ${A4.h}">`);
  p.push(svgRect(0, 0, W, A4.h, '#ffffff'));
  p.push(watermarkSvg(inp.lang === 'de' ? L.coverWarning : L.watermark));
  p.push(wordmark(x - 1, 12, 62));
  ['Viewbox International SA', 'Avenue Robert Schuman 112', '1480 Tubize', 'Belgium'].forEach((l, k) => p.push(svgText(right, 16 + k * 3.6, l, { size: 2.6, color: GREY, anchor: 'end' })));
  p.push(svgLine(x, 38, right, 38, BRAND, 0.4));
  p.push(svgText(x, 54, L.coverTitle, { size: 9, bold: true, color: BRAND }));
  p.push(svgText(x, 62, L.coverSubtitle, { size: 4, color: INK }));
  // avertissement
  p.push(svgRect(x, 67, right - x, 8, '#ffffff', VERDICT_COLORS.fail, 0.4, 1));
  p.push(svgText((x + right) / 2, 72.4, L.coverWarning, { size: 3.4, bold: true, color: VERDICT_COLORS.fail, anchor: 'middle' }));
  // champs du projet
  const f = L.coverFields;
  const rows: Array<[string, string]> = [
    [f.client, inp.project.client || '—'],
    [f.project, inp.project.name || '—'],
    [f.number, inp.project.number || '—'],
    [f.address, inp.project.address || '—'],
    [f.installation, inp.project.installation || '—'],
    [f.model, `${inp.model.fileName} (${inp.model.date})`],
    [f.variant, inp.variant === 'detailed' ? L.variant.detailed : L.variant.compact],
    [f.author, inp.author || '—'],
    [f.date, fmtDate(inp.date)],
    [f.software, `VEM · Plans Viewbox · Étude structure ${inp.version}`],
  ];
  let y = 84;
  for (const [k, v] of rows) {
    p.push(svgText(x, y, k, { size: 3, color: GREY }));
    p.push(svgText(x + 42, y, ellipsis(v, right - x - 42, 3), { size: 3, color: INK }));
    y += 4.6;
  }
  // verdict
  y += 2;
  const c = VERDICT_COLORS[verdict];
  const lines = reasons.slice(0, 4).flatMap((r) => wrapText(r, right - x - 20, 2.6)).slice(0, 6);
  const boxH = 13 + lines.length * 3.5;
  p.push(svgRect(x, y, right - x, boxH, '#ffffff', c, 0.5, 1.5));
  p.push(`<rect x="${r2(x)}" y="${r2(y)}" width="${r2(right - x)}" height="${r2(boxH)}" rx="1.5" fill="${c}" fill-opacity="0.07"/>`);
  p.push(verdictIcon(verdict, x + 8, y + 7, 8));
  p.push(svgText(x + 15, y + 8.6, L.verdictSentence[verdict], { size: 5, bold: true, color: c }));
  lines.forEach((l, k) => p.push(svgText(x + 15, y + 13.5 + k * 3.5, l, { size: 2.6, color: INK })));
  y += boxH + 6;
  p.push(svgText(x, y, L.coverPages(counts.main, counts.annex), { size: 2.8, color: GREY }));
  y += 8;
  // sommaire
  p.push(svgText(x, y, L.toc, { size: 4.2, bold: true, color: BRAND }));
  y += 3;
  const entries = toc.filter((e) => e.level <= 2);
  const size = entries.length > 26 ? 2.5 : 2.8;
  const step = size * 1.5;
  for (const e of entries) {
    y += step;
    if (y > 286) break;
    const ix = x + (e.level - 1) * 4;
    const label = e.num ? `${e.num}   ${e.text}` : e.text;
    p.push(svgText(ix, y, label, { size, bold: e.level === 1, color: INK }));
    const tw = textWidth(label, size, e.level === 1);
    const pw = textWidth(e.page, size);
    // points de conduite
    const x0 = ix + tw + 2;
    const x1 = right - pw - 2;
    if (x1 > x0) p.push(`<line x1="${r2(x0)}" y1="${r2(y)}" x2="${r2(x1)}" y2="${r2(y)}" stroke="${GREY}" stroke-width="0.25" stroke-dasharray="0.25 1.1" stroke-linecap="round"/>`);
    p.push(svgText(right, y, e.page, { size, color: INK, anchor: 'end' }));
  }
  p.push(svgText(x, 290.5, L.footer, { size: SIZE.header, color: GREY }));
  p.push('</svg>');
  return p.join('');
}

function fmtDate(d: Date): string {
  const z = (n: number) => String(n).padStart(2, '0');
  return `${z(d.getDate())}.${z(d.getMonth() + 1)}.${d.getFullYear()}`;
}

