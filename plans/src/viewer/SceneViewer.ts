// Viewer 3D du module Plans Viewbox : orbite / pan / zoom, perspective ou orthographique, vues standard,
// isolation d'une Viewbox par masquage (visible = false, jamais de plan de coupe), voisins en fantôme (option),
// surbrillance au survol, clic = infos, marqueurs de face avant, captures haute définition détourées.
import {
  Box3,
  BufferGeometry,
  Color,
  DirectionalLight,
  DoubleSide,
  EdgesGeometry,
  Float32BufferAttribute,
  Group,
  HemisphereLight,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  OrthographicCamera,
  PerspectiveCamera,
  Raycaster,
  Scene,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderTarget,
  WebGLRenderer,
} from 'three';
import type { Material, Object3D, Texture } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { acceleratedRaycast, computeBoundsTree } from 'three-mesh-bvh';
import type { ViewKind, Vec3 } from '../core/views';
import { frontVector, viewBasis } from '../core/views';
import type { LoadedScene } from '../scene/loadedScene';
import { nodeIdOf } from '../scene/loadedScene';
import type { GlassTest } from '../linework/packets';
import { finishCapture } from './captureImage';

// raycast accéléré (BVH) : survol fluide même avec des dizaines de milliers d'objets
Mesh.prototype.raycast = acceleratedRaycast;
(BufferGeometry.prototype as unknown as { computeBoundsTree: typeof computeBoundsTree }).computeBoundsTree = computeBoundsTree;

export type Projection = 'perspective' | 'orthographic';
export type IsoKind = 'iso-ne' | 'iso-nw' | 'iso-se' | 'iso-sw';
export type StandardView = ViewKind | IsoKind;

export const ISO_LABELS: Record<IsoKind, string> = { 'iso-ne': 'Iso NE', 'iso-nw': 'Iso NO', 'iso-se': 'Iso SE', 'iso-sw': 'Iso SO' };

/** Couleur des vitrages sans matériau transparent (charte : bleu très clair translucide). */
const GLASS_COLOR = 0xcfe6f0;
const GLASS_OPACITY = 0.35;
const EDGE_ANGLE = 30;

export interface PickInfo {
  nodeId: string;
  itemId: string;
  point: Vec3;
  normal: Vec3 | null;
}

export interface CameraPose {
  projection: Projection;
  position: Vec3;
  target: Vec3;
  up: Vec3;
  fov?: number;
  zoom?: number;
  /** hauteur visible (mm) en orthographique */
  orthoHeight?: number;
}

export interface CaptureOptions {
  /** plus grand côté de l'image rendue (px) */
  size: number;
  background: 'white' | 'transparent';
  /** marge autour de l'objet après recadrage (% du plus grand côté) */
  marginPct: number;
  /** pose de caméra ; sinon la vue courante */
  pose?: CameraPose;
}

export interface CaptureResult {
  blob: Blob;
  width: number;
  height: number;
  /** taille demandée ramenée au maximum de la carte graphique */
  clamped: boolean;
}

interface Entry {
  mesh: Mesh;
  nodeId: string;
  itemId: string;
  category: string | null;
  context: boolean;
  display: Material | Material[];
}

export class SceneViewer {
  readonly renderer: WebGLRenderer;
  private readonly scene3 = new Scene();
  private readonly persp = new PerspectiveCamera(30, 1, 10, 1e7);
  private readonly ortho = new OrthographicCamera(-1, 1, 1, -1, -1e7, 1e7);
  private camera: PerspectiveCamera | OrthographicCamera = this.persp;
  private readonly controls: OrbitControls;
  private readonly entries: Entry[] = [];
  private readonly byNode = new Map<string, Entry[]>();
  private readonly byItem = new Map<string, Entry[]>();
  private readonly edgeCache = new Map<string, Float32Array>();
  private readonly overlay = new Group();
  private edges: LineSegments | null = null;
  private readonly markers = new Group();
  private readonly ghostMaterial = new MeshBasicMaterial({ color: 0xb0b6c0, transparent: true, opacity: 0.1, depthWrite: false });
  private readonly highlightCache = new Map<Material, Material>();
  private readonly materialCache = new Map<Material, Material>();
  private include: Set<string> | null = null;
  private hiddenCategories = new Set<string>();
  private ghosts = false;
  private hovered: string | null = null;
  private selected: string | null = null;
  private frameRequested = false;
  private bvhReady = false;
  private readonly raycaster = new Raycaster();
  private readonly pointer = new Vector2();
  private readonly resizeObserver: ResizeObserver;
  private pickHandler: ((p: PickInfo | null) => void) | null = null;
  private showMarkers = true;
  private disposed = false;

