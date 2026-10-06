// Résultats d'une étude (§10) : chaque tronçon de barre (EC3) et chaque assemblage Viewbox (angles, liaisons
// verticales, boulons) est vérifié pour toutes les combinaisons ELU ; on garde le pire taux, sa combinaison et le détail
// (formules avec valeurs) de ce cas. Pieds à vérin : chaque appui (tige Tr 24) vérifié sous sa réaction. Stabilité : basculement (calcul non linéaire aux appuis en compression seule) et
// glissement global (μ requis = Rh / Rz, statico 24-0571 § 4). Les résumés de plusieurs paquets de combinaisons
// (Workers) se fusionnent. Réactions → groupes d'appuis pour le calage. Fonctions pures.
import type { MemberFamily, StructuralModel } from './assemble';
import { FAMILY_LABEL } from './assemble';
import type { Combination } from './combos';
import type { ComboReaction, Estimate, GroupReaction, P2, SupportGroup } from './estimate';
import type { AnalysisResult, Reaction } from './fem/types';
import type { Ec3Options, StationForces } from './checks/ec3';
import { checkSpan } from './checks/ec3';
import type { ConnectionSet } from './checks/joints';
import { checkBolt, checkBrace, checkCorner, checkJack, checkLayherJack, checkStackShear, checkStairHook, checkStairLink, checkVerticalLink } from './checks/joints';
import { CORNER_SIDES } from './assemble';
import { checkTimberSpan } from './checks/ec5';
import type { SectionEntry } from './library';
import { materialByKey } from './materials';
import type { CalcRecord, Verdict } from './records';
import { verdictOf, worstVerdict } from './records';
import { fmtNumber } from './units';

export type ItemKind = 'member' | 'corner' | 'vlink' | 'stack' | 'bolt' | 'jack' | 'brace' | 'stairhook' | 'stairlink' | 'stairjack';

export interface CheckItem {
  id: string;
  kind: ItemKind;
  /** famille affichée (« Rives plancher — UNP 220 », « Angles poteau / cadre »…) */
  family: string;
  label: string;
  module: string;
  /** barres du modèle (coloration 3D) */
  members: number[];
  /** appui du modèle (pieds à vérin) */
  support?: number;
  /**
   * glissement entre Viewbox empilées : Viewbox du dessus boulonnées entre elles (côte à côte, même sens), qui glissent
   * d'un bloc ; liaisons d'angle de tout le groupe avec le signe de leurs axes u / v dans le repère de cette Viewbox
   */
  stackGroup?: { modules: string[]; links: Array<{ member: number; su: number; sv: number }> };
}

export interface ItemState {
  eta: number;
  governing: string;
  combo: string;
  blocked?: string;
  records: CalcRecord[];
}

export interface CheckContext {
  structure: StructuralModel;
  sections: ReadonlyMap<string, SectionEntry>;
  connections: ConnectionSet;
  /** assemblages propres aux Viewbox modifiées par l'étude (hors gabarit), par Viewbox */
  moduleConnections?: Record<string, ConnectionSet>;
  ec3: Ec3Options;
  /** calage statico : courbes de flambement de l'annexe SCIA */
  calibration: boolean;
  /** sortie des tiges des pieds à vérin (mm) */
  jackExtension?: number;
}

interface SpanMember {
  member: number;
  offset: number;
  reversed: boolean;
  length: number;
}

export interface ItemIndex {
  items: CheckItem[];
  /** tronçons : barres ordonnées le long du tronçon */
  spans: Map<string, SpanMember[]>;
}

const memberLength = (s: StructuralModel, k: number) => {
  const b = s.fem.members[k];
  const A = s.fem.nodes[b.i];
  const B = s.fem.nodes[b.j];
  return Math.hypot(B.x - A.x, B.y - A.y, B.z - A.z);
};

const BRACES = new Set(['bracing', 'raise-bracing']);

