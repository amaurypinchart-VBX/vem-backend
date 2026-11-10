// src/services/cloudinaryService.ts
// Import compatible toutes versions de cloudinary (v1 et v2) — certains setups
// TypeScript voient `v2` comme non exporté ; le require fonctionne à coup sûr.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const cloudinary: any = require('cloudinary').v2;
import crypto from 'crypto';
import multer from 'multer';
import { prisma } from '../config/database';
import { AppError } from '../utils/AppError';
import { logger } from '../utils/logger';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const db = prisma as any; // modèle SplitFile ajouté au schéma ; client typé régénéré au build Docker

const MB = 1024 * 1024;
/** Plus gros fichier image / raw que l'offre Cloudinary accepte : 10 Mo en gratuit (20 Mo en Plus → CLOUDINARY_MAX_FILE_MB=20). */
export const CLOUDINARY_MAX_BYTES = Math.round((Number(process.env.CLOUDINARY_MAX_FILE_MB) || 10) * MB);
/** Taille maximale d'un fichier ajouté à VEM : au-dessus de la limite Cloudinary, il est rangé en morceaux. */
export const FILE_MAX_BYTES = Math.max(20 * MB, CLOUDINARY_MAX_BYTES);
/** Taille d'un morceau (sous la limite Cloudinary, comme les paquets 3D de Plans). */
const PART_BYTES = 9 * MB;
/** publicId d'un fichier en morceaux : « split:<id> » (deleteFromCloudinary supprime alors tous ses morceaux). */
const SPLIT_PREFIX = 'split:';

// Use memory storage — we'll upload buffer to Cloudinary manually
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB (les modèles 3D peuvent être lourds)
  fileFilter: (_req, file, cb) => {
    // Liste blanche par mime-type
    const allowedMimes = [
      'image/jpeg','image/png','image/webp','image/gif','image/heic','image/bmp','image/svg+xml',
      'application/pdf',
      'video/mp4','video/webm','video/quicktime',
      // Documents Office
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      // Audio (pour la transcription Whisper des dictées vocales importées)
      'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/m4a', 'audio/x-m4a',
      'audio/wav', 'audio/wave', 'audio/x-wav', 'audio/ogg', 'audio/webm',
      'audio/aac', 'audio/flac',
      // Modèles 3D — Cloudinary stocke en raw, donc les mime peuvent être génériques
      'model/gltf-binary', 'model/gltf+json', 'model/obj', 'model/stl', 'model/vnd.usdz+zip',
      'application/octet-stream', // fallback fréquent pour les .glb / .skp / .fbx / etc.
      'application/zip',          // .usdz est un zip déguisé
      'text/plain',               // .obj est parfois servi en text/plain
    ];
    // En complément, on accepte les extensions 3D même si le mime est tordu
    const ext = (file.originalname || '').split('.').pop()?.toLowerCase();
    const allowedExts = ['glb','gltf','usdz','skp','obj','stl','fbx','dae','3ds','blend','zip','mp3','m4a','wav','ogg','webm','aac','flac'];
    const ok = allowedMimes.includes(file.mimetype) || allowedExts.includes(ext);
    cb(null, ok);
  },
});

/** Nom et type du fichier envoyé : servent au fichier en morceaux (nom au bout de l'URL, Content-Type). */
export interface UploadFileInfo { name?: string | null; mime?: string | null }

/**
 * Range un fichier sur Cloudinary → { url, publicId }.
 * Au-dessus de la limite de l'offre Cloudinary (10 Mo), le fichier est rangé en morceaux et l'URL rendue est celle de
 * VEM (/api/v1/public/files/…), qui les recolle ; jusqu'à FILE_MAX_BYTES (20 Mo), au-delà 413. Les vidéos tentent
 * d'abord Cloudinary (100 Mo en vidéo sur l'offre gratuite).
 */
