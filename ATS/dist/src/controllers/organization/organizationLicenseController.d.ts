import { Request, Response } from 'express';
/**
 *
 * Validation Rules:
 * - organization_id: Required UUID
 * - license_name: Required license name
 * - license_document: File upload (PDF, images, documents) - stored as base64 in database
 * - expiration_date: Optional date
 */
/**
 * Create Organization License with File Upload
 * Handles file upload and saves file content directly to database
 * Stores file as JSON: {originalFileName, mimeType, fileData}
 */
export declare const createOrganizationLicenseWithFile: (req: Request, res: Response) => Promise<void>;
/**
 * Update Organization License with Optional File Upload
 * Allows updating license name and/or uploading a new document
 */
export declare const updateOrganizationLicenseWithFile: (req: Request, res: Response) => Promise<void>;
/**
 * Download Organization License Document
 * Extracts file from database and returns for download with proper extension
 */
export declare const downloadOrganizationLicense: (req: Request, res: Response) => Promise<void | Response<any, Record<string, any>>>;
/**
 * Organization License CRUD Controller - Standard operations
 * Provides: GET all, GET by id, DELETE
 * Note: GET operations exclude license_document (file content) to reduce response size
 */
export declare const getAllOrganizationLicenses: (req: Request, res: Response) => Promise<void>;
export declare const getOrganizationLicenseById: (req: Request, res: Response) => Promise<void>;
export declare const deleteOrganizationLicense: (req: Request, res: Response) => Promise<void>;
//# sourceMappingURL=organizationLicenseController.d.ts.map