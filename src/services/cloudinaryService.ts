// src/services/cloudinaryService.ts
// Import compatible toutes versions de cloudinary (v1 et v2) — certains setups
// TypeScript voient `v2` comme non exporté ; le require fonctionne à coup sûr.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const cloudinary: any = require('cloudinary').v2;
import multer from 'multer';
import { logger } from '../utils/logger';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

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
      // Modèles 3D — Cloudinary stocke en raw, donc les mime peuvent être génériques
      'model/gltf-binary', 'model/gltf+json', 'model/obj', 'model/stl', 'model/vnd.usdz+zip',
      'application/octet-stream', // fallback fréquent pour les .glb / .skp / .fbx / etc.
      'application/zip',          // .usdz est un zip déguisé
      'text/plain',               // .obj est parfois servi en text/plain
    ];
    // En complément, on accepte les extensions 3D même si le mime est tordu
    const ext = (file.originalname || '').split('.').pop()?.toLowerCase();
    const allowedExts = ['glb','gltf','usdz','skp','obj','stl','fbx','dae','3ds','blend'];
    const ok = allowedMimes.includes(file.mimetype) || allowedExts.includes(ext);
    cb(null, ok);
  },
});

export async function uploadToCloudinary(
  buffer: Buffer,
  folder: string,
  options: Record<string, any> = {}
): Promise<{ url: string; publicId: string }> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: `vem/${folder}`, resource_type: 'auto', ...options },
      (err, result) => {
        if (err || !result) return reject(err || new Error('Upload failed'));
        resolve({ url: result.secure_url, publicId: result.public_id });
      }
    );
    stream.end(buffer);
  });
}

export async function deleteFromCloudinary(publicId: string): Promise<void> {
  try {
    await cloudinary.uploader.destroy(publicId);
  } catch (err) {
    logger.warn(`Cloudinary delete failed for ${publicId}`);
  }
}