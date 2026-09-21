# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

VEM (ViewBox Event Manager) — internal project management platform for Viewbox International SA (event installation industry). Manages the full lifecycle of event "chantiers": preparation, installation, dismantling, client handover, logistics. Backend + frontend are the same repo/deployment.

The user (Amaury Pinchart) applies changes manually via copy-paste in github.dev and deploys through Railway's auto-rebuild on push. He is non-technical: prefer full drop-in code blocks over diffs/patches when asked to change something, and keep explanations short — see his instructions at the top of the conversation.

## Commands

```bash
npm run dev          # ts-node-dev, hot reload, http://localhost:3000
npm run build        # tsc -> dist/
npm start             # node dist/index.js (production)
npm run db:generate   # prisma generate
npm run db:migrate    # prisma migrate deploy (NOT used in prod, see below)
npm run db:seed       # ts-node prisma/seed.ts
npm run db:studio     # prisma studio
```

There is no test suite and no lint script configured in this project.

## Deployment (Railway)

- Auto-deploys on push to `main` via Dockerfile build (`railway.toml`).
- Container start command: `npx prisma db push --accept-data-loss && node dist/index.js` (see `Dockerfile`). This means **`schema.prisma` is the single source of truth for the DB schema** — there are no versioned Prisma migration files in this project. To change the schema: edit `prisma/schema.prisma` directly, commit, push; `db push` reconciles the live Postgres DB on next boot.
- Anything `db push` can't express safely at boot (new enum values, dropping/renaming constraints, backfills, data-preserving column type changes) is handled by hand-written **idempotent raw SQL** in `src/utils/migrations.ts`, run once at server startup via `runStartupMigrations()` (called from `src/index.ts`). Every statement there must be safe to re-run on every boot (`IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, guarded `DO $$ ... $$` blocks, etc.). When adding a schema change that `db push` won't handle cleanly, add a new idempotent block at the bottom of `runStartupMigrations()` rather than writing a Prisma migration.
- Health check: `GET /health`.
- A recurring, misleading symptom: a push doesn't take effect. Before assuming a code bug, verify on github.com that the commit actually landed and that Railway's deployed commit hash matches it — Railway rebuilds don't guarantee the push was received.

## Architecture

**Single Express app serves both the API and the frontend** (`src/index.ts`). No separate frontend build/deploy — `express.static` serves `public/` and a catch-all `app.get('*', ...)` returns `public/index.html` for client-side routing.

- All API routes are mounted under `/api/v1/...` in `src/index.ts`, each as its own router in `src/routes/*.ts`.
- `authMiddleware` (`src/middleware/auth.ts`) is applied per-mount in `index.ts`, not globally — a few routers are intentionally public and mounted *without* it:
  - `/api/v1/public/handover-sign` — client-facing signature link
  - `/api/v1/public` (publicCalendar) — public planning display for warehouse screens
  - `/webhooks` — Brevo inbound email webhook (auth via shared secret checked inside the route, not middleware)
  - `/api/v1/translate`
- `requireRole(...roles)` (same file) is used for extra restriction beyond plain auth (currently only on `/api/v1/assistant`).
- Route handler convention: every handler is `async (req, res, next) => { try { ... } catch (err) { next(err); } }`, responses are `{ success: true, data }` / `{ success: false, error }`, errors are thrown as `new AppError(message, statusCode)` (`src/utils/AppError.ts`) and centrally formatted by `src/middleware/errorHandler.ts` (which also special-cases Prisma `P2002`/`P2025`).
- `src/config/database.ts` exports a single `prisma` singleton (cached on `global` in dev to survive ts-node-dev reloads).
- Real-time: a single Socket.IO server (`io`, exported from `src/index.ts`) — clients join `user:<id>` and `project:<id>` rooms; emit from routes/services to push live updates (e.g. task/ticket changes) to connected clients.
- Inbound email → project/booking automation: `src/services/imapPoller.ts` polls Gmail via IMAP on an interval and feeds `src/services/projectFromEmail.ts` / `src/services/bookingFromEmail.ts`. Can be triggered manually via `POST /api/v1/imap-poll` (admin, from browser console) instead of waiting for the interval. Outbound email goes through a Google Apps Script relay (`src/services/emailService.ts`) — the relay responds with 302 redirects, so the client follows redirects on GET but only re-sends POST on 307/308 (avoids 405s on the echo URL).
- AI features go through `src/services/aiService.ts` (`anthropicRequest` / `callClaude` / a schema-validated JSON variant), model configurable via `ANTHROPIC_MODEL` env (defaults to Claude Haiku). Callers must pass a generous `max_tokens` and check `stop_reason === 'max_tokens'` — a response truncated mid-JSON is a known recurring failure mode for report/summary generation (`assistantService.ts`, `briefingAI.ts`).
- File uploads (photos, PDFs, attachments) go through Cloudinary via `src/services/cloudinaryService.ts` / `src/routes/upload.ts`.
- PDF generation (handover docs, daily reports) is in `src/services/pdfService.ts` via `pdfkit`.

