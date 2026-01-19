import { Request, Response } from 'express';
/**
 * Organization Document CRUD Controller
 *
 * Validation Rules:
 * - organization_id: Required UUID
 * - document_title_id: Required UUID (reference to document title)
 * - document_type: Required document type
 * - document_name: Required document name
 * - user_id: Required UUID (uploader)
 * - file: File upload (PDF, images, documents) - stored as base64 in database
 * - privacy: PUBLIC or PRIVATE
 * - expiration_date: Optional date
 */
/**
 * Create Organization Document with File Upload
 * Handles file upload and saves file content directly to database
 * Stores file as JSON: {originalFileName, mimeType, fileData}
 */
export declare const createOrganizationDocumentWithFile: (req: Request, res: Response) => Promise<void>;
/**
 * Update Organization Document with Optional File Upload
 * Allows updating document metadata and/or uploading a new document
 */
export declare const updateOrganizationDocumentWithFile: (req: Request, res: Response) => Promise<void>;
/**
 * Download Organization Document
 * Extracts file from database and returns for download with proper extension
 * Preserves original filename and file extension from upload
 */
export declare const downloadOrganizationDocument: (req: Request, res: Response) => Promise<void | Response<any, Record<string, any>>>;
/**
 * Get All Organization Documents (without file data)
 */
export declare const getAllOrganizationDocuments: (req: Request, res: Response) => Promise<void>;
/**
 * Get Single Organization Document by ID (without file data)
 */
export declare const getOrganizationDocumentById: (req: Request, res: Response) => Promise<void>;
/**
 * Delete Organization Document
 */
export declare const deleteOrganizationDocument: (req: Request, res: Response) => Promise<void>;
//# sourceMappingURL=organizationDocumentController.d.ts.map