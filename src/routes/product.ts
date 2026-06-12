// ═══════════════════════════════════════════════════════════
// products.ts — Module Produits / Stock
// ═══════════════════════════════════════════════════════════
// Emplacement : backend/src/routes/products.ts
// Monté dans index.ts via :
//   import productsRoutes from './routes/products';
//   app.use(`${API}/products`, authMiddleware, productsRoutes);
//
// Dépendances à installer si pas déjà là :
//   npm install multer csv-parse
//   npm install -D @types/multer
//
// IMPORTANT — ordre des routes :
//   Les routes spécifiques (/categories/*, /import) DOIVENT être
//   déclarées AVANT les routes avec :id, sinon Express interprète
//   "categories" ou "import" comme un id et ne les atteint jamais.
// ═══════════════════════════════════════════════════════════

import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import multer from 'multer';
import { parse } from 'csv-parse/sync';

const router = Router();
const prisma = new PrismaClient();

// Upload en mémoire (pas besoin de disque pour un CSV)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 Mo max
});

// ─────────────────────────────────────────────
// Helper : calcul de la période de réservation
// ─────────────────────────────────────────────
// Règle métier :
//   - Début = installationStart - 3 jours
//             (mais -5 si l'installation commence un LUNDI,
//              pour couvrir le week-end précédent)
//   - Fin   = dismantlingEnd + 3 jours
//             (mais +5 si le démontage finit un VENDREDI,
//              pour couvrir le week-end suivant)
// ─────────────────────────────────────────────
export function computeReservationPeriod(
  installStart: Date,
  dismantleEnd: Date | null
): { start: Date; end: Date } {
  const start = new Date(installStart);
  const installDay = installStart.getDay(); // 0=dim, 1=lun, ... 6=sam
  const startOffset = installDay === 1 ? 5 : 3;
  start.setDate(start.getDate() - startOffset);

  // Si pas de date de démontage, utilise installStart + 7 par défaut
  const refEnd = dismantleEnd ? new Date(dismantleEnd) : new Date(installStart.getTime() + 7 * 86400000);
  const end = new Date(refEnd);
  const dismantleDay = refEnd.getDay();
  const endOffset = dismantleDay === 5 ? 5 : 3;
  end.setDate(end.getDate() + endOffset);

  return { start, end };
}

// ═══════════════════════════════════════════════════════════
// CATÉGORIES — déclarées EN PREMIER (avant les routes /:id)
// ═══════════════════════════════════════════════════════════

