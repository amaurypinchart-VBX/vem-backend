// src/services/pdfService.ts
// eslint-disable-next-line @typescript-eslint/no-var-requires
const PDFDocument = require('pdfkit');

const RED    = '#e63946';
const DARK   = '#1a1a2e';
const MUTED  = '#8892a4';
const GREEN  = '#2dc653';
const AMBER  = '#f4a261';

function header(doc: any, subtitle: string) {
  doc.rect(0,0,595,70).fill(DARK);
  doc.fillColor(RED).font('Helvetica-Bold').fontSize(26).text('VEM', 40, 22);
  doc.fillColor('white').font('Helvetica').fontSize(11).text('ViewBox Event Manager', 82, 28);
  doc.fillColor(RED).font('Helvetica-Bold').fontSize(13).text(subtitle, 420, 28, { align: 'right', width: 135 });
  doc.moveDown(2.5);
}

function footer(doc: any) {
  doc.rect(0, 810, 595, 30).fill('#f8f8f8');
  doc.fillColor(MUTED).fontSize(8).font('Helvetica')
    .text(`Généré par VEM · ${new Date().toLocaleString('fr-FR')}`, 40, 817, { align: 'center', width: 515 });
}

function sectionTitle(doc: any, title: string) {
  doc.fillColor(DARK).font('Helvetica-Bold').fontSize(14).text(title, 40, doc.y);
  doc.moveTo(40, doc.y+2).lineTo(555, doc.y+2).strokeColor('#ddd').lineWidth(1).stroke();
  doc.moveDown(0.5);
}

function infoRow(doc: any, label: string, value: string) {
  const y = doc.y;
  doc.fillColor(MUTED).font('Helvetica').fontSize(10).text(label, 40, y, { width: 130 });
  doc.fillColor(DARK).font('Helvetica-Bold').fontSize(10).text(value, 175, y, { width: 370 });
  doc.moveDown(0.3);
}

export async function generateHandoverPdf(data: {
  project: { name: string; internalNumber: string; address: string };
  clientName: string;
  siteManagerName: string;
  items: Array<{ zoneName: string; status: string; comment?: string | null }>;
  generalNotes?: string | null;
  clientSignatureUrl?: string | null;
  managerSignatureUrl?: string | null;
  date: Date;
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    const chunks: Buffer[] = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    header(doc, 'HANDOVER REPORT');
    sectionTitle(doc, '📋 Informations Projet');
    infoRow(doc, 'Projet',         data.project.name);
    infoRow(doc, 'N° Interne',     data.project.internalNumber);
    infoRow(doc, 'Adresse',        data.project.address);
    infoRow(doc, 'Client',         data.clientName);
    infoRow(doc, 'Site Manager',   data.siteManagerName);
    infoRow(doc, 'Date réception', new Date(data.date).toLocaleDateString('fr-FR'));

    doc.moveDown(0.8);
    sectionTitle(doc, '🔍 Zones Inspectées');

    const statusColor: Record<string,string> = { ok: GREEN, remark: AMBER, defect: RED, pending: MUTED };
    const statusLabel: Record<string,string> = { ok: '✓ OK', remark: '⚠ Remarque', defect: '✗ Défaut', pending: '? En attente' };

    for (const item of data.items) {
      const color = statusColor[item.status] || MUTED;
      const label = statusLabel[item.status] || item.status;
      const y = doc.y;
      doc.circle(50, y + 5, 5).fill(color);
      doc.fillColor(DARK).font('Helvetica-Bold').fontSize(11).text(item.zoneName, 65, y, { width: 320 });
      doc.fillColor(color).font('Helvetica').fontSize(10).text(label, 400, y, { width: 155 });
      if (item.comment) {
        doc.moveDown(0.1);
        doc.fillColor(MUTED).font('Helvetica').fontSize(9).text(item.comment, 65, doc.y, { width: 480 });
      }
      doc.moveDown(0.5);
    }

    if (data.generalNotes) {
      doc.moveDown(0.5);
      sectionTitle(doc, '📝 Notes Générales');
      doc.fillColor(MUTED).font('Helvetica').fontSize(11).text(data.generalNotes, 40, doc.y, { width: 515 });
    }

    doc.moveDown(1);
    sectionTitle(doc, '✍️ Signatures');
    const sigY = doc.y + 10;
    doc.rect(40, sigY, 220, 70).stroke('#ccc');
    doc.rect(315, sigY, 220, 70).stroke('#ccc');
    doc.fillColor(MUTED).fontSize(9).text('Site Manager', 40, sigY + 5).text('Client', 315, sigY + 5);
    doc.fillColor(DARK).font('Helvetica-Bold').fontSize(10).text(data.siteManagerName, 40, sigY + 55).text(data.clientName, 315, sigY + 55);

    footer(doc);
    doc.end();
  });
}

export async function generateDailyReportPdf(data: {
  project: { name: string; internalNumber: string };
  reportDate: Date;
  createdBy?: string;
  weather?: string | null;
  workersPresent: number;
  generalNotes?: string | null;
  entries: Array<{ entryTime: string; description: string }>;
  checklist: Array<{ item: string; checked: boolean; notes?: string | null }>;
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    const chunks: Buffer[] = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    header(doc, 'DAILY REPORT');
    sectionTitle(doc, '📋 Informations');
    infoRow(doc, 'Projet',     `${data.project.name} — ${data.project.internalNumber}`);
    infoRow(doc, 'Date',       new Date(data.reportDate).toLocaleDateString('fr-FR'));
    infoRow(doc, 'Rédigé par', data.createdBy || 'N/A');
    infoRow(doc, 'Météo',      data.weather || 'N/A');
    infoRow(doc, 'Ouvriers',   String(data.workersPresent));

    if (data.entries.length > 0) {
      doc.moveDown(0.8);
      sectionTitle(doc, '⏱️ Journal');
      for (const entry of data.entries) {
        doc.circle(50, doc.y + 5, 4).fill(RED);
        doc.fillColor(RED).font('Helvetica-Bold').fontSize(10).text(entry.entryTime, 62, doc.y - 2, { width: 60, continued: true });
        doc.fillColor(DARK).font('Helvetica').text(` — ${entry.description}`, { width: 430 });
        doc.moveDown(0.3);
      }
    }

    if (data.checklist.length > 0) {
      doc.moveDown(0.8);
      sectionTitle(doc, '✅ Checklist Sécurité');
      for (const item of data.checklist) {
        const color = item.checked ? GREEN : RED;
        const icon = item.checked ? '✓' : '✗';
        doc.fillColor(color).font('Helvetica-Bold').fontSize(11).text(icon, 40, doc.y, { width: 20, continued: true });
        doc.fillColor(DARK).font('Helvetica').text(` ${item.item}`, { width: 480 });
        if (item.notes) {
          doc.fillColor(MUTED).fontSize(9).text(`   → ${item.notes}`, 60, doc.y - 2);
        }
        doc.moveDown(0.3);
      }
    }

    if (data.generalNotes) {
      doc.moveDown(0.8);
      sectionTitle(doc, '📝 Notes');
      doc.fillColor(MUTED).font('Helvetica').fontSize(11).text(data.generalNotes, 40, doc.y, { width: 515 });
    }

    footer(doc);
    doc.end();
  });
}
