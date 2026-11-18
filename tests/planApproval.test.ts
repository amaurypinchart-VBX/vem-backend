// Tests de la validation des plans par le client : logique pure (src/services/planApprovalLogic.ts) et PDF validé
// (src/services/planApprovalPdf.ts : cachet dans la case « Signature » des planches Viewbox, filigrane, certificat,
// pages tournées). Lancer : npm run test:plan-approvals   (PLAN_APPROVAL_OUT=dossier garde les PDF produits)
import fs from 'fs';
import path from 'path';
import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib';
import * as L from '../src/services/planApprovalLogic';
import { stampApprovedPdf, inspectPdf, ansi, StampInfo, brusselsDateTime } from '../src/services/planApprovalPdf';

let fails = 0, n = 0;
function eq(name: string, got: any, exp: any) {
  n++;
  const g = JSON.stringify(got), e = JSON.stringify(exp);
  if (g !== e) { fails++; console.log(`✗ ${name}\n   got ${g}\n   exp ${e}`); }
}
function ok(name: string, cond: boolean) { eq(name, !!cond, true); }

// ─── logique ───
eq('rev first', L.nextRevision([]), 'A');
eq('rev next', L.nextRevision(['A', 'B']), 'C');
eq('rev Z', L.nextRevision(['Z']), 'AA');
eq('rev mixed', L.nextRevision(['b', '2', 'Indice 3']), 'C');
eq('rev clean', L.cleanRevision(' Rév. C ', 'A'), 'C');
eq('rev clean empty', L.cleanRevision('', 'D'), 'D');
eq('mask', L.maskEmail('jean.dupont@client.com'), 'j•••t@client.com');
eq('mask short', L.maskEmail('jo@x.be'), 'j•••@x.be');
eq('emails', L.cleanEmailList('a@b.com; A@B.com, bad, c@d.fr'), ['a@b.com', 'c@d.fr']);
eq('email invalid', L.cleanEmail('jean@client'), null);
ok('ref format', /^VAL-[A-Z2-9]{6}$/.test(L.newRef()));
ok('code format', /^\d{6}$/.test(L.newCode()));
ok('hash same', L.sameHash(L.hashCode('id1', '123456'), L.hashCode('id1', '123 456')));
ok('hash other id', !L.sameHash(L.hashCode('id1', '123456'), L.hashCode('id2', '123456')));
eq('expired', L.publicStatus({ status: 'pending', expiresAt: new Date(Date.now() - 1000) }), 'expired');
eq('not expired', L.publicStatus({ status: 'pending', expiresAt: new Date(Date.now() + 1000) }), 'pending');
eq('signed stays', L.publicStatus({ status: 'approved', expiresAt: new Date(0) }), 'approved');
const SIG = 'data:image/png;base64,iVBORw0KGgo=';
eq('sign ok', L.checkSignInput({ decision: 'approved', name: ' Jean ', signature: SIG, reviewed: true, code: '123 456' }, 'fr'),
  { ok: true, input: { decision: 'approved', comment: null, name: 'Jean', title: null, company: null, signature: SIG, code: '123456' } });
eq('reserves need comment', L.checkSignInput({ decision: 'reserves', name: 'Jean', signature: SIG, reviewed: true, code: '123456' }, 'fr'),
  { ok: false, error: 'Merci de décrire vos réserves ou les modifications demandées.' });
eq('reserves comment too short', L.checkSignInput({ decision: 'reserves', comment: ' . ', name: 'Jean', signature: SIG, reviewed: true, code: '123456' }, 'en').ok, false);
eq('changes no signature needed', L.checkSignInput({ decision: 'changes', comment: 'Porte à déplacer', name: 'Jean', code: '123456' }, 'fr').ok, true);
eq('approved needs signature', L.checkSignInput({ decision: 'approved', name: 'Jean', reviewed: true, code: '123456' }, 'en'), { ok: false, error: 'Please sign in the box.' });
eq('approved needs review tick', L.checkSignInput({ decision: 'approved', name: 'Jean', signature: SIG, code: '123456' }, 'fr').ok, false);
eq('bad decision', L.checkSignInput({ decision: 'yes', name: 'Jean' }, 'fr').ok, false);
eq('bad code', L.checkSignInput({ decision: 'approved', name: 'Jean', signature: SIG, reviewed: true, code: '12345' }, 'fr').ok, false);
eq('file name', L.validatedFileName('Plans Hoka.pdf', 'B', 'approved'), 'Plans Hoka_Rev-B_VALIDE.pdf');
eq('file name reserves', L.validatedFileName('x.PDF', 'C 2', 'reserves'), 'x_Rev-C2_VALIDE-AVEC-RESERVES.pdf');
eq('ansi', ansi('Łódź – “é” ✔ 你'), '?ódz - "é" ? ?');
eq('date', brusselsDateTime(new Date('2026-11-17T13:32:00Z'), 'fr'), { d: '17.11.2026', h: '14:32' });
eq('date en', brusselsDateTime(new Date('2026-07-01T06:05:00Z'), 'en'), { d: '01.07.2026', h: '08:05' });

