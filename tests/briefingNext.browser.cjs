/* Run with Playwright installed, or CODEX_PRIMARY_RUNTIME_NODE_MODULES pointing to the supplied runtime. */
const { chromium } = require(require.resolve("playwright"));
const express = require("express"),
  assert = require("node:assert/strict"),
  fs = require("fs"),
  path = require("path");
const M = require("../public/js/briefing-next-model");
const app = express();
app.use(express.json({ limit: "10mb" }));
app.use(express.static(path.join(__dirname, "../public")));
app.get("/demo-image.png", (req, res) =>
  res
    .type("svg")
    .send(
      '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400"><rect width="800" height="400" fill="#e8edf5"/><rect x="80" y="90" width="640" height="220" fill="none" stroke="#000a3d" stroke-width="6"/><text x="120" y="200" font-size="30" fill="#000a3d">IMAGE SYNTHÉTIQUE — DÉMONSTRATION</text></svg>',
    ),
);
app.get("/demo-plan.pdf", async (req, res) => {
  const { PDFDocument } = require("pdf-lib");
  const pdf = await PDFDocument.create();
  for (let i = 0; i < 3; i++)
    pdf.addPage().drawText("DEMONSTRATION - PLAN " + (i + 1));
  res.type("pdf").send(Buffer.from(await pdf.save()));
});
let sources = Array.from({ length: 50 }, (_, i) => ({
  kind: "task",
  id: "t" + i,
  block: "tasks",
  title: `Action ${String(i + 1).padStart(2, "0")} — Vérifier les éléments de façade`,
  fields: {
    title: `Action ${i + 1}`,
    description:
      i === 0
        ? "Contrôle à confirmer avec le responsable. ".repeat(180)
        : "Contrôler les éléments prévus et signaler les points à confirmer.",
    responsible: "Équipe de démonstration",
    priority: i % 7 === 0 ? "critical" : "normal",
    status: i % 3 === 0 ? "done" : "todo",
    date: "2026-11-05T08:00:00Z",
  },
}));
sources.push({
  kind: "project",
  id: "p",
  block: "summary",
  title: "DÉMONSTRATION — Installation Viewbox",
  fields: {
    name: "DÉMONSTRATION — Installation Viewbox",
    address: "Adresse fictive · non utilisable sur chantier",
    instructions:
      "Jeu synthétique de recette. Aucune validation technique réelle.",
  },
});
for (let i = 0; i < 5; i++)
  sources.push({
    kind: "checklist",
    id: "q" + i,
    block: "quality",
    title: "Contrôle de démonstration " + i,
    fields: {
      phase: "installation",
      status: ["pending", "ok", "nok", "partial", "na"][i],
      photoRequired: "true",
      comment: "Données de démonstration",
    },
  });
for (let i = 0; i < 20; i++)
  sources.push({
    kind: "file",
    id: "f" + i,
    block: "photo",
    title: "Image de démonstration " + i,
    fields: {
      url: "/demo-image.png?image=" + i,
      caption:
        i === 0
          ? "Légende longue à conserver après la photo. ".repeat(120)
          : "Photo de recette",
    },
  });
sources.push({
  kind: "file",
  id: "pdf",
  block: "plan",
  title: "Plan PDF de démonstration (3 pages)",
  fields: { url: "/demo-plan.pdf" },
});
const d = M.generate("p", "DÉMONSTRATION · Briefing chantier", sources, {
  selected: sources.filter((s) => s.kind === "task").map(M.key),
});
d.pages = Array.from({ length: 25 }, (_, i) => ({
  id: M.uid(),
  title: i === 0 ? "Priorités du chantier" : "Actions · séquence " + (i + 1),
  blocks: d.pages[0].blocks.slice(i * 2, i * 2 + 2),
}));
for (let i = 0; i < 20; i++)
  d.pages[i].blocks.push(M.block(sources.find((s) => s.id === "f" + i)));
for (let i = 0; i < 5; i++)
  d.pages[i].blocks.push(M.block(sources.find((s) => s.id === "q" + i)));
let row = {
    id: "b",
    projectId: "p",
    title: d.title,
    document: d,
    revision: 0,
    slides: [
      { title: "Original conservé", blocks: [{ text: "Ancienne consigne" }] },
    ],
  },
  pub = [];