/** Liste des vérifications de l'installation (tronçons de barres porteuses, assemblages). */
export function buildItemIndex(s: StructuralModel, sections: ReadonlyMap<string, SectionEntry>, opts: { boltDiameter?: number } = {}): ItemIndex {
  const items: CheckItem[] = [];
  const spans = new Map<string, SpanMember[]>();
  const bySpan = new Map<string, number[]>();
  s.meta.forEach((m, k) => {
    if (m.massless || BRACES.has(m.family)) return;
    if (!bySpan.has(m.span)) bySpan.set(m.span, []);
    bySpan.get(m.span)!.push(k);
  });
  for (const [span, ks] of bySpan) {
    // ordre le long du tronçon : chaînage par nœuds communs
    const count = new Map<number, number>();
    for (const k of ks) for (const n of [s.fem.members[k].i, s.fem.members[k].j]) count.set(n, (count.get(n) ?? 0) + 1);
    let cur = [...count].find(([, c]) => c === 1)?.[0] ?? s.fem.members[ks[0]].i;
    const left = new Set(ks);
    const ordered: SpanMember[] = [];
    let offset = 0;
    while (left.size) {
      const k = [...left].find((x) => s.fem.members[x].i === cur || s.fem.members[x].j === cur) ?? [...left][0];
      left.delete(k);
      const b = s.fem.members[k];
      const reversed = b.j === cur;
      const L = memberLength(s, k);
      ordered.push({ member: k, offset, reversed, length: L });
      offset += L;
      cur = reversed ? b.i : b.j;
    }
    spans.set(span, ordered);
    const m = s.meta[ks[0]];
    const sec = sections.get(m.section);
    items.push({
      id: `span:${span}`,
      kind: 'member',
      family: `${capitalize(FAMILY_LABEL[m.family as MemberFamily] ?? m.family)} — ${sec?.section.name ?? m.section}`,
      label: m.family.startsWith('stair-') ? stairSpanLabel(m.label, span, offset, ks.length !== s.meta.filter((x) => x.line === m.line).length) : spanLabel(m.module, m.family as MemberFamily, m.line, span, offset),
      module: m.module,
      members: ordered.map((o) => o.member),
    });
  }
  s.meta.forEach((m, k) => {
    if (m.family === 'column')
      for (const end of ['pied', 'tête'] as const)
        items.push({ id: `corner:${k}:${end}`, kind: 'corner', family: 'Angles poteau / cadre', label: `${m.module} · angle ${Number(m.line.split(':').pop()) + 1}, ${end === 'pied' ? 'plancher' : 'toiture'}`, module: m.module, members: [k] });
    else if (m.family === 'corner-link') items.push({ id: `vlink:${k}`, kind: 'vlink', family: 'Liaisons verticales entre Viewbox', label: m.label, module: m.module, members: [k] });
    else if (m.family === 'bolt') items.push({ id: `bolt:${k}`, kind: 'bolt', family: `Boulons horizontaux M${opts.boltDiameter ?? 20}`, label: m.label, module: m.module, members: [k] });
    else if (BRACES.has(m.family)) items.push({ id: `brace:${k}`, kind: 'brace', family: m.family === 'bracing' ? 'Contreventements ajoutés (plat + ridoir)' : 'Contreventements de surélévation (plat + ridoir)', label: m.label, module: m.module, members: [k] });
  });
  // glissement entre Viewbox empilées : les 4 liaisons d'angle d'une Viewbox du dessus ensemble
  const links = new Map<string, number[]>();
  s.meta.forEach((m, k) => {
    if (m.family !== 'corner-link') return;
    if (!links.has(m.module)) links.set(m.module, []);
    links.get(m.module)!.push(k);
  });
  // Viewbox du dessus boulonnées entre elles (boulons de rive, axes parallèles) : groupes qui glissent d'un bloc
  const axis = (module: string, side: 'u1' | 'v1') => s.faces.find((f) => f.module === module && f.side === side)?.normal;
  const dot2 = (a?: readonly number[], b?: readonly number[]) => (a && b ? a[0] * b[0] + a[2] * b[2] : 0);
  const parent = new Map([...links.keys()].map((m) => [m, m]));
  const find = (m: string): string => (parent.get(m) === m ? m : find(parent.get(m)!));
  for (const m of s.meta) {
    if (m.family !== 'bolt') continue;
    const [a, b] = m.line.slice('bolt:'.length).split('/');
    if (!links.has(a) || !links.has(b) || Math.abs(dot2(axis(a, 'u1'), axis(b, 'u1'))) < 0.99) continue;
    parent.set(find(a), find(b));
  }
  for (const [module, ks] of links) {
    const below = s.meta[ks[0]].label.split(' / ')[0];
    const group = [...links.keys()].filter((m) => find(m) === find(module));
    const [u, v] = [axis(module, 'u1'), axis(module, 'v1')];
    const stackGroup =
      group.length > 1
        ? {
            modules: group,
            links: group.flatMap((m) => {
              const [su, sv] = [Math.sign(dot2(axis(m, 'u1'), u)) || 1, Math.sign(dot2(axis(m, 'v1'), v)) || 1];
              return links.get(m)!.map((member) => ({ member, su, sv }));
            }),
          }
        : undefined;
    items.push({ id: `stack:${module}`, kind: 'stack', family: 'Glissement entre Viewbox empilées', label: `${below} / ${module} · plats d’empilement`, module, members: ks, ...(stackGroup ? { stackGroup } : {}) });
  }
  // escaliers : accroches des limons, attaches du palier, vérins Layher des montants
  for (const st of s.stairs ?? []) {
    st.hooks.forEach((k, n) => items.push({ id: `stairhook:${k}`, kind: 'stairhook', family: 'Escalier — accroche des limons (crochets + 2 × M12)', label: `${st.id} · accroche du limon ${n === 0 ? 'côté Viewbox' : 'extérieur'}`, module: st.id, members: [k] }));
    for (const k of st.links) items.push({ id: `stairlink:${k}`, kind: 'stairlink', family: 'Escalier — attache du palier à la Viewbox (M20)', label: s.meta[k].label, module: st.id, members: [k] });
    for (const sp of st.supports) {
      const sm = s.supportMeta[sp];
      if (!/montant/.test(sm.label ?? '')) continue;
      items.push({ id: `stairjack:${sp}`, kind: 'stairjack', family: 'Escalier — vérins Layher 60 des montants', label: sm.label!, module: st.id, members: [], support: sp });
    }
  }
  s.supportMeta.forEach((sm, k) => {
    if (!sm.jack) return;
    const node = s.fem.supports[k].node;
    const members = s.fem.members.map((b, j) => ({ b, j })).filter(({ b, j }) => (b.i === node || b.j === node) && !s.meta[j].massless).map(({ j }) => j);
    const label = sm.kind === 'middle' ? `${sm.module} · vérin central ${sm.corner - 3}` : `${sm.module} · vérin d’angle ${sm.corner + 1}`;
    items.push({ id: `jack:${k}`, kind: 'jack', family: 'Pieds à vérin (tiges filetées)', label, module: sm.module, members, support: k });
  });
  return { items, spans };
}

