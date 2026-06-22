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
    const cats = await (prisma as any).taskCategory.findMany();
    const tplCount = await (prisma as any).taskTemplate.count();

    if (cats.length === 0) {
      // Cas 1 : tout vide → seed complet
      logger.info('[seed] task templates : base vide, import complet...');
      for (let i = 0; i < TASK_TEMPLATES_SEED.length; i++) {
        const cat = TASK_TEMPLATES_SEED[i];
        const created = await (prisma as any).taskCategory.create({
          data: { name: cat.name, icon: cat.icon, color: cat.color, sortOrder: i, isActive: true },
        });
        for (let j = 0; j < cat.tasks.length; j++) {
          await (prisma as any).taskTemplate.create({
            data: {
              categoryId: created.id, title: cat.tasks[j],
              durationHours: 8, priority: 'normal',
              sortOrder: j, isActive: true,
            },
          });
        }
        logger.info(`[seed]   → ${cat.name} (${cat.tasks.length} tâches)`);
      }
      logger.info('[seed] ✅ Templates Viewbox importés en base');
      return;
    }

    if (tplCount === 0) {
      // Cas 2 : catégories OK mais templates vides (bug categoryId historique).
      // → re-seeder les templates en mappant par nom de catégorie.
      logger.info(`[seed] task templates : ${cats.length} catégorie(s) OK mais 0 templates, re-seed des templates...`);
      let totalCreated = 0;
      const catsByName: Record<string, any> = {};
      cats.forEach((c: any) => { catsByName[c.name] = c; });

      for (let i = 0; i < TASK_TEMPLATES_SEED.length; i++) {
        const seedCat = TASK_TEMPLATES_SEED[i];
        let cat = catsByName[seedCat.name];
        if (!cat) {
          // Catégorie pas trouvée → on la crée
          cat = await (prisma as any).taskCategory.create({
            data: { name: seedCat.name, icon: seedCat.icon, color: seedCat.color, sortOrder: cats.length + i, isActive: true },
          });
          catsByName[seedCat.name] = cat;
        }
        for (let j = 0; j < seedCat.tasks.length; j++) {
          await (prisma as any).taskTemplate.create({
            data: {
              categoryId: cat.id, title: seedCat.tasks[j],
              durationHours: 8, priority: 'normal',
              sortOrder: j, isActive: true,
            },
          });
          totalCreated++;
        }
      }
      logger.info(`[seed] ✅ ${totalCreated} template(s) recréé(s) sur les catégories existantes`);
      return;
    }

    logger.info(`[seed] task templates : ${cats.length} catégorie(s) et ${tplCount} template(s) en base, seed sauté`);
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

    // ─── Table "team_bookings" (transport + hôtel par membre+projet) ───
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "team_bookings" (
        "id"                TEXT NOT NULL PRIMARY KEY,
        "project_id"        TEXT NOT NULL,
        "user_id"           TEXT NOT NULL,
        "phase"             TEXT NOT NULL,
        "on_site_start"     TIMESTAMP NOT NULL,
        "on_site_end"       TIMESTAMP NOT NULL,
        "outbound_mode"     TEXT,
        "outbound_date"     TIMESTAMP,
        "outbound_details"  TEXT,
        "return_mode"       TEXT,
        "return_date"       TIMESTAMP,
        "return_details"    TEXT,
        "hotel_name"        TEXT,
        "hotel_address"     TEXT,
        "hotel_checkin"     TIMESTAMP,
        "hotel_checkout"    TIMESTAMP,
        "hotel_notes"       TEXT,
        "notes"             TEXT,
        "created_at"        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at"        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    // FK avec CASCADE pour bien nettoyer si on supprime un projet ou un user
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'team_bookings_project_id_fkey') THEN
          ALTER TABLE "team_bookings" ADD CONSTRAINT "team_bookings_project_id_fkey"
            FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'team_bookings_user_id_fkey') THEN
          ALTER TABLE "team_bookings" ADD CONSTRAINT "team_bookings_user_id_fkey"
            FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
        END IF;
      END $$;
    `);
    // Index pour les lookups par date (dashboard calendrier)
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "team_bookings_on_site_idx" ON "team_bookings" ("on_site_start", "on_site_end");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "team_bookings_project_idx" ON "team_bookings" ("project_id");
    `);

    // ─── Table "hotel_bookings" + lien N-N avec users ───
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "hotel_bookings" (
        "id"            TEXT NOT NULL PRIMARY KEY,
        "project_id"    TEXT NOT NULL,
        "phase"         TEXT NOT NULL,
        "hotel_name"    TEXT NOT NULL,
        "hotel_address" TEXT,
        "checkin"       TIMESTAMP NOT NULL,
        "checkout"      TIMESTAMP NOT NULL,
        "reference"     TEXT,
        "notes"         TEXT,
        "created_at"    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at"    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "hotel_booking_occupants" (
        "id"               TEXT NOT NULL PRIMARY KEY,
        "hotel_booking_id" TEXT NOT NULL,
        "user_id"          TEXT NOT NULL,
        "created_at"       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "hotel_booking_occupants_unique" UNIQUE ("hotel_booking_id", "user_id")
      );
    `);
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'hotel_bookings_project_id_fkey') THEN
          ALTER TABLE "hotel_bookings" ADD CONSTRAINT "hotel_bookings_project_id_fkey"
            FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'hotel_booking_occupants_hotel_booking_id_fkey') THEN
          ALTER TABLE "hotel_booking_occupants" ADD CONSTRAINT "hotel_booking_occupants_hotel_booking_id_fkey"
            FOREIGN KEY ("hotel_booking_id") REFERENCES "hotel_bookings"("id") ON DELETE CASCADE;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'hotel_booking_occupants_user_id_fkey') THEN
          ALTER TABLE "hotel_booking_occupants" ADD CONSTRAINT "hotel_booking_occupants_user_id_fkey"
            FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
        END IF;
      END $$;
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "hotel_bookings_dates_idx" ON "hotel_bookings" ("checkin", "checkout");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "hotel_bookings_project_idx" ON "hotel_bookings" ("project_id");
    `);

    // ─── Colonnes "lieu de chargement / déchargement" sur trucks ───
    // Stockent le libellé final affiché (ex: "Entrepôt Tubize", "Brussels Expo, ...")
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "trucks" ADD COLUMN IF NOT EXISTS "loading_location" TEXT;
    `);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "trucks" ADD COLUMN IF NOT EXISTS "unloading_location" TEXT;
    `);

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
    // categoryId — colonne MANQUANTE qui plantait tout depuis le début.
    // On la met en NULL d'abord ; le seed (plus bas) y mettra des valeurs valides.
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "task_templates" ADD COLUMN IF NOT EXISTS "categoryId" TEXT;
    `);
    // Nettoyer les anciens templates orphelins (sans categoryId valide).
    await prisma.$executeRawUnsafe(`
      DELETE FROM "task_templates" WHERE "categoryId" IS NULL;
    `);
    logger.info('[migration] task_templates.categoryId ajoutée si absente + orphelins purgés');

    // ─── FIX colonne orpheline "category_id" (snake_case) sur task_templates ───
    // Héritée d'un ancien schéma Prisma qui avait @map("category_id") sur ce champ.
    // Aujourd'hui le schéma n'a plus de @map donc Prisma écrit dans "categoryId" (camelCase),
    // et l'orpheline reste vide → sa contrainte NOT NULL bloquait TOUS les inserts.
    // On la drop carrément pour faire propre (le contenu utile est dans "categoryId").
    try {
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "task_templates" DROP COLUMN IF EXISTS "category_id";
      `);
      logger.info('[migration] task_templates.category_id (colonne orpheline) supprimée');
    } catch (e: any) {
      // Si DROP échoue (FK ou autre), on tente au moins de retirer le NOT NULL
      logger.warn(`[migration] DROP category_id échoué (${e.message}), tentative DROP NOT NULL...`);
      try {
        await prisma.$executeRawUnsafe(`
          ALTER TABLE "task_templates" ALTER COLUMN "category_id" DROP NOT NULL;
        `);
        logger.info('[migration] task_templates.category_id : NOT NULL retiré');
      } catch (e2: any) {
        logger.warn(`[migration] DROP NOT NULL category_id : ${e2.message}`);
      }
    }

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

    // ─── Colonnes "Notes complémentaires" sur projects ───
    // Permet de saisir des notes globales / installation / démontage depuis
    // l'onglet Infos du projet, et de les afficher dans le Rapport IA.
    // Ces colonnes correspondent aux champs Prisma : scope, installNotes (→ install_notes), dismantleNotes (→ dismantle_notes)
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "scope" TEXT;
    `);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "install_notes" TEXT;
    `);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "dismantle_notes" TEXT;
    `);
    logger.info('[migration] projects : scope / install_notes / dismantle_notes ajoutées si absentes');

    // ─── Colonnes "createdAt" / "updatedAt" sur task_categories et task_templates ───
    // Prisma s'attend à ces colonnes (présentes dans le schéma) mais elles n'avaient
    // peut-être jamais été créées en base sur de vieilles installations.
    // NB : Prisma ne map pas createdAt → created_at ici (pas de @map), donc on garde le PascalCase.
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "task_categories" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
    `);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "task_templates" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
    `);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "task_templates" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
    `);
    logger.info('[migration] task_categories / task_templates : createdAt/updatedAt ajoutées si absentes');

    // ─── Colonnes "pièces jointes" sur team_bookings et hotel_bookings ───
    // Permet d'attacher un PDF/image (billet, voucher, confirmation hôtel) à un booking.
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "team_bookings" ADD COLUMN IF NOT EXISTS "attachment_url" TEXT;
    `);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "team_bookings" ADD COLUMN IF NOT EXISTS "attachment_name" TEXT;
    `);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "team_bookings" ADD COLUMN IF NOT EXISTS "attachment_public_id" TEXT;
    `);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "hotel_bookings" ADD COLUMN IF NOT EXISTS "attachment_url" TEXT;
    `);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "hotel_bookings" ADD COLUMN IF NOT EXISTS "attachment_name" TEXT;
    `);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "hotel_bookings" ADD COLUMN IF NOT EXISTS "attachment_public_id" TEXT;
    `);
    logger.info('[migration] team_bookings / hotel_bookings : colonnes attachment ajoutées si absentes');

    // ─── Colonne "phase" sur project_team ───
    // 'installation' = membre uniquement à l'install, 'dismantling' = uniquement au démontage,
    // 'both' (défaut, compatible avec l'existant) = présent sur les deux phases.
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "project_team" ADD COLUMN IF NOT EXISTS "phase" TEXT NOT NULL DEFAULT 'both';
    `);
    logger.info('[migration] project_team.phase ajoutée si absente');

    // ─── Colonne "sort_order" sur projects (drag-and-drop dans le Gantt) ───
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "sort_order" INTEGER NOT NULL DEFAULT 0;
    `);
    logger.info('[migration] projects.sort_order ajoutée si absente');

    // ─── Clients : colonne vat + table client_contacts ───
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "vat" TEXT;
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "client_contacts" (
        "id"          TEXT          NOT NULL,
        "client_id"   TEXT          NOT NULL,
        "name"        TEXT          NOT NULL,
        "role"        TEXT,
        "email"       TEXT,
        "phone"       TEXT,
        "notes"       TEXT,
        "is_primary"  BOOLEAN       NOT NULL DEFAULT FALSE,
        "sort_order"  INTEGER       NOT NULL DEFAULT 0,
        "created_at"  TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at"  TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "client_contacts_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "client_contacts_client_id_idx" ON "client_contacts"("client_id");
    `);
    // Foreign key (idempotent : on ignore l'erreur si déjà créée)
    try {
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "client_contacts"
          ADD CONSTRAINT "client_contacts_client_id_fkey"
          FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      `);
    } catch (_e) { /* FK déjà présente */ }
    logger.info('[migration] clients.vat + table client_contacts créées si absentes');

    // ─── Table app_settings (key/value globaux) ───
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "app_settings" (
        "key"        TEXT          NOT NULL,
        "value"      JSONB         NOT NULL,
        "updated_at" TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "app_settings_pkey" PRIMARY KEY ("key")
      );
    `);
    logger.info('[migration] table app_settings créée si absente');

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
// ─── Briefing : ajouter studio_slides + migrer les anciens briefings v2 ───
await prisma.$executeRawUnsafe(`
  ALTER TABLE briefings ADD COLUMN IF NOT EXISTS studio_slides JSONB;
`);
// Pour tout briefing dont slides est un objet v2 (Studio) → on déplace dans studio_slides
await prisma.$executeRawUnsafe(`
  UPDATE briefings
  SET studio_slides = slides,
      slides = '[]'::jsonb
  WHERE jsonb_typeof(slides) = 'object'
    AND slides->>'version' = '2'
    AND studio_slides IS NULL;
`);
console.log('[migration] briefings.studio_slides OK (+ migration v2 → studio_slides)');