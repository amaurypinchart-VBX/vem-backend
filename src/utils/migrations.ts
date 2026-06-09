// src/utils/migrations.ts
// Migrations idempotentes exécutées au démarrage du serveur.
// Permet d'ajouter de nouvelles tables/colonnes sans avoir à lancer
// du SQL manuellement sur Railway. Toutes les commandes utilisent
// IF NOT EXISTS pour être rejouables sans risque.

import { prisma } from '../config/database';
import { logger } from './logger';

// ─── Seeder inline pour les templates de tâches Viewbox ───
// Idempotent : ne fait rien si la table contient déjà des catégories.
const TASK_TEMPLATES_SEED: Array<{ name: string; icon: string; color: string; tasks: string[] }> = [
  { name: 'To Do', icon: '📋', color: '#5a6275', tasks: [
    'Team - Dismantling',
    'Preparation material from delivery note',
  ]},
  { name: 'PRE-PROD', icon: '📐', color: '#4895ef', tasks: [
    'Briefing SHEET from SALES',
    'Preparation of all packing list',
    'Packing list for warehouse team',
    'Site Visit ( Verify faisability on site)',
    'Boarding solution',
    'Analyse packing list',
    'Buy missing material',
    'Briefing team',
    'Briefing PP with all informations',
    'Create Whats app group',
  ]},
  { name: 'Booking Supplier', icon: '📞', color: '#9b59b6', tasks: [
    'Organise transport TRUCK',
    'Book SM',
    'Book accomodation SM',
    'Book Transport SM',
    'Rent Forklift',
    'Book team',
    'Rent Manitou ROTO',
    'Rent Scisor Lift',
    'Book CRANE',
    'Book Accomodation team',
  ]},
  { name: 'Warehouse Preparation', icon: '📦', color: '#f4a261', tasks: [
    'Loading truck',
  ]},
  { name: 'Installation', icon: '🏗️', color: '#e63946', tasks: [
    'GENERAL TASK',
    'TMPL - Electricity',
    'Unload Tautliner with Forklift On Site',
    'Levelling and Laser work on site',
    'Unload Flatbed truck on site with crane',
    'UNIT',
    'Placing Facade elements',
    'Placement of inner Ceilings',
    'Placement of vinyl floor',
    'Placement of Vinyl click hard floor',
    'Handover with the client',
    'Interior or exterior Staircase',
    'Terraces and Unit',
  ]},
  { name: 'Dismantling', icon: '🔨', color: '#f4a261', tasks: [
    'Unloading of rack and tools and reorganisation of racks',
    'Remove Decoration and interior material',
    'Remove facade Elements',
    'Remove external or internal staircase',
    'Flat Packing With crane UNIT',
    'Remove terraces Unit and Handrails',
    'Loading FlatBED',
    'Loading Tautliner',
    'Cleaning SITE',
    'HANDHOVER Client to end of event',
    'GENERAL DISMANTLING TASK',
  ]},
  { name: 'Come Back Warehouse', icon: '🏠', color: '#2dc653', tasks: [
    'Dismounting',
    'Unloading truck in warehouse',
    'Verification of return material',
  ]},
];

async function seedTaskTemplatesIfEmpty(): Promise<void> {
  try {
    const count = await (prisma as any).taskCategory.count();
    if (count > 0) {
      logger.info(`[seed] task templates : ${count} catégorie(s) déjà en base, seed sauté`);
      return;
    }
    logger.info('[seed] task templates : base vide, import des 7 étapes Viewbox...');
    for (let i = 0; i < TASK_TEMPLATES_SEED.length; i++) {
      const cat = TASK_TEMPLATES_SEED[i];
      const created = await (prisma as any).taskCategory.create({
        data: { name: cat.name, icon: cat.icon, color: cat.color, sortOrder: i, isActive: true },
      });
      for (let j = 0; j < cat.tasks.length; j++) {
        await (prisma as any).taskTemplate.create({
          data: {
            categoryId: created.id, title: cat.tasks[j],
            durationHours: 4, priority: 'normal',
            sortOrder: j, isActive: true,
          },
        });
      }
      logger.info(`[seed]   → ${cat.name} (${cat.tasks.length} tâches)`);
    }
    logger.info('[seed] ✅ Templates Viewbox importés en base');
  } catch (err: any) {
    logger.error(`[seed] échec d'import des templates : ${err.message || err}`);
  }
}

