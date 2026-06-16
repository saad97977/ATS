import { Request, Response } from 'express';
/**
 * Create Applicant Document with File Upload to Azure Blob
 */
export declare const createApplicantDocumentWithFile: (req: Request, res: Response) => Promise<void>;
/**
 * Update Applicant Document with Optional File Upload
 */
export declare const updateApplicantDocumentWithFile: (req: Request, res: Response) => Promise<void>;
/**
 * Get All Applicant Documents (without file data)
 */
export declare const getAllApplicantDocuments: (req: Request, res: Response) => Promise<void>;
/**
 * Get Single Applicant Document by ID (without file data)
 */
export declare const getApplicantDocumentById: (req: Request, res: Response) => Promise<void>;
/**
 * Delete Applicant Document (also deletes from Azure Blob)
 */
export declare const deleteApplicantDocument: (req: Request, res: Response) => Promise<void>;
/**
 * Get All Documents by Applicant ID
 */
export declare const getDocumentsByApplicantId: (req: Request, res: Response) => Promise<void>;
export declare const viewApplicantDocument: (req: Request, res: Response) => Promise<void>;
export declare const downloadApplicantDocument: (req: Request, res: Response) => Promise<void>;
/**
 * Get all applicants with their documents, paginated by applicant.
 * Each applicant entry includes all of their documents (resume, cover letter,
 * onboarding docs, etc.) with view/download links.
 *
 * GET /api/applicant-documents/all?page=&limit=&search=
 */
export declare const getApplicantAllDocuments: (req: Request, res: Response) => Promise<void>;
//# sourceMappingURL=applicantDocumentsController.d.ts.map