app.get("/api/v1/briefings/b", (req, res) =>
  res.json({ success: true, data: row }),
);
app.get("/api/v1/briefings/project/p/sources", (req, res) =>
  res.json({
    success: true,
    data: sources,
    permissions: { write: true, checklists: true },
  }),
);
app.put("/api/v1/briefings/b/document", (req, res) => {
  if (req.body.revision !== row.revision)
    return res
      .status(409)
      .json({ success: false, error: "Conflit de révision" });
  row.document = req.body.document;
  row.revision++;
  res.json({ success: true, data: { revision: row.revision } });
});
app.get("/api/v1/briefings/b/publications", (req, res) =>
  res.json({ success: true, data: pub }),
);
app.post("/api/v1/briefings/b/publish", (req, res) => {
  const v = {
    id: "v",
    revision: row.revision,
    document: structuredClone(row.document),
    createdAt: new Date().toISOString(),
  };
  pub.push(v);
  res.json({ success: true, data: v });
});
app.get("/blank", (req, res) =>
  res.send("<!doctype html><html><body></body></html>"),
);
app.get("/demo", (req, res) =>
  res.send(
    '<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/css/briefing-next.css"></head><body><script>function toast(){};function loadDetailBriefing(){};function openChecklistFull(){}</script><script src="/js/briefing-next-model.js"></script><script src="/js/briefing-next.js"></script><script>openBriefingNext("b")</script></body></html>',
  ),
);
if (process.env.BRIEFING_DEMO_ONLY) {
  app.listen(4317, () => console.log("Demo: http://localhost:4317/demo"));
} else
  (async () => {
    const server = app.listen(0);
    let browser;
    try {
      browser = await chromium.launch({
        headless: true,
        ...(process.env.CHROMIUM_PATH
          ? { executablePath: process.env.CHROMIUM_PATH }
          : {}),
      });
      const page = await browser.newPage({
        viewport: { width: 1550, height: 1000 },
      });
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      const start = Date.now();
      await page.goto("http://127.0.0.1:" + server.address().port + "/demo");
      await page.locator(".bn-block").first().waitFor();
      const openMs = Date.now() - start;
      const out = path.join(__dirname, "../docs/briefing-next");
      fs.mkdirSync(out, { recursive: true });
      await page.locator('[data-action=page][data-index="1"]').click();
      await page.screenshot({
        path: path.join(out, "studio-next-signature.png"),
      });
      await page.locator('[data-action=page][data-index="0"]').click();
      await page.locator("[data-theme=editorial]").click();
      await page.locator("[data-action=save]").click();
      await page.waitForFunction(() =>
        document.querySelector(".bn-status").textContent.includes("Enregistré"),
      );
      const stored = structuredClone(row.document);
      assert.equal(
        stored.pages.flatMap((p) => p.blocks).filter((b) => b.kind === "tasks")
          .length,
        50,
      );
      assert.equal(stored.theme, "editorial");
      await page.reload();
      await page.locator(".bn-editorial").waitFor();
      assert.equal(row.document.theme, "editorial");
      await page.locator("[data-block]").first().click();
      await page
        .locator("[data-block-field=annotation]")
        .fill("Annotation préservée : confirmer la zone de grue.");
      await page.locator("[data-block-field=annotation]").press("Tab");
      sources[0].fields.status = "blocked";
      await page.locator("[data-action=refresh]").click();
      await page.locator("[data-submit]").click();
      await page.locator("[data-action=save]").click();
      await page.waitForFunction(() =>
        document.querySelector(".bn-status").textContent.includes("Enregistré"),
      );
      assert.equal(
        row.document.pages[0].blocks[0].annotation,
        "Annotation préservée : confirmer la zone de grue.",
      );
      assert.equal(row.document.pages[0].blocks[0].content.status, "blocked");
      await page.locator("[data-action=preview]").click();
      await page.screenshot({
        path: path.join(out, "studio-next-field-view.png"),
      });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.locator("main").evaluate((n) => {
        n.scrollTop = n.querySelector(".bn-paper").offsetHeight + 28;
      });
      await page.screenshot({ path: path.join(out, "studio-next-mobile.png") });
      assert.ok(
        await page
          .locator("main")
          .evaluate((n) => n.scrollWidth <= n.clientWidth + 1),
      );
      await page.setViewportSize({ width: 1550, height: 1000 });
      await page.locator("[data-action=preview]").click();
      // Persisted brand and non-destructive crop must survive reload and print.
      await page.locator("[data-action=brand]").click();
      await page.locator("[name=brand-name]").fill("ACME QA");
      await page.locator("[data-submit]").click();
      await page.locator("main .bn-photo-frame").first().click();
      await page.locator("[data-image=ratio]").selectOption("portrait");
      await page.locator("[data-image=x]").fill("20");
      await page.locator("[data-image=x]").dispatchEvent("change");
      await page.locator("[data-action=save]").click();
      await page.waitForFunction(() =>
        document.querySelector(".bn-status").textContent.includes("Enregistré"),
      );
      assert.equal(row.document.brand.name, "ACME QA");
      assert.equal(
        row.document.pages.flatMap((p) => p.blocks).find((b) => b.image).image
          .x,
        20,
      );
      await page.reload();
      await page.locator("main .bn-photo-frame").first().click();
      assert.equal(
        await page.locator("[data-image=ratio]").inputValue(),
        "portrait",
      );
      assert.equal(await page.locator("[data-image=x]").inputValue(), "20");
      await page
        .locator("main .bn-photo-frame")
        .first()
        .scrollIntoViewIfNeeded();
      await page.screenshot({
        path: path.join(out, "studio-next-brand-crop.png"),
      });
      await page.locator("[data-doc=format]").selectOption("a4");
      await page.locator("[data-action=save]").click();
      const exportStart = Date.now();
      await page.locator("[data-action=export]").click();
      await page.locator("[data-submit]").click();
      await page
        .getByRole("button", {
          name: "Imprimer / Enregistrer en PDF",
          exact: true,
        })
        .waitFor({ timeout: 30000 });
      const paginationMs = Date.now() - exportStart;
      const frame = page.frames().find((f) => f !== page.mainFrame());
      const pages = await frame.locator(".bn-paper").count();
      assert.ok(pages >= 25);
      const overflow = await frame
        .locator(".bn-page-content")
        .evaluateAll(
          (nodes) =>
            nodes.filter((n) => n.scrollHeight > n.clientHeight + 1).length,
        );
      assert.equal(overflow, 0);
      const text = await frame.locator("body").innerText();
      for (let i = 1; i <= 50; i++)
        assert.ok(text.includes("Action " + i), "Missing action " + i);
      assert.equal(await frame.locator(".bn-photo-frame").count(), 20);
      assert.ok(
        (await frame.locator(".bn-kicker").first().innerText()).includes(
          "ACME QA",
        ),
      );
      const html = await frame.content();
      const printPage = await browser.newPage();
      await printPage.goto(
        "http://127.0.0.1:" + server.address().port + "/blank",
      );
      await printPage.setContent(
        html.replace(
          'href="/css/briefing-next.css"',
          `href="http://127.0.0.1:${server.address().port}/css/briefing-next.css"`,
        ),
      );
      assert.equal(await printPage.locator("header,nav,aside").count(), 0);
      assert.equal(await printPage.locator(".bn-paper").count(), pages);
      await printPage.pdf({
        path: path.join(out, "demo-briefing-a4.pdf"),
        preferCSSPageSize: true,
        printBackground: true,
      });
      await printPage.close();
      await page.getByRole("button", { name: "Fermer l’aperçu" }).click();
      // Wide layout and selective export use the same immutable snapshot.
      await page.locator("[data-doc=format]").selectOption("wide");
      await page.locator("[data-action=export]").click();
      await page
        .locator("[data-export-page]")
        .evaluateAll((nodes) => nodes.forEach((n, i) => (n.checked = i === 0)));
      await page.locator("[data-submit]").click();
      await page
        .getByRole("button", {
          name: "Imprimer / Enregistrer en PDF",
          exact: true,
        })
        .waitFor({ timeout: 30000 });
      const wideFrame = page.frames().find((f) => f !== page.mainFrame());
      assert.equal(await wideFrame.locator(".bn-photo-frame").count(), 1);
      assert.ok(
        (await wideFrame.locator("body").innerText()).includes("Action 1"),
      );
      assert.ok(
        !(await wideFrame.locator("body").innerText()).includes("Action 50"),
      );
      assert.equal(
        await wideFrame
          .locator(".bn-page-content")
          .evaluateAll(
            (nodes) =>
              nodes.filter((n) => n.scrollHeight > n.clientHeight + 1).length,
          ),
        0,
      );
      await page.getByRole("button", { name: "Fermer l’aperçu" }).click();
      // System paste must reach the paste event, not be swallowed by editor shortcuts.

      await page.evaluate(() => {
        const dt = new DataTransfer();
        dt.setData("text/plain", "Quantité\tDésignation\n12\tÉquerres");
        document.querySelector("main").dispatchEvent(
          new ClipboardEvent("paste", {
            clipboardData: dt,
            bubbles: true,
            cancelable: true,
          }),
        );
      });
      assert.ok(
        await page
          .locator("main")
          .innerText()
          .then((t) => t.includes("Équerres")),
      );
      await page.locator("[data-action=save]").click();
      // Concurrent tab simulation: bump the authoritative server revision, then edit locally.
      row.revision++;
      await page.locator("[data-doc=title]").fill("Copie locale en conflit");
      await page.locator("[data-doc=title]").press("Tab");
      await page.locator("[data-action=save]").click();
      await page.locator("[data-action=backup]").waitFor();
      assert.notEqual(row.document.title, "Copie locale en conflit");
      assert.deepEqual(errors, []);
      const report = {
        environment:
          "Chromium headless / Linux / mocked authenticated API / synthetic data",
        openMs,
        paginationMs,
        exportAndVerificationMs: Date.now() - exportStart,
        pages,
        overflow,
        sourceTasks: 50,
        fixturePages: 25,
        availableImages: 20,
        checks:
          "save/reopen, theme, refresh, annotation, mobile, brand, photo focal crop, A4/16:9 pagination, selective export, all tasks/images, native TSV paste, 409 conflict",
        limitations:
          "No PostgreSQL, live auth, Cloudinary, real translation or production data in this browser harness.",
      };
      fs.writeFileSync(
        path.join(out, "qa-browser.json"),
        JSON.stringify(report, null, 2),
      );
      console.log(report);
    } finally {
      await browser?.close();
      server.close();
    }
  })().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
