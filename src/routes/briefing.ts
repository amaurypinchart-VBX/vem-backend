import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { generateBriefingDraft } from '../services/briefingAI';

import { documentSchema, validateSources } from '../services/briefingDocument';
import { briefingSources } from '../services/briefingSources';
import { AuthRequest } from '../middleware/auth';
import { randomUUID } from 'crypto';
import { isDeepStrictEqual } from 'util';
import { briefingTemplateSchema } from '../services/briefingDocument';
import { pdfPageCount } from '../services/briefingPdf';
const router = Router();

router.get('/project/:projectId/templates',async(req:AuthRequest,res,next)=>{
  try {if(!req.user)return res.status(401).json({error:'Authentification requise'});
    res.json({success:true,data:await (prisma as any).briefingTemplate.findMany({where:{ownerId:req.user.id},orderBy:{createdAt:'desc'}})});
  }catch(e){next(e);}
});
router.put('/project/:projectId/templates/:templateId',async(req:AuthRequest,res,next)=>{
  try {if(!req.user)return res.status(401).json({error:'Authentification requise'});
    if(!/^[a-zA-Z0-9-]{1,150}$/.test(req.params.templateId)||typeof req.body.name!=='string'||!req.body.name.trim()||req.body.name.length>120)return res.status(400).json({error:'Nom ou identifiant invalide'});
    if(Buffer.byteLength(JSON.stringify(req.body.blueprint||{}))>1024*1024)return res.status(413).json({error:'Modèle supérieur à 1 Mo'});
    const parsed=briefingTemplateSchema.safeParse(req.body.blueprint);
    if(!parsed.success)return res.status(400).json({error:'Modèle non portable ou invalide'});
    // Immutable create/retry: never overwrite another owner's model or a prior revision.
    const data=await (prisma as any).briefingTemplate.upsert({where:{id:req.params.templateId},create:{id:req.params.templateId,ownerId:req.user.id,name:req.body.name.trim(),blueprint:parsed.data},update:{}});
    if(data.ownerId!==req.user.id)return res.status(403).json({error:'Modèle inaccessible'});
    if(!isDeepStrictEqual(data.blueprint,parsed.data)||data.name!==req.body.name.trim())return res.status(409).json({error:'Identifiant déjà utilisé : créez un nouveau modèle'});
    res.json({success:true,data});
  }catch(e){next(e);}
});
router.delete('/project/:projectId/templates/:templateId',async(req:AuthRequest,res,next)=>{
  try {if(!req.user)return res.status(401).json({error:'Authentification requise'});
    const result=await (prisma as any).briefingTemplate.deleteMany({where:{id:req.params.templateId,ownerId:req.user.id}});
    if(!result.count)return res.status(404).json({error:'Modèle introuvable'});res.json({success:true});
  }catch(e){next(e);}
});
router.get('/project/:projectId/pdf/:fileId',async(req:AuthRequest,res,next)=>{
  try {
    const file=await prisma.projectFile.findFirst({where:{id:req.params.fileId,projectId:req.params.projectId}});
    if(!file)return res.status(404).json({error:'Fichier introuvable'});
    try{res.json({success:true,data:{pages:await pdfPageCount(file.fileUrl),url:file.fileUrl,name:file.fileName}});}
    catch(e:any){res.status(422).json({error:e.message || 'PDF illisible ou protégé'});}
  }catch(e){next(e);}
});
router.get('/project/:projectId/sources', async (req: AuthRequest, res, next) => {
  try { res.json({ success:true, data:await briefingSources(req.params.projectId), permissions: { write:!!req.access?.write, checklists:!!req.access?.write || !!req.access?.grants.includes('checklists') } }); }
  catch(e) { next(e); }
});
router.put('/:id/document', async (req, res, next) => {
  try {
    if (!Number.isInteger(req.body.revision) || req.body.revision < 0) return res.status(400).json({success:false,error:'Révision requise'});
    if (Buffer.byteLength(JSON.stringify(req.body.document || {})) > 8 * 1024 * 1024) return res.status(413).json({success:false,error:'Document trop volumineux (8 Mo maximum)'});
    const parsed = documentSchema.safeParse(req.body.document);
    if (!parsed.success) return res.status(400).json({success:false,error:'Document invalide',details:parsed.error.flatten()});
    const db = prisma as any;
    const before = await db.briefing.findUnique({where:{id:req.params.id}});
    if (!before) return res.status(404).json({success:false,error:'Briefing introuvable'});
    if (parsed.data.projectId !== before.projectId) return res.status(403).json({success:false,error:'Projet incorrect'});
    try { validateSources(parsed.data, await briefingSources(before.projectId), before.document); }
    catch { return res.status(403).json({success:false,error:'Source étrangère ou inaccessible'}); }
    const result = await db.briefing.updateMany({where:{id:before.id,revision:req.body.revision},data:{document:parsed.data,title:parsed.data.title,revision:{increment:1}}});
    if (!result.count) return res.status(409).json({success:false,error:'Une autre session a modifié ce briefing. Vos changements restent dans cet onglet.'});
    res.json({success:true,data:{revision:req.body.revision+1}});
  } catch(e) { next(e); }
});
router.post('/:id/publish', async (req, res, next) => {
  try {
    const db = prisma as any;
    const b = await db.briefing.findUnique({where:{id:req.params.id}});
    if (!b?.document) return res.status(400).json({success:false,error:'Enregistrez le document avant diffusion'});
    if (req.body.revision !== b.revision) return res.status(409).json({success:false,error:'Révision différente, rechargez avant diffusion'});
    // No update/delete API: a published snapshot is immutable. Retries are idempotent.
    const publication = await db.briefingPublication.upsert({where:{briefingId_revision:{briefingId:b.id,revision:b.revision}},
      create:{id:randomUUID(),briefingId:b.id,revision:b.revision,document:b.document},update:{}});
    res.json({success:true,data:publication});
  } catch(e) { next(e); }
});
router.get('/:id/publications', async (req,res,next) => {
  try { res.json({success:true,data:await (prisma as any).briefingPublication.findMany({where:{briefingId:req.params.id},orderBy:{createdAt:'desc'}})}); }
  catch(e) { next(e); }
});

