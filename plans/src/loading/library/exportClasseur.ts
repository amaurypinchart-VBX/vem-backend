// Base de règles effective → classeur VIEWBOX_regles_loading_N.xlsx, mêmes onglets que le classeur d'Amaury
// (LisezMoi, Regles_accessoires, Ajouts_chantier, Appreciation, Catalogue_ref), pour garder la continuité avec
// l'atelier des règles hors app. Couleurs : bleu confirmé, ambre à confirmer, mauve observé, vert règle apprise dans
// l'app. Fonctions pures.
import type { CatalogueItem, CountingBase, LoadingRule } from '../core/types';
import { describeConditions } from '../core/describe';
import type { XCell, XStyle } from '../xlsx/write';
import { writeXlsx } from '../xlsx/write';

const KEYWORD: Partial<Record<CountingBase, string>> = {
  box: 'BOX',
  pied: 'PIED',
  pied_box: 'PIED',
  jonction_box: 'JONCTION',
  jonction_grand_cote: 'JONCTION',
  jonction_petit_cote: 'JONCTION',
  jonction_toit_grand_cote: 'TOIT',
  jonction_toit_petit_cote: 'TOIT',
  jonction_panneau: 'JONCTION',
  jonction_verre: 'JONCTION',
  terminaison_vitre: 'VITRE',
  cote: 'BOX',
  cote_vitre_court: 'VITRE',
  cote_vitre_long: 'VITRE',
  panneau: 'PANNEAU',
  panneau_plein: 'MUR',
  porte_simple: 'PORTE',
  porte_double: 'PORTE',
  porte_coulissante: 'PORTE',
  poteau: 'POTEAU',
  poteau_connecte: 'POTEAU',
  ilot: 'UNITE',
  ilot_couvert: 'UNITE',
  module_toit: 'TOIT',
  airco: 'AIRCO',
  paire_box: 'BOX',
  sous_bois_etude: 'ETUDE',
  job: 'JOB',
};

const STYLES: Record<string, XStyle> = {
  title: { bold: true, size: 13 },
  text: { wrap: false },
  head: { bold: true, color: 'FFFFFF', fill: '1F4E78', border: true },
  bleu: { fill: 'DDEBF7', border: true, wrap: true, valign: 'top' },
  ambre: { fill: 'FFF2CC', border: true, wrap: true, valign: 'top' },
  mauve: { fill: 'E6E0F8', border: true, wrap: true, valign: 'top' },
  vert: { fill: 'E2EFDA', border: true, wrap: true, valign: 'top' },
  plain: { border: true, wrap: true, valign: 'top' },
};

const colorOf = (r: LoadingRule) =>
  r.source === 'correction' || r.source === 'montre_3d' || r.source === 'chantier_reel' || r.source === 'atelier_texte'
    ? 'vert'
    : r.confidence === 'confirme'
      ? 'bleu'
      : r.confidence === 'observe'
        ? 'mauve'
        : 'ambre';

const spareText = (r: LoadingRule) =>
  !r.spare ? '' : r.spare.type === 'fixe' ? `+${r.spare.valeur}` : r.spare.type === 'pourcent' ? `+${r.spare.valeur}%` : r.spare.texte;
const confText = { confirme: 'confirme', a_confirmer: 'a_confirmer', hypothese: 'hypothese', observe: 'observe' } as const;

