// src/services/structureAiGuard.ts
// Garde-fou des réponses IA de l'étude structure (Plans Viewbox) : aucun chiffre ne doit venir de l'IA. Un texte rédigé
// par l'IA (description, conclusion, alertes de relecture) ne peut contenir que des nombres présents dans les données
// qu'on lui a fournies ; une valeur lue dans un document de référence doit figurer dans l'extrait cité.
// Fonctions pures, sans dépendance (testées par plans/tests/structure/aiGuard.test.ts).

/**
 * Nombres « isolés » d'un texte : 12 · 1,20 · 0.37 · 5 900 · −0,5. Les nombres collés à des lettres ou à des traits
 * d'union font partie d'un identifiant et ne sont pas contrôlés (VBX-02, CO303, S235, M20, EN 1993-1-1, F40/30).
 */
export function numbersIn(text: string): number[] {
  const out: number[] = [];
  const re = /(?<![\p{L}\p{N}_.,/·-])([−-]?)(\d{1,3}(?:[   ]\d{3})+|\d+)(?:[.,](\d+))?(?![\p{L}\p{N}_/-]|[.,]\d)/gu;
  for (const m of text.matchAll(re)) {
    const int = m[2].replace(/[   ]/g, '');
    const v = Number(`${int}${m[3] ? `.${m[3]}` : ''}`);
    if (Number.isFinite(v)) out.push(m[1] ? -v : v);
  }
  return out;
}

/** Toutes les valeurs numériques d'une donnée (nombres, et nombres écrits dans les chaînes). */
export function numbersOf(data: unknown, acc: number[] = []): number[] {
  if (typeof data === 'number' && Number.isFinite(data)) acc.push(data);
  else if (typeof data === 'string') acc.push(...numbersIn(data));
  else if (Array.isArray(data)) for (const x of data) numbersOf(x, acc);
  else if (data && typeof data === 'object') for (const x of Object.values(data as Record<string, unknown>)) numbersOf(x, acc);
  return acc;
}

/** Petits entiers admis partout (comptages, ordinaux : « deux », « 2ᵉ ordre », « 1 angle »). */
const ALWAYS = [0, 1, 2, 3];

const close = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b));

/**
 * Nombres du texte qui ne correspondent à aucune valeur fournie, même arrondie à 0, 1, 2 ou 3 décimales (le signe
 * compte : « −0,5 » n'autorise pas « 0,5 » et inversement).
 */
export function unknownNumbers(text: string, allowed: readonly number[]): number[] {
  const ok = new Set<number>();
  for (const a of [...allowed, ...ALWAYS]) for (const d of [0, 1, 2, 3]) ok.add(Number(a.toFixed(d)));
  const okList = [...ok];
  return numbersIn(text).filter((v) => !okList.some((a) => close(Math.abs(v), Math.abs(a)) && Math.sign(v) * Math.sign(a) >= 0));
}

/** Un texte ne contient que des nombres des données (liste vide = accepté). */
export function checkText(text: string, data: unknown): number[] {
  return unknownNumbers(text, numbersOf(data));
}

// ─── contrôles des réponses (identification, regroupement, lecture de documents) ───

export interface IdentifyLike {
  role: string;
  nature: string;
  material?: string | null;
  section?: string | null;
  weight?: { value: number; unit: string } | null;
  confidence: number;
  questions: string[];
}

export interface IdentifyOptions {
  natures: Record<string, string[]>;
  materials: Array<{ key: string }>;
  sections: Array<{ key: string }>;
}

