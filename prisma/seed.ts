// prisma/seed.ts
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding VEM...');

  const h = (pwd: string) => bcrypt.hash(pwd, 12);

  // ── USERS ──────────────────────────────────────────────
  const amaury = await prisma.user.upsert({ where: { email: 'amaury.pinchart@vem.com' }, update: {}, create: { email: 'amaury.pinchart@vem.com', passwordHash: await h('VEM2025!'), firstName: 'Amaury', lastName: 'Pinchart', role: 'technical_manager', phone: '+32 477 000001' } });
  const jb     = await prisma.user.upsert({ where: { email: 'jeremy.berrutto@vem.com' }, update: {}, create: { email: 'jeremy.berrutto@vem.com', passwordHash: await h('VEM2025!'), firstName: 'Jeremy', lastName: 'Berrutto', role: 'site_manager', phone: '+32 477 000002' } });
  const jc     = await prisma.user.upsert({ where: { email: 'jeremy.cowski@vem.com' },   update: {}, create: { email: 'jeremy.cowski@vem.com',   passwordHash: await h('VEM2025!'), firstName: 'Jeremy', lastName: 'Cowski', role: 'site_manager' } });
  const bernie = await prisma.user.upsert({ where: { email: 'bernie@vem.com' },           update: {}, create: { email: 'bernie@vem.com',           passwordHash: await h('VEM2025!'), firstName: 'Bernie', lastName: 'Martin', role: 'site_manager' } });
  const norick = await prisma.user.upsert({ where: { email: 'norick.palm@vem.com' },     update: {}, create: { email: 'norick.palm@vem.com',     passwordHash: await h('VEM2025!'), firstName: 'Norick', lastName: 'Palm', role: 'engineer' } });
  const ignace = await prisma.user.upsert({ where: { email: 'ignace.gosens@vem.com' },   update: {}, create: { email: 'ignace.gosens@vem.com',   passwordHash: await h('VEM2025!'), firstName: 'Ignace', lastName: 'Gosens', role: 'engineer' } });
  const paul   = await prisma.user.upsert({ where: { email: 'paul.morel@vem.com' },      update: {}, create: { email: 'paul.morel@vem.com',      passwordHash: await h('VEM2025!'), firstName: 'Paul', lastName: 'Morel', role: 'engineer' } });
  const admin  = await prisma.user.upsert({ where: { email: 'admin@vem.com' },            update: {}, create: { email: 'admin@vem.com',            passwordHash: await h('Admin@VEM2025!'), firstName: 'Admin', lastName: 'VEM', role: 'admin' } });

  // ── CLIENTS ────────────────────────────────────────────
  const audi = await prisma.client.create({ data: { name: 'Audi Belgium', contactName: 'Marc Dupont', email: 'marc.dupont@audi.be', phone: '+32 476 123456', address: 'Avenue de la Joyeuse Entrée 1, 1040 Bruxelles' } });
  const bmw  = await prisma.client.create({ data: { name: 'BMW Brussels',  contactName: 'Sophie Lambert', email: 'slambert@bmw.be', phone: '+32 478 654321' } });

  // ── PROJECT 1 ──────────────────────────────────────────
  const proj1 = await prisma.project.create({ data: {
    internalNumber: 'VEM-2025-001',
    name: 'Salon Audi Bruxelles 2025',
    clientId: audi.id,
    status: 'installation',
    address: 'Rue du Trône 60, 1050 Bruxelles',
    city: 'Bruxelles',
    installationStart: new Date('2025-05-10'),
    installationEnd: new Date('2025-05-14'),
    dismantlingStart: new Date('2025-05-16'),
    dismantlingEnd: new Date('2025-05-17'),
    workersCount: 8,
    technicalManagerId: amaury.id,
    createdById: amaury.id,
    team: { create: [
      { userId: jb.id,     role: 'site_manager', isLead: true },
      { userId: norick.id, role: 'engineer' },
      { userId: ignace.id, role: 'engineer' },
      { userId: paul.id,   role: 'engineer' },
    ]},
    trucks: { create: [
      { truckNumber:'T01', licensePlate:'BE-421-XYZ', driverName:'Jean Dupont', loadingDate: new Date('2025-05-09T08:00:00'), arrivalDate: new Date('2025-05-10T07:30:00'), status:'delivered' },
      { truckNumber:'T02', licensePlate:'BE-782-ABC', driverName:'Marc Simon',  loadingDate: new Date('2025-05-11T07:00:00'), status:'in_transit' },
    ]},
  }});

  // Tasks
  const tasks = [
    { title:'Déchargement camion 1', taskDate: new Date('2025-05-10'), startTime:'07:30', endTime:'10:00', status:'done', priority:'high', assignedToId: norick.id },
    { title:'Installation façade Est', taskDate: new Date('2025-05-10'), startTime:'10:00', endTime:'14:00', status:'done', priority:'high', assignedToId: paul.id },
    { title:'Câblage électrique Zone A', taskDate: new Date('2025-05-11'), startTime:'08:00', endTime:'12:00', status:'done', priority:'critical', assignedToId: ignace.id },
    { title:'Déchargement camion 2', taskDate: new Date('2025-05-12'), startTime:'08:00', endTime:'10:00', status:'in_progress', priority:'normal', assignedToId: norick.id },
    { title:'Montage structure centrale', taskDate: new Date('2025-05-12'), startTime:'10:00', endTime:'16:00', status:'in_progress', priority:'high', assignedToId: jb.id },
    { title:'Câblage zone B', taskDate: new Date('2025-05-12'), startTime:'14:00', endTime:'17:00', status:'todo', priority:'normal', assignedToId: ignace.id },
    { title:'Raccordement électrique Nord', taskDate: new Date('2025-05-12'), startTime:'14:00', endTime:'17:00', status:'blocked', priority:'critical', assignedToId: paul.id },
    { title:'Signalétique entrée', taskDate: new Date('2025-05-13'), startTime:'09:00', endTime:'12:00', status:'todo', priority:'normal', assignedToId: paul.id },
  ];
  for (const t of tasks) await prisma.task.create({ data: { ...t as any, projectId: proj1.id, createdById: amaury.id } });

  // Tickets
  await prisma.ticket.create({ data: {
    projectId: proj1.id,
    title: 'Façade Nord — vis M6 manquantes',
    description: 'Sur la section 3 à 5, il manque ~12 vis M6×20. Panneaux instables.',
    urgency: 'critical', status: 'in_progress',
    locationOnSite: 'Façade Nord — Section 3 à 5',
    reportedById: jb.id, assignedToId: norick.id,
    plannedDate: new Date('2025-05-13'),
    history: { create: [{ changedById: jb.id, newStatus: 'open', comment: 'Ticket créé' }, { changedById: amaury.id, oldStatus: 'open', newStatus: 'in_progress', comment: 'Assigné à Norick' }] },
  }});
  await prisma.ticket.create({ data: {
    projectId: proj1.id,
    title: 'Éclairage Zone B — unité 3 défaillante',
    description: "L'unité LED n°3 ne s'allume pas. Driver probable.",
    urgency: 'medium', status: 'open',
    locationOnSite: 'Zone B — Baie 3',
    reportedById: jb.id,
    history: { create: [{ changedById: jb.id, newStatus: 'open', comment: 'Ticket créé' }] },
  }});

  // Warehouse box
  await prisma.warehouseBox.create({ data: {
    projectId: proj1.id,
    name: 'BOX 1 — Structure Principale',
    status: 'on_site',
    qrCode: 'BOX-001-VEM2025001',
    preparedById: norick.id,
    items: { create: [
      { productName:'Profilé alu 3m', quantity:20, unit:'pcs', isPresent:true, sortOrder:0 },
      { productName:'Connecteurs 90°', quantity:50, unit:'pcs', isPresent:true, sortOrder:1 },
      { productName:'Visserie M6×20', quantity:200, unit:'pcs', isPresent:false, notes:'Quantité insuffisante', sortOrder:2 },
    ]},
  }});

  // Toolbox
  await prisma.toolbox.create({ data: {
    name: 'Boîte à Outils #1',
    projectId: proj1.id,
    qrCode: 'TB-001-VEM2025001',
    preparedById: norick.id,
    drawers: { create: [
      { name:'Tiroir 1 — Visserie & Fixation', sortOrder:0, tools: { create: [
        { name:'Visseuse Bosch 18V', expectedQty:2, actualQty:2, isChecked:true },
        { name:'Embouts assortis', expectedQty:10, actualQty:10, isChecked:true },
        { name:'Niveau laser', expectedQty:1, actualQty:1, isChecked:true },
        { name:'Clé allen jeu complet', expectedQty:1, actualQty:0, status:'missing' },
      ]}},
      { name:'Tiroir 2 — Mesure', sortOrder:1, tools: { create: [
        { name:'Mètre ruban 5m', expectedQty:2, actualQty:2, isChecked:true },
        { name:'Équerre professionnelle', expectedQty:1, actualQty:1, isChecked:true },
      ]}},
    ]},
  }});

  // Daily report
  await prisma.dailyReport.create({ data: {
    projectId: proj1.id,
    reportDate: new Date('2025-05-12'),
    createdById: jb.id,
    weather: 'Ensoleillé',
    workersPresent: 8,
    generalNotes: 'Bonne progression malgré manque de visserie façade Nord.',
    entries: { create: [
      { entryTime:'07:30', description:'Arrivée équipe — 8 personnes. Météo : 18°C ensoleillé.' },
      { entryTime:'08:00', description:'Début déchargement camion 2. Contenu conforme.' },
      { entryTime:'10:30', description:'✅ Façade Est terminée. Photos prises.' },
      { entryTime:'14:00', description:'⚠️ Vis M6 insuffisantes façade Nord. Ticket #T-001 créé.' },
    ]},
    checklist: { create: [
      { item:'EPI portés', checked:true },
      { item:'Zone balisée', checked:true },
      { item:'Bilan fin de journée', checked:false },
    ]},
  }});

  // Project 2
  await prisma.project.create({ data: {
    internalNumber: 'VEM-2025-002',
    name: 'BMW Experience Liège',
    clientId: bmw.id,
    status: 'in_preparation',
    address: 'Quai Godefroid Kurth 6, 4020 Liège',
    city: 'Liège',
    installationStart: new Date('2025-05-20'),
    installationEnd: new Date('2025-05-23'),
    workersCount: 5,
    technicalManagerId: amaury.id,
    createdById: amaury.id,
    team: { create: [{ userId: jc.id, role: 'site_manager', isLead: true }, { userId: paul.id, role: 'engineer' }] },
  }});

  console.log('\n✅ Seed terminé !');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📧 Comptes de connexion :');
  console.log('  admin@vem.com              / Admin@VEM2025!');
  console.log('  amaury.pinchart@vem.com    / VEM2025!');
  console.log('  jeremy.berrutto@vem.com    / VEM2025!');
  console.log('  norick.palm@vem.com        / VEM2025!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

main().catch(console.error).finally(() => prisma.$disconnect());
