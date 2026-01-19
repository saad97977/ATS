import multer from 'multer';
/**
 * File Upload Service
 * Provides utilities for handling file uploads across the application
 */
/**
 * Create a multer upload instance for a specific document type
 * @param documentType - Type of document (e.g., 'licenses', 'documents', 'contracts')
 * @param allowedMimes - Array of allowed MIME types
 * @param maxFileSize - Maximum file size in bytes (default: 50MB)
 */
export declare function createUploadInstance(documentType: string, allowedMimes: string[], maxFileSize?: number): multer.Multer;
/**
 * Get file path relative to uploads
 */
export declare function getRelativeFilePath(documentType: string, filename: string): string;
/**
 * Get absolute file path
 */
export declare function getAbsoluteFilePath(relativeFilePath: string): string;
/**
 * Check if file exists
 */
export declare function fileExists(relativeFilePath: string): boolean;
/**
 * Delete file
 */
export declare function deleteFile(relativeFilePath: string): boolean;
/**
 * Get file info
 */
export declare function getFileInfo(relativeFilePath: string): {
    size: number;
    createdAt: Date;
    modifiedAt: Date;
    isFile: boolean;
} | null;
/**
 * Allowed MIME types for different document categories
 */
export declare const ALLOWED_MIME_TYPES: {
    licenses: string[];
    documents: string[];
    contracts: string[];
    resumes: string[];
};
//# sourceMappingURL=fileUploadService.d.ts.map