/** Contrôle d'une proposition : valeurs hors des listes permises → retirées, confiance plafonnée, question ajoutée. */
export function normalizeIdentify<T extends IdentifyLike>(out: T, opt: IdentifyOptions): T {
  const r: T = { ...out, questions: [...out.questions] };
  const problems: string[] = [];
  if (!opt.natures[r.role]) {
    problems.push(`rôle « ${r.role} » inconnu`);
    r.role = 'load';
  }
  if (!opt.natures[r.role].includes(r.nature)) {
    problems.push(`nature « ${r.nature} » impossible pour ce rôle`);
    r.nature = opt.natures[r.role][0];
  }
  if (r.material && !opt.materials.some((m) => m.key === r.material)) {
    problems.push(`matériau « ${r.material} » hors bibliothèque`);
    r.material = null;
  }
  if (r.section && !opt.sections.some((s) => s.key === r.section)) {
    problems.push(`section « ${r.section} » hors bibliothèque`);
    r.section = null;
  }
  if (r.weight && !(r.weight.value > 0 && r.weight.value < 1e6)) {
    problems.push('poids hors plage');
    r.weight = null;
  }
  r.confidence = Math.max(0, Math.min(1, Number.isFinite(r.confidence) ? r.confidence : 0));
  if (problems.length) {
    r.confidence = Math.min(r.confidence, 0.4);
    r.questions.push(`Proposition corrigée par l’outil : ${problems.join(' ; ')}.`);
  }
  return r;
}


/** Groupes valides : clés connues, sans doublon entre groupes, au moins deux types par groupe. */
export function normalizeGroups(out: { groups: Array<{ keys: string[]; label: string; reason: string }> }, keys: ReadonlySet<string>) {
  const used = new Set<string>();
  const groups: Array<{ keys: string[]; label: string; reason: string }> = [];
  for (const g of out.groups) {
    const ks = [...new Set(g.keys)].filter((k) => keys.has(k) && !used.has(k));
    if (ks.length < 2) continue;
    ks.forEach((k) => used.add(k));
    groups.push({ keys: ks, label: g.label, reason: g.reason });
  }
  return groups;
}


export interface Citation {
  text: string;
  page?: number;
}

/** Citations renvoyées par l'API (extraits exacts du document, avec la page). */
export function citationsOf(data: any): Citation[] {
  const out: Citation[] = [];
  for (const b of data?.content ?? [])
    for (const c of b?.citations ?? []) if (typeof c?.cited_text === 'string') out.push({ text: c.cited_text, page: typeof c.start_page_number === 'number' ? c.start_page_number : undefined });
  return out;
}

/**
 * Contrôle des valeurs lues : chaque nombre d'une entrée doit figurer dans un extrait exact du document (citation de
 * l'API) ou, à défaut, dans l'extrait recopié par l'IA (moins sûr).
 */
export function verifyExtract(entryValues: unknown, quote: string, citations: Citation[]): { verified: 'citation' | 'quote' | 'no'; missing: number[] } {
  const values = numbersOf(entryValues);
  const cited = citations.flatMap((c) => numbersIn(c.text));
  const missCited = unknownNumbers(values.map((v) => String(v).replace('.', ',')).join(' '), cited);
  if (citations.length && !missCited.length) return { verified: 'citation', missing: [] };
  const missQuote = unknownNumbers(values.map((v) => String(v).replace('.', ',')).join(' '), numbersIn(quote));
  if (!missQuote.length) return { verified: 'quote', missing: [] };
  return { verified: 'no', missing: missQuote };
}


/** Prix publics ($ / million de jetons, entrée / sortie) pour estimer le coût d'un appel. */
const PRICES: Array<[RegExp, number, number]> = [
  [/fable-5|mythos-5/, 10, 50],
  [/opus-5-5/, 4, 20],
  [/opus-(5|4)/, 5, 25],
  [/sonnet-5/, 2, 10],
  [/sonnet-4/, 3, 15],
  [/haiku-4/, 1, 5],
];

export function costOf(model: string, usage: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number }): number | null {
  const p = PRICES.find(([re]) => re.test(model));
  if (!p) return null;
  const input = (usage.input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0) * 1.25 + (usage.cache_read_input_tokens ?? 0) * 0.1;
  return (input * p[1] + (usage.output_tokens ?? 0) * p[2]) / 1e6;
}


// ─── conseil ingénieur : nombres autorisés dans une réponse ───

type AdvisorMsg = { role: 'user' | 'assistant'; content: any };

/**
 * Nombres qu'une réponse du conseil ingénieur peut citer : ceux des consignes, des messages de l'utilisateur et des
 * résultats d'outils (un résultat JSON est lu comme donnée : « [210,2290] » donne 210 et 2290, pas 210,229).
 */
