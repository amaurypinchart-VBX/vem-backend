"use strict";
// src/services/aiService.ts
// Point d'entrée unique pour les appels à l'API Anthropic (Claude).
// Centralise ce qui était dupliqué dans routes/ai.ts, projectFromEmail.ts et
// bookingFromEmail.ts : gestion de la clé API, timeout, retry sur erreurs
// transitoires, extraction du JSON depuis la réponse et validation par zod.
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_MODEL = void 0;
exports.anthropicRequest = anthropicRequest;
exports.callClaude = callClaude;
exports.callClaudeJSON = callClaudeJSON;
const AppError_1 = require("../utils/AppError");
const logger_1 = require("../utils/logger");
exports.DEFAULT_MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
function getApiKey() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey)
        throw new AppError_1.AppError('Clé API Anthropic non configurée', 500);
    return apiKey;
}
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
// Appel bas niveau : renvoie le corps JSON complet de la réponse (utile pour
// le tool-use de l'assistant, qui a besoin des blocs `tool_use`, pas juste du texte).
async function anthropicRequest(body, opts = {}) {
    const { timeoutMs = 30000, retries = 1 } = opts;
    const apiKey = getApiKey();
    let lastErr;
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const response = await fetch(ANTHROPIC_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01',
                },
                body: JSON.stringify({ model: exports.DEFAULT_MODEL, ...body }),
                signal: AbortSignal.timeout(timeoutMs),
            });
            if (!response.ok) {
                const errText = await response.text();
                // 429 (rate limit) et 5xx sont transitoires → on retente une fois.
                if ((response.status === 429 || response.status >= 500) && attempt < retries) {
                    logger_1.logger.warn(`[aiService] Anthropic ${response.status}, retry (${attempt + 1}/${retries})`);
                    await sleep(500 * (attempt + 1));
                    continue;
                }
                throw new AppError_1.AppError(`Erreur API Anthropic (${response.status}) : ${errText.slice(0, 300)}`, 502);
            }
            return await response.json();
        }
        catch (e) {
            lastErr = e;
            if (e.name === 'AbortError' || e.name === 'TimeoutError') {
                lastErr = new AppError_1.AppError('Délai dépassé en attendant la réponse de Claude', 504);
            }
            if (e instanceof AppError_1.AppError)
                throw e;
            if (attempt < retries) {
                logger_1.logger.warn(`[aiService] échec réseau, retry (${attempt + 1}/${retries}) : ${e.message || e}`);
                await sleep(500 * (attempt + 1));
                continue;
            }
        }
    }
    throw lastErr instanceof AppError_1.AppError ? lastErr : new AppError_1.AppError(`Appel Anthropic échoué : ${lastErr?.message || lastErr}`, 502);
}
// Appel haut niveau pour un tour simple : renvoie le texte de la réponse.
async function callClaude(params) {
    const { messages, system, maxTokens = 1500, model, timeoutMs } = params;
    const data = await anthropicRequest({
        model: model || exports.DEFAULT_MODEL,
        max_tokens: maxTokens,
        ...(system ? { system } : {}),
        messages,
    }, { timeoutMs });
    if (data.stop_reason === 'max_tokens') {
        logger_1.logger.warn(`[aiService] réponse tronquée (max_tokens=${maxTokens} atteint)`);
    }
    return data.content?.[0]?.text || '';
}
// Cherche le premier bloc JSON équilibré ({...} ou [...]) dans un texte,
// en ignorant d'éventuels ``` ou ```json autour.
function extractJsonBlock(text) {
    const cleaned = text.replace(/```json|```/g, '').trim();
    const firstObj = cleaned.indexOf('{');
    const firstArr = cleaned.indexOf('[');
    const openChar = firstArr === -1 || (firstObj !== -1 && firstObj < firstArr) ? '{' : '[';
    const closeChar = openChar === '{' ? '}' : ']';
    const first = openChar === '{' ? firstObj : firstArr;
    const last = cleaned.lastIndexOf(closeChar);
    if (first === -1 || last <= first) {
        throw new AppError_1.AppError('Aucun JSON trouvé dans la réponse IA', 502);
    }
    return cleaned.slice(first, last + 1);
}
// Appel haut niveau pour une extraction structurée : parse + valide avec zod.
// Appelle anthropicRequest directement (plutôt que via callClaude) pour avoir
// accès à stop_reason : une réponse coupée par max_tokens produit un JSON
// incomplet qui échoue au parsing avec un message trompeur ("impossible de
// parser") alors que la vraie cause est un maxTokens trop bas pour la taille
// du prompt/de la sortie demandée (ex: rapports journaliers volumineux).
async function callClaudeJSON(params) {
    const { schema, messages, system, maxTokens = 1500, model, timeoutMs } = params;
    const data = await anthropicRequest({
        model: model || exports.DEFAULT_MODEL,
        max_tokens: maxTokens,
        ...(system ? { system } : {}),
        messages,
    }, { timeoutMs });
    const text = data.content?.[0]?.text || '';
    logger_1.logger.info(`[aiService] réponse brute (${text.length} car, stop_reason=${data.stop_reason}) : ${text.slice(0, 300)}`);
    let raw;
    try {
        raw = JSON.parse(extractJsonBlock(text));
    }
    catch (e) {
        if (data.stop_reason === 'max_tokens') {
            logger_1.logger.error(`[aiService] réponse tronquée (max_tokens=${maxTokens} atteint) — JSON incomplet`);
            throw new AppError_1.AppError(`La réponse IA a été coupée car elle dépassait la limite de ${maxTokens} tokens — réduis la quantité de texte envoyée (ex: une période plus courte) ou réessaie.`, 502);
        }
        logger_1.logger.error(`[aiService] JSON.parse échoué : ${e.message} — contenu : ${text.slice(0, 500)}`);
        throw new AppError_1.AppError('Impossible de parser la réponse IA', 502);
    }
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
        logger_1.logger.error(`[aiService] Réponse IA hors schéma : ${parsed.error.message} — contenu : ${text.slice(0, 500)}`);
        throw new AppError_1.AppError('Réponse IA invalide (hors schéma attendu)', 502);
    }
    return parsed.data;
}
//# sourceMappingURL=aiService.js.map