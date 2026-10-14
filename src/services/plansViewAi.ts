// Plans › Vues 2D › Vues spéciales : assistant « 🤖 Décris la vue ».
// L'IA propose seulement : elle choisit des opérations (caméra, coupes, règles, disposition, style, préréglage) dans
// les listes de l'inventaire envoyé par le module (aucune géométrie, aucune image). Rien n'est appliqué sans clic ;
// le module renettoie tout (cleanViewOps) avant d'afficher la proposition en orange. Jamais d'écriture dans les
// étiquettes ni les préréglages partagés.
import { z } from 'zod';
import { AppError } from '../utils/AppError';
import { logger } from '../utils/logger';
import { anthropicRequest } from './aiService';
import { logAiCall } from './structureAi';
import { costOf, normalizeViewAi } from './structureAiGuard';
import type { ViewAiInventory, ViewAiNormalized } from './structureAiGuard';

/** Modèle rapide et économique par défaut ; variable dédiée pour le changer. */
export const PLANS_VIEW_MODEL = process.env.ANTHROPIC_MODEL_PLANS_VIEW || 'claude-haiku-5-5';

export const viewAiEnabled = () => !!process.env.ANTHROPIC_API_KEY;

export const ViewAiInput = z.object({
  text: z.string().trim().min(2).max(2000),
  payload: z.record(z.any()),
  /** réponses aux questions de l'IA (une relance) */
  answers: z.array(z.object({ question: z.string().max(400), answer: z.string().max(400) })).max(3).optional(),
});
export type ViewAiInputT = z.infer<typeof ViewAiInput>;

const ViewAiOut = z.object({
  ops: z.array(z.record(z.any())).max(30).default([]),
  name: z.string().optional(),
  questions: z.array(z.string()).max(5).default([]),
  confidence: z.number().min(0).max(1).default(0.5),
  rationale: z.string().default(''),
});

export interface ViewAiResult extends ViewAiNormalized {
  usage: { model: string; inputTokens: number; outputTokens: number; costUsd: number | null; durationMs: number };
}

const SYSTEM = `Tu aides Viewbox International (installations modulaires « Viewbox » : boîtes de 5,9 × 2,5 m empilables, toiture, plancher, façades vitrées, plafond tendu, spots) à préparer des vues 2D spéciales pour des plans d'architecte.
L'utilisateur décrit une vue en français, allemand ou anglais. Tu réponds UNIQUEMENT par un objet JSON :
{"ops": [...], "name": "nom court de la vue en français", "questions": [], "confidence": 0.0-1.0, "rationale": "1 à 3 phrases en français"}

Opérations permises (appliquées dans l'ordre sur la vue actuelle) :
- {"op":"usePreset","key":<clé de payload.presets>} — part d'un préréglage (à mettre en premier).
- {"op":"setCamera","dir":"top|bottom|front|back|left|right|iso|iso-below","isoCorner":"fl|fr|bl|br","reflected":bool,"rotate":0|90|180|270,"mirror":bool,"frame":"world|module"}
  « dessous » = dir "bottom" (vraie vue de dessous, miroir du plan) ; « plan de plafond réfléchi » = dir "bottom" + reflected true.
- {"op":"addCut","axis":"horizontal|long|short|x|z","ref":<levelRefs pour horizontal | moduleRefs pour long/short>,"offset":mm signé depuis la référence,"keep":"positive|negative","label":"A","depth":mm}
  horizontal + keep "positive" = garder au-dessus ; « sous la toiture » = ref "roof-bottom", offset -200, keep "positive", à combiner avec dir "bottom".
  « coupé à 1,20 m » = ref "floor-top", offset 1200, keep "negative", dir "top". Coupe longitudinale = axis "long", ref "mid" ; transversale = axis "short".
- {"op":"removeCut","index":n} (index dans payload.current.cuts)
- {"op":"setBox","moduleId":"VBX-03"|null} — « entrer dans » une Viewbox.
- {"op":"addRule","rule":"hide|show|ghost|isolate","match":{"viewTags":[...],"definitions":[...],"categories":[...],"moduleIds":[...],"common":bool},"label":"texte court"}
  Champs de match combinés en ET, valeurs en OU. Préfère les étiquettes (payload.tags : plafond-tendu, eclairage, facade, mobilier, calage, pied…), puis les types (payload.partTypes[].definition), puis les catégories (payload.categories).
  Vitrages = catégories commençant par VITRE ; murs = MUR ; portes = PORTE ; façades = étiquette "facade". Retirer le plafond tendu garde ses fixations.
- {"op":"removeRule","id":<id de payload.current.rules>}
- {"op":"setLayout","mode":"assembled|exploded|per-module|assembled+exploded","gap":mm,"keepArrangement":bool,"groupIdentical":bool,"labels":"none|id|id+type"}
  « séparées » = exploded ; « chaque box / une par box » = per-module ; « ensemble puis séparées » = assembled+exploded.
- {"op":"setStyle","cutFill":"by-material|drawing|solid|hatch|none","hidden":bool,"beyond":"normal|thin"}
- {"op":"setScope","modules":"all"|["VBX-01",…],"levels":[0,1],"common":bool}

Règles :
- N'utilise QUE des clés présentes dans les données (Viewbox, définitions, étiquettes, catégories, préréglages, règles). Jamais d'identifiant de pièce.
- Les seuls nombres que tu choisis sont des décalages, profondeurs et écarts en mm, cohérents avec payload.heights (hauteurs depuis le bas de la Viewbox).
- Si la demande est ambiguë (quelle Viewbox ? quel niveau ?), mets 1 à 3 questions courtes dans "questions", propose ce qui est sûr et baisse "confidence".
- Vocabulaire : plafond tendu = Spanndecke = stretch ceiling ; dessous = Unterseite = underside ; coupe = Schnitt = section ; séparées = getrennt = separate ; toiture = Dach = roof ; vitrage = Verglasung = glazing ; pieds = Füße = feet ; calage = Unterlegplatten = packing.
Exemple — « dessous de la toiture sans le plafond tendu, ensemble puis séparées » :
{"ops":[{"op":"usePreset","key":"roof-under-no-ceiling"},{"op":"setLayout","mode":"assembled+exploded"}],"name":"Dessous de toiture — sans plafond tendu — ensemble + séparées","questions":[],"confidence":0.9,"rationale":"Préréglage dessous de toiture sans plafond, puis disposition ensemble + séparées."}`;

