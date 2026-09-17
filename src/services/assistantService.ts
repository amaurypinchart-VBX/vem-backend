// src/services/assistantService.ts
// Assistant en langage naturel pour les PM/chefs de projet : répond à des
// questions sur les projets, et peut désormais AUSSI créer des choses (projet,
// camion, booking hôtel, tâche, ticket...) via des "tools" Claude (tool-use).
//
// Sécurité applicative : toute écriture passe par un tool dédié, validé par
// zod, et le prompt système impose une confirmation conversationnelle avant
// chaque création (l'utilisateur doit dire "oui" à un récapitulatif explicite
// avant que le tool ne soit réellement appelé). Le rôle requis pour accéder à
// /assistant (index.ts) est le même que celui qui peut déjà créer ces entités
// via l'UI normale — pas de nouvelle surface de privilège.
//
// Les tools de LECTURE restent bornés (MAX_ROWS, select explicite, jamais de
// données sensibles). Les tools d'ÉCRITURE réutilisent la même logique Prisma
// que les routes REST correspondantes (voir commentaires par tool).

import { z, ZodTypeAny } from 'zod';
import { prisma } from '../config/database';
import { AppError } from '../utils/AppError';
import { logger } from '../utils/logger';
import { anthropicRequest } from './aiService';
import { notifyTubizeTruckMovement } from './telegramService';
import { createWarehouseTask } from './warehouseAppService';
import { generateProjectReport } from './projectReportService';

const MAX_ROWS = 20;
const MAX_ITERATIONS = 8;

export interface AssistantUser {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
}

// Résout une référence de projet (id, n° interne ou nom partiel) vers un id réel.
async function resolveProjectId(ref?: string): Promise<string | undefined> {
  if (!ref) return undefined;
  const byId = await prisma.project.findUnique({ where: { id: ref }, select: { id: true } }).catch(() => null);
  if (byId) return byId.id;
  const byInternalNumber = await prisma.project.findFirst({
    where: { internalNumber: { equals: ref, mode: 'insensitive' } },
    select: { id: true },
  });
  if (byInternalNumber) return byInternalNumber.id;
  const byName = await prisma.project.findFirst({
    where: { name: { contains: ref, mode: 'insensitive' } },
    select: { id: true },
    orderBy: { updatedAt: 'desc' },
  });
  return byName?.id;
}

// Résout une référence utilisateur (id, email ou "prénom nom" approximatif).
async function resolveUserRef(ref?: string): Promise<string | undefined> {
  if (!ref) return undefined;
  const byId = await prisma.user.findUnique({ where: { id: ref }, select: { id: true } }).catch(() => null);
  if (byId) return byId.id;
  const byEmail = await prisma.user.findFirst({ where: { email: { equals: ref, mode: 'insensitive' } }, select: { id: true } });
  if (byEmail) return byEmail.id;
  const parts = ref.trim().split(/\s+/);
  const byName = await prisma.user.findFirst({
    where: {
      isActive: true,
      OR: [
        { firstName: { contains: ref, mode: 'insensitive' } },
        { lastName: { contains: ref, mode: 'insensitive' } },
        ...(parts.length > 1
          ? [{ AND: [
              { firstName: { contains: parts[0], mode: 'insensitive' as const } },
              { lastName: { contains: parts.slice(1).join(' '), mode: 'insensitive' as const } },
            ] }]
          : []),
      ],
    },
    select: { id: true },
  });
  return byName?.id;
}

// Résout une référence client (id ou nom partiel).
async function resolveClientRef(ref?: string): Promise<string | undefined> {
  if (!ref) return undefined;
  const byId = await prisma.client.findUnique({ where: { id: ref }, select: { id: true } }).catch(() => null);
  if (byId) return byId.id;
  const byName = await prisma.client.findFirst({
    where: { name: { contains: ref, mode: 'insensitive' } },
    select: { id: true },
  });
  return byName?.id;
}

interface Tool {
  name: string;
  description: string;
  inputSchema: Record<string, any>; // JSON Schema pour l'API Anthropic
  zodSchema: ZodTypeAny;            // validation côté serveur du même contrat
  resolve: (input: any, user: AssistantUser) => Promise<any>;
}

