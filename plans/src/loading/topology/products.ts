// Comptage des produits visibles dans la 3D : une ligne par référence, une unité par pose (instance), doublons miroir
// écartés (même réf. + même boîte monde à 5 mm : définitions miroir en double, cas glasswall Klokgebouw). Une pièce sans
// référence est reconnue par sa signature (même mécanique que l'Étude structure : art: → def: → name:|fp → geo:) :
// réponse de cette liste, puis mémoire « Qu'est-ce que c'est ? », sinon « À identifier ». Fonctions pures.
import type { NodeInfo, SceneIndex } from '../../core/types';
import type { CatalogueItem } from '../core/types';
import type { Fingerprint } from '../../structure/core/signature';
import { itemTypeKey, roundDims, typeLabel } from '../../structure/core/signature';
import type { ProductLine, UnknownProduct } from './types';

/** Réponse « Qu'est-ce que c'est ? » : une réf. catalogue, ou « pas un produit » (décor, contexte…). */
export type ProductAnswer = string | 'ignore';
export type ProductAnswers = Record<string, ProductAnswer>;

export function fingerprintOf(n: NodeInfo): Fingerprint {
  const b = n.bboxMm;
  return {
    dims: b ? roundDims([b[3] - b[0], b[4] - b[1], b[5] - b[2]]) : [0, 0, 0],
    materials: n.materialNames ?? [],
    category: n.category,
    triangles: n.triangles,
  };
}

/** Signature d'une pièce (clé de la mémoire des produits). */
export const productSignature = (n: NodeInfo) => itemTypeKey(n, fingerprintOf(n));

const sameBox = (a: NodeInfo, b: NodeInfo, tol = 5) =>
  !!a.bboxMm && !!b.bboxMm && a.bboxMm.every((v, i) => Math.abs(v - b.bboxMm![i]) <= tol);

/** Écarte les doublons miroir d'un groupe de pièces de même référence : garde la première de chaque boîte. */
export function dedupeMirrors(nodes: NodeInfo[]): { kept: NodeInfo[]; mirrors: NodeInfo[] } {
  const kept: NodeInfo[] = [];
  const mirrors: NodeInfo[] = [];
  for (const n of nodes) (kept.some((k) => sameBox(k, n)) ? mirrors : kept).push(n);
  return { kept, mirrors };
}

/** Pièces de la box elle-même (cadre, pieds, plancher, toit dans le composant de la Viewbox) : livrées avec la box. */
const BOX_PART_CATEGORIES = new Set(['STRUCTURE', 'PLANCHER', 'TOIT', 'PIED']);
export const isBoxPart = (n: NodeInfo) => !n.articleRef && n.assignment === 'hierarchy' && !!n.category && BOX_PART_CATEGORIES.has(n.category);

export interface ProductCount {
  lines: ProductLine[];
  unknown: UnknownProduct[];
  /** nœud → réf. retenue (pièces comptées, miroirs exclus) */
  articleOf: Map<string, string>;
  /** pièces écartées comme doublons miroir */
  mirrorIds: Set<string>;
  ignored: string[];
  /** pièces sans référence qui font partie d'une box (livrées avec elle) */
  boxParts: string[];
}

export function countProducts(
  index: SceneIndex,
  catalogue: ReadonlyMap<string, CatalogueItem>,
  answers: ProductAnswers = {},
  memory: Readonly<Record<string, string>> = {},
): ProductCount {
  const items = index.nodes.filter((n) => n.role === 'item');
  const byArticle = new Map<string, { nodes: NodeInfo[]; source: ProductLine['source'] }>();
  const unknown = new Map<string, NodeInfo[]>();
  const ignored: string[] = [];
  const boxParts: string[] = [];
  for (const n of items) {
    if (isBoxPart(n)) {
      boxParts.push(n.id);
      continue;
    }
    const sig = productSignature(n);
    let article = n.articleRef;
    let source: ProductLine['source'] = 'modele';
    if (!article) {
      const a = answers[sig];
      if (a === 'ignore') {
        ignored.push(n.id);
        continue;
      }
      if (a) [article, source] = [a, 'reponse'];
      else if (memory[sig]) [article, source] = [memory[sig], 'memoire'];
    }
    if (!article) {
      unknown.set(sig, [...(unknown.get(sig) ?? []), n]);
      continue;
    }
    const g = byArticle.get(article) ?? { nodes: [], source };
    g.nodes.push(n);
    if (source !== 'modele') g.source = source;
    byArticle.set(article, g);
  }
  const lines: ProductLine[] = [];
  const articleOf = new Map<string, string>();
  const mirrorIds = new Set<string>();
  for (const [article, g] of byArticle) {
    const { kept, mirrors } = dedupeMirrors(g.nodes);
    for (const k of kept) articleOf.set(k.id, article);
    for (const m of mirrors) mirrorIds.add(m.id);
    lines.push({
      article,
      qty: kept.length,
      nodeIds: kept.map((k) => k.id),
      mirrorIds: mirrors.map((m) => m.id),
      source: g.source,
      inCatalogue: catalogue.has(article),
    });
  }
  lines.sort((a, b) => (a.article < b.article ? -1 : 1));
  const unknownList: UnknownProduct[] = [...unknown].map(([signature, nodes]) => {
    const { kept, mirrors } = dedupeMirrors(nodes);
    for (const m of mirrors) mirrorIds.add(m.id);
    return {
      signature,
      label: typeLabel(signature, nodes[0]),
      category: nodes[0].category,
      nodeIds: kept.map((k) => k.id),
      dims: fingerprintOf(nodes[0]).dims,
    };
  });
  return { lines, unknown: unknownList, articleOf, mirrorIds, ignored, boxParts };
}