### Frontend (`public/`)

- `public/index.html` is the shell (nav, layout, modals markup) and loads 14 sequential, non-module `<script>` files from `public/js/01-core.js` through `14-briefing-autogen.js` — load order matters, they share globals (no bundler, no ES modules). Numbered prefix = load order, not strict feature grouping (e.g. auth code lives in `07-auth-mobile-daily-ai.js`, not `01-core.js`).
- Heavy third-party libs (`jspdf`, `fabric`) are loaded with `defer` from CDN in the `<head>` of `index.html`, not bundled.
- `public/js/11-briefing.js` through `14-briefing-autogen.js` implement "Briefing Studio", a Fabric.js-based slide editor (copy/paste, slide duplication, text boxes) used to prep on-site briefings; it's the most actively-changing part of the frontend.
- `public/sign-handover.html` — standalone public page for client handover signature (served alongside the main SPA, not part of the JS bundle chain).
- `public/planning-public.html` — standalone public read-only planning display (paired with the `publicCalendar` API route).
- `public/viewer3d.html` + `public/vem-3d-integration.js` — embeddable 3D viewer (Three.js r128, loaded from CDN) supporting IFC (via `web-ifc`) and COLLADA `.dae` (via `ColladaLoader`), both loaders fetched dynamically at runtime rather than bundled. Model/asset files themselves are pulled from jsDelivr (`cdn.jsdelivr.net/gh/amaurypinchart-VBX/3Dviewer@main/...`) — `raw.githubusercontent.com` is blocked by CORS for this use case, jsDelivr is not optional.

### Data model (`prisma/schema.prisma`)

Central entity is `Project` (status flows through the `ProjectStatus` enum: draft → confirmed → quote states → in_preparation → loading → on_site → installation → handover → handover_ok → dismantling → completed, or cancelled). Everything else hangs off a project: `Task`/`TaskTemplate`/`TaskCategory`, `Ticket`, `Handover`, `DailyReport`, `ClientVisit`/`ClientRemark`, `TeamBooking`/`HotelBooking`, `Truck`, `Briefing`, plus warehouse (`WarehouseBox`, `Toolbox`) and `Client`/`ClientContact`. `User.role` (`UserRole` enum: admin, project_manager, site_manager, technical_manager, engineer, worker, client, warehouse, sales_engineer, installer) drives access control — role-based restriction of *which projects* a given role can see (beyond simple auth) is an ongoing, partially-implemented effort; check `src/middleware/` for a project-scoping helper before assuming one exists, and check each route file individually rather than assuming role checks are consistent across `projects.ts`, `clientVisits.ts`, `handover.ts`, `dailyReports.ts`, etc.

### Common gotchas

- Cascading 401s across every endpoint at once is almost always an expired JWT, not a code regression — the fix is re-authenticating, not debugging the backend.
- Prisma unique-constraint (`P2002`) fixes sometimes require `ALTER TABLE ... DROP CONSTRAINT` rather than `DROP INDEX`, when the index backs a constraint rather than existing standalone.
