// Bibliothèque effective = base de départ du module (library/seed.ts) + entrées enregistrées en base
// (table struct_library_items). Une entrée enregistrée de même genre + clé remplace celle de la base (jamais
// l'inverse : ce qu'un utilisateur a confirmé n'est jamais écrasé par une mise à jour du module). Fonctions pures.
import type { LibraryEntry, LibraryKind, LibraryMatch, PartAssignment, PartTypeEntry } from './library';
import type { PartType } from './recognition';

/** Ligne de la table telle que renvoyée par GET /structure/library. */
export interface ServerLibraryRow {
  id: string;
  kind: LibraryKind;
  key: string;
  name: string;
  data: Record<string, unknown>;
  source: string | null;
  keyStructRef: string | null;
  keyArticle: string | null;
  keyDefinition: string | null;
  keyFingerprint: string | null;
  keyModuleType: string | null;
  disabled: boolean;
  confirmedBy: string | null;
  confirmedAt: string | null;
}

/** Corps envoyé à POST /structure/library. */
export interface LibraryPayload {
  kind: LibraryKind;
  key: string;
  name: string;
  data: Record<string, unknown>;
  match: LibraryMatch;
  source: string;
  disabled?: boolean;
}

const matchOf = (r: ServerLibraryRow): LibraryMatch => {
  const m: LibraryMatch = {};
  if (r.keyStructRef) m.structRef = r.keyStructRef;
  if (r.keyArticle) m.articleRef = r.keyArticle;
  if (r.keyDefinition) m.definition = r.keyDefinition;
  if (r.keyFingerprint) m.fingerprint = r.keyFingerprint;
  if (r.keyModuleType) m.moduleType = r.keyModuleType;
  return m;
};

export function fromServer(r: ServerLibraryRow, seedKeys: ReadonlySet<string>): LibraryEntry {
  const data = (r.data ?? {}) as Partial<LibraryEntry>;
  return {
    ...(data as object),
    kind: r.kind,
    key: r.key,
    name: r.name,
    status: (data.status as LibraryEntry['status']) ?? 'known',
    source: Array.isArray(data.source) ? data.source : [{ ref: r.source ?? 'user' }],
    match: matchOf(r),
    disabled: r.disabled,
    origin: seedKeys.has(`${r.kind}:${r.key}`) ? 'override' : 'user',
    id: r.id,
    confirmedAt: r.confirmedAt ?? undefined,
  } as LibraryEntry;
}

export function mergeLibrary(seed: LibraryEntry[], rows: ServerLibraryRow[]): LibraryEntry[] {
  const seedKeys = new Set(seed.map((e) => `${e.kind}:${e.key}`));
  const out = new Map<string, LibraryEntry>(seed.map((e) => [`${e.kind}:${e.key}`, { ...e, origin: 'seed' as const }]));
  for (const r of rows) out.set(`${r.kind}:${r.key}`, fromServer(r, seedKeys));
  return [...out.values()];
}

/** Entrée → corps d'enregistrement (les clés de correspondance vont dans leurs colonnes). */
export function toPayload(e: LibraryEntry, source = 'user'): LibraryPayload {
  const { kind, key, name, match, disabled, origin: _o, id: _i, confirmedAt: _c, ...data } = e;
  void _o;
  void _i;
  void _c;
  return { kind, key, name, data: data as Record<string, unknown>, match: match ?? {}, source, disabled };
}

/** Clé d'une entrée de type de pièce créée depuis la reconnaissance (stable pour une même signature). */
export function partTypeKey(t: Pick<PartType, 'key'>): string {
  let h = 2166136261;
  for (let i = 0; i < t.key.length; i++) h = Math.imul(h ^ t.key.charCodeAt(i), 16777619) >>> 0;
  return `PT-${h.toString(36).toUpperCase()}`;
}

/** Entrée de bibliothèque qui mémorise la réponse donnée pour un type reconnu. */
export function partTypeEntry(t: PartType, assignment: PartAssignment, name: string): PartTypeEntry {
  return {
    kind: 'part_type',
    key: partTypeKey(t),
    name,
    status: 'known',
    source: [{ ref: 'user', note: `confirmé depuis la reconnaissance (${t.nodeIds.length} instance(s))` }],
    match: { ...t.signature },
    assignment,
    triangles: t.fingerprint?.triangles,
    category: t.category,
  };
}
