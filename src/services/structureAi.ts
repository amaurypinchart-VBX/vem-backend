// src/services/structureAi.ts
// IA de l'étude structure (Plans Viewbox, phase S7) — côté serveur uniquement, jamais pour calculer :
//   identify  : proposer ce qu'est une pièce inconnue (rôle, nature, matériau, section, poids) — reste « proposé »
//   group     : regrouper des types de pièces qui sont la même chose
//   extract   : lire un document de référence (PDF) et proposer des entrées de bibliothèque avec la page source
//   write     : rédiger description, consignes et conclusion du rapport — aucun nombre hors des données fournies
//   review    : relire la cohérence d'une étude — alertes affichées, les calculs ne changent pas
// Chaque appel est journalisé (table struct_ai_calls : jetons, coût estimé, durée). Sans clé API, les routes
// répondent 503 et l'outil reste utilisable à la main.
import { z } from 'zod';
import { prisma } from '../config/database';
import { AppError } from '../utils/AppError';
import { logger } from '../utils/logger';
import { anthropicRequest } from './aiService';
import type { Citation, IdentifyLike, IdentifyOptions } from './structureAiGuard';
import { checkText, citationsOf, costOf, normalizeGroups, normalizeIdentify, numbersIn, verifyExtract } from './structureAiGuard';

const db = prisma as any;

/** Modèle de l'étude structure : variable dédiée, sinon celui de l'application. */
export const STRUCTURE_MODEL = process.env.ANTHROPIC_MODEL_STRUCTURE || process.env.ANTHROPIC_MODEL || 'claude-opus-5-5';

export const aiEnabled = () => !!process.env.ANTHROPIC_API_KEY;

export interface CallContext {
  userId?: string;
  studyId?: string | null;
}

export interface Usage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number | null;
  durationMs: number;
}

async function logCall(kind: string, ctx: CallContext, u: Partial<Usage>, ok: boolean, error?: string) {
  logger.info(`[structureAi] ${kind} ${ok ? 'ok' : 'échec'} — ${u.model} ${u.inputTokens ?? 0}+${u.outputTokens ?? 0} jetons, ${u.costUsd?.toFixed(4) ?? '?'} $, ${u.durationMs} ms${error ? ` — ${error}` : ''}`);
  try {
    await db.structAiCall.create({
      data: {
        kind,
        model: u.model ?? STRUCTURE_MODEL,
        inputTokens: u.inputTokens ?? 0,
        outputTokens: u.outputTokens ?? 0,
        costUsd: u.costUsd ?? null,
        durationMs: u.durationMs ?? 0,
        ok,
        error: error?.slice(0, 500) ?? null,
        userId: ctx.userId ?? null,
        studyId: ctx.studyId ?? null,
      },
    });
  } catch (e: any) {
    logger.warn(`[structureAi] journal non écrit : ${e.message}`);
  }
}

interface AskResult {
  data: any;
  /** textes de la réponse mis bout à bout (les citations découpent le texte en plusieurs blocs) */
  text: string;
  usage: Usage;
}

/** Appel à Claude : journalisé, refus et réponse coupée signalés clairement. */
async function ask(kind: string, ctx: CallContext, system: string, content: any[], maxTokens: number, timeoutMs: number): Promise<AskResult> {
  if (!aiEnabled()) throw new AppError('IA non configurée (clé API absente) : continuer à la main.', 503);
  const t0 = Date.now();
  let data: any;
  try {
    data = await anthropicRequest({ model: STRUCTURE_MODEL, max_tokens: maxTokens, system, messages: [{ role: 'user', content }] }, { timeoutMs, retries: 1 });
  } catch (e: any) {
    await logCall(kind, ctx, { model: STRUCTURE_MODEL, durationMs: Date.now() - t0 }, false, e.message);
    throw e;
  }
  const model = data.model ?? STRUCTURE_MODEL;
  const usage: Usage = {
    model,
    inputTokens: (data.usage?.input_tokens ?? 0) + (data.usage?.cache_read_input_tokens ?? 0) + (data.usage?.cache_creation_input_tokens ?? 0),
    outputTokens: data.usage?.output_tokens ?? 0,
    costUsd: costOf(model, data.usage ?? {}),
    durationMs: Date.now() - t0,
  };
  const stop = data.stop_reason;
  await logCall(kind, ctx, usage, stop !== 'refusal' && stop !== 'max_tokens', stop === 'refusal' || stop === 'max_tokens' ? `stop_reason=${stop}` : undefined);
  if (stop === 'refusal') throw new AppError('L’IA a refusé de répondre à cette demande : continuer à la main.', 422);
  if (stop === 'max_tokens') throw new AppError('Réponse de l’IA coupée (trop longue) : réessayer avec moins de données.', 502);
  const text = (data.content || [])
    .filter((b: any) => b.type === 'text')
    .map((b: any) => b.text)
    .join('');
  return { data, text, usage };
}

