"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAllApplicants = exports.deleteReference = exports.deleteWorkHistory = exports.deleteSocialProfile = exports.deleteApplicantDocument = exports.deleteApplicant = exports.getApplicantById = exports.updateApplicant = exports.createApplicant = void 0;
const prisma_config_1 = __importDefault(require("../../prisma.config"));
const response_1 = require("../../utils/response");
const zod_1 = require("zod");
const storage_blob_1 = require("@azure/storage-blob");
/**
 * Applicant Profile Controller with Azure Blob Storage
 *
 * Manages complete applicant profiles including:
 * - Personal information
 * - Contact details
 * - Demographics
 * - Documents (Resume & Cover Letter)
 * - Social profiles
 * - References
 * - Work history
 *
 * Features:
 * - Create complete applicant profile
 * - Update applicant information
 * - View applicant by ID with all related data
 * - Delete applicant and cleanup Azure storage
 * - Separate delete functions for related entities
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
    await containerClient.createIfNotExists({
        access: 'blob',
    });
    return containerClient;
};
/**
 * Generate unique blob name
 */
const generateBlobName = (applicantId, originalName, docType) => {
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 8);
    const sanitizedName = originalName.replace(/[^a-zA-Z0-9.-]/g, '_');
    return `${applicantId}/${docType}/${timestamp}-${randomStr}-${sanitizedName}`;
};
/**
 * Delete blob from Azure storage
 */
const deleteBlobFromAzure = async (blobName) => {
    try {
        const containerClient = await getContainerClient();
        const blockBlobClient = containerClient.getBlockBlobClient(blobName);
        await blockBlobClient.deleteIfExists();
        return true;
    }
    catch (err) {
        console.error('Error deleting blob from Azure:', err);
        return false;
    }
};
// ============================================
// VALIDATION SCHEMAS
// ============================================
const workHistorySchema = zod_1.z.object({
    title: zod_1.z.string().min(1, 'Job title is required'),
    description: zod_1.z.string().optional(),
});
const socialProfileSchema = zod_1.z.object({
    profile_title: zod_1.z.string().min(1, 'Profile title is required'),
    profile_link: zod_1.z.string().url('Valid URL is required'),
});
const createApplicantSchema = zod_1.z.object({
    // Required personal information
    full_name: zod_1.z.string().min(2, 'Full name must be at least 2 characters'),
    // Contact information (required)
    email: zod_1.z.string().email('Valid email is required'),
    phone: zod_1.z.string().min(10, 'Valid phone number is required'),
    address: zod_1.z.string().optional(),
    city: zod_1.z.string().optional(),
    // Demographics (optional)
    birth_date: zod_1.z.string().datetime().optional(),
    gender: zod_1.z.string().optional(),
    race: zod_1.z.string().optional(),
    disability: zod_1.z.string().optional(),
    work_authorization: zod_1.z.string().optional(),
    authorization_expiry: zod_1.z.string().datetime().optional(),
    // Status
    status: zod_1.z.enum(['APPLIED', 'PLACED', 'REJECTED', 'SHORTLISTED', 'INTERVIEWING']).optional(),
    // Cover letter text
    cover_letter: zod_1.z.string().optional(),
    // Social profiles
    social_profiles: zod_1.z.array(socialProfileSchema).optional(),
    // Work history
    work_history: zod_1.z.array(workHistorySchema).optional(),
    // References (user IDs)
    reference_user_ids: zod_1.z.array(zod_1.z.string().uuid()).optional(),
});
const updateApplicantSchema = zod_1.z.object({
    full_name: zod_1.z.string().min(2).optional(),
    status: zod_1.z.enum(['APPLIED', 'PLACED', 'REJECTED', 'SHORTLISTED', 'INTERVIEWING']).optional(),
    // Contact updates
    email: zod_1.z.string().email().optional(),
    phone: zod_1.z.string().min(10).optional(),
    address: zod_1.z.string().optional(),
    city: zod_1.z.string().optional(),
    // Demographics updates
    birth_date: zod_1.z.string().datetime().optional(),
    gender: zod_1.z.string().optional(),
    race: zod_1.z.string().optional(),
    disability: zod_1.z.string().optional(),
    work_authorization: zod_1.z.string().optional(),
    authorization_expiry: zod_1.z.string().datetime().optional(),
    // Cover letter
    cover_letter: zod_1.z.string().optional(),
    // Social profiles (replaces existing)
    social_profiles: zod_1.z.array(socialProfileSchema).optional(),
    // Work history (replaces existing)
    work_history: zod_1.z.array(workHistorySchema).optional(),
    // References (replaces existing)
    reference_user_ids: zod_1.z.array(zod_1.z.string().uuid()).optional(),
});
// ============================================
// CREATE APPLICANT
// ============================================
/**
 * Create a new applicant profile
 * POST /api/applicants
 *
 * Expects multipart/form-data with:
 * - resume: file upload (optional)
 * - Other fields from createApplicantSchema
 */