  constructor(
    private readonly container: HTMLElement,
    private readonly model: LoadedScene,
    isGlass: GlassTest,
  ) {
    this.renderer = new WebGLRenderer({ antialias: true, preserveDrawingBuffer: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.setClearColor(0xffffff, 1);
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.outline = 'none';

    // éclairage doux, sans ombres : rendu proche de SketchUp
    this.scene3.add(new HemisphereLight(0xffffff, 0xd8d8d8, 2.2));
    const sun = new DirectionalLight(0xffffff, 1.1);
    sun.position.set(0.6, 1, 0.35);
    this.scene3.add(sun);
    this.scene3.add(model.root);
    this.scene3.add(this.overlay);
    this.overlay.add(this.markers);

    this.raycaster.firstHitOnly = true;
    this.raycaster.params.Line = { threshold: 0 };

    model.root.traverse((o) => {
      // arêtes exportées par SketchUp (objets « ligne ») : le viewer dessine ses propres arêtes
      if ((o as LineSegments).isLineSegments || (o as { isLine?: boolean }).isLine) {
        o.visible = false;
        return;
      }
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      const nodeId = nodeIdOf(o) ?? '';
      const node = model.look.byId.get(nodeId);
      const display = Array.isArray(mesh.material)
        ? mesh.material.map((m) => this.displayMaterial(m, isGlass))
        : this.displayMaterial(mesh.material, isGlass);
      mesh.material = display;
      const e: Entry = {
        mesh,
        nodeId,
        itemId: model.look.itemOf(nodeId),
        category: model.look.categoryOf(nodeId),
        context: node?.role === 'context',
        display,
      };
      this.entries.push(e);
      for (const [map, key] of [
        [this.byNode, e.nodeId],
        [this.byItem, e.itemId],
      ] as const) {
        const l = map.get(key);
        if (l) l.push(e);
        else map.set(key, [e]);
      }
    });

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = false;
    this.controls.screenSpacePanning = true;
    this.controls.addEventListener('change', () => this.requestRender());

    const el = this.renderer.domElement;
    el.addEventListener('pointermove', this.onPointerMove);
    el.addEventListener('pointerleave', this.onPointerLeave);
    el.addEventListener('pointerdown', this.onPointerDown);
    el.addEventListener('pointerup', this.onPointerUp);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.applyVisibility();
    this.setView('iso-sw');
  }

  // ─── matériaux ───
  private displayMaterial(src: Material, isGlass: GlassTest): Material {
    const hit = this.materialCache.get(src);
    if (hit) return hit;
    const s = src as Material & { color?: Color; map?: Texture | null };
    const glass = isGlass(src);
    const m = new MeshLambertMaterial({
      name: src.name,
      color: s.color ? s.color.clone() : new Color(0xdddddd),
      map: s.map ?? null,
      side: DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    });
    if (glass) {
      m.transparent = true;
      m.depthWrite = false;
      if (src.transparent && src.opacity < 0.95) m.opacity = Math.max(0.15, src.opacity);
      else {
        m.color.setHex(GLASS_COLOR);
        m.opacity = GLASS_OPACITY;
        m.map = null;
      }
    } else if (src.transparent && src.opacity < 1) {
      m.transparent = true;
      m.opacity = src.opacity;
    }
    this.materialCache.set(src, m);
    return m;
  }

  private highlightMaterial(m: Material): Material {
    const hit = this.highlightCache.get(m);
    if (hit) return hit;
    const h = (m as MeshLambertMaterial).clone();
    h.emissive = new Color(0xe63946);
    h.emissiveIntensity = 0.35;
    this.highlightCache.set(m, h);
    return h;
  }

  // ─── visibilité ───
  /** `include` = nœuds visibles (Viewbox, accessoires…) ou null = tout ; catégories masquées ; voisins en fantôme. */
  setVisibility(include: string[] | null, hiddenCategories: string[] = [], ghosts = false): void {
    this.include = include ? new Set(include) : null;
    this.hiddenCategories = new Set(hiddenCategories);
    this.ghosts = ghosts;
    this.applyVisibility();
  }

  private isShown(e: Entry): 'shown' | 'ghost' | 'hidden' {
    if (e.context) return 'hidden';
    if (e.category && this.hiddenCategories.has(e.category)) return 'hidden';
    if (this.include && !this.model.look.inSet(e.nodeId, this.include)) return this.ghosts ? 'ghost' : 'hidden';
    return 'shown';
  }

  private applyVisibility(): void {
    for (const e of this.entries) {
      const s = this.isShown(e);
      e.mesh.visible = s !== 'hidden';
      e.mesh.material = s === 'ghost' ? this.ghostMaterial : this.currentMaterial(e);
      e.mesh.renderOrder = s === 'ghost' ? 1 : 0;
    }
    this.rebuildEdges();
    this.rebuildMarkers();
    this.requestRender();
  }

  private currentMaterial(e: Entry): Material | Material[] {
    const hl = this.hovered === e.itemId || this.selected === e.itemId;
    if (!hl) return e.display;
    return Array.isArray(e.display) ? e.display.map((m) => this.highlightMaterial(m)) : this.highlightMaterial(e.display);
  }

  shownEntries(): Entry[] {
    return this.entries.filter((e) => this.isShown(e) === 'shown');
  }

  /** Arêtes (vives à 30°) des objets affichés, en coordonnées monde, 6 nombres par segment. */
  private worldEdges(): Float32Array {
    const parts: Array<{ local: Float32Array; e: Entry }> = [];
    let total = 0;
    for (const e of this.shownEntries()) {
      const g = e.mesh.geometry as BufferGeometry;
      let local = this.edgeCache.get(g.uuid);
      if (!local) {
        local = new EdgesGeometry(g, EDGE_ANGLE).getAttribute('position').array as Float32Array;
        this.edgeCache.set(g.uuid, local);
      }
      parts.push({ local, e });
      total += local.length;
    }
    const out = new Float32Array(total);
    let o = 0;
    for (const { local, e } of parts) {
      e.mesh.updateWorldMatrix(true, false);
      const m = e.mesh.matrixWorld.elements;
      for (let i = 0; i < local.length; i += 3) {
        const x = local[i];
        const y = local[i + 1];
        const z = local[i + 2];
        out[o++] = m[0] * x + m[4] * y + m[8] * z + m[12];
        out[o++] = m[1] * x + m[5] * y + m[9] * z + m[13];
        out[o++] = m[2] * x + m[6] * y + m[10] * z + m[14];
      }
    }
    return out;
  }

  private rebuildEdges(): void {
    if (this.edges) {
      this.overlay.remove(this.edges);
      this.edges.geometry.dispose();
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(this.worldEdges(), 3));
    this.edges = new LineSegments(g, new LineBasicMaterial({ color: 0x1a1a1a }));
    this.edges.raycast = () => {};
    this.overlay.add(this.edges);
  }

  // ─── face avant des Viewbox ───
  setFrontMarkers(show: boolean): void {
    this.showMarkers = show;
    this.rebuildMarkers();
    this.requestRender();
  }

  refreshFrames(): void {
    this.rebuildMarkers();
    this.requestRender();
  }

  private rebuildMarkers(): void {
    for (const c of [...this.markers.children]) {
      this.markers.remove(c);
      (c as Mesh).geometry?.dispose();
    }
    if (!this.showMarkers) return;
    const mat = new MeshBasicMaterial({ color: 0xe63946, side: DoubleSide, transparent: true, opacity: 0.85, depthTest: false });
    for (const f of this.model.frames.values()) {
      const module = this.model.index.modules.find((m) => m.id === f.moduleId);
      if (!module || (this.include && !this.include.has(module.nodeId))) continue;
      const F = frontVector(f);
      const side: Vec3 = [-F[2], 0, F[0]];
      const cx = (f.min[0] + f.max[0]) / 2;
      const cy = (f.min[1] + f.max[1]) / 2;
      const centre = new Vector3(
        f.origin[0] + f.xAxis[0] * cx + f.yAxis[0] * cy,
        f.origin[1] + f.max[2] + 30,
        f.origin[2] + f.xAxis[2] * cx + f.yAxis[2] * cy,
      );
      const half = Math.abs((f.front[1] === 'x' ? f.max[0] - f.min[0] : f.max[1] - f.min[1]) / 2);
      const tip = centre.clone().addScaledVector(new Vector3(...F), half - 150);
      const base = tip.clone().addScaledVector(new Vector3(...F), -700);
      const a = base.clone().addScaledVector(new Vector3(...side), 350);
      const b = base.clone().addScaledVector(new Vector3(...side), -350);
      const g = new BufferGeometry();
      g.setAttribute('position', new Float32BufferAttribute([tip.x, tip.y, tip.z, a.x, a.y, a.z, b.x, b.y, b.z], 3));
      const tri = new Mesh(g, mat);
      tri.renderOrder = 10;
      tri.raycast = () => {};
      this.markers.add(tri);
    }
  }

  // ─── caméra ───
  setProjection(p: Projection): void {
    const from = this.camera;
    const to = p === 'perspective' ? this.persp : this.ortho;
    if (from === to) return;
    const target = this.controls.target.clone();
    const dir = from.position.clone().sub(target);
    const dist = dir.length();
    to.up.copy(from.up);
    if (to === this.ortho) {
      // même taille apparente à la distance de la cible
      const h = 2 * dist * Math.tan((this.persp.fov * Math.PI) / 360);
      this.ortho.zoom = 1;
      this.setOrthoFrustum(h);
      to.position.copy(target).add(dir);
    } else {
      const h = (this.ortho.top - this.ortho.bottom) / this.ortho.zoom;
      const d = h / (2 * Math.tan((this.persp.fov * Math.PI) / 360));
      to.position.copy(target).add(dir.normalize().multiplyScalar(d));
    }
    to.lookAt(target);
    this.camera = to;
    this.controls.object = to;
    this.controls.update();
    this.requestRender();
  }

  get projection(): Projection {
    return this.camera === this.persp ? 'perspective' : 'orthographic';
  }

  private setOrthoFrustum(height: number): void {
    const aspect = this.aspect();
    this.ortho.top = height / 2;
    this.ortho.bottom = -height / 2;
    this.ortho.left = (-height * aspect) / 2;
    this.ortho.right = (height * aspect) / 2;
    this.ortho.updateProjectionMatrix();
  }

  private aspect(): number {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    return w / h;
  }

  /** Boîte des objets affichés (monde). */
  shownBox(): Box3 {
    const box = new Box3();
    for (const e of this.shownEntries()) box.expandByObject(e.mesh);
    if (box.isEmpty()) box.setFromObject(this.model.root);
    return box;
  }

  /** Direction « vers l'observateur » et haut d'une vue standard (repère monde, ou de la Viewbox isolée). */
  private viewDirection(kind: StandardView, moduleId?: string): { toward: Vector3; up: Vector3 } {
    if (kind.startsWith('iso-')) {
      const sx = kind === 'iso-ne' || kind === 'iso-se' ? 1 : -1;
      const sz = kind === 'iso-se' || kind === 'iso-sw' ? 1 : -1; // SketchUp sud = three +Z
      return { toward: new Vector3(sx, Math.SQRT2 * Math.tan((35.264 * Math.PI) / 180), sz).normalize(), up: new Vector3(0, 1, 0) };
    }
    const frame = moduleId && this.model.frames.has(moduleId) ? { moduleId } : 'world';
    const b = viewBasis({ kind: kind as ViewKind, frame }, this.model.frames);
    return { toward: new Vector3(...b.toward), up: new Vector3(...b.up) };
  }

  /** Cadre la caméra sur les objets affichés, dans la direction d'une vue standard. */
  setView(kind: StandardView, moduleId?: string): void {
    const pose = this.poseFor(kind, moduleId, this.aspect(), 1.08);
    this.applyPose(pose, false);
  }

  /** Pose de caméra cadrant les objets affichés dans une direction donnée. */
  poseFor(kind: StandardView, moduleId: string | undefined, aspect: number, margin = 1.02, projection = this.projection): CameraPose {
    const { toward, up } = this.viewDirection(kind, moduleId);
    const box = this.shownBox();
    const center = box.getCenter(new Vector3());
    // étendue de la boîte dans le plan de la vue
    const right = new Vector3().crossVectors(up, toward).normalize();
    const trueUp = new Vector3().crossVectors(toward, right).normalize();
    let w = 0;
    let h = 0;
    let depth = 0;
    for (let k = 0; k < 8; k++) {
      const p = new Vector3(k & 1 ? box.max.x : box.min.x, k & 2 ? box.max.y : box.min.y, k & 4 ? box.max.z : box.min.z).sub(center);
      w = Math.max(w, Math.abs(p.dot(right)) * 2);
      h = Math.max(h, Math.abs(p.dot(trueUp)) * 2);
      depth = Math.max(depth, Math.abs(p.dot(toward)));
    }
    const viewH = Math.max(h, w / aspect) * margin;
    const fov = this.persp.fov;
    const dist = viewH / (2 * Math.tan((fov * Math.PI) / 360)) + depth;
    const position = center.clone().addScaledVector(toward, projection === 'perspective' ? dist : Math.max(dist, depth * 2 + 1000));
    return {
      projection,
      position: position.toArray() as Vec3,
      target: center.toArray() as Vec3,
      up: trueUp.toArray() as Vec3,
      fov,
      zoom: projection === 'orthographic' ? 1 : undefined,
      orthoHeight: projection === 'orthographic' ? viewH : undefined,
    };
  }

  getPose(): CameraPose {
    return {
      projection: this.projection,
      position: this.camera.position.toArray() as Vec3,
      target: this.controls.target.toArray() as Vec3,
      up: this.camera.up.toArray() as Vec3,
      fov: this.persp.fov,
      zoom: this.camera === this.ortho ? this.ortho.zoom : undefined,
      orthoHeight: this.camera === this.ortho ? this.ortho.top - this.ortho.bottom : undefined,
    };
  }

  applyPose(pose: CameraPose, keepOrthoHeight = true): void {
    const cam = pose.projection === 'perspective' ? this.persp : this.ortho;
    cam.up.set(...pose.up);
    cam.position.set(...pose.position);
    this.controls.target.set(...pose.target);
    if (cam === this.ortho) {
      const h = pose.orthoHeight;
      if (h) this.setOrthoFrustum(h);
      else if (!keepOrthoHeight) this.setOrthoFrustum(new Vector3(...pose.position).distanceTo(new Vector3(...pose.target)) * 0.5);
      this.ortho.zoom = pose.zoom ?? 1;
      this.ortho.updateProjectionMatrix();
    } else {
      if (pose.fov) this.persp.fov = pose.fov;
      this.persp.updateProjectionMatrix();
    }
    cam.lookAt(this.controls.target);
    this.camera = cam;
    this.controls.object = cam;
    this.controls.update();
    this.requestRender();
  }

  // ─── survol / clic ───
  onPick(handler: ((p: PickInfo | null) => void) | null): void {
    this.pickHandler = handler;
  }

  setSelected(itemId: string | null): void {
    const prev = this.selected;
    this.selected = itemId;
    this.refreshItems([prev, itemId]);
  }

  private refreshItems(ids: Array<string | null>): void {
    for (const id of ids) {
      if (!id) continue;
      for (const e of this.byItem.get(id) ?? []) if (this.isShown(e) === 'shown') e.mesh.material = this.currentMaterial(e);
    }
    this.requestRender();
  }

  private ensureBvh(): void {
    if (this.bvhReady) return;
    const done = new Set<string>();
    for (const e of this.entries) {
      const g = e.mesh.geometry as BufferGeometry & { boundsTree?: unknown; computeBoundsTree?: () => void };
      if (done.has(g.uuid) || g.boundsTree) continue;
      done.add(g.uuid);
      g.computeBoundsTree?.();
    }
    this.bvhReady = true;
  }

  private pick(ev: PointerEvent): PickInfo | null {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    this.ensureBvh();
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const targets = this.entries.filter((e) => this.isShown(e) === 'shown').map((e) => e.mesh as Object3D);
    const hit = this.raycaster.intersectObjects(targets, false)[0];
    if (!hit) return null;
    const nodeId = nodeIdOf(hit.object) ?? '';
    let normal: Vec3 | null = null;
    if (hit.face) {
      const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
      normal = n.toArray() as Vec3;
    }
    return { nodeId, itemId: this.model.look.itemOf(nodeId), point: hit.point.toArray() as Vec3, normal };
  }

  private hoverRaf = 0;
  private lastMove: PointerEvent | null = null;
  private downAt: { x: number; y: number } | null = null;

  private readonly onPointerMove = (ev: PointerEvent) => {
    if (ev.buttons) return;
    this.lastMove = ev;
    if (this.hoverRaf) return;
    this.hoverRaf = requestAnimationFrame(() => {
      this.hoverRaf = 0;
      if (!this.lastMove || this.disposed) return;
      const p = this.pick(this.lastMove);
      const id = p?.itemId ?? null;
      if (id !== this.hovered) {
        const prev = this.hovered;
        this.hovered = id;
        this.refreshItems([prev, id]);
        this.renderer.domElement.style.cursor = id ? 'pointer' : 'default';
      }
    });
  };

  private readonly onPointerLeave = () => {
    const prev = this.hovered;
    this.hovered = null;
    this.refreshItems([prev]);
  };

  private readonly onPointerDown = (ev: PointerEvent) => {
    this.downAt = { x: ev.clientX, y: ev.clientY };
  };

  private readonly onPointerUp = (ev: PointerEvent) => {
    const d = this.downAt;
    this.downAt = null;
    if (!d || Math.hypot(ev.clientX - d.x, ev.clientY - d.y) > 4 || ev.button !== 0) return; // glisser = orbite
    this.pickHandler?.(this.pick(ev));
  };

  // ─── rendu ───
  requestRender(): void {
    if (this.frameRequested || this.disposed) return;
    this.frameRequested = true;
    requestAnimationFrame(() => {
      this.frameRequested = false;
      if (this.disposed) return;
      this.renderer.render(this.scene3, this.camera);
    });
  }

  private resize(): void {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = w + 'px';
    this.renderer.domElement.style.height = h + 'px';
    this.persp.aspect = w / h;
    this.persp.updateProjectionMatrix();
    const oh = this.ortho.top - this.ortho.bottom;
    this.setOrthoFrustum(oh > 0 ? oh : 1000);
    this.requestRender();
  }

  maxCaptureSize(): number {
    const gl = this.renderer.getContext();
    return Math.min(this.renderer.capabilities.maxTextureSize, gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) as number);
  }

  /**
   * Capture hors écran de l'ensemble affiché uniquement (ni fantômes, ni marqueurs, ni contexte), fond blanc ou
   * transparent, arêtes noires épaisses (proportionnelles à la résolution), recadrage automatique + marge.
   */
  async capture(opts: CaptureOptions): Promise<CaptureResult> {
    const max = this.maxCaptureSize();
    const size = Math.min(opts.size, max);
    const pose = opts.pose ?? this.getPose();
    const aspect = this.aspect();
    const w = aspect >= 1 ? size : Math.round(size * aspect);
    const h = aspect >= 1 ? Math.round(size / aspect) : size;

    // caméra de capture (copie : la vue à l'écran ne bouge pas)
    const cam = pose.projection === 'perspective' ? this.persp.clone() : this.ortho.clone();
    cam.up.set(...pose.up);
    cam.position.set(...pose.position);
    cam.lookAt(new Vector3(...pose.target));
    if (cam instanceof PerspectiveCamera) {
      cam.aspect = w / h;
      if (pose.fov) cam.fov = pose.fov;
    } else {
      const oh = pose.orthoHeight ?? this.ortho.top - this.ortho.bottom;
      cam.top = oh / 2;
      cam.bottom = -oh / 2;
      cam.left = (-oh * (w / h)) / 2;
      cam.right = (oh * (w / h)) / 2;
      cam.zoom = pose.zoom ?? 1;
    }
    cam.updateProjectionMatrix();

    // arêtes épaisses pour la capture, fantômes et marqueurs retirés
    const fatGeom = new LineSegmentsGeometry();
    fatGeom.setPositions(this.worldEdges());
    const fatMat = new LineMaterial({ color: 0x111111, linewidth: Math.max(1, size / 1400), worldUnits: false });
    fatMat.resolution.set(w, h);
    const fat = new LineSegments2(fatGeom, fatMat);
    const hiddenGhosts: Mesh[] = [];
    for (const e of this.entries)
      if (e.mesh.visible && this.isShown(e) !== 'shown') {
        e.mesh.visible = false;
        hiddenGhosts.push(e.mesh);
      }
    const hl = [this.hovered, this.selected];
    this.hovered = null;
    this.selected = null;
    this.refreshItems(hl);
    this.edges!.visible = false;
    this.markers.visible = false;
    this.overlay.add(fat);

    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const samples = Math.min(8, (gl.getParameter(gl.MAX_SAMPLES) as number) || 0);
    const rt = new WebGLRenderTarget(w, h, { samples, colorSpace: SRGBColorSpace });
    const pixels = new Uint8Array(w * h * 4);
    const prevClear = this.renderer.getClearAlpha();
    try {
      this.renderer.setClearColor(0xffffff, 0);
      this.renderer.setRenderTarget(rt);
      this.renderer.clear();
      this.renderer.render(this.scene3, cam);
      this.renderer.readRenderTargetPixels(rt, 0, 0, w, h, pixels);
    } finally {
      this.renderer.setRenderTarget(null);
      this.renderer.setClearColor(0xffffff, prevClear);
      rt.dispose();
      this.overlay.remove(fat);
      fatGeom.dispose();
      fatMat.dispose();
      for (const m of hiddenGhosts) m.visible = true;
      this.edges!.visible = true;
      this.markers.visible = true;
      this.hovered = hl[0];
      this.selected = hl[1];
      this.refreshItems(hl);
    }

    // recadrage, marge, fond (pixels prémultipliés, origine en bas à gauche)
    const img = finishCapture(pixels, w, h, opts.marginPct, opts.background);
    if (!img) throw new Error('Capture vide : rien n’est affiché.');
    const out = document.createElement('canvas');
    out.width = img.width;
    out.height = img.height;
    out.getContext('2d')!.putImageData(new ImageData(img.data as Uint8ClampedArray<ArrayBuffer>, img.width, img.height), 0, 0);
    const blob = await new Promise<Blob>((resolve, reject) => out.toBlob((b) => (b ? resolve(b) : reject(new Error('Encodage PNG impossible'))), 'image/png'));
    return { blob, width: out.width, height: out.height, clamped: size < opts.size };
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.hoverRaf);
    this.resizeObserver.disconnect();
    const el = this.renderer.domElement;
    el.removeEventListener('pointermove', this.onPointerMove);
    el.removeEventListener('pointerleave', this.onPointerLeave);
    el.removeEventListener('pointerdown', this.onPointerDown);
    el.removeEventListener('pointerup', this.onPointerUp);
    this.controls.dispose();
    this.scene3.remove(this.model.root);
    this.edges?.geometry.dispose();
    this.renderer.dispose();
    el.remove();
  }
}
