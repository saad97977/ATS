"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteOrganizationLicense = exports.getOrganizationLicenseById = exports.getAllOrganizationLicenses = exports.downloadOrganizationLicense = exports.updateOrganizationLicenseWithFile = exports.createOrganizationLicenseWithFile = void 0;
const prisma_config_1 = __importDefault(require("../../prisma.config"));
const response_1 = require("../../utils/response");
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
const createOrganizationLicenseWithFile = async (req, res) => {
    try {
        const { organization_id, license_name, expiration_date } = req.body;
        const file = req.file;
        // Validate required fields
        if (!organization_id) {
            return (0, response_1.sendError)(res, 'Organization ID is required', 400);
        }
        if (!license_name) {
            return (0, response_1.sendError)(res, 'License name is required', 400);
        }
        if (!file) {
            return (0, response_1.sendError)(res, 'License document file is required', 400);
        }
        // Check if organization exists
        const organization = await prisma_config_1.default.organization.findUnique({
            where: { organization_id },
        });
        if (!organization) {
            return (0, response_1.sendError)(res, 'Organization not found', 404);
        }
        // ADD THIS: Check if license name already exists
        const existingLicense = await prisma_config_1.default.organizationLicense.findFirst({
            where: {
                organization_id,
                license_name,
            },
        });
        if (existingLicense) {
            return (0, response_1.sendError)(res, 'A license with this name already exists for the organization', 409);
        }
        // Convert file buffer to base64 and store with metadata
        const fileBase64 = file.buffer.toString('base64');
        const fileMetadata = {
            originalFileName: file.originalname,
            mimeType: file.mimetype,
            fileData: fileBase64,
        };
        // Create license record in database with file content and metadata
        const newLicense = await prisma_config_1.default.organizationLicense.create({
            data: {
                organization_id,
                license_name,
                license_document: JSON.stringify(fileMetadata),
                expiration_date: expiration_date ? new Date(expiration_date) : null,
            },
        });
        return (0, response_1.sendSuccess)(res, {
            message: 'License uploaded successfully',
            data: newLicense,
            file: {
                filename: file.originalname,
                originalName: file.originalname,
                size: file.size,
                mimeType: file.mimetype,
            },
        }, 201);
    }
    catch (err) {
        console.error('Error uploading license:', err);
        return (0, response_1.sendError)(res, 'Failed to upload license', 500);
    }
};
exports.createOrganizationLicenseWithFile = createOrganizationLicenseWithFile;
/**
 * Update Organization License with Optional File Upload
 * Allows updating license name and/or uploading a new document
 */
