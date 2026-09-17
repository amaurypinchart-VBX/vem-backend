// src/services/projectReportService.ts
// Génère un rapport complet sur un projet : chiffres et faits réels (Prisma)
// assemblés en code, complétés par une seule synthèse rédigée par l'IA à partir
// de ces mêmes données (même principe anti-hallucination que briefingAI.ts —
// jamais l'inverse : l'IA ne doit jamais être la source d'un chiffre ou d'un nom).

import { prisma } from '../config/database';
import { AppError } from '../utils/AppError';
import { callClaude } from './aiService';

function fmtDate(d: Date | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

export async function gatherProjectReportData(projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      client: true,
      technicalManager: { select: { firstName: true, lastName: true, email: true, phone: true } },
      team: { include: { user: { select: { firstName: true, lastName: true, role: true } } } },
      trucks: { orderBy: { loadingDate: 'asc' } },
      teamBookings: { include: { user: { select: { firstName: true, lastName: true } } }, orderBy: { onSiteStart: 'asc' } },
      hotelBookings: {
        include: { occupants: { include: { user: { select: { firstName: true, lastName: true } } } } },
        orderBy: { checkin: 'asc' },
      },
    },
  });
  if (!project) throw new AppError('Projet introuvable', 404);

  const [tasksTotal, tasksDone, tasksOverdue, taskList] = await Promise.all([
    prisma.task.count({ where: { projectId } }),
    prisma.task.count({ where: { projectId, status: 'done' } }),
    prisma.task.count({ where: { projectId, status: { notIn: ['done', 'cancelled'] }, taskDate: { lt: new Date() } } }),
    prisma.task.findMany({
      where: { projectId }, orderBy: { taskDate: 'asc' }, take: 50,
      select: { title: true, status: true, priority: true, taskDate: true, assignedTo: { select: { firstName: true, lastName: true } } },
    }),
  ]);

  const [ticketsTotal, ticketsOpen, ticketsCritical, ticketList] = await Promise.all([
    prisma.ticket.count({ where: { projectId } }),
    prisma.ticket.count({ where: { projectId, status: { in: ['open', 'assigned', 'in_progress'] } } }),
    prisma.ticket.count({ where: { projectId, urgency: 'critical', status: { not: 'closed' } } }),
    prisma.ticket.findMany({
      where: { projectId }, orderBy: [{ urgency: 'desc' }, { createdAt: 'desc' }], take: 30,
      select: { title: true, status: true, urgency: true, createdAt: true },
    }),
  ]);

  const dailyReports = await prisma.dailyReport.findMany({
    where: { projectId }, orderBy: { reportDate: 'desc' }, take: 20,
    select: { reportDate: true, weather: true, workersPresent: true, generalNotes: true },
  });

  return {
    project,
    client: project.client,
    technicalManager: project.technicalManager,
    team: project.team,
    trucks: project.trucks,
    teamBookings: project.teamBookings,
    hotelBookings: project.hotelBookings,
    tasks: { total: tasksTotal, done: tasksDone, overdue: tasksOverdue, list: taskList },
    tickets: { total: ticketsTotal, open: ticketsOpen, critical: ticketsCritical, list: ticketList },
    dailyReports,
  };
}

export type ProjectReportData = Awaited<ReturnType<typeof gatherProjectReportData>>;

