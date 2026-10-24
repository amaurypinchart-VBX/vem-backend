// src/routes/users.ts
import { Router, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../config/database';
import { AuthRequest, projectIds } from '../middleware/auth';
import { plansAccessUserIds } from '../middleware/plansAccess';
import { GRANTS, PEOPLE_MANAGER_ROLES, PLANS_OPTIONAL_ROLES } from '../middleware/access';
import { AppError } from '../utils/AppError';
import { logger } from '../utils/logger';
import { sendMail } from '../services/emailService';
import crypto from 'crypto';

const router = Router();

// Champs modifiables d'une fiche (liste blanche)
const EDITABLE_FIELDS = [
  'firstName', 'lastName', 'email', 'phone', 'role', 'avatarUrl',
  'birthDate', 'birthPlace', 'nationality', 'idNumber', 'nationalNumber',
  'idExpiry', 'teamGroupId', 'isActive',
] as const;

// Champs renvoyés (jamais le passwordHash)
const USER_SELECT = {
  id: true, email: true, firstName: true, lastName: true, phone: true,
  role: true, avatarUrl: true, birthDate: true, birthPlace: true,
  nationality: true, idNumber: true, nationalNumber: true, idExpiry: true,
  teamGroupId: true, isActive: true, lastLogin: true,
};

// Fiche réduite : ce que les autres rôles voient (pas de n° de carte d'identité, n° national, date de naissance…)
const PUBLIC_SELECT = { id: true, email: true, firstName: true, lastName: true, phone: true, role: true, avatarUrl: true, teamGroupId: true, isActive: true };
const CLIENT_SELECT = { id: true, firstName: true, lastName: true, role: true, avatarUrl: true };

const isPeopleManager = (req: AuthRequest) => PEOPLE_MANAGER_ROLES.includes(req.user!.role);
/** Rôles qu'un responsable peut donner / retirer : admin et technical manager seulement par un admin. */
const canAssignRole = (req: AuthRequest, role: string | undefined | null) =>
  !role || req.user!.role === 'admin' || !['admin', 'technical_manager'].includes(role);

async function accessGrantsMap(): Promise<Map<string, string[]>> {
  try {
    const rows = await prisma.$queryRaw<Array<{ id: string; access_grants: string[] | null }>>`SELECT id, access_grants FROM users`;
    return new Map(rows.map((r) => [r.id, r.access_grants || []]));
  } catch { return new Map(); }
}

router.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const scope = req.access!.scope;
    if (scope !== 'all') {
      // accès limité : soi-même + les personnes de ses projets (fiche réduite ; pour un client, juste les noms)
      const ids = (await projectIds(req)) || [];
      const team = await prisma.projectTeam.findMany({ where: { projectId: { in: ids } }, select: { userId: true } });
      const tms = await prisma.project.findMany({ where: { id: { in: ids } }, select: { technicalManagerId: true } });
      const userIds = [...new Set([req.user!.id, ...team.map((t) => t.userId), ...tms.map((p) => p.technicalManagerId).filter((x): x is string => !!x)])];
      const users = await prisma.user.findMany({
        where: { id: { in: userIds }, isActive: true },
        select: scope === 'client' ? CLIENT_SELECT : PUBLIC_SELECT,
        orderBy: { lastName: 'asc' },
      });
      return res.json({ success: true, data: users.map((u) => ({ ...u, plansAccess: false })) });
    }
    const users = await prisma.user.findMany({
      where: { isActive: true },
      select: isPeopleManager(req) ? USER_SELECT : PUBLIC_SELECT,
      orderBy: { lastName: 'asc' },
    });
    const plansIds = await plansAccessUserIds();
    const grants = await accessGrantsMap();
    res.json({ success: true, data: users.map((u) => ({ ...u, plansAccess: plansIds.has(u.id), accessGrants: grants.get(u.id) || [] })) });
  } catch (err) { next(err); }
});

// PUT /api/v1/users/:id/plans-access { enabled }
// Active / retire l'accès aux outils Plans 2D pour un project manager ou un engineer (admin et technical manager
// l'ont toujours ; sales, site manager, installateur, client ne l'ont jamais). Réservé aux admins et technical managers.
router.put('/:id/plans-access', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!['admin', 'technical_manager'].includes(req.user!.role)) throw new AppError('Permission insuffisante', 403);
    const target = await prisma.user.findUnique({ where: { id: req.params.id }, select: { role: true } });
    if (!target) throw new AppError('Utilisateur introuvable', 404);
    const enabled = req.body?.enabled === true;
    if (enabled && !PLANS_OPTIONAL_ROLES.includes(target.role))
      throw new AppError('Les Plans 2D ne s’activent que pour un project manager ou un engineer (admin et technical manager les ont toujours).', 400);
    await prisma.$executeRaw`UPDATE users SET plans_access = ${enabled} WHERE id = ${req.params.id}`;
    logger.info(`[plans-access] ${req.user!.email} → ${req.params.id} : ${enabled ? 'activé' : 'retiré'}`);
    res.json({ success: true, data: { id: req.params.id, plansAccess: enabled } });
  } catch (err) { next(err); }
});

