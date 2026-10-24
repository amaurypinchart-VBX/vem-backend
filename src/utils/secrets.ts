// src/utils/secrets.ts
// Secrets de signature des jetons. Sans variable d'environnement, on n'utilise plus de valeur écrite dans le code
// (n'importe qui lisant le dépôt aurait pu fabriquer un jeton admin) : un secret aléatoire est tiré au démarrage
// — les sessions sont alors perdues à chaque redémarrage. Mettre JWT_SECRET dans Railway › Variables.
import crypto from 'crypto';
import { logger } from './logger';

const KNOWN_DEFAULTS = ['vem-secret-change-me', 'vem-refresh-change-me'];

function secret(name: string, warn = true): string {
  const v = process.env[name];
  if (v && v.length >= 16 && !KNOWN_DEFAULTS.includes(v)) return v;
  if (warn) logger.error(`[sécurité] ${name} absente ou trop faible : secret aléatoire utilisé (les connexions sautent à chaque redémarrage). Définis ${name} dans Railway › Variables (au moins 32 caractères aléatoires).`);
  return crypto.randomBytes(48).toString('base64');
}

export const JWT_SECRET = secret('JWT_SECRET');
// le jeton de rafraîchissement est vérifié par sa présence en base (table refresh_tokens), pas par sa signature
export const JWT_REFRESH_SECRET = secret('JWT_REFRESH_SECRET', false);
