import { Request, Response } from 'express';
import prisma from '../../prisma.config';
import { sendSuccess, sendError } from '../../utils/response';
import { z } from 'zod';
import { BlobServiceClient } from '@azure/storage-blob';

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

const blobServiceClient = BlobServiceClient.fromConnectionString(
  process.env.AZURE_STORAGE_CONNECTION_STRING
);

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
const generateBlobName = (applicantId: string, applicationId: string, originalName: string): string => {
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
//  * 3. Update master demographics (if provided)
//  * 4. Create application record
//  * 5. Upload application-specific resume to Azure
//  * 6. Store application-specific cover letter
//  * 7. Store application-specific work history snapshot
//  * 8. Return complete application with all snapshots
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
//           // NEW APPLICANT: Create with demographics if provided
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
//               demographic: data.birth_date || data.gender || data.race || data.disability || data.work_authorization ? {
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
//           // EXISTING APPLICANT: Update master profile
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

//           // UPDATE OR CREATE DEMOGRAPHICS (Master Profile)
//           // Check if any demographic field is provided in current submission
//           const hasDemographicData = data.birth_date || data.gender || data.race || 
//                                       data.disability || data.work_authorization;

//           if (hasDemographicData) {
//             if (applicant.demographic) {
//               // UPDATE existing demographics
//               await tx.applicantDemographic.update({
//                 where: { applicant_demo_id: applicant.demographic.applicant_demo_id },
//                 data: {
//                   // Update only fields that are provided (not empty)
//                   ...(data.birth_date && { birth_date: new Date(data.birth_date) }),
//                   ...(data.gender && { gender: data.gender }),
//                   ...(data.race && { race: data.race }),
//                   ...(data.disability && { disability: data.disability }),
//                   ...(data.work_authorization && { work_authorization: data.work_authorization }),
//                   ...(data.authorization_expiry && { 
//                     authorization_expiry: new Date(data.authorization_expiry) 
//                   }),
//                 },
//               });
//             } else {
//               // CREATE demographics if they don't exist
//               await tx.applicantDemographic.create({
//                 data: {
//                   applicant_id: applicant.applicant_id,
//                   birth_date: data.birth_date ? new Date(data.birth_date) : null,
//                   gender: data.gender,
//                   race: data.race,
//                   disability: data.disability,
//                   work_authorization: data.work_authorization,
//                   authorization_expiry: data.authorization_expiry
//                     ? new Date(data.authorization_expiry)
//                     : null,
//                 },
//               });
//             }
//           }
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
//             source: data.source || 'WEB_APPLICANT',
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
//         timeout: 10000,
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
const createApplicationSchema = z.object({
  job_id: z.string().uuid('Valid job ID is required'),
  full_name: z.string().min(2, 'Full name must be at least 2 characters'),
  email: z.string().email('Valid email is required'),
  phone: z.string().min(10, 'Valid phone number is required'),
  address: z.string().optional(),
  city: z.string().optional(),
  birth_date: z.string().datetime().optional(),
  gender: z.string().optional(),
  race: z.string().optional(),
  disability: z.string().optional(),
  work_authorization: z.string().optional(),
  authorization_expiry: z.string().datetime().optional(),
  source: z.string().optional().default('WEB_APPLICANT'),
  cover_letter: z.string().optional(),
  linkedin_url: z.string().url().optional(),
  portfolio_url: z.string().url().optional(),
  comp_code_last: z.string().optional(),
  work_history: z.preprocess(
    (val) => {
      if (typeof val === 'string') {
        try { return JSON.parse(val); } catch { return val; }
      }
      return val;
    },
    z.array(z.object({
      title: z.string(),
      description: z.string().optional(),
    })).optional()
  ),
});

/**
 * Submit a job application with application-specific snapshots
 * POST /api/public/jobs/:jobId/apply
 *
 * OPTIMIZATIONS vs original:
 * - Pre-fetch job + applicant in parallel before transaction opens
 * - Duplicate application check done pre-transaction (no wasted tx time)
 * - Social profile upserts replaced with a single Promise.all inside tx
 * - Demographics upsert collapsed to one conditional call
 * - Cover letter + work history inserts batched via Promise.all
 * - Transaction timeout raised to 20s with maxWait 8s
 * - Final application fetch runs with only needed includes
 * - Resume upload fully outside transaction (unchanged from your version)
 */
export const submitApplication = async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    const file = (req as any).file;

    // ── Validate ──────────────────────────────────────────────────────────────
    const validation = createApplicationSchema.safeParse({ ...req.body, job_id: jobId });
    if (!validation.success) {
      const errors = validation.error.issues.map((err: any) => ({
        field: err.path.join('.'),
        message: err.message,
      }));
      return sendError(res, 'Validation failed', 400, errors);
    }
    const data = validation.data;

    // ── Pre-fetch job + existing applicant IN PARALLEL (outside transaction) ──
    const [job, existingApplicant] = await Promise.all([
      prisma.job.findFirst({
        where: {
          job_id: jobId,
          status: 'OPEN',
          organization: { status: 'ACTIVE' },
        },
        include: {
          organization: { select: { name: true } },
        },
      }),
      prisma.applicant.findFirst({
        where: { contact: { email: data.email } },
        include: {
          contact: true,
          demographic: true,
          social_profiles: true,
        },
      }),
    ]);

    if (!job) {
      return sendError(res, 'Job not found or not currently accepting applications', 404);
    }

    if (job.open_positions !== null && job.open_positions <= 0) {
      return sendError(res, 'No open positions available for this job', 400);
    }

    // ── Duplicate application check BEFORE opening transaction ────────────────
    if (existingApplicant) {
      const duplicate = await prisma.application.findFirst({
        where: { job_id: jobId, applicant_id: existingApplicant.applicant_id },
        select: { application_id: true },
      });
      if (duplicate) {
        return sendError(res, 'You have already applied to this job', 409, [{
          field: 'duplicate_application',
          message: `Application already exists with ID: ${duplicate.application_id}`,
        }]);
      }
    }

    // ── Transaction: pure DB writes only ─────────────────────────────────────
    const result = await prisma.$transaction(async (tx) => {
      let applicant: typeof existingApplicant;

      if (!existingApplicant) {
        // ── NEW APPLICANT ────────────────────────────────────────────────────
        const hasDemographics = !!(data.birth_date || data.gender || data.race ||
          data.disability || data.work_authorization);

        applicant = await tx.applicant.create({
          data: {
            full_name: data.full_name,
            status: 'APPLIED',
            comp_code_last: data.comp_code_last,
            contact: {
              create: {
                email: data.email,
                phone: data.phone,
                address: data.address,
                city: data.city,
              },
            },
            ...(hasDemographics && {
              demographic: {
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
              },
            }),
          },
          include: { contact: true, demographic: true, social_profiles: true },
        });

      } else {
        // ── EXISTING APPLICANT: update profile + demographics in parallel ────
        const hasDemographics = !!(data.birth_date || data.gender || data.race ||
          data.disability || data.work_authorization);

        const demographicOp = hasDemographics
          ? existingApplicant.demographic
            ? tx.applicantDemographic.update({
                where: { applicant_demo_id: existingApplicant.demographic.applicant_demo_id },
                data: {
                  ...(data.birth_date && { birth_date: new Date(data.birth_date) }),
                  ...(data.gender && { gender: data.gender }),
                  ...(data.race && { race: data.race }),
                  ...(data.disability && { disability: data.disability }),
                  ...(data.work_authorization && { work_authorization: data.work_authorization }),
                  ...(data.authorization_expiry && {
                    authorization_expiry: new Date(data.authorization_expiry),
                  }),
                },
              })
            : tx.applicantDemographic.create({
                data: {
                  applicant_id: existingApplicant.applicant_id,
                  birth_date: data.birth_date ? new Date(data.birth_date) : null,
                  gender: data.gender,
                  race: data.race,
                  disability: data.disability,
                  work_authorization: data.work_authorization,
                  authorization_expiry: data.authorization_expiry
                    ? new Date(data.authorization_expiry)
                    : null,
                },
              })
          : Promise.resolve(null);

        const [updatedApplicant] = await Promise.all([
          tx.applicant.update({
            where: { applicant_id: existingApplicant.applicant_id },
            data: {
              last_active_at: new Date(),
              full_name: data.full_name,
              comp_code_last: data.comp_code_last,
              contact: {
                update: { phone: data.phone, address: data.address, city: data.city },
              },
            },
            include: { contact: true, demographic: true, social_profiles: true },
          }),
          demographicOp,
        ]);

        applicant = updatedApplicant;
        // Carry forward social_profiles for upsert logic below
        applicant!.social_profiles = existingApplicant.social_profiles;
      }

      // ── Social profile upserts — run in parallel ──────────────────────────
      const socialOps: Promise<any>[] = [];

      if (data.linkedin_url) {
        const existing = applicant!.social_profiles.find(p => p.profile_title === 'LinkedIn');
        if (!existing) {
          socialOps.push(tx.applicantSocialProfiles.create({
            data: {
              applicant_id: applicant!.applicant_id,
              profile_title: 'LinkedIn',
              profile_link: data.linkedin_url,
            },
          }));
        } else if (existing.profile_link !== data.linkedin_url) {
          socialOps.push(tx.applicantSocialProfiles.update({
            where: { applicant_social_profiles_id: existing.applicant_social_profiles_id },
            data: { profile_link: data.linkedin_url },
          }));
        }
      }

      if (data.portfolio_url) {
        const existing = applicant!.social_profiles.find(p => p.profile_title === 'Portfolio');
        if (!existing) {
          socialOps.push(tx.applicantSocialProfiles.create({
            data: {
              applicant_id: applicant!.applicant_id,
              profile_title: 'Portfolio',
              profile_link: data.portfolio_url,
            },
          }));
        } else if (existing.profile_link !== data.portfolio_url) {
          socialOps.push(tx.applicantSocialProfiles.update({
            where: { applicant_social_profiles_id: existing.applicant_social_profiles_id },
            data: { profile_link: data.portfolio_url },
          }));
        }
      }

      // ── Create application record ─────────────────────────────────────────
      const [application] = await Promise.all([
        tx.application.create({
          data: {
            job_id: jobId,
            applicant_id: applicant!.applicant_id,
            source: data.source || 'WEB_APPLICANT',
            status: 'APPLIED',
          },
        }),
        ...socialOps,
        // Decrement open_positions in parallel with application create
        ...(job.open_positions !== null && job.open_positions > 0
          ? [tx.job.update({
              where: { job_id: jobId },
              data: { open_positions: { decrement: 1 } },
            })]
          : []),
      ]);

      // ── Cover letter + work history inserts in parallel ───────────────────
      const documentOps: Promise<any>[] = [];

      if (data.cover_letter) {
        documentOps.push(tx.applicantDocument.create({
          data: {
            applicant_id: applicant!.applicant_id,
            application_id: application.application_id,
            document_type: 'COVER_LETTER',
            file_url: JSON.stringify({
              content: data.cover_letter,
              type: 'text',
              createdAt: new Date().toISOString(),
              applicationId: application.application_id,
            }),
          },
        }));
      }

      if (data.work_history && data.work_history.length > 0) {
        documentOps.push(tx.applicantWorkHistory.createMany({
          data: data.work_history.map((work) => ({
            applicant_id: applicant!.applicant_id,
            application_id: application.application_id,
            title: work.title,
            description: work.description,
          })),
        }));
      }

      if (documentOps.length > 0) {
        await Promise.all(documentOps);
      }

      return { application, applicantId: applicant!.applicant_id };
    }, {
      maxWait: 8000,   // max wait to acquire DB connection
      timeout: 20000,  // 20s — enough headroom for complex writes
    });

    // ── Resume upload — fully outside transaction ─────────────────────────────
    let resumeMetadata = null;
    if (file) {
      try {
        const containerClient = await getContainerClient();
        const blobName = generateBlobName(
          result.applicantId,
          result.application.application_id,
          file.originalname
        );
        const blockBlobClient = containerClient.getBlockBlobClient(blobName);

        await blockBlobClient.upload(file.buffer, file.buffer.length, {
          blobHTTPHeaders: { blobContentType: file.mimetype },
        });

        resumeMetadata = {
          originalFileName: file.originalname,
          mimeType: file.mimetype,
          blobName,
          size: file.size,
          url: blockBlobClient.url,
          uploadedAt: new Date().toISOString(),
          applicationId: result.application.application_id,
        };

        await prisma.applicantDocument.create({
          data: {
            applicant_id: result.applicantId,
            application_id: result.application.application_id,
            document_type: 'RESUME',
            file_url: JSON.stringify(resumeMetadata),
          },
        });
      } catch (uploadErr) {
        console.error('Resume upload failed (application still created):', uploadErr);
      }
    }

    // ── Fetch complete application ────────────────────────────────────────────
    const completeApplication = await prisma.application.findUnique({
      where: { application_id: result.application.application_id },
      include: {
        job: {
          select: {
            job_id: true,
            job_title: true,
            organization: { select: { name: true } },
          },
        },
        applicant: {
          select: {
            applicant_id: true,
            full_name: true,
            contact: { select: { email: true, phone: true } },
          },
        },
        documents: {
          where: { application_id: result.application.application_id },
        },
        work_history: {
          where: { application_id: result.application.application_id },
        },
      },
    });

    return sendSuccess(res, {
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

  } catch (err: any) {
    console.error('Error submitting application:', err);
    if (err.code === 'P2028') return sendError(res, 'Request timed out, please try again', 503);
    if (err.code === 'P2002') return sendError(res, 'Duplicate application detected', 409);
    if (err.code === 'P2003') return sendError(res, 'Invalid job or applicant reference', 404);
    return sendError(res, 'Failed to submit application', 500);
  }
};


/**
 * Upload resume for an existing application
 * POST /api/public/applications/:applicationId/upload-resume
 * 
 * USE CASE:
 * - Applicant submitted application without resume
 * - Applicant wants to add/replace resume for a specific application
 * 
 * FLOW:
 * 1. Verify application exists and belongs to the applicant (via email)
 * 2. Check if resume already exists (optional warning)
 * 3. Upload resume to Azure Blob Storage
 * 4. Create/update applicant document record
 * 5. Return success with file details
 */
export const uploadApplicationResume = async (req: Request, res: Response) => {
  try {
    const { applicationId } = req.params;
    const file = (req as any).file; // Resume file from multer
    const { email } = req.body; // Applicant's email for verification

    // Validate required fields
    if (!file) {
      return sendError(res, 'Resume file is required', 400);
    }

    if (!email) {
      return sendError(res, 'Email is required for verification', 400);
    }

    // Validate file type (only PDF, DOC, DOCX)
    const allowedMimeTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];

    if (!allowedMimeTypes.includes(file.mimetype)) {
      return sendError(res, 'Invalid file type. Only PDF, DOC, and DOCX files are allowed', 400);
    }

    // Validate file size (max 5MB)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      return sendError(res, 'File size too large. Maximum size is 5MB', 400);
    }

    // Fetch application with applicant details
    const application = await prisma.application.findUnique({
      where: { application_id: applicationId },
      include: {
        applicant: {
          include: {
            contact: true,
          },
        },
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
      },
    });

    if (!application) {
      return sendError(res, 'Application not found', 404);
    }

    // Verify email matches the applicant
    if (application.applicant.contact?.email !== email) {
      return sendError(res, 'Email does not match the application', 403);
    }

    // Check if resume already exists for this application
    const existingResume = await prisma.applicantDocument.findFirst({
      where: {
        application_id: applicationId,
        document_type: 'RESUME',
      },
    });

    // Upload resume to Azure Blob Storage
    const containerClient = await getContainerClient();
    const blobName = generateBlobName(
      application.applicant_id,
      applicationId,
      file.originalname
    );
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);

    await blockBlobClient.upload(file.buffer, file.buffer.length, {
      blobHTTPHeaders: { blobContentType: file.mimetype },
    });

    const resumeMetadata = {
      originalFileName: file.originalname,
      mimeType: file.mimetype,
      blobName,
      size: file.size,
      url: blockBlobClient.url,
      uploadedAt: new Date().toISOString(),
      applicationId: applicationId,
    };

    // If resume exists, delete old blob and update record
    if (existingResume) {
      try {
        // Parse old metadata to get blob name
        const oldMetadata = JSON.parse(existingResume.file_url);
        if (oldMetadata.blobName) {
          const oldBlobClient = containerClient.getBlockBlobClient(oldMetadata.blobName);
          await oldBlobClient.deleteIfExists();
        }
      } catch (err) {
        console.warn('Failed to delete old resume blob:', err);
      }

      // Update existing document record
      await prisma.applicantDocument.update({
        where: { applicant_document_id: existingResume.applicant_document_id },
        data: {
          file_url: JSON.stringify(resumeMetadata),
        },
      });

      return sendSuccess(res, {
        message: `Resume updated successfully for ${application.job.job_title} at ${application.job.organization.name}`,
        resume: {
          filename: file.originalname,
          size: file.size,
          mimeType: file.mimetype,
          url: blockBlobClient.url,
          uploadedAt: resumeMetadata.uploadedAt,
        },
        application_id: applicationId,
        replaced: true,
      }, 200);
    }

    // Create new document record
    await prisma.applicantDocument.create({
      data: {
        applicant_id: application.applicant_id,
        application_id: applicationId,
        document_type: 'RESUME',
        file_url: JSON.stringify(resumeMetadata),
      },
    });

    return sendSuccess(res, {
      message: `Resume uploaded successfully for ${application.job.job_title} at ${application.job.organization.name}`,
      resume: {
        filename: file.originalname,
        size: file.size,
        mimeType: file.mimetype,
        url: blockBlobClient.url,
        uploadedAt: resumeMetadata.uploadedAt,
      },
      application_id: applicationId,
      replaced: false,
    }, 201);

  } catch (err: any) {
    console.error('Error uploading application resume:', err);
    return sendError(res, 'Failed to upload resume', 500);
  }
};


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
export const getApplicationDetails = async (applicationId: string) => {
  return await prisma.application.findUnique({
    where: { application_id: applicationId },
    include: {
      applicant: {
        include: {
          contact: true,           // Current contact (master profile)
          demographic: true,        // Current demographics (master profile)
          social_profiles: true,    // Current social profiles (master profile)
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
          application_id: applicationId,  // ← Filters to application-specific data
        },
      },
      // CRITICAL: Only get work history for THIS specific application
      work_history: {
        where: {
          application_id: applicationId,  // ← Filters to application-specific data
        },
      },
    },
  });
};

