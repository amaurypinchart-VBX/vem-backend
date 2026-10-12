// manifest.json exporté par l'extension SketchUp viewbox_prep (repère SketchUp : Z vers le haut, mm).
// Le .dae perd les balises (tags) SketchUp et SketchUp y modifie les noms (espaces, "#", ":"…) : le
// manifest est la source de vérité pour les catégories, désignations et noms d'origine. Pendant
// l'export, l'extension donne à chaque objet un nom technique unique (exportName, ex. "VBXE-12") qui
// sert de clé de correspondance, puis rétablit les noms du modèle.
import type { BBox, Category } from './types';
import { categoryKey, normalizeName } from './classification';

export interface ManifestBBox {
  min: [number, number, number];
  max: [number, number, number];
}

export interface ManifestEntry {
  /** nom technique dans le .dae (clé de correspondance) */
  exportName?: string;
  /** nom d'instance d'origine dans SketchUp */
  name: string;
  category?: string | null;
  /** 'manuel' = choisi par l'utilisateur dans SketchUp ; sinon balise / nom / définition */
  categorySource?: string | null;
  /** désignation libre saisie dans SketchUp */
  label?: string | null;
  tag?: string;
  definition?: string;
  articleRef?: string | null;
  materials?: string[];
  bboxWorld?: ManifestBBox;
}

export interface ManifestModule {
  id: string;
  definition?: string;
  tag?: string;
  level?: number;
  /** type de Viewbox saisi dans SketchUp */
  type?: string | null;
  /** dimensions nominales en plan [long, court] saisies dans SketchUp */
  nominalPlanMm?: [number, number] | null;
  transform?: number[];
  bboxWorld?: ManifestBBox;
  accessories?: ManifestEntry[];
  /** Viewbox modifiée, saisie dans SketchUp (« Structure… ») : seulement les valeurs différentes du standard */
  structParams?: StructParams | null;
  /** structure dessinée dans le composant (clé de `Manifest.structures`, extension ≥ 1.3.0) */
  structureRef?: string | null;
  /** choix « Structure » du type : gabarit Viewbox standard / dessinée dans ce composant */
  structSource?: 'template' | 'drawn' | null;
}

/** Barre relevée par l'extension (≥ 1.3.0) dans le repère de la définition du module (mm, Z vers le haut). */
export interface ManifestFrameMember {
  id: string;
  name?: string;
  definition?: string;
  /** extrémités de l'axe ; la coupe est centrée sur cet axe */
  a: [number, number, number];
  b: [number, number, number];
  /** axe y de la coupe (unitaire) ; z de la coupe = axe × yRef */
  yRef: [number, number, number];
  /** coupe au milieu de la barre : contour puis trous, en (y, z) autour de l'axe (mm) */
  loops: Array<Array<[number, number]>>;
  /** rôle saisi dans SketchUp ou proposé par la géométrie (`roleSource`) */
  role?: string;
  roleSource?: string;
  /** section saisie (ou lue dans le nom) : clé VEM « CAT-… » */
  section?: string;
  grade?: string;
  materials?: string[];
}

export interface ManifestStructure {
  v: number;
  source: 'sketchup';
  axes: 'definition';
  bounds?: ManifestBBox;
  members: ManifestFrameMember[];
  warnings: string[];
}

const vec3 = (v: unknown): [number, number, number] | null =>
  Array.isArray(v) && v.length === 3 && v.every((x) => typeof x === 'number' && Number.isFinite(x)) ? [v[0], v[1], v[2]] : null;

/**
 * Lecture tolérante des structures dessinées (extension ≥ 1.3.0) : une barre invalide est ignorée, une structure sans
 * barre aussi ; champ absent (extension ≤ 1.2) = pas de structure (VEM relève alors les maillages).
 */
export function cleanStructures(raw: unknown): Record<string, ManifestStructure> {
  const out: Record<string, ManifestStructure> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [name, s] of Object.entries(raw as Record<string, unknown>)) {
    if (!s || typeof s !== 'object') continue;
    const r = s as Record<string, unknown>;
    const members: ManifestFrameMember[] = [];
    for (const m of Array.isArray(r.members) ? r.members : []) {
      if (!m || typeof m !== 'object') continue;
      const x = m as Record<string, unknown>;
      const a = vec3(x.a);
      const b = vec3(x.b);
      const y = vec3(x.yRef);
      const loops = Array.isArray(x.loops)
        ? (x.loops as unknown[])
            .map((l) => (Array.isArray(l) ? (l as unknown[]).filter((p): p is [number, number] => Array.isArray(p) && p.length === 2 && p.every((q) => typeof q === 'number' && Number.isFinite(q))) : []))
            .filter((l) => l.length >= 3)
        : [];
      if (!a || !b || !y || !loops.length) continue;
      const str = (k: string) => (typeof x[k] === 'string' && (x[k] as string).trim() ? (x[k] as string).trim() : undefined);
      const mem: ManifestFrameMember = { id: str('id') ?? `B${members.length + 1}`, a, b, yRef: y, loops };
      for (const k of ['name', 'definition', 'role', 'roleSource', 'section', 'grade'] as const) {
        const v = str(k);
        if (v) mem[k] = v;
      }
      if (Array.isArray(x.materials)) mem.materials = (x.materials as unknown[]).filter((v): v is string => typeof v === 'string').slice(0, 20);
      members.push(mem);
    }
    if (!members.length) continue;
    const bb = r.bounds as { min?: unknown; max?: unknown } | undefined;
    const min = vec3(bb?.min);
    const max = vec3(bb?.max);
    out[name] = {
      v: 1,
      source: 'sketchup',
      axes: 'definition',
      ...(min && max ? { bounds: { min, max } } : {}),
      members,
      warnings: Array.isArray(r.warnings) ? (r.warnings as unknown[]).filter((w): w is string => typeof w === 'string').slice(0, 50) : [],
    };
  }
  return out;
}