export async function uploadToCloudinary(
  buffer: Buffer,
  folder: string,
  options: Record<string, any> = {},
  file: UploadFileInfo = {},
): Promise<{ url: string; publicId: string }> {
  const rt = options.resource_type;
  const video = (!rt || rt === 'auto' || rt === 'video') && looksLikeVideo(buffer, file.mime);
  if (buffer.length <= CLOUDINARY_MAX_BYTES || video) {
    try {
      return await cloudinaryUpload(buffer, folder, options);
    } catch (err) {
      if (!isTooLarge(err)) throw err;
    }
  }
  return storeSplitFile(buffer, folder, options, file);
}

function cloudinaryUpload(buffer: Buffer, folder: string, options: Record<string, any>): Promise<{ url: string; publicId: string }> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: `vem/${folder}`, resource_type: 'auto', ...options },
      (err: any, result: any) => {
        if (err || !result) return reject(err || new Error('Upload failed'));
        resolve({ url: result.secure_url, publicId: result.public_id });
      }
    );
    stream.end(buffer);
  });
}

/** Refus de Cloudinary pour taille : « File size too large. Got 12345678. Maximum is 10485760. » */
function isTooLarge(err: any): boolean {
  return /file size too large/i.test(String(err?.message || err?.error?.message || ''));
}

export async function deleteFromCloudinary(publicId: string, resourceType?: 'image' | 'video' | 'raw'): Promise<void> {
  if (publicId?.startsWith(SPLIT_PREFIX)) return deleteSplitFile(publicId.slice(SPLIT_PREFIX.length));
  try {
    await cloudinary.uploader.destroy(publicId, resourceType ? { resource_type: resourceType } : undefined);
  } catch (err) {
    logger.warn(`Cloudinary delete failed for ${publicId}`);
  }
}

// ─── Fichiers en morceaux (au-dessus de la limite Cloudinary) ───

export interface SplitPart { url: string; publicId: string; size: number }