// ═══════════════════════════════════════════════════════════
// LISTE des briefings d'un projet
// GET /api/v1/briefings/project/:projectId
// ═══════════════════════════════════════════════════════════
router.get('/project/:projectId', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const briefings = await prisma.briefing.findMany({
      where: { projectId },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        projectId: true,
        title: true,
        studioSlides: true,
        document: true,
        slides: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    // On retourne des méta-données allégées pour la liste
    // (les slides complètes sont chargées à l'ouverture)
    const list = briefings.map(b => {
      const hasStudio = b.studioSlides && (b.studioSlides as any).slides?.length > 0;
      const nbSlides = hasStudio
        ? (b.studioSlides as any).slides.length
        : (Array.isArray(b.slides) ? (b.slides as any[]).length : 0);
      return {
        id: b.id,
        projectId: b.projectId,
        title: b.title || 'Briefing sans titre',
        mode: (b as any).document ? 'next' : hasStudio ? 'studio' : 'classic',
        nbSlides: (b as any).document?.pages?.length || nbSlides,
        createdAt: b.createdAt,
        updatedAt: b.updatedAt,
      };
    });
    res.json({ success: true, data: list });
  } catch (e: any) {
    console.error('[briefings list]', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════
// CRÉER un nouveau briefing pour un projet
// POST /api/v1/briefings/project/:projectId
// Body: { title?, slides?, studioSlides? }
// ═══════════════════════════════════════════════════════════
router.post('/project/:projectId', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const { title, slides, studioSlides } = req.body;
    const brief = await prisma.briefing.create({
      data: {
        projectId,
        title: title || 'Nouveau briefing',
        slides: slides ?? [],
        studioSlides: studioSlides ?? null,
      },
    });
    res.json({ success: true, data: brief });
  } catch (e: any) {
    console.error('[briefings create]', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════
// GÉNÉRER un brouillon de briefing par IA à partir des données du projet
// POST /api/v1/briefings/project/:projectId/generate
// ═══════════════════════════════════════════════════════════
router.post('/project/:projectId/generate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { projectId } = req.params;
    const draft = await generateBriefingDraft(projectId);
    const brief = await prisma.briefing.create({
      data: { projectId, title: draft.title, slides: draft.slides },
    });
    res.json({ success: true, data: brief });
  } catch (err: any) {
    next(err);
  }
});

// ═══════════════════════════════════════════════════════════
// LIRE un briefing par son ID
// GET /api/v1/briefings/:id
// ═══════════════════════════════════════════════════════════
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const brief = await prisma.briefing.findUnique({ where: { id } });
    if (!brief) return res.status(404).json({ success: false, error: 'Briefing introuvable' });
    res.json({ success: true, data: brief });
  } catch (e: any) {
    console.error('[briefings get]', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════
// METTRE À JOUR un briefing par son ID
// PATCH /api/v1/briefings/:id
// Body: { title?, slides?, studioSlides? }
// ═══════════════════════════════════════════════════════════
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { title, slides, studioSlides } = req.body;
    const current = await (prisma as any).briefing.findUnique({where:{id}});
    if (current?.document) return res.status(409).json({success:false,error:'Ce briefing est édité dans Studio Next. Créez une copie pour modifier l’original.'});
    const data: any = { revision: { increment: 1 } };
    if (title !== undefined) data.title = title;
    if (slides !== undefined) data.slides = slides;
    if (studioSlides !== undefined) data.studioSlides = studioSlides;
    const written = await (prisma as any).briefing.updateMany({ where: { id, revision: current?.revision }, data });
    if (!written.count) return res.status(409).json({success:false,error:'Briefing modifié dans une autre session'});
    const brief = await prisma.briefing.findUnique({where:{id}});
    res.json({ success: true, data: brief });
  } catch (e: any) {
    console.error('[briefings patch]', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════
// SUPPRIMER un briefing par son ID
// DELETE /api/v1/briefings/:id
// ═══════════════════════════════════════════════════════════
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await prisma.briefing.delete({ where: { id } });
    res.json({ success: true });
  } catch (e: any) {
    console.error('[briefings delete]', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

export default router;