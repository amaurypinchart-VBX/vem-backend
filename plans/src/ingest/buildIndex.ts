// Construction de l'index de scène : détection des Viewbox, classification, rattachement des
// accessoires, niveaux, avertissements. Le graphe three.js doit être normalisé (mm, Y-up) et à jour.
import { Box3, Matrix4, Mesh, Object3D, Quaternion, Vector3 } from 'three';
import type { BufferGeometry } from 'three';
import type {
  BBox,
  Category,
  CategorySource,
  IngestStats,
  LevelInfo,
  ModuleInfo,
  NodeInfo,
  SceneIndex,
  SourceInfo,
  Warning,
} from '../core/types';
import { ENGINE_VERSION, MODULE_ACCESSORY_CATEGORIES } from '../core/types';
import type { CompiledRules } from '../core/classification';
import {
  articleRefFromName,
  categoryFromName,
  isCommonName,
  isContextName,
  isGlassMaterial,
  moduleIdFromName,
} from '../core/classification';
import { checkPlanDims, groupLevels, levelLabel, suspectScaleFactor } from '../core/units';
import type { Manifest, ManifestEntry } from '../core/manifest';
import { asCategory, BBoxLookup, manifestBBoxToYUp } from '../core/manifest';
import { stableId } from '../core/hash';
import { normalizeName } from '../core/classification';

export interface CleanupStats {
  degenerate: number;
  duplicate: number;
  backToBack: number;
}

interface Rec {
  obj: Object3D;
  id: string;
  parent: Rec | null;
  children: Rec[];
  name: string;
  defName: string;
  kind: NodeInfo['kind'];
  box: Box3; // monde, mm (vide si pas de géométrie)
  triangles: number;
  materials: string[];
  context: boolean;
  moduleId: string | null; // pour le nœud module lui-même
  inModule: Rec | null; // module ancêtre (ou soi-même)
  category: Category | null;
  source: CategorySource | null;
  articleRef: string | null;
  glass: boolean;
}

const EXCESSIVE_ITEM_TRIANGLES = 150_000;
const EXCESSIVE_TOTAL_TRIANGLES = 3_000_000;

function toBBox(b: Box3): BBox | null {
  if (b.isEmpty()) return null;
  const r = (v: number) => Math.round(v * 10) / 10;
  return [r(b.min.x), r(b.min.y), r(b.min.z), r(b.max.x), r(b.max.y), r(b.max.z)];
}

function triangleCount(g: BufferGeometry): number {
  return Math.floor((g.index ? g.index.count : (g.attributes.position?.count ?? 0)) / 3);
}

/** Boîte monde exacte d'un objet feuille (parcours de ses sommets). */
function worldBoxOf(obj: Object3D, out: Box3): void {
  const geom = (obj as Mesh).geometry as BufferGeometry | undefined;
  const pos = geom?.attributes?.position;
  if (!pos) return;
  const v = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(obj.matrixWorld);
    out.expandByPoint(v);
  }
}

/**
 * Dimensions d'un module dans SON repère (indépendant de sa rotation dans l'assemblage) :
 * [plan long, plan court] + hauteur, en mm. L'axe vertical est l'axe local le plus aligné avec Y monde.
 */
