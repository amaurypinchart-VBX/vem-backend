// ============================================================================
// PLAN 2D — MOTEUR 3D "HEADLESS" (chargé uniquement par plan2d-studio.html, à la
// demande, quand l'utilisateur clique "Générer automatiquement depuis le modèle 3D")
// ----------------------------------------------------------------------------
// Permet à Plan 2D Studio de charger un fichier 3D de projet et d'en extraire des
// vues vectorielles (contours + suppression des lignes cachées) SANS passer par
// viewer3d.html — plus besoin de l'étape manuelle "ouvrir le viewer, cocher des
// vues, cliquer Capturer".
//
// Les parseurs de format (STL/OBJ/GLB/IFC/DAE + zip/asset helpers) ci-dessous sont
// une COPIE volontaire de ceux de public/viewer3d.html (section "PARSERS", vers la
// ligne 1045) — pas un module partagé. Ce choix évite de toucher au viewer 3D en
// production (fichier de ~3000 lignes, testé quotidiennement, qu'on ne peut pas
// tester visuellement dans cet environnement de dev). Si un bug de parsing est
// corrigé un jour dans l'un des deux fichiers, pense à reporter le correctif dans
// l'autre.
// ============================================================================
(function (global) {
  'use strict';

  let statusHook = null;
  function setStatus(msg) { if (statusHook) { try { statusHook(msg); } catch (e) {} } }

  // ─── PARSERS (copie de viewer3d.html) ───
  function parseSTL(buffer) {
    if (buffer.byteLength < 84) return parseSTLAscii(buffer);
    const dv = new DataView(buffer);
    const n = dv.getUint32(80, true);
    if (84 + n * 50 === buffer.byteLength) return parseSTLBinary(buffer, n);
    return parseSTLAscii(buffer);
  }
  function parseSTLBinary(buffer, n) {
    const dv = new DataView(buffer);
    const positions = new Float32Array(n * 9), normals = new Float32Array(n * 9);
    let p = 84;
    for (let i = 0; i < n; i++) {
      const nx = dv.getFloat32(p, true), ny = dv.getFloat32(p + 4, true), nz = dv.getFloat32(p + 8, true);
      p += 12;
      for (let v = 0; v < 3; v++) {
        const ix = i * 9 + v * 3;
        positions[ix] = dv.getFloat32(p, true);
        positions[ix + 1] = dv.getFloat32(p + 4, true);
        positions[ix + 2] = dv.getFloat32(p + 8, true);
        normals[ix] = nx; normals[ix + 1] = ny; normals[ix + 2] = nz;
        p += 12;
      }
      p += 2;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    return [{ name: 'Model', path: ['Model'], geometry: g }];
  }
  function parseSTLAscii(buffer) {
    const txt = new TextDecoder().decode(buffer);
    const positions = [], normals = [];
    let curNormal = [0, 0, 1];
    for (const line of txt.split('\n')) {
      const t = line.trim();
      if (!t) continue;
      if (t.startsWith('facet normal')) {
        const p = t.split(/\s+/); curNormal = [+p[2], +p[3], +p[4]];
      } else if (t.startsWith('vertex')) {
        const p = t.split(/\s+/);
        positions.push(+p[1], +p[2], +p[3]);
        normals.push(curNormal[0], curNormal[1], curNormal[2]);
      }
    }
    if (positions.length === 0) throw new Error('STL ASCII : aucun triangle');
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(normals), 3));
    return [{ name: 'Model', path: ['Model'], geometry: g }];
  }

  function parseOBJ(text) {
    const verts = [], norms = [];
    const groups = [];
    let cur = { name: 'default', positions: [], normals: [], hasNormals: false };
    groups.push(cur);
    for (const line of text.split(/\r?\n/)) {
      const t = line.trim(); if (!t || t[0] === '#') continue;
      const parts = t.split(/\s+/), c = parts[0];
      if (c === 'v') verts.push(+parts[1], +parts[2], +parts[3]);
      else if (c === 'vn') norms.push(+parts[1], +parts[2], +parts[3]);
      else if (c === 'g' || c === 'o') {
        const name = parts.slice(1).join(' ') || ('group_' + groups.length);
        if (cur.positions.length === 0) cur.name = name;
        else { cur = { name, positions: [], normals: [], hasNormals: false }; groups.push(cur); }
      } else if (c === 'f') {
        const face = [];
        for (let i = 1; i < parts.length; i++) {
          const tok = parts[i].split('/');
          const vi = parseInt(tok[0]); const ni = tok[2] ? parseInt(tok[2]) : 0;
          if (!isNaN(vi)) face.push({ v: vi, n: ni });
        }
        if (face.length < 3) continue;
        for (let i = 1; i < face.length - 1; i++) {
          const f = [face[0], face[i], face[i + 1]];
          for (let k = 0; k < 3; k++) {
            const vi = (f[k].v > 0 ? f[k].v - 1 : verts.length / 3 + f[k].v);
            if (vi < 0 || vi * 3 + 2 >= verts.length) continue;
            cur.positions.push(verts[vi * 3], verts[vi * 3 + 1], verts[vi * 3 + 2]);
            if (f[k].n && norms.length > 0) {
              const ni = (f[k].n > 0 ? f[k].n - 1 : norms.length / 3 + f[k].n);
              if (ni >= 0 && ni * 3 + 2 < norms.length) {
                cur.normals.push(norms[ni * 3], norms[ni * 3 + 1], norms[ni * 3 + 2]);
                cur.hasNormals = true;
              }
            }
          }
        }
      }
    }
    const out = [];
    for (const g of groups) {
      if (g.positions.length === 0) continue;
      const bg = new THREE.BufferGeometry();
      bg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(g.positions), 3));
      if (g.hasNormals && g.normals.length === g.positions.length) {
        bg.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(g.normals), 3));
      } else bg.computeVertexNormals();
      out.push({ name: g.name, path: [g.name], geometry: bg });
    }
    if (out.length === 0) throw new Error('OBJ : aucun composant valide');
    return out;
  }

  async function parseIFC(arrayBuffer) {
    if (!window._webIfcAPI) {
      setStatus('📦 Chargement du moteur IFC (~2 Mo, première fois seulement)...', 'info');
      const module = await import('https://cdn.jsdelivr.net/npm/web-ifc@0.0.68/web-ifc-api.js');
      const api = new module.IfcAPI();
      api.SetWasmPath('https://cdn.jsdelivr.net/npm/web-ifc@0.0.68/');
      await api.Init();
      window._webIfcAPI = api;
    }
    const api = window._webIfcAPI;
    setStatus('🔧 Analyse du fichier IFC en cours...', 'info');

    const uint8 = new Uint8Array(arrayBuffer);
    const modelID = api.OpenModel(uint8);
    const components = [];
    const zUpToYUp = new THREE.Matrix4().makeRotationX(-Math.PI / 2);

    api.StreamAllMeshes(modelID, (mesh) => {
      const expressID = mesh.expressID;
      let elementName = 'Element_' + expressID;
      let elementType = 'IfcElement';
      try {
        const props = api.GetLine(modelID, expressID);
        if (typeof api.GetNameFromTypeCode === 'function') {
          try { elementType = api.GetNameFromTypeCode(props.type) || elementType; } catch (e) {}
        }
        if (props.Name && props.Name.value) elementName = props.Name.value;
        else elementName = elementType + '_' + expressID;
      } catch (e) {}

      const geometries = mesh.geometries;
      const size = geometries.size();
      for (let i = 0; i < size; i++) {
        const placedGeom = geometries.get(i);
        try {
          const geom = api.GetGeometry(modelID, placedGeom.geometryExpressID);
          const vertArr = api.GetVertexArray(geom.GetVertexData(), geom.GetVertexDataSize());
          const idxArr = api.GetIndexArray(geom.GetIndexData(), geom.GetIndexDataSize());

          const numVerts = vertArr.length / 6;
          const positions = new Float32Array(numVerts * 3);
          const normals = new Float32Array(numVerts * 3);
          for (let v = 0; v < numVerts; v++) {
            positions[v * 3]     = vertArr[v * 6];
            positions[v * 3 + 1] = vertArr[v * 6 + 1];
            positions[v * 3 + 2] = vertArr[v * 6 + 2];
            normals[v * 3]     = vertArr[v * 6 + 3];
            normals[v * 3 + 1] = vertArr[v * 6 + 4];
            normals[v * 3 + 2] = vertArr[v * 6 + 5];
          }
          const bufferGeom = new THREE.BufferGeometry();
          bufferGeom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
          bufferGeom.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
          bufferGeom.setIndex(new THREE.BufferAttribute(new Uint32Array(idxArr), 1));

          const ifcMat = new THREE.Matrix4().fromArray(Array.from(placedGeom.flatTransformation));
          const combined = new THREE.Matrix4().multiplyMatrices(zUpToYUp, ifcMat);
          bufferGeom.applyMatrix4(combined);

          let color = null;
          if (placedGeom.color) color = new THREE.Color(placedGeom.color.x, placedGeom.color.y, placedGeom.color.z);

          components.push({
            name: size > 1 ? `${elementName} (#${i + 1})` : elementName,
            path: [elementType, elementName], geometry: bufferGeom, color: color,
          });
        } catch (e) { console.warn('[Plan2DEngine][IFC] Géométrie échec pour expressID', expressID, e); }
      }
    });

    api.CloseModel(modelID);
    if (components.length === 0) throw new Error('IFC : aucune géométrie exploitable');
    return components;
  }

  function parseGLB(buffer) {
    const dv = new DataView(buffer);
    if (dv.getUint32(0, true) !== 0x46546C67) throw new Error('Magic GLB invalide');
    if (dv.getUint32(4, true) !== 2) throw new Error('Version GLB non supportée');
    let off = 12, json = null, bin = null;
    while (off < buffer.byteLength) {
      const len = dv.getUint32(off, true);
      const type = dv.getUint32(off + 4, true);
      off += 8;
      if (type === 0x4E4F534A) json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, off, len)));
      else if (type === 0x004E4942) bin = buffer.slice(off, off + len);
      off += len;
    }
    if (!json) throw new Error('Pas de chunk JSON');
    return processGLTF(json, bin);
  }

  function processGLTF(json, bin) {
    const components = [];
    const CT = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
    const TS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };
    function getAccessor(idx) {
      const a = json.accessors[idx], bv = json.bufferViews[a.bufferView];
      const Ctor = CT[a.componentType], compSize = TS[a.type];
      const elBytes = Ctor.BYTES_PER_ELEMENT, totalEl = a.count * compSize;
      const start = (bv.byteOffset || 0) + (a.byteOffset || 0);
      const stride = bv.byteStride || (elBytes * compSize);
      const tight = (stride === elBytes * compSize) && (start % elBytes === 0);
      if (tight) { try { return new Ctor(bin, start, totalEl); } catch (e) {} }
      const out = new Ctor(totalEl);
      const dv = new DataView(bin);
      const r = {
        5120: (o) => dv.getInt8(o), 5121: (o) => dv.getUint8(o),
        5122: (o) => dv.getInt16(o, true), 5123: (o) => dv.getUint16(o, true),
        5125: (o) => dv.getUint32(o, true), 5126: (o) => dv.getFloat32(o, true),
      }[a.componentType];
      for (let i = 0; i < a.count; i++) for (let j = 0; j < compSize; j++)
        out[i * compSize + j] = r(start + i * stride + j * elBytes);
      return out;
    }
    function buildPrim(prim) {
      const g = new THREE.BufferGeometry();
      if (prim.attributes.POSITION !== undefined) {
        const p = getAccessor(prim.attributes.POSITION);
        g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(p), 3));
      }
      if (prim.attributes.NORMAL !== undefined) {
        const n = getAccessor(prim.attributes.NORMAL);
        g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n), 3));
      } else g.computeVertexNormals();
      if (prim.indices !== undefined) {
        const ix = getAccessor(prim.indices);
        g.setIndex(new THREE.BufferAttribute(new Uint32Array(ix), 1));
      }
      let color = null;
      if (prim.material !== undefined && json.materials) {
        const m = json.materials[prim.material];
        if (m.pbrMetallicRoughness && m.pbrMetallicRoughness.baseColorFactor) {
          const c = m.pbrMetallicRoughness.baseColorFactor;
          color = new THREE.Color(c[0], c[1], c[2]);
        }
      }
      return { geometry: g, color };
    }
    function processNode(idx, parentMat, ancestorPath, depth) {
      const node = json.nodes[idx];
      const lm = new THREE.Matrix4();
      if (node.matrix) lm.fromArray(node.matrix);
      else {
        const t = new THREE.Vector3().fromArray(node.translation || [0, 0, 0]);
        const r = new THREE.Quaternion().fromArray(node.rotation || [0, 0, 0, 1]);
        const s = new THREE.Vector3().fromArray(node.scale || [1, 1, 1]);
        lm.compose(t, r, s);
      }
      const wm = new THREE.Matrix4().multiplyMatrices(parentMat, lm);
      const myName = node.name || ('Node_' + idx);
      const myPath = [...ancestorPath, myName];
      if (node.mesh !== undefined) {
        const mesh = json.meshes[node.mesh];
        mesh.primitives.forEach((prim, pi) => {
          const built = buildPrim(prim);
          built.geometry.applyMatrix4(wm);
          const cn = mesh.primitives.length > 1 ? `${myName} (#${pi + 1})` : myName;
          components.push({ name: cn, path: myPath, depth, geometry: built.geometry, color: built.color });
        });
      }
      if (node.children) node.children.forEach(ci => processNode(ci, wm, myPath, depth + 1));
    }
    const scIdx = json.scene || 0;
    const sc = json.scenes && json.scenes[scIdx];
    if (sc && sc.nodes) sc.nodes.forEach(ni => processNode(ni, new THREE.Matrix4(), [], 0));
    if (components.length === 0) throw new Error('glTF : aucun mesh trouvé');
    return components;
  }

  async function parseDAE(text, assetManager) {
    if (!window.THREE || !window.THREE.ColladaLoader) {
      setStatus('📦 Chargement du moteur COLLADA (première fois seulement)...', 'info');
      await new Promise((resolve, reject) => {
        const existing = document.querySelector('script[data-collada-loader]');
        if (existing) { resolve(); return; }
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/ColladaLoader.js';
        s.setAttribute('data-collada-loader', '1');
        s.onload = resolve;
        s.onerror = () => reject(new Error('Chargement de ColladaLoader échoué'));
        document.head.appendChild(s);
      });
    }
    if (!window.THREE.ColladaLoader) throw new Error('ColladaLoader indisponible');
    setStatus('🔧 Analyse du fichier COLLADA en cours...', 'info');

    const loader = assetManager ? new window.THREE.ColladaLoader(assetManager) : new window.THREE.ColladaLoader();
    const collada = loader.parse(text, '');
    const root = collada && collada.scene;
    if (!root) throw new Error('COLLADA : scène vide');
    root.updateMatrixWorld(true);

    const components = [];
    root.traverse((obj) => {
      if (!obj.isMesh || !obj.geometry) return;
      const geom = obj.geometry.clone();
      geom.applyMatrix4(obj.matrixWorld);
      const path = [];
      let p = obj;
      while (p && p !== root) { path.unshift(p.name || ('Node_' + path.length)); p = p.parent; }
      if (path.length === 0) path.push(obj.name || 'Mesh');
      let color = null, map = null, roughness, metalness, opacityVal;
      const mat = Array.isArray(obj.material) ? obj.material[0] : obj.material;
      if (mat) {
        if (mat.color) { try { color = mat.color.clone(); } catch (e) {} }
        if (mat.map && mat.map.isTexture) map = mat.map;
        if (typeof mat.roughness === 'number') roughness = mat.roughness;
        if (typeof mat.metalness === 'number') metalness = mat.metalness;
        if (typeof mat.opacity === 'number' && mat.transparent) opacityVal = mat.opacity;
      }
      components.push({ name: obj.name || path[path.length - 1] || 'Mesh', path, geometry: geom, color, map, roughness, metalness, opacity: opacityVal });
    });
    if (components.length === 0) throw new Error('COLLADA : aucune géométrie exploitable');
    return components;
  }

  function normalizeAssetKey(p) { return String(p).replace(/\\/g, '/').split('/').pop().toLowerCase(); }
  function buildAssetMap(files) {
    const map = new Map(); const urls = [];
    files.forEach(f => { const url = URL.createObjectURL(f); urls.push(url); map.set(normalizeAssetKey(f.webkitRelativePath || f.name), url); });
    return { map, urls };
  }
  function buildAssetManager(fileMap) {
    const manager = new THREE.LoadingManager();
    manager.setURLModifier((url) => {
      if (/^(data:|blob:|https?:)/i.test(url)) return url;
      let key; try { key = normalizeAssetKey(decodeURIComponent(url)); } catch (e) { key = normalizeAssetKey(url); }
      return fileMap.has(key) ? fileMap.get(key) : url;
    });
    return manager;
  }
  function ensureJSZip() {
    if (window.JSZip) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
      s.onload = resolve;
      s.onerror = () => reject(new Error('Chargement de JSZip échoué'));
      document.head.appendChild(s);
    });
  }
  async function unzipToFiles(zipFile) {
    await ensureJSZip();
    const zip = await window.JSZip.loadAsync(await zipFile.arrayBuffer());
    const out = [];
    const entries = Object.values(zip.files).filter(e => !e.dir);
    for (const entry of entries) {
      const blob = await entry.async('blob');
      out.push(new File([blob], entry.name.split('/').pop(), {}));
    }
    return out;
  }
  const ZIP_MODEL_FILE_EXTS = ['dae', 'gltf', 'obj', 'glb', 'stl'];
  function pickModelFile(files) { return files.find(f => ZIP_MODEL_FILE_EXTS.includes(f.name.split('.').pop().toLowerCase())); }

  async function parseByExtension(file) {
    let ext = file.name.split('.').pop().toLowerCase();
    let extraFiles = null;
    if (ext === 'zip') {
      const unzipped = await unzipToFiles(file);
      const modelFile = pickModelFile(unzipped);
      if (!modelFile) throw new Error('Aucun modèle 3D (.dae/.gltf/.obj/.glb/.stl) trouvé dans l\'archive');
      extraFiles = unzipped.filter(f => f !== modelFile);
      file = modelFile;
      ext = file.name.split('.').pop().toLowerCase();
    }
    let assetManager = null;
    if (extraFiles && extraFiles.length) assetManager = buildAssetManager(buildAssetMap(extraFiles).map);
    if (ext === 'stl') return parseSTL(await file.arrayBuffer());
    if (ext === 'obj') return parseOBJ(await file.text());
    if (ext === 'glb') return parseGLB(await file.arrayBuffer());
    if (ext === 'ifc') return await parseIFC(await file.arrayBuffer());
    if (ext === 'dae') return await parseDAE(await file.text(), assetManager);
    if (ext === 'gltf') {
      const json = JSON.parse(await file.text());
      if (json.buffers && json.buffers[0] && json.buffers[0].uri && json.buffers[0].uri.startsWith('data:')) {
        const b64 = json.buffers[0].uri.split(',')[1];
        const bs = atob(b64);
        const bin = new ArrayBuffer(bs.length);
        const view = new Uint8Array(bin);
        for (let i = 0; i < bs.length; i++) view[i] = bs.charCodeAt(i);
        return processGLTF(json, bin);
      }
      throw new Error('.gltf avec buffer externe non supporté. Utilise .glb');
    }
    throw new Error('Format non supporté : .' + ext);
  }

  // ─── EXTRACTION VECTORIELLE (portage headless de la section PLAN 2D de viewer3d.html) ───
  const SCALE_TO_MM = { m: 1000, cm: 10, mm: 1 };
  const PLAN2D_VIEWS = [
    { key: 'front', label: 'Face', dir: [0, 0, 1] },
    { key: 'back', label: 'Dos', dir: [0, 0, -1] },
    { key: 'left', label: 'Gauche', dir: [-1, 0, 0] },
    { key: 'right', label: 'Droite', dir: [1, 0, 0] },
    { key: 'top', label: 'Dessus', dir: [0, 1, 0] },
  ];
  const EDGE_ANGLE_THRESHOLD = 25; // degrés — ne s'applique qu'aux arêtes sur une face visible (crêtes), voir plus bas
  const TRI_SAFETY_CAP = 2000000; // garde-fou absolu (triangles), cas vraiment pathologique uniquement

  // ─── Adjacence des arêtes (indépendante de la vue) ─────────────────────────────────────────────
  // Pour chaque arête "candidate" d'un mesh, mémorise la/les normale(s) MONDE de la ou des face(s)
  // triangulaires qui la bordent (1 = bord ouvert, 2+ = arête intérieure). Cette information ne dépend
  // pas de l'angle de vue — elle est calculée UNE FOIS, puis réutilisée pour chacune des 5 vues.
  //
  // Pourquoi ce n'est pas une simple liste de segments + test de profondeur (version précédente) :
  // un contour de silhouette est par nature tangent à sa PROPRE surface au moment où on le teste avec
  // un depth-buffer — un micro-écart d'arrondi/anti-aliasing suffit à le classer "caché" à tort. Sur ce
  // projet, ce bruit a fait disparaître les grandes arêtes droites du contour (remplacées par un
  // gribouillis de petits fragments), et une fois "corrigé" en triant par longueur, ce tri pouvait à son
  // tour favoriser à tort une longue diagonale de contreventement au détriment d'un rail principal
  // découpé en plusieurs petits segments dans le fichier source.
  //
  // La vraie solution : déterminer la visibilité par la GÉOMÉTRIE (orientation des faces adjacentes par
  // rapport à la direction de vue), qui ne dépend d'aucune précision de rendu :
  //   - 1 face adjacente  → arête de bord ("bord ouvert") : visible si cette face regarde la caméra.
  //   - 2+ faces, mélange face/dos → VRAIE SILHOUETTE : toujours visible, par définition géométrique.
  //   - 2+ faces, toutes face à la caméra → crête sur une face visible : visible seulement si l'angle
  //     entre les faces dépasse EDGE_ANGLE_THRESHOLD (sinon c'est juste la triangulation d'une surface
  //     plane/lisse) — et seulement là, un test de profondeur reste utile (occultation par un AUTRE
  //     objet du modèle, positionné devant).
  //   - 2+ faces, toutes de dos → entièrement caché, jamais dessiné.
  // Le test de profondeur (bruit possible) ne sert donc plus QUE pour ce dernier cas restreint, jamais
  // pour la silhouette elle-même — qui ne peut plus disparaître.
  function collectEdgeAdjacency(meshes) {
    const edges = [];
    const vA = new THREE.Vector3(), vB = new THREE.Vector3(), vC = new THREE.Vector3();
    const eCB = new THREE.Vector3(), eAB = new THREE.Vector3(), faceNormal = new THREE.Vector3();
    let triBudget = TRI_SAFETY_CAP;
    for (const mesh of meshes) {
      const geom = mesh.geometry;
      if (!geom || !geom.attributes || !geom.attributes.position) continue;
      mesh.updateMatrixWorld(true);
      const normalMatrix = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
      const pos = geom.attributes.position;
      const index = geom.index;
      const triCount = Math.min(index ? Math.floor(index.count / 3) : Math.floor(pos.count / 3), triBudget);
      const vIdx = (i) => index ? index.getX(i) : i;
      const keyOf = (i) => Math.round(pos.getX(i) * 1e4) + '_' + Math.round(pos.getY(i) * 1e4) + '_' + Math.round(pos.getZ(i) * 1e4);
      const edgeMap = new Map(); // "posKeyA|posKeyB" -> { ia, ib, normals: THREE.Vector3[] }
      for (let t = 0; t < triCount; t++) {
        const i0 = vIdx(t * 3), i1 = vIdx(t * 3 + 1), i2 = vIdx(t * 3 + 2);
        vA.fromBufferAttribute(pos, i0); vB.fromBufferAttribute(pos, i1); vC.fromBufferAttribute(pos, i2);
        // Normale locale = (C-B) x (A-B), même convention que THREE.Triangle.getNormal.
        eCB.subVectors(vC, vB); eAB.subVectors(vA, vB);
        faceNormal.crossVectors(eCB, eAB);
        if (faceNormal.lengthSq() < 1e-14) continue; // triangle dégénéré
        faceNormal.normalize().applyMatrix3(normalMatrix).normalize();
        const k0 = keyOf(i0), k1 = keyOf(i1), k2 = keyOf(i2);
        const tri = [[i0, i1, k0, k1], [i1, i2, k1, k2], [i2, i0, k2, k0]];
        for (const [ia, ib, ka, kb] of tri) {
          // Clé par POSITION (pas par indice) : indispensable sur une géométrie non indexée/non soudée
          // (très courant — STL, exports OBJ...), où deux triangles adjacents ne partagent jamais le
          // même indice de sommet même s'ils coïncident géométriquement.
          const key = ka < kb ? ka + '|' + kb : kb + '|' + ka;
          let e = edgeMap.get(key);
          if (!e) { e = { ia, ib, normals: [] }; edgeMap.set(key, e); }
          e.normals.push(faceNormal.clone());
        }
      }
      triBudget -= triCount;
      for (const e of edgeMap.values()) {
        const worldA = new THREE.Vector3().fromBufferAttribute(pos, e.ia).applyMatrix4(mesh.matrixWorld);
        const worldB = new THREE.Vector3().fromBufferAttribute(pos, e.ib).applyMatrix4(mesh.matrixWorld);
        edges.push({ a: worldA, b: worldB, normals: e.normals });
      }
      if (triBudget <= 0) break;
    }
    return edges;
  }

  // Classe les arêtes pour UNE vue donnée (viewDir = direction "vers la caméra", constante en
  // orthographique) — voir le commentaire de collectEdgeAdjacency pour le détail des 4 cas.
  function classifyEdgesForView(edges, viewDir) {
    const always = []; // silhouettes + bords visibles : prouvées visibles par la géométrie seule
    const candidates = []; // crêtes sur face visible : à confirmer par un test de profondeur (occultation par un autre objet)
    for (const e of edges) {
      const facings = e.normals.map((n) => n.dot(viewDir) > 0);
      const anyFront = facings.some((f) => f), anyBack = facings.some((f) => !f);
      if (anyFront && anyBack) { always.push(e); continue; } // mélange face/dos = silhouette
      if (!anyFront) continue; // toutes de dos = entièrement caché
      if (e.normals.length === 1) { always.push(e); continue; } // bord ouvert, face visible
      let maxAngle = 0;
      for (let i = 0; i < e.normals.length; i++) {
        for (let j = i + 1; j < e.normals.length; j++) {
          maxAngle = Math.max(maxAngle, e.normals[i].angleTo(e.normals[j]) * 180 / Math.PI);
        }
      }
      if (maxAngle > EDGE_ANGLE_THRESHOLD) candidates.push(e);
    }
    return { always, candidates };
  }

  function buildOrthoCamera(key, dims, maxDim, aspect) {
    const view = PLAN2D_VIEWS.find(v => v.key === key);
    let halfW, halfH;
    if (key === 'front' || key === 'back') { halfW = dims.x / 2; halfH = dims.y / 2; }
    else if (key === 'left' || key === 'right') { halfW = dims.z / 2; halfH = dims.y / 2; }
    else { halfW = dims.x / 2; halfH = dims.z / 2; }
    const margin = 1.15;
    let vH = Math.max(halfH * margin, 0.01);
    let vW = vH * aspect;
    if (vW < halfW * margin) { vW = halfW * margin; vH = vW / aspect; }
    const dist = Math.max(maxDim * 5, 10);
    const cam = new THREE.OrthographicCamera(-vW, vW, vH, -vH, Math.max(dist - maxDim * 1.5, 0.01), dist + maxDim * 1.5);
    cam.position.set(view.dir[0] * dist, view.dir[1] * dist, view.dir[2] * dist);
    cam.up.set(0, key === 'top' ? 0 : 1, key === 'top' ? -1 : 0);
    cam.lookAt(0, 0, 0);
    cam.updateProjectionMatrix();
    return cam;
  }

  function renderDepthBuffer(renderer, scene, cam, w, h) {
    const rt = new THREE.WebGLRenderTarget(w, h, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    const depthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    depthMaterial.side = THREE.DoubleSide; // sinon les faces mal orientées créent des trous dans le depth buffer
    const prevOverride = scene.overrideMaterial;
    const prevTarget = renderer.getRenderTarget();
    scene.overrideMaterial = depthMaterial;
    renderer.setRenderTarget(rt);
    renderer.clear();
    renderer.render(scene, cam);
    const pixels = new Uint8Array(w * h * 4);
    renderer.readRenderTargetPixels(rt, 0, 0, w, h, pixels);
    renderer.setRenderTarget(prevTarget);
    scene.overrideMaterial = prevOverride;
    rt.dispose(); depthMaterial.dispose();
    return pixels;
  }
  function unpackRGBADepth(pixels, idx) {
    const r = pixels[idx] / 255, g = pixels[idx + 1] / 255, b = pixels[idx + 2] / 255, a = pixels[idx + 3] / 255;
    return r / 16777216 + g / 65536 + b / 256 + a;
  }

  // edgeAdjacency : résultat de collectEdgeAdjacency(meshes), calculé une seule fois pour tout le
  // modèle (indépendant de la vue) et réutilisé ici pour chacune des 5 vues.
  function computeVectorViewData(renderer, scene, edgeAdjacency, dims, maxDim, unit, key, canvasW, canvasH) {
    if (!edgeAdjacency || edgeAdjacency.length === 0) return null;
    const view = PLAN2D_VIEWS.find((v) => v.key === key);
    const viewDir = new THREE.Vector3(view.dir[0], view.dir[1], view.dir[2]); // direction "vers la caméra" (constante en orthographique)
    const { always, candidates } = classifyEdgesForView(edgeAdjacency, viewDir);
    if (always.length === 0 && candidates.length === 0) return null;

    const aspect = canvasW / canvasH;
    const cam = buildOrthoCamera(key, dims, maxDim, aspect);
    const factor = SCALE_TO_MM[unit || 'm'];
    const halfViewW = (cam.right - cam.left) / 2, halfViewH = (cam.top - cam.bottom) / 2;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let pathData = '';
    function project(v3) {
      const ndc = v3.clone().project(cam);
      const x = ndc.x * halfViewW * factor;
      const y = -ndc.y * halfViewH * factor; // Y monde vers le haut → Y canvas vers le bas
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      return [x, y];
    }
    function addLine(pa, pb) {
      pathData += 'M' + pa[0].toFixed(1) + ' ' + pa[1].toFixed(1) + 'L' + pb[0].toFixed(1) + ' ' + pb[1].toFixed(1) + ' ';
    }

    // Silhouettes + bords : visibilité prouvée par la géométrie seule (voir collectEdgeAdjacency) —
    // aucun test de profondeur, donc aucun bruit possible sur l'essentiel du contour d'un module.
    for (const e of always) addLine(project(e.a), project(e.b));

    // Crêtes sur face visible : seul cas encore susceptible d'être caché par un AUTRE objet du modèle
    // (ex. une pièce positionnée devant) — testé via une passe de profondeur, échantillonnée le long de
    // chaque arête (une crête peut être partiellement masquée). Beaucoup plus sûr qu'avant : ce n'est
    // jamais une arête tangente à sa propre surface (le cas qui posait problème est déjà écarté ci-dessus).
    if (candidates.length > 0) {
      const W = Math.max(Math.min(canvasW, 2000), 200), H = Math.max(Math.min(canvasH, 2000), 200);
      let pixels = null;
      try { pixels = renderDepthBuffer(renderer, scene, cam, W, H); } catch (e) { console.error('[Plan2DEngine] passe de profondeur échouée', e); }
      if (pixels) {
        const epsilon = (cam.far - cam.near) * 0.006;
        const SAMPLES = 10;
        function isVisible(ndc) {
          const col = Math.round((ndc.x + 1) / 2 * (W - 1));
          const row = Math.round((ndc.y + 1) / 2 * (H - 1));
          if (col < 0 || col >= W || row < 0 || row >= H) return true;
          let bufDepth = Infinity;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const c = col + dx, r = row + dy;
              if (c < 0 || c >= W || r < 0 || r >= H) continue;
              const d = unpackRGBADepth(pixels, (r * W + c) * 4);
              if (d < bufDepth) bufDepth = d;
            }
          }
          const ptDepth = (ndc.z + 1) / 2;
          return bufDepth >= ptDepth - epsilon;
        }
        const p = new THREE.Vector3();
        let run = [];
        const flushRun = () => {
          if (run.length >= 2) {
            pathData += 'M' + run[0][0].toFixed(1) + ' ' + run[0][1].toFixed(1);
            for (let k = 1; k < run.length; k++) pathData += 'L' + run[k][0].toFixed(1) + ' ' + run[k][1].toFixed(1);
            pathData += ' ';
          }
          run = [];
        };
        for (const e of candidates) {
          for (let s = 0; s <= SAMPLES; s++) {
            p.lerpVectors(e.a, e.b, s / SAMPLES);
            const ndc = p.clone().project(cam);
            const pt = project(p);
            if (isVisible(ndc)) run.push(pt); else flushRun();
          }
          flushRun();
        }
      }
    }

    if (!pathData) return null;
    return { path: pathData, widthMm: maxX - minX, heightMm: maxY - minY };
  }

  function renderColorSnapshot(renderer, scene, cam, w, h) {
    const prevTarget = renderer.getRenderTarget();
    renderer.setRenderTarget(null);
    renderer.setSize(w, h, false);
    renderer.render(scene, cam);
    const dataUrl = renderer.domElement.toDataURL('image/png');
    renderer.setRenderTarget(prevTarget);
    return dataUrl;
  }

  // ─── ORCHESTRATION ───
  async function loadScript(src, guardAttr) {
    return new Promise((resolve, reject) => {
      if (guardAttr && document.querySelector('script[' + guardAttr + ']')) { resolve(); return; }
      const s = document.createElement('script');
      s.src = src;
      if (guardAttr) s.setAttribute(guardAttr, '1');
      s.onload = resolve;
      s.onerror = () => reject(new Error('Échec de chargement : ' + src));
      document.head.appendChild(s);
    });
  }
  async function ensureThree() {
    if (window.THREE) return;
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js', 'data-plan2d-three');
  }

  // Reprend buildMaterialForComponent de viewer3d.html : utilise la vraie couleur/texture du composant
  // quand le fichier source en fournit une (GLB/glTF/DAE/IFC peuvent en avoir), sinon retombe sur une
  // couleur de palette technique — jamais un bloc orange uniforme comme avant ce correctif.
  const MATERIAL_PALETTE = [0xff8a3d, 0x4ade80, 0x60a5fa, 0xf472b6, 0xfbbf24, 0xa78bfa, 0x34d399, 0xfb7185, 0x38bdf8, 0xfcd34d];
  function buildMaterialForComponent(comp, idx) {
    const params = { roughness: (comp && comp.roughness) ?? 0.6, metalness: (comp && comp.metalness) ?? 0.1, side: THREE.DoubleSide };
    if (comp && comp.color) params.color = comp.color;
    else params.color = new THREE.Color(MATERIAL_PALETTE[idx % MATERIAL_PALETTE.length]);
    if (comp && comp.map) { comp.map.encoding = THREE.sRGBEncoding; comp.map.needsUpdate = true; params.map = comp.map; }
    if (comp && comp.opacity !== undefined) { params.opacity = comp.opacity; params.transparent = true; }
    return new THREE.MeshStandardMaterial(params);
  }

  function buildScene(components) {
    const scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const dl = new THREE.DirectionalLight(0xffffff, 0.8); dl.position.set(10, 20, 10); scene.add(dl);
    const dl2 = new THREE.DirectionalLight(0xffffff, 0.4); dl2.position.set(-10, 5, -10); scene.add(dl2);
    const meshes = [];
    const box = new THREE.Box3();
    components.forEach((comp, idx) => {
      if (!comp.geometry || !comp.geometry.attributes || !comp.geometry.attributes.position) return;
      if (!comp.geometry.attributes.normal) comp.geometry.computeVertexNormals();
      const mesh = new THREE.Mesh(comp.geometry, buildMaterialForComponent(comp, idx));
      scene.add(mesh);
      meshes.push(mesh);
      mesh.updateMatrixWorld(true);
      box.expandByObject(mesh);
    });
    if (meshes.length === 0) throw new Error('Aucune géométrie exploitable dans ce fichier');
    const center = new THREE.Vector3(); box.getCenter(center);
    meshes.forEach(m => m.position.sub(center));
    scene.updateMatrixWorld(true);
    const size = new THREE.Vector3(); box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z, 0.001);
    return { scene, meshes, dims: size, maxDim };
  }

  // Même hypothèse par défaut que applyModelUnitForFormat dans viewer3d.html : les formats qui
  // encodent leur propre unité (convertie en mètres par leur parseur) → 'm' ; les formats sans unité
  // standard (STL/OBJ) sont eux aussi supposés en 'm' par défaut dans le viewer — on garde la même
  // hypothèse ici pour rester cohérent (sinon les cotes automatiques divergeraient entre les deux
  // parcours selon qu'on passe par le viewer 3D ou par ce moteur headless).
  function detectUnit(ext) { return 'm'; }

  // Point d'entrée principal appelé par plan2d-studio.html.
  // opts.onProgress(message) est appelé à chaque étape pour afficher un statut à l'utilisateur.
  // Retourne un tableau [{ view: 'front'|'back'|'left'|'right'|'top'|'3d', dataUrl, vector }, ...].
  async function generateViewsFromFile(file, opts) {
    opts = opts || {};
    const onProgress = opts.onProgress || function () {};
    statusHook = onProgress;
    try {
      onProgress('Chargement du moteur 3D...');
      await ensureThree();
      const ext = file.name.split('.').pop().toLowerCase();
      onProgress('Lecture du fichier ' + file.name + '...');
      const components = await parseByExtension(file);
      const unit = opts.unit || detectUnit(ext);
      const { scene, meshes, dims, maxDim } = buildScene(components);
      const canvasW = 1400, canvasH = 1000;
      const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
      renderer.setClearColor(0xeef0f3, 1);

      onProgress('Analyse de la géométrie (arêtes, faces)...');
      const edgeAdjacency = collectEdgeAdjacency(meshes); // indépendant de la vue, calculé une seule fois

      const results = [];
      for (let i = 0; i < PLAN2D_VIEWS.length; i++) {
        const view = PLAN2D_VIEWS[i];
        onProgress(`Extraction vue ${i + 1}/${PLAN2D_VIEWS.length + 2} (${view.label})...`);
        const cam = buildOrthoCamera(view.key, dims, maxDim, canvasW / canvasH);
        const dataUrl = renderColorSnapshot(renderer, scene, cam, canvasW, canvasH);
        const vector = computeVectorViewData(renderer, scene, edgeAdjacency, dims, maxDim, unit, view.key, canvasW, canvasH);
        results.push({ view: view.key, dataUrl, vector });
      }
      // Deux rendus 3D isométriques fixes pour la page de garde — UNIQUEMENT en repli, si l'appelant n'a
      // pas déjà de vraies photos 3D à disposition (ex. capturées à la main dans la Galerie du viewer et
      // choisies par l'utilisateur — voir opts.skipIsometricRenders). Sans étape d'orbite manuelle ici,
      // on n'a pas de "bel angle" choisi par l'utilisateur : deux coins opposés par défaut, en dépannage.
      if (!opts.skipIsometricRenders) {
        const persp = new THREE.PerspectiveCamera(45, canvasW / canvasH, Math.max(maxDim * 0.001, 0.001), maxDim * 100);
        const azimuths = [Math.PI / 4, Math.PI * 1.25];
        for (let i = 0; i < azimuths.length; i++) {
          onProgress(`Extraction du rendu 3D ${i + 1}/${azimuths.length}...`);
          const dist = maxDim * 2.2, polar = Math.PI / 3, sp = Math.sin(polar);
          persp.position.set(dist * sp * Math.sin(azimuths[i]), dist * Math.cos(polar), dist * sp * Math.cos(azimuths[i]));
          persp.lookAt(0, 0, 0);
          persp.updateProjectionMatrix();
          const dataUrl = renderColorSnapshot(renderer, scene, persp, canvasW, canvasH);
          results.push({ view: '3d', dataUrl, vector: null });
        }
      }
      renderer.dispose();
      return results;
    } finally {
      statusHook = null;
    }
  }

  global.Plan2DEngine = { generateViewsFromFile };
})(window);