const capitalize = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** « ESC-1 · limon côté Viewbox, tronçon 3 (0,24 m) » : libellé de la barre d'escalier, tronçon si elle est coupée. */
function stairSpanLabel(label: string, span: string, length: number, split: boolean): string {
  const piece = Number(span.split('#').pop());
  return `${label}${split && Number.isFinite(piece) ? `, tronçon ${piece + 1}` : ''} (${fmtNumber(length / 1e3, 2)} m)`;
}

const SIDE_LABEL: Record<string, string> = { v0: 'grand côté 1', v1: 'grand côté 2', u0: 'petit côté 1', u1: 'petit côté 2' };

/** « A · rive plancher, grand côté 1, tronçon 3 (1,20 m) », « A · traverse plancher x = 1,14 m », « A · poteau 2 ». */
function spanLabel(module: string, family: MemberFamily, line: string, span: string, length: number): string {
  const what = FAMILY_LABEL[family] ?? family;
  const tail = line.split('/').pop() ?? '';
  const [, pos] = tail.split(':');
  const piece = Number(span.split('#').pop());
  const part = Number.isFinite(piece) ? `, tronçon ${piece + 1}` : '';
  const len = ` (${fmtNumber(length / 1e3, 2)} m)`;
  if (family === 'column') return `${module} · poteau ${Number(pos) + 1}${len}`;
  if (SIDE_LABEL[pos]) return `${module} · ${what}, ${SIDE_LABEL[pos]}${part}${len}`;
  if (pos?.startsWith('t')) return `${module} · ${what}, x = ${fmtNumber(Number(pos.slice(1)) / 1e3, 2)} m${part}${len}`;
  if (pos?.startsWith('l')) return `${module} · ${what}, y = ${fmtNumber(Number(pos.slice(1)) / 1e3, 2)} m${part}${len}`;
  return `${module} · ${what}${part}${len}`;
}

