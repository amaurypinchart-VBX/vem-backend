// Génération des fichiers de la base de départ (library/seed.ts, library/catalogue.ts) et du rapport d'import
// (docs/loading/rapport-import.md) à partir du classeur. Appelé par scripts/import-loading-rules.mjs (via Vitest).
// Le contenu ne dépend que du classeur et de decisions.ts : deux imports du même classeur donnent les mêmes fichiers.
import type { ImportIssue, LoadingRule } from '../core/types';
import { COUNTING_BASE_LABEL, CONFIDENCE_LABEL, LOADING_CATEGORIES } from '../core/types';
import type { Workbook } from '../xlsx/read';
import { importClasseur } from './importClasseur';
import type { SeedResult } from './decisions';
import { applyDecisions } from './decisions';

export function buildSeed(wb: Workbook): SeedResult {
  return applyDecisions(importClasseur(wb));
}

const HEADER = (what: string, file: string) =>
  `// Généré par scripts/import-loading-rules.mjs depuis ${file} (+ library/decisions.ts) — ${what}.\n` +
  `// Ne pas modifier à la main : corriger le classeur ou decisions.ts, puis relancer l'import.\n`;

export function seedSource(s: SeedResult, file: string): string {
  const meta = {
    classeur: file,
    sheets: s.sheetNames,
    rules: s.rules.length,
    activeRules: s.rules.filter((r) => r.active).length,
    observations: s.observations.length,
    catalogue: s.catalogue.length,
  };
  return (
    HEADER('règles, observations et décisions', file) +
    `import type { LoadingRule, SeedObservation } from '../core/types';\n` +
    `import type { DecisionLog } from './decisions';\n\n` +
    `export const SEED_META = ${JSON.stringify(meta, null, 2)} as const;\n\n` +
    `export const SEED_RULES: LoadingRule[] = ${JSON.stringify(s.rules, null, 2)};\n\n` +
    `export const SEED_OBSERVATIONS: SeedObservation[] = ${JSON.stringify(s.observations, null, 2)};\n\n` +
    `export const SEED_DECISIONS: DecisionLog[] = ${JSON.stringify(s.decisions, null, 2)};\n\n` +
    `/** Réfs que le classeur demande d'ajouter au catalogue (ajout par validation dans l'app, jamais en silence). */\n` +
    `export const SEED_CATALOGUE_TO_ADD: string[] = ${JSON.stringify(s.catalogueToAdd)};\n`
  );
}

export function catalogueSource(s: SeedResult, file: string): string {
  return (
    HEADER('catalogue des références (lecture seule)', file) +
    `import type { CatalogueItem } from '../core/types';\n\n` +
    `export const SEED_CATALOGUE: CatalogueItem[] = ${JSON.stringify(s.catalogue, null, 2)};\n`
  );
}

const fmtQty = (r: LoadingRule) => {
  if (r.qty === null) return r.qtyText ? `« ${r.qtyText} »` : 'à apprécier';
  if (r.tranche?.mode === 'tranche') return `${r.qty} par tranche de ${r.tranche.parTranche} (arrondi sup.)`;
  if (r.tranche?.mode === 'paliers') return r.tranche.paliers.map((p) => `${p.min}${p.max ? `–${p.max}` : '+'} → ${p.qty}`).join(', ');
  return String(r.qty).replace('.', ',');
};

const fmtSpare = (r: LoadingRule) => {
  const s = r.spare;
  if (!s) return '';
  if (s.type === 'fixe') return `+${s.valeur}`;
  if (s.type === 'pourcent') return `+${s.valeur} %`;
  return `« ${s.texte} » (non traduit)`;
};

const fmtWhen = (r: LoadingRule) =>
  Object.entries(r.when ?? {})
    .map(([k, v]) => (typeof v === 'boolean' ? (v ? k : `pas ${k}`) : `${k} = ${v}`))
    .join(', ');

