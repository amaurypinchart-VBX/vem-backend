// Réponses d'Amaury appliquées par-dessus la traduction du classeur (le classeur reste la source de vérité métier ;
// chaque décision est datée, expliquée et tracée dans le rapport d'import). Une décision qui ne trouve plus sa règle
// (classeur modifié) est signalée, jamais appliquée à une autre règle. Fonctions pures.
import type { CatalogueItem, ImportIssue, LoadingRule, Unit } from '../core/types';
import type { ImportResult } from './importClasseur';
import { expandRefs, findConflicts, ruleKey } from './importClasseur';

export interface DecisionLog {
  id: string;
  date: string;
  /** qui a tranché (Amaury) ou d'où vient la décision (remarque du classeur) */
  by: string;
  text: string;
  applied: boolean;
  details: string[];
}

interface Ctx {
  rules: LoadingRule[];
  catalogue: Map<string, CatalogueItem>;
  log: DecisionLog;
}

const find = (ctx: Ctx, key: string) => {
  const r = ctx.rules.find((x) => x.key === key);
  if (!r) {
    ctx.log.applied = false;
    ctx.log.details.push(`règle « ${key} » introuvable (classeur modifié ?) : décision non appliquée sur ce point`);
  }
  return r;
};

const retire = (ctx: Ctx, key: string, by: string) => {
  const r = find(ctx, key);
  if (!r) return;
  r.active = false;
  r.supersededBy = by;
  ctx.log.details.push(`${key} → remplacée par ${by}`);
};

const add = (ctx: Ctx, r: Omit<LoadingRule, 'key' | 'version' | 'active' | 'calibration'> & Partial<Pick<LoadingRule, 'calibration'>>) => {
  const rule: LoadingRule = { calibration: [], ...r, key: '', version: 1, active: true };
  rule.key = ruleKey(rule);
  ctx.rules.push(rule);
  ctx.log.details.push(`ajout ${rule.key}`);
  return rule.key;
};

const setUnit = (ctx: Ctx, ref: string, unit: Unit) => {
  const c = ctx.catalogue.get(ref);
  if (c) c.unit = unit;
  for (const r of ctx.rules) if (r.article === ref) r.unit = unit;
  ctx.log.details.push(`${ref} : unité ${unit}`);
};

/** Spare de la boulonnerie, de la quincaillerie et des plaques de jonction (Amaury 12.10.2026 : « genre 20 % »). */
export const HARDWARE_SPARE = { type: 'pourcent', valeur: 20 } as const;

interface Decision {
  id: string;
  date: string;
  by: string;
  text: string;
  apply: (ctx: Ctx) => void;
}