/**
 * View applicant's resume in browser (for in-app viewing)
 * GET /api/public/applications/:applicationId/resume/view
 * 
 * KEY CHANGE: Fetches resume specific to this application
 */
export const viewApplicationResume = async (req: Request, res: Response) => {
  try {
    const { applicationId } = req.params;

    // CRITICAL: Fetch resume specific to THIS application
    const application = await prisma.application.findUnique({
      where: { application_id: applicationId },
      include: {
        // Get documents linked to this specific application
        documents: {
          where: {
            application_id: applicationId,  // ← Application-specific
            document_type: 'RESUME',
          },
          take: 1,
        },
      },
    });

    if (!application) {
      return sendError(res, 'Application not found', 404);
    }

    const resumeDocument = application.documents[0];

    if (!resumeDocument || !resumeDocument.file_url) {
      return sendError(res, 'Resume not found for this application', 404);
    }

    try {
      const fileMetadata = JSON.parse(resumeDocument.file_url);
      
      if (!fileMetadata.blobName) {
        return sendError(res, 'Resume file reference not found', 404);
      }

      const containerClient = await getContainerClient();
      const blockBlobClient = containerClient.getBlockBlobClient(fileMetadata.blobName);

      const exists = await blockBlobClient.exists();
      if (!exists) {
        return sendError(res, 'Resume file not found in storage', 404);
      }

      const downloadResponse = await blockBlobClient.download();
      
      if (!downloadResponse.readableStreamBody) {
        return sendError(res, 'Failed to view resume', 500);
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

    } catch (err: any) {
      console.error('Error viewing resume from Azure:', err);
      return sendError(res, 'Failed to view resume', 500);
    }
  } catch (err: any) {
    console.error('Error viewing application resume:', err);
    return sendError(res, 'Failed to view resume', 500);
  }
};

/**
 * View applicant's cover letter in browser (for in-app viewing)
 * GET /api/public/applications/:applicationId/coverletter/view
 * 
 * Fetches cover letter specific to this application
 * Handles both text-based and file-based cover letters
 */

export const viewApplicationCoverLetter = async (req: Request, res: Response) => {
  try {
    const { applicationId } = req.params;

    // Fetch cover letter specific to THIS application
    const application = await prisma.application.findUnique({
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
      return sendError(res, 'Application not found', 404);
    }

    const coverLetterDocument = application.documents[0];

    if (!coverLetterDocument || !coverLetterDocument.file_url) {
      return sendError(res, 'Cover letter not found for this application', 404);
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
        return sendError(res, 'Cover letter file reference not found', 404);
      }

      const containerClient = await getContainerClient();
      const blockBlobClient = containerClient.getBlockBlobClient(fileMetadata.blobName);

      const exists = await blockBlobClient.exists();
      if (!exists) {
        return sendError(res, 'Cover letter file not found in storage', 404);
      }

      const downloadResponse = await blockBlobClient.download();
      
      if (!downloadResponse.readableStreamBody) {
        return sendError(res, 'Failed to view cover letter', 500);
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

    } catch (err: any) {
      console.error('Error viewing cover letter:', err);
      return sendError(res, 'Failed to view cover letter', 500);
    }
  } catch (err: any) {
    console.error('Error viewing application cover letter:', err);
    return sendError(res, 'Failed to view cover letter', 500);
  }
};


/**
 * 
 * Download applicant's resume
 * GET /api/public/applications/:applicationId/resume
 * 
 * KEY CHANGE: Downloads resume specific to this application
 * Allows downloading resume for a specific application
 * Public endpoint for applicants to download their own resume
 */
export const downloadApplicationResume = async (req: Request, res: Response) => {
  try {
    const { applicationId } = req.params;

    // CRITICAL: Fetch resume specific to THIS application
    const application = await prisma.application.findUnique({
      where: { application_id: applicationId },
      include: {
        // Get documents linked to this specific application
        documents: {
          where: {
            application_id: applicationId,  // ← Application-specific
            document_type: 'RESUME',
          },
          take: 1,
        },
      },
    });

    if (!application) {
      return sendError(res, 'Application not found', 404);
    }

    const resumeDocument = application.documents[0];

    if (!resumeDocument || !resumeDocument.file_url) {
      return sendError(res, 'Resume not found for this application', 404);
    }

    try {
      // Parse file metadata
      const fileMetadata = JSON.parse(resumeDocument.file_url);
      
      if (!fileMetadata.blobName) {
        return sendError(res, 'Resume file reference not found', 404);
      }

      // Download from Azure Blob Storage
      const containerClient = await getContainerClient();
      const blockBlobClient = containerClient.getBlockBlobClient(fileMetadata.blobName);

      // Check if blob exists
      const exists = await blockBlobClient.exists();
      if (!exists) {
        return sendError(res, 'Resume file not found in storage', 404);
      }

      // Download blob
      const downloadResponse = await blockBlobClient.download();
      
      if (!downloadResponse.readableStreamBody) {
        return sendError(res, 'Failed to download resume', 500);
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

    } catch (err: any) {
      console.error('Error downloading resume from Azure:', err);
      return sendError(res, 'Failed to download resume', 500);
    }
  } catch (err: any) {
    console.error('Error downloading application resume:', err);
    return sendError(res, 'Failed to download resume', 500);
  }
};

/**
 * ADDITIONAL HELPER: Get applicant's latest resume (from master profile)
 * 
 * This is useful for showing the applicant their current resume,
 * NOT for recruiter review (recruiters should use getApplicationDetails)
 */
export const getApplicantLatestResume = async (applicantId: string) => {
  return await prisma.applicantDocument.findFirst({
    where: {
      applicant_id: applicantId,
      document_type: 'RESUME',
    },
    orderBy: {
      created_at: 'desc',
    },
  });
};




/**
 * Check if applicant has already applied to a job
 * GET /api/public/jobs/:jobId/check-application?email=xxx
 */
export const checkExistingApplication = async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    const { email } = req.query;

    if (!email) {
      return sendError(res, 'Email is required', 400);
    }

    // Find applicant by email
    const applicant = await prisma.applicant.findFirst({
      where: {
        contact: {
          email: email as string,
        },
      },
    });

    if (!applicant) {
      return sendSuccess(res, {
        has_applied: false,
        message: 'No previous applications found',
      });
    }

    // Check if application exists for this job
    const application = await prisma.application.findFirst({
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
      return sendSuccess(res, {
        has_applied: false,
        message: 'You have not applied to this job yet',
      });
    }

    return sendSuccess(res, {
      has_applied: true,
      application: {
        application_id: application.application_id,
        status: application.status,
        applied_at: application.applied_at,
      },
      message: 'You have already applied to this job',
    });

  } catch (err: any) {
    console.error('Error checking application:', err);
    return sendError(res, 'Failed to check application status', 500);
  }
};

/**
 * Get application status with resume download link
 * GET /api/public/applications/:applicationId
 * 
 * Allows applicants to check their application status
 * Requires application ID (sent via email after applying)
 */
export const getApplicationStatus = async (req: Request, res: Response) => {
  try {
    const { applicationId } = req.params;

    if (!applicationId) {
      return sendError(res, 'Application ID is required', 400);
    }

    const application = await prisma.application.findUnique({
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
      return sendError(res, 'Application not found', 404);
    }

    return sendSuccess(res, {
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

  } catch (err: any) {
    console.error('Error fetching application status:', err);
    return sendError(res, 'Failed to fetch application status', 500);
  }
};


/**
 * Withdraw application
 * DELETE /api/public/applications/:applicationId/withdraw
 * 
 * Allows applicants to withdraw their application
 * Requires email verification for security
 */
export const withdrawApplication = async (req: Request, res: Response) => {
  try {
    const { applicationId } = req.params;
    const { email } = req.body;

    if (!applicationId) {
      return sendError(res, 'Application ID is required', 400);
    }

    if (!email) {
      return sendError(res, 'Email is required for verification', 400);
    }

    // Find application with email verification
    const application = await prisma.application.findFirst({
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
      return sendError(
        res,
        'Application not found or email does not match',
        404
      );
    }

    // Check if application can be withdrawn
    if (application.status === 'HIRED') {
      return sendError(
        res,
        'Cannot withdraw application - already hired',
        400
      );
    }

    // Delete application and increment open positions
    await prisma.$transaction(async (tx) => {
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

    return sendSuccess(res, {
      message: 'Application withdrawn successfully',
    });

  } catch (err: any) {
    console.error('Error withdrawing application:', err);
    return sendError(res, 'Failed to withdraw application', 500);
  }
};

/**
 * Get applicant's application history with resume info
 * GET /api/public/applicants/applications?email=xxx
 * 
 * Returns all applications for an applicant by email
 */
export const getApplicantApplications = async (req: Request, res: Response) => {
  try {
    const { email } = req.query;

    if (!email) {
      return sendError(res, 'Email is required', 400);
    }

    // Find applicant by email
    const applicant = await prisma.applicant.findFirst({
      where: {
        contact: {
          email: email as string,
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
      return sendSuccess(res, {
        applications: [],
        total: 0,
        message: 'No applications found for this email',
      });
    }

    return sendSuccess(res, {
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

  } catch (err: any) {
    console.error('Error fetching applicant applications:', err);
    return sendError(res, 'Failed to fetch applications', 500);
  }
};