function frameDims(moduleObj: Object3D, leaves: Object3D[]): { plan: [number, number]; height: number } | null {
  const p = new Vector3();
  const q = new Quaternion();
  const s = new Vector3();
  moduleObj.matrixWorld.decompose(p, q, s);
  const inv = new Matrix4().compose(p, q, new Vector3(1, 1, 1)).invert();
  const box = new Box3();
  const m = new Matrix4();
  const v = new Vector3();
  for (const leaf of leaves) {
    const pos = ((leaf as Mesh).geometry as BufferGeometry | undefined)?.attributes?.position;
    if (!pos) continue;
    m.multiplyMatrices(inv, leaf.matrixWorld);
    for (let i = 0; i < pos.count; i++) box.expandByPoint(v.fromBufferAttribute(pos, i).applyMatrix4(m));
  }
  if (box.isEmpty()) return null;
  const size = box.getSize(new Vector3()).toArray();
  const up = new Vector3(0, 1, 0).applyQuaternion(q.clone().invert());
  const a = up.toArray().map(Math.abs);
  const upAxis = a[0] >= a[1] && a[0] >= a[2] ? 0 : a[1] >= a[2] ? 1 : 2;
  const planAxes = [0, 1, 2].filter((i) => i !== upAxis);
  const d1 = size[planAxes[0]];
  const d2 = size[planAxes[1]];
  return { plan: [Math.max(d1, d2), Math.min(d1, d2)], height: size[upAxis] };
}

function descendants(rec: Rec, pred?: (r: Rec) => boolean): Rec[] {
  const out: Rec[] = [];
  const stack = [...rec.children];
  while (stack.length) {
    const r = stack.pop()!;
    if (pred && !pred(r)) continue;
    out.push(r);
    stack.push(...r.children);
  }
  return out;
}

function fmt(n: number): string {
  return Math.round(n).toLocaleString('fr-FR').replace(/ | /g, ' ');
}

export interface BuildIndexInput {
  root: Object3D;
  rules: CompiledRules;
  manifest: Manifest | null;
  source: SourceInfo;
  cleanup: CleanupStats;
  extraWarnings?: Warning[];
  startedAt: number;
}

export interface BuildIndexResult {
  index: SceneIndex;
  objectsById: Map<string, Object3D>;
}

