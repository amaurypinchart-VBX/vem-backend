// Calcul d'une liaison personnalisée par la méthode des composants (DIN EN 1993-1-8 + NA, γM0 = 1,0, γM2 = 1,25,
// γM3 = 1,25) : pour chaque direction, la résistance d'une pièce = le minimum des maillons de son chemin d'effort,
// chacun avec sa formule écrite et ses valeurs (CalcRecord). Le minimum gouverne (jamais une moyenne). Une donnée
// absente (nuance, classe, gorge…) rend la direction « incomplète » avec la liste des champs à renseigner ; un frottement
// sans serrage contrôlé ou un taraudage court sont calculés mais « indicatifs » (pas de ✅). Fonctions pures ; N, mm.
import type { BoltGrade, JointComponent, JointDesign, JointDirection, PathStep } from '../jointDesign';
import { DIRECTION_LABEL, MODE_KIND, MODE_LABEL } from '../jointDesign';
import { materialByKey, steelStrength } from '../materials';
import type { CalcRecord } from '../records';
import { fmtNumber } from '../units';

const GM0 = 1.0;
const GM2 = 1.25;
const GM3 = 1.25;
/** perte de serrage (tassement, vibrations) appliquée au frottement */
export const PRELOAD_LOSS = 0.8;

/** Boulons : fub (N/mm²) et aire résistante As (mm², ISO 898 / EN 1993-1-8). */
export const BOLT_FUB: Record<BoltGrade, number> = { '4.6': 400, '5.6': 500, '8.8': 800, '10.9': 1000 };
export const BOLT_AS: Record<number, number> = { 8: 36.6, 10: 58, 12: 84.3, 14: 115, 16: 157, 18: 192, 20: 245, 22: 303, 24: 353, 27: 459, 30: 561 };
/** Coefficient βw des soudures d'angle (EN 1993-1-8 tab. 4.1). */
const BETA_W: Record<string, number> = { S235: 0.8, S275: 0.85, S355: 0.9 };

export interface StepResult {
  step: PathStep;
  component: string;
  label: string;
  /** résistance du maillon pour une pièce (N) ; null = donnée manquante */
  value: number | null;
  missing: string[];
  indicative?: string;
  record?: CalcRecord;
}

export interface DirectionResult {
  direction: JointDirection;
  /** résistance d'une pièce (N) = minimum des maillons ; 0 si aucun chemin ; null si incomplet */
  capacity: number | null;
  governing?: StepResult;
  steps: StepResult[];
  missing: string[];
  indicative: string[];
  /** aucune pièce ne retient cette direction */
  noPath: boolean;
}

export interface JointCalc {
  directions: Record<JointDirection, DirectionResult>;
  /** statut : recalculé (tout calculé avec des données saisies), indicatif, inconnu (données manquantes) */
  status: 'recalculated' | 'indicative' | 'unknown';
  missing: string[];
  indicative: string[];
  /** directions demandées par la fonction de la pièce sans chemin d'effort */
  noPath: JointDirection[];
}

const f2 = (v: number, d = 2) => fmtNumber(v, d);
const kN = (v: number) => `${f2(v / 1e3)} kN`;
const cm = (v: number) => f2(v / 10, 2);
const kNcm2 = (v: number) => f2(v / 10, 1);

function steel(grade: string | undefined, t: number | undefined) {
  const m = grade ? materialByKey(grade) : undefined;
  if (!m || m.family !== 'steel') return null;
  return steelStrength(m, t ?? 0) ?? null;
}

