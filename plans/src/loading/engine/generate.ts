// Moteur de la loading liste : topologie × règles × réponses chantier × plaques de l'Étude structure → lignes.
// Pur et déterministe. Chaque ligne garde le détail du calcul (« 8 / box × 2 box = 16 · + 20 % → 20 »), les règles
// et leurs versions, la confiance, et les ids 3D d'où elle vient. Rien d'inventé : une base ou une condition qui ne
// se détermine pas devient une question ; un article calé seulement en box seules, rencontré en box connectées,
// sort en « règle manquante » avec les valeurs observées ; une ligne à l'appréciation n'a de quantité que saisie.
import { stableId } from '../../core/hash';
import type { CatalogueItem, Confidence, CountingBase, LoadingCategory, LoadingRule, RuleConditions, SeedObservation, Unit } from '../core/types';
import { COUNTING_BASE_LABEL } from '../core/types';
import type { SiteAnswers, StudyInput } from '../core/answers';
import { canonical, rulesVersion } from '../library/merge';
import { categoryFromDesignation } from '../library/importClasseur';
import type { Count, Counts, Island, Topology } from '../topology/types';

export type LineStatus = 'calcule' | 'a_confirmer' | 'appreciation' | 'regle_manquante' | 'jugement';

export interface Contribution {
  kind: 'produit' | 'regle' | 'substitution' | 'appreciation' | 'observation' | 'jugement';
  ruleKey?: string;
  ruleVersion?: number;
  /** quantité avant spare (null : non déterminée) et quantité finale de cette contribution */
  base: number | null;
  qty: number | null;
  detail: string;
  confidence?: Confidence;
  ids: string[];
}

export interface LoadingLine {
  article: string;
  designation: string;
  categorie: LoadingCategory;
  unit: Unit;
  /** quantité finale (spares compris) ; null = à déterminer */
  qty: number | null;
  status: LineStatus;
  confidence: Confidence;
  detail: string;
  contributions: Contribution[];
  /** ids topologie / nœuds 3D d'où vient la ligne */
  sources: string[];
  /** questions qui bloquent cette ligne */
  questions: string[];
}

export interface LoadingQuestion {
  id: string;
  text: string;
  ruleKeys: string[];
}

export interface LoadingList {
  lines: LoadingLine[];
  questions: LoadingQuestion[];
  /** remarques : produits sans règle d'accessoires, plaques de l'étude hors catalogue, pièces à identifier */
  notes: string[];
  rulesVersion: string;
  inputKey: string;
}

export interface EngineInput {
  topology: Topology;
  rules: readonly LoadingRule[];
  catalogue: ReadonlyMap<string, CatalogueItem>;
  answers?: SiteAnswers;
  study?: StudyInput | null;
  observations?: readonly SeedObservation[];
  /** corrections « seulement ce chantier » : quantité finale imposée par référence */
  judgements?: Readonly<Record<string, number>>;
}

/** Bases comptées îlot par îlot (une condition standalone / connecté / couvert se lit sur l'îlot). */
const ISLAND_BASES = new Set<CountingBase>([
  'box',
  'pied',
  'pied_box',
  'jonction_box',
  'jonction_grand_cote',
  'jonction_petit_cote',
  'jonction_toit_grand_cote',
  'jonction_toit_petit_cote',
  'cote_box_jonction',
  'bord',
  'jonction_panneau',
  'jonction_verre',
  'terminaison_vitre',
  'cote',
  'cote_vitre_court',
  'cote_vitre_long',
  'cote_facade_court',
  'cote_facade_long',
  'panneau',
  'panneau_plein',
  'porte_simple',
  'porte_double',
  'porte_coulissante',
  'ilot',
  'ilot_couvert',
  'module_toit',
  'poteau_connecte',
  'paire_box',
]);

