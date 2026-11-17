// src/services/planApprovalLogic.ts
// Logique pure de la validation des plans par le client (sans base de données ni réseau) :
// révisions, codes à usage unique, contrôle de ce que le client envoie. Testé par tests/planApproval.test.ts.
import crypto from 'crypto';

export const SEND_ROLES = ['admin', 'technical_manager', 'sales_engineer'];
export const DECISIONS = ['approved', 'reserves', 'changes'] as const;
export type Decision = typeof DECISIONS[number];
export type Lang = 'fr' | 'en';

/** Durée de validité du lien (jours) — renvoyer le lien la prolonge. */
export const LINK_DAYS = 30;
/** Code par e-mail : validité, essais, intervalle entre deux envois, nombre d'envois par demande. */
export const CODE_MINUTES = 15;
export const CODE_MAX_ATTEMPTS = 5;
export const CODE_RESEND_SECONDS = 45;
export const CODE_MAX_SENDS = 12;
/** Signature dessinée (data URL) : taille maximale. */
export const SIGNATURE_MAX_CHARS = 700_000;
/** PDF joint aux e-mails jusqu'à cette taille, au-delà : lien de téléchargement. */
export const MAIL_ATTACH_MAX_BYTES = 15 * 1024 * 1024;

export const EMAIL_RE = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]{2,}$/;

export function cleanEmail(v: unknown): string | null {
  const s = String(v ?? '').trim().toLowerCase();
  return EMAIL_RE.test(s) && s.length <= 200 ? s : null;
}

/** Liste d'adresses (tableau ou texte séparé par , ; espaces) → adresses valides, sans doublon. */
export function cleanEmailList(v: unknown): string[] {
  const raw = Array.isArray(v) ? v.map(String) : String(v ?? '').split(/[\s,;]+/);
  const out: string[] = [];
  for (const r of raw) {
    const e = cleanEmail(r);
    if (e && !out.includes(e)) out.push(e);
  }
  return out.slice(0, 20);
}

/** Révision suivante : A, B … Z, AA, AB … (on part de la plus haute révision « lettres » déjà envoyée). */
export function nextRevision(existing: string[]): string {
  const toN = (s: string) => s.split('').reduce((n, c) => n * 26 + (c.charCodeAt(0) - 64), 0);
  const toS = (n: number) => { let s = ''; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; };
  let max = 0;
  for (const r of existing) {
    const s = String(r || '').trim().toUpperCase();
    if (/^[A-Z]{1,3}$/.test(s)) max = Math.max(max, toN(s));
  }
  return toS(max + 1);
}

export function cleanRevision(v: unknown, fallback: string): string {
  const s = String(v ?? '').trim().replace(/^(rév\.?|rev\.?|révision|revision)\s*/i, '').slice(0, 12);
  return s || fallback;
}

/** Adresse masquée pour la page publique : j•••n@client.com */
export function maskEmail(email: string): string {
  const [user, domain] = String(email).split('@');
  if (!domain) return '•••';
  const u = user.length <= 2 ? `${user[0] || ''}•••` : `${user[0]}•••${user[user.length - 1]}`;
  return `${u}@${domain}`;
}

export function newToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

/** Référence lisible dans les e-mails : VAL-XXXXXX (sans 0 / O / 1 / I). */
export function newRef(): string {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const b = crypto.randomBytes(6);
  return 'VAL-' + Array.from(b, (x) => A[x % A.length]).join('');
}

export function newCode(): string {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

export function hashCode(approvalId: string, code: string): string {
  return crypto.createHash('sha256').update(`${approvalId}:${String(code).replace(/\D/g, '')}`).digest('hex');
}

export function sameHash(a: string | null | undefined, b: string): boolean {
  if (!a || a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export function sha256(buf: Buffer): string {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

/** État vu par le client : pending devient expired quand le lien a dépassé sa date. */
export function publicStatus(row: { status: string; expiresAt: Date | string }, now = new Date()): string {
  if (row.status === 'pending' && new Date(row.expiresAt).getTime() < now.getTime()) return 'expired';
  return row.status;
}

export interface SignInput {
  decision: Decision;
  comment: string | null;
  name: string;
  title: string | null;
  company: string | null;
  signature: string | null;
  code: string;
}

const MSG = {
  fr: {
    decision: 'Choisissez : valider, valider avec réserves, ou demander des modifications.',
    comment: 'Merci de décrire vos réserves ou les modifications demandées.',
    name: 'Indiquez votre nom.',
    signature: 'Signez dans le cadre prévu.',
    reviewed: 'Cochez « J’ai vérifié l’ensemble des plans ».',
    code: 'Tapez le code à 6 chiffres reçu par e-mail.',
  },
  en: {
    decision: 'Choose: approve, approve with reservations, or request changes.',
    comment: 'Please describe your reservations or the changes requested.',
    name: 'Please enter your name.',
    signature: 'Please sign in the box.',
    reviewed: 'Please tick “I have checked all the plans”.',
    code: 'Please type the 6-digit code received by e-mail.',
  },
};

const str = (v: unknown, max: number) => {
  const s = String(v ?? '').replace(/\s+$/g, '').trim();
  return s ? s.slice(0, max) : null;
};

/** Contrôle ce que la page de signature envoie. Réserves et modifications : commentaire obligatoire. */
export function checkSignInput(body: any, lang: Lang): { ok: true; input: SignInput } | { ok: false; error: string } {
  const m = MSG[lang] || MSG.fr;
  const decision = String(body?.decision || '') as Decision;
  if (!DECISIONS.includes(decision)) return { ok: false, error: m.decision };
  const comment = str(body?.comment, 5000);
  if ((decision === 'reserves' || decision === 'changes') && (!comment || comment.replace(/\W/g, '').length < 3)) return { ok: false, error: m.comment };
  const name = str(body?.name, 120);
  if (!name) return { ok: false, error: m.name };
  const signature = typeof body?.signature === 'string' && /^data:image\/(png|jpe?g);base64,[A-Za-z0-9+/=]+$/.test(body.signature) && body.signature.length <= SIGNATURE_MAX_CHARS
    ? body.signature : null;
  if (decision !== 'changes' && !signature) return { ok: false, error: m.signature };
  if (decision !== 'changes' && body?.reviewed !== true) return { ok: false, error: m.reviewed };
  const code = String(body?.code ?? '').replace(/\D/g, '');
  if (code.length !== 6) return { ok: false, error: m.code };
  return {
    ok: true,
    input: { decision, comment, name, title: str(body?.title, 120), company: str(body?.company, 160), signature: decision === 'changes' ? null : signature, code },
  };
}

/** Nom de fichier du PDF validé : « Plans_Rev-B_VALIDE.pdf ». */
export function validatedFileName(fileName: string, revision: string, decision: Decision): string {
  const base = String(fileName || 'plans.pdf').replace(/\.pdf$/i, '').replace(/[\\/:*?"<>|]+/g, '-').slice(0, 150);
  const tag = decision === 'reserves' ? 'VALIDE-AVEC-RESERVES' : 'VALIDE';
  return `${base}_Rev-${revision.replace(/[^A-Za-z0-9-]+/g, '')}_${tag}.pdf`;
}

/** Statut affiché dans VEM. */
export const STATUS_LABELS: Record<string, string> = {
  pending: 'En attente', expired: 'Lien expiré', approved: 'Validé', reserves: 'Validé avec réserves',
  changes: 'Modifications demandées', cancelled: 'Annulée', superseded: 'Remplacée',
};
