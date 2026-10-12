// Classeur de règles VIEWBOX_regles_loading_N.xlsx → base de départ du module (règles, observations, catalogue) +
// rapport d'import. Traduction mécanique et prudente : tout ce qui ne se traduit pas proprement (quantité en texte,
// spare en texte, base inconnue, doublon, contradiction, réf. hors catalogue) est gardé tel quel, signalé dans le
// rapport et jamais tranché ici. Les réponses d'Amaury (decisions.ts) sont appliquées ensuite, chacune tracée.
// Fonctions pures.
import type {
  CalibrationPoint,
  CatalogueItem,
  Confidence,
  CountingBase,
  GlazingRegime,
  ImportIssue,
  LoadingCategory,
  LoadingRule,
  RuleConditions,
  RuleKind,
  RuleTrigger,
  SeedObservation,
  Spare,
  Tranche,
} from '../core/types';
import type { Cell, Sheet, Workbook } from '../xlsx/read';
import { cellText } from '../xlsx/read';

export const REF_PATTERN = /\b\d-\d{3}-\d{3,5}\b/g;
/** Réfs citées dans un texte, abréviations comprises : « 4-750-004/005/006 », « 4-740-00x » (= 001…003). */
export function expandRefs(text: string): string[] {
  const out: string[] = [];
  const push = (r: string) => {
    if (!out.includes(r)) out.push(r);
  };
  for (const m of text.matchAll(/\b(\d-\d{3}-)(\d{3}|00x)((?:\/\d{3})*)/gi)) {
    if (/x$/i.test(m[2])) ['001', '002', '003'].forEach((n) => push(m[1] + n));
    else push(m[1] + m[2]);
    for (const n of m[3].split('/').filter(Boolean)) push(m[1] + n);
  }
  return out;
}

const isRef = (s: string) => /^\d-\d{3}-\d{3,5}$/.test(s);

/** Couleurs du classeur (6 derniers caractères ARGB). */
export const FILL = { bleu: 'DDEBF7', ambre: 'FFF2CC', mauve: 'E6E0F8', vert: 'E2EFDA', entete: '1F4E78' } as const;
const fillOf = (c: Cell | undefined) => (c?.fill ? c.fill.slice(-6).toUpperCase() : '');

export interface ImportResult {
  rules: LoadingRule[];
  observations: SeedObservation[];
  catalogue: CatalogueItem[];
  issues: ImportIssue[];
  /** réfs signalées « à ajouter au catalogue » par le classeur (LisezMoi) */
  catalogueToAdd: string[];
  sheetNames: string[];
}

// ─── Catalogue ──────────────────────────────────────────────────────────────────────────────────────────────────

/** Catégorie du bordereau d'après la désignation (modifiable ensuite dans la bibliothèque). */
export function categoryFromDesignation(ref: string, d: string): LoadingCategory {
  const s = d.toUpperCase();
  if (/TOOL KIT|LADDER|HARNESS|SAFETY LINE|TUV BOOK|DRILL/.test(s)) return 'ajouts';
  if (/CABLE|SPOT|ELECTRIC|LIGHT|GROUPE|POWER|E-BOX|MUSHROOM/.test(s)) return 'electrique';
  if (/RUBBER|EPDM|PLEXI|SILICON|SUB BLOCK|MASTIC|PARASILICO/.test(s)) return 'joints';
  if (/PAINT|TAPE|GAFFA|LAMINATE|TRIFLEX|MOUSSE|WAGGO|CARPET/.test(s)) return 'consommables';
  if (/BOLT|SCREW|WASHER|\bNUT\b|BASE PLATE|BASEPLATE|SUBPLATE|IN BETWEEN PLATE|CONNECTOR PLATE|FIXATION PLATE|THROADED ROD|BRACING/.test(s))
    return 'quincaillerie';
  if (ref.startsWith('7-') || ref.startsWith('4-700-0') || ref.startsWith('1-799')) return 'structure';
  return 'structure';
}

