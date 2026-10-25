---
name: vem-schema-change
description: How to add or change a database table, column, enum value, index or constraint in VEM (Prisma schema + idempotent startup SQL in src/utils/migrations.ts). Use whenever a feature needs new persisted data.
---

# Database change in VEM

Production never runs `prisma db push` or `prisma migrate` (Railway's `startCommand` overrides the Dockerfile `CMD`), and there are no migration files. Every change is done twice:

1. **`prisma/schema.prisma`** — add the model / field so the client stays typed. Use `@@map("snake_case_table")` and `@map("snake_case")` like the neighbouring models; JSON columns are `Json?`.
2. **`src/utils/migrations.ts`** — a new idempotent block **at the bottom of `runStartupMigrations()`**, copying the style of the existing blocks (e.g. `plans_linework_cache`): a list of statements run in a `try`, `logger.info('[migration] … créée si absente')`, `catch` → `logger.warn` (a failed block must never stop the server).
   - Tables: `CREATE TABLE IF NOT EXISTS`, with `CONSTRAINT "<table>_pkey" PRIMARY KEY`; foreign keys to projects with `ON DELETE CASCADE` when the data belongs to a project.
   - Columns: `ALTER TABLE … ADD COLUMN IF NOT EXISTS`.
   - Indexes: `CREATE INDEX IF NOT EXISTS`.
   - Enum values, constraint drops/renames, backfills, type changes: guarded `DO $$ BEGIN IF NOT EXISTS (…) THEN … END IF; END $$;`. A unique index that backs a constraint needs `ALTER TABLE … DROP CONSTRAINT`, not `DROP INDEX`.
   - One-shot data migrations: guard with a marker in `app_settings` (see `checklists.preparationSplit`).
   - Everything must be safe to re-run on every boot.
3. **In routes**, access new models as `(prisma as any).myModel` — the Prisma client is only regenerated in the Docker build, a local client may be stale.
4. Nullable JSON reset: `Prisma.DbNull`, not `null`.
5. Never return Prisma errors to the client; throw `AppError` and let `errorHandler` log.

Check: `npx prisma validate`, `npx tsc --noEmit -p .`. Then document the table in `CLAUDE.md` next to the feature it belongs to (see `vem-delivery`).