/** Efforts le long d'un tronçon (stations de ses barres mises bout à bout, sens du tronçon). */
function spanStations(result: AnalysisResult, parts: SpanMember[]): StationForces[] {
  const out: StationForces[] = [];
  for (const p of parts) {
    const r = result.members[p.member];
    if (!r) continue;
    for (const st of r.stations) {
      const x = p.reversed ? p.offset + p.length - st.x : p.offset + st.x;
      // barre à l'envers : l'axe local y change de sens (Mz, Vy) ; N, My inchangés
      out.push({ x, N: st.N, Vy: p.reversed ? -st.Vy : st.Vy, Vz: p.reversed ? -st.Vz : st.Vz, T: p.reversed ? -st.T : st.T, My: st.My, Mz: p.reversed ? -st.Mz : st.Mz });
    }
  }
  return out;
}

/** Évaluation d'une vérification pour une combinaison. */
export function evaluateItem(ctx: CheckContext, index: ItemIndex, item: CheckItem, combo: Combination, result: AnalysisResult, detail: boolean): ItemState {
  const s = ctx.structure;
  const k = item.members[0];
  const st = (end: 'first' | 'last') => {
    const r = result.members[k].stations;
    return r[end === 'first' ? 0 : r.length - 1];
  };
  if (item.kind === 'member') {
    const m = s.meta[k];
    const sec = ctx.sections.get(m.section);
    const mat = materialByKey(m.material);
    if (!sec || !mat) return { eta: Infinity, governing: 'bloqué', combo: combo.id, blocked: `${item.label} : section ou matériau inconnu`, records: [] };
    const span = index.spans.get(item.id.slice(5))!;
    const cal = sec.calibrationCurves;
    const curves = ctx.calibration && cal?.y && cal.z ? { y: cal.y, z: cal.z } : undefined;
    const input = { key: item.id, label: item.label, section: sec.section, material: mat, curves, length: m.spanLength, stations: spanStations(result, span), combination: combo.id };
    const r = mat.family === 'timber' ? checkTimberSpan(input, combo, detail) : checkSpan(input, ctx.ec3, detail);
    return { eta: r.eta, governing: r.governing, combo: combo.id, blocked: r.blocked, records: r.records };
  }
  if (item.kind === 'stairjack') {
    const R = result.reactions[item.support!].R;
    const j = checkLayherJack(ctx.connections, { N: R[1], H: Math.hypot(R[0], R[2]) }, item.label, combo.id, ctx.ec3.gammaM1);
    return { eta: j.eta, governing: j.governing, combo: combo.id, blocked: j.blocked, records: detail && j.record ? [j.record] : [] };
  }
  if (item.kind === 'stairhook' || item.kind === 'stairlink') {
    // accroche : nœud i du prolongement (rotule) ; attache : extrémité côté palier
    const f = st('first');
    const j = item.kind === 'stairhook' ? checkStairHook(ctx.connections, f, item.label, combo.id) : checkStairLink(ctx.connections, f, item.label, combo.id);
    return { eta: j.eta, governing: j.governing, combo: combo.id, blocked: j.blocked, records: detail && j.record ? [j.record] : [] };
  }
  if (item.kind === 'jack') {
    const R = result.reactions[item.support!].R;
    const j = checkJack(ctx.connections, { N: R[1], H: Math.hypot(R[0], R[2]) }, ctx.jackExtension ?? 50, item.label, combo.id, ctx.ec3.gammaM1);
    return { eta: j.eta, governing: j.governing, combo: combo.id, blocked: j.blocked, records: detail && j.record ? [j.record] : [] };
  }
  const outer = s.outerSides?.get(item.module) ?? { u0: true, u1: true, v0: true, v1: true };
  // Viewbox modifiée par l'étude : ses assemblages recalculés / indicatifs / inconnus
  const cons = (item.module && ctx.moduleConnections?.[item.module]) || ctx.connections;
  if (item.kind === 'stack') {
    // somme des 4 liaisons d'angle (même repère local : z selon u, y selon v de la Viewbox du dessus) ; Viewbox
    // boulonnées entre elles avec les mêmes assemblages : tout le groupe, plats de ses faces extérieures
    const consOf = (m: string) => ctx.moduleConnections?.[m] || ctx.connections;
    const g = item.stackGroup?.modules.every((m) => consOf(m) === cons) ? item.stackGroup : undefined;
    const sum = { Hu: 0, Hv: 0, C: 0 };
    for (const { member, su, sv } of g?.links ?? item.members.map((member) => ({ member, su: 1, sv: 1 }))) {
      const f0 = result.members[member].stations[0];
      sum.Hu += su * f0.Vz;
      sum.Hv += sv * f0.Vy;
      sum.C += Math.max(0, -f0.N);
    }
    const sides = (m: string) => s.outerSides?.get(m) ?? { u0: true, u1: true, v0: true, v1: true };
    const group = g && {
      modules: g.modules,
      shortSides: g.modules.reduce((a, m) => a + (sides(m).u0 ? 1 : 0) + (sides(m).u1 ? 1 : 0), 0),
      longSides: g.modules.reduce((a, m) => a + (sides(m).v0 ? 1 : 0) + (sides(m).v1 ? 1 : 0), 0),
    };
    const j = checkStackShear(cons, sum, outer, item.label, combo.id, group);
    return { eta: j.eta, governing: j.governing, combo: combo.id, blocked: j.blocked, records: detail && j.record ? [j.record] : [] };
  }
  const f = item.kind === 'corner' ? st(item.id.endsWith('pied') ? 'first' : 'last') : st('first');
  const cs = CORNER_SIDES[s.meta[k].corner ?? 0];
  const j =
    item.kind === 'corner'
      ? checkCorner(cons, f, item.label, combo.id)
      : item.kind === 'vlink'
        ? checkVerticalLink(cons, f, item.label, combo.id, { long: outer[cs.long], short: outer[cs.short] })
        : item.kind === 'brace'
          ? checkBrace(cons, f, item.label, combo.id)
          : checkBolt(cons, f, item.label, combo.id);
  return { eta: j.eta, governing: j.governing, combo: combo.id, blocked: j.blocked, records: detail && j.record ? [j.record] : [] };
}

