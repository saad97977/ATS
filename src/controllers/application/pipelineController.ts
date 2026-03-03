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
  sendOnboardingWelcomeEmail,
} from '../../services/emailService';
import { updateUserActivity } from '../../services/activityService';

// ─────────────────────────────────────────────────────────────────────────────
// TIMEZONE CONFIGURATION
// ─────────────────────────────────────────────────────────────────────────────
const TIMEZONE_OFFSET_HOURS = -5; // informational only

// Base CRUD methods
const baseCrudMethods = createCrudController({
  model: prisma.pipelineStage,
  modelName: 'PipelineStage',
  idField: 'pipeline_stage_id',
  createSchema: createPipelineStageSchema,
  updateSchema: updatePipelineStageSchema,
  defaultLimit: 10,
  maxLimit: 100,
});

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Determine interview round config from job fields
// ─────────────────────────────────────────────────────────────────────────────
//
// Uses `interview_rounds` (Int) if present, otherwise falls back to the
// legacy boolean fields (interview_Round1 / interview_Round2) so existing
// data continues to work without any backfill.
//
//   interview_rounds = 0  → No interviews required, direct onboard
//   interview_rounds = 1  → 1 round (default)
//   interview_rounds = N  → N rounds
//
// Legacy fallback:
//   Round1=false, Round2=false → 0 rounds
//   Round1=true,  Round2=false → 1 round
//   Round1=true,  Round2=true  → 2 rounds
//
const getInterviewRoundConfig = (job: any) => {
  let totalRounds: number;

  if (job?.interview_rounds !== undefined && job?.interview_rounds !== null) {
    totalRounds = Math.max(0, Number(job.interview_rounds));
  } else {
    // Legacy boolean fallback
    const r1 = !!job?.interview_Round1;
    const r2 = !!job?.interview_Round2;
    if (!r1 && !r2) totalRounds = 0;
    else if (r1 && !r2) totalRounds = 1;
    else totalRounds = 2;
  }

  return {
    totalRounds,
    noInterviewRequired: totalRounds === 0,
    // Legacy compat helpers
    round1Required: totalRounds >= 1,
    round2Required: totalRounds >= 2,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Determine next schedulable round
// Returns the round number to schedule next, or null if nothing to schedule.
// ─────────────────────────────────────────────────────────────────────────────
const getNextRoundToSchedule = (
  interviews: { round: number | null; status: string }[],
  totalRounds: number
): number | null => {
  if (totalRounds === 0) return null;

  for (let r = 1; r <= totalRounds; r++) {
    const iv = interviews.find((i) => (i.round ?? 1) === r);
    if (!iv) {
      // This round hasn't been scheduled yet.
      // Check that the previous round was accepted (or r === 1).
      if (r === 1) return 1;
      const prev = interviews.find((i) => (i.round ?? 1) === r - 1);
      if (prev?.status === 'ACCEPTED') return r;
      return null; // previous round not yet accepted
    }
    if (iv.status === 'REJECTED') return null; // pipeline ended
    if (iv.status === 'PENDING' || iv.status === 'COMPLETED_RESULT_PENDING') return null; // in progress
    // ACCEPTED → continue to next round
  }

  return null; // all rounds scheduled
};

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Can the candidate be onboarded?
// ─────────────────────────────────────────────────────────────────────────────
const canOnboard = (
  interviews: { round: number | null; status: string }[],
  totalRounds: number
): boolean => {
  if (totalRounds === 0) return true;
  for (let r = 1; r <= totalRounds; r++) {
    const iv = interviews.find((i) => (i.round ?? 1) === r);
    if (!iv || iv.status !== 'ACCEPTED') return false;
  }
  return true;
};

// ─────────────────────────────────────────────────────────────────────────────
// SHARED INCLUDE FRAGMENT
// ─────────────────────────────────────────────────────────────────────────────
const pipelineInclude = {
  application: {
    include: {
      applicant: {
        select: {
          applicant_id: true,
          full_name: true,
          status: true,
          contact: { select: { email: true, phone: true } },
        },
      },
      job: {
        select: {
          job_id: true,
          job_title: true,
          organization: { select: { organization_id: true, name: true } },
          resume_required: true,
          interview_Round1: true,
          interview_Round2: true,
          interview_rounds: true,
        },
      },
      interviews: {
        select: {
          interview_id: true,
          interview_date: true,
          status: true,
          round: true,
          interview_type: true,
        },
        orderBy: { round: 'asc' as const },
      },
    },
  },
  credit_user:         { select: { user_id: true, name: true, email: true } },
  representative_user: { select: { user_id: true, name: true, email: true } },
};

// ─────────────────────────────────────────────────────────────────────────────
// RESHAPE: Strip interview_Round1/Round2/interview_rounds into job_requirements
// ─────────────────────────────────────────────────────────────────────────────
const reshapePipelineStage = (stage: any) => {
  const { application, ...stageRest } = stage;
  const { job, ...applicationRest } = application as any;
  const { resume_required, interview_Round1, interview_Round2, interview_rounds, ...jobRest } = job ?? {};
  return {
    ...stageRest,
    application: { ...applicationRest, job: jobRest },
    job_requirements: { resume_required, interview_Round1, interview_Round2, interview_rounds },
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// GET ALL PIPELINE STAGES
// GET /api/pipeline?stage=PIPELINED&page=1&limit=10
// ─────────────────────────────────────────────────────────────────────────────
const getAllPipelineStages = async (req: Request, res: Response) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 10));
    const skip  = (page - 1) * limit;
    const stage = req.query.stage as string;

    const whereClause: any = {};
    if (stage && ['PIPELINED', 'INTERVIEWED', 'ONBOARDED'].includes(stage.toUpperCase())) {
      whereClause.stage_name = stage.toUpperCase();
    }

    const [pipelineStages, total] = await Promise.all([
      prisma.pipelineStage.findMany({
        where: whereClause, skip, take: limit,
        orderBy: { pipeline_date: 'desc' },
        include: pipelineInclude,
      }),
      prisma.pipelineStage.count({ where: whereClause }),
    ]);

    return sendSuccess(res, {
      data: pipelineStages.map(reshapePipelineStage),
      paging: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (err: any) {
    console.error('Error fetching pipeline stages:', err);
    return sendError(res, 'Failed to fetch pipeline stages', 500);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// CREATE PIPELINE
// POST /api/pipeline
// ─────────────────────────────────────────────────────────────────────────────
const createPipeline = async (req: Request, res: Response) => {
  try {
    const validation = createPipelineStageSchema.safeParse(req.body);
    if (!validation.success) {
      return sendError(res, 'Validation failed', 400,
        validation.error.issues.map((e: any) => ({ field: e.path.join('.'), message: e.message })));
    }

    const { application_id, credit_organization_user_id, representative_organization_user_id } = req.body;

    const application = await prisma.application.findUnique({
      where: { application_id },
      include: { applicant: true, job: true },
    });
    if (!application) return sendError(res, 'Application not found', 404);

    const existing = await prisma.pipelineStage.findFirst({ where: { application_id } });
    if (existing) {
      return sendError(res, 'Pipeline already exists for this application', 409, [{
        field: 'duplicate',
        message: `Pipeline already exists with ID: ${existing.pipeline_stage_id}`,
      }]);
    }

    const pipelineStageId = await prisma.$transaction(async (tx) => {
      const ps = await tx.pipelineStage.create({
        data: {
          application_id,
          stage_name: 'PIPELINED',
          credit_organization_user_id: credit_organization_user_id || null,
          representative_organization_user_id: representative_organization_user_id || null,
        },
        select: { pipeline_stage_id: true },
      });
      await tx.application.update({ where: { application_id }, data: { status: 'SCREENED' } });
      await tx.applicant.update({
        where: { applicant_id: application.applicant_id },
        data: { status: 'SHORTLISTED' },
      });
      return ps.pipeline_stage_id;
    });

    const result = await prisma.pipelineStage.findUnique({
      where: { pipeline_stage_id: pipelineStageId },
      include: {
        application: {
          include: {
            applicant: { select: { applicant_id: true, full_name: true, status: true } },
            job: { select: { job_id: true, job_title: true, organization: { select: { name: true } } } },
          },
        },
        credit_user:         { select: { user_id: true, name: true, email: true } },
        representative_user: { select: { user_id: true, name: true, email: true } },
      },
    });

    return sendSuccess(res, result, 201);
  } catch (err: any) {
    console.error('Error creating pipeline:', err);
    if (err.code === 'P2002') return sendError(res, 'Pipeline already exists for this application', 409);
    if (err.code === 'P2003') return sendError(res, 'Related application or job not found', 404);
    return sendError(res, 'Failed to create pipeline', 500);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// CREATE INTERVIEW
// POST /api/pipeline/:pipelineStageId/interview
//
// N-round logic:
//   - interview_rounds = 0  → error, use onboard directly
//   - Schedules the next required round in sequence
//   - Each round must be ACCEPTED before the next can be scheduled
//
// Body: { interview_date: ISO string, round?: number, interview_type?: 'ONLINE' | 'OFFLINE' }
// ─────────────────────────────────────────────────────────────────────────────
const createInterviewForPipeline = async (req: Request, res: Response) => {
  try {
    const { pipelineStageId } = req.params;
    const { interview_date, round: requestedRound, interview_type } = req.body;

    if (!interview_date) return sendError(res, 'interview_date is required', 400);

    const interviewDateUTC = new Date(interview_date);
    if (isNaN(interviewDateUTC.getTime())) return sendError(res, 'Invalid interview_date format', 400);

    const interviewType = interview_type === 'OFFLINE' ? 'OFFLINE' : 'ONLINE';

    const pipelineStage = await prisma.pipelineStage.findUnique({
      where: { pipeline_stage_id: pipelineStageId },
      include: {
        application: {
          include: {
            applicant: { include: { contact: true } },
            job: {
              include: {
                organization: {
                  select: {
                    name: true, website: true,
                    contacts: { where: { contact_type: 'PRIMARY' }, take: 1 },
                  },
                },
              },
            },
            interviews: { orderBy: { round: 'asc' } },
          },
        },
      },
    });

    if (!pipelineStage) return sendError(res, 'Pipeline stage not found', 404);

    const job = pipelineStage.application.job;
    const { totalRounds, noInterviewRequired } = getInterviewRoundConfig(job);
    const existingInterviews = pipelineStage.application.interviews as any[];

    if (noInterviewRequired) {
      return sendError(res, 'This job requires no interview rounds. Use the onboard endpoint directly.', 400);
    }

    const roundToSchedule = getNextRoundToSchedule(existingInterviews, totalRounds);

    if (roundToSchedule === null) {
      // Figure out why
      const hasRejected = existingInterviews.some((i) => i.status === 'REJECTED');
      if (hasRejected) return sendError(res, 'Cannot schedule: a previous interview round was rejected.', 400);

      const allScheduled = existingInterviews.length >= totalRounds;
      if (allScheduled) return sendError(res, `All ${totalRounds} interview round(s) have already been scheduled.`, 409);

      return sendError(res, 'Cannot schedule interview at this stage. Check previous round status.', 400);
    }

    // Validate requested round matches expected round (if frontend sends it)
    if (requestedRound && Number(requestedRound) !== roundToSchedule) {
      return sendError(res, `Expected round ${roundToSchedule} but received round ${requestedRound}`, 400);
    }

    const applicantEmail = pipelineStage.application.applicant.contact?.email;
    if (!applicantEmail) {
      return sendError(res, 'Applicant email not found. Cannot send interview invitation.', 400);
    }

    const interviewId = await prisma.$transaction(async (tx) => {
      const iv = await (tx.interview as any).create({
        data: {
          application_id: pipelineStage.application_id,
          interview_date: interviewDateUTC,
          status: 'PENDING',
          round: roundToSchedule,
          interview_type: interviewType,
        },
        select: { interview_id: true },
      });
      if (roundToSchedule === 1) {
        await tx.applicant.update({
          where: { applicant_id: pipelineStage.application.applicant_id },
          data: { status: 'INTERVIEWING' },
        });
      }
      return iv.interview_id;
    });

    const result = await (prisma.interview as any).findUnique({
      where: { interview_id: interviewId },
      include: {
        application: {
          include: {
            job: {
              select: {
                job_id: true, job_title: true, location: true,
                organization: {
                  select: {
                    organization_id: true, name: true, website: true,
                    contacts: { where: { contact_type: 'PRIMARY' }, select: { email: true, phone: true } },
                  },
                },
              },
            },
            applicant: { select: { applicant_id: true, full_name: true, contact: { select: { email: true, phone: true } } } },
          },
        },
      },
    });

    sendInterviewInvitationEmail({
      applicantEmail:      result.application.applicant.contact.email,
      applicantName:       result.application.applicant.full_name,
      jobTitle:            result.application.job.job_title,
      organizationName:    result.application.job.organization.name,
      organizationWebsite: result.application.job.organization.website || undefined,
      interviewDate:       result.interview_date,
      location:            result.application.job.location,
      contactEmail:        result.application.job.organization.contacts[0]?.email || undefined,
      contactPhone:        result.application.job.organization.contacts[0]?.phone || undefined,
      round:               roundToSchedule,
      totalRounds,
      interviewType,
    }).then((r) => {
      if (r.success) console.log(`✅ Round ${roundToSchedule} invitation email sent`, { interviewId: result.interview_id });
      else           console.error('❌ Failed to send invitation email', { error: r.error });
    }).catch((e) => console.error('❌ Email error', e.message));

    const userId = (req as any).user?.user_id;
    if (userId) {
      await updateUserActivity(userId, {
        action_type: 'SCHEDULE', entity_type: 'INTERVIEW', entity_id: result.interview_id,
        entity_name: `Round ${roundToSchedule} Interview for ${result.application.applicant.full_name} - ${result.application.job.job_title}`,
        timestamp: new Date().toISOString(),
      });
    }

    return sendSuccess(res, result, 201);
  } catch (err: any) {
    console.error('Error creating interview:', err);
    if (err.code === 'P2002') return sendError(res, 'Interview already exists for this round', 409);
    return sendError(res, 'Failed to create interview', 500);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// UPDATE INTERVIEW DATE
// PATCH /api/pipeline/interview/:interviewId/update-date
// ─────────────────────────────────────────────────────────────────────────────
const updateInterviewDate = async (req: Request, res: Response) => {
  try {
    const { interviewId }    = req.params;
    const { interview_date } = req.body;

    if (!interview_date) return sendError(res, 'interview_date is required', 400);

    const selectedDateUTC = new Date(interview_date);
    if (isNaN(selectedDateUTC.getTime())) return sendError(res, 'Invalid interview_date format', 400);
    if (selectedDateUTC.getTime() < Date.now()) return sendError(res, 'Interview date must be in the future', 400);

    const interview = await (prisma.interview as any).findUnique({
      where: { interview_id: interviewId },
      include: {
        application: {
          include: {
            applicant: { include: { contact: true } },
            job: { include: { organization: { select: { name: true } } } },
          },
        },
      },
    });

    if (!interview) return sendError(res, 'Interview not found', 404);
    if (interview.status !== 'PENDING') {
      return sendError(res, `Cannot update interview date. Status is ${interview.status}. Only PENDING interviews can be rescheduled.`, 400);
    }

    const oldDate = interview.interview_date;

    const updated = await (prisma.interview as any).update({
      where: { interview_id: interviewId },
      data:  { interview_date: selectedDateUTC },
      include: {
        application: {
          include: {
            job: { select: { job_id: true, job_title: true, location: true, organization: { select: { name: true } } } },
            applicant: { select: { full_name: true, status: true, contact: { select: { email: true } } } },
          },
        },
      },
    });

    const aEmail = updated.application.applicant.contact?.email;
    if (aEmail) {
      sendInterviewRescheduleEmail({
        applicantEmail:   aEmail,
        applicantName:    updated.application.applicant.full_name,
        jobTitle:         updated.application.job.job_title,
        organizationName: updated.application.job.organization.name,
        oldDate,
        newDate: updated.interview_date,
        location: updated.application.job.location,
      }).then((r) => { if (!r.success) console.error('❌ Reschedule email failed:', r.error); })
        .catch((e) => console.error('❌ Reschedule email error:', e.message));
    }

    const userId = (req as any).user?.user_id;
    if (userId) {
      await updateUserActivity(userId, {
        action_type: 'UPDATE', entity_type: 'INTERVIEW', entity_id: interviewId,
        entity_name: `Rescheduled interview for ${interview.application.applicant.full_name} - ${interview.application.job.job_title}`,
        timestamp: new Date().toISOString(),
      });
    }

    return sendSuccess(res, updated);
  } catch (err: any) {
    console.error('Error updating interview date:', err);
    return sendError(res, 'Failed to update interview date', 500);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET INTERVIEW BY APPLICATION
// GET /api/pipeline/interview/application/:applicationId
// ─────────────────────────────────────────────────────────────────────────────
const getInterviewByApplication = async (req: Request, res: Response) => {
  try {
    const { applicationId } = req.params;

    const interviews = await (prisma.interview as any).findMany({
      where: { application_id: applicationId },
      orderBy: { round: 'asc' },
      include: {
        application: {
          include: {
            job: {
              select: {
                job_id: true, job_title: true, job_type: true, location: true,
                interview_Round1: true, interview_Round2: true, interview_rounds: true,
                organization: {
                  select: {
                    organization_id: true, name: true, website: true,
                    contacts: { where: { contact_type: 'PRIMARY' }, select: { name: true, email: true, phone: true } },
                  },
                },
              },
            },
            applicant: { include: { contact: true, demographic: true } },
            pipeline_stages: {
              include: {
                credit_user:         { select: { user_id: true, name: true, email: true } },
                representative_user: { select: { user_id: true, name: true, email: true } },
              },
            },
          },
        },
      },
    });

    if (!interviews.length) return sendError(res, 'Interview not found for this application', 404);

    const activeInterview = interviews.find(
      (i: any) => i.status === 'PENDING' || i.status === 'COMPLETED_RESULT_PENDING'
    ) || interviews[interviews.length - 1];

    const app = activeInterview.application;
    const job = app.job;
    const { totalRounds, noInterviewRequired } = getInterviewRoundConfig(job);

    // Build timeline events: one per required round + standard stages
    const roundEvents = [];
    for (let r = 1; r <= totalRounds; r++) {
      const iv = interviews.find((i: any) => (i.round ?? 1) === r);
      roundEvents.push({
        stage: `ROUND_${r}`,
        date: iv?.interview_date || null,
        description: `Round ${r} Interview${iv?.interview_type ? ` (${iv.interview_type})` : ''}`,
        status: !iv ? 'pending'
          : iv.status === 'PENDING' ? 'current'
          : iv.status === 'REJECTED' ? 'rejected'
          : 'completed',
      });
    }

    const statusTimeline = {
      application_status: app.status,
      applicant_status:   app.applicant.status,
      interview_status:   activeInterview.status,
      pipeline_stage:     app.pipeline_stages[0]?.stage_name || null,
      round_config:       { totalRounds, noInterviewRequired },
      events: [
        { stage: 'APPLIED',    date: app.applied_at,                              description: 'Application submitted',                status: 'completed' },
        { stage: 'SCREENED',   date: app.pipeline_stages[0]?.pipeline_date || null, description: 'Application screened and shortlisted', status: app.status === 'APPLIED' ? 'pending' : 'completed' },
        ...roundEvents,
        { stage: 'OFFERED',    date: null, description: 'Offer extended',                 status: app.status === 'OFFERED' ? 'current' : app.status === 'HIRED' ? 'completed' : 'pending' },
        { stage: 'HIRED',      date: null, description: 'Candidate hired and onboarded',  status: app.status === 'HIRED' ? 'completed' : 'pending' },
      ],
    };

    return sendSuccess(res, { interview: activeInterview, all_interviews: interviews, status_timeline: statusTimeline });
  } catch (err: any) {
    console.error('Error fetching interview by application:', err);
    return sendError(res, 'Failed to fetch interview details', 500);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// AUTO-UPDATE COMPLETED INTERVIEWS
// POST /api/pipeline/auto-update-completed
// ─────────────────────────────────────────────────────────────────────────────
const autoUpdateCompletedInterviews = async (req: Request, res: Response) => {
  try {
    const nowUTC = new Date();

    const pending = await (prisma.interview as any).findMany({
      where: { status: 'PENDING', interview_date: { lt: nowUTC } },
      include: { application: { select: { application_id: true, job_id: true } } },
    });

    if (!pending.length) return sendSuccess(res, { message: 'No interviews to update', updated_count: 0 });

    const count = await prisma.$transaction(async (tx) => {
      const r = await (tx.interview as any).updateMany({
        where: { status: 'PENDING', interview_date: { lt: nowUTC } },
        data:  { status: 'COMPLETED_RESULT_PENDING' },
      });
      await tx.pipelineStage.updateMany({
        where: { application: { interviews: { some: { status: 'COMPLETED_RESULT_PENDING', interview_date: { lt: nowUTC } } } } },
        data: { stage_name: 'INTERVIEWED' },
      });
      return r.count;
    });

    return sendSuccess(res, { message: `Successfully updated ${count} interviews`, updated_count: count });
  } catch (err: any) {
    console.error('Error auto-updating interviews:', err);
    return sendError(res, 'Failed to auto-update interviews', 500);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// REJECT INTERVIEW
// PATCH /api/pipeline/interview/:interviewId/reject
// ─────────────────────────────────────────────────────────────────────────────
const rejectInterview = async (req: Request, res: Response) => {
  try {
    const { interviewId } = req.params;

    const interview = await (prisma.interview as any).findUnique({
      where: { interview_id: interviewId },
      include: {
        application: {
          include: {
            applicant: { include: { contact: true } },
            job: { include: { organization: { select: { name: true } } } },
          },
        },
      },
    });
    if (!interview) return sendError(res, 'Interview not found', 404);
    if (interview.status !== 'COMPLETED_RESULT_PENDING') {
      return sendError(res, `Cannot reject interview with status ${interview.status}. Must be COMPLETED_RESULT_PENDING.`, 400);
    }

    await (prisma.interview as any).update({ where: { interview_id: interviewId }, data: { status: 'REJECTED' } });

    const result = await (prisma.interview as any).findUnique({
      where: { interview_id: interviewId },
      include: {
        application: {
          include: {
            job: { select: { job_title: true, organization: { select: { name: true } } } },
            applicant: { select: { full_name: true, status: true, contact: { select: { email: true } } } },
          },
        },
      },
    });

    const aEmail = result.application.applicant.contact?.email;
    if (aEmail) {
      sendInterviewRejectionEmail({
        applicantEmail:   aEmail,
        applicantName:    result.application.applicant.full_name,
        jobTitle:         result.application.job.job_title,
        organizationName: result.application.job.organization.name,
      }).then((r) => { if (!r.success) console.error('❌ Rejection email failed:', r.error); })
        .catch((e) => console.error('❌ Rejection email error:', e.message));
    }

    return sendSuccess(res, result);
  } catch (err: any) {
    console.error('Error rejecting interview:', err);
    return sendError(res, 'Failed to reject interview', 500);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// ACCEPT INTERVIEW
// PATCH /api/pipeline/interview/:interviewId/accept
//
// N-round logic:
//   - If this is the last required round → ACCEPTED + application → OFFERED
//   - Otherwise → ACCEPTED, wait for next round to be scheduled
// ─────────────────────────────────────────────────────────────────────────────
const acceptInterview = async (req: Request, res: Response) => {
  try {
    const { interviewId } = req.params;

    const interview = await (prisma.interview as any).findUnique({
      where: { interview_id: interviewId },
      include: {
        application: {
          include: {
            applicant: { include: { contact: true } },
            job: { include: { organization: { select: { name: true } } } },
            interviews: { orderBy: { round: 'asc' } },
          },
        },
      },
    });
    if (!interview) return sendError(res, 'Interview not found', 404);
    if (interview.status !== 'COMPLETED_RESULT_PENDING') {
      return sendError(res, `Cannot accept interview with status ${interview.status}. Must be COMPLETED_RESULT_PENDING.`, 400);
    }

    const job = interview.application.job;
    const { totalRounds } = getInterviewRoundConfig(job);
    const currentRound = interview.round ?? 1;
    const isLastRound  = currentRound >= totalRounds;

    await prisma.$transaction(async (tx) => {
      await (tx.interview as any).update({ where: { interview_id: interviewId }, data: { status: 'ACCEPTED' } });
      if (isLastRound) {
        await tx.application.update({
          where: { application_id: interview.application_id },
          data: { status: 'OFFERED' },
        });
      }
    });

    const result = await (prisma.interview as any).findUnique({
      where: { interview_id: interviewId },
      include: {
        application: {
          include: {
            job: { select: { job_title: true, organization: { select: { name: true } } } },
            applicant: { select: { full_name: true, status: true, contact: { select: { email: true } } } },
          },
        },
      },
    });

    if (isLastRound) {
      const aEmail = result.application.applicant.contact?.email;
      if (aEmail) {
        sendOfferLetterEmail({
          applicantEmail:   aEmail,
          applicantName:    result.application.applicant.full_name,
          jobTitle:         result.application.job.job_title,
          organizationName: result.application.job.organization.name,
        }).then((r) => { if (!r.success) console.error('❌ Offer email failed:', r.error); })
          .catch((e) => console.error('❌ Offer email error:', e.message));
      }
    }

    const message = isLastRound
      ? `Round ${currentRound} accepted. Offer letter sent to candidate.`
      : `Round ${currentRound} accepted. Please schedule Round ${currentRound + 1} next.`;

    return sendSuccess(res, {
      ...result,
      _meta: { message, isLastRound, nextRound: isLastRound ? null : currentRound + 1 },
    });
  } catch (err: any) {
    console.error('Error accepting interview:', err);
    return sendError(res, 'Failed to accept interview', 500);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// ONBOARD CANDIDATE
// PATCH /api/pipeline/:pipelineStageId/onboard
//
// N-round guard: all required rounds must be ACCEPTED before onboarding.
// noInterviewRequired → skip all interview checks.
// ─────────────────────────────────────────────────────────────────────────────
const onboardCandidate = async (req: Request, res: Response) => {
  try {
    const { pipelineStageId } = req.params;
    const { start_date, end_date, employment_type, workers_comp_code } = req.body;

    if (!start_date || !employment_type) return sendError(res, 'start_date and employment_type are required', 400);
    if (!['W2', 'CONTRACTOR_1099'].includes(employment_type)) {
      return sendError(res, 'employment_type must be W2 or CONTRACTOR_1099', 400);
    }

    const startDate = new Date(start_date);
    if (isNaN(startDate.getTime())) return sendError(res, 'Invalid start_date format', 400);

    if (end_date) {
      const endDate = new Date(end_date);
      if (isNaN(endDate.getTime())) return sendError(res, 'Invalid end_date format', 400);
      if (endDate <= startDate) return sendError(res, 'end_date must be after start_date', 400);
    }

    const pipelineStage = await prisma.pipelineStage.findUnique({
      where: { pipeline_stage_id: pipelineStageId },
      include: {
        application: {
          include: {
            applicant: { include: { contact: true } },
            job: { include: { organization: { select: { name: true } } } },
            interviews: { orderBy: { round: 'asc' } },
          },
        },
      },
    });
    if (!pipelineStage) return sendError(res, 'Pipeline stage not found', 404);

    const job = pipelineStage.application.job;
    const { totalRounds, noInterviewRequired } = getInterviewRoundConfig(job);
    const interviews = pipelineStage.application.interviews as any[];

    if (!noInterviewRequired) {
      if (!canOnboard(interviews, totalRounds)) {
        // Find which round is blocking
        for (let r = 1; r <= totalRounds; r++) {
          const iv = interviews.find((i) => (i.round ?? 1) === r);
          if (!iv) return sendError(res, `Cannot onboard: Round ${r} interview has not been scheduled yet.`, 400);
          if (iv.status !== 'ACCEPTED') return sendError(res, `Cannot onboard: Round ${r} interview must be accepted first (current status: ${iv.status}).`, 400);
        }
      }
    }

    const existing = await prisma.assignment.findUnique({ where: { application_id: pipelineStage.application_id } });
    if (existing) return sendError(res, 'Assignment already exists for this application', 400);

    await prisma.$transaction(async (tx) => {
      await tx.pipelineStage.update({ where: { pipeline_stage_id: pipelineStageId }, data: { stage_name: 'ONBOARDED' } });
      await tx.application.update({ where: { application_id: pipelineStage.application_id }, data: { status: 'HIRED' } });
      await tx.applicant.update({ where: { applicant_id: pipelineStage.application.applicant_id }, data: { status: 'PLACED' } });
      await tx.assignment.create({
        data: {
          application_id:   pipelineStage.application_id,
          start_date:       startDate,
          end_date:         end_date ? new Date(end_date) : null,
          employment_type,
          workers_comp_code: workers_comp_code || null,
        },
      });
    });

    const result = await prisma.pipelineStage.findUnique({
      where: { pipeline_stage_id: pipelineStageId },
      include: {
        application: {
          include: {
            job: { select: { job_title: true, organization: { select: { name: true } } } },
            applicant: { select: { full_name: true, status: true, contact: { select: { email: true } } } },
            assignment: { select: { assignment_id: true, start_date: true, end_date: true, employment_type: true, workers_comp_code: true } },
          },
        },
        credit_user:         { select: { user_id: true, name: true } },
        representative_user: { select: { user_id: true, name: true } },
      },
    });

    const aEmail = result!.application.applicant.contact?.email;
    if (aEmail) {
      sendOnboardingWelcomeEmail({
        applicantEmail:   aEmail,
        applicantName:    result!.application.applicant.full_name,
        jobTitle:         result!.application.job.job_title,
        organizationName: result!.application.job.organization.name,
        startDate,
        endDate:          end_date ? new Date(end_date) : null,
        employmentType:   employment_type,
        workersCompCode:  workers_comp_code ?? null,
      }).then((r) => { if (!r.success) console.error('❌ Onboarding email failed:', r.error); })
        .catch((e) => console.error('❌ Onboarding email error:', e.message));
    }

    return sendSuccess(res, result);
  } catch (err: any) {
    console.error('Error onboarding candidate:', err);
    return sendError(res, 'Failed to onboard candidate', 500);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET PIPELINE BY JOB
// ─────────────────────────────────────────────────────────────────────────────
const getPipelineByJob = async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    const page  = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 10));
    const skip  = (page - 1) * limit;
    const stage = req.query.stage as string;

    const whereClause: any = { application: { job_id: jobId } };
    if (stage && ['PIPELINED', 'INTERVIEWED', 'ONBOARDED'].includes(stage.toUpperCase())) {
      whereClause.stage_name = stage.toUpperCase();
    }

    const [pipelineStages, total] = await Promise.all([
      prisma.pipelineStage.findMany({
        where: whereClause, skip, take: limit, orderBy: { pipeline_date: 'desc' },
        include: pipelineInclude,
      }),
      prisma.pipelineStage.count({ where: whereClause }),
    ]);

    return sendSuccess(res, {
      data: pipelineStages.map(reshapePipelineStage),
      paging: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (err: any) {
    console.error('Error fetching pipeline by job:', err);
    return sendError(res, 'Failed to fetch pipeline', 500);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET PIPELINE STATS
// ─────────────────────────────────────────────────────────────────────────────
const getPipelineStats = async (req: Request, res: Response) => {
  try {
    const [grouped, total] = await Promise.all([
      prisma.pipelineStage.groupBy({ by: ['stage_name'], _count: { pipeline_stage_id: true } }),
      prisma.pipelineStage.count(),
    ]);
    const by_stage = ['PIPELINED', 'INTERVIEWED', 'ONBOARDED'].map((s) => ({
      stage: s, count: grouped.find((g) => g.stage_name === s)?._count.pipeline_stage_id ?? 0,
    }));
    return sendSuccess(res, { total_candidates: total, by_stage });
  } catch (err: any) {
    console.error('Error fetching pipeline stats:', err);
    return sendError(res, 'Failed to fetch pipeline statistics', 500);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET PIPELINE OVERVIEW
// ─────────────────────────────────────────────────────────────────────────────
const getPipelineOverview = async (req: Request, res: Response) => {
  try {
    const { pipelineStageId } = req.params;
    const ps = await prisma.pipelineStage.findUnique({
      where: { pipeline_stage_id: pipelineStageId },
      include: {
        application: {
          include: {
            job: {
              select: {
                job_title: true, job_type: true, location: true,
                interview_Round1: true, interview_Round2: true, interview_rounds: true,
                organization: { select: { name: true, website: true } },
              },
            },
            applicant: {
              include: {
                contact: true, demographic: true,
                work_history: { orderBy: { created_at: 'desc' } },
                documents:    { orderBy: { created_at: 'desc' } },
              },
            },
            interviews: { orderBy: { round: 'asc' } },
          },
        },
        credit_user:         { select: { user_id: true, name: true, email: true } },
        representative_user: { select: { user_id: true, name: true, email: true } },
      },
    });
    if (!ps) return sendError(res, 'Pipeline stage not found', 404);
    return sendSuccess(res, ps);
  } catch (err: any) {
    console.error('Error fetching pipeline overview:', err);
    return sendError(res, 'Failed to fetch pipeline overview', 500);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET PIPELINE BY INTERVIEW STATUS
// ─────────────────────────────────────────────────────────────────────────────
const getPipelineByInterviewStatus = async (req: Request, res: Response) => {
  try {
    const page   = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 10));
    const skip   = (page - 1) * limit;
    const status = req.query.status as string;

    if (!status || !['PENDING', 'COMPLETED_RESULT_PENDING', 'REJECTED', 'ACCEPTED'].includes(status.toUpperCase())) {
      return sendError(res, 'Invalid or missing interview status.', 400);
    }

    const whereClause: any = { application: { interviews: { some: { status: status.toUpperCase() } } } };
    const [pipelineStages, total] = await Promise.all([
      prisma.pipelineStage.findMany({
        where: whereClause, skip, take: limit, orderBy: { pipeline_date: 'desc' },
        include: pipelineInclude,
      }),
      prisma.pipelineStage.count({ where: whereClause }),
    ]);

    return sendSuccess(res, {
      data: pipelineStages.map(reshapePipelineStage),
      paging: { total, page, limit, totalPages: Math.ceil(total / limit) },
      filter: { interview_status: status.toUpperCase() },
    });
  } catch (err: any) {
    console.error('Error fetching pipeline by interview status:', err);
    return sendError(res, 'Failed to fetch pipeline stages', 500);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// SEARCH PIPELINED APPLICANTS
// ─────────────────────────────────────────────────────────────────────────────
const searchPipelinedApplicants = async (req: Request, res: Response) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 10));
    const skip  = (page - 1) * limit;
    const query = req.query.query as string;

    if (!query?.trim()) return sendError(res, 'Search query is required', 400);
    const term = query.trim();

    const whereClause = {
      application: {
        OR: [
          { job: { organization: { name: { contains: term, mode: 'insensitive' as const } } } },
          { job: { job_title: { contains: term, mode: 'insensitive' as const } } },
          { applicant: { full_name: { contains: term, mode: 'insensitive' as const } } },
          { applicant: { contact: { email: { contains: term, mode: 'insensitive' as const } } } },
        ],
      },
    };

    const [pipelineStages, total] = await Promise.all([
      prisma.pipelineStage.findMany({
        where: whereClause, skip, take: limit, orderBy: { pipeline_date: 'desc' },
        include: pipelineInclude,
      }),
      prisma.pipelineStage.count({ where: whereClause }),
    ]);

    return sendSuccess(res, {
      data: pipelineStages.map(reshapePipelineStage),
      paging: { total, page, limit, totalPages: Math.ceil(total / limit) },
      search: { query: term },
    });
  } catch (err: any) {
    console.error('Error searching pipelined applicants:', err);
    return sendError(res, 'Failed to search applicants', 500);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// EXPORT
// ─────────────────────────────────────────────────────────────────────────────
export const pipelineController = {
  getAll:   getAllPipelineStages,
  create:   createPipeline,
  getById:  baseCrudMethods.getById,
  update:   baseCrudMethods.update,
  delete:   baseCrudMethods.delete,
  createInterviewForPipeline,
  getInterviewByApplication,
  updateInterviewDate,
  autoUpdateCompletedInterviews,
  rejectInterview,
  acceptInterview,
  onboardCandidate,
  getPipelineByJob,
  getPipelineStats,
  getPipelineOverview,
  getPipelineByInterviewStatus,
  searchPipelinedApplicants,
};