const createApplicant = async (req, res) => {
    try {
        const file = req.file; // Resume file from multer
        // Validate request body
        const validation = createApplicantSchema.safeParse(req.body);
        if (!validation.success) {
            const errors = validation.error.issues.map((err) => ({
                field: err.path.join('.'),
                message: err.message,
            }));
            return (0, response_1.sendError)(res, 'Validation failed', 400, errors);
        }
        const data = validation.data;
        // Check if applicant already exists by email
        const existingApplicant = await prisma_config_1.default.applicant.findFirst({
            where: {
                contact: {
                    email: data.email,
                },
            },
        });
        if (existingApplicant) {
            return (0, response_1.sendError)(res, 'Applicant with this email already exists', 409, [{
                    field: 'email',
                    message: `Applicant already exists with ID: ${existingApplicant.applicant_id}`,
                }]);
        }
        // Validate reference users exist
        if (data.reference_user_ids && data.reference_user_ids.length > 0) {
            const users = await prisma_config_1.default.user.findMany({
                where: {
                    user_id: {
                        in: data.reference_user_ids,
                    },
                },
            });
            if (users.length !== data.reference_user_ids.length) {
                return (0, response_1.sendError)(res, 'One or more reference users not found', 404);
            }
        }
        // Create applicant in a transaction
        const result = await prisma_config_1.default.$transaction(async (tx) => {
            // Create applicant with nested data
            const applicant = await tx.applicant.create({
                data: {
                    full_name: data.full_name,
                    status: data.status || 'APPLIED',
                    contact: {
                        create: {
                            email: data.email,
                            phone: data.phone,
                            address: data.address,
                            city: data.city,
                        },
                    },
                    demographic: data.birth_date || data.gender || data.race ? {
                        create: {
                            birth_date: data.birth_date ? new Date(data.birth_date) : null,
                            gender: data.gender,
                            race: data.race,
                            disability: data.disability,
                            work_authorization: data.work_authorization,
                            authorization_expiry: data.authorization_expiry
                                ? new Date(data.authorization_expiry)
                                : null,
                        },
                    } : undefined,
                },
                include: {
                    contact: true,
                    demographic: true,
                },
            });
            // Upload resume to Azure if provided
            let resumeMetadata = null;
            if (file) {
                try {
                    const containerClient = await getContainerClient();
                    const blobName = generateBlobName(applicant.applicant_id, file.originalname, 'resume');
                    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
                    await blockBlobClient.upload(file.buffer, file.buffer.length, {
                        blobHTTPHeaders: {
                            blobContentType: file.mimetype,
                        },
                    });
                    const fileUrl = blockBlobClient.url;
                    resumeMetadata = {
                        originalFileName: file.originalname,
                        mimeType: file.mimetype,
                        blobName: blobName,
                        size: file.size,
                        url: fileUrl,
                    };
                    await tx.applicantDocument.create({
                        data: {
                            applicant_id: applicant.applicant_id,
                            document_type: 'RESUME',
                            file_url: JSON.stringify(resumeMetadata),
                        },
                    });
                }
                catch (uploadErr) {
                    console.error('Error uploading resume to Azure:', uploadErr);
                    throw new Error('Failed to upload resume');
                }
            }
            // Add cover letter if provided
            if (data.cover_letter) {
                await tx.applicantDocument.create({
                    data: {
                        applicant_id: applicant.applicant_id,
                        document_type: 'COVER_LETTER',
                        file_url: JSON.stringify({
                            content: data.cover_letter,
                            type: 'text',
                        }),
                    },
                });
            }
            // Add social profiles
            if (data.social_profiles && data.social_profiles.length > 0) {
                await tx.applicantSocialProfiles.createMany({
                    data: data.social_profiles.map((profile) => ({
                        applicant_id: applicant.applicant_id,
                        profile_title: profile.profile_title,
                        profile_link: profile.profile_link,
                    })),
                });
            }
            // Add work history
            if (data.work_history && data.work_history.length > 0) {
                await tx.applicantWorkHistory.createMany({
                    data: data.work_history.map((work) => ({
                        applicant_id: applicant.applicant_id,
                        title: work.title,
                        description: work.description,
                    })),
                });
            }
            // Add references
            if (data.reference_user_ids && data.reference_user_ids.length > 0) {
                await tx.applicantReferences.createMany({
                    data: data.reference_user_ids.map((userId) => ({
                        applicant_id: applicant.applicant_id,
                        user_id: userId,
                    })),
                });
            }
            // Fetch complete applicant data
            return await tx.applicant.findUnique({
                where: { applicant_id: applicant.applicant_id },
                include: {
                    contact: true,
                    demographic: true,
                    documents: true,
                    social_profiles: true,
                    references: {
                        include: {
                            user: {
                                select: {
                                    user_id: true,
                                    name: true,
                                    email: true,
                                },
                            },
                        },
                    },
                    work_history: true,
                },
            });
        });
        return (0, response_1.sendSuccess)(res, {
            applicant: result,
            resume_uploaded: !!file,
            message: 'Applicant profile created successfully',
        }, 201);
    }
    catch (err) {
        console.error('Error creating applicant:', err);
        if (err.message === 'Failed to upload resume') {
            return (0, response_1.sendError)(res, 'Failed to upload resume to storage', 500);
        }
        if (err.code === 'P2002') {
            return (0, response_1.sendError)(res, 'Applicant with this email already exists', 409);
        }
        return (0, response_1.sendError)(res, 'Failed to create applicant profile', 500);
    }
};
exports.createApplicant = createApplicant;
// ============================================
// UPDATE APPLICANT
// ============================================
/**
 * Update applicant profile
 * PUT /api/applicants/:applicantId
 *
 * Expects multipart/form-data with:
 * - resume: file upload (optional, replaces existing)
 * - Other fields from updateApplicantSchema
 */