export interface ComboOutcome {
  combo: Combination;
  result?: AnalysisResult;
  /** erreur du calcul (mécanisme, instabilité, non-convergence) */
  error?: { code: string; message: string; nodes: string[] };
}

export interface StudySummary {
  /** pire état par vérification (même ordre que ItemIndex.items) */
  states: Array<ItemState | null>;
  /** réactions de chaque combinaison calculée */
  reactions: Record<string, Reaction[]>;
  errors: Array<{ combo: string; cls: Combination['cls']; code: string; message: string; nodes: string[] }>;
  warnings: string[];
  /** combinaisons calculées */
  done: string[];
}

/** Résumé d'un paquet de combinaisons : pire taux par vérification (ELU), détail du cas déterminant. */
export function summarize(ctx: CheckContext, index: ItemIndex, outcomes: ComboOutcome[]): StudySummary {
  const states: Array<ItemState | null> = index.items.map(() => null);
  const bestCombo: Array<ComboOutcome | null> = index.items.map(() => null);
  const reactions: Record<string, Reaction[]> = {};
  const errors: StudySummary['errors'] = [];
  const warnings = new Set<string>();
  for (const o of outcomes) {
    if (o.error) {
      errors.push({ combo: o.combo.id, cls: o.combo.cls, ...o.error });
      continue;
    }
    const r = o.result!;
    reactions[o.combo.id] = r.reactions;
    for (const w of r.warnings) warnings.add(w);
    if (o.combo.cls !== 'ULS') continue;
    index.items.forEach((item, t) => {
      const e = evaluateItem(ctx, index, item, o.combo, r, false);
      const cur = states[t];
      if (!cur || e.eta > cur.eta) {
        states[t] = e;
        bestCombo[t] = o;
      }
    });
  }
  // détail du cas déterminant
  index.items.forEach((item, t) => {
    const o = bestCombo[t];
    if (o?.result) states[t] = evaluateItem(ctx, index, item, o.combo, o.result, true);
  });
  return { states, reactions, errors, warnings: [...warnings], done: outcomes.map((o) => o.combo.id) };
}

