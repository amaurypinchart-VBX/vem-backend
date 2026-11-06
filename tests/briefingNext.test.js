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

test("brand kits validate portable data and reject project or executable fields", () => {
  const brand = {
    name: "ACME",
    ink: "#112233",
    paper: "#ffffff",
    accent: "#abcdef",
    font: "Arial",
  };
  assert.deepEqual(
    M.brandKit({ type: "vem-brand-kit", version: 1, brand }),
    brand,
  );
  assert.throws(() => M.brandKit({ ...brand, projectId: "secret" }));
  assert.throws(() => M.brandKit({ ...brand, ink: "red; background:url(x)" }));
  const d = M.generate("p", "Test", sources.slice(0, 1));
  d.brand = brand;
  d.pages[0].blocks[0].image = {
    ratio: "portrait",
    fit: "cover",
    x: 20,
    y: 80,
  };
  assert.ok(documentSchema.safeParse(d).success);
  const remote = M.copy(sources.slice(0, 1));
  remote[0].fields.status = "done";
  const next = M.apply(d, M.diff(d, remote), { 0: "remote" });
  assert.deepEqual(next.brand, brand);
  assert.deepEqual(next.pages[0].blocks[0].image, d.pages[0].blocks[0].image);
  d.pages[0].blocks[0].image.x = 101;
  assert.equal(documentSchema.safeParse(d).success, false);
});

test("scoped refresh isolates selected blocks, retains exclusions and protects frozen/locked content", () => {
  const d = M.generate("p", "Chantier", sources.slice(0, 4));
  const [a, b, c, e] = d.pages[0].blocks;
  b.locked = true;
  c.mode = "frozen";
  a.annotation = "Conserver";
  a.style = { color: "#abcdef" };
  a.content.title = "Ma retouche";
  const remote = M.copy(sources.slice(0, 5));
  remote.forEach((s) => { s.fields.status = "done"; s.fields.title = "Nouveau"; });
  const changes = M.diff(d, remote, [a.id, b.id, c.id]);
  assert.ok(changes.length);
  assert.ok(changes.every((x) => x.blockId === a.id));
  const out = M.apply(d, changes, Object.fromEntries(changes.map((x, i) => [i, x.type === "conflict" ? "keep" : "remote"])));
  assert.equal(out.pages[0].blocks[0].content.status, "done");
  assert.equal(out.pages[0].blocks[0].content.title, "Ma retouche");
  assert.equal(out.pages[0].blocks[0].annotation, "Conserver");
  assert.deepEqual(out.pages[0].blocks[0].style, a.style);
  assert.deepEqual(out.pages[0].blocks.slice(1), [b, c, e]);
  assert.deepEqual(out.excluded, d.excluded);
  assert.deepEqual(M.diff(d, remote, []), []);
  assert.equal(M.diff(d, remote).filter((x) => x.type === "added").length, 1);
  assert.deepEqual(M.diff(d, [], [a.id]).map((x) => x.blockId), [a.id]);
});

test("generation filters survive storage and limit only new source proposals", () => {
  const initial = sources.slice(0, 1);
  const d = M.generate("p", "Chantier", initial, { open: true, priority: "high", kinds: ["task"] });
  const restored = documentSchema.parse(JSON.parse(JSON.stringify(d)));
  assert.deepEqual(restored.generation, { open: true, priority: "high", kinds: ["task"] });
  const remote = M.copy(sources.slice(0, 5));
  remote[0].fields.status = "done";
  remote[2].fields.status = "done";
  let changes = M.diff(restored, remote);
  assert.ok(changes.some((x) => x.blockId === d.pages[0].blocks[0].id && x.remote === "done"));
  assert.deepEqual(changes.filter((x) => x.type === "added").map((x) => x.source.id), ["t4"]);
  restored.excluded.push("task:t4");
  assert.equal(M.diff(restored, remote).filter((x) => x.type === "added").length, 0);
  delete restored.generation;
  assert.equal(M.diff(restored, remote).filter((x) => x.type === "added").length, 3);
  assert.equal(M.filter({ kind: "task", fields: {} }, { date: "2026-11-06" }), false);
  assert.throws(() => documentSchema.parse({ ...d, generation: { arbitrary: "query" } }));
  assert.equal(M.templateFrom(d).generation, undefined);
});
