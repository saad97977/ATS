"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getApplicantApplications = exports.withdrawApplication = exports.getApplicationStatus = exports.checkExistingApplication = exports.getApplicantLatestResume = exports.downloadApplicationResume = exports.viewApplicationCoverLetter = exports.viewApplicationResume = exports.getApplicationDetails = exports.submitApplication = void 0;
const prisma_config_1 = __importDefault(require("../../prisma.config"));
const response_1 = require("../../utils/response");
const zod_1 = require("zod");
const storage_blob_1 = require("@azure/storage-blob");
/**
 * Public Application Controller - Application-Specific Snapshots
 *
 * ARCHITECTURE OVERVIEW:
 * ======================
 * This controller implements an application-snapshot pattern where each job application
 * maintains its own immutable snapshot of the applicant's data at the time of submission.
 *
 * WHY APPLICATION SNAPSHOTS?
 * - Recruiters need to evaluate candidates based on what was submitted
 * - Applicants should be able to update their profile without affecting pending applications
 * - Maintains data integrity and audit trail
 * - Matches behavior of major job platforms (Indeed, LinkedIn)
 *
 * DATA ORGANIZATION:
 * ==================
 *
 * 1. APPLICANT MASTER PROFILE (applicants table)
 *    - Current/latest contact information
 *    - Current/latest social profiles
 *    - For convenience and profile management
 *
 * 2. APPLICATION SNAPSHOTS (application-specific)
 *    - Resume: Unique file per application (stored in Azure)
 *    - Cover Letter: Specific to this job application
 *    - Work History: Snapshot of experience at time of application
 *    - All linked via application_id
 *
 * EXAMPLE SCENARIO:
 * =================
 * Day 1: Alice applies to Company A
 *   - Uploads resume_v1.pdf
 *   - Submits cover letter for Company A
 *   - Lists 3 work experiences
 *
 * Day 5: Alice applies to Company B
 *   - Uploads resume_v2.pdf (improved version)
 *   - Submits different cover letter for Company B
 *   - Lists 4 work experiences (added new job)
 *
 * RESULT:
 * - Company A sees: resume_v1.pdf, Company A cover letter, 3 experiences
 * - Company B sees: resume_v2.pdf, Company B cover letter, 4 experiences
 * - Both applications are independent and immutable
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
        access: 'blob', // Public read access for blobs
    });
    return containerClient;
};
/**
 * Generate unique blob name with application context
 * Pattern: {applicantId}/applications/{applicationId}/{timestamp}-{random}-{filename}
 *
 * This ensures:
 * - Each application has its own folder
 * - No file overwrites
 * - Clear audit trail
 * - Easy to implement retention policies
 */
