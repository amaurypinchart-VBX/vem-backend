// Données « par type de module » (S12) : une installation peut mélanger des Viewbox et des types personnalisés
// (`ModuleTypeEntry.family === 'other'`). Tout ce qui est propre à un type (poids, plancher, assemblages, surface d'appui
// des pieds) se lit ici sur le type de CE module (`PlacedModule.templateKey`), jamais sur `modules[0]`. Les Viewbox
// gardent exactement les données d'avant S12 (rien n'est ajouté aux entrées du calcul quand il n'y a que des Viewbox).
// Fonctions pures ; N, mm.
import type { PlacedModule } from './assemble';
import type { EstimateModule } from './estimate';
import type { ConnectionSet } from './checks/joints';
import { connectionSet } from './checks/joints';
import type { ConnectionEntry, JointDesignEntry, LibraryEntry, ModuleTypeEntry, SectionEntry } from './library';
import { moduleFamily } from './library';
import { materialByKey } from './materials';
import { customJointOf } from './stackJoint';
import { templateSteelWeight } from './templateView';
import type { PlacedStair } from './assemble';
import type { EdgeItem } from './loads';
import type { PlacedTerrace } from './terrace';

const G_STD = 9.81;

export interface ModuleTypeData {
  key: string;
  entry: ModuleTypeEntry | null;
  family: 'viewbox' | 'other';
  name: string;
  /** poids pesé d'une unité (N) ; null = pas de pesée (poids calculé) */
  weighed: number | null;
  mode: 'weighed' | 'computed';
  /** barres du gabarit (N, 78,5 kN/m³ comme G1) */
  steel: number;
  /** poids surfacique du plancher du type (N/mm²) : contreplaqué × couches × ρ ; 0 si inconnu */
  deck: number;
  /** surface de contact d'un pied (mm) ; null = inconnue (type personnalisé sans saisie) */
  contact: { a1: number; a2: number; jack?: { a1: number; a2: number } } | null;
  /** modules de l'étude de ce type */
  modules: string[];
}

export const typeEntryOf = (library: readonly LibraryEntry[], key: string): ModuleTypeEntry | null =>
  library.find((e): e is ModuleTypeEntry => e.kind === 'module_type' && e.key === key) ?? null;

export const isCustomType = (e: ModuleTypeEntry | null | undefined) => moduleFamily(e) === 'other';

/** Nom affiché d'un type (« Box concurrent 6 m »), sinon sa clé. */
export const typeName = (e: ModuleTypeEntry | null, key: string) => e?.name ?? key;

/** Poids surfacique du plancher d'un type (N/mm²) : épaisseur × couches × ρ du matériau. */
export function deckWeight(p: PlacedModule['params']): number {
  const d = p.frame?.deck.floor;
  const thickness = d ? d.thickness * d.layers : p.plywood.thickness * p.plywood.floorLayers;
  const rho = materialByKey(d?.material ?? p.plywood.material)?.rho ?? 0;
  return thickness * rho * G_STD * 1e-9;
}

/**
 * Types présents dans l'étude. `weights` = pesées saisies par type (kg, `Hypotheses.moduleWeights`) ; la Viewbox
 * 5900 garde `viewboxKg` (`Hypotheses.moduleWeightKg`).
 */
export function moduleTypes(
  modules: readonly PlacedModule[],
  library: readonly LibraryEntry[],
  sections: ReadonlyMap<string, SectionEntry>,
  opts: { viewboxKg: number; weights?: Record<string, number> },
): Map<string, ModuleTypeData> {
  const out = new Map<string, ModuleTypeData>();
  for (const pm of modules) {
    const cur = out.get(pm.templateKey);
    if (cur) {
      cur.modules.push(pm.id);
      continue;
    }
    const entry = typeEntryOf(library, pm.templateKey);
    const family = moduleFamily(entry);
    const userKg = opts.weights?.[pm.templateKey];
    const weighed = family === 'viewbox' ? (userKg ?? opts.viewboxKg) * G_STD : userKg !== undefined && userKg > 0 ? userKg * G_STD : (entry?.weighedN ?? null);
    out.set(pm.templateKey, {
      key: pm.templateKey,
      entry,
      family,
      name: typeName(entry, pm.templateKey),
      weighed,
      mode: weighed === null ? 'computed' : 'weighed',
      steel: templateSteelWeight(pm.params, sections),
      deck: deckWeight(pm.params),
      contact: entry?.footContact ?? (family === 'viewbox' ? { a1: 210, a2: 210 } : null),
      modules: [pm.id],
    });
  }
  return out;
}