const updateOrganizationLicenseWithFile = async (req, res) => {
    try {
        const { id } = req.params;
        const { license_name, expiration_date } = req.body;
        const file = req.file;
        // Check if license exists
        const existingLicense = await prisma_config_1.default.organizationLicense.findUnique({
            where: { organization_license_id: id },
        });
        if (!existingLicense) {
            return (0, response_1.sendError)(res, 'Organization License not found', 404);
        }
        // Prepare update data
        const updateData = {};
        if (license_name) {
            updateData.license_name = license_name;
        }
        if (expiration_date) {
            updateData.expiration_date = new Date(expiration_date);
        }
        if (file) {
            // Convert file buffer to base64 and store with metadata
            const fileBase64 = file.buffer.toString('base64');
            const fileMetadata = {
                originalFileName: file.originalname,
                mimeType: file.mimetype,
                fileData: fileBase64,
            };
            updateData.license_document = JSON.stringify(fileMetadata);
        }
        // If no updates provided
        if (Object.keys(updateData).length === 0) {
            return (0, response_1.sendError)(res, 'No fields to update', 400);
        }
        // Update license in database
        const updatedLicense = await prisma_config_1.default.organizationLicense.update({
            where: { organization_license_id: id },
            data: updateData,
        });
        return (0, response_1.sendSuccess)(res, {
            message: 'License updated successfully',
            data: updatedLicense,
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
        console.error('Error updating license:', err);
        return (0, response_1.sendError)(res, 'Failed to update license', 500);
    }
};
exports.updateOrganizationLicenseWithFile = updateOrganizationLicenseWithFile;
/**
 * Download Organization License Document
 * Extracts file from database and returns for download with proper extension
 */
const downloadOrganizationLicense = async (req, res) => {
    try {
        const { id } = req.params;
        // Get license from database
        const license = await prisma_config_1.default.organizationLicense.findUnique({
            where: { organization_license_id: id },
        });
        if (!license) {
            return (0, response_1.sendError)(res, 'Organization License not found', 404);
        }
        if (!license.license_document) {
            return (0, response_1.sendError)(res, 'License document not found', 404);
        }
        try {
            // Try to parse JSON metadata
            let originalFileName = null;
            let mimeType = 'application/octet-stream';
            let fileData = null;
            try {
                const fileMetadata = JSON.parse(license.license_document);
                originalFileName = fileMetadata.originalFileName;
                mimeType = fileMetadata.mimeType || 'application/octet-stream';
                fileData = fileMetadata.fileData;
            }
            catch (parseErr) {
                console.warn('JSON parsing failed, checking if it\'s plain base64');
                // If JSON parsing fails, assume it's plain base64 (old format)
                fileData = license.license_document;
            }
            if (!fileData) {
                return (0, response_1.sendError)(res, 'License file data is missing or corrupted', 500);
            }
            try {
                // Convert base64 string back to buffer
                const fileBuffer = Buffer.from(fileData, 'base64');
                // Use original filename if available, otherwise use license_name with .pdf
                if (!originalFileName) {
                    originalFileName = `${license.license_name}.pdf`;
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
                return (0, response_1.sendError)(res, 'Failed to process license document', 500);
            }
        }
        catch (err) {
            console.error('Unexpected error in download:', err);
            return (0, response_1.sendError)(res, 'Failed to download license', 500);
        }
    }
    catch (err) {
        console.error('Error downloading license:', err);
        return (0, response_1.sendError)(res, 'Failed to download license', 500);
    }
};
exports.downloadOrganizationLicense = downloadOrganizationLicense;
/**
 * Organization License CRUD Controller - Standard operations
 * Provides: GET all, GET by id, DELETE
 * Note: GET operations exclude license_document (file content) to reduce response size
 */
// Get All Licenses (without file data)
const getAllOrganizationLicenses = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
        const skip = (page - 1) * limit;
        const [licenses, total] = await Promise.all([
            prisma_config_1.default.organizationLicense.findMany({
                skip,
                take: limit,
                select: {
                    organization_license_id: true,
                    organization_id: true,
                    license_name: true,
                    expiration_date: true,
                    // Exclude license_document to reduce response size
                },
                orderBy: { organization_license_id: 'desc' },
            }),
            prisma_config_1.default.organizationLicense.count(),
        ]);
        return (0, response_1.sendSuccess)(res, {
            data: licenses,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit),
            },
        });
    }
    catch (err) {
        console.error('Error fetching licenses:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch licenses', 500);
    }
};
exports.getAllOrganizationLicenses = getAllOrganizationLicenses;
// Get Single License by ID (without file data)
const getOrganizationLicenseById = async (req, res) => {
    try {
        const { id } = req.params;
        const license = await prisma_config_1.default.organizationLicense.findUnique({
            where: { organization_license_id: id },
            select: {
                organization_license_id: true,
                organization_id: true,
                license_name: true,
                expiration_date: true,
                // Exclude license_document to reduce response size
            },
        });
        if (!license) {
            return (0, response_1.sendError)(res, 'Organization License not found', 404);
        }
        return (0, response_1.sendSuccess)(res, {
            data: license,
        });
    }
    catch (err) {
        console.error('Error fetching license:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch license', 500);
    }
};
exports.getOrganizationLicenseById = getOrganizationLicenseById;
// Delete License
const deleteOrganizationLicense = async (req, res) => {
    try {
        const { id } = req.params;
        const license = await prisma_config_1.default.organizationLicense.findUnique({
            where: { organization_license_id: id },
        });
        if (!license) {
            return (0, response_1.sendError)(res, 'Organization License not found', 404);
        }
        await prisma_config_1.default.organizationLicense.delete({
            where: { organization_license_id: id },
        });
        return (0, response_1.sendSuccess)(res, {
            message: 'License deleted successfully',
            data: { organization_license_id: id },
        });
    }
    catch (err) {
        console.error('Error deleting license:', err);
        return (0, response_1.sendError)(res, 'Failed to delete license', 500);
    }
};
exports.deleteOrganizationLicense = deleteOrganizationLicense;
//# sourceMappingURL=organizationLicenseController.js.map