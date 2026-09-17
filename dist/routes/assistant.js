"use strict";
// src/routes/assistant.ts
// Assistant en langage naturel (lecture seule) pour interroger les données
// projets/tâches/tickets/logistique. Voir services/assistantService.ts.
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const assistantService_1 = require("../services/assistantService");
const router = (0, express_1.Router)();
// POST /api/v1/assistant/ask
// Body : { question: string, history?: Array<{ role: 'user'|'assistant', text: string }> }
// L'historique permet la confirmation conversationnelle avant les actions
// d'écriture (créer un projet, un camion...) : chaque question repartait
// auparavant de zéro, ce qui empêchait l'assistant de se souvenir d'un
// récapitulatif proposé au tour précédent.
router.post('/ask', async (req, res, next) => {
    try {
        const { question, history } = req.body || {};
        if (!question?.trim())
            return res.status(400).json({ success: false, error: 'Question manquante' });
        if (question.length > 1000)
            return res.status(400).json({ success: false, error: 'Question trop longue (max 1000 caractères)' });
        const cleanHistory = Array.isArray(history)
            ? history
                .filter((h) => h && typeof h.text === 'string' && (h.role === 'user' || h.role === 'assistant'))
                .slice(-12)
            : [];
        const result = await (0, assistantService_1.askAssistant)(question.trim(), {
            id: req.user.id,
            firstName: req.user.firstName,
            lastName: req.user.lastName,
            role: req.user.role,
        }, cleanHistory);
        res.json({ success: true, data: { answer: result.answer, reportProjectId: result.reportProjectId } });
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=assistant.js.map