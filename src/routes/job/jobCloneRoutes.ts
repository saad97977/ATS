// routes/jobTemplateRoutes.ts
import { Router } from "express";
import {
  previewSnapshot,
  saveJobAsTemplate,
  cloneJob,
  getTemplates,
  getTemplateById,
  createJobFromTemplate,
  updateTemplate,
  deleteTemplate,
} from "../../controllers/job/jobCloneController";

const router = Router();

// ─── Job actions (source is a job) ───────────────────────────────────────────
router.post("/:jobId/preview-snapshot", previewSnapshot);
router.post("/:jobId/save-as-template", saveJobAsTemplate);
router.post("/:jobId/clone",            cloneJob);

// ─── Template CRUD (source is a template) ────────────────────────────────────
router.get("/",                              getTemplates);
router.get("/:templateId",                   getTemplateById);
router.post("/:templateId/create-job",       createJobFromTemplate);
router.patch("/:templateId",                 updateTemplate);
router.delete("/:templateId",                deleteTemplate);

export default router;