export const DECISIONS: Decision[] = [
  {
    id: 'sous-bois-etude',
    date: '2026-10-12',
    by: 'Amaury',
    text:
      'Les sous-bois (cales 400×400, 700×700, 1000×1000) viennent de l’Étude structure, qui donne combien de plaques et où. ' +
      'La loading liste prend la quantité de l’étude × 2 (ex. l’étude dit 25 × 40×40 → 50 dans la liste), pour tous les sous-bois.',
    apply: (ctx) => {
      for (const [ref, old] of [
        ['4-740-001', 'acc:4-740-001@pied'],
        ['4-740-002', 'acc:4-740-002@box[milieu]'],
        ['4-740-003', 'acc:4-740-003@box[angle]'],
      ] as const) {
        const by = add(ctx, {
          kind: 'accessoire',
          trigger: {},
          article: ref,
          articleName: ctx.catalogue.get(ref)?.designation,
          qty: 2,
          per: 'sous_bois_etude',
          unit: 'pce',
          confidence: 'confirme',
          remark: 'Plaques de calage de l’Étude structure de ce modèle (même dimension) × 2.',
          source: 'decision',
        });
        retire(ctx, old, by);
      }
    },
  },
  {
    id: 'toolkit-8-vbx',
    date: '2026-10-12',
    by: 'Amaury',
    text: 'Toolkit 4-750-001 : 1 jusqu’à 7 VBX, 2 dès 8 VBX. Au-delà de 15 VBX : pas encore de règle (à confirmer).',
    apply: (ctx) => {
      const r = find(ctx, 'aj:4-750-001@box');
      if (!r) return;
      r.tranche = { mode: 'paliers', paliers: [{ min: 1, max: 7, qty: 1 }, { min: 8, max: 15, qty: 2 }] };
      r.qty = 1;
      r.confidence = 'confirme';
      r.source = 'decision';
      r.remark = `${r.remark ?? ''} || 2026-10-12 Amaury : 2 dès 8 VBX.`.replace(/^ \|\| /, '');
      ctx.log.details.push('aj:4-750-001@box : paliers 1–7 → 1, 8–15 → 2');
    },
  },
  {
    id: 'airco-mur-trou',
    date: '2026-10-12',
    by: 'Amaury',
    text:
      'Un module airco / HVAC vu dans la 3D demande un mur avec trou airco 4-700-083 (explique les +3 nidaplast de 6059 : ' +
      'les 11 murs dessinés + 3 murs à trou). Le décompte d’un mur 7-636-008 reste réservé au cas où l’airco n’est pas dessinée ' +
      'et que son emplacement est dessiné en nidaplast (règle du classeur).',
    apply: (ctx) => {
      const old = find(ctx, 'acc:4-700-083@4-700-027/airco');
      const base = {
        trigger: {},
        article: '4-700-083',
        articleName: ctx.catalogue.get('4-700-083')?.designation,
        qty: 1,
        per: 'airco' as const,
        unit: 'pce' as const,
        confidence: 'confirme' as const,
        calibration: old?.calibration ?? [],
        origin: old?.origin,
      };
      const sub = add(ctx, {
        ...base,
        kind: 'substitution',
        replaces: { article: '7-636-008', qty: 1 },
        when: { aircoSlot: 'nidaplast' },
        remark: 'Airco non dessinée, emplacement dessiné en nidaplast : le mur à trou remplace 1 mur 7-636-008.',
        source: 'seed',
      });
      add(ctx, {
        ...base,
        kind: 'accessoire',
        when: { aircoSlot: 'autre' },
        remark: 'Module airco / HVAC dessiné dans la 3D (ou emplacement vide) : 1 mur à trou airco en plus, aucun mur décompté.',
        source: 'decision',
      });
      if (old) retire(ctx, old.key, sub);
      const airco = ctx.catalogue.get('4-700-027');
      if (airco) airco.hvac = true;
      ctx.log.details.push('4-700-027 marqué « airco / HVAC »');
    },
  },
  {
    id: 'ip44-par-vbx',
    date: '2026-10-12',
    by: 'remarque du classeur (révisé 6060/00058)',
    text: 'Câble IP44 4-730-009 : 1 par VBX, airco ou non (la ligne « par airco » et le forfait chantier sont remplacés).',
    apply: (ctx) => {
      retire(ctx, 'acc:4-730-009@4-700-027/box', 'acc:4-730-009@box');
    },
  },
  {
    id: 'epdm-alt',
    date: '2026-10-12',
    by: 'remarque du classeur (« ALT : géré dans Regles »)',
    text: 'La ligne EPDM 4-700-096 de l’onglet Ajouts_chantier est un doublon des règles d’accessoires : désactivée.',
    apply: (ctx) => retire(ctx, 'aj:4-700-096@module_toit', 'acc:4-700-096@module_toit[connecte,suspendu]'),
  },
  {
    id: 'vitrage-7-637-010',
    date: '2026-10-12',
    by: 'Amaury',
    text: 'Le glasswall seamless 10 mm 7-637-010 (alu mat) prend les mêmes accessoires que 7-637-009 (régime 10 mm).',
    apply: (ctx) => {
      const c = ctx.catalogue.get('7-637-010');
      if (!c) {
        ctx.log.applied = false;
        ctx.log.details.push('7-637-010 absent du catalogue');
        return;
      }
      c.vitrage = '10mm';
      ctx.log.details.push('7-637-010 : régime 10 mm');
    },
  },
  {
    id: 'pieds-par-type',
    date: '2026-10-12',
    by: 'Amaury',
    text: 'Pieds par box : Viewbox standard 5900 = 6 (4 coins + 2 milieux), Viewbox 8,4 m = 8, Viewbox M20 = 10.',
    apply: (ctx) => {
      for (const [ref, pieds] of [
        ['7-962-016', { total: 6, angle: 4, milieuParGrandCote: 1 }],
        ['7-962-012', { total: 8, angle: 4, milieuParGrandCote: 2 }],
        ['7-962-008', { total: 10, angle: 4, milieuParGrandCote: 3 }],
      ] as const) {
        const c = ctx.catalogue.get(ref);
        if (!c) {
          ctx.log.applied = false;
          ctx.log.details.push(`${ref} absent du catalogue`);
          continue;
        }
        c.pieds = { ...pieds };
        ctx.log.details.push(`${ref} : ${pieds.total} pieds`);
      }
    },
  },
  {
    id: 'lamine-par-box',
    date: '2026-10-12',
    by: 'remarque du classeur (« 15 m²/box »)',
    text: 'Plancher laminé 4-740-010 : 15 m² par box (si plancher laminé). Gaffa et adhésif : 1 par tranche de 15 m² de laminé.',
    apply: (ctx) => {
      const r = find(ctx, 'aj:4-740-010@m2_plancher[plancherLamine]');
      if (!r) return;
      r.per = 'box';
      r.qty = 15;
      r.key = ruleKey(r);
      ctx.log.details.push(`4-740-010 : 15 m² / box → ${r.key}`);
      setUnit(ctx, '4-740-010', 'm2');
    },
  },
  {
    id: 'peinture-petit-job',
    date: '2026-10-12',
    by: 'remarque du classeur (« Petit job : 2 pots », « Petit job : 1 »)',
    text: 'Peinture : petit job = 2 pots 4-700-001 + 1 kit 4-700-044 ; gros job = 1 bidon 20 L 4-700-002. La taille du job est une question chantier.',
    apply: (ctx) => {
      for (const [key, qty] of [
        ['app:4-700-001@job', 2],
        ['app:4-700-044@job', 1],
      ] as const) {
        const r = find(ctx, key);
        if (!r) continue;
        r.kind = 'ajout_chantier';
        r.qty = qty;
        r.when = { tailleJob: 'petit' };
        r.key = ruleKey(r);
        ctx.log.details.push(`${key} → ${r.key} (${qty})`);
      }
    },
  },
  {
    id: 'unites-metre',
    date: '2026-10-12',
    by: 'classeur (quantités en mètres)',
    text: 'Unités : bande poteau 4-720-011 et câble sans prise 4-730-005 au mètre.',
    apply: (ctx) => {
      setUnit(ctx, '4-720-011', 'm');
      setUnit(ctx, '4-730-005', 'm');
    },
  },
  {
    id: 'epdm-jonctions-toit',
    date: '2026-10-12',
    by: 'Amaury',
    text:
      'EPDM de toit : 1 par jonction de toit. Deux toits qui se touchent par les grands côtés → l’EPDM 5900 (4-700-096, ' +
      'substitut 4-700-045) ; par les petits côtés → l’EPDM 2500 (réf. à préciser).',
    apply: (ctx) => {
      const by = add(ctx, {
        kind: 'accessoire',
        trigger: {},
        article: '4-700-096',
        articleName: 'Roof Rubber EPDM 57x32x5900 |VBX|',
        qty: 1,
        per: 'jonction_toit_grand_cote',
        unit: 'pce',
        confidence: 'confirme',
        remark: 'Substitut accepté : 4-700-045 (50×40×5900). L’EPDM 2500 des jonctions petit côté : réf. à préciser.',
        calibration: [
          { chantier: '6060RIAAHVIE', bordereau: '00058', base: 2, predit: 2, livre: 2, note: '2 îlots de 2 VBX : 2 jonctions de toit grand côté' },
          { chantier: '6059RFRAMVIE', bordereau: '00056', base: 3, predit: 3, livre: 4, note: '4 VBX côte à côte : 3 jonctions → 3 ; livré 4 (écart +1 à expliquer)' },
        ],
        source: 'decision',
      });
      retire(ctx, 'acc:4-700-096@module_toit[connecte,suspendu]', by);
      retire(ctx, 'acc:4-700-096@ilot_couvert[connecte,suspendu]', by);
    },
  },
  {
    id: 'plaques-boulons-jonctions',
    date: '2026-10-12',
    by: 'Amaury',
    text:
      'Jonctions entre box : plaque inter-box 4-700-039 = 5 par jonction grand côté, 2 par jonction petit côté ; ' +
      'boulons 4-710-001 = 10 par jonction grand côté (5 en bas + 5 en haut), 4 par jonction petit côté (2 + 2). ' +
      'Boulonnerie, quincaillerie, plaques de jonction : + 20 % de spare.',
    apply: (ctx) => {
      const spare = { ...HARDWARE_SPARE };
      const common = { kind: 'accessoire' as const, trigger: {}, unit: 'pce' as const, confidence: 'confirme' as const, spare, source: 'decision' as const, group: 'jonctions-box' };
      const plate = ctx.catalogue.get('4-700-039')?.designation;
      const pl = add(ctx, {
        ...common,
        article: '4-700-039',
        articleName: plate,
        qty: 5,
        per: 'jonction_grand_cote',
        calibration: [
          { chantier: '6060RIAAHVIE', bordereau: '00058', base: 2, predit: 12, livre: 12, note: '2 jonctions × 5 = 10, + 20 % → 12' },
          { chantier: '6059RFRAMVIE', bordereau: '00056', base: 3, predit: 18, livre: 20, note: '3 jonctions × 5 = 15, + 20 % → 18 ; livré 20' },
        ],
      });
      add(ctx, { ...common, article: '4-700-039', articleName: plate, qty: 2, per: 'jonction_petit_cote' });
      retire(ctx, 'acc:4-700-039@jonction_box[connecte]', pl);
      retire(ctx, 'acc:4-700-039@box[connecte]', pl);
      const bolt = ctx.catalogue.get('4-710-001')?.designation;
      const bo = add(ctx, {
        ...common,
        article: '4-710-001',
        articleName: bolt,
        qty: 10,
        per: 'jonction_grand_cote',
        calibration: [
          { chantier: '6059RFRAMVIE', bordereau: '00056', base: 3, predit: 36, livre: 36, note: '3 jonctions × 10 = 30, + 20 % → 36' },
          { chantier: '6060RIAAHVIE', bordereau: '00058', base: 2, predit: 24, livre: 26, note: '2 jonctions × 10 = 20, + 20 % → 24 ; livré 26' },
        ],
      });
      add(ctx, { ...common, article: '4-710-001', articleName: bolt, qty: 4, per: 'jonction_petit_cote' });
      retire(ctx, 'acc:4-710-001@box', bo);
      const simple = find(ctx, 'acc:4-700-040@bord');
      if (simple && !simple.spare) {
        simple.spare = { ...HARDWARE_SPARE };
        ctx.log.details.push('acc:4-700-040@bord : + 20 % (plaque de jonction)');
      }
    },
  },
  {
    id: 'spares-joints-10mm',
    date: '2026-10-12',
    by: 'Amaury (« spare rajouté ») — pourcentages déduits du bordereau 6060, à confirmer',
    text:
      'Joints du vitrage 10 mm : on rajoute du spare. Square 10 mm 4-700-072 : + 20 % puis + 2 par porte coulissante (6060 : 6 → 8 → 10) ; ' +
      'joints petits / grands côtés vitrés 4-700-067 / 4-700-074 : + 50 % (6060 : 4 → 6 et 2 → 3).',
    apply: (ctx) => {
      for (const [key, valeur, livre] of [
        ['acc:4-700-072@10mm/terminaison_vitre', 20, '6 → 8'],
        ['acc:4-700-067@10mm/cote_vitre_court', 50, '4 → 6'],
        ['acc:4-700-074@10mm/cote_vitre_long', 50, '2 → 3'],
      ] as const) {
        const r = find(ctx, key);
        if (!r) continue;
        r.spare = { type: 'pourcent', valeur };
        ctx.log.details.push(`${key} : spare « texte » → + ${valeur} % (6060 : ${livre})`);
      }
      add(ctx, {
        kind: 'accessoire',
        trigger: { vitrage: '10mm' },
        article: '4-700-072',
        articleName: ctx.catalogue.get('4-700-072')?.designation,
        qty: 2,
        per: 'porte_coulissante',
        unit: 'pce',
        confidence: 'confirme',
        remark: 'Classeur (6060/00058) : « + porte coulissante = +2 → 10 ».',
        calibration: [{ chantier: '6060RIAAHVIE', bordereau: '00058', base: 1, predit: 2, livre: 2 }],
        source: 'decision',
        group: 'square-10mm',
      });
      const term = find(ctx, 'acc:4-700-072@10mm/terminaison_vitre');
      if (term) term.group = 'square-10mm';
    },
  },
  {
    id: 'marches-toutes-portes',
    date: '2026-10-12',
    by: 'Amaury',
    text:
      'Marches : dès que c’est une porte. Toute porte simple (pleine ou vitrée) → 3 marches 7-632-017 ; toute porte double (pleine ou vitrée) → ' +
      '7-632-022 + 7-632-018 + 2 × 7-632-017. Le type de porte vient de la désignation du catalogue.',
    apply: (ctx) => {
      const kit = (article: string, qty: number, per: 'porte_simple' | 'porte_double', old: string) => {
        const prev = find(ctx, old);
        const by = add(ctx, {
          kind: 'kit',
          trigger: {},
          article,
          articleName: ctx.catalogue.get(article)?.designation,
          qty,
          per,
          unit: 'pce',
          confidence: 'confirme',
          remark: prev?.remark,
          calibration: prev?.calibration ?? [],
          origin: prev?.origin,
          source: 'decision',
          group: 'marches-portes',
        });
        if (prev) retire(ctx, old, by);
      };
      kit('7-632-017', 3, 'porte_simple', 'kit:7-632-017@7-199-067/produit');
      kit('7-632-022', 1, 'porte_double', 'kit:7-632-022@7-199-066/produit');
      kit('7-632-018', 1, 'porte_double', 'kit:7-632-018@7-199-066/produit');
      kit('7-632-017', 2, 'porte_double', 'kit:7-632-017@7-199-066/produit');
      const doors = [...ctx.catalogue.values()].filter((c) => c.porte);
      ctx.log.details.push(
        `portes du catalogue : ${doors.map((c) => `${c.ref} ${c.porte}`).join(', ')}`,
      );
    },
  },
];

