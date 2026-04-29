// src/routes/upload.ts
import { Router, Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { upload, uploadToCloudinary } from '../services/cloudinaryService';
import { prisma } from '../config/database';

const router = Router();

// POST /upload/photo — single photo
router.post('/photo', upload.single('file'), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'Fichier manquant' });
    const { url, publicId } = await uploadToCloudinary(req.file.buffer, req.body.folder || 'general');
    res.json({ success: true, data: { url, publicId, name: req.file.originalname } });
  } catch (err) { next(err); }
});

// POST /upload/photos — multiple photos
router.post('/photos', upload.array('files', 10), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const files = (req.files as Express.Multer.File[]) || [];
    const results = await Promise.all(files.map(f => uploadToCloudinary(f.buffer, req.body.folder || 'general')));
    res.json({ success: true, data: results });
  } catch (err) { next(err); }
});

// POST /upload/task-photo/:taskId
router.post('/task-photo/:taskId', upload.single('file'), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'Fichier manquant' });
    const { url, publicId } = await uploadToCloudinary(req.file.buffer, 'tasks');
    const photo = await prisma.taskPhoto.create({
      data: { taskId: req.params.taskId, uploadedBy: req.user!.id, photoUrl: url, publicId, caption: req.body.caption },
    });
    res.status(201).json({ success: true, data: photo });
  } catch (err) { next(err); }
});

// POST /upload/ticket-photo/:ticketId
router.post('/ticket-photo/:ticketId', upload.single('file'), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'Fichier manquant' });
    const { url, publicId } = await uploadToCloudinary(req.file.buffer, 'tickets');
    const photo = await prisma.ticketPhoto.create({
      data: { ticketId: req.params.ticketId, uploadedById: req.user!.id, photoUrl: url, publicId, phase: req.body.phase || 'before', caption: req.body.caption },
    });
    res.status(201).json({ success: true, data: photo });
  } catch (err) { next(err); }
});

// POST /upload/project-file/:projectId
router.post('/project-file/:projectId', upload.single('file'), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'Fichier manquant' });
    const { url, publicId } = await uploadToCloudinary(req.file.buffer, 'projects');
    const file = await prisma.projectFile.create({
      data: { projectId: req.params.projectId, uploadedBy: req.user!.id, fileName: req.file.originalname, fileUrl: url, publicId, fileType: req.file.mimetype, fileSize: req.file.size, category: req.body.category || 'general' },
    });
    res.status(201).json({ success: true, data: file });
  } catch (err) { next(err); }
});

// POST /upload/box-photo/:boxId
router.post('/box-photo/:boxId', upload.single('file'), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'Fichier manquant' });
    const { url, publicId } = await uploadToCloudinary(req.file.buffer, 'boxes');
    const photo = await prisma.boxPhoto.create({
      data: { boxId: req.params.boxId, photoUrl: url, publicId, phase: req.body.phase || 'content', caption: req.body.caption },
    });
    res.status(201).json({ success: true, data: photo });
  } catch (err) { next(err); }
});

// POST /upload/handover-photo/:handoverId
router.post('/handover-photo/:handoverId', upload.single('file'), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'Fichier manquant' });
    const { url, publicId } = await uploadToCloudinary(req.file.buffer, 'handovers');
    const photo = await prisma.handoverPhoto.create({
      data: { handoverId: req.params.handoverId, uploadedById: req.user!.id, photoUrl: url, publicId, caption: req.body.caption, itemId: req.body.itemId || null },
    });
    res.status(201).json({ success: true, data: photo });
  } catch (err) { next(err); }
});

export default router;