const generateBlobName = (applicantId, applicationId, originalName) => {
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 8);
    const sanitizedName = originalName.replace(/[^a-zA-Z0-9.-]/g, '_');
    return `${applicantId}/applications/${applicationId}/${timestamp}-${randomStr}-${sanitizedName}`;
};
// // Validation schema for new job application
// const createApplicationSchema = z.object({
//   job_id: z.string().uuid('Valid job ID is required'),
//   full_name: z.string().min(2, 'Full name must be at least 2 characters'),
//   email: z.string().email('Valid email is required'),
//   phone: z.string().min(10, 'Valid phone number is required'),
//   address: z.string().optional(),
//   city: z.string().optional(),
//   birth_date: z.string().datetime().optional(),
//   gender: z.string().optional(),
//   race: z.string().optional(),
//   disability: z.string().optional(),
//   work_authorization: z.string().optional(),
//   authorization_expiry: z.string().datetime().optional(),
//   source: z.string().optional().default('WEB_APPLICANT'),
//   cover_letter: z.string().optional(),
//   linkedin_url: z.string().url().optional(),
//   portfolio_url: z.string().url().optional(),
//   work_history: z.preprocess(
//   (val) => {
//     if (typeof val === 'string') {
//       try {
//         return JSON.parse(val);
//       } catch {
//         return val;
//       }
//     }
//     return val;
//   },
//   z.array(
//     z.object({
//       title: z.string(),
//       description: z.string().optional(),
//     })
//   ).optional()),
// });
// /**
//  * Submit a job application with application-specific snapshots
//  * POST /api/public/jobs/:jobId/apply
//  * 
//  * FLOW:
//  * 1. Create/update applicant master profile
//  * 2. Update master social profiles
//  * 3. Create application record
//  * 4. Upload application-specific resume to Azure
//  * 5. Store application-specific cover letter
//  * 6. Store application-specific work history snapshot
//  * 7. Return complete application with all snapshots
//  */
// export const submitApplication = async (req: Request, res: Response) => {
//   try {
//     const { jobId } = req.params;
//     const file = (req as any).file; // Resume file from multer
//     // Validate request body
//     const validation = createApplicationSchema.safeParse({
//       ...req.body,
//       job_id: jobId,
//     });
//     if (!validation.success) {
//       const errors = validation.error.issues.map((err: any) => ({
//         field: err.path.join('.'),
//         message: err.message,
//       }));
//       return sendError(res, 'Validation failed', 400, errors);
//     }
//     const data = validation.data;
//     // Check if job exists and is accepting applications
//     const job = await prisma.job.findFirst({
//       where: {
//         job_id: jobId,
//         status: 'OPEN',
//         organization: {
//           status: 'ACTIVE',
//         },
//       },
//       include: {
//         organization: {
//           select: {
//             name: true,
//           },
//         },
//       },
//     });
//     if (!job) {
//       return sendError(
//         res,
//         'Job not found or not currently accepting applications',
//         404
//       );
//     }
//     // Check if positions are still available
//     if (job.open_positions !== null && job.open_positions <= 0) {
//       return sendError(
//         res,
//         'No open positions available for this job',
//         400
//       );
//     }
//     // Check if applicant already exists by email
//     let applicant = await prisma.applicant.findFirst({
//       where: {
//         contact: {
//           email: data.email,
//         },
//       },
//       include: {
//         contact: true,
//         demographic: true,
//         social_profiles: true,
//       },
//     });
//     // Check if applicant already applied to this job
//     if (applicant) {
//       const existingApplication = await prisma.application.findFirst({
//         where: {
//           job_id: jobId,
//           applicant_id: applicant.applicant_id,
//         },
//       });
//       if (existingApplication) {
//         return sendError(
//           res,
//           'You have already applied to this job',
//           409,
//           [{
//             field: 'duplicate_application',
//             message: `Application already exists with ID: ${existingApplication.application_id}`,
//           }]
//         );
//       }
//     }
//     // ============================================
//     // STEP 1-6: Create application inside transaction (no file upload)
//     // ============================================
//     const result = await prisma.$transaction(
//       async (tx) => {
//         // CREATE OR UPDATE APPLICANT MASTER PROFILE
//         if (!applicant) {
//           applicant = await tx.applicant.create({
//             data: {
//               full_name: data.full_name,
//               status: 'APPLIED',
//               contact: {
//                 create: {
//                   email: data.email,
//                   phone: data.phone,
//                   address: data.address,
//                   city: data.city,
//                 },
//               },
//               demographic: data.birth_date || data.gender || data.race ? {
//                 create: {
//                   birth_date: data.birth_date ? new Date(data.birth_date) : null,
//                   gender: data.gender,
//                   race: data.race,
//                   disability: data.disability,
//                   work_authorization: data.work_authorization,
//                   authorization_expiry: data.authorization_expiry
//                     ? new Date(data.authorization_expiry)
//                     : null,
//                 },
//               } : undefined,
//             },
//             include: {
//               contact: true,
//               demographic: true,
//               social_profiles: true,
//             },
//           });
//         } else {
//           applicant = await tx.applicant.update({
//             where: { applicant_id: applicant.applicant_id },
//             data: {
//               last_active_at: new Date(),
//               full_name: data.full_name,
//               contact: {
//                 update: {
//                   phone: data.phone,
//                   address: data.address,
//                   city: data.city,
//                 },
//               },
//             },
//             include: {
//               contact: true,
//               demographic: true,
//               social_profiles: true,
//             },
//           });
//         }
//         // UPDATE MASTER SOCIAL PROFILES
//         if (data.linkedin_url) {
//           const existingLinkedIn = applicant!.social_profiles.find(
//             (profile) => profile.profile_title === 'LinkedIn'
//           );
//           if (!existingLinkedIn) {
//             await tx.applicantSocialProfiles.create({
//               data: {
//                 applicant_id: applicant!.applicant_id,
//                 profile_title: 'LinkedIn',
//                 profile_link: data.linkedin_url,
//               },
//             });
//           } else if (existingLinkedIn.profile_link !== data.linkedin_url) {
//             await tx.applicantSocialProfiles.update({
//               where: { applicant_social_profiles_id: existingLinkedIn.applicant_social_profiles_id },
//               data: { profile_link: data.linkedin_url },
//             });
//           }
//         }
//         if (data.portfolio_url) {
//           const existingPortfolio = applicant!.social_profiles.find(
//             (profile) => profile.profile_title === 'Portfolio'
//           );
//           if (!existingPortfolio) {
//             await tx.applicantSocialProfiles.create({
//               data: {
//                 applicant_id: applicant!.applicant_id,
//                 profile_title: 'Portfolio',
//                 profile_link: data.portfolio_url,
//               },
//             });
//           } else if (existingPortfolio.profile_link !== data.portfolio_url) {
//             await tx.applicantSocialProfiles.update({
//               where: { applicant_social_profiles_id: existingPortfolio.applicant_social_profiles_id },
//               data: { profile_link: data.portfolio_url },
//             });
//           }
//         }
//         // CREATE APPLICATION
//         const application = await tx.application.create({
//           data: {
//             job_id: jobId,
//             applicant_id: applicant!.applicant_id,
//             source: data.source || 'PUBLIC_JOB_BOARD',
//             status: 'APPLIED',
//           },
//         });
//         // STORE COVER LETTER (text, no file upload)
//         if (data.cover_letter) {
//           await tx.applicantDocument.create({
//             data: {
//               applicant_id: applicant!.applicant_id,
//               application_id: application.application_id,
//               document_type: 'COVER_LETTER',
//               file_url: JSON.stringify({
//                 content: data.cover_letter,
//                 type: 'text',
//                 createdAt: new Date().toISOString(),
//                 applicationId: application.application_id,
//               }),
//             },
//           });
//         }
//         // STORE WORK HISTORY
//         if (data.work_history && data.work_history.length > 0) {
//           await tx.applicantWorkHistory.createMany({
//             data: data.work_history.map((work) => ({
//               applicant_id: applicant!.applicant_id,
//               application_id: application.application_id,
//               title: work.title,
//               description: work.description,
//             })),
//           });
//         }
//         // Decrement open_positions
//         if (job.open_positions !== null && job.open_positions > 0) {
//           await tx.job.update({
//             where: { job_id: jobId },
//             data: {
//               open_positions: {
//                 decrement: 1,
//               },
//             },
//           });
//         }
//         return { application, applicantId: applicant!.applicant_id };
//       },
//       {
//         maxWait: 5000,
//         timeout: 10000, // Increase timeout but don't rely on it
//       }
//     );
//     // ============================================
//     // STEP 7: UPLOAD RESUME OUTSIDE TRANSACTION
//     // ============================================
//     let resumeMetadata = null;
//     if (file) {
//       try {
//         const containerClient = await getContainerClient();
//         const blobName = generateBlobName(
//           result.applicantId,
//           result.application.application_id,
//           file.originalname
//         );
//         const blockBlobClient = containerClient.getBlockBlobClient(blobName);
//         await blockBlobClient.upload(file.buffer, file.buffer.length, {
//           blobHTTPHeaders: {
//             blobContentType: file.mimetype,
//           },
//         });
//         const fileUrl = blockBlobClient.url;
//         resumeMetadata = {
//           originalFileName: file.originalname,
//           mimeType: file.mimetype,
//           blobName: blobName,
//           size: file.size,
//           url: fileUrl,
//           uploadedAt: new Date().toISOString(),
//           applicationId: result.application.application_id,
//         };
//         // Link resume to application AFTER upload succeeds
//         await prisma.applicantDocument.create({
//           data: {
//             applicant_id: result.applicantId,
//             application_id: result.application.application_id,
//             document_type: 'RESUME',
//             file_url: JSON.stringify(resumeMetadata),
//           },
//         });
//       } catch (uploadErr) {
//         console.error('Error uploading resume to Azure:', uploadErr);
//         // Log but don't fail - application was already created successfully
//         console.warn('Resume upload failed but application was created');
//       }
//     }
//     // ============================================
//     // STEP 8: FETCH COMPLETE APPLICATION
//     // ============================================
//     const completeApplication = await prisma.application.findUnique({
//       where: { application_id: result.application.application_id },
//       include: {
//         job: {
//           select: {
//             job_id: true,
//             job_title: true,
//             organization: {
//               select: {
//                 name: true,
//               },
//             },
//           },
//         },
//         applicant: {
//           select: {
//             applicant_id: true,
//             full_name: true,
//             contact: {
//               select: {
//                 email: true,
//                 phone: true,
//               },
//             },
//           },
//         },
//         documents: {
//           where: {
//             application_id: result.application.application_id,
//           },
//         },
//         work_history: {
//           where: {
//             application_id: result.application.application_id,
//           },
//         },
//       },
//     });
//     return sendSuccess(res, {
//       application: completeApplication,
//       resume_uploaded: !!resumeMetadata,
//       ...(file && {
//         resume: {
//           filename: file.originalname,
//           size: file.size,
//           mimeType: file.mimetype,
//         },
//       }),
//       message: `Application submitted successfully for ${job.job_title} at ${job.organization.name}`,
//     }, 201);
//   } catch (err: any) {
//     console.error('Error submitting application:', err);
//     if (err.message === 'Failed to upload resume') {
//       return sendError(res, 'Failed to upload resume to storage', 500);
//     }
//     if (err.code === 'P2002') {
//       return sendError(res, 'Duplicate application detected', 409);
//     }
//     if (err.code === 'P2003') {
//       return sendError(res, 'Invalid job or applicant reference', 404);
//     }
//     return sendError(res, 'Failed to submit application', 500);
//   }
// };
// Validation schema for new job application
const createApplicationSchema = zod_1.z.object({
    job_id: zod_1.z.string().uuid('Valid job ID is required'),
    full_name: zod_1.z.string().min(2, 'Full name must be at least 2 characters'),
    email: zod_1.z.string().email('Valid email is required'),
    phone: zod_1.z.string().min(10, 'Valid phone number is required'),
    address: zod_1.z.string().optional(),
    city: zod_1.z.string().optional(),
    birth_date: zod_1.z.string().datetime().optional(),
    gender: zod_1.z.string().optional(),
    race: zod_1.z.string().optional(),
    disability: zod_1.z.string().optional(),
    work_authorization: zod_1.z.string().optional(),
    authorization_expiry: zod_1.z.string().datetime().optional(),
    source: zod_1.z.string().optional().default('WEB_APPLICANT'),
    cover_letter: zod_1.z.string().optional(),
    linkedin_url: zod_1.z.string().url().optional(),
    portfolio_url: zod_1.z.string().url().optional(),
    work_history: zod_1.z.preprocess((val) => {
        if (typeof val === 'string') {
            try {
                return JSON.parse(val);
            }
            catch {
                return val;
            }
        }
        return val;
    }, zod_1.z.array(zod_1.z.object({
        title: zod_1.z.string(),
        description: zod_1.z.string().optional(),
    })).optional()),
});
/**
 * Submit a job application with application-specific snapshots
 * POST /api/public/jobs/:jobId/apply
 *
 * FLOW:
 * 1. Create/update applicant master profile
 * 2. Update master social profiles
 * 3. Update master demographics (if provided)
 * 4. Create application record
 * 5. Upload application-specific resume to Azure
 * 6. Store application-specific cover letter
 * 7. Store application-specific work history snapshot
 * 8. Return complete application with all snapshots
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
                social_profiles: true,
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
        // ============================================
        // STEP 1-6: Create application inside transaction (no file upload)
        // ============================================
        const result = await prisma_config_1.default.$transaction(async (tx) => {
            // CREATE OR UPDATE APPLICANT MASTER PROFILE
            if (!applicant) {
                // NEW APPLICANT: Create with demographics if provided
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
                        demographic: data.birth_date || data.gender || data.race || data.disability || data.work_authorization ? {
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
                        social_profiles: true,
                    },
                });
            }
            else {
                // EXISTING APPLICANT: Update master profile
                applicant = await tx.applicant.update({
                    where: { applicant_id: applicant.applicant_id },
                    data: {
                        last_active_at: new Date(),
                        full_name: data.full_name,
                        contact: {
                            update: {
                                phone: data.phone,
                                address: data.address,
                                city: data.city,
                            },
                        },
                    },
                    include: {
                        contact: true,
                        demographic: true,
                        social_profiles: true,
                    },
                });
                // UPDATE OR CREATE DEMOGRAPHICS (Master Profile)
                // Check if any demographic field is provided in current submission
                const hasDemographicData = data.birth_date || data.gender || data.race ||
                    data.disability || data.work_authorization;
                if (hasDemographicData) {
                    if (applicant.demographic) {
                        // UPDATE existing demographics
                        await tx.applicantDemographic.update({
                            where: { applicant_demo_id: applicant.demographic.applicant_demo_id },
                            data: {
                                // Update only fields that are provided (not empty)
                                ...(data.birth_date && { birth_date: new Date(data.birth_date) }),
                                ...(data.gender && { gender: data.gender }),
                                ...(data.race && { race: data.race }),
                                ...(data.disability && { disability: data.disability }),
                                ...(data.work_authorization && { work_authorization: data.work_authorization }),
                                ...(data.authorization_expiry && {
                                    authorization_expiry: new Date(data.authorization_expiry)
                                }),
                            },
                        });
                    }
                    else {
                        // CREATE demographics if they don't exist
                        await tx.applicantDemographic.create({
                            data: {
                                applicant_id: applicant.applicant_id,
                                birth_date: data.birth_date ? new Date(data.birth_date) : null,
                                gender: data.gender,
                                race: data.race,
                                disability: data.disability,
                                work_authorization: data.work_authorization,
                                authorization_expiry: data.authorization_expiry
                                    ? new Date(data.authorization_expiry)
                                    : null,
                            },
                        });
                    }
                }
            }
            // UPDATE MASTER SOCIAL PROFILES
            if (data.linkedin_url) {
                const existingLinkedIn = applicant.social_profiles.find((profile) => profile.profile_title === 'LinkedIn');
                if (!existingLinkedIn) {
                    await tx.applicantSocialProfiles.create({
                        data: {
                            applicant_id: applicant.applicant_id,
                            profile_title: 'LinkedIn',
                            profile_link: data.linkedin_url,
                        },
                    });
                }
                else if (existingLinkedIn.profile_link !== data.linkedin_url) {
                    await tx.applicantSocialProfiles.update({
                        where: { applicant_social_profiles_id: existingLinkedIn.applicant_social_profiles_id },
                        data: { profile_link: data.linkedin_url },
                    });
                }
            }
            if (data.portfolio_url) {
                const existingPortfolio = applicant.social_profiles.find((profile) => profile.profile_title === 'Portfolio');
                if (!existingPortfolio) {
                    await tx.applicantSocialProfiles.create({
                        data: {
                            applicant_id: applicant.applicant_id,
                            profile_title: 'Portfolio',
                            profile_link: data.portfolio_url,
                        },
                    });
                }
                else if (existingPortfolio.profile_link !== data.portfolio_url) {
                    await tx.applicantSocialProfiles.update({
                        where: { applicant_social_profiles_id: existingPortfolio.applicant_social_profiles_id },
                        data: { profile_link: data.portfolio_url },
                    });
                }
            }
            // CREATE APPLICATION
            const application = await tx.application.create({
                data: {
                    job_id: jobId,
                    applicant_id: applicant.applicant_id,
                    source: data.source || 'WEB_APPLICANT',
                    status: 'APPLIED',
                },
            });
            // STORE COVER LETTER (text, no file upload)
            if (data.cover_letter) {
                await tx.applicantDocument.create({
                    data: {
                        applicant_id: applicant.applicant_id,
                        application_id: application.application_id,
                        document_type: 'COVER_LETTER',
                        file_url: JSON.stringify({
                            content: data.cover_letter,
                            type: 'text',
                            createdAt: new Date().toISOString(),
                            applicationId: application.application_id,
                        }),
                    },
                });
            }
            // STORE WORK HISTORY
            if (data.work_history && data.work_history.length > 0) {
                await tx.applicantWorkHistory.createMany({
                    data: data.work_history.map((work) => ({
                        applicant_id: applicant.applicant_id,
                        application_id: application.application_id,
                        title: work.title,
                        description: work.description,
                    })),
                });
            }
            // Decrement open_positions
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
            return { application, applicantId: applicant.applicant_id };
        }, {
            maxWait: 5000,
            timeout: 10000,
        });
        // ============================================
        // STEP 7: UPLOAD RESUME OUTSIDE TRANSACTION
        // ============================================
        let resumeMetadata = null;
        if (file) {
            try {
                const containerClient = await getContainerClient();
                const blobName = generateBlobName(result.applicantId, result.application.application_id, file.originalname);
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
                    uploadedAt: new Date().toISOString(),
                    applicationId: result.application.application_id,
                };
                // Link resume to application AFTER upload succeeds
                await prisma_config_1.default.applicantDocument.create({
                    data: {
                        applicant_id: result.applicantId,
                        application_id: result.application.application_id,
                        document_type: 'RESUME',
                        file_url: JSON.stringify(resumeMetadata),
                    },
                });
            }
            catch (uploadErr) {
                console.error('Error uploading resume to Azure:', uploadErr);
                // Log but don't fail - application was already created successfully
                console.warn('Resume upload failed but application was created');
            }
        }
        // ============================================
        // STEP 8: FETCH COMPLETE APPLICATION
        // ============================================
        const completeApplication = await prisma_config_1.default.application.findUnique({
            where: { application_id: result.application.application_id },
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
                documents: {
                    where: {
                        application_id: result.application.application_id,
                    },
                },
                work_history: {
                    where: {
                        application_id: result.application.application_id,
                    },
                },
            },
        });
        return (0, response_1.sendSuccess)(res, {
            application: completeApplication,
            resume_uploaded: !!resumeMetadata,
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
 * HELPER FUNCTION: Get application details with all snapshots
 *
 * This is the CORRECT way to retrieve an application for recruiter review.
 * It returns the exact data that was submitted, not the applicant's current profile.
 *
 * USAGE:
 * - Recruiter views application
 * - Application comparison
 * - Audit trail
 */