export function glazingFromDesignation(d: string): GlazingRegime | undefined {
  const s = d.toUpperCase();
  if (!/GLASS/.test(s)) return undefined;
  if (/8\.8\.2/.test(s)) return '8.8.2';
  if (/4\.4\.2/.test(s)) return '4.4.2';
  if (/SEAMLESS\s*10\b|SEAMLESS 10MM|\b10\s*MM\b/.test(s)) return '10mm';
  return undefined;
}

/** Type de porte d'après la désignation (portes pleines et vitrées). */
export function doorFromDesignation(d: string): CatalogueItem['porte'] {
  const s = d.toUpperCase();
  if (!/\bDOORS?\b/.test(s)) return undefined;
  if (/SLIDING/.test(s)) return 'coulissante';
  if (/DOUBLE/.test(s)) return 'double';
  return 'simple';
}

function plateFromDesignation(d: string): { l: number; w: number } | undefined {
  if (!/SUBPLATE/i.test(d)) return undefined;
  const m = /(\d{3,4})\s*x\s*(\d{3,4})\s*mm/i.exec(d);
  return m ? { l: Number(m[1]), w: Number(m[2]) } : undefined;
}

function readCatalogue(sheet: Sheet | undefined, issues: ImportIssue[]): CatalogueItem[] {
  if (!sheet) {
    issues.push({ where: 'Catalogue_ref', kind: 'ignore', text: 'Onglet Catalogue_ref absent.' });
    return [];
  }
  const out: CatalogueItem[] = [];
  const seen = new Set<string>();
  sheet.rows.forEach((row, i) => {
    if (i === 0) return;
    const ref = cellText(row[0]);
    const label = cellText(row[1]);
    if (!ref && !label) return;
    if (!isRef(ref)) {
      issues.push({ where: `Catalogue_ref ligne ${i + 1}`, kind: 'ignore', text: `« ${ref} » n’est pas une référence N-NNN-NNN : ignorée.` });
      return;
    }
    if (seen.has(ref)) {
      issues.push({ where: `Catalogue_ref ligne ${i + 1}`, article: ref, kind: 'doublon', text: `Référence ${ref} en double dans le catalogue : la première est gardée.` });
      return;
    }
    seen.add(ref);
    const designation = label.replace(new RegExp(`^\\[${ref}\\]\\s*`), '').trim();
    const item: CatalogueItem = {
      ref,
      designation,
      gros: /^oui$/i.test(cellText(row[2])),
      categorie: categoryFromDesignation(ref, designation),
      unit: 'pce',
      source: 'classeur',
    };
    const vitrage = glazingFromDesignation(designation);
    if (vitrage) item.vitrage = vitrage;
    const plaque = plateFromDesignation(designation);
    if (plaque) item.plaque = plaque;
    const porte = doorFromDesignation(designation);
    if (porte) item.porte = porte;
    out.push(item);
  });
  return out;
}

// ─── Règles ─────────────────────────────────────────────────────────────────────────────────────────────────────

function confidenceOf(text: string): Confidence | null {
  const t = text.toLowerCase();
  if (!t) return null;
  if (t.startsWith('confirm')) return 'confirme';
  if (t.startsWith('a_confirmer') || t.startsWith('à confirmer')) return 'a_confirmer';
  if (t.startsWith('hypoth')) return 'hypothese';
  if (t.startsWith('observ')) return 'observe';
  return null;
}

export function parseSpare(text: string): Spare | undefined | null {
  const t = text.replace(/\s/g, '');
  if (!t) return undefined;
  let m = /^\+(\d+(?:[.,]\d+)?)%$/.exec(t);
  if (m) return { type: 'pourcent', valeur: Number(m[1].replace(',', '.')) };
  m = /^\+(\d+)$/.exec(t);
  if (m) return { type: 'fixe', valeur: Number(m[1]) };
  return null;
}

