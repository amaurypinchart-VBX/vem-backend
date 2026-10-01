// Outils du conseil ingénieur IA, exécutés dans le navigateur avec le moteur de calcul de l'étude : l'IA demande,
// le calcul répond (aucun chiffre ne vient de l'IA). Chaque outil renvoie un objet JSON compact (valeurs arrondies) ;
// les variantes simulées sont gardées (identifiant V1, V2…) pour être comparées, étudiées au sol ou appliquées.
import type { StudyRun } from '../../structure/studyRun';
import { runStudy } from '../../structure/studyRun';
import type { StudyRunner } from '../../structure/worker/study';
import type { EstimateModule } from '../../structure/core/estimate';
import type { Side } from '../../structure/core/templates/viewboxEU';
import { SIDE_NAME } from '../../structure/core/assemble';
import type { AddSide, CustomSectionSpec, SectionSlot, StudyMods } from '../../structure/core/mods';
import { customSectionEntry, describeMods, mergeMods, placedToEstimate } from '../../structure/core/mods';
import type { ConnectionEntry, SectionEntry } from '../../structure/core/library';
import { MATERIALS } from '../../structure/core/materials';
import { computeCalage, maxPublic } from '../../structure/core/calage';
import { VIEWBOX_STOCK, bearingFrom } from '../../structure/core/ground';
import type { BearingUnit } from '../../structure/core/ground';
import { kgm2 } from '../../structure/core/roadway';
import { jackSpec, connectionSet } from '../../structure/core/checks/joints';
import type { Issue, VariantChanges } from '../../structure/advisor/diagnose';
import { diagnose, slidingBallastN } from '../../structure/advisor/diagnose';
import type { RunDigest } from '../../structure/advisor/digest';
import { compareDigests, runDigest } from '../../structure/advisor/digest';
import type { InputsSource } from './studyInputs';
import { buildStudyInputs } from './studyInputs';
import type { StructureStock } from './GroundPanel';
import { calageInput } from './GroundPanel';

export interface Variant {
  id: string;
  title: string;
  changes: VariantChanges;
  digest: RunDigest;
  /** changements lisibles */
  lines: string[];
  createdAt: string;
  applied?: boolean;
  /** empreinte de l'étude sur laquelle la variante a été calculée */
  baseKey?: string;
  /** calcul complet (absent après rechargement : recalculé à la demande) */
  run?: StudyRun;
}

export interface AdvisorContext {
  source: InputsSource;
  /** calcul de l'étude actuelle (lancé si besoin) */
  ensureRun: () => Promise<StudyRun>;
  runner: () => StudyRunner;
  groundModules: EstimateModule[];
  stock: StructureStock;
  variants: Variant[];
  addVariant: (v: Variant) => void;
  confirmApply: (v: Variant, reason: string) => Promise<boolean>;
  onProgress?: (text: string) => void;
  signal?: AbortSignal;
}

type Json = Record<string, unknown>;

const r2 = (v: number) => (Number.isFinite(v) ? Math.round(v * 100) / 100 : null);
const r1 = (v: number) => (Number.isFinite(v) ? Math.round(v * 10) / 10 : null);
const kN = (n: number) => r1(n / 1e3);

const SIDE_IN: Record<string, Side> = { grand_cote_1: 'v0', grand_cote_2: 'v1', petit_cote_1: 'u0', petit_cote_2: 'u1' };
const SLOTS: SectionSlot[] = ['rim-floor', 'rim-roof', 'secondary-floor', 'secondary-roof', 'column', 'foot-corner', 'foot-middle'];

class ToolError extends Error {}
const fail = (m: string): never => {
  throw new ToolError(m);
};
const num = (v: unknown, what: string, min = -Infinity, max = Infinity): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v.replace(',', '.')) : NaN;
  if (!Number.isFinite(n) || n < min || n > max) fail(`${what} : nombre entre ${min} et ${max} attendu`);
  return n;
};
const bool = (v: unknown) => v === true || v === 'true';
const arr = (v: unknown): Json[] => (Array.isArray(v) ? (v as Json[]) : v === undefined || v === null ? [] : fail('liste attendue'));