// PUT /api/v1/users/:id/access-grants { grants: ['daily_reports' | 'handover' | 'checklists'] }
// Droits d'écriture donnés à un installateur / ouvrier sur SES projets (par défaut il ne peut que consulter).
router.put('/:id/access-grants', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!isPeopleManager(req)) throw new AppError('Permission insuffisante', 403);
    const raw: unknown[] = Array.isArray(req.body?.grants) ? req.body.grants : [];
    const grants = [...new Set(raw.map(String).filter((g) => (GRANTS as readonly string[]).includes(g)))];
    const n = await prisma.$executeRaw`UPDATE users SET access_grants = ${grants}::text[] WHERE id = ${req.params.id}`;
    if (!n) throw new AppError('Utilisateur introuvable', 404);
    logger.info(`[access-grants] ${req.user!.email} → ${req.params.id} : ${grants.join(', ') || 'aucun'}`);
    res.json({ success: true, data: { id: req.params.id, accessGrants: grants } });
  } catch (err) { next(err); }
});

router.post('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!isPeopleManager(req)) throw new AppError('Permission insuffisante', 403);
    if (!canAssignRole(req, req.body.role)) throw new AppError('Seul un admin peut créer un compte admin ou technical manager', 403);
    // plus de mot de passe par défaut commun à tous les comptes : un mot de passe aléatoire est renvoyé une fois
    const password = req.body.password || crypto.randomBytes(9).toString('base64url');
    if (String(password).length < 8) throw new AppError('Mot de passe trop court (min 8 caractères)', 400);
    const passwordHash = await bcrypt.hash(password, 12);

    // Liste blanche : on n'insère que les champs autorisés
    const data: any = { passwordHash };
    for (const key of EDITABLE_FIELDS) {
      if (req.body[key] !== undefined) data[key] = req.body[key];
    }
    if (typeof data.email === 'string') data.email = data.email.toLowerCase();

    // Log diagnostic : on log les champs envoyés (sans le passwordHash)
    const { passwordHash: _ph, ...safe } = data;
    logger.info(`[create-user] champs envoyés : ${JSON.stringify(safe)}`);

    try {
      const user = await prisma.user.create({
        data,
        select: USER_SELECT,
      });
      res.status(201).json({ success: true, data: { user, tempPassword: password } });
    } catch (createErr: any) {
      // Log explicite de la cause Prisma pour faciliter le diagnostic
      logger.error(`[create-user] échec Prisma : code=${createErr.code || '?'} | meta=${JSON.stringify(createErr.meta || {})} | msg=${createErr.message?.slice(0, 300)}`);

      // Diagnostic à la volée : on inspecte la structure réelle de la table users
      // et l'enum UserRole pour comprendre où est la divergence avec le schéma Prisma.
      try {
        const cols = await prisma.$queryRawUnsafe(
          `SELECT column_name, data_type, udt_name FROM information_schema.columns WHERE table_name = 'users' ORDER BY ordinal_position;`
        ) as Array<{ column_name: string; data_type: string; udt_name: string }>;
        logger.error(`[diag-on-error] colonnes users : ${cols.map(c => `${c.column_name}:${c.data_type}/${c.udt_name}`).join(' | ')}`);

        const enumVals = await prisma.$queryRawUnsafe(
          `SELECT enumlabel FROM pg_enum WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'UserRole') ORDER BY enumsortorder;`
        ) as Array<{ enumlabel: string }>;
        logger.error(`[diag-on-error] UserRole : ${enumVals.map(e => e.enumlabel).join(', ')}`);
      } catch (diagErr: any) {
        logger.error(`[diag-on-error] échec lecture méta : ${diagErr.message}`);
      }

      throw createErr;
    }
  } catch (err) { next(err); }
});