const where = (i: ImportIssue) => (i.article ? `${i.where} (${i.article})` : i.where);

/** Questions qui ne viennent pas d'une ligne précise (à partir des réponses du 12/10/2026). */
const OPEN_QUESTIONS = [
  'Portes coulissantes : j’ai mis le kit de la porte double (7-632-022 + 7-632-018 + 2 × 7-632-017), en « à confirmer ». Quel est le bon kit — et pour la coulissante 5700 (7-625-020) ? Et 7-625-023 « Sliding doors Lavado 85 × 185 », est-ce une porte de box ?',
  'Spare « toujours un peu plus » : quincaillerie et plaques de jonction à + 30 %, EPDM à + 1 (couvre 6059 et 6060). D’accord ?',
  'Pieds de la 8,4 m (8) et de la M20 (10) : les pieds intermédiaires sont-ils répartis régulièrement sur les grands côtés (2 par grand côté pour la 8,4 m, 3 pour la M20) ?',
  'Plaques de base 4-700-035 (coin) / 4-700-036 (milieu) : sur une 8,4 m ou une M20, 1 par pied (4 coins + 4 ou 6 milieux) ? Et toujours sans spare (Klokgebouw et 6059 livrés sans) ?',
  'Airco / HVAC : seul 4-700-027 (AIRCO WALL) est marqué comme demandant un mur à trou. Et 4-700-026 (airco mobile), 4-700-028 / 4-700-030 (chauffage), 4-700-029 (convertisseur) ?',
  'Plaque simple 4-700-040 « box → terrasse / vide » : Klokgebouw (standalone) = 0. Elle sort seulement pour une box connectée dont un côté donne sur une terrasse ou le vide ? Par côté ou par mètre ?',
  'Ajouts chantier sans couleur ou en vert (échelles, câbles, peinture, laminé, gaffa) : importés « à confirmer ». Lesquels sont confirmés ?',
];