/** Notes d'appréciation dont tous les articles ont déjà une règle active : informatives seulement. */
function retireCoveredAppreciations(rules: LoadingRule[], issues: ImportIssue[]) {
  for (const r of rules) {
    if (r.kind !== 'appreciation' || !r.active) continue;
    const all = expandRefs(r.article.replace(/\+/g, ' '));
    if (!all.length) continue;
    const covering = all.map((a) => rules.find((x) => x !== r && x.active && x.kind !== 'appreciation' && x.article === a));
    if (covering.every(Boolean)) {
      r.active = false;
      r.supersededBy = covering[0]!.key;
      issues.push({
        where: (r.origin ?? []).map((o) => `${o.sheet} ligne ${o.row}`).join(', '),
        article: r.article,
        kind: 'doublon',
        text: `Note d’appréciation « ${r.articleName ?? r.article} » déjà couverte par ${covering.map((c) => c!.key).join(', ')} : gardée comme information, inactive.`,
      });
    }
  }
}

export interface SeedResult extends ImportResult {
  decisions: DecisionLog[];
  conflicts: string[][];
}

export function applyDecisions(imported: ImportResult, decisions: Decision[] = DECISIONS): SeedResult {
  const rules = structuredClone(imported.rules);
  const catalogueList = structuredClone(imported.catalogue);
  const catalogue = new Map(catalogueList.map((c) => [c.ref, c]));
  const issues = [...imported.issues];
  const logs: DecisionLog[] = [];
  for (const d of decisions) {
    const log: DecisionLog = { id: d.id, date: d.date, by: d.by, text: d.text, applied: true, details: [] };
    d.apply({ rules, catalogue, log });
    logs.push(log);
  }
  retireCoveredAppreciations(rules, issues);
  const conflicts = findConflicts(rules).map((g) => g.map((r) => r.key));
  for (const g of conflicts) for (const k of g) {
    const r = rules.find((x) => x.key === k)!;
    r.conflict = g[0];
  }
  return { ...imported, rules, catalogue: catalogueList, issues, decisions: logs, conflicts };
}