/** Résistance d'un maillon du chemin d'effort pour une pièce. */
export function stepResistance(d: JointDesign, step: PathStep, direction: JointDirection): StepResult {
  const byId = new Map(d.components.map((c) => [c.id, c]));
  const c = byId.get(step.component) as JointComponent | undefined;
  const n = Math.max(1, step.count ?? 1);
  const label = c ? `${c.label} — ${MODE_LABEL[step.mode]}${n > 1 ? ` (× ${n})` : ''}` : `${step.component} — ${MODE_LABEL[step.mode]}`;
  const out = (value: number | null, missing: string[], record?: Omit<CalcRecord, 'key' | 'title'>, indicative?: string): StepResult => ({
    step,
    component: step.component,
    label,
    value,
    missing,
    indicative,
    record: record && value !== null ? { key: `joint.${d.key}.${direction}.${step.component}.${step.mode}`, title: label, ...record, result: value } : undefined,
  });
  if (!c) return out(null, [`composant « ${step.component} » absent`]);
  if (c.kind !== MODE_KIND[step.mode]) return out(null, [`${c.label} : ${MODE_LABEL[step.mode]} demande un composant de type ${MODE_KIND[step.mode]}`]);
  const miss: string[] = [];
  const need = <T,>(v: T | undefined | null, what: string): T | undefined => {
    if (v === undefined || v === null || (typeof v === 'number' && !(v > 0))) miss.push(`${c.label} : ${what}`);
    return v ?? undefined;
  };

  // ─── boulons ───
  if (c.kind === 'bolt') {
    const dd = need(c.d, 'diamètre du boulon');
    const g = need(c.grade, 'classe du boulon (4.6, 5.6, 8.8, 10.9)');
    if (!dd || !g) return out(null, miss);
    const fub = BOLT_FUB[g];
    const As = BOLT_AS[dd] ?? 0.78 * (Math.PI * dd * dd) / 4;
    const A = c.threadInShear === false ? (Math.PI * dd * dd) / 4 : As;
    switch (step.mode) {
      case 'bolt-shear': {
        const av = c.threadInShear === false ? 0.6 : g === '10.9' ? 0.5 : 0.6;
        const v = (n * av * fub * A) / GM2;
        return out(v, [], { clause: 'DIN EN 1993-1-8 tab. 3.4', formula: 'Fv,Rd = αv · fub · A / γM2', withValues: `${n > 1 ? `${n} · ` : ''}${f2(av, 1)} · ${kNcm2(fub)} kN/cm² · ${f2(A / 100)} cm² / 1,25 = ${kN(v)}` });
      }
      case 'bolt-tension': {
        const v = (n * 0.9 * fub * As) / GM2;
        return out(v, [], { clause: 'DIN EN 1993-1-8 tab. 3.4', formula: 'Ft,Rd = k2 · fub · As / γM2', withValues: `${n > 1 ? `${n} · ` : ''}0,9 · ${kNcm2(fub)} kN/cm² · ${f2(As / 100)} cm² / 1,25 = ${kN(v)}` });
      }
      case 'bolt-punching': {
        const p = step.plate ? (byId.get(step.plate) as JointComponent | undefined) : undefined;
        if (!p || p.kind !== 'plate') return out(null, [`${c.label} : plaque sous la tête ou l’écrou à choisir`]);
        const tp = p.t ?? (miss.push(`${p.label} : épaisseur`), undefined);
        const st = steel(p.grade, p.t) ?? (miss.push(`${p.label} : nuance d’acier`), null);
        if (!tp || !st) return out(null, miss);
        // dm = moyenne des cotes sur plats et sur angles de la tête (≈ 1,6 d pour la série ISO 4014 / 4017)
        const dm = 1.6 * dd;
        const v = (n * 0.6 * Math.PI * dm * tp * st.fu) / GM2;
        return out(v, [], { clause: 'DIN EN 1993-1-8 tab. 3.4', formula: 'Bp,Rd = 0,6 · π · dm · tp · fu / γM2 (dm ≈ 1,6 d)', withValues: `0,6 · π · ${cm(dm)} cm · ${cm(tp)} cm · ${kNcm2(st.fu)} kN/cm² / 1,25 = ${kN(v)}` });
      }
      case 'thread': {
        const L = need(c.tappedLength, 'longueur en prise du taraudage');
        if (!L) return out(null, miss);
        const Ft = (0.9 * fub * As) / GM2;
        const k = Math.min(1, L / (0.8 * dd));
        const v = n * Ft * k;
        return out(
          v,
          [],
          { clause: 'règle approchée (écrou ISO : hauteur ≥ 0,8 d pour la pleine résistance)', formula: 'F = Ft,Rd · min(1 ; L / (0,8 d))', withValues: `${kN(Ft)} · min(1 ; ${f2(L, 0)} / ${f2(0.8 * dd, 0)}) = ${kN(v)}` },
          'filetage dans une plaque taraudée : règle approchée, à faire valider (essai d’arrachement ou fiche du fabricant)',
        );
      }
      case 'friction': {
        const planes = Math.max(1, step.planes ?? 1);
        const contact = d.components.find((x) => x.kind === 'contact');
        const mu = contact && contact.kind === 'contact' ? contact.mu : undefined;
        if (!(mu && mu > 0)) return out(null, ['coefficient de frottement μ de la surface serrée (brut, peint, galvanisé…)']);
        if (g !== '8.8' && g !== '10.9') return out(null, [`${c.label} : frottement seulement avec des boulons 8.8 ou 10.9 précontraints`]);
        const Fp = 0.7 * fub * As;
        const v = (n * planes * mu * Fp * PRELOAD_LOSS) / GM3;
        return out(
          v,
          [],
          { clause: 'DIN EN 1993-1-8 § 3.9', formula: 'Fs,Rd = ks · n · μ · Fp,C · 0,8 / γM3 (Fp,C = 0,7 fub As, perte de serrage 0,8)', withValues: `${n} · ${planes} · ${f2(mu)} · ${kN(Fp)} · 0,8 / 1,25 = ${kN(v)}` },
          c.preload === 'controlled' ? undefined : 'résistance par frottement non garantie sans serrage contrôlé (boulons précontraints, couple spécifié)',
        );
      }
      default:
        return out(null, [`mode ${step.mode} inapplicable à un boulon`]);
    }
  }

  // ─── plaques ───
  if (c.kind === 'plate') {
    const t = need(c.t, 'épaisseur');
    const st = steel(c.grade, c.t) ?? (miss.push(`${c.label} : nuance d’acier (S235, S275, S355)`), null);
    switch (step.mode) {
      case 'plate-bearing': {
        const b = step.bolt ? (byId.get(step.bolt) as JointComponent | undefined) : undefined;
        if (!b || b.kind !== 'bolt') return out(null, [...miss, `${c.label} : boulon qui appuie à choisir`]);
        const dd = b.d ?? (miss.push(`${b.label} : diamètre`), undefined);
        const g = b.grade ?? (miss.push(`${b.label} : classe`), undefined);
        const d0 = c.hole?.d0 ?? (dd ? dd + 2 : undefined);
        if (!t || !st || !dd || !g || !d0) return out(null, miss);
        const e1 = c.hole?.e1;
        const e2 = c.hole?.e2;
        const ad = e1 ? e1 / (3 * d0) : 1;
        const ab = Math.min(ad, BOLT_FUB[g] / st.fu, 1);
        const k1 = e2 ? Math.min((2.8 * e2) / d0 - 1.7, 2.5) : 2.5;
        const v = (n * k1 * ab * st.fu * dd * t) / GM2;
        const pin = !e1 || !e2 ? 'pinces non renseignées : supposées suffisantes (αb = 1, k1 = 2,5)' : undefined;
        return out(v, [], { clause: 'DIN EN 1993-1-8 tab. 3.4', formula: 'Fb,Rd = k1 · αb · fu · d · t / γM2', withValues: `${f2(k1, 2)} · ${f2(ab, 2)} · ${kNcm2(st.fu)} kN/cm² · ${cm(dd)} cm · ${cm(t)} cm / 1,25 = ${kN(v)}${pin ? ` (${pin})` : ''}` }, pin);
      }
      case 'plate-net': {
        const w = need(c.width, 'largeur');
        const d0 = c.hole?.d0 ?? 0;
        if (!t || !st || !w) return out(null, miss);
        const v = (n * 0.9 * (w - d0) * t * st.fu) / GM2;
        return out(v, [], { clause: 'DIN EN 1993-1-1 6.2.3', formula: 'Nu,Rd = 0,9 · (b − d0) · t · fu / γM2', withValues: `0,9 · (${cm(w)} − ${cm(d0)}) cm · ${cm(t)} cm · ${kNcm2(st.fu)} kN/cm² / 1,25 = ${kN(v)}` });
      }
      case 'plate-gross': {
        const w = need(c.width, 'largeur');
        if (!t || !st || !w) return out(null, miss);
        const v = (n * w * t * st.fy) / GM0;
        return out(v, [], { clause: 'DIN EN 1993-1-1 6.2.3', formula: 'Npl,Rd = b · t · fy / γM0', withValues: `${cm(w)} cm · ${cm(t)} cm · ${kNcm2(st.fy)} kN/cm² / 1,0 = ${kN(v)}` });
      }
      case 'plate-bending':
      case 'plate-hinges': {
        const w = need(c.width, 'largeur qui travaille en flexion');
        const e = step.lever ?? (miss.push(`${c.label} : bras de levier (distance entre l’effort et l’appui)`), undefined);
        if (!t || !st || !w || !e) return out(null, miss);
        const Mg = ((w * t * t) / 4) * (st.fy / GM0);
        if (step.mode === 'plate-bending') {
          const v = (n * Mg) / e;
          return out(v, [], { clause: 'DIN EN 1993-1-1 6.2.5 (console, rotule plastique)', formula: 'F = Mpl,Rd / e ; Mpl,Rd = b · t² / 4 · fy / γM0', withValues: `${f2(Mg / 1e4)} kNcm / ${cm(e)} cm = ${kN(v)}` });
        }
        const d0 = c.hole?.d0 ?? 0;
        const Mn = (((w - d0) * t * t) / 4) * (st.fy / GM0);
        const v = (n * (Mn + Mg)) / e;
        return out(v, [], { clause: 'méthode statico 24-0571 § 3.9 (deux rotules plastiques)', formula: 'F = (Mpl,net + Mpl,brut) / e', withValues: `(${f2(Mn / 1e4)} kNcm + ${f2(Mg / 1e4)} kNcm) / ${cm(e)} cm = ${kN(v)}` });
      }
      default:
        return out(null, [`mode ${step.mode} inapplicable à une plaque`]);
    }
  }

  // ─── soudures ───
  if (c.kind === 'weld') {
    const a = need(c.a, 'gorge a de la soudure');
    const L = need(c.length, 'longueur utile de la soudure');
    const grade = c.grade ?? 'S235';
    const st = steel(grade, 10);
    if (!a || !L || !st) return out(null, miss);
    const bw = BETA_W[grade] ?? 0.9;
    const fvw = st.fu / Math.sqrt(3) / (bw * GM2);
    const v = n * a * L * fvw;
    return out(v, [], { clause: 'DIN EN 1993-1-8 § 4.5.3.3 (méthode simplifiée)', formula: 'Fw,Rd = a · L · fu / (√3 · βw · γM2)', withValues: `${cm(a)} cm · ${cm(L)} cm · ${kNcm2(st.fu)} kN/cm² / (√3 · ${f2(bw)} · 1,25) = ${kN(v)}` });
  }

  // ─── contact en compression ───
  if (c.kind === 'contact') {
    const A = need(c.area, 'surface d’appui');
    const st = steel(c.grade ?? 'S235', 10);
    if (!A || !st) return out(null, miss);
    const v = (n * A * st.fy) / GM0;
    return out(v, [], { clause: 'DIN EN 1993-1-1 6.2.4', formula: 'Nc,Rd = A · fy / γM0', withValues: `${f2(A / 100)} cm² · ${kNcm2(st.fy)} kN/cm² = ${kN(v)}` });
  }
  return out(null, ['composant inconnu']);
}

