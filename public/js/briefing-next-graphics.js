/* Native SVG compositions: allowlisted semantic objects, never arbitrary SVG/HTML. */
(function (root) {
  "use strict";
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const uid = () =>
    "g" + (root.crypto?.randomUUID?.() || Math.random().toString(36).slice(2));
  const esc = (s) =>
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
  const blank = () => ({ width: 1000, height: 600, nodes: [] });
  function wrap(text, width, size, font, measure) {
    const max = Math.max(1, width - 12),
      lines = [];
    if (!measure && root.document) {
      const c = root.document.createElement("canvas").getContext("2d");
      if (c) {
        c.font = `${size}px ${font}`;
        measure = (s) => c.measureText(s).width;
      }
    }
    measure = measure || ((s) => Array.from(s).length * size * 0.65);
    for (const paragraph of text.split("\n")) {
      let line = "";
      for (const char of Array.from(paragraph)) {
        if (line && measure(line + char) > max) {
          const space=line.lastIndexOf(" ");
          if(space>=0){lines.push(line.slice(0,space+1));line=line.slice(space+1);}else{lines.push(line);line="";}
        }
        line += char;
      }
      lines.push(line);
    }
    return lines;
  }
  function normalize(scene) {
    scene.nodes.forEach((n) => {
      if (n.type === "text")
        n.height = Math.max(
          24,
          wrap(n.text, n.width, n.fontSize, n.font).length * n.fontSize * 1.25 +
            12,
        );
    });
    return scene;
  }
  function nodeBounds(n) {
    const a = (n.rotation || 0) * Math.PI / 180;
    const width = Math.abs(n.width * Math.cos(a)) + Math.abs(n.height * Math.sin(a));
    const height = Math.abs(n.width * Math.sin(a)) + Math.abs(n.height * Math.cos(a));
    return { x: n.x + (n.width - width) / 2, y: n.y + (n.height - height) / 2, width, height };
  }
  function issues(scene) {
    return scene.nodes
      .filter(
        (n) => {
          const b = nodeBounds(n);
          return !n.hidden && (n.x < 0 || n.y < 0 || b.x < -0.01 || b.y < -0.01 ||
            b.x + b.width > scene.width + 0.01 || b.y + b.height > scene.height + 0.01);
        },
      )
      .map((n) => n.text || n.type);
  }
  function expand(scene, ids) {
    const groups = new Set(
      scene.nodes
        .filter((n) => ids.includes(n.id) && n.group)
        .map((n) => n.group),
    );
    return scene.nodes
      .filter((n) => ids.includes(n.id) || (n.group && groups.has(n.group)))
      .map((n) => n.id);
  }
  function duplicate(nodes) {
    const groups = new Map();
    return nodes.map((n) => {
      const c = clone(n);
      c.id = uid();
      c.x += 20;
      c.y += 20;
      if (c.group) {
        if (!groups.has(c.group)) groups.set(c.group, uid());
        c.group = groups.get(c.group);
      }
      return c;
    });
  }
  function bounds(nodes) {
    nodes = nodes.map(nodeBounds);
    const x = Math.min(...nodes.map((n) => n.x)),
      y = Math.min(...nodes.map((n) => n.y));
    return {
      x,
      y,
      width: Math.max(...nodes.map((n) => n.x + n.width)) - x,
      height: Math.max(...nodes.map((n) => n.y + n.height)) - y,
    };
  }
  function arrange(scene, ids, action) {
    const selection = scene.nodes.filter((n) => ids.includes(n.id));
    // A locked member makes its whole selected group immovable.
    const groups = new Map();
    selection.forEach((n) => {
      const k = n.group || n.id;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(n);
    });
    const units = [...groups.values()].filter(
      (g) => !g.some((n) => n.locked || n.hidden),
    );
    if (units.length < 2) return;
    const boxes = units.map((nodes) => ({ nodes, ...bounds(nodes) })),
      all = bounds(boxes);
    const move = (b, x, y) =>
      b.nodes.forEach((n) => {
        n.x += x - b.x;
        n.y += y - b.y;
      });
    if (action.startsWith("distribute")) {
      if (boxes.length < 3) return;
      const axis = action === "distributeX" ? "x" : "y",
        dim = axis === "x" ? "width" : "height";
      boxes.sort((a, b) => a[axis] - b[axis]);
      const start = boxes[0][axis],
        last = boxes.at(-1),
        gap =
          (last[axis] +
            last[dim] -
            start -
            boxes.reduce((a, b) => a + b[dim], 0)) /
          (boxes.length - 1);
      let at = start;
      boxes.forEach((b) => {
        move(b, axis === "x" ? at : b.x, axis === "y" ? at : b.y);
        at += b[dim] + gap;
      });
      return;
    }
    boxes.forEach((b) =>
      move(
        b,
        action === "left"
          ? all.x
          : action === "right"
            ? all.x + all.width - b.width
            : action === "centerX"
              ? all.x + (all.width - b.width) / 2
              : b.x,
        action === "top"
          ? all.y
          : action === "bottom"
            ? all.y + all.height - b.height
            : action === "centerY"
              ? all.y + (all.height - b.height) / 2
              : b.y,
      ),
    );
  }
  function nodeSvg(n, number) {
    const a = `fill="${esc(n.fill)}" stroke="${esc(n.stroke)}" stroke-width="${n.strokeWidth}"`;
    let body = "";
    if (n.type === "rect")
      body = `<rect width="${n.width}" height="${n.height}" rx="6" ${a}/>`;
    if (n.type === "ellipse")
      body = `<ellipse cx="${n.width / 2}" cy="${n.height / 2}" rx="${n.width / 2}" ry="${n.height / 2}" ${a}/>`;
    if (n.type === "arrow") {
      const vector={right:[1,0],left:[-1,0],up:[0,-1],down:[0,1],ne:[1,-1],se:[1,1],sw:[-1,1],nw:[-1,-1]}[n.direction]||[1,0];
      const sx=n.width/2-vector[0]*(n.width/2-14),sy=n.height/2-vector[1]*(n.height/2-14);
      const ex=n.width/2+vector[0]*(n.width/2-14),ey=n.height/2+vector[1]*(n.height/2-14);
      const length=Math.hypot(ex-sx,ey-sy)||1,ux=(ex-sx)/length,uy=(ey-sy)/length;
      body=`<path d="M ${sx} ${sy} L ${ex} ${ey} M ${ex-ux*14-uy*9} ${ey-uy*14+ux*9} L ${ex} ${ey} L ${ex-ux*14+uy*9} ${ey-uy*14-ux*9}" fill="none" stroke="${esc(n.stroke)}" stroke-width="${n.strokeWidth}"/>`;
    }
    if (n.type === "marker")
      body = `<ellipse cx="${n.width / 2}" cy="${n.height / 2}" rx="${n.width / 2}" ry="${n.height / 2}" ${a}/><text x="${n.width / 2}" y="${n.height / 2}" text-anchor="middle" dominant-baseline="central" fill="${esc(n.stroke)}" font-family="Arial" font-size="${Math.min(n.width, n.height) * 0.48}">${number}</text>`;
    if (n.type === "text")
      body = `<text fill="${esc(n.fill)}" font-family="${esc(n.font)}" font-size="${n.fontSize}" xml:space="preserve">${wrap(
        n.text,
        n.width,
        n.fontSize,
        n.font,
      )
        .map(
          (line, i) =>
            `<tspan x="6" y="${6 + n.fontSize + i * n.fontSize * 1.25}">${esc(line)}</tspan>`,
        )
        .join("")}</text>`;
    return `<g data-node="${esc(n.id)}" transform="translate(${n.x} ${n.y}) rotate(${n.rotation || 0} ${n.width / 2} ${n.height / 2})">${body}</g>`;
  }
  function svg(
    scene,
    editing = false,
    ids = [],
    grid = false,
    backgroundUrl = "",
  ) {
    let marker = 0;
    return `<svg xmlns="http://www.w3.org/2000/svg" class="bn-graphic-svg" viewBox="0 0 ${scene.width} ${scene.height}" role="img" aria-label="Composition graphique" ${editing ? 'tabindex="0"' : ""}><rect width="100%" height="100%" fill="white"/>${backgroundUrl && /^https?:\/\/|^\/(?!\/)/i.test(backgroundUrl) ? `<image href="${esc(backgroundUrl)}" width="1000" height="600" preserveAspectRatio="xMidYMid meet"/>` : ""}${editing && grid ? Array.from({ length: 51 }, (_, i) => `<path d="M ${i * 20} 0 V ${scene.height} M 0 ${i * 20} H ${scene.width}" stroke="#e8edf5"/>`).join("") + `<rect x="20" y="20" width="${scene.width - 40}" height="${scene.height - 40}" fill="none" stroke="#aab" stroke-dasharray="5 5"/>` : ""}${scene.nodes
      .filter((n) => !n.hidden)
      .map((n) => nodeSvg(n, n.type === "marker" ? ++marker : 0))
      .join("")}${
      editing
        ? scene.nodes
            .filter((n) => ids.includes(n.id) && !n.hidden)
            .map(
              (n) =>
                `<rect transform="rotate(${n.rotation || 0} ${n.x + n.width / 2} ${n.y + n.height / 2})" x="${n.x}" y="${n.y}" width="${n.width}" height="${n.height}" fill="none" stroke="#2463eb" stroke-width="2" pointer-events="none"/>${!n.locked && !n.rotation && ids.length === 1 ? `<rect data-resize="${esc(n.id)}" x="${n.x + n.width - 6}" y="${n.y + n.height - 6}" width="12" height="12" fill="#2463eb"/>` : ""}`,
            )
            .join("")
        : ""
    }</svg>`;
  }
  function html(scene, backgroundUrl = "") {
    let marker = 0;
    const descriptions = scene.nodes
      .filter((n) => !n.hidden && ["text", "marker"].includes(n.type))
      .map(
        (n) =>
          `<div class="bn-field ${n.type === "text" ? "bn-graphic-text" : ""}"><div>${n.type === "marker" ? `<strong>${++marker}.</strong> ` : ""}${esc(n.text)}</div></div>`,
      )
      .join("");
    return `<div class="bn-graphic-visual">${svg(scene, false, [], false, backgroundUrl)}</div><div class="bn-graphic-description">${descriptions}</div>`;
  }
  function open({ parent, scene: original, onApply, files = [] }) {
    let scene = normalize(clone(original || blank())),
      ids = [],
      past = [],
      future = [],
      clipboard = [],
      copiedStyle = null,
      zoom = 100,
      grid = true,
      gesture = null;
    const layer = document.createElement("div");
    layer.className = "bn-graphic-editor";
    layer.setAttribute("role", "dialog");
    layer.setAttribute("aria-label", "Composition libre");
    layer.setAttribute("aria-modal", "true");
    parent.append(layer);
    const beforeFocus = document.activeElement;
    const button = (a, t) => `<button data-g="${a}">${t}</button>`;
    const selected = () => scene.nodes.filter((n) => ids.includes(n.id));
    const editable = () => selected().filter((n) => !n.locked);
    function remember(previous) {
      past.push(previous);
      if (past.length > 40) past.shift();
      future = [];
    }
    function commit(fn) {
      const old = clone(scene);
      fn();
      normalize(scene);
      if (JSON.stringify(old) !== JSON.stringify(scene)) remember(old);
      render();
    }
    function close() {
      layer.remove();
      beforeFocus?.focus();
    }
    function stage() {
      const host = layer.querySelector("[data-stage]");
      host.innerHTML = svg(
        scene,
        true,
        ids,
        grid,
        files.find((f) => f.id === scene.backgroundId)?.fields.url || "",
      );
      host.style.width = zoom + "%";
    }
    function render() {
      const n = selected()[0],
        blocked = selected().some((n) => n.locked);
      layer.innerHTML = `<div class="bn-graphic-toolbar"><strong>Composition libre</strong>${button("apply", "Appliquer au briefing")}${button("cancel", "Annuler")}<span role="status" data-g-status></span></div><div class="bn-graphic-tools">${[
        ["text", "Texte"],
        ["rect", "Rectangle"],
        ["ellipse", "Ellipse"],
        ["arrow", "Flèche"],
        ["marker", "Repère"],
      ]
        .map(([a, t]) => button("add-" + a, t))
        .join(
          "",
        )}${button("undo", "↶")}${button("redo", "↷")}${button("copy", "Copier")}${button("paste", "Coller")}${button("duplicate", "Dupliquer")}${button("delete", "Supprimer")}<label>Zoom<select data-g-zoom>${[50, 75, 100, 125, 150, 200].map((z) => `<option ${z === zoom ? "selected" : ""}>${z}</option>`).join("")}</select></label>${button("fit", "Ajuster")}${button("grid", grid ? "Grille : oui" : "Grille : non")}</div><div class="bn-graphic-body"><div class="bn-graphic-viewport"><div data-stage></div></div><aside><p>Maj + clic : multisélection. Glisser pour déplacer ; poignée bleue pour redimensionner. Flèches clavier : 1 px, Maj : 10 px. Pour un objet tourné, réglez largeur et hauteur dans les champs.</p><p>Les repères et itinéraires sont renseignés par vous. Aucun emplacement technique n’est déduit.</p><label>Fond du projet<select data-g-background><option value="">Sans image</option>${files.map((f) => `<option value="${esc(f.id)}" ${scene.backgroundId === f.id ? "selected" : ""}>${esc(f.title)}</option>`).join("")}</select></label><h3>${ids.length} objet(s)</h3><label>Calque<select data-g-layer><option value="">Choisir…</option>${scene.nodes.map((x, i) => `<option value="${esc(x.id)}" ${n?.id === x.id ? "selected" : ""}>${i + 1} · ${x.hidden ? "◌ " : ""}${x.locked ? "🔒 " : ""}${esc(x.text.slice(0, 35) || x.type)}</option>`).join("")}</select></label>${n ? `<fieldset ${blocked ? "disabled" : ""}><label>Texte / légende<textarea data-g-prop="text" maxlength="2000">${esc(n.text)}</textarea></label>${["x", "y", "width", "height", "rotation", "fontSize", "strokeWidth"].map((k) => `<label>${{ x: "Position X", y: "Position Y", width: "Largeur", height: "Hauteur", rotation: "Rotation (°)", fontSize: "Taille du texte", strokeWidth: "Épaisseur" }[k]}<input type="number" data-g-prop="${k}" value="${n[k] ?? 0}" ${k === "height" && n.type === "text" ? "disabled" : ""}></label>`).join("")}<label>Police<select data-g-prop="font">${["Arial", "Georgia", "Verdana"].map((f) => `<option ${n.font === f ? "selected" : ""}>${f}</option>`).join("")}</select></label>${["fill", "stroke"].map((k) => `<label>${k === "fill" ? "Fond / texte" : "Contour"}<input type="color" data-g-prop="${k}" value="${n[k]}"></label>`).join("")}${n.type === "arrow" ? `<label>Direction<select data-g-prop="direction">${Object.entries({right:"→",left:"←",up:"↑",down:"↓",ne:"↗",se:"↘",sw:"↙",nw:"↖"}).map(([v,t])=>`<option value="${v}" ${n.direction===v?"selected":""}>${t}</option>`).join("")}</select></label>` : ""}</fieldset><div>${button("lock", blocked ? "Déverrouiller" : "Verrouiller")}${button("hide", n.hidden ? "Afficher" : "Masquer")}${button("front", "Premier plan")}${button("back", "Arrière-plan")}${button("group", "Grouper")}${button("ungroup", "Dégrouper")}${button("copyStyle", "Copier style")}${button("pasteStyle", "Coller style")}</div>` : ""}<h3>Aligner / distribuer</h3><div>${[
        ["left", "Gauche"],
        ["centerX", "Centre horizontal"],
        ["right", "Droite"],
        ["top", "Haut"],
        ["centerY", "Centre vertical"],
        ["bottom", "Bas"],
        ["distributeX", "Espacer horizontalement"],
        ["distributeY", "Espacer verticalement"],
      ]
        .map(([a, t]) => button(a, t))
        .join("")}</div></aside></div>`;
      layer.querySelector("[data-g=undo]").disabled = !past.length;
      layer.querySelector("[data-g=redo]").disabled = !future.length;
      stage();
      const warnings = issues(scene);
      layer.querySelector("[data-g-status]").textContent = warnings.length
        ? `${warnings.length} objet(s) hors page : repositionnez-les avant application.`
        : "Une application = une étape dans l’historique du document.";
    }
    function action(a) {
      if (a === "cancel") return close();
      if (a === "apply") {
        if (issues(scene).length) {
          layer.querySelector("[data-g-status]").textContent =
            "Application refusée : un objet dépasse la page. Réduisez sa largeur ou déplacez-le.";
          return;
        }
        onApply(
          clone(scene),
          files.find((f) => f.id === scene.backgroundId),
        );
        close();
        return;
      }
      if (a === "undo" || a === "redo") {
        const from = a === "undo" ? past : future,
          to = a === "undo" ? future : past;
        if (from.length) {
          to.push(clone(scene));
          scene = from.pop();
          ids = [];
          render();
        }
        return;
      }
      if (a === "grid") {
        grid = !grid;
        stage();
        return;
      }
      if (a === "fit") {
        zoom = 100;
        render();
        return;
      }
      if (a === "copy") {
        clipboard = clone(selected());
        return;
      }
      if (a === "copyStyle") {
        const n = selected()[0];
        if (n)
          copiedStyle = Object.fromEntries(
            ["fill", "stroke", "strokeWidth", "font", "fontSize"].map((k) => [
              k,
              n[k],
            ]),
          );
        return;
      }
      if ((a.startsWith("add-") && scene.nodes.length>=200) || ((a==="paste"||a==="duplicate") && scene.nodes.length+(a==="paste"?clipboard.length:ids.length)>200)){
        layer.querySelector('[data-g-status]').textContent='Limite de 200 objets : créez une autre composition.';return;
      }
      commit(() => {
        if (a.startsWith("add-")) {
          if (scene.nodes.length >= 200) return;
          const type = a.slice(4),
            n = {
              id: uid(),
              type,
              x: 40,
              y: 40,
              width: type === "marker" ? 60 : type === "text" ? 300 : 180,
              height: type === "marker" ? 60 : 100,
              text:
                type === "text"
                  ? "Votre texte"
                  : type === "marker"
                    ? "Emplacement à confirmer"
                    : "",
              font: "Arial",
              fontSize: 28,
              fill: type === "text" ? "#000a3d" : "#e8edf5",
              stroke: "#000a3d",
              strokeWidth: 3,
              direction: "right",
            };
          scene.nodes.push(n);
          ids = [n.id];
        }
        if (a === "paste" || a === "duplicate") {
          const nodes = duplicate(a === "paste" ? clipboard : selected());
          if (scene.nodes.length + nodes.length > 200) return;
          scene.nodes.push(...nodes);
          ids = nodes.map((n) => n.id);
        }
        if (a === "delete") {
          const protectedGroups = new Set(
            selected()
              .filter((n) => n.locked && n.group)
              .map((n) => n.group),
          );
          scene.nodes = scene.nodes.filter(
            (n) =>
              !ids.includes(n.id) || n.locked || protectedGroups.has(n.group),
          );
          ids = [];
        }
        if (a === "lock") {
          const value = !selected().some((n) => n.locked);
          selected().forEach((n) => (n.locked = value));
        }
        if (a === "hide") {
          if (!selected().some((n) => n.locked)) {
            const value = !selected()[0]?.hidden;
            selected().forEach((n) => (n.hidden = value));
          }
        }
        if (
          a === "group" &&
          !selected().some((n) => n.locked) &&
          ids.length > 1
        ) {
          const g = uid();
          selected().forEach((n) => (n.group = g));
        }
        if (a === "ungroup" && !selected().some((n) => n.locked))
          selected().forEach((n) => delete n.group);
        if (
          (a === "front" || a === "back") &&
          !selected().some((n) => n.locked)
        ) {
          const chosen = selected(),
            others = scene.nodes.filter((n) => !ids.includes(n.id));
          scene.nodes =
            a === "front" ? [...others, ...chosen] : [...chosen, ...others];
        }
        if (
          a === "pasteStyle" &&
          copiedStyle &&
          !selected().some((n) => n.locked)
        )
          editable().forEach((n) => Object.assign(n, copiedStyle));
        arrange(scene, ids, a);
      });
    }
    layer.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      if (e.target.closest("[data-node]")) {
        const field = layer.querySelector("[data-g-prop=text]");
        if (field && !field.disabled) {
          field.focus();
          field.select();
        }
      }
    });
    layer.addEventListener("contextmenu", (e) => {
      if (e.target.closest("svg")) {
        e.preventDefault();
        e.stopPropagation();
        layer.querySelector("[data-g=copy]").focus();
      }
    });
    layer.addEventListener("click", (e) => {
      e.stopPropagation();
      const b = e.target.closest("[data-g]");
      if (b) action(b.dataset.g);
    });
    layer.addEventListener("change", (e) => {
      e.stopPropagation();
      const t = e.target;
      if (t.matches("[data-g-background]")) {
        commit(() => {
          if (t.value) scene.backgroundId = t.value;
          else delete scene.backgroundId;
        });
        return;
      }
      if (t.matches("[data-g-zoom]")) {
        zoom = Number(t.value);
        stage();
        return;
      }
      if (t.matches("[data-g-layer]")) {
        ids = expand(scene, [t.value]);
        render();
        return;
      }
      if (t.dataset.gProp) {
        const k = t.dataset.gProp;
        commit(() => {
          editable().forEach((n) => {
            if (k === "rotation") {
              n.rotation = Math.max(-180, Math.min(180, Number(t.value) || 0));
              return;
            }
            n[k] = [
              "x",
              "y",
              "width",
              "height",
              "fontSize",
              "strokeWidth",
            ].includes(k)
              ? Math.max(
                  k === "x" || k === "y"
                    ? 0
                    : k === "strokeWidth"
                      ? 1
                      : k === "fontSize"
                        ? 12
                        : 24,
                  Math.min(
                    k === "fontSize" ? 96 : k === "strokeWidth" ? 20 : 1000,
                    Number(t.value) || 0,
                  ),
                )
              : t.value;
          });
        });
      }
    });
    const point = (e) => {
      const svg = layer.querySelector("svg");
      const p = svg.createSVGPoint();
      p.x = e.clientX;
      p.y = e.clientY;
      return p.matrixTransform(svg.getScreenCTM().inverse());
    };
    layer.addEventListener("pointerdown", (e) => {
      if (!e.target.closest("svg") || e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      const hit = e.target.closest("[data-node]"),
        resize = e.target.closest("[data-resize]");
      if (!hit && !resize) {
        ids = [];
        render();
        return;
      }
      const id = resize?.dataset.resize || hit.dataset.node;
      if (e.shiftKey) {
        const group = expand(scene, [id]);
        ids = ids.includes(id)
          ? ids.filter((x) => !group.includes(x))
          : [...new Set([...ids, ...group])];
      } else if (!ids.includes(id)) ids = expand(scene, [id]);
      const start = point(e);
      gesture = {
        start,
        before: clone(scene),
        resize: !!resize,
        ids: ids.slice(),
        pointer: e.pointerId,
      };
      layer.setPointerCapture(e.pointerId);
      render();
    });
    layer.addEventListener("pointermove", (e) => {
      if (!gesture) return;
      const p = point(e),
        dx = p.x - gesture.start.x,
        dy = p.y - gesture.start.y;
      const chosen = gesture.before.nodes.filter((n) =>
        gesture.ids.includes(n.id),
      );
      if (chosen.some((n) => n.locked)) return;
      scene = clone(gesture.before);
      scene.nodes
        .filter((n) => gesture.ids.includes(n.id))
        .forEach((n) => {
          const snap = (v) => (grid ? Math.round(v / 10) * 10 : v);
          if (gesture.resize) {
            n.width = Math.max(24, snap(n.width + dx));
            if (n.type !== "text") n.height = Math.max(24, snap(n.height + dy));
          } else {
            n.x = snap(n.x + dx);
            n.y = snap(n.y + dy);
          }
        });
      normalize(scene);
      stage();
    });
    const end = (e) => {
      if (!gesture) return;
      const g = gesture;
      gesture = null;
      if (e.type === "pointercancel") scene = g.before;
      else if (JSON.stringify(scene) !== JSON.stringify(g.before))
        remember(g.before);
      if (layer.hasPointerCapture(g.pointer))
        layer.releasePointerCapture(g.pointer);
      render();
    };
    layer.addEventListener("pointerup", end);
    layer.addEventListener("pointercancel", end);
    layer.addEventListener("paste", (e) => {
      e.stopPropagation();
      if (e.target.matches("input,textarea")) return;
      const text = e.clipboardData?.getData("text/plain");
      if (text) {
        e.preventDefault();
        if(text.length>2000){layer.querySelector('[data-g-status]').textContent='Texte trop long (2 000 caractères maximum) : répartissez-le en plusieurs objets.';return;}
        const previousCount=scene.nodes.length;
        action("add-text");
        if(scene.nodes.length>previousCount){selected()[0].text=text;normalize(scene);render();}
      }
    });
    layer.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Tab") {
        const focusable = [
          ...layer.querySelectorAll(
            "button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),svg[tabindex]",
          ),
        ];
        if (e.shiftKey && document.activeElement === focusable[0]) {
          e.preventDefault();
          focusable.at(-1).focus();
        } else if (!e.shiftKey && document.activeElement === focusable.at(-1)) {
          e.preventDefault();
          focusable[0].focus();
        }
      }
      if (e.target.matches("input,textarea,select")) return;
      const key = e.key.toLowerCase(),
        cmd = e.ctrlKey || e.metaKey;
      if (cmd && ["c", "x", "v", "d", "z", "y", "a"].includes(key)) {
        e.preventDefault();
        if (key === "a") {
          ids = scene.nodes.filter((n) => !n.hidden).map((n) => n.id);
          render();
        } else if (key === "x") {
          action("copy");
          action("delete");
        } else
          action(
            {
              c: "copy",
              v: "paste",
              d: "duplicate",
              z: e.shiftKey ? "redo" : "undo",
              y: "redo",
            }[key],
          );
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        action("delete");
      }
      if (e.key.startsWith("Arrow")) {
        e.preventDefault();
        if (selected().some((n) => n.locked)) return;
        commit(() =>
          editable().forEach((n) => {
            const step = e.shiftKey ? 10 : 1;
            n.x +=
              e.key === "ArrowRight" ? step : e.key === "ArrowLeft" ? -step : 0;
            n.y +=
              e.key === "ArrowDown" ? step : e.key === "ArrowUp" ? -step : 0;
          }),
        );
      }
    });
    render();
    layer.querySelector("[data-g=apply]").focus();
    return { close };
  }
  const api = {
    blank,
    wrap,
    normalize,
    issues,
    expand,
    duplicate,
    bounds,
    nodeBounds,
    arrange,
    svg,
    html,
    open,
  };
  if (typeof module !== "undefined") module.exports = api;
  else root.BriefingNextGraphics = api;
})(globalThis);