/** Premier objet JSON de la réponse, validé par le schéma. */
function parseJson<T>(text: string, schema: z.ZodType<T, any, any>): T {
  const cleaned = text.replace(/```json|```/g, '');
  const a = cleaned.indexOf('{');
  const b = cleaned.lastIndexOf('}');
  if (a < 0 || b <= a) throw new AppError('Réponse de l’IA illisible (pas de JSON) : réessayer ou continuer à la main.', 502);
  let raw: unknown;
  try {
    raw = JSON.parse(cleaned.slice(a, b + 1));
  } catch {
    throw new AppError('Réponse de l’IA illisible (JSON invalide) : réessayer ou continuer à la main.', 502);
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    logger.error(`[structureAi] réponse hors schéma : ${parsed.error.message.slice(0, 500)}`);
    throw new AppError('Réponse de l’IA hors du format attendu : réessayer ou continuer à la main.', 502);
  }
  return parsed.data;
}

const BASE_RULES = [
  'Tu assistes VEM, l’outil interne de Viewbox International SA pour la pré-étude structurelle de constructions temporaires (« Fliegende Bauten ») faites de modules acier Viewbox de 5,90 × 2,50 × 3,08 m, juxtaposés et empilés.',
  'Règle absolue : tu ne calcules rien. Tous les efforts, contraintes, taux de travail, réactions et dimensions viennent du moteur de calcul de l’outil. Tu n’inventes aucun chiffre.',
  'Réponds uniquement par un objet JSON conforme au format demandé, sans texte autour.',
].join('\n');

// ─── identify ───

const ImageIn = z.object({ media: z.enum(['image/jpeg', 'image/png']), data: z.string().max(4_000_000), caption: z.string().max(200) });

export const IdentifyInput = z.object({
  type: z.object({
    label: z.string().max(300),
    kind: z.enum(['item', 'module']),
    category: z.string().max(80).nullable().optional(),
    definition: z.string().max(300).nullable().optional(),
    designation: z.string().max(300).nullable().optional(),
    articleRef: z.string().max(80).nullable().optional(),
    materials: z.array(z.string().max(120)).max(20).optional(),
    dims: z.array(z.number()).max(3).optional(),
    triangles: z.number().optional(),
    instances: z.number(),
    modules: z.array(z.string().max(40)).max(20).optional(),
  }),
  options: z.object({
    natures: z.record(z.array(z.string().max(40)).max(30)),
    materials: z.array(z.object({ key: z.string().max(40), name: z.string().max(120) })).max(80),
    sections: z.array(z.object({ key: z.string().max(80), name: z.string().max(200) })).max(300),
  }),
  images: z.array(ImageIn).max(2).optional(),
  studyId: z.string().max(60).nullable().optional(),
});
export type IdentifyInputT = z.infer<typeof IdentifyInput>;

const IdentifyOut = z.object({
  role: z.string(),
  nature: z.string(),
  material: z.string().nullable().optional(),
  section: z.string().nullable().optional(),
  weight: z.object({ value: z.number(), unit: z.enum(['kg/m', 'kg/m²', 'kg']) }).nullable().optional(),
  windClosed: z.boolean().nullable().optional(),
  confidence: z.number(),
  questions: z.array(z.string()).max(8).default([]),
  rationale: z.string().max(2000).default(''),
});
export type IdentifyOutT = z.infer<typeof IdentifyOut>;