const SHORT_BASE: Partial<Record<CountingBase, [string, string]>> = {
  box: ['box', 'box'],
  pied: ['pied', 'pieds'],
  pied_box: ['pied de box', 'pieds de box'],
  jonction_box: ['jonction', 'jonctions'],
  jonction_grand_cote: ['jonction grand côté', 'jonctions grand côté'],
  jonction_petit_cote: ['jonction petit côté', 'jonctions petit côté'],
  jonction_toit_grand_cote: ['jonction de toit grand côté', 'jonctions de toit grand côté'],
  jonction_toit_petit_cote: ['jonction de toit petit côté', 'jonctions de toit petit côté'],
  cote_box_jonction: ['côté à une jonction', 'côtés à une jonction'],
  jonction_panneau: ['jonction de panneaux', 'jonctions de panneaux'],
  jonction_verre: ['jonction avec vitre', 'jonctions avec vitre'],
  terminaison_vitre: ['bout de vitre', 'bouts de vitre'],
  cote: ['côté', 'côtés'],
  cote_vitre_court: ['petit côté vitré', 'petits côtés vitrés'],
  cote_vitre_long: ['grand côté vitré', 'grands côtés vitrés'],
  cote_facade_court: ['petit côté avec façade', 'petits côtés avec façade'],
  cote_facade_long: ['grand côté avec façade', 'grands côtés avec façade'],
  panneau: ['panneau', 'panneaux'],
  panneau_plein: ['mur', 'murs'],
  porte_simple: ['porte simple', 'portes simples'],
  porte_double: ['porte double', 'portes doubles'],
  porte_coulissante: ['porte coulissante', 'portes coulissantes'],
  poteau: ['poteau', 'poteaux'],
  ilot: ['îlot', 'îlots'],
  ilot_couvert: ['îlot couvert', 'îlots couverts'],
  module_toit: ['toit', 'toits'],
  poteau_connecte: ['bande de poteaux', 'bandes de poteaux'],
  paire_box: ['paire de box', 'paires de box'],
  airco: ['airco', 'airco'],
  m2_plancher: ['m²', 'm²'],
  job: ['chantier', 'chantiers'],
  sous_bois_etude: ['plaque de l’étude', 'plaques de l’étude'],
  produit: ['pièce', 'pièces'],
  bord: ['bord libre', 'bords libres'],
};
const baseWord = (b: CountingBase, n: number) => {
  const w = SHORT_BASE[b];
  return w ? (n > 1 ? w[1] : w[0]) : COUNTING_BASE_LABEL[b];
};
const UNIT_TXT: Record<Unit, string> = { pce: '', m: ' m', m2: ' m²', L: ' L' };
const fmt = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',');
/** arrondi au supérieur sans faux reste flottant (2,53 × 8 = 20,24 → 21 ; 20 × 1,3 = 26,000…04 → 26) */
const ceil = (x: number) => Math.ceil(x - 1e-9);

/** Les murs, les vitres et les portes simples partagent les mêmes racks de 15 places ; les places libres sont souvent
 * comblées par des spares (Amaury 12.10.2026) — proposé à l'appréciation, jamais ajouté d'office. */
export const RACK_PLACES = 15;

const CONF_RANK: Record<Confidence, number> = { confirme: 0, observe: 1, hypothese: 2, a_confirmer: 3 };
const STATUS_RANK: Record<LineStatus, number> = { calcule: 0, jugement: 1, appreciation: 2, a_confirmer: 3, regle_manquante: 4 };

interface Scope {
  island: Island | null;
  counts: Counts;
}

type Check = { ok: true } | { ok: false; question?: LoadingQuestion };