/** Points de calage cités dans une remarque (« Klok 00055 : … | 6059/00056 : … »). */
export function calibrationFromRemark(remark: string): CalibrationPoint[] {
  const out: CalibrationPoint[] = [];
  const parts = remark.split(/\s*\|\|?\s*/);
  for (const p of parts) {
    let chantier = '';
    let bordereau: string | undefined;
    if (/\bKlok/i.test(p)) {
      chantier = 'Klokgebouw';
      bordereau = '00055';
    } else if (/6059/.test(p)) {
      chantier = '6059RFRAMVIE';
      bordereau = '00056';
    } else if (/6060/.test(p)) {
      chantier = '6060RIAAHVIE';
      bordereau = '00058';
    } else if (/Brandenburg/i.test(p)) chantier = 'Brandenburg';
    if (chantier) out.push({ chantier, bordereau, note: p.trim() });
  }
  return out;
}

/** « Par » du classeur → base de comptage (null = base inconnue, signalée). */
function baseOf(per: string, a: string, b: string): CountingBase | 'observe' | 'topologie' | null {
  const p = per.toLowerCase().trim();
  switch (p) {
    case 'produit':
      return 'produit';
    case 'box':
    case 'vbx':
      return 'box';
    case 'pied':
      return 'pied';
    case 'jonction':
      // « JONCTION (entre panneaux) » ≠ « JONCTION (box adjacentes) »
      return /box/i.test(b) || /box/i.test(a) ? 'jonction_box' : 'jonction_panneau';
    case 'porte':
      return 'produit';
    case 'cote':
    case 'côté':
      return 'cote';
    case 'panneau':
      return 'panneau';
    case 'panneau_plein':
      return 'panneau_plein';
    case 'unite_separee':
    case 'cluster':
      return 'ilot';
    case 'cluster_couvert':
      return 'ilot_couvert';
    case 'bord':
      return 'bord';
    case 'toit':
      return 'module_toit';
    case 'poteau':
      return 'poteau';
    case 'airco':
      return 'airco';
    case 'jonction_vitre':
      return 'jonction_verre';
    case 'terminaison_vitre':
      return 'terminaison_vitre';
    case 'cote_vitre_court':
      return 'cote_vitre_court';
    case 'cote_vitre_long':
      return 'cote_vitre_long';
    case 'observé':
    case 'observe':
      return 'observe';
    case 'double_box':
      return 'topologie';
    default:
      return null;
  }
}

function conditionsOf(niveau: string, position: string, connexion: string, appui: string, where: string, article: string, issues: ImportIssue[]): RuleConditions {
  const w: RuleConditions = {};
  const n = niveau.toLowerCase();
  if (n === 'rez' || n === 'etage' || n === 'étage') w.niveau = n === 'rez' ? 'rez' : 'etage';
  else if (n) issues.push({ where, article, kind: 'condition', text: `Niveau « ${niveau} » non reconnu : ignoré.` });
  const p = position.toLowerCase();
  if (p === 'angle' || p === 'bord' || p === 'milieu') w.position = p;
  else if (p) issues.push({ where, article, kind: 'condition', text: `Position « ${position} » non reconnue : ignorée.` });
  const c = connexion.toLowerCase();
  if (c === 'longueur' || c === 'largeur' || c === 'les_deux') {
    // une connexion renseignée = la règle ne vaut que pour des box connectées
    w.regime = 'connecte';
    if (c !== 'les_deux') w.connexion = c;
  } else if (c) issues.push({ where, article, kind: 'condition', text: `Connexion « ${connexion} » non reconnue : ignorée.` });
  if (appui) {
    w.appui = appui.toLowerCase();
    issues.push({
      where,
      article,
      kind: 'condition',
      text: `Appui « ${appui} » gardé tel quel : la topologie ne sait pas encore le détecter.`,
      question: `${article} : que veut dire « Appui = ${appui} » sur cette règle ?`,
    });
  }
  return w;
}

const KEY_PREFIX: Record<RuleKind, string> = {
  accessoire: 'acc',
  ajout_chantier: 'aj',
  appreciation: 'app',
  substitution: 'sub',
  kit: 'kit',
  exclusion: 'exc',
};

