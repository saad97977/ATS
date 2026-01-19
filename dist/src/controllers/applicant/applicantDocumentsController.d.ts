import { Request, Response } from 'express';
/**
 * Applicant Document CRUD Controller
 *
 * Validation Rules:
 * - applicant_id: Required UUID
 * - document_type: Required document type (e.g., "Resume", "Cover Letter", "ID Proof", etc.)
 * - file_url: File upload (PDF, images, documents) - stored as base64 in database
 */
/**
 * Create Applicant Document with File Upload
 * Handles file upload and saves file content directly to database
 * Stores file as JSON: {originalFileName, mimeType, fileData}
 */
export declare const createApplicantDocumentWithFile: (req: Request, res: Response) => Promise<void>;
/**
 * Update Applicant Document with Optional File Upload
 * Allows updating document type and/or uploading a new document
 */
export declare const updateApplicantDocumentWithFile: (req: Request, res: Response) => Promise<void>;
/**
 * Download Applicant Document
 * Extracts file from database and returns for download with proper extension
 * Preserves original filename and file extension from upload
 */
export declare const downloadApplicantDocument: (req: Request, res: Response) => Promise<void | Response<any, Record<string, any>>>;
/**
 * Get All Applicant Documents (without file data)
 */
export declare const getAllApplicantDocuments: (req: Request, res: Response) => Promise<void>;
/**
 * Get Single Applicant Document by ID (without file data)
 */
export declare const getApplicantDocumentById: (req: Request, res: Response) => Promise<void>;
/**
 * Delete Applicant Document
 */
export declare const deleteApplicantDocument: (req: Request, res: Response) => Promise<void>;
/**
 * Get All Documents by Applicant ID
 * Returns all documents belonging to a specific applicant (without file data)
 */
export declare const getDocumentsByApplicantId: (req: Request, res: Response) => Promise<void>;
//# sourceMappingURL=applicantDocumentsController.d.ts.map