"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDocumentsByApplicantId = exports.deleteApplicantDocument = exports.getApplicantDocumentById = exports.getAllApplicantDocuments = exports.downloadApplicantDocument = exports.updateApplicantDocumentWithFile = exports.createApplicantDocumentWithFile = void 0;
const prisma_config_1 = __importDefault(require("../../prisma.config"));
const response_1 = require("../../utils/response");
const storage_blob_1 = require("@azure/storage-blob");
/**
 * Applicant Document CRUD Controller with Azure Blob Storage
 *
 * Validation Rules:
 * - applicant_id: Required UUID
 * - document_type: Required document type (e.g., "Resume", "Cover Letter", "ID Proof", etc.)
 * - file_url: File upload (PDF, images, documents) - stored in Azure Blob Storage
 */
// Initialize Azure Blob Service Client
if (!process.env.AZURE_STORAGE_CONNECTION_STRING) {
    throw new Error('AZURE_STORAGE_CONNECTION_STRING is not defined in environment variables');
}
const blobServiceClient = storage_blob_1.BlobServiceClient.fromConnectionString(process.env.AZURE_STORAGE_CONNECTION_STRING);
const containerName = process.env.AZURE_CONTAINER_NAME || 'applicant-documents';
/**
 * Get container client (creates container if it doesn't exist)
 */
const getContainerClient = async () => {
    const containerClient = blobServiceClient.getContainerClient(containerName);
    // Create container if it doesn't exist
    await containerClient.createIfNotExists({
        access: 'blob', // Public read access for blobs
    });
    return containerClient;
};
/**
 * Generate unique blob name
 */
const generateBlobName = (applicantId, originalName) => {
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 8);
    const sanitizedName = originalName.replace(/[^a-zA-Z0-9.-]/g, '_');
    return `${applicantId}/${timestamp}-${randomStr}-${sanitizedName}`;
};
/**
 * Create Applicant Document with File Upload to Azure Blob
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
        // Upload to Azure Blob Storage
        const containerClient = await getContainerClient();
        const blobName = generateBlobName(applicant_id, file.originalname);
        const blockBlobClient = containerClient.getBlockBlobClient(blobName);
        // Upload file buffer to Azure
        await blockBlobClient.upload(file.buffer, file.buffer.length, {
            blobHTTPHeaders: {
                blobContentType: file.mimetype,
            },
        });
        // Get the blob URL
        const fileUrl = blockBlobClient.url;
        // Store metadata in database
        const fileMetadata = {
            originalFileName: file.originalname,
            mimeType: file.mimetype,
            blobName: blobName,
            size: file.size,
            url: fileUrl,
        };
        // Create document record in database
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
                url: fileUrl,
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
            // Delete old file from Azure if it exists
            if (existingDocument.file_url) {
                try {
                    const oldMetadata = JSON.parse(existingDocument.file_url);
                    if (oldMetadata.blobName) {
                        const containerClient = await getContainerClient();
                        const oldBlobClient = containerClient.getBlockBlobClient(oldMetadata.blobName);
                        await oldBlobClient.deleteIfExists();
                    }
                }
                catch (err) {
                    console.warn('Error deleting old blob:', err);
                }
            }
            // Upload new file to Azure
            const containerClient = await getContainerClient();
            const blobName = generateBlobName(existingDocument.applicant_id, file.originalname);
            const blockBlobClient = containerClient.getBlockBlobClient(blobName);
            await blockBlobClient.upload(file.buffer, file.buffer.length, {
                blobHTTPHeaders: {
                    blobContentType: file.mimetype,
                },
            });
            const fileUrl = blockBlobClient.url;
            const fileMetadata = {
                originalFileName: file.originalname,
                mimeType: file.mimetype,
                blobName: blobName,
                size: file.size,
                url: fileUrl,
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
 * Download Applicant Document from Azure Blob
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
            // Parse file metadata
            const fileMetadata = JSON.parse(document.file_url);
            if (!fileMetadata.blobName) {
                return (0, response_1.sendError)(res, 'Document blob reference not found', 404);
            }
            // Download from Azure Blob Storage
            const containerClient = await getContainerClient();
            const blockBlobClient = containerClient.getBlockBlobClient(fileMetadata.blobName);
            // Check if blob exists
            const exists = await blockBlobClient.exists();
            if (!exists) {
                return (0, response_1.sendError)(res, 'Document file not found in storage', 404);
            }
            // Download blob
            const downloadResponse = await blockBlobClient.download();
            if (!downloadResponse.readableStreamBody) {
                return (0, response_1.sendError)(res, 'Failed to download document', 500);
            }
            // Set response headers
            const originalFileName = fileMetadata.originalFileName || `${document.document_type}.pdf`;
            const sanitizedFileName = originalFileName
                .replace(/[^a-zA-Z0-9._\- ]/g, '')
                .replace(/\s+/g, '_')
                .trim();
            const mimeType = fileMetadata.mimeType || 'application/octet-stream';
            res.setHeader('Content-Type', mimeType);
            res.setHeader('Content-Disposition', `attachment; filename="${sanitizedFileName}"`);
            if (downloadResponse.contentLength) {
                res.setHeader('Content-Length', downloadResponse.contentLength);
            }
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            // Stream the blob to response
            downloadResponse.readableStreamBody.pipe(res);
        }
        catch (err) {
            console.error('Error downloading from Azure:', err);
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
 * Delete Applicant Document (also deletes from Azure Blob)
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
        // Delete from Azure Blob Storage
        if (document.file_url) {
            try {
                const fileMetadata = JSON.parse(document.file_url);
                if (fileMetadata.blobName) {
                    const containerClient = await getContainerClient();
                    const blockBlobClient = containerClient.getBlockBlobClient(fileMetadata.blobName);
                    await blockBlobClient.deleteIfExists();
                }
            }
            catch (err) {
                console.warn('Error deleting blob from Azure:', err);
                // Continue with database deletion even if blob deletion fails
            }
        }
        // Delete from database
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