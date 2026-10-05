// Reconnaissance des pièces (§5) : chaque Viewbox et chaque pièce du modèle est rangée dans un type (signature), et
// chaque type reçoit un statut — connu (réponse de l'utilisateur ou de la bibliothèque), proposé (empreinte ou
// catégorie du classement : à confirmer), inconnu (bloquant : le verdict reste « incomplet ») ou ignoré. Les pièces
// propres à une Viewbox (structure, plancher, toiture, pieds de son composant) sont comprises dans son gabarit.
// Fonctions pures : l'empreinte géométrique (boîte orientée) est calculée à part, à partir de la scène 3D.
import type { NodeInfo, SceneIndex } from '../../core/types';
import type { SceneLookup } from '../../core/subset';
import type { LibraryEntry, LibraryMatch, ModuleTypeEntry, PartAssignment, PartTypeEntry } from './library';
import { TEMPLATE_NATURES } from './library';
import type { Fingerprint } from './signature';
import { fingerprintKey, itemTypeKey, moduleTypeKey, roundDims, trianglesClose, typeLabel } from './signature';

export type RecognitionStatus = 'known' | 'suggested' | 'unknown' | 'ignored';

export const STATUS_COLOR: Record<RecognitionStatus, number> = { known: 0x22c55e, suggested: 0xf59e0b, unknown: 0xef4444, ignored: 0x9ca3af };
export const STATUS_LABEL: Record<RecognitionStatus, string> = { known: 'connu', suggested: 'proposé — à confirmer', unknown: 'inconnu', ignored: 'ignoré' };

/** Réponse enregistrée dans l'étude pour un type (portée : ce modèle, ou tout le projet). */
export interface StoredAssignment {
  assignment: PartAssignment;
  scope: 'model' | 'project';
  at: string;
  by?: string;
}
export type Assignments = Record<string, StoredAssignment>;

export interface PartType {
  key: string;
  kind: 'module' | 'item';
  label: string;
  category: string | null;
  /** nœuds des instances (pièces) ou des Viewbox */
  nodeIds: string[];
  moduleIds: string[];
  sample?: NodeInfo;
  fingerprint?: Fingerprint;
  /** clés à mémoriser dans la bibliothèque pour reconnaître ce type ailleurs */
  signature: LibraryMatch;
  status: RecognitionStatus;
  source: 'local' | 'library' | 'fingerprint' | 'proposal' | 'none';
  assignment?: PartAssignment;
  libraryEntry?: PartTypeEntry;
  reason: string;
}

export interface Recognition {
  types: PartType[];
  /** pièces comprises dans le gabarit d'une Viewbox : nœud → Viewbox */
  templateParts: Map<string, string>;
  counts: Record<RecognitionStatus, number>;
  /** couleur de surcouche par nœud (pièces et Viewbox) */
  colors: Map<string, number>;
  /** types inconnus : le verdict ne peut pas être « passe » */
  blocking: number;
}

export interface RecognitionInput {
  index: SceneIndex;
  look: Pick<SceneLookup, 'categoryOf'>;
  /** dimensions de la boîte orientée de chaque pièce (mm) ; sinon boîte englobante du monde */
  geometry?: ReadonlyMap<string, ArrayLike<number>>;
  library: LibraryEntry[];
  assignments: Assignments;
  /** catégories « accessoire de façade » (personnalisées comprises) */
  accessoryCategories?: ReadonlySet<string>;
}

/** Catégories des pièces propres au composant Viewbox, comprises dans son gabarit. */
export const TEMPLATE_CATEGORIES: ReadonlySet<string> = new Set(['STRUCTURE', 'PLANCHER', 'TOIT', 'PIED']);

/**
 * Composant Viewbox entier (le corps du module, classé d'un seul bloc : « 7-962-016 VIEWBOX STANDARD… ») : sa boîte a
 * la longueur et la largeur du module (± 150 mm) et toute sa hauteur (≥ 2 m). Il est compris dans le gabarit de sa
 * Viewbox, comme ses rives, planchers et pieds ; un mur (épais de quelques cm) ou un plancher ne le sont pas par ce test.
 */
export function isViewboxBody(dims: ArrayLike<number>, expected: { long: number; short: number }): boolean {
  const d = roundDims(dims);
  const iL = d.findIndex((x) => Math.abs(x - expected.long) <= 150);
  if (iL < 0) return false;
  const rest = d.filter((_, k) => k !== iL);
  const iS = rest.findIndex((x) => Math.abs(x - expected.short) <= 150);
  if (iS < 0) return false;
  return rest[1 - iS] >= 2000;
}

const kgPerM = (kNperM: number) => Math.round((kNperM * 1000) / 9.81);

