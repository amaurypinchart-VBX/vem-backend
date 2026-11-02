// Mode 🎓 « Apprendre » (L7) : l'utilisateur montre dans la 3D les éléments qui demandent un accessoire (jonctions,
// côtés, pieds, box, panneaux de façade, paires de panneaux voisins, produits). Chaque élément est décrit par ses
// relations (« jonction grand côté, décalée, toits jointifs », « petit côté vitré 10 mm contre une box ») ; ce que les
// exemples ont en commun devient un motif, plus ou moins général (on retire un trait à la fois), compté sur la
// topologie, îlot par îlot, comme une base de comptage. Quand un motif revient exactement à une base déjà connue
// (« jonction grand côté » = base jonction_grand_cote), c'est cette base qui est proposée. Fonctions pures, sans IA.
import type { AttrValue, CatalogueItem, CountingBase, MotifKind, MotifSpec } from '../core/types';
import type { BoxSide, Topology } from '../topology/types';

export type { AttrValue, MotifKind, MotifSpec };

/** Élément de la topologie qu'on peut montrer et compter. */
export interface TElement {
  /** id de la topologie (module, jonction, côté, pied, nœud, « nœud|nœud » pour des voisins) */
  id: string;
  kind: MotifKind;
  islandId: string | null;
  /** ids à surligner dans la 3D */
  ids: string[];
  attrs: Record<string, AttrValue>;
  /** « J2 : VBX-01 / VBX-02 » */
  where: string;
}

export const KIND_LABEL: Record<MotifKind, [string, string]> = {
  box: ['box', 'box'],
  jonction: ['jonction entre box', 'jonctions entre box'],
  cote: ['côté de box', 'côtés de box'],
  pied: ['pied', 'pieds'],
  panneau: ['panneau de façade', 'panneaux de façade'],
  voisins: ['jonction entre deux panneaux voisins', 'jonctions entre panneaux voisins'],
  produit: ['pose de produit', 'poses de produit'],
};

