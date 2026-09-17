// src/routes/ai.ts
import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth';
import { logger } from '../utils/logger';
import { callClaudeJSON } from '../services/aiService';

const router = Router();

const DAILY_ENTRY_SCHEMA = z.array(z.object({
  time: z.string().catch(''),
  text: z.string(),
  category: z.enum(['arrivée', 'installation', 'transport', 'pause', 'départ', 'travaux', 'problème', 'validation']).catch('travaux'),
}));

// POST /api/v1/ai/parse-daily
// Parse raw daily report text into structured entries
router.post('/parse-daily', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { text } = req.body;
    if (!text?.trim()) return res.status(400).json({ success: false, error: 'Texte manquant' });

    const entries = await callClaudeJSON({
      maxTokens: 8000,
      schema: DAILY_ENTRY_SCHEMA,
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
    });

    res.json({ success: true, data: entries });
  } catch (err: any) {
    next(err);
  }
});
const ID_CARD_SCHEMA = z.object({
  firstName: z.string().catch(''),
  lastName: z.string().catch(''),
  birthDate: z.string().catch(''),
  birthPlace: z.string().catch(''),
  nationality: z.string().catch(''),
  idNumber: z.string().catch(''),
  nationalNumber: z.string().catch(''),
  expiryDate: z.string().catch(''),
});

// POST /api/v1/ai/scan-id
// OCR d'une carte d'identité : reçoit l'image en base64, renvoie les champs extraits.
router.post('/scan-id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { imageBase64, mediaType } = req.body;
    if (!imageBase64) return res.status(400).json({ success: false, error: 'Image manquante' });

    // Diagnostic : taille de l'image (base64) en Mo
    const imgSizeMB = (imageBase64.length * 0.75 / 1024 / 1024).toFixed(2);
    logger.info(`[scan-id] image ${imgSizeMB} Mo, media_type=${mediaType || 'image/jpeg'}`);

    let parsed: any;
    try {
      parsed = await callClaudeJSON({
        maxTokens: 800,
        schema: ID_CARD_SCHEMA,
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
      });
    } catch (e: any) {
      // L'IA n'a pas renvoyé de JSON exploitable : on log mais on n'échoue pas,
      // l'utilisateur peut remplir les champs manuellement.
      logger.warn(`[scan-id] extraction échouée (${e.message}), champs vides renvoyés`);
      parsed = {};
    }

    res.json({ success: true, data: parsed });
  } catch (err: any) {
    logger.error(`[scan-id] Échec : ${err.message}`);
    next(err);
  }
});

// POST /api/v1/ai/transcribe
// Transcrit un fichier audio (mp3, m4a, wav, ogg, webm) via OpenAI Whisper.
// Nécessite la variable d'env OPENAI_API_KEY.
import { upload } from '../services/cloudinaryService';
router.post('/transcribe', upload.single('audio'), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'Aucun fichier audio reçu' });
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(500).json({
      success: false,
      error: 'OPENAI_API_KEY non configuré sur Railway — ajoute cette variable d\'environnement pour activer la transcription audio',
    });

    // Construire un FormData multipart pour l'API OpenAI Whisper
    // Note : Node 18+ a un FormData / Blob natif, on l'utilise sans dépendance externe.
    const fd: any = new (globalThis as any).FormData();
    fd.append('file', new (globalThis as any).Blob([req.file.buffer], { type: req.file.mimetype }), req.file.originalname || 'audio.m4a');
    fd.append('model', 'whisper-1');
    // Langue forcée en français pour de meilleurs résultats sur nos cas d'usage typiques
    fd.append('language', 'fr');
    fd.append('response_format', 'json');

    logger.info(`[transcribe] envoi à Whisper : ${req.file.originalname} (${Math.round(req.file.size/1024)} KB)`);
    const r: any = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}` },
      body: fd,
    });

    if (!r.ok) {
      const errText = await r.text();
      logger.error(`[transcribe] Whisper a renvoyé ${r.status} : ${errText}`);
      return res.status(500).json({ success: false, error: `Whisper API : ${r.status} — ${errText.slice(0, 200)}` });
    }

    const data: any = await r.json();
    logger.info(`[transcribe] transcription OK (${(data.text||'').length} caractères)`);
    res.json({ success: true, data: { text: data.text || '' } });
  } catch (err: any) {
    logger.error(`[transcribe] erreur : ${err.message || err}`);
    next(err);
  }
});

export default router;