const getApplicationDetails = async (applicationId) => {
    return await prisma_config_1.default.application.findUnique({
        where: { application_id: applicationId },
        include: {
            applicant: {
                include: {
                    contact: true, // Current contact (master profile)
                    demographic: true, // Current demographics (master profile)
                    social_profiles: true, // Current social profiles (master profile)
                },
            },
            job: {
                include: {
                    organization: true,
                },
            },
            // CRITICAL: Only get documents for THIS specific application
            documents: {
                where: {
                    application_id: applicationId, // ← Filters to application-specific data
                },
            },
            // CRITICAL: Only get work history for THIS specific application
            work_history: {
                where: {
                    application_id: applicationId, // ← Filters to application-specific data
                },
            },
        },
    });
};
exports.getApplicationDetails = getApplicationDetails;
/**
 * View applicant's resume in browser (for in-app viewing)
 * GET /api/public/applications/:applicationId/resume/view
 *
 * KEY CHANGE: Fetches resume specific to this application
 */
const viewApplicationResume = async (req, res) => {
    try {
        const { applicationId } = req.params;
        // CRITICAL: Fetch resume specific to THIS application
        const application = await prisma_config_1.default.application.findUnique({
            where: { application_id: applicationId },
            include: {
                // Get documents linked to this specific application
                documents: {
                    where: {
                        application_id: applicationId, // ← Application-specific
                        document_type: 'RESUME',
                    },
                    take: 1,
                },
            },
        });
        if (!application) {
            return (0, response_1.sendError)(res, 'Application not found', 404);
        }
        const resumeDocument = application.documents[0];
        if (!resumeDocument || !resumeDocument.file_url) {
            return (0, response_1.sendError)(res, 'Resume not found for this application', 404);
        }
        try {
            const fileMetadata = JSON.parse(resumeDocument.file_url);
            if (!fileMetadata.blobName) {
                return (0, response_1.sendError)(res, 'Resume file reference not found', 404);
            }
            const containerClient = await getContainerClient();
            const blockBlobClient = containerClient.getBlockBlobClient(fileMetadata.blobName);
            const exists = await blockBlobClient.exists();
            if (!exists) {
                return (0, response_1.sendError)(res, 'Resume file not found in storage', 404);
            }
            const downloadResponse = await blockBlobClient.download();
            if (!downloadResponse.readableStreamBody) {
                return (0, response_1.sendError)(res, 'Failed to view resume', 500);
            }
            const mimeType = fileMetadata.mimeType || 'application/pdf';
            // Set headers for inline viewing
            res.setHeader('Content-Type', mimeType);
            res.setHeader('Content-Disposition', 'inline');
            if (downloadResponse.contentLength) {
                res.setHeader('Content-Length', downloadResponse.contentLength);
            }
            res.setHeader('Cache-Control', 'public, max-age=3600');
            downloadResponse.readableStreamBody.pipe(res);
        }
        catch (err) {
            console.error('Error viewing resume from Azure:', err);
            return (0, response_1.sendError)(res, 'Failed to view resume', 500);
        }
    }
    catch (err) {
        console.error('Error viewing application resume:', err);
        return (0, response_1.sendError)(res, 'Failed to view resume', 500);
    }
};
exports.viewApplicationResume = viewApplicationResume;
/**
 * View applicant's cover letter in browser (for in-app viewing)
 * GET /api/public/applications/:applicationId/coverletter/view
 *
 * Fetches cover letter specific to this application
 * Handles both text-based and file-based cover letters
 */