const TOOLS: Tool[] = [
  // ═══════════════════════════════════════════════════════════════
  // LECTURE — bornée (MAX_ROWS), select explicite, jamais de données sensibles.
  // ═══════════════════════════════════════════════════════════════
  {
    name: 'list_projects',
    description: "Liste les projets, avec filtre optionnel par statut ou par fenêtre de dates d'installation.",
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', description: 'draft, confirmed, in_preparation, loading, on_site, installation, handover, dismantling, completed, cancelled...' },
        from: { type: 'string', description: 'Date ISO — projets dont l\'installation commence après cette date' },
        to: { type: 'string', description: 'Date ISO — projets dont l\'installation commence avant cette date' },
        search: { type: 'string', description: 'Recherche texte libre sur le nom du projet' },
      },
    },
    zodSchema: z.object({
      status: z.string().optional(),
      from: z.string().optional(),
      to: z.string().optional(),
      search: z.string().optional(),
    }),
    resolve: async (input) => {
      const where: any = {};
      if (input.status) where.status = input.status;
      if (input.search) where.name = { contains: input.search, mode: 'insensitive' };
      if (input.from || input.to) {
        where.installationStart = {};
        if (input.from) where.installationStart.gte = new Date(input.from);
        if (input.to) where.installationStart.lte = new Date(input.to);
      }
      const projects = await prisma.project.findMany({
        where, take: MAX_ROWS, orderBy: { installationStart: 'asc' },
        select: {
          internalNumber: true, name: true, status: true, city: true,
          installationStart: true, installationEnd: true,
          client: { select: { name: true } },
        },
      });
      return projects;
    },
  },
  {
    name: 'get_project',
    description: 'Récupère le détail complet d\'un projet (n° interne, nom, ou id).',
    inputSchema: {
      type: 'object',
      properties: { projectRef: { type: 'string', description: 'N° interne, id ou nom (partiel) du projet' } },
      required: ['projectRef'],
    },
    zodSchema: z.object({ projectRef: z.string() }),
    resolve: async (input) => {
      const id = await resolveProjectId(input.projectRef);
      if (!id) return { error: 'Projet introuvable' };
      return prisma.project.findUnique({
        where: { id },
        select: {
          id: true, internalNumber: true, name: true, status: true, address: true, city: true,
          installationStart: true, installationEnd: true, dismantlingStart: true, dismantlingEnd: true,
          workersCount: true, description: true, specialInstructions: true,
          client: { select: { name: true, contactName: true, phone: true, email: true } },
          technicalManager: { select: { firstName: true, lastName: true } },
        },
      });
    },
  },
  {
    name: 'list_tasks',
    description: 'Liste les tâches, filtrables par projet et/ou statut.',
    inputSchema: {
      type: 'object',
      properties: {
        projectRef: { type: 'string', description: 'N° interne, id ou nom du projet' },
        status: { type: 'string', description: 'todo, in_progress, done, blocked, cancelled' },
      },
    },
    zodSchema: z.object({ projectRef: z.string().optional(), status: z.string().optional() }),
    resolve: async (input) => {
      const projectId = await resolveProjectId(input.projectRef);
      if (input.projectRef && !projectId) return { error: 'Projet introuvable' };
      const where: any = {};
      if (projectId) where.projectId = projectId;
      if (input.status) where.status = input.status;
      return prisma.task.findMany({
        where, take: MAX_ROWS, orderBy: { taskDate: 'asc' },
        select: {
          title: true, status: true, priority: true, taskDate: true,
          assignedTo: { select: { firstName: true, lastName: true } },
          project: { select: { internalNumber: true, name: true } },
        },
      });
    },
  },
  {
    name: 'list_tickets',
    description: "Liste les tickets (incidents/demandes), filtrables par projet, statut ou urgence.",
    inputSchema: {
      type: 'object',
      properties: {
        projectRef: { type: 'string' },
        status: { type: 'string', description: 'open, assigned, in_progress, resolved, validated, closed' },
        urgency: { type: 'string', description: 'low, medium, high, critical' },
      },
    },
    zodSchema: z.object({ projectRef: z.string().optional(), status: z.string().optional(), urgency: z.string().optional() }),
    resolve: async (input) => {
      const projectId = await resolveProjectId(input.projectRef);
      if (input.projectRef && !projectId) return { error: 'Projet introuvable' };
      const where: any = {};
      if (projectId) where.projectId = projectId;
      if (input.status) where.status = input.status;
      if (input.urgency) where.urgency = input.urgency;
      return prisma.ticket.findMany({
        where, take: MAX_ROWS, orderBy: { createdAt: 'desc' },
        select: {
          title: true, description: true, urgency: true, status: true, plannedDate: true,
          assignedTo: { select: { firstName: true, lastName: true } },
          project: { select: { internalNumber: true, name: true } },
        },
      });
    },
  },
  {
    name: 'list_trucks',
    description: 'Liste les véhicules (camions, grues, nacelles...) planifiés, filtrables par projet ou statut.',
    inputSchema: {
      type: 'object',
      properties: {
        projectRef: { type: 'string' },
        status: { type: 'string', description: 'draft, planned, confirmed...' },
      },
    },
    zodSchema: z.object({ projectRef: z.string().optional(), status: z.string().optional() }),
    resolve: async (input) => {
      const projectId = await resolveProjectId(input.projectRef);
      if (input.projectRef && !projectId) return { error: 'Projet introuvable' };
      const where: any = {};
      if (projectId) where.projectId = projectId;
      if (input.status) where.status = input.status;
      return prisma.truck.findMany({
        where, take: MAX_ROWS, orderBy: { loadingDate: 'asc' },
        select: {
          vehicleType: true, truckNumber: true, licensePlate: true, driverName: true, status: true,
          loadingDate: true, departureDate: true, arrivalDate: true,
          project: { select: { internalNumber: true, name: true } },
        },
      });
    },
  },
  {
    name: 'list_team_bookings',
    description: "Liste les trajets (aller/retour) réservés pour l'équipe sur un projet.",
    inputSchema: {
      type: 'object',
      properties: { projectRef: { type: 'string' } },
    },
    zodSchema: z.object({ projectRef: z.string().optional() }),
    resolve: async (input) => {
      const projectId = await resolveProjectId(input.projectRef);
      if (input.projectRef && !projectId) return { error: 'Projet introuvable' };
      const where: any = {};
      if (projectId) where.projectId = projectId;
      return prisma.teamBooking.findMany({
        where, take: MAX_ROWS, orderBy: { onSiteStart: 'asc' },
        select: {
          phase: true, onSiteStart: true, onSiteEnd: true,
          outboundMode: true, outboundDate: true, returnMode: true, returnDate: true,
          user: { select: { firstName: true, lastName: true } },
          project: { select: { internalNumber: true, name: true } },
        },
      });
    },
  },
  {
    name: 'list_hotel_bookings',
    description: "Liste les réservations d'hôtel pour l'équipe sur un projet.",
    inputSchema: {
      type: 'object',
      properties: { projectRef: { type: 'string' } },
    },
    zodSchema: z.object({ projectRef: z.string().optional() }),
    resolve: async (input) => {
      const projectId = await resolveProjectId(input.projectRef);
      if (input.projectRef && !projectId) return { error: 'Projet introuvable' };
      const where: any = {};
      if (projectId) where.projectId = projectId;
      return prisma.hotelBooking.findMany({
        where, take: MAX_ROWS, orderBy: { checkin: 'asc' },
        select: {
          hotelName: true, phase: true, checkin: true, checkout: true,
          occupants: { select: { user: { select: { firstName: true, lastName: true } } } },
          project: { select: { internalNumber: true, name: true } },
        },
      });
    },
  },
  {
    name: 'list_daily_reports',
    description: "Liste les rapports journaliers d'un projet (météo, effectif, notes, entrées chronologiques).",
    inputSchema: {
      type: 'object',
      properties: {
        projectRef: { type: 'string' },
        from: { type: 'string', description: 'Date ISO' },
        to: { type: 'string', description: 'Date ISO' },
      },
      required: ['projectRef'],
    },
    zodSchema: z.object({ projectRef: z.string(), from: z.string().optional(), to: z.string().optional() }),
    resolve: async (input) => {
      const projectId = await resolveProjectId(input.projectRef);
      if (!projectId) return { error: 'Projet introuvable' };
      const where: any = { projectId };
      if (input.from || input.to) {
        where.reportDate = {};
        if (input.from) where.reportDate.gte = new Date(input.from);
        if (input.to) where.reportDate.lte = new Date(input.to);
      }
      const reports = await prisma.dailyReport.findMany({
        where, take: MAX_ROWS, orderBy: { reportDate: 'desc' },
        select: {
          reportDate: true, weather: true, workersPresent: true, generalNotes: true,
          entries: { take: 10, select: { entryTime: true, description: true } },
        },
      });
      return reports;
    },
  },
  {
    name: 'list_clients',
    description: 'Liste les clients existants, avec filtre optionnel par nom (recherche partielle). Utile pour retrouver le clientRef à donner à create_project.',
    inputSchema: {
      type: 'object',
      properties: { search: { type: 'string' } },
    },
    zodSchema: z.object({ search: z.string().optional() }),
    resolve: async (input) => {
      const where: any = {};
      if (input.search) where.name = { contains: input.search, mode: 'insensitive' };
      return prisma.client.findMany({
        where, take: MAX_ROWS, orderBy: { name: 'asc' },
        select: { id: true, name: true, contactName: true, email: true, phone: true },
      });
    },
  },
  {
    name: 'list_users',
    description: "Liste les utilisateurs actifs de l'équipe, avec filtre optionnel par rôle ou recherche sur le nom. Utile pour retrouver le userRef d'une personne (chauffeur, membre d'équipe, responsable...).",
    inputSchema: {
      type: 'object',
      properties: {
        role: { type: 'string', description: 'admin, project_manager, site_manager, technical_manager, engineer, worker, warehouse, sales_engineer, installer...' },
        search: { type: 'string' },
      },
    },
    zodSchema: z.object({ role: z.string().optional(), search: z.string().optional() }),
    resolve: async (input) => {
      const where: any = { isActive: true };
      if (input.role) where.role = input.role;
      if (input.search) where.OR = [
        { firstName: { contains: input.search, mode: 'insensitive' } },
        { lastName: { contains: input.search, mode: 'insensitive' } },
      ];
      return prisma.user.findMany({
        where, take: MAX_ROWS, orderBy: { lastName: 'asc' },
        select: { id: true, firstName: true, lastName: true, role: true, email: true },
      });
    },
  },

  // ═══════════════════════════════════════════════════════════════
  // ÉCRITURE — chaque resolve() reprend la logique déjà écrite dans la route
  // REST correspondante (voir commentaire par tool). Le prompt système impose
  // une confirmation conversationnelle avant tout appel réel de ces tools.
  // ═══════════════════════════════════════════════════════════════
  {
    // Reprend src/routes/clients.ts POST /
    name: 'create_client',
    description: "Crée un nouveau client. À utiliser seulement après confirmation explicite de l'utilisateur.",
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        contactName: { type: 'string' },
        email: { type: 'string' },
        phone: { type: 'string' },
        address: { type: 'string' },
      },
      required: ['name'],
    },
    zodSchema: z.object({
      name: z.string().min(1),
      contactName: z.string().optional(),
      email: z.string().optional(),
      phone: z.string().optional(),
      address: z.string().optional(),
    }),
    resolve: async (input, user) => {
      const client = await prisma.client.create({
        data: {
          name: input.name.trim(),
          contactName: input.contactName || null,
          email: input.email || null,
          phone: input.phone || null,
          address: input.address || null,
        },
      });
      logger.info(`[assistant] create_client par ${user.id} -> ${client.id} (${client.name})`);
      return { id: client.id, name: client.name };
    },
  },
  {
    // Reprend src/routes/projects.ts POST /
    name: 'create_project',
    description: "Crée un nouveau projet. À utiliser seulement après confirmation explicite de l'utilisateur, une fois toutes les infos obligatoires réunies (nom, client, adresse, dates d'installation). Si le client n'existe pas encore, utilise create_client avant.",
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        clientRef: { type: 'string', description: 'id ou nom du client (utilise list_clients pour le retrouver)' },
        address: { type: 'string' },
        city: { type: 'string' },
        installationStart: { type: 'string', description: 'Date ISO' },
        installationEnd: { type: 'string', description: 'Date ISO' },
        dismantlingStart: { type: 'string', description: 'Date ISO (optionnel)' },
        dismantlingEnd: { type: 'string', description: 'Date ISO (optionnel)' },
        workersCount: { type: 'number' },
        description: { type: 'string' },
        technicalManagerRef: { type: 'string', description: 'id, email ou nom du responsable technique (optionnel)' },
      },
      required: ['name', 'clientRef', 'address', 'installationStart', 'installationEnd'],
    },
    zodSchema: z.object({
      name: z.string().min(1),
      clientRef: z.string(),
      address: z.string().min(1),
      city: z.string().optional(),
      installationStart: z.string(),
      installationEnd: z.string(),
      dismantlingStart: z.string().optional(),
      dismantlingEnd: z.string().optional(),
      workersCount: z.number().optional(),
      description: z.string().optional(),
      technicalManagerRef: z.string().optional(),
    }),
    resolve: async (input, user) => {
      const clientId = await resolveClientRef(input.clientRef);
      if (!clientId) return { error: `Client introuvable : ${input.clientRef}. Utilise list_clients ou create_client d'abord.` };
      let technicalManagerId: string | undefined;
      if (input.technicalManagerRef) {
        technicalManagerId = await resolveUserRef(input.technicalManagerRef);
        if (!technicalManagerId) return { error: `Responsable technique introuvable : ${input.technicalManagerRef}` };
      }
      const project = await prisma.project.create({
        data: {
          name: input.name,
          clientId,
          address: input.address,
          city: input.city || null,
          installationStart: new Date(input.installationStart),
          installationEnd: new Date(input.installationEnd),
          dismantlingStart: input.dismantlingStart ? new Date(input.dismantlingStart) : null,
          dismantlingEnd: input.dismantlingEnd ? new Date(input.dismantlingEnd) : null,
          workersCount: input.workersCount || 0,
          description: input.description || null,
          technicalManagerId: technicalManagerId || null,
          createdById: user.id,
          internalNumber: `VEM-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`,
        },
      });
      logger.info(`[assistant] create_project par ${user.id} -> ${project.id} (${project.internalNumber})`);
      return { id: project.id, internalNumber: project.internalNumber, name: project.name };
    },
  },
  {
    // Reprend src/routes/projects.ts POST /:id/team
    name: 'add_project_team_member',
    description: "Ajoute un membre à l'équipe d'un projet.",
    inputSchema: {
      type: 'object',
      properties: {
        projectRef: { type: 'string' },
        userRef: { type: 'string', description: 'id, email ou nom du membre' },
        role: { type: 'string', description: 'rôle sur le projet, ex: site_manager, engineer, installer...' },
        isLead: { type: 'boolean' },
        phase: { type: 'string', description: "'installation', 'dismantling' ou 'both' (défaut)" },
      },
      required: ['projectRef', 'userRef', 'role'],
    },
    zodSchema: z.object({
      projectRef: z.string(),
      userRef: z.string(),
      role: z.string(),
      isLead: z.boolean().optional(),
      phase: z.string().optional(),
    }),
    resolve: async (input, user) => {
      const projectId = await resolveProjectId(input.projectRef);
      if (!projectId) return { error: 'Projet introuvable' };
      const userId = await resolveUserRef(input.userRef);
      if (!userId) return { error: `Utilisateur introuvable : ${input.userRef}` };
      try {
        const member = await prisma.projectTeam.create({
          data: { projectId, userId, role: input.role, isLead: input.isLead || false, phase: input.phase || 'both' },
          include: { user: { select: { firstName: true, lastName: true } } },
        });
        logger.info(`[assistant] add_project_team_member par ${user.id} -> project=${projectId} user=${userId}`);
        return member;
      } catch (e: any) {
        if (e.code === 'P2002') return { error: 'Ce membre est déjà dans l\'équipe du projet' };
        throw e;
      }
    },
  },
  {
    // Reprend src/routes/projects.ts POST /:id/trucks (y compris les effets de bord Telegram/entrepôt)
    name: 'create_truck',
    description: "Ajoute un véhicule (camion, grue, nacelle...) sur un projet.",
    inputSchema: {
      type: 'object',
      properties: {
        projectRef: { type: 'string' },
        vehicleType: { type: 'string', description: "ex: truck, crane, lift... défaut 'truck'" },
        truckNumber: { type: 'string' },
        licensePlate: { type: 'string' },
        driverName: { type: 'string' },
        driverPhone: { type: 'string' },
        status: { type: 'string', description: "planned, confirmed... défaut 'planned'" },
        loadingDate: { type: 'string', description: 'Date ISO' },
        arrivalDate: { type: 'string', description: 'Date ISO' },
        departureDate: { type: 'string', description: 'Date ISO' },
        loadingLocation: { type: 'string' },
        unloadingLocation: { type: 'string' },
        notes: { type: 'string' },
      },
      required: ['projectRef'],
    },
    zodSchema: z.object({
      projectRef: z.string(),
      vehicleType: z.string().optional(),
      truckNumber: z.string().optional(),
      licensePlate: z.string().optional(),
      driverName: z.string().optional(),
      driverPhone: z.string().optional(),
      status: z.string().optional(),
      loadingDate: z.string().optional(),
      arrivalDate: z.string().optional(),
      departureDate: z.string().optional(),
      loadingLocation: z.string().optional(),
      unloadingLocation: z.string().optional(),
      notes: z.string().optional(),
    }),
    resolve: async (input, user) => {
      const projectId = await resolveProjectId(input.projectRef);
      if (!projectId) return { error: 'Projet introuvable' };
      const truck = await prisma.truck.create({
        data: {
          projectId,
          vehicleType: input.vehicleType || 'truck',
          truckNumber: input.truckNumber || null,
          licensePlate: input.licensePlate || null,
          driverName: input.driverName || null,
          driverPhone: input.driverPhone || null,
          status: input.status || 'planned',
          loadingDate: input.loadingDate ? new Date(input.loadingDate) : null,
          arrivalDate: input.arrivalDate ? new Date(input.arrivalDate) : null,
          departureDate: input.departureDate ? new Date(input.departureDate) : null,
          loadingLocation: input.loadingLocation || null,
          unloadingLocation: input.unloadingLocation || null,
          notes: input.notes || null,
        } as any,
      });
      logger.info(`[assistant] create_truck par ${user.id} -> ${truck.id} on project=${projectId}`);
      prisma.project.findUnique({
        where: { id: projectId },
        select: { id: true, name: true, internalNumber: true, address: true },
      }).then(project => {
        if (!project) return;
        notifyTubizeTruckMovement(truck, project, 'created').catch(() => {});
        createWarehouseTask(truck, project).catch(() => {});
      }).catch(() => {});
      return truck;
    },
  },
  {
    // Reprend src/routes/teamBookings.ts POST /projects/:projectId/bookings
    name: 'create_team_booking',
    description: "Réserve un trajet (aller/retour) pour un membre d'équipe sur un projet.",
    inputSchema: {
      type: 'object',
      properties: {
        projectRef: { type: 'string' },
        userRef: { type: 'string' },
        phase: { type: 'string', description: "'installation' ou 'dismantling'" },
        onSiteStart: { type: 'string', description: 'Date ISO' },
        onSiteEnd: { type: 'string', description: 'Date ISO' },
        outboundMode: { type: 'string' },
        outboundDate: { type: 'string' },
        outboundDetails: { type: 'string' },
        returnMode: { type: 'string' },
        returnDate: { type: 'string' },
        returnDetails: { type: 'string' },
        notes: { type: 'string' },
      },
      required: ['projectRef', 'userRef', 'phase', 'onSiteStart', 'onSiteEnd'],
    },
    zodSchema: z.object({
      projectRef: z.string(),
      userRef: z.string(),
      phase: z.enum(['installation', 'dismantling']),
      onSiteStart: z.string(),
      onSiteEnd: z.string(),
      outboundMode: z.string().optional(),
      outboundDate: z.string().optional(),
      outboundDetails: z.string().optional(),
      returnMode: z.string().optional(),
      returnDate: z.string().optional(),
      returnDetails: z.string().optional(),
      notes: z.string().optional(),
    }),
    resolve: async (input, user) => {
      const projectId = await resolveProjectId(input.projectRef);
      if (!projectId) return { error: 'Projet introuvable' };
      const userId = await resolveUserRef(input.userRef);
      if (!userId) return { error: `Utilisateur introuvable : ${input.userRef}` };
      const booking = await prisma.teamBooking.create({
        data: {
          projectId,
          userId,
          phase: input.phase,
          onSiteStart: new Date(input.onSiteStart),
          onSiteEnd: new Date(input.onSiteEnd),
          outboundMode: input.outboundMode || null,
          outboundDate: input.outboundDate ? new Date(input.outboundDate) : null,
          outboundDetails: input.outboundDetails || null,
          returnMode: input.returnMode || null,
          returnDate: input.returnDate ? new Date(input.returnDate) : null,
          returnDetails: input.returnDetails || null,
          notes: input.notes || null,
        },
        include: { user: { select: { firstName: true, lastName: true } } },
      });
      logger.info(`[assistant] create_team_booking par ${user.id} -> ${booking.id} on project=${projectId}`);
      return booking;
    },
  },
  {
    // Reprend src/routes/teamBookings.ts POST /projects/:projectId/hotel-bookings
    name: 'create_hotel_booking',
    description: "Crée une réservation d'hôtel partagée pour un ou plusieurs membres d'équipe sur un projet.",
    inputSchema: {
      type: 'object',
      properties: {
        projectRef: { type: 'string' },
        hotelName: { type: 'string' },
        hotelAddress: { type: 'string' },
        checkin: { type: 'string', description: 'Date ISO' },
        checkout: { type: 'string', description: 'Date ISO' },
        phase: { type: 'string', description: "'installation' ou 'dismantling'" },
        userRefs: { type: 'array', items: { type: 'string' }, description: 'id, email ou nom des occupants (au moins 1)' },
        reference: { type: 'string' },
        notes: { type: 'string' },
      },
      required: ['projectRef', 'hotelName', 'checkin', 'checkout', 'phase', 'userRefs'],
    },
    zodSchema: z.object({
      projectRef: z.string(),
      hotelName: z.string().min(1),
      hotelAddress: z.string().optional(),
      checkin: z.string(),
      checkout: z.string(),
      phase: z.enum(['installation', 'dismantling']),
      userRefs: z.array(z.string()).min(1),
      reference: z.string().optional(),
      notes: z.string().optional(),
    }),
    resolve: async (input, user) => {
      const projectId = await resolveProjectId(input.projectRef);
      if (!projectId) return { error: 'Projet introuvable' };
      const userIds: string[] = [];
      for (const ref of input.userRefs) {
        const id = await resolveUserRef(ref);
        if (!id) return { error: `Utilisateur introuvable : ${ref}` };
        userIds.push(id);
      }
      const hotel = await prisma.hotelBooking.create({
        data: {
          projectId,
          phase: input.phase,
          hotelName: input.hotelName,
          hotelAddress: input.hotelAddress || null,
          checkin: new Date(input.checkin),
          checkout: new Date(input.checkout),
          reference: input.reference || null,
          notes: input.notes || null,
          occupants: { create: userIds.map(uid => ({ userId: uid })) },
        },
        include: { occupants: { include: { user: { select: { firstName: true, lastName: true } } } } },
      });
      logger.info(`[assistant] create_hotel_booking par ${user.id} -> ${hotel.id} on project=${projectId}`);
      return hotel;
    },
  },
  {
    // Reprend src/routes/tasks.ts POST /
    name: 'create_task',
    description: 'Crée une tâche sur un projet.',
    inputSchema: {
      type: 'object',
      properties: {
        projectRef: { type: 'string' },
        title: { type: 'string' },
        description: { type: 'string' },
        taskDate: { type: 'string', description: 'Date ISO (défaut aujourd\'hui)' },
        status: { type: 'string', description: 'todo, in_progress, done, blocked, cancelled (défaut todo)' },
        priority: { type: 'string', description: 'low, normal, high, critical (défaut normal)' },
        assignedToRef: { type: 'string', description: 'id, email ou nom de la personne assignée' },
      },
      required: ['projectRef', 'title'],
    },
    zodSchema: z.object({
      projectRef: z.string(),
      title: z.string().min(1),
      description: z.string().optional(),
      taskDate: z.string().optional(),
      status: z.string().optional(),
      priority: z.string().optional(),
      assignedToRef: z.string().optional(),
    }),
    resolve: async (input, user) => {
      const projectId = await resolveProjectId(input.projectRef);
      if (!projectId) return { error: 'Projet introuvable' };
      let assignedToId: string | undefined;
      if (input.assignedToRef) {
        assignedToId = await resolveUserRef(input.assignedToRef);
        if (!assignedToId) return { error: `Utilisateur introuvable : ${input.assignedToRef}` };
      }
      const task = await prisma.task.create({
        data: {
          projectId,
          title: input.title,
          description: input.description || null,
          taskDate: input.taskDate ? new Date(input.taskDate) : new Date(),
          status: (input.status as any) || undefined,
          priority: (input.priority as any) || undefined,
          assignedToId: assignedToId || null,
          createdById: user.id,
        },
        include: { assignedTo: { select: { firstName: true, lastName: true } } },
      });
      logger.info(`[assistant] create_task par ${user.id} -> ${task.id} on project=${projectId}`);
      return task;
    },
  },
  {
    // Reprend src/routes/tickets.ts POST /
    name: 'create_ticket',
    description: 'Crée un ticket (incident/demande), lié ou non à un projet.',
    inputSchema: {
      type: 'object',
      properties: {
        projectRef: { type: 'string', description: 'optionnel' },
        title: { type: 'string' },
        description: { type: 'string' },
        urgency: { type: 'string', description: 'low, medium, high, critical (défaut medium)' },
        assignedToRef: { type: 'string' },
        plannedDate: { type: 'string', description: 'Date ISO' },
      },
      required: ['title', 'description'],
    },
    zodSchema: z.object({
      projectRef: z.string().optional(),
      title: z.string().min(1),
      description: z.string().min(1),
      urgency: z.string().optional(),
      assignedToRef: z.string().optional(),
      plannedDate: z.string().optional(),
    }),
    resolve: async (input, user) => {
      let projectId: string | undefined;
      if (input.projectRef) {
        projectId = await resolveProjectId(input.projectRef);
        if (!projectId) return { error: 'Projet introuvable' };
      }
      let assignedToId: string | undefined;
      if (input.assignedToRef) {
        assignedToId = await resolveUserRef(input.assignedToRef);
        if (!assignedToId) return { error: `Utilisateur introuvable : ${input.assignedToRef}` };
      }
      const ticket = await prisma.ticket.create({
        data: {
          projectId: projectId || null,
          title: input.title,
          description: input.description,
          urgency: (input.urgency as any) || undefined,
          assignedToId: assignedToId || null,
          reportedById: user.id,
          status: assignedToId ? 'assigned' : 'open',
          plannedDate: input.plannedDate ? new Date(input.plannedDate) : null,
        },
        include: {
          project: { select: { name: true, internalNumber: true } },
          assignedTo: { select: { firstName: true, lastName: true } },
        },
      });
      await prisma.ticketHistory.create({ data: { ticketId: ticket.id, changedById: user.id, newStatus: ticket.status as any, comment: 'Ticket créé via assistant IA' } });
      logger.info(`[assistant] create_ticket par ${user.id} -> ${ticket.id}`);
      return ticket;
    },
  },
  {
    // Reprend src/routes/dailyReports.ts POST /
    name: 'create_daily_report',
    description: "Crée un rapport journalier pour un projet (en-tête + entrées chronologiques, sans photos).",
    inputSchema: {
      type: 'object',
      properties: {
        projectRef: { type: 'string' },
        reportDate: { type: 'string', description: 'Date ISO' },
        weather: { type: 'string' },
        workersPresent: { type: 'number' },
        generalNotes: { type: 'string' },
        entries: {
          type: 'array',
          description: 'Entrées chronologiques de la journée',
          items: {
            type: 'object',
            properties: { entryTime: { type: 'string' }, description: { type: 'string' } },
            required: ['description'],
          },
        },
      },
      required: ['projectRef', 'reportDate'],
    },
    zodSchema: z.object({
      projectRef: z.string(),
      reportDate: z.string(),
      weather: z.string().optional(),
      workersPresent: z.number().optional(),
      generalNotes: z.string().optional(),
      entries: z.array(z.object({ entryTime: z.string().optional(), description: z.string() })).optional(),
    }),
    resolve: async (input, user) => {
      const projectId = await resolveProjectId(input.projectRef);
      if (!projectId) return { error: 'Projet introuvable' };
      const report = await prisma.dailyReport.create({
        data: {
          projectId,
          createdById: user.id,
          reportDate: new Date(input.reportDate),
          weather: input.weather || null,
          workersPresent: input.workersPresent || 0,
          generalNotes: input.generalNotes || null,
          entries: { create: input.entries || [] },
        },
        include: { entries: true },
      });
      logger.info(`[assistant] create_daily_report par ${user.id} -> ${report.id} on project=${projectId}`);
      return report;
    },
  },
  {
    name: 'generate_project_report',
    description: "Génère un rapport complet et détaillé sur un projet (avancement, équipe, logistique, tâches, tickets, rapports journaliers, synthèse). Utilise cet outil dès que l'utilisateur demande un rapport, un bilan ou une synthèse complète sur un projet — ne récapitule pas les résultats des autres tools de lecture à la place.",
    inputSchema: {
      type: 'object',
      properties: { projectRef: { type: 'string' } },
      required: ['projectRef'],
    },
    zodSchema: z.object({ projectRef: z.string() }),
    resolve: async (input) => {
      const projectId = await resolveProjectId(input.projectRef);
      if (!projectId) return { error: 'Projet introuvable' };
      const report = await generateProjectReport(projectId);
      return { text: report.text, projectId };
    },
  },
];