export async function runStartupMigrations() {
  try {
    // ─── Table "briefings" ───
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "briefings" (
        "id"         TEXT         NOT NULL,
        "project_id" TEXT         NOT NULL,
        "title"      TEXT,
        "slides"     JSONB        NOT NULL DEFAULT '[]'::jsonb,
        "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "briefings_pkey" PRIMARY KEY ("id")
      );
    `);

    // Contrainte d'unicité (1 briefing par projet)
    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'briefings_project_id_key') THEN
          ALTER TABLE "briefings"
            ADD CONSTRAINT "briefings_project_id_key" UNIQUE ("project_id");
        END IF;
      END $$;
    `);

    // Clé étrangère vers projects
    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'briefings_project_id_fkey') THEN
          ALTER TABLE "briefings"
            ADD CONSTRAINT "briefings_project_id_fkey"
            FOREIGN KEY ("project_id") REFERENCES "projects"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;
      END $$;
    `);

    // ─── Colonnes "carte d'identité" sur users ───
    for (const col of [
      'birth_date', 'birth_place', 'nationality',
      'id_number', 'national_number', 'id_expiry', 'team_group_id'
    ]) {
      await prisma.$executeRawUnsafe(
        `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "${col}" TEXT;`
      );
    }

    // ─── Forcer le type TEXT sur les colonnes de date carte d'identité ───
    // Le schéma Prisma déclare ces champs en String?, mais en base elles peuvent
    // exister en type "date" (issu d'une ancienne version du schéma). Prisma envoie
    // alors un format binaire incompatible → erreur 22P03 sur bind parameter N.
    // ALTER TYPE TEXT USING ::text fonctionne pour DATE → TEXT et est un no-op si
    // la colonne est déjà TEXT.
    for (const col of ['birth_date', 'id_expiry']) {
      try {
        await prisma.$executeRawUnsafe(
          `ALTER TABLE "users" ALTER COLUMN "${col}" TYPE TEXT USING "${col}"::text;`
        );
        logger.info(`[migration] users.${col} forcé en TEXT`);
      } catch (e: any) {
        logger.warn(`[migration] conversion ${col} : ${e.message}`);
      }
    }

    // ─── Valeurs d'enum UserRole manquantes ───
    // ALTER TYPE ADD VALUE doit être hors transaction → on tente une par une et on log les échecs.
    for (const val of ['sales_engineer', 'installer']) {
      try {
        await prisma.$executeRawUnsafe(
          `ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS '${val}';`
        );
      } catch (e: any) {
        logger.warn(`[migration] enum value "${val}" : ${e.message}`);
      }
    }

    // ─── Valeurs d'enum ProjectStatus manquantes (workflow devis/préparation/...) ───
    for (const val of ['quote_to_validate', 'quote_validated', 'handover_ok']) {
      try {
        await prisma.$executeRawUnsafe(
          `ALTER TYPE "ProjectStatus" ADD VALUE IF NOT EXISTS '${val}';`
        );
      } catch (e: any) {
        logger.warn(`[migration] ProjectStatus value "${val}" : ${e.message}`);
      }
    }

    // ─── Corriger contraintes NOT NULL incohérentes avec le schéma Prisma ───
    // entry_time de daily_report_entries : le schéma dit nullable mais la DB
    // a été créée avec NOT NULL → DROP NOT NULL (no-op si déjà nullable).
    try {
      await prisma.$executeRawUnsafe(
        `ALTER TABLE "daily_report_entries" ALTER COLUMN "entry_time" DROP NOT NULL;`
      );
    } catch (e: any) {
      logger.warn(`[migration] daily_report_entries.entry_time : ${e.message}`);
    }

    // ─── Colonne "stage" sur tasks (catégorie/étape héritée du template) ───
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "stage" TEXT;
    `);

    // ─── Colonnes manquantes sur task_categories ───
    // Prisma s'attend à ces colonnes mais elles n'avaient jamais été créées en base.
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "task_categories" ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0;
    `);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "task_categories" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT TRUE;
    `);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "task_categories" ADD COLUMN IF NOT EXISTS "description" TEXT;
    `);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "task_categories" ADD COLUMN IF NOT EXISTS "icon" TEXT NOT NULL DEFAULT '📋';
    `);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "task_categories" ADD COLUMN IF NOT EXISTS "color" TEXT NOT NULL DEFAULT '#4895ef';
    `);

    // ─── Colonnes manquantes sur task_templates ───
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "task_templates" ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0;
    `);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "task_templates" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT TRUE;
    `);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "task_templates" ADD COLUMN IF NOT EXISTS "durationHours" DOUBLE PRECISION NOT NULL DEFAULT 4;
    `);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "task_templates" ADD COLUMN IF NOT EXISTS "priority" TEXT NOT NULL DEFAULT 'normal';
    `);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "task_templates" ADD COLUMN IF NOT EXISTS "description" TEXT;
    `);

    // ─── Table "client_visits" (rapport de visite client = contenant de N points) ───
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "client_visits" (
        "id"            TEXT         NOT NULL,
        "project_id"    TEXT         NOT NULL,
        "client_id"     TEXT,
        "title"         TEXT         NOT NULL,
        "visit_date"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "notes"         TEXT,
        "created_by_id" TEXT,
        "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "client_visits_pkey" PRIMARY KEY ("id")
      );
    `);
    // Clé étrangère vers projects
    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'client_visits_project_id_fkey') THEN
          ALTER TABLE "client_visits"
            ADD CONSTRAINT "client_visits_project_id_fkey"
            FOREIGN KEY ("project_id") REFERENCES "projects"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'client_visits_client_id_fkey') THEN
          ALTER TABLE "client_visits"
            ADD CONSTRAINT "client_visits_client_id_fkey"
            FOREIGN KEY ("client_id") REFERENCES "clients"("id")
            ON DELETE SET NULL ON UPDATE CASCADE;
        END IF;
      END $$;
    `);

    // Colonne visit_id sur client_remarks (pour rattacher à une visite)
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "client_remarks" ADD COLUMN IF NOT EXISTS "visit_id" TEXT;
    `);
    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'client_remarks_visit_id_fkey') THEN
          ALTER TABLE "client_remarks"
            ADD CONSTRAINT "client_remarks_visit_id_fkey"
            FOREIGN KEY ("visit_id") REFERENCES "client_visits"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;
      END $$;
    `);

    // ─── Supprimer la contrainte unique sur (project_id, report_date) ───
    // Le métier permet désormais plusieurs rapports par projet et par date.
    // On supprime dynamiquement n'importe quelle contrainte unique sur ces deux
    // colonnes sans présumer du nom exact (Prisma peut générer .._key ou autre).
    try {
      await prisma.$executeRawUnsafe(`
        DO $$
        DECLARE c_name text;
        BEGIN
          SELECT conname INTO c_name
          FROM pg_constraint
          WHERE conrelid = 'daily_reports'::regclass
            AND contype = 'u'
          LIMIT 1;
          IF c_name IS NOT NULL THEN
            EXECUTE 'ALTER TABLE "daily_reports" DROP CONSTRAINT ' || quote_ident(c_name);
            RAISE NOTICE 'Dropped unique constraint %', c_name;
          END IF;
        END $$;
      `);
      logger.info('[migration] contrainte unique daily_reports (project_id, report_date) supprimée si présente');
    } catch (e: any) {
      logger.warn(`[migration] drop unique daily_reports : ${e.message}`);
    }

    logger.info('✅ Migrations de démarrage OK');

    // ─── DIAGNOSTIC : qu'y a-t-il réellement en base ? ───
    // Ces logs nous montreront sans ambiguïté quelles colonnes existent sur
    // la table users (et avec quels types), et quelles valeurs sont actuellement
    // dans l'enum UserRole. Indispensable pour cibler une erreur 22P03.
    try {
      const cols = await prisma.$queryRawUnsafe(
        `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'users' ORDER BY ordinal_position;`
      ) as Array<{ column_name: string; data_type: string }>;
      logger.info(`[diag] colonnes users : ${cols.map(c => `${c.column_name}=${c.data_type}`).join(', ')}`);

      const enumVals = await prisma.$queryRawUnsafe(
        `SELECT enumlabel FROM pg_enum WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'UserRole') ORDER BY enumsortorder;`
      ) as Array<{ enumlabel: string }>;
      logger.info(`[diag] UserRole enum : ${enumVals.map(e => e.enumlabel).join(', ')}`);
    } catch (e: any) {
      logger.warn(`[diag] échec lecture méta : ${e.message}`);
    }

    // Forcer Prisma à rafraîchir ses métadonnées internes (notamment les enums
    // qu'on vient potentiellement d'enrichir). Sans ça, Prisma garde en cache
    // les valeurs d'enum connues à la connexion initiale et envoie un format
    // binaire obsolète → erreur 22P03 "incorrect binary data format" sur les
    // nouvelles valeurs (ex: sales_engineer / installer).
    try {
      await prisma.$disconnect();
      logger.info('🔄 Prisma reconnecté pour rafraîchir les métadonnées');
    } catch (e: any) {
      logger.warn(`[migration] reconnexion Prisma échouée : ${e.message}`);
    }

    // Seed des templates de tâches Viewbox (idempotent : ne s'exécute que si la
    // table task_categories est vide). Permet à l'admin de modifier/ajouter des
    // catégories et des tâches depuis l'onglet Templates Tâches.
    await seedTaskTemplatesIfEmpty();
  } catch (err) {
    logger.error('❌ Erreur lors des migrations de démarrage :', err);
    // On ne plante pas le serveur pour autant — il pourra démarrer même si la migration échoue.
  }
}