const updateApplicant = async (req, res) => {
    try {
        const { applicantId } = req.params;
        const file = req.file;
        // Validate applicant exists
        const existingApplicant = await prisma_config_1.default.applicant.findUnique({
            where: { applicant_id: applicantId },
            include: {
                documents: {
                    where: { document_type: 'RESUME' },
                    take: 1,
                },
                contact: true,
            },
        });
        if (!existingApplicant) {
            return (0, response_1.sendError)(res, 'Applicant not found', 404);
        }
        // Validate request body
        const validation = updateApplicantSchema.safeParse(req.body);
        if (!validation.success) {
            const errors = validation.error.issues.map((err) => ({
                field: err.path.join('.'),
                message: err.message,
            }));
            return (0, response_1.sendError)(res, 'Validation failed', 400, errors);
        }
        const data = validation.data;
        // Check if email is being changed and if it's already taken
        if (data.email && data.email !== existingApplicant.contact?.email) {
            const emailTaken = await prisma_config_1.default.applicant.findFirst({
                where: {
                    contact: {
                        email: data.email,
                    },
                    applicant_id: {
                        not: applicantId,
                    },
                },
            });
            if (emailTaken) {
                return (0, response_1.sendError)(res, 'Email is already in use by another applicant', 409);
            }
        }
        // Validate reference users exist
        if (data.reference_user_ids && data.reference_user_ids.length > 0) {
            const users = await prisma_config_1.default.user.findMany({
                where: {
                    user_id: {
                        in: data.reference_user_ids,
                    },
                },
            });
            if (users.length !== data.reference_user_ids.length) {
                return (0, response_1.sendError)(res, 'One or more reference users not found', 404);
            }
        }
        // Update applicant in a transaction
        const result = await prisma_config_1.default.$transaction(async (tx) => {
            // Update applicant basic info
            const updateData = {
                last_active_at: new Date(),
            };
            if (data.full_name)
                updateData.full_name = data.full_name;
            if (data.status)
                updateData.status = data.status;
            const applicant = await tx.applicant.update({
                where: { applicant_id: applicantId },
                data: updateData,
            });
            // Update contact information
            if (data.email || data.phone || data.address || data.city) {
                const contactUpdate = {};
                if (data.email)
                    contactUpdate.email = data.email;
                if (data.phone)
                    contactUpdate.phone = data.phone;
                if (data.address !== undefined)
                    contactUpdate.address = data.address;
                if (data.city !== undefined)
                    contactUpdate.city = data.city;
                await tx.applicantContact.update({
                    where: { applicant_id: applicantId },
                    data: contactUpdate,
                });
            }
            // Update demographics
            if (data.birth_date ||
                data.gender ||
                data.race ||
                data.disability ||
                data.work_authorization ||
                data.authorization_expiry) {
                const demoUpdate = {};
                if (data.birth_date)
                    demoUpdate.birth_date = new Date(data.birth_date);
                if (data.gender !== undefined)
                    demoUpdate.gender = data.gender;
                if (data.race !== undefined)
                    demoUpdate.race = data.race;
                if (data.disability !== undefined)
                    demoUpdate.disability = data.disability;
                if (data.work_authorization !== undefined)
                    demoUpdate.work_authorization = data.work_authorization;
                if (data.authorization_expiry)
                    demoUpdate.authorization_expiry = new Date(data.authorization_expiry);
                // Check if demographic record exists
                const existingDemo = await tx.applicantDemographic.findUnique({
                    where: { applicant_id: applicantId },
                });
                if (existingDemo) {
                    await tx.applicantDemographic.update({
                        where: { applicant_id: applicantId },
                        data: demoUpdate,
                    });
                }
                else {
                    await tx.applicantDemographic.create({
                        data: {
                            applicant_id: applicantId,
                            ...demoUpdate,
                        },
                    });
                }
            }
            // Handle resume upload (replaces existing)
            if (file) {
                try {
                    // Delete old resume from Azure if exists
                    const oldResume = existingApplicant.documents[0];
                    if (oldResume && oldResume.file_url) {
                        const oldMetadata = JSON.parse(oldResume.file_url);
                        if (oldMetadata.blobName) {
                            await deleteBlobFromAzure(oldMetadata.blobName);
                        }
                        // Delete old resume record
                        await tx.applicantDocument.delete({
                            where: { applicant_document_id: oldResume.applicant_document_id },
                        });
                    }
                    // Upload new resume
                    const containerClient = await getContainerClient();
                    const blobName = generateBlobName(applicantId, file.originalname, 'resume');
                    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
                    await blockBlobClient.upload(file.buffer, file.buffer.length, {
                        blobHTTPHeaders: {
                            blobContentType: file.mimetype,
                        },
                    });
                    const fileUrl = blockBlobClient.url;
                    const resumeMetadata = {
                        originalFileName: file.originalname,
                        mimeType: file.mimetype,
                        blobName: blobName,
                        size: file.size,
                        url: fileUrl,
                    };
                    await tx.applicantDocument.create({
                        data: {
                            applicant_id: applicantId,
                            document_type: 'RESUME',
                            file_url: JSON.stringify(resumeMetadata),
                        },
                    });
                }
                catch (uploadErr) {
                    console.error('Error uploading resume to Azure:', uploadErr);
                    throw new Error('Failed to upload resume');
                }
            }
            // Update cover letter
            if (data.cover_letter !== undefined) {
                // Delete existing cover letter
                await tx.applicantDocument.deleteMany({
                    where: {
                        applicant_id: applicantId,
                        document_type: 'COVER_LETTER',
                    },
                });
                // Create new cover letter if provided
                if (data.cover_letter) {
                    await tx.applicantDocument.create({
                        data: {
                            applicant_id: applicantId,
                            document_type: 'COVER_LETTER',
                            file_url: JSON.stringify({
                                content: data.cover_letter,
                                type: 'text',
                            }),
                        },
                    });
                }
            }
            // Update social profiles (replaces all)
            if (data.social_profiles !== undefined) {
                await tx.applicantSocialProfiles.deleteMany({
                    where: { applicant_id: applicantId },
                });
                if (data.social_profiles.length > 0) {
                    await tx.applicantSocialProfiles.createMany({
                        data: data.social_profiles.map((profile) => ({
                            applicant_id: applicantId,
                            profile_title: profile.profile_title,
                            profile_link: profile.profile_link,
                        })),
                    });
                }
            }
            // Update work history (replaces all)
            if (data.work_history !== undefined) {
                await tx.applicantWorkHistory.deleteMany({
                    where: { applicant_id: applicantId },
                });
                if (data.work_history.length > 0) {
                    await tx.applicantWorkHistory.createMany({
                        data: data.work_history.map((work) => ({
                            applicant_id: applicantId,
                            title: work.title,
                            description: work.description,
                        })),
                    });
                }
            }
            // Update references (replaces all)
            if (data.reference_user_ids !== undefined) {
                await tx.applicantReferences.deleteMany({
                    where: { applicant_id: applicantId },
                });
                if (data.reference_user_ids.length > 0) {
                    await tx.applicantReferences.createMany({
                        data: data.reference_user_ids.map((userId) => ({
                            applicant_id: applicantId,
                            user_id: userId,
                        })),
                    });
                }
            }
            // Fetch updated applicant data
            return await tx.applicant.findUnique({
                where: { applicant_id: applicantId },
                include: {
                    contact: true,
                    demographic: true,
                    documents: true,
                    social_profiles: true,
                    references: {
                        include: {
                            user: {
                                select: {
                                    user_id: true,
                                    name: true,
                                    email: true,
                                },
                            },
                        },
                    },
                    work_history: true,
                },
            });
        });
        return (0, response_1.sendSuccess)(res, {
            applicant: result,
            resume_updated: !!file,
            message: 'Applicant profile updated successfully',
        });
    }
    catch (err) {
        console.error('Error updating applicant:', err);
        if (err.message === 'Failed to upload resume') {
            return (0, response_1.sendError)(res, 'Failed to upload resume to storage', 500);
        }
        if (err.code === 'P2002') {
            return (0, response_1.sendError)(res, 'Email is already in use', 409);
        }
        return (0, response_1.sendError)(res, 'Failed to update applicant profile', 500);
    }
};
exports.updateApplicant = updateApplicant;
// ============================================
// VIEW APPLICANT BY ID
// ============================================
/**
 * Get applicant by ID with all related data
 * GET /api/applicants/:applicantId
 */
