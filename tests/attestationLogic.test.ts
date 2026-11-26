// Tests de l'attestation de bon montage (annexe V de l'arrêté du 25 juillet 2022) jointe au handover signé :
// logique pure (src/services/attestationLogic.ts) + PDF (attestation seule et en dernière page du handover).
// Lancer : npm run test:attestation   (ATTESTATION_OUT=dossier garde les PDF produits)
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { PDFDocument } from 'pdf-lib';
import * as L from '../src/services/attestationLogic';
import { generateAttestationPdf, generateHandoverPdf } from '../src/services/pdfService';
import type { AttestationPdf } from '../src/services/attestationService';

let fails = 0, n = 0;
function eq(name: string, got: any, exp: any) {
  n++;
  const g = JSON.stringify(got), e = JSON.stringify(exp);
  if (g !== e) { fails++; console.log(`✗ ${name}\n   got ${g}\n   exp ${e}`); }
}
function ok(name: string, cond: boolean) { eq(name, !!cond, true); }

// ─── dates (heure de Paris) ───
eq('frDate', L.frDate('2026-11-12T23:30:00Z'), '13/11/2026');
eq('frDate vide', L.frDate(null), '');
eq('isoDay', L.isoDay('2026-11-12T08:00:00Z'), '2026-11-12');
eq('dates événement', L.eventDatesText('2026-11-12T08:00:00Z', '2026-11-16T06:00:00Z'), 'Du 12/11/2026 au 16/11/2026');
eq('dates même jour', L.eventDatesText('2026-11-12T08:00:00Z', '2026-11-12T20:00:00Z'), 'Le 12/11/2026');
eq('dates sans démontage', L.eventDatesText('2026-11-12T08:00:00Z', null), 'À partir du 12/11/2026');
eq('dates incohérentes', L.eventDatesText('2026-11-12T08:00:00Z', '2026-11-10T08:00:00Z'), 'À partir du 12/11/2026');

// ─── adresse / ville ───
eq('ville champ', L.cityOf('Paris', 'x'), 'Paris');
eq('ville adresse', L.cityOf(null, 'Place de l’Opéra, 75009 Paris'), 'Paris');
eq('ville adresse pays', L.cityOf(null, '2 rue de la Paix, 75002 Paris, France'), 'Paris');
eq('ville belge', L.cityOf('', 'Avenue Robert Schuman 112, B-1480 Tubize'), 'Tubize');
eq('ville inconnue', L.cityOf(null, 'Parc des expositions'), '');
eq('adresse + ville', L.siteAddress('Place de l’Opéra', 'Paris'), 'Place de l’Opéra, Paris');
eq('adresse contient la ville', L.siteAddress('Place de l’Opéra, 75009 Paris', 'Paris'), 'Place de l’Opéra, 75009 Paris');

// ─── vent de l'étude structure ───
eq('vent DE 0,20', L.windFromStudy({ windIn: 0.2 }), '64 (17,8 m/s)');
eq('vent FR 20 m/s', L.windFromStudy({ code: 'FR', frWind: { serviceSpeed: 20 } }), '72 (20 m/s)');
eq('vent sans étude', L.windFromStudy(null), '');

// ─── documents ───
eq('documents validés', L.documentsText([
  { fileName: 'Plans IKEA.pdf', revision: 'B', ref: 'VAL-ABC234', decidedAt: '2026-11-17T13:00:00Z', status: 'approved' },
  { fileName: 'Plans IKEA.pdf', revision: 'B', ref: 'VAL-OLD999', decidedAt: '2026-11-10T13:00:00Z', status: 'approved' },
], ['x.pdf']), 'Plans « Plans IKEA.pdf » — indice B, validés par le client le 17/11/2026 (réf. VAL-ABC234)');
eq('documents fichiers _VALIDE', L.documentsText([], ['a.pdf', 'b_Rev-A_VALIDE.pdf', 'c.dwg']), 'Plans : b_Rev-A_VALIDE.pdf');
eq('documents fichiers', L.documentsText([], ['a.pdf', 'c.dwg']), 'Plans : a.pdf');
eq('documents aucun', L.documentsText([], []), '');

