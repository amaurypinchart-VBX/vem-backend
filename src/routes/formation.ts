// src/routes/formation.ts
// Support de formation VEM (deck HTML autonome généré par docs/formation/_source/build.mjs
// dans src/assets/formation.html). Réservé aux personnes connectées : monté derrière
// authMiddleware, et le fichier n'est PAS dans public/ (sinon express.static le servirait à tous).
// Le front le récupère avec le jeton puis l'ouvre dans un nouvel onglet (openFormation, 01-core.js).

import { Router, Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import { AppError } from '../utils/AppError';

const router = Router();

// ts-node-dev : __dirname = src/routes ; production : __dirname = dist/routes (src/ est copié dans l'image Docker)
// ?lang=en → version anglaise (formation-en.html), sinon le français.
const candidates = (name: string) => [
  path.join(__dirname, '..', 'assets', name),
  path.join(__dirname, '..', '..', 'src', 'assets', name),
];

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const name = req.query.lang === 'en' ? 'formation-en.html' : 'formation.html';
    const file = candidates(name).find((f) => fs.existsSync(f));
    if (!file) throw new AppError('Support de formation introuvable', 404);
    res.setHeader('Cache-Control', 'private, no-cache');
    res.type('html').send(fs.readFileSync(file, 'utf8'));
  } catch (err) { next(err); }
});

export default router;