export function buildIndex(input: BuildIndexInput): BuildIndexResult {
  const { root, rules, manifest, source, cleanup } = input;
  const warnings: Warning[] = [...(input.extraWarnings ?? [])];
  root.updateMatrixWorld(true);

  // ─── 1. Enregistrements (parcours en profondeur, identifiants stables dérivés du chemin) ───
  const recs: Rec[] = [];
  const usedIds = new Set<string>();
  const objectsById = new Map<string, Object3D>();
  const build = (obj: Object3D, parent: Rec | null, parentPath: string): Rec[] => {
    const seenNames = new Map<string, number>();
    const out: Rec[] = [];
    for (const child of obj.children) {
      const c = child as Object3D & { isCamera?: boolean; isLight?: boolean; isLineSegments?: boolean; isLine?: boolean; isMesh?: boolean };
      if (c.isCamera || c.isLight) continue;
      const key = child.name || '∅';
      const n = seenNames.get(key) ?? 0;
      seenNames.set(key, n + 1);
      const path = parentPath + '/' + key + '#' + n;
      let id = stableId(path);
      for (let k = 2; usedIds.has(id); k++) id = stableId(path + '~' + k);
      usedIds.add(id);
      const rec: Rec = {
        obj: child,
        id,
        parent,
        children: [],
        name: child.name,
        defName: typeof child.userData?.definitionName === 'string' ? child.userData.definitionName : '',
        kind: c.isMesh ? 'mesh' : c.isLineSegments || c.isLine ? 'lines' : 'group',
        box: new Box3(),
        triangles: 0,
        materials: [],
        context: false,
        moduleId: null,
        inModule: null,
        category: null,
        source: null,
        articleRef: null,
        glass: false,
      };
      child.userData = { ...child.userData, vbxId: id, originalName: child.name };
      objectsById.set(id, child);
      recs.push(rec);
      rec.children = build(child, rec, path);
      out.push(rec);
    }
    return out;
  };
  const top = build(root, null, '');

  // ─── 2. Boîtes monde, triangles, matériaux (feuilles puis agrégation vers le haut) ───
  let meshes = 0;
  let hasEdges = false;
  for (let i = recs.length - 1; i >= 0; i--) {
    const r = recs[i];
    if (r.kind === 'mesh') {
      meshes++;
      const g = (r.obj as Mesh).geometry as BufferGeometry;
      r.triangles = triangleCount(g);
      worldBoxOf(r.obj, r.box);
      const mats = (r.obj as Mesh).material;
      r.materials = (Array.isArray(mats) ? mats : [mats]).map((m) => m?.name ?? '').filter(Boolean);
      r.glass = r.materials.some((m) => isGlassMaterial(m, rules));
    } else if (r.kind === 'lines') {
      hasEdges = true;
      worldBoxOf(r.obj, r.box);
    }
    for (const c of r.children) {
      r.box.union(c.box);
      r.triangles += c.triangles;
    }
  }
  const candidates = (r: Rec) => [r.name, r.defName].filter((n, i, a) => n && a.indexOf(n) === i);

  // ─── 3. Contexte (CTX_…) : ignoré partout ───
  for (const r of recs) {
    if (r.context || !candidates(r).some((n) => isContextName(n, rules))) continue;
    r.context = true;
    for (const d of descendants(r)) d.context = true;
  }

  // ─── 4. Modules par leur nom (VBX-xx) ───
  const moduleRecs: Rec[] = [];
  const moduleIdCount = new Map<string, number>();
  const nested: Rec[] = [];
  const markModules = (list: Rec[], current: Rec | null) => {
    for (const r of list) {
      if (r.context) continue;
      let here = current;
      const mid = candidates(r).map((n) => moduleIdFromName(n, rules)).find(Boolean) ?? null;
      if (mid) {
        if (current) nested.push(r);
        else {
          const count = (moduleIdCount.get(mid) ?? 0) + 1;
          moduleIdCount.set(mid, count);
          r.moduleId = count > 1 ? `${mid} (${count})` : mid;
          moduleRecs.push(r);
          here = r;
        }
      }
      r.inModule = here;
      markModules(r.children, here);
    }
  };
  markModules(top, null);
  for (const [mid, count] of moduleIdCount) {
    if (count > 1) {
      warnings.push({
        code: 'DUPLICATE_MODULE_NAME',
        severity: 'warning',
        message: `Le nom ${mid} est utilisé ${count} fois : chaque Viewbox doit avoir un nom d'instance unique.`,
        nodeIds: moduleRecs.filter((m) => m.moduleId === mid || m.moduleId?.startsWith(mid + ' (')).map((m) => m.id),
      });
    }
  }
  if (nested.length) {
    warnings.push({
      code: 'NESTED_MODULE',
      severity: 'warning',
      message: `${nested.length} objet(s) nommé(s) comme une Viewbox se trouvent à l'intérieur d'une autre Viewbox (ignorés comme modules).`,
      nodeIds: nested.map((r) => r.id),
    });
  }

  // ─── 5. Classification (manifest > nom > définition > réf. article > matériau > héritage) ───
  const manifestByKey = new Map<string, ManifestEntry>();
  const manifestGlobal = new Map<string, ManifestEntry | null>(); // null = nom ambigu
  const manifestMatched = new Set<ManifestEntry>();
  const allManifestEntries: ManifestEntry[] = [];
  if (manifest) {
    const addGlobal = (e: ManifestEntry) => {
      const k = normalizeName(e.name);
      manifestGlobal.set(k, manifestGlobal.has(k) ? null : e);
      allManifestEntries.push(e);
    };
    for (const m of manifest.modules) {
      for (const e of m.accessories ?? []) {
        manifestByKey.set(normalizeName(m.id) + '::' + normalizeName(e.name), e);
        addGlobal(e);
      }
    }
    for (const e of manifest.common ?? []) addGlobal(e);
  }
  const fromManifest = (r: Rec): ManifestEntry | null => {
    if (!manifest || !r.name) return null;
    const k = normalizeName(r.name);
    const mid = r.inModule?.moduleId;
    return (mid ? manifestByKey.get(normalizeName(mid) + '::' + k) : undefined) ?? manifestGlobal.get(k) ?? null;
  };

  const applyEntry = (r: Rec, e: ManifestEntry) => {
    manifestMatched.add(e);
    const cat = asCategory(e.category ?? null);
    if (cat) {
      r.category = cat;
      r.source = 'manifest';
    }
    if (e.articleRef) r.articleRef = e.articleRef;
  };

  for (const r of recs) {
    if (r.context || r.moduleId) continue;
    const e = fromManifest(r);
    if (e) applyEntry(r, e);
    const names = candidates(r);
    if (!r.articleRef) r.articleRef = names.map((n) => articleRefFromName(n, rules)).find(Boolean) ?? null;
    if (r.category) continue;
    const byName = r.name ? categoryFromName(r.name, rules) : null;
    const byDef = !byName && r.defName ? categoryFromName(r.defName, rules) : null;
    if (byName) {
      r.category = byName;
      r.source = 'name';
    } else if (byDef) {
      r.category = byDef;
      r.source = 'definition';
    } else if (r.articleRef && rules.articleCategories[r.articleRef]) {
      r.category = rules.articleCategories[r.articleRef];
      r.source = 'article';
    } else if (r.glass) {
      r.category = 'VITRE';
      r.source = 'material';
    }
  }

  // Repli du manifest par boîte englobante (tolérance 1 mm) pour les entrées non trouvées par leur nom.
  if (manifest) {
    const lookup = new BBoxLookup<Rec>(1);
    for (const r of recs) {
      const b = toBBox(r.box);
      if (b && !r.context && !r.moduleId && r.source !== 'manifest') lookup.add(b, r);
    }
    for (const e of allManifestEntries) {
      if (manifestMatched.has(e) || !e.bboxWorld) continue;
      const r = lookup.find(manifestBBoxToYUp(e.bboxWorld));
      if (r) applyEntry(r, e);
    }
  }

  // Héritage : les pièces d'un accessoire prennent sa catégorie.
  for (const r of recs) {
    if (r.category || r.context || r.moduleId) continue;
    for (let p = r.parent; p && !p.moduleId; p = p.parent) {
      if (p.category) {
        r.category = p.category;
        r.source = 'inherited';
        break;
      }
    }
    if (r.category?.startsWith('VITRE')) r.glass = true;
  }
  for (const r of recs) if (r.category?.startsWith('VITRE')) r.glass = true;

  // ─── 6. Modules par leurs dimensions, si aucun nom VBX-xx n'a été trouvé ───
  const dims = rules.moduleDims;
  let detectedBy: ModuleInfo['detectedBy'] = 'name';
  if (moduleRecs.length === 0) {
    detectedBy = 'dimensions';
    const leavesOf = (r: Rec) => descendants(r, (d) => !d.context).filter((d) => d.kind === 'mesh').map((d) => d.obj);
    const scan = (list: Rec[], depth: number) => {
      for (const r of list) {
        if (r.context || r.kind !== 'group') continue;
        const fd = frameDims(r.obj, leavesOf(r));
        if (fd && checkPlanDims(fd.plan[0], fd.plan[1], dims).ok) {
          moduleRecs.push(r);
          continue;
        }
        if (depth < 6) scan(r.children, depth + 1);
      }
    };
    scan(top, 0);
    moduleRecs.sort((a, b) => a.box.min.y - b.box.min.y || a.box.min.x - b.box.min.x || a.box.min.z - b.box.min.z);
    moduleRecs.forEach((r, i) => {
      r.moduleId = 'AUTO-' + String(i + 1).padStart(2, '0');
      r.inModule = r;
      for (const d of descendants(r)) d.inModule = r;
    });
    if (moduleRecs.length) {
      warnings.push({
        code: 'MODULES_BY_DIMENSIONS',
        severity: 'warning',
        message: `${moduleRecs.length} Viewbox reconnue(s) uniquement à leurs dimensions (${dims.long} × ${dims.short} mm) et nommée(s) AUTO-xx. Dans SketchUp, donne à chaque Viewbox un nom d'instance VBX-01, VBX-02… (l'extension Viewbox le fait pour toi).`,
        nodeIds: moduleRecs.map((r) => r.id),
      });
    }
  }
  // Géométrie brute directement dans la définition d'un module (sans nom) = sa structure.
  for (const m of moduleRecs) {
    for (const c of m.children) {
      if (!c.category && !c.name && c.kind === 'mesh') {
        c.category = 'STRUCTURE';
        c.source = 'inherited';
      }
    }
  }
  if (moduleRecs.length === 0) {
    warnings.push({
      code: 'NO_MODULES',
      severity: 'blocking',
      message: `Aucune Viewbox détectée : aucun objet nommé VBX-xx et aucun ensemble de ${dims.long} × ${dims.short} mm (± ${dims.toleranceMm}) trouvé.`,
    });
  }

  // ─── 7. Dimensions des modules (dans leur repère), contrôle d'unités ───
  const moduleInfos: ModuleInfo[] = [];
  const structureMinY = new Map<Rec, number>();
  for (const m of moduleRecs) {
    const all = descendants(m, (d) => !d.context).filter((d) => d.kind === 'mesh');
    const structural = all.filter((d) => d.category === 'STRUCTURE' || d.category === 'PLANCHER');
    const leaves = structural.length ? structural : all;
    const fd = frameDims(m.obj, leaves.map((d) => d.obj)) ?? { plan: [0, 0] as [number, number], height: 0 };
    const sBox = new Box3();
    for (const l of leaves) sBox.union(l.box);
    structureMinY.set(m, sBox.isEmpty() ? m.box.min.y : sBox.min.y);
    const check = checkPlanDims(fd.plan[0], fd.plan[1], dims);
    moduleInfos.push({
      id: m.moduleId!,
      nodeId: m.id,
      name: m.name || m.defName,
      level: 0,
      planDimsMm: [Math.round(fd.plan[0] * 10) / 10, Math.round(fd.plan[1] * 10) / 10],
      heightMm: Math.round(fd.height * 10) / 10,
      dimsSource: structural.length ? 'structure' : 'all',
      dimsOk: check.ok,
      bboxMm: toBBox(m.box) ?? [0, 0, 0, 0, 0, 0],
      itemIds: [],
      detectedBy,
    });
  }
  const badDims = moduleInfos.filter((m) => !m.dimsOk);
  if (badDims.length) {
    const med = (arr: number[]) => arr.slice().sort((a, b) => a - b)[Math.floor(arr.length / 2)];
    const suspect =
      badDims.length === moduleInfos.length
        ? suspectScaleFactor(med(badDims.map((m) => m.planDimsMm[0])), med(badDims.map((m) => m.planDimsMm[1])), dims)
        : null;
    if (suspect) {
      warnings.push({
        code: 'UNIT_SUSPECT',
        severity: 'blocking',
        message: `Problème d'unités : les Viewbox mesurent ~${fmt(badDims[0].planDimsMm[0])} × ${fmt(badDims[0].planDimsMm[1])} mm au lieu de ${dims.long} × ${dims.short}. Facteur suspecté ${suspect.label}. Vérifie les unités du modèle SketchUp (Fenêtre › Infos sur le modèle › Unités) avant de réexporter.`,
        nodeIds: badDims.map((m) => m.nodeId),
      });
    } else {
      for (const m of badDims) {
        warnings.push({
          code: 'MODULE_DIMS',
          severity: 'warning',
          message: `${m.id} mesure ${fmt(m.planDimsMm[0])} × ${fmt(m.planDimsMm[1])} mm en plan (attendu ${dims.long} × ${dims.short} ± ${dims.toleranceMm}, mesuré sur ${m.dimsSource === 'structure' ? 'la structure' : "l'ensemble du module"}).`,
          nodeIds: [m.nodeId],
        });
      }
    }
  }

  // ─── 8. Niveaux (min Y de la structure, tolérance 200 mm) ───
  const levelOf = groupLevels(moduleRecs.map((m) => structureMinY.get(m)!));
  const levelMap = new Map<number, LevelInfo>();
  moduleRecs.forEach((m, i) => {
    const lv = levelOf[i];
    moduleInfos[i].level = lv;
    let li = levelMap.get(lv);
    if (!li) levelMap.set(lv, (li = { level: lv, label: levelLabel(lv), minYmm: Math.round(structureMinY.get(m)!), moduleIds: [] }));
    li.minYmm = Math.min(li.minYmm, Math.round(structureMinY.get(m)!));
    li.moduleIds.push(m.moduleId!);
  });
  const levels = [...levelMap.values()].sort((a, b) => a.level - b.level);
  const levelForY = (y: number): number | null => {
    let best: number | null = null;
    for (const l of levels) if (y >= l.minYmm - 200) best = l.level;
    return best ?? (levels.length ? levels[0].level : null);
  };
  const moduleLevel = new Map<Rec, number>(moduleRecs.map((m, i) => [m, levelOf[i]]));

  // ─── 9. Rattachement : hiérarchie, puis position (boîte du module + 50 mm), sinon éléments communs ───
  const assignment = new Map<Rec, { moduleId: string | null; how: NonNullable<NodeInfo['assignment']>; level: number | null }>();
  const assignSubtree = (r: Rec, v: { moduleId: string | null; how: NonNullable<NodeInfo['assignment']>; level: number | null }) => {
    assignment.set(r, v);
    for (const d of descendants(r)) assignment.set(d, v);
  };
  for (const m of moduleRecs) {
    const lv = moduleLevel.get(m) ?? null;
    assignSubtree(m, { moduleId: m.moduleId, how: 'hierarchy', level: lv });
  }
  const containsModule = (r: Rec): boolean => r.moduleId !== null || r.children.some(containsModule);
  const freeRoots: Rec[] = [];
  const collectFree = (list: Rec[]) => {
    for (const r of list) {
      if (r.context || r.moduleId) continue;
      if (containsModule(r)) collectFree(r.children);
      else if (r.box.isEmpty() && r.children.length === 0) continue;
      else freeRoots.push(r);
    }
  };
  collectFree(top);
  const expanded = moduleRecs.map((m) => ({ m, box: m.box.clone().expandByScalar(50) }));
  const commonIds: string[] = [];
  const orphans: Rec[] = [];
  for (const r of freeRoots) {
    const lv = r.box.isEmpty() ? null : levelForY(r.box.min.y);
    if (candidates(r).some((n) => isCommonName(n, rules))) {
      assignSubtree(r, { moduleId: null, how: 'common', level: lv });
      commonIds.push(r.id);
      continue;
    }
    const center = r.box.getCenter(new Vector3());
    const hits = r.box.isEmpty() ? [] : expanded.filter((e) => e.box.containsPoint(center));
    if (hits.length) {
      const vol = (b: Box3) => {
        const s = b.getSize(new Vector3());
        return s.x * s.y * s.z;
      };
      const best = hits.sort((a, b) => vol(a.m.box) - vol(b.m.box))[0].m;
      assignSubtree(r, { moduleId: best.moduleId, how: 'spatial', level: moduleLevel.get(best) ?? null });
      continue;
    }
    assignSubtree(r, { moduleId: null, how: 'common', level: lv });
    commonIds.push(r.id);
    if (r.category && MODULE_ACCESSORY_CATEGORIES.has(r.category)) orphans.push(r);
  }

  // ─── 10. Rôles, articles (items = plus haut nœud classé), non classés ───
  const role = new Map<Rec, NodeInfo['role']>();
  const unclassified: Rec[] = [];
  const itemsByModule = new Map<string, string[]>();
  const walkItems = (list: Rec[], moduleId: string | null) => {
    for (const r of list) {
      if (r.context) {
        role.set(r, 'context');
        continue;
      }
      if (r.category) {
        role.set(r, 'item');
        for (const d of descendants(r)) role.set(d, d.context ? 'context' : 'part');
        if (moduleId) {
          const l = itemsByModule.get(moduleId) ?? [];
          l.push(r.id);
          itemsByModule.set(moduleId, l);
        }
        continue;
      }
      const hasClassifiedBelow = descendants(r).some((d) => d.category && !d.context);
      if (hasClassifiedBelow) {
        role.set(r, 'wrapper');
        walkItems(r.children, moduleId);
      } else if (r.triangles > 0) {
        role.set(r, 'item');
        for (const d of descendants(r)) role.set(d, 'part');
        unclassified.push(r);
        if (moduleId) {
          const l = itemsByModule.get(moduleId) ?? [];
          l.push(r.id);
          itemsByModule.set(moduleId, l);
        }
      } else {
        role.set(r, 'wrapper');
      }
    }
  };
  for (const m of moduleRecs) {
    role.set(m, 'module');
    walkItems(m.children, m.moduleId);
  }
  for (const r of freeRoots) {
    const a = assignment.get(r);
    walkItems([r], a?.how === 'spatial' ? a.moduleId : null);
  }
  moduleInfos.forEach((mi) => (mi.itemIds = itemsByModule.get(mi.id) ?? []));

  // ─── 11. Avertissements complémentaires ───
  if (unclassified.length) {
    warnings.push({
      code: 'UNCLASSIFIED',
      severity: 'warning',
      message: `${unclassified.length} objet(s) non classé(s) : leur nom ne correspond à aucune catégorie (VITRE-SEAMLESS, MUR-LEGER, PORTE-SIMPLE, STRUCTURE…). Renomme-les dans SketchUp ou ajoute une règle dans Réglages.`,
      nodeIds: unclassified.map((r) => r.id),
    });
  }
  if (orphans.length) {
    warnings.push({
      code: 'ORPHAN_ACCESSORY',
      severity: 'warning',
      message: `${orphans.length} accessoire(s) (vitres, murs, portes) hors de toute Viewbox : place-les à l'intérieur du composant de leur Viewbox, ou préfixe-les COMMUN_ s'ils sont partagés.`,
      nodeIds: orphans.map((r) => r.id),
    });
  }
  if (cleanup.backToBack > 0) {
    warnings.push({
      code: 'TWO_SIDED_FACES',
      severity: 'info',
      message: `${fmt(cleanup.backToBack)} faces doublées dos à dos supprimées : l'option « Export Two-Sided Faces » était probablement activée à l'export .dae (à désactiver).`,
    });
  }
  if (cleanup.duplicate - cleanup.backToBack > 0) {
    warnings.push({ code: 'DUPLICATE_TRIANGLES', severity: 'info', message: `${fmt(cleanup.duplicate - cleanup.backToBack)} triangles en double supprimés.` });
  }
  if (cleanup.degenerate > 0) {
    warnings.push({ code: 'DEGENERATE_TRIANGLES', severity: 'info', message: `${fmt(cleanup.degenerate)} triangles dégénérés (aire nulle) supprimés.` });
  }
  const totalTriangles = top.reduce((s, r) => s + (r.context ? 0 : r.triangles), 0);
  if (totalTriangles > EXCESSIVE_TOTAL_TRIANGLES) {
    warnings.push({
      code: 'TRIANGLES_TOTAL',
      severity: 'warning',
      message: `Modèle très lourd : ${fmt(totalTriangles)} triangles. Les vues 2D seront lentes ; purge le modèle et simplifie les objets très détaillés.`,
    });
  }
  const heavy = [...role.entries()].filter(([r, ro]) => ro === 'item' && r.triangles > EXCESSIVE_ITEM_TRIANGLES).map(([r]) => r);
  if (heavy.length) {
    warnings.push({
      code: 'TRIANGLES_ITEM',
      severity: 'warning',
      message: `${heavy.length} objet(s) de plus de ${fmt(EXCESSIVE_ITEM_TRIANGLES)} triangles (vis, textes 3D, objets importés ?).`,
      nodeIds: heavy.map((r) => r.id),
    });
  }
  if (source.format === 'dae' && !hasEdges) {
    warnings.push({
      code: 'NO_EDGES',
      severity: 'info',
      message: "Le .dae ne contient pas les arêtes SketchUp (option « Export Edges » désactivée) : elles seront recalculées.",
    });
  }
  if (!manifest) {
    warnings.push({
      code: 'NO_MANIFEST',
      severity: 'info',
      message: "Pas de manifest.json : classement par les noms uniquement (les balises/tags SketchUp sont perdus dans le .dae). Utilise l'extension Viewbox pour exporter.",
    });
  } else {
    const unmatchedModules = manifest.modules.filter((m) => !moduleRecs.some((r) => r.moduleId === moduleIdFromName(m.id, rules)));
    const unmatchedEntries = allManifestEntries.filter((e) => !manifestMatched.has(e));
    if (unmatchedModules.length || unmatchedEntries.length) {
      const names = [...unmatchedModules.map((m) => m.id), ...unmatchedEntries.map((e) => e.name)];
      warnings.push({
        code: 'MANIFEST_UNMATCHED',
        severity: 'warning',
        message: `${names.length} élément(s) du manifest introuvable(s) dans le .dae (${names.slice(0, 8).join(', ')}${names.length > 8 ? '…' : ''}). Réexporte le .dae et le manifest ensemble.`,
      });
    }
  }

  // ─── 12. Sortie ───
  const nodes: NodeInfo[] = recs.map((r) => {
    const a = assignment.get(r);
    const info: NodeInfo = {
      id: r.id,
      name: r.name,
      parentId: r.parent?.id ?? null,
      kind: r.kind,
      role: r.context ? 'context' : (role.get(r) ?? 'wrapper'),
      category: r.context ? null : r.category,
      categorySource: r.context ? null : r.source,
      moduleId: r.context ? null : (a?.moduleId ?? null),
      assignment: r.context ? null : (a?.how ?? null),
      level: r.context ? null : (a?.level ?? null),
      bboxMm: toBBox(r.box),
      triangles: r.triangles,
    };
    if (r.defName && r.defName !== r.name) info.definition = r.defName;
    if (r.materials.length) info.materialNames = r.materials;
    if (r.articleRef) info.articleRef = r.articleRef;
    if (r.glass) info.glass = true;
    return info;
  });
  const contextIds = recs.filter((r) => r.context && !r.parent?.context).map((r) => r.id);
  const items = nodes.filter((n) => n.role === 'item').length;
  const stats: IngestStats = {
    nodes: recs.length,
    meshes,
    triangles: totalTriangles,
    degenerateRemoved: cleanup.degenerate,
    duplicateRemoved: cleanup.duplicate,
    backToBackRemoved: cleanup.backToBack,
    modules: moduleInfos.length,
    levels: levels.length,
    items,
    unclassified: unclassified.length,
    durationMs: Math.round(performance.now() - input.startedAt),
  };
  const severityOrder = { blocking: 0, warning: 1, info: 2 };
  warnings.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return {
    index: {
      schema: 'vem-plans-index/1',
      engineVersion: ENGINE_VERSION,
      createdAt: new Date().toISOString(),
      source: { ...source, hasEdges },
      stats,
      nodes,
      modules: moduleInfos,
      levels,
      commonIds,
      contextIds,
      warnings,
    },
    objectsById,
  };
}