/** Clé stable et lisible d'une règle. */
export function ruleKey(r: Pick<LoadingRule, 'kind' | 'article' | 'trigger' | 'per' | 'when'>): string {
  const trig = r.trigger.vitrage ? r.trigger.vitrage : (r.trigger.articles ?? []).join('+');
  const cond = Object.entries(r.when ?? {})
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => (typeof v === 'boolean' ? (v ? k : `!${k}`) : `${v}`))
    .join(',');
  return `${KEY_PREFIX[r.kind]}:${r.article}@${trig ? `${trig}/` : ''}${r.per}${cond ? `[${cond}]` : ''}`;
}

function uniqueKeys(rules: LoadingRule[]) {
  const seen = new Map<string, number>();
  for (const r of rules) {
    const n = (seen.get(r.key) ?? 0) + 1;
    seen.set(r.key, n);
    if (n > 1) r.key = `${r.key}#${n}`;
  }
}

function readRules(sheet: Sheet | undefined, catalogue: Map<string, CatalogueItem>, issues: ImportIssue[], observations: SeedObservation[]): LoadingRule[] {
  if (!sheet) {
    issues.push({ where: 'Regles_accessoires', kind: 'ignore', text: 'Onglet Regles_accessoires absent.' });
    return [];
  }
  const out: LoadingRule[] = [];
  sheet.rows.forEach((row, i) => {
    if (i === 0) return;
    const t = (c: number) => cellText(row[c]);
    const [a, b, article, articleName, qtyRaw, per] = [t(0), t(1), t(2), t(3), t(4), t(5)];
    if (!a && !article) return;
    const where = `Regles_accessoires ligne ${i + 1}`;
    const remark = t(12);
    const fill = fillOf(row[0]);
    if (!isRef(article)) {
      issues.push({ where, kind: 'ignore', text: `Accessoire « ${article} » n’est pas une référence : ligne ignorée.` });
      return;
    }
    const base = baseOf(per, a, b);
    const qtyNum = typeof row[4]?.v === 'number' ? (row[4].v as number) : Number(qtyRaw.replace(',', '.'));
    const qtyOk = qtyRaw !== '' && Number.isFinite(qtyNum);
    if (base === 'observe') {
      observations.push({
        key: `obs:${article}@${a.toLowerCase()}#${i + 1}`,
        article,
        articleName,
        chantier: /6059/.test(remark) ? '6059RFRAMVIE' : /6060/.test(remark) ? '6060RIAAHVIE' : '',
        valeur: qtyOk ? qtyNum : NaN,
        contexte: b,
        regime: /connect/i.test(a) || /adjacent/i.test(b) ? 'connecte' : undefined,
        note: remark || undefined,
        origin: { sheet: 'Regles_accessoires', row: i + 1 },
      });
      return;
    }
    if (base === 'topologie') {
      issues.push({
        where,
        article,
        kind: 'interpretation',
        text: `Ligne de topologie (« ${b} » = ${qtyRaw} ${per}) : ce n’est pas une règle d’article, c’est une base de comptage des pieds. Gardée comme information (calcul des pieds par la topologie).`,
      });
      return;
    }
    if (base === null) {
      issues.push({
        where,
        article,
        kind: 'texte',
        text: `Base « ${per} » inconnue (${articleName}, quantité ${qtyRaw}) : ligne non traduite en règle. Remarque : ${remark.slice(0, 200)}`,
        // une ligne « RESOLU … voir lignes dédiées » est une note, pas une règle à traduire
        question: /^RESOLU/i.test(remark) ? undefined : `Que veut dire la base « ${per} » pour ${article} ?`,
      });
      return;
    }
    let confidence = confidenceOf(t(11));
    if (confidence === 'confirme' && /→\s*a_confirmer/i.test(remark))
      issues.push({ where, article, kind: 'texte', text: `Confiance « confirmé » mais la remarque dit « → a_confirmer » : gardée « confirmé ». Remarque : ${remark.slice(0, 160)}` });
    if (!confidence) {
      confidence = fill === FILL.ambre ? 'a_confirmer' : fill === FILL.bleu ? 'confirme' : 'hypothese';
      issues.push({ where, article, kind: 'texte', text: `Confiance vide : « ${confidence} » déduit de la couleur.` });
    }
    const trigger: RuleTrigger = {};
    if (isRef(a)) trigger.articles = [a];
    const when = conditionsOf(t(6), t(7), t(8), t(9), where, article, issues);
    let kind: RuleKind = 'accessoire';
    if (per.toLowerCase() === 'porte') kind = 'kit';
    const spareText = t(10);
    const spare = parseSpare(spareText);
    const rule: LoadingRule = {
      key: '',
      kind,
      trigger,
      article,
      articleName: articleName || undefined,
      qty: qtyOk ? qtyNum : null,
      per: base,
      unit: 'pce',
      when: Object.keys(when).length ? when : undefined,
      confidence,
      calibration: calibrationFromRemark(remark),
      remark: remark || undefined,
      origin: [{ sheet: 'Regles_accessoires', row: i + 1 }],
      version: 1,
      active: true,
      source: 'seed',
    };
    if (!qtyOk) {
      rule.qtyText = qtyRaw;
      issues.push({
        where,
        article,
        kind: 'texte',
        text: `Quantité en texte « ${qtyRaw} » (${COUNTING_HINT[base] ?? per}) : la règle sort en « à confirmer » sans quantité calculée.`,
        question: `${article} ${articleName} : quelle quantité exacte, et par quoi (jonction ou box) ?`,
      });
    }
    if (spare === null) {
      rule.spare = { type: 'texte', texte: spareText };
      issues.push({
        where,
        article,
        kind: 'texte',
        text: `Spare en texte « ${spareText} » : non appliqué automatiquement. Remarque : ${remark.slice(0, 220)}`,
        question: `${article} : le spare « ${spareText} », c’est combien (+1, +2, +20 %…) ?`,
      });
    } else if (spare) rule.spare = spare;
    if (!catalogue.has(article))
      issues.push({ where, article, kind: 'catalogue', text: `${article} (${articleName}) n’est pas dans Catalogue_ref.` });
    for (const ref of trigger.articles ?? [])
      if (!catalogue.has(ref)) issues.push({ where, article: ref, kind: 'catalogue', text: `Produit déclencheur ${ref} (${b}) n’est pas dans Catalogue_ref.` });
    out.push(rule);
  });
  return out;
}

