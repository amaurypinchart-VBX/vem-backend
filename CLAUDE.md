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

The backend has no test suite and no lint script. The Plans Viewbox sub-app (`plans/`, see below) has its own:

```bash
cd plans && npm test                          # Vitest (geometry, classification, .dae ingestion, 2D engine, captures)
cd plans && npm run typecheck                 # tsc --noEmit (strict)
cd plans && npm run build                     # → public/plans (+ public/plans/tools/viewbox_prep.rbz)
ruby plans/sketchup/test_core.rb              # SketchUp extension, pure logic
ruby plans/sketchup/test_main_smoke.rb        # SketchUp extension against a stubbed SketchUp API
```

## Deployment (Railway)

- Auto-deploys on push to `main` via Dockerfile build (`railway.toml`).
- The Dockerfile `CMD` runs `npx prisma db push --accept-data-loss && node dist/index.js`, **but `railway.toml`'s `startCommand` (`node dist/index.js`) overrides it on Railway, so `db push` does NOT run at boot in production.** There are no versioned Prisma migration files. To add a table/column: add it to `prisma/schema.prisma` (keeps the Prisma client typed) **and** create it with idempotent SQL in `src/utils/migrations.ts` (see the `plan2ds` / `plans_model_versions` blocks). New models are accessed as `(prisma as any).model` in routes because the Prisma client in `node_modules` is committed to git and only regenerated in the Docker build.
- `node_modules/` and `dist/` are committed to git (historical); the Docker build ignores them (`.dockerignore`) and reinstalls/rebuilds. Don't run the root `npm run build` just to type-check (it rewrites tracked `dist/` files) — use `npx tsc --noEmit -p .`.
- The Dockerfile has a first stage (Node 22) that builds `plans/` into `public/plans`; the backend stage copies it in.
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

### Plans Viewbox (`plans/` → served at `/plans/`)

Separate Vite + React 19 + TypeScript (strict) sub-app, built into `public/plans` (gitignored) by the Dockerfile, opened from the project page (Fichiers or Infos › Modèles 3D › « 📐 Plans Viewbox », `openPlansViewbox` in `01-core.js`). Goal: SketchUp model → vector architect drawing sets (phased spec P0–P7; P0 ingestion/inspector, P1 viewer/isolation/captures and P2 2D engine done; see git log for current phase). A saved analysis opens a workspace with tabs Contrôle (inspector) · Vue 3D · Vues 2D (`ui/Workspace.tsx`).

- `plans/src/core/` — pure, tested logic: classification rules (editable in the app, stored in `app_settings` key `plans.classificationRules`), units/dimension checks, triangle cleanup, manifest.
- `plans/src/ingest/` — browser pipeline: unzip → COLLADA parse (three 0.186 `ColladaParser`/`ColladaComposer` subclassed to keep SketchUp definition names; unit + Z-up applied exactly once) → geometry cleanup in a Web Worker → scene index (modules VBX-xx, accessories, levels, warnings) → GLB package (`userData.vbxId` = stable node id).
- `plans/src/scene/` + `plans/src/viewer/` — loaded model (`LoadedScene`: GLB package + index + module frames) and the three.js viewer (`SceneViewer`): isolation only by `visible = false` (never clipping), ghost neighbours, BVH picking, front-face arrows, offscreen HD captures (MSAA, `LineSegments2` edges, auto-crop via `captureImage.ts`). A GLB node with several materials comes back as a group of primitive meshes: use `meshesOfNode` / `nodeIdOf`.
- `plans/src/core/views.ts` — view bases: world views = SketchUp standard views; module views are relative to the Viewbox frame (Front/Back = short sides, front = short side towards local +X unless overridden, stored in `plans_model_versions.settings.fronts`).
- `plans/src/linework/` — 2D engine behind the `LineworkProvider` seam (`BrowserHlrProvider`): subset → world-baked packet → Web Worker pool (`hlr.worker.ts`) → `hlr.ts` (own edge extraction + three-edge-projection internals for hidden-line removal; glass excluded from occluders; `LineObjectsBVH` needs `heightOffset` = model depth because the library assumes metres) → 2D cleanup (`core/lines2d.ts`: collinear merge, chaining) → layers silhouette/visible/fine/hidden/category:* in model mm → SVG (`svg.ts`, paper-mm strokes). Results cached in IndexedDB (`LINEWORK_ENGINE` in `provider.ts` = cache version: bump it when the engine output changes).
- Backend: `src/routes/plans.ts` stores results in `plans_model_versions`: index JSON + the GLB package on Cloudinary raw. **The Cloudinary plan refuses files > 10 MB**, so the package is gzip-compressed (≈ 5×) and uploaded in parts < 9 MB (`POST /models/:id/package/part`, columns `glb_parts` / `glb_encoding`; `downloadPackage` reassembles). `settings` JSON = module fronts + saved cameras, copied to the next version of the same project. Nullable JSON columns must be reset with `Prisma.DbNull`, not `null`.
- `plans/sketchup/` — SketchUp Ruby extension (`viewbox_prep.rbz`, downloadable from the app): numbers modules (VBX-xx), lets the user override category / label / article ref per component definition ("Réviser les catégories…" HtmlDialog `review.html`, or right-click), and module type + nominal size; exports .dae + textures + `manifest.json` as a .zip. SketchUp rewrites names in the .dae (spaces/`#`/`:` → `_`, leading-digit prefix), so during export every item is temporarily renamed `VBXE-<n>` (manifest `exportName`, the match key used by `buildIndex`), then the operation is aborted to restore the model. Keep its rules (`core.rb`) aligned with `plans/src/core/classification.ts`.
- Real models dropped in `test-models/` (gitignored, or `VEM_MODELS_DIR=…`) are analysed by `cd plans && npx vitest run tests/real-models.test.ts` (writes `*.analyse-vem.txt` next to them, and checks a Viewbox top view measures its plan dimensions ± 1 mm with no duplicate line).
- `three-edge-projection` is unpublished from npm: it is installed from pinned GitHub commit 59a0a452c378; its stale peer ranges (three ^0.155, three-mesh-bvh ^0.6) are overridden in `plans/package.json` `overrides`.

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
