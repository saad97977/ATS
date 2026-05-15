"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const applicantCommunicationController_1 = require("../../controllers/applicant/applicantCommunicationController");
const router = (0, express_1.Router)();
// ── Per-applicant endpoints ───────────────────────────────────────────────────
// GET  /api/applicant-communications/:applicantId          — list all logs
router.get('/:applicantId', applicantCommunicationController_1.listCommunications);
// GET  /api/applicant-communications/:applicantId/stats    — summary counts
router.get('/:applicantId/stats', applicantCommunicationController_1.getCommunicationStats);
// POST /api/applicant-communications/:applicantId/email    — HR sends manual email
router.post('/:applicantId/email', applicantCommunicationController_1.sendManualEmail);
// POST /api/applicant-communications/:applicantId/call     — HR logs a call
router.post('/:applicantId/call', applicantCommunicationController_1.logCallRecord);
// POST /api/applicant-communications/:applicantId/note     — HR adds a note
router.post('/:applicantId/note', applicantCommunicationController_1.logNote);
// ── Per-entry endpoints ───────────────────────────────────────────────────────
// GET    /api/applicant-communications/entry/:communicationId
router.get('/entry/:communicationId', applicantCommunicationController_1.getCommunicationById);
// PATCH  /api/applicant-communications/entry/:communicationId
router.patch('/entry/:communicationId', applicantCommunicationController_1.updateCommunicationLog);
// DELETE /api/applicant-communications/entry/:communicationId
router.delete('/entry/:communicationId', applicantCommunicationController_1.deleteCommunicationLog);
exports.default = router;
//# sourceMappingURL=applicantCommunicationRoutes.js.map