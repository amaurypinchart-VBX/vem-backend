// src/services/pdfService.ts
// eslint-disable-next-line @typescript-eslint/no-var-requires
const PDFDocument = require('pdfkit');
import * as path from 'path';
import * as fs from 'fs';

const RED    = '#e63946';
const DARK   = '#1a1a2e';
const MUTED  = '#8892a4';
const GREEN  = '#2dc653';
const AMBER  = '#f4a261';

// Chemin du logo (version claire pour fond sombre du header).
// Chargé une seule fois en buffer pour éviter les I/O à chaque PDF.
const LOGO_LIGHT_PATH = path.join(__dirname, '..', '..', 'public', 'logo_light.png');
let LOGO_LIGHT_BUFFER: Buffer | null = null;
try {
  if (fs.existsSync(LOGO_LIGHT_PATH)) LOGO_LIGHT_BUFFER = fs.readFileSync(LOGO_LIGHT_PATH);
} catch { /* logo absent : on retombe sur le texte */ }

function header(doc: any, subtitle: string) {
  doc.rect(0, 0, 595, 70).fill(DARK);
  if (LOGO_LIGHT_BUFFER) {
    // Logo VIEWBOX en version blanche (sur fond sombre)
    doc.image(LOGO_LIGHT_BUFFER, 40, 22, { fit: [150, 30] });
  } else {
    // Fallback si le logo n'est pas trouvé sur le serveur
    doc.fillColor('white').font('Helvetica-Bold').fontSize(22).text('VIEWBOX', 40, 24);
  }
  doc.fillColor('white').font('Helvetica').fontSize(11).text('Event Manager', 200, 30);
  doc.fillColor(RED).font('Helvetica-Bold').fontSize(13).text(subtitle, 420, 28, { align: 'right', width: 135 });
  doc.moveDown(2.5);
}

function footer(doc: any) {
  doc.rect(0, 810, 595, 30).fill('#f8f8f8');
  doc.fillColor(MUTED).fontSize(8).font('Helvetica')
    .text(`Généré par VIEWBOX Event Manager · ${new Date().toLocaleString('fr-FR')}`, 40, 817, { align: 'center', width: 515 });
}

