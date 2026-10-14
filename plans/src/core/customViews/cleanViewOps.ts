// Assistant « 🤖 Décris la vue » (pur) : nettoyage des opérations proposées par l'IA (clés et identifiants inconnus
// retirés, valeurs hors bornes ramenées, confiance plafonnée à 0,4 si quelque chose a été retiré) puis application sur
// une copie brouillon de la vue. Les règles ajoutées portent `source: 'ai'` (pastilles orange). Rien n'est appliqué
// sans clic ; « Annuler » rend l'état exact d'avant (la page garde la vue d'origine).
import type { CameraDir, CustomViewSpec, CutAxis, CutPlane, IsoCorner, LayoutMode, LevelRef, ModuleRef, Rotation, ViewLayout, ViewMatch, ViewStyle, VisibilityOp, VisibilityRule } from './types';
import { MAX_CUTS } from './types';
import { CAMERA_DIRS, CUT_AXES, CUT_FILLS, ISO_CORNERS, LAYOUT_MODES, LEVEL_REFS, MODULE_REFS, VISIBILITY_OPS } from './clean';
import type { ViewPreset } from './presets';
import { specFromPreset } from './presets';
import type { ViewAiPayload } from './aiPayload';

export type ViewOp =
  | { op: 'setCamera'; dir?: CameraDir; isoCorner?: IsoCorner; reflected?: boolean; rotate?: Rotation; mirror?: boolean; frame?: 'world' | 'module' }
  | { op: 'addCut'; axis: CutAxis; frame?: 'world' | 'module'; ref?: LevelRef | ModuleRef | 'absolute'; offset: number; keep?: 'positive' | 'negative'; label?: string; depth?: number }
  | { op: 'removeCut'; index: number }
  | { op: 'setBox'; moduleId: string | null }
  | { op: 'addRule'; rule: VisibilityOp; match: ViewMatch; label: string }
  | { op: 'removeRule'; id: string }
  | { op: 'setLayout'; mode?: LayoutMode; gap?: number; keepArrangement?: boolean; groupIdentical?: boolean; labels?: ViewLayout['labels'] }
  | { op: 'setStyle'; cutFill?: ViewStyle['cutFill']; hidden?: boolean; beyond?: ViewStyle['beyond'] }
  | { op: 'setScope'; modules?: 'all' | string[]; levels?: number[]; common?: boolean }
  | { op: 'usePreset'; key: string };

export interface CleanedOps {
  ops: ViewOp[];
  /** ce qui a été retiré ou ramené, en français */
  removed: string[];
  confidence: number;
  name?: string;
  questions: string[];
  rationale: string;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown, max = 200) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() && Number.isFinite(Number(v)) ? Number(v) : undefined);
const oneOf = <T extends string>(v: unknown, list: readonly T[]): T | undefined => (list.includes(v as T) ? (v as T) : undefined);

/**
 * Opérations de l'IA → opérations sûres. `payload` = ce qui a été envoyé : seules ses clés sont acceptées (Viewbox,
 * définitions, étiquettes, catégories, préréglages, règles et coupes de la vue actuelle).
 */
