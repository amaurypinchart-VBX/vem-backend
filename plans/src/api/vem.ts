// Accès à l'API VEM (même origine). Le jeton vient de l'URL (?token=, ouverture depuis VEM) ou de la
// session VEM déjà ouverte dans le navigateur ; il est retiré de la barre d'adresse après lecture.
import type { SceneIndex, Warning, IngestStats, ClassificationRules } from '../core/types';
import type { FrontSide, Vec3 } from '../core/views';
import { unpackPackage } from '../ingest/package';

const params = new URLSearchParams(window.location.search);
export const PROJECT_ID = params.get('projectId') ?? '';

function readToken(): string {
  const fromUrl = params.get('token');
  if (fromUrl) {
    try {
      sessionStorage.setItem('vem_plans_token', fromUrl);
    } catch {
      /* stockage indisponible : le jeton reste en mémoire */
    }
    params.delete('token');
    const q = params.toString();
    window.history.replaceState(null, '', window.location.pathname + (q ? '?' + q : '') + window.location.hash);
    return fromUrl;
  }
  try {
    return sessionStorage.getItem('vem_plans_token') || localStorage.getItem('vem_token') || sessionStorage.getItem('vem_token') || '';
  } catch {
    return '';
  }
}
export const TOKEN = readToken();

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const isForm = body instanceof FormData;
  const r = await fetch('/api/v1' + path, {
    method,
    headers: { Authorization: 'Bearer ' + TOKEN, ...(body !== undefined && !isForm ? { 'Content-Type': 'application/json' } : {}) },
    body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
  });
  const json = (await r.json().catch(() => null)) as { success?: boolean; data?: T; error?: string } | null;
  if (!r.ok || !json || json.success === false) {
    const msg = json?.error || `Erreur HTTP ${r.status}`;
    throw new ApiError(r.status === 401 ? 'Session expirée : reconnecte-toi dans VEM puis rouvre cet outil.' : msg, r.status);
  }
  return json.data as T;
}

export interface VemUser {
  id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  role?: string;
}

export interface Project {
  id: string;
  name: string;
  internalNumber?: string;
  address?: string;
  city?: string | null;
  installationStart?: string;
  client?: { name?: string } | null;
  technicalManager?: VemUser | null;
  team?: Array<{ role?: string; user?: VemUser }>;
}