/** Traits possibles par genre, dans l'ordre d'affichage, avec leur libellé et leurs valeurs. */
export const ATTRS: Record<MotifKind, Record<string, { label: string; values: Record<string, string> }>> = {
  box: {
    niveau: { label: 'niveau', values: { rez: 'au rez', etage: 'à l’étage' } },
    regime: { label: 'régime', values: { standalone: 'seule', connecte: 'connectée à une autre box' } },
    couvert: { label: 'toits', values: { true: 'toit jointif à un autre', false: 'toit non jointif' } },
    empilee: { label: 'empilage', values: { true: 'une box posée dessus', false: 'rien posé dessus' } },
    jonctions: { label: 'jonctions', values: { '0': 'aucune jonction', '1': '1 jonction', '2': '2 jonctions', '3+': '3 jonctions ou plus' } },
    ref: { label: 'référence', values: {} },
  },
  jonction: {
    type: { label: 'type', values: { grand_cote: 'grand côté', petit_cote: 'petit côté', mixte: 'grand contre petit côté' } },
    decalee: { label: 'alignement', values: { true: 'décalée', false: 'alignée' } },
    toit: { label: 'toits', values: { true: 'toits jointifs (rien posé dessus)', false: 'toits non jointifs' } },
    niveau: { label: 'niveau', values: { rez: 'au rez', etage: 'à l’étage' } },
  },
  cote: {
    type: { label: 'type', values: { grand: 'grand côté', petit: 'petit côté' } },
    exposition: { label: 'exposition', values: { exterieur: 'extérieur', interieur: 'contre une box', partiel: 'en partie contre une box' } },
    facade: { label: 'façade', values: { aucune: 'sans façade', mur: 'murs', vitre: 'vitré', porte: 'avec porte(s) seulement', mixte: 'façade mixte' } },
    vitrage: { label: 'vitrage', values: { aucun: 'sans vitre', '8.8.2': 'vitrage 8.8.2', '10mm': 'vitrage 10 mm', '4.4.2': 'vitrage 4.4.2' } },
    porte: { label: 'portes', values: { true: 'avec une porte', false: 'sans porte' } },
    niveau: { label: 'niveau', values: { rez: 'au rez', etage: 'à l’étage' } },
    regime: { label: 'régime', values: { standalone: 'box seule', connecte: 'box connectées' } },
  },
  pied: {
    type: { label: 'position', values: { angle: 'd’angle', milieu: 'de milieu', mixte: 'angle et milieu' } },
    partage: { label: 'partage', values: { true: 'commun à plusieurs box', false: 'd’une seule box' } },
    regime: { label: 'régime', values: { standalone: 'box seule', connecte: 'box connectées' } },
  },
  panneau: {
    nature: { label: 'nature', values: { mur: 'mur', vitre: 'vitre', porte: 'porte' } },
    porte: { label: 'porte', values: { simple: 'porte simple', double: 'porte double', coulissante: 'porte coulissante' } },
    vitrage: { label: 'vitrage', values: { '8.8.2': 'vitrage 8.8.2', '10mm': 'vitrage 10 mm', '4.4.2': 'vitrage 4.4.2' } },
    article: { label: 'référence', values: {} },
    cote: { label: 'côté', values: { grand: 'sur un grand côté', petit: 'sur un petit côté' } },
    bout: { label: 'bout', values: { true: 'en bout (contre un poteau)', false: 'entre deux panneaux' } },
    niveau: { label: 'niveau', values: { rez: 'au rez', etage: 'à l’étage' } },
  },
  voisins: {
    paire: { label: 'panneaux', values: {} },
    vitrage: { label: 'vitrage', values: { aucun: 'sans vitre', '8.8.2': 'vitrage 8.8.2', '10mm': 'vitrage 10 mm', '4.4.2': 'vitrage 4.4.2' } },
    cote: { label: 'côté', values: { grand: 'sur un grand côté', petit: 'sur un petit côté' } },
    niveau: { label: 'niveau', values: { rez: 'au rez', etage: 'à l’étage' } },
  },
  produit: {
    article: { label: 'référence', values: {} },
  },
};

const sortKeys = (kind: MotifKind, keys: string[]) => {
  const order = Object.keys(ATTRS[kind]);
  return [...keys].sort((a, b) => order.indexOf(a) - order.indexOf(b));
};

/** Valeur d'un trait en français. */
export function attrText(kind: MotifKind, key: string, v: AttrValue): string {
  const a = ATTRS[kind][key];
  const t = a?.values[String(v)];
  if (t) return t;
  if (key === 'paire') return String(v);
  if (key === 'article' || key === 'ref') return `réf. ${String(v)}`;
  return `${a?.label ?? key} ${String(v)}`;
}

/** « jonction entre box · grand côté · décalée » (pluriel pour le compte). */
export function describeMotif(m: MotifSpec, plural = false): string {
  const head = KIND_LABEL[m.kind][plural ? 1 : 0];
  const parts = sortKeys(m.kind, Object.keys(m.attrs)).map((k) => attrText(m.kind, k, m.attrs[k]));
  return parts.length ? `${head} ${parts.join(', ')}` : head;
}

/** Clé stable d'un motif (clé de règle, comparaison). */
export function motifKey(m: MotifSpec): string {
  return `${m.kind}{${sortKeys(m.kind, Object.keys(m.attrs))
    .map((k) => `${k}=${String(m.attrs[k])}`)
    .join(',')}}`;
}

const niveau = (level: number) => (level > 0 ? 'etage' : 'rez');

