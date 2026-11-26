// src/services/attestationLogic.ts
// Attestation de bon montage (annexe V de l'arrêté du 25 juillet 2022, article 38 — structures provisoires et
// démontables), jointe au PDF du handover une fois le client signé (A. Pinchart 26.11.2026 : « une fois que le
// client a signé, dans le pdf de fin qui sera envoyé, ce document mis à notre nom et société, prérempli avec les
// infos du stand et du client, modifiable si besoin »).
// Logique pure (aucun import) : champs, nettoyage, préremplissage, champs manquants. Tests : tests/attestationLogic.test.ts.

/** Liaison au sol cochée ; aucune = rubrique entièrement rayée (comme le modèle Viewbox 2026). */
export const GROUND_LINKS = ['ancrage', 'haubanage', 'lestage', 'autoporte'] as const;
export type GroundLink = typeof GROUND_LINKS[number];
export const GROUND_LINK_LABELS: Record<GroundLink, string> = {
  ancrage: 'ancrage', haubanage: 'haubanage', lestage: 'lestage', autoporte: 'autoporté',
};

/** Sécurisation des équipements techniques suspendus : article 26 | sans objet | autre (texte) ; '' = pas encore choisi. */
export type Suspended = 'art26' | 'none' | 'other' | '';

export interface AttestationValues {
  // Événement
  eventName: string;
  eventAddress: string;
  eventDates: string;
  // Entreprise en charge de l'installation
  companyName: string;
  companyAddress: string;
  companyEmail: string;
  companyPhone: string;
  managerName: string;
  managerPhone: string;
  managerFunction: string;
  // Caractéristiques de l'ensemble démontable
  manufacturer: string;
  description: string;
  documents: string;
  groundLink: GroundLink[];
  /** vitesse de vent retenue, en km/h (texte : « 72 », « 64 (17,8 m/s) ») */
  windSpeed: string;
  suspended: Suspended;
  suspendedOther: string;
  // Certification
  /** « Je, soussigné, (Nom, prénom et fonction) » */
  signatory: string;
  /** le / les ensemble(s) démontable(s) */
  plural: 'le' | 'les';
  /** « à la notice technique et aux plans du fabricant (1) » gardé (sinon rayé) */
  notice: boolean;
  /** « à la conclusion de la note de calcul (1) » */
  calcNote: boolean;
  /** « à l'avis sur modèle type ou sur dossier technique (1) » */
  typeOpinion: boolean;
  /** Fait à */
  place: string;
  /** Le : AAAA-MM-JJ ; '' = date de la signature du client (sinon date du handover) */
  date: string;
}

export type AttestationKey = keyof AttestationValues;

/** Longueur maximale de chaque texte (le PDF tient sur une page). */
const TEXT_MAX: Partial<Record<AttestationKey, number>> = {
  eventName: 160, eventAddress: 240, eventDates: 120,
  companyName: 120, companyAddress: 200, companyEmail: 120, companyPhone: 60,
  managerName: 120, managerPhone: 60, managerFunction: 80,
  manufacturer: 160, description: 400, documents: 1200,
  windSpeed: 40, suspendedOther: 200, signatory: 200, place: 80, date: 10,
};
export const TEXT_KEYS = Object.keys(TEXT_MAX) as AttestationKey[];
const BOOL_KEYS: AttestationKey[] = ['notice', 'calcNote', 'typeOpinion'];

/** Libellés (formulaire, champs manquants). */
export const ATTESTATION_LABELS: Record<AttestationKey, string> = {
  eventName: 'Nom de l’événement', eventAddress: 'Adresse de l’événement', eventDates: 'Dates de l’événement',
  companyName: 'Nom de l’entreprise', companyAddress: 'Adresse de l’entreprise', companyEmail: 'Courriel de l’entreprise',
  companyPhone: 'Téléphone de l’entreprise', managerName: 'Responsable du montage', managerPhone: 'Téléphone du responsable',
  managerFunction: 'Fonction du responsable', manufacturer: 'Fabriqué par', description: 'Descriptif sommaire et marquage(s)',
  documents: 'Documents et plans utilisés', groundLink: 'Liaison au sol', windSpeed: 'Vitesse de vent retenue',
  suspended: 'Équipements techniques suspendus', suspendedOther: 'Autre (à préciser)', signatory: 'Je, soussigné',
  plural: 'le / les ensemble(s)', notice: 'Notice et plans du fabricant', calcNote: 'Note de calcul',
  typeOpinion: 'Avis sur modèle type', place: 'Fait à', date: 'Le',
};