/** Origine « https://hôte » d'une valeur de configuration (https:// ajouté s'il manque, chemin retiré), sinon null. */
function originOf(value: string | undefined | null): string | null {
  const s = String(value || '').trim();
  if (!s) return null;
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`);
    return /^https?:$/.test(u.protocol) && u.hostname ? u.origin : null;
  } catch {
    return null;
  }
}

/**
 * Adresse publique de VEM pour les liens des fichiers en morceaux (ouverts par le navigateur, relus par le serveur,
 * mis dans les e-mails). Origine seule : un APP_URL sans « https:// » ou avec un chemin donnait un lien que le
 * navigateur lisait comme une page de VEM (bug du 10.11.2026). Le domaine Railway passe avant APP_URL : il désigne
 * toujours ce serveur.
 */
export function publicBaseUrl(): string {
  return originOf(process.env.RAILWAY_PUBLIC_DOMAIN) || originOf(process.env.APP_URL) || 'https://viewboxsitemanagement.up.railway.app';
}

/** URL d'un fichier en morceaux : le nom (avec son extension) au bout, l'app reconnaît le type par l'extension. */
export function splitFileUrl(id: string, fileName: string): string {
  return `${publicBaseUrl()}${SPLIT_PATH}${id}/${encodeURIComponent(fileName)}`;
}

/** Début du chemin des fichiers en morceaux (routes/publicFiles.ts). */
export const SPLIT_PATH = '/api/v1/public/files/';

async function storeSplitFile(buffer: Buffer, folder: string, options: Record<string, any>, file: UploadFileInfo) {
  if (buffer.length > FILE_MAX_BYTES) {
    throw new AppError(`Fichier de ${(buffer.length / MB).toFixed(1).replace('.', ',')} Mo : ${Math.round(FILE_MAX_BYTES / MB)} Mo maximum.`, 413);
  }
  const fileName = splitFileName(buffer, file.name, options.public_id);
  const mimeType = (file.mime && file.mime !== 'application/octet-stream' ? file.mime : mimeFromName(fileName)).slice(0, 120);
  const id = crypto.randomBytes(18).toString('base64url');
  const chunks: Buffer[] = [];
  for (let at = 0; at < buffer.length; at += PART_BYTES) chunks.push(buffer.subarray(at, Math.min(at + PART_BYTES, buffer.length)));
  const settled = await Promise.allSettled(chunks.map((c) => cloudinaryUpload(c, `${folder}/parts`, { resource_type: 'raw' })));
  const failed = settled.find((s) => s.status === 'rejected') as PromiseRejectedResult | undefined;
  if (failed) {
    for (const s of settled) if (s.status === 'fulfilled') await deleteFromCloudinary(s.value.publicId, 'raw');
    throw failed.reason;
  }
  const parts: SplitPart[] = settled.map((s, i) => ({ ...(s as PromiseFulfilledResult<{ url: string; publicId: string }>).value, size: chunks[i].length }));
  try {
    await db.splitFile.create({ data: { id, fileName, mimeType, size: buffer.length, parts } });
  } catch (err) {
    for (const p of parts) await deleteFromCloudinary(p.publicId, 'raw');
    throw err;
  }
  logger.info(`[fichiers] « ${fileName} » (${(buffer.length / MB).toFixed(1)} Mo) rangé en ${parts.length} morceaux`);
  return { url: splitFileUrl(id, fileName), publicId: SPLIT_PREFIX + id };
}

async function deleteSplitFile(id: string): Promise<void> {
  try {
    const row = await db.splitFile.findUnique({ where: { id } });
    if (!row) return;
    for (const p of (Array.isArray(row.parts) ? row.parts : []) as SplitPart[]) {
      try { await cloudinary.uploader.destroy(p.publicId, { resource_type: 'raw' }); } catch { logger.warn(`Cloudinary delete failed for ${p.publicId}`); }
    }
    await db.splitFile.delete({ where: { id } });
  } catch (err: any) {
    logger.warn(`[fichiers] suppression du fichier en morceaux ${id} : ${err?.message || err}`);
  }
}

/** Nom du fichier (sans chemin, avec une extension : l'app reconnaît le type par l'extension de l'URL). */
function splitFileName(buffer: Buffer, name?: string | null, publicId?: unknown): string {
  let n = String(name || (typeof publicId === 'string' ? publicId : '') || '').split(/[\\/]/).pop()!.trim();
  n = n.replace(/[\u0000-\u001f\u007f]/g, '').slice(-150);
  if (!/\.[A-Za-z0-9]{1,8}$/.test(n)) n = `${n || 'fichier'}.${sniffExt(buffer)}`;
  return n;
}

function sniffExt(b: Buffer): string {
  const head = b.subarray(0, 12).toString('latin1');
  if (head.startsWith('%PDF')) return 'pdf';
  if (head.startsWith('\x89PNG')) return 'png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (head.startsWith('glTF')) return 'glb';
  if (head.startsWith('PK')) return 'zip';
  if (head.slice(4, 8) === 'ftyp') return /^(hei|mif|msf)/.test(head.slice(8, 11)) ? 'heic' : 'mp4';
  return 'bin';
}

/** Vidéo d'après le type annoncé, sinon d'après le début du fichier (MP4 / MOV / WebM ; pas les HEIC, aussi en « ftyp »). */
function looksLikeVideo(b: Buffer, mime?: string | null): boolean {
  if (mime && mime !== 'application/octet-stream') return mime.toLowerCase().startsWith('video/');
  const head = b.subarray(0, 12).toString('latin1');
  if (head.slice(4, 8) === 'ftyp') return !/^(hei|hev|mif|msf|avi|M4A)/.test(head.slice(8, 12));
  return b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3;
}

const MIME_BY_EXT: Record<string, string> = {
  pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif',
  bmp: 'image/bmp', heic: 'image/heic', svg: 'image/svg+xml',
  mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm',
  mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', ogg: 'audio/ogg', aac: 'audio/aac', flac: 'audio/flac',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  zip: 'application/zip', glb: 'model/gltf-binary', gltf: 'model/gltf+json', txt: 'text/plain', csv: 'text/csv',
};

export function mimeFromName(name: string): string {
  return MIME_BY_EXT[(name.split('.').pop() || '').toLowerCase()] || 'application/octet-stream';
}
