// Destructive migration rehearsal strictly limited to a disposable CI database.
if (
  process.env.BRIEFING_TEST_DATABASE !== "1" ||
  !/^postgresql:\/\/test:test@localhost:5432\/test$/.test(
    process.env.DATABASE_URL || "",
  )
)
  throw new Error("Disposable test database required");
const assert = require("node:assert/strict");
const { prisma } = require("../dist/config/database");
const { migrateBriefingNext } = require("../dist/utils/migrations");
const { briefingSources } = require("../dist/services/briefingSources");
const M = require("../public/js/briefing-next-model");
const express = require("express");
const router = require("../dist/routes/briefing").default;
const { scopeGuard } = require("../dist/middleware/scopeGuard");
(async () => {
  let server, client;
  try {
    await prisma.$executeRawUnsafe(
      "DROP TABLE IF EXISTS briefing_publications",
    );
    await prisma.$executeRawUnsafe(
      "ALTER TABLE briefings DROP COLUMN IF EXISTS document",
    );
    await prisma.$executeRawUnsafe(
      "ALTER TABLE briefings DROP COLUMN IF EXISTS revision",
    );
    await prisma.$executeRawUnsafe("DROP TABLE IF EXISTS briefing_templates");
    await migrateBriefingNext();
    await migrateBriefingNext();
    client = await prisma.client.create({
      data: { name: "SYNTHETIC BRIEFING TEST" },
    });
    const p = await prisma.project.create({
      data: {
        name: "SYNTHETIC",
        internalNumber: "TEST-" + Date.now(),
        clientId: client.id,
        address: "Fictitious",
        installationStart: new Date(),
        installationEnd: new Date(),
      },
    });
    await prisma.task.createMany({
      data: Array.from({ length: 50 }, (_, i) => ({
        projectId: p.id,
        title: "Task " + i,
      })),
    });
    const b = await prisma.briefing.create({
      data: {
        projectId: p.id,
        title: "Original",
        slides: [{ title: "Preserve" }],
      },
    });
    const app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      req.user = { id: "synthetic" };
      req.access = { scope: "team", write: true, grants: [] };
      req.scopeProjectIds = [p.id];
      next();
    });
    app.use("/briefings", scopeGuard("briefings"), router);
    app.use((e, req, res, next) =>
      res
        .status(e.statusCode || 500)
        .json({ success: false, error: e.message }),
    );
    server = app.listen(0);
    const call = (path, method, body) =>
      fetch("http://localhost:" + server.address().port + "/briefings" + path, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    const sources = await briefingSources(p.id),
      doc = M.generate(p.id, "New", sources);
    const templateId = "template-ci-" + Date.now(),
      templateBody = { name: "CI", blueprint: M.templateFrom(doc) };
    assert.equal(
      (
        await call(
          `/project/${p.id}/templates/${templateId}`,
          "PUT",
          templateBody,
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await call(
          `/project/${p.id}/templates/${templateId}`,
          "PUT",
          templateBody,
        )
      ).status,
      200,
    );
    await migrateBriefingNext();
    const templates = await (
      await call(`/project/${p.id}/templates`, "GET")
    ).json();
    assert.equal(templates.data.filter((t) => t.id === templateId).length, 1);
    assert.deepEqual(
      templates.data.find((t) => t.id === templateId).blueprint,
      templateBody.blueprint,
    );
    assert.equal(
      (await call(`/project/${p.id}/templates/${templateId}`, "DELETE")).status,
      200,
    );
    const result = await Promise.all([
      call("/" + b.id + "/document", "PUT", { revision: 0, document: doc }),
      call("/" + b.id + "/document", "PUT", { revision: 0, document: doc }),
    ]);
    assert.deepEqual(result.map((r) => r.status).sort(), [200, 409]);
    assert.equal(
      (await call("/" + b.id + "/publish", "POST", { revision: 1 })).status,
      200,
    );
    assert.equal(
      (await call("/" + b.id + "/publish", "POST", { revision: 1 })).status,
      200,
    );
    const saved = await prisma.briefing.findUnique({ where: { id: b.id } });
    assert.deepEqual(saved.slides, [{ title: "Preserve" }]);
    assert.equal(
      saved.document.pages
        .flatMap((p) => p.blocks)
        .filter((b) => b.kind === "tasks").length,
      50,
    );
    assert.equal(
      await prisma.briefingPublication.count({ where: { briefingId: b.id } }),
      1,
    );
    await prisma.project.delete({ where: { id: p.id } });
    assert.equal(
      await prisma.briefingPublication.count({ where: { briefingId: b.id } }),
      0,
    );
    console.log(
      "PostgreSQL: migration twice, 50 sources, concurrent save, original preservation, publication idempotency and cascade: PASS",
    );
  } finally {
    server?.close();
    if (client)
      await prisma.client.delete({ where: { id: client.id } }).catch(() => {});
    await prisma.$disconnect();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
