// src/utils/migrations.ts
// Migrations idempotentes exécutées au démarrage du serveur.
// Permet d'ajouter de nouvelles tables/colonnes sans avoir à lancer
// du SQL manuellement sur Railway. Toutes les commandes utilisent
// IF NOT EXISTS pour être rejouables sans risque.

import { prisma } from '../config/database';
import { logger } from './logger';

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

    logger.info('✅ Migrations de démarrage OK');
  } catch (err) {
    logger.error('❌ Erreur lors des migrations de démarrage :', err);
    // On ne plante pas le serveur pour autant — il pourra démarrer même si la migration échoue.
  }
}