export function cleanViewOps(raw: unknown, payload: ViewAiPayload): CleanedOps {
  const r = isObj(raw) ? raw : {};
  const removed: string[] = [];
  const modules = new Set(payload.modules.map((m) => m.id));
  const levels = new Set(payload.modules.map((m) => m.level));
  const defs = new Set(payload.partTypes.map((p) => p.definition));
  const tags = new Set(payload.tags.map((t) => t.tag));
  const cats = new Set(payload.categories);
  const presets = new Set(payload.presets.map((p) => p.key));
  const rules = new Set(payload.current.rules.map((x) => x.id));
  const maxH = payload.maxHeight;
  const ops: ViewOp[] = [];
  const keep = (list: unknown, set: Set<string>, what: string): string[] | undefined => {
    if (!Array.isArray(list)) return undefined;
    const out: string[] = [];
    for (const v of list) {
      const s = str(v, 300);
      if (s && set.has(s)) out.push(s);
      else removed.push(`${what} inconnu : ${String(v).slice(0, 60)}`);
    }
    return out.length ? [...new Set(out)] : undefined;
  };
  for (const o of Array.isArray(r.ops) ? r.ops.slice(0, 30) : []) {
    if (!isObj(o)) continue;
    switch (o.op) {
      case 'setCamera': {
        const op: Extract<ViewOp, { op: 'setCamera' }> = { op: 'setCamera' };
        const dir = oneOf(o.dir, CAMERA_DIRS);
        if (dir && dir !== 'custom') op.dir = dir;
        else if (o.dir !== undefined) removed.push(`direction inconnue : ${String(o.dir)}`);
        const corner = oneOf(o.isoCorner, ISO_CORNERS);
        if (corner) op.isoCorner = corner;
        if (typeof o.reflected === 'boolean') op.reflected = o.reflected;
        const rot = num(o.rotate);
        if (rot !== undefined) {
          const k = (((Math.round(rot / 90) % 4) + 4) % 4) * 90;
          op.rotate = k as Rotation;
          if (k !== rot) removed.push(`rotation ${rot}° ramenée à ${k}°`);
        }
        if (typeof o.mirror === 'boolean') op.mirror = o.mirror;
        if (o.frame === 'world' || o.frame === 'module') op.frame = o.frame;
        if (Object.keys(op).length > 1) ops.push(op);
        break;
      }
      case 'addCut': {
        const axis = oneOf(o.axis, CUT_AXES);
        if (!axis || axis === 'custom') {
          removed.push(`coupe d’axe inconnu : ${String(o.axis)}`);
          break;
        }
        let offset = num(o.offset) ?? 0;
        if (Math.abs(offset) > maxH) {
          removed.push(`décalage ${offset} mm ramené à ±${maxH} mm`);
          offset = Math.sign(offset) * maxH;
        }
        const ref = axis === 'horizontal' ? oneOf(o.ref, LEVEL_REFS) : axis === 'long' || axis === 'short' ? oneOf(o.ref, MODULE_REFS) : undefined;
        if (o.ref !== undefined && o.ref !== 'absolute' && !ref) removed.push(`référence inconnue : ${String(o.ref)}`);
        const op: Extract<ViewOp, { op: 'addCut' }> = { op: 'addCut', axis, offset, ref: ref ?? (axis === 'horizontal' ? 'floor-top' : axis === 'long' || axis === 'short' ? 'mid' : 'absolute') };
        if (o.frame === 'world' || o.frame === 'module') op.frame = o.frame;
        if (o.keep === 'positive' || o.keep === 'negative') op.keep = o.keep;
        const label = str(o.label, 2);
        if (label && /^[A-Z]{1,2}$/i.test(label)) op.label = label.toUpperCase();
        const depth = num(o.depth);
        if (depth !== undefined && depth > 0) op.depth = Math.min(depth, maxH * 3);
        ops.push(op);
        break;
      }
      case 'removeCut': {
        const i = num(o.index);
        if (i !== undefined && Number.isInteger(i) && i >= 0 && i < payload.current.cuts.length) ops.push({ op: 'removeCut', index: i });
        else removed.push(`coupe à retirer introuvable : ${String(o.index)}`);
        break;
      }
      case 'setBox': {
        if (o.moduleId === null) ops.push({ op: 'setBox', moduleId: null });
        else if (typeof o.moduleId === 'string' && modules.has(o.moduleId)) ops.push({ op: 'setBox', moduleId: o.moduleId });
        else removed.push(`Viewbox inconnue : ${String(o.moduleId)}`);
        break;
      }
      case 'addRule': {
        const rule = oneOf(o.rule ?? o.ruleOp ?? o.visibility, VISIBILITY_OPS);
        const m = isObj(o.match) ? o.match : {};
        if (Array.isArray(m.nodeIds) || Array.isArray(m.modulePaths)) removed.push('règle par identifiant de pièce refusée (seulement types, étiquettes, catégories, Viewbox)');
        const match: ViewMatch = {};
        const d = keep(m.definitions, defs, 'type');
        if (d) match.definitions = d;
        const t = keep(m.viewTags, tags, 'étiquette');
        if (t) match.viewTags = t;
        const c = keep(m.categories, cats, 'catégorie');
        if (c) match.categories = c;
        const mo = keep(m.moduleIds, modules, 'Viewbox');
        if (mo) match.moduleIds = mo;
        if (typeof m.common === 'boolean') match.common = m.common;
        if (!rule) {
          removed.push(`opération de règle inconnue : ${String(o.rule)}`);
          break;
        }
        if (!Object.keys(match).length) {
          removed.push('règle sans critère connu retirée');
          break;
        }
        ops.push({ op: 'addRule', rule, match, label: str(o.label, 120) ?? 'Règle proposée par l’IA' });
        break;
      }
      case 'removeRule': {
        const id = str(o.id, 80);
        if (id && rules.has(id)) ops.push({ op: 'removeRule', id });
        else removed.push(`règle à retirer introuvable : ${String(o.id)}`);
        break;
      }
      case 'setLayout': {
        const op: Extract<ViewOp, { op: 'setLayout' }> = { op: 'setLayout' };
        const mode = oneOf(o.mode, LAYOUT_MODES);
        if (mode) op.mode = mode;
        else if (o.mode !== undefined) removed.push(`disposition inconnue : ${String(o.mode)}`);
        const gap = num(o.gap);
        if (gap !== undefined) op.gap = Math.max(0, Math.min(10000, gap));
        if (typeof o.keepArrangement === 'boolean') op.keepArrangement = o.keepArrangement;
        if (typeof o.groupIdentical === 'boolean') op.groupIdentical = o.groupIdentical;
        const labels = oneOf(o.labels, ['none', 'id', 'id+type'] as const);
        if (labels) op.labels = labels;
        if (Object.keys(op).length > 1) ops.push(op);
        break;
      }
      case 'setStyle': {
        const op: Extract<ViewOp, { op: 'setStyle' }> = { op: 'setStyle' };
        const fill = oneOf(o.cutFill, CUT_FILLS);
        if (fill) op.cutFill = fill;
        if (typeof o.hidden === 'boolean') op.hidden = o.hidden;
        if (o.beyond === 'normal' || o.beyond === 'thin') op.beyond = o.beyond;
        if (Object.keys(op).length > 1) ops.push(op);
        break;
      }
      case 'setScope': {
        const op: Extract<ViewOp, { op: 'setScope' }> = { op: 'setScope' };
        if (o.modules === 'all') op.modules = 'all';
        else {
          const mo = keep(o.modules, modules, 'Viewbox');
          if (mo) op.modules = mo;
        }
        if (Array.isArray(o.levels)) {
          const lv = o.levels.map(num).filter((x): x is number => x !== undefined && levels.has(x));
          if (lv.length) op.levels = [...new Set(lv)];
          else removed.push('niveaux inconnus');
        }
        if (typeof o.common === 'boolean') op.common = o.common;
        if (Object.keys(op).length > 1) ops.push(op);
        break;
      }
      case 'usePreset': {
        const key = str(o.key, 80);
        if (key && presets.has(key)) ops.push({ op: 'usePreset', key });
        else removed.push(`préréglage inconnu : ${String(o.key)}`);
        break;
      }
      default:
        removed.push(`opération inconnue : ${String(o.op)}`);
    }
  }
  let confidence = Math.max(0, Math.min(1, num(r.confidence) ?? 0.5));
  if (removed.length) confidence = Math.min(confidence, 0.4);
  const questions = (Array.isArray(r.questions) ? r.questions : [])
    .map((q) => str(q, 300))
    .filter((q): q is string => !!q)
    .slice(0, 3);
  return { ops, removed, confidence, ...(str(r.name) ? { name: str(r.name) } : {}), questions, rationale: str(r.rationale, 600) ?? '' };
}

