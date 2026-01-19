"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ALLOWED_MIME_TYPES = void 0;
exports.createUploadInstance = createUploadInstance;
exports.getRelativeFilePath = getRelativeFilePath;
exports.getAbsoluteFilePath = getAbsoluteFilePath;
exports.fileExists = fileExists;
exports.deleteFile = deleteFile;
exports.getFileInfo = getFileInfo;
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
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
function createUploadInstance(documentType, allowedMimes, maxFileSize = 50 * 1024 * 1024) {
    // Create uploads directory if it doesn't exist
    const uploadsDir = path_1.default.join(process.cwd(), 'uploads');
    const typeDir = path_1.default.join(uploadsDir, documentType);
    if (!fs_1.default.existsSync(typeDir)) {
        fs_1.default.mkdirSync(typeDir, { recursive: true });
    }
    // Configure storage
    const storage = multer_1.default.diskStorage({
        destination: (req, file, cb) => {
            cb(null, typeDir);
        },
        filename: (req, file, cb) => {
            const uniqueName = `${Date.now()}-${Math.random().toString(36).substring(7)}-${file.originalname}`;
            cb(null, uniqueName);
        },
    });
    // File filter
    const fileFilter = (req, file, cb) => {
        if (allowedMimes.includes(file.mimetype)) {
            cb(null, true);
        }
        else {
            cb(new Error(`Invalid file type: ${file.mimetype}`));
        }
    };
    // Create multer instance
    return (0, multer_1.default)({
        storage,
        fileFilter,
        limits: { fileSize: maxFileSize },
    });
}
/**
 * Get file path relative to uploads
 */
function getRelativeFilePath(documentType, filename) {
    return path_1.default.join('uploads', documentType, filename);
}
/**
 * Get absolute file path
 */
function getAbsoluteFilePath(relativeFilePath) {
    return path_1.default.join(process.cwd(), relativeFilePath);
}
/**
 * Check if file exists
 */
function fileExists(relativeFilePath) {
    return fs_1.default.existsSync(getAbsoluteFilePath(relativeFilePath));
}
/**
 * Delete file
 */
function deleteFile(relativeFilePath) {
    try {
        const absolutePath = getAbsoluteFilePath(relativeFilePath);
        if (fs_1.default.existsSync(absolutePath)) {
            fs_1.default.unlinkSync(absolutePath);
            return true;
        }
        return false;
    }
    catch (err) {
        console.error('Error deleting file:', err);
        return false;
    }
}
/**
 * Get file info
 */
function getFileInfo(relativeFilePath) {
    try {
        const absolutePath = getAbsoluteFilePath(relativeFilePath);
        if (fs_1.default.existsSync(absolutePath)) {
            const stats = fs_1.default.statSync(absolutePath);
            return {
                size: stats.size,
                createdAt: stats.birthtime,
                modifiedAt: stats.mtime,
                isFile: stats.isFile(),
            };
        }
        return null;
    }
    catch (err) {
        console.error('Error getting file info:', err);
        return null;
    }
}
/**
 * Allowed MIME types for different document categories
 */
exports.ALLOWED_MIME_TYPES = {
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
//# sourceMappingURL=fileUploadService.js.map