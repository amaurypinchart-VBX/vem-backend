// Données d'une étude envoyées à l'IA pour rédiger les textes du rapport ou relire la cohérence : uniquement des
// valeurs du calcul, déjà arrondies comme dans le rapport. Le serveur refuse tout texte qui contient un nombre absent
// de ces données (garde-fou « aucun chiffre ne vient de l'IA »). Fonction pure.
import type { CalageResult } from '../core/calage';
import { speedOf } from '../core/wind';
import type { StudyInputs, StudyRun } from '../studyRun';
import { calageVerdict, familyName, slidingBallast } from './build';
import type { Lang } from './i18n';
import { LABELS } from './i18n';
import { translate } from './translate';

const r = (v: number, d = 2) => (Number.isFinite(v) ? Number(v.toFixed(d)) : null);

export interface FactsInput {
  lang: Lang;
  run: StudyRun;
  inputs: StudyInputs;
  calage: CalageResult | null;
  project?: { name?: string; client?: string; address?: string };
  /** portance admissible (kN/m²) */
  bearing?: number | null;
  warnings?: string[];
}

export function studyFacts(f: FactsInput): Record<string, unknown> {
  const { run, inputs, lang } = f;
  const L = LABELS[lang];
  const E = (s: string) => translate(lang, s);
  const s = run.structure;
  const st = run.summary.states;
  const loads = inputs.loads;
  const levels = new Set(s.modules.map((m) => m.level)).size;
  const xs = s.modules.flatMap((m) => [m.origin[0], m.origin[0] + m.u[0] * m.params.x1 + m.v[0] * m.params.y1]);
  const zs = s.modules.flatMap((m) => [m.origin[2], m.origin[2] + m.u[2] * m.params.x1 + m.v[2] * m.params.y1]);
  const H = Math.max(...s.modules.map((m) => m.origin[1] + m.params.topZ)) - Math.min(...s.modules.map((m) => m.origin[1]));
  const gTotal = run.loads.cases.filter((c) => c.group === 'G').reduce((a, c) => a - c.resultant[1], 0);
  const ground = calageVerdict(f.calage);
  const ballast = slidingBallast(run, inputs.options.friction);
  const edges = new Map<string, { objet: string; charge_kN_m: number | null; longueur_m: number; viewbox: Set<string> }>();
  for (const it of inputs.edgeItems) {
    const k = `${it.label}|${it.q}`;
    const e = edges.get(k) ?? { objet: it.label, charge_kN_m: r(it.q), longueur_m: 0, viewbox: new Set<string>() };
    e.longueur_m += (it.to - it.from) / 1e3;
    e.viewbox.add(it.module);
    edges.set(k, e);
  }
  return {
    langue: lang,
    projet: { nom: f.project?.name ?? '', client: f.project?.client ?? '', lieu: f.project?.address ?? '' },
    installation: {
      viewbox: s.modules.length,
      niveaux: levels,
      identifiants: s.modules.map((m) => m.id),
      emprise_x_m: r((Math.max(...xs) - Math.min(...xs)) / 1e3, 1),
      emprise_y_m: r((Math.max(...zs) - Math.min(...zs)) / 1e3, 1),
      hauteur_m: r(H / 1e3, 1),
      charges_permanentes_kN: r(gTotal / 1e3, 0),
      poids_pese_viewbox_kg: r(loads.moduleWeight / 9.81, 0),
    },
    habillages: [...edges.values()].map((e) => ({ objet: e.objet, charge_kN_m: e.charge_kN_m, longueur_m: r(e.longueur_m, 1), viewbox: [...e.viewbox] })),
    charges_ponctuelles: inputs.pointItems.map((p) => ({ objet: p.label, viewbox: p.module, kN: r(p.F / 1e3) })),
    hypotheses: {
      exploitation_kN_m2: r(loads.live * 1e3),
      vent_en_service_kN_m2: r(loads.windInService * 1e3),
      vent_hors_service_kN_m2: r(loads.windOutOfService * 1e3),
      vitesse_arret_exploitation_m_s: r(speedOf(loads.windInService), 1),
      vitesse_vigilance_m_s: r(0.75 * speedOf(loads.windInService), 1),
      vitesse_limite_hors_service_m_s: r(speedOf(loads.windOutOfService), 1),
      frottement_sol: inputs.options.friction,
      portance_kN_m2: f.bearing ?? null,
      pieds_a_verins: inputs.options.jacks,
      dernier_niveau_evacue_par_vent_fort: loads.evacuateTopLevel,
      toitures_accessibles: loads.roofAccessible,
      neige: false,
    },
    verdict: {
      resultat: L.verdict[run.verdict.verdict],
      calage: L.verdict[ground.verdict],
      motifs: run.verdict.reasons.map(E),
    },
    familles: run.verdict.families.map((x) => ({
      famille: E(familyName(x.family)),
      nombre: x.count,
      eta_max: r(st[x.item]?.eta ?? NaN),
      element: E(run.index.items[x.item].label),
      combinaison: st[x.item]?.combo ?? null,
    })),
    plancher: { eta: r(run.plywood.eta) },
    stabilite: {
      basculement: L.verdict[run.stability.overturning.verdict],
      glissement: { mu_requis: r(run.stability.sliding.muReq), mu_disponible: inputs.options.friction, eta: r(run.stability.sliding.eta), combinaison: run.stability.sliding.combo },
      lest_kg: ballast > 0 ? Math.ceil(ballast / 9.81 / 10) * 10 : 0,
    },
    calage: f.calage
      ? f.calage.types.map((t) => ({ type: E(t.label), appuis: t.reactions.length, Rzk_max_kN: r(t.Rzk / 1e3, 1), RzEd_max_kN: r(t.RzEd / 1e3, 1), solution: t.chosen ? E(t.chosen.summary) : null, standard: t.standard }))
      : null,
    materiel_de_calage: f.calage?.materials.map((m) => ({ designation: E(m.label), dimensions: m.dims, quantite: m.quantity })) ?? [],
    modele_de_calcul: {
      noeuds: s.fem.nodes.length,
      barres: s.fem.members.length,
      appuis: s.fem.supports.length,
      combinaisons: run.combos.length,
      boulons_entre_viewbox: s.meta.filter((m) => m.family === 'bolt').length,
      liaisons_verticales: s.meta.filter((m) => m.family === 'corner-link').length,
      contacts: s.meta.filter((m) => m.family === 'contact').length,
    },
    elements_bloquants: inputs.blocking.map(E),
    messages_du_calcul: [...new Set([...(f.warnings ?? []), ...run.warnings])].slice(0, 25).map(E),
  };
}