export function classeurXlsx(rules: readonly LoadingRule[], catalogue: readonly CatalogueItem[], meta: { version: string; date: string; decisions: { date: string; by: string; text: string }[] }): Uint8Array {
  const active = rules.filter((r) => r.active);
  const name = (ref: string) => catalogue.find((c) => c.ref === ref)?.designation ?? '';
  const row = (cells: (string | number | null)[], s: string): XCell[] => cells.map((v) => ({ v, s }));
  const head = (cols: string[]) => cols.map((v) => ({ v, s: 'head' }));

  const readme: XCell[][] = [
    [{ v: 'Générateur de loading liste VIEWBOX — table de règles', s: 'title' }],
    [{ v: `Exporté de VEM (Plans Viewbox › Réglages › Règles de loading) le ${meta.date} — version des règles ${meta.version}.`, s: 'text' }],
    [{ v: 'Couleurs : BLEU = confirmé · AMBRE = à confirmer · MAUVE = observé (régime connecté, à re-caler) · VERT = règle apprise dans l’app.', s: 'text' }],
    [{ v: 'Colonne « Clé VEM » : identifiant de la règle dans l’app (ne pas modifier pour qu’un import la retrouve).', s: 'text' }],
    [],
    [{ v: 'Décisions appliquées par-dessus le classeur :', s: 'title' }],
    ...meta.decisions.map((d) => [{ v: `${d.date} — ${d.by} : ${d.text}`, s: 'text' }]),
  ];

  const acc = active.filter((r) => r.kind === 'accessoire' || r.kind === 'kit' || r.kind === 'substitution' || r.kind === 'exclusion');
  const accRows: XCell[][] = [
    head(['Produit réf.', 'Produit (nom)', 'Accessoire réf.', 'Accessoire (nom)', 'Quantité', 'Par', 'Niveau', 'Position', 'Connexion', 'Appui', 'Spare', 'Confiance', 'Remarque', 'Clé VEM']),
    ...acc.map((r) => {
      const trig = r.trigger.vitrage ? `VITRAGE ${r.trigger.vitrage}` : r.trigger.articles?.join(' / ') ?? KEYWORD[r.per] ?? r.per.toUpperCase();
      const trigName = r.trigger.articles?.map(name).join(' / ') ?? '';
      const other = describeConditions({ ...r.when, niveau: undefined, position: undefined, regime: undefined, connexion: undefined, appui: undefined });
      const remark = [r.replaces ? `remplace ${r.replaces.qty} × ${r.replaces.article}` : '', other.length ? `si ${other.join(', ')}` : '', r.remark ?? ''].filter(Boolean).join(' · ');
      return row(
        [
          trig,
          trigName,
          r.article,
          name(r.article) || r.articleName || '',
          r.qty ?? r.qtyText ?? '',
          r.per,
          r.when?.niveau ?? '',
          r.when?.position ?? '',
          r.when?.regime === 'connecte' ? (r.when.connexion ?? 'les_deux') : r.when?.regime === 'standalone' ? 'standalone' : '',
          r.when?.appui ?? '',
          spareText(r),
          confText[r.confidence],
          remark,
          r.key,
        ],
        colorOf(r),
      );
    }),
  ];

  const aj = active.filter((r) => r.kind === 'ajout_chantier');
  const ajRows: XCell[][] = [
    head(['Article réf.', 'Article (nom)', 'Base de calcul', 'Quantité pour', 'par tranche de', 'Arrondi', 'Remarque', 'Clé VEM']),
    ...aj.map((r) => {
      const base = r.per === 'box' ? 'nb VBX' : r.per === 'm2_plancher' ? 'm² plancher' : r.per === 'job' ? 'forfait job' : r.per;
      const cond = describeConditions(r.when);
      const t = r.tranche;
      const pour = t?.mode === 'tranche' ? t.pour : t?.mode === 'paliers' ? t.paliers.map((p) => `${p.min}${p.max ? `–${p.max}` : '+'} → ${p.qty}`).join(', ') : (r.qty ?? '');
      return row(
        [r.article, name(r.article) || r.articleName || '', `${base}${cond.length ? ` (SI ${cond.join(', ')})` : ''}`, pour, t?.mode === 'tranche' ? t.parTranche : t ? '' : 1, 'sup', r.remark ?? '', r.key],
        colorOf(r),
      );
    }),
  ];

  const app = active.filter((r) => r.kind === 'appreciation');
  const appRows: XCell[][] = [
    head(['Article réf.', 'Article (nom)', "Base d'estimation (texte libre)", 'Remarque', 'Clé VEM']),
    ...app.map((r) => row([r.article.replace(/\+/g, ' / '), r.articleName ?? name(r.article), 'à l’appréciation', r.remark ?? '', r.key], colorOf(r))),
  ];

  const catRows: XCell[][] = [
    head(['Référence', 'Désignation', 'Gros produit ?']),
    ...catalogue.map((c) => row([c.ref, `[${c.ref}] ${c.designation}`, c.gros ? 'OUI' : ''], 'plain')),
  ];

  return writeXlsx(
    [
      { name: 'LisezMoi', columns: [140], rows: readme },
      { name: 'Regles_accessoires', columns: [14, 30, 14, 34, 9, 18, 8, 9, 12, 9, 8, 12, 60, 34], rows: accRows, freezeRows: 1 },
      { name: 'Ajouts_chantier', columns: [14, 34, 30, 14, 12, 8, 60, 30], rows: ajRows, freezeRows: 1 },
      { name: 'Appreciation', columns: [22, 34, 30, 60, 30], rows: appRows, freezeRows: 1 },
      { name: 'Catalogue_ref', columns: [14, 80, 14], rows: catRows, freezeRows: 1 },
    ],
    STYLES,
  );
}
