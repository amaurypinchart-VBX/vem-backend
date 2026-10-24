// src/middleware/rateLimit.ts
// Limiteur en mémoire (un seul serveur Railway) contre l'essai de mots de passe en rafale.
import { Request, Response, NextFunction } from 'express';

interface Bucket { count: number; resetAt: number }

export function rateLimit(opts: { windowMs: number; max: number; key?: (req: Request) => string; message?: string }) {
  const buckets = new Map<string, Bucket>();
  setInterval(() => {
    const now = Date.now();
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
  }, Math.min(opts.windowMs, 10 * 60 * 1000)).unref();

  return (req: Request, res: Response, next: NextFunction) => {
    const key = (opts.key ? opts.key(req) : '') + '|' + (req.ip || '');
    const now = Date.now();
    let b = buckets.get(key);
    if (!b || b.resetAt <= now) { b = { count: 0, resetAt: now + opts.windowMs }; buckets.set(key, b); }
    b.count++;
    if (b.count > opts.max) {
      res.setHeader('Retry-After', String(Math.ceil((b.resetAt - now) / 1000)));
      return res.status(429).json({ success: false, error: opts.message || 'Trop de tentatives, réessaie dans quelques minutes.' });
    }
    next();
  };
}
