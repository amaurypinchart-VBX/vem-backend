// src/utils/saveProjectFile.ts
// Archive automatiquement un PDF généré (daily report, handover, visite,
// rapport projet...) dans les fichiers du projet, en plus du téléchargement/
// envoi habituel — pour garder une trace de ce qui a été généré et quand.
// Volontairement best-effort : un échec ici ne doit jamais faire échouer le
// téléchargement/envoi du PDF lui-même.
import { prisma } from '../config/database';
import { uploadToCloudinary } from '../services/cloudinaryService';
import { logger } from './logger';

export async function saveProjectFilePdf(
  projectId: string,
  buffer: Buffer,
  fileName: string,
  category: string,
  uploadedBy?: string | null
): Promise<void> {
  try {
    const { url, publicId } = await uploadToCloudinary(buffer, 'projects', { resource_type: 'auto' });
    await prisma.projectFile.create({
      data: {
        projectId,
        uploadedBy: uploadedBy || null,
        fileName,
        fileUrl: url,
        publicId,
        fileType: 'application/pdf',
        fileSize: buffer.length,
        category,
      },
    });
  } catch (e: any) {
    logger.warn(`[saveProjectFilePdf] échec archivage "${fileName}" (projet ${projectId}) : ${e.message || e}`);
  }
}