function buildStructuredSections(data: ProjectReportData): string {
  const p = data.project;
  const lines: string[] = [];
  lines.push(`# Rapport projet — ${p.name} (${p.internalNumber})`);
  lines.push('');
  lines.push(`Statut : ${p.status}`);
  lines.push(`Client : ${data.client?.name || 'non renseigné'}`);
  lines.push(`Adresse : ${p.address}${p.city ? ', ' + p.city : ''}`);
  lines.push(`Installation : ${fmtDate(p.installationStart)} → ${fmtDate(p.installationEnd)}`);
  if (p.dismantlingStart) lines.push(`Démontage : ${fmtDate(p.dismantlingStart)} → ${fmtDate(p.dismantlingEnd)}`);
  lines.push(`Responsable technique : ${data.technicalManager ? `${data.technicalManager.firstName} ${data.technicalManager.lastName}` : 'non assigné'}`);
  lines.push('');

  lines.push(`## Équipe (${data.team.length})`);
  if (data.team.length === 0) lines.push('Aucun membre assigné.');
  for (const m of data.team) lines.push(`- ${m.user.firstName} ${m.user.lastName} — ${m.role}${m.isLead ? ' (lead)' : ''}`);
  lines.push('');

  lines.push('## Logistique');
  lines.push(`Véhicules planifiés : ${data.trucks.length}`);
  for (const truck of data.trucks) {
    lines.push(`- ${truck.vehicleType || 'véhicule'} ${truck.truckNumber || ''} — chauffeur ${truck.driverName || '?'} — statut ${truck.status}${truck.loadingDate ? ', chargement ' + fmtDate(truck.loadingDate) : ''}`);
  }
  lines.push(`Trajets équipe réservés : ${data.teamBookings.length}`);
  lines.push(`Réservations hôtel : ${data.hotelBookings.length}`);
  for (const hotel of data.hotelBookings) {
    const occupants = hotel.occupants.map(o => `${o.user.firstName} ${o.user.lastName}`).join(', ') || 'sans occupant';
    lines.push(`- ${hotel.hotelName} (${fmtDate(hotel.checkin)} → ${fmtDate(hotel.checkout)}) — ${occupants}`);
  }
  lines.push('');

  lines.push('## Tâches');
  lines.push(`${data.tasks.done} / ${data.tasks.total} terminées, ${data.tasks.overdue} en retard.`);
  lines.push('');

  lines.push('## Tickets');
  lines.push(`${data.tickets.total} au total, ${data.tickets.open} ouverts, ${data.tickets.critical} critiques non résolus.`);
  for (const ticket of data.tickets.list.slice(0, 15)) {
    lines.push(`- ${ticket.title} [${ticket.urgency}/${ticket.status}]`);
  }
  lines.push('');

  lines.push('## Rapports journaliers');
  lines.push(`${data.dailyReports.length} rapport(s) récent(s) disponible(s).`);

  return lines.join('\n');
}

async function synthesizeNarrative(data: ProjectReportData): Promise<string> {
  const p = data.project;
  const criticalTickets = data.tickets.list.filter(t => t.urgency === 'critical' && t.status !== 'closed').map(t => t.title);

  const prompt = `Tu rédiges la synthèse d'un rapport de suivi pour un projet d'installation événementielle (Viewbox). Ton professionnel, concret, orienté action.

Données réelles du projet :
- Nom : ${p.name} (${p.internalNumber}), statut : ${p.status}
- Client : ${data.client?.name || 'non renseigné'}
- Installation : ${fmtDate(p.installationStart)} → ${fmtDate(p.installationEnd)}
- Équipe assignée : ${data.team.length} membre(s)
- Véhicules planifiés : ${data.trucks.length}
- Hôtels réservés : ${data.hotelBookings.length}
- Tâches : ${data.tasks.done}/${data.tasks.total} terminées, ${data.tasks.overdue} en retard
- Tickets : ${data.tickets.total} au total, ${data.tickets.open} ouverts, ${data.tickets.critical} critiques non résolus
- Rapports journaliers disponibles : ${data.dailyReports.length}
${criticalTickets.length ? `- Tickets critiques en cours : ${criticalTickets.join(', ')}` : ''}

Rédige en français, en 4 courts paragraphes maximum :
1. État d'avancement général du projet.
2. Points d'attention / risques identifiés à partir des données ci-dessus (tickets critiques, tâches en retard, logistique incomplète...). S'il n'y a rien d'alarmant, dis-le.
3. Synthèse logistique (équipe, transport, hébergement).
4. Recommandations concrètes pour la suite.

Règles impératives : n'invente JAMAIS un fait, un nom ou un chiffre absent des données ci-dessus. Si une information manque pour juger d'un point, dis-le simplement plutôt que de l'inventer.`;

  return callClaude({ maxTokens: 900, messages: [{ role: 'user', content: prompt }] });
}

export async function generateProjectReport(projectId: string): Promise<{ text: string; data: ProjectReportData; narrative: string }> {
  const data = await gatherProjectReportData(projectId);
  const narrative = await synthesizeNarrative(data);
  const structured = buildStructuredSections(data);
  const text = `${structured}\n\n## Synthèse\n${narrative}`;
  return { text, data, narrative };
}
