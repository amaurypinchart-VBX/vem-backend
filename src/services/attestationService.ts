// src/services/attestationService.ts
// Attestation de bon montage (annexe V de l'arrêté du 25 juillet 2022) d'un handover : lecture des données du projet
// pour le préremplissage, valeurs modifiées à la main (colonne handovers.attestation), données du PDF.
// Logique pure : attestationLogic.ts ; dessin du PDF : renderAttestationPage dans pdfService.ts.
import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import * as L from './attestationLogic';

const db = prisma as any;

/** Clé app_settings des coordonnées de la société (admin / technical manager). */
export const COMPANY_SETTING_KEY = 'handover.attestationCompany';

export async function loadCompany(): Promise<L.AttestationCompany> {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: COMPANY_SETTING_KEY } });
    return L.cleanCompany(row?.value);
  } catch (e: any) {
    logger.warn(`[attestation] coordonnées société illisibles : ${e.message}`);
    return { ...L.DEFAULT_COMPANY };
  }
}

export async function saveCompany(input: any): Promise<L.AttestationCompany> {
  const value = L.cleanCompany(input, await loadCompany());
  await prisma.appSetting.upsert({
    where: { key: COMPANY_SETTING_KEY },
    create: { key: COMPANY_SETTING_KEY, value: value as any },
    update: { value: value as any },
  });
  return value;
}

/** Ce qu'il faut du handover pour l'attestation. */
async function loadHandover(handoverId: string) {
  return prisma.handover.findUnique({
    where: { id: handoverId },
    include: {
      project: { include: { client: { select: { name: true } } } },
      siteManager: { select: { firstName: true, lastName: true, phone: true } },
    },
  });
}
type HandoverRow = NonNullable<Awaited<ReturnType<typeof loadHandover>>>;

/** Une source absente (table pas encore créée, etc.) ne bloque jamais l'attestation. */
async function safe<T>(what: string, fn: () => Promise<T>, fallback: T): Promise<T> {
  try { return await fn(); } catch (e: any) { logger.warn(`[attestation] ${what} : ${e.message}`); return fallback; }
}

async function defaultsFor(h: HandoverRow): Promise<L.AttestationValues> {
  const projectId = h.projectId;
  const [company, checklist, approvals, planFiles, study] = await Promise.all([
    loadCompany(),
    safe('check-list', () => db.projectChecklist.findFirst({ where: { projectId, phase: 'installation' }, select: { viewboxType: true, boxesChecked: true } }), null),
    safe('plans validés', () => db.planApproval.findMany({
      where: { projectId, status: { in: ['approved', 'reserves'] } },
      orderBy: { decidedAt: 'desc' },
      select: { fileName: true, revision: true, ref: true, decidedAt: true, status: true },
      take: 8,
    }), [] as L.ApprovalRef[]),
    safe('plans du projet', () => prisma.projectFile.findMany({
      where: { projectId, category: 'plans' }, orderBy: { createdAt: 'desc' }, select: { fileName: true }, take: 12,
    }).then((rows) => rows.map((r) => r.fileName)), [] as string[]),
    safe('étude structure', () => db.structStudy.findFirst({ where: { projectId }, orderBy: { updatedAt: 'desc' }, select: { settings: true } }), null),
  ]);
  return L.attestationDefaults({
    customFields: (h.customFields as Record<string, any> | null) || null,
    project: h.project,
    // société cliente (handovers.client_name devient le nom du signataire au moment de la signature)
    clientName: h.project.client?.name || h.clientName || null,
    siteManager: h.siteManager,
    company,
    checklist,
    approvals,
    planFiles,
    studyHyp: (study?.settings as any)?.hyp ?? null,
  });
}

export interface ResolvedAttestation {
  enabled: boolean;
  values: L.AttestationValues;
  defaults: L.AttestationValues;
  /** clés modifiées à la main */
  edited: L.AttestationKey[];
  /** date imprimée après « Le : » */
  effectiveDate: string;
  hasSignature: boolean;
  clientSigned: boolean;
  missing: string[];
  company: L.AttestationCompany;
  updatedAt: string | null;
}

