"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const applicantProfileController_1 = require("./../../controllers/applicant/applicantProfileController");
const router = (0, express_1.Router)();
// ── Multer: memory storage, 10 MB limit ──────────────────────────────────────
const upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        const allowed = [
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'text/plain',
            'application/rtf',
        ];
        allowed.includes(file.mimetype)
            ? cb(null, true)
            : cb(new Error('Invalid file type. Allowed: PDF, DOC, DOCX, TXT, RTF'));
    },
});
// ════════════════════════════════════════════════════════════════════════════
//  STATIC / NON-PARAMETERISED ROUTES  (must come before /:applicantId)
// ════════════════════════════════════════════════════════════════════════════
// GET  /api/applicants/jobs-dropdown
//   Lightweight list of OPEN jobs for the apply-modal dropdown.
//   Query: ?q=<title>&org_id=<uuid>&cursor=<last_job_id>&limit=<n>
router.get('/jobs-dropdown', applicantProfileController_1.getJobsDropdown);
// GET  /api/applicants
//   Paginated table list with search, filter, sort.
//   Query: ?page, limit, search, status, source, hotlist, is_private,
//          employment_type_pref, work_authorization, office_name,
//          sort_by, sort_dir, cursor
router.get('/', applicantProfileController_1.listApplicants);
// POST /api/applicants
//   Create a new applicant with first_name + last_name as required identity.
//   full_name is auto-derived. Email + phone required for deduplication.
router.post('/', applicantProfileController_1.createApplicantProfile);
// ════════════════════════════════════════════════════════════════════════════
//  SINGLE APPLICANT — CORE PROFILE
// ════════════════════════════════════════════════════════════════════════════
// GET    /api/applicants/:applicantId
//   Full profile: contact, demographic, social, documents, work history
//   (profile-level), education, classification, rated tags, references.
//   Does NOT include applications — use dedicated endpoints below.
router.get('/:applicantId', applicantProfileController_1.getApplicantProfile);
// PATCH  /api/applicants/:applicantId
//   Partial update. Send only the fields that changed.
router.patch('/:applicantId', applicantProfileController_1.updateApplicantProfile);
// DELETE /api/applicants/:applicantId
//   Hard delete + Azure blob purge.
router.delete('/:applicantId', applicantProfileController_1.deleteApplicant);
// ════════════════════════════════════════════════════════════════════════════
//  QUICK ACTIONS
// ════════════════════════════════════════════════════════════════════════════
// GET   /api/applicants/:applicantId/stats
//   Header-card counts: total apps, by-status map, doc count, last active.
router.get('/:applicantId/stats', applicantProfileController_1.getApplicantStats);
// PATCH /api/applicants/:applicantId/hotlist
//   Toggle add_to_hotlist. Returns new boolean value.
router.patch('/:applicantId/hotlist', applicantProfileController_1.toggleHotlist);
// ════════════════════════════════════════════════════════════════════════════
//  APPLICATIONS  (lazy-loaded — each tab fetches its own endpoint)
// ════════════════════════════════════════════════════════════════════════════
// GET  /api/applicants/:applicantId/applications
//   List of all applications with job snippet, latest pipeline stage,
//   AI score badge, interview/document counts, assignment flag.
//   Query: ?status=APPLIED|SCREENED|OFFERED|HIRED
router.get('/:applicantId/applications', applicantProfileController_1.getApplicantApplications);
// POST /api/applicants/:applicantId/apply
//   Bulk (or single) apply to one or more OPEN jobs.
//   Body: { job_ids: string[], source?: string }
//   Returns per-job result: applied | already_exists | not_found | closed | no_positions
router.post('/:applicantId/apply', applicantProfileController_1.bulkApplyToJobs);
// DELETE /api/applicants/:applicantId/applications/:applicationId
//   Withdraw application. Blocked if an Assignment already exists.
//   Re-increments open_positions on the job.
router.delete('/:applicantId/applications/:applicationId', applicantProfileController_1.removeApplication);
// ── Single application drill-down (separate lazy tabs) ────────────────────
// GET /api/applicants/:applicantId/applications/:applicationId
//   Full detail: job info + rates + description, all pipeline stages,
//   all interviews, evaluation, assignment + recent timesheets, doc snapshot.
router.get('/:applicantId/applications/:applicationId', applicantProfileController_1.getApplicationDetail);
// GET /api/applicants/:applicantId/applications/:applicationId/pipeline
//   All pipeline stage history with credit/representative user info.
router.get('/:applicantId/applications/:applicationId/pipeline', applicantProfileController_1.getApplicationPipeline);
// GET /api/applicants/:applicantId/applications/:applicationId/interviews
//   All interview rounds with status and type.
router.get('/:applicantId/applications/:applicationId/interviews', applicantProfileController_1.getApplicationInterviews);
// GET /api/applicants/:applicantId/applications/:applicationId/evaluation
//   AI evaluation score, model name, raw response.
router.get('/:applicantId/applications/:applicationId/evaluation', applicantProfileController_1.getApplicationEvaluation);
// GET /api/applicants/:applicantId/applications/:applicationId/assignment
//   Assignment record + recent timesheets + payrolls + invoices.
router.get('/:applicantId/applications/:applicationId/assignment', applicantProfileController_1.getApplicationAssignment);
// GET /api/applicants/:applicantId/applications/:applicationId/documents
//   Resume/cover letter snapshot uploaded for this specific application.
router.get('/:applicantId/applications/:applicationId/documents', applicantProfileController_1.getApplicationDocuments);
// ════════════════════════════════════════════════════════════════════════════
//  WORK HISTORY  (profile-level — not tied to any application)
// ════════════════════════════════════════════════════════════════════════════
// POST   /api/applicants/:applicantId/work-history
//   Body: { title*, company?, description?, from_date?, to_date? }
router.post('/:applicantId/work-history', applicantProfileController_1.addWorkHistoryEntry);
// PATCH  /api/applicants/:applicantId/work-history/:entryId
router.patch('/:applicantId/work-history/:entryId', applicantProfileController_1.updateWorkHistoryEntry);
// DELETE /api/applicants/:applicantId/work-history/:entryId
router.delete('/:applicantId/work-history/:entryId', applicantProfileController_1.deleteWorkHistoryEntry);
// ════════════════════════════════════════════════════════════════════════════
//  EDUCATION
// ════════════════════════════════════════════════════════════════════════════
// POST   /api/applicants/:applicantId/education
//   Body: { school*, degree?, field?, from_date?, to_date? }
router.post('/:applicantId/education', applicantProfileController_1.addEducationEntry);
// PATCH  /api/applicants/:applicantId/education/:educationId
router.patch('/:applicantId/education/:educationId', applicantProfileController_1.updateEducationEntry);
// DELETE /api/applicants/:applicantId/education/:educationId
router.delete('/:applicantId/education/:educationId', applicantProfileController_1.deleteEducationEntry);
// ════════════════════════════════════════════════════════════════════════════
//  PROFILE DOCUMENTS
// ════════════════════════════════════════════════════════════════════════════
// POST   /api/applicants/:applicantId/documents
//   Multipart: file field + document_type (RESUME|COVER_LETTER|CERTIFICATE|OTHER)
//   Max 10 MB. Stored in Azure Blob.
router.post('/:applicantId/documents', upload.single('file'), applicantProfileController_1.uploadApplicantDocument);
// GET    /api/applicants/:applicantId/documents/:documentId/view
//   Stream inline in browser (Content-Disposition: inline). Use for PDF preview.
router.get('/:applicantId/documents/:documentId/view', applicantProfileController_1.viewApplicantDocument);
// GET    /api/applicants/:applicantId/documents/:documentId/download
//   Force-download (Content-Disposition: attachment).
router.get('/:applicantId/documents/:documentId/download', applicantProfileController_1.downloadApplicantDocument);
// DELETE /api/applicants/:applicantId/documents/:documentId
//   Remove DB record + purge Azure blob.
router.delete('/:applicantId/documents/:documentId', applicantProfileController_1.deleteApplicantDocument);
// ════════════════════════════════════════════════════════════════════════════
//  CLASSIFICATION & RATED TAGS
// ════════════════════════════════════════════════════════════════════════════
// PATCH /api/applicants/:applicantId/classification
//   Update any subset of: talent_status, position_categories, skill_sets,
//   applicant_tags, tag_details, industry_experience, identifications, certifications
router.patch('/:applicantId/classification', applicantProfileController_1.updateClassification);
// PUT   /api/applicants/:applicantId/tags
//   Replace ALL rated tags. Body: { tags: [{ tag_title, stars }] }
//   Send empty array [] to clear all tags.
router.put('/:applicantId/tags', applicantProfileController_1.upsertApplicantTags);
exports.default = router;
//# sourceMappingURL=applicantProfileRoutes.js.map