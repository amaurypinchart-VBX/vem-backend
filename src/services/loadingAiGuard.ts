// src/services/loadingAiGuard.ts
// Garde de l'IA de la loading liste (atelier texte, L7) : l'IA traduit une règle écrite en français en une règle
// structurée, choisie dans les listes envoyées par le module (articles du catalogue, bases de comptage, conditions,
// traits des motifs). AUCUN CHIFFRE NE VIENT DE L'IA : quantité, spare et tranche ne sont gardés que s'ils sont écrits
// dans le texte de l'utilisateur (ou ses réponses) ; sinon ils sont retirés et listés « à renseigner ». Tout ce qui
// sort des listes est retiré aussi. Pur, sans import : testé depuis plans/tests/loading/ai.test.ts (le Dockerfile copie
// ce fichier dans l'étape de build de plans/).

export interface LoadingAiAllowed {
  articles: { ref: string; designation?: string }[];
  bases: string[];
  /** condition → valeurs permises (booléens écrits « true » / « false ») */
  conditions: Record<string, string[]>;
  /** genre de motif → trait → valeurs permises */
  motifs: Record<string, Record<string, string[]>>;
  units?: string[];
}

export interface LoadingAiRuleDraft {
  kind: 'accessoire' | 'ajout_chantier' | 'appreciation';
  article: string | null;
  qty: number | null;
  per: string | null;
  trigger: { articles?: string[]; vitrage?: string } | null;
  motif: { kind: string; attrs: Record<string, string | boolean> } | null;
  when: Record<string, string | boolean>;
  spare: { type: 'fixe' | 'pourcent'; valeur: number } | null;
  tranche: { pour: number; parTranche: number } | null;
  unit: string;
}

export interface LoadingAiNormalized {
  draft: LoadingAiRuleDraft;
  /** ce que l'IA a proposé mais qui a été retiré (hors listes, chiffre absent du texte) : à renseigner à la main */
  removed: string[];
  questions: string[];
  confidence: number;
  rationale: string;
}

const KINDS = ['accessoire', 'ajout_chantier', 'appreciation'];
const UNITS = ['pce', 'm', 'm2', 'L'];
const VITRAGES = ['8.8.2', '10mm', '4.4.2'];
const REF_RE = /\b\d-\d{3}-\d{3,5}\b/g;
const WORDS: Record<string, number> = {
  un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, onze: 11, douze: 12,
  quinze: 15, vingt: 20, trente: 30, cinquante: 50, cent: 100, demi: 0.5, moitie: 0.5, double: 2,
  one: 1, two: 2, three: 3, four: 4, five: 5, eight: 8, ten: 10, twelve: 12,
};

/** Nombres écrits dans un texte (références d'articles, « 8.8.2 », « 10 mm » de vitrage et « M16 » comptés à part :
 *  ce sont des identifiants), plus les nombres écrits en lettres (« deux plaques »). */
export function numbersInText(text: string): number[] {
  const t = text
    .replace(REF_RE, ' ')
    .replace(/\b\d+\.\d+\.\d+\b/g, ' ')
    .replace(/\b[A-Za-z]+\d+\b/g, ' ');
  const out: number[] = [];
  for (const m of t.matchAll(/(?<![\d.,])\d+(?:[.,]\d+)?/g)) out.push(Number(m[0].replace(',', '.')));
  const plain = t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
  for (const w of plain.split(/[^a-z]+/)) if (w && WORDS[w] !== undefined) out.push(WORDS[w]);
  return out;
}

const inText = (n: unknown, allowed: number[]) => typeof n === 'number' && Number.isFinite(n) && allowed.some((a) => Math.abs(a - n) < 1e-9);
const str = (v: unknown) => (typeof v === 'boolean' ? String(v) : typeof v === 'string' ? v : v === null || v === undefined ? '' : String(v));
const backBool = (v: string): string | boolean => (v === 'true' ? true : v === 'false' ? false : v);

/** Texte sans les nombres qui ne viennent pas de l'utilisateur ni des listes (« … » à la place). */
function stripNumbers(s: string, allowed: number[]): string {
  return s.replace(/(?<![\w.-])\d+(?:[.,]\d+)?(?![\w-])/g, (m) => (inText(Number(m.replace(',', '.')), allowed) ? m : '…'));
}

