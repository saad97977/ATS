import { Request, Response } from 'express';
/**
 * Create Organization Document with File Upload to Azure Blob
 */
export declare const createOrganizationDocumentWithFile: (req: Request, res: Response) => Promise<void>;
/**
 * Update Organization Document with Optional File Upload
 */
export declare const updateOrganizationDocumentWithFile: (req: Request, res: Response) => Promise<void>;
/**
 * Download Organization Document from Azure Blob
 */
export declare const downloadOrganizationDocument: (req: Request, res: Response) => Promise<void>;
/**
 * Get All Organization Documents (without file data)
 */
export declare const getAllOrganizationDocuments: (req: Request, res: Response) => Promise<void>;
/**
 * View Organization Document Inline (like classroom - opens in browser)
 * UPDATED WITH PROPER CORS HEADERS
 */
export declare const viewOrganizationDocument: (req: Request, res: Response) => Promise<void>;
/**
 * Get Single Organization Document by ID (without file data)
 */
export declare const getOrganizationDocumentById: (req: Request, res: Response) => Promise<void>;
/**
 * Delete Organization Document (also deletes from Azure Blob)
 */
export declare const deleteOrganizationDocument: (req: Request, res: Response) => Promise<void>;
/**
 * Get All Documents by Organization ID
 */
export declare const getDocumentsByOrganizationId: (req: Request, res: Response) => Promise<void>;
/**
 * Get Document File Metadata (without downloading)
 */
export declare const getDocumentFileMetadata: (req: Request, res: Response) => Promise<void>;
//# sourceMappingURL=organizationDocumentController.d.ts.map