/** Tous les éléments montrables de la topologie, avec leurs traits. */
export function topologyElements(t: Topology, catalogue?: ReadonlyMap<string, CatalogueItem>): TElement[] {
  const mod = new Map(t.modules.map((m) => [m.id, m]));
  const isl = new Map(t.islands.map((i) => [i.id, i]));
  const regimeOf = (moduleId: string) => isl.get(mod.get(moduleId)?.islandId ?? '')?.regime ?? 'standalone';
  const out: TElement[] = [];
  for (const m of t.modules) {
    const nj = t.junctions.filter((j) => j.modules.includes(m.id)).length;
    out.push({
      id: m.id,
      kind: 'box',
      islandId: m.islandId,
      ids: [m.id],
      where: m.id,
      attrs: {
        niveau: niveau(m.level),
        regime: regimeOf(m.id),
        couvert: t.junctions.some((j) => j.roof && j.modules.includes(m.id)),
        empilee: m.above.length > 0,
        jonctions: nj >= 3 ? '3+' : String(nj),
        ...(m.boxRef ? { ref: m.boxRef } : {}),
      },
    });
  }
  for (const j of t.junctions) {
    const m = mod.get(j.modules[0]);
    out.push({
      id: j.id,
      kind: 'jonction',
      islandId: m?.islandId ?? null,
      ids: [j.id],
      where: `${j.id} : ${j.modules.join(' / ')}`,
      attrs: { type: j.kind, decalee: j.offset, toit: j.roof, niveau: niveau(m?.level ?? 0) },
    });
  }
  for (const s of t.sides) {
    const m = mod.get(s.moduleId);
    const kinds = new Set(s.elements.map((e) => e.kind));
    const glass = s.elements.find((e) => e.kind === 'vitre' && e.vitrage)?.vitrage;
    const facade = !kinds.size ? 'aucune' : kinds.size > 1 ? (kinds.has('vitre') ? 'vitre' : 'mixte') : [...kinds][0];
    out.push({
      id: s.id,
      kind: 'cote',
      islandId: m?.islandId ?? null,
      ids: [s.id],
      where: `${s.moduleId} ${s.label}`,
      attrs: {
        type: s.kind === 'long' ? 'grand' : 'petit',
        exposition: s.exposure,
        facade,
        vitrage: glass ?? 'aucun',
        porte: kinds.has('porte'),
        niveau: niveau(m?.level ?? 0),
        regime: regimeOf(s.moduleId),
      },
    });
    out.push(...facadeElements(s, m?.islandId ?? null, niveau(m?.level ?? 0)));
  }
  for (const f of t.feet) {
    const mods = [...new Set(f.members.map((x) => x.moduleId))];
    out.push({
      id: f.id,
      kind: 'pied',
      islandId: mod.get(mods[0])?.islandId ?? null,
      ids: [f.id],
      where: `${f.id} : ${mods.join(' / ')}`,
      attrs: { type: f.kind, partage: mods.length > 1, regime: regimeOf(mods[0]) },
    });
  }
  for (const p of t.products)
    for (const n of p.nodeIds)
      out.push({ id: n, kind: 'produit', islandId: null, ids: [n], where: `${p.article}${catalogue?.get(p.article) ? ` ${catalogue.get(p.article)!.designation}` : ''}`, attrs: { article: p.article } });
  return out;
}