export function normalizeRuleAi(raw: any, allowed: LoadingAiAllowed, userText: string): LoadingAiNormalized {
  const nums = numbersInText(userText);
  const removed: string[] = [];
  const refs = new Set(allowed.articles.map((a) => a.ref));
  const r = raw && typeof raw === 'object' ? raw : {};
  const kind = KINDS.includes(r.kind) ? r.kind : 'accessoire';

  let article: string | null = typeof r.article === 'string' && refs.has(r.article) ? r.article : null;
  if (r.article && !article) removed.push(`article « ${str(r.article)} » (pas au catalogue)`);

  let qty: number | null = null;
  if (r.qty !== null && r.qty !== undefined) {
    if (inText(r.qty, nums)) qty = r.qty;
    else removed.push(`quantité ${str(r.qty)} (pas écrite dans le texte)`);
  }

  let per: string | null = typeof r.per === 'string' && allowed.bases.includes(r.per) ? r.per : null;
  if (r.per && !per) removed.push(`base « ${str(r.per)} »`);

  let motif: LoadingAiRuleDraft['motif'] = null;
  if (r.motif && typeof r.motif === 'object') {
    const defs = allowed.motifs[r.motif.kind];
    if (!defs) removed.push(`motif « ${str(r.motif.kind)} »`);
    else {
      const attrs: Record<string, string | boolean> = {};
      for (const [k, v] of Object.entries(r.motif.attrs ?? {})) {
        if (defs[k]?.includes(str(v))) attrs[k] = backBool(str(v));
        else removed.push(`trait du motif « ${k} = ${str(v)} »`);
      }
      motif = { kind: r.motif.kind, attrs };
    }
  }
  if (per === 'motif' && !motif) {
    per = null;
    removed.push('base « par motif » sans motif valable');
  }
  if (per !== 'motif') motif = null;

  let trigger: LoadingAiRuleDraft['trigger'] = null;
  if (r.trigger && typeof r.trigger === 'object') {
    const arts = Array.isArray(r.trigger.articles) ? r.trigger.articles.filter((a: unknown) => typeof a === 'string' && refs.has(a)) : [];
    if (Array.isArray(r.trigger.articles) && arts.length < r.trigger.articles.length) removed.push('produit déclencheur hors catalogue');
    const vitrage = VITRAGES.includes(r.trigger.vitrage) ? r.trigger.vitrage : undefined;
    if (r.trigger.vitrage && !vitrage) removed.push(`vitrage « ${str(r.trigger.vitrage)} »`);
    if (arts.length || vitrage) trigger = { ...(arts.length ? { articles: arts } : {}), ...(vitrage ? { vitrage } : {}) };
  }
  if (per === 'produit' && !trigger?.articles?.length) {
    per = null;
    removed.push('base « par produit » sans produit déclencheur');
  }

  const when: Record<string, string | boolean> = {};
  for (const [k, v] of Object.entries(r.when && typeof r.when === 'object' ? r.when : {})) {
    if (allowed.conditions[k]?.includes(str(v))) when[k] = backBool(str(v));
    else removed.push(`condition « ${k} = ${str(v)} »`);
  }

  let spare: LoadingAiRuleDraft['spare'] = null;
  if (r.spare && typeof r.spare === 'object') {
    if ((r.spare.type === 'fixe' || r.spare.type === 'pourcent') && inText(r.spare.valeur, nums)) spare = { type: r.spare.type, valeur: r.spare.valeur };
    else removed.push(`spare ${str(r.spare.valeur)}${r.spare.type === 'pourcent' ? ' %' : ''} (pas écrit dans le texte)`);
  }

  let tranche: LoadingAiRuleDraft['tranche'] = null;
  if (r.tranche && typeof r.tranche === 'object') {
    if (inText(r.tranche.pour, nums) && inText(r.tranche.parTranche, nums) && r.tranche.parTranche > 0) tranche = { pour: r.tranche.pour, parTranche: r.tranche.parTranche };
    else removed.push('tranche (chiffres pas écrits dans le texte)');
  }

  const units = allowed.units?.length ? allowed.units : UNITS;
  const unit = units.includes(r.unit) ? r.unit : 'pce';
  if (!article && !removed.some((x) => x.startsWith('article'))) removed.push('article à choisir');
  if (qty === null && kind !== 'appreciation' && !removed.some((x) => x.startsWith('quantité'))) removed.push('quantité à saisir');
  if (!per) removed.push('base de comptage à choisir');

  // chiffres permis dans les textes de l'IA : ceux de l'utilisateur
  const questions = (Array.isArray(r.questions) ? r.questions : []).filter((q: unknown) => typeof q === 'string').slice(0, 5).map((q: string) => stripNumbers(q, nums));
  const rationale = typeof r.rationale === 'string' ? stripNumbers(r.rationale, nums).slice(0, 600) : '';
  let confidence = typeof r.confidence === 'number' && Number.isFinite(r.confidence) ? Math.max(0, Math.min(1, r.confidence)) : 0.5;
  if (removed.length) confidence = Math.min(confidence, 0.4);
  if (article === null && qty === null && per === null) confidence = 0;
  return { draft: { kind, article, qty, per, trigger, motif, when, spare, tranche, unit }, removed, questions, confidence, rationale };
}
