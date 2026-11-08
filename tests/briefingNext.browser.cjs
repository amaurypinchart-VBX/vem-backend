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
  fields: {
    url: "https://res.cloudinary.com/demo/image/upload/v1/briefing.pdf",
  },
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

const templateRecords = [];
app.get("/api/v1/briefings/project/p/templates", (req, res) =>
  res.json({ success: true, data: templateRecords }),
);
app.put("/api/v1/briefings/project/p/templates/:id", (req, res) => {
  const parsed =
    require("../dist/services/briefingDocument").briefingTemplateSchema.safeParse(
      req.body.blueprint,
    );
  if (!parsed.success)
    return res.status(400).json({ error: "Modèle invalide" });
  let t = templateRecords.find((t) => t.id === req.params.id);
  if (!t) {
    t = { id: req.params.id, name: req.body.name, blueprint: parsed.data };
    templateRecords.push(t);
  }
  res.json({ success: true, data: t });
});
app.delete("/api/v1/briefings/project/p/templates/:id", (req, res) => {
  const i = templateRecords.findIndex((t) => t.id === req.params.id);
  if (i >= 0) templateRecords.splice(i, 1);
  res.json({ success: true });
});
app.get("/api/v1/briefings/project/p/pdf/pdf", (req, res) =>
  res.json({
    success: true,
    data: {
      pages: 3,
      url: "https://res.cloudinary.com/demo/image/upload/v1/briefing.pdf",
      name: "Plan PDF",
    },
  }),
);
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
    '<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/css/briefing-next.css"></head><body><script>function toast(){};function loadDetailBriefing(){};function openChecklistFull(){}</script><script src="/js/briefing-next-model.js"></script><script src="/js/briefing-next-graphics.js"></script><script src="/js/briefing-next.js"></script><script>openBriefingNext("b")</script></body></html>',
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
      const context = await browser.newContext({
        viewport: { width: 1550, height: 1000 },
      });
      const page = await context.newPage();
      let failPdfPage = false;
      await context.route(
        "https://res.cloudinary.com/demo/image/upload/**",
        (route) => {
          const match = route
            .request()
            .url()
            .match(/pg_(\d+)/);
          if (!match || failPdfPage) return route.abort();
          return route.fulfill({
            contentType: "image/svg+xml",
            body: `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><rect width="600" height="800" fill="#edf0f5"/><text x="40" y="100" font-size="30">PDF — PAGE ${match[1]}</text><path d="M 60 150 H 500 V 700 H 60 Z" stroke="#000a3d" stroke-width="6" fill="none"/></svg>`,
          });
        },
      );
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
      await page.locator("aside fieldset").scrollIntoViewIfNeeded();
      assert.ok(
        await page
          .locator("main .bn-photo-frame")
          .first()
          .evaluate((n) => n.getBoundingClientRect().height <= 501),
      );
      await page.screenshot({
        path: path.join(out, "studio-next-brand-crop.png"),
      });
      // Free composition: actual SVG interactions, semantic persistence and history.
      await page.locator("[data-action=addGraphic]").click();
      const editor = page.locator(".bn-graphic-editor");
      await editor.locator("[data-g-background]").selectOption("f1");
      const prop = async (key, value) => {
        const field = editor.locator(`[data-g-prop=${key}]`);
        await field.fill(String(value));
        await field.dispatchEvent("change");
      };
      await editor.locator("[data-g=add-text]").click();
      await prop("text", "SCHÉMA LOGISTIQUE — DÉMONSTRATION");
      await prop("width", 850);
      await prop("x", 60);
      await prop("y", 40);
      const handle = await editor.locator("[data-resize]").boundingBox();
      await page.mouse.move(handle.x + 6, handle.y + 6);
      await page.mouse.down();
      await page.mouse.move(handle.x - 70, handle.y + 6, { steps: 5 });
      await page.mouse.up();
      assert.equal(
        await editor.locator("[data-g-prop=fontSize]").inputValue(),
        "28",
      );
      assert.ok(
        Number(await editor.locator("[data-g-prop=width]").inputValue()) < 850,
      );
      await editor.locator("[data-g=add-rect]").click();
      await prop("x", 80);
      await prop("y", 380);
      await prop("width", 300);
      await prop("height", 120);
      const rect = await editor.locator("[data-node] rect").boundingBox();
      await page.mouse.move(rect.x + 20, rect.y + 20);
      await page.mouse.down();
      await page.mouse.move(rect.x + 60, rect.y + 40, { steps: 5 });
      await page.mouse.up();
      assert.ok(
        Number(await editor.locator("[data-g-prop=x]").inputValue()) > 80,
      );
      await editor.locator("[data-g=undo]").click();
      await editor.locator("[data-g=add-marker]").click();
      await prop("x", 150);
      await prop("y", 400);
      await prop("text", "Zone de déchargement à confirmer");
      await editor.locator("[data-g=add-arrow]").click();
      await prop("x", 400);
      await prop("y", 400);
      await prop("width", 250);
      await prop("height", 80);
      await prop("rotation", 30);
      assert.match(await editor.locator('[data-node]').last().getAttribute('transform'), /rotate\(30 /);
      await editor.locator('[data-g=undo]').click();
      assert.match(await editor.locator('[data-node]').last().getAttribute('transform'), /rotate\(0 /);
      await editor.locator('[data-g=redo]').click();
      await editor.locator("svg").focus();
      await page.keyboard.press("Control+a");
      await editor.locator("[data-g=group]").click();
      await editor.locator("svg").focus();
      await page.keyboard.press("ArrowRight");
      await editor.locator("[data-g=lock]").click();
      const lockedGraphic = await editor.locator("svg").innerHTML();
      await editor.locator("svg").focus();
      await page.keyboard.press("ArrowRight");
      assert.equal(await editor.locator("svg").innerHTML(), lockedGraphic);
      await editor.locator("[data-g=lock]").click();
      await editor.locator("[data-g=duplicate]").click();
      assert.equal(await editor.locator("[data-node]").count(), 8);
      await editor.locator("[data-g=undo]").click();
      assert.equal(await editor.locator("[data-node]").count(), 4);
      await page.screenshot({
        path: path.join(out, "studio-next-free-composition.png"),
      });
      await editor.locator("[data-g=apply]").click();
      await page.locator("[data-action=save]").click();
      await page.waitForFunction(() =>
        document.querySelector(".bn-status").textContent.includes("Enregistré"),
      );
      const graphic = row.document.pages[0].blocks.find(
        (b) => b.kind === "graphic",
      );
      assert.equal(graphic.graphic.nodes.length, 4);
      assert.equal(graphic.graphic.nodes[3].rotation, 30);
      assert.equal(new Set(graphic.graphic.nodes.map((n) => n.group)).size, 1);
      assert.equal(graphic.graphic.nodes[0].x, 61);
      assert.equal(graphic.source.id, "f1");
      await page.locator("[data-action=undo]").click();
      assert.equal(await page.locator("main .bn-graphic-visual").count(), 0);
      await page.locator("[data-action=redo]").click();
      await page.locator("[data-action=save]").click();
      await page.waitForFunction(() =>
        document.querySelector(".bn-status").textContent.includes("Enregistré"),
      );
      await page.reload();
      await page.locator("main .bn-graphic-visual").click();
      await page.locator("[data-action=editGraphic]").click();
      assert.equal(await editor.locator("[data-node]").count(), 4);
      assert.match(await editor.locator("[data-node]").last().getAttribute("transform"), /rotate\(30 /);
      await editor.locator("[data-g=cancel]").click();

      // Portable template: no project prose/assets, explicit new source bindings, undo.
      await page.locator("[data-action=templates]").click();
      await page.locator("[name=template-name]").fill("Gabarit QA");
      await page.locator("[data-submit]").click();
      await page.locator(".bn-dialog-wrap").waitFor({ state: "detached" });
      assert.equal(templateRecords.length, 1);
      const portable = JSON.stringify(templateRecords[0].blueprint);
      assert.ok(!portable.includes("Zone de déchargement"));
      assert.ok(!portable.includes("/demo-image"));
      assert.ok(!portable.includes("SCHÉMA LOGISTIQUE"));
      await page.locator("[data-action=templates]").click();
      await page.locator('[data-template-use="0"]').click();
      await page.locator('[data-template-bind="0:0"]').selectOption("task:t0");
      await page.locator("[data-submit]").click();
      await page.locator("[data-action=save]").click();
      await page.waitForFunction(() =>
        document.querySelector(".bn-status").textContent.includes("Enregistré"),
      );
      assert.equal(row.document.pages.length, 50);
      assert.equal(row.document.pages[25].blocks[0].source.id, "t0");
      assert.equal(row.document.pages[25].blocks[1].source, undefined);
      await page.locator("[data-action=undo]").click();
      await page.locator("[data-action=save]").click();
      await page.waitForFunction(() =>
        document.querySelector(".bn-status").textContent.includes("Enregistré"),
      );
      assert.equal(row.document.pages.length, 25);
      await page.locator('[data-action=page][data-index="0"]').click();
      // A failed preview must add no partial PDF pages.
      await page.locator("[data-action=pdfImport]").click();
      await page.locator("[name=pdf-pages]").fill("1,3");
      failPdfPage = true;
      await page.locator("[data-submit]").click();
      await page
        .locator("[data-error]")
        .filter({ hasText: "Aperçu indisponible" })
        .waitFor();
      assert.equal(row.document.pages.length, 25);
      failPdfPage = false;
      await page.locator("[data-submit]").click();
      await page.locator(".bn-dialog-wrap").waitFor({ state: "detached" });
      await page.locator("[data-action=save]").click();
      await page.waitForFunction(() =>
        document.querySelector(".bn-status").textContent.includes("Enregistré"),
      );
      assert.deepEqual(
        row.document.pages.slice(-2).map((p) => p.blocks[0].pdf.page),
        [1, 3],
      );
      await page.reload();
      await page.locator('[data-action=page][data-index="25"]').click();
      await page.locator(".bn-pdf-page img").waitFor();
      await page.screenshot({
        path: path.join(out, "studio-next-pdf-page.png"),
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
      assert.equal(
        await frame.locator(".bn-photo-frame:not(.bn-pdf-page)").count(),
        20,
      );
      assert.ok(
        (await frame.locator(".bn-kicker").first().innerText()).includes(
          "ACME QA",
        ),
      );
      assert.equal(await frame.locator(".bn-graphic-visual svg").count(), 1);
      assert.match(await frame.locator(".bn-graphic-visual [data-node]").last().getAttribute("transform"), /rotate\(30 /);
      assert.equal(
        await frame.locator(".bn-graphic-visual svg image").count(),
        1,
      );
      assert.ok(
        (await frame.locator("body").innerText()).includes(
          "Zone de déchargement à confirmer",
        ),
      );
      assert.equal(await frame.locator(".bn-pdf-page").count(), 2);
      assert.equal(await frame.locator('a[href$="#page=1"]').count(), 1);
      assert.equal(await frame.locator('a[href$="#page=3"]').count(), 1);
      const html = await frame.content();
      const printPage = await context.newPage();
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
      // Dedicated full-page composition: persist, reopen, vector export in both formats.
      for (const [format, canvasHeight] of [["a4", 1414], ["wide", 562.5]]) {
        await page.locator("[data-doc=format]").selectOption(format);
        await page.locator("[data-action=addGraphicPage]").click();
        await editor.locator("[data-g=add-text]").click();
        await prop("text", "PAGE LIBRE " + format);
        await prop("y", canvasHeight - 150);
        await editor.locator("[data-g=apply]").click();
        await page.locator("[data-action=save]").click();
        await page.waitForFunction(() => document.querySelector(".bn-status").textContent.includes("Enregistré"));
        assert.equal(row.document.pages.at(-1).blocks[0].graphic.height, canvasHeight);
        await page.reload();
        await page.locator('[data-action=page]').last().click();
        assert.equal(await page.locator("main svg").getAttribute("viewBox"), `0 0 1000 ${canvasHeight}`);
        await page.locator("[data-action=export]").click();
        await page.locator("[data-export-page]").evaluateAll(nodes => nodes.forEach((n, i) => n.checked = i === nodes.length - 1));
        await page.locator("[data-submit]").click();
        await page.getByRole("button", { name:"Imprimer / Enregistrer en PDF", exact:true }).waitFor({timeout:30000});
        const freeFrame = page.frames().find(f => f !== page.mainFrame());
        assert.equal(await freeFrame.locator(".bn-paper").count(), 1);
        assert.equal(await freeFrame.locator(".bn-free-page svg").count(), 1);
        assert.equal(await freeFrame.locator(".bn-page-content").evaluateAll(ns => ns.filter(n => n.scrollHeight > n.clientHeight + 1).length), 0);
        console.log("FREE_PAGE_GEOMETRY", format, await freeFrame.locator(".bn-paper").evaluate(p => ({html:p.outerHTML, rects:[...p.querySelectorAll('.bn-page-content,.bn-block,.bn-fields,.bn-graphic-visual,svg,[data-node],tspan')].map(n=>({tag:n.tagName,cls:n.getAttribute('class'),rect:n.getBoundingClientRect().toJSON()}))})));
        await freeFrame.locator(".bn-paper").screenshot({path:path.join(out, `free-page-${format}.png`)});
        await page.getByRole("button", { name:"Fermer l’aperçu" }).click();
      }
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
          "save/reopen, theme, refresh, annotation, mobile, private portable templates and explicit destination links, selected PDF pages/failure atomicity, brand, photo focal crop, free graphic groups/lock/keyboard/copy/undo/persistence/vector export, A4/16:9 pagination, selective export, all tasks/images, native TSV paste, 409 conflict",
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
