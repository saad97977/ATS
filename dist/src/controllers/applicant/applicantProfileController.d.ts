import { Request, Response } from 'express';
/**
 * Create a new applicant profile
 * POST /api/applicants
 *
 * Expects multipart/form-data with:
 * - resume: file upload (optional)
 * - Other fields from createApplicantSchema
 */
export declare const createApplicant: (req: Request, res: Response) => Promise<void>;
/**
 * Update applicant profile
 * PUT /api/applicants/:applicantId
 *
 * Expects multipart/form-data with:
 * - resume: file upload (optional, replaces existing)
 * - Other fields from updateApplicantSchema
 */
export declare const updateApplicant: (req: Request, res: Response) => Promise<void>;
/**
 * Get applicant by ID with all related data
 * GET /api/applicants/:applicantId
 */
export declare const getApplicantById: (req: Request, res: Response) => Promise<void>;
/**
 * Delete applicant and all related data
 * DELETE /api/applicants/:applicantId
 *
 * Cascading delete includes:
 * - Contact information
 * - Demographics
 * - Documents (and Azure blobs)
 * - Social profiles
 * - References
 * - Work history
 * - Applications
 */
export declare const deleteApplicant: (req: Request, res: Response) => Promise<void>;
/**
 * Delete applicant document (Resume or Cover Letter)
 * DELETE /api/applicants/:applicantId/documents/:documentId
 */
export declare const deleteApplicantDocument: (req: Request, res: Response) => Promise<void>;
/**
 * Delete social profile
 * DELETE /api/applicants/:applicantId/social-profiles/:profileId
 */
export declare const deleteSocialProfile: (req: Request, res: Response) => Promise<void>;
/**
 * Delete work history entry
 * DELETE /api/applicants/:applicantId/work-history/:workHistoryId
 */
export declare const deleteWorkHistory: (req: Request, res: Response) => Promise<void>;
/**
 * Delete reference
 * DELETE /api/applicants/:applicantId/references/:referenceId
 */
export declare const deleteReference: (req: Request, res: Response) => Promise<void>;
/**
 * Get all applicants with pagination and filters
 * GET /api/applicants?page=1&limit=10&status=APPLIED&search=john
 */
export declare const getAllApplicants: (req: Request, res: Response) => Promise<void>;
//# sourceMappingURL=applicantProfileController.d.ts.map