export function reportMarkdown(s: SeedResult, file: string): string {
  const L: string[] = [];
  const active = s.rules.filter((r) => r.active);
  const byConf = (c: string) => active.filter((r) => r.confidence === c).length;
  L.push(`# Rapport d'import — ${file}`, '');
  L.push(`Généré par \`plans/scripts/import-loading-rules.mjs\`. À relire par Amaury : rien n'a été tranché en silence.`, '');
  L.push('## Résumé', '');
  L.push(`- Onglets lus : ${s.sheetNames.join(', ')}`);
  L.push(`- Catalogue : ${s.catalogue.length} références (${s.catalogue.filter((c) => c.gros).length} « gros produits »)`);
  L.push(
    `- Règles : ${s.rules.length} lues, **${active.length} actives** (${byConf('confirme')} confirmées, ${byConf('a_confirmer')} à confirmer, ${byConf('hypothese')} hypothèses), ${s.rules.length - active.length} remplacées ou doublons gardés pour l'historique`,
  );
  L.push(`- Valeurs observées en régime connecté (mauve, pas des règles) : ${s.observations.length}`);
  L.push(`- Décisions appliquées : ${s.decisions.filter((d) => d.applied).length} / ${s.decisions.length}`, '');

  L.push('## Questions pour Amaury', '');
  let q = 1;
  for (const text of OPEN_QUESTIONS) L.push(`${q++}. ${text}`);
  for (const g of s.conflicts) {
    const rules = g.map((k) => s.rules.find((r) => r.key === k)!);
    L.push(
      `${q++}. **Contradiction ${rules[0].article}** (${rules[0].articleName ?? ''}) — ${rules.map((r) => `\`${r.key}\` ${fmtQty(r)} ${COUNTING_BASE_LABEL[r.per]}${r.trigger.vitrage ? ` (vitrage ${r.trigger.vitrage})` : ''}`).join(' **ou** ')}. Laquelle garder, ou s'additionnent-elles ?`,
    );
  }
  // une question sur une ligne du classeur dont toutes les règles ont été remplacées par une décision est résolue
  // (ou dont le spare en texte a été traduit par une décision)
  const resolved = (i: ImportIssue) => {
    const m = /^(\S+) ligne (\d+)$/.exec(i.where);
    if (!m) return false;
    const rules = s.rules.filter((r) => r.origin?.some((o) => o.sheet === m[1] && o.row === Number(m[2])));
    const spareDone = (r: LoadingRule) => i.text.startsWith('Spare en texte') && r.spare?.type !== 'texte';
    return rules.length > 0 && rules.every((r) => !r.active || spareDone(r));
  };
  const asked = new Map<string, string[]>();
  for (const i of s.issues.filter((x) => x.question && !resolved(x))) asked.set(i.question!, [...(asked.get(i.question!) ?? []), i.where]);
  for (const [text, places] of asked) L.push(`${q++}. ${text} _(${places.join(', ')})_`);
  const known = new Set(s.catalogue.map((c) => c.ref));
  const missing = [
    ...new Set([...s.catalogueToAdd, ...s.issues.filter((i) => i.kind === 'catalogue').map((i) => i.article!), ...active.map((r) => r.article).filter((a) => /^\d-\d{3}-\d{3,5}$/.test(a))]),
  ].filter((r) => !known.has(r));
  L.push(
    `${q++}. Références absentes du catalogue, à ajouter (dans l'app : Réglages › Règles de loading › Catalogue, « Ajouter ») : ${missing.map((r) => `\`${r}\``).join(', ')}.`,
  );
  L.push('');

  L.push('## Décisions appliquées par-dessus le classeur', '');
  for (const d of s.decisions) {
    L.push(`- **${d.date} — ${d.by}** ${d.applied ? '' : '⚠ partiellement appliquée '}: ${d.text}`);
    for (const x of d.details) L.push(`  - ${x}`);
  }
  L.push('');

  const section = (title: string, kinds: ImportIssue['kind'][]) => {
    const list = s.issues.filter((i) => kinds.includes(i.kind));
    if (!list.length) return;
    L.push(`## ${title}`, '');
    for (const i of list) L.push(`- ${where(i)} : ${i.text}`);
    L.push('');
  };
  section('Interprétations faites à l’import', ['interpretation']);
  section('Textes non traduits automatiquement', ['texte', 'condition']);
  section('Doublons', ['doublon']);
  section('Catalogue', ['catalogue']);
  section('Ignoré', ['ignore', 'decision', 'contradiction']);

  L.push('## Règles actives', '');
  for (const cat of LOADING_CATEGORIES) {
    const refs = new Map(s.catalogue.map((c) => [c.ref, c]));
    const list = active.filter((r) => (refs.get(r.article)?.categorie ?? 'structure') === cat.key);
    if (!list.length) continue;
    L.push(`### ${cat.label}`, '');
    L.push('| Article | Quantité | Base | Conditions | Spare | Confiance | Clé |', '|---|---|---|---|---|---|---|');
    for (const r of list)
      L.push(
        `| ${r.article} ${(refs.get(r.article)?.designation ?? r.articleName ?? '').replace(/\|/g, '/')} | ${fmtQty(r)} | ${COUNTING_BASE_LABEL[r.per]}${r.trigger.vitrage ? ` (vitrage ${r.trigger.vitrage})` : r.trigger.articles ? ` (${r.trigger.articles.join(', ')})` : ''} | ${fmtWhen(r)} | ${fmtSpare(r)} | ${CONFIDENCE_LABEL[r.confidence]}${r.conflict ? ' ⚠' : ''} | \`${r.key}\` |`,
      );
    L.push('');
  }
  L.push('## Valeurs observées (régime connecté, à re-caler)', '');
  for (const o of s.observations) L.push(`- ${o.article} ${o.articleName ?? ''} : ${o.valeur} (${o.chantier || 'chantier ?'}, ${o.contexte})`);
  L.push('');
  return L.join('\n');
}
