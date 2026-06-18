// src/routes/clients.ts
import { Router, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../utils/AppError';

const router = Router();

// ─── Helpers ────────────────────────────────────────────────────────
type ContactInput = {
  id?: string;
  name?: string;
  role?: string | null;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
  isPrimary?: boolean;
  sortOrder?: number;
};

function cleanContact(c: ContactInput, sortOrder: number) {
  return {
    name:      (c.name || '').trim(),
    role:      c.role || null,
    email:     c.email || null,
    phone:     c.phone || null,
    notes:     c.notes || null,
    isPrimary: Boolean(c.isPrimary),
    sortOrder: c.sortOrder ?? sortOrder,
  };
}

// ─── Clients ────────────────────────────────────────────────────────

// GET /clients — liste de tous les clients (avec nombre de projets associés)
router.get('/', async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const clients = await prisma.client.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { projects: true } } },
    });
    res.json({ success: true, data: clients });
  } catch (err) { next(err); }
});

// GET /clients/:id — détail d'un client avec ses projets ET ses contacts
router.get('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const client = await prisma.client.findUnique({
      where: { id: req.params.id },
      include: {
        projects: {
          select: { id: true, name: true, internalNumber: true, status: true, installationStart: true },
          orderBy: { installationStart: 'desc' },
        },
        contacts: { orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }] },
      },
    });
    if (!client) throw new AppError('Client introuvable', 404);
    res.json({ success: true, data: client });
  } catch (err) { next(err); }
});

// POST /clients — créer un nouveau client (avec ses contacts en option)
router.post('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { name, vat, contactName, email, phone, address, contacts } = req.body;
    if (!name || !name.trim()) throw new AppError('Le nom du client est obligatoire', 400);

    // Construit la donnée du client. Les contacts sont créés en cascade si fournis.
    const data: any = {
      name:        name.trim(),
      vat:         vat || null,
      contactName: contactName || null,
      email:       email || null,
      phone:       phone || null,
      address:     address || null,
    };

    if (Array.isArray(contacts) && contacts.length > 0) {
      // Filtre les contacts vides (sans nom)
      const filtered = contacts
        .map((c: ContactInput, i: number) => cleanContact(c, i))
        .filter(c => c.name);
      // Si aucun contact n'est marqué primary, le 1er le devient
      if (filtered.length > 0 && !filtered.some(c => c.isPrimary)) {
        filtered[0].isPrimary = true;
      }
      if (filtered.length > 0) {
        data.contacts = { create: filtered };
      }
    }

    const client = await prisma.client.create({
      data,
      include: { contacts: true },
    });
    res.status(201).json({ success: true, data: client });
  } catch (err) { next(err); }
});

// PATCH /clients/:id — modifier un client (tous les champs y compris vat)
// Si `contacts` est fourni, remplace TOUS les contacts existants par cette liste
// (création / mise à jour / suppression en bloc — plus simple côté front).
router.patch('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data: any = {};
    ['name', 'vat', 'contactName', 'email', 'phone', 'address'].forEach(k => {
      if (req.body[k] !== undefined) data[k] = req.body[k] || null;
    });

    // Mise à jour atomique : champs simples + remplacement contacts si fourni
    if (Array.isArray(req.body.contacts)) {
      const filtered = (req.body.contacts as ContactInput[])
        .map((c, i) => cleanContact(c, i))
        .filter(c => c.name);
      if (filtered.length > 0 && !filtered.some(c => c.isPrimary)) {
        filtered[0].isPrimary = true;
      }
      // Stratégie simple : on supprime tous les contacts puis on recrée.
      // Fiable et clair côté front qui n'a pas besoin de gérer les diff.
      await prisma.$transaction([
        prisma.clientContact.deleteMany({ where: { clientId: req.params.id } }),
        prisma.client.update({ where: { id: req.params.id }, data }),
        ...(filtered.length > 0
          ? [prisma.clientContact.createMany({
              data: filtered.map(c => ({ ...c, clientId: req.params.id })),
            })]
          : []
        ),
      ]);
    } else {
      await prisma.client.update({ where: { id: req.params.id }, data });
    }

    const client = await prisma.client.findUnique({
      where: { id: req.params.id },
      include: { contacts: { orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }] } },
    });
    res.json({ success: true, data: client });
  } catch (err) { next(err); }
});

// DELETE /clients/:id — supprimer un client (refuse si projets associés)
router.delete('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const count = await prisma.project.count({ where: { clientId: req.params.id } });
    if (count > 0) {
      throw new AppError(
        `Impossible de supprimer : ${count} projet(s) associé(s) à ce client. Réassignez ou supprimez d'abord ces projets.`,
        400
      );
    }
    // Les visites client et les contacts sont supprimés en cascade par la BD.
    await prisma.client.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ─── Contacts par client ────────────────────────────────────────────

// GET /clients/:id/contacts — lister les contacts d'un client
router.get('/:id/contacts', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const contacts = await prisma.clientContact.findMany({
      where: { clientId: req.params.id },
      orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    });
    res.json({ success: true, data: contacts });
  } catch (err) { next(err); }
});

// POST /clients/:id/contacts — ajouter un contact
router.post('/:id/contacts', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.body.name?.trim()) throw new AppError('Le nom du contact est obligatoire', 400);
    const existing = await prisma.clientContact.count({ where: { clientId: req.params.id } });
    const contact = await prisma.clientContact.create({
      data: {
        clientId:  req.params.id,
        ...cleanContact(req.body, existing),
      },
    });
    res.status(201).json({ success: true, data: contact });
  } catch (err) { next(err); }
});

// PATCH /clients/:id/contacts/:contactId — modifier un contact
router.patch('/:id/contacts/:contactId', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data: any = {};
    ['name', 'role', 'email', 'phone', 'notes', 'isPrimary', 'sortOrder'].forEach(k => {
      if (req.body[k] !== undefined) data[k] = req.body[k];
    });
    const contact = await prisma.clientContact.update({
      where: { id: req.params.contactId },
      data,
    });
    res.json({ success: true, data: contact });
  } catch (err) { next(err); }
});

// DELETE /clients/:id/contacts/:contactId — supprimer un contact
router.delete('/:id/contacts/:contactId', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await prisma.clientContact.delete({ where: { id: req.params.contactId } });
    res.json({ success: true });
  } catch (err) { next(err); }
});

export default router;