/** Familles de barres de la Viewbox modifiables depuis SketchUp (mêmes clés que l'étude structure). */
export const STRUCT_SLOTS = ['rim-floor', 'rim-roof', 'secondary-floor', 'secondary-roof', 'column'] as const;
export type StructSlot = (typeof STRUCT_SLOTS)[number];

/** Paramètres de structure d'une instance de Viewbox (attribut d'instance `viewbox_struct` de l'extension). */
export interface StructParams {
  v?: number;
  /** haut de la Viewbox = hauteur des poteaux (mm) */
  topZ?: number;
  /** section par famille de barres : clé de la bibliothèque ou du catalogue (« CAT-UPN160 ») */
  sections?: Partial<Record<StructSlot, string>>;
  /** nuance par famille de barres (S235, S275, S355) */
  grades?: Partial<Record<StructSlot, string>>;
  /** épaisseur du contreplaqué du plancher (mm) */
  plywood?: number;
}

/** Lecture tolérante des paramètres de structure (champ absent ou invalide = Viewbox standard). */
export function cleanStructParams(raw: unknown): StructParams | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const out: StructParams = {};
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && Number.isFinite(parseFloat(v)) ? parseFloat(v) : undefined);
  const topZ = num(r.topZ);
  if (topZ && topZ > 0) out.topZ = Math.round(topZ);
  const ply = num(r.plywood);
  if (ply && ply > 0) out.plywood = Math.round(ply);
  for (const k of ['sections', 'grades'] as const) {
    const m = r[k];
    if (!m || typeof m !== 'object') continue;
    const o: Partial<Record<StructSlot, string>> = {};
    for (const slot of STRUCT_SLOTS) {
      const v = (m as Record<string, unknown>)[slot];
      if (typeof v === 'string' && v.trim() && v !== 'gabarit') o[slot] = v.trim();
    }
    if (Object.keys(o).length) out[k] = o;
  }
  return Object.keys(out).length ? { v: 1, ...out } : null;
}

export interface Manifest {
  schema: string;
  /** version des paramètres de structure (`structParams` des modules) */
  structSchemaVersion?: number;
  /** version des structures dessinées (`structures`, extension ≥ 1.3.0) */
  frameSchemaVersion?: number;
  /** structure dessinée par définition de module (barres relevées par l'extension) */
  structures?: Record<string, unknown>;
  source?: { file?: string; sketchupVersion?: string; exportedAt?: string; extensionVersion?: string };
  units?: string;
  upAxis?: string;
  modules: ManifestModule[];
  common?: ManifestEntry[];
  context?: ManifestEntry[];
}

export function parseManifest(text: string): Manifest {
  const data = JSON.parse(text) as Partial<Manifest>;
  if (!data || typeof data !== 'object' || !String(data.schema ?? '').startsWith('viewbox-manifest/')) {
    throw new Error('manifest.json invalide (champ "schema" viewbox-manifest/… absent)');
  }
  if (data.units && data.units !== 'mm') throw new Error(`manifest.json : unités "${data.units}" non gérées (attendu "mm")`);
  return { ...data, modules: Array.isArray(data.modules) ? data.modules : [] } as Manifest;
}

/** Catégorie du manifest (intégrée ou personnalisée) ; null si vide. */
export function asCategory(value: string | null | undefined): Category | null {
  if (!value) return null;
  const k = categoryKey(value);
  return k || null;
}

/**
 * Clé de comparaison d'un nom entre SketchUp et le .dae : SketchUp remplace à l'export les caractères
 * autres que lettres/chiffres/"-" par "_" et préfixe d'un "_" les noms commençant par un chiffre.
 */
export function daeNameKey(name: string): string {
  return normalizeName(name).replace(/[^A-Z0-9-]+/g, '_').replace(/^_+/, '').replace(/_+$/, '');
}

/** Boîte SketchUp (Z-up) → boîte interne (Y-up) : (x, y, z) → (x, z, -y). */
export function manifestBBoxToYUp(b: ManifestBBox): BBox {
  return [b.min[0], b.min[2], 0 - b.max[1], b.max[0], b.max[2], 0 - b.min[1]];
}

export function bboxClose(a: BBox, b: BBox, toleranceMm: number): boolean {
  for (let i = 0; i < 6; i++) if (Math.abs(a[i] - b[i]) > toleranceMm) return false;
  return true;
}

/** Recherche rapide de nœuds par boîte englobante (tolérance en mm), via des cases de 1 mm sur minX. */
export class BBoxLookup<T> {
  private buckets = new Map<number, Array<{ box: BBox; value: T }>>();
  constructor(private toleranceMm: number) {}
  add(box: BBox, value: T): void {
    const k = Math.round(box[0]);
    let list = this.buckets.get(k);
    if (!list) this.buckets.set(k, (list = []));
    list.push({ box, value });
  }
  find(box: BBox): T | null {
    const k = Math.round(box[0]);
    const span = Math.ceil(this.toleranceMm);
    for (let d = -span; d <= span; d++) {
      for (const e of this.buckets.get(k + d) ?? []) if (bboxClose(e.box, box, this.toleranceMm)) return e.value;
    }
    return null;
  }
}