/** Section demandée par l'IA : clé du catalogue ou section créée (propriétés calculées ici). */
function sectionOf(x: Json, mods: StudyMods, library: InputsSource['library']): string {
  if (typeof x.section === 'string' && x.section) {
    if (!library.some((e) => e.kind === 'section' && e.key === x.section) && !mods.customSections?.some((c) => c.key === x.section)) fail(`section ${x.section} absente du catalogue (outil catalogue)`);
    return x.section;
  }
  const c = x.section_creee as Json | undefined;
  if (!c) fail('section ou section_creee requise');
  const spec: CustomSectionSpec = {
    shape: c!.forme as CustomSectionSpec['shape'],
    h: c!.h === undefined ? undefined : num(c!.h, 'h', 1, 2000),
    b: c!.b === undefined ? undefined : num(c!.b, 'b', 1, 2000),
    t: c!.t === undefined ? undefined : num(c!.t, 't', 0.5, 100),
    d: c!.d === undefined ? undefined : num(c!.d, 'd', 1, 2000),
    material: String(c!.materiau),
    fabrication: c!.fabrication === 'formé à froid' ? 'cold-formed' : 'hot-finished',
  };
  let entry: SectionEntry;
  try {
    entry = customSectionEntry(spec);
  } catch (e) {
    return fail((e as Error).message);
  }
  mods.customSections = [...(mods.customSections ?? []).filter((s) => s.key !== entry.key), { ...spec, key: entry.key }];
  return entry.key;
}

/** Changements demandés (clés en français de l'outil) → changements de variante. */
export function parseChanges(inp: Json, library: InputsSource['library']): VariantChanges {
  const out: VariantChanges = {};
  const h = (inp.hypotheses ?? {}) as Json;
  const hyp: Record<string, unknown> = {};
  if (h.exploitation_kN_m2 !== undefined) hyp.live = num(h.exploitation_kN_m2, 'exploitation', 0, 20);
  if (h.exploitation_toiture_kN_m2 !== undefined) hyp.roofLive = num(h.exploitation_toiture_kN_m2, 'exploitation toiture', 0, 20);
  if (h.evacuer_dernier_niveau !== undefined) hyp.evacuateTop = bool(h.evacuer_dernier_niveau);
  if (h.vent_en_service_kN_m2 !== undefined) hyp.windIn = num(h.vent_en_service_kN_m2, 'vent en service', 0, 5);
  if (h.vent_hors_service_kN_m2 !== undefined) hyp.windOut = num(h.vent_hors_service_kN_m2, 'vent hors service', 0, 5);
  if (h.charge_forfaitaire_kN_par_viewbox !== undefined) hyp.extraKN = num(h.charge_forfaitaire_kN_par_viewbox, 'charge forfaitaire', 0, 500);
  if (h.pieds_centraux !== undefined) hyp.middleFeet = bool(h.pieds_centraux);
  if (Object.keys(hyp).length) out.hyp = hyp;
  if (h.toitures_accessibles !== undefined) out.roof = bool(h.toitures_accessibles);
  const o = (inp.options_calcul ?? {}) as Json;
  const calc: VariantChanges['calc'] = {};
  if (o.pieds_a_verin !== undefined) calc.jacks = bool(o.pieds_a_verin);
  if (o.sortie_verin_mm !== undefined) calc.jackExtension = num(o.sortie_verin_mm, 'sortie des vérins', 0, 50);
  if (o.frottement !== undefined) calc.friction = num(o.frottement, 'frottement', 0.05, 1);
  if (Object.keys(calc).length) out.calc = calc;
  const m = (inp.modifications ?? {}) as Json;
  const mods: StudyMods = {};
  const secs = arr(m.sections).map((s) => {
    const slot = s.barres as SectionSlot;
    if (!SLOTS.includes(slot)) fail(`barres ${String(s.barres)} inconnues`);
    return { slot, section: sectionOf(s, mods, library), modules: Array.isArray(s.viewbox) && s.viewbox.length ? (s.viewbox as string[]) : undefined };
  });
  if (secs.length) mods.sections = secs;
  const ballast = arr(m.lest).map((b) => ({ module: String(b.viewbox), kg: num(b.kg, 'lest', 0, 50000) }));
  if (ballast.length) mods.ballast = ballast;
  const braces = arr(m.contreventements).map((b) => ({ module: String(b.viewbox), side: SIDE_IN[String(b.cote)] ?? fail(`côté ${String(b.cote)} inconnu`) }));
  if (braces.length) mods.bracings = braces;
  const added = arr(m.viewbox_ajoutees).map((a) => ({ id: String(a.id), from: String(a.a_cote_de), side: (a.cote === 'dessus' ? 'top' : (SIDE_IN[String(a.cote)] ?? fail(`côté ${String(a.cote)} inconnu`))) as AddSide }));
  if (added.length) mods.addedModules = added;
  if (m.surelevation === null) mods.raise = null;
  else if (m.surelevation) {
    const s = m.surelevation as Json;
    mods.raise = { height: num(s.hauteur_mm, 'hauteur de surélévation', 50, 3000), section: sectionOf(s, mods, library), top: s.tete === 'articulee' ? 'pinned' : 'rigid', bracing: bool(s.croix) };
  }
  if (m.plats_empilement) {
    const p = m.plats_empilement as Json;
    mods.stackPlates = { perLongSide: num(p.par_grand_cote, 'plats par grand côté', 0, 6), perShortSide: num(p.par_petit_cote, 'plats par petit côté', 0, 4) };
  }
  if (Object.keys(mods).length) out.mods = mods;
  return out;
}

