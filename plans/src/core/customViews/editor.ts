// Éditeur de vues spéciales, logique pure : fil d'Ariane d'une pièce cliquée, niveau proposé, actions de la bulle
// (retirer cette pièce / dans toutes les Viewbox / tout ce type / la catégorie / garder seulement / fantôme) avec le
// nombre de pièces touchées, nom proposé d'une vue, historique annuler / rétablir.
import type { NodeInfo } from '../types';
import type { PathIndex } from './paths';
import type { VisibilityContext } from './visibility';
import { ruleTargets } from './visibility';
import type { CustomViewSpec, ViewMatch, VisibilityOp, VisibilityRule } from './types';
import { DEFAULT_CAMERA, DEFAULT_LAYOUT, DEFAULT_STYLE } from './types';

/** Désignation lisible d'un nœud : désignation du manifest > nom d'origine > définition > nom. Jamais un identifiant. */
export function displayLabel(n: NodeInfo): string {
  const ok = (s?: string) => !!s && !/^SketchUp_Instance_\d+$/i.test(s) && !/^VBXE-\w+$/.test(s);
  const v = [n.label, n.sourceName, n.definition, n.name].find(ok);
  return (v ?? (n.role === 'module' ? n.name : 'Pièce sans nom')).replace(/^_+/, '').replace(/_/g, ' ').trim();
}

export interface Crumb {
  id: string;
  label: string;
}

/**
 * Fil d'Ariane d'un maillage cliqué, de la Viewbox (ou de l'accessoire / élément commun) à la pièce :
 * « VBX-03 › 7-962-016 VIEWBOX… › VBXM16FULL › black cieling ». Les groupes sans nom sont sautés.
 */
export function breadcrumb(ctx: VisibilityContext, meshId: string): Crumb[] {
  const out: Crumb[] = [];
  const by = ctx.look.byId;
  for (let n = by.get(meshId); n; n = n.parentId ? by.get(n.parentId) : undefined) {
    if (n.role === 'context' || n.role === 'wrapper') break;
    const named = n.role === 'module' || n.role === 'item' || ctx.tags.ownTag(n.id) || n.definition || n.label || n.sourceName || (n.name && !/^SketchUp_Instance_\d+$/i.test(n.name));
    if (named || n.id === meshId) out.unshift({ id: n.id, label: n.role === 'module' ? n.name : displayLabel(n) });
    if (n.role === 'module') break;
  }
  // un maillage sans nom au bout de la chaîne ne sert à rien si son parent est nommé
  if (out.length > 1 && !by.get(meshId)?.definition && out[out.length - 1].id === meshId && out[out.length - 1].label === 'Pièce sans nom') out.pop();
  return out;
}

/**
 * Niveau proposé pour un clic : la plus haute pièce portant la même étiquette de vue que la plus proche (le spot
 * entier, pas sa rotule) ; sinon un accessoire posé contre la Viewbox (mur, vitre) en entier ; sinon le premier
 * composant nommé au-dessus du maillage.
 */
export function defaultTarget(ctx: VisibilityContext, meshId: string): string {
  const by = ctx.look.byId;
  const chain: NodeInfo[] = [];
  for (let n = by.get(meshId); n && n.role !== 'module' && n.role !== 'wrapper' && n.role !== 'context'; n = n.parentId ? by.get(n.parentId) : undefined) chain.push(n);
  const tagged = chain.findIndex((n) => ctx.tags.ownTag(n.id));
  if (tagged >= 0) {
    const tag = ctx.tags.ownTag(chain[tagged].id)!.tag;
    let k = tagged;
    while (k + 1 < chain.length && ctx.tags.ownTag(chain[k + 1].id)?.tag === tag) k++;
    return chain[k].id;
  }
  const item = chain.find((n) => n.role === 'item');
  if (item && item.assignment !== 'hierarchy') return item.id;
  const named = chain.find((n) => n.definition && n.role !== 'item');
  return (named ?? item ?? chain[0] ?? by.get(meshId))?.id ?? meshId;
}

export type ClickAction = 'hide-one' | 'hide-all-boxes' | 'hide-tag' | 'hide-type' | 'hide-category' | 'isolate' | 'ghost';

