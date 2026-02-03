"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getApplicantApplications = exports.withdrawApplication = exports.downloadApplicationResume = exports.getApplicationStatus = exports.checkExistingApplication = exports.submitApplication = void 0;
const prisma_config_1 = __importDefault(require("../../prisma.config"));
const response_1 = require("../../utils/response");
const zod_1 = require("zod");
const storage_blob_1 = require("@azure/storage-blob");
/**
 * Public Application Controller with Azure Blob Storage
 *
 * Handles job applications from the public job board
 * Creates both Applicant and Application records
 * Uploads resume to Azure Blob Storage
 *
 * Application Flow:
 * 1. Validate job is OPEN and accepting applications
 * 2. Upload resume to Azure Blob Storage (if provided)
 * 3. Check if applicant already exists by email
 * 4. Create/Update applicant record
 * 5. Create application record with resume document
 * 6. Link applicant to job
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
// Validation schema for new job application
const createApplicationSchema = zod_1.z.object({
    // Job information
    job_id: zod_1.z.string().uuid('Valid job ID is required'),
    // Applicant personal information
    full_name: zod_1.z.string().min(2, 'Full name must be at least 2 characters'),
    email: zod_1.z.string().email('Valid email is required'),
    phone: zod_1.z.string().min(10, 'Valid phone number is required'),
    // Optional contact details
    address: zod_1.z.string().optional(),
    city: zod_1.z.string().optional(),
    // Optional demographic information
    birth_date: zod_1.z.string().datetime().optional(),
    gender: zod_1.z.string().optional(),
    race: zod_1.z.string().optional(),
    disability: zod_1.z.string().optional(),
    work_authorization: zod_1.z.string().optional(),
    authorization_expiry: zod_1.z.string().datetime().optional(),
    // Application source
    source: zod_1.z.string().optional().default('PUBLIC_JOB_BOARD'),
    // Cover letter text
    cover_letter: zod_1.z.string().optional(),
    // Social profiles
    linkedin_url: zod_1.z.string().url().optional(),
    portfolio_url: zod_1.z.string().url().optional(),
    // Work history
    work_history: zod_1.z.array(zod_1.z.object({
        title: zod_1.z.string(),
        description: zod_1.z.string().optional(),
    })).optional(),
});
/**
 * Submit a job application with file upload
 * POST /api/public/jobs/:jobId/apply
 *
 * Expects multipart/form-data with:
 * - resume: file upload (optional but recommended)
 * - Other fields from createApplicationSchema
 */