/** Coordonnées de la société par défaut (cartouche des planches Viewbox), complétées par app_settings `handover.attestationCompany`. */
export interface AttestationCompany { name: string; address: string; email: string; phone: string }
export const DEFAULT_COMPANY: AttestationCompany = {
  name: 'Viewbox International S.A.',
  address: 'Avenue Robert Schuman 112, 1480 Tubize, Belgique',
  email: '',
  phone: '',
};

const str = (v: unknown, max: number): string => (v === null || v === undefined ? '' : String(v).replace(/\r\n?/g, '\n').trim().slice(0, max));

/** Société : valeurs connues gardées, le reste depuis les défauts. */
export function cleanCompany(input: any, base: AttestationCompany = DEFAULT_COMPANY): AttestationCompany {
  const o = input && typeof input === 'object' ? input : {};
  const pick = (k: keyof AttestationCompany, max: number) => (o[k] === undefined || o[k] === null ? base[k] : str(o[k], max));
  return { name: pick('name', 120) || base.name, address: pick('address', 200), email: pick('email', 120), phone: pick('phone', 60) };
}

/** Valeurs saisies (tolérant) : seules les clés connues, textes coupés, choix vérifiés. */
export function cleanValues(input: any): Partial<AttestationValues> {
  const o = input && typeof input === 'object' ? input : {};
  const out: Partial<AttestationValues> = {};
  for (const k of TEXT_KEYS) if (o[k] !== undefined && o[k] !== null) (out as any)[k] = str(o[k], TEXT_MAX[k]!);
  if (out.date !== undefined && out.date !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(out.date)) delete out.date;
  for (const k of BOOL_KEYS) if (typeof o[k] === 'boolean') (out as any)[k] = o[k];
  if (Array.isArray(o.groundLink)) out.groundLink = GROUND_LINKS.filter((g) => o.groundLink.includes(g));
  if (['art26', 'none', 'other', ''].includes(o.suspended)) out.suspended = o.suspended;
  if (o.plural === 'le' || o.plural === 'les') out.plural = o.plural;
  return out;
}

/** Contenu de la colonne handovers.attestation. */
export interface StoredAttestation {
  /** false : pas d'attestation dans le PDF signé */
  enabled: boolean;
  /** seulement les champs modifiés à la main (les autres suivent le projet) */
  values: Partial<AttestationValues>;
  updatedAt?: string;
  updatedBy?: string | null;
}

