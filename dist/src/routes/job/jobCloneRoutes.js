"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// routes/jobTemplateRoutes.ts
const express_1 = require("express");
const jobCloneController_1 = require("../../controllers/job/jobCloneController");
const router = (0, express_1.Router)();
// ─── Job actions (source is a job) ───────────────────────────────────────────
router.post("/:jobId/preview-snapshot", jobCloneController_1.previewSnapshot);
router.post("/:jobId/save-as-template", jobCloneController_1.saveJobAsTemplate);
router.post("/:jobId/clone", jobCloneController_1.cloneJob);
// ─── Template CRUD (source is a template) ────────────────────────────────────
router.get("/", jobCloneController_1.getTemplates);
router.get("/:templateId", jobCloneController_1.getTemplateById);
router.post("/:templateId/create-job", jobCloneController_1.createJobFromTemplate);
router.patch("/:templateId", jobCloneController_1.updateTemplate);
router.delete("/:templateId", jobCloneController_1.deleteTemplate);
exports.default = router;
//# sourceMappingURL=jobCloneRoutes.js.map