const getApplicantById = async (req, res) => {
    try {
        const { applicantId } = req.params;
        const applicant = await prisma_config_1.default.applicant.findUnique({
            where: { applicant_id: applicantId },
            include: {
                contact: true,
                demographic: true,
                documents: {
                    orderBy: {
                        applicant_document_id: 'asc',
                    },
                },
                social_profiles: {
                    orderBy: {
                        profile_title: 'asc',
                    },
                },
                references: {
                    include: {
                        user: {
                            select: {
                                user_id: true,
                                name: true,
                                email: true,
                            },
                        },
                    },
                },
                work_history: {
                    orderBy: {
                        applicant_work_history_id: 'asc',
                    },
                },
                applications: {
                    orderBy: {
                        applied_at: 'desc',
                    },
                    select: {
                        application_id: true,
                        status: true,
                        applied_at: true,
                        job: {
                            select: {
                                job_id: true,
                                job_title: true,
                                job_type: true,
                                location: true,
                                status: true,
                                organization: {
                                    select: {
                                        name: true,
                                    },
                                },
                            },
                        },
                    },
                },
            },
        });
        if (!applicant) {
            return (0, response_1.sendError)(res, 'Applicant not found', 404);
        }
        // Parse document metadata
        const documentsWithMetadata = applicant.documents.map((doc) => {
            try {
                const metadata = JSON.parse(doc.file_url);
                return {
                    document_id: doc.applicant_document_id,
                    document_type: doc.document_type,
                    metadata: metadata,
                };
            }
            catch {
                return {
                    document_id: doc.applicant_document_id,
                    document_type: doc.document_type,
                    metadata: null,
                };
            }
        });
        return (0, response_1.sendSuccess)(res, {
            applicant: {
                ...applicant,
                documents: documentsWithMetadata,
            },
        });
    }
    catch (err) {
        console.error('Error fetching applicant:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch applicant profile', 500);
    }
};
exports.getApplicantById = getApplicantById;
// ============================================
// DELETE APPLICANT
// ============================================
/**
 * Delete applicant and all related data
 * DELETE /api/applicants/:applicantId
 *
 * Cascading delete includes:
 * - Contact information
 * - Demographics
 * - Documents (and Azure blobs)
 * - Social profiles
 * - References
 * - Work history
 * - Applications
 */
