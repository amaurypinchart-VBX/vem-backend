// Tâche de nettoyage d'une géométrie, exécutable dans un Worker ou directement (tests).
import { BufferAttribute, BufferGeometry } from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { cleanTriangles } from '../core/geometryClean';
import type { GeometryGroup } from '../core/geometryClean';

type AnyTypedArray = Float32Array | Uint32Array | Uint16Array | Uint8Array | Int8Array | Int16Array | Int32Array;

export interface AttributeData {
  array: AnyTypedArray;
  itemSize: number;
  normalized: boolean;
}

export interface CleanJob {
  id: number;
  attributes: Record<string, AttributeData>;
  index: Uint32Array | null;
  groups: GeometryGroup[];
  /** tolérance de fusion dans les unités LOCALES de la géométrie (0,01 mm ramené à l'échelle) */
  tolerance: number;
}

export interface CleanJobResult {
  id: number;
  attributes: Record<string, AttributeData>;
  index: Uint32Array;
  groups: GeometryGroup[];
  degenerate: number;
  duplicate: number;
  backToBack: number;
}

export function runCleanJob(job: CleanJob): CleanJobResult {
  const g = new BufferGeometry();
  for (const [name, a] of Object.entries(job.attributes)) g.setAttribute(name, new BufferAttribute(a.array, a.itemSize, a.normalized));
  if (job.index) g.setIndex(new BufferAttribute(job.index, 1));
  for (const gr of job.groups) g.addGroup(gr.start, gr.count, gr.materialIndex);

  // Fusion des sommets (0,01 mm) : ne fusionne que des sommets identiques sur TOUS leurs attributs,
  // donc les normales des arêtes vives sont préservées (rendu correct).
  const merged = mergeVertices(g, job.tolerance);
  const pos = merged.getAttribute('position');
  const idx = merged.getIndex();
  const res = cleanTriangles(pos.array as ArrayLike<number>, idx ? (idx.array as ArrayLike<number>) : null, merged.groups as GeometryGroup[], job.tolerance);

  const attributes: Record<string, AttributeData> = {};
  for (const [name, attr] of Object.entries(merged.attributes)) {
    const a = attr as BufferAttribute;
    attributes[name] = { array: a.array as AnyTypedArray, itemSize: a.itemSize, normalized: a.normalized };
  }
  return { id: job.id, attributes, index: res.index, groups: res.groups, degenerate: res.degenerate, duplicate: res.duplicate, backToBack: res.backToBack };
}
