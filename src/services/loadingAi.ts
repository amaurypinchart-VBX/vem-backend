// src/services/loadingAi.ts
// Loading liste › atelier texte (L7) : « ✍️ Écrire une règle ». L'utilisateur écrit une règle en français (« 2 plaques
// 4-700-040 par jonction décalée, + 1 en spare ») ; l'IA la traduit en règle structurée en choisissant UNIQUEMENT dans
// les listes envoyées par le module (catalogue, bases de comptage, conditions, traits des motifs). Aucun chiffre ne
// vient de l'IA (loadingAiGuard.normalizeRuleAi) ; rien n'est enregistré ici : la proposition passe par l'écran de
// validation des règles (contradictions, impact sur les bancs, raison), réservé à admin et responsable technique.
// Sans clé API : 503, le module propose le formulaire à la main.
import { z } from 'zod';
import { AppError } from '../utils/AppError';
import { logger } from '../utils/logger';
import { anthropicRequest } from './aiService';
import { logAiCall } from './structureAi';
import { costOf } from './structureAiGuard';
import { normalizeRuleAi } from './loadingAiGuard';
import type { LoadingAiAllowed, LoadingAiNormalized } from './loadingAiGuard';

/** Sonnet par défaut (même choix que « Décris la vue » : quelques centimes) ; variable dédiée pour le changer. */
export const LOADING_AI_MODEL = process.env.ANTHROPIC_MODEL_LOADING || 'claude-sonnet-5-5';
export const LOADING_AI_MAX_COST = 0.1;
const MAX_OUTPUT_TOKENS = 3000;

export const loadingAiEnabled = () => !!process.env.ANTHROPIC_API_KEY;

export const LoadingAiInput = z.object({
  text: z.string().trim().min(3).max(2000),
  allowed: z.object({
    articles: z.array(z.object({ ref: z.string().max(20), designation: z.string().max(200).optional() })).max(3000),
    bases: z.array(z.string().max(40)).max(80),
    conditions: z.record(z.array(z.string().max(40)).max(40)),
    motifs: z.record(z.record(z.array(z.string().max(120)).max(200))),
    units: z.array(z.string().max(5)).max(10).optional(),
  }),
  /** élément(s) montré(s) en 3D, décrits en français par le module (contexte, facultatif) */
  context: z.string().max(4000).optional(),
  /** réponses aux questions de l'IA (une relance) */
  answers: z.array(z.object({ question: z.string().max(400), answer: z.string().max(400) })).max(3).optional(),
});
export type LoadingAiInputT = z.infer<typeof LoadingAiInput>;

export interface LoadingAiResult extends LoadingAiNormalized {
  usage: { model: string; inputTokens: number; outputTokens: number; costUsd: number | null; durationMs: number };
}

const SYSTEM = `Tu aides Viewbox International (installations modulaires « Viewbox » : box de 5,9 × 2,5 m posées côte à côte ou empilées, façades en murs / vitres / portes) à écrire les règles de leur loading liste (ce qui part de l'entrepôt pour un chantier).
L'utilisateur écrit UNE règle en français. Tu la traduis en JSON, en choisissant UNIQUEMENT dans les listes fournies (allowed). Réponds UNIQUEMENT par cet objet :
{"kind":"accessoire|ajout_chantier|appreciation","article":"réf. de allowed.articles ou null","qty":nombre ou null,"per":"une base de allowed.bases ou null","trigger":{"articles":[réfs],"vitrage":"8.8.2|10mm|4.4.2"} ou null,"motif":{"kind":"genre de allowed.motifs","attrs":{"trait":"valeur de la liste"}} ou null,"when":{"condition":"valeur de allowed.conditions"},"spare":{"type":"fixe|pourcent","valeur":nombre} ou null,"tranche":{"pour":nombre,"parTranche":nombre} ou null,"unit":"pce|m|m2|L","questions":[],"confidence":0.0-1.0,"rationale":"1 à 2 phrases en français"}

Règles strictes :
- AUCUN CHIFFRE INVENTÉ : qty, spare.valeur, tranche ne viennent que des chiffres écrits par l'utilisateur. S'il n'en donne pas, mets null et pose la question.
- article : la référence citée, ou celle dont la désignation correspond clairement au texte ; sinon null + question.
- per : « par box » = box, « par jonction grand côté » = jonction_grand_cote, « par pied » = pied, « par porte simple » = porte_simple, « par îlot / cluster » = ilot, « par chantier / forfait » = job, « par produit X » = produit + trigger.articles [X].
- Quand l'élément décrit n'est pas une base existante (ex. « jonction décalée », « petit côté vitré 10 mm contre une box », « bout de vitre au rez »), utilise per "motif" + motif (genre et traits pris dans allowed.motifs ; les booléens s'écrivent "true" / "false").
- when : seulement des conditions de allowed.conditions (regime standalone = box seule, connecte = box connectées ; couvert = toits jointifs…).
- « + 20 % » = spare pourcent 20 ; « + 2 en spare » = spare fixe 2 ; « 1 par tranche de 8 box » = qty 1, per box, tranche {pour:1, parTranche:8}.
- appreciation = quantité laissée à l'appréciation (jamais calculée) : qty null.
- Si c'est ambigu, mets 1 à 3 questions courtes et baisse confidence.`;

