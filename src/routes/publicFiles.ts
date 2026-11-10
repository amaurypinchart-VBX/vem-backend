// src/routes/publicFiles.ts
// GET /api/v1/public/files/:id/:nom — fichier de plus de 10 Mo (limite de l'offre Cloudinary) rangé en morceaux par
// uploadToCloudinary : les morceaux sont relus sur Cloudinary et envoyés à la suite. Public comme une URL Cloudinary
// (l'id aléatoire de 24 caractères sert de clé), car l'app l'ouvre dans un onglet, un <iframe>, un <img> ou la
// visionneuse Office, sans en-tête d'authentification. Gère « Range » (vidéos sur iPhone, lecteurs PDF).
import { Router, Request, Response, NextFunction } from 'express';
import { once } from 'events';
import { prisma } from '../config/database';
import { SplitPart } from '../services/cloudinaryService';

const router = Router();
const db = prisma as any; // modèle SplitFile ajouté au schéma ; client typé régénéré au build Docker

/** Types affichés dans le navigateur ; les autres (SVG, Office, 3D…) sont proposés au téléchargement. */
const INLINE = /^(application\/pdf|image\/(jpeg|png|webp|gif|bmp|heic)|video\/|audio\/|text\/plain)/i;

async function fetchPart(p: SplitPart): Promise<Buffer> {
  const r = await fetch(p.url, { signal: AbortSignal.timeout(60_000) });
  if (!r.ok) throw new Error(`morceau illisible (${r.status})`);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length !== p.size) throw new Error(`morceau incomplet (${buf.length} / ${p.size} octets)`);
  return buf;
}

router.get('/:id/:name?', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id || '');
    const row = /^[A-Za-z0-9_-]{16,64}$/.test(id) ? await db.splitFile.findUnique({ where: { id } }) : null;
    if (!row) return res.status(404).type('text/plain').send('Fichier introuvable');
    const parts: SplitPart[] = Array.isArray(row.parts) ? row.parts : [];
    const total: number = row.size;

    // plage demandée (une seule)
    let start = 0;
    let end = total - 1;
    let partial = false;
    const m = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range || '').trim());
    if (m && (m[1] || m[2])) {
      if (m[1]) {
        start = Number(m[1]);
        end = m[2] ? Math.min(Number(m[2]), total - 1) : total - 1;
      } else {
        start = Math.max(0, total - Number(m[2]));
      }
      if (start > end || start >= total) {
        res.status(416).setHeader('Content-Range', `bytes */${total}`);
        return res.end();
      }
      partial = true;
    }

    // morceaux concernés, avec la portion de chacun
    const wanted: Array<{ part: SplitPart; from: number; to: number }> = [];
    let offset = 0;
    for (const part of parts) {
      const pStart = offset;
      const pEnd = offset + part.size - 1;
      offset += part.size;
      if (pEnd < start || pStart > end) continue;
      wanted.push({ part, from: Math.max(start, pStart) - pStart, to: Math.min(end, pEnd) - pStart + 1 });
    }

    const etag = `"${row.id}"`;
    if (!partial && req.headers['if-none-match'] === etag) return res.status(304).end();

    // premier morceau lu avant d'envoyer les en-têtes : une erreur Cloudinary donne une vraie réponse d'erreur
    const first = req.method === 'HEAD' || !wanted.length ? null : await fetchPart(wanted[0].part);

    const name: string = row.fileName;
    const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
    res.status(partial ? 206 : 200);
    res.setHeader('Content-Type', row.mimeType || 'application/octet-stream');
    res.setHeader('Content-Length', String(end - start + 1));
    res.setHeader('Accept-Ranges', 'bytes');
    if (partial) res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
    res.setHeader('Content-Disposition', `${INLINE.test(row.mimeType) ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`);
    // no-transform : la compression d'Express ne touche pas au fichier (Content-Length et plages exacts)
    res.setHeader('Cache-Control', 'private, max-age=86400, no-transform');
    res.setHeader('ETag', etag);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    if (!first) return res.end();

    for (let i = 0; i < wanted.length; i++) {
      const w = wanted[i];
      const buf = i === 0 ? first : await fetchPart(w.part);
      if (res.destroyed) return;
      if (!res.write(buf.subarray(w.from, w.to))) await once(res, 'drain');
    }
    res.end();
  } catch (err) {
    if (res.headersSent) res.destroy(err as Error);
    else next(err);
  }
});

export default router;