export async function resolveAttestation(handoverId: string): Promise<ResolvedAttestation | null> {
  const h = await loadHandover(handoverId);
  if (!h) return null;
  return resolveFor(h);
}

async function resolveFor(h: HandoverRow): Promise<ResolvedAttestation> {
  const stored = L.readStored((h as any).attestation);
  const defaults = await defaultsFor(h);
  const values = L.mergeValues(defaults, stored.values);
  const cf = (h.customFields as Record<string, any> | null) || {};
  const typed = cf.handoverDate ? new Date(String(cf.handoverDate)) : null;
  const handoverDate = typed && !isNaN(typed.getTime()) ? typed : h.createdAt;
  return {
    enabled: stored.enabled,
    values,
    defaults,
    edited: Object.keys(stored.values) as L.AttestationKey[],
    effectiveDate: L.effectiveDate(values, h.clientSignedAt, handoverDate),
    hasSignature: !!h.managerSignatureUrl,
    clientSigned: !!h.clientSignedAt,
    missing: L.missingFields(values, !!h.managerSignatureUrl),
    company: await loadCompany(),
    updatedAt: stored.updatedAt || null,
  };
}

/** Enregistre les valeurs du formulaire : seuls les champs différents du préremplissage sont gardés. */
export async function saveAttestation(handoverId: string, body: any, userId: string | null): Promise<ResolvedAttestation | null> {
  const h = await loadHandover(handoverId);
  if (!h) return null;
  const prev = L.readStored((h as any).attestation);
  const defaults = await defaultsFor(h);
  const incoming = L.cleanValues(body?.values);
  const next: L.StoredAttestation = {
    enabled: typeof body?.enabled === 'boolean' ? body.enabled : prev.enabled,
    values: L.editedOnly({ ...prev.values, ...incoming }, defaults),
    updatedAt: new Date().toISOString(),
    updatedBy: userId,
  };
  await db.handover.update({ where: { id: handoverId }, data: { attestation: next } });
  return resolveFor({ ...h, attestation: next } as any);
}

/** Données dessinées par renderAttestationPage (pdfService.ts). */
export interface AttestationPdf {
  values: L.AttestationValues;
  /** date après « Le : » (JJ/MM/AAAA) */
  date: string;
  /** signature du responsable du montage (celle du Site Manager dans le handover) */
  signatureUrl: string | null;
  /** rappel en tête de page : handover auquel l'attestation est jointe */
  reference: string;
}

/**
 * Attestation à joindre au PDF du handover : seulement une fois le client signé (et si elle n'est pas désactivée).
 * `clientSignedAt` : signature en cours d'enregistrement (lien public) ; `force` : aperçu, même avant la signature.
 * Ne lève jamais : en cas d'erreur, le handover part sans attestation (et c'est journalisé).
 */
export async function attestationForPdf(handoverId: string, opts: { clientSignedAt?: Date | null; force?: boolean } = {}): Promise<AttestationPdf | null> {
  try {
    const h = await loadHandover(handoverId);
    if (!h) return null;
    const stored = L.readStored((h as any).attestation);
    const signedAt = opts.clientSignedAt || h.clientSignedAt;
    if (!opts.force && (!stored.enabled || !signedAt)) return null;
    const r = await resolveFor({ ...h, clientSignedAt: signedAt } as any);
    return {
      values: r.values,
      date: r.effectiveDate,
      signatureUrl: h.managerSignatureUrl || null,
      reference: `Jointe au Handover Certificate — ${r.values.eventName || h.project.name} (N° ${h.project.internalNumber})`,
    };
  } catch (e: any) {
    logger.error(`[attestation] handover ${handoverId} : ${e.message}`);
    return null;
  }
}
