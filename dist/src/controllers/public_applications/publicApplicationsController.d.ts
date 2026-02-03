import { Request, Response } from 'express';
/**
 * Submit a job application with file upload
 * POST /api/public/jobs/:jobId/apply
 *
 * Expects multipart/form-data with:
 * - resume: file upload (optional but recommended)
 * - Other fields from createApplicationSchema
 */
export declare const submitApplication: (req: Request, res: Response) => Promise<void>;
/**
 * Check if applicant has already applied to a job
 * GET /api/public/jobs/:jobId/check-application?email=xxx
 */
export declare const checkExistingApplication: (req: Request, res: Response) => Promise<void>;
/**
 * Get application status with resume download link
 * GET /api/public/applications/:applicationId
 *
 * Allows applicants to check their application status
 * Requires application ID (sent via email after applying)
 */
export declare const getApplicationStatus: (req: Request, res: Response) => Promise<void>;
/**
 * Download applicant's resume
 * GET /api/public/applications/:applicationId/resume
 *
 * Allows downloading resume for a specific application
 * Public endpoint for applicants to download their own resume
 */
export declare const downloadApplicationResume: (req: Request, res: Response) => Promise<void>;
/**
 * Withdraw application
 * DELETE /api/public/applications/:applicationId/withdraw
 *
 * Allows applicants to withdraw their application
 * Requires email verification for security
 */
export declare const withdrawApplication: (req: Request, res: Response) => Promise<void>;
/**
 * Get applicant's application history with resume info
 * GET /api/public/applicants/applications?email=xxx
 *
 * Returns all applications for an applicant by email
 */
export declare const getApplicantApplications: (req: Request, res: Response) => Promise<void>;
//# sourceMappingURL=publicApplicationsController.d.ts.map