/** Deux jeux de changements l'un après l'autre. */
export function stackChanges(a: VariantChanges | undefined, b: VariantChanges): VariantChanges {
  return {
    hyp: { ...(a?.hyp ?? {}), ...(b.hyp ?? {}) },
    roof: b.roof ?? a?.roof,
    calc: { ...(a?.calc ?? {}), ...(b.calc ?? {}) },
    mods: mergeMods(a?.mods, b.mods),
  };
}

/** Sources du calcul d'une variante : étude actuelle + changements. */
export function variantSource(src: InputsSource, ch: VariantChanges): InputsSource {
  return {
    ...src,
    hyp: { ...src.hyp, ...(ch.hyp ?? {}) } as InputsSource['hyp'],
    roof: ch.roof ?? src.roof,
    calc: { ...src.calc, ...(ch.calc ?? {}) },
    mods: mergeMods(src.mods, ch.mods),
  };
}

export function changeLines(ch: VariantChanges, library: InputsSource['library']): string[] {
  const names = (k: string) => {
    const e = library.find((x) => x.kind === 'section' && x.key === k) as SectionEntry | undefined;
    if (e) return e.section.name;
    const c = ch.mods?.customSections?.find((x) => x.key === k);
    return c ? customSectionEntry(c).name : k;
  };
  const out: string[] = [];
  const H: Record<string, string> = { live: 'exploitation (kN/m²)', roofLive: 'exploitation toiture (kN/m²)', evacuateTop: 'dernier niveau évacué', windIn: 'vent en service (kN/m²)', windOut: 'vent hors service (kN/m²)', extraKN: 'charge forfaitaire (kN par Viewbox)', middleFeet: 'pieds centraux calés' };
  for (const [k, v] of Object.entries(ch.hyp ?? {})) out.push(`${H[k] ?? k} : ${typeof v === 'boolean' ? (v ? 'oui' : 'non') : String(v).replace('.', ',')}`);
  if (ch.roof !== undefined) out.push(`toitures accessibles : ${ch.roof ? 'oui' : 'non'}`);
  const C: Record<string, string> = { jacks: 'pieds à vérin', jackExtension: 'sortie des vérins (mm)', friction: 'frottement μ' };
  for (const [k, v] of Object.entries(ch.calc ?? {})) out.push(`${C[k] ?? k} : ${typeof v === 'boolean' ? (v ? 'oui' : 'non') : String(v).replace('.', ',')}`);
  out.push(...describeMods(ch.mods, names));
  return out;
}

