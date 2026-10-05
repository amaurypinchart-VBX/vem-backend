// src/services/structureAdvisor.ts
// Conseil ingénieur IA de l'étude structure (Plans Viewbox) : une conversation où Claude joue l'ingénieur structure
// spécialisé Viewbox. Il lit le calcul, explique ce qui ne passe pas et pourquoi, et propose des solutions qu'il fait
// vérifier par le moteur de calcul (outils exécutés dans le navigateur : variantes, lest, sol, catalogue). Il ne calcule
// rien lui-même : tout nombre de sa réponse finale doit venir d'un résultat d'outil, du message de l'utilisateur ou des
// données Viewbox ci-dessous (garde-fou structureAiGuard.checkText, une relance si besoin, sinon chiffres signalés).
// Le navigateur envoie l'historique complet (append-only, blocs de réflexion renvoyés tels quels) ; le serveur ajoute
// les consignes et les outils, appelle Claude et renvoie les messages à ajouter.
import { z } from 'zod';
import { AppError } from '../utils/AppError';
import { logger } from '../utils/logger';
import { anthropicRequest } from './aiService';
import { STRUCTURE_MODEL, aiEnabled, logAdvisorCall } from './structureAi';
import { advisorAllowedNumbers, costOf, unknownNumbers } from './structureAiGuard';

export const ADVISOR_SYSTEM = `Tu es l'ingénieur structure conseil de Viewbox International SA, spécialiste des constructions temporaires (Fliegende Bauten, DIN EN 13814) faites de modules acier Viewbox. Tu travailles dans VEM, l'outil interne de pré-étude, avec le chef de projet ou le responsable technique qui prépare une installation. Tu lui parles en français, simplement, comme un ingénieur de terrain : concret, direct, sans jargon inutile (explique les termes techniques en quelques mots quand tu les emploies).

Ton rôle : rendre le projet faisable. Quand le calcul ne passe pas, tu expliques où (Viewbox, élément), pourquoi (quelle vérification, sous quelle charge : foule, vent en service, vent hors service…) et ce qu'il faut faire en plus pour que ça passe. Quand l'utilisateur propose une idée (« je surélève de 80 cm avec tel matériau », « le sol ne prend que 400 kg/m² », « 3 niveaux »), tu la fais vérifier par le calcul et tu donnes ton avis d'ingénieur : ça passe, ça ne passe pas, ou ça passe à condition de…

Règle absolue sur les chiffres : tu ne calcules rien de tête. Tous les efforts, taux de travail (η), réactions, pressions au sol, quantités de lest, nombres de personnes, dimensions de plaques viennent des outils (moteur de calcul de VEM : éléments finis 3D au 2e ordre, EC3, EC5, assemblages Viewbox, calage du sol). Chaque nombre de ta réponse doit figurer dans un résultat d'outil, dans le message de l'utilisateur ou dans les données Viewbox ci-dessous (tu peux l'arrondir). Pour convertir des unités (kg/m² ↔ kN/m²) ou tester une valeur, appelle l'outil qui le fait. Si un chiffre te manque, appelle l'outil ou dis que tu ne l'as pas.

Méthode :
1. Commence par etat_etude (et diagnostic si quelque chose ne passe pas) avant de répondre sur l'étude.
2. Ne dis jamais « ça passe » pour une solution qui n'a pas été simulée : simule-la (simuler_variante, chercher_lest, etudier_sol) et cite le résultat.
3. Classe tes propositions du plus simple au plus lourd pour un chantier Viewbox : consignes d'exploitation (public limité, évacuation des terrasses, vitesse de vent d'arrêt) → calage et répartition au sol (plaques, plaques de roulage) → lest (blocs béton sur les planchers du bas) → contreventements (croix en plat 60 × 6 + ridoir ¾″ dans une face pleine) → Viewbox ajoutées pour élargir la base → pièces renforcées (Viewbox spéciale, fabrication).
4. Pour chaque proposition simulée, donne le résultat (verdict, η avant → après) et ce que ça implique sur site (où poser le lest, quelles faces sont fermées par une croix, quelles plaques, combien).
5. Quand une variante convient, propose de l'appliquer à l'étude ; appelle appliquer_variante seulement si l'utilisateur le demande ou l'accepte.
6. Si la demande sort de ce que l'outil sait calculer (ancrages, pièces non modélisées, matériau absent du catalogue), dis-le clairement et propose ce qui s'en approche le plus ; rappelle qu'un ingénieur doit valider pour les cas hors standard.

Données Viewbox (série EU, fournies par Viewbox) : module 5,90 × 2,50 × 3,08 m, 2 564 kg (planchers et isolants compris) ; rives UNP 220, traverses et lisses RHP 120 × 60 × 4, poteaux QHP 100 × 5 fixés en pied et en tête par 4 boulons M16 ; Viewbox voisines serrées entre elles au plancher et en toiture par des boulons M16 de 150 mm classe 10.9 passés dans les écrous M20 soudés des rives (passage 18 mm) ; Viewbox empilées reliées par des plats 100 × 10 mm boulonnés par 2 M20, 4 par grand côté et 2 par petit côté, sur les faces extérieures seulement (pas entre deux Viewbox voisines) ; pieds à vérin : tiges Tr 24 × 5 classe 10.9, sortie 5 cm au plus, 6 par Viewbox. Charge d'exploitation courante 3,5 kN/m² ; 1 kN/m² ≈ 102 kg/m² (sol : attention aux kg/m² et aux kN/m², demande l'unité si elle n'est pas claire).

Présentation : réponses courtes et structurées (quelques phrases, listes à puces), en **gras** l'essentiel. Pas de tableau. Termine par la ou les actions concrètes proposées. Il s'agit d'une pré-étude interne : pas de validation officielle.`;