export function readStored(raw: any): StoredAttestation {
  const o = raw && typeof raw === 'object' ? raw : {};
  return {
    enabled: o.enabled !== false,
    values: cleanValues(o.values),
    ...(o.updatedAt ? { updatedAt: String(o.updatedAt) } : {}),
    ...(o.updatedBy ? { updatedBy: String(o.updatedBy) } : {}),
  };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Champs qui diffèrent du préremplissage : ce sont eux qu'on garde (un champ non touché suit le projet). */
export function editedOnly(values: Partial<AttestationValues>, defaults: AttestationValues): Partial<AttestationValues> {
  const out: Partial<AttestationValues> = {};
  for (const k of Object.keys(values) as AttestationKey[]) {
    if (!same(values[k], defaults[k])) (out as any)[k] = values[k];
  }
  return out;
}

export function mergeValues(defaults: AttestationValues, edited: Partial<AttestationValues>): AttestationValues {
  return { ...defaults, ...edited };
}

/** Champs encore vides (affichés « à compléter » ; l'attestation part quand même). */
export function missingFields(v: AttestationValues, hasSignature: boolean): string[] {
  const out: string[] = [];
  const need: AttestationKey[] = ['eventName', 'eventAddress', 'companyEmail', 'companyPhone', 'managerName', 'windSpeed', 'signatory', 'place'];
  for (const k of need) if (!String(v[k] || '').trim()) out.push(ATTESTATION_LABELS[k]);
  if (!v.suspended) out.push(ATTESTATION_LABELS.suspended);
  if (v.suspended === 'other' && !v.suspendedOther.trim()) out.push(ATTESTATION_LABELS.suspendedOther);
  if (!hasSignature) out.push('Signature (celle du Site Manager dans le handover)');
  return out;
}

// ─── préremplissage ───

/** Date au format JJ/MM/AAAA, heure de Paris (le chantier est en France). */
export function frDate(d: Date | string | null | undefined): string {
  if (!d) return '';
  const x = new Date(d);
  if (isNaN(x.getTime())) return '';
  const p = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric' }).formatToParts(x);
  const g = (t: string) => p.find((q) => q.type === t)?.value || '';
  return `${g('day')}/${g('month')}/${g('year')}`;
}

/** AAAA-MM-JJ, heure de Paris. */
export function isoDay(d: Date | string | null | undefined): string {
  const f = frDate(d);
  if (!f) return '';
  const [dd, mm, yy] = f.split('/');
  return `${yy}-${mm}-${dd}`;
}

/** Dates de l'événement = de la fin du montage au début du démontage (période où le public est dans la structure). */
export function eventDatesText(installationEnd: Date | string | null | undefined, dismantlingStart: Date | string | null | undefined): string {
  const a = frDate(installationEnd), b = frDate(dismantlingStart);
  if (a && b) {
    if (isoDay(dismantlingStart) < isoDay(installationEnd)) return `À partir du ${a}`;
    return a === b ? `Le ${a}` : `Du ${a} au ${b}`;
  }
  if (a) return `À partir du ${a}`;
  return b ? `Jusqu’au ${b}` : '';
}

/** Ville du chantier : champ ville du projet, sinon la ville après le code postal dans l'adresse. */
export function cityOf(city: string | null | undefined, address: string | null | undefined): string {
  if (city && city.trim()) return city.trim();
  const a = String(address || '').trim();
  const m = a.match(/\b(?:[A-Z]{1,2}[- ]?)?\d{4,5}\s+([^,\d][^,]*?)\s*(?:,\s*[^,]*)?$/);
  return m ? m[1].trim() : '';
}

/** Adresse du chantier sans répéter la ville quand elle y est déjà. */
export function siteAddress(address: string | null | undefined, city: string | null | undefined): string {
  const a = String(address || '').trim(), c = String(city || '').trim();
  if (!c) return a;
  if (!a) return c;
  return a.toLowerCase().includes(c.toLowerCase()) ? a : `${a}, ${c}`;
}

/**
 * Vitesse de vent retenue (km/h) de la dernière étude structure du projet :
 * code France = vent de service saisi (m/s) ; sinon v = √(2 q / 1,25) du vent en service (kN/m²),
 * arrondie à 0,1 m/s par défaut comme statico / TÜV (0,20 kN/m² → 17,8 m/s → 64 km/h).
 */
export function windFromStudy(hyp: any): string {
  if (!hyp || typeof hyp !== 'object') return '';
  if (hyp.code === 'FR') {
    const v = Number(hyp.frWind?.serviceSpeed ?? 20);
    if (!(v > 0)) return '';
    return `${Math.round(v * 3.6)} (${String(Math.round(v * 10) / 10).replace('.', ',')} m/s)`;
  }
  const q = Number(hyp.windIn ?? 0.2);
  if (!(q > 0)) return '';
  const v = Math.floor(Math.sqrt((2 * q * 1000) / 1.25) * 10 + 1e-9) / 10;
  return `${Math.floor(v * 3.6 + 1e-9)} (${String(v).replace('.', ',')} m/s)`;
}

export interface ApprovalRef { fileName: string; revision: string; ref: string; decidedAt: Date | string | null; status: string }

/** Documents et plans utilisés : plans validés par le client (validation des plans VEM), sinon les PDF de plans du projet. */
export function documentsText(approvals: ApprovalRef[], planFiles: string[]): string {
  const lines: string[] = [];
  const seen = new Set<string>();
  for (const a of approvals) {
    const key = `${a.fileName}|${a.revision}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const when = frDate(a.decidedAt);
    lines.push(`Plans « ${a.fileName} » — indice ${a.revision}${when ? `, validés par le client le ${when}` : ''}${a.status === 'reserves' ? ' (avec réserves)' : ''} (réf. ${a.ref})`);
    if (lines.length >= 4) break;
  }
  if (!lines.length) {
    const files = planFiles.filter((f) => /\.pdf$/i.test(f));
    const valid = files.filter((f) => /_VALIDE/i.test(f));
    const list = (valid.length ? valid : files).slice(0, 4);
    if (list.length) lines.push(`Plans : ${list.join(' ; ')}`);
  }
  return lines.join('\n');
}

export interface DefaultsInput {
  customFields?: Record<string, any> | null;
  project: { name: string; address?: string | null; city?: string | null; installationEnd?: Date | string | null; dismantlingStart?: Date | string | null };
  clientName?: string | null;
  siteManager?: { firstName: string; lastName: string; phone?: string | null } | null;
  company: AttestationCompany;
  checklist?: { viewboxType?: string | null; boxesChecked?: string | null } | null;
  approvals?: ApprovalRef[];
  planFiles?: string[];
  studyHyp?: any;
}

/** Valeurs préremplies depuis le handover (« ✏️ Modifier »), le projet, la société et l'étude structure. */
export function attestationDefaults(i: DefaultsInput): AttestationValues {
  const cf = i.customFields || {};
  const f = (k: string) => (cf[k] !== undefined && cf[k] !== null && String(cf[k]).trim() !== '' ? String(cf[k]).trim() : '');
  const smName = i.siteManager ? `${i.siteManager.firstName} ${i.siteManager.lastName}`.trim() : '';
  const managerName = f('spantechRep') || smName;
  const managerFunction = f('spantechTitle') || 'Site Manager';
  const client = f('clientName') || String(i.clientName || '').trim();
  const companyName = f('contractor') || i.company.name;
  const type = i.checklist?.viewboxType === 'permanente' ? 'permanente' : i.checklist?.viewboxType ? 'éphémère' : '';
  const description = [
    `Structure modulaire démontable Viewbox${type ? ` (${type})` : ''}${client ? ` — stand pour ${client}` : ''}`,
    i.checklist?.boxesChecked ? `Boxes : ${String(i.checklist.boxesChecked).trim()}` : '',
  ].filter(Boolean).join('. ');
  return {
    eventName: f('projectName') || i.project.name || '',
    eventAddress: f('siteAddress') || siteAddress(i.project.address, i.project.city),
    eventDates: eventDatesText(i.project.installationEnd, i.project.dismantlingStart),
    companyName,
    companyAddress: i.company.address,
    companyEmail: i.company.email,
    companyPhone: i.company.phone,
    managerName,
    managerPhone: String(i.siteManager?.phone || '').trim() || f('spantechContactPhone'),
    managerFunction,
    manufacturer: i.company.name,
    description,
    documents: documentsText(i.approvals || [], i.planFiles || []),
    groundLink: [],
    windSpeed: windFromStudy(i.studyHyp),
    suspended: 'none',
    suspendedOther: '',
    signatory: [managerName, managerFunction].filter(Boolean).join(', '),
    plural: 'le',
    notice: true,
    calcNote: false,
    typeOpinion: false,
    place: cityOf(i.project.city, f('siteAddress') || i.project.address),
    date: '',
  };
}

/** Date imprimée après « Le : » : la date saisie, sinon la signature du client, sinon la date du handover. */
export function effectiveDate(v: AttestationValues, clientSignedAt: Date | string | null | undefined, handoverDate: Date | string | null | undefined): string {
  if (v.date) return frDate(`${v.date}T12:00:00Z`);
  return frDate(clientSignedAt) || frDate(handoverDate);
}