async function simulate(ctx: AdvisorContext, title: string, changes: VariantChanges, extra?: { classes?: Array<'ULS' | 'STAB' | 'SLS'> }): Promise<StudyRun> {
  const { inputs, warnings } = buildStudyInputs(variantSource(ctx.source, changes));
  if (warnings.length) fail(warnings.join(' ; '));
  ctx.onProgress?.(`Calcul : ${title}…`);
  return runStudy({ ...inputs, classes: extra?.classes }, ctx.runner(), (d, t) => ctx.onProgress?.(`Calcul : ${title} (${d} / ${t} combinaisons)`), ctx.signal);
}

let counter = 0;
function newVariant(ctx: AdvisorContext, title: string, changes: VariantChanges, run: StudyRun): Variant {
  const used = new Set(ctx.variants.map((v) => v.id));
  counter = Math.max(counter, ...ctx.variants.map((v) => Number(v.id.slice(1)) || 0));
  let id = `V${++counter}`;
  while (used.has(id)) id = `V${++counter}`;
  const v: Variant = { id, title, changes, digest: runDigest(run, changes.calc?.friction ?? ctx.source.calc.friction), lines: changeLines(changes, ctx.source.library), createdAt: new Date().toISOString(), run };
  ctx.addVariant(v);
  return v;
}

async function variantRun(ctx: AdvisorContext, id: string | undefined): Promise<{ run: StudyRun; variant?: Variant }> {
  if (!id) return { run: await ctx.ensureRun() };
  const v = ctx.variants.find((x) => x.id === id) ?? fail(`variante ${id} inconnue`);
  v!.run ??= await simulate(ctx, v!.title, v!.changes);
  return { run: v!.run!, variant: v! };
}

/** Pistes du diagnostic, avec leur identifiant « problème/piste ». */
function remedies(run: StudyRun, friction: number): { issues: Issue[]; byId: Map<string, VariantChanges> } {
  const issues = diagnose(run, { friction });
  const byId = new Map<string, VariantChanges>();
  for (const i of issues) for (const r of i.remedies) if (r.changes) byId.set(`${i.id}/${r.id}`, r.changes);
  return { issues, byId };
}

function neighbours(run: StudyRun) {
  const s = run.structure;
  const pairs = new Map<string, Set<string>>();
  for (const m of s.meta)
    if (m.family === 'bolt' || m.family === 'contact') {
      const [a, b] = m.line.split(':')[1].split('/');
      if (!pairs.has(a)) pairs.set(a, new Set());
      if (!pairs.has(b)) pairs.set(b, new Set());
      pairs.get(a)!.add(b);
      pairs.get(b)!.add(a);
    }
  const below = new Map<string, string>();
  for (const m of s.meta) if (m.family === 'corner-link') below.set(m.module, m.label.split(' / ')[0]);
  return s.modules.map((m) => ({ viewbox: m.id, niveau: m.level, voisines: [...(pairs.get(m.id) ?? [])], sur: below.get(m.id) ?? null, x_m: r2(m.origin[0] / 1e3), y_m: r2(-m.origin[2] / 1e3) }));
}

// ─── outils ───

