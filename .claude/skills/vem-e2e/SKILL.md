---
name: vem-e2e
description: Run Plans Viewbox in a real browser against the mock VEM backend (plans/e2e/server.mjs + Playwright scripts run-*.mjs), take screenshots, check downloaded PDF / DXF / Excel files. Use to run or show the app, or to confirm a UI change in plans/ works (sheets, structure, loading, special views, paint, mobile…).
---

# Browser tests of Plans Viewbox

The real VEM backend needs PostgreSQL + Cloudinary, so UI checks go through the in-memory mock `plans/e2e/server.mjs` (port 4173, serves `public/plans`).

```bash
cd plans
npm run build                      # → ../public/plans (rebuild after every source change)
npm run e2e:fixture                # → e2e/fixture.zip (synthetic SketchUp export)
node e2e/server.mjs > /tmp/vem-e2e-server.log 2>&1 &   # restart it before each script: state is in memory
node e2e/run-<feature>.mjs         # ✓ / ✗ lines, exit code 1 on a failure
```

- `$CHROMIUM` is set by the SessionStart hook (preinstalled headless shell under `/opt/pw-browsers`); every script reads it. Never run `playwright install`.
- Screenshots and downloads land in `plans/e2e/shots/` (gitignored): look at the PNGs with the Read tool; check PDFs with `pdfinfo` / `pdffonts` / `pdftoppm -png`, DXF with ezdxf (pip-install it in the scratchpad), Excel with openpyxl or `soffice --headless --convert-to pdf`.
- Fixture variants: `E2E_FIXTURE_HEAVY=3000` (phone memory), `E2E_FIXTURE_VBX4` (supports); real model: `ZIP=../test-models/<file>.zip` when present.
- Mock knobs: `PORT`, `NO_SHARE=1` (ignore shared views). Add a mock route in `server.mjs` when a new backend endpoint is called.
- Stop the server afterwards: `pkill -f e2e/server.mjs`.

Which script: `run-sheets` (editor), `run-titleblock`, `run-units`, `run-duplicate`, `run-pdf`, `run-dxf`, `run-symbols`, `run-paint`, `run-special-views`, `run-captures`, `run-facade`, `run-mobile` (+ `run-memory`, `run-phone-generate`), `run-desktop-shots` (pixel check of desktop vs previous build), `run-structure` (6 steps), `run-site`, `run-calage`, `run-calage-tuv`, `run-levels`, `run-supports`, `run-variants`, `run-accessories`, `run-advisor`, `run-frame`, `run-model-ai`, `run-loading`.

A new UI feature gets a new or extended `run-*.mjs` in the same style (`check(cond, label)`, console errors collected and printed at the end).