export interface ActionProposal {
  action: ClickAction;
  /** texte du bouton : « Retirer dans toutes les Viewbox (6) » */
  text: string;
  rule: VisibilityRule;
  count: number;
  /** action proposée par défaut */
  primary?: boolean;
}

let ruleCounter = 0;
export const newRuleId = () => `r${Date.now().toString(36)}${(ruleCounter++).toString(36)}`;

/** Actions possibles sur un nœud cliqué, avec le nombre de pièces touchées (dans le périmètre de la vue). */
export function clickActions(ctx: VisibilityContext, nodeId: string, scopeNodes?: ReadonlySet<string>): ActionProposal[] {
  const n = ctx.look.byId.get(nodeId);
  if (!n) return [];
  const name = displayLabel(n);
  const out: ActionProposal[] = [];
  const add = (action: ClickAction, op: VisibilityOp, match: ViewMatch, label: string, text: (c: number) => string) => {
    const rule: VisibilityRule = { id: newRuleId(), op, match, label, source: 'click' };
    const count = ruleTargets(ctx, rule, scopeNodes).length;
    if (count > 0) out.push({ action, text: text(count), rule, count });
  };
  const path = ctx.paths.pathOf(nodeId);
  const samePath = path ? ctx.paths.nodesAtPath(path).length : 0;
  const where = n.moduleId ? ` — ${n.moduleId}` : '';
  add('hide-one', 'hide', { nodeIds: [nodeId] }, `${name}${where}`, () => 'Retirer cette pièce');
  if (path && samePath >= 2) add('hide-all-boxes', 'hide', { modulePaths: [path] }, `${name} — toutes les Viewbox`, (c) => `Retirer dans toutes les Viewbox (${c})`);
  const tag = ctx.tags.ownTag(nodeId);
  if (tag) add('hide-tag', 'hide', { viewTags: [tag.tag] }, `${tag.label} — partout`, (c) => `Retirer « ${tag.label} » partout (${c})`);
  if (n.definition) add('hide-type', 'hide', { definitions: [n.definition] }, `Type « ${name} »`, (c) => `Retirer tout ce type (${c})`);
  // catégorie propre seulement : une catégorie héritée est celle de la Viewbox entière
  if (n.category && n.categorySource !== 'inherited') add('hide-category', 'hide', { categories: [n.category] }, `Catégorie ${n.category}`, (c) => `Retirer la catégorie ${n.category} (${c})`);
  const wide: ViewMatch = path && samePath >= 2 ? { modulePaths: [path] } : { nodeIds: [nodeId] };
  add('isolate', 'isolate', wide, `Seulement ${name}`, () => 'Garder seulement ça');
  add('ghost', 'ghost', wide, `${name} en fantôme`, () => 'Mettre en fantôme (gris, ne cache rien)');
  // par défaut : « dans toutes les Viewbox » quand la pièce est dans la définition de la Viewbox
  const primary = out.find((a) => a.action === 'hide-all-boxes') ?? out.find((a) => a.action === 'hide-one');
  if (primary) primary.primary = true;
  return out;
}

/** Règle « remettre » une pièce retirée (clic sur une pièce rouge). */
export function restoreRule(ctx: VisibilityContext, nodeId: string): VisibilityRule {
  const n = ctx.look.byId.get(nodeId);
  return { id: newRuleId(), op: 'show', match: { nodeIds: [nodeId] }, label: `Remis : ${n ? displayLabel(n) : 'pièce'}${n?.moduleId ? ` — ${n.moduleId}` : ''}`, source: 'click' };
}

/** Vue vide (dessus, sans coupe, tout visible). */
export function blankSpec(id: string, now: string): CustomViewSpec {
  return {
    v: 1,
    id,
    name: 'Nouvelle vue',
    source: 'user',
    createdAt: now,
    updatedAt: now,
    scope: { modules: 'all', common: true },
    camera: { ...DEFAULT_CAMERA },
    cuts: [],
    visibility: [],
    layout: { ...DEFAULT_LAYOUT },
    style: { ...DEFAULT_STYLE },
    output: 'vector',
  };
}

