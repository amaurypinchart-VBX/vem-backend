// src/services/translationService.ts
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const MODEL = 'gpt-4o-mini';

export async function translateTexts(
  texts: (string | null | undefined)[],
  targetLang: 'fr' | 'en',
  sourceLang: 'fr' | 'en' = 'fr'
): Promise<(string | null)[]> {
  if (sourceLang === targetLang) {
    return texts.map(t => t || null);
  }

  const nonEmpty: { origIdx: number; text: string }[] = [];
  texts.forEach((t, i) => {
    if (t && String(t).trim()) nonEmpty.push({ origIdx: i, text: String(t).trim() });
  });
  if (nonEmpty.length === 0) {
    return texts.map(() => null);
  }

  if (!process.env.OPENAI_API_KEY) {
    console.warn('[translate] OPENAI_API_KEY non définie, fallback aux originaux');
    return texts.map(t => (t ? String(t) : null));
  }

  const fromName = sourceLang === 'fr' ? 'French' : 'English';
  const toName   = targetLang === 'fr' ? 'French' : 'English';

  try {
    const response = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: 'system',
            content: `You translate event logistics / construction site report entries from ${fromName} to ${toName}. Keep technical jargon accurate (boxes, rubber, roof tape, accreditations, scaffolding, crane, etc.). Be concise and professional. Reply with valid JSON: {"translations": [...]} with the same number of strings as input, in the same order. No preamble or commentary.`,
          },
          {
            role: 'user',
            content: JSON.stringify({ texts: nonEmpty.map(n => n.text) }),
          },
        ],
        temperature: 0.2,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      console.warn(`[translate] OpenAI HTTP ${response.status}`);
      return texts.map(t => (t ? String(t) : null));
    }

    const data: any = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) return texts.map(t => (t ? String(t) : null));

    const parsed = JSON.parse(content);
    const arr = parsed?.translations;
    if (!Array.isArray(arr) || arr.length !== nonEmpty.length) {
      console.warn(`[translate] OpenAI réponse mal formée`);
      return texts.map(t => (t ? String(t) : null));
    }

    const result: (string | null)[] = texts.map(t => (t ? String(t) : null));
    nonEmpty.forEach((n, i) => {
      result[n.origIdx] = typeof arr[i] === 'string' ? arr[i] : n.text;
    });
    return result;
  } catch (e) {
    console.error('[translate] erreur:', e);
    return texts.map(t => (t ? String(t) : null));
  }
}