/**
 * Entrées de charges propres aux types personnalisés (vides s'il n'y a que des Viewbox : entrées du calcul inchangées).
 * Sol d'un type sans pesée = max(sol des hypothèses ; plancher du type) — G4 de statico comprend déjà les panneaux.
 */
export function typeLoadInputs(types: ReadonlyMap<string, ModuleTypeData>, floorFinish: number) {
  const custom = [...types.values()].filter((t) => t.family === 'other');
  if (!custom.length) return {};
  return {
    moduleWeightByType: Object.fromEntries(custom.map((t) => [t.key, t.weighed ?? 0])),
    weightModeByType: Object.fromEntries(custom.map((t) => [t.key, t.mode])),
    floorFinishByType: Object.fromEntries(custom.map((t) => [t.key, Math.max(floorFinish, t.deck)])),
    typeNames: Object.fromEntries(custom.map((t) => [t.key, t.name])),
  };
}

/** Assemblages d'un type personnalisé : clés de son entrée ; absent = inconnu (jamais VBX-*). */
export function typeConnectionSet(library: readonly LibraryEntry[], entry: ModuleTypeEntry | null, key: string): ConnectionSet {
  const base = connectionSet(library);
  const c = entry?.connections ?? {};
  const get = (k: string | undefined) => (k ? library.find((e): e is ConnectionEntry => e.kind === 'connection' && e.key === k && !e.disabled) : undefined);
  const design = c.stackDesign ? library.find((e): e is JointDesignEntry => e.kind === 'joint_design' && e.key === c.stackDesign && !e.disabled) : undefined;
  return {
    typeName: typeName(entry, key),
    corner: get(c.corner),
    contact: get(c.contact),
    plate: get(c.plate),
    bolt: get(c.bolt),
    jack: get(c.jack),
    bracing: get(c.bracing) ?? base.bracing,
    // escalier : pièces du kit (accroche, attache du palier, vérins Layher), réserve ajoutée par l'étude
    stairHook: base.stairHook,
    stairLanding: base.stairLanding,
    stairJack: base.stairJack,
    ...(design ? { custom: { ...customJointOf({ design: design.design }), replaces: true } } : {}),
  };
}

export interface TypeChecks {
  /** jeu d'assemblages de chaque module d'un type personnalisé */
  perModule: Record<string, ConnectionSet>;
  /** plafond du verdict (données déclarées, relevées à confirmer, capacités saisies) */
  cap: 'none' | 'limit';
  /** raisons du plafond (« limite ») */
  notes: string[];
  /** données manquantes bloquantes (verdict incomplet) */
  blocking: string[];
  /** ce que l'outil ne vérifie pas pour ces types (rapport « Non vérifié ») */
  notVerified: string[];
}

