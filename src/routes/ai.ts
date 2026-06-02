// src/routes/ai.ts
import { Router, Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';

const router = Router();

// POST /api/v1/ai/parse-daily
// Parse raw daily report text into structured entries
router.post('/parse-daily', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { text } = req.body;
    if (!text?.trim()) return res.status(400).json({ success: false, error: 'Texte manquant' });

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(500).json({ success: false, error: 'Clé API Anthropic non configurée' });

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: `Tu es un assistant pour des rapports de chantier. Analyse ce texte de rapport journalier et extrais UNIQUEMENT un tableau JSON d'entrées chronologiques.

Pour chaque action/événement identifié, crée une entrée avec :
- "time" : heure au format HH:MM (si pas d'heure précise, laisse "" — n'invente pas)
- "text" : description claire et concise en français (max 150 caractères)
- "category" : une parmi : "arrivée", "installation", "transport", "pause", "départ", "travaux", "problème", "validation"

Règles importantes :
- Si une heure est mentionnée (7h45, 9h15, 14h30, 16h...) utilise-la au format HH:MM
- Garde l'ordre chronologique strict
- Regroupe les descriptions sans heure en une entrée résumée avec time=""
- Sois précis et concis
- Ne crée pas d'entrées vides

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

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 500,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: imageBase64 },
            },
            {
              type: 'text',
              text: `Analyse cette carte d'identité et extrait les informations suivantes en JSON strict, sans texte autour :
{
  "firstName": "prénom",
  "lastName": "nom de famille",
  "birthDate": "YYYY-MM-DD ou vide",
  "birthPlace": "ville de naissance ou vide",
  "nationality": "nationalité ou vide",
  "idNumber": "numéro de la carte ou vide",
  "nationalNumber": "numéro de registre national ou vide",
  "expiryDate": "YYYY-MM-DD ou vide"
}
Si une information n'est pas visible, mets une chaîne vide "". Réponds UNIQUEMENT avec le JSON.`,
            },
          ],
        }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Anthropic API error: ${response.status} — ${err}`);
    }

    const data = await response.json() as any;
    const content = data.content?.[0]?.text || '{}';

    let parsed;
    try {
      parsed = JSON.parse(content.replace(/```json|```/g, '').trim());
    } catch {
      throw new Error('Impossible de parser la réponse IA');
    }

    res.json({ success: true, data: parsed });
  } catch (err: any) {
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
