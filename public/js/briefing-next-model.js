/* Shared pure document operations, also exercised by node:test. */
(function (root) {
  "use strict";
  const copy = (x) => JSON.parse(JSON.stringify(x));
  const uid = () =>
    "bn-" +
    (globalThis.crypto?.randomUUID?.() ||
      Date.now().toString(36) + Math.random().toString(36).slice(2));
  const key = (s) => s.kind + ":" + s.id;
  const themes = {
    signature: {
      name: "Viewbox Signature",
      ink: "#000a3d",
      paper: "#f5f3ee",
      accent: "#647caa",
      font: "Arial",
    },
    field: {
      name: "Field Clear",
      ink: "#152323",
      paper: "#ffffff",
      accent: "#146052",
      font: "Verdana",
    },
    editorial: {
      name: "Project Editorial",
      ink: "#362b27",
      paper: "#faf4eb",
      accent: "#a16b43",
      font: "Georgia",
    },
  };
  function block(s) {
    return {
      id: uid(),
      kind: s.block,
      title: s.title,
      layout: "list",
      mode: "linked",
      source: { kind: s.kind, id: s.id },
      baseline: copy(s.fields),
      content: copy(s.fields),
      annotation: "",
      refreshedAt: new Date().toISOString(),
    };
  }
  function blank(projectId, title) {
    return {
      version: 1,
      projectId,
      title: title || "Briefing",
      theme: "signature",
      format: "wide",
      audience: "internal",
      updatedAt: new Date().toISOString(),
      excluded: [],
      pages: [{ id: uid(), title: "Chantier en 60 secondes", blocks: [] }],
    };
  }
  function migrate(b) {
    if (b.document) return copy(b.document);
    const d = blank(b.projectId, b.title);
    const slides = b.studioSlides?.slides?.length
      ? b.studioSlides.slides
      : b.slides;
    if (Array.isArray(slides) && slides.length)
      d.pages = slides.map((s, i) => ({
        id: uid(),
        title: s.name || s.title || "Page " + (i + 1),
        blocks: [
          {
            id: uid(),
            kind: "legacy",
            title: s.name || s.title || "Original",
            layout: "list",
            mode: "frozen",
            baseline: {},
            content: {
              index: String(i),
              mode: b.studioSlides?.slides?.length ? "studio" : "classic",
            },
            annotation: "",
          },
        ],
      }));
    return d;
  }
  function filter(s, o = {}) {
    if (o.kinds && !o.kinds.includes(s.kind)) return false;
    if (s.kind === "task") {
      if (o.open && ["done", "cancelled"].includes(s.fields.status))
        return false;
      if (o.priority && s.fields.priority !== o.priority) return false;
      if (o.responsible && s.fields.assignedToId !== o.responsible)
        return false;
      if (o.date && !(s.fields.date || "").startsWith(o.date)) return false;
    }
    if (s.kind === "checklist") {
      if (o.open && ["ok", "na"].includes(s.fields.status)) return false;
      if (o.phase && s.fields.phase !== o.phase) return false;
      if (o.category && s.fields.category !== o.category) return false;
    }
    if (
      s.kind === "team" &&
      o.phase &&
      !["both", o.phase].includes(s.fields.phase)
    )
      return false;
    return true;
  }
  function generate(projectId, title, sources, options = {}) {
    const d = blank(projectId, title);
    d.generation = {};
    for (const k of ["preset", "phase", "open", "date", "priority", "responsible", "category", "kinds"])
      if (options[k] !== undefined) d.generation[k] = copy(options[k]);
    d.theme = options.theme || "signature";
    d.format = options.format || "wide";
    const labels = {
      project: "Chantier en 60 secondes",
      task: "Actions opérationnelles",
      checklist: "Contrôles qualité",
      truck: "Livraisons",
      contact: "Contacts",
      team: "Équipe",
      file: "Plans et médias",
    };
    d.pages = [];
    for (const kind of Object.keys(labels)) {
      const list = sources.filter(
        (s) =>
          s.kind === kind &&
          filter(s, options) &&
          (!options.selected || options.selected.includes(key(s))),
      );
      if (list.length)
        d.pages.push({
          id: uid(),
          title: labels[kind],
          blocks: list.map(block),
        });
    }
    if (!d.pages.length) d.pages = blank(projectId, title).pages;
    d.excluded = sources
      .filter(
        (s) =>
          !d.pages.some((p) =>
            p.blocks.some((b) => b.source && key(b.source) === key(s)),
          ),
      )
      .map(key);
    return d;
  }
  // Three-way merge per field. Deletions are explicit proposals; annotations/style never touched.
  function diff(d, sources, blockIds = null) {
    const scope = blockIds === null ? null : new Set(blockIds);
    const changes = [],
      map = new Map(sources.map((s) => [key(s), s])),
      seen = new Set(d.excluded);
    for (const p of d.pages)
      for (const b of p.blocks)
        if (b.source) {
          const k = key(b.source);
          seen.add(k);
          if (b.mode === "frozen" || (scope && (!scope.has(b.id) || b.locked))) continue;
          const s = map.get(k);
          if (!s) {
            changes.push({ type: "deleted", blockId: b.id, label: b.title });
            continue;
          }
          for (const f of new Set([
            ...Object.keys(b.baseline),
            ...Object.keys(s.fields),
          ])) {
            const before = b.baseline[f] || "",
              remote = s.fields[f] || "",
              local = b.content[f] || "";
            if (before !== remote)
              changes.push({
                type:
                  local !== before && local !== remote
                    ? "conflict"
                    : "modified",
                blockId: b.id,
                field: f,
                before,
                local,
                remote,
                label: b.title,
              });
          }
        }
    for (const s of sources)
      if (!scope && !seen.has(key(s)) && filter(s, d.generation || {}))
        changes.push({ type: "added", source: s, label: s.title });
    return changes;
  }
  function apply(d, changes, choices) {
    const out = copy(d);
    changes.forEach((c, i) => {
      const choice = choices[i] || "keep";
      if (c.type === "added") {
        if (choice === "remote")
          out.pages[out.pages.length - 1].blocks.push(block(c.source));
        else out.excluded.push(key(c.source));
        return;
      }
      const b = out.pages
        .flatMap((p) => p.blocks)
        .find((b) => b.id === c.blockId);
      if (!b) return;
      if (c.type === "deleted") {
        if (choice === "remote") {
          out.excluded.push(key(b.source));
          out.pages.forEach(
            (p) => (p.blocks = p.blocks.filter((x) => x.id !== b.id)),
          );
        } else b.mode = "frozen";
        return;
      }
      b.baseline[c.field] = c.remote;
      if (choice === "remote") b.content[c.field] = c.remote;
      else b.mode = "custom";
      b.refreshedAt = new Date().toISOString();
    });
    return out;
  }
  function duplicate(value) {
    const x = copy(value);
    x.id = uid();
    if (x.blocks) x.blocks = x.blocks.map(duplicate);
    if (x.graphic) {
      const groups = new Map();
      x.graphic.nodes.forEach((n) => {
        n.id = uid();
        if (n.group) {
          if (!groups.has(n.group)) groups.set(n.group, uid());
          n.group = groups.get(n.group);
        }
      });
    }
    return x;
  }
  // Portable kit deliberately contains no project content, IDs or asset URLs.
  function brandKit(value) {
    const b =
      value?.type === "vem-brand-kit" && value.version === 1
        ? value.brand
        : value;
    if (
      !b ||
      typeof b.name !== "string" ||
      !b.name.trim() ||
      b.name.length > 100 ||
      !["Arial", "Georgia", "Verdana"].includes(b.font) ||
      ![b.ink, b.paper, b.accent].every(
        (c) => typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c),
      ) ||
      Object.keys(b).some(
        (k) => !["name", "ink", "paper", "accent", "font"].includes(k),
      )
    )
      throw new Error(
        "Kit invalide : nom, trois couleurs hexadécimales et police requis.",
      );
    return {
      name: b.name.trim(),
      ink: b.ink,
      paper: b.paper,
      accent: b.accent,
      font: b.font,
    };
  }

  const blockNames = {
    cover: "Couverture",
    summary: "Résumé chantier",
    contacts: "Contact",
    team: "Équipe",
    planning: "Planning",
    deliveries: "Livraison",
    access: "Accès",
    instructions: "Consignes",
    tasks: "Action",
    quality: "Contrôle qualité",
    photo: "Photo",
    plan: "Plan",
    note: "Note",
    legacy: "Contenu à recréer",
    table: "Tableau",
    graphic: "Composition libre",
  };
  function templateFrom(document) {
    return {
      version: 1,
      theme: document.theme,
      format: document.format,
      pages: document.pages.map((p) => ({
        ...(p.theme ? { theme: p.theme } : {}),
        blocks: p.blocks.map((b) => {
          const kind = b.kind === "legacy" ? "note" : b.kind;
          const t = { kind, layout: b.layout };
          if (b.source && kind !== "graphic") t.binding = b.source.kind;
          if (b.style) t.style = copy(b.style);
          if (b.image) t.image = copy(b.image);
          if (b.graphic) {
            t.graphic = copy(b.graphic);
            delete t.graphic.backgroundId;
            const groups = new Map();
            t.graphic.nodes.forEach((n) => {
              n.id = uid();
              delete n.locked;
              delete n.hidden;
              if (n.group) {
                if (!groups.has(n.group)) groups.set(n.group, uid());
                n.group = groups.get(n.group);
              }
              n.text =
                n.type === "text"
                  ? ""
                  : n.type === "marker"
                    ? "Repère à renseigner"
                    : "";
            });
          }
          return t;
        }),
      })),
    };
  }
  function instantiateTemplate(
    template,
    projectId,
    title,
    sources = [],
    bindings = {},
  ) {
    const d = blank(projectId, title);
    d.theme = template.theme;
    d.format = template.format;
    d.pages = template.pages.map((p, i) => ({
      id: uid(),
      title: "Page " + (i + 1),
      ...(p.theme ? { theme: p.theme } : {}),
      blocks: p.blocks.map((t, j) => {
        const chosen = bindings[i + ":" + j];
        const source = chosen
          ? sources.find((s) => key(s) === chosen && s.kind === t.binding)
          : null;
        if (chosen && !source)
          throw new Error("Source du modèle inaccessible dans ce projet");
        const b = source
          ? block(source)
          : {
              id: uid(),
              kind: t.kind,
              title: blockNames[t.kind],
              layout: t.layout,
              mode: "custom",
              baseline: {},
              content:
                t.kind === "table"
                  ? { table: "Désignation\tQuantité\nÀ compléter\t" }
                  : t.kind === "photo" ||
                      t.kind === "plan" ||
                      t.kind === "graphic"
                    ? {}
                    : { text: "À compléter" },
              annotation: "",
            };
        b.layout = t.layout;
        if (t.style) b.style = copy(t.style);
        if (t.image) b.image = copy(t.image);
        if (t.graphic) {
          b.graphic = duplicate({ id: uid(), graphic: t.graphic }).graphic;
        }
        return b;
      }),
    }));
    const linked = new Set(
      d.pages
        .flatMap((p) => p.blocks)
        .filter((b) => b.source)
        .map((b) => key(b.source)),
    );
    d.excluded = sources.filter((s) => !linked.has(key(s))).map(key);
    return d;
  }

  function pdfPages(input, total) {
    if (
      typeof input !== "string" ||
      input.length > 1000 ||
      !Number.isInteger(total) ||
      total < 1 ||
      total > 500
    )
      throw new Error("Pages invalides");
    const pages = new Set();
    for (const chunk of input.split(",")) {
      const m = chunk.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
      if (!m) throw new Error("Format attendu : 1, 3-5");
      const from = Number(m[1]),
        to = Number(m[2] || m[1]);
      if (from < 1 || to < from || to > total)
        throw new Error("Numéro de page hors du PDF");
      for (let n = from; n <= to; n++) pages.add(n);
    }
    if (pages.size > 50)
      throw new Error(
        "Maximum 50 pages par import : importez le PDF en plusieurs lots",
      );
    return [...pages].sort((a, b) => a - b);
  }
  function pdfPreview(url, page) {
    if (!Number.isInteger(page) || page < 1 || page > 500) return "";
    let u;
    try {
      u = new URL(url);
    } catch {
      return "";
    }
    if (
      u.protocol !== "https:" ||
      u.hostname !== "res.cloudinary.com" ||
      u.port ||
      u.username ||
      u.password ||
      !/^\/[^/]+\/image\/upload\//.test(u.pathname) ||
      !/\.pdf$/i.test(u.pathname)
    )
      return "";
    u.pathname = u.pathname
      .replace("/upload/", `/upload/f_png,c_limit,w_2000,pg_${page}/`)
      .replace(/\.pdf$/i, ".png");
    return u.href;
  }
  const api = {
    templateFrom,
    instantiateTemplate,
    blockNames,
    pdfPreview,
    pdfPages,
    brandKit,
    copy,
    uid,
    key,
    themes,
    blank,
    migrate,
    filter,
    generate,
    diff,
    apply,
    duplicate,
    block,
  };
  if (typeof module !== "undefined") module.exports = api;
  else root.BriefingNextModel = api;
})(globalThis);