function systemPrompt(user: AssistantUser): string {
  const today = new Date().toISOString().split('T')[0];
  return `Tu es l'assistant interne de VEM (Viewbox Event Manager), un outil de gestion de projets d'installation événementielle.
Date du jour : ${today}.
Utilisateur : ${user.firstName} ${user.lastName} (rôle : ${user.role}).

Tu peux à la fois LIRE des données (projets, tâches, tickets, camions, bookings, rapports journaliers, clients, utilisateurs) et désormais CRÉER des choses (nouveau projet, nouveau client, camion, booking transport, booking hôtel, tâche, ticket, rapport journalier, membre d'équipe) via les outils fournis. Tu peux aussi générer un rapport complet sur un projet avec generate_project_report.

Règles impératives sur la lecture :
- Tu n'as PAS de connaissance directe des projets/tâches/tickets — utilise TOUJOURS les outils fournis pour aller chercher les données réelles avant de répondre.
- Ne réponds JAMAIS en inventant une donnée absente des résultats d'outils. Si les outils ne donnent pas la réponse, dis-le clairement.
- Si la question est ambiguë (plusieurs projets/personnes possibles), utilise list_projects/list_users/list_clients pour clarifier plutôt que de deviner.

Règles impératives sur l'écriture (create_*, add_*) — CONFIRMATION OBLIGATOIRE :
- Avant TOUT appel à un outil d'écriture, réponds d'abord en texte SIMPLE (sans appeler l'outil) en récapitulant précisément ce que tu t'apprêtes à créer : quel type d'élément, sur quel projet, avec quelles valeurs. Termine par une question explicite ("Je confirme la création ?").
- N'appelle l'outil d'écriture QUE si ton message précédent était bien ce récapitulatif ET que le nouveau message de l'utilisateur confirme sans ambiguïté (oui, confirme, vas-y, c'est bon...). Si l'utilisateur corrige un détail, récapitule à nouveau avec la correction avant de créer.
- S'il manque une information obligatoire (ex: client pour un nouveau projet), demande-la ou utilise un outil de lecture pour la retrouver — n'invente jamais une valeur, un id, une date.
- Après une création réussie, confirme clairement ce qui a été créé (nom, numéro interne ou identifiant lisible) pour que l'utilisateur puisse vérifier dans l'application.
- N'enchaîne jamais plusieurs créations différentes dans le même tour sans confirmation séparée, sauf si l'utilisateur a explicitement demandé et confirmé un lot précis d'actions.

Réponds toujours en français, de façon concise et concrète (liste à puces si utile), en citant les éléments concrets trouvés ou créés (n° de projet, dates, noms).`;
}