/** Proposition par catégorie du classement (toujours à confirmer). Valeurs de charge : annexe B. */
export function proposeFor(category: string | null, accessory: boolean): { assignment: PartAssignment; reason: string } | null {
  if (!category) return null;
  if (category.startsWith('VITRE'))
    return { assignment: { role: 'load', nature: 'glazing', windClosed: true, weight: { value: kgPerM(1.75), unit: 'kg/m' } }, reason: 'catégorie vitrage : 1,75 kN/m, face fermée au vent' };
  if (category === 'MUR-LEGER' || category === 'MUR-LOURD')
    return { assignment: { role: 'load', nature: 'wall', windClosed: true, weight: { value: kgPerM(0.5), unit: 'kg/m' } }, reason: 'catégorie mur : 0,50 kN/m, face fermée au vent' };
  if (category.startsWith('PORTE'))
    return { assignment: { role: 'load', nature: 'door', windClosed: true, weight: { value: kgPerM(0.5), unit: 'kg/m' } }, reason: 'catégorie porte : 0,50 kN/m, face fermée au vent' };
  if (category === 'GARDE-CORPS')
    return { assignment: { role: 'load', nature: 'railing', windClosed: false, weight: { value: kgPerM(0.1), unit: 'kg/m' } }, reason: 'catégorie garde-corps : 0,10 kN/m, non habillé' };
  if (category === 'ESCALIER') return { assignment: { role: 'structural', nature: 'stair' }, reason: 'catégorie escalier : gabarit escalier de la bibliothèque' };
  if (category === 'TERRASSE' || category === 'TERRACE') return { assignment: { role: 'structural', nature: 'terrace' }, reason: 'catégorie terrasse : élément terrasse 5,9 × 2,5 m (statico 18-0573 § 3.5)' };
  if (category === 'STRUCTURE') return { assignment: { role: 'structural', nature: 'beam' }, reason: 'catégorie structure : pièce porteuse hors Viewbox' };
  if (accessory) return { assignment: { role: 'load', nature: 'other', windClosed: true, weight: { value: kgPerM(0.5), unit: 'kg/m' } }, reason: 'accessoire de façade : 0,50 kN/m, face fermée au vent' };
  return null;
}

/** Donnée encore nécessaire au calcul (null = rien ne manque). */
export function missingData(a: PartAssignment, templates: ReadonlyMap<string, ModuleTypeEntry>, kind: 'module' | 'item' = 'module'): string | null {
  if (a.role === 'ignored' || a.role === 'wind') return null;
  // pièce du modèle qui est la Viewbox elle-même : calculée par le gabarit de sa Viewbox (type de module)
  if (a.nature === 'viewbox' && kind === 'item') return null;
  if (a.nature === 'viewbox') {
    const t = a.moduleTemplate ? templates.get(a.moduleTemplate) : undefined;
    if (!t) return 'gabarit de Viewbox à choisir';
    if (t.status === 'unknown' || !t.template) return `${t.name} : données de structure inconnues`;
    return null;
  }
  if (a.role === 'structural' && !TEMPLATE_NATURES.has(a.nature) && !a.section) return 'section à renseigner';
  if (a.role === 'load' && !a.weight) return 'poids à renseigner';
  return null;
}

const ORDER: RecognitionStatus[] = ['unknown', 'suggested', 'known', 'ignored'];

