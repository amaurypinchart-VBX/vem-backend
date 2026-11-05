const { test } = require("node:test"),
  assert = require("node:assert/strict");
const G = require("../public/js/briefing-next-graphics");
const M = require("../public/js/briefing-next-model");
const { documentSchema } = require("../dist/services/briefingDocument");
const node = (id, x = 40, y = 40) => ({
  id,
  type: "rect",
  x,
  y,
  width: 100,
  height: 60,
  text: "",
  font: "Arial",
  fontSize: 24,
  fill: "#ffffff",
  stroke: "#000a3d",
  strokeWidth: 2,
  direction: "right",
});
test("graphic alignment treats groups as units and respects locked members", () => {
  const scene = {
    ...G.blank(),
    nodes: [
      { ...node("a"), group: "g" },
      { ...node("b", 160, 90), group: "g" },
      node("c", 400, 200),
    ],
  };
  assert.deepEqual(G.expand(scene, ["b"]), ["a", "b"]);
  G.arrange(scene, ["a", "b", "c"], "top");
  assert.equal(scene.nodes[2].y, 40);
  assert.equal(scene.nodes[1].y, 90);
  scene.nodes[0].locked = true;
  scene.nodes[2].y = 250;
  G.arrange(scene, ["a", "b", "c"], "bottom");
  assert.equal(scene.nodes[0].y, 40);
  assert.equal(scene.nodes[2].y, 250);
});
test("distribution uses equal edge gaps; copies preserve group geometry with new ids", () => {
  const scene = {
    ...G.blank(),
    nodes: [node("a", 10), node("b", 180), node("c", 610)],
  };
  G.arrange(scene, ["a", "b", "c"], "distributeX");
  assert.equal(scene.nodes[1].x, 310);
  const copied = G.duplicate([
    { ...node("a"), group: "g" },
    { ...node("b", 200), group: "g" },
  ]);
  assert.notEqual(copied[0].id, "a");
  assert.notEqual(copied[0].group, "g");
  assert.equal(copied[0].group, copied[1].group);
  assert.equal(copied[1].x - copied[0].x, 160);
  const b = M.duplicate({ id: "block", graphic: scene });
  assert.notEqual(b.graphic.nodes[0].id, "a");
  assert.equal(b.graphic.nodes[0].x, 10);
});
test("text wrapping keeps every character and resize never changes font size", () => {
  const text = "Équipe 🏗️\nCrane & delivery <urgent>";
  const lines = G.wrap(
    text,
    100,
    24,
    "Arial",
    (s) => Array.from(s).length * 12,
  );
  assert.equal(lines.join(""), text.replaceAll("\n", ""));
  const scene = {
    ...G.blank(),
    nodes: [{ ...node("t"), type: "text", text: "Bonjour ".repeat(20) }],
  };
  G.normalize(scene);
  const h = scene.nodes[0].height;
  scene.nodes[0].width = 400;
  G.normalize(scene);
  assert.ok(scene.nodes[0].height < h);
  assert.equal(scene.nodes[0].fontSize, 24);
});
test("semantic graphics are validated, reject executable payloads, duplicate ids and overflow", () => {
  const d = M.blank("p", "Test");
  d.pages[0].blocks = [
    {
      id: "block",
      kind: "graphic",
      layout: "list",
      mode: "custom",
      title: "Schéma",
      content: {},
      baseline: {},
      annotation: "",
      graphic: { ...G.blank(), nodes: [node("a")] },
    },
  ];
  assert.ok(documentSchema.safeParse(d).success);
  const n = d.pages[0].blocks[0].graphic.nodes[0];
  n.href = "javascript:alert(1)";
  assert.equal(documentSchema.safeParse(d).success, false);
  delete n.href;
  n.x = 950;
  assert.equal(documentSchema.safeParse(d).success, false);
  assert.equal(G.issues(d.pages[0].blocks[0].graphic).length, 1);
  n.x = 40;
  d.pages[0].blocks[0].graphic.nodes.push({ ...n });
  assert.equal(documentSchema.safeParse(d).success, false);
});
test("render escapes text and regenerates numbered legends from visible markers", () => {
  const scene = {
    ...G.blank(),
    nodes: [
      { ...node("m"), type: "marker", text: "<script>evil</script>" },
      { ...node("hidden"), type: "marker", hidden: true },
      { ...node("m2"), type: "marker", text: "Zone utilisateur" },
    ],
  };
  const html = G.html(scene);
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(html.includes("<strong>2.</strong>"));
  assert.ok(!html.includes('data-node="hidden"'));
});

test("graphic backgrounds require a matching authorized source reference", () => {
  const d = M.blank("p", "Test");
  const b = {
    id: "block",
    kind: "graphic",
    layout: "list",
    mode: "custom",
    title: "Schéma",
    content: { url: "/image.png" },
    baseline: {},
    annotation: "",
    graphic: { ...G.blank(), backgroundId: "file1", nodes: [node("a")] },
  };
  d.pages[0].blocks = [b];
  assert.equal(documentSchema.safeParse(d).success, false);
  b.source = { kind: "file", id: "file1" };
  assert.ok(documentSchema.safeParse(d).success);
  const { validateSources } = require("../dist/services/briefingDocument");
  assert.throws(() => validateSources(d, []));
  validateSources(d, [{ kind: "file", id: "file1" }]);
  assert.ok(
    !G.svg(b.graphic, false, [], false, "javascript:alert(1)").includes(
      "<image",
    ),
  );
});