const deleteApplicant = async (req, res) => {
    try {
        const { applicantId } = req.params;
        // Check if applicant exists and get documents
        const applicant = await prisma_config_1.default.applicant.findUnique({
            where: { applicant_id: applicantId },
            include: {
                documents: true,
                applications: {
                    select: {
                        application_id: true,
                    },
                },
            },
        });
        if (!applicant) {
            return (0, response_1.sendError)(res, 'Applicant not found', 404);
        }
        // Delete in transaction
        await prisma_config_1.default.$transaction(async (tx) => {
            // Delete Azure blobs for documents
            for (const doc of applicant.documents) {
                if (doc.document_type === 'RESUME' && doc.file_url) {
                    try {
                        const metadata = JSON.parse(doc.file_url);
                        if (metadata.blobName) {
                            await deleteBlobFromAzure(metadata.blobName);
                        }
                    }
                    catch (err) {
                        console.error('Error parsing document metadata:', err);
                    }
                }
            }
            // Prisma cascade will handle all related records
            await tx.applicant.delete({
                where: { applicant_id: applicantId },
            });
        });
        return (0, response_1.sendSuccess)(res, {
            message: 'Applicant profile deleted successfully',
            deleted_applicant_id: applicantId,
            deleted_applications_count: applicant.applications.length,
        });
    }
    catch (err) {
        console.error('Error deleting applicant:', err);
        if (err.code === 'P2003') {
            return (0, response_1.sendError)(res, 'Cannot delete applicant - related records exist that prevent deletion', 400);
        }
        return (0, response_1.sendError)(res, 'Failed to delete applicant profile', 500);
    }
};
exports.deleteApplicant = deleteApplicant;
// ============================================
// DELETE SPECIFIC RELATED ENTITIES
// ============================================
/**
 * Delete applicant document (Resume or Cover Letter)
 * DELETE /api/applicants/:applicantId/documents/:documentId
 */
