// Accès à l'API VEM (même origine). Le jeton vient de l'URL (?token=, ouverture depuis VEM) ou de la
// session VEM déjà ouverte dans le navigateur ; il est retiré de la barre d'adresse après lecture.
import type { LibraryPayload, ServerLibraryRow } from '../structure/core/libraryStore';
import type { ExtractResult, GroupProposal, IdentifySuggestion } from '../structure/core/ai';
import type { MaterialSearchResult } from '../structure/core/composite';
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
  /** accès aux outils Plans 2D (activé dans VEM › Équipe › fiche du membre) — renvoyé par /auth/me */
  plansAccess?: boolean;
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
  team?: Array<{ role?: string; isLead?: boolean; user?: VemUser }>;
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

/** Capture haute définition de la vue 3D, enregistrée (image Cloudinary) : proposée pour les images 3D des planches. */
export interface SavedCapture {
  id: string;
  url: string;
  name: string;
  width: number;
  height: number;
  createdAt: string;
}

/** Réglages d'un modèle, conservés d'une version à la suivante. */
export interface ModelSettings {
  /** face avant de chaque Viewbox (repère local SketchUp), quand elle n'est pas celle par défaut */
  fronts?: Record<string, FrontSide>;
  cameras?: SavedCamera[];
  /** captures de la vue 3D, la plus récente en premier */
  captures?: SavedCapture[];
}

/** Modification des réglages : clés remplacées, ou fonction des réglages à jour (listes modifiées en parallèle). */
export type SettingsUpdate = ModelSettings | ((current: ModelSettings) => ModelSettings);

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
/** Étude structure d'une version de modèle (table struct_studies). */
export interface StudyRecord {
  id: string;
  projectId: string;
  modelVersionId: string | null;
  name: string;
  settings: Record<string, unknown>;
  assignments: Record<string, unknown>;
  resultsSummary: Record<string, unknown>;
  status: string;
  stale: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Rapport PDF d'une étude structure enregistré dans le projet (table struct_reports). */
export interface StructReportRecord {
  id: string;
  studyId: string;
  lang: string;
  variant: string;
  verdict: string | null;
  pages: number | null;
  fileName: string;
  url: string;
  sizeBytes: number | null;
  createdBy: string | null;
  createdAt: string;
}

/** Jetons et coût estimé d'un appel à l'IA (journal struct_ai_calls). */
export interface AiUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number | null;
  durationMs: number;
}
export interface AiTexts {
  description: string;
  instructions: string[];
  conclusion: string;
}
export interface AiAlert {
  severity: 'info' | 'warning' | 'error';
  message: string;
  elements: string[];
}

/** Message de la conversation avec le conseil ingénieur (format de l'API Claude : texte, outils, réflexion). */
export interface AdvisorMessage {
  role: 'user' | 'assistant';
  content: Array<Record<string, unknown> & { type: string }>;
}
export interface AdvisorTurn {
  append: AdvisorMessage[];
  stopReason: string;
  /** nombres de la réponse finale qui ne viennent d'aucun outil (après une relance) */
  unverified: number[];
  usage: AiUsage;
}
export interface AdvisorThread {
  studyId: string;
  messages: AdvisorMessage[];
  variants: unknown[];
}

/** Stock de matériel de calage de l'entrepôt (étude structure) : plaques, plaques de répartition du commerce. */
export const STRUCTURE_STOCK_KEY = 'plans.structure.stock';

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
  structureLibrary: () => api<ServerLibraryRow[]>('GET', '/structure/library'),
  saveLibraryEntry: (p: LibraryPayload) => api<ServerLibraryRow>('POST', '/structure/library', p),
  deleteLibraryEntry: (id: string) => api<null>('DELETE', `/structure/library/${id}`),
  importLibrary: (entries: LibraryPayload[]) => api<{ imported: number }>('POST', '/structure/library/import', { entries }),
  listStudies: (projectId: string) => api<StudyRecord[]>('GET', `/structure/project/${projectId}/studies`),
  createStudy: (projectId: string, body: Partial<Pick<StudyRecord, 'modelVersionId' | 'name' | 'settings' | 'assignments'>>) =>
    api<StudyRecord>('POST', `/structure/project/${projectId}/studies`, body),
  saveStudy: (id: string, body: Partial<Pick<StudyRecord, 'name' | 'settings' | 'assignments' | 'resultsSummary' | 'status' | 'stale'>>) =>
    api<StudyRecord>('PUT', `/structure/studies/${id}`, body),
  listReports: (studyId: string) => api<StructReportRecord[]>('GET', `/structure/studies/${studyId}/reports`),
  uploadReport: (studyId: string, pdf: Blob, meta: { fileName: string; lang: string; variant: string; verdict: string; pages: number }) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(meta)) fd.append(k, String(v));
    fd.append('file', pdf, meta.fileName);
    return api<StructReportRecord>('POST', `/structure/studies/${studyId}/reports`, fd);
  },
  deleteReport: (id: string) => api<null>('DELETE', `/structure/reports/${id}`),
  aiStatus: () => api<{ enabled: boolean; model: string }>('GET', '/structure/ai/status'),
  aiIdentify: (body: unknown) => api<{ suggestion: IdentifySuggestion; usage: AiUsage }>('POST', '/structure/ai/identify', body),
  aiGroup: (body: unknown) => api<{ groups: GroupProposal[]; usage: AiUsage }>('POST', '/structure/ai/group', body),
  aiExtract: (pdf: File, reportRef: string, hint: string) => {
    const fd = new FormData();
    fd.append('reportRef', reportRef);
    if (hint) fd.append('hint', hint);
    fd.append('file', pdf, pdf.name);
    return api<ExtractResult & { usage: AiUsage }>('POST', '/structure/ai/extract-reference', fd);
  },
  aiWrite: (body: unknown) => api<{ texts: AiTexts; attempts: number; usage: AiUsage }>('POST', '/structure/ai/write', body),
  aiReview: (body: unknown) => api<{ alerts: AiAlert[]; dropped: number; usage: AiUsage }>('POST', '/structure/ai/review', body),
  aiMaterial: (body: unknown) => api<MaterialSearchResult & { usage: AiUsage }>('POST', '/structure/ai/material-search', body),
  aiCalls: () => api<{ days: number; count: number; costUsd: number }>('GET', '/structure/ai/calls'),
  aiAdvisor: (messages: AdvisorMessage[], studyId: string | null) => api<AdvisorTurn>('POST', '/structure/ai/advisor', { messages, studyId }),
  advisorThread: (studyId: string) => api<AdvisorThread>('GET', `/structure/studies/${studyId}/advisor`),
  saveAdvisorThread: (studyId: string, body: { messages: AdvisorMessage[]; variants: unknown[] }) => api<{ updatedAt: string }>('PUT', `/structure/studies/${studyId}/advisor`, body),
  getSetting: <T>(key: string) => api<T | null>('GET', `/settings/${key}`),
  saveSetting: <T>(key: string, value: T) => api<T>('PUT', `/settings/${key}`, { value }),
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
