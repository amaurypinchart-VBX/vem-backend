const { test } = require("node:test"),
  assert = require("node:assert/strict");
const M = require("../public/js/briefing-next-model");
const {
  documentSchema,
  briefingTemplateSchema,
  validateSources,
} = require("../dist/services/briefingDocument");
const { cloudinaryPdf, pdfPageCount } = require("../dist/services/briefingPdf");
const { PDFDocument } = require("pdf-lib");
const url = "https://res.cloudinary.com/demo/image/upload/v1/test.pdf";
test("template strips project data, source IDs, titles, annotations and graphic text/background", () => {
  const d = M.generate("SECRET-PROJECT", "SECRET-TITLE", [
    {
      kind: "task",
      id: "SECRET-TASK",
      title: "SECRET-TASK-TITLE",
      block: "tasks",
      fields: { description: "SECRET-DESCRIPTION" },
    },
  ]);
  const b = d.pages[0].blocks[0];
  b.annotation = "SECRET-ANNOTATION";
  b.style = { color: "#abcdef" };
  d.pages[0].blocks.push({
    id: "g",
    kind: "graphic",
    layout: "list",
    mode: "custom",
    content: { url: "SECRET-URL" },
    baseline: {},
    annotation: "",
    title: "SECRET-GRAPHIC",
    graphic: {
      width: 1000,
      height: 600,
      backgroundId: "SECRET-FILE",
      nodes: [
        {
          id: "SECRET-ID",
          type: "text",
          x: 20,
          y: 20,
          width: 300,
          height: 50,
          text: "SECRET-TEXT",
          group: "SECRET-GROUP",
          font: "Arial",
          fontSize: 20,
          fill: "#ffffff",
          stroke: "#000a3d",
          strokeWidth: 1,
          direction: "right",
        },
      ],
    },
  });
  const t = M.templateFrom(d);
  assert.ok(!JSON.stringify(t).includes("SECRET"));
  assert.ok(briefingTemplateSchema.safeParse(t).success);
  assert.deepEqual(t.pages[0].blocks[0].style, b.style);
  const before = JSON.stringify(d);
  const n = M.instantiateTemplate(
    t,
    "destination",
    "New",
    [
      {
        kind: "task",
        id: "new-task",
        block: "tasks",
        title: "Destination task",
        fields: { status: "todo" },
      },
    ],
    { "0:0": "task:new-task" },
  );
  assert.ok(documentSchema.safeParse(n).success);
  assert.equal(n.projectId, "destination");
  assert.equal(n.pages[0].blocks[0].source.id, "new-task");
  assert.notEqual(n.pages[0].blocks[0].id, b.id);
  assert.equal(JSON.stringify(d), before);
  assert.throws(() =>
    M.instantiateTemplate(t, "destination", "N", [], {
      "0:0": "task:SECRET-TASK",
    }),
  );
  const unsafe = structuredClone(t);
  unsafe.pages[0].blocks[0].content = { secret: "leak" };
  assert.equal(briefingTemplateSchema.safeParse(unsafe).success, false);
  unsafe.pages[0].blocks[1].graphic.nodes[0].text = "Client secret";
  assert.equal(briefingTemplateSchema.safeParse(unsafe).success, false);
});
test("PDF ranges are exact, deduplicated and reject omissions or invalid ranges", () => {
  assert.deepEqual(M.pdfPages("1, 3-5, 3", 5), [1, 3, 4, 5]);
  for (const input of ["", "0", "4-2", "1-501", "abc", "1,", "1-51"])
    assert.throws(() => M.pdfPages(input, 50));
  assert.equal(
    M.pdfPreview(url, 2),
    "https://res.cloudinary.com/demo/image/upload/f_png,c_limit,w_2000,pg_2/v1/test.png",
  );
  for (const unsafe of [
    "http://127.0.0.1/x.pdf",
    "https://res.cloudinary.com.evil.test/demo/image/upload/a.pdf",
    "https://user@res.cloudinary.com/demo/image/upload/a.pdf",
    "https://res.cloudinary.com/demo/raw/upload/a.pdf",
  ]) {
    assert.throws(() => cloudinaryPdf(unsafe));
    assert.equal(M.pdfPreview(unsafe, 1), "");
  }
});
test("PDF source URL cannot be replaced with an unrelated file", () => {
  const source = {
    kind: "file",
    id: "pdf",
    block: "plan",
    title: "Plan",
    fields: { url },
  };
  const d = M.generate("p", "PDF", [source]);
  d.pages[0].blocks[0].pdf = { page: 2 };
  validateSources(d, [source]);
  assert.ok(documentSchema.safeParse(d).success);
  d.pages[0].blocks[0].content.url =
    "https://res.cloudinary.com/demo/image/upload/other.pdf";
  assert.throws(() => validateSources(d, [source]));
});
test("PDF count uses actual bytes, rejects redirects/oversize/unreadable data", async () => {
  const pdf = await PDFDocument.create();
  for (let i = 0; i < 3; i++) pdf.addPage();
  const bytes = await pdf.save();
  let options;
  const count = await pdfPageCount(url, async (u, o) => {
    assert.equal(u, url);
    options = o;
    return new Response(bytes);
  });
  assert.equal(count, 3);
  assert.equal(options.redirect, "error");
  await assert.rejects(() =>
    pdfPageCount(url, async () => new Response("bad")),
  );
  await assert.rejects(
    () =>
      pdfPageCount(
        url,
        async () =>
          new Response("", {
            headers: { "content-length": String(11 * 1024 * 1024) },
          }),
      ),
    /10 Mo/,
  );
  await assert.rejects(
    () =>
      pdfPageCount(
        url,
        async () => new Response(new Uint8Array(11 * 1024 * 1024)),
      ),
    /10 Mo/,
  );
});
