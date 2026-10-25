---
name: vem-verify
description: Checks to run before committing or pushing any change in the VEM repo (backend Express/Prisma, public/js frontend, plans/ Vite sub-app, SketchUp Ruby extension). Use after editing code and before every push, so a Railway build never breaks.
---

# Verify a VEM change before pushing

Railway rebuilds `main` from the Dockerfile; a type error in `plans/` or the backend breaks the deploy for everyone. Run what matches the files you touched (dependencies are installed by the SessionStart hook; if `node_modules` is missing run `npm install` at the root and in `plans/`).

| Touched | Run (from repo root) |
|---|---|
| `src/**`, `prisma/schema.prisma` | `npx tsc --noEmit -p .` (no backend tests, no lint) |
| `prisma/schema.prisma` | `npx prisma validate` then `npx prisma generate` |
| `plans/src/**`, `plans/tests/**` | `cd plans && npx tsc --noEmit` then `npx vitest run <closest tests>` |
| `src/services/structureAiGuard.ts` | also `cd plans && npx vitest run tests/structure/ai.test.ts tests/customViews/ai.test.ts` |
| `plans/` before a push that ships it | `cd plans && npm run build` (tsc + vite + .rbz, same as the Dockerfile stage) |
| `plans/sketchup/**` | `ruby plans/sketchup/test_core.rb && ruby plans/sketchup/test_main_smoke.rb` (needs `LANG=C.UTF-8`); new Ruby file ⇒ add it to `plans/scripts/build-rbz.mjs` (checked by `tests/rbz.test.ts`) |
| `public/js/*.js` | `node --check public/js/<file>.js` — non-module scripts sharing globals, load order = file number |
| UI behaviour in `plans/` | the matching e2e script, see the `vem-e2e` skill |

Choosing tests in `plans/tests/`: same folder name as the source (`structure/`, `loading/`, `customViews/`, `paint/`, `sheets/`). Run the whole suite (`npx vitest run`, several minutes) when touching shared core code (`core/`, `linework/`, `structure/core/fem/`, `sheets/SheetSvg.tsx`, `sheets/generate.ts`).

Safety nets that must stay green unless the change is intended — see `vem-safety-nets`: `tests/vs1-baseline.test.ts`, `tests/structure/s12-baseline.test.ts`, generated-file checks in `tests/loading/import.test.ts` / `odoo.test.ts`.

Dockerfile trap: the `plans/` build stage only sees `plans/` plus `src/services/structureAiGuard.ts`. Any other file outside `plans/` imported by plans code or tests must be copied there too, or Railway fails.

Before pushing, re-read the diff (`git diff --stat`, then `git diff`) for leftovers: debug logs, `.only`, files from `plans/reference-reports/` or `test-models/` (confidential, ignored — never force-add them).

Report results honestly: say which commands ran and quote any failure.
