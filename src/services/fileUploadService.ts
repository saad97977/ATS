import multer from 'multer';
import path from 'path';
import fs from 'fs';

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
export function createUploadInstance(
  documentType: string,
  allowedMimes: string[],
  maxFileSize: number = 50 * 1024 * 1024
) {
  // Create uploads directory if it doesn't exist
  const uploadsDir = path.join(process.cwd(), 'uploads');
  const typeDir = path.join(uploadsDir, documentType);

  if (!fs.existsSync(typeDir)) {
    fs.mkdirSync(typeDir, { recursive: true });
  }

  // Configure storage
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, typeDir);
    },
    filename: (req, file, cb) => {
      const uniqueName = `${Date.now()}-${Math.random().toString(36).substring(7)}-${file.originalname}`;
      cb(null, uniqueName);
    },
  });

  // File filter
  const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type: ${file.mimetype}`));
    }
  };

  // Create multer instance
  return multer({
    storage,
    fileFilter,
    limits: { fileSize: maxFileSize },
  });
}

/**
 * Get file path relative to uploads
 */
export function getRelativeFilePath(documentType: string, filename: string): string {
  return path.join('uploads', documentType, filename);
}

/**
 * Get absolute file path
 */
export function getAbsoluteFilePath(relativeFilePath: string): string {
  return path.join(process.cwd(), relativeFilePath);
}

/**
 * Check if file exists
 */
export function fileExists(relativeFilePath: string): boolean {
  return fs.existsSync(getAbsoluteFilePath(relativeFilePath));
}

/**
 * Delete file
 */
export function deleteFile(relativeFilePath: string): boolean {
  try {
    const absolutePath = getAbsoluteFilePath(relativeFilePath);
    if (fs.existsSync(absolutePath)) {
      fs.unlinkSync(absolutePath);
      return true;
    }
    return false;
  } catch (err) {
    console.error('Error deleting file:', err);
    return false;
  }
}

/**
 * Get file info
 */
export function getFileInfo(relativeFilePath: string) {
  try {
    const absolutePath = getAbsoluteFilePath(relativeFilePath);
    if (fs.existsSync(absolutePath)) {
      const stats = fs.statSync(absolutePath);
      return {
        size: stats.size,
        createdAt: stats.birthtime,
        modifiedAt: stats.mtime,
        isFile: stats.isFile(),
      };
    }
    return null;
  } catch (err) {
    console.error('Error getting file info:', err);
    return null;
  }
}

/**
 * Allowed MIME types for different document categories
 */
export const ALLOWED_MIME_TYPES = {
  licenses: [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/jpg',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ],
  documents: [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/jpg',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'text/csv',
  ],
  contracts: [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ],
  resumes: [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
  ],
};
