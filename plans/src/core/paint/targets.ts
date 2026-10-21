// Cibles proposées dans la bulle de peinture après un clic sur une face, avec le nombre de pièces touchées, et texte
// de la zone (« VBX-03 › Poteau d'angle — face avant »). Pur.
import type { NodeInfo } from '../types';
import { segmentOf } from '../customViews/paths';
import type { PaintContext } from './resolve';
import { countTargets } from './resolve';
import type { FaceSelector, PaintTarget } from './types';

export type TargetKey = 'face-box' | 'face-all' | 'side-box' | 'node-box' | 'face-type';

export interface TargetOption {
  key: TargetKey;
  label: string;
  target: PaintTarget;
  /** pièces touchées */
  count: number;
}

/** Nom lisible d'une pièce : désignation SketchUp, nom d'origine, définition, nom (jamais un identifiant interne). */
export function pieceName(n: NodeInfo | undefined): string {
  if (!n) return 'Pièce';
  const ok = (s?: string) => !!s && !/^(SketchUp_Instance|VBXE-|ID\d+|node_?\d+|mesh_?\d+|instance_?\d+)/i.test(s);
  return [n.label, n.sourceName, n.definition, n.name].find(ok) ?? 'Pièce';
}

/** Fil d'Ariane : Viewbox › groupes nommés › pièce. */
export function paintBreadcrumb(ctx: PaintContext, nodeId: string): string[] {
  const out: string[] = [];
  let n = ctx.byId.get(nodeId);
  const module = ctx.paths.moduleOf(nodeId) ?? n?.moduleId ?? null;
  const moduleNode = module ? ctx.index.modules.find((m) => m.id === module)?.nodeId : undefined;
  while (n && n.id !== moduleNode) {
    const name = pieceName(n);
    if (name !== 'Pièce' && out[0] !== name) out.unshift(name);
    n = n.parentId ? ctx.byId.get(n.parentId) : undefined;
  }
  if (module) out.unshift(module);
  return out.length ? out : ['Pièce'];
}

export function targetOptions(ctx: PaintContext, nodeId: string, face: FaceSelector): TargetOption[] {
  const node = ctx.byId.get(nodeId);
  const path = ctx.paths.pathOf(nodeId);
  const module = ctx.paths.moduleOf(nodeId) ?? node?.moduleId ?? null;
  const here = path && module ? { modulePaths: [path], moduleIds: [module] } : { nodeIds: [nodeId] };
  const opts: TargetOption[] = [];
  const add = (key: TargetKey, label: string, target: PaintTarget) => opts.push({ key, label, target, count: countTargets(ctx, target) });
  add('face-box', 'Cette face', { scope: 'face', match: here, face });
  add('side-box', 'Toutes les faces de ce côté', { scope: 'side', match: here, face });
  add('node-box', 'La pièce entière', { scope: 'node', match: here });
  if (path) {
    const all: PaintTarget = { scope: 'face', match: { modulePaths: [path] }, face };
    const n = countTargets(ctx, all);
    if (n > 1) opts.push({ key: 'face-all', label: `Même face dans toutes les Viewbox identiques (${n})`, target: all, count: n });
  }
  const def = node?.definition ? segmentOf(node) : null;
  if (def) {
    const type: PaintTarget = { scope: 'face', match: { definitions: [def] }, face };
    const n = countTargets(ctx, type);
    if (n > 1 && n !== opts.find((o) => o.key === 'face-all')?.count) opts.push({ key: 'face-type', label: `Toutes les pièces de ce type (${n})`, target: type, count: n });
  }
  return opts;
}

/** Texte d'une zone dans la liste du panneau ; `view` = vue où la face a été choisie (« Front »). */
export function zoneLabel(ctx: PaintContext, nodeId: string, opt: TargetOption, view?: string): string {
  const crumbs = paintBreadcrumb(ctx, nodeId);
  const where = opt.key === 'face-all' ? `toutes les Viewbox › ${crumbs.slice(1).join(' › ') || crumbs[0]}` : opt.key === 'face-type' ? `tous : ${pieceName(ctx.byId.get(nodeId))}` : crumbs.join(' › ');
  const seen = view ? ` vue en « ${view} »` : '';
  const what = opt.target.scope === 'node' ? 'pièce entière' : opt.target.scope === 'side' ? `côté${seen}` : `face${seen}`;
  return `${where} — ${what}`;
}
