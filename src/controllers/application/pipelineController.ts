import { Request, Response } from 'express';
import prisma from '../../prisma.config';
import { createCrudController } from '../../factories/crudFactory';
import { createPipelineStageSchema, updatePipelineStageSchema } from '../../validators/schemas';
import { sendSuccess, sendError } from '../../utils/response';
import {   
  sendInterviewInvitationEmail, 
  sendInterviewRescheduleEmail,
  sendInterviewRejectionEmail,
  sendOfferLetterEmail,
  sendOnboardingWelcomeEmail
 } from '../../services/emailService';
import { updateUserActivity } from '../../services/activityService';

/**
 * Pipeline Controller - Complete hiring workflow management
 * 
 * WORKFLOW STAGES:
 * 1. CREATE PIPELINE → PipelineStageName: PIPELINED, ApplicantStatus: SHORTLISTED, ApplicationStatus: SCREENED
 * 2. CREATE INTERVIEW → InterviewStatus: PENDING, ApplicantStatus: INTERVIEWING
 * 3. AUTO-UPDATE (after interview date) → InterviewStatus: COMPLETED_RESULT_PENDING, PipelineStageName: INTERVIEWED
 * 4. REJECT INTERVIEW → InterviewStatus: REJECTED, ApplicantStatus: REJECTED
 * 5. ACCEPT INTERVIEW → InterviewStatus: ACCEPTED, ApplicationStatus: OFFERED
 * 6. ONBOARD → PipelineStageName: ONBOARDED, ApplicationStatus: HIRED, ApplicantStatus: PLACED
 * 
 * Validation Rules:
 * - application_id: Required UUID
 * - stage_name: PIPELINED | INTERVIEWED | ONBOARDED (optional, set automatically)
 * - credit_organization_user_id: Optional UUID
 * - representative_organization_user_id: Optional UUID
 */

// Generate base CRUD methods
const baseCrudMethods = createCrudController({
  model: prisma.pipelineStage,
  modelName: 'PipelineStage',
  idField: 'pipeline_stage_id',
  createSchema: createPipelineStageSchema,
  updateSchema: updatePipelineStageSchema,
  defaultLimit: 10,
  maxLimit: 100,
});

/**
 * GET ALL PIPELINE STAGES WITH FILTERING
 * GET /api/pipeline?stage=PIPELINED&page=1&limit=10
 */
