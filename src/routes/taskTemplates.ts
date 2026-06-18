import { Router, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../utils/AppError';

const router = Router();

// ============================================================================
// CATEGORIES
// ============================================================================

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

// ============================================================================
// TEMPLATES
// ============================================================================

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
// Crée un template unique. On exige explicitement categoryId pour éviter
// les erreurs silencieuses où la catégorie n'est pas liée.
router.post('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { categoryId, title, durationHours, priority, sortOrder, description } = req.body;

    if (!categoryId || !title) {
      return res.status(400).json({
        success: false,
        error: 'categoryId et title sont requis',
      });
    }

    // Vérifier que la catégorie existe (sinon Prisma renvoie une erreur peu claire)
    const cat = await (prisma as any).taskCategory.findUnique({ where: { id: categoryId } });
    if (!cat) {
      return res.status(400).json({
        success: false,
        error: `Catégorie introuvable (id=${categoryId})`,
      });
    }

    const tpl = await (prisma as any).taskTemplate.create({
      data: {
        categoryId,
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

// PATCH /task-templates/:id — modifier un template existant
router.patch('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { categoryId, title, durationHours, priority, sortOrder, description, isActive } = req.body;
    const data: any = {};
    if (categoryId !== undefined) data.categoryId = categoryId;
    if (title !== undefined) data.title = title;
    if (durationHours !== undefined) data.durationHours = durationHours;
    if (priority !== undefined) data.priority = priority;
    if (sortOrder !== undefined) data.sortOrder = sortOrder;
    if (description !== undefined) data.description = description;
    if (isActive !== undefined) data.isActive = isActive;

    const tpl = await (prisma as any).taskTemplate.update({
      where: { id: req.params.id },
      data,
      include: { category: true },
    });
    res.json({ success: true, data: tpl });
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

// ============================================================================
// IMPORT
// ============================================================================

// POST /task-templates/import — import en masse depuis un CSV pré-parsé côté frontend.
// Body attendu : { rows: [{ category, title, durationHours?, priority? }, ...] }
//
// Logique :
//   1. Filtrer les lignes vides
//   2. Pour chaque catégorie unique : réutiliser si existe (par nom), sinon créer
//   3. Pour chaque ligne : créer un template (skip si même titre existe déjà dans la catégorie)
//   4. Retourner un compte EXACT de ce qui a vraiment été créé
router.post('/import', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { rows } = req.body;

    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ success: false, error: 'rows requis (tableau non vide)' });
    }

    // Nettoyer + filtrer
    const validRows = rows
      .map((r: any) => ({
        category: String(r.category || '').trim(),
        title: String(r.title || '').trim(),
        durationHours: Number(r.durationHours) > 0 ? Number(r.durationHours) : 4,
        priority: String(r.priority || 'normal').trim().toLowerCase() || 'normal',
      }))
      .filter(r => r.category && r.title);

    if (validRows.length === 0) {
      return res.status(400).json({ success: false, error: 'Aucune ligne valide dans le CSV' });
    }

    // 1. Récupérer / créer les catégories
    const uniqueCategoryNames = Array.from(new Set(validRows.map(r => r.category)));
    const catByName: Record<string, any> = {};
    let categoriesCreated = 0;
    let categoriesReused = 0;

    for (const name of uniqueCategoryNames) {
      // Chercher par nom (insensible à la casse pour éviter les doublons)
      const existing = await (prisma as any).taskCategory.findFirst({
        where: { name: { equals: name, mode: 'insensitive' } },
      });

      if (existing) {
        // Réactiver si soft-deleted
        if (!existing.isActive) {
          await (prisma as any).taskCategory.update({
            where: { id: existing.id },
            data: { isActive: true },
          });
        }
        catByName[name] = existing;
        categoriesReused++;
      } else {
        const maxOrder = await (prisma as any).taskCategory.aggregate({
          _max: { sortOrder: true },
        });
        const created = await (prisma as any).taskCategory.create({
          data: {
            name,
            icon: '📋',
            color: '#5a6275',
            sortOrder: (maxOrder._max?.sortOrder ?? -1) + 1,
            isActive: true,
          },
        });
        catByName[name] = created;
        categoriesCreated++;
      }
    }

    // 2. Créer les templates
    let tasksCreated = 0;
    let tasksSkipped = 0;
    const errors: string[] = [];

    // Compteur de sortOrder par catégorie
    const sortOrderByCat: Record<string, number> = {};
    for (const catName of Object.keys(catByName)) {
      const cat = catByName[catName];
      const count = await (prisma as any).taskTemplate.count({
        where: { categoryId: cat.id },
      });
      sortOrderByCat[cat.id] = count;
    }

    for (const row of validRows) {
      const cat = catByName[row.category];
      if (!cat) {
        errors.push(`Catégorie introuvable pour "${row.title}"`);
        continue;
      }

      try {
        // Skip si template avec le même titre existe déjà (actif) dans cette catégorie
        const existing = await (prisma as any).taskTemplate.findFirst({
          where: {
            categoryId: cat.id,
            title: { equals: row.title, mode: 'insensitive' },
            isActive: true,
          },
        });
        if (existing) {
          tasksSkipped++;
          continue;
        }

        await (prisma as any).taskTemplate.create({
          data: {
            categoryId: cat.id,
            title: row.title,
            durationHours: row.durationHours,
            priority: row.priority,
            sortOrder: sortOrderByCat[cat.id]++,
            isActive: true,
          },
        });
        tasksCreated++;
      } catch (e: any) {
        errors.push(`Erreur "${row.title}" : ${e.message}`);
      }
    }

    res.json({
      success: true,
      data: {
        categoriesCreated,
        categoriesReused,
        tasksCreated,
        tasksSkipped,
        tasksFailed: errors.length,
        totalRows: validRows.length,
        errors: errors.slice(0, 20), // limiter pour ne pas saturer la réponse
      },
    });
  } catch (err) { next(err); }
});

// ============================================================================
// APPLY (créer des tâches dans un projet depuis des templates)
// ============================================================================

// POST /task-templates/apply
// Accepte 2 formats :
//   FORMAT 1 (legacy) : { projectId, templateIds: [...], startDate? }
//   FORMAT 2 (détaillé) : { projectId, items: [{ templateId, taskDate, assigneeId }, ...] }
router.post('/apply', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { projectId, templateIds, startDate, items } = req.body;
    if (!projectId) {
      return res.status(400).json({ success: false, error: 'projectId requis' });
    }

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

    const tplIds = normalizedItems.map(i => i.templateId);
    const templates = await (prisma as any).taskTemplate.findMany({
      where: { id: { in: tplIds } },
      include: { category: true },
    });
    const byId: Record<string, any> = {};
    templates.forEach((t: any) => { byId[t.id] = t; });

    const tasks = await Promise.all(
      normalizedItems
        .filter(item => byId[item.templateId])
        .map(item => {
          const tpl = byId[item.templateId];
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

// ============================================================================
// RESET (vider + ré-importer les 7 catégories Viewbox par défaut)
// ============================================================================

router.post('/reset', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (req.user?.role !== 'admin') throw new AppError('Réservé aux admins', 403);
    await (prisma as any).taskTemplate.deleteMany({});
    await (prisma as any).taskCategory.deleteMany({});

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