export async function identifyPart(inp: IdentifyInputT, ctx: CallContext) {
  const system = `${BASE_RULES}
Tâche : dire ce qu’est une pièce d’un modèle SketchUp d’installation Viewbox, pour que l’outil la prenne en compte (élément porteur, charge seulement, surface au vent seulement, ou non structurel).
Choisis rôle, nature, matériau et section uniquement parmi les listes fournies (clés exactes), sinon null. Le poids (kg/m pour une pièce linéaire posée le long d’un côté, kg/m² pour une surface, kg pour un objet ponctuel) est une estimation d’ordre de grandeur que l’utilisateur confirmera.
« windClosed » : la pièce ferme-t-elle la face de la Viewbox au vent (mur, vitrage, porte, bâche) ?
« confidence » entre 0 et 1 : sous 0,5 si tu hésites ; pose alors 1 à 4 questions courtes et concrètes (en français) dans « questions ».
« rationale » : 1 à 3 phrases en français, sans chiffre inventé.
Format : {"role": "...", "nature": "...", "material": "clé ou null", "section": "clé ou null", "weight": {"value": 0, "unit": "kg/m"} ou null, "windClosed": true/false/null, "confidence": 0.0, "questions": ["..."], "rationale": "..."}`;
  const t = inp.type;
  const facts = {
    nom: t.label,
    genre: t.kind === 'module' ? 'module (composant de type Viewbox)' : 'pièce ou accessoire',
    categorie_du_classement: t.category ?? null,
    definition_sketchup: t.definition ?? null,
    designation: t.designation ?? null,
    reference_article: t.articleRef ?? null,
    materiaux_sketchup: t.materials ?? [],
    boite_orientee_mm: t.dims ?? null,
    triangles: t.triangles ?? null,
    nombre_instances: t.instances,
    viewbox_concernees: t.modules ?? [],
    roles_et_natures_permis: inp.options.natures,
    materiaux_permis: inp.options.materials,
    sections_permises: inp.options.sections,
  };
  const content: any[] = [];
  for (const img of inp.images ?? []) {
    content.push({ type: 'image', source: { type: 'base64', media_type: img.media, data: img.data } });
    content.push({ type: 'text', text: `Image ci-dessus : ${img.caption}` });
  }
  content.push({ type: 'text', text: `Pièce à identifier :\n${JSON.stringify(facts, null, 1)}` });
  const r = await ask('identify', ctx, system, content, 16000, 120000);
  // (client sans strictNullChecks : les champs zod sont vus optionnels, le schéma garantit leur présence)
  return { suggestion: normalizeIdentify(parseJson(r.text, IdentifyOut) as IdentifyOutT & IdentifyLike, inp.options as IdentifyOptions), usage: r.usage };
}

// ─── group ───

export const GroupInput = z.object({
  types: z
    .array(
      z.object({
        key: z.string().max(400),
        label: z.string().max(300),
        category: z.string().max(80).nullable().optional(),
        definition: z.string().max(300).nullable().optional(),
        dims: z.array(z.number()).max(3).optional(),
        materials: z.array(z.string().max(120)).max(20).optional(),
        instances: z.number(),
      }),
    )
    .min(2)
    .max(200),
  studyId: z.string().max(60).nullable().optional(),
});
export type GroupInputT = z.infer<typeof GroupInput>;

const GroupOut = z.object({ groups: z.array(z.object({ keys: z.array(z.string()), label: z.string().max(300), reason: z.string().max(1000).default('') })).max(100) });

export async function groupTypes(inp: GroupInputT, ctx: CallContext) {
  const system = `${BASE_RULES}
Tâche : parmi des types de pièces encore inconnus d’un modèle SketchUp, repérer ceux qui sont en fait la même chose (même garde-corps en plusieurs longueurs, même mur exporté sous deux noms, etc.), pour qu’une seule réponse s’applique à tout le groupe. Ne groupe que ce qui est très probablement identique en nature et en poids au mètre ; dans le doute, ne groupe pas.
Format : {"groups": [{"keys": ["clé exacte", "clé exacte"], "label": "nom court en français", "reason": "une phrase"}]}`;
  const r = await ask('group', ctx, system, [{ type: 'text', text: `Types inconnus :\n${JSON.stringify(inp.types, null, 1)}` }], 16000, 120000);
  return { groups: normalizeGroups(parseJson(r.text, GroupOut) as Parameters<typeof normalizeGroups>[0], new Set(inp.types.map((t) => t.key))), usage: r.usage };
}

// ─── extract (document de référence) ───