// GET /products/categories  — liste toutes les catégories
router.get('/categories', async (_req: Request, res: Response) => {
  try {
    const categories = await prisma.productCategory.findMany({
      where: { isActive: true },
      include: { _count: { select: { products: true } } },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    res.json({ success: true, data: categories });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /products/categories  — créer
router.post('/categories', async (req: Request, res: Response) => {
  try {
    const { name, description, color, icon, sortOrder } = req.body;
    if (!name) return res.status(400).json({ success: false, error: 'name requis' });
    const category = await prisma.productCategory.create({
      data: {
        name,
        description: description || null,
        color: color || '#4895ef',
        icon: icon || '📦',
        sortOrder: sortOrder ?? 0,
      },
    });
    res.json({ success: true, data: category });
  } catch (err: any) {
    if (err.code === 'P2002') {
      return res.status(409).json({ success: false, error: 'Cette catégorie existe déjà' });
    }
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /products/categories/:id  — modifier
router.put('/categories/:id', async (req: Request, res: Response) => {
  try {
    const category = await prisma.productCategory.update({
      where: { id: req.params.id },
      data: req.body,
    });
    res.json({ success: true, data: category });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /products/categories/:id  — soft delete (les produits liés gardent leur catégorie)
router.delete('/categories/:id', async (req: Request, res: Response) => {
  try {
    await prisma.productCategory.update({
      where: { id: req.params.id },
      data: { isActive: false },
    });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════
// IMPORT CSV  — upload d'un fichier exporté d'Odoo
// ═══════════════════════════════════════════════════════════
// Format CSV attendu (colonnes flexibles, casse insensible) :
//   internal_reference  /  Internal Reference  /  reference  /  ref
//   description         /  Description         /  name       /  nom
//   demand              /  Demand              /  quantity   /  qty   /  stock
//   category            /  Category            /  catégorie  (optionnel)
//   unit                /  Unit                                       (optionnel)
//
// Les quantités au format européen (ex: "75,000" = 75) sont gérées.
//
// Comportement :
//   - Si le produit existe (même internal_reference) → UPDATE (quantité, nom)
//   - Sinon → CREATE
//   - Si ?mode=replace en query string, vide tout AVANT l'import
// ═══════════════════════════════════════════════════════════
router.post('/import', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'Fichier CSV manquant' });

    const content = req.file.buffer.toString('utf-8');

    // Parse avec détection auto du délimiteur (, ou ;)
    let records: any[];
    try {
      const firstLine = content.split('\n')[0] || '';
      const delimiter = firstLine.includes(';') && !firstLine.includes(',') ? ';' : ',';
      records = parse(content, {
        columns: (header: string[]) => header.map((h) => h.trim().toLowerCase()),
        skip_empty_lines: true,
        trim: true,
        bom: true,
        delimiter,
      });
    } catch (parseErr: any) {
      return res.status(400).json({ success: false, error: 'CSV invalide : ' + parseErr.message });
    }

    // Mode "replace" : on vide tout d'abord
    if (req.query.mode === 'replace') {
      await prisma.product.deleteMany();
    }

    const pickField = (row: any, ...keys: string[]) => {
      for (const k of keys) {
        const v = row[k.toLowerCase()];
        if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
      }
      return null;
    };

    // Parsing quantité tolérant : "75,000" → 75 ; "1.000" → 1 ; "1500" → 1500
    const parseQty = (raw: string | null): number => {
      if (!raw) return 1;
      let s = raw.trim().replace(/\s/g, '');
      // Format européen "75,000" (3 chiffres après virgule) → décimal
      if (/^\d+,\d{3}$/.test(s)) s = s.replace(',', '.');
      else s = s.replace(',', '.');
      const n = parseFloat(s);
      return isNaN(n) || n < 0 ? 1 : n;
    };

    let created = 0;
    let updated = 0;
    const errors: { row: number; reason: string }[] = [];

    for (let i = 0; i < records.length; i++) {
      const row = records[i];
      const ref = pickField(row, 'internal_reference', 'internal reference', 'reference', 'ref');
      const name = pickField(row, 'description', 'name', 'nom', 'libelle', 'libellé');
      const qtyRaw = pickField(row, 'demand', 'quantity', 'qty', 'stock', 'qté', 'quantite', 'quantité');
      const categoryName = pickField(row, 'category', 'catégorie', 'categorie');
      const unit = pickField(row, 'unit', 'unite', 'unité') || 'pcs';

      if (!ref || !name) {
        errors.push({ row: i + 2, reason: 'Référence ou nom manquant' });
        continue;
      }

      const quantity = parseQty(qtyRaw);

      // Résoudre la catégorie si fournie (création auto si elle n'existe pas)
      let categoryId: string | null = null;
      if (categoryName) {
        const cat = await prisma.productCategory.upsert({
          where: { name: categoryName },
          create: { name: categoryName },
          update: {},
        });
        categoryId = cat.id;
      }

      try {
        const existing = await prisma.product.findUnique({ where: { internalReference: ref } });
        if (existing) {
          await prisma.product.update({
            where: { id: existing.id },
            data: { name, totalQuantity: quantity, unit, ...(categoryId ? { categoryId } : {}) },
          });
          updated++;
        } else {
          await prisma.product.create({
            data: { internalReference: ref, name, totalQuantity: quantity, unit, categoryId },
          });
          created++;
        }
      } catch (e: any) {
        errors.push({ row: i + 2, reason: e.message });
      }
    }

    res.json({
      success: true,
      data: {
        total: records.length,
        created,
        updated,
        errors: errors.length,
        errorDetails: errors.slice(0, 20),
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════
// PRODUITS — CRUD (déclaré APRÈS categories et import)
// ═══════════════════════════════════════════════════════════

// GET /products  — liste tous les produits actifs
router.get('/', async (req: Request, res: Response) => {
  try {
    const { categoryId, search } = req.query;
    const where: any = { isActive: true };
    if (categoryId) where.categoryId = String(categoryId);
    if (search) {
      where.OR = [
        { name: { contains: String(search), mode: 'insensitive' } },
        { internalReference: { contains: String(search), mode: 'insensitive' } },
      ];
    }
    const products = await prisma.product.findMany({
      where,
      include: { category: true },
      orderBy: [{ category: { sortOrder: 'asc' } }, { name: 'asc' }],
    });
    res.json({ success: true, data: products });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /products  — créer un produit
router.post('/', async (req: Request, res: Response) => {
  try {
    const { internalReference, name, description, categoryId, totalQuantity, unit, photoUrl, publicId, notes } = req.body;
    if (!internalReference || !name) {
      return res.status(400).json({ success: false, error: 'internalReference et name sont requis' });
    }
    const product = await prisma.product.create({
      data: {
        internalReference,
        name,
        description: description || null,
        categoryId: categoryId || null,
        totalQuantity: totalQuantity ?? 1,
        unit: unit || 'pcs',
        photoUrl: photoUrl || null,
        publicId: publicId || null,
        notes: notes || null,
      },
      include: { category: true },
    });
    res.json({ success: true, data: product });
  } catch (err: any) {
    if (err.code === 'P2002') {
      return res.status(409).json({ success: false, error: 'Cette référence interne existe déjà' });
    }
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /products  — vider tout le catalogue (DANGER)
// Nécessite un header X-Confirm-Wipe: yes pour éviter les accidents
router.delete('/', async (req: Request, res: Response) => {
  try {
    if (req.headers['x-confirm-wipe'] !== 'yes') {
      return res.status(400).json({
        success: false,
        error: 'Confirmation manquante. Header X-Confirm-Wipe: yes requis.',
      });
    }
    const result = await prisma.product.deleteMany();
    res.json({ success: true, deletedCount: result.count });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /products/:id  — détail produit avec ses réservations
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const product = await prisma.product.findUnique({
      where: { id: req.params.id },
      include: {
        category: true,
        reservations: {
          include: {
            project: {
              select: {
                id: true,
                internalNumber: true,
                name: true,
                installationStart: true,
                dismantlingEnd: true,
              },
            },
          },
          orderBy: { reservationStart: 'asc' },
        },
      },
    });
    if (!product) return res.status(404).json({ success: false, error: 'Produit introuvable' });
    res.json({ success: true, data: product });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /products/:id  — modifier
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { internalReference, name, description, categoryId, totalQuantity, unit, photoUrl, publicId, notes, isActive } = req.body;
    const data: any = {};
    if (internalReference !== undefined) data.internalReference = internalReference;
    if (name !== undefined) data.name = name;
    if (description !== undefined) data.description = description;
    if (categoryId !== undefined) data.categoryId = categoryId || null;
    if (totalQuantity !== undefined) data.totalQuantity = totalQuantity;
    if (unit !== undefined) data.unit = unit;
    if (photoUrl !== undefined) data.photoUrl = photoUrl;
    if (publicId !== undefined) data.publicId = publicId;
    if (notes !== undefined) data.notes = notes;
    if (isActive !== undefined) data.isActive = isActive;

    const product = await prisma.product.update({
      where: { id: req.params.id },
      data,
      include: { category: true },
    });
    res.json({ success: true, data: product });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /products/:id  — supprimer un produit
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await prisma.product.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;