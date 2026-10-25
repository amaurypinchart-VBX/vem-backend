---
name: vem-safety-nets
description: Baselines, cache versions and generated files in plans/ that must not change by accident (VS1 linework baseline, S12 structure baseline, LINEWORK_ENGINE, generated loading / Odoo / catalogue / font-metric files, golden loading benches). Use before changing the 2D engine, sheets, structure calculation, loading rules, or when one of these tests fails.
---

# Safety nets of Plans Viewbox

| Net | What it protects | Intended change ⇒ |
|---|---|---|
| `tests/vs1-baseline.test.ts` (+ `tests/baseline/vs1-synthetic.json`) | every existing 2D view + cache key, generated sheets (fit + auto dims), PDF / DXF entity counts | `VS1_BASELINE_UPDATE=1 npx vitest run tests/vs1-baseline.test.ts`, say why in the commit; `VS1_REAL=1` also runs `test-models/*.zip` (≈ 6 min) |
| `LINEWORK_ENGINE` in `linework/provider.ts` | IndexedDB + server linework cache | bump it when the engine output changes; decorations (marks, colours, paint, overlays) must stay outside the base linework key |
| `tests/structure/s12-baseline.test.ts` (+ `tests/structure/baseline/`) | η, reactions, stability, plywood, calage, report texts of Viewbox studies | `S12_BASELINE_UPDATE=1` only when Viewbox results are meant to change; new structure types must leave Viewbox-only inputs and `inputKey` identical |
| Statico / SCIA calibration tests (`ec3`, `ground`, `plywood`, `jointDesign`, `calibration-*`) | exact reference values from the engineering reports | never loosen a tolerance to make them pass — find the cause |
| `tests/loading/import.test.ts`, `odoo.test.ts` | generated `loading/library/seed.ts`, `catalogue.ts`, `odoo.data.ts`, `docs/loading/rapport-import.md` | never edit them by hand: change `importClasseur.ts` / `decisions.ts` / the workbook, then `node scripts/import-loading-rules.mjs` (or `import-odoo.mjs`) |
| `tests/loading/bench.test.ts` + `src/loading/benches/*.json` | golden loading lists (Klokgebouw, 6059, 6060, OACE) | gaps must be explained in `known` with a dated question to Amaury; `LOADING_BENCH_WRITE=1` rewrites topology snapshots |
| Generated data | `structure/library/catalogBE.data.ts` (`scripts/import-metaux.mjs`), `structure/report/metrics.data.ts` (`scripts/arimo-metrics.mjs`), `sheets/details/profiles.ts` (`scripts/extract-detail.py`) | regenerate with the script, never by hand |
| `tests/rbz.test.ts` | SketchUp extension file list in `scripts/build-rbz.mjs` | add new Ruby / HTML files to the list |

Rules that keep coming back:
- **No number from AI** in structure / loading / views: everything is computed by pure, tested TypeScript; AI answers are proposals validated by a human (guards in `src/services/structureAiGuard.ts`).
- Nothing invented in loading: missing rule → « règle manquante », missing info → a question.
- Desktop must stay pixel-identical when changing mobile code (`e2e/run-desktop-shots.mjs`).
- `plans/reference-reports/` and `test-models/` are confidential and ignored; tests depending on them skip when absent.