/** Premier objet JSON de la réponse. */
function firstJson(text: string): unknown {
  const cleaned = text.replace(/```json|```/g, '');
  const a = cleaned.indexOf('{');
  const b = cleaned.lastIndexOf('}');
  if (a < 0 || b <= a) throw new AppError('Réponse de l’IA illisible (pas de JSON) : réessayer ou faire la vue à la main.', 502);
  try {
    return JSON.parse(cleaned.slice(a, b + 1));
  } catch {
    throw new AppError('Réponse de l’IA illisible (JSON invalide) : réessayer ou faire la vue à la main.', 502);
  }
}

export async function describeView(input: ViewAiInputT, ctx: { userId?: string }): Promise<ViewAiResult> {
  if (!viewAiEnabled()) throw new AppError('IA non configurée (clé API absente) : faire la vue à la main.', 503);
  const payloadText = JSON.stringify(input.payload);
  if (payloadText.length > 200_000) throw new AppError('Inventaire trop volumineux pour l’IA', 413);
  const answers = input.answers?.length ? `\n\nRéponses à tes questions :\n${input.answers.map((a) => `- ${a.question} → ${a.answer}`).join('\n')}` : '';
  const t0 = Date.now();
  let data: any;
  try {
    data = await anthropicRequest(
      {
        model: PLANS_VIEW_MODEL,
        max_tokens: 8000,
        system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: `Données du modèle (payload) :\n${payloadText}` },
              { type: 'text', text: `Demande : ${input.text}${answers}` },
            ],
          },
        ],
      },
      { timeoutMs: 60000, retries: 1 },
    );
  } catch (e: any) {
    await logAiCall('plans-view', { userId: ctx.userId }, { model: PLANS_VIEW_MODEL, durationMs: Date.now() - t0 }, false, e.message);
    throw e;
  }
  const model = data.model ?? PLANS_VIEW_MODEL;
  const usage = {
    model,
    inputTokens: (data.usage?.input_tokens ?? 0) + (data.usage?.cache_read_input_tokens ?? 0) + (data.usage?.cache_creation_input_tokens ?? 0),
    outputTokens: data.usage?.output_tokens ?? 0,
    costUsd: costOf(model, data.usage ?? {}),
    durationMs: Date.now() - t0,
  };
  const stop = data.stop_reason;
  await logAiCall('plans-view', { userId: ctx.userId }, usage, stop !== 'refusal' && stop !== 'max_tokens', stop === 'refusal' || stop === 'max_tokens' ? `stop_reason=${stop}` : undefined);
  if (stop === 'refusal') throw new AppError('L’IA a refusé cette demande : faire la vue à la main.', 422);
  if (stop === 'max_tokens') throw new AppError('Réponse de l’IA coupée (trop longue) : simplifier la demande.', 502);
  const text = (data.content || [])
    .filter((b: any) => b.type === 'text')
    .map((b: any) => b.text)
    .join('');
  const parsed = ViewAiOut.safeParse(firstJson(text));
  if (!parsed.success) {
    logger.error(`[plansViewAi] réponse hors schéma : ${parsed.error.message.slice(0, 400)}`);
    throw new AppError('Réponse de l’IA hors du format attendu : réessayer.', 502);
  }
  const normalized = normalizeViewAi(parsed.data, input.payload as unknown as ViewAiInventory);
  return { ...normalized, usage };
}
