import { prisma } from '../config/database';
// Explicit projection: never serialize user records, internal identifiers or credentials wholesale.
export async function briefingSources(projectId: string) {
  const p = await prisma.project.findUnique({ where: { id: projectId }, include: {
    client: { include: { contacts: true } }, trucks: true, files: true,
    team: { include: { user: { select: { firstName:true, lastName:true, phone:true, email:true } } } },
    tasks: { include: { assignedTo: { select: { firstName:true, lastName:true } } } },
    checklists: { include: { items: { include: { photos:true } } } },
  } });
  if (!p) throw new Error('Projet introuvable');
  const sources: any[] = [];
  const add = (kind: string, id: string, block: string, title: string, data: any) => sources.push({ kind, id, block, title,
    fields: Object.fromEntries(Object.entries(data).map(([k,v]) => [k, v instanceof Date ? v.toISOString() : String(v ?? '')])) });
  add('project', p.id, 'summary', p.name, { name:p.name, client:p.client.name, address:[p.address,p.city].filter(Boolean).join(', '), description:p.description || p.scope,
    installationStart:p.installationStart, installationEnd:p.installationEnd, dismantlingStart:p.dismantlingStart, dismantlingEnd:p.dismantlingEnd,
    instructions:p.specialInstructions, installationNotes:p.installNotes, dismantlingNotes:p.dismantleNotes });
  for (const t of p.tasks) add('task',t.id,'tasks',t.title,{ title:t.title, description:t.description, stage:t.stage, date:t.taskDate, start:t.startTime,end:t.endTime,
    responsible:t.assignedTo ? t.assignedTo.firstName+' '+t.assignedTo.lastName : '', assignedToId:t.assignedToId, priority:t.priority, status:t.status });
  for (const c of p.checklists) for (const i of c.items) add('checklist',i.id,'quality',i.label,{ title:i.label, phase:c.phase, category:i.categoryName, status:i.status,
    critical:i.critical, photoRequired:i.photoRequired, comment:i.comment, hint:i.hint, evidenceCount:i.photos.length, checkedAt:i.checkedAt });
  for (const t of p.trucks) add('truck',t.id,'deliveries',t.truckNumber || t.licensePlate || 'Livraison',{ title:t.truckNumber, plate:t.licensePlate, driver:t.driverName,
    phone:t.driverPhone, arrival:t.arrivalDate, departure:t.departureDate, loading:t.loadingDate, location:t.unloadingLocation, notes:t.notes, status:t.status });
  for (const c of p.client.contacts) add('contact',c.id,'contacts',c.name,{ name:c.name, role:c.role, phone:c.phone,email:c.email });
  for (const t of p.team) add('team',t.id,'team',t.user.firstName+' '+t.user.lastName,{ name:t.user.firstName+' '+t.user.lastName,role:t.role,phase:t.phase,phone:t.user.phone,email:t.user.email });
  for (const f of p.files) add('file',f.id,/\.pdf(?:\?|$)/i.test(f.fileUrl) ? 'plan' : 'photo',f.fileName,{ name:f.fileName,url:f.fileUrl });
  return sources;
}
