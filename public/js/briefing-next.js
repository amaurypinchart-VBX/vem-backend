/* Studio Next: semantic draft + isolated print composition. No client-side business validation. */
(function () {
  "use strict";
  const M = window.BriefingNextModel;
  const E = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const labels = {
    title: "Intitulé",
    name: "Nom",
    description: "Description",
    address: "Adresse",
    client: "Client",
    instructions: "Consignes",
    installationNotes: "Notes montage",
    dismantlingNotes: "Notes démontage",
    installationStart: "Début montage",
    installationEnd: "Fin montage",
    dismantlingStart: "Début démontage",
    dismantlingEnd: "Fin démontage",
    date: "Date",
    start: "Début",
    end: "Fin",
    responsible: "Responsable",
    priority: "Priorité",
    status: "Statut",
    stage: "Étape",
    phase: "Phase",
    category: "Catégorie",
    comment: "Commentaire",
    hint: "Consigne de contrôle",
    critical: "Critique",
    photoRequired: "Photo obligatoire",
    evidenceCount: "Preuves",
    checkedAt: "Dernier contrôle",
    plate: "Immatriculation",
    driver: "Chauffeur",
    phone: "Téléphone",
    arrival: "Arrivée",
    departure: "Départ",
    loading: "Chargement",
    location: "Déchargement",
    notes: "Notes",
    role: "Rôle",
    email: "E-mail",
    text: "Texte",
    caption: "Légende",
    url: "Fichier",
    table: "Tableau",
  };
  const stateLabels = {
    todo: "À faire",
    in_progress: "En cours",
    done: "Terminée",
    blocked: "Bloquée",
    cancelled: "Annulée",
    pending: "À contrôler",
    ok: "OK",
    nok: "Non conforme",
    partial: "Partiel",
    na: "Sans objet",
    normal: "Normale",
    high: "Haute",
    critical: "Critique",
    low: "Basse",
    true: "Oui",
    false: "Non",
  };
  let S = null;
  const safeUrl = (s) => {
    try {
      const u = new URL(s, location.origin);
      return ["https:", "http:"].includes(u.protocol) ? u.href : "";
    } catch {
      return "";
    }
  };
  const display = (k, v) =>
    /Start$|End$|At$/.test(k) ||
    ["date", "arrival", "departure", "loading"].includes(k)
      ? /^\d{4}-\d\d-\d\dT/.test(v)
        ? new Date(v).toLocaleString("fr-BE")
        : v
      : ["status", "priority", "critical", "photoRequired"].includes(k)
        ? stateLabels[v] || v
        : v;
  async function request(method, path, body) {
    const r = await fetch("/api/v1" + path, {
      method,
      signal: AbortSignal.timeout(60000),
      headers: {
        "Content-Type": "application/json",
        Authorization:
          "Bearer " +
          (localStorage.getItem("token") ||
            (typeof TOKEN !== "undefined" ? TOKEN : "")),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const j = await r.json();
    if (!r.ok || !j.success) {
      const e = new Error(j.error || "Erreur " + r.status);
      e.status = r.status;
      throw e;
    }
    return j;
  }
  function status(t) {
    const n = S?.root.querySelector(".bn-status");
    if (n) n.textContent = t;
  }
  function error(e) {
    status(e.message);
    if (typeof toast === "function") toast(e.message, "error");
  }
  function themeCss(theme, brand) {
    const t = brand || M.themes[theme] || M.themes.signature;
    return `--ink:${t.ink};--paper:${t.paper};--accent:${t.accent};--font:${t.font}`;
  }
  function btn(action, text, extra = "") {
    return `<button data-action="${action}" ${extra}>${text}</button>`;
  }
  function current() {
    return S.doc.pages[S.page];
  }
  function selected() {
    return current().blocks.find((b) => b.id === S.selected);
  }
  function selection() {
    return current().blocks.filter(
      (b) => S.multi?.includes(b.id) || b.id === S.selected,
    );
  }
  function dirty() {
    S.dirty = true;
    S.doc.updatedAt = new Date().toISOString();
    status("Modifications en attente…");
    clearTimeout(S.timer);
    if (!S.conflict) S.timer = setTimeout(() => save().catch(error), 1000);
  }
  function change(fn) {
    if (!S.permissions.write || S.publication) return;
    S.undo.push(M.copy(S.doc));
    if (S.undo.length > 40) S.undo.shift();
    S.redo = [];
    fn();
    dirty();
    render();
  }
  async function save() {
    if (!S || !S.dirty || !S.permissions.write || S.publication) return;
    if (S.conflict)
      throw new Error(
        "Conflit : exportez votre copie JSON ou rechargez explicitement le serveur.",
      );
    if (S.saving) {
      await S.saving;
      return save();
    }
    const session = S,
      snapshot = M.copy(S.doc);
    status("Enregistrement…");
    const pending = request("PUT", `/briefings/${S.id}/document`, {
      revision: S.revision,
      document: snapshot,
    })
      .then((r) => {
        session.revision = r.data.revision;
        session.dirty =
          JSON.stringify(session.doc) !== JSON.stringify(snapshot);
        if (S === session)
          status(
            session.dirty
              ? "Modifications en attente…"
              : "Enregistré · révision " + session.revision,
          );
      })
      .catch((e) => {
        if (e.status === 409) {
          session.conflict = true;
          if (S === session) render();
        }
        throw e;
      })
      .finally(() => {
        session.saving = null;
      });
    session.saving = pending;
    await pending;
    if (session.dirty && !session.conflict && S === session)
      session.timer = setTimeout(() => save().catch(error), 1000);
  }
  window.openBriefingNext = async function (id) {
    if (S) {
      await close();
      if (S) return;
    }
    try {
      const b = (await request("GET", "/briefings/" + id)).data;
      const r = await request(
        "GET",
        `/briefings/project/${b.projectId}/sources`,
      );
      const root = document.createElement("section");
      root.className = "bn";
      root.setAttribute("aria-label", "Briefing Studio Next");
      document.body.appendChild(root);
      S = {
        root,
        id,
        original: b,
        doc: M.migrate(b),
        revision: b.revision || 0,
        sources: r.data,
        permissions: r.permissions,
        page: 0,
        selected: null,
        undo: [],
        redo: [],
        dirty: false,
        preview: !r.permissions.write,
        clipboard: null,
      };
      root.addEventListener("click", click);
      root.addEventListener("change", input);
      root.addEventListener("keydown", keyDown);
      root.addEventListener("paste", paste);
      root.addEventListener("contextmenu", (e) => {
        const n = e.target.closest("[data-block]");
        if (!n || S.preview) return;
        e.preventDefault();
        S.selected = n.dataset.block;
        render();
        const menu = document.createElement("div");
        menu.className = "bn-context";
        menu.style.cssText = `position:fixed;left:${Math.min(e.clientX, innerWidth - 230)}px;top:${Math.min(e.clientY, innerHeight - 170)}px;z-index:7;background:white;padding:10px;border:1px solid #ccd;border-radius:8px`;
        menu.innerHTML =
          btn("copy", "Copier") +
          btn("duplicate", "Dupliquer") +
          btn("delete", "Supprimer");
        menu.addEventListener("mouseleave", () => menu.remove());
        S.root.append(menu);
      });
      render();
    } catch (e) {
      error(e);
    }
  };
  function fieldHtml(k, v) {
    if (k === "assignedToId" || k === "index" || k === "mode" || !v) return "";
    const url = ["phone", "email"].includes(k)
      ? (k === "phone" ? "tel:" : "mailto:") + encodeURIComponent(v)
      : k === "url"
        ? safeUrl(v)
        : "";
    return `<div class="bn-field ${v.length > 160 ? "bn-wide-field" : ""}"><small>${E(labels[k] || k)}</small><div>${url ? `<a href="${E(url)}" target="_blank" rel="noopener noreferrer">${E(display(k, v))}</a>` : E(display(k, v))}</div></div>`;
  }
  function blockHtml(b, print = false) {
    const style = b.style || {},
      st = `${style.color ? "color:" + style.color + ";" : ""}${style.font ? "font-family:" + style.font + ";" : ""}${style.size ? "font-size:" + style.size + "px;" : ""}`;
    let content = Object.entries(b.content)
      .map(([k, v]) => fieldHtml(k, v))
      .join("");
    if (
      print &&
      b.graphic &&
      window.BriefingNextGraphics.issues(
        window.BriefingNextGraphics.normalize(M.copy(b.graphic)),
      ).length
    )
      throw new Error("Texte ou objet graphique hors page : " + b.title);
    if (b.kind === "graphic" && b.graphic)
      content = window.BriefingNextGraphics.html(
        b.graphic,
        b.graphic.backgroundId ? b.content.url : "",
      );
    else if (b.kind === "plan" && b.pdf) {
      const preview = M.pdfPreview(b.content.url, b.pdf.page);
      if (!preview) throw new Error("Aperçu PDF indisponible : " + b.title);
      content = `<div class="bn-photo-frame bn-pdf-page"><img src="${E(preview)}" alt="${E(b.title)}" loading="lazy"></div><div class="bn-field"><a href="${E(safeUrl(b.content.url))}#page=${b.pdf.page}" target="_blank" rel="noopener noreferrer">Ouvrir le PDF original · page ${b.pdf.page}</a></div>`;
    } else if (b.kind === "legacy")
      content = `<div class="bn-legacy" data-legacy="${E(b.id)}">Chargement de l’original…</div>`;
    else if (
      b.kind === "photo" &&
      safeUrl(b.content.url) &&
      /\.(png|jpe?g|webp|gif)(?:\?|$)/i.test(b.content.url)
    )
      content =
        `<div class="bn-photo-frame" style="${b.image && b.image.ratio !== "original" ? "--photo-ratio:" + { wide: 16 / 9, square: 1, portrait: 3 / 4 }[b.image.ratio] + ";aspect-ratio:" + { wide: "16/9", square: "1/1", portrait: "3/4" }[b.image.ratio] + ";" : ""}"><img src="${E(safeUrl(b.content.url))}" alt="${E(b.content.caption || b.title)}" loading="lazy" style="${b.image && b.image.ratio !== "original" ? "width:100%;height:100%;max-height:none;object-fit:" + b.image.fit + ";object-position:" + b.image.x + "% " + b.image.y + "%;" : ""}"></div>` +
        fieldHtml("caption", b.content.caption || "");
    else if (b.kind === "table")
      content = `<div class="bn-tsv"><table>${(b.content.table || "")
        .split("\n")
        .map(
          (row, i) =>
            "<tr>" +
            row
              .split("\t")
              .map((cell) =>
                i === 0
                  ? "<th>" + E(cell) + "</th>"
                  : "<td>" + E(cell) + "</td>",
              )
              .join("") +
            "</tr>",
        )
        .join("")}</table></div>`;
    const editable = S?.permissions.write && !S?.publication;
    const actions =
      !print && S?.preview && !S?.publication && b.source
        ? b.source.kind === "task" && S.permissions.write
          ? btn("task", "Modifier le statut", `data-id="${E(b.id)}"`)
          : b.source.kind === "checklist"
            ? btn(
                "quality",
                "Ouvrir le contrôle et ses preuves",
                `data-id="${E(b.id)}"`,
              )
            : ""
        : "";
    return `<section class="bn-block ${E(b.layout)} ${!print && (S?.selected === b.id || S?.multi?.includes(b.id)) ? "selected" : ""} ${b.hidden ? "bn-hidden" : ""}" data-block="${E(b.id)}" draggable="${!print && !S?.preview && !b.locked}" style="${st}" tabindex="${print ? -1 : 0}"><h2>${E(b.title)}</h2><div class="bn-fields">${content}</div>${b.annotation ? `<div class="bn-annotation">${E(b.annotation)}</div>` : ""}<div class="bn-source">${b.mode === "linked" ? "Lié au projet" : b.mode === "frozen" ? "Figé pour diffusion" : "Personnalisé"}${b.refreshedAt ? " · " + E(new Date(b.refreshedAt).toLocaleString("fr-BE")) : ""}${b.locked ? " · Verrouillé" : ""}${b.hidden ? " · Masqué à la diffusion" : ""}</div>${actions}</section>`;
  }
  function paperHtml(p, index, print = false, document = S.doc) {
    const theme = p.theme || document.theme;
    return `<article class="bn-paper ${theme === "editorial" ? "bn-editorial" : theme === "field" ? "bn-field-theme" : ""}" style="${themeCss(theme, document.brand)}"><div class="bn-kicker">${E(document.brand?.name || "VIEWBOX INTERNATIONAL")} · ${E(document.title)}</div><h1>${E(p.title)}</h1><div class="bn-page-content">${p.blocks
      .filter((b) => !(print || S.preview) || !b.hidden)
      .map((b) => blockHtml(b, print))
      .join(
        "",
      )}</div><footer><span>${S.publication ? "Édition publiée" : "Brouillon"} · ${E(new Date(document.updatedAt).toLocaleString("fr-BE"))}</span><span>${index + 1}</span></footer></article>`;
  }
  function render() {
    if (!S) return;
    S.page = Math.max(0, Math.min(S.page, S.doc.pages.length - 1));
    const p = current(),
      b = selected(),
      editing = S.permissions.write && !S.publication;
    S.root.classList.toggle("bn-preview", S.preview);
    S.root.dataset.format = S.doc.format;
    S.root.innerHTML = `<header><strong>STUDIO NEXT</strong><input aria-label="Nom du briefing" data-doc="title" value="${E(S.doc.title)}" ${!editing ? "readonly" : ""}><span class="bn-status">${S.publication ? "Édition publiée · lecture seule" : S.conflict ? "Conflit : votre copie est conservée" : S.dirty ? "Non enregistré" : "Révision " + S.revision}</span>${editing ? btn("undo", "↶", 'aria-label="Annuler" ' + (!S.undo.length ? "disabled" : "")) + btn("redo", "↷", 'aria-label="Rétablir" ' + (!S.redo.length ? "disabled" : "")) + btn("generate", "Générer", 'class="primary"') + btn("refresh", "Actualiser") + btn("refreshScope", "Actualiser une sélection") + btn("save", "Enregistrer") : ""}${btn("preview", S.preview ? "Designer" : "Vue chantier")}${btn("export", "PDF / imprimer")}${btn("versions", "Diffusions")}${btn("close", "Fermer")}</header>
 ${S.conflict ? `<div class="bn-warning">Une autre session a enregistré une nouvelle révision. ${btn("backup", "Télécharger ma copie JSON")}${btn("reload", "Recharger le serveur")}</div>` : ""}
 <div class="bn-body"><nav><h3>Pages · ${S.doc.pages.length}</h3><input aria-label="Rechercher une page" placeholder="Rechercher…" data-search>
 ${S.doc.pages.map((p, i) => `<button data-action="page" data-index="${i}" class="${i === S.page ? "active" : ""}"><span class="bn-page-thumb" style="${themeCss(p.theme || S.doc.theme, S.doc.brand)}">${E(p.title)}</span>${i + 1} · ${E(p.title)}</button>`).join("")}
 ${editing ? `<div class="bn-row">${btn("addPage", "+ Page")}${btn("copyPage", "Dupliquer")}${btn("upPage", "↑")}${btn("downPage", "↓")}${btn("deletePage", "Supprimer")}</div><h3>Bibliothèque</h3>${btn("add", "+ Bloc chantier")}${btn("addGraphic", "+ Composition libre")}${btn("media", "Médias du projet")}${btn("templates", "Mes modèles")}${btn("pdfImport", "Pages d’un PDF")}${btn("original", "Copie éditable de l’original")}` : ""}
 </nav><main>${S.preview ? S.doc.pages.map((p, i) => paperHtml(p, i)).join("") : paperHtml(p, S.page)}</main><aside>
 <h3>Direction artistique</h3>${editing ? btn("brand", "Kit de marque") : ""}${S.doc.brand ? `<p class="bn-count">Identité : ${E(S.doc.brand.name)} · les styles locaux sont conservés.</p>` : ""}${Object.entries(
   M.themes,
 )
   .map(([k, t]) =>
     btn(
       "theme",
       E(t.name),
       `class="bn-theme" data-theme="${k}" style="${themeCss(k)}" ${!editing ? "disabled" : ""}`,
     ),
   )
   .join("")}
 <label>Portée du thème<select data-scope><option value="document">Tout le document</option><option value="page">Cette page</option><option value="selection">Sélection</option></select></label>
 <label>Format<select data-doc="format" ${!editing ? "disabled" : ""}><option value="wide" ${S.doc.format === "wide" ? "selected" : ""}>Présentation 16:9</option><option value="a4" ${S.doc.format === "a4" ? "selected" : ""}>Document A4 portrait</option></select></label>
 <label>Titre de page<input data-page="title" value="${E(p.title)}" ${!editing ? "readonly" : ""}></label>
 <h3>${b ? selection().length + " bloc(s) sélectionné(s)" : "Sélectionnez un bloc"}</h3><p class="bn-count">Ctrl/Cmd ou Maj + clic pour sélectionner plusieurs blocs.</p>
 ${
   b
     ? `<label>Titre<input data-block-field="title" value="${E(b.title)}" ${!editing || b.locked ? "disabled" : ""}></label>
 <label>Composition<select data-block-field="layout" ${!editing || b.locked ? "disabled" : ""}>${["list", "cards", "table"].map((x, i) => `<option value="${x}" ${b.layout === x ? "selected" : ""}>${["Liste claire", "Carte", "Tableau"][i]}</option>`).join("")}</select></label>
 <label>Source<select data-block-field="mode" ${!editing ? "disabled" : ""}>${["linked", "frozen", "custom"].map((x, i) => `<option value="${x}" ${b.mode === x ? "selected" : ""}>${["Lié au projet", "Figé pour diffusion", "Personnalisé"][i]}</option>`).join("")}</select></label>
 ${
   b.kind !== "legacy"
     ? Object.entries(b.content)
         .filter(([k]) => k !== "assignedToId")
         .map(
           ([k, v]) =>
             `<label>${E(labels[k] || k)}<textarea data-content="${E(k)}" ${!editing || b.locked ? "disabled" : ""}>${E(v)}</textarea></label>`,
         )
         .join("")
     : "<p>Original préservé. Utilisez « Copie éditable de l’original » pour ses objets libres.</p>"
 }
 ${
   b.kind === "photo"
     ? `<fieldset ${!editing || b.locked ? "disabled" : ""}><legend>Cadrage photo</legend><label>Cadre<select data-image="ratio">${[
         ["original", "Image entière"],
         ["wide", "16:9"],
         ["square", "Carré"],
         ["portrait", "Portrait 3:4"],
       ]
         .map(
           ([v, t]) =>
             `<option value="${v}" ${(b.image?.ratio || "original") === v ? "selected" : ""}>${t}</option>`,
         )
         .join(
           "",
         )}</select></label><label>Ajustement<select data-image="fit"><option value="cover" ${b.image?.fit !== "contain" ? "selected" : ""}>Remplir / recadrer</option><option value="contain" ${b.image?.fit === "contain" ? "selected" : ""}>Voir toute l’image</option></select></label>${["x", "y"].map((k) => `<label>Point focal ${k === "x" ? "horizontal" : "vertical"} (${b.image?.[k] ?? 50} %)<input type="range" min="0" max="100" data-image="${k}" value="${b.image?.[k] ?? 50}"></label>`).join("")}<p>Le fichier original reste intact.</p></fieldset>`
     : ""
 }
 ${b.kind === "photo" && editing ? btn("annotateGraphic", "Créer un schéma annoté") : ""}
 ${b.kind === "graphic" && editing && !b.locked ? btn("editGraphic", "Modifier la composition libre") : ""}
 <label>Annotation personnelle<textarea data-block-field="annotation" ${!editing ? "disabled" : ""}>${E(b.annotation)}</textarea></label>
 <label>Police<select data-style="font">${["Arial", "Georgia", "Verdana"].map((f) => `<option ${b.style?.font === f ? "selected" : ""}>${f}</option>`).join("")}</select></label><label>Couleur<input type="color" data-style="color" value="${E(b.style?.color || M.themes[S.doc.theme].ink)}"></label><label>Taille<input type="number" min="14" max="64" data-style="size" value="${b.style?.size || 18}"></label>
 ${editing ? `<div class="bn-row">${btn("resetStyle", "Réinitialiser style")}${btn("copyStyle", "Copier style")}${btn("pasteStyle", "Coller style")}</div><div class="bn-row">${btn("copy", "Copier")}${btn("duplicate", "Dupliquer")}${btn("delete", "Supprimer")}${btn("up", "↑")}${btn("down", "↓")}${btn("lock", b.locked ? "Déverrouiller" : "Verrouiller")}${btn("hide", b.hidden ? "Afficher" : "Masquer")}</div>` : ""}`
     : ""
 }
 <h3>Calques / blocs</h3>${p.blocks.map((x) => btn("select", `${x.hidden ? "◌ " : ""}${x.locked ? "🔒 " : ""}${E(x.title)}`, `data-id="${E(x.id)}" style="display:block;width:100%;margin:5px 0;text-align:left"`)).join("")}
 </aside></div>`;
    S.root
      .querySelector("[data-search]")
      ?.addEventListener("input", (e) =>
        S.root
          .querySelectorAll("nav [data-action=page]")
          .forEach(
            (n) =>
              (n.hidden = !n.textContent
                .toLowerCase()
                .includes(e.target.value.toLowerCase())),
          ),
      );
    S.root.querySelectorAll("[data-block]").forEach((n) => {
      n.ondragstart = (e) => {
        if (e.target.matches("a,input,textarea")) return;
        e.dataTransfer.setData("application/x-vem-block", n.dataset.block);
      };
      n.ondragover = (e) => {
        if ([...e.dataTransfer.types].includes("application/x-vem-block"))
          e.preventDefault();
      };
      n.ondrop = (e) => {
        const id = e.dataTransfer.getData("application/x-vem-block");
        if (!id) return;
        e.preventDefault();
        const p = current(),
          from = p.blocks.findIndex((b) => b.id === id),
          to = p.blocks.findIndex((b) => b.id === n.dataset.block);
        if (from < 0 || to < 0 || p.blocks[from].locked) return;
        change(() => {
          const [block] = p.blocks.splice(from, 1);
          p.blocks.splice(to, 0, block);
        });
      };
    });
    hydrateLegacy(S.root).catch(error);
  }
  async function hydrateLegacy(root) {
    const session = S;
    for (const el of root.querySelectorAll("[data-legacy]")) {
      const b = session.doc.pages
        .flatMap((p) => p.blocks)
        .find((b) => b.id === el.dataset.legacy);
      if (!b) continue;
      if (!el.isConnected) continue;
      const i = Number(b.content.index);
      if (b.content.mode === "studio") {
        if (!window.fabric) {
          el.textContent =
            "Ouvrez la copie originale dans le Studio pour consulter ce canevas.";
          continue;
        }
        const json = session.original.studioSlides?.slides?.[i]?.json;
        if (!json) {
          el.textContent = "Page originale vide";
          continue;
        }
        const canvas = new fabric.StaticCanvas(
          document.createElement("canvas"),
          { width: 1280, height: 720 },
        );
        try {
          await brfLoadIsolatedSlide(
            canvas,
            M.copy(json),
            session.original.studioSlides?.logoUrl,
          );
          canvas.renderAll();
          const img = document.createElement("img");
          img.src = canvas.toDataURL({ format: "png" });
          img.alt = "Page originale " + (i + 1);
          el.replaceChildren(img);
        } finally {
          canvas.dispose();
        }
      } else {
        const slide = session.original.slides?.[i];
        // Plain text avoids injecting legacy HTML into the new document.
        const lines = [];
        function visit(x) {
          if (typeof x === "string") lines.push(x);
          else if (Array.isArray(x)) x.forEach(visit);
          else if (x && typeof x === "object")
            Object.entries(x)
              .filter(
                ([k]) =>
                  !["id", "type", "style", "color", "background"].includes(k),
              )
              .forEach(([, v]) => visit(v));
        }
        visit(slide);
        el.textContent = lines.join("\n");
        el.style.whiteSpace = "pre-wrap";
      }
    }
  }
  function input(e) {
    const t = e.target;
    if (!S.permissions.write || S.publication) return;
    if (t.dataset.doc) change(() => (S.doc[t.dataset.doc] = t.value));
    else if (t.dataset.page)
      change(() => (current()[t.dataset.page] = t.value));
    else if (t.dataset.content) {
      if (selected()?.locked) return;
      change(() => {
        selected().content[t.dataset.content] = t.value;
        selected().mode = "custom";
      });
    } else if (t.dataset.blockField) {
      if (
        selected()?.locked &&
        !["annotation", "mode"].includes(t.dataset.blockField)
      )
        return;
      change(() => (selected()[t.dataset.blockField] = t.value));
    } else if (t.dataset.image) {
      if (!selected() || selected().locked || selected().kind !== "photo")
        return;
      change(() => {
        const b = selected();
        b.image = b.image || { ratio: "original", fit: "cover", x: 50, y: 50 };
        b.image[t.dataset.image] = ["x", "y"].includes(t.dataset.image)
          ? Math.min(100, Math.max(0, Number(t.value) || 0))
          : t.value;
      });
    } else if (t.dataset.style) {
      if (selected()?.locked) return;
      change(() => {
        selected().style = selected().style || {};
        selected().style[t.dataset.style] =
          t.dataset.style === "size"
            ? Math.min(64, Math.max(14, Number(t.value) || 18))
            : t.value;
      });
    }
  }
  async function click(e) {
    const a = e.target.closest("[data-action]");
    if (!a) {
      const block = e.target.closest("[data-block]");
      if (block && !S.preview) {
        if (e.ctrlKey || e.metaKey || e.shiftKey) {
          S.multi = [
            ...new Set(
              [...(S.multi || []), S.selected, block.dataset.block].filter(
                Boolean,
              ),
            ),
          ];
        } else S.multi = [];
        S.selected = block.dataset.block;
        render();
      }
      return;
    }
    const act = a.dataset.action,
      b = selected();
    try {
      if (act === "close") return close();
      if (act === "save") return await save();
      if (act === "page") {
        S.page = Number(a.dataset.index);
        S.selected = null;
        S.multi = [];
        render();
        return;
      }
      if (act === "select") {
        S.selected = a.dataset.id;
        render();
        return;
      }
      if (act === "preview") {
        S.preview = !S.preview;
        render();
        return;
      }
      if (act === "export") return await exportDocument();
      if (act === "versions") return await versions();
      if (act === "backup") return downloadJSON();
      if (act === "reload") {
        if (
          !confirm(
            "Recharger et abandonner les changements de cet onglet ? Téléchargez votre copie si nécessaire.",
          )
        )
          return;
        S.dirty = false;
        const id = S.id;
        await close();
        return openBriefingNext(id);
      }
      if (act === "quality") {
        const block = S.doc.pages
          .flatMap((p) => p.blocks)
          .find((b) => b.id === a.dataset.id);
        await openChecklistFull(S.doc.projectId, block.content.phase, "list");
        document.getElementById("checklist-full").style.zIndex = "10030";
        return;
      }
      if (!S.permissions.write || S.publication) return;
      if (act === "task") return taskDialog(a.dataset.id);
      if (["addGraphic", "editGraphic", "annotateGraphic"].includes(act)) {
        if (act === "editGraphic" && (!b || b.locked)) return;
        const session = S;
        const files = S.sources.filter(
          (f) =>
            f.kind === "file" &&
            /\.(png|jpe?g|webp|gif)(?:\?|$)/i.test(f.fields.url || ""),
        );
        if (
          b?.source?.kind === "file" &&
          b.content.url &&
          !files.some((f) => f.id === b.source.id)
        )
          files.push({
            kind: "file",
            id: b.source.id,
            title: b.title,
            fields: { url: b.content.url },
          });
        window.BriefingNextGraphics.open({
          files,
          parent: S.root,
          scene:
            act === "editGraphic"
              ? b.graphic
              : act === "annotateGraphic"
                ? {
                    ...window.BriefingNextGraphics.blank(),
                    backgroundId: b.source?.id,
                  }
                : undefined,
          onApply: (graphic, background) => {
            if (S !== session) return;
            change(() => {
              const attach = (block) => {
                block.graphic = graphic;
                if (
                  background &&
                  block.source?.kind === "file" &&
                  block.source.id === background.id
                )
                  return;
                if (background) {
                  block.source = { kind: "file", id: background.id };
                  block.content.url = background.fields.url;
                  block.baseline = { ...background.fields };
                  block.mode = "linked";
                } else {
                  delete block.source;
                  delete block.content.url;
                  block.baseline = {};
                  block.mode = "custom";
                }
              };
              if (act === "editGraphic") attach(b);
              else {
                const block = {
                  id: M.uid(),
                  kind: "graphic",
                  title: "Schéma chantier",
                  layout: "list",
                  mode: "custom",
                  baseline: {},
                  content: {},
                  annotation: "",
                  graphic,
                };
                attach(block);
                current().blocks.push(block);
                S.selected = block.id;
              }
            });
          },
        });
        return;
      }
      if (act === "brand") return brandDialog();
      if (act === "generate") return generator();
      if (act === "refresh") return refresh();
      if (act === "refreshScope") return refreshScope();
      if (act === "media") return media();
      if (act === "templates") return templates();
      if (act === "pdfImport") return pdfImport();
      if (act === "add") return addDialog();
      if (act === "undo" || act === "redo") {
        const from = act === "undo" ? S.undo : S.redo,
          to = act === "undo" ? S.redo : S.undo;
        if (from.length) {
          to.push(M.copy(S.doc));
          S.doc = from.pop();
          dirty();
          render();
        }
        return;
      }
      if (act === "theme") {
        const scope = S.root.querySelector("[data-scope]").value;
        change(() => {
          if (scope === "page") current().theme = a.dataset.theme;
          else if (scope === "selection") {
            selection()
              .filter((b) => !b.locked)
              .forEach((b) => {
                b.style = {
                  ...b.style,
                  color: M.themes[a.dataset.theme].ink,
                  font: M.themes[a.dataset.theme].font,
                };
              });
          } else {
            S.doc.theme = a.dataset.theme;
            S.doc.pages.forEach((p) => delete p.theme);
          }
        });
        return;
      }
      if (act === "copy") {
        if (b)
          S.clipboard = {
            projectId: S.doc.projectId,
            blocks: M.copy(selection()),
          };
        return;
      }
      if (act === "copyStyle") {
        if (b) S.style = M.copy(b.style || {});
        return;
      }
      if (act === "original") return originalCopy();
      change(() => {
        const p = current(),
          i = p.blocks.findIndex((x) => x.id === S.selected);
        if (act === "addPage") {
          S.doc.pages.push({ id: M.uid(), title: "Nouvelle page", blocks: [] });
          S.page = S.doc.pages.length - 1;
          S.selected = null;
        }
        if (act === "copyPage") {
          S.doc.pages.splice(S.page + 1, 0, M.duplicate(p));
          S.page++;
        }
        if (
          act === "deletePage" &&
          S.doc.pages.length > 1 &&
          confirm("Supprimer cette page ?")
        ) {
          p.blocks
            .filter((b) => b.source)
            .forEach((b) => S.doc.excluded.push(M.key(b.source)));
          S.doc.pages.splice(S.page, 1);
          S.page = Math.max(0, S.page - 1);
        }
        if (act === "upPage" && S.page > 0) {
          S.doc.pages.splice(S.page, 1);
          S.doc.pages.splice(--S.page, 0, p);
        }
        if (act === "downPage" && S.page < S.doc.pages.length - 1) {
          S.doc.pages.splice(S.page, 1);
          S.doc.pages.splice(++S.page, 0, p);
        }
        if (!b) return;
        if (act === "lock") {
          b.locked = !b.locked;
          return;
        }
        if (b.locked) return;
        if (act === "hide") b.hidden = !b.hidden;
        if (act === "delete") {
          const targets = selection().filter((x) => !x.locked);
          targets
            .filter((x) => x.source)
            .forEach((x) => S.doc.excluded.push(M.key(x.source)));
          p.blocks = p.blocks.filter((x) => !targets.includes(x));
          S.selected = null;
          S.multi = [];
        }
        if (act === "duplicate")
          p.blocks.splice(i + 1, 0, ...selection().map(M.duplicate));
        if (act === "up" && i > 0) {
          p.blocks.splice(i, 1);
          p.blocks.splice(i - 1, 0, b);
        }
        if (act === "down" && i < p.blocks.length - 1) {
          p.blocks.splice(i, 1);
          p.blocks.splice(i + 1, 0, b);
        }
        if (act === "resetStyle")
          selection()
            .filter((b) => !b.locked)
            .forEach((b) => delete b.style);
        if (act === "pasteStyle" && S.style)
          selection()
            .filter((b) => !b.locked)
            .forEach((b) => (b.style = M.copy(S.style)));
      });
    } catch (err) {
      error(err);
    }
  }
  function dialog(title, html, submit, label = "Appliquer") {
    const layer = document.createElement("div");
    layer.className = "bn-dialog-wrap";
    layer.innerHTML = `<div class="bn-dialog" role="dialog" aria-modal="true" aria-label="${E(title)}"><h2>${E(title)}</h2>${html}<div class="bn-row"><button class="primary" data-submit>${E(label)}</button><button data-cancel>Annuler</button></div><p data-error role="alert"></p></div>`;
    S.root.appendChild(layer);
    layer.querySelector("[data-cancel]").onclick = () => layer.remove();
    layer.querySelector("[data-submit]").onclick = async () => {
      const button = layer.querySelector("[data-submit]");
      button.disabled = true;
      try {
        await submit(layer);
        layer.remove();
      } catch (e) {
        layer.querySelector("[data-error]").textContent = e.message;
        button.disabled = false;
      }
    };
    return layer;
  }
  function brandDialog() {
    const initial = S.doc.brand || {
      ...M.themes[S.doc.theme],
      name: "VIEWBOX INTERNATIONAL",
    };
    const layer = dialog(
      "Kit de marque",
      `<p>Enregistré dans ce briefing. Exportez ce kit pour le réutiliser dans un autre projet sans transmettre de contenu chantier.</p><label>Nom<input name="brand-name" maxlength="100" value="${E(initial.name)}"></label>${[
        ["ink", "Texte"],
        ["paper", "Fond"],
        ["accent", "Accent"],
      ]
        .map(
          ([k, t]) =>
            `<label>${t}<input type="color" name="brand-${k}" value="${E(initial[k])}"></label>`,
        )
        .join(
          "",
        )}<label>Police<select name="brand-font">${["Arial", "Georgia", "Verdana"].map((f) => `<option ${initial.font === f ? "selected" : ""}>${f}</option>`).join("")}</select></label><div class="bn-row"><button data-kit-export>Exporter le kit JSON</button><label>Importer un kit JSON<input type="file" accept=".json,application/json" data-kit-import></label><button data-kit-reset>Revenir aux thèmes</button></div>`,
      (l) =>
        change(() => {
          S.doc.brand = read(l);
        }),
    );
    function read(l) {
      return M.brandKit(
        Object.fromEntries(
          ["name", "ink", "paper", "accent", "font"].map((k) => [
            k,
            l.querySelector(`[name=brand-${k}]`).value,
          ]),
        ),
      );
    }
    layer.querySelector("[data-kit-export]").onclick = () => {
      try {
        const url = URL.createObjectURL(
          new Blob(
            [
              JSON.stringify(
                { type: "vem-brand-kit", version: 1, brand: read(layer) },
                null,
                2,
              ),
            ],
            { type: "application/json" },
          ),
        );
        const a = document.createElement("a");
        a.href = url;
        a.download = "vem-kit-marque.json";
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } catch (e) {
        layer.querySelector("[data-error]").textContent = e.message;
      }
    };
    layer.querySelector("[data-kit-import]").onchange = async (e) => {
      try {
        const f = e.target.files[0];
        if (!f) return;
        if (f.size > 10000)
          throw new Error("Kit trop volumineux (10 Ko maximum).");
        const envelope = JSON.parse(await f.text());
        if (envelope.type !== "vem-brand-kit" || envelope.version !== 1)
          throw new Error("Format de kit non reconnu.");
        const brand = M.brandKit(envelope);
        for (const [k, v] of Object.entries(brand))
          layer.querySelector(`[name=brand-${k}]`).value = v;
        layer.querySelector("[data-error]").textContent =
          "Kit chargé : cliquez sur Appliquer pour l’enregistrer.";
      } catch (e) {
        layer.querySelector("[data-error]").textContent = e.message;
      }
    };
    layer.querySelector("[data-kit-reset]").onclick = () => {
      change(() => {
        delete S.doc.brand;
      });
      layer.remove();
    };
  }
  async function generator() {
    const r = await request(
      "GET",
      `/briefings/project/${S.doc.projectId}/sources`,
    );
    S.sources = r.data;
    const d = dialog(
      "Composer un briefing",
      `<p>Génération depuis les données réelles. Le résultat est réversible avec Annuler. Les critères sont mémorisés pour les nouvelles sources proposées à l’actualisation. Les sources précédemment exclues restent décochées ; vous pouvez les réinclure.</p><div class="bn-row"><label>Préréglage<select name="preset"><option value="all">Briefing complet</option><option value="morning">Réunion du matin</option><option value="installation">Montage</option><option value="dismantling">Démontage</option><option value="logistics">Logistique</option></select></label><label>Thème<select name="theme">${Object.entries(
        M.themes,
      )
        .map(([k, t]) => `<option value="${k}">${E(t.name)}</option>`)
        .join(
          "",
        )}</select></label><label>Format<select name="format"><option value="wide">16:9</option><option value="a4">A4 portrait</option></select></label></div>
 <div class="bn-row"><label>Date des tâches<input name="date" type="date"></label><label>Priorité<select name="priority"><option value="">Toutes</option>${["low", "normal", "high", "critical"].map((x) => `<option>${x}</option>`).join("")}</select></label><label>Responsable<select name="responsible"><option value="">Tous</option>${[...new Map(S.sources.filter((s) => s.kind === "task" && s.fields.assignedToId).map((s) => [s.fields.assignedToId, s.fields.responsible])).entries()].map(([id, n]) => `<option value="${E(id)}">${E(n)}</option>`).join("")}</select></label></div>
 <p class="bn-warning">La phase filtre les contrôles et l’équipe. Les tâches n’ont pas de phase métier : elles restent sélectionnables explicitement. Diffusion interne authentifiée uniquement.</p><label><input name="open" type="checkbox"> Points ouverts uniquement</label><p class="bn-count"></p><div data-items></div>`,
      (l) => {
        const options = read(l);
        options.theme = l.querySelector("[name=theme]").value;
        options.format = l.querySelector("[name=format]").value;
        options.selected = [...l.querySelectorAll("[data-source]:checked")].map(
          (x) => x.dataset.source,
        );
        change(() => {
          const brand = S.doc.brand;
          S.doc = M.generate(S.doc.projectId, S.doc.title, S.sources, options);
          if (brand) S.doc.brand = brand;
          S.page = 0;
          S.selected = null;
        });
      },
      "Générer le brouillon",
    );
    function read(l) {
      const preset = l.querySelector("[name=preset]").value;
      return {
        phase: ["installation", "dismantling"].includes(preset) ? preset : "",
        open: l.querySelector("[name=open]").checked || preset === "morning",
        date: l.querySelector("[name=date]").value,
        priority: l.querySelector("[name=priority]").value,
        responsible: l.querySelector("[name=responsible]").value,
        preset,
        kinds: preset === "logistics"
          ? ["project", "truck", "contact", "team"]
          : ["project", "task", "checklist", "truck", "contact", "team"],
      };
    }
    function list() {
      const o = read(d);
      const eligible = S.sources.filter(
        (s) =>
          M.filter(s, o) &&
          s.kind !== "file" &&
          (o.preset !== "logistics" ||
            ["project", "truck", "contact", "team"].includes(s.kind)),
      );
      d.querySelector("[data-items]").innerHTML = eligible
        .map(
          (s) =>
            `<label class="bn-choice"><input type="checkbox" ${S.doc.excluded.includes(M.key(s)) ? "" : "checked"} data-source="${E(M.key(s))}"><span>${E(s.title)}<small>${E(s.kind)} · ${E(s.fields.status || s.fields.phase || "")}</small></span></label>`,
        )
        .join("");
      count();
    }
    function count() {
      const n = d.querySelectorAll("[data-source]:checked").length;
      d.querySelector(".bn-count").textContent =
        `${n} inclus · ${S.sources.length - n} exclus · ${S.sources.length} sources disponibles`;
    }
    d.addEventListener("change", (e) => {
      if (e.target.dataset.source) count();
      else if (e.target.name && !["theme", "format"].includes(e.target.name))
        list();
    });
    const previous = S.doc.generation || {};
    for (const name of ["preset", "date", "priority", "responsible"]) {
      const field = d.querySelector(`[name="${name}"]`);
      if (previous[name] !== undefined) field.value = previous[name];
    }
    d.querySelector('[name="open"]').checked = !!previous.open;
    d.querySelector('[name="theme"]').value = S.doc.theme;
    d.querySelector('[name="format"]').value = S.doc.format;
    list();
  }
  function refreshScope() {
    const session = S;
    const pageId = current().id;
    const selected = [...new Set([...(S.multi || []), S.selected].filter(Boolean))];
    dialog(
      "Actualisation ciblée",
      `<p>Compare les sources existantes sans ajouter de nouveaux éléments. Les blocs figés ou verrouillés sont conservés. Les retouches en conflit restent soumises à votre choix.</p><label>Périmètre<select name="refresh-scope"><option value="page">Page actuelle</option><option value="selection" ${selected.length ? "" : "disabled"}>Blocs sélectionnés (${selected.length})</option></select></label>`,
      async (l) => {
        if (S !== session) return;
        const ids = l.querySelector('[name="refresh-scope"]').value === "selection"
          ? selected
          : S.doc.pages.find((p) => p.id === pageId)?.blocks.map((b) => b.id) || [];
        await refresh(ids);
      },
      "Comparer",
    );
  }
  async function refresh(blockIds = null) {
    const session = S, snapshot = JSON.stringify(S.doc);
    const sources = (
        await request("GET", `/briefings/project/${S.doc.projectId}/sources`)
      ).data,
      changes = M.diff(session.doc, sources, blockIds);
    if (S !== session || JSON.stringify(S.doc) !== snapshot) {
      if (S === session) status("Le document a changé. Relancez la comparaison.");
      return;
    }
    if (!changes.length) {
      status("Données à jour");
      return;
    }
    dialog(
      blockIds === null ? "Comparer les données du projet" : "Comparer la sélection",
      `<p>${changes.length} différences. Vos annotations et styles restent inchangés. Les nouvelles sources respectent les filtres enregistrés ; les blocs existants restent comparés même hors filtre.</p>${changes.map((c, i) => `<div class="bn-choice"><div style="flex:1"><strong>${E(c.label)}</strong><small>${E(c.type === "conflict" ? "CONFLIT · retouche manuelle" : c.type)} ${E(labels[c.field] || c.field || "")}</small>${c.field ? `<p>Document : ${E(c.local)}<br>Projet : ${E(c.remote)}</p>` : ""}</div><select data-choice="${i}" style="width:185px"><option value="keep">${c.type === "deleted" ? "Conserver et figer" : c.type === "added" ? "Exclure" : "Garder ma retouche"}</option><option value="remote" ${c.type === "modified" ? "selected" : ""}>${c.type === "deleted" ? "Retirer explicitement" : c.type === "added" ? "Ajouter" : "Prendre le projet"}</option></select></div>`).join("")}`,
      (l) => {
        if (S !== session || JSON.stringify(S.doc) !== snapshot)
          throw new Error("Le document a changé. Relancez la comparaison.");
        const choices = {};
        l.querySelectorAll("[data-choice]").forEach(
          (x) => (choices[x.dataset.choice] = x.value),
        );
        change(() => {
          S.doc = M.apply(S.doc, changes, choices);
          S.sources = sources;
        });
      },
    );
  }
  function addDialog() {
    dialog(
      "Ajouter un bloc",
      `<label>Type<select name="kind">${[
        ["note", "Note du document"],
        ["cover", "Couverture"],
        ["instructions", "Consignes"],
        ["access", "Accès / localisation"],
        ["planning", "Planning"],
        ["table", "Tableau collé depuis Excel"],
      ]
        .map(([k, n]) => `<option value="${k}">${n}</option>`)
        .join(
          "",
        )}</select></label><label>Titre<input name="title" value="Note chantier"></label><p>Ce bloc est une note de document, il ne crée pas une tâche projet.</p>`,
      (l) =>
        change(() => {
          const kind = l.querySelector("[name=kind]").value;
          const b = {
            id: M.uid(),
            kind,
            title: l.querySelector("[name=title]").value,
            layout: "list",
            mode: "custom",
            baseline: {},
            content: kind === "table" ? { table: "" } : { text: "" },
            annotation: "",
          };
          current().blocks.push(b);
          S.selected = b.id;
        }),
    );
  }

  async function templates() {
    const session = S;
    const records = (
      await request("GET", `/briefings/project/${S.doc.projectId}/templates`)
    ).data;
    if (S !== session) return;
    const blueprint = M.templateFrom(S.doc),
      id = M.uid();
    const layer = dialog(
      "Mes modèles réutilisables",
      `<p>Modèles privés disponibles dans vos projets. Structure et styles uniquement : textes chantier, contacts, horaires, photos, fonds et liens source sont retirés. Les textes des compositions seront à compléter.</p><label>Nom du nouveau modèle<input name="template-name" value="Gabarit chantier" maxlength="120"></label><h3>Modèles enregistrés</h3>${records.map((r, i) => `<div class="bn-choice"><strong>${E(r.name)}</strong><button data-template-use="${i}">Utiliser</button><button data-template-export="${i}">Exporter JSON</button><button data-template-delete="${i}">Supprimer</button></div>`).join("") || "<p>Aucun modèle enregistré.</p>"}<label>Importer un modèle JSON<input type="file" data-template-import accept=".json,application/json"></label>`,
      async (l) => {
        await request(
          "PUT",
          `/briefings/project/${session.doc.projectId}/templates/${id}`,
          { name: l.querySelector("[name=template-name]").value, blueprint },
        );
        status("Modèle enregistré");
      },
      "Enregistrer la structure actuelle",
    );
    layer.addEventListener("click", async (e) => {
      try {
        const use = e.target.closest("[data-template-use]"),
          exp = e.target.closest("[data-template-export]"),
          del = e.target.closest("[data-template-delete]");
        if (use) {
          const record = records[Number(use.dataset.templateUse)];
          layer.remove();
          await useTemplate(record);
        }
        if (exp) {
          const record = records[Number(exp.dataset.templateExport)],
            url = URL.createObjectURL(
              new Blob(
                [
                  JSON.stringify(
                    {
                      type: "vem-briefing-template",
                      version: 1,
                      name: record.name,
                      blueprint: record.blueprint,
                    },
                    null,
                    2,
                  ),
                ],
                { type: "application/json" },
              ),
            );
          const a = document.createElement("a");
          a.href = url;
          a.download = "vem-modele-briefing.json";
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        }
        if (del) {
          const record = records[Number(del.dataset.templateDelete)];
          if (
            !confirm(
              "Supprimer ce modèle ? Les briefings créés restent conservés.",
            )
          )
            return;
          await request(
            "DELETE",
            `/briefings/project/${session.doc.projectId}/templates/${record.id}`,
          );
          del.closest(".bn-choice").remove();
        }
      } catch (e) {
        layer.querySelector("[data-error]").textContent = e.message;
      }
    });
    layer.querySelector("[data-template-import]").onchange = async (e) => {
      try {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > 1024 * 1024) throw new Error("Modèle supérieur à 1 Mo");
        const value = JSON.parse(await file.text());
        if (value.type !== "vem-briefing-template" || value.version !== 1)
          throw new Error("Format de modèle inconnu");
        const r = await request(
          "PUT",
          `/briefings/project/${session.doc.projectId}/templates/${M.uid()}`,
          { name: value.name, blueprint: value.blueprint },
        );
        layer.remove();
        await useTemplate(r.data);
      } catch (e) {
        layer.querySelector("[data-error]").textContent = e.message;
      }
    };
  }
  async function useTemplate(record) {
    const session = S,
      sources = (
        await request("GET", `/briefings/project/${S.doc.projectId}/sources`)
      ).data;
    if (S !== session) return;
    dialog(
      "Utiliser le modèle",
      `<p>${E(record.name)} · ${record.blueprint.pages.length} page(s). Les champs non reliés restent à compléter.</p><label>Insertion<select name="template-mode"><option value="append">Ajouter à la suite</option><option value="replace">Remplacer le document (annulable)</option></select></label>${record.blueprint.pages
        .map((p, i) =>
          p.blocks
            .map((b, j) =>
              b.binding
                ? `<label>Page ${i + 1} · ${E(M.blockNames[b.kind])}<select data-template-bind="${i}:${j}"><option value="">À compléter sans lien</option>${sources
                    .filter((s) => s.kind === b.binding)
                    .map(
                      (s) =>
                        `<option value="${E(M.key(s))}">${E(s.title)}</option>`,
                    )
                    .join("")}</select></label>`
                : "",
            )
            .join(""),
        )
        .join("")}`,
      (l) => {
        const bindings = Object.fromEntries(
          [...l.querySelectorAll("[data-template-bind]")]
            .filter((x) => x.value)
            .map((x) => [x.dataset.templateBind, x.value]),
        );
        const draft = M.instantiateTemplate(
          record.blueprint,
          S.doc.projectId,
          S.doc.title,
          sources,
          bindings,
        );
        const append =
          l.querySelector("[name=template-mode]").value === "append";
        if (append && S.doc.pages.length + draft.pages.length > 500)
          throw new Error("Maximum 500 pages par document");
        change(() => {
          if (append) {
            S.page = S.doc.pages.length;
            draft.pages.forEach((p) => (p.theme = p.theme || draft.theme));
            S.doc.pages.push(...draft.pages);
          } else {
            if (S.doc.brand) draft.brand = M.copy(S.doc.brand);
            S.doc = draft;
            S.page = 0;
          }
          S.selected = null;
          S.sources = sources;
        });
      },
    );
  }
  async function pdfImport() {
    const session = S;
    S.sources = (
      await request("GET", `/briefings/project/${S.doc.projectId}/sources`)
    ).data;
    const pdfs = S.sources.filter(
      (s) => s.kind === "file" && /\.pdf(?:\?|$)/i.test(s.fields.url),
    );
    const layer = dialog(
      "Importer les pages d’un PDF",
      `<p>PDF déjà ajouté aux fichiers du projet (10 Mo maximum). Aperçus Cloudinary de 2 000 px, non vectoriels ; l’original reste accessible. Choisissez au maximum 50 pages par lot.</p><label>PDF<select name="pdf-file">${pdfs.map((f, i) => `<option value="${i}">${E(f.title)}</option>`).join("")}</select></label><button data-pdf-info>Lire le nombre de pages</button><p data-pdf-count></p><label>Pages (exemple : 1, 3-5)<input name="pdf-pages" value="1" maxlength="1000"></label><p data-pdf-progress role="status"></p>`,
      async (l) => {
        const source = pdfs[Number(l.querySelector("[name=pdf-file]").value)];
        if (!source)
          throw new Error("Ajoutez d’abord un PDF aux fichiers du projet");
        const info = (
          await request(
            "GET",
            `/briefings/project/${session.doc.projectId}/pdf/${source.id}`,
          )
        ).data;
        const pages = M.pdfPages(
          l.querySelector("[name=pdf-pages]").value,
          info.pages,
        );
        if (S !== session || !l.isConnected) return;
        if (S.doc.pages.length + pages.length > 500)
          throw new Error("Maximum 500 pages par document");
        const controller = new AbortController();
        l.querySelector("[data-cancel]").addEventListener(
          "click",
          () => controller.abort(),
          { once: true },
        );
        for (const [index, page] of pages.entries()) {
          if (!l.isConnected || S !== session) throw new Error("Import annulé");
          l.querySelector("[data-pdf-progress]").textContent =
            `Préparation ${index + 1}/${pages.length} · page ${page}`;
          const url = M.pdfPreview(info.url, page);
          if (!url) throw new Error("Aperçus indisponibles pour ce PDF");
          await new Promise((resolve, reject) => {
            const img = new Image();
            let timer;
            const done = (err) => {
              clearTimeout(timer);
              controller.signal.removeEventListener("abort", cancel);
              img.onload = img.onerror = null;
              if (err) reject(err);
              else resolve();
            };
            const cancel = () => {
              img.src = "";
              done(new Error("Import annulé"));
            };
            controller.signal.addEventListener("abort", cancel, { once: true });
            timer = setTimeout(
              () =>
                done(
                  new Error(
                    `Aperçu indisponible pour la page ${page}. Aucun ajout effectué.`,
                  ),
                ),
              15000,
            );
            img.onload = () => done();
            img.onerror = () =>
              done(
                new Error(
                  `Aperçu indisponible pour la page ${page}. Aucun ajout effectué.`,
                ),
              );
            img.src = url;
          });
        }
        if (!l.isConnected || S !== session) return;
        change(() => {
          S.page = S.doc.pages.length;
          S.doc.pages.push(
            ...pages.map((page) => {
              const b = M.block({
                ...source,
                fields: { ...source.fields, url: info.url },
              });
              b.kind = "plan";
              b.title = source.title + " · page " + page;
              b.pdf = { page };
              return { id: M.uid(), title: b.title, blocks: [b] };
            }),
          );
          S.selected = null;
        });
      },
      "Ajouter les pages sélectionnées",
    );
    layer.querySelector("[data-pdf-info]").onclick = async (e) => {
      e.target.disabled = true;
      try {
        const source =
          pdfs[Number(layer.querySelector("[name=pdf-file]").value)];
        if (!source) throw new Error("Aucun PDF dans ce projet");
        const info = (
          await request(
            "GET",
            `/briefings/project/${session.doc.projectId}/pdf/${source.id}`,
          )
        ).data;
        layer.querySelector("[data-pdf-count]").textContent =
          info.pages + " page(s) dans ce PDF";
      } catch (e) {
        layer.querySelector("[data-error]").textContent = e.message;
      } finally {
        e.target.disabled = false;
      }
    };
  }
  function media() {
    const files = S.sources.filter((s) => s.kind === "file");
    dialog(
      "Médias du projet",
      files
        .map(
          (s) =>
            `<label class="bn-choice"><input type="checkbox" data-file="${E(s.id)}">${E(s.title)}</label>`,
        )
        .join("") || "<p>Aucun fichier disponible.</p>",
      (l) =>
        change(() => {
          const ids = [...l.querySelectorAll("[data-file]:checked")].map(
            (x) => x.dataset.file,
          );
          current().blocks.push(
            ...files.filter((s) => ids.includes(s.id)).map(M.block),
          );
        }),
    );
  }
  function taskDialog(id) {
    const b = S.doc.pages.flatMap((p) => p.blocks).find((b) => b.id === id);
    dialog(
      "Mettre à jour la tâche projet",
      `<p>${E(b.title)}</p><select name="status">${["todo", "in_progress", "done", "blocked", "cancelled"].map((x) => `<option value="${x}" ${b.content.status === x ? "selected" : ""}>${stateLabels[x]}</option>`).join("")}</select><p>Modifie la tâche source. Le briefing reste un instantané jusqu’à son actualisation.</p>`,
      async (l) => {
        await request("PATCH", "/tasks/" + encodeURIComponent(b.source.id), {
          status: l.querySelector("[name=status]").value,
        });
        status("Tâche mise à jour · actualisez le briefing");
      },
    );
  }
  async function versions() {
    await save();
    const versions = (await request("GET", `/briefings/${S.id}/publications`))
      .data;
    const d = dialog(
      "Éditions de diffusion",
      `<p>Instantanés datés et immuables. Consultation réservée aux utilisateurs autorisés du projet.</p>${versions.map((v, i) => `<button data-version="${i}" style="display:block;margin:8px 0">Révision ${v.revision} · ${E(new Date(v.createdAt).toLocaleString("fr-BE"))}</button>`).join("") || "<p>Aucune édition publiée.</p>"}`,
      async () => {
        if (!S.permissions.write || S.publication) return;
        await save();
        const r = await request("POST", `/briefings/${S.id}/publish`, {
          revision: S.revision,
        });
        status("Édition publiée · révision " + r.data.revision);
      },
      S.permissions.write && !S.publication ? "Figer cette révision" : "Fermer",
    );
    d.querySelectorAll("[data-version]").forEach(
      (n) =>
        (n.onclick = () => {
          if (!S.draft) S.draft = M.copy(S.doc);
          S.doc = M.copy(versions[Number(n.dataset.version)].document);
          S.publication = true;
          S.preview = true;
          render();
        }),
    );
    if (S.publication) {
      const back = document.createElement("button");
      back.textContent = "Revenir au brouillon";
      back.onclick = () => {
        S.doc = S.draft;
        S.draft = null;
        S.publication = false;
        render();
      };
      d.querySelector(".bn-dialog").appendChild(back);
    }
  }
  async function originalCopy() {
    if (
      !confirm(
        "Créer une copie séparée des données originales pour les éditer dans le Studio historique ?",
      )
    )
      return;
    const b = S.original;
    const copy = (
      await request("POST", `/briefings/project/${b.projectId}`, {
        title: (b.title || "Briefing") + " — original",
        slides: b.slides,
        studioSlides: b.studioSlides,
      })
    ).data;
    await close();
    if (S) return;
    await openBriefingEditor(copy.id);
    if (copy.studioSlides?.slides?.length) briefingStudioStart();
  }
  function downloadJSON() {
    const blob = new Blob([JSON.stringify(S.doc, null, 2)], {
        type: "application/json",
      }),
      url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = "briefing-copie-locale.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function keyDown(e) {
    if (e.target.matches("input,textarea,select,[contenteditable=true]"))
      return;
    if (
      (e.ctrlKey || e.metaKey) &&
      ["z", "y", "c", "x", "v", "d"].includes(e.key.toLowerCase())
    ) {
      const k = e.key.toLowerCase();
      if (k === "v") {
        if (S.clipboard?.projectId === S.doc.projectId) {
          e.preventDefault();
          change(() =>
            current().blocks.push(...S.clipboard.blocks.map(M.duplicate)),
          );
        }
        return;
      }
      e.preventDefault();
      const action =
        k === "z"
          ? e.shiftKey
            ? "redo"
            : "undo"
          : k === "y"
            ? "redo"
            : k === "d"
              ? "duplicate"
              : "copy";
      click({ target: { closest: () => ({ dataset: { action } }) } });
      if (k === "x")
        click({
          target: { closest: () => ({ dataset: { action: "delete" } }) },
        });
    }
  }
  async function paste(e) {
    if (
      e.target.matches("input,textarea,select,[contenteditable=true]") ||
      !S.permissions.write ||
      S.publication
    )
      return;
    const image = [...(e.clipboardData?.items || [])].find((x) =>
      x.type.startsWith("image/"),
    );
    if (image) {
      e.preventDefault();
      try {
        const file = image.getAsFile();
        if (file.size > 10 * 1024 * 1024)
          throw new Error("Capture trop volumineuse (10 Mo maximum)");
        const fd = new FormData();
        fd.append("file", file, "capture.png");
        const r = await fetch(
          "/api/v1/upload/project-file/" + S.doc.projectId,
          {
            method: "POST",
            headers: {
              Authorization:
                "Bearer " + (localStorage.getItem("token") || TOKEN),
            },
            body: fd,
          },
        );
        if (!r.ok) throw new Error("Échec du chargement de la capture");
        await mediaRefresh();
      } catch (err) {
        error(err);
      }
      return;
    }
    const text = e.clipboardData?.getData("text/plain");
    if (text) {
      e.preventDefault();
      if (text.length > 30000) {
        error(
          new Error("Texte trop long : 30 000 caractères maximum par bloc"),
        );
        return;
      }
      change(() =>
        current().blocks.push({
          id: M.uid(),
          kind: text.includes("\t") ? "table" : "note",
          title: text.includes("\t") ? "Tableau Excel" : "Texte collé",
          layout: "list",
          mode: "custom",
          baseline: {},
          content: text.includes("\t") ? { table: text } : { text },
          annotation: "",
        }),
      );
    }
  }
  async function mediaRefresh() {
    S.sources = (
      await request("GET", `/briefings/project/${S.doc.projectId}/sources`)
    ).data;
    media();
  }
  async function close() {
    if (!S) return;
    clearTimeout(S.timer);
    if (S.dirty) {
      try {
        await save();
      } catch (e) {
        error(e);
        if (
          !confirm(
            "Enregistrement impossible. Fermer et abandonner les changements locaux ?",
          )
        )
          return;
      }
    }
    const old = S;
    S = null;
    old.root.remove();
    if (typeof loadDetailBriefing === "function")
      loadDetailBriefing(old.doc.projectId);
  }
  window.addEventListener("beforeunload", (e) => {
    if (S?.dirty) {
      e.preventDefault();
      e.returnValue = "";
    }
  });
  async function exportDocument() {
    const originalSnapshot = M.copy(S.doc),
      session = S;
    const options = dialog(
      "Préparer le PDF",
      `<p>Texte sélectionnable, liens actifs et pagination mesurée. Les pages historiques Fabric restent des images.</p><label>Langue<select name="lang"><option value="fr">Français</option><option value="en">Anglais (traduction du texte descriptif)</option></select></label><p>Le PDF s’enregistre via la boîte d’impression du navigateur. Il peut ensuite être ajouté aux fichiers du projet.</p><fieldset><legend>Pages à exporter</legend>${originalSnapshot.pages.map((p, i) => `<label><input type="checkbox" data-export-page="${i}" checked> ${i + 1} · ${E(p.title)}</label>`).join("")}</fieldset>`,
      async (l) => {
        const snapshot = M.copy(originalSnapshot);
        const lang = l.querySelector("[name=lang]").value;
        const indices = new Set(
          [...l.querySelectorAll("[data-export-page]:checked")].map((n) =>
            Number(n.dataset.exportPage),
          ),
        );
        if (!indices.size) throw new Error("Sélectionnez au moins une page.");
        snapshot.pages = snapshot.pages.filter((p, i) => indices.has(i));
        if (lang === "en") {
          // Translate prose only. Names, addresses, quantities, times and statuses stay sourced.
          const targets = [];
          for (const p of snapshot.pages)
            for (const b of p.blocks)
              for (const k of [
                "description",
                "text",
                "instructions",
                "installationNotes",
                "dismantlingNotes",
                "notes",
                "hint",
                "caption",
              ])
                if (b.content[k]) targets.push({ b, k });
          for (const { b, k } of targets) {
            const chunks = b.content[k].match(/[\s\S]{1,3500}/g) || [];
            const r = await request("POST", "/translate", {
              texts: chunks,
              targetLang: "en",
              sourceLang: "fr",
            });
            const values = r.data.translations;
            if (
              !Array.isArray(values) ||
              values.length !== chunks.length ||
              values.some((v) => typeof v !== "string" || !v)
            )
              throw new Error(
                "Traduction incomplète : export annulé, éditeur intact",
              );
            b.content[k] = values.join("");
          }
        }
        if (S !== session || !l.isConnected) throw new Error("Export annulé");
        const frame = document.createElement("iframe");
        frame.title = "Aperçu paginé du PDF";
        frame.style.cssText =
          "position:absolute;inset:65px 0 0;width:100%;height:calc(100% - 65px);border:0;background:#dfe3e9;z-index:9";
        const toolbar = document.createElement("div");
        toolbar.style.cssText =
          "position:absolute;inset:0 0 auto;background:white;padding:15px;z-index:10;height:65px;display:flex;gap:10px;align-items:center";
        const info = document.createElement("span");
        info.textContent = "Composition des pages…";
        toolbar.append(info);
        const cancel = document.createElement("button");
        cancel.textContent = "Fermer l’aperçu";
        let cancelled = false;
        cancel.onclick = () => {
          cancelled = true;
          frame.remove();
          toolbar.remove();
        };
        toolbar.append(cancel);
        session.root.append(frame, toolbar);
        try {
          const doc = frame.contentDocument;
          doc.open();
          doc.write(
            '<!doctype html><html><head><meta charset="utf-8"><title>' +
              E(snapshot.title) +
              '</title><link rel="stylesheet" href="/css/briefing-next.css"></head><body><div class="bn bn-print"></div></body></html>',
          );
          doc.close();
          const css = doc.querySelector("link");
          if (!css.sheet)
            await new Promise((resolve, reject) => {
              css.onload = resolve;
              css.onerror = () =>
                reject(new Error("Style d’impression indisponible"));
            });
          const wide = snapshot.format === "wide",
            width = wide ? 1120 : 794,
            height = wide ? 630 : 1123;
          const style = doc.createElement("style");
          style.textContent = `body{margin:0;background:#dfe3e9}.bn.bn-print{position:static;display:block;background:none;padding:20px}.bn-print .bn-paper{width:${width}px!important;max-width:none;height:${height}px;margin:0 auto 20px;padding:35px;overflow:hidden;position:relative;box-sizing:border-box}.bn-print footer{position:absolute;bottom:20px;left:35px;right:35px}.bn-print .bn-page-content{height:${height - 190}px;overflow:hidden}.bn-print .bn-block{font-size:16px}.bn-print h1{font-size:30px;margin:12px 0 18px}.bn-print .bn-fields{grid-template-columns:${wide ? "repeat(2,minmax(0,1fr))" : "1fr"}}.bn-print .bn-photo-frame{max-width:calc(${height - 320}px * var(--photo-ratio, 1));margin:auto}.bn-print .bn-graphic-visual{max-width:${Math.min(width - 110, ((height - 340) * 1000) / 600)}px;margin:auto}.bn-print img{max-height:${height - 260}px;max-width:100%}.bn-print .bn-block h2{font-size:20px}.bn-print .bn-source{font-size:9px}@page{size:${wide ? "296.33mm 166.69mm" : "A4 portrait"};margin:0}@media print{body{background:white}.bn.bn-print{padding:0}.bn-print .bn-paper{margin:0;box-shadow:none;break-after:page}.bn-print .bn-paper:last-child{break-after:auto}}`;
          doc.head.append(style);
          await doc.fonts.ready;
          const host = doc.querySelector(".bn-print");
          let pageNo = 0;
          function newPage(p, continuation) {
            const template = doc.createElement("div");
            template.innerHTML = paperHtml(
              {
                ...p,
                title: p.title + (continuation ? " — suite" : ""),
                blocks: [],
              },
              pageNo++,
              true,
              snapshot,
            );
            const el = template.firstElementChild;
            host.append(el);
            const content = el.querySelector(".bn-page-content");
            const available =
              height -
              content.offsetTop -
              el.querySelector("footer").offsetHeight -
              45;
            if (available < 100)
              throw new Error("Titre de page trop long : " + p.title);
            content.style.height = available + "px";
            return content;
          }
          for (const p of snapshot.pages) {
            if (cancelled) throw new Error("Export annulé");
            let container = newPage(p, false);
            for (const b of p.blocks.filter((b) => !b.hidden)) {
              const template = doc.createElement("div");
              template.innerHTML = blockHtml(b, true);
              let node = template.firstElementChild;
              container.append(node);
              if (b.kind === "legacy") await hydrateLegacy(node);
              for (const img of node.querySelectorAll("img")) {
                img.loading = "eager";
                if (!img.complete)
                  await new Promise((resolve, reject) => {
                    img.onload = resolve;
                    img.onerror = () =>
                      reject(new Error("Image indisponible : " + b.title));
                  });
                if (!img.naturalWidth)
                  throw new Error("Image indisponible : " + b.title);
              }
              for (const image of node.querySelectorAll("svg image")) {
                await new Promise((resolve, reject) => {
                  const img = new Image(),
                    timer = setTimeout(
                      () =>
                        reject(
                          new Error(
                            "Image graphique indisponible : " + b.title,
                          ),
                        ),
                      15000,
                    );
                  img.onload = () => {
                    clearTimeout(timer);
                    resolve();
                  };
                  img.onerror = () => {
                    clearTimeout(timer);
                    reject(
                      new Error("Image graphique indisponible : " + b.title),
                    );
                  };
                  img.src = image.getAttribute("href");
                });
              }
              if (container.scrollHeight <= container.clientHeight) continue;
              node.remove();
              if (container.childElementCount) container = newPage(p, true);
              container.append(node);
              if (container.scrollHeight <= container.clientHeight) continue;
              // Oversized single block: reflow as measured field fragments with repeated heading.
              node.remove();
              const photo = node.querySelector(
                ".bn-photo-frame,.bn-graphic-visual",
              );
              if (photo) {
                const part = doc.createElement("section");
                part.className = "bn-block";
                part.append(node.querySelector("h2").cloneNode(true), photo);
                container.append(part);
                if (container.scrollHeight > container.clientHeight)
                  throw new Error("Image ou titre trop grand : " + b.title);
                container = newPage(p, true);
              }
              const fields = [
                ...node.querySelectorAll(
                  ".bn-field:not(.bn-graphic-text),.bn-annotation,.bn-legacy,.bn-tsv tr",
                ),
              ];
              if (!fields.length)
                throw new Error(
                  "Bloc trop grand : " +
                    b.title +
                    ". Réduisez son image ou répartissez son contenu.",
                );
              for (const field of fields) {
                const label = field.querySelector("small")?.textContent || "",
                  text =
                    field.tagName === "TR"
                      ? [...field.children].map((c) => c.textContent).join("\t")
                      : field.querySelector("div")?.textContent ||
                        field.textContent;
                let rest = text;
                while (rest) {
                  if (cancelled) throw new Error("Export annulé");
                  const part = doc.createElement("section");
                  part.className = "bn-block";
                  const h = doc.createElement("h2");
                  h.textContent = b.title;
                  const small = doc.createElement("small");
                  small.textContent = label;
                  const body = doc.createElement("div");
                  body.style.whiteSpace = "pre-wrap";
                  body.style.overflowWrap = "anywhere";
                  part.append(h, small, body);
                  container.append(part);
                  let low = 0,
                    high = rest.length;
                  while (low < high) {
                    const mid = Math.ceil((low + high) / 2);
                    body.textContent = rest.slice(0, mid);
                    if (container.scrollHeight <= container.clientHeight)
                      low = mid;
                    else high = mid - 1;
                  }
                  if (!low) {
                    part.remove();
                    if (!container.childElementCount)
                      throw new Error(
                        "Titre trop long pour le format choisi : " + b.title,
                      );
                    container = newPage(p, true);
                    continue;
                  }
                  let end = low;
                  if (end < rest.length) {
                    const space = rest.lastIndexOf(" ", end);
                    if (space > low / 2) end = space + 1;
                  }
                  body.textContent = rest.slice(0, end);
                  rest = rest.slice(end);
                  if (rest) container = newPage(p, true);
                }
              }
            }
            info.textContent = `${pageNo} pages composées…`;
            await new Promise((resolve) => requestAnimationFrame(resolve));
          }
          if (cancelled) return;
          info.textContent = `${pageNo} pages · ${lang.toUpperCase()} · aperçu exact avant impression`;
          const print = document.createElement("button");
          print.className = "primary";
          print.textContent = "Imprimer / Enregistrer en PDF";
          print.onclick = () => {
            frame.contentWindow.focus();
            frame.contentWindow.print();
          };
          toolbar.prepend(print);
        } catch (e) {
          if (!cancelled) {
            frame.remove();
            toolbar.remove();
            throw e;
          }
        }
      },
      "Composer l’aperçu",
    );
  }
})();