const Page = z.union([z.string(), z.number()]).transform((v) => String(v));
const Num = z.number().nullable().optional();
const ExtractOut = z.object({
  document: z.object({ title: z.string().max(300).default(''), reference: z.string().max(120).default('') }).default({ title: '', reference: '' }),
  sections: z
    .array(
      z.object({
        designation: z.string().max(200),
        role: z.string().max(200).default(''),
        shape: z.enum(['RHS', 'SHS', 'CHS', 'I', 'H', 'U', 'C', 'L', 'T', 'FLAT', 'ROUND', 'OTHER']),
        fabrication: z.enum(['hot', 'cold', 'welded', 'unknown']).default('unknown'),
        dims: z.object({ h: Num, b: Num, t: Num, tw: Num, tf: Num, d: Num, r: Num }).partial().default({}),
        material: z.string().max(40).nullable().optional(),
        values: z.object({ A: Num, Iy: Num, Iz: Num, Wely: Num, Welz: Num, Wply: Num, Wplz: Num, It: Num, kgPerM: Num }).partial().default({}),
        curves: z.object({ y: z.string().max(2).nullable().optional(), z: z.string().max(2).nullable().optional() }).partial().default({}),
        page: Page,
        quote: z.string().max(1500).default(''),
      }),
    )
    .max(80)
    .default([]),
  connections: z
    .array(
      z.object({
        name: z.string().max(200),
        composition: z.string().max(600).default(''),
        capacities: z.array(z.object({ label: z.string().max(200), value: z.number(), unit: z.enum(['kN', 'kNm', 'kNcm', 'kN/cm', 'kNcm/deg', 'N', 'Nmm', '-']), formula: z.string().max(400).nullable().optional() })).max(20),
        page: Page,
        quote: z.string().max(1500).default(''),
      }),
    )
    .max(60)
    .default([]),
});
export type ExtractOutT = z.infer<typeof ExtractOut>;

export async function extractReference(pdf: Buffer, meta: { reportRef: string; hint?: string }, ctx: CallContext) {
  const system = `${BASE_RULES}
Tâche : lire une note de calcul ou une fiche technique et en recopier les données utiles à la bibliothèque de l’outil :
- sections de barres : désignation (« UNP 220 », « RHP 120×60×4 »), rôle dans l’ouvrage, forme, fabrication, dimensions en mm (h, b, t, tw, tf, d, r), nuance d’acier, et les valeurs imprimées dans le document (A en cm², Iy, Iz, It en cm⁴, Wel,y, Wel,z, Wpl,y, Wpl,z en cm³, masse en kg/m), courbes de flambement y et z (a0, a, b, c, d) ;
- capacités d’assemblages : nom, composition, et chaque résistance avec sa valeur, son unité et sa formule si elle est écrite.
Recopie les valeurs exactement comme elles sont imprimées ; n’en calcule aucune ; laisse null ce qui n’est pas écrit. Pour chaque entrée : la page (numéro de page du PDF, ou numéro imprimé comme « A 22 ») et un extrait exact du document qui contient ces valeurs (« quote »). Cite le document.
Format : {"document": {"title": "...", "reference": "..."}, "sections": [{"designation": "...", "role": "...", "shape": "RHS|SHS|CHS|I|H|U|C|L|T|FLAT|ROUND|OTHER", "fabrication": "hot|cold|welded|unknown", "dims": {"h": 0, "b": 0, "t": 0}, "material": "S235", "values": {"A": 0, "Iy": 0, "Iz": 0, "Wely": 0, "Welz": 0, "Wply": 0, "Wplz": 0, "It": 0, "kgPerM": 0}, "curves": {"y": "c", "z": "c"}, "page": "...", "quote": "..."}], "connections": [{"name": "...", "composition": "...", "capacities": [{"label": "...", "value": 0, "unit": "kN|kNm|kNcm|kN/cm|kNcm/deg|N|Nmm|-", "formula": "..."}], "page": "...", "quote": "..."}]}`;
  const content = [
    { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdf.toString('base64') }, title: meta.reportRef, citations: { enabled: true } },
    { type: 'text', text: `Document de référence ${meta.reportRef}.${meta.hint ? ` Indication de l’utilisateur : ${meta.hint}` : ''} Recopie les sections et les capacités d’assemblages qu’il contient.` },
  ];
  const r = await ask('extract', ctx, system, content, 32000, 600000);
  const out = parseJson(r.text, ExtractOut);
  const cites = citationsOf(r.data);
  return {
    document: out.document,
    // valeurs imprimées seulement : les dimensions viennent souvent de la désignation (« 120×60×4 »), recalculée par l'outil
    sections: out.sections.map((x) => ({ ...x, check: verifyExtract(x.values, x.quote, cites) })),
    connections: out.connections.map((c) => ({ ...c, check: verifyExtract(c.capacities.map((x) => x.value), c.quote, cites) })),
    citations: cites.length,
    usage: r.usage,
  };
}

