// Signature d'un type de pièce (§5.2) : ce qui fait que deux pièces du modèle sont « la même chose ». Par ordre de
// priorité : référence structure (manifest), référence article ERP, nom de définition SketchUp, nom d'objet (avec
// l'empreinte, pour ne pas confondre deux objets homonymes), empreinte géométrique seule. Deux instances d'une même
// définition ont toujours le même type ; la disposition des pièces n'intervient jamais. Fonctions pures.
import type { ModuleInfo, NodeInfo } from '../../core/types';
import { normalizeName } from '../../core/classification';

/** Noms sans valeur d'identification (objets non nommés dans SketchUp). */
const GENERIC = /^(GROUPE?|GROUP|COMPOSANT|COMPONENT|MESH|OBJE?T|NODE|INSTANCE|SANS[-_ ]?NOM|UNTITLED|VBXE)?[\s#_-]*\d*$/;

/** Nom sans numéro final (« Mur léger 3 », « MUR_LEGER#12 » → « MUR LEGER »). */
export function baseName(name: string): string {
  return normalizeName(name)
    .replace(/[\s#_-]*\d+$/, '')
    .replace(/[_]+/g, ' ')
    .trim();
}

export interface Fingerprint {
  /** dimensions de la boîte orientée triées, arrondies à 5 mm */
  dims: [number, number, number];
  materials: string[];
  category: string | null;
  triangles: number;
}

/** Empreinte en texte (sans les triangles, comparés à ± 5 % séparément). */
export function fingerprintKey(f: Fingerprint): string {
  const mats = [...new Set(f.materials.map((m) => normalizeName(m)))].sort().slice(0, 4).join(',');
  return `${f.dims.join('x')}|${mats || '-'}|${f.category ?? '-'}`;
}

/** Dimensions d'une boîte (mm) → triées décroissantes, arrondies à 5 mm. */
export function roundDims(d: ArrayLike<number>): [number, number, number] {
  return [d[0], d[1], d[2]]
    .map((x) => Math.round(Math.abs(x) / 5) * 5)
    .sort((a, b) => b - a) as [number, number, number];
}

/** Triangles compatibles avec une empreinte mémorisée (± 5 %). */
export const trianglesClose = (a: number, b: number) => Math.abs(a - b) <= 0.05 * Math.max(a, b) + 1;

/** Clé de type d'une pièce (nœud « item » de l'index). */
export function itemTypeKey(n: NodeInfo, fp: Fingerprint, structRef?: string | null): string {
  if (structRef) return `ref:${normalizeName(structRef)}`;
  if (n.articleRef) return `art:${n.articleRef}`;
  if (n.definition) return `def:${normalizeName(n.definition)}`;
  const name = baseName(n.sourceName ?? n.name ?? '');
  if (name && !GENERIC.test(name)) return `name:${name}|${fingerprintKey(fp)}`;
  return `geo:${fingerprintKey(fp)}`;
}

/** Clé de type d'une Viewbox : type saisi dans SketchUp, sinon taille nominale reconnue. */
export function moduleTypeKey(m: ModuleInfo): string {
  if (m.type) return `TYPE:${normalizeName(m.type)}`;
  return `SIZE:${m.expected.long}x${m.expected.short}`;
}

/** Libellé lisible d'une clé de type. */
export function typeLabel(key: string, n?: NodeInfo): string {
  if (n?.label) return n.label;
  const [kind, rest] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)];
  if (kind === 'def' || kind === 'ref') return rest;
  if (kind === 'art') return `Article ${rest}${n ? ` (${n.definition ?? n.name})` : ''}`;
  if (kind === 'name') return rest.split('|')[0];
  if (kind === 'SIZE') return `Viewbox ${rest.replace('x', ' × ')}`;
  if (kind === 'TYPE') return rest;
  const dims = rest.split('|')[0].split('x').map(Number);
  return `Objet sans nom ${dims.map((d) => `${d}`).join(' × ')} mm`;
}