function sectionTitle(doc: any, title: string) {
  const y = doc.y;
  // Petite barre d'accent rouge à gauche du titre
  doc.rect(40, y + 2, 3, 14).fill(RED);
  doc.fillColor(DARK).font('Helvetica-Bold').fontSize(13).text(title, 50, y);
  doc.moveDown(0.6);
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
    sectionTitle(doc, 'Informations Projet');
    infoRow(doc, 'Projet',         data.project.name);
    infoRow(doc, 'N° Interne',     data.project.internalNumber);
    infoRow(doc, 'Adresse',        data.project.address);
    infoRow(doc, 'Client',         data.clientName);
    infoRow(doc, 'Site Manager',   data.siteManagerName);
    infoRow(doc, 'Date réception', new Date(data.date).toLocaleDateString('fr-FR'));

    doc.moveDown(0.8);
    sectionTitle(doc, 'Zones inspectées');

    const statusColor: Record<string,string> = { ok: GREEN, remark: AMBER, defect: RED, pending: MUTED };
    const statusLabel: Record<string,string> = { ok: 'OK', remark: 'Remarque', defect: 'Défaut', pending: 'En attente' };

    for (const item of data.items) {
      const color = statusColor[item.status] || MUTED;
      const label = statusLabel[item.status] || item.status;
      const y = doc.y;
      doc.circle(50, y + 5, 5).fill(color);
      doc.fillColor(DARK).font('Helvetica-Bold').fontSize(11).text(item.zoneName, 65, y, { width: 320 });
      // Pastille de statut colorée à droite
      doc.roundedRect(400, y - 1, 80, 16, 3).fill(color);
      doc.fillColor('white').font('Helvetica-Bold').fontSize(9).text(label, 400, y + 3, { width: 80, align: 'center' });
      if (item.comment) {
        doc.moveDown(0.1);
        doc.fillColor(MUTED).font('Helvetica').fontSize(9).text(item.comment, 65, doc.y, { width: 480 });
      }
      doc.moveDown(0.5);
    }

    if (data.generalNotes) {
      doc.moveDown(0.5);
      sectionTitle(doc, 'Notes générales');
      doc.fillColor(MUTED).font('Helvetica').fontSize(11).text(data.generalNotes, 40, doc.y, { width: 515 });
    }

    doc.moveDown(1);
    sectionTitle(doc, 'Signatures');
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
  photos?: Array<{ photoUrl: string; caption?: string | null }>;
}): Promise<Buffer> {
  // Pré-téléchargement des photos (Cloudinary → JPEG optimisé)
  const photoBuffers: Array<{ buffer: Buffer; caption?: string | null }> = [];
  if (data.photos && data.photos.length) {
    for (const p of data.photos) {
      try {
        const optimized = p.photoUrl.includes('/upload/')
          ? p.photoUrl.replace('/upload/', '/upload/f_jpg,c_limit,w_900,q_auto:good/')
          : p.photoUrl;
        const r = await fetch(optimized);
        if (!r.ok) continue;
        const ab = await r.arrayBuffer();
        photoBuffers.push({ buffer: Buffer.from(ab), caption: p.caption });
      } catch { /* photo ignorée */ }
    }
  }

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    const chunks: Buffer[] = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    header(doc, 'DAILY REPORT');

    // ─── Bloc de titre projet (gros nom + date) ───
    const reportDateStr = new Date(data.reportDate).toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
    doc.fillColor(DARK).font('Helvetica-Bold').fontSize(20).text(data.project.name, 40, doc.y);
    doc.fillColor(MUTED).font('Helvetica').fontSize(11).text(`N° ${data.project.internalNumber}  ·  ${reportDateStr}`, 40, doc.y + 2);
    doc.moveDown(1.2);

    // ─── Carte d'infos en 2 colonnes ───
    sectionTitle(doc, 'Informations');
    const infoY = doc.y;
    const infoH = 70;
    doc.rect(40, infoY, 515, infoH).fillAndStroke('#fafbfc', '#e5e7eb');
    const labelStyle = (txt: string, x: number, y: number) => doc.fillColor(MUTED).font('Helvetica').fontSize(9).text(txt.toUpperCase(), x, y, { characterSpacing: 0.5 });
    const valueStyle = (txt: string, x: number, y: number) => doc.fillColor(DARK).font('Helvetica-Bold').fontSize(11).text(txt || '—', x, y);
    labelStyle('Rédigé par', 56, infoY + 12);  valueStyle(data.createdBy || 'N/A',       56, infoY + 26);
    labelStyle('Météo',      210, infoY + 12); valueStyle(data.weather || 'N/A',         210, infoY + 26);
    labelStyle('Ouvriers',   370, infoY + 12); valueStyle(String(data.workersPresent),   370, infoY + 26);
    labelStyle('Date',       56, infoY + 46);  valueStyle(new Date(data.reportDate).toLocaleDateString('fr-FR'), 56, infoY + 60);
    doc.y = infoY + infoH + 12;

    // ─── Timeline / Journal ───
    if (data.entries.length > 0) {
      sectionTitle(doc, 'Journal de la journée');
      const TIME_X = 40;
      const TIME_W = 60;
      const DESC_X = 115;
      const DESC_W = 440;
      const LINE_X = 100;  // ligne verticale du timeline
      const timelineStart = doc.y;

      for (const entry of data.entries) {
        // Saut de page si on dépasse en bas
        if (doc.y > 740) doc.addPage();

        const rowY = doc.y;
        // Badge horaire à gauche
        const time = (entry.entryTime || '').trim();
        if (time) {
          doc.roundedRect(TIME_X, rowY - 1, TIME_W, 16, 3).fill(RED);
          doc.fillColor('white').font('Helvetica-Bold').fontSize(10).text(time, TIME_X, rowY + 3, { width: TIME_W, align: 'center' });
        } else {
          doc.fillColor(MUTED).font('Helvetica-Oblique').fontSize(9).text('—', TIME_X, rowY + 3, { width: TIME_W, align: 'center' });
        }
        // Petit point sur la ligne timeline
        doc.circle(LINE_X + 5, rowY + 7, 3).fill(RED);
        // Description à droite
        doc.fillColor(DARK).font('Helvetica').fontSize(11).text(entry.description, DESC_X, rowY, { width: DESC_W });
        // Avancer doc.y selon la hauteur réelle de la description
        const after = doc.y;
        doc.y = Math.max(after, rowY + 20);
        doc.moveDown(0.4);
      }

      // Ligne verticale du timeline (de haut en bas)
      doc.moveTo(LINE_X + 5, timelineStart).lineTo(LINE_X + 5, doc.y - 5).strokeColor('#e5e7eb').lineWidth(1).stroke();
      doc.moveDown(0.5);
    }

    // ─── Checklist ───
    if (data.checklist.length > 0) {
      if (doc.y > 700) doc.addPage();
      sectionTitle(doc, 'Checklist sécurité');
      for (const item of data.checklist) {
        if (doc.y > 770) doc.addPage();
        const rowY = doc.y;
        // Carré coché ou non
        if (item.checked) {
          doc.roundedRect(40, rowY, 14, 14, 2).fill(GREEN);
          doc.fillColor('white').font('Helvetica-Bold').fontSize(11).text('v', 43, rowY + 1);
        } else {
          doc.roundedRect(40, rowY, 14, 14, 2).fill('#fff').stroke(MUTED);
          doc.fillColor(RED).font('Helvetica-Bold').fontSize(11).text('x', 44, rowY + 1);
        }
        doc.fillColor(DARK).font('Helvetica').fontSize(11).text(item.item, 64, rowY, { width: 491 });
        if (item.notes) {
          doc.fillColor(MUTED).font('Helvetica-Oblique').fontSize(9).text(item.notes, 64, doc.y, { width: 491 });
        }
        doc.moveDown(0.4);
      }
      doc.moveDown(0.5);
    }

    // ─── Notes générales ───
    if (data.generalNotes && data.generalNotes.trim()) {
      if (doc.y > 720) doc.addPage();
      sectionTitle(doc, 'Notes générales');
      const noteY = doc.y;
      doc.rect(40, noteY, 515, 4).fill(AMBER);
      doc.fillColor(DARK).font('Helvetica').fontSize(11).text(data.generalNotes, 40, noteY + 12, { width: 515, lineGap: 2 });
      doc.moveDown(0.8);
    }

    // ─── Photos (nouvelle page) ───
    if (photoBuffers.length > 0) {
      doc.addPage();
      header(doc, 'DAILY REPORT — PHOTOS');
      sectionTitle(doc, `Photos (${photoBuffers.length})`);
      const cellW = 250;
      const cellH = 180;
      const gap = 15;
      const cols = [40, 40 + cellW + gap];
      let col = 0;
      let rowTopY = doc.y + 4;

      for (let i = 0; i < photoBuffers.length; i++) {
        const p = photoBuffers[i];
        if (rowTopY + cellH + 30 > 800) {
          doc.addPage();
          header(doc, 'DAILY REPORT — PHOTOS (suite)');
          rowTopY = doc.y + 4;
          col = 0;
        }
        try {
          // Fond légèrement gris pour encadrer l'image
          doc.rect(cols[col] - 4, rowTopY - 4, cellW + 8, cellH + 8).fill('#f8f9fa');
          doc.image(p.buffer, cols[col], rowTopY, { fit: [cellW, cellH], align: 'center' });
          if (p.caption) {
            doc.fillColor(MUTED).font('Helvetica-Oblique').fontSize(9)
              .text(p.caption, cols[col], rowTopY + cellH + 4, { width: cellW, align: 'center' });
          }
        } catch { /* image illisible : on saute */ }
        col++;
        if (col >= 2) { col = 0; rowTopY += cellH + 28; }
      }
    }

    footer(doc);
    doc.end();
  });
}