const DIR_NAMES: Record<string, string> = {
  top: 'Vue de dessus',
  bottom: 'Vue de dessous',
  front: 'Vue avant',
  back: 'Vue arrière',
  left: 'Vue gauche',
  right: 'Vue droite',
  iso: 'Vue iso',
  'iso-below': 'Vue iso de dessous',
  custom: 'Vue',
};

const LAYOUT_NAMES: Record<string, string> = { assembled: '', exploded: 'séparées', 'per-module': 'chaque Viewbox', 'assembled+exploded': 'ensemble + séparées' };

/** Nom proposé : « Dessous de toiture — sans plafond tendu — séparées ». */
export function proposeName(spec: CustomViewSpec, tagLabel: (tag: string) => string = (t) => t): string {
  const parts: string[] = [];
  const hz = spec.cuts.find((c) => c.axis === 'horizontal' && c.ref.kind === 'level');
  const vertical = spec.cuts.find((c) => c.axis === 'long' || c.axis === 'short');
  if (vertical?.label) parts.push(`Coupe ${vertical.label}-${vertical.label}`);
  else if (vertical) parts.push(vertical.axis === 'long' ? 'Coupe longitudinale' : 'Coupe transversale');
  else if (spec.camera.dir === 'bottom' && hz && (hz.ref.kind === 'level' && (hz.ref.ref === 'roof-bottom' || hz.ref.ref === 'ceiling'))) parts.push('Dessous de toiture');
  else if (spec.camera.dir === 'bottom' && spec.camera.reflected) parts.push('Plan de plafond réfléchi');
  else if (spec.camera.dir === 'bottom') parts.push('Dessous de la box');
  else if (spec.camera.dir === 'top' && hz && hz.ref.kind === 'level' && hz.ref.ref === 'floor-top') parts.push(`Plan coupé à ${(hz.offset / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} m`);
  else parts.push(DIR_NAMES[spec.camera.dir] ?? 'Vue');
  const removed = spec.visibility.filter((r) => r.op === 'hide');
  const tagged = removed.flatMap((r) => r.match.viewTags ?? []);
  if (tagged.length) parts.push(`sans ${tagged.map((t) => tagLabel(t).toLowerCase()).join(', ')}`);
  else if (removed.length) parts.push(`${removed.length} élément${removed.length > 1 ? 's' : ''} retiré${removed.length > 1 ? 's' : ''}`);
  if (spec.visibility.some((r) => r.op === 'isolate')) parts.push(spec.visibility.filter((r) => r.op === 'isolate').map((r) => r.label.toLowerCase()).join(', '));
  const lay = LAYOUT_NAMES[spec.layout.mode];
  if (lay) parts.push(lay);
  return parts.join(' — ');
}

/** Historique d'édition (50 pas). */
export interface History<T> {
  past: T[];
  present: T;
  future: T[];
}

export const HISTORY_LIMIT = 50;

export function historyStart<T>(present: T): History<T> {
  return { past: [], present, future: [] };
}

export function historyPush<T>(h: History<T>, next: T): History<T> {
  if (next === h.present) return h;
  return { past: [...h.past, h.present].slice(-HISTORY_LIMIT), present: next, future: [] };
}

export function historyUndo<T>(h: History<T>): History<T> {
  if (!h.past.length) return h;
  return { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] };
}

export function historyRedo<T>(h: History<T>): History<T> {
  if (!h.future.length) return h;
  return { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) };
}

/** Déplace une règle (glisser-déposer des pastilles). */
export function moveRule(rules: VisibilityRule[], from: number, to: number): VisibilityRule[] {
  if (from === to || from < 0 || from >= rules.length) return rules;
  const out = [...rules];
  const [r] = out.splice(from, 1);
  out.splice(Math.max(0, Math.min(out.length, to)), 0, r);
  return out;
}

/** Chemins relatifs déjà portés par les règles (pour dire « déjà retiré »). */
export function pathsOf(paths: PathIndex, ids: string[]): string[] {
  return ids.map((id) => paths.pathOf(id)).filter((p): p is string => !!p);
}
