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
                    ]),
                    title: z.string().max(250),
                    layout: z.enum(["list", "cards", "table"]),
                    mode: z.enum(["linked", "frozen", "custom"]),
                    source: sourceSchema.optional(),
                    baseline: fields,
                    content: fields,
                    annotation: text,
                    style: style.optional(),
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
        if (!available.has(key) && old.get(b.id) !== key)
          throw new Error("Source étrangère ou inaccessible");
      }
}