const S = (description: string) => ({ type: 'string', description });
const N = (description: string) => ({ type: 'number', description });
const B = (description: string) => ({ type: 'boolean', description });
const SIDES = ['grand_cote_1', 'grand_cote_2', 'petit_cote_1', 'petit_cote_2'];
const SECTION_NEW = {
  type: 'object',
  description: 'Section créée pour l’étude (propriétés calculées par l’outil) : tube carré SHS (h, t), rectangulaire RHS (h, b, t), rond CHS (d, t), rond plein ROUND (d), bois RECT (h, b). Dimensions en mm.',
  properties: {
    forme: { type: 'string', enum: ['SHS', 'RHS', 'CHS', 'ROUND', 'RECT'] },
    h: N('hauteur (mm)'),
    b: N('largeur (mm)'),
    t: N('épaisseur (mm)'),
    d: N('diamètre (mm)'),
    materiau: { type: 'string', enum: ['S235', 'S275', 'S355', 'C24', 'GL24h'] },
    fabrication: { type: 'string', enum: ['formé à chaud', 'formé à froid'] },
  },
  required: ['forme', 'materiau'],
};

const MODIFICATIONS = {
  type: 'object',
  description: 'Modifications de la structure (hors modèle SketchUp), cumulées avec celles déjà appliquées à l’étude.',
  properties: {
    sections: {
      type: 'array',
      description: 'Barres du gabarit Viewbox à remplacer (pièce spéciale).',
      items: {
        type: 'object',
        properties: {
          barres: { type: 'string', enum: ['rim-floor', 'rim-roof', 'secondary-floor', 'secondary-roof', 'column', 'foot-corner', 'foot-middle'] },
          section: S('clé d’une section du catalogue'),
          section_creee: SECTION_NEW,
          viewbox: { type: 'array', items: { type: 'string' }, description: 'Viewbox concernées (vide = toutes)' },
        },
        required: ['barres'],
      },
    },
    lest: { type: 'array', description: 'Lest posé sur le plancher (kg par Viewbox).', items: { type: 'object', properties: { viewbox: S('identifiant VBX-…'), kg: N('masse en kg') }, required: ['viewbox', 'kg'] } },
    contreventements: {
      type: 'array',
      description: 'Croix en plat 60 × 6 + ridoir dans le plan d’un côté (face fermée).',
      items: { type: 'object', properties: { viewbox: S('identifiant VBX-…'), cote: { type: 'string', enum: SIDES } }, required: ['viewbox', 'cote'] },
    },
    viewbox_ajoutees: {
      type: 'array',
      description: 'Viewbox supplémentaires contre un côté (ou au-dessus) d’une Viewbox existante ou ajoutée plus haut dans la liste.',
      items: { type: 'object', properties: { id: S('nouvel identifiant, ex. VBX-N1'), a_cote_de: S('Viewbox de référence'), cote: { type: 'string', enum: [...SIDES, 'dessus'] } }, required: ['id', 'a_cote_de', 'cote'] },
    },
    surelevation: {
      type: ['object', 'null'],
      description: 'Poteaux sous chaque appui des Viewbox du bas (null = retirer la surélévation).',
      properties: { hauteur_mm: N('hauteur ajoutée (mm)'), section: S('clé du catalogue'), section_creee: SECTION_NEW, tete: { type: 'string', enum: ['encastree', 'articulee'] }, croix: B('croix de contreventement entre les poteaux') },
      required: ['hauteur_mm', 'tete', 'croix'],
    },
    plats_empilement: { type: 'object', properties: { par_grand_cote: N('plats par grand côté'), par_petit_cote: N('plats par petit côté') }, required: ['par_grand_cote', 'par_petit_cote'] },
  },
};

