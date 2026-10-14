// Chemins relatifs dans la définition d'une Viewbox : « 7-962-016 VIEWBOX…#0/VBXM16FULL#0/tension_ceiling_large#1 ».
// Une même pièce a le même chemin dans toutes les Viewbox de la même définition, et d'une version du modèle à l'autre
// (les identifiants de nœud, eux, changent). Segment = définition SketchUp, sinon nom d'origine, sinon nom ; #n = rang
// parmi les frères qui portent le même segment (ordre de l'export).
import type { NodeInfo, SceneIndex } from '../types';

export interface PathIndex {
  /** chemin du nœud depuis sa Viewbox (exclue) ; null hors hiérarchie d'une Viewbox (accessoire rattaché par position, commun) */
  pathOf(id: string): string | null;
  /** Viewbox dont le nœud descend dans la hiérarchie */
  moduleOf(id: string): string | null;
  /** définition de la Viewbox (nœud module) */
  moduleDefinition(moduleId: string): string;
  /** nœuds d'une Viewbox par chemin */
  nodeAt(moduleId: string, path: string): string | undefined;
  /** chemin → nœuds, toutes Viewbox confondues */
  nodesAtPath(path: string): string[];
  children(id: string | null): NodeInfo[];
}

export function segmentOf(n: NodeInfo): string {
  return (n.definition || n.sourceName || n.name || '').replace(/[/#]/g, '_');
}

export function makePathIndex(index: SceneIndex): PathIndex {
  const byId = new Map(index.nodes.map((n) => [n.id, n]));
  const kids = new Map<string | null, NodeInfo[]>();
  for (const n of index.nodes) {
    const l = kids.get(n.parentId) ?? [];
    l.push(n);
    kids.set(n.parentId, l);
  }
  const moduleByNode = new Map(index.modules.map((m) => [m.nodeId, m.id]));
  const paths = new Map<string, string>();
  const owner = new Map<string, string>();
  const at = new Map<string, string>();
  const byPath = new Map<string, string[]>();
  const walk = (parent: NodeInfo, prefix: string, moduleId: string) => {
    const counts = new Map<string, number>();
    for (const c of kids.get(parent.id) ?? []) {
      const seg = segmentOf(c);
      const k = counts.get(seg) ?? 0;
      counts.set(seg, k + 1);
      const p = `${prefix}${prefix ? '/' : ''}${seg}#${k}`;
      paths.set(c.id, p);
      owner.set(c.id, moduleId);
      at.set(`${moduleId}\u0000${p}`, c.id);
      const l = byPath.get(p) ?? [];
      l.push(c.id);
      byPath.set(p, l);
      walk(c, p, moduleId);
    }
  };
  for (const m of index.modules) {
    const node = byId.get(m.nodeId);
    if (node) walk(node, '', m.id);
  }
  return {
    pathOf: (id) => paths.get(id) ?? null,
    moduleOf: (id) => owner.get(id) ?? moduleByNode.get(id) ?? null,
    moduleDefinition: (moduleId) => {
      const m = index.modules.find((x) => x.id === moduleId);
      const n = m ? byId.get(m.nodeId) : undefined;
      return n ? segmentOf(n) : '';
    },
    nodeAt: (moduleId, path) => at.get(`${moduleId}\u0000${path}`),
    nodesAtPath: (path) => byPath.get(path) ?? [],
    children: (id) => kids.get(id) ?? [],
  };
}