const COUNTING_HINT: Partial<Record<CountingBase, string>> = { box: 'par box', jonction_box: 'par jonction' };

function readAdditions(sheet: Sheet | undefined, catalogue: Map<string, CatalogueItem>, issues: ImportIssue[]): LoadingRule[] {
  if (!sheet) return [];
  const out: LoadingRule[] = [];
  sheet.rows.forEach((row, i) => {
    if (i === 0) return;
    const t = (c: number) => cellText(row[c]);
    const [article, name, baseText, pourRaw, trancheRaw, arrondi, remark] = [t(0), t(1), t(2), t(3), t(4), t(5), t(6)];
    if (!article) return;
    const where = `Ajouts_chantier ligne ${i + 1}`;
    if (!isRef(article)) {
      issues.push({ where, kind: 'ignore', text: `« ${article} » n’est pas une référence : ligne ignorée.` });
      return;
    }
    const fill = fillOf(row[0]);
    let confidence: Confidence = fill === FILL.ambre || /a_confirmer/i.test(remark) ? 'a_confirmer' : fill === FILL.bleu ? 'confirme' : 'a_confirmer';
    if (fill !== FILL.ambre && fill !== FILL.bleu)
      issues.push({ where, article, kind: 'texte', text: `Ligne ${fill === FILL.vert ? 'verte (pré-remplie, à vérifier)' : 'sans couleur'} : importée « à confirmer ».` });
    const base = baseText.toLowerCase();
    const when: RuleConditions = {};
    let per: CountingBase = 'job';
    if (base.startsWith('nb vbx')) per = 'box';
    else if (base.startsWith('m² plancher') || base.startsWith('m2 plancher')) {
      per = 'm2_plancher';
      if (/^SI plancher/i.test(remark) || /SI plancher/i.test(remark)) when.plancherLamine = true;
    } else if (base.startsWith('nb modules toit')) per = 'module_toit';
    else if (!base.startsWith('forfait job')) {
      issues.push({ where, article, kind: 'texte', text: `Base « ${baseText} » inconnue : importée en forfait chantier.` });
    }
    if (/SI toit\)/i.test(baseText)) when.couvert = true;
    if (/SI hauteur/i.test(baseText)) when.hauteur = true;
    if (/\(gros\)/i.test(baseText)) when.tailleJob = 'gros';
    const pour = pourRaw === '' ? NaN : Number(pourRaw.replace(',', '.'));
    const tr = trancheRaw === '' ? NaN : Number(trancheRaw.replace(',', '.'));
    let tranche: Tranche | undefined;
    let qty: number | null = null;
    let kind: RuleKind = 'ajout_chantier';
    if (Number.isFinite(pour) && Number.isFinite(tr) && tr > 0) {
      if (tr === 1) qty = pour;
      else {
        tranche = { mode: 'tranche', pour, parTranche: tr, arrondi: 'sup' };
        qty = pour;
      }
      if (arrondi && arrondi !== 'sup') issues.push({ where, article, kind: 'texte', text: `Arrondi « ${arrondi} » : seul « sup » est connu.` });
    } else if (Number.isFinite(pour)) qty = pour;
    else {
      // forfait sans quantité : appréciation avec les valeurs des chantiers passés
      kind = 'appreciation';
      confidence = 'a_confirmer';
    }
    if (!catalogue.has(article)) issues.push({ where, article, kind: 'catalogue', text: `${article} (${name}) n’est pas dans Catalogue_ref.` });
    out.push({
      key: '',
      kind,
      trigger: {},
      article,
      articleName: name || undefined,
      qty,
      per,
      unit: 'pce',
      tranche,
      when: Object.keys(when).length ? when : undefined,
      confidence,
      calibration: calibrationFromRemark(remark),
      remark: remark || undefined,
      origin: [{ sheet: 'Ajouts_chantier', row: i + 1 }],
      version: 1,
      active: true,
      source: 'seed',
    });
  });
  return out;
}

