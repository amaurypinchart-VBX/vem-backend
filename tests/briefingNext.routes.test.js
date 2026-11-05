// Real Express router + scopeGuard, deterministic database double (not a PostgreSQL integration test).
const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
process.env.JWT_SECRET = "test-only-secret-briefing-no-production";
const M = require("../public/js/briefing-next-model");
let row = {
  id: "b",
  projectId: "p",
  revision: 0,
  slides: [],
  studioSlides: null,
  document: null,
};
const publications = [];
global.__prisma = {
  briefing: {
    findUnique: async ({ where }) =>
      where.id === "b" ? structuredClone(row) : null,
    updateMany: async ({ where, data }) => {
      if (where.revision !== row.revision) return { count: 0 };
      row = { ...row, ...data, revision: row.revision + 1 };
      return { count: 1 };
    },
  },
  project: {
    findUnique: async () => ({
      id: "p",
      name: "Demo",
      client: { name: "Client", contacts: [] },
      tasks: [],
      team: [],
      trucks: [],
      files: [],
      checklists: [],
    }),
  },
  briefingPublication: {
    upsert: async ({ create }) => {
      let p = publications.find((p) => p.revision === create.revision);
      if (!p) {
        p = structuredClone(create);
        publications.push(p);
      }
      return p;
    },
    findMany: async () => structuredClone(publications),
  },
};
const { scopeGuard } = require("../dist/middleware/scopeGuard");
const router = require("../dist/routes/briefing").default;
const app = express();
app.use(express.json());
app.use((req, res, next) => {
  req.user = { id: "u" };
  req.scopeProjectIds = ["p"];
  req.access = {
    scope: "team",
    write: req.headers["x-role"] !== "reader",
    grants: [],
  };
  next();
});
app.use("/briefings", scopeGuard("briefings"), router);
app.use((e, req, res, next) =>
  res.status(e.statusCode || 500).json({ success: false, error: e.message }),
);
const server = app.listen(0);
after(() => server.close());
const call = (path, method = "GET", body, role) =>
  fetch("http://127.0.0.1:" + server.address().port + "/briefings" + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(role ? { "x-role": role } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
test("scope denies foreign sources endpoint and reader mutations", async () => {
  assert.equal((await call("/project/foreign/sources")).status, 403);
  assert.equal(
    (
      await call(
        "/b/document",
        "PUT",
        { revision: 0, document: M.blank("p", "D") },
        "reader",
      )
    ).status,
    403,
  );
});
test("save uses compare-and-swap; concurrent tabs get one 409", async () => {
  const d = M.blank("p", "D");
  const responses = await Promise.all([
    call("/b/document", "PUT", { revision: 0, document: d }),
    call("/b/document", "PUT", { revision: 0, document: d }),
  ]);
  assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409]);
  assert.equal(row.revision, 1);
});
test("foreign references and document project mismatch denied", async () => {
  assert.equal(
    (
      await call("/b/document", "PUT", {
        revision: 1,
        document: M.blank("other", "D"),
      })
    ).status,
    403,
  );
  const d = M.generate("p", "D", [
    { kind: "task", id: "foreign", block: "tasks", title: "X", fields: {} },
  ]);
  assert.equal(
    (await call("/b/document", "PUT", { revision: 1, document: d })).status,
    403,
  );
});
test("publications immutable and publish retry idempotent", async () => {
  assert.equal((await call("/b/publish", "POST", { revision: 1 })).status, 200);
  assert.equal((await call("/b/publish", "POST", { revision: 1 })).status, 200);
  assert.equal(publications.length, 1);
  assert.equal(
    (
      await call("/b/document", "PUT", {
        revision: 1,
        document: M.blank("p", "New"),
      })
    ).status,
    200,
  );
  assert.equal(publications[0].document.title, "D");
  assert.equal((await call("/b/publish", "POST", { revision: 1 })).status, 409);
});
test("legacy patch cannot overwrite converted document", async () => {
  assert.equal(
    (await call("/b", "PATCH", { slides: [{ title: "Overwrite" }] })).status,
    409,
  );
  assert.deepEqual(row.slides, []);
});