/** Jeu de plans tel que stocké par le serveur (`data` = DrawingSet sans id/projectId). */
export interface DrawingSetRecord {
  id: string;
  projectId: string;
  modelVersionId: string | null;
  title: string;
  revision: number;
  data?: unknown;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectFile {
  id: string;
  fileName: string;
  fileUrl: string;
  fileSize?: number | null;
  category?: string;
  createdAt?: string;
}

/** Caméra enregistrée (« 3D entrée », « 3D client »…) pour les captures. */
export interface SavedCamera {
  name: string;
  projection: 'perspective' | 'orthographic';
  position: Vec3;
  target: Vec3;
  up: Vec3;
  fov?: number;
  zoom?: number;
  orthoHeight?: number;
}

/** Réglages d'un modèle, conservés d'une version à la suivante. */
export interface ModelSettings {
  /** face avant de chaque Viewbox (repère local SketchUp), quand elle n'est pas celle par défaut */
  fronts?: Record<string, FrontSide>;
  cameras?: SavedCamera[];
}

export interface ModelVersion {
  id: string;
  projectId: string;
  sourceFileId: string | null;
  fileName: string;
  sha256: string;
  sizeBytes: number | null;
  status: 'indexed' | 'packaged';
  engineVersion: string | null;
  unitMeter: number | null;
  upAxis: string | null;
  stats: Partial<IngestStats>;
  warnings: Warning[];
  glbUrl: string | null;
  glbSize: number | null;
  /** paquet compressé découpé en morceaux (Cloudinary : 10 Mo maximum par fichier) */
  glbParts?: Array<{ url: string; size: number }> | null;
  glbEncoding?: string | null;
  settings?: ModelSettings;
  createdAt: string;
  updatedAt: string;
  sceneIndex?: SceneIndex;
}

export const RULES_SETTING_KEY = 'plans.classificationRules';

export const vem = {
  project: (id: string) => api<Project>('GET', `/projects/${id}`),
  projectFiles: (id: string) => api<ProjectFile[]>('GET', `/projects/${id}/files`),
  listModels: (projectId: string) => api<ModelVersion[]>('GET', `/plans/project/${projectId}/models`),
  getModel: (id: string) => api<ModelVersion>('GET', `/plans/models/${id}`),
  saveModel: (projectId: string, body: Record<string, unknown>) => api<ModelVersion>('POST', `/plans/project/${projectId}/models`, body),
  uploadPackage: (id: string, glb: ArrayBuffer) => {
    const fd = new FormData();
    fd.append('file', new Blob([glb], { type: 'model/gltf-binary' }), 'package.glb');
    return api<ModelVersion>('POST', `/plans/models/${id}/package`, fd);
  },
  uploadPackagePart: (id: string, part: Uint8Array, index: number, count: number, encoding: string, totalSize: number) => {
    const fd = new FormData();
    fd.append('index', String(index));
    fd.append('count', String(count));
    fd.append('encoding', encoding);
    fd.append('totalSize', String(totalSize));
    fd.append('file', new Blob([part as Uint8Array<ArrayBuffer>], { type: 'application/octet-stream' }), `package.glb.gz.${index}`);
    return api<ModelVersion>('POST', `/plans/models/${id}/package/part`, fd);
  },
  deleteModel: (id: string) => api<void>('DELETE', `/plans/models/${id}`),
  saveSettings: (id: string, settings: ModelSettings) =>
    api<{ id: string; settings: ModelSettings }>('PATCH', `/plans/models/${id}/settings`, { settings }),
  me: () => api<VemUser>('GET', '/auth/me'),
  listDrawingSets: (projectId: string) => api<DrawingSetRecord[]>('GET', `/plans/project/${projectId}/drawing-sets`),
  getDrawingSet: (id: string) => api<DrawingSetRecord>('GET', `/plans/drawing-sets/${id}`),
  createDrawingSet: (projectId: string, body: { title: string; modelVersionId?: string | null; data: unknown }) =>
    api<DrawingSetRecord>('POST', `/plans/project/${projectId}/drawing-sets`, body),
  saveDrawingSet: (id: string, body: { title?: string; data?: unknown; modelVersionId?: string | null; revision?: number }) =>
    api<DrawingSetRecord>('PUT', `/plans/drawing-sets/${id}`, body),
  deleteDrawingSet: (id: string) => api<void>('DELETE', `/plans/drawing-sets/${id}`),
  uploadAsset: (projectId: string, png: Blob, name: string) => {
    const fd = new FormData();
    fd.append('file', png, name);
    return api<{ url: string; publicId: string }>('POST', `/plans/project/${projectId}/assets`, fd);
  },
  getRules: () => api<Partial<ClassificationRules> | null>('GET', `/settings/${RULES_SETTING_KEY}`),
  saveRules: (value: ClassificationRules) => api<ClassificationRules>('PUT', `/settings/${RULES_SETTING_KEY}`, { value }),
};

/** Télécharge le paquet 3D d'un modèle (morceaux compressés, ou ancien fichier unique) : GLB prêt à lire. */
export async function downloadPackage(m: ModelVersion, onProgress?: (fraction: number) => void, signal?: AbortSignal): Promise<ArrayBuffer> {
  const parts = m.glbParts?.length ? m.glbParts : m.glbUrl ? [{ url: m.glbUrl, size: m.glbSize ?? 0 }] : [];
  if (!parts.length) throw new Error('Paquet 3D absent : réanalyse le fichier.');
  const total = parts.reduce((a, p) => a + (p.size || 0), 0) || 1;
  const buffers: ArrayBuffer[] = [];
  let done = 0;
  for (const p of parts) {
    buffers.push(await downloadWithProgress(p.url, (f) => onProgress?.(Math.min(1, (done + f * (p.size || 0)) / total)), signal));
    done += p.size || 0;
  }
  return unpackPackage(buffers, m.glbParts?.length ? m.glbEncoding : null);
}

/** Téléchargement d'un fichier (Cloudinary, public) avec progression. */
export async function downloadWithProgress(url: string, onProgress?: (fraction: number) => void, signal?: AbortSignal): Promise<ArrayBuffer> {
  const r = await fetch(url, { signal });
  if (!r.ok || !r.body) throw new Error(`Téléchargement impossible (HTTP ${r.status})`);
  const total = Number(r.headers.get('content-length')) || 0;
  const reader = r.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    if (total) onProgress?.(received / total);
  }
  const out = new Uint8Array(received);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out.buffer;
}