// ─── write (textes du rapport) ───

export const WriteInput = z.object({ lang: z.enum(['fr', 'de', 'en']), facts: z.record(z.any()), studyId: z.string().max(60).nullable().optional() });
export type WriteInputT = z.infer<typeof WriteInput>;
const WriteOut = z.object({ description: z.string().max(3000), instructions: z.array(z.string().max(600)).max(8).default([]), conclusion: z.string().max(3000) });

const LANG_NAME = { fr: 'français', de: 'allemand (termes des notes statico)', en: 'anglais' } as const;

export async function writeTexts(inp: WriteInputT, ctx: CallContext) {
  const system = `${BASE_RULES}
Tâche : rédiger, en ${LANG_NAME[inp.lang]}, trois textes d’un rapport de pré-étude (style note de calcul d’ingénieur, sobre, phrases courtes) à partir des données fournies :
- « description » : description de l’ouvrage (composition, niveaux, dimensions, habillages, usage) en 3 à 6 phrases ;
- « instructions » : 0 à 5 consignes particulières à ce projet tirées des données (vent, lest, calage, vérins, éléments non vérifiés), une phrase chacune ; ne répète pas les consignes générales ;
- « conclusion » : 2 à 4 phrases fidèles au verdict et aux motifs fournis, sans l’adoucir ni l’aggraver.
Tu ne dois écrire AUCUN nombre qui ne figure pas dans les données, et tu recopies les nombres tels quels${inp.lang === 'en' ? ' (point décimal)' : ' (virgule décimale)'}. Pas de date, pas de pourcentage calculé.
Format : {"description": "...", "instructions": ["..."], "conclusion": "..."}`;
  const facts = inp.facts;
  let feedback = '';
  let total: Usage | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await ask('write', ctx, system, [{ type: 'text', text: `Données de l’étude :\n${JSON.stringify(facts, null, 1)}${feedback}` }], 16000, 180000);
    total = total ? { ...r.usage, inputTokens: total.inputTokens + r.usage.inputTokens, outputTokens: total.outputTokens + r.usage.outputTokens, costUsd: (total.costUsd ?? 0) + (r.usage.costUsd ?? 0), durationMs: total.durationMs + r.usage.durationMs } : r.usage;
    const out = parseJson(r.text, WriteOut);
    const bad = [...new Set([...checkText(out.description, facts), ...out.instructions.flatMap((t) => checkText(t, facts)), ...checkText(out.conclusion, facts)])];
    if (!bad.length) return { texts: out, attempts: attempt + 1, usage: total };
    logger.warn(`[structureAi] texte rejeté (chiffres hors données : ${bad.join(', ')}), essai ${attempt + 1}`);
    feedback = `\n\nTa réponse précédente a été rejetée : elle contenait des nombres absents des données (${bad.join(' ; ')}). Réécris les textes sans ces nombres.`;
  }
  throw new AppError('Textes de l’IA rejetés : ils contenaient des chiffres qui ne viennent pas du calcul. Garder les textes standard.', 422);
}

// ─── review (relecture de cohérence) ───

export const ReviewInput = z.object({ facts: z.record(z.any()), studyId: z.string().max(60).nullable().optional() });
export type ReviewInputT = z.infer<typeof ReviewInput>;
const ReviewOut = z.object({ alerts: z.array(z.object({ severity: z.enum(['info', 'warning', 'error']), message: z.string().max(600), elements: z.array(z.string().max(80)).max(20).default([]) })).max(20) });