function readAppreciation(sheet: Sheet | undefined, issues: ImportIssue[]): LoadingRule[] {
  if (!sheet) return [];
  const out: LoadingRule[] = [];
  sheet.rows.forEach((row, i) => {
    if (i === 0) return;
    const t = (c: number) => cellText(row[c]);
    const [refs, name, baseText, remark] = [t(0), t(1), t(2), t(3)];
    if (!refs) return;
    const where = `Appreciation ligne ${i + 1}`;
    // plusieurs articles (« 4-700-096 / 4-700-033 ») ou réf. abrégée (« 4-740-00x ») : gardés ensemble dans la note
    const list = expandRefs(refs);
    const article = list.length ? list.join('+') : refs.replace(/\s+/g, '');
    if (list.length !== 1)
      issues.push({ where, kind: 'texte', text: `Référence « ${refs} » (plusieurs articles ou réf. générique) : gardée comme note d’appréciation.` });
    out.push({
      key: '',
      kind: 'appreciation',
      trigger: {},
      article,
      articleName: name || undefined,
      qty: null,
      per: 'job',
      unit: 'pce',
      confidence: fillOf(row[0]) === FILL.ambre ? 'a_confirmer' : 'hypothese',
      calibration: calibrationFromRemark(remark),
      remark: [baseText, remark].filter(Boolean).join(' — ') || undefined,
      origin: [{ sheet: 'Appreciation', row: i + 1 }],
      version: 1,
      active: true,
      source: 'seed',
    });
  });
  return out;
}

/** Glasswalls déclencheurs → régime de vitrage (seul le régime présent sort). */
function glazingTriggers(rules: LoadingRule[], catalogue: Map<string, CatalogueItem>) {
  for (const r of rules) {
    const arts = r.trigger.articles;
    if (!arts?.length) continue;
    const regimes = new Set(arts.map((a) => catalogue.get(a)?.vitrage));
    const [only] = [...regimes];
    if (regimes.size === 1 && only) {
      r.trigger = { ...r.trigger, vitrage: only };
      // base « produit » d'un vitrage : par vitre du régime
      if (r.per !== 'produit') delete r.trigger.articles;
    }
  }
}