/** Fusion des résumés de plusieurs paquets (le pire l'emporte). */
export function mergeSummaries(parts: StudySummary[]): StudySummary {
  const n = parts[0]?.states.length ?? 0;
  const states: Array<ItemState | null> = Array.from({ length: n }, (_, t) => parts.reduce<ItemState | null>((best, p) => (p.states[t] && (!best || p.states[t]!.eta > best.eta) ? p.states[t] : best), null));
  return {
    states,
    reactions: Object.assign({}, ...parts.map((p) => p.reactions)),
    errors: parts.flatMap((p) => p.errors),
    warnings: [...new Set(parts.flatMap((p) => p.warnings))],
    done: parts.flatMap((p) => p.done),
  };
}

// ─── stabilité ───

export interface StabilityResult {
  overturning: { verdict: Verdict; text: string; combos: string[] };
  sliding: { eta: number; muReq: number; combo: string; record?: CalcRecord };
}

/** Basculement (stabilité du calcul non linéaire) et glissement global (μ requis / μ disponible). */
export function stability(summary: StudySummary, combos: Combination[], mu: number): StabilityResult {
  const stab = combos.filter((c) => c.cls === 'STAB');
  const failed = summary.errors.filter((e) => e.cls === 'STAB');
  let muReq = 0;
  let combo = '';
  let H = 0;
  let V = 0;
  for (const c of stab) {
    const R = summary.reactions[c.id];
    if (!R) continue;
    const s = R.reduce((a, r) => [a[0] + r.R[0], a[1] + r.R[1], a[2] + r.R[2]], [0, 0, 0]);
    const h = Math.hypot(s[0], s[2]);
    const m = s[1] > 0 ? h / s[1] : Infinity;
    if (m > muReq || !combo) [muReq, combo, H, V] = [m, c.id, h, s[1]];
  }
  const eta = muReq / mu;
  return {
    overturning: failed.length
      ? { verdict: 'fail', text: failed.map((e) => e.message).join(' ; '), combos: failed.map((e) => e.combo) }
      : stab.every((c) => summary.reactions[c.id])
        ? { verdict: 'ok', text: 'Système stable avec des appuis en compression seule (basculement vérifié dans le calcul non linéaire).', combos: [] }
        : { verdict: 'incomplete', text: 'Combinaisons de stabilité non calculées.', combos: [] },
    sliding: {
      eta,
      muReq,
      combo,
      record: combo
        ? {
            key: 'stability.sliding',
            title: 'Glissement global',
            clause: 'statico 24-0571 § 4',
            formula: 'μ requis = √(ΣRx² + ΣRy²) / ΣRz ≤ μ disponible',
            withValues: `${combo} : ${fmtNumber(H / 1e3)} kN / ${fmtNumber(V / 1e3)} kN = ${fmtNumber(muReq)} ; μ = ${fmtNumber(mu)} → η = ${fmtNumber(eta)}`,
            eta,
            combination: combo,
          }
        : undefined,
    },
  };
}

// ─── verdict, familles, classement ───

export interface FamilyRow {
  family: string;
  count: number;
  eta: number;
  item: number;
  verdict: Verdict;
}

export interface StudyVerdict {
  verdict: Verdict;
  families: FamilyRow[];
  /** indices des vérifications, du plus chargé au moins chargé */
  ranking: number[];
  blocked: number[];
  reasons: string[];
}