export function recognize(input: RecognitionInput): Recognition {
  const { index, look } = input;
  const lib = input.library.filter((e) => !e.disabled);
  const parts = lib.filter((e): e is PartTypeEntry => e.kind === 'part_type');
  const templates = new Map(lib.filter((e): e is ModuleTypeEntry => e.kind === 'module_type').map((e) => [e.key, e]));
  const types: PartType[] = [];

  const resolve = (t: Omit<PartType, 'status' | 'source' | 'reason'>, proposal: { assignment: PartAssignment; reason: string } | null, fpKey?: string, triangles?: number): PartType => {
    const local = input.assignments[t.key];
    let out: PartType;
    const exact = parts.find(
      (e) =>
        (e.match?.structRef && e.match.structRef === t.signature.structRef) ||
        (e.match?.articleRef && e.match.articleRef === t.signature.articleRef) ||
        (e.match?.definition && e.match.definition === t.signature.definition) ||
        (e.match?.moduleType && e.match.moduleType === t.signature.moduleType),
    );
    const probable = !exact && fpKey ? parts.find((e) => e.match?.fingerprint === fpKey && trianglesClose(e.triangles ?? 0, triangles ?? 0)) : undefined;
    if (local) out = { ...t, status: 'known', source: 'local', assignment: local.assignment, reason: local.scope === 'project' ? 'réponse donnée pour ce projet' : 'réponse donnée pour ce modèle' };
    else if (exact) out = { ...t, status: 'known', source: 'library', assignment: exact.assignment, libraryEntry: exact, reason: `bibliothèque : ${exact.name}` };
    else if (probable)
      out = { ...t, status: 'suggested', source: 'fingerprint', assignment: probable.assignment, libraryEntry: probable, reason: `ressemble à « ${probable.name} » (même empreinte)` };
    else if (proposal) out = { ...t, status: 'suggested', source: 'proposal', assignment: proposal.assignment, reason: proposal.reason };
    else out = { ...t, status: 'unknown', source: 'none', reason: 'inconnu : à renseigner' };
    if (out.assignment) {
      if (out.assignment.role === 'ignored' && out.status === 'known') out.status = 'ignored';
      const missing = missingData(out.assignment, templates, t.kind);
      if (missing) out = { ...out, status: 'unknown', reason: missing };
    }
    return out;
  };

  // ─── Viewbox : un type par type saisi dans SketchUp, sinon par taille nominale ───
  const byModuleType = new Map<string, SceneIndex['modules']>();
  for (const m of index.modules) {
    const k = moduleTypeKey(m);
    if (!byModuleType.has(k)) byModuleType.set(k, []);
    byModuleType.get(k)!.push(m);
  }
  for (const [key, mods] of byModuleType) {
    const m0 = mods[0];
    const template = [...templates.values()].find((t) => Math.abs(t.nominal.long - m0.expected.long) <= 50 && Math.abs(t.nominal.short - m0.expected.short) <= 50 && t.template !== 'viewbox-us');
    const proposal = template
      ? { assignment: { role: 'structural' as const, nature: 'viewbox' as const, moduleTemplate: template.key }, reason: `dimensions ${m0.expected.long} × ${m0.expected.short} : ${template.name}` }
      : null;
    types.push(
      resolve(
        {
          key,
          kind: 'module',
          label: m0.type ?? m0.expected.label ?? typeLabel(key),
          category: null,
          nodeIds: mods.map((m) => m.nodeId),
          moduleIds: mods.map((m) => m.id),
          sample: index.nodes.find((n) => n.id === m0.nodeId),
          signature: { moduleType: key },
        },
        proposal,
      ),
    );
  }

  // ─── pièces ───
  const templateParts = new Map<string, string>();
  const byItemType = new Map<string, { nodes: NodeInfo[]; fp: Fingerprint }>();
  const moduleById = new Map(index.modules.map((m) => [m.id, m]));
  for (const n of index.nodes) {
    if (n.role !== 'item') continue;
    const c = look.categoryOf(n.id);
    if (n.moduleId && n.assignment === 'hierarchy' && c && TEMPLATE_CATEGORIES.has(c)) {
      templateParts.set(n.id, n.moduleId);
      continue;
    }
    const g = input.geometry?.get(n.id);
    const b = n.bboxMm;
    const dims = g ?? (b ? [b[3] - b[0], b[4] - b[1], b[5] - b[2]] : [0, 0, 0]);
    const mod = n.moduleId ? moduleById.get(n.moduleId) : undefined;
    if (mod && !(c && input.accessoryCategories?.has(c)) && isViewboxBody(dims, mod.expected)) {
      templateParts.set(n.id, mod.id);
      continue;
    }
    const fp: Fingerprint = { dims: roundDims(dims), materials: n.materialNames ?? [], category: c, triangles: n.triangles };
    const key = itemTypeKey(n, fp);
    const e = byItemType.get(key);
    if (e) e.nodes.push(n);
    else byItemType.set(key, { nodes: [n], fp });
  }
  for (const [key, { nodes, fp }] of byItemType) {
    const n0 = nodes[0];
    const c = fp.category;
    const fpKey = fingerprintKey(fp);
    const signature: LibraryMatch = { fingerprint: fpKey };
    if (key.startsWith('ref:')) signature.structRef = key;
    else if (key.startsWith('art:')) signature.articleRef = key.slice(4);
    else if (key.startsWith('def:') || key.startsWith('name:')) signature.definition = key;
    types.push(
      resolve(
        {
          key,
          kind: 'item',
          label: typeLabel(key, n0),
          category: c,
          nodeIds: nodes.map((n) => n.id),
          moduleIds: [...new Set(nodes.map((n) => n.moduleId).filter((x): x is string => !!x))],
          sample: n0,
          fingerprint: fp,
          signature,
        },
        proposeFor(c, !!c && !!input.accessoryCategories?.has(c)),
        fpKey,
        fp.triangles,
      ),
    );
  }

  types.sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status) || Number(b.kind === 'module') - Number(a.kind === 'module') || b.nodeIds.length - a.nodeIds.length || a.label.localeCompare(b.label));

  // ─── couleurs de la vue 3D ───
  const colors = new Map<string, number>();
  const moduleStatus = new Map<string, RecognitionStatus>();
  for (const t of types) {
    for (const id of t.nodeIds) colors.set(id, STATUS_COLOR[t.status]);
    if (t.kind === 'module') for (const m of t.moduleIds) moduleStatus.set(m, t.status);
  }
  for (const [nodeId, moduleId] of templateParts) colors.set(nodeId, STATUS_COLOR[moduleStatus.get(moduleId) ?? 'unknown']);

  const counts: Record<RecognitionStatus, number> = { known: 0, suggested: 0, unknown: 0, ignored: 0 };
  for (const t of types) counts[t.status]++;
  return { types, templateParts, counts, colors, blocking: counts.unknown };
}