/** Les règles des articles observés en régime connecté (mauve) sont des règles « standalone » (fiche 00). */
function standaloneFromObservations(rules: LoadingRule[], observations: SeedObservation[], issues: ImportIssue[]) {
  const observed = new Set(observations.filter((o) => o.regime === 'connecte').map((o) => o.article));
  const PER_BOX: CountingBase[] = ['box', 'cote', 'jonction_panneau', 'panneau'];
  for (const r of rules) {
    if (!observed.has(r.article) || !PER_BOX.includes(r.per) || r.when?.regime) continue;
    r.when = { ...(r.when ?? {}), regime: 'standalone' };
    issues.push({
      where: (r.origin ?? []).map((o) => `${o.sheet} ligne ${o.row}`).join(', '),
      article: r.article,
      kind: 'interpretation',
      text: `${r.article} : règle calée en standalone (Klokgebouw) et valeur observée différente en connecté (mauve) → condition « standalone » ajoutée ; en connecté la ligne sort en « règle manquante » avec la valeur observée.`,
    });
  }
}

/** Règles qui se contredisent : même article, conditions qui se chevauchent. */
export function findConflicts(rules: LoadingRule[]): LoadingRule[][] {
  const active = rules.filter((r) => r.active && r.kind !== 'appreciation');
  const byArticle = new Map<string, LoadingRule[]>();
  for (const r of active) byArticle.set(r.article, [...(byArticle.get(r.article) ?? []), r]);
  const groups: LoadingRule[][] = [];
  for (const list of byArticle.values()) {
    if (list.length < 2) continue;
    const overlapping = list.filter((r) => list.some((o) => o !== r && overlaps(r, o)));
    if (overlapping.length >= 2) groups.push(overlapping);
  }
  return groups;
}

function overlaps(a: LoadingRule, b: LoadingRule): boolean {
  // deux produits déclencheurs différents comptent des instances différentes (ex. kits porte simple / double)
  if (a.group && a.group === b.group) return false;
  const ta = a.trigger.articles;
  const tb = b.trigger.articles;
  if (ta?.length && tb?.length && !ta.some((x) => tb.includes(x))) return false;
  const wa = a.when ?? {};
  const wb = b.when ?? {};
  for (const k of new Set([...Object.keys(wa), ...Object.keys(wb)]) as Set<keyof RuleConditions>) {
    if (wa[k] !== undefined && wb[k] !== undefined && wa[k] !== wb[k]) return false;
  }
  if (a.trigger.vitrage && b.trigger.vitrage && a.trigger.vitrage !== b.trigger.vitrage) return false;
  if (a.kind === 'substitution' || b.kind === 'substitution') return a.kind === b.kind;
  return true;
}

export function importClasseur(wb: Workbook): ImportResult {
  const issues: ImportIssue[] = [];
  const sheet = (name: string) => wb.sheets.find((s) => s.name.toLowerCase() === name.toLowerCase());
  const catalogueList = readCatalogue(sheet('Catalogue_ref'), issues);
  const catalogue = new Map(catalogueList.map((c) => [c.ref, c]));
  const observations: SeedObservation[] = [];
  const rules = [
    ...readRules(sheet('Regles_accessoires'), catalogue, issues, observations),
    ...readAdditions(sheet('Ajouts_chantier'), catalogue, issues),
    ...readAppreciation(sheet('Appreciation'), issues),
  ];
  glazingTriggers(rules, catalogue);
  standaloneFromObservations(rules, observations, issues);
  for (const r of rules) r.key = ruleKey(r);
  uniqueKeys(rules);
  const catalogueToAdd: string[] = [];
  for (const row of sheet('LisezMoi')?.rows ?? []) {
    const text = cellText(row[0]);
    if (/AJOUTER AU CATALOGUE/i.test(text)) for (const ref of text.match(REF_PATTERN) ?? []) if (!catalogueToAdd.includes(ref)) catalogueToAdd.push(ref);
  }
  return { rules, observations, catalogue: catalogueList, issues, catalogueToAdd, sheetNames: wb.sheets.map((s) => s.name) };
}