export function studyVerdict(index: ItemIndex, summary: StudySummary, stab: StabilityResult): StudyVerdict {
  const fam = new Map<string, FamilyRow>();
  const blocked: number[] = [];
  index.items.forEach((it, t) => {
    const s = summary.states[t];
    const eta = s ? s.eta : NaN;
    if (s?.blocked || !s) blocked.push(t);
    const row = fam.get(it.family) ?? { family: it.family, count: 0, eta: -1, item: t, verdict: 'ok' as Verdict };
    row.count++;
    if (!(row.eta >= eta)) [row.eta, row.item] = [eta, t];
    fam.set(it.family, row);
  });
  for (const r of fam.values()) r.verdict = blocked.some((t) => index.items[t].family === r.family) ? 'incomplete' : verdictOf(r.eta);
  const ranking = index.items.map((_, t) => t).sort((a, b) => (summary.states[b]?.eta ?? Infinity) - (summary.states[a]?.eta ?? Infinity));
  const reasons: string[] = [];
  const ulsErrors = summary.errors.filter((e) => e.cls === 'ULS');
  if (ulsErrors.length) reasons.push(...ulsErrors.map((e) => `${e.combo} : ${e.message}`));
  if (blocked.length) reasons.push(`${blocked.length} vérification(s) bloquée(s) : ${[...new Set(blocked.map((t) => summary.states[t]?.blocked ?? `${index.items[t].label} non calculé`))].slice(0, 3).join(' ; ')}`);
  if (stab.overturning.verdict === 'fail') reasons.push(`Basculement : ${stab.overturning.text} — lest ou ancrage nécessaire`);
  if (stab.sliding.eta > 1) reasons.push(`Glissement global (${stab.sliding.combo}) : μ requis ${fmtNumber(stab.sliding.muReq)} > μ disponible ${fmtNumber(stab.sliding.muReq / stab.sliding.eta)} — lest, ancrage ou frottement à justifier`);
  const vs: Verdict[] = [...fam.values()].map((r) => r.verdict);
  vs.push(stab.overturning.verdict, verdictOf(stab.sliding.eta));
  if (ulsErrors.some((e) => e.code === 'instability' || e.code === 'mechanism')) vs.push('fail');
  else if (ulsErrors.length) vs.push('incomplete');
  return { verdict: worstVerdict(vs), families: [...fam.values()].sort((a, b) => b.eta - a.eta), ranking, blocked, reasons };
}

// ─── réactions → groupes d'appuis (calage) ───

/**
 * Groupes d'appuis (angles distants de moins de `tolerance` en plan) et réactions extrêmes par groupe :
 * REd = max ELU de la somme du groupe, REdMin = min ELU et stabilité, Rk = max ELS (sinon REd / 1,35).
 */
