"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadLicense = void 0;
const multer_1 = __importDefault(require("multer"));
/**
 * File Upload Middleware Configuration
 * Handles file uploads for various document types
 * Uses memory storage to store files directly in database
 */
// File filter to validate file types
const fileFilter = (req, file, cb) => {
    // Allowed MIME types for licenses (PDF, images, documents)
    const allowedMimes = [
        'application/pdf',
        'image/jpeg',
        'image/png',
        'image/jpg',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ];
    if (allowedMimes.includes(file.mimetype)) {
        cb(null, true);
    }
    else {
        cb(new Error(`Invalid file type: ${file.mimetype}. Allowed types: PDF, images, Word, Excel documents`));
    }
};
// Create multer instance with memory storage
// Files are stored in memory as buffers instead of disk
const uploadLicense = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    fileFilter,
    limits: {
        fileSize: 50 * 1024 * 1024, // 50MB max file size
    },
});
exports.uploadLicense = uploadLicense;
//# sourceMappingURL=fileUploadMiddleware.js.map