const deleteApplicantDocument = async (req, res) => {
    try {
        const { applicantId, documentId } = req.params;
        // Find document
        const document = await prisma_config_1.default.applicantDocument.findFirst({
            where: {
                applicant_document_id: documentId,
                applicant_id: applicantId,
            },
        });
        if (!document) {
            return (0, response_1.sendError)(res, 'Document not found', 404);
        }
        // Delete Azure blob if it's a resume
        if (document.document_type === 'RESUME' && document.file_url) {
            try {
                const metadata = JSON.parse(document.file_url);
                if (metadata.blobName) {
                    await deleteBlobFromAzure(metadata.blobName);
                }
            }
            catch (err) {
                console.error('Error deleting blob:', err);
            }
        }
        // Delete document record
        await prisma_config_1.default.applicantDocument.delete({
            where: { applicant_document_id: documentId },
        });
        return (0, response_1.sendSuccess)(res, {
            message: `${document.document_type} deleted successfully`,
            deleted_document_id: documentId,
        });
    }
    catch (err) {
        console.error('Error deleting document:', err);
        return (0, response_1.sendError)(res, 'Failed to delete document', 500);
    }
};
exports.deleteApplicantDocument = deleteApplicantDocument;
/**
 * Delete social profile
 * DELETE /api/applicants/:applicantId/social-profiles/:profileId
 */
const deleteSocialProfile = async (req, res) => {
    try {
        const { applicantId, profileId } = req.params;
        const profile = await prisma_config_1.default.applicantSocialProfiles.findFirst({
            where: {
                applicant_social_profiles_id: profileId,
                applicant_id: applicantId,
            },
        });
        if (!profile) {
            return (0, response_1.sendError)(res, 'Social profile not found', 404);
        }
        await prisma_config_1.default.applicantSocialProfiles.delete({
            where: { applicant_social_profiles_id: profileId },
        });
        return (0, response_1.sendSuccess)(res, {
            message: 'Social profile deleted successfully',
            deleted_profile_id: profileId,
        });
    }
    catch (err) {
        console.error('Error deleting social profile:', err);
        return (0, response_1.sendError)(res, 'Failed to delete social profile', 500);
    }
};
exports.deleteSocialProfile = deleteSocialProfile;
/**
 * Delete work history entry
 * DELETE /api/applicants/:applicantId/work-history/:workHistoryId
 */