export function groundEstimate(
  s: StructuralModel,
  summary: StudySummary,
  combos: Combination[],
  tolerance = 100,
  opts: { roofAccessible?: boolean; horizontalRatio?: number } = {},
): Estimate {
  const pos = (k: number): P2 => {
    const n = s.fem.nodes[s.fem.supports[k].node];
    return [n.x, n.z];
  };
  const pts = s.fem.supports.map((_, k) => k);
  const parent = pts.map((k) => k);
  const find = (k: number): number => (parent[k] === k ? k : (parent[k] = find(parent[k])));
  for (const a of pts)
    for (const b of pts) {
      if (b <= a) continue;
      const [ma, mb] = [s.supportMeta[a], s.supportMeta[b]];
      if ((ma.kind === 'middle') !== (mb.kind === 'middle') || (ma.kind === 'stair') !== (mb.kind === 'stair') || (ma.kind === 'post') !== (mb.kind === 'post')) continue;
      const [pa, pb] = [pos(a), pos(b)];
      if (Math.hypot(pa[0] - pb[0], pa[1] - pb[1]) <= tolerance) parent[find(a)] = find(b);
    }
  const clusters = new Map<number, number[]>();
  for (const k of pts) {
    const r = find(k);
    if (!clusters.has(r)) clusters.set(r, []);
    clusters.get(r)!.push(k);
  }
  const center = (c: number[]): P2 => [c.reduce((a, k) => a + pos(k)[0], 0) / c.length, c.reduce((a, k) => a + pos(k)[1], 0) / c.length];
  const list = [...clusters.values()].sort((a, b) => Math.round(center(a)[1] / 500) - Math.round(center(b)[1] / 500) || center(a)[0] - center(b)[0]);
  const groups: SupportGroup[] = list.map((c, k) => {
    const middle = s.supportMeta[c[0]].kind === 'middle';
    // pied de poteau (ajouté par l'étude ou du modèle) : calé comme un pied d'escalier (platine 15 × 15 cm)
    const post = s.supportMeta[c[0]].kind === 'post';
    const stair = s.supportMeta[c[0]].kind === 'stair' || post;
    const jack = s.supportMeta[c[0]].jack;
    return { id: `${post ? 'R' : stair ? 'E' : middle ? 'M' : 'P'}${k + 1}`, position: center(c), corners: middle || stair ? 0 : c.length, middle, jack, ...(stair ? { stair } : {}), ...(post ? { post } : {}), moduleIds: [...new Set(c.map((x) => s.supportMeta[x].module))] };
  });
  const sum = (c: number[], id: string) => {
    const R = summary.reactions[id];
    return R ? c.reduce((a, k) => a + R[k].R[1], 0) : undefined;
  };
  const byCls = (cls: Combination['cls'][]) => combos.filter((c) => cls.includes(c.cls) && summary.reactions[c.id]);
  const uls = byCls(['ULS']);
  const low = byCls(['ULS', 'STAB']);
  const sls = byCls(['SLS']);
  const reactions: GroupReaction[] = list.map((c, g) => {
    let [REd, combo] = [-Infinity, ''];
    for (const x of uls) {
      const v = sum(c, x.id)!;
      if (v > REd) [REd, combo] = [v, x.id];
    }
    let REdMin = Infinity;
    for (const x of low) REdMin = Math.min(REdMin, sum(c, x.id)!);
    let [Rk, comboK, RkMin] = [-Infinity, '', Infinity];
    for (const x of sls) {
      const v = sum(c, x.id)!;
      if (v > Rk) [Rk, comboK] = [v, x.id];
      RkMin = Math.min(RkMin, v);
    }
    if (!sls.length) [Rk, comboK, RkMin] = [REd / 1.35, `${combo} / 1,35`, REdMin / 1.35];
    const G = sls.length ? (sum(c, 'ELS0') ?? 0) : (sum(c, 'CO1') ?? 0) / 1.35;
    return { group: groups[g], Rk, RkMin, REd, REdMin, combo, comboK, G, Q: Rk - G };
  });
  // charge verticale totale caractéristique : la combinaison ELS la plus lourde (sinon ELU / 1,35)
  const all = pts;
  const verticalK = sls.length ? Math.max(...sls.map((x) => sum(all, x.id)!)) : Math.max(...uls.map((x) => sum(all, x.id)! / 1.35));

  // public limité : part du public plein de chaque groupe, par direction, en service (Q1) et hors service (Q2), tirée des
  // combinaisons ELU « public seul » (COd1 = γG' ΣG + γQ Q1.d) et de CO1 = γG ΣG : (R(COd1) − γG'/γG · R(CO1)) / γQ
  const factor = (c: Combination, pre: string) => c.factors.find(([k]) => k.startsWith(pre))?.[1] ?? 0;
  const co1 = combos.find((c) => c.id === 'CO1' && summary.reactions[c.id]);
  const qOnly = (d: number | undefined, svc: 'in' | 'out') =>
    combos.find((c) => c.cls === 'ULS' && c.direction === d && c.service === svc && summary.reactions[c.id] && factor(c, 'Q') > 0 && !c.factors.some(([k]) => k.startsWith('W')));
  const qPart = (c: number[], x: Combination): number => {
    const q = x.factors.find(([k]) => k.startsWith('Q'));
    if (!q || !co1) return 0;
    const ref = qOnly(x.direction, q[0].startsWith('Q2') ? 'out' : 'in');
    if (!ref) return 0;
    const gRef = factor(ref, 'G1');
    const g1 = factor(co1, 'G1');
    return Math.max(0, (sum(c, ref.id)! - (gRef / g1) * sum(c, co1.id)!) / factor(ref, 'Q'));
  };
  const used = [...uls, ...combos.filter((c) => c.cls === 'STAB' && summary.reactions[c.id]), ...sls];
  const entry = (c: number[], x: Combination): ComboReaction => ({ combo: x.id, cls: x.cls, R: sum(c, x.id)!, gQ: factor(x, 'Q'), Q: qPart(c, x) });
  reactions.forEach((r, g) => (r.combos = used.map((x) => entry(list[g], x))));
  const totals = used.map((x) => entry(all, x));
  // l'effort horizontal de la foule (H = V/10 au niveau des planchers) est dans la part du public : marge pour les planchers en hauteur
  const top = Math.max(0, ...s.modules.map((m) => m.level)) + (opts.roofAccessible ? 1 : 0);
  const publicCap = 1 + ((opts.horizontalRatio ?? 0.1) * top * 3080) / 2490;
  return { groups, reactions, totalG: reactions.reduce((a, r) => a + r.G, 0), totalQ: reactions.reduce((a, r) => a + r.Q, 0), verticalK, method: 'fem', totals, publicCap, units: [], warnings: [], records: [] };
}