// ─── PDF ───
const MM = 72 / 25.4;
async function viewboxPlans(): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  pdf.setCreator('VEM · Plans Viewbox');
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (const [w, h] of [[841, 594], [420, 297]]) {
    const k = w / 841;
    const p = pdf.addPage([w * MM, h * MM]);
    const top = (y: number) => h * MM - y * MM * k;
    p.drawRectangle({ x: 12.7 * MM * k, y: top(14.4 + 568.8), width: 696.1 * MM * k, height: 568.8 * MM * k, borderColor: rgb(0, 0, 0), borderWidth: 1 });
    p.drawRectangle({ x: 708 * MM * k, y: top(583.2), width: 106.4 * MM * k, height: 568.8 * MM * k, borderColor: rgb(0, 0, 0), borderWidth: 1 });
    p.drawText('Signature', { x: 713.6 * MM * k, y: top(524.5), size: 7 * k, font });
    p.drawRectangle({ x: 712.7 * MM * k, y: top(526.6 + 28), width: 117.5 * MM * k, height: 28 * MM * k, borderColor: rgb(0, 0, 0), borderWidth: 0.5 });
    p.drawText('A1.1', { x: 742.9 * MM * k, y: top(570), size: 20 * k, font });
    p.drawLine({ start: { x: 100 * k, y: 200 * k }, end: { x: 1500 * k, y: 1300 * k }, thickness: 2 });
  }
  return Buffer.from(await pdf.save());
}
async function otherPlans(): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const a4 = pdf.addPage([595.28, 841.89]);
  a4.drawText('Architecte - page A4 portrait', { x: 40, y: 800, size: 14, font });
  const a3 = pdf.addPage([841.89, 1190.55]); // A3 portrait tourné à l'affichage → paysage
  a3.setRotation(degrees(90));
  a3.drawText('A3 tourne a 90', { x: 100, y: 600, size: 30, font, rotate: degrees(90) });
  return Buffer.from(await pdf.save());
}

function info(over: Partial<StampInfo> = {}): StampInfo {
  return {
    lang: 'fr', decision: 'approved', decidedAt: new Date('2026-11-17T13:32:00Z'),
    signerName: 'Jeanne Dupont', signerTitle: 'Cheffe de projet', signerCompany: 'Client SA', signerEmail: 'jeanne@client.com',
    comment: null, signatureImage: null, ip: '203.0.113.7', userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)',
    ref: 'VAL-ABC234', revision: 'B', projectName: 'Hoka Paris', projectNumber: '6060', projectAddress: 'Place de l’Opéra, Paris',
    fileName: 'Plans Hoka.pdf', fileSha256: 'a'.repeat(64), pageCount: 2, sentAt: new Date('2026-11-16T09:00:00Z'), sentBy: 'Amaury Pinchart',
    events: [
      { at: '2026-11-16T09:00:00Z', kind: 'sent', detail: 'jeanne@client.com' },
      { at: '2026-11-17T13:20:00Z', kind: 'opened', ip: '203.0.113.7' },
      { at: '2026-11-17T13:30:00Z', kind: 'code_sent' },
      { at: '2026-11-17T13:32:00Z', kind: 'approved', ip: '203.0.113.7' },
    ],
    ...over,
  };
}

async function signaturePng(): Promise<string> {
  // petite image PNG valide (1 × 1, noire) : suffit pour vérifier l'intégration
  return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
}

(async () => {
  const out = process.env.PLAN_APPROVAL_OUT;
  const vbx = await viewboxPlans();
  const insp = await inspectPdf(vbx);
  eq('inspect viewbox', insp, { pages: 2, encrypted: false, viewbox: true });
  const sig = await signaturePng();
  const a = await stampApprovedPdf(vbx, info({ signatureImage: sig }));
  const ad = await PDFDocument.load(a);
  eq('pages + certificate', ad.getPageCount(), 3);
  ok('subject', /PLANS VALID/.test(ad.getSubject() || ''));
  ok('pages kept size', Math.abs(ad.getPage(0).getWidth() - 841 * MM) < 0.01 && Math.abs(ad.getPage(1).getWidth() - 420 * MM) < 0.01);

  const other = await otherPlans();
  eq('inspect other', (await inspectPdf(other)).viewbox, false);
  const longComment = 'Réserve : déplacer la porte de VBX-02 de 50 cm vers la gauche. '.repeat(20);
  const events = Array.from({ length: 60 }, (_, i) => ({ at: new Date(Date.UTC(2026, 10, 17, 8, i)).toISOString(), kind: i % 2 ? 'opened' : 'viewed', ip: '198.51.100.' + i }));
  const r = await stampApprovedPdf(other, info({ lang: 'en', decision: 'reserves', comment: longComment, signatureImage: sig, events, signerName: 'Łukasz Żółć', pageCount: 2 }));
  const rd = await PDFDocument.load(r);
  ok('long certificate on several pages', rd.getPageCount() >= 4);
  eq('rotation kept', rd.getPage(1).getRotation().angle, 90);

  const bad = await stampApprovedPdf(other, info({ signatureImage: 'data:image/png;base64,AAAA' })).then(() => 'ok', (e) => String(e));
  eq('bad signature image ignored', bad, 'ok');

  if (out) {
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, 'viewbox-original.pdf'), vbx);
    fs.writeFileSync(path.join(out, 'viewbox-valide.pdf'), a);
    fs.writeFileSync(path.join(out, 'autre-reserves.pdf'), r);
  }
  console.log(`${n - fails}/${n} ok`);
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