function facadeElements(s: BoxSide, islandId: string | null, lvl: string): TElement[] {
  const out: TElement[] = [];
  const cote = s.kind === 'long' ? 'grand' : 'petit';
  for (let i = 0; i < s.sequence.length; i++) {
    const it = s.sequence[i];
    if (it.type !== 'element') continue;
    const e = s.elements[it.index];
    const prevIt = s.sequence[i - 1];
    const nextIt = s.sequence[i + 1];
    const next = nextIt?.type === 'element' ? s.elements[nextIt.index] : null;
    out.push({
      id: e.nodeId,
      kind: 'panneau',
      islandId,
      ids: [e.nodeId],
      where: `${s.moduleId} ${s.label}${e.article ? ` · ${e.article}` : ''}`,
      attrs: {
        nature: e.kind,
        ...(e.porte ? { porte: e.porte } : {}),
        ...(e.vitrage ? { vitrage: e.vitrage } : {}),
        article: e.article ?? 'sans réf.',
        cote,
        bout: prevIt?.type !== 'element' || nextIt?.type !== 'element',
        niveau: lvl,
      },
    });
    if (next) {
      const pair = [e.kind, next.kind].sort().join(' + ');
      const glass = [e, next].find((x) => x.kind === 'vitre' && x.vitrage)?.vitrage;
      out.push({
        id: `${e.nodeId}|${next.nodeId}`,
        kind: 'voisins',
        islandId,
        ids: [`${e.nodeId}|${next.nodeId}`],
        where: `${s.moduleId} ${s.label}`,
        attrs: { paire: pair, vitrage: glass ?? 'aucun', cote, niveau: lvl },
      });
    }
  }
  return out;
}

/** « jonction grand côté, décalée (J2 : VBX-01 / VBX-02) ». */
export function describeElement(e: TElement): string {
  return `${describeMotif({ kind: e.kind, attrs: e.attrs })} (${e.where})`;
}

export const matches = (spec: MotifSpec, e: TElement) => e.kind === spec.kind && Object.entries(spec.attrs).every(([k, v]) => e.attrs[k] === v);

export interface MotifCount {
  value: number;
  ids: string[];
  /** ids topologie des éléments trouvés */
  elements: string[];
  detail: string;
}

/** Occurrences d'un motif sur la topologie (dans un îlot, ou partout). */
export function countMotif(t: Topology, spec: MotifSpec, islandId?: string | null, catalogue?: ReadonlyMap<string, CatalogueItem>, elements?: readonly TElement[]): MotifCount {
  const els = (elements ?? topologyElements(t, catalogue)).filter((e) => matches(spec, e) && (!islandId || e.islandId === islandId));
  return {
    value: els.length,
    ids: els.flatMap((e) => e.ids),
    elements: els.map((e) => e.id),
    detail: `${els.length} ${describeMotif(spec, els.length > 1)}`,
  };
}

/** Base de comptage connue qui revient au même que le motif (vérifié : même compte sur cette topologie). */
export function equivalentBase(t: Topology, spec: MotifSpec): { per: CountingBase; trigger?: string } | null {
  const a = spec.attrs;
  const keys = Object.keys(a).sort().join(',');
  let per: CountingBase | null = null;
  let trigger: string | undefined;
  if (spec.kind === 'box' && !keys) per = 'box';
  else if (spec.kind === 'pied' && !keys) per = 'pied';
  else if (spec.kind === 'jonction') {
    if (!keys) per = 'jonction_box';
    else if (keys === 'type' && a.type === 'grand_cote') per = 'jonction_grand_cote';
    else if (keys === 'type' && a.type === 'petit_cote') per = 'jonction_petit_cote';
    else if (keys === 'toit,type' && a.toit === true && a.type === 'grand_cote') per = 'jonction_toit_grand_cote';
    else if (keys === 'toit,type' && a.toit === true && a.type === 'petit_cote') per = 'jonction_toit_petit_cote';
  } else if (spec.kind === 'panneau' && keys === 'nature' && a.nature === 'mur') per = 'panneau_plein';
  else if (spec.kind === 'voisins' && keys === 'vitrage' && a.vitrage === 'aucun') per = 'jonction_panneau';
  else if (spec.kind === 'produit' && keys === 'article') {
    per = 'produit';
    trigger = String(a.article);
  }
  if (!per) return null;
  if (per === 'produit') return { per, trigger };
  const c = t.counts[per]?.value;
  return c !== undefined && c !== null && c === countMotif(t, spec).value ? { per } : null;
}

export interface MotifVariant {
  spec: MotifSpec;
  /** occurrences sur ce chantier */
  count: number;
  ids: string[];
  label: string;
  /** trait retiré par rapport au motif commun (variante plus générale) */
  dropped?: string;
}

