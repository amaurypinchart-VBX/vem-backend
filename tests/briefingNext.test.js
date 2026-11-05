const { test } = require("node:test");
const assert = require("node:assert/strict");
const M = require("../public/js/briefing-next-model");
const {
  documentSchema,
  validateSources,
} = require("../dist/services/briefingDocument");
const sources = Array.from({ length: 50 }, (_, i) => ({
  kind: "task",
  id: "t" + i,
  block: "tasks",
  title: "Tâche " + i,
  fields: {
    title: "Tâche " + i,
    status: "todo",
    priority: i % 2 ? "normal" : "high",
    description: "Texte long ".repeat(100),
    date: "2026-11-05T08:00:00Z",
  },
}));
test("all 50 tasks survive generation and JSON round trip", () => {
  const d = M.generate("p", "Chantier", sources);
  assert.equal(d.pages.flatMap((p) => p.blocks).length, 50);
  assert.deepEqual(documentSchema.parse(JSON.parse(JSON.stringify(d))), d);
});
test("explicit selections and exclusions survive refresh", () => {
  const d = M.generate("p", "Chantier", sources, { selected: ["task:t0"] });
  assert.equal(d.excluded.length, 49);
  assert.equal(M.diff(d, sources).length, 0);
});
test("three-way merge preserves local annotations, style, and identifies conflicts", () => {
  const d = M.generate("p", "Chantier", sources.slice(0, 1));
  const b = d.pages[0].blocks[0];
  b.content.title = "Retouche";
  b.annotation = "Grue à confirmer";
  b.style = { color: "#aabbcc" };
  const remote = M.copy(sources.slice(0, 1));
  remote[0].fields.title = "Nouveau titre";
  remote[0].fields.status = "done";
  const diff = M.diff(d, remote);
  assert.equal(diff.find((c) => c.field === "title").type, "conflict");
  const choices = Object.fromEntries(
    diff.map((c, i) => [i, c.type === "conflict" ? "keep" : "remote"]),
  );
  const out = M.apply(d, diff, choices).pages[0].blocks[0];
  assert.equal(out.content.title, "Retouche");
  assert.equal(out.content.status, "done");
  assert.equal(out.annotation, b.annotation);
  assert.deepEqual(out.style, b.style);
  assert.equal(b.content.status, "todo");
});
test("source deletion is visible and kept instructions freeze explicitly", () => {
  const d = M.generate("p", "Chantier", sources.slice(0, 1));
  const changes = M.diff(d, []);
  assert.equal(changes[0].type, "deleted");
  assert.equal(
    M.apply(d, changes, { 0: "keep" }).pages[0].blocks[0].mode,
    "frozen",
  );
  assert.equal(M.apply(d, changes, { 0: "remote" }).pages[0].blocks.length, 0);
});
test("frozen blocks do not follow source changes", () => {
  const d = M.generate("p", "Chantier", sources.slice(0, 1));
  d.pages[0].blocks[0].mode = "frozen";
  assert.deepEqual(M.diff(d, []), []);
});
test("page copies get new stable identifiers without changing source ids", () => {
  const p = M.generate("p", "Chantier", sources).pages[0],
    c = M.duplicate(p);
  assert.notEqual(c.id, p.id);
  assert.notEqual(c.blocks[0].id, p.blocks[0].id);
  assert.deepEqual(c.blocks[0].source, p.blocks[0].source);
  assert.deepEqual(c.blocks[0].content, p.blocks[0].content);
});
test("legacy migration is additive, keeps original unchanged, and invents no source", () => {
  for (const legacy of [
    { slides: [{ title: "Ancien", blocks: [{ text: "À conserver" }] }] },
    {
      studioSlides: {
        slides: [
          {
            id: "old",
            name: "Plan",
            json: { objects: [{ type: "textbox", text: "Origine" }] },
          },
        ],
      },
    },
  ]) {
    const b = { id: "b", projectId: "p", title: "Old", ...legacy },
      snapshot = JSON.stringify(b),
      d = M.migrate(b);
    assert.equal(JSON.stringify(b), snapshot);
    assert.equal(d.pages[0].blocks[0].kind, "legacy");
    assert.equal(d.pages[0].blocks[0].source, undefined);
    assert.ok(documentSchema.safeParse(d).success);
  }
});
test("unknown fields, script URLs, duplicate ids and wrong versions rejected", () => {
  const d = M.generate("p", "Chantier", sources.slice(0, 1));
  assert.equal(documentSchema.safeParse({ ...d, version: 9 }).success, false);
  assert.equal(
    documentSchema.safeParse({ ...d, unknown: true }).success,
    false,
  );
  d.pages[0].blocks[0].content.url = "javascript:alert(1)";
  assert.equal(documentSchema.safeParse(d).success, false);
  delete d.pages[0].blocks[0].content.url;
  d.pages.push(M.copy(d.pages[0]));
  assert.equal(documentSchema.safeParse(d).success, false);
});
test("cross-project references rejected, deleted historical references preserved", () => {
  const d = M.generate("p", "Chantier", sources.slice(0, 1));
  assert.throws(() => validateSources(d, []));
  validateSources(d, [], d);
  validateSources(d, sources);
  const copy = M.copy(d);
  copy.pages[0].blocks[0].source.id = "foreign";
  assert.throws(() => validateSources(copy, sources, d));
});
test("phase does not guess task stages; quality uses actual phase", () => {
  assert.equal(M.filter(sources[0], { phase: "dismantling" }), true);
  assert.equal(
    M.filter(
      { kind: "checklist", fields: { phase: "installation" } },
      { phase: "dismantling" },
    ),
    false,
  );
});
test("filter combines date, priority and open status", () => {
  assert.equal(
    M.generate("p", "Chantier", sources, {
      priority: "high",
      date: "2026-11-05",
    }).pages[0].blocks.length,
    25,
  );
  assert.equal(
    M.filter({ ...sources[0], fields: { status: "done" } }, { open: true }),
    false,
  );
});