export async function reviewStudy(inp: ReviewInputT, ctx: CallContext) {
  const system = `${BASE_RULES}
Tâche : relire la cohérence des données et des résultats d’une étude (comme un ingénieur qui relit une note) et signaler ce qui paraît anormal : poids total incohérent avec le nombre de Viewbox, Viewbox voisines sans liaison, charges oubliées ou en double, taux de travail surprenants pour la configuration, hypothèses inhabituelles, messages du calcul inquiétants. Tes alertes n’altèrent pas le calcul : l’utilisateur les vérifie.
Chaque alerte en français, une ou deux phrases, avec les éléments concernés (identifiants VBX-…, familles) ; aucun nombre qui ne figure pas dans les données. Pas d’alerte si tout est cohérent.
Format : {"alerts": [{"severity": "info|warning|error", "message": "...", "elements": ["VBX-01"]}]}`;
  const r = await ask('review', ctx, system, [{ type: 'text', text: `Données et résultats de l’étude :\n${JSON.stringify(inp.facts, null, 1)}` }], 16000, 180000);
  const out = parseJson(r.text, ReviewOut);
  const kept = out.alerts.filter((a) => !checkText(a.message, inp.facts).length);
  return { alerts: kept, dropped: out.alerts.length - kept.length, usage: r.usage };
}

// ─── recherche d'un matériau / panneau sur internet ───

export const MaterialInput = z.object({
  description: z.string().min(3).max(2000),
  studyId: z.string().max(60).nullable().optional(),
});
export type MaterialInputT = z.infer<typeof MaterialInput>;

const SourceFields = { url: z.string().max(1000).default(''), title: z.string().max(300).default(''), quote: z.string().max(1500).default('') };
const MaterialOut = z.object({
  name: z.string().max(200),
  layers: z
    .array(
      z.object({
        name: z.string().max(200),
        material: z.string().max(200).default(''),
        thicknessMm: z.number().nullable().optional().transform((v) => v ?? null),
        densityKgM3: z.number().nullable().optional().transform((v) => v ?? null),
        surfaceMassKgM2: z.number().nullable().optional().transform((v) => v ?? null),
        ...SourceFields,
      }),
    )
    .max(10),
  frame: z
    .object({ name: z.string().max(200), kgPerM: z.number().nullable().optional().transform((v) => v ?? null), ...SourceFields })
    .nullable()
    .optional()
    .transform((v) => v ?? null),
  questions: z.array(z.string().max(300)).max(8).default([]),
  notes: z.string().max(2000).default(''),
});

/** Outil de recherche web selon le modèle (variante à filtrage dynamique sur les modèles récents). */
const webSearchTool = (model: string) => ({
  type: /opus-5|opus-4-[678]|sonnet-5|sonnet-4-6|fable-5|mythos-5/.test(model) ? 'web_search_20260209' : 'web_search_20250305',
  name: 'web_search',
  max_uses: 6,
});