const DIRECTIONS: JointDirection[] = ['uplift', 'slideLong', 'slideShort', 'compression'];

/** Résistance d'une pièce dans chaque direction, statut de la liaison. */
export function computeJoint(d: JointDesign): JointCalc {
  const directions = {} as Record<JointDirection, DirectionResult>;
  const wanted: Record<JointDirection, boolean> = { uplift: d.function.antiUplift, slideLong: d.function.antiSlide, slideShort: d.function.antiSlide, compression: d.function.carriesCompression };
  for (const dir of DIRECTIONS) {
    const steps = (d.paths[dir] ?? []).map((s) => stepResistance(d, s, dir));
    const missing = [...new Set(steps.flatMap((s) => s.missing))];
    const indicative = [...new Set(steps.map((s) => s.indicative).filter((x): x is string => !!x))];
    const noPath = steps.length === 0;
    const done = steps.filter((s) => s.value !== null);
    const governing = done.length === steps.length && done.length ? done.reduce((a, b) => (b.value! < a.value! ? b : a)) : undefined;
    directions[dir] = { direction: dir, capacity: noPath ? 0 : governing ? governing.value : null, governing, steps, missing, indicative, noPath };
  }
  const used = DIRECTIONS.filter((x) => wanted[x]);
  const missing = [...new Set(used.flatMap((x) => directions[x].missing))];
  const indicative = [...new Set(used.flatMap((x) => directions[x].indicative))];
  if (d.principle !== 'positive' && !d.components.some((c) => c.kind === 'bolt' && c.preload === 'controlled')) indicative.push('résistance par frottement non garantie sans serrage contrôlé');
  const noPath = used.filter((x) => directions[x].noPath);
  const status = missing.length || noPath.length ? 'unknown' : indicative.length ? 'indicative' : 'recalculated';
  return { directions, status, missing, indicative: [...new Set(indicative)], noPath };
}

/** Texte court d'une direction : « soulèvement : 94,08 kN par pièce (boulon en cisaillement) ». */
export function directionText(r: DirectionResult): string {
  if (r.noPath) return `${DIRECTION_LABEL[r.direction]} : ne retient rien (aucun chemin d’effort)`;
  if (r.capacity === null) return `${DIRECTION_LABEL[r.direction]} : incomplet (${r.missing.length} donnée(s) manquante(s))`;
  return `${DIRECTION_LABEL[r.direction]} : ${kN(r.capacity)} par pièce (${r.governing?.label ?? '—'})`;
}