/** Assemblages, réserves et données manquantes des types personnalisés d'une étude. */
export function typeChecks(inp: {
  modules: readonly PlacedModule[];
  library: readonly LibraryEntry[];
  sections: ReadonlyMap<string, SectionEntry>;
  jacks?: boolean;
  edgeItems?: readonly EdgeItem[];
  stairs?: readonly PlacedStair[];
  terraces?: readonly PlacedTerrace[];
}): TypeChecks {
  const out: TypeChecks = { perModule: {}, cap: 'none', notes: [], blocking: [], notVerified: [] };
  const nameOf = (id: string) => {
    const pm = inp.modules.find((m) => m.id === id);
    const e = pm ? typeEntryOf(inp.library, pm.templateKey) : null;
    return isCustomType(e) ? typeName(e, pm!.templateKey) : null;
  };
  // éléments propres à la Viewbox posés sur un autre type : réserve ou blocage (jamais vérifiés comme sur une Viewbox)
  const facade = new Set<string>();
  for (const it of inp.edgeItems ?? []) if (it.nature && nameOf(it.module)) facade.add(nameOf(it.module)!);
  for (const n of facade) out.notVerified.push(`${n} : murs, vitrages, portes et garde-corps comptés comme charges ; éléments de façade non vérifiés pour ce type.`);
  for (const st of inp.stairs ?? []) {
    const n = nameOf(st.module);
    if (!n) continue;
    out.cap = 'limit';
    out.notes.push(`${st.label} contre ${st.module} (${n}) : attache du palier supposée identique à la Viewbox, à détailler.`);
  }
  for (const t of inp.terraces ?? []) {
    const n = t.kind === 'roof' && t.module ? nameOf(t.module) : null;
    if (n) out.blocking.push(`Élément terrasse sur la toiture de ${t.module} (${n}) : prévu seulement sur une Viewbox — à retirer ou à justifier à part.`);
  }
  const seen = new Set<string>();
  for (const pm of inp.modules) {
    const entry = typeEntryOf(inp.library, pm.templateKey);
    if (!isCustomType(entry)) continue;
    const name = typeName(entry, pm.templateKey);
    out.perModule[pm.id] = typeConnectionSet(inp.library, entry, pm.templateKey);
    if (seen.has(pm.templateKey)) continue;
    seen.add(pm.templateKey);
    const c = entry!.connections ?? {};
    const fr = pm.params.frame;
    out.cap = 'limit';
    out.notes.push(`${name} : type de structure non couvert par une note de calcul de référence — pré-étude à faire confirmer par un ingénieur.`);
    // assemblages saisis ou indicatifs : « limite » au mieux
    for (const k of [c.corner, c.contact, c.plate, c.bolt, c.jack, c.bracing]) {
      const e = k ? inp.library.find((x): x is ConnectionEntry => x.kind === 'connection' && x.key === k) : undefined;
      if (e && e.status !== 'known')
        out.notes.push(
          `${name} : assemblage « ${e.name} » ${e.status === 'unknown' ? 'inconnu' : e.source.some((x) => x.ref.startsWith('copy:')) ? 'repris de la Viewbox (mêmes boulons), capacités indicatives' : 'saisi, non vérifié'}.`,
        );
    }
    if (fr) {
      if (fr.joints.column.model === 'rigid')
        out.notVerified.push(`${name} : angles poteau / cadre soudés supposés pleine résistance — à justifier.`);
      const toConfirm = [...new Set(fr.bars.filter((b) => b.role !== 'none' && b.source?.sectionStatus === 'measured').map((b) => b.section))];
      if (toConfirm.length) out.notes.push(`${name} : section(s) relevée(s) sur le modèle, à confirmer (${toConfirm.join(', ')}).`);
      const alu = [...new Set(fr.bars.filter((b) => b.role !== 'none' && materialByKey(inp.sections.get(b.section)?.material ?? '')?.family === 'aluminium').map((b) => b.section))];
      if (alu.length) out.blocking.push(`${name} : barres en aluminium (${alu.join(', ')}) non vérifiées (EN 1999 hors périmètre).`);
      const deck = fr.deck.floor;
      if (!deck) out.blocking.push(`${name} : plancher à renseigner.`);
      else if (deck.justifiedElsewhere) out.notVerified.push(`${name} : plancher justifié hors outil (fiche fabricant).`);
    }
    if (inp.jacks && !c.jack) out.blocking.push(`${name} : pieds à vérin non renseignés pour ce type — décocher « Pieds à vérin » ou saisir le vérin du type.`);
    if (!entry!.footContact) out.blocking.push(`${name} : surface d’appui d’un pied à renseigner (calage).`);
  }
  return out;
}

/**
 * Champs de l'estimation instantanée et du calage propres au type d'un module ({} pour une Viewbox : inchangé) :
 * famille, poids (pesé ou calculé), acier, sol du type, surface de contact d'un pied.
 */
export function estimateTypeFields(pm: Pick<PlacedModule, 'templateKey' | 'params'>, types: ReadonlyMap<string, ModuleTypeData>, ceiling: number, floorFinish: number): Partial<EstimateModule> {
  const t = types.get(pm.templateKey);
  if (!t || t.family !== 'other') return {};
  const area = (pm.params.x1 - pm.params.x0) * (pm.params.y1 - pm.params.y0);
  const floor = Math.max(floorFinish, t.deck);
  return {
    family: 'other',
    steelWeight: t.steel,
    weightMode: t.mode,
    floorFinish: floor,
    weight: t.weighed ?? t.steel + (ceiling + floor) * area,
    contact: t.contact ? { a1: t.contact.a1, a2: t.contact.a2 } : null,
  };
}

/** Poids d'un module ajouté par l'étude (kg) : celui de son type. */
export function moduleKg(pm: Pick<PlacedModule, 'templateKey' | 'params'>, loads: { moduleWeight: number; moduleWeightByType?: Record<string, number>; weightModeByType?: Record<string, string>; ceiling: number; floorFinish: number; floorFinishByType?: Record<string, number> }, sections: ReadonlyMap<string, SectionEntry>): number {
  if (loads.weightModeByType?.[pm.templateKey] === 'computed') {
    const area = (pm.params.x1 - pm.params.x0) * (pm.params.y1 - pm.params.y0);
    return (templateSteelWeight(pm.params, sections) + (loads.ceiling + (loads.floorFinishByType?.[pm.templateKey] ?? loads.floorFinish)) * area) / G_STD;
  }
  return (loads.moduleWeightByType?.[pm.templateKey] ?? loads.moduleWeight) / G_STD;
}