const submitApplication = async (req, res) => {
    try {
        const { jobId } = req.params;
        const file = req.file; // Resume file from multer
        // Validate request body
        const validation = createApplicationSchema.safeParse({
            ...req.body,
            job_id: jobId,
        });
        if (!validation.success) {
            const errors = validation.error.issues.map((err) => ({
                field: err.path.join('.'),
                message: err.message,
            }));
            return (0, response_1.sendError)(res, 'Validation failed', 400, errors);
        }
        const data = validation.data;
        // Check if job exists and is accepting applications
        const job = await prisma_config_1.default.job.findFirst({
            where: {
                job_id: jobId,
                status: 'OPEN',
                organization: {
                    status: 'ACTIVE',
                },
            },
            include: {
                organization: {
                    select: {
                        name: true,
                    },
                },
            },
        });
        if (!job) {
            return (0, response_1.sendError)(res, 'Job not found or not currently accepting applications', 404);
        }
        // Check if positions are still available
        if (job.open_positions !== null && job.open_positions <= 0) {
            return (0, response_1.sendError)(res, 'No open positions available for this job', 400);
        }
        // Check if applicant already exists by email
        let applicant = await prisma_config_1.default.applicant.findFirst({
            where: {
                contact: {
                    email: data.email,
                },
            },
            include: {
                contact: true,
                demographic: true,
            },
        });
        // Check if applicant already applied to this job
        if (applicant) {
            const existingApplication = await prisma_config_1.default.application.findFirst({
                where: {
                    job_id: jobId,
                    applicant_id: applicant.applicant_id,
                },
            });
            if (existingApplication) {
                return (0, response_1.sendError)(res, 'You have already applied to this job', 409, [{
                        field: 'duplicate_application',
                        message: `Application already exists with ID: ${existingApplication.application_id}`,
                    }]);
            }
        }
        // Create application in a transaction
        const result = await prisma_config_1.default.$transaction(async (tx) => {
            // Create or update applicant
            if (!applicant) {
                // Create new applicant
                applicant = await tx.applicant.create({
                    data: {
                        full_name: data.full_name,
                        status: 'APPLIED',
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
            }
            else {
                // Update existing applicant's last active time
                applicant = await tx.applicant.update({
                    where: { applicant_id: applicant.applicant_id },
                    data: {
                        last_active_at: new Date(),
                    },
                    include: {
                        contact: true,
                        demographic: true,
                    },
                });
            }
            // Upload resume to Azure Blob Storage if provided
            let resumeMetadata = null;
            if (file) {
                try {
                    const containerClient = await getContainerClient();
                    const blobName = generateBlobName(applicant.applicant_id, file.originalname);
                    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
                    // Upload file buffer to Azure
                    await blockBlobClient.upload(file.buffer, file.buffer.length, {
                        blobHTTPHeaders: {
                            blobContentType: file.mimetype,
                        },
                    });
                    // Get the blob URL
                    const fileUrl = blockBlobClient.url;
                    // Create file metadata
                    resumeMetadata = {
                        originalFileName: file.originalname,
                        mimeType: file.mimetype,
                        blobName: blobName,
                        size: file.size,
                        url: fileUrl,
                    };
                    // Create resume document in database
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
            // Add cover letter as document if provided
            if (data.cover_letter) {
                // Store cover letter as text in a separate document
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
            if (data.linkedin_url) {
                await tx.applicantSocialProfiles.create({
                    data: {
                        applicant_id: applicant.applicant_id,
                        profile_title: 'LinkedIn',
                        profile_link: data.linkedin_url,
                    },
                });
            }
            if (data.portfolio_url) {
                await tx.applicantSocialProfiles.create({
                    data: {
                        applicant_id: applicant.applicant_id,
                        profile_title: 'Portfolio',
                        profile_link: data.portfolio_url,
                    },
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
            // Create application
            const application = await tx.application.create({
                data: {
                    job_id: jobId,
                    applicant_id: applicant.applicant_id,
                    source: data.source || 'PUBLIC_JOB_BOARD',
                    status: 'APPLIED',
                },
                include: {
                    job: {
                        select: {
                            job_id: true,
                            job_title: true,
                            organization: {
                                select: {
                                    name: true,
                                },
                            },
                        },
                    },
                    applicant: {
                        select: {
                            applicant_id: true,
                            full_name: true,
                            contact: {
                                select: {
                                    email: true,
                                    phone: true,
                                },
                            },
                        },
                    },
                },
            });
            // Decrement open_positions if tracking is enabled
            if (job.open_positions !== null && job.open_positions > 0) {
                await tx.job.update({
                    where: { job_id: jobId },
                    data: {
                        open_positions: {
                            decrement: 1,
                        },
                    },
                });
            }
            return { application, resumeMetadata };
        });
        return (0, response_1.sendSuccess)(res, {
            application: result.application,
            resume_uploaded: !!file,
            ...(file && {
                resume: {
                    filename: file.originalname,
                    size: file.size,
                    mimeType: file.mimetype,
                },
            }),
            message: `Application submitted successfully for ${job.job_title} at ${job.organization.name}`,
        }, 201);
    }
    catch (err) {
        console.error('Error submitting application:', err);
        if (err.message === 'Failed to upload resume') {
            return (0, response_1.sendError)(res, 'Failed to upload resume to storage', 500);
        }
        if (err.code === 'P2002') {
            return (0, response_1.sendError)(res, 'Duplicate application detected', 409);
        }
        if (err.code === 'P2003') {
            return (0, response_1.sendError)(res, 'Invalid job or applicant reference', 404);
        }
        return (0, response_1.sendError)(res, 'Failed to submit application', 500);
    }
};
exports.submitApplication = submitApplication;
/**
 * Check if applicant has already applied to a job
 * GET /api/public/jobs/:jobId/check-application?email=xxx
 */
const checkExistingApplication = async (req, res) => {
    try {
        const { jobId } = req.params;
        const { email } = req.query;
        if (!email) {
            return (0, response_1.sendError)(res, 'Email is required', 400);
        }
        // Find applicant by email
        const applicant = await prisma_config_1.default.applicant.findFirst({
            where: {
                contact: {
                    email: email,
                },
            },
        });
        if (!applicant) {
            return (0, response_1.sendSuccess)(res, {
                has_applied: false,
                message: 'No previous applications found',
            });
        }
        // Check if application exists for this job
        const application = await prisma_config_1.default.application.findFirst({
            where: {
                job_id: jobId,
                applicant_id: applicant.applicant_id,
            },
            select: {
                application_id: true,
                status: true,
                applied_at: true,
            },
        });
        if (!application) {
            return (0, response_1.sendSuccess)(res, {
                has_applied: false,
                message: 'You have not applied to this job yet',
            });
        }
        return (0, response_1.sendSuccess)(res, {
            has_applied: true,
            application: {
                application_id: application.application_id,
                status: application.status,
                applied_at: application.applied_at,
            },
            message: 'You have already applied to this job',
        });
    }
    catch (err) {
        console.error('Error checking application:', err);
        return (0, response_1.sendError)(res, 'Failed to check application status', 500);
    }
};
exports.checkExistingApplication = checkExistingApplication;
/**
 * Get application status with resume download link
 * GET /api/public/applications/:applicationId
 *
 * Allows applicants to check their application status
 * Requires application ID (sent via email after applying)
 */
const getApplicationStatus = async (req, res) => {
    try {
        const { applicationId } = req.params;
        if (!applicationId) {
            return (0, response_1.sendError)(res, 'Application ID is required', 400);
        }
        const application = await prisma_config_1.default.application.findUnique({
            where: {
                application_id: applicationId,
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
                        organization: {
                            select: {
                                name: true,
                                website: true,
                            },
                        },
                    },
                },
                applicant: {
                    select: {
                        full_name: true,
                        contact: {
                            select: {
                                email: true,
                            },
                        },
                        documents: {
                            where: {
                                document_type: 'RESUME',
                            },
                            select: {
                                applicant_document_id: true,
                                document_type: true,
                            },
                            take: 1,
                        },
                    },
                },
                interviews: {
                    select: {
                        interview_id: true,
                        interview_date: true,
                        status: true,
                    },
                },
                pipeline_stages: {
                    orderBy: {
                        pipeline_date: 'desc',
                    },
                    select: {
                        stage_name: true,
                        pipeline_date: true,
                    },
                    take: 1,
                },
            },
        });
        if (!application) {
            return (0, response_1.sendError)(res, 'Application not found', 404);
        }
        return (0, response_1.sendSuccess)(res, {
            application: {
                application_id: application.application_id,
                status: application.status,
                applied_at: application.applied_at,
                current_stage: application.pipeline_stages[0]?.stage_name || 'Application Received',
                job: application.job,
                applicant: {
                    full_name: application.applicant.full_name,
                    contact: application.applicant.contact,
                    has_resume: application.applicant.documents.length > 0,
                    resume_id: application.applicant.documents[0]?.applicant_document_id || null,
                },
                has_interview: application.interviews.length > 0,
                next_interview: application.interviews[0] || null,
            },
        });
    }
    catch (err) {
        console.error('Error fetching application status:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch application status', 500);
    }
};
exports.getApplicationStatus = getApplicationStatus;
/**
 * Download applicant's resume
 * GET /api/public/applications/:applicationId/resume
 *
 * Allows downloading resume for a specific application
 * Public endpoint for applicants to download their own resume
 */
const downloadApplicationResume = async (req, res) => {
    try {
        const { applicationId } = req.params;
        // Find application with resume
        const application = await prisma_config_1.default.application.findUnique({
            where: { application_id: applicationId },
            include: {
                applicant: {
                    include: {
                        documents: {
                            where: {
                                document_type: 'RESUME',
                            },
                            take: 1,
                        },
                    },
                },
            },
        });
        if (!application) {
            return (0, response_1.sendError)(res, 'Application not found', 404);
        }
        const resumeDocument = application.applicant.documents[0];
        if (!resumeDocument || !resumeDocument.file_url) {
            return (0, response_1.sendError)(res, 'Resume not found for this application', 404);
        }
        try {
            // Parse file metadata
            const fileMetadata = JSON.parse(resumeDocument.file_url);
            if (!fileMetadata.blobName) {
                return (0, response_1.sendError)(res, 'Resume file reference not found', 404);
            }
            // Download from Azure Blob Storage
            const containerClient = await getContainerClient();
            const blockBlobClient = containerClient.getBlockBlobClient(fileMetadata.blobName);
            // Check if blob exists
            const exists = await blockBlobClient.exists();
            if (!exists) {
                return (0, response_1.sendError)(res, 'Resume file not found in storage', 404);
            }
            // Download blob
            const downloadResponse = await blockBlobClient.download();
            if (!downloadResponse.readableStreamBody) {
                return (0, response_1.sendError)(res, 'Failed to download resume', 500);
            }
            // Set response headers
            const originalFileName = fileMetadata.originalFileName || 'resume.pdf';
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
            console.error('Error downloading resume from Azure:', err);
            return (0, response_1.sendError)(res, 'Failed to download resume', 500);
        }
    }
    catch (err) {
        console.error('Error downloading application resume:', err);
        return (0, response_1.sendError)(res, 'Failed to download resume', 500);
    }
};
exports.downloadApplicationResume = downloadApplicationResume;
/**
 * Withdraw application
 * DELETE /api/public/applications/:applicationId/withdraw
 *
 * Allows applicants to withdraw their application
 * Requires email verification for security
 */
const withdrawApplication = async (req, res) => {
    try {
        const { applicationId } = req.params;
        const { email } = req.body;
        if (!applicationId) {
            return (0, response_1.sendError)(res, 'Application ID is required', 400);
        }
        if (!email) {
            return (0, response_1.sendError)(res, 'Email is required for verification', 400);
        }
        // Find application with email verification
        const application = await prisma_config_1.default.application.findFirst({
            where: {
                application_id: applicationId,
                applicant: {
                    contact: {
                        email: email,
                    },
                },
            },
            include: {
                job: {
                    select: {
                        job_id: true,
                        open_positions: true,
                    },
                },
            },
        });
        if (!application) {
            return (0, response_1.sendError)(res, 'Application not found or email does not match', 404);
        }
        // Check if application can be withdrawn
        if (application.status === 'HIRED') {
            return (0, response_1.sendError)(res, 'Cannot withdraw application - already hired', 400);
        }
        // Delete application and increment open positions
        await prisma_config_1.default.$transaction(async (tx) => {
            await tx.application.delete({
                where: {
                    application_id: applicationId,
                },
            });
            // Increment open_positions if tracking is enabled
            if (application.job.open_positions !== null) {
                await tx.job.update({
                    where: { job_id: application.job.job_id },
                    data: {
                        open_positions: {
                            increment: 1,
                        },
                    },
                });
            }
        });
        return (0, response_1.sendSuccess)(res, {
            message: 'Application withdrawn successfully',
        });
    }
    catch (err) {
        console.error('Error withdrawing application:', err);
        return (0, response_1.sendError)(res, 'Failed to withdraw application', 500);
    }
};
exports.withdrawApplication = withdrawApplication;
/**
 * Get applicant's application history with resume info
 * GET /api/public/applicants/applications?email=xxx
 *
 * Returns all applications for an applicant by email
 */
const getApplicantApplications = async (req, res) => {
    try {
        const { email } = req.query;
        if (!email) {
            return (0, response_1.sendError)(res, 'Email is required', 400);
        }
        // Find applicant by email
        const applicant = await prisma_config_1.default.applicant.findFirst({
            where: {
                contact: {
                    email: email,
                },
            },
            include: {
                documents: {
                    where: {
                        document_type: 'RESUME',
                    },
                    select: {
                        applicant_document_id: true,
                        document_type: true,
                    },
                    take: 1,
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
                        pipeline_stages: {
                            orderBy: {
                                pipeline_date: 'desc',
                            },
                            select: {
                                stage_name: true,
                                pipeline_date: true,
                            },
                            take: 1,
                        },
                    },
                },
            },
        });
        if (!applicant) {
            return (0, response_1.sendSuccess)(res, {
                applications: [],
                total: 0,
                message: 'No applications found for this email',
            });
        }
        return (0, response_1.sendSuccess)(res, {
            applicant_name: applicant.full_name,
            has_resume: applicant.documents.length > 0,
            resume_id: applicant.documents[0]?.applicant_document_id || null,
            applications: applicant.applications.map(app => ({
                application_id: app.application_id,
                status: app.status,
                applied_at: app.applied_at,
                current_stage: app.pipeline_stages[0]?.stage_name || 'Application Received',
                job: app.job,
            })),
            total: applicant.applications.length,
        });
    }
    catch (err) {
        console.error('Error fetching applicant applications:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch applications', 500);
    }
};
exports.getApplicantApplications = getApplicantApplications;
//# sourceMappingURL=publicApplicationsController.js.map