const HYPOTHESES = {
  type: 'object',
  description: 'Hypothèses du site à changer pour la variante (unités indiquées).',
  properties: {
    exploitation_kN_m2: N('charge d’exploitation des planchers'),
    exploitation_toiture_kN_m2: N('charge d’exploitation des toitures accessibles'),
    toitures_accessibles: B('toitures sans Viewbox au-dessus ouvertes au public'),
    evacuer_dernier_niveau: B('dernier niveau évacué hors service'),
    vent_en_service_kN_m2: N('pression du vent en service'),
    vent_hors_service_kN_m2: N('pression du vent hors service'),
    charge_forfaitaire_kN_par_viewbox: N('charge permanente ajoutée par Viewbox'),
    pieds_centraux: B('pieds centraux des grands côtés calés'),
    neige_sol_kg_m2: N('neige au sol sk en kg/m² (0 = pas de neige) ; toitures : 0,8 × sk'),
  },
};

const PORTANCE = { type: 'object', properties: { valeur: N('portance du sol'), unite: { type: 'string', enum: ['kN/m²', 'kg/m²', 't/m²', 'kg/cm²'] } }, required: ['valeur', 'unite'] };

export const ADVISOR_TOOLS = [
  { name: 'etat_etude', description: 'Résumé du calcul actuel de l’étude : verdict, motifs, taux de travail par famille, éléments les plus chargés, stabilité (basculement, glissement), appuis, installation (Viewbox, niveaux, dimensions), hypothèses, options, modifications déjà appliquées, avertissements. Aucun paramètre.', input_schema: { type: 'object', properties: {} } },
  { name: 'diagnostic', description: 'Diagnostic automatique : chaque problème (ne passe pas, limite, incomplet) avec où, pourquoi, et des pistes prêtes à simuler (identifiants de piste). Aucun paramètre.', input_schema: { type: 'object', properties: {} } },
  { name: 'details_element', description: 'Détail d’une vérification (identifiant donné par etat_etude ou lister_elements) : formules avec les valeurs, combinaison déterminante, Viewbox.', input_schema: { type: 'object', properties: { id: S('identifiant de la vérification') }, required: ['id'] } },
  {
    name: 'lister_elements',
    description: 'Liste des vérifications, les plus chargées d’abord, filtrées par famille, Viewbox ou taux minimum.',
    input_schema: { type: 'object', properties: { famille: S('texte contenu dans le nom de famille'), viewbox: S('identifiant VBX-…'), eta_min: N('taux minimum'), max: { type: 'integer', description: 'nombre maximum (défaut 25)' } } },
  },
  { name: 'catalogue', description: 'Ce qui est disponible pour les variantes : sections (clé, nom, aire, inertie, masse), matériaux, plaques de calage du stock et du commerce, assemblages Viewbox et leurs capacités.', input_schema: { type: 'object', properties: { quoi: { type: 'string', enum: ['sections', 'materiaux', 'plaques', 'assemblages'] } }, required: ['quoi'] } },
  {
    name: 'simuler_variante',
    description: 'Calcule une variante complète (éléments finis, toutes les combinaisons, vérifications, stabilité) avec les changements donnés, et la compare à l’étude actuelle. Environ 5 à 30 secondes. Renvoie un identifiant de variante (pour etudier_sol ou appliquer_variante). Peut reprendre une piste du diagnostic (piste) et/ou partir d’une variante précédente (base).',
    input_schema: {
      type: 'object',
      properties: {
        titre: S('titre court de la variante'),
        piste: S('identifiant d’une piste du diagnostic (ex. « sliding/ballast-slide »)'),
        base: S('identifiant d’une variante précédente à compléter'),
        hypotheses: HYPOTHESES,
        options_calcul: { type: 'object', properties: { pieds_a_verin: B('pieds à vérin Tr 24'), sortie_verin_mm: N('sortie des tiges (≤ 50 mm)'), frottement: N('frottement sol / calage à justifier') } },
        modifications: MODIFICATIONS,
      },
      required: ['titre'],
    },
  },
  {
    name: 'chercher_lest',
    description: 'Cherche par le calcul le lest minimal (kg par Viewbox, par pas de 100 kg) pour que le glissement et / ou le basculement passent, sur les Viewbox données (défaut : toutes celles posées au sol), puis vérifie la variante complète.',
    input_schema: { type: 'object', properties: { viewbox: { type: 'array', items: { type: 'string' } }, objectif: { type: 'string', enum: ['glissement', 'basculement', 'les_deux'] }, max_kg_par_viewbox: N('limite (défaut 5000)'), base: S('variante de départ') }, required: ['objectif'] },
  },
  {
    name: 'etudier_sol',
    description: 'Calage et pression au sol à partir des réactions du calcul (étude actuelle ou variante) : par type d’appui, pression, taux, solution de plaques retenue, conseils ; plaques de roulage ; public maximal admissible pour le sol. Permet de tester une autre portance ou un public limité. Donne la portance dans toutes les unités.',
    input_schema: {
      type: 'object',
      properties: { portance: PORTANCE, public_personnes: { type: ['integer', 'null'], description: 'nombre de personnes (null = charge réglementaire)' }, kg_par_personne: N('masse par personne (défaut 80)'), plaques_roulage: B('plaques de roulage sur toute la surface'), variante: S('identifiant de variante (défaut : étude actuelle)') },
    },
  },
  {
    name: 'appliquer_variante',
    description: 'Propose à l’utilisateur d’appliquer une variante simulée à l’étude (il confirme par un bouton). Les modifications hors modèle SketchUp sont listées dans le rapport.',
    input_schema: { type: 'object', properties: { variante: S('identifiant de variante'), raison: S('pourquoi cette variante') }, required: ['variante', 'raison'] },
  },
];

