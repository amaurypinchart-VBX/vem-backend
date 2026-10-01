// Résumé compact d'un calcul (verdict, familles, éléments les plus chargés, stabilité, appuis) : ce que le conseil
// ingénieur lit et compare d'une variante à l'autre. Valeurs arrondies (η au centième, kN au dixième) : ce sont les
// seuls chiffres que l'IA peut citer. Fonctions pures.
import type { StudyRun } from '../studyRun';
import { comboText, installationShape, slidingBallastN } from './diagnose';

const r2 = (v: number) => (Number.isFinite(v) ? Math.round(v * 100) / 100 : null);
const r1 = (v: number) => (Number.isFinite(v) ? Math.round(v * 10) / 10 : null);
const kN = (v: number) => r1(v / 1e3);

export interface RunDigest {
  verdict: string;
  motifs: string[];
  familles: Array<{ famille: string; nombre: number; eta_max: number | null; verdict: string }>;
  plus_charges: Array<{ id: string; element: string; famille: string; eta: number | null; verification: string; combinaison: string; bloque?: string }>;
  stabilite: { basculement: string; detail: string; glissement: { mu_requis: number | null; mu_disponible: number; eta: number | null; combinaison: string }; lest_glissement_kg: number };
  appuis: { nombre: number; reaction_max_kN: number | null; reaction_min_kN: number | null; soulevements: number; charge_verticale_caracteristique_kN: number | null };
  plancher_eta: number | null;
  installation: { viewbox: number; niveaux: number; largeur_x_m: number | null; largeur_y_m: number | null; hauteur_m: number | null; poids_propre_kN: number | null };
  erreurs_calcul: string[];
  avertissements: string[];
}

export function runDigest(run: StudyRun, friction: number, top = 12): RunDigest {
  const { index, summary, verdict, stability } = run;
  const shape = installationShape(run);
  const reacts = Object.values(summary.reactions);
  let [rMax, rMin, lifted] = [-Infinity, Infinity, 0];
  for (const R of reacts)
    for (const r of R) {
      rMax = Math.max(rMax, r.R[1]);
      rMin = Math.min(rMin, r.R[1]);
      if (r.lifted) lifted++;
    }
  const G = run.loads.cases.filter((c) => c.group === 'G').reduce((a, c) => a - c.resultant[1], 0);
  const slide = slidingBallastN(run, friction);
  return {
    verdict: verdict.verdict,
    motifs: verdict.reasons.slice(0, 6),
    familles: verdict.families.map((f) => ({ famille: f.family, nombre: f.count, eta_max: r2(f.eta), verdict: f.verdict })),
    plus_charges: verdict.ranking.slice(0, top).map((t) => {
      const it = index.items[t];
      const st = summary.states[t];
      return { id: it.id, element: it.label, famille: it.family, eta: st ? r2(st.eta) : null, verification: st?.governing ?? '', combinaison: st ? comboText(run, st.combo) : '', ...(st?.blocked ? { bloque: st.blocked } : {}) };
    }),
    stabilite: {
      basculement: stability.overturning.verdict,
      detail: stability.overturning.text,
      glissement: { mu_requis: r2(stability.sliding.muReq), mu_disponible: friction, eta: r2(stability.sliding.eta), combinaison: stability.sliding.combo },
      lest_glissement_kg: Math.max(0, Math.ceil(slide / 9.81 / 10) * 10),
    },
    appuis: {
      nombre: run.structure.fem.supports.length,
      reaction_max_kN: kN(rMax),
      reaction_min_kN: kN(rMin),
      soulevements: lifted,
      charge_verticale_caracteristique_kN: kN(run.ground.verticalK ?? NaN),
    },
    plancher_eta: r2(run.plywood.eta),
    installation: {
      viewbox: run.structure.modules.length,
      niveaux: shape.levels,
      largeur_x_m: r2(shape.widthX / 1e3),
      largeur_y_m: r2(shape.widthY / 1e3),
      hauteur_m: r2(shape.height / 1e3),
      poids_propre_kN: kN(G),
    },
    erreurs_calcul: summary.errors.slice(0, 4).map((e) => `${e.combo} : ${e.message}`),
    avertissements: run.warnings.slice(0, 5),
  };
}

/** Comparaison avant / après d'une variante : verdict, familles dont le taux change, éléments les plus chargés après. */
export function compareDigests(before: RunDigest, after: RunDigest) {
  const fam = new Map(before.familles.map((f) => [f.famille, f]));
  return {
    verdict_avant: before.verdict,
    verdict_apres: after.verdict,
    familles: after.familles.map((f) => ({ famille: f.famille, eta_avant: fam.get(f.famille)?.eta_max ?? null, eta_apres: f.eta_max, verdict: f.verdict })),
    familles_disparues: before.familles.filter((f) => !after.familles.some((g) => g.famille === f.famille)).map((f) => f.famille),
    glissement_eta: { avant: before.stabilite.glissement.eta, apres: after.stabilite.glissement.eta },
    basculement: { avant: before.stabilite.basculement, apres: after.stabilite.basculement },
    motifs_apres: after.motifs,
    plus_charges_apres: after.plus_charges.slice(0, 8),
  };
}
