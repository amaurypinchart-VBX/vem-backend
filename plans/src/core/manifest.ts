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
}

export interface Manifest {
  schema: string;
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
