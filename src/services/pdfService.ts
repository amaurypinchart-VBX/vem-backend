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

function header(doc: any, subtitle: string, info?: { projectName?: string; projectRef?: string; reportNum?: string; reportDate?: string }) {
  doc.rect(0, 0, 595, 70).fill(DARK);
  if (LOGO_LIGHT_BUFFER) {
    // Logo VIEWBOX en version blanche (sur fond sombre)
    doc.image(LOGO_LIGHT_BUFFER, 40, 22, { fit: [120, 24] });
  } else {
    // Fallback si le logo n'est pas trouvé sur le serveur
    doc.fillColor('white').font('Helvetica-Bold').fontSize(20).text('VIEWBOX', 40, 26);
  }
  doc.fillColor('white').font('Helvetica').fontSize(9).text('Event Manager', 40, 50);

  if (info && (info.projectName || info.projectRef)) {
    // Mode "rapport" : info projet à droite dans la bande noire
    const rightX = 380;
    const rightW = 175;
    doc.fillColor('white').font('Helvetica-Bold').fontSize(11)
      .text(info.projectName || '', rightX, 12, { width: rightW, align: 'right', ellipsis: true });
    doc.fillColor(RED).font('Helvetica-Bold').fontSize(9)
      .text(info.projectRef || '', rightX, 28, { width: rightW, align: 'right' });
    doc.fillColor('white').font('Helvetica').fontSize(9)
      .text(subtitle, rightX, 42, { width: rightW, align: 'right' });
    if (info.reportNum || info.reportDate) {
      doc.fillColor('#bbbbbb').font('Helvetica').fontSize(8)
        .text(
          [info.reportNum, info.reportDate].filter(Boolean).join(' · '),
          rightX, 56, { width: rightW, align: 'right' }
        );
    }
  } else {
    // Mode "simple" (handover, etc.) : juste le subtitle en rouge
    doc.fillColor(RED).font('Helvetica-Bold').fontSize(13).text(subtitle, 420, 28, { align: 'right', width: 135 });
  }

  doc.moveDown(2.5);
  doc.y = 90;
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
  items: Array<{ zoneName: string; status: string; comment?: string | null; photos?: Array<{ photoUrl: string }> }>;
  generalNotes?: string | null;
  clientSignatureUrl?: string | null;
  managerSignatureUrl?: string | null;
  date: Date;
}): Promise<Buffer> {
  // Pré-télécharge toutes les photos des items en parallèle (Cloudinary → JPEG optimisé)
  const itemsWithBuffers: Array<{
    zoneName: string;
    status: string;
    comment?: string | null;
    photoBuffers: Buffer[];
  }> = [];
  for (const item of data.items) {
    const buffers: Buffer[] = [];
    for (const ph of (item.photos || [])) {
      try {
        const optimized = ph.photoUrl.includes('/upload/')
          ? ph.photoUrl.replace('/upload/', '/upload/f_jpg,c_fill,w_400,h_400,q_auto:good/')
          : ph.photoUrl;
        const r = await fetch(optimized);
        if (!r.ok) continue;
        const ab = await r.arrayBuffer();
        buffers.push(Buffer.from(ab));
      } catch { /* ignorée */ }
    }
    itemsWithBuffers.push({ zoneName: item.zoneName, status: item.status, comment: item.comment, photoBuffers: buffers });
  }

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    const chunks: Buffer[] = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    header(doc, 'HANDOVER REPORT', {
      projectName: data.project.name,
      projectRef:  `N° ${data.project.internalNumber}`,
      reportDate:  new Date(data.date).toLocaleDateString('fr-FR'),
    });

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

    // ─── Mise en page : texte à gauche, photos 5×5 cm à droite ───
    // 5 cm = 142 pt. On met 2 colonnes de photos (2 × 142 = 284 pt) à droite,
    // le texte prend la largeur restante (515 - 284 - 8 = 223 pt min).
    const PHOTO_SIZE = 142;            // 5 cm
    const PHOTO_GAP = 6;
    const PHOTOS_W  = 2 * PHOTO_SIZE + PHOTO_GAP; // bloc photos (2 par ligne max)
    const TEXT_X    = 40;
    const TEXT_W    = 515 - PHOTOS_W - 14; // ≈ 217 pt
    const PHOTOS_X  = TEXT_X + TEXT_W + 14;

    for (const item of itemsWithBuffers) {
      // Saut de page si plus assez de place
      if (doc.y > 700) doc.addPage();

      const rowTop = doc.y;
      const color = statusColor[item.status] || MUTED;
      const label = statusLabel[item.status] || item.status;

      // — Bloc texte à gauche —
      doc.circle(TEXT_X + 10, rowTop + 5, 5).fill(color);
      doc.fillColor(DARK).font('Helvetica-Bold').fontSize(11)
        .text(item.zoneName, TEXT_X + 25, rowTop, { width: TEXT_W - 110 });
      const titleEnd = doc.y;
      // Pastille de statut (au-dessus du texte, alignée à droite du bloc texte)
      doc.roundedRect(TEXT_X + TEXT_W - 75, rowTop - 1, 75, 16, 3).fill(color);
      doc.fillColor('white').font('Helvetica-Bold').fontSize(9)
        .text(label, TEXT_X + TEXT_W - 75, rowTop + 3, { width: 75, align: 'center' });
      let textY = Math.max(titleEnd, rowTop + 20);
      if (item.comment) {
        doc.fillColor('#3a3a3a').font('Helvetica').fontSize(10)
          .text(item.comment, TEXT_X + 25, textY + 2, { width: TEXT_W - 30, lineGap: 1 });
        textY = doc.y;
      }
      const textBottomY = textY;

      // — Bloc photos à droite (5×5 cm chacune) —
      let photoBottomY = rowTop;
      const photos = item.photoBuffers || [];
      if (photos.length > 0) {
        let col = 0, row = 0;
        for (let i = 0; i < photos.length; i++) {
          const x = PHOTOS_X + col * (PHOTO_SIZE + PHOTO_GAP);
          const y = rowTop + row * (PHOTO_SIZE + PHOTO_GAP);
          // Saut de page si une photo déborde
          if (y + PHOTO_SIZE > 800) {
            doc.addPage();
            // On ne réimprime pas le texte, juste les photos restantes en haut de la nouvelle page
            row = 0;
            col = 0;
          }
          const realY = rowTop + row * (PHOTO_SIZE + PHOTO_GAP);
          try {
            doc.image(photos[i], x, realY, { fit: [PHOTO_SIZE, PHOTO_SIZE], align: 'center', valign: 'center' });
          } catch { /* image illisible */ }
          photoBottomY = realY + PHOTO_SIZE;
          col++;
          if (col >= 2) { col = 0; row++; }
        }
      }

      // Avancer Y au plus bas des deux blocs + une marge
      const rowBottom = Math.max(textBottomY, photoBottomY) + 12;
      // Trait de séparation léger entre items
      doc.moveTo(40, rowBottom - 4).lineTo(555, rowBottom - 4).strokeColor('#ececec').lineWidth(0.5).stroke();
      doc.y = rowBottom;
    }

    if (data.generalNotes) {
      doc.moveDown(0.5);
      sectionTitle(doc, 'Notes générales');
      doc.fillColor(MUTED).font('Helvetica').fontSize(11).text(data.generalNotes, 40, doc.y, { width: 515 });
    }

    doc.moveDown(1);
    if (doc.y > 700) doc.addPage();
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
  reportId?: string;
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

    // Numéro court de rapport : 8 premiers caractères de l'UUID en majuscules
    const reportNum = data.reportId ? `N° REP-${data.reportId.slice(0, 8).toUpperCase()}` : '';
    const reportDateStr = new Date(data.reportDate).toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
    const reportDateShort = new Date(data.reportDate).toLocaleDateString('fr-FR');

    // Header enrichi : nom + référence du projet + numéro + date du rapport
    header(doc, 'DAILY REPORT', {
      projectName: data.project.name,
      projectRef:  `N° ${data.project.internalNumber}`,
      reportNum,
      reportDate:  reportDateShort,
    });

    // ─── Titre simplifié (les détails sont déjà dans le header) ───
    doc.fillColor(DARK).font('Helvetica-Bold').fontSize(16).text(`Rapport du ${reportDateStr}`, 40, doc.y);
    doc.moveDown(0.5);

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
    // Taille demandée : 10 × 15 cm. PDFKit travaille en points (1 cm ≈ 28.35 pt).
    // 10 cm = 283 pt, 15 cm = 425 pt. Orientation paysage (15 cm de large × 10 cm de haut).
    // Une photo par ligne pour qu'elles soient bien visibles dans le rapport.
    if (photoBuffers.length > 0) {
      doc.addPage();
      header(doc, 'DAILY REPORT — PHOTOS');
      sectionTitle(doc, `Photos (${photoBuffers.length})`);

      const cellW = 425;  // 15 cm
      const cellH = 283;  // 10 cm
      const x = (595 - cellW) / 2;  // centré horizontalement sur la page A4

      let y = doc.y + 6;

      for (let i = 0; i < photoBuffers.length; i++) {
        const p = photoBuffers[i];

        // Nouvelle page si la photo + sa légende ne tient pas
        if (y + cellH + 30 > 800) {
          doc.addPage();
          header(doc, 'DAILY REPORT — PHOTOS (suite)');
          y = doc.y + 6;
        }

        try {
          // Fond gris clair pour encadrer
          doc.rect(x - 4, y - 4, cellW + 8, cellH + 8).fill('#f8f9fa');
          // Image centrée dans la cellule, ratio préservé (PDFKit fit)
          doc.image(p.buffer, x, y, { fit: [cellW, cellH], align: 'center', valign: 'center' });
          // Légende sous la photo
          if (p.caption) {
            doc.fillColor(MUTED).font('Helvetica-Oblique').fontSize(10)
              .text(p.caption, x, y + cellH + 6, { width: cellW, align: 'center' });
          }
        } catch { /* image illisible : on saute */ }

        // Avancer pour la prochaine photo (cellule + marge sous-légende + espace)
        y += cellH + (p.caption ? 28 : 18);
      }
    }

    footer(doc);
    doc.end();
  });
}