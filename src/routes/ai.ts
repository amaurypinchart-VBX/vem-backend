// src/routes/ai.ts
import { Router, Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { logger } from '../utils/logger';

const router = Router();

// POST /api/v1/ai/parse-daily
// Parse raw daily report text into structured entries
router.post('/parse-daily', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { text } = req.body;
    if (!text?.trim()) return res.status(400).json({ success: false, error: 'Texte manquant' });

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(500).json({ success: false, error: 'Clé API Anthropic non configurée' });

    const response: any = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4000,
        messages: [{
          role: 'user',
          content: `Tu es un assistant pour des rapports de chantier. Analyse ce texte de rapport journalier et extrais UN tableau JSON d'entrées chronologiques.

OBJECTIF : préserver fidèlement chaque action ou observation du texte original. NE PAS RÉSUMER NI CONDENSER plusieurs actions en une seule entrée. Un point dans le texte = une entrée dans le tableau.

Pour chaque action/événement, crée une entrée avec :
- "time" : heure au format HH:MM (si aucune heure précise n'est mentionnée pour ce point, laisse "" — n'invente jamais une heure)
- "text" : description fidèle au texte source, en français. Garde tous les détails techniques mentionnés (noms de pièces, quantités, problèmes spécifiques). Tu peux corriger la grammaire et clarifier mais NE PAS résumer. Pas de limite stricte de caractères.
- "category" : une parmi : "arrivée", "installation", "transport", "pause", "départ", "travaux", "problème", "validation"

Règles importantes :
- Crée AUTANT d'entrées qu'il y a de points distincts dans le texte. Si l'utilisateur a écrit 8 lignes, tu dois rendre 8 entrées (ou plus s'il y a plusieurs actions par ligne).
- Si une heure est mentionnée (7h45, 9h15, 14h30, 16h...), utilise-la au format HH:MM.
- Garde l'ordre chronologique du texte d'origine.
- Ne fusionne JAMAIS deux actions distinctes, même si elles se suivent (ex: "9h arrivée et installation" → DEUX entrées : une "arrivée" + une "installation").
- Ne crée pas d'entrées vides.
- Si l'utilisateur fait des fautes d'orthographe, corrige-les mais garde le sens exact.

Réponds UNIQUEMENT avec le tableau JSON valide, sans texte avant ou après, sans backticks markdown.

Texte du rapport :
${text}`,
        }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Anthropic API error: ${response.status} — ${err}`);
    }

    const data = await response.json() as any;
    const content = data.content?.[0]?.text || '[]';

    let entries;
    try {
      entries = JSON.parse(content.replace(/```json|```/g, '').trim());
    } catch {
      throw new Error('Impossible de parser la réponse IA');
    }

    res.json({ success: true, data: entries });
  } catch (err: any) {
    next(err);
  }
});
// POST /api/v1/ai/scan-id
// OCR d'une carte d'identité : reçoit l'image en base64, renvoie les champs extraits.
router.post('/scan-id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { imageBase64, mediaType } = req.body;
    if (!imageBase64) return res.status(400).json({ success: false, error: 'Image manquante' });

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(500).json({ success: false, error: 'Clé API Anthropic non configurée' });

    // Diagnostic : taille de l'image (base64) en Mo
    const imgSizeMB = (imageBase64.length * 0.75 / 1024 / 1024).toFixed(2);
    logger.info(`[scan-id] image ${imgSizeMB} Mo, media_type=${mediaType || 'image/jpeg'}`);

    const response: any = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 800,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: imageBase64 },
            },
            {
              type: 'text',
              text: `Tu vois une carte d'identité, un passeport ou un permis de conduire. Extrait ce que tu peux lire en JSON strict, sans aucun texte autour, sans backticks :
{
  "firstName": "prénom (ou vide)",
  "lastName": "nom de famille (ou vide)",
  "birthDate": "YYYY-MM-DD (ou vide)",
  "birthPlace": "lieu de naissance (ou vide)",
  "nationality": "nationalité (ou vide)",
  "idNumber": "numéro du document (ou vide)",
  "nationalNumber": "numéro de registre national / NISS / NIE (ou vide)",
  "expiryDate": "YYYY-MM-DD (ou vide)"
}
Règles :
- Si une information n'est pas visible ou pas lisible, mets "" (chaîne vide).
- Pour les dates, convertis toujours au format YYYY-MM-DD.
- Réponds UNIQUEMENT avec le JSON, rien d'autre.`,
            },
          ],
        }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      logger.error(`[scan-id] Anthropic ${response.status}: ${err.slice(0, 500)}`);
      throw new Error(`Anthropic API error: ${response.status} — ${err.slice(0, 200)}`);
    }

    const data = await response.json() as any;
    const content = data.content?.[0]?.text || '';
    logger.info(`[scan-id] Réponse IA brute (${content.length} car) : ${content.slice(0, 200)}`);

    // Extraction JSON robuste : on cherche le premier { ... } équilibré dans la réponse
    let parsed: any = {};
    try {
      const cleaned = content.replace(/```json|```/g, '').trim();
      const firstBrace = cleaned.indexOf('{');
      const lastBrace  = cleaned.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace > firstBrace) {
        parsed = JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
      } else {
        // L'IA n'a pas renvoyé de JSON : on log mais on n'échoue pas
        logger.warn('[scan-id] Pas de JSON dans la réponse IA, champs vides renvoyés');
      }
    } catch (e: any) {
      logger.warn(`[scan-id] JSON.parse échoué (${e.message}), champs vides renvoyés`);
    }

    res.json({ success: true, data: parsed });
  } catch (err: any) {
    logger.error(`[scan-id] Échec : ${err.message}`);
    next(err);
  }
});

router.get('/test-key', async (req, res) => {
  res.json({ 
    hasKey: !!process.env.ANTHROPIC_API_KEY,
    keyStart: process.env.ANTHROPIC_API_KEY?.substring(0, 10) || 'MISSING'
  });
});
export default router;