export function advisorAllowedNumbers(system: string, messages: AdvisorMsg[]): number[] {
  const acc: number[] = numbersOf(system);
  for (const m of messages) {
    if (m.role !== 'user') continue;
    const blocks = typeof m.content === 'string' ? [{ type: 'text', text: m.content }] : m.content;
    for (const b of blocks ?? []) {
      // relance du garde-fou : ses nombres (ceux refusés) ne deviennent pas autorisés
      if (b.type === 'text' && !String(b.text).startsWith('[Contrôle automatique de VEM]')) numbersOf(b.text, acc);
      if (b.type === 'tool_result') {
        const parts: string[] = typeof b.content === 'string' ? [b.content] : (b.content ?? []).map((c: any) => String(c.text ?? ''));
        for (const p of parts) {
          try {
            numbersOf(JSON.parse(p), acc);
          } catch {
            numbersOf(p, acc);
          }
        }
      }
    }
  }
  return acc;
}

/**
 * Proposition structurée de l'IA (pièce de liaison : composants, chemins d'effort) : toute valeur numérique absente des
 * données fournies (texte de l'utilisateur, dessin reconnu, formulaire) est retirée — la donnée redevient « à
 * renseigner » au lieu d'être inventée. Renvoie la proposition nettoyée et les chemins des valeurs retirées.
 */
export function cleanProposalNumbers<T>(proposal: T, data: unknown): { proposal: T; removed: string[] } {
  // « M20 » dans le texte de l'utilisateur donne aussi le diamètre 20 du boulon
  const bolts = [...JSON.stringify(data ?? null).matchAll(/(?<![\p{L}\p{N}])M(\d{1,2})(?![\p{N}])/gu)].map((m) => Number(m[1]));
  const allowed = [...numbersOf(data), ...bolts];
  const removed: string[] = [];
  const walk = (v: unknown, path: string): unknown => {
    if (typeof v === 'number') {
      if (unknownNumbers(String(v), allowed).length) {
        removed.push(`${path} = ${v}`);
        return undefined;
      }
      return v;
    }
    if (Array.isArray(v)) return v.map((x, i) => walk(x, `${path}[${i}]`));
    if (v && typeof v === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
        const w = walk(x, path ? `${path}.${k}` : k);
        if (w !== undefined) out[k] = w;
      }
      return out;
    }
    return v;
  };
  return { proposal: walk(proposal, '') as T, removed };
}


// ─── analyse IA du modèle entier (S12.6) ───

/** Texte où chaque nombre absent des données est remplacé par « … » (l'IA ne cite que des chiffres mesurés par l'outil). */
export function stripUnknownNumbers(text: string, allowed: readonly number[]): { text: string; removed: number[] } {
  const bad = unknownNumbers(text, allowed);
  if (!bad.length) return { text, removed: [] };
  const re = /(?<![\p{L}\p{N}_.,/·-])([−-]?)(\d{1,3}(?:[   ]\d{3})+|\d+)(?:[.,](\d+))?(?![\p{L}\p{N}_/-]|[.,]\d)/gu;
  const removed: number[] = [];
  const out = text.replace(re, (m, sign: string, int: string, dec?: string) => {
    const v = (sign ? -1 : 1) * Number(`${int.replace(/[   ]/g, '')}${dec ? `.${dec}` : ''}`);
    if (bad.some((b) => close(b, v))) {
      removed.push(v);
      return '…';
    }
    return m;
  });
  return { text: out, removed };
}

export interface ModelAnalysisLike {
  structure: {
    verdict: string;
    moduleType?: string | null;
    confidence: number;
    reasons: string[];
    barGroups: Array<{ group: string; role: string; section: string | null; roll: string | null; confidence: number; note: string }>;
    joints: { column: string; stack: string; side: string; evidence: string };
    deck: { span: string; material: string | null };
  };
  products: Array<{
    typeKey: string;
    role: string;
    nature: string;
    material: string | null;
    section: string | null;
    windClosed: boolean | null;
    weight: { value: number; unit: string } | null;
    confidence: number;
    questions: string[];
    rationale: string;
  }>;
  groups: Array<{ keys: string[]; label: string; reason: string }>;
  alerts: string[];
  questions: string[];
}

