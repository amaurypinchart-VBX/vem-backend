import { Router, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../utils/AppError';

const router = Router();

// GET /task-templates/categories
router.get('/categories', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const cats = await (prisma as any).taskCategory.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      include: {
        templates: {
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
    res.json({ success: true, data: cats });
  } catch (err) { next(err); }
});

// POST /task-templates/categories
router.post('/categories', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const cat = await (prisma as any).taskCategory.create({ data: req.body });
    res.status(201).json({ success: true, data: cat });
  } catch (err) { next(err); }
});

// PATCH /task-templates/categories/:id
router.patch('/categories/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const cat = await (prisma as any).taskCategory.update({
      where: { id: req.params.id },
      data: req.body,
    });
    res.json({ success: true, data: cat });
  } catch (err) { next(err); }
});

// DELETE /task-templates/categories/:id
router.delete('/categories/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await (prisma as any).taskCategory.update({
      where: { id: req.params.id },
      data: { isActive: false },
    });
    res.json({ success: true });
  } catch (err) { next(err); }
});

// GET /task-templates
router.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const tpls = await (prisma as any).taskTemplate.findMany({
      where: { isActive: true },
      orderBy: [{ category: { sortOrder: 'asc' } }, { sortOrder: 'asc' }],
      include: { category: true },
    });
    res.json({ success: true, data: tpls });
  } catch (err) { next(err); }
});

// POST /task-templates
router.post('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const tpl = await (prisma as any).taskTemplate.create({
      data: req.body,
      include: { category: true },
    });
    res.status(201).json({ success: true, data: tpl });
  } catch (err) { next(err); }
});

// PATCH /task-templates/:id
router.post('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { categoryId, title, durationHours, priority, sortOrder, description } = req.body;
    
    const tpl = await (prisma as any).taskTemplate.create({
      data: {
        category: { connect: { id: categoryId } },  // ← connexion explicite
        title,
        durationHours: durationHours || 4,
        priority: priority || 'normal',
        sortOrder: sortOrder || 0,
        description: description || null,
        isActive: true,
      },
      include: { category: true },
    });
    res.status(201).json({ success: true, data: tpl });
  } catch (err) { next(err); }
});

// DELETE /task-templates/:id
router.delete('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await (prisma as any).taskTemplate.update({
      where: { id: req.params.id },
      data: { isActive: false },
    });
    res.json({ success: true });
  } catch (err) { next(err); }
});

// POST /task-templates/apply — crée des tâches à partir de templates pour un projet.
// Accepte 2 formats :
//   FORMAT 1 (legacy) : { projectId, templateIds: [...], startDate? }
//     → toutes les tâches utilisent la même startDate, sans assignee
//   FORMAT 2 (nouveau, détaillé) : { projectId, items: [{ templateId, taskDate, assigneeId }, ...] }
//     → date + assignee par tâche
router.post('/apply', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { projectId, templateIds, startDate, items } = req.body;
    if (!projectId) {
      return res.status(400).json({ success: false, error: 'projectId requis' });
    }

    // Normaliser vers le format détaillé
    let normalizedItems: Array<{ templateId: string; taskDate: string | null; assigneeId: string | null }> = [];

    if (Array.isArray(items) && items.length > 0) {
      normalizedItems = items.map((it: any) => ({
        templateId: String(it.templateId),
        taskDate: it.taskDate || null,
        assigneeId: it.assigneeId || null,
      }));
    } else if (Array.isArray(templateIds) && templateIds.length > 0) {
      normalizedItems = templateIds.map((id: string) => ({
        templateId: id,
        taskDate: startDate || null,
        assigneeId: null,
      }));
    } else {
      return res.status(400).json({ success: false, error: 'items ou templateIds requis' });
    }

    // Charger les templates avec leur catégorie
    const tplIds = normalizedItems.map(i => i.templateId);
    const templates = await (prisma as any).taskTemplate.findMany({
      where: { id: { in: tplIds } },
      include: { category: true },
    });
    const byId: Record<string, any> = {};
    templates.forEach((t: any) => { byId[t.id] = t; });

    // Créer les tâches
    const tasks = await Promise.all(
      normalizedItems
        .filter(item => byId[item.templateId])
        .map(item => {
          const tpl = byId[item.templateId];
          // Préfixer le titre avec la catégorie pour s'y retrouver
          const titleWithCat = tpl.category ? `[${tpl.category.name}] ${tpl.title}` : tpl.title;
          return prisma.task.create({
            data: {
              projectId,
              title: titleWithCat,
              description: tpl.description || null,
              taskDate: item.taskDate ? new Date(item.taskDate) : new Date(),
              status: 'todo' as any,
              priority: (tpl.priority || 'normal') as any,
              estimatedHours: tpl.durationHours,
              assigneeId: item.assigneeId || null,
              createdById: req.user!.id,
            },
          });
        })
    );
    res.status(201).json({ success: true, data: tasks, meta: { created: tasks.length } });
  } catch (err) { next(err); }
});