export async function searchMaterial(inp: MaterialInputT, ctx: CallContext) {
  if (!aiEnabled()) throw new AppError('IA non configurée (clé API absente) : continuer à la main.', 503);
  const system = `${BASE_RULES}
Tâche : l’utilisateur décrit un panneau ou un matériau posé sur une installation Viewbox (mur, habillage, cloison…). Cherche sur internet, de préférence sur les sites des fabricants (fiches techniques), les données qui servent à calculer son poids : pour chaque couche, le produit, son épaisseur (celle donnée par l’utilisateur si elle est donnée), sa masse volumique en kg/m³ ou sa masse surfacique en kg/m² ; pour un cadre de profilés, la masse linéique en kg/m.
Ne calcule rien : l’outil fait le calcul. Recopie chaque valeur exactement comme la source l’écrit (converti seulement de g/cm³ en kg/m³ si besoin, en le disant dans « notes »), avec l’adresse de la page (« url »), son titre et un extrait exact qui contient la valeur (« quote »). Laisse null une valeur que tu ne trouves pas et pose la question dans « questions ». Cite les sources.
Format : {"name": "nom court du panneau", "layers": [{"name": "...", "material": "...", "thicknessMm": 0, "densityKgM3": 0, "surfaceMassKgM2": null, "url": "...", "title": "...", "quote": "..."}], "frame": {"name": "...", "kgPerM": 0, "url": "...", "title": "...", "quote": "..."} ou null, "questions": ["..."], "notes": "..."}`;
  const t0 = Date.now();
  const messages: any[] = [{ role: 'user', content: [{ type: 'text', text: `Panneau ou matériau décrit par l’utilisateur : ${inp.description}` }] }];
  let data: any;
  let usage = { input_tokens: 0, output_tokens: 0 };
  let searches = 0;
  try {
    // la recherche peut demander plusieurs tours (« pause_turn ») : on relance avec la réponse partielle
    for (let turn = 0; turn < 4; turn++) {
      data = await anthropicRequest({ model: STRUCTURE_MODEL, max_tokens: 16000, system, messages, tools: [webSearchTool(STRUCTURE_MODEL)] }, { timeoutMs: 300000, retries: 1 });
      usage = { input_tokens: usage.input_tokens + (data.usage?.input_tokens ?? 0), output_tokens: usage.output_tokens + (data.usage?.output_tokens ?? 0) };
      searches += data.usage?.server_tool_use?.web_search_requests ?? 0;
      if (data.stop_reason !== 'pause_turn') break;
      messages.push({ role: 'assistant', content: data.content });
    }
  } catch (e: any) {
    await logCall('material', ctx, { model: STRUCTURE_MODEL, durationMs: Date.now() - t0 }, false, e.message);
    // recherche web désactivée par un administrateur de l'organisation Anthropic : message clair
    if (/web search/i.test(e.message ?? '') && /not enabled|disabled/i.test(e.message ?? ''))
      throw new AppError('Recherche internet désactivée pour votre organisation dans la console Anthropic (platform.claude.com › Settings › Capabilities) : l’activer, ou saisir les couches à la main.', 400);
    throw e;
  }
  const model = data.model ?? STRUCTURE_MODEL;
  // recherches facturées en plus des jetons : 10 $ les 1 000 (tarif Anthropic)
  const tokens = costOf(model, usage);
  const u: Usage = { model, inputTokens: usage.input_tokens, outputTokens: usage.output_tokens, costUsd: tokens === null ? null : tokens + searches * 0.01, durationMs: Date.now() - t0 };
  await logCall('material', ctx, u, data.stop_reason !== 'refusal', data.stop_reason === 'refusal' ? 'stop_reason=refusal' : undefined);
  if (data.stop_reason === 'refusal') throw new AppError('L’IA a refusé de répondre à cette demande : saisir les couches à la main.', 422);
  if (data.stop_reason === 'max_tokens') throw new AppError('Réponse de l’IA coupée (trop longue) : décrire le panneau plus simplement.', 502);
  // réponse finale = textes après le dernier résultat de recherche ; citations = extraits exacts des pages
  const blocks: any[] = data.content ?? [];
  const lastTool = blocks.map((b) => b.type).lastIndexOf('web_search_tool_result');
  const text = blocks
    .slice(lastTool + 1)
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('');
  const cites: Citation[] = [];
  const sources = new Map<string, string>();
  for (const b of blocks)
    for (const c of b?.citations ?? []) {
      if (typeof c?.cited_text === 'string') cites.push({ text: c.cited_text });
      if (typeof c?.url === 'string') sources.set(c.url, c.title ?? c.url);
    }
  const out = parseJson(text, MaterialOut);
  // l'épaisseur donnée par l'utilisateur n'a pas à figurer dans la source
  const given = numbersIn(inp.description);
  const check = (values: Array<number | null>, quote: string) => verifyExtract(values.filter((v): v is number => v !== null && !given.some((g) => Math.abs(g - v) < 1e-9)), quote, cites);
  return {
    name: out.name,
    layers: out.layers.map((l) => ({ ...l, check: check([l.densityKgM3, l.surfaceMassKgM2, l.thicknessMm], l.quote) })),
    frame: out.frame ? { ...out.frame, check: check([out.frame.kgPerM], out.frame.quote) } : null,
    questions: out.questions,
    notes: out.notes,
    sources: [...sources].map(([url, title]) => ({ url, title })),
    usage: u,
  };
}

/** Appels récents et coût estimé (page Bibliothèque). */
export async function recentCalls(days = 30) {
  const since = new Date(Date.now() - days * 86400000);
  const rows = await db.structAiCall.findMany({ where: { createdAt: { gte: since } }, orderBy: { createdAt: 'desc' }, take: 200 });
  const costUsd = rows.reduce((a: number, r: any) => a + (r.costUsd ?? 0), 0);
  return { days, count: rows.length, costUsd, calls: rows.slice(0, 50) };
}
