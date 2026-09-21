// src/services/taskHours.ts
// Heures par tâche générale, calculées directement à partir des lignes saisies
// par l'utilisateur dans les rapports journaliers (DailyReportTaskHours).
// Aucun appel IA ici : les heures et le nombre d'hommes sont exacts dès la
// saisie, ce module se contente d'agréger.

import { prisma } from '../config/database';

export interface ProjectTaskHourRow {
  reportId: string;
  reportDate: string;
  phase: string | null;
  taskTemplateId: string | null;
  taskTitle: string;
  categoryName: string | null;
  icon: string | null;
  color: string | null;
  hours: number;
  workers: number;
}

export async function getProjectTaskHours(projectId: string): Promise<ProjectTaskHourRow[]> {
  const rows = await prisma.dailyReportTaskHours.findMany({
    where: { report: { projectId } },
    include: {
      report: { select: { reportDate: true, phase: true } },
      taskTemplate: { include: { category: true } },
    },
    orderBy: [{ report: { reportDate: 'asc' } }, { sortOrder: 'asc' }],
  });

  return rows.map(r => ({
    reportId: r.reportId,
    reportDate: r.report.reportDate.toISOString(),
    phase: r.report.phase,
    taskTemplateId: r.taskTemplateId,
    taskTitle: r.taskTitle,
    categoryName: r.taskTemplate?.category?.name || null,
    icon: r.taskTemplate?.category?.icon || null,
    color: r.taskTemplate?.category?.color || null,
    hours: r.hours,
    workers: r.workers,
  }));
}