// ─── préremplissage ───
const D = L.attestationDefaults({
  customFields: { projectName: 'IKEA Opéra — pop-up', spantechRep: 'Jean Dupont', spantechTitle: 'Chef de chantier' },
  project: { name: 'IKEA', address: 'Place de l’Opéra, 75009 Paris', city: null, installationEnd: '2026-11-12T08:00:00Z', dismantlingStart: '2026-11-30T08:00:00Z' },
  clientName: 'IKEA France',
  siteManager: { firstName: 'Paul', lastName: 'Martin', phone: '+33 6 12 34 56 78' },
  company: { ...L.DEFAULT_COMPANY, email: 'info@example.com', phone: '+32 2 000 00 00' },
  checklist: { viewboxType: 'ephemere', boxesChecked: 'VBX-01 à VBX-04' },
  studyHyp: { windIn: 0.2 },
});
eq('défaut nom', D.eventName, 'IKEA Opéra — pop-up');
eq('défaut adresse', D.eventAddress, 'Place de l’Opéra, 75009 Paris');
eq('défaut responsable = nom du handover', D.managerName, 'Jean Dupont');
eq('défaut fonction', D.managerFunction, 'Chef de chantier');
eq('défaut téléphone', D.managerPhone, '+33 6 12 34 56 78');
eq('défaut soussigné', D.signatory, 'Jean Dupont, Chef de chantier');
eq('défaut société', [D.companyName, D.companyAddress], ['Viewbox International S.A.', 'Avenue Robert Schuman 112, 1480 Tubize, Belgique']);
eq('défaut descriptif', D.description, 'Structure modulaire démontable Viewbox (éphémère) — stand pour IKEA France. Boxes : VBX-01 à VBX-04');
eq('défaut lieu', D.place, 'Paris');
eq('défaut vent', D.windSpeed, '64 (17,8 m/s)');
eq('défaut choix', [D.groundLink, D.suspended, D.plural, D.notice, D.calcNote, D.typeOpinion], [[], 'none', 'le', true, false, false]);
eq('défaut date', D.date, '');

// ─── nettoyage / champs modifiés ───
eq('clean', L.cleanValues({ eventName: '  Stand  ', groundLink: ['lestage', 'x', 'ancrage'], suspended: 'bad', plural: 'les', notice: 'yes', calcNote: true, date: '12/11/2026', foo: 1 }),
  { eventName: 'Stand', calcNote: true, groundLink: ['ancrage', 'lestage'], plural: 'les' });
eq('clean date ok', L.cleanValues({ date: '2026-11-20' }), { date: '2026-11-20' });
eq('clean coupe', L.cleanValues({ windSpeed: 'x'.repeat(100) }).windSpeed!.length, 40);
eq('seuls les champs modifiés', L.editedOnly({ eventName: D.eventName, windSpeed: '72', groundLink: [] }, D), { windSpeed: '72' });
eq('stored défaut', L.readStored(null), { enabled: true, values: {} });
eq('stored désactivé', L.readStored({ enabled: false, values: { place: 'Lyon' } }), { enabled: false, values: { place: 'Lyon' } });
const M = L.mergeValues(D, { windSpeed: '72', groundLink: ['lestage'] });
eq('fusion', [M.windSpeed, M.groundLink, M.eventName], ['72', ['lestage'], D.eventName]);
eq('date imprimée = signature client', L.effectiveDate(D, '2026-11-14T15:00:00Z', '2026-11-12T08:00:00Z'), '14/11/2026');
eq('date imprimée = handover', L.effectiveDate(D, null, '2026-11-12T08:00:00Z'), '12/11/2026');
eq('date imprimée saisie', L.effectiveDate({ ...D, date: '2026-11-20' }, '2026-11-14T15:00:00Z', null), '20/11/2026');
eq('manquants', L.missingFields(D, true), []);
eq('manquants vides', L.missingFields({ ...D, windSpeed: '', companyEmail: '', suspended: 'other' }, false),
  ['Courriel de l’entreprise', 'Vitesse de vent retenue', 'Autre (à préciser)', 'Signature (celle du Site Manager dans le handover)']);