const deleteWorkHistory = async (req, res) => {
    try {
        const { applicantId, workHistoryId } = req.params;
        const workHistory = await prisma_config_1.default.applicantWorkHistory.findFirst({
            where: {
                applicant_work_history_id: workHistoryId,
                applicant_id: applicantId,
            },
        });
        if (!workHistory) {
            return (0, response_1.sendError)(res, 'Work history entry not found', 404);
        }
        await prisma_config_1.default.applicantWorkHistory.delete({
            where: { applicant_work_history_id: workHistoryId },
        });
        return (0, response_1.sendSuccess)(res, {
            message: 'Work history entry deleted successfully',
            deleted_work_history_id: workHistoryId,
        });
    }
    catch (err) {
        console.error('Error deleting work history:', err);
        return (0, response_1.sendError)(res, 'Failed to delete work history entry', 500);
    }
};
exports.deleteWorkHistory = deleteWorkHistory;
/**
 * Delete reference
 * DELETE /api/applicants/:applicantId/references/:referenceId
 */
const deleteReference = async (req, res) => {
    try {
        const { applicantId, referenceId } = req.params;
        const reference = await prisma_config_1.default.applicantReferences.findFirst({
            where: {
                applicant_references_id: referenceId,
                applicant_id: applicantId,
            },
        });
        if (!reference) {
            return (0, response_1.sendError)(res, 'Reference not found', 404);
        }
        await prisma_config_1.default.applicantReferences.delete({
            where: { applicant_references_id: referenceId },
        });
        return (0, response_1.sendSuccess)(res, {
            message: 'Reference deleted successfully',
            deleted_reference_id: referenceId,
        });
    }
    catch (err) {
        console.error('Error deleting reference:', err);
        return (0, response_1.sendError)(res, 'Failed to delete reference', 500);
    }
};
exports.deleteReference = deleteReference;
// ============================================
// UTILITY FUNCTIONS
// ============================================
/**
 * Get all applicants with pagination and filters
 * GET /api/applicants?page=1&limit=10&status=APPLIED&search=john
 */
const getAllApplicants = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const status = req.query.status;
        const search = req.query.search;
        const skip = (page - 1) * limit;
        // Build where clause
        const where = {};
        if (status) {
            where.status = status;
        }
        if (search) {
            where.OR = [
                { full_name: { contains: search, mode: 'insensitive' } },
                {
                    contact: {
                        email: { contains: search, mode: 'insensitive' },
                    },
                },
                {
                    contact: {
                        phone: { contains: search, mode: 'insensitive' },
                    },
                },
            ];
        }
        // Get total count
        const total = await prisma_config_1.default.applicant.count({ where });
        // Get applicants
        const applicants = await prisma_config_1.default.applicant.findMany({
            where,
            skip,
            take: limit,
            orderBy: {
                created_at: 'desc',
            },
            include: {
                contact: {
                    select: {
                        email: true,
                        phone: true,
                        city: true,
                    },
                },
                documents: {
                    select: {
                        document_type: true,
                    },
                },
                applications: {
                    select: {
                        application_id: true,
                        status: true,
                    },
                },
            },
        });
        return (0, response_1.sendSuccess)(res, {
            applicants: applicants.map((app) => ({
                ...app,
                has_resume: app.documents.some((d) => d.document_type === 'RESUME'),
                has_cover_letter: app.documents.some((d) => d.document_type === 'COVER_LETTER'),
                applications_count: app.applications.length,
            })),
            pagination: {
                page,
                limit,
                total,
                total_pages: Math.ceil(total / limit),
            },
        });
    }
    catch (err) {
        console.error('Error fetching applicants:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch applicants', 500);
    }
};
exports.getAllApplicants = getAllApplicants;
//# sourceMappingURL=applicantProfileController.js.map