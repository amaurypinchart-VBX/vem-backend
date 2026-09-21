"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.saveProjectFilePdf = saveProjectFilePdf;
// src/utils/saveProjectFile.ts
// Archive automatiquement un PDF généré (daily report, handover, visite,
// rapport projet...) dans les fichiers du projet, en plus du téléchargement/
// envoi habituel — pour garder une trace de ce qui a été généré et quand.
// Volontairement best-effort : un échec ici ne doit jamais faire échouer le
// téléchargement/envoi du PDF lui-même.
const database_1 = require("../config/database");
const cloudinaryService_1 = require("../services/cloudinaryService");
const logger_1 = require("./logger");
async function saveProjectFilePdf(projectId, buffer, fileName, category, uploadedBy) {
    try {
        const { url, publicId } = await (0, cloudinaryService_1.uploadToCloudinary)(buffer, 'projects', { resource_type: 'auto' });
        await database_1.prisma.projectFile.create({
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
    }
    catch (e) {
        logger_1.logger.warn(`[saveProjectFilePdf] échec archivage "${fileName}" (projet ${projectId}) : ${e.message || e}`);
    }
}
//# sourceMappingURL=saveProjectFile.js.map