export interface ModelAnalysisOptions {
  /** clés des types de module de la bibliothèque */
  moduleTypes: string[];
  /** groupes de barres relevés : clé → sections candidates mesurées par l'outil */
  barGroups: Record<string, string[]>;
  frameRoles: string[];
  natures: Record<string, string[]>;
  materials: Array<{ key: string }>;
  sections: Array<{ key: string }>;
  /** types de produits du modèle (clés de la reconnaissance) */
  productKeys: string[];
  /** données envoyées : seuls nombres que les textes peuvent citer */
  data: unknown;
}

/**
 * Contrôle de l'analyse du modèle : clés hors listes supprimées (confiance plafonnée à 0,4), section hors des candidats
 * mesurés du groupe supprimée, type de module hors bibliothèque supprimé, nombres absents des données retirés des
 * textes. Le poids d'un produit reste une estimation d'ordre de grandeur (affichée « estimation IA — à confirmer »).
 */
export function normalizeModelAnalysis<T extends ModelAnalysisLike>(out: T, opt: ModelAnalysisOptions): { analysis: T; removed: string[] } {
  const removed: string[] = [];
  const allowed = numbersOf(opt.data);
  const clean = (t: string, where: string) => {
    const r = stripUnknownNumbers(t ?? '', allowed);
    if (r.removed.length) removed.push(`${where} : ${r.removed.join(', ')}`);
    return r.text;
  };
  const s = { ...out.structure };
  s.confidence = Math.max(0, Math.min(1, Number.isFinite(s.confidence) ? s.confidence : 0));
  if (s.moduleType && !opt.moduleTypes.includes(s.moduleType)) {
    removed.push(`type de module « ${s.moduleType} » hors bibliothèque`);
    s.moduleType = null;
    s.confidence = Math.min(s.confidence, 0.4);
  }
  s.reasons = (s.reasons ?? []).map((r, k) => clean(r, `structure.reasons[${k}]`));
  s.barGroups = (s.barGroups ?? [])
    .filter((g) => {
      if (opt.barGroups[g.group]) return true;
      removed.push(`groupe de barres « ${g.group} » inconnu`);
      return false;
    })
    .map((g) => {
      const r = { ...g, confidence: Math.max(0, Math.min(1, Number.isFinite(g.confidence) ? g.confidence : 0)) };
      if (!opt.frameRoles.includes(r.role)) {
        removed.push(`rôle « ${r.role} » hors liste (${g.group})`);
        r.role = 'other';
        r.confidence = Math.min(r.confidence, 0.4);
      }
      if (r.section && !opt.barGroups[g.group].includes(r.section)) {
        removed.push(`section « ${r.section} » hors des candidats mesurés (${g.group})`);
        r.section = null;
        r.confidence = Math.min(r.confidence, 0.4);
      }
      r.note = clean(r.note, `barGroups.${g.group}`);
      return r;
    });
  s.joints = { ...s.joints, evidence: clean(s.joints?.evidence ?? '', 'joints.evidence') };
  if (s.deck?.material && !opt.materials.some((m) => m.key === s.deck.material)) s.deck = { ...s.deck, material: null };
  const keys = new Set(opt.productKeys);
  const products = (out.products ?? [])
    .filter((p) => keys.has(p.typeKey))
    .map((p) => {
      const r = normalizeIdentify({ ...p, questions: p.questions ?? [] }, { natures: opt.natures, materials: opt.materials, sections: opt.sections });
      r.rationale = clean(r.rationale, `products.${p.typeKey}`);
      r.questions = r.questions.map((q, k) => clean(q, `products.${p.typeKey}.questions[${k}]`));
      return r;
    });
  const analysis = {
    ...out,
    structure: s,
    products,
    groups: normalizeGroups({ groups: out.groups ?? [] }, keys).map((g) => ({ ...g, reason: clean(g.reason, 'groups') })),
    alerts: (out.alerts ?? []).map((a, k) => clean(a, `alerts[${k}]`)),
    questions: (out.questions ?? []).map((q, k) => clean(q, `questions[${k}]`)),
  };
  return { analysis, removed };
}