function firstJson(text: string): unknown {
  const cleaned = text.replace(/```json|```/g, '');
  const a = cleaned.indexOf('{');
  const b = cleaned.lastIndexOf('}');
  if (a < 0 || b <= a) throw new AppError('Réponse de l’IA illisible : réessayer ou saisir la règle à la main.', 502);
  try {
    return JSON.parse(cleaned.slice(a, b + 1));
  } catch {
    throw new AppError('Réponse de l’IA illisible : réessayer ou saisir la règle à la main.', 502);
  }
}

export async function ruleFromText(input: LoadingAiInputT, ctx: { userId?: string }): Promise<LoadingAiResult> {
  if (!loadingAiEnabled()) throw new AppError('IA non configurée (clé API absente) : saisir la règle à la main.', 503);
  const allowedText = JSON.stringify(input.allowed);
  if (allowedText.length > 300_000) throw new AppError('Listes trop volumineuses pour l’IA', 413);
  const answers = input.answers?.length ? `\n\nRéponses à tes questions :\n${input.answers.map((a) => `- ${a.question} → ${a.answer}`).join('\n')}` : '';
  const context = input.context ? `\n\nÉléments montrés en 3D par l'utilisateur :\n${input.context}` : '';
  const worst = costOf(LOADING_AI_MODEL, { input_tokens: Math.ceil((SYSTEM.length + allowedText.length + input.text.length + answers.length + context.length) / 3), output_tokens: MAX_OUTPUT_TOKENS });
  if (worst != null && worst > LOADING_AI_MAX_COST) throw new AppError(`Demande trop grosse pour l’IA (jusqu’à ${worst.toFixed(2)} $) : saisir la règle à la main.`, 413);
  const t0 = Date.now();
  let data: any;
  try {
    data = await anthropicRequest(
      {
        model: LOADING_AI_MODEL,
        max_tokens: MAX_OUTPUT_TOKENS,
        system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: `Listes permises (allowed) :\n${allowedText}`, cache_control: { type: 'ephemeral' } },
              { type: 'text', text: `Règle écrite par l'utilisateur : ${input.text}${context}${answers}` },
            ],
          },
        ],
      },
      { timeoutMs: 60000, retries: 1 },
    );
  } catch (e: any) {
    await logAiCall('loading-rule', { userId: ctx.userId }, { model: LOADING_AI_MODEL, durationMs: Date.now() - t0 }, false, e.message);
    throw e;
  }
  const model = data.model ?? LOADING_AI_MODEL;
  const usage = {
    model,
    inputTokens: (data.usage?.input_tokens ?? 0) + (data.usage?.cache_read_input_tokens ?? 0) + (data.usage?.cache_creation_input_tokens ?? 0),
    outputTokens: data.usage?.output_tokens ?? 0,
    costUsd: costOf(model, data.usage ?? {}),
    durationMs: Date.now() - t0,
  };
  const stop = data.stop_reason;
  await logAiCall('loading-rule', { userId: ctx.userId }, usage, stop !== 'refusal' && stop !== 'max_tokens', stop === 'refusal' || stop === 'max_tokens' ? `stop_reason=${stop}` : undefined);
  if (stop === 'refusal') throw new AppError('L’IA a refusé cette demande : saisir la règle à la main.', 422);
  if (stop === 'max_tokens') throw new AppError('Réponse de l’IA coupée : simplifier la règle.', 502);
  const text = (data.content || [])
    .filter((b: any) => b.type === 'text')
    .map((b: any) => b.text)
    .join('');
  let raw: unknown;
  try {
    raw = firstJson(text);
  } catch (e) {
    logger.error(`[loadingAi] réponse illisible : ${text.slice(0, 300)}`);
    throw e;
  }
  // les chiffres permis : ceux du texte de l'utilisateur et de ses réponses (jamais ceux du contexte 3D ni de l'IA)
  const userText = `${input.text} ${(input.answers ?? []).map((a) => a.answer).join(' ')}`;
  return { ...normalizeRuleAi(raw, input.allowed as LoadingAiAllowed, userText), usage };
}
