
import { Router, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { upload, uploadToCloudinary } from '../services/cloudinaryService';

const router = Router();

router.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const remarks = await (prisma as any).clientRemark.findMany({
      where: req.query.projectId ? { projectId: String(req.query.projectId) } : {},
      orderBy: [{ status:'asc' }, { priority:'desc' }, { createdAt:'desc' }],
      include: {
        assignedToUser: { select: { firstName:true, lastName:true } },
        photos: true,
      },
    });
    res.json({ success: true, data: remarks });
  } catch (err) { next(err); }
});

router.post('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const remark = await (prisma as any).clientRemark.create({
      data: { ...req.body, createdBy: req.user!.id },
    });
    res.status(201).json({ success: true, data: remark });
  } catch (err) { next(err); }
});

router.patch('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data: any = { ...req.body };
    if (req.body.status === 'resolved') {
      data.resolvedAt = new Date();
      data.resolvedBy = req.user!.id;
    }
    const remark = await (prisma as any).clientRemark.update({ where: { id: req.params.id }, data });
    res.json({ success: true, data: remark });
  } catch (err) { next(err); }
});

router.delete('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await (prisma as any).clientRemark.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.post('/:id/photos', upload.single('file'), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'Fichier manquant' });
    const { url, publicId } = await uploadToCloudinary(req.file.buffer, 'remarks');
    const photo = await (prisma as any).clientRemarkPhoto.create({
      data: { remarkId: req.params.id, photoUrl: url, publicId, caption: req.body.caption, phase: req.body.phase || 'problem' },
    });
    res.status(201).json({ success: true, data: photo });
  } catch (err) { next(err); }
});

// PDF des tâches restantes
router.get('/project/:projectId/pdf', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const remarks = await (prisma as any).clientRemark.findMany({
      where: { projectId: req.params.projectId },
      include: { photos: true, assignedToUser: { select: { firstName:true, lastName:true } } },
      orderBy: [{ status:'asc' }, { priority:'desc' }],
    });
    const project = await prisma.project.findUnique({
      where: { id: req.params.projectId },
      include: { client: true },
    });
    if (!project) return res.status(404).json({ success:false, error:'Projet introuvable' });

    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument({ size:'A4', margin:40 });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    await new Promise<void>((resolve) => {
      doc.on('end', resolve);

      // Header
      doc.rect(0,0,595,70).fill('#1a1a2e');
      doc.fillColor('#e63946').font('Helvetica-Bold').fontSize(26).text('VEM',40,22);
      doc.fillColor('white').font('Helvetica').fontSize(11).text('ViewBox Event Manager',82,28);
      doc.fillColor('#e63946').font('Helvetica-Bold').fontSize(13).text('SUIVI CLIENT',420,28,{align:'right',width:135});
      doc.moveDown(2.5);

      doc.fillColor('#1a1a2e').font('Helvetica-Bold').fontSize(16).text(project.name, 40, doc.y);
      doc.fillColor('#8892a4').font('Helvetica').fontSize(11).text(`${project.internalNumber} · ${project.client?.name||''} · ${new Date().toLocaleDateString('fr-FR')}`, 40, doc.y+2);
      doc.moveDown(1);

      const open = remarks.filter((r:any) => r.status !== 'resolved');
      const done = remarks.filter((r:any) => r.status === 'resolved');

      doc.fillColor('#e63946').font('Helvetica-Bold').fontSize(11).text(`${open.length} point(s) en cours — ${done.length} traité(s)`, 40, doc.y);
      doc.moveDown(0.8);

      for (const r of remarks) {
        if (doc.y > 720) doc.addPage();
        const color = r.status==='resolved' ? '#2dc653' : r.priority==='critical'?'#e63946':r.priority==='high'?'#f4a261':'#8892a4';
        doc.rect(40,doc.y,515,r.description?46:32).fill('#f8f8f8').stroke('#eee');
        const y = doc.y;
        const icon = r.status==='resolved' ? '✓' : '●';
        doc.fillColor(color).font('Helvetica-Bold').fontSize(10).text(icon, 46, y-38);
        doc.fillColor('#1a1a2e').font('Helvetica-Bold').fontSize(11).text(r.title, 58, y-38, {width:340});
        if (r.zone) doc.fillColor('#8892a4').font('Helvetica').fontSize(9).text(`📍 ${r.zone}`, 58, y-24);
        if (r.description) doc.fillColor('#8892a4').fontSize(9).text(r.description, 58, y-14, {width:440});
        if (r.assignedToUser) doc.fillColor(color).fontSize(9).text(`👤 ${r.assignedToUser.firstName} ${r.assignedToUser.lastName}`, 410, y-38, {width:140, align:'right'});
        doc.moveDown(r.description?0.3:0.5);
      }

      doc.rect(0,808,595,34).fill('#f8f8f8');
      doc.fillColor('#8892a4').fontSize(8).font('Helvetica').text(`Généré par VEM · ${new Date().toLocaleString('fr-FR')}`,40,816,{align:'center',width:515});
      doc.end();
    });

    const pdfBuffer = Buffer.concat(chunks);
    res.set({'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="SuiviClient_${project.internalNumber}.pdf"`});
    res.send(pdfBuffer);
  } catch (err) { next(err); }
});

export default router;