export function generate(input: EngineInput): LoadingList {
  const { topology: t, catalogue } = input;
  const answers = input.answers ?? {};
  const rules = input.rules.filter((r) => r.active);
  const contributions = new Map<string, Contribution[]>();
  const questions = new Map<string, LoadingQuestion>();
  const lineQuestions = new Map<string, Set<string>>();
  const notes: string[] = [];
  const unitOf = new Map<string, Unit>();
  const ask = (id: string, text: string, rule?: LoadingRule): LoadingQuestion => {
    const q = questions.get(id) ?? { id, text, ruleKeys: [] };
    if (rule && !q.ruleKeys.includes(rule.key)) q.ruleKeys.push(rule.key);
    questions.set(id, q);
    return q;
  };
  const push = (article: string, c: Contribution, unit?: Unit) => {
    contributions.set(article, [...(contributions.get(article) ?? []), c]);
    if (unit && unit !== 'pce') unitOf.set(article, unit);
  };
  const block = (article: string, q: LoadingQuestion) => lineQuestions.set(article, new Set([...(lineQuestions.get(article) ?? []), q.id]));

  const productQty = new Map(t.products.map((l) => [l.article, l]));
  const answeredAirco = answers.aircoCount;
  const drawnAirco = t.counts.airco?.value ?? 0;

  // ─── produits vus dans la 3D (et airco à prévoir) ───
  for (const l of t.products)
    push(l.article, {
      kind: 'produit',
      base: l.qty,
      qty: l.qty,
      detail: `${l.qty} ${l.qty > 1 ? 'poses' : 'pose'} dans la 3D${l.mirrorIds.length ? ` (${l.mirrorIds.length} doublon(s) miroir écarté(s))` : ''}${l.source === 'reponse' ? ', identifiée(s) ici' : l.source === 'memoire' ? ', reconnue(s) par la mémoire' : ''}`,
      ids: l.nodeIds,
    });
  if (answeredAirco && answeredAirco > 0) {
    const ref = [...catalogue.values()].find((c) => c.hvac)?.ref ?? '4-700-027';
    push(ref, { kind: 'produit', base: answeredAirco, qty: answeredAirco, detail: `${answeredAirco} airco à prévoir (question chantier, pas dans la 3D)`, ids: [] });
  }

  // ─── conditions ───
  const answerCheck = (rule: LoadingRule, key: keyof SiteAnswers, expected: unknown, text: string): Check => {
    const v = answers[key];
    if (v === undefined) return { ok: false, question: ask(`q:${key}`, text, rule) };
    return v === expected ? { ok: true } : { ok: false };
  };
  const check = (rule: LoadingRule, w: RuleConditions, scope: Scope): Check => {
    for (const [k, v] of Object.entries(w) as [keyof RuleConditions, unknown][]) {
      if (v === undefined) continue;
      let c: Check = { ok: true };
      switch (k) {
        case 'regime':
          c = { ok: scope.island ? scope.island.regime === v : t.islands.some((i) => i.regime === v) };
          break;
        case 'couvert':
          c = { ok: (scope.island ? scope.island.covered : t.islands.some((i) => i.covered)) === v };
          break;
        case 'connexion':
          c = { ok: scope.island ? scope.island.regime === 'connecte' : t.islands.some((i) => i.regime === 'connecte') };
          break;
        case 'position':
          break; // lu par la base (pieds d'angle / de milieu) ; sinon indicatif
        case 'aircoSlot':
          break; // lu par la base « airco »
        case 'airco': {
          if (answeredAirco === undefined && !drawnAirco) c = { ok: false, question: ask('q:aircoCount', 'Combien d’airco à prévoir en plus de celles dessinées dans la 3D ?', rule) };
          else c = { ok: (drawnAirco + (answeredAirco ?? 0) > 0) === v };
          break;
        }
        case 'chargeLourde':
          c = answerCheck(rule, 'chargeLourde', v, 'Charge lourde (véhicule…) sur les box ?');
          break;
        case 'plancherLamine':
          c = answerCheck(rule, 'plancherLamine', v, 'Revêtement de sol à poser (laminate / vinyle) ?');
          break;
        case 'revetementSol':
          c = answerCheck(rule, 'revetementSol', v, 'Revêtement de sol : vinyle clic « laminate » style parquet (4-740-010) ou vinyle floor (4-740-011) ?');
          break;
        case 'boarding':
          c = answerCheck(rule, 'boarding', v, 'Boarding sous les box (bakélite noire 4-740-009) ?');
          break;
        case 'hauteur':
          c = answerCheck(rule, 'hauteur', v, 'Travail en hauteur ou sur le toit ?');
          break;
        case 'tailleJob':
          c = answerCheck(rule, 'tailleJob', v, 'Petit ou gros job (peinture) ?');
          break;
        case 'montage':
          c = answerCheck(rule, 'montage', v, 'Montage en atelier ou sur chantier ?');
          break;
        case 'ralMurs': {
          const ral = answers.ralMurs;
          c = ral === undefined ? { ok: false, question: ask('q:ralMurs', 'RAL des murs demandé (blanc / 7024 une face…) ?', rule) } : { ok: ral === v };
          break;
        }
        case 'niveau':
          c = { ok: false, question: ask(`q:niveau:${rule.key}`, `${rule.article} : condition de niveau (${String(v)}) pas encore calée — à préciser`, rule) };
          break;
        default:
          c = { ok: false, question: ask(`q:${k}:${rule.key}`, `${rule.article} : condition « ${k} = ${String(v)} » pas encore détectée — à préciser`, rule) };
      }
      if (!c.ok) return c;
    }
    return { ok: true };
  };

  // ─── base de comptage ───
  const triggerProducts = (r: LoadingRule) =>
    t.products.filter((l) => (r.trigger.vitrage ? catalogue.get(l.article)?.vitrage === r.trigger.vitrage : false) || (r.trigger.articles ?? []).includes(l.article));
  const baseOf = (r: LoadingRule, scope: Scope, laminateM2: number | null): { value: number | null; ids: string[]; question?: LoadingQuestion; text?: string } => {
    const c: Count | undefined = scope.counts[r.per];
    switch (r.per) {
      case 'produit': {
        const ps = triggerProducts(r);
        return { value: ps.reduce((s, l) => s + l.qty, 0), ids: ps.flatMap((l) => l.nodeIds) };
      }
      case 'pied':
      case 'pied_box': {
        if (!r.when?.position || r.when.position === 'bord') return { value: c?.value ?? null, ids: c?.ids ?? [], question: c?.value === null ? ask('q:pieds', 'Nombre de pieds au sol à préciser (type de box sans gabarit de pieds)', r) : undefined };
        const mods = new Set(scope.island ? scope.island.moduleIds : t.modules.map((m) => m.id));
        const feet = t.feet.filter((f) => f.members.every((m) => mods.has(m.moduleId)));
        if (r.per === 'pied') {
          const fs = feet.filter((f) => f.kind === r.when!.position);
          return { value: fs.length, ids: fs.map((f) => f.id) };
        }
        const members = feet.flatMap((f) => f.members.filter((m) => m.kind === r.when!.position).map(() => f.id));
        return { value: members.length, ids: [...new Set(members)] };
      }
      case 'airco': {
        // airco dessinées + airco à prévoir (question chantier) ; aircoSlot ne sert qu'aux anciennes règles de décompte
        if (answeredAirco === undefined && !drawnAirco) return { value: null, ids: [], question: ask('q:aircoCount', 'Combien d’airco à prévoir en plus de celles dessinées dans la 3D ?', r) };
        const answered = answeredAirco ?? 0;
        const ids = t.counts.airco?.ids ?? [];
        if (r.when?.aircoSlot === 'nidaplast') return { value: answers.aircoSlot === 'nidaplast' ? answered : 0, ids: [], text: 'airco à prévoir, emplacement en nidaplast' };
        if (r.when?.aircoSlot === 'autre') return { value: drawnAirco + (answers.aircoSlot === 'vide' ? answered : 0), ids, text: 'airco dessinée(s) ou emplacement vide' };
        return { value: drawnAirco + answered, ids, text: drawnAirco && answered ? 'airco (dessinées + à prévoir)' : answered ? 'airco à prévoir' : undefined };
      }
      case 'm2_plancher': {
        const m2 = answers.plancherM2 ?? laminateM2;
        if (m2 === null || m2 === undefined) return { value: null, ids: [], question: ask('q:plancherM2', 'Combien de m² de revêtement de sol (laminate / vinyle) ?', r) };
        return { value: m2, ids: [], text: answers.plancherM2 !== undefined ? 'm² de revêtement de sol saisis' : 'm² de revêtement de sol (15 m² / box)' };
      }
      case 'sous_bois_etude': {
        const plate = catalogue.get(r.article)?.plaque;
        if (!input.study) return { value: null, ids: [], question: ask('q:etude', 'Faire l’Étude structure (étape « Sol & calage ») : elle donne le nombre de sous-bois de chaque taille', r) };
        if (!plate) return { value: null, ids: [], question: ask(`q:plaque:${r.article}`, `${r.article} : dimension de la plaque inconnue au catalogue`, r) };
        const n = input.study.plates.filter((p) => (p.l === plate.l && p.w === plate.w) || (p.l === plate.w && p.w === plate.l)).reduce((s, p) => s + p.quantity, 0);
        return { value: n, ids: [], text: `plaques ${plate.l / 10} × ${plate.w / 10} cm de l’étude` };
      }
      case 'job':
        return { value: 1, ids: [] };
      default:
        if (!c) return { value: null, ids: [], question: ask(`q:base:${r.per}`, `${COUNTING_BASE_LABEL[r.per]} : pas encore compté par l’app — à préciser`, r) };
        if (c.value === null) return { value: null, ids: c.ids, question: ask(`q:base:${r.per}`, `${c.detail} — à préciser`, r) };
        return { value: c.value, ids: c.ids };
    }
  };

  // ─── règles ───
  const islandScopes: Scope[] = t.islands.map((i) => ({ island: i, counts: t.islandCounts[i.id] ?? {} }));
  const globalScope: Scope = { island: null, counts: t.counts };
  const substitutions: { replaced: string; qty: number; by: string; rule: LoadingRule }[] = [];
  const standaloneOnly = new Map<string, { boxes: number; ids: string[] }>();
  let laminateM2: number | null = null;
  const ordered = [...rules].sort((a, b) => Number(a.per === 'm2_plancher') - Number(b.per === 'm2_plancher'));
  for (const r of ordered) {
    if (r.kind === 'appreciation') continue;
    const triggered = r.trigger.vitrage ? t.glazing.includes(r.trigger.vitrage) : r.trigger.articles?.length ? r.trigger.articles.some((a) => productQty.has(a)) : true;
    if (!triggered) continue;
    const scopes = ISLAND_BASES.has(r.per) ? islandScopes : [globalScope];
    let total = 0;
    let known = true;
    const ids: string[] = [];
    const parts: string[] = [];
    let blocking: LoadingQuestion | undefined;
    let text: string | undefined;
    for (const sc of scopes) {
      const ok = check(r, r.when ?? {}, sc);
      if (!ok.ok) {
        if (ok.question) blocking = ok.question;
        // règle calée en box seules, îlot connecté : à re-caler
        if (r.when?.regime === 'standalone' && sc.island?.regime === 'connecte') {
          const s = standaloneOnly.get(r.article) ?? { boxes: 0, ids: [] };
          if (!s.ids.includes(sc.island.id)) {
            s.boxes += sc.island.moduleIds.length;
            s.ids.push(sc.island.id);
          }
          standaloneOnly.set(r.article, s);
        }
        continue;
      }
      const b = baseOf(r, sc, laminateM2);
      if (b.value === null) {
        known = false;
        if (b.question) blocking = b.question;
        continue;
      }
      if (b.value === 0) continue;
      total += b.value;
      ids.push(...b.ids);
      text ??= b.text;
      if (sc.island && scopes.length > 1) parts.push(`${sc.island.id} ${b.value}`);
    }
    if (blocking && (!known || total === 0)) {
      block(r.article, blocking);
      push(r.article, { kind: 'regle', ruleKey: r.key, ruleVersion: r.version, base: null, qty: null, detail: `${describeQty(r)} — ${blocking.text}`, confidence: r.confidence, ids }, r.unit);
      continue;
    }
    if (total === 0) continue;
    const word = text ?? baseWord(r.per, total);
    const split = parts.length > 1 ? ` (${parts.join(' + ')})` : '';
    let base: number | null;
    let detail: string;
    if (r.qty === null) {
      block(r.article, ask(`q:qty:${r.key}`, `${r.article} : quantité « ${r.qtyText ?? '?'} » à préciser (${COUNTING_BASE_LABEL[r.per]})`, r));
      push(r.article, { kind: 'regle', ruleKey: r.key, ruleVersion: r.version, base: null, qty: null, detail: `« ${r.qtyText ?? '?'} » × ${fmt(total)} ${word}${split} — quantité à préciser`, confidence: r.confidence, ids }, r.unit);
      continue;
    }
    if (r.tranche?.mode === 'tranche') {
      base = ceil(total / r.tranche.parTranche) * r.tranche.pour;
      detail = `${fmt(r.tranche.pour)} par tranche de ${fmt(r.tranche.parTranche)} ${baseWord(r.per, 2)} : ${fmt(total)} ${word}${split} → ${ceil(total / r.tranche.parTranche)} tranche(s) = ${fmt(base)}`;
    } else if (r.tranche?.mode === 'paliers') {
      const p = r.tranche.paliers.find((x) => total >= x.min && (x.max === undefined || total <= x.max));
      if (!p) {
        const q = ask(`q:palier:${r.key}`, `${r.article} : ${fmt(total)} ${word} — au-delà des paliers connus, quantité à préciser`, r);
        block(r.article, q);
        push(r.article, { kind: 'regle', ruleKey: r.key, ruleVersion: r.version, base: null, qty: null, detail: q.text, confidence: r.confidence, ids }, r.unit);
        continue;
      }
      base = p.qty;
      detail = `${fmt(total)} ${word}${split} → palier ${p.min}${p.max ? `–${p.max}` : '+'} = ${fmt(p.qty)}`;
    } else {
      const raw = r.qty * total;
      // pièces : arrondi au-dessus tout de suite ; mètres / m² : arrondi seulement à la fin (après le spare)
      const withSpare = r.spare?.type === 'fixe' || r.spare?.type === 'pourcent';
      base = r.unit === 'pce' || !withSpare ? ceil(raw) : Math.round(raw * 100) / 100;
      detail = `${fmt(r.qty)}${UNIT_TXT[r.unit]} / ${baseWord(r.per, 1)} × ${fmt(total)} ${word}${split} = ${fmt(raw)}${base !== raw ? ` → ${fmt(base)}` : ''}`;
    }
    let qty = base;
    if (r.spare?.type === 'fixe') {
      qty = ceil(base + r.spare.valeur);
      detail += ` · + ${r.spare.valeur} spare → ${fmt(qty)}`;
    } else if (r.spare?.type === 'pourcent') {
      qty = ceil(base * (1 + r.spare.valeur / 100));
      detail += ` · + ${fmt(r.spare.valeur)} % arrondi au-dessus → ${fmt(qty)}`;
    } else if (r.spare?.type === 'texte') {
      detail += ` · spare « ${r.spare.texte} » à préciser`;
      block(r.article, ask(`q:spare:${r.key}`, `${r.article} : spare « ${r.spare.texte} » à préciser`, r));
    }
    if (r.article === '4-740-010' || r.article === '4-740-011') laminateM2 = (laminateM2 ?? 0) + qty;
    push(r.article, { kind: r.kind === 'substitution' ? 'substitution' : 'regle', ruleKey: r.key, ruleVersion: r.version, base, qty, detail, confidence: r.confidence, ids }, r.unit);
    if (r.replaces) substitutions.push({ replaced: r.replaces.article, qty: qty * r.replaces.qty, by: r.article, rule: r });
  }

  // substitutions : la pièce de remplacement prend la place de la pièce comptée (jamais plus que ce qui est compté)
  for (const s of substitutions) {
    const have = (contributions.get(s.replaced) ?? []).reduce((sum, c) => sum + (c.qty ?? 0), 0);
    const n = Math.min(have, s.qty);
    if (n <= 0) continue;
    push(s.replaced, { kind: 'substitution', ruleKey: s.rule.key, ruleVersion: s.rule.version, base: -n, qty: -n, detail: `− ${n} remplacé(s) par ${s.by}`, confidence: s.rule.confidence, ids: [] });
  }

  // articles calés seulement en box seules, rencontrés en box connectées : règle manquante, valeurs observées en repère
  for (const [article, s] of standaloneOnly) {
    if ((contributions.get(article) ?? []).some((c) => c.kind !== 'observation' && c.qty !== null && rules.some((r) => r.key === c.ruleKey && r.when?.regime !== 'standalone'))) continue;
    const obs = (input.observations ?? []).filter((o) => o.article === article);
    const seen = obs.map((o) => `${o.chantier || 'chantier'} : ${o.valeur} (${o.contexte})`).join(' ; ');
    push(article, {
      kind: 'observation',
      base: null,
      qty: null,
      detail: `règle calée en box seules ; ${s.boxes} box connectée(s) (${s.ids.join(', ')}) : règle à caler${seen ? ` — observé ${seen}` : ''}`,
      ids: s.ids,
    });
  }

  // à l'appréciation : quantité saisie, sinon proposée sur les chantiers passés
  for (const r of rules) {
    if (r.kind !== 'appreciation' || !/^\d-\d{3}-\d{3,5}$/.test(r.article)) continue;
    if (contributions.has(r.article)) continue;
    // à l'appréciation seulement si la question chantier le demande (boarding : « oui »)
    if (r.when?.boarding !== undefined && !check(r, { boarding: r.when.boarding }, globalScope).ok) continue;
    // airco : la question chantier « combien d'airco » remplace l'appréciation
    if (catalogue.get(r.article)?.hvac && (answeredAirco !== undefined || drawnAirco > 0)) continue;
    const v = answers.appreciation?.[r.article];
    const past = r.calibration.map((c) => c.note).filter(Boolean).join(' | ');
    push(r.article, {
      kind: 'appreciation',
      ruleKey: r.key,
      ruleVersion: r.version,
      base: v ?? null,
      qty: v ?? null,
      detail: v !== undefined ? `${fmt(v)} saisi à l’appréciation` : `à l’appréciation${past ? ` — chantiers passés : ${past}` : ''}`,
      confidence: r.confidence,
      ids: [],
    });
  }

  // ─── lignes ───
  const lines: LoadingLine[] = [];
  for (const [article, cs] of contributions) {
    const cat = catalogue.get(article);
    const rule = rules.find((r) => r.article === article);
    const anyNull = cs.some((c) => c.qty === null && c.kind !== 'observation' && c.kind !== 'appreciation');
    const sum = cs.reduce((s, c) => s + (c.qty ?? 0), 0);
    const onlyObs = cs.every((c) => c.kind === 'observation');
    const onlyApp = cs.every((c) => c.kind === 'appreciation');
    const conf = cs.reduce<Confidence>((w, c) => (c.confidence && CONF_RANK[c.confidence] > CONF_RANK[w] ? c.confidence : w), 'confirme');
    let status: LineStatus = 'calcule';
    if (onlyObs || cs.some((c) => c.kind === 'observation')) status = 'regle_manquante';
    else if (onlyApp) status = 'appreciation';
    else if (anyNull || conf === 'a_confirmer' || conf === 'hypothese' || lineQuestions.has(article)) status = 'a_confirmer';
    const qty = onlyObs ? null : onlyApp ? (cs[0].qty ?? null) : anyNull && sum === 0 ? null : sum;
    if (qty === 0 && status === 'calcule') continue;
    lines.push({
      article,
      designation: cat?.designation ?? rule?.articleName ?? article,
      categorie: cat?.categorie ?? categoryFromDesignation(article, rule?.articleName ?? ''),
      unit: unitOf.get(article) ?? cat?.unit ?? 'pce',
      qty,
      status,
      confidence: conf,
      detail: cs.map((c) => c.detail).join(' + '),
      contributions: cs,
      sources: [...new Set(cs.flatMap((c) => c.ids))],
      questions: [...(lineQuestions.get(article) ?? [])],
    });
  }

  // corrections « seulement ce chantier »
  for (const [article, v] of Object.entries(input.judgements ?? {})) {
    let l = lines.find((x) => x.article === article);
    if (!l) {
      const cat = catalogue.get(article);
      l = { article, designation: cat?.designation ?? article, categorie: cat?.categorie ?? 'structure', unit: cat?.unit ?? 'pce', qty: 0, status: 'jugement', confidence: 'confirme', detail: '', contributions: [], sources: [], questions: [] };
      lines.push(l);
    }
    const before = l.qty;
    l.contributions = [...l.contributions, { kind: 'jugement', base: v, qty: v, detail: `corrigé pour ce chantier : ${before ?? '?'} → ${v}`, ids: [] }];
    l.detail = `${l.detail ? `${l.detail} · ` : ''}corrigé pour ce chantier : ${before ?? '?'} → ${v}`;
    l.qty = v;
    l.status = 'jugement';
  }

  // remarques : produits sans règle d'accessoires, pièces à identifier, plaques de l'étude hors catalogue
  for (const p of t.products) {
    const c = catalogue.get(p.article);
    if (!c?.gros || c.pieds || c.vitrage || c.porte || /WALL/i.test(c.designation) || c.hvac) continue;
    if (rules.some((r) => (r.trigger.articles ?? []).includes(p.article))) continue;
    notes.push(`${p.article} ${c.designation} (${p.qty}) : aucune règle d’accessoires connue — règle manquante à compléter si ce produit en demande`);
  }
  for (const u of t.unknown) notes.push(`À identifier : ${u.label} (${u.nodeIds.length} pièce(s)) — étape Produits`);
  // racks murs / vitres / portes simples : places libres à combler en spares
  const racked = lines.filter((l) => {
    const c = catalogue.get(l.article);
    return l.qty && c && c.gros && !c.inclusDans && (c.vitrage || c.porte === 'simple' || (/\bWALL\b/i.test(c.designation) && !/GLASSWALL/i.test(c.designation)));
  });
  const inRacks = racked.reduce((s, l) => s + (l.qty ?? 0), 0);
  if (inRacks > 0) {
    const racks = Math.ceil(inRacks / RACK_PLACES);
    const free = racks * RACK_PLACES - inRacks;
    notes.push(
      `Racks murs / vitres / portes simples : ${inRacks} pièces → ${racks} rack(s) de ${RACK_PLACES}${free ? ` → ${free} place(s) libre(s) à combler en spares si tu veux (appréciation)` : ', racks pleins'}`,
    );
  }
  if (input.study)
    for (const p of input.study.plates)
      if (![...catalogue.values()].some((c) => c.plaque && ((c.plaque.l === p.l && c.plaque.w === p.w) || (c.plaque.l === p.w && c.plaque.w === p.l))))
        notes.push(`Plaque de l’étude ${p.label ?? ''} ${p.l} × ${p.w} mm (${p.quantity}) : pas de référence de sous-bois de cette taille au catalogue`);

  const ORDER: LoadingCategory[] = ['structure', 'quincaillerie', 'joints', 'electrique', 'consommables', 'ajouts'];
  lines.sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || ORDER.indexOf(a.categorie) - ORDER.indexOf(b.categorie) || (a.article < b.article ? -1 : 1));
  const version = rulesVersion(input.rules);
  const inputKey = stableId(
    canonical({
      version,
      counts: Object.fromEntries(Object.entries(t.counts).map(([k, c]) => [k, c?.value ?? null])),
      islands: t.islands.map((i) => [i.id, i.regime, i.covered, i.moduleIds.length]),
      products: t.products.map((p) => [p.article, p.qty]),
      glazing: t.glazing,
      answers,
      study: input.study?.plates ?? null,
      judgements: input.judgements ?? {},
    }),
  );
  return { lines, questions: [...questions.values()], notes, rulesVersion: version, inputKey };
}

function describeQty(r: LoadingRule): string {
  if (r.qty === null) return `« ${r.qtyText ?? '?'} »`;
  return `${fmt(r.qty)}${UNIT_TXT[r.unit]} ${COUNTING_BASE_LABEL[r.per]}`;
}
