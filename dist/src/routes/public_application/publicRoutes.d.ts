declare const router: import("express-serve-static-core").Router;
/**
 * ========================================
 * ROUTE SUMMARY
 * ========================================
 *
 * JOB BROWSING:
 * - GET    /api/public/jobs/stats
 * - GET    /api/public/jobs/featured
 * - POST   /api/public/jobs/search
 * - GET    /api/public/jobs
 * - GET    /api/public/jobs/:id
 * - GET    /api/public/organizations/:organizationId/jobs
 *
 * JOB APPLICATIONS:
 * - GET    /api/public/jobs/:jobId/check-application
 * - POST   /api/public/jobs/:jobId/apply
 * - POST   /api/public/applications/:applicationId/upload-resume
 * - GET    /api/public/applications/:applicationId
 * - GET    /api/public/applications/:applicationId/resume
 * - GET    /api/public/applications/:applicationId/resume/view
 * - GET    /api/public/applications/:applicationId/cover-letter/view
 * - GET    /api/public/applicants/applications
 * - DELETE /api/public/applications/:applicationId/withdraw
 */
export default router;
//# sourceMappingURL=publicRoutes.d.ts.map