const getAllPipelineStages = async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 10));
    const skip = (page - 1) * limit;
    const stage = req.query.stage as string;

    // Build where clause
    const whereClause: any = {};
    
    // Add stage filter if provided
    if (stage && ['PIPELINED', 'INTERVIEWED', 'ONBOARDED'].includes(stage.toUpperCase())) {
      whereClause.stage_name = stage.toUpperCase();
    }

    const [pipelineStages, total] = await Promise.all([
      prisma.pipelineStage.findMany({
        where: whereClause,
        skip,
        take: limit,
        orderBy: { pipeline_date: 'desc' },
        include: {
          application: {
            include: {
              applicant: {
                select: {
                  applicant_id: true,
                  full_name: true,
                  status: true,
                  contact: {
                    select: {
                      email: true,
                      phone: true,
                    },
                  },
                },
              },
              job: {
                select: {
                  job_id: true,
                  job_title: true,
                  organization: {
                    select: {
                      organization_id: true,
                      name: true,
                    },
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
            },
          },
          credit_user: {
            select: {
              user_id: true,
              name: true,
              email: true,
            },
          },
          representative_user: {
            select: {
              user_id: true,
              name: true,
              email: true,
            },
          },
        },
      }),
      prisma.pipelineStage.count({ where: whereClause }),
    ]);

    return sendSuccess(res, {
      data: pipelineStages,
      paging: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err: any) {
    console.error('Error fetching pipeline stages:', err);
    return sendError(res, 'Failed to fetch pipeline stages', 500);
  }
};

/**
 * CREATE PIPELINE
 * POST /api/pipeline
 * 
 * Automatically sets:
 * - PipelineStageName = PIPELINED
 * - ApplicantStatus = SHORTLISTED
 * - ApplicationStatus = SCREENED
 */
const createPipeline = async (req: Request, res: Response) => {
  try {
    // Validate request body
    const validation = createPipelineStageSchema.safeParse(req.body);
    if (!validation.success) {
      const errors = validation.error.issues.map((err: any) => ({
        field: err.path.join('.'),
        message: err.message,
      }));
      return sendError(res, 'Validation failed', 400, errors);
    }

    const { application_id, credit_organization_user_id, representative_organization_user_id } = req.body;

    // Verify application exists
    const application = await prisma.application.findUnique({
      where: { application_id },
      include: {
        applicant: true,
        job: true,
      },
    });

    if (!application) {
      return sendError(res, 'Application not found', 404);
    }

    // Check if pipeline already exists for this application
    const existingPipeline = await prisma.pipelineStage.findFirst({
      where: { application_id },
    });

    if (existingPipeline) {
      return sendError(
        res,
        'Pipeline already exists for this application',
        409,
        [{
          field: 'duplicate',
          message: `Pipeline already exists with ID: ${existingPipeline.pipeline_stage_id}`,
        }]
      );
    }

    // Create pipeline and update statuses in a transaction (lightweight writes only)
    const pipelineStageId = await prisma.$transaction(async (tx) => {
      // Create pipeline stage with PIPELINED status
      const pipelineStage = await tx.pipelineStage.create({
        data: {
          application_id,
          stage_name: 'PIPELINED',
          credit_organization_user_id: credit_organization_user_id || null,
          representative_organization_user_id: representative_organization_user_id || null,
        },
        select: {
          pipeline_stage_id: true,
        },
      });

      // Update Application status to SCREENED
      await tx.application.update({
        where: { application_id },
        data: { status: 'SCREENED' },
      });

      // Update Applicant status to SHORTLISTED
      await tx.applicant.update({
        where: { applicant_id: application.applicant_id },
        data: { status: 'SHORTLISTED' },
      });

      return pipelineStage.pipeline_stage_id;
    });

    // Fetch the complete pipeline stage with all relations AFTER transaction
    const result = await prisma.pipelineStage.findUnique({
      where: { pipeline_stage_id: pipelineStageId },
      include: {
        application: {
          include: {
            applicant: {
              select: {
                applicant_id: true,
                full_name: true,
                status: true,
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
        },
        credit_user: {
          select: {
            user_id: true,
            name: true,
            email: true,
          },
        },
        representative_user: {
          select: {
            user_id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    return sendSuccess(res, result, 201);
  } catch (err: any) {
    console.error('Error creating pipeline:', err);

    if (err.code === 'P2002') {
      return sendError(res, 'Pipeline already exists for this application', 409);
    }

    if (err.code === 'P2003') {
      return sendError(res, 'Related application or job not found', 404);
    }

    return sendError(res, 'Failed to create pipeline', 500);
  }
};

/**
 * CREATE INTERVIEW (with pipeline integration)
 * POST /api/pipeline/:pipelineStageId/interview
 * 
 * Automatically sets:
 * - InterviewStatus = PENDING
 * - ApplicantStatus = INTERVIEWING
 * - Sends email notification to applicant
 * 
 * HOW INTERVIEW CHECKING WORKS:
 * - Interview has a unique constraint on application_id (from schema)
 * - So one application can only have ONE interview record
 * - We check if interview exists before creating to prevent errors
 * - Frontend also checks application.interviews array length
 */
const createInterviewForPipeline = async (req: Request, res: Response) => {
  try {
    const { pipelineStageId } = req.params;
    const { interview_date } = req.body;

    if (!interview_date) {
      return sendError(res, 'interview_date is required', 400);
    }

    // Verify pipeline stage exists
    const pipelineStage = await prisma.pipelineStage.findUnique({
      where: { pipeline_stage_id: pipelineStageId },
      include: {
        application: {
          include: {
            applicant: {
              include: {
                contact: true, // Need contact for email
              },
            },
            job: {
              include: {
                organization: {
                  select: {
                    name: true,
                    website: true,
                    contacts: {
                      where: {
                        contact_type: 'PRIMARY',
                      },
                      take: 1,
                    },
                  },
                },
              },
            },
            interviews: true, // Check existing interviews
          },
        },
      },
    });

    if (!pipelineStage) {
      return sendError(res, 'Pipeline stage not found', 404);
    }

    // Check if interview already exists (application_id is unique in interviews table)
    if (pipelineStage.application.interviews && pipelineStage.application.interviews.length > 0) {
      return sendError(res, 'Interview already exists for this application', 409, [{
        field: 'interview',
        message: `An interview is already scheduled for ${new Date(pipelineStage.application.interviews[0].interview_date).toLocaleString()}`,
      }]);
    }

    // Validate applicant has email
    const applicantEmail = pipelineStage.application.applicant.contact?.email;
    if (!applicantEmail) {
      return sendError(res, 'Applicant email not found. Cannot send interview invitation.', 400);
    }

    // Create interview and update statuses (lightweight writes only)
    const interviewId = await prisma.$transaction(async (tx) => {
      // Create interview with PENDING status
      const interview = await tx.interview.create({
        data: {
          application_id: pipelineStage.application_id,
          interview_date: new Date(interview_date),
          status: 'PENDING',
        },
        select: {
          interview_id: true,
        },
      });

      // Update Applicant status to INTERVIEWING
      await tx.applicant.update({
        where: { applicant_id: pipelineStage.application.applicant_id },
        data: { status: 'INTERVIEWING' },
      });

      return interview.interview_id;
    });

    // Fetch the complete interview with all relations AFTER transaction
    const result = await prisma.interview.findUnique({
      where: { interview_id: interviewId },
      include: {
        application: {
          include: {
            job: {
              select: {
                job_id: true,
                job_title: true,
                location: true,
                organization: {
                  select: {
                    organization_id: true,
                    name: true,
                    website: true,
                    contacts: {
                      where: {
                        contact_type: 'PRIMARY',
                      },
                      select: {
                        email: true,
                        phone: true,
                      },
                    },
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
        },
      },
    });

    // Send interview invitation email (async, don't wait for it)
    // We do this after transaction to ensure interview is created even if email fails
    const emailData = {
      applicantEmail: result!.application.applicant.contact!.email,
      applicantName: result!.application.applicant.full_name,
      jobTitle: result!.application.job.job_title,
      organizationName: result!.application.job.organization.name,
      organizationWebsite: result!.application.job.organization.website || undefined,
      interviewDate: result!.interview_date,
      location: result!.application.job.location,
      contactEmail: result!.application.job.organization.contacts[0]?.email || undefined,
      contactPhone: result!.application.job.organization.contacts[0]?.phone || undefined,
    };

    // Send email asynchronously and log result
    sendInterviewInvitationEmail(emailData)
      .then((emailResult) => {
        if (emailResult.success) {
          console.log('✅ Interview invitation email sent successfully', {
            interviewId: result!.interview_id,
            applicantEmail: emailData.applicantEmail,
            messageId: emailResult.messageId,
          });
        } else {
          console.error('❌ Failed to send interview invitation email', {
            interviewId: result!.interview_id,
            applicantEmail: emailData.applicantEmail,
            error: emailResult.error,
          });
        }
      })
      .catch((error) => {
        console.error('❌ Error in email sending process', {
          interviewId: result!.interview_id,
          error: error.message,
        });
      });

    // ✅ UPDATE USER ACTIVITY - Log interview creation
    const userId = (req as any).user?.user_id;
    if (userId) {
      await updateUserActivity(userId, {
        action_type: 'SCEDULE',
        entity_type: 'INTERVIEW',
        entity_id: result!.interview_id,
        entity_name: `Interview for ${result!.application.applicant.full_name} - ${result!.application.job.job_title}`,
        timestamp: new Date().toISOString(),
      });
    }

    // Return success immediately (don't wait for email)
    return sendSuccess(res, result, 201);
  } catch (err: any) {
    console.error('Error creating interview:', err);

    if (err.code === 'P2002') {
      return sendError(res, 'Interview already exists for this application', 409);
    }

    return sendError(res, 'Failed to create interview', 500);
  }
};

/**
 * UPDATE INTERVIEW DATE
 * PATCH /api/pipeline/interview/:interviewId/update-date
 */
const updateInterviewDate = async (req: Request, res: Response) => {
  try {
    const { interviewId } = req.params;
    const { interview_date } = req.body;

    if (!interview_date) {
      return sendError(res, 'interview_date is required', 400);
    }

    const selectedDate = new Date(interview_date);
    if (selectedDate < new Date()) {
      return sendError(res, 'Interview date must be in the future', 400);
    }

    const interview = await prisma.interview.findUnique({
      where: { interview_id: interviewId },
      include: {
        application: {
          include: {
            applicant: {
              include: {
                contact: true,
              },
            },
            job: {
              include: {
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

    if (!interview) {
      return sendError(res, 'Interview not found', 404);
    }

    if (interview.status !== 'PENDING') {
      return sendError(
        res,
        `Cannot update interview date. Interview status is ${interview.status}. Only PENDING interviews can be rescheduled.`,
        400
      );
    }

    // Store old date for email
    const oldInterviewDate = interview.interview_date;

    const updatedInterview = await prisma.interview.update({
      where: { interview_id: interviewId },
      data: { interview_date: new Date(interview_date) },
      include: {
        application: {
          include: {
            job: {
              select: {
                job_id: true,
                job_title: true,
                location: true,
                organization: {
                  select: {
                    name: true,
                  },
                },
              },
            },
            applicant: {
              select: {
                full_name: true,
                status: true,
                contact: {
                  select: {
                    email: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    // Send reschedule email
    const applicantEmail = updatedInterview.application.applicant.contact?.email;
    if (applicantEmail) {
      sendInterviewRescheduleEmail({
        applicantEmail,
        applicantName: updatedInterview.application.applicant.full_name,
        jobTitle: updatedInterview.application.job.job_title,
        organizationName: updatedInterview.application.job.organization.name,
        oldDate: oldInterviewDate,
        newDate: updatedInterview.interview_date,
        location: updatedInterview.application.job.location,
      })
        .then((emailResult) => {
          if (emailResult.success) {
            console.log('✅ Interview reschedule email sent successfully');
          } else {
            console.error('❌ Failed to send reschedule email:', emailResult.error);
          }
        })
        .catch((error) => {
          console.error('❌ Error in reschedule email process:', error.message);
        });
    }

    const userId = (req as any).user?.user_id;
    if (userId) {
      await updateUserActivity(userId, {
        action_type: 'UPDATE',
        entity_type: 'INTERVIEW',
        entity_id: interviewId,
        entity_name: `Rescheduled interview for ${interview.application.applicant.full_name} - ${interview.application.job.job_title}`,
        timestamp: new Date().toISOString(),
      });
    }

    return sendSuccess(res, updatedInterview);
  } catch (err: any) {
    console.error('Error updating interview date:', err);
    return sendError(res, 'Failed to update interview date', 500);
  }
};

/**
 * GET INTERVIEW DETAILS BY APPLICATION ID
 * GET /api/pipeline/interview/application/:applicationId
 * 
 * Returns complete interview details including:
 * - Interview information (date, status)
 * - Application details
 * - Applicant information
 * - Job and organization details
 * - Pipeline stage information
 * - Status tracking history
 */
const getInterviewByApplication = async (req: Request, res: Response) => {
  try {
    const { applicationId } = req.params;

    // Find interview for this application
    const interview = await prisma.interview.findUnique({
      where: { application_id: applicationId },
      include: {
        application: {
          include: {
            job: {
              select: {
                job_id: true,
                job_title: true,
                job_type: true,
                location: true,
                organization: {
                  select: {
                    organization_id: true,
                    name: true,
                    website: true,
                    contacts: {
                      where: {
                        contact_type: 'PRIMARY',
                      },
                      select: {
                        name: true,
                        email: true,
                        phone: true,
                      },
                    },
                  },
                },
              },
            },
            applicant: {
              include: {
                contact: true,
                demographic: true,
              },
            },
            pipeline_stages: {
              include: {
                credit_user: {
                  select: {
                    user_id: true,
                    name: true,
                    email: true,
                  },
                },
                representative_user: {
                  select: {
                    user_id: true,
                    name: true,
                    email: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!interview) {
      return sendError(res, 'Interview not found for this application', 404);
    }

    // Build status tracking timeline
    const statusTimeline = {
      application_status: interview.application.status,
      applicant_status: interview.application.applicant.status,
      interview_status: interview.status,
      pipeline_stage: interview.application.pipeline_stages[0]?.stage_name || null,
      
      // Timeline events
      events: [
        {
          stage: 'APPLIED',
          date: interview.application.applied_at,
          description: 'Application submitted',
          status: 'completed',
        },
        {
          stage: 'SCREENED',
          date: interview.application.pipeline_stages[0]?.pipeline_date || null,
          description: 'Application screened and shortlisted',
          status: interview.application.status === 'APPLIED' ? 'pending' : 'completed',
        },
        {
          stage: 'INTERVIEWING',
          date: interview.interview_date,
          description: 'Interview scheduled',
          status: interview.status === 'PENDING' ? 'current' : 'completed',
        },
        {
          stage: 'INTERVIEW_RESULT',
          date: null,
          description: 'Interview result pending',
          status: interview.status === 'COMPLETED_RESULT_PENDING' ? 'current' : 
                  interview.status === 'REJECTED' ? 'rejected' :
                  interview.status === 'ACCEPTED' ? 'completed' : 'pending',
        },
        {
          stage: 'OFFERED',
          date: null,
          description: 'Offer extended',
          status: interview.application.status === 'OFFERED' ? 'current' :
                  interview.application.status === 'HIRED' ? 'completed' : 'pending',
        },
        {
          stage: 'HIRED',
          date: null,
          description: 'Candidate hired and onboarded',
          status: interview.application.status === 'HIRED' ? 'completed' : 'pending',
        },
      ],
    };

    return sendSuccess(res, {
      interview,
      status_timeline: statusTimeline,
    });
  } catch (err: any) {
    console.error('Error fetching interview by application:', err);
    return sendError(res, 'Failed to fetch interview details', 500);
  }
};

/**
 * AUTO-UPDATE COMPLETED INTERVIEWS
 * POST /api/pipeline/auto-update-completed
 * 
 * Updates interviews past their end date:
 * - InterviewStatus = COMPLETED_RESULT_PENDING
 * - PipelineStageName = INTERVIEWED
 * 
 * This should be called by a cron job or scheduled task
 */
const autoUpdateCompletedInterviews = async (req: Request, res: Response) => {
  try {
    const now = new Date();

    // Find all PENDING interviews past their date
    const pendingInterviews = await prisma.interview.findMany({
      where: {
        status: 'PENDING',
        interview_date: {
          lt: now,
        },
      },
      include: {
        application: {
          select: {
            application_id: true,
            job_id: true,
          },
        },
      },
    });

    if (pendingInterviews.length === 0) {
      return sendSuccess(res, {
        message: 'No interviews to update',
        updated_count: 0,
      });
    }

    // Update each interview and pipeline stage
    const updateResults = await Promise.all(
      pendingInterviews.map(async (interview) => {
        return prisma.$transaction(async (tx) => {
          // Update interview status
          await tx.interview.update({
            where: { interview_id: interview.interview_id },
            data: { status: 'COMPLETED_RESULT_PENDING' },
          });

          // Update pipeline stage to INTERVIEWED
          const pipelineStage = await tx.pipelineStage.findFirst({
            where: { application_id: interview.application_id },
          });

          if (pipelineStage) {
            await tx.pipelineStage.update({
              where: { pipeline_stage_id: pipelineStage.pipeline_stage_id },
              data: { stage_name: 'INTERVIEWED' },
            });
          }

          return interview.interview_id;
        });
      })
    );

    return sendSuccess(res, {
      message: `Successfully updated ${updateResults.length} interviews`,
      updated_count: updateResults.length,
      updated_interview_ids: updateResults,
    });
  } catch (err: any) {
    console.error('Error auto-updating interviews:', err);
    return sendError(res, 'Failed to auto-update interviews', 500);
  }
};

/**
 * REJECT INTERVIEW
 * PATCH /api/pipeline/interview/:interviewId/reject
 */
const rejectInterview = async (req: Request, res: Response) => {
  try {
    const { interviewId } = req.params;

    const interview = await prisma.interview.findUnique({
      where: { interview_id: interviewId },
      include: {
        application: {
          include: {
            applicant: {
              include: {
                contact: true,
              },
            },
            job: {
              include: {
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

    if (!interview) {
      return sendError(res, 'Interview not found', 404);
    }

    await prisma.$transaction(async (tx) => {
      await tx.interview.update({
        where: { interview_id: interviewId },
        data: { status: 'REJECTED' },
      });

    });

    const result = await prisma.interview.findUnique({
      where: { interview_id: interviewId },
      include: {
        application: {
          include: {
            job: {
              select: {
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
                full_name: true,
                status: true,
                contact: {
                  select: {
                    email: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    // Send rejection email
    const applicantEmail = result!.application.applicant.contact?.email;
    if (applicantEmail) {
      sendInterviewRejectionEmail({
        applicantEmail,
        applicantName: result!.application.applicant.full_name,
        jobTitle: result!.application.job.job_title,
        organizationName: result!.application.job.organization.name,
      })
        .then((emailResult) => {
          if (emailResult.success) {
            console.log('✅ Rejection email sent successfully');
          } else {
            console.error('❌ Failed to send rejection email:', emailResult.error);
          }
        })
        .catch((error) => {
          console.error('❌ Error in rejection email process:', error.message);
        });
    }

    return sendSuccess(res, result);
  } catch (err: any) {
    console.error('Error rejecting interview:', err);
    return sendError(res, 'Failed to reject interview', 500);
  }
};


/**
 * ACCEPT INTERVIEW
 * PATCH /api/pipeline/interview/:interviewId/accept
 */
const acceptInterview = async (req: Request, res: Response) => {
  try {
    const { interviewId } = req.params;

    const interview = await prisma.interview.findUnique({
      where: { interview_id: interviewId },
      include: {
        application: {
          include: {
            applicant: {
              include: {
                contact: true,
              },
            },
            job: {
              include: {
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

    if (!interview) {
      return sendError(res, 'Interview not found', 404);
    }

    await prisma.$transaction(async (tx) => {
      await tx.interview.update({
        where: { interview_id: interviewId },
        data: { status: 'ACCEPTED' },
      });

      await tx.application.update({
        where: { application_id: interview.application_id },
        data: { status: 'OFFERED' },
      });
    });

    const result = await prisma.interview.findUnique({
      where: { interview_id: interviewId },
      include: {
        application: {
          include: {
            job: {
              select: {
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
                full_name: true,
                status: true,
                contact: {
                  select: {
                    email: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    // Send offer letter email
    const applicantEmail = result!.application.applicant.contact?.email;
    if (applicantEmail) {
      sendOfferLetterEmail({
        applicantEmail,
        applicantName: result!.application.applicant.full_name,
        jobTitle: result!.application.job.job_title,
        organizationName: result!.application.job.organization.name,
      })
        .then((emailResult) => {
          if (emailResult.success) {
            console.log('✅ Offer letter email sent successfully');
          } else {
            console.error('❌ Failed to send offer email:', emailResult.error);
          }
        })
        .catch((error) => {
          console.error('❌ Error in offer email process:', error.message);
        });
    }

    return sendSuccess(res, result);
  } catch (err: any) {
    console.error('Error accepting interview:', err);
    return sendError(res, 'Failed to accept interview', 500);
  }
};

/**
 * ONBOARD CANDIDATE
 * PATCH /api/pipeline/:pipelineStageId/onboard
 * 
 * Body:
 * {
 *   "start_date": "2024-03-15T00:00:00Z",
 *   "end_date": "2024-12-31T00:00:00Z", // optional
 *   "employment_type": "W2" | "CONTRACTOR_1099",
 *   "workers_comp_code": "8810" // optional
 * }
 */
const onboardCandidate = async (req: Request, res: Response) => {
  try {
    const { pipelineStageId } = req.params;
    const { start_date, end_date, employment_type, workers_comp_code } = req.body;

    // Validate required fields
    if (!start_date || !employment_type) {
      return sendError(
        res,
        'start_date and employment_type are required',
        400
      );
    }

    // Validate employment_type
    if (!['W2', 'CONTRACTOR_1099'].includes(employment_type)) {
      return sendError(
        res,
        'employment_type must be either W2 or CONTRACTOR_1099',
        400
      );
    }

    // Validate dates
    const startDate = new Date(start_date);
    if (isNaN(startDate.getTime())) {
      return sendError(res, 'Invalid start_date format', 400);
    }

    if (end_date) {
      const endDate = new Date(end_date);
      if (isNaN(endDate.getTime())) {
        return sendError(res, 'Invalid end_date format', 400);
      }
      if (endDate <= startDate) {
        return sendError(res, 'end_date must be after start_date', 400);
      }
    }

    const pipelineStage = await prisma.pipelineStage.findUnique({
      where: { pipeline_stage_id: pipelineStageId },
      include: {
        application: {
          include: {
            applicant: {
              include: {
                contact: true,
              },
            },
            job: {
              include: {
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

    if (!pipelineStage) {
      return sendError(res, 'Pipeline stage not found', 404);
    }

    const interview = await prisma.interview.findUnique({
      where: { application_id: pipelineStage.application_id },
    });

    if (!interview || interview.status !== 'ACCEPTED') {
      return sendError(
        res,
        'Cannot onboard: Interview must be accepted first',
        400
      );
    }

    // Check if assignment already exists
    const existingAssignment = await prisma.assignment.findUnique({
      where: { application_id: pipelineStage.application_id },
    });

    if (existingAssignment) {
      return sendError(
        res,
        'Assignment already exists for this application',
        400
      );
    }

    await prisma.$transaction(async (tx) => {
      // Update pipeline stage
      await tx.pipelineStage.update({
        where: { pipeline_stage_id: pipelineStageId },
        data: { stage_name: 'ONBOARDED' },
      });

      // Update application status
      await tx.application.update({
        where: { application_id: pipelineStage.application_id },
        data: { status: 'HIRED' },
      });

      // Update applicant status
      await tx.applicant.update({
        where: { applicant_id: pipelineStage.application.applicant_id },
        data: { status: 'PLACED' },
      });

      // Create assignment record
      await tx.assignment.create({
        data: {
          application_id: pipelineStage.application_id,
          start_date: startDate,
          end_date: end_date ? new Date(end_date) : null,
          employment_type: employment_type,
          workers_comp_code: workers_comp_code || null,
        },
      });
    });

    const result = await prisma.pipelineStage.findUnique({
      where: { pipeline_stage_id: pipelineStageId },
      include: {
        application: {
          include: {
            job: {
              select: {
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
                full_name: true,
                status: true,
                contact: {
                  select: {
                    email: true,
                  },
                },
              },
            },
            assignment: {
              select: {
                assignment_id: true,
                start_date: true,
                end_date: true,
                employment_type: true,
                workers_comp_code: true,
              },
            },
          },
        },
        credit_user: {
          select: {
            user_id: true,
            name: true,
          },
        },
        representative_user: {
          select: {
            user_id: true,
            name: true,
          },
        },
      },
    });

    // Send onboarding welcome email
    const applicantEmail = result!.application.applicant.contact?.email;
    if (applicantEmail) {
      sendOnboardingWelcomeEmail({
        applicantEmail,
        applicantName: result!.application.applicant.full_name,
        jobTitle: result!.application.job.job_title,
        organizationName: result!.application.job.organization.name,
      })
        .then((emailResult) => {
          if (emailResult.success) {
            console.log('✅ Onboarding welcome email sent successfully');
          } else {
            console.error('❌ Failed to send onboarding email:', emailResult.error);
          }
        })
        .catch((error) => {
          console.error('❌ Error in onboarding email process:', error.message);
        });
    }

    return sendSuccess(res, result);
  } catch (err: any) {
    console.error('Error onboarding candidate:', err);
    return sendError(res, 'Failed to onboard candidate', 500);
  }
};


/**
 * Get pipeline stages by job
 * GET /api/pipeline/job/:jobId?stage=PIPELINED
 */
const getPipelineByJob = async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 10));
    const skip = (page - 1) * limit;
    const stage = req.query.stage as string;

    // Build where clause to filter by job through application relation
    const whereClause: any = {
      application: {
        job_id: jobId
      }
    };
    
    // Add stage filter if provided
    if (stage && ['PIPELINED', 'INTERVIEWED', 'ONBOARDED'].includes(stage.toUpperCase())) {
      whereClause.stage_name = stage.toUpperCase();
    }

    const [pipelineStages, total] = await Promise.all([
      prisma.pipelineStage.findMany({
        where: whereClause,
        skip,
        take: limit,
        orderBy: { pipeline_date: 'desc' },
        include: {
          application: {
            include: {
              applicant: {
                select: {
                  applicant_id: true,
                  full_name: true,
                  status: true,
                  contact: {
                    select: {
                      email: true,
                      phone: true,
                    },
                  },
                },
              },
              job: {
                select: {
                  job_id: true,
                  job_title: true,
                  organization: {
                    select: {
                      organization_id: true,
                      name: true,
                    },
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
            },
          },
          credit_user: {
            select: {
              user_id: true,
              name: true,
              email: true,
            },
          },
          representative_user: {
            select: {
              user_id: true,
              name: true,
              email: true,
            },
          },
        },
      }),
      prisma.pipelineStage.count({ where: whereClause }),
    ]);

    return sendSuccess(res, {
      data: pipelineStages,
      paging: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err: any) {
    console.error('Error fetching pipeline by job:', err);
    return sendError(res, 'Failed to fetch pipeline', 500);
  }
};




/**
 * Get pipeline statistics
 * GET /api/pipeline/stats
 * 
 * Returns counts for each stage (PIPELINED, INTERVIEWED, ONBOARDED)
 */
const getPipelineStats = async (req: Request, res: Response) => {
  try {
    // Get counts for all stages
    const [pipelineStages, totalCandidates] = await Promise.all([
      prisma.pipelineStage.groupBy({
        by: ['stage_name'],
        _count: {
          pipeline_stage_id: true,
        },
      }),
      prisma.pipelineStage.count(),
    ]);

    // Format stats to ensure all stages are present
    const allStages = ['PIPELINED', 'INTERVIEWED', 'ONBOARDED'];
    const formattedStats = allStages.map((stageName) => {
      const stat = pipelineStages.find((s) => s.stage_name === stageName);
      return {
        stage: stageName,
        count: stat ? stat._count.pipeline_stage_id : 0,
      };
    });

    return sendSuccess(res, {
      total_candidates: totalCandidates,
      by_stage: formattedStats,
    });
  } catch (err: any) {
    console.error('Error fetching pipeline stats:', err);
    return sendError(res, 'Failed to fetch pipeline statistics', 500);
  }
};

/**
 * Get complete pipeline overview with interview status
 * GET /api/pipeline/:pipelineStageId/overview
 */
const getPipelineOverview = async (req: Request, res: Response) => {
  try {
    const { pipelineStageId } = req.params;

    const pipelineStage = await prisma.pipelineStage.findUnique({
      where: { pipeline_stage_id: pipelineStageId },
      include: {
        application: {
          include: {
            job: {
              select: {
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
              include: {
                contact: true,
                demographic: true,
                work_history: {
                  where: {
                    OR: [
                      { application_id: { equals: null } },
                      { application_id: { not: null } },
                    ],
                  },
                  orderBy: { created_at: 'desc' },
                },
                documents: {
                  where: {
                    OR: [
                      { application_id: { equals: null } },
                      { application_id: { not: null } },
                    ],
                  },
                  orderBy: { created_at: 'desc' },
                },
              },
            },
            interviews: true,
          },
        },
        credit_user: {
          select: {
            user_id: true,
            name: true,
            email: true,
          },
        },
        representative_user: {
          select: {
            user_id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (!pipelineStage) {
      return sendError(res, 'Pipeline stage not found', 404);
    }

    return sendSuccess(res, pipelineStage);
  } catch (err: any) {
    console.error('Error fetching pipeline overview:', err);
    return sendError(res, 'Failed to fetch pipeline overview', 500);
  }
};


/**
 * GET PIPELINE STAGES BY INTERVIEW STATUS
 * GET /api/pipeline/filter-by-interview-status?status=PENDING&page=1&limit=10
 * 
 * Filters pipeline stages based on interview status
 * Valid statuses: PENDING, COMPLETED_RESULT_PENDING, REJECTED, ACCEPTED
 */
const getPipelineByInterviewStatus = async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 10));
    const skip = (page - 1) * limit;
    const status = req.query.status as string;

    // Validate interview status
    const validStatuses = ['PENDING', 'COMPLETED_RESULT_PENDING', 'REJECTED', 'ACCEPTED'];
    if (!status || !validStatuses.includes(status.toUpperCase())) {
      return sendError(res, 'Invalid or missing interview status. Valid values: PENDING, COMPLETED_RESULT_PENDING, REJECTED, ACCEPTED', 400);
    }

    // Build where clause to filter by interview status through application relation
    const whereClause: any = {
      application: {
        interviews: {
          some: {
            status: status.toUpperCase(),
          },
        },
      },
    };

    const [pipelineStages, total] = await Promise.all([
      prisma.pipelineStage.findMany({
        where: whereClause,
        skip,
        take: limit,
        orderBy: { pipeline_date: 'desc' },
        include: {
          application: {
            include: {
              applicant: {
                select: {
                  applicant_id: true,
                  full_name: true,
                  status: true,
                  contact: {
                    select: {
                      email: true,
                      phone: true,
                    },
                  },
                },
              },
              job: {
                select: {
                  job_id: true,
                  job_title: true,
                  organization: {
                    select: {
                      organization_id: true,
                      name: true,
                    },
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
            },
          },
          credit_user: {
            select: {
              user_id: true,
              name: true,
              email: true,
            },
          },
          representative_user: {
            select: {
              user_id: true,
              name: true,
              email: true,
            },
          },
        },
      }),
      prisma.pipelineStage.count({ where: whereClause }),
    ]);

    return sendSuccess(res, {
      data: pipelineStages,
      paging: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
      filter: {
        interview_status: status.toUpperCase(),
      },
    });
  } catch (err: any) {
    console.error('Error fetching pipeline by interview status:', err);
    return sendError(res, 'Failed to fetch pipeline stages', 500);
  }
};

/**
 * SEARCH PIPELINED APPLICANTS
 * GET /api/pipeline/search?query=john&page=1&limit=10
 * 
 * Searches pipelined applicants by:
 * - Organization name
 * - Job title
 * - Applicant name
 * - Applicant email
 */
const searchPipelinedApplicants = async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 10));
    const skip = (page - 1) * limit;
    const query = req.query.query as string;

    if (!query || query.trim().length === 0) {
      return sendError(res, 'Search query is required', 400);
    }

    const searchTerm = query.trim();

    // Build complex where clause for searching across multiple fields
    const whereClause: any = {
      application: {
        OR: [
          // Search by organization name
          {
            job: {
              organization: {
                name: {
                  contains: searchTerm,
                  mode: 'insensitive',
                },
              },
            },
          },
          // Search by job title
          {
            job: {
              job_title: {
                contains: searchTerm,
                mode: 'insensitive',
              },
            },
          },
          // Search by applicant name
          {
            applicant: {
              full_name: {
                contains: searchTerm,
                mode: 'insensitive',
              },
            },
          },
          // Search by applicant email
          {
            applicant: {
              contact: {
                email: {
                  contains: searchTerm,
                  mode: 'insensitive',
                },
              },
            },
          },
        ],
      },
    };

    const [pipelineStages, total] = await Promise.all([
      prisma.pipelineStage.findMany({
        where: whereClause,
        skip,
        take: limit,
        orderBy: { pipeline_date: 'desc' },
        include: {
          application: {
            include: {
              applicant: {
                select: {
                  applicant_id: true,
                  full_name: true,
                  status: true,
                  contact: {
                    select: {
                      email: true,
                      phone: true,
                    },
                  },
                },
              },
              job: {
                select: {
                  job_id: true,
                  job_title: true,
                  organization: {
                    select: {
                      organization_id: true,
                      name: true,
                    },
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
            },
          },
          credit_user: {
            select: {
              user_id: true,
              name: true,
              email: true,
            },
          },
          representative_user: {
            select: {
              user_id: true,
              name: true,
              email: true,
            },
          },
        },
      }),
      prisma.pipelineStage.count({ where: whereClause }),
    ]);

    return sendSuccess(res, {
      data: pipelineStages,
      paging: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
      search: {
        query: searchTerm,
        fields: ['organization_name', 'job_title', 'applicant_name', 'applicant_email'],
      },
    });
  } catch (err: any) {
    console.error('Error searching pipelined applicants:', err);
    return sendError(res, 'Failed to search applicants', 500);
  }
};





// Export controller
export const pipelineController = {
  // Override the getAll method with our custom one that supports filtering
  getAll: getAllPipelineStages,
  
  // Custom create with auto-status updates
  create: createPipeline,
  
  // Keep other CRUD methods from factory
  getById: baseCrudMethods.getById,
  update: baseCrudMethods.update,
  delete: baseCrudMethods.delete,
  
  // Interview integration
  createInterviewForPipeline,
  getInterviewByApplication,
  updateInterviewDate,
  autoUpdateCompletedInterviews,
  rejectInterview,
  acceptInterview,
  
  // Onboarding
  onboardCandidate,
  
  // Query methods
  getPipelineByJob,
  getPipelineStats,
  getPipelineOverview,
  getPipelineByInterviewStatus, // ← ADD THIS LINE
  searchPipelinedApplicants, // ← ADD THIS LINE

};