const viewApplicationCoverLetter = async (req, res) => {
    try {
        const { applicationId } = req.params;
        // Fetch cover letter specific to THIS application
        const application = await prisma_config_1.default.application.findUnique({
            where: { application_id: applicationId },
            include: {
                // Get documents linked to this specific application
                documents: {
                    where: {
                        application_id: applicationId,
                        document_type: 'COVER_LETTER',
                    },
                    take: 1,
                },
            },
        });
        if (!application) {
            return (0, response_1.sendError)(res, 'Application not found', 404);
        }
        const coverLetterDocument = application.documents[0];
        if (!coverLetterDocument || !coverLetterDocument.file_url) {
            return (0, response_1.sendError)(res, 'Cover letter not found for this application', 404);
        }
        try {
            const fileMetadata = JSON.parse(coverLetterDocument.file_url);
            // Handle text-based cover letter
            if (fileMetadata.type === 'text' && fileMetadata.content) {
                // Return as HTML for browser viewing
                const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Cover Letter</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      max-width: 800px;
      margin: 40px auto;
      padding: 20px;
      color: #333;
    }
    .cover-letter {
      white-space: pre-wrap;
      word-wrap: break-word;
    }
  </style>
</head>
<body>
  <div class="cover-letter">${fileMetadata.content.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
</body>
</html>`;
                res.setHeader('Content-Type', 'text/html; charset=utf-8');
                res.setHeader('Content-Disposition', 'inline');
                res.setHeader('Cache-Control', 'public, max-age=3600');
                return res.send(htmlContent);
            }
            // Handle file-based cover letter (PDF, DOCX, etc.)
            if (!fileMetadata.blobName) {
                return (0, response_1.sendError)(res, 'Cover letter file reference not found', 404);
            }
            const containerClient = await getContainerClient();
            const blockBlobClient = containerClient.getBlockBlobClient(fileMetadata.blobName);
            const exists = await blockBlobClient.exists();
            if (!exists) {
                return (0, response_1.sendError)(res, 'Cover letter file not found in storage', 404);
            }
            const downloadResponse = await blockBlobClient.download();
            if (!downloadResponse.readableStreamBody) {
                return (0, response_1.sendError)(res, 'Failed to view cover letter', 500);
            }
            const mimeType = fileMetadata.mimeType || 'application/pdf';
            // Set headers for inline viewing
            res.setHeader('Content-Type', mimeType);
            res.setHeader('Content-Disposition', 'inline');
            if (downloadResponse.contentLength) {
                res.setHeader('Content-Length', downloadResponse.contentLength);
            }
            res.setHeader('Cache-Control', 'public, max-age=3600');
            downloadResponse.readableStreamBody.pipe(res);
        }
        catch (err) {
            console.error('Error viewing cover letter:', err);
            return (0, response_1.sendError)(res, 'Failed to view cover letter', 500);
        }
    }
    catch (err) {
        console.error('Error viewing application cover letter:', err);
        return (0, response_1.sendError)(res, 'Failed to view cover letter', 500);
    }
};
exports.viewApplicationCoverLetter = viewApplicationCoverLetter;
/**
 *
 * Download applicant's resume
 * GET /api/public/applications/:applicationId/resume
 *
 * KEY CHANGE: Downloads resume specific to this application
 * Allows downloading resume for a specific application
 * Public endpoint for applicants to download their own resume
 */
const downloadApplicationResume = async (req, res) => {
    try {
        const { applicationId } = req.params;
        // CRITICAL: Fetch resume specific to THIS application
        const application = await prisma_config_1.default.application.findUnique({
            where: { application_id: applicationId },
            include: {
                // Get documents linked to this specific application
                documents: {
                    where: {
                        application_id: applicationId, // ← Application-specific
                        document_type: 'RESUME',
                    },
                    take: 1,
                },
            },
        });
        if (!application) {
            return (0, response_1.sendError)(res, 'Application not found', 404);
        }
        const resumeDocument = application.documents[0];
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
 * ADDITIONAL HELPER: Get applicant's latest resume (from master profile)
 *
 * This is useful for showing the applicant their current resume,
 * NOT for recruiter review (recruiters should use getApplicationDetails)
 */
const getApplicantLatestResume = async (applicantId) => {
    return await prisma_config_1.default.applicantDocument.findFirst({
        where: {
            applicant_id: applicantId,
            document_type: 'RESUME',
        },
        orderBy: {
            created_at: 'desc',
        },
    });
};
exports.getApplicantLatestResume = getApplicantLatestResume;
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