let counter = 0;
const nid = (p: string) => `${p}${Date.now().toString(36)}${(counter++).toString(36)}`;

/** Applique des opérations nettoyées sur une copie de la vue (règles et coupes ajoutées = source 'ai'). */
export function applyViewOps(
  spec: CustomViewSpec,
  ops: ViewOp[],
  ctx: { presets: ViewPreset[]; boxFor: (moduleId: string) => CustomViewSpec['box']; now: string },
): CustomViewSpec {
  let s: CustomViewSpec = JSON.parse(JSON.stringify(spec));
  const cutsBefore = [...s.cuts];
  const removeCuts = new Set<string>();
  for (const op of ops) {
    switch (op.op) {
      case 'usePreset': {
        const p = ctx.presets.find((x) => x.key === op.key);
        if (p) {
          const ps = specFromPreset(p, s.id, ctx.now);
          s = { ...ps, name: s.name, createdAt: s.createdAt, source: s.source, visibility: ps.visibility.map((r) => ({ ...r, source: 'ai' as const })) };
        }
        break;
      }
      case 'setCamera': {
        const { op: _o, ...patch } = op;
        s.camera = { ...s.camera, ...patch };
        if (s.camera.dir !== 'bottom') delete s.camera.reflected;
        if (s.camera.dir !== 'iso' && s.camera.dir !== 'iso-below') delete s.camera.isoCorner;
        else s.camera.isoCorner ??= 'fl';
        break;
      }
      case 'addCut': {
        if (s.cuts.length >= MAX_CUTS) break;
        const vertical = op.axis === 'long' || op.axis === 'short';
        const ref: CutPlane['ref'] =
          op.axis === 'horizontal' && op.ref !== 'absolute' && op.ref ? { kind: 'level', ref: op.ref as LevelRef } : vertical && op.ref !== 'absolute' && op.ref ? { kind: 'module', ref: op.ref as ModuleRef } : { kind: 'absolute' };
        const cut: CutPlane = {
          id: nid('c'),
          frame: op.frame ?? (op.axis === 'x' || op.axis === 'z' ? 'world' : 'module'),
          axis: op.axis,
          ref,
          offset: op.offset,
          keep: op.keep ?? (op.axis === 'horizontal' ? 'negative' : op.axis === 'long' ? 'positive' : 'negative'),
          ...(op.label ? { label: op.label } : {}),
          ...(op.depth ? { depth: op.depth } : {}),
        };
        s.cuts.push(cut);
        // une coupe verticale se regarde de face, dans les axes de la Viewbox (côté gardé au-delà du plan)
        if (vertical) s.camera = { ...s.camera, frame: 'module', dir: op.axis === 'long' ? 'left' : 'front', reflected: undefined, isoCorner: undefined };
        break;
      }
      case 'removeCut': {
        const c = cutsBefore[op.index];
        if (c) removeCuts.add(c.id);
        break;
      }
      case 'setBox':
        s.box = op.moduleId ? ctx.boxFor(op.moduleId) : undefined;
        break;
      case 'addRule': {
        const rule: VisibilityRule = { id: nid('r'), op: op.rule, match: op.match, label: op.label, source: 'ai' };
        s.visibility.push(rule);
        break;
      }
      case 'removeRule':
        s.visibility = s.visibility.filter((r) => r.id !== op.id);
        break;
      case 'setLayout': {
        const { op: _o, ...patch } = op;
        s.layout = { ...s.layout, ...patch };
        break;
      }
      case 'setStyle': {
        const { op: _o, ...patch } = op;
        s.style = { ...s.style, ...patch };
        break;
      }
      case 'setScope': {
        const { op: _o, ...patch } = op;
        s.scope = { ...s.scope, ...patch };
        if (patch.levels && !patch.levels.length) delete s.scope.levels;
        break;
      }
    }
  }
  if (removeCuts.size) s.cuts = s.cuts.filter((c) => !removeCuts.has(c.id));
  s.camera = Object.fromEntries(Object.entries(s.camera).filter(([, v]) => v !== undefined)) as CustomViewSpec['camera'];
  return { ...s, updatedAt: ctx.now };
}
