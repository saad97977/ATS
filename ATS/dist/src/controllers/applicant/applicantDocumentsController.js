"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDocumentsByApplicantId = exports.deleteApplicantDocument = exports.getApplicantDocumentById = exports.getAllApplicantDocuments = exports.downloadApplicantDocument = exports.updateApplicantDocumentWithFile = exports.createApplicantDocumentWithFile = void 0;
const prisma_config_1 = __importDefault(require("../../prisma.config"));
const response_1 = require("../../utils/response");
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
const createApplicantDocumentWithFile = async (req, res) => {
    try {
        const { applicant_id, document_type } = req.body;
        const file = req.file;
        // Validate required fields
        if (!applicant_id) {
            return (0, response_1.sendError)(res, 'Applicant ID is required', 400);
        }
        if (!document_type) {
            return (0, response_1.sendError)(res, 'Document type is required', 400);
        }
        if (!file) {
            return (0, response_1.sendError)(res, 'Document file is required', 400);
        }
        // Check if applicant exists
        const applicant = await prisma_config_1.default.applicant.findUnique({
            where: { applicant_id },
        });
        if (!applicant) {
            return (0, response_1.sendError)(res, 'Applicant not found', 404);
        }
        // Convert file buffer to base64 and store with metadata
        const fileBase64 = file.buffer.toString('base64');
        const fileMetadata = {
            originalFileName: file.originalname,
            mimeType: file.mimetype,
            fileData: fileBase64,
        };
        // Create document record in database with file content and metadata
        const newDocument = await prisma_config_1.default.applicantDocument.create({
            data: {
                applicant_id,
                document_type,
                file_url: JSON.stringify(fileMetadata),
            },
        });
        return (0, response_1.sendSuccess)(res, {
            message: 'Document uploaded successfully',
            data: newDocument,
            file: {
                filename: file.originalname,
                originalName: file.originalname,
                size: file.size,
                mimeType: file.mimetype,
            },
        }, 201);
    }
    catch (err) {
        console.error('Error uploading document:', err);
        return (0, response_1.sendError)(res, 'Failed to upload document', 500);
    }
};
exports.createApplicantDocumentWithFile = createApplicantDocumentWithFile;
/**
 * Update Applicant Document with Optional File Upload
 * Allows updating document type and/or uploading a new document
 */
const updateApplicantDocumentWithFile = async (req, res) => {
    try {
        const { id } = req.params;
        const { document_type } = req.body;
        const file = req.file;
        // Check if document exists
        const existingDocument = await prisma_config_1.default.applicantDocument.findUnique({
            where: { applicant_document_id: id },
        });
        if (!existingDocument) {
            return (0, response_1.sendError)(res, 'Applicant Document not found', 404);
        }
        // Prepare update data
        const updateData = {};
        if (document_type) {
            updateData.document_type = document_type;
        }
        if (file) {
            // Convert file buffer to base64 and store with metadata
            const fileBase64 = file.buffer.toString('base64');
            const fileMetadata = {
                originalFileName: file.originalname,
                mimeType: file.mimetype,
                fileData: fileBase64,
            };
            updateData.file_url = JSON.stringify(fileMetadata);
        }
        // If no updates provided
        if (Object.keys(updateData).length === 0) {
            return (0, response_1.sendError)(res, 'No fields to update', 400);
        }
        // Update document in database
        const updatedDocument = await prisma_config_1.default.applicantDocument.update({
            where: { applicant_document_id: id },
            data: updateData,
        });
        return (0, response_1.sendSuccess)(res, {
            message: 'Document updated successfully',
            data: updatedDocument,
            ...(file && {
                file: {
                    filename: file.originalname,
                    originalName: file.originalname,
                    size: file.size,
                    mimeType: file.mimetype,
                },
            }),
        });
    }
    catch (err) {
        console.error('Error updating document:', err);
        return (0, response_1.sendError)(res, 'Failed to update document', 500);
    }
};
exports.updateApplicantDocumentWithFile = updateApplicantDocumentWithFile;
/**
 * Download Applicant Document
 * Extracts file from database and returns for download with proper extension
 * Preserves original filename and file extension from upload
 */
