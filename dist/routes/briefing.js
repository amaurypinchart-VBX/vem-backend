"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const database_1 = require("../config/database");
const briefingAI_1 = require("../services/briefingAI");
const router = (0, express_1.Router)();
// ═══════════════════════════════════════════════════════════
// LISTE des briefings d'un projet
// GET /api/v1/briefings/project/:projectId
// ═══════════════════════════════════════════════════════════
router.get('/project/:projectId', async (req, res) => {
    try {
        const { projectId } = req.params;
        const briefings = await database_1.prisma.briefing.findMany({
            where: { projectId },
            orderBy: { updatedAt: 'desc' },
            select: {
                id: true,
                projectId: true,
                title: true,
                studioSlides: true,
                slides: true,
                createdAt: true,
                updatedAt: true,
            },
        });
        // On retourne des méta-données allégées pour la liste
        // (les slides complètes sont chargées à l'ouverture)
        const list = briefings.map(b => {
            const hasStudio = b.studioSlides && b.studioSlides.slides?.length > 0;
            const nbSlides = hasStudio
                ? b.studioSlides.slides.length
                : (Array.isArray(b.slides) ? b.slides.length : 0);
            return {
                id: b.id,
                projectId: b.projectId,
                title: b.title || 'Briefing sans titre',
                mode: hasStudio ? 'studio' : 'classic',
                nbSlides,
                createdAt: b.createdAt,
                updatedAt: b.updatedAt,
            };
        });
        res.json({ success: true, data: list });
    }
    catch (e) {
        console.error('[briefings list]', e);
        res.status(500).json({ success: false, error: e.message });
    }
});
// ═══════════════════════════════════════════════════════════
// CRÉER un nouveau briefing pour un projet
// POST /api/v1/briefings/project/:projectId
// Body: { title?, slides?, studioSlides? }
// ═══════════════════════════════════════════════════════════
router.post('/project/:projectId', async (req, res) => {
    try {
        const { projectId } = req.params;
        const { title, slides, studioSlides } = req.body;
        const brief = await database_1.prisma.briefing.create({
            data: {
                projectId,
                title: title || 'Nouveau briefing',
                slides: slides ?? [],
                studioSlides: studioSlides ?? null,
            },
        });
        res.json({ success: true, data: brief });
    }
    catch (e) {
        console.error('[briefings create]', e);
        res.status(500).json({ success: false, error: e.message });
    }
});
// ═══════════════════════════════════════════════════════════
// GÉNÉRER un brouillon de briefing par IA à partir des données du projet
// POST /api/v1/briefings/project/:projectId/generate
// ═══════════════════════════════════════════════════════════
router.post('/project/:projectId/generate', async (req, res, next) => {
    try {
        const { projectId } = req.params;
        const draft = await (0, briefingAI_1.generateBriefingDraft)(projectId);
        const brief = await database_1.prisma.briefing.create({
            data: { projectId, title: draft.title, slides: draft.slides },
        });
        res.json({ success: true, data: brief });
    }
    catch (err) {
        next(err);
    }
});
// ═══════════════════════════════════════════════════════════
// LIRE un briefing par son ID
// GET /api/v1/briefings/:id
// ═══════════════════════════════════════════════════════════
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const brief = await database_1.prisma.briefing.findUnique({ where: { id } });
        if (!brief)
            return res.status(404).json({ success: false, error: 'Briefing introuvable' });
        res.json({ success: true, data: brief });
    }
    catch (e) {
        console.error('[briefings get]', e);
        res.status(500).json({ success: false, error: e.message });
    }
});
// ═══════════════════════════════════════════════════════════
// METTRE À JOUR un briefing par son ID
// PATCH /api/v1/briefings/:id
// Body: { title?, slides?, studioSlides? }
// ═══════════════════════════════════════════════════════════
router.patch('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { title, slides, studioSlides } = req.body;
        const data = {};
        if (title !== undefined)
            data.title = title;
        if (slides !== undefined)
            data.slides = slides;
        if (studioSlides !== undefined)
            data.studioSlides = studioSlides;
        const brief = await database_1.prisma.briefing.update({ where: { id }, data });
        res.json({ success: true, data: brief });
    }
    catch (e) {
        console.error('[briefings patch]', e);
        res.status(500).json({ success: false, error: e.message });
    }
});
// ═══════════════════════════════════════════════════════════
// SUPPRIMER un briefing par son ID
// DELETE /api/v1/briefings/:id
// ═══════════════════════════════════════════════════════════
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await database_1.prisma.briefing.delete({ where: { id } });
        res.json({ success: true });
    }
    catch (e) {
        console.error('[briefings delete]', e);
        res.status(500).json({ success: false, error: e.message });
    }
});
exports.default = router;
//# sourceMappingURL=briefing.js.map