eq('société', L.cleanCompany({ email: ' a@b.c ', name: '' }), { name: 'Viewbox International S.A.', address: L.DEFAULT_COMPANY.address, email: 'a@b.c', phone: '' });

// ─── PDF ───
// signature PNG valide (trait noir en diagonale sur fond transparent), encodée ici sans dépendance
function pngDataUrl(w: number, h: number): string {
  const crcTable = Array.from({ length: 256 }, (_, k) => { let c = k; for (let i = 0; i < 8; i++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b: Buffer) => { let c = 0xFFFFFFFF; for (const x of b) c = crcTable[(c ^ x) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const on = Math.abs(y - Math.round((x / w) * h * 0.8 + Math.sin(x / 6) * 4 + h * 0.1)) < 2;
    if (on) raw.writeUInt32BE(0x1a1a2eff, y * (w * 4 + 1) + 1 + x * 4);
  }
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
  return 'data:image/png;base64,' + png.toString('base64');
}
const SIG = pngDataUrl(240, 80);

async function main() {
  const out = process.env.ATTESTATION_OUT;
  if (out) fs.mkdirSync(out, { recursive: true });
  const A: AttestationPdf = { values: M, date: '14/11/2026', signatureUrl: SIG, reference: 'Jointe au Handover Certificate — IKEA Opéra (N° 6072)' };

  const one = await generateAttestationPdf(A);
  const p1 = await PDFDocument.load(one);
  eq('attestation seule : 1 page', p1.getPageCount(), 1);
  if (out) fs.writeFileSync(path.join(out, 'attestation.pdf'), one);

  // tout rayé / autre / pluriel / textes longs : tient encore sur une page
  const B: AttestationPdf = { ...A, values: { ...M, groundLink: [], suspended: 'other', suspendedOther: 'Projecteurs accrochés au portique, élingues de sécurité', plural: 'les', calcNote: true, typeOpinion: true, documents: 'Plans « Implantation.pdf » — indice C, validés par le client le 17/11/2026 (réf. VAL-ABC234)\nPlans « Façades.pdf » — indice B\nNotice de montage Viewbox 2026' } };
  const two = await generateAttestationPdf(B, 'en');
  eq('variante : 1 page', (await PDFDocument.load(two)).getPageCount(), 1);
  if (out) fs.writeFileSync(path.join(out, 'attestation-variante-en.pdf'), two);

  const handover = (attestation: AttestationPdf | null) => generateHandoverPdf({
    project: { name: 'IKEA', internalNumber: '6072', address: 'Place de l’Opéra, 75009 Paris' },
    clientName: 'IKEA France', siteManagerName: 'Jean Dupont',
    items: [{ zoneName: 'Inspection générale', status: 'ok' }],
    managerSignatureUrl: SIG, clientSignatureUrl: SIG, date: new Date('2026-11-12T08:00:00Z'), lang: 'fr', attestation,
  });
  const without = await PDFDocument.load(await handover(null));
  const withBuf = await handover(A);
  const withA = await PDFDocument.load(withBuf);
  eq('handover : une page de plus', withA.getPageCount(), without.getPageCount() + 1);
  if (out) fs.writeFileSync(path.join(out, 'handover-signe.pdf'), withBuf);

  console.log(fails ? `\n${fails} échec(s) sur ${n}` : `✓ ${n} vérifications`);
  process.exit(fails ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
