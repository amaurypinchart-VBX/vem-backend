import { z } from "zod";

const id = z.string().min(1).max(150);
const text = z.string().max(30000);
const fields = z.record(z.string().max(80), text);
export const sourceSchema = z
  .object({
    kind: z.enum([
      "project",
      "task",
      "checklist",
      "truck",
      "contact",
      "team",
      "file",
    ]),
    id,
  })
  .strict();
const style = z
  .object({
    color: z
      .string()
      .regex(/^#[0-9a-f]{6}$/i)
      .optional(),
    font: z.enum(["Arial", "Georgia", "Verdana"]).optional(),
    size: z.number().min(14).max(64).optional(),
  })
  .strict();
const graphic = z
  .object({
    backgroundId: id.optional(),
    width: z.literal(1000),
    height: z.literal(600),
    nodes: z
      .array(
        z
          .object({
            id,
            type: z.enum(["text", "rect", "ellipse", "arrow", "marker"]),
            x: z.number().min(0).max(1000),
            y: z.number().min(0).max(600),
            width: z.number().min(24).max(1000),
            height: z.number().min(24).max(600),
            rotation: z.number().min(-180).max(180).optional(),
            text: z.string().max(2000),
            font: z.enum(["Arial", "Georgia", "Verdana"]),
            fontSize: z.number().min(12).max(96),
            fill: z.string().regex(/^#[0-9a-f]{6}$/i),
            stroke: z.string().regex(/^#[0-9a-f]{6}$/i),
            strokeWidth: z.number().min(1).max(20),
            direction: z.enum([
              "left",
              "right",
              "up",
              "down",
              "ne",
              "se",
              "sw",
              "nw",
            ]),
            group: id.optional(),
            locked: z.boolean().optional(),
            hidden: z.boolean().optional(),
          })
          .strict(),
      )
      .max(200),
  })
  .strict()
  .superRefine((g, ctx) => {
    const ids = new Set<string>();
    for (const n of g.nodes) {
      if (ids.has(n.id))
        ctx.addIssue({ code: "custom", message: "Objet graphique dupliqué" });
      ids.add(n.id);
      const angle = (n.rotation || 0) * Math.PI / 180;
      const w = Math.abs(n.width * Math.cos(angle)) + Math.abs(n.height * Math.sin(angle));
      const h = Math.abs(n.width * Math.sin(angle)) + Math.abs(n.height * Math.cos(angle));
      const x = n.x + (n.width - w) / 2, y = n.y + (n.height - h) / 2;
      if (!n.hidden && (x < -0.01 || y < -0.01 || x + w > g.width + 0.01 || y + h > g.height + 0.01))
        ctx.addIssue({ code: "custom", message: "Objet graphique hors page" });
    }
  });
export const documentSchema = z
  .object({
    version: z.literal(1),
    projectId: id,
    title: z.string().min(1).max(250),
    theme: z.enum(["signature", "field", "editorial"]),
    format: z.enum(["wide", "a4"]),
    audience: z.literal("internal"),
    brand: z
      .object({
        name: z.string().min(1).max(100),
        ink: z.string().regex(/^#[0-9a-f]{6}$/i),
        paper: z.string().regex(/^#[0-9a-f]{6}$/i),
        accent: z.string().regex(/^#[0-9a-f]{6}$/i),
        font: z.enum(["Arial", "Georgia", "Verdana"]),
      })
      .strict()
      .optional(),
    updatedAt: z.string().datetime(),
    excluded: z.array(z.string().max(200)).max(10000),
    generation: z.object({
      preset: z.enum(["all", "morning", "installation", "dismantling", "logistics"]).optional(),
      phase: z.enum(["", "installation", "dismantling"]).optional(),
      open: z.boolean().optional(),
      date: z.string().regex(/^(?:|\d{4}-\d{2}-\d{2})$/).optional(),
      priority: z.enum(["", "low", "normal", "high", "critical"]).optional(),
      responsible: z.string().max(200).optional(),
      category: z.string().max(200).optional(),
      kinds: z.array(z.enum(["project", "task", "checklist", "truck", "contact", "team", "file"])).max(7).optional(),
    }).strict().optional(),
    pages: z
      .array(
        z
          .object({
            id,
            title: z.string().max(250),
            theme: z.enum(["signature", "field", "editorial"]).optional(),
            blocks: z
              .array(
                z
                  .object({
                    id,
                    kind: z.enum([
                      "cover",
                      "summary",
                      "contacts",
                      "team",
                      "planning",
                      "deliveries",
                      "access",
                      "instructions",
                      "tasks",
                      "quality",
                      "photo",
                      "plan",
                      "note",
                      "legacy",
                      "table",
                      "graphic",
                    ]),
                    title: z.string().max(250),
                    layout: z.enum(["list", "cards", "table"]),
                    mode: z.enum(["linked", "frozen", "custom"]),
                    source: sourceSchema.optional(),
                    baseline: fields,
                    content: fields,
                    annotation: text,
                    style: style.optional(),
                    graphic: graphic.optional(),
                    pdf: z
                      .object({ page: z.number().int().min(1).max(500) })
                      .strict()
                      .optional(),
                    image: z
                      .object({
                        ratio: z.enum([
                          "original",
                          "wide",
                          "square",
                          "portrait",
                        ]),
                        fit: z.enum(["cover", "contain"]),
                        x: z.number().min(0).max(100),
                        y: z.number().min(0).max(100),
                      })
                      .strict()
                      .optional(),
                    refreshedAt: z.string().datetime().optional(),
                    hidden: z.boolean().optional(),
                    locked: z.boolean().optional(),
                  })
                  .strict(),
              )
              .max(1000),
          })
          .strict(),
      )
      .min(1)
      .max(500),
  })
  .strict()
  .superRefine((d, ctx) => {
    const ids = new Set<string>();
    for (const p of d.pages)
      for (const x of [p, ...p.blocks]) {
        if (ids.has(x.id))
          ctx.addIssue({ code: "custom", message: "Identifiant dupliqué" });
        ids.add(x.id);
        if (
          "pdf" in x &&
          x.pdf &&
          (x.kind !== "plan" || x.source?.kind !== "file")
        )
          ctx.addIssue({
            code: "custom",
            message: "Page PDF sans fichier source",
          });
        if (
          "graphic" in x &&
          x.graphic?.backgroundId &&
          (x.source?.kind !== "file" || x.source?.id !== x.graphic.backgroundId)
        )
          ctx.addIssue({
            code: "custom",
            message: "Fond graphique sans source projet correspondante",
          });
        if (
          "content" in x &&
          x.content.url &&
          !/^https?:\/\//i.test(x.content.url) &&
          !/^\/(?!\/)/.test(x.content.url)
        )
          ctx.addIssue({ code: "custom", message: "URL non autorisée" });
      }
  });
export type BriefingDocument = z.infer<typeof documentSchema>;
// References are validated against the same project's curated source catalogue.
// Deleted references may survive only if already present in the saved document.
export function validateSources(
  doc: BriefingDocument,
  catalogue: any[],
  previous?: any,
) {
  const available = new Set(catalogue.map((s) => s.kind + ":" + s.id));
  const old = new Map<string, string>();
  for (const p of previous?.pages || [])
    for (const b of p.blocks || [])
      if (b.source) old.set(b.id, b.source.kind + ":" + b.source.id);
  for (const p of doc.pages)
    for (const b of p.blocks)
      if (b.source) {
        const key = b.source.kind + ":" + b.source.id;
        if (b.pdf) {
          const source = catalogue.find(
            (s) => s.kind === "file" && s.id === b.source!.id,
          );
          const prior = previous?.pages
            ?.flatMap((p: any) => p.blocks)
            .find((x: any) => x.id === b.id);
          const expected =
            source?.fields?.url ||
            (old.get(b.id) === key ? prior?.content?.url : null);
          if (!expected || expected !== b.content.url)
            throw new Error("URL PDF différente de sa source");
        }
        if (!available.has(key) && old.get(b.id) !== key)
          throw new Error("Source étrangère ou inaccessible");
      }
}

const blockSchema =
  documentSchema._def.schema.shape.pages.element.shape.blocks.element;
export const briefingTemplateSchema = z
  .object({
    version: z.literal(1),
    theme: z.enum(["signature", "field", "editorial"]),
    format: z.enum(["wide", "a4"]),
    pages: z
      .array(
        z
          .object({
            theme: z.enum(["signature", "field", "editorial"]).optional(),
            blocks: z
              .array(
                z
                  .object({
                    kind: blockSchema.shape.kind,
                    layout: blockSchema.shape.layout,
                    style: style.optional(),
                    image: blockSchema.shape.image,
                    binding: sourceSchema.shape.kind.optional(),
                    graphic: graphic.optional(),
                  })
                  .strict(),
              )
              .max(1000),
          })
          .strict(),
      )
      .min(1)
      .max(500),
  })
  .strict()
  .superRefine((t, ctx) => {
    for (const p of t.pages)
      for (const b of p.blocks) {
        if (b.kind === "legacy")
          ctx.addIssue({ code: "custom", message: "Original non portable" });
        if (b.graphic) {
          if (b.graphic.backgroundId)
            ctx.addIssue({
              code: "custom",
              message: "Fond projet non portable",
            });
          for (const n of b.graphic.nodes)
            if (
              n.text !==
              (n.type === "text"
                ? ""
                : n.type === "marker"
                  ? "Repère à renseigner"
                  : "")
            )
              ctx.addIssue({
                code: "custom",
                message: "Texte chantier non portable",
              });
        }
      }
  });
