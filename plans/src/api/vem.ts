// Accès à l'API VEM (même origine). Le jeton vient de l'URL (?token=, ouverture depuis VEM) ou de la
// session VEM déjà ouverte dans le navigateur ; il est retiré de la barre d'adresse après lecture.
import type { SceneIndex, Warning, IngestStats, ClassificationRules } from '../core/types';
import type { FrontSide, Vec3 } from '../core/views';

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

export interface Project {
  id: string;
  name: string;
  internalNumber?: string;
  client?: { name?: string } | null;
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
  deleteModel: (id: string) => api<void>('DELETE', `/plans/models/${id}`),
  saveSettings: (id: string, settings: ModelSettings) =>
    api<{ id: string; settings: ModelSettings }>('PATCH', `/plans/models/${id}/settings`, { settings }),
  getRules: () => api<Partial<ClassificationRules> | null>('GET', `/settings/${RULES_SETTING_KEY}`),
  saveRules: (value: ClassificationRules) => api<ClassificationRules>('PUT', `/settings/${RULES_SETTING_KEY}`, { value }),
};

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