export async function runAdvisorTool(name: string, input: Json, ctx: AdvisorContext): Promise<Json> {
  const src = ctx.source;
  const friction = src.calc.friction;
  switch (name) {
    case 'etat_etude': {
      const run = await ctx.ensureRun();
      const jack = jackSpec(connectionSet(src.library));
      const bolt = src.library.find((e) => e.kind === 'connection' && e.key === 'VBX-HORIZONTAL-BOLT') as ConnectionEntry | undefined;
      const plate = src.library.find((e) => e.kind === 'connection' && e.key === 'VBX-VERTICAL-PLATE') as ConnectionEntry | undefined;
      const capOf = (c: ConnectionEntry | undefined, k: string) => c?.capacities.find((x) => x.key === k)?.value;
      const h = src.hyp;
      return {
        etude: runDigest(run, friction),
        hypotheses: {
          exploitation_kN_m2: h.live,
          exploitation_toiture_kN_m2: h.roofLive,
          toitures_accessibles: src.roof,
          evacuer_dernier_niveau_hors_service: h.evacuateTop,
          vent_en_service_kN_m2: h.windIn,
          vent_hors_service_kN_m2: h.windOut,
          poids_viewbox_kg: h.moduleWeightKg,
          charge_forfaitaire_kN_par_viewbox: h.extraKN,
          portance: { valeur: h.bearingValue, unite: h.bearingUnit, kN_m2: r1(bearingFrom(h.bearingValue, h.bearingUnit) * 1e3), kg_m2: Math.round(kgm2(bearingFrom(h.bearingValue, h.bearingUnit))) },
          public_pour_le_sol: h.publicMode === 'persons' ? { personnes: h.persons, kg_par_personne: h.personKg } : 'charge réglementaire',
        },
        options_calcul: { methode_ec3: src.calc.ec3Method, pieds_a_verin: src.calc.jacks, sortie_verin_mm: src.calc.jackExtension, frottement: friction, pression_interieure_plancher: src.calc.internalPressure },
        verins: jack ? { tige: `Tr ${jack.d} × 5`, sortie_max_mm: jack.extensionMax, sortie_max_cm: jack.extensionMax / 10, par_viewbox: jack.perModule } : null,
        assemblages: {
          boulons_entre_viewbox: bolt ? { diametre_mm: capOf(bolt, 'd'), longueur_mm: capOf(bolt, 'length'), FvRd_kN: kN(Math.min(capOf(bolt, 'FvRd') ?? Infinity, capOf(bolt, 'FbRd') ?? Infinity)), FtRd_kN: kN(Math.min(capOf(bolt, 'FtRd') ?? Infinity, capOf(bolt, 'BpRd') ?? Infinity)) } : null,
          plats_empilement: plate ? { par_grand_cote: src.mods?.stackPlates?.perLongSide ?? capOf(plate, 'perLongSide'), par_petit_cote: src.mods?.stackPlates?.perShortSide ?? capOf(plate, 'perShortSide'), HRd_kN_par_plat: kN(capOf(plate, 'HRd') ?? NaN), soulevement_kN_par_plat: kN(Math.min(...['FvRd_M20', 'FbRd_plate', 'FbRd_web', 'NuRd_plate'].map((k) => capOf(plate, k) ?? Infinity))) } : null,
        },
        modifications_appliquees: changeLines({ mods: src.mods }, src.library),
        viewbox: neighbours(run),
        variantes: ctx.variants.map((v) => ({ id: v.id, titre: v.title, verdict: v.digest.verdict, appliquee: !!v.applied })),
      };
    }
    case 'diagnostic': {
      const run = await ctx.ensureRun();
      const { issues } = remedies(run, friction);
      return {
        verdict: run.verdict.verdict,
        problemes: issues.map((i) => ({
          id: i.id,
          gravite: i.severity,
          titre: i.title,
          ou: i.where,
          viewbox: i.modules,
          pourquoi: i.why,
          pistes: i.remedies.map((r) => ({ piste: `${i.id}/${r.id}`, titre: r.title, detail: r.detail, simulable: r.action === 'simulate', lest_a_chercher: r.action === 'ballast' ? r.modules : undefined, piece_speciale: r.special || undefined })),
        })),
      };
    }
    case 'details_element': {
      const { run } = await variantRun(ctx, typeof input.variante === 'string' ? input.variante : undefined);
      const t = run.index.items.findIndex((i) => i.id === input.id);
      if (t < 0) fail(`vérification ${String(input.id)} inconnue (outil lister_elements)`);
      const it = run.index.items[t];
      const st = run.summary.states[t];
      return { id: it.id, element: it.label, famille: it.family, viewbox: it.module, eta: st ? r2(st.eta) : null, verification: st?.governing, combinaison: st?.combo, bloque: st?.blocked, formules: (st?.records ?? []).map((r) => ({ titre: r.title, norme: r.clause, formule: r.formula, valeurs: r.withValues, eta: r.eta === undefined ? undefined : r2(r.eta) })) };
    }
    case 'lister_elements': {
      const run = await ctx.ensureRun();
      const max = Math.min(60, Math.max(1, Math.round(Number(input.max) || 25)));
      const fam = typeof input.famille === 'string' ? input.famille.toLowerCase() : '';
      const vb = typeof input.viewbox === 'string' ? input.viewbox : '';
      const min = Number.isFinite(Number(input.eta_min)) ? Number(input.eta_min) : -Infinity;
      const rows = run.verdict.ranking
        .map((t) => ({ it: run.index.items[t], st: run.summary.states[t] }))
        .filter(({ it, st }) => (!fam || it.family.toLowerCase().includes(fam)) && (!vb || it.module === vb) && (st?.eta ?? Infinity) >= min)
        .slice(0, max);
      return { elements: rows.map(({ it, st }) => ({ id: it.id, element: it.label, famille: it.family, eta: st ? r2(st.eta) : null, verification: st?.governing, combinaison: st?.combo, bloque: st?.blocked })) };
    }
    case 'catalogue': {
      const quoi = String(input.quoi);
      if (quoi === 'sections')
        return {
          sections: src.library
            .filter((e): e is SectionEntry => e.kind === 'section' && !e.disabled && !e.section.massless)
            .map((e) => ({ cle: e.key, nom: e.section.name, materiau: e.material, A_cm2: r2(e.section.A / 100), Iy_cm4: r1(e.section.Iy / 1e4), Iz_cm4: r1(e.section.Iz / 1e4), Wely_cm3: r1(e.section.Wely / 1e3), kg_m: r1(e.section.kgPerM ?? NaN) })),
          sections_creees: 'Toute section en tube carré (SHS), rectangulaire (RHS), rond (CHS), rond plein ou bois rectangulaire peut être créée avec section_creee (propriétés calculées par l’outil).',
        };
      if (quoi === 'materiaux') return { materiaux: MATERIALS.filter((m) => m.family === 'steel' || m.family === 'timber').map((m) => ({ cle: m.key, nom: m.name, famille: m.family, fy_ou_fmk: m.ranges?.[0]?.fy ?? m.strength?.fmk ?? null })) };
      if (quoi === 'plaques') {
        const stock = ctx.stock.plates.length ? ctx.stock.plates : VIEWBOX_STOCK;
        return { stock: stock.map((p) => ({ plaque: `${p.length / 10} × ${p.width / 10} cm × ${p.thickness} mm`, materiau: p.material ?? 'F40', quantite: p.quantity || 'non renseignée' })), commerce: ctx.stock.commercial.map((c) => ({ plaque: c.label, dimensions_cm: `${c.length / 10} × ${c.width / 10}`, charge_admissible_kN: kN(c.capacity), kg: c.massKg })) };
      }
      return {
        assemblages: src.library
          .filter((e): e is ConnectionEntry => e.kind === 'connection' && e.key.startsWith('VBX-') && !e.disabled)
          .map((c) => ({ cle: c.key, nom: c.name, composition: c.composition, capacites: c.capacities.map((x) => ({ nom: x.label, valeur: x.unit === 'N' ? kN(x.value) : x.unit === 'N·mm' ? r2(x.value / 1e6) : x.value, unite: x.unit === 'N' ? 'kN' : x.unit === 'N·mm' ? 'kNm' : x.unit })) })),
      };
    }
    case 'simuler_variante': {
      const title = String(input.titre ?? 'Variante').slice(0, 120);
      await ctx.ensureRun();
      let changes: VariantChanges = {};
      if (typeof input.base === 'string' && input.base) changes = (ctx.variants.find((v) => v.id === input.base) ?? fail(`variante ${String(input.base)} inconnue`)).changes;
      if (typeof input.piste === 'string' && input.piste) {
        const run = await ctx.ensureRun();
        const ch = remedies(run, friction).byId.get(input.piste) ?? fail(`piste ${input.piste} inconnue ou non simulable (outil diagnostic)`);
        changes = stackChanges(changes, ch);
      }
      changes = stackChanges(changes, parseChanges(input, src.library));
      const before = runDigest(await ctx.ensureRun(), friction);
      const run = await simulate(ctx, title, changes);
      const v = newVariant(ctx, title, changes, run);
      return { variante: v.id, titre: title, changements: v.lines, comparaison: compareDigests(before, v.digest), installation: v.digest.installation };
    }
    case 'chercher_lest': {
      const obj = String(input.objectif ?? 'les_deux');
      const baseV = typeof input.base === 'string' && input.base ? (ctx.variants.find((v) => v.id === input.base) ?? fail(`variante ${String(input.base)} inconnue`)) : undefined;
      const { run: run0 } = await variantRun(ctx, baseV?.id);
      const baseChanges = baseV?.changes ?? {};
      const mu = baseChanges.calc?.friction ?? friction;
      const ground = run0.structure.modules.filter((m) => m.level === 0).map((m) => m.id);
      const mods = Array.isArray(input.viewbox) && input.viewbox.length ? (input.viewbox as string[]) : ground;
      for (const m of mods) if (!run0.structure.modules.some((x) => x.id === m)) fail(`Viewbox ${m} inconnue`);
      const maxKg = Math.min(20000, num(input.max_kg_par_viewbox ?? 5000, 'max_kg_par_viewbox', 100, 20000));
      const step = 100;
      const withKg = (kg: number): VariantChanges => stackChanges(baseChanges, { mods: { ballast: mods.map((module) => ({ module, kg })) } });
      let kgSlide = 0;
      if (obj !== 'basculement') {
        // glissement : exact (le lest ajoute son poids, le vent ne change pas)
        const need = slidingBallastN(run0, mu);
        kgSlide = need > 0 ? Math.ceil(need / 9.81 / mods.length / step) * step : 0;
      }
      let kgOver = 0;
      let overNote = 'basculement non recherché';
      if (obj !== 'glissement') {
        const stable = async (kg: number) => {
          const r = await simulate(ctx, `stabilité avec ${kg} kg par Viewbox`, withKg(kg), { classes: ['STAB'] });
          return r.stability.overturning.verdict === 'ok';
        };
        if (await stable(0)) overNote = 'stable sans lest';
        else if (!(await stable(maxKg))) {
          overNote = `instable même avec ${maxKg} kg par Viewbox : le lest ne suffit pas, élargir la base ou ancrer`;
          kgOver = Infinity;
        } else {
          let [lo, hi] = [0, maxKg];
          while (hi - lo > step) {
            const mid = Math.round((lo + hi) / 2 / step) * step;
            if (mid <= lo || mid >= hi) break;
            if (await stable(mid)) hi = mid;
            else lo = mid;
          }
          kgOver = hi;
          overNote = `stable à partir de ${hi} kg par Viewbox (par pas de ${step} kg)`;
        }
      }
      if (!Number.isFinite(kgOver)) return { lest_trouve: false, viewbox: mods, glissement_kg_par_viewbox: kgSlide, basculement: overNote };
      const kg = Math.max(kgSlide, kgOver);
      if (kg <= 0) return { lest_trouve: true, lest_kg_par_viewbox: 0, basculement: overNote, detail: 'aucun lest nécessaire pour cet objectif' };
      if (kg > maxKg) return { lest_trouve: false, viewbox: mods, glissement_kg_par_viewbox: kgSlide, basculement: overNote, detail: `plus de ${maxKg} kg par Viewbox nécessaires` };
      const title = `Lest ${kg} kg sur ${mods.join(', ')}`;
      const before = runDigest(run0, mu);
      const run = await simulate(ctx, title, withKg(kg));
      const v = newVariant(ctx, title, withKg(kg), run);
      return { lest_trouve: true, lest_kg_par_viewbox: kg, lest_total_kg: kg * mods.length, viewbox: mods, glissement_kg_par_viewbox: kgSlide, basculement: overNote, variante: v.id, comparaison: compareDigests(before, v.digest) };
    }
    case 'etudier_sol': {
      const { run, variant } = await variantRun(ctx, typeof input.variante === 'string' && input.variante ? input.variante : undefined);
      const vs = variant ? variantSource(src, variant.changes) : src;
      const hyp = { ...vs.hyp };
      if (input.portance) {
        const p = input.portance as Json;
        hyp.bearingValue = num(p.valeur, 'portance', 0.1, 1e6);
        hyp.bearingUnit = String(p.unite) as BearingUnit;
      }
      if (input.public_personnes === null) hyp.publicMode = 'norm';
      else if (input.public_personnes !== undefined) {
        hyp.publicMode = 'persons';
        hyp.persons = Math.round(num(input.public_personnes, 'public', 0, 100000));
      }
      if (input.kg_par_personne !== undefined) hyp.personKg = num(input.kg_par_personne, 'kg par personne', 30, 200);
      if (input.plaques_roulage !== undefined) hyp.calage = { ...(hyp.calage ?? {}), roadway: bool(input.plaques_roulage) };
      const addedIds = new Set(run.structure.modules.map((m) => m.id));
      const modules = [...ctx.groundModules.filter((m) => addedIds.has(m.id)), ...run.structure.modules.filter((m) => !ctx.groundModules.some((g) => g.id === m.id)).map(placedToEstimate)];
      const cin = { ...calageInput(modules, hyp, ctx.stock, vs.calc.jacks), reactions: run.ground };
      const cal = computeCalage(cin);
      const mp = maxPublic(cin, hyp.personKg);
      const q = bearingFrom(hyp.bearingValue, hyp.bearingUnit);
      return {
        portance: { valeur: hyp.bearingValue, unite: hyp.bearingUnit, kN_m2: r2(q * 1e3), kg_m2: Math.round(kgm2(q)), t_m2: r2(kgm2(q) / 1000), kg_cm2: r2(kgm2(q) / 1e4) },
        public: hyp.publicMode === 'persons' ? { personnes: hyp.persons, kg_par_personne: hyp.personKg } : 'charge réglementaire',
        types_appui: cal.types.map((t) => ({
          type: t.label,
          appuis: t.reactions.map((r) => r.group.id),
          Rk_kN: kN(t.Rzk),
          REd_kN: kN(t.RzEd),
          solution: t.chosen ? { titre: t.chosen.title, resume: t.chosen.summary, faisable: t.chosen.feasible, eta: r2(t.chosen.eta), reserves: t.chosen.remarks } : null,
          appui_le_plus_charge: t.checks.length ? (() => {
            const c = t.checks.reduce((a, b) => (b.eta > a.eta ? b : a));
            return { appui: c.id, pression_kN_m2: r1(c.pressure * 1e3), pression_kg_m2: Math.round(kgm2(c.pressure)), eta: r2(c.eta), surface_necessaire_m2: r2(c.areaRequired / 1e6), conseil: c.advice };
          })() : null,
          conseil: t.advice,
        })),
        tout_passe: cal.checks.every((c) => c.eta <= 1),
        plaques_de_roulage: { retenues: cal.roadwayOn, pression_moyenne_kN_m2: r2(cal.roadway.mean * 1e3), pression_moyenne_kg_m2: Math.round(kgm2(cal.roadway.mean)), eta_moyen: r2(cal.roadway.etaMean), eta_max: r2(cal.roadway.etaMax), surface_m2: r1(cal.roadway.area / 1e6), charge_totale_kN: kN(cal.roadway.load) },
        public_maximal: mp ? { personnes: mp.persons, public_reglementaire_complet_en_personnes: mp.fullPersons, le_public_reglementaire_passe: mp.full, ne_passe_pas_meme_sans_public: mp.empty } : null,
        materiel: cal.materials.map((m) => ({ designation: m.label, dimensions: m.dims, quantite: m.quantity, kg: r1(m.massKg) })),
        avertissements: cal.warnings.slice(0, 5),
      };
    }
    case 'appliquer_variante': {
      const v = ctx.variants.find((x) => x.id === input.variante) ?? fail(`variante ${String(input.variante)} inconnue`);
      const ok = await ctx.confirmApply(v!, String(input.raison ?? ''));
      return ok ? { appliquee: true, variante: v!.id, detail: 'L’utilisateur a appliqué la variante : c’est maintenant l’étude actuelle.' } : { appliquee: false, detail: 'L’utilisateur a refusé d’appliquer la variante.' };
    }
    default:
      return fail(`outil ${name} inconnu`);
  }
}

export { ToolError, SIDE_NAME };