export interface Generalization {
  /** les exemples ne sont pas du même genre : on ne peut pas les réunir */
  error?: string;
  /** traits communs à tous les exemples */
  common: MotifSpec | null;
  /** du plus précis au plus général ; le premier = le motif commun */
  variants: MotifVariant[];
}

/** Ce que les exemples montrés ont en commun, puis les variantes plus générales (un trait retiré à la fois). */
export function generalize(examples: readonly TElement[], t: Topology, catalogue?: ReadonlyMap<string, CatalogueItem>): Generalization {
  if (!examples.length) return { common: null, variants: [] };
  const kinds = [...new Set(examples.map((e) => e.kind))];
  if (kinds.length > 1)
    return { error: `Les éléments montrés ne sont pas du même genre (${kinds.map((k) => KIND_LABEL[k][1]).join(', ')}) : en montrer d’un seul genre à la fois.`, common: null, variants: [] };
  const kind = kinds[0];
  const attrs: Record<string, AttrValue> = {};
  for (const [k, v] of Object.entries(examples[0].attrs)) if (examples.every((e) => e.attrs[k] === v)) attrs[k] = v;
  const common: MotifSpec = { kind, attrs };
  const els = topologyElements(t, catalogue);
  const variant = (spec: MotifSpec, dropped?: string): MotifVariant => {
    const c = countMotif(t, spec, null, catalogue, els);
    return { spec, count: c.value, ids: c.ids, label: describeMotif(spec), ...(dropped ? { dropped } : {}) };
  };
  const out: MotifVariant[] = [variant(common)];
  const seen = new Set([motifKey(common)]);
  for (const k of sortKeys(kind, Object.keys(attrs))) {
    const rest = { ...attrs };
    delete rest[k];
    const spec = { kind, attrs: rest };
    if (seen.has(motifKey(spec))) continue;
    seen.add(motifKey(spec));
    out.push(variant(spec, k));
  }
  const bare = { kind, attrs: {} };
  if (!seen.has(motifKey(bare))) out.push(variant(bare));
  // à égalité de compte, le motif le plus court (le plus simple à lire) passe devant la variante générale
  const [first, ...rest] = out;
  return { common, variants: [first, ...rest.sort((a, b) => a.count - b.count || Object.keys(b.spec.attrs).length - Object.keys(a.spec.attrs).length)] };
}

/** Deux panneaux voisins montrés → leur jonction (élément « voisins »), sinon null. */
export function neighbourPair(a: TElement, b: TElement, all: readonly TElement[]): TElement | null {
  if (a.kind !== 'panneau' || b.kind !== 'panneau') return null;
  return all.find((e) => e.kind === 'voisins' && (e.id === `${a.id}|${b.id}` || e.id === `${b.id}|${a.id}`)) ?? null;
}

/** Valeurs montrables d'un trait sur cette topologie (liste des choix, aussi envoyée à l'IA). */
export function attrChoices(elements: readonly TElement[]): Record<MotifKind, Record<string, string[]>> {
  const out = {} as Record<MotifKind, Record<string, string[]>>;
  for (const k of Object.keys(ATTRS) as MotifKind[]) {
    out[k] = {};
    for (const [a, def] of Object.entries(ATTRS[k])) out[k][a] = Object.keys(def.values);
  }
  for (const e of elements)
    for (const [a, v] of Object.entries(e.attrs)) {
      const list = (out[e.kind][a] ??= []);
      if (!list.includes(String(v))) list.push(String(v));
    }
  return out;
}

/** Valeur d'un trait lue dans un texte (« true » → true) selon le genre. */
export function parseAttr(kind: MotifKind, key: string, v: string): AttrValue | null {
  const def = ATTRS[kind]?.[key];
  if (!def) return null;
  if (v === 'true' || v === 'false') return v === 'true';
  return v;
}