const downloadApplicantDocument = async (req, res) => {
    try {
        const { id } = req.params;
        // Get document from database
        const document = await prisma_config_1.default.applicantDocument.findUnique({
            where: { applicant_document_id: id },
        });
        if (!document) {
            return (0, response_1.sendError)(res, 'Applicant Document not found', 404);
        }
        if (!document.file_url) {
            return (0, response_1.sendError)(res, 'Document file not found', 404);
        }
        try {
            // Try to parse JSON metadata
            let originalFileName = null;
            let mimeType = 'application/octet-stream';
            let fileData = null;
            try {
                const fileMetadata = JSON.parse(document.file_url);
                originalFileName = fileMetadata.originalFileName;
                mimeType = fileMetadata.mimeType || 'application/octet-stream';
                fileData = fileMetadata.fileData;
            }
            catch (parseErr) {
                console.warn('JSON parsing failed, checking if it\'s plain base64');
                // If JSON parsing fails, assume it's plain base64 (old format)
                fileData = document.file_url;
            }
            if (!fileData) {
                return (0, response_1.sendError)(res, 'Document file data is missing or corrupted', 500);
            }
            try {
                // Convert base64 string back to buffer
                const fileBuffer = Buffer.from(fileData, 'base64');
                // Use original filename if available, otherwise use document_type with .pdf
                if (!originalFileName) {
                    originalFileName = `${document.document_type}.pdf`;
                    console.log('Using fallback filename:', originalFileName);
                }
                // Sanitize filename - remove invalid characters for HTTP headers
                // Keep only alphanumeric, dots, hyphens, underscores, and spaces
                const sanitizedFileName = originalFileName
                    .replace(/[^a-zA-Z0-9._\- ]/g, '')
                    .replace(/\s+/g, '_')
                    .trim();
                if (!sanitizedFileName) {
                    throw new Error('Filename is empty after sanitization');
                }
                // Set response headers for file download with proper extension
                res.setHeader('Content-Type', mimeType);
                res.setHeader('Content-Disposition', `attachment; filename="${sanitizedFileName}"`);
                res.setHeader('Content-Length', fileBuffer.length);
                res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
                console.log('Downloading file:', sanitizedFileName, 'with MIME type:', mimeType);
                return res.send(fileBuffer);
            }
            catch (bufferErr) {
                console.error('Error converting base64 to buffer:', bufferErr);
                return (0, response_1.sendError)(res, 'Failed to process document', 500);
            }
        }
        catch (err) {
            console.error('Unexpected error in download:', err);
            return (0, response_1.sendError)(res, 'Failed to download document', 500);
        }
    }
    catch (err) {
        console.error('Error downloading document:', err);
        return (0, response_1.sendError)(res, 'Failed to download document', 500);
    }
};
exports.downloadApplicantDocument = downloadApplicantDocument;
/**
 * Get All Applicant Documents (without file data)
 */
const getAllApplicantDocuments = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
        const skip = (page - 1) * limit;
        const [documents, total] = await Promise.all([
            prisma_config_1.default.applicantDocument.findMany({
                skip,
                take: limit,
                select: {
                    applicant_document_id: true,
                    applicant_id: true,
                    document_type: true,
                    // Exclude file_url to reduce response size
                },
                orderBy: { applicant_document_id: 'desc' },
            }),
            prisma_config_1.default.applicantDocument.count(),
        ]);
        return (0, response_1.sendSuccess)(res, {
            data: documents,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit),
            },
        });
    }
    catch (err) {
        console.error('Error fetching documents:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch documents', 500);
    }
};
exports.getAllApplicantDocuments = getAllApplicantDocuments;
/**
 * Get Single Applicant Document by ID (without file data)
 */
const getApplicantDocumentById = async (req, res) => {
    try {
        const { id } = req.params;
        const document = await prisma_config_1.default.applicantDocument.findUnique({
            where: { applicant_document_id: id },
            select: {
                applicant_document_id: true,
                applicant_id: true,
                document_type: true,
                // Exclude file_url to reduce response size
            },
        });
        if (!document) {
            return (0, response_1.sendError)(res, 'Applicant Document not found', 404);
        }
        return (0, response_1.sendSuccess)(res, {
            data: document,
        });
    }
    catch (err) {
        console.error('Error fetching document:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch document', 500);
    }
};
exports.getApplicantDocumentById = getApplicantDocumentById;
/**
 * Delete Applicant Document
 */
const deleteApplicantDocument = async (req, res) => {
    try {
        const { id } = req.params;
        const document = await prisma_config_1.default.applicantDocument.findUnique({
            where: { applicant_document_id: id },
        });
        if (!document) {
            return (0, response_1.sendError)(res, 'Applicant Document not found', 404);
        }
        await prisma_config_1.default.applicantDocument.delete({
            where: { applicant_document_id: id },
        });
        return (0, response_1.sendSuccess)(res, {
            message: 'Document deleted successfully',
            data: { applicant_document_id: id },
        });
    }
    catch (err) {
        console.error('Error deleting document:', err);
        return (0, response_1.sendError)(res, 'Failed to delete document', 500);
    }
};
exports.deleteApplicantDocument = deleteApplicantDocument;
/**
 * Get All Documents by Applicant ID
 * Returns all documents belonging to a specific applicant (without file data)
 */
const getDocumentsByApplicantId = async (req, res) => {
    try {
        const { applicant_id } = req.params;
        // Check if applicant exists
        const applicant = await prisma_config_1.default.applicant.findUnique({
            where: { applicant_id },
        });
        if (!applicant) {
            return (0, response_1.sendError)(res, 'Applicant not found', 404);
        }
        // Get all documents for this applicant
        const documents = await prisma_config_1.default.applicantDocument.findMany({
            where: { applicant_id },
            select: {
                applicant_document_id: true,
                applicant_id: true,
                document_type: true,
                // Exclude file_url to reduce response size
            },
            orderBy: { applicant_document_id: 'desc' },
        });
        return (0, response_1.sendSuccess)(res, {
            message: `Found ${documents.length} document(s) for applicant`,
            data: documents,
            count: documents.length,
        });
    }
    catch (err) {
        console.error('Error fetching documents by applicant:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch documents', 500);
    }
};
exports.getDocumentsByApplicantId = getDocumentsByApplicantId;
//# sourceMappingURL=applicantDocumentsController.js.map