// POST /task-templates/reset — vide la base et ré-importe les 7 catégories Viewbox
// Utile pour rétablir les templates par défaut. Action destructive : tout est effacé.
router.post('/reset', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (req.user?.role !== 'admin') throw new AppError('Réservé aux admins', 403);
    // On efface tout (CASCADE supprime aussi les task_templates liés)
    await (prisma as any).taskTemplate.deleteMany({});
    await (prisma as any).taskCategory.deleteMany({});

    // Re-import depuis le seed inline (mêmes données que dans migrations.ts)
    const SEED = [
      { name:'To Do',                 icon:'📋', color:'#5a6275', tasks:['Team - Dismantling','Preparation material from delivery note'] },
      { name:'PRE-PROD',              icon:'📐', color:'#4895ef', tasks:['Briefing SHEET from SALES','Preparation of all packing list','Packing list for warehouse team','Site Visit ( Verify faisability on site)','Boarding solution','Analyse packing list','Buy missing material','Briefing team','Briefing PP with all informations','Create Whats app group'] },
      { name:'Booking Supplier',      icon:'📞', color:'#9b59b6', tasks:['Organise transport TRUCK','Book SM','Book accomodation SM','Book Transport SM','Rent Forklift','Book team','Rent Manitou ROTO','Rent Scisor Lift','Book CRANE','Book Accomodation team'] },
      { name:'Warehouse Preparation', icon:'📦', color:'#f4a261', tasks:['Loading truck'] },
      { name:'Installation',          icon:'🏗️', color:'#e63946', tasks:['GENERAL TASK','TMPL - Electricity','Unload Tautliner with Forklift On Site','Levelling and Laser work on site','Unload Flatbed truck on site with crane','UNIT','Placing Facade elements','Placement of inner Ceilings','Placement of vinyl floor','Placement of Vinyl click hard floor','Handover with the client','Interior or exterior Staircase','Terraces and Unit'] },
      { name:'Dismantling',           icon:'🔨', color:'#f4a261', tasks:['Unloading of rack and tools and reorganisation of racks','Remove Decoration and interior material','Remove facade Elements','Remove external or internal staircase','Flat Packing With crane UNIT','Remove terraces Unit and Handrails','Loading FlatBED','Loading Tautliner','Cleaning SITE','HANDHOVER Client to end of event','GENERAL DISMANTLING TASK'] },
      { name:'Come Back Warehouse',   icon:'🏠', color:'#2dc653', tasks:['Dismounting','Unloading truck in warehouse','Verification of return material'] },
    ];

    let totalCats = 0, totalTasks = 0;
    for (let i = 0; i < SEED.length; i++) {
      const cat = SEED[i];
      const created = await (prisma as any).taskCategory.create({
        data: { name: cat.name, icon: cat.icon, color: cat.color, sortOrder: i, isActive: true },
      });
      totalCats++;
      for (let j = 0; j < cat.tasks.length; j++) {
        await (prisma as any).taskTemplate.create({
          data: {
            categoryId: created.id, title: cat.tasks[j],
            durationHours: 4, priority: 'normal',
            sortOrder: j, isActive: true,
          },
        });
        totalTasks++;
      }
    }

    res.json({ success: true, data: { categories: totalCats, tasks: totalTasks } });
  } catch (err) { next(err); }
});

export default router;