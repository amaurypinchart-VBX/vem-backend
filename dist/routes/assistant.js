"use strict";
// src/routes/assistant.ts
// Assistant en langage naturel (lecture seule) pour interroger les données
// projets/tâches/tickets/logistique. Voir services/assistantService.ts.
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const assistantService_1 = require("../services/assistantService");
const router = (0, express_1.Router)();
// POST /api/v1/assistant/ask
// Body : { question: string }
router.post('/ask', async (req, res, next) => {
    try {
        const { question } = req.body || {};
        if (!question?.trim())
            return res.status(400).json({ success: false, error: 'Question manquante' });
        if (question.length > 1000)
            return res.status(400).json({ success: false, error: 'Question trop longue (max 1000 caractères)' });
        const result = await (0, assistantService_1.askAssistant)(question.trim(), {
            firstName: req.user.firstName,
            lastName: req.user.lastName,
            role: req.user.role,
        });
        res.json({ success: true, data: { answer: result.answer } });
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=assistant.js.map