router.patch('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const self = req.user!.id === req.params.id;
    const manager = isPeopleManager(req);
    if (!self && !manager) throw new AppError('Permission insuffisante', 403);

    // On ne garde que les champs autorisés réellement présents dans le corps.
    // Sa propre fiche : nom, téléphone, photo seulement (jamais son rôle, son statut ou son e-mail de connexion ;
    // le mot de passe se change par « Changer mon mot de passe », qui demande l'ancien).
    const fields: readonly string[] = manager && !self ? EDITABLE_FIELDS : ['firstName', 'lastName', 'phone', 'avatarUrl'];
    const data: any = {};
    for (const key of fields) {
      if (req.body[key] !== undefined) data[key] = req.body[key];
    }
    if (typeof data.email === 'string') data.email = data.email.toLowerCase();
    if (!self && manager) {
      const target = await prisma.user.findUnique({ where: { id: req.params.id }, select: { role: true } });
      if (!target) throw new AppError('Utilisateur introuvable', 404);
      if (!canAssignRole(req, target.role) || !canAssignRole(req, data.role))
        throw new AppError('Seul un admin peut modifier un compte admin / technical manager ou donner ces rôles', 403);
      if (req.body.password) {
        if (String(req.body.password).length < 8) throw new AppError('Mot de passe trop court (min 8 caractères)', 400);
        data.passwordHash = await bcrypt.hash(req.body.password, 12);
      }
    }

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data,
      select: USER_SELECT,
    });
    res.json({ success: true, data: user });
  } catch (err) { next(err); }
});

// POST /api/v1/users/:id/send-invite
// Génère un mot de passe temporaire (15 min), l'applique au compte, l'envoie par email.
router.post('/:id/send-invite', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!isPeopleManager(req)) throw new AppError('Permission insuffisante', 403);

    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) throw new AppError('Utilisateur introuvable', 404);
    if (!canAssignRole(req, user.role)) throw new AppError('Seul un admin peut réinitialiser un compte admin / technical manager', 403);
    if (!user.email) throw new AppError('Cet utilisateur n\'a pas d\'email', 400);

    // Mot de passe temporaire : 8 caractères non ambigus
    const tempPassword = Array.from(crypto.randomBytes(8))
      .map(b => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 32]).join('');
    const passwordHash = await bcrypt.hash(tempPassword, 12);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });

    await (prisma as any).$executeRaw`
      INSERT INTO invite_passwords (user_id, expires_at, created_at)
      VALUES (${user.id}, ${expiresAt}, NOW())
      ON CONFLICT (user_id) DO UPDATE SET expires_at = ${expiresAt}, created_at = NOW()
    `;

    // Révoque d'éventuelles sessions existantes
    await prisma.refreshToken.deleteMany({ where: { userId: user.id } });

    const appUrl = process.env.APP_URL || 'https://viewboxsitemanagement.up.railway.app';
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;background:#111318;color:#f0f2f5;padding:32px;border-radius:12px;">
        <div style="font-size:24px;font-weight:800;color:#e63946;">VEM</div>
        <div style="font-size:11px;color:#8892a4;margin-bottom:24px;text-transform:uppercase;letter-spacing:1px;">ViewBox Event Manager</div>
        <h2 style="font-size:20px;margin:0 0 12px;">Votre acces VEM</h2>
        <p style="color:#9ba3b2;line-height:1.6;">Bonjour ${user.firstName},</p>
        <p style="color:#9ba3b2;line-height:1.6;">Un compte a ete cree pour vous. Connectez-vous avec les identifiants ci-dessous, puis choisissez votre propre mot de passe.</p>
        <div style="background:#1a1d24;border-radius:8px;padding:16px;margin:16px 0;">
          <div style="font-size:12px;color:#5a6275;">Email</div>
          <div style="font-size:15px;font-weight:700;margin-bottom:10px;">${user.email}</div>
          <div style="font-size:12px;color:#5a6275;">Mot de passe temporaire</div>
          <div style="font-size:22px;font-weight:800;letter-spacing:3px;color:#e63946;font-family:monospace;">${tempPassword}</div>
        </div>
        <div style="background:#3a1a1a;border-radius:8px;padding:10px 14px;margin:16px 0;font-size:13px;color:#ffb4b4;">
          Ce mot de passe expire dans <strong>15 minutes</strong>. Connectez-vous tout de suite.
        </div>
        <div style="text-align:center;margin:24px 0;">
          <a href="${appUrl}" style="background:#e63946;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:700;display:inline-block;">Se connecter</a>
        </div>
        <p style="color:#5a6275;font-size:12px;">Si le delai est depasse, demandez un nouvel envoi.</p>
      </div>`;

    await sendMail({
      to: user.email,
      subject: 'Votre acces VEM - mot de passe temporaire',
      html,
    });

    res.json({ success: true, data: { sentTo: user.email, expiresAt } });
  } catch (err) { next(err); }
});
//test
export default router;
