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

    logger.info('✅ Migrations de démarrage OK');
  } catch (err) {
    logger.error('❌ Erreur lors des migrations de démarrage :', err);
    // On ne plante pas le serveur pour autant — il pourra démarrer même si la migration échoue.
  }
}