export interface AssistantResult {
  answer: string;
  toolCalls: Array<{ name: string; input: any }>;
  reportProjectId?: string;
}

export async function askAssistant(
  question: string,
  user: AssistantUser,
  history: Array<{ role: 'user' | 'assistant'; text: string }> = []
): Promise<AssistantResult> {
  const messages: Array<{ role: 'user' | 'assistant'; content: any }> = [
    ...history.slice(-12).map(h => ({ role: h.role, content: h.text })),
    { role: 'user', content: question },
  ];
  const toolCalls: AssistantResult['toolCalls'] = [];
  const tools = TOOLS.map(t => ({ name: t.name, description: t.description, input_schema: t.inputSchema }));

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    const data = await anthropicRequest(
      {
        max_tokens: 1500,
        system: systemPrompt(user),
        tools,
        messages,
      },
      { timeoutMs: 30000, retries: 1 }
    );

    const content: any[] = data.content || [];
    const toolUses = content.filter(b => b.type === 'tool_use');

    if (toolUses.length === 0) {
      const answer = content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
      return { answer: answer || "Je n'ai pas pu formuler de réponse.", toolCalls };
    }

    messages.push({ role: 'assistant', content });

    const toolResults = [];
    for (const use of toolUses) {
      const tool = TOOLS.find(t => t.name === use.name);
      let resultPayload: any;
      if (!tool) {
        resultPayload = { error: `Outil inconnu : ${use.name}` };
      } else {
        const parsedInput = tool.zodSchema.safeParse(use.input || {});
        if (!parsedInput.success) {
          resultPayload = { error: `Paramètres invalides : ${parsedInput.error.message}` };
        } else {
          try {
            resultPayload = await tool.resolve(parsedInput.data, user);
          } catch (e: any) {
            logger.error(`[assistant] tool ${use.name} a échoué : ${e.message || e}`);
            resultPayload = { error: 'Erreur lors de l\'exécution de l\'action' };
          }
        }
        toolCalls.push({ name: use.name, input: use.input });
      }
      toolResults.push({
        type: 'tool_result',
        tool_use_id: use.id,
        content: JSON.stringify(resultPayload ?? null).slice(0, 8000),
      });

      // Cas particulier : le rapport de projet est déjà entièrement rédigé
      // (données réelles + une seule synthèse IA anti-hallucination). On le
      // renvoie tel quel plutôt que de laisser un second passage LLM le
      // reformuler et risquer de fausser des chiffres exacts.
      if (use.name === 'generate_project_report' && resultPayload && !resultPayload.error) {
        return { answer: resultPayload.text, toolCalls, reportProjectId: resultPayload.projectId };
      }
    }
    messages.push({ role: 'user', content: toolResults });
  }

  throw new AppError("L'assistant n'a pas pu conclure (trop d'étapes nécessaires) — reformule ta question.", 502);
}