// ─── entrée / sortie ───

const Block = z.object({ type: z.string() }).passthrough();
const Message = z.object({ role: z.enum(['user', 'assistant']), content: z.union([z.string().max(20000), z.array(Block).max(200)]) });
export const AdvisorInput = z.object({ messages: z.array(Message).min(1).max(600), studyId: z.string().max(60).nullable().optional() });
export type AdvisorInputT = z.infer<typeof AdvisorInput>;

type Msg = { role: 'user' | 'assistant'; content: any };

const finalText = (content: any[]) =>
  (content ?? [])
    .filter((b: any) => b.type === 'text')
    .map((b: any) => b.text)
    .join('\n');

const EFFORT = 'high';

async function call(messages: Msg[], ctx: { userId?: string; studyId?: string | null }) {
  const body: Record<string, any> = {
    model: STRUCTURE_MODEL,
    max_tokens: 32000,
    system: ADVISOR_SYSTEM,
    tools: ADVISOR_TOOLS,
    messages,
    thinking: { type: 'adaptive', display: 'summarized' },
    output_config: { effort: EFFORT },
    // cache automatique du préfixe (consignes, outils, conversation)
    cache_control: { type: 'ephemeral' },
  };
  const t0 = Date.now();
  let data: any;
  try {
    // repli côté serveur sur un autre modèle en cas de refus (Claude API) ; sans cette option si elle est refusée
    try {
      data = await anthropicRequest({ ...body, fallbacks: 'default' }, { timeoutMs: 300000, retries: 1, betas: ['server-side-fallback-2026-07-01'] });
    } catch (e: any) {
      if (!(e instanceof AppError) || !/fallback|beta/i.test(e.message)) throw e;
      data = await anthropicRequest(body, { timeoutMs: 300000, retries: 1 });
    }
  } catch (e: any) {
    await logAdvisorCall(ctx, { model: STRUCTURE_MODEL, durationMs: Date.now() - t0 }, false, e.message);
    throw e;
  }
  const model = data.model ?? STRUCTURE_MODEL;
  const usage = {
    model,
    inputTokens: (data.usage?.input_tokens ?? 0) + (data.usage?.cache_read_input_tokens ?? 0) + (data.usage?.cache_creation_input_tokens ?? 0),
    outputTokens: data.usage?.output_tokens ?? 0,
    costUsd: costOf(model, data.usage ?? {}),
    durationMs: Date.now() - t0,
  };
  const stop = data.stop_reason;
  await logAdvisorCall(ctx, usage, stop !== 'refusal' && stop !== 'max_tokens', stop === 'refusal' || stop === 'max_tokens' ? `stop_reason=${stop}` : undefined);
  if (stop === 'refusal') throw new AppError('L’IA a refusé de répondre à cette demande : reformuler la question.', 422);
  if (stop === 'max_tokens') throw new AppError('Réponse de l’IA coupée (trop longue) : poser une question plus précise.', 502);
  return { data, usage };
}

/**
 * Un tour de conversation : réponse de Claude (outils à exécuter par le navigateur, ou réponse finale contrôlée).
 * Renvoie les messages à ajouter à l'historique (réponse, et le cas échéant la relance du garde-fou et la réponse corrigée).
 */
export async function advisorTurn(inp: AdvisorInputT, ctx: { userId?: string; studyId?: string | null }) {
  if (!aiEnabled()) throw new AppError('IA non configurée (clé API absente) : les pistes du diagnostic restent disponibles sans IA.', 503);
  const messages: Msg[] = inp.messages as Msg[];
  if (messages[messages.length - 1].role !== 'user') throw new AppError('La conversation doit se terminer par un message de l’utilisateur', 400);
  const append: Msg[] = [];
  let { data, usage } = await call(messages, ctx);
  append.push({ role: 'assistant', content: data.content });
  let unverified: number[] = [];
  if (data.stop_reason !== 'tool_use') {
    const allowed = advisorAllowedNumbers(ADVISOR_SYSTEM, messages);
    unverified = unknownNumbers(finalText(data.content), allowed);
    if (unverified.length) {
      logger.warn(`[structureAdvisor] chiffres hors outils (${unverified.join(', ')}) : relance`);
      const fix: Msg = {
        role: 'user',
        content: [{ type: 'text', text: `[Contrôle automatique de VEM] Ta réponse contient des nombres qui ne viennent d’aucun résultat d’outil ni de l’utilisateur : ${unverified.join(' ; ')}. Réécris ta réponse complète sans ces nombres, ou appelle d’abord l’outil qui les calcule.` }],
      };
      append.push(fix);
      const second = await call([...messages, ...append], ctx);
      append.push({ role: 'assistant', content: second.data.content });
      data = second.data;
      usage = { ...second.usage, inputTokens: usage.inputTokens + second.usage.inputTokens, outputTokens: usage.outputTokens + second.usage.outputTokens, costUsd: (usage.costUsd ?? 0) + (second.usage.costUsd ?? 0), durationMs: usage.durationMs + second.usage.durationMs };
      unverified = data.stop_reason === 'tool_use' ? [] : unknownNumbers(finalText(data.content), allowed);
    }
  }
  return { append, stopReason: data.stop_reason as string, unverified, usage };
}
