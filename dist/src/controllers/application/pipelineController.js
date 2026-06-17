"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.pipelineController = exports.uploadOnboardingDocs = void 0;
const prisma_config_1 = __importDefault(require("../../prisma.config"));
const crudFactory_1 = require("../../factories/crudFactory");
const schemas_1 = require("../../validators/schemas");
const response_1 = require("../../utils/response");
const emailService_1 = require("../../services/emailService");
const activityService_1 = require("../../services/activityService");
const applicantCommunicationController_1 = require("../applicant/applicantCommunicationController");
const crypto_1 = __importDefault(require("crypto"));
const storage_blob_1 = require("@azure/storage-blob");
const multer_1 = __importDefault(require("multer"));
const stageAutomationController_1 = require("../automation/stageAutomationController");
// ─────────────────────────────────────────────────────────────────────────────
// TIMEZONE CONFIGURATION
// ─────────────────────────────────────────────────────────────────────────────
const TIMEZONE_OFFSET_HOURS = -5; // informational only
const ALL_VALID_STAGE_FILTER_VALUES = new Set([
    'PIPELINED',
    'INTERVIEWED',
    'ONBOARDED',
    'ACTIVE',
    'CONTACTED',
    'FOLLOWING_UP',
    'PACKET_1_COMPLETE',
    'QUALIFIED',
    'READY_TO_BE_SCREENED',
    'SCHEDULED_PHONE_SCREEN',
    'UNDER_REVIEW',
    'QUALIFIED_HOSPITALITY',
    'ORIENTATION_SCHEDULED',
    'ORIENTATION_COMPLETE',
    'LACK_OF_RESPONSE',
    'NO_SHOW_FOR_PI',
    'NOT_A_FIT',
    'PAY_SALARY',
    'DECLINED_FROM_PIPELINE',
]);
// Base CRUD methods
const baseCrudMethods = (0, crudFactory_1.createCrudController)({
    model: prisma_config_1.default.pipelineStage,
    modelName: 'PipelineStage',
    idField: 'pipeline_stage_id',
    createSchema: schemas_1.createPipelineStageSchema,
    updateSchema: schemas_1.updatePipelineStageSchema,
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
const getInterviewRoundConfig = (job) => {
    let totalRounds;
    if (job?.interview_rounds !== undefined && job?.interview_rounds !== null) {
        totalRounds = Math.max(0, Number(job.interview_rounds));
    }
    else {
        // Legacy boolean fallback
        const r1 = !!job?.interview_Round1;
        const r2 = !!job?.interview_Round2;
        if (!r1 && !r2)
            totalRounds = 0;
        else if (r1 && !r2)
            totalRounds = 1;
        else
            totalRounds = 2;
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
const getNextRoundToSchedule = (interviews, totalRounds) => {
    if (totalRounds === 0)
        return null;
    for (let r = 1; r <= totalRounds; r++) {
        const iv = interviews.find((i) => (i.round ?? 1) === r);
        if (!iv) {
            // This round hasn't been scheduled yet.
            // Check that the previous round was accepted (or r === 1).
            if (r === 1)
                return 1;
            const prev = interviews.find((i) => (i.round ?? 1) === r - 1);
            if (prev?.status === 'ACCEPTED')
                return r;
            return null; // previous round not yet accepted
        }
        if (iv.status === 'REJECTED')
            return null; // pipeline ended
        if (iv.status === 'PENDING' || iv.status === 'COMPLETED_RESULT_PENDING')
            return null; // in progress
        // ACCEPTED → continue to next round
    }
    return null; // all rounds scheduled
};
// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Can the candidate be onboarded?
// ─────────────────────────────────────────────────────────────────────────────
const canOnboard = (interviews, totalRounds) => {
    if (totalRounds === 0)
        return true;
    for (let r = 1; r <= totalRounds; r++) {
        const iv = interviews.find((i) => (i.round ?? 1) === r);
        if (!iv || iv.status !== 'ACCEPTED')
            return false;
    }
    return true;
};
const shouldWithholdJobEmails = (job) => {
    return job?.withhold_emails === true;
};
// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Three-layer email suppression check
//   1. Legacy job-level withhold_emails (hard block — always respected)
//   2. Global EmailAutomationRule toggle (admin can disable a trigger globally)
//   3. Applicant-level EmailPreference opt-out (per-candidate per-event)
// Returns true  → send the email
// Returns false → suppress the email
// ─────────────────────────────────────────────────────────────────────────────
const shouldSendEmail = async (triggerEvent, applicantId, job) => {
    // Layer 1: legacy hard block
    if (job?.withhold_emails === true)
        return false;
    // Layer 2: global automation rule
    const rule = await prisma_config_1.default.emailAutomationRule.findFirst({
        where: { trigger_event: triggerEvent },
    });
    if (rule && !rule.is_enabled)
        return false;
    // Layer 3: applicant-level preference
    const pref = await prisma_config_1.default.applicantEmailPreference.findFirst({
        where: {
            applicant_id: applicantId,
            trigger_event: triggerEvent,
        },
    });
    if (pref?.is_suppressed)
        return false;
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
                orderBy: { round: 'asc' },
            },
        },
    },
    credit_user: { select: { user_id: true, name: true, email: true } },
    representative_user: { select: { user_id: true, name: true, email: true } },
};
// ─────────────────────────────────────────────────────────────────────────────
// RESHAPE: Strip interview_Round1/Round2/interview_rounds into job_requirements
// ─────────────────────────────────────────────────────────────────────────────
const reshapePipelineStage = (stage) => {
    const { application, ...stageRest } = stage;
    const { job, ...applicationRest } = application;
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
const getAllPipelineStages = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
        const skip = (page - 1) * limit;
        const stage = req.query.stage;
        const whereClause = {};
        if (stage && ALL_VALID_STAGE_FILTER_VALUES.has(stage.toUpperCase())) {
            whereClause.stage_name = stage.toUpperCase();
        }
        const [pipelineStages, total] = await Promise.all([
            prisma_config_1.default.pipelineStage.findMany({
                where: whereClause, skip, take: limit,
                orderBy: { pipeline_date: 'desc' },
                include: pipelineInclude,
            }),
            prisma_config_1.default.pipelineStage.count({ where: whereClause }),
        ]);
        return (0, response_1.sendSuccess)(res, {
            data: pipelineStages.map(reshapePipelineStage),
            paging: { total, page, limit, totalPages: Math.ceil(total / limit) },
        });
    }
    catch (err) {
        console.error('Error fetching pipeline stages:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch pipeline stages', 500);
    }
};
// ─────────────────────────────────────────────────────────────────────────────
// CREATE PIPELINE
// POST /api/pipeline
// ─────────────────────────────────────────────────────────────────────────────
const createPipeline = async (req, res) => {
    try {
        const validation = schemas_1.createPipelineStageSchema.safeParse(req.body);
        if (!validation.success) {
            return (0, response_1.sendError)(res, 'Validation failed', 400, validation.error.issues.map((e) => ({ field: e.path.join('.'), message: e.message })));
        }
        const { application_id, credit_organization_user_id, representative_organization_user_id } = req.body;
        const application = await prisma_config_1.default.application.findUnique({
            where: { application_id },
            include: { applicant: true, job: true },
        });
        if (!application)
            return (0, response_1.sendError)(res, 'Application not found', 404);
        const existing = await prisma_config_1.default.pipelineStage.findFirst({ where: { application_id } });
        if (existing) {
            return (0, response_1.sendError)(res, 'Pipeline already exists for this application', 409, [{
                    field: 'duplicate',
                    message: `Pipeline already exists with ID: ${existing.pipeline_stage_id}`,
                }]);
        }
        const pipelineStageId = await prisma_config_1.default.$transaction(async (tx) => {
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
            // Only advance applicant status to SHORTLISTED if they haven't already progressed
            // further (e.g. PLACED from a prior onboarding). This prevents regressing a
            // currently-placed applicant who is being considered for a second position.
            if (application.applicant.status === 'APPLIED') {
                await tx.applicant.update({
                    where: { applicant_id: application.applicant_id },
                    data: { status: 'SHORTLISTED' },
                });
            }
            return ps.pipeline_stage_id;
        });
        const result = await prisma_config_1.default.pipelineStage.findUnique({
            where: { pipeline_stage_id: pipelineStageId },
            include: {
                application: {
                    include: {
                        applicant: { select: { applicant_id: true, full_name: true, status: true } },
                        job: { select: { job_id: true, job_title: true, organization: { select: { name: true } } } },
                    },
                },
                credit_user: { select: { user_id: true, name: true, email: true } },
                representative_user: { select: { user_id: true, name: true, email: true } },
            },
        });
        return (0, response_1.sendSuccess)(res, result, 201);
    }
    catch (err) {
        console.error('Error creating pipeline:', err);
        if (err.code === 'P2002')
            return (0, response_1.sendError)(res, 'Pipeline already exists for this application', 409);
        if (err.code === 'P2003')
            return (0, response_1.sendError)(res, 'Related application or job not found', 404);
        return (0, response_1.sendError)(res, 'Failed to create pipeline', 500);
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
const createInterviewForPipeline = async (req, res) => {
    try {
        const { pipelineStageId } = req.params;
        const { interview_date, round: requestedRound, interview_type } = req.body;
        if (!interview_date)
            return (0, response_1.sendError)(res, 'interview_date is required', 400);
        const interviewDateUTC = new Date(interview_date);
        if (isNaN(interviewDateUTC.getTime()))
            return (0, response_1.sendError)(res, 'Invalid interview_date format', 400);
        const interviewType = interview_type === 'OFFLINE' ? 'OFFLINE' : 'ONLINE';
        const pipelineStage = await prisma_config_1.default.pipelineStage.findUnique({
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
        if (!pipelineStage)
            return (0, response_1.sendError)(res, 'Pipeline stage not found', 404);
        const job = pipelineStage.application.job;
        const { totalRounds, noInterviewRequired } = getInterviewRoundConfig(job);
        const existingInterviews = pipelineStage.application.interviews;
        if (noInterviewRequired) {
            return (0, response_1.sendError)(res, 'This job requires no interview rounds. Use the onboard endpoint directly.', 400);
        }
        const roundToSchedule = getNextRoundToSchedule(existingInterviews, totalRounds);
        if (roundToSchedule === null) {
            // Figure out why
            const hasRejected = existingInterviews.some((i) => i.status === 'REJECTED');
            if (hasRejected)
                return (0, response_1.sendError)(res, 'Cannot schedule: a previous interview round was rejected.', 400);
            const allScheduled = existingInterviews.length >= totalRounds;
            if (allScheduled)
                return (0, response_1.sendError)(res, `All ${totalRounds} interview round(s) have already been scheduled.`, 409);
            return (0, response_1.sendError)(res, 'Cannot schedule interview at this stage. Check previous round status.', 400);
        }
        // Validate requested round matches expected round (if frontend sends it)
        if (requestedRound && Number(requestedRound) !== roundToSchedule) {
            return (0, response_1.sendError)(res, `Expected round ${roundToSchedule} but received round ${requestedRound}`, 400);
        }
        const applicantEmail = pipelineStage.application.applicant.contact?.email;
        if (!applicantEmail) {
            return (0, response_1.sendError)(res, 'Applicant email not found. Cannot send interview invitation.', 400);
        }
        const interviewId = await prisma_config_1.default.$transaction(async (tx) => {
            const iv = await tx.interview.create({
                data: {
                    application_id: pipelineStage.application_id,
                    interview_date: interviewDateUTC,
                    status: 'PENDING',
                    round: roundToSchedule,
                    interview_type: interviewType,
                },
                select: { interview_id: true },
            });
            if (roundToSchedule === 1 && pipelineStage.application.applicant.status !== 'PLACED') {
                // Only advance to INTERVIEWING if not already PLACED in another active assignment.
                // A placed applicant re-entering the pipeline for a second job keeps their PLACED status.
                await tx.applicant.update({
                    where: { applicant_id: pipelineStage.application.applicant_id },
                    data: { status: 'INTERVIEWING' },
                });
            }
            return iv.interview_id;
        });
        const result = await prisma_config_1.default.interview.findUnique({
            where: { interview_id: interviewId },
            include: {
                application: {
                    include: {
                        job: {
                            select: {
                                job_id: true, job_title: true, location: true, withhold_emails: true,
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
        const canSendInvite = await shouldSendEmail('INTERVIEW_SCHEDULED', result.application.applicant.applicant_id, result.application.job);
        if (canSendInvite) {
            (0, emailService_1.sendInterviewInvitationEmail)({
                applicantEmail: result.application.applicant.contact.email,
                applicantName: result.application.applicant.full_name,
                jobTitle: result.application.job.job_title,
                organizationName: result.application.job.organization.name,
                organizationWebsite: result.application.job.organization.website || undefined,
                interviewDate: result.interview_date,
                location: result.application.job.location,
                contactEmail: result.application.job.organization.contacts[0]?.email || undefined,
                contactPhone: result.application.job.organization.contacts[0]?.phone || undefined,
                round: roundToSchedule,
                totalRounds,
                interviewType,
            }).then((r) => {
                if (r.success)
                    console.log(`✅ Round ${roundToSchedule} invitation email sent`, { interviewId: result.interview_id });
                else
                    console.error('❌ Failed to send invitation email', { error: r.error });
                (0, applicantCommunicationController_1.logApplicantCommunication)({
                    applicant_id: result.application.applicant.applicant_id,
                    application_id: result.application_id,
                    communication_type: 'EMAIL',
                    direction: 'OUTBOUND',
                    trigger: 'AUTOMATIC',
                    status: r.success ? 'SENT' : 'FAILED',
                    subject: `Interview Invitation – Round ${roundToSchedule} - ${result.application.job.job_title}`,
                    to_address: result.application.applicant.contact.email,
                    from_address: process.env.SMTP_USER || 'noreply@company.com',
                    email_message_id: r.messageId,
                    metadata: {
                        interview_id: result.interview_id,
                        round: roundToSchedule,
                        total_rounds: totalRounds,
                        interview_type: interviewType,
                    },
                });
            }).catch((e) => console.error('❌ Email error', e.message));
        }
        else {
            console.log('ℹ️ Skipping interview invitation email (suppressed by automation rule or applicant preference)', {
                interviewId: result.interview_id,
                jobId: result.application.job.job_id,
                triggerEvent: 'INTERVIEW_SCHEDULED',
            });
        }
        const userId = req.user?.user_id;
        if (userId) {
            await (0, activityService_1.updateUserActivity)(userId, {
                action_type: 'SCHEDULE', entity_type: 'INTERVIEW', entity_id: result.interview_id,
                entity_name: `Round ${roundToSchedule} Interview for ${result.application.applicant.full_name} - ${result.application.job.job_title}`,
                timestamp: new Date().toISOString(),
            });
        }
        return (0, response_1.sendSuccess)(res, result, 201);
    }
    catch (err) {
        console.error('Error creating interview:', err);
        if (err.code === 'P2002')
            return (0, response_1.sendError)(res, 'Interview already exists for this round', 409);
        return (0, response_1.sendError)(res, 'Failed to create interview', 500);
    }
};
// ─────────────────────────────────────────────────────────────────────────────
// UPDATE INTERVIEW DATE
// PATCH /api/pipeline/interview/:interviewId/update-date
// ─────────────────────────────────────────────────────────────────────────────
const updateInterviewDate = async (req, res) => {
    try {
        const { interviewId } = req.params;
        const { interview_date } = req.body;
        if (!interview_date)
            return (0, response_1.sendError)(res, 'interview_date is required', 400);
        const selectedDateUTC = new Date(interview_date);
        if (isNaN(selectedDateUTC.getTime()))
            return (0, response_1.sendError)(res, 'Invalid interview_date format', 400);
        if (selectedDateUTC.getTime() < Date.now())
            return (0, response_1.sendError)(res, 'Interview date must be in the future', 400);
        const interview = await prisma_config_1.default.interview.findUnique({
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
        if (!interview)
            return (0, response_1.sendError)(res, 'Interview not found', 404);
        if (interview.status !== 'PENDING') {
            return (0, response_1.sendError)(res, `Cannot update interview date. Status is ${interview.status}. Only PENDING interviews can be rescheduled.`, 400);
        }
        const oldDate = interview.interview_date;
        const updated = await prisma_config_1.default.interview.update({
            where: { interview_id: interviewId },
            data: { interview_date: selectedDateUTC },
            include: {
                application: {
                    include: {
                        job: { select: { job_id: true, job_title: true, location: true, withhold_emails: true, organization: { select: { name: true } } } },
                        applicant: { select: { applicant_id: true, full_name: true, status: true, contact: { select: { email: true } } } },
                    },
                },
            },
        });
        const aEmail = updated.application.applicant.contact?.email;
        const canSendReschedule = aEmail
            ? await shouldSendEmail('INTERVIEW_RESCHEDULED', updated.application.applicant_id, updated.application.job)
            : false;
        if (canSendReschedule) {
            (0, emailService_1.sendInterviewRescheduleEmail)({
                applicantEmail: aEmail,
                applicantName: updated.application.applicant.full_name,
                jobTitle: updated.application.job.job_title,
                organizationName: updated.application.job.organization.name,
                oldDate,
                newDate: updated.interview_date,
                location: updated.application.job.location,
            }).then((r) => {
                if (!r.success)
                    console.error('❌ Reschedule email failed:', r.error);
                (0, applicantCommunicationController_1.logApplicantCommunication)({
                    applicant_id: updated.application.applicant_id,
                    application_id: updated.application_id,
                    communication_type: 'EMAIL',
                    direction: 'OUTBOUND',
                    trigger: 'AUTOMATIC',
                    status: r.success ? 'SENT' : 'FAILED',
                    subject: `Interview Rescheduled - ${updated.application.job.job_title}`,
                    to_address: aEmail,
                    from_address: process.env.SMTP_USER || 'noreply@company.com',
                    email_message_id: r.messageId,
                    metadata: { interview_id: interviewId },
                });
            })
                .catch((e) => console.error('❌ Reschedule email error:', e.message));
        }
        else if (aEmail) {
            console.log('ℹ️ Skipping reschedule email (suppressed by automation rule or applicant preference)', {
                interviewId,
                jobId: updated.application.job.job_id,
                triggerEvent: 'INTERVIEW_RESCHEDULED',
            });
        }
        const userId = req.user?.user_id;
        if (userId) {
            await (0, activityService_1.updateUserActivity)(userId, {
                action_type: 'UPDATE', entity_type: 'INTERVIEW', entity_id: interviewId,
                entity_name: `Rescheduled interview for ${interview.application.applicant.full_name} - ${interview.application.job.job_title}`,
                timestamp: new Date().toISOString(),
            });
        }
        return (0, response_1.sendSuccess)(res, updated);
    }
    catch (err) {
        console.error('Error updating interview date:', err);
        return (0, response_1.sendError)(res, 'Failed to update interview date', 500);
    }
};
// ─────────────────────────────────────────────────────────────────────────────
// GET INTERVIEW BY APPLICATION
// GET /api/pipeline/interview/application/:applicationId
// ─────────────────────────────────────────────────────────────────────────────
const getInterviewByApplication = async (req, res) => {
    try {
        const { applicationId } = req.params;
        const interviews = await prisma_config_1.default.interview.findMany({
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
                                credit_user: { select: { user_id: true, name: true, email: true } },
                                representative_user: { select: { user_id: true, name: true, email: true } },
                            },
                        },
                    },
                },
            },
        });
        if (!interviews.length)
            return (0, response_1.sendError)(res, 'Interview not found for this application', 404);
        const activeInterview = interviews.find((i) => i.status === 'PENDING' || i.status === 'COMPLETED_RESULT_PENDING') || interviews[interviews.length - 1];
        const app = activeInterview.application;
        const job = app.job;
        const { totalRounds, noInterviewRequired } = getInterviewRoundConfig(job);
        // Build timeline events: one per required round + standard stages
        const roundEvents = [];
        for (let r = 1; r <= totalRounds; r++) {
            const iv = interviews.find((i) => (i.round ?? 1) === r);
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
            applicant_status: app.applicant.status,
            interview_status: activeInterview.status,
            pipeline_stage: app.pipeline_stages[0]?.stage_name || null,
            round_config: { totalRounds, noInterviewRequired },
            events: [
                { stage: 'APPLIED', date: app.applied_at, description: 'Application submitted', status: 'completed' },
                { stage: 'SCREENED', date: app.pipeline_stages[0]?.pipeline_date || null, description: 'Application screened and shortlisted', status: app.status === 'APPLIED' ? 'pending' : 'completed' },
                ...roundEvents,
                { stage: 'OFFERED', date: null, description: 'Offer extended', status: app.status === 'OFFERED' ? 'current' : app.status === 'HIRED' ? 'completed' : 'pending' },
                { stage: 'HIRED', date: null, description: 'Candidate hired and onboarded', status: app.status === 'HIRED' ? 'completed' : 'pending' },
            ],
        };
        return (0, response_1.sendSuccess)(res, { interview: activeInterview, all_interviews: interviews, status_timeline: statusTimeline });
    }
    catch (err) {
        console.error('Error fetching interview by application:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch interview details', 500);
    }
};
// ─────────────────────────────────────────────────────────────────────────────
// AUTO-UPDATE COMPLETED INTERVIEWS
// POST /api/pipeline/auto-update-completed
// ─────────────────────────────────────────────────────────────────────────────
const autoUpdateCompletedInterviews = async (req, res) => {
    try {
        const nowUTC = new Date();
        const pending = await prisma_config_1.default.interview.findMany({
            where: { status: 'PENDING', interview_date: { lt: nowUTC } },
            include: { application: { select: { application_id: true, job_id: true } } },
        });
        if (!pending.length)
            return (0, response_1.sendSuccess)(res, { message: 'No interviews to update', updated_count: 0 });
        const count = await prisma_config_1.default.$transaction(async (tx) => {
            const r = await tx.interview.updateMany({
                where: { status: 'PENDING', interview_date: { lt: nowUTC } },
                data: { status: 'COMPLETED_RESULT_PENDING' },
            });
            await tx.pipelineStage.updateMany({
                where: { application: { interviews: { some: { status: 'COMPLETED_RESULT_PENDING', interview_date: { lt: nowUTC } } } } },
                data: { stage_name: 'INTERVIEWED' },
            });
            return r.count;
        });
        return (0, response_1.sendSuccess)(res, { message: `Successfully updated ${count} interviews`, updated_count: count });
    }
    catch (err) {
        console.error('Error auto-updating interviews:', err);
        return (0, response_1.sendError)(res, 'Failed to auto-update interviews', 500);
    }
};
// ─────────────────────────────────────────────────────────────────────────────
// REJECT INTERVIEW
// PATCH /api/pipeline/interview/:interviewId/reject
// ─────────────────────────────────────────────────────────────────────────────
const rejectInterview = async (req, res) => {
    try {
        const { interviewId } = req.params;
        const interview = await prisma_config_1.default.interview.findUnique({
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
        if (!interview)
            return (0, response_1.sendError)(res, 'Interview not found', 404);
        if (interview.status !== 'COMPLETED_RESULT_PENDING') {
            return (0, response_1.sendError)(res, `Cannot reject interview with status ${interview.status}. Must be COMPLETED_RESULT_PENDING.`, 400);
        }
        await prisma_config_1.default.interview.update({ where: { interview_id: interviewId }, data: { status: 'REJECTED' } });
        const result = await prisma_config_1.default.interview.findUnique({
            where: { interview_id: interviewId },
            include: {
                application: {
                    include: {
                        job: { select: { job_id: true, job_title: true, withhold_emails: true, organization: { select: { name: true } } } },
                        applicant: { select: { applicant_id: true, full_name: true, status: true, contact: { select: { email: true } } } },
                    },
                },
            },
        });
        const aEmail = result.application.applicant.contact?.email;
        const canSendRejection = aEmail
            ? await shouldSendEmail('INTERVIEW_REJECTED', result.application.applicant.applicant_id, result.application.job)
            : false;
        if (canSendRejection) {
            (0, emailService_1.sendInterviewRejectionEmail)({
                applicantEmail: aEmail,
                applicantName: result.application.applicant.full_name,
                jobTitle: result.application.job.job_title,
                organizationName: result.application.job.organization.name,
            }).then((r) => {
                if (!r.success)
                    console.error('❌ Rejection email failed:', r.error);
                (0, applicantCommunicationController_1.logApplicantCommunication)({
                    applicant_id: result.application.applicant.applicant_id,
                    application_id: result.application_id,
                    communication_type: 'EMAIL',
                    direction: 'OUTBOUND',
                    trigger: 'AUTOMATIC',
                    status: r.success ? 'SENT' : 'FAILED',
                    subject: `Application Status - ${result.application.job.job_title}`,
                    to_address: aEmail,
                    from_address: process.env.SMTP_USER || 'noreply@company.com',
                    email_message_id: r.messageId,
                    metadata: { interview_id: interviewId, reason: 'interview_rejected' },
                });
            })
                .catch((e) => console.error('❌ Rejection email error:', e.message));
        }
        else if (aEmail) {
            console.log('ℹ️ Skipping rejection email (suppressed by automation rule or applicant preference)', {
                interviewId,
                jobId: result.application.job.job_id,
                triggerEvent: 'INTERVIEW_REJECTED',
            });
        }
        return (0, response_1.sendSuccess)(res, result);
    }
    catch (err) {
        console.error('Error rejecting interview:', err);
        return (0, response_1.sendError)(res, 'Failed to reject interview', 500);
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
const acceptInterview = async (req, res) => {
    try {
        const { interviewId } = req.params;
        const interview = await prisma_config_1.default.interview.findUnique({
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
        if (!interview)
            return (0, response_1.sendError)(res, 'Interview not found', 404);
        if (interview.status !== 'COMPLETED_RESULT_PENDING') {
            return (0, response_1.sendError)(res, `Cannot accept interview with status ${interview.status}. Must be COMPLETED_RESULT_PENDING.`, 400);
        }
        const job = interview.application.job;
        const { totalRounds } = getInterviewRoundConfig(job);
        const currentRound = interview.round ?? 1;
        const isLastRound = currentRound >= totalRounds;
        await prisma_config_1.default.$transaction(async (tx) => {
            await tx.interview.update({ where: { interview_id: interviewId }, data: { status: 'ACCEPTED' } });
            if (isLastRound) {
                await tx.application.update({
                    where: { application_id: interview.application_id },
                    data: { status: 'OFFERED' },
                });
            }
        });
        const result = await prisma_config_1.default.interview.findUnique({
            where: { interview_id: interviewId },
            include: {
                application: {
                    include: {
                        job: { select: { job_id: true, job_title: true, withhold_emails: true, organization: { select: { name: true } } } },
                        applicant: { select: { applicant_id: true, full_name: true, status: true, contact: { select: { email: true } } } },
                    },
                },
            },
        });
        const shouldSendOfferEmail = isLastRound && await shouldSendEmail('OFFER_LETTER_SENT', result.application.applicant.applicant_id, result.application.job);
        if (shouldSendOfferEmail) {
            const aEmail = result.application.applicant.contact?.email;
            if (aEmail) {
                (0, emailService_1.sendOfferLetterEmail)({
                    applicantEmail: aEmail,
                    applicantName: result.application.applicant.full_name,
                    jobTitle: result.application.job.job_title,
                    organizationName: result.application.job.organization.name,
                }).then((r) => {
                    if (!r.success)
                        console.error('❌ Offer email failed:', r.error);
                    (0, applicantCommunicationController_1.logApplicantCommunication)({
                        applicant_id: result.application.applicant.applicant_id,
                        application_id: result.application_id,
                        communication_type: 'EMAIL',
                        direction: 'OUTBOUND',
                        trigger: 'AUTOMATIC',
                        status: r.success ? 'SENT' : 'FAILED',
                        subject: `Job Offer - ${result.application.job.job_title}`,
                        to_address: aEmail,
                        from_address: process.env.SMTP_USER || 'noreply@company.com',
                        email_message_id: r.messageId,
                        metadata: { interview_id: interviewId, round: currentRound },
                    });
                }).catch((e) => console.error('❌ Offer email error:', e.message));
            }
        }
        else if (isLastRound) {
            console.log('ℹ️ Skipping offer letter email (suppressed by automation rule or applicant preference)', {
                interviewId,
                jobId: result.application.job.job_id,
                triggerEvent: 'OFFER_LETTER_SENT',
            });
        }
        const message = isLastRound
            ? (shouldSendOfferEmail
                ? `Round ${currentRound} accepted. Offer letter sent to candidate.`
                : `Round ${currentRound} accepted. Offer letter email suppressed for this job.`)
            : `Round ${currentRound} accepted. Please schedule Round ${currentRound + 1} next.`;
        return (0, response_1.sendSuccess)(res, {
            ...result,
            _meta: { message, isLastRound, nextRound: isLastRound ? null : currentRound + 1 },
        });
    }
    catch (err) {
        console.error('Error accepting interview:', err);
        return (0, response_1.sendError)(res, 'Failed to accept interview', 500);
    }
};
// ─────────────────────────────────────────────────────────────────────────────
// GET PIPELINE BY JOB
// ─────────────────────────────────────────────────────────────────────────────
const getPipelineByJob = async (req, res) => {
    try {
        const { jobId } = req.params;
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
        const skip = (page - 1) * limit;
        const stage = req.query.stage;
        const whereClause = { application: { job_id: jobId } };
        if (stage && ALL_VALID_STAGE_FILTER_VALUES.has(stage.toUpperCase())) {
            whereClause.stage_name = stage.toUpperCase();
        }
        const [pipelineStages, total] = await Promise.all([
            prisma_config_1.default.pipelineStage.findMany({
                where: whereClause, skip, take: limit, orderBy: { pipeline_date: 'desc' },
                include: pipelineInclude,
            }),
            prisma_config_1.default.pipelineStage.count({ where: whereClause }),
        ]);
        return (0, response_1.sendSuccess)(res, {
            data: pipelineStages.map(reshapePipelineStage),
            paging: { total, page, limit, totalPages: Math.ceil(total / limit) },
        });
    }
    catch (err) {
        console.error('Error fetching pipeline by job:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch pipeline', 500);
    }
};
// ─────────────────────────────────────────────────────────────────────────────
// GET PIPELINE STATS
// ─────────────────────────────────────────────────────────────────────────────
const getPipelineStats = async (req, res) => {
    try {
        const [grouped, total] = await Promise.all([
            prisma_config_1.default.pipelineStage.groupBy({ by: ['stage_name'], _count: { pipeline_stage_id: true } }),
            prisma_config_1.default.pipelineStage.count(),
        ]);
        const by_stage = ['PIPELINED', 'INTERVIEWED', 'ONBOARDED'].map((s) => ({
            stage: s, count: grouped.find((g) => g.stage_name === s)?._count.pipeline_stage_id ?? 0,
        }));
        return (0, response_1.sendSuccess)(res, { total_candidates: total, by_stage });
    }
    catch (err) {
        console.error('Error fetching pipeline stats:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch pipeline statistics', 500);
    }
};
// ─────────────────────────────────────────────────────────────────────────────
// GET PIPELINE OVERVIEW
// ─────────────────────────────────────────────────────────────────────────────
const getPipelineOverview = async (req, res) => {
    try {
        const { pipelineStageId } = req.params;
        const ps = await prisma_config_1.default.pipelineStage.findUnique({
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
                                documents: { orderBy: { created_at: 'desc' } },
                            },
                        },
                        interviews: { orderBy: { round: 'asc' } },
                    },
                },
                credit_user: { select: { user_id: true, name: true, email: true } },
                representative_user: { select: { user_id: true, name: true, email: true } },
            },
        });
        if (!ps)
            return (0, response_1.sendError)(res, 'Pipeline stage not found', 404);
        return (0, response_1.sendSuccess)(res, ps);
    }
    catch (err) {
        console.error('Error fetching pipeline overview:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch pipeline overview', 500);
    }
};
// ─────────────────────────────────────────────────────────────────────────────
// GET PIPELINE BY INTERVIEW STATUS
// ─────────────────────────────────────────────────────────────────────────────
const getPipelineByInterviewStatus = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
        const skip = (page - 1) * limit;
        const status = req.query.status;
        if (!status || !['PENDING', 'COMPLETED_RESULT_PENDING', 'REJECTED', 'ACCEPTED'].includes(status.toUpperCase())) {
            return (0, response_1.sendError)(res, 'Invalid or missing interview status.', 400);
        }
        const whereClause = { application: { interviews: { some: { status: status.toUpperCase() } } } };
        const [pipelineStages, total] = await Promise.all([
            prisma_config_1.default.pipelineStage.findMany({
                where: whereClause, skip, take: limit, orderBy: { pipeline_date: 'desc' },
                include: pipelineInclude,
            }),
            prisma_config_1.default.pipelineStage.count({ where: whereClause }),
        ]);
        return (0, response_1.sendSuccess)(res, {
            data: pipelineStages.map(reshapePipelineStage),
            paging: { total, page, limit, totalPages: Math.ceil(total / limit) },
            filter: { interview_status: status.toUpperCase() },
        });
    }
    catch (err) {
        console.error('Error fetching pipeline by interview status:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch pipeline stages', 500);
    }
};
// ─────────────────────────────────────────────────────────────────────────────
// SEARCH PIPELINED APPLICANTS
// ─────────────────────────────────────────────────────────────────────────────
const searchPipelinedApplicants = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
        const skip = (page - 1) * limit;
        const query = req.query.query;
        if (!query?.trim())
            return (0, response_1.sendError)(res, 'Search query is required', 400);
        const term = query.trim();
        const whereClause = {
            application: {
                OR: [
                    { job: { organization: { name: { contains: term, mode: 'insensitive' } } } },
                    { job: { job_title: { contains: term, mode: 'insensitive' } } },
                    { applicant: { full_name: { contains: term, mode: 'insensitive' } } },
                    { applicant: { contact: { email: { contains: term, mode: 'insensitive' } } } },
                ],
            },
        };
        const [pipelineStages, total] = await Promise.all([
            prisma_config_1.default.pipelineStage.findMany({
                where: whereClause, skip, take: limit, orderBy: { pipeline_date: 'desc' },
                include: pipelineInclude,
            }),
            prisma_config_1.default.pipelineStage.count({ where: whereClause }),
        ]);
        return (0, response_1.sendSuccess)(res, {
            data: pipelineStages.map(reshapePipelineStage),
            paging: { total, page, limit, totalPages: Math.ceil(total / limit) },
            search: { query: term },
        });
    }
    catch (err) {
        console.error('Error searching pipelined applicants:', err);
        return (0, response_1.sendError)(res, 'Failed to search applicants', 500);
    }
};
// ─── SSN encryption (AES-256-CBC) ────────────────────────────────────────────
// Store ENCRYPTION_KEY (32-byte hex) and ENCRYPTION_IV (16-byte hex) in .env
const SSN_KEY = Buffer.from(process.env.SSN_ENCRYPTION_KEY || '', 'hex'); // 32 bytes
const SSN_IV = Buffer.from(process.env.SSN_ENCRYPTION_IV || '', 'hex'); // 16 bytes
const encryptSSN = (ssn) => {
    if (!ssn)
        return '';
    if (SSN_KEY.length !== 32)
        throw new Error('SSN_ENCRYPTION_KEY must be 32 bytes (64 hex chars)');
    const cipher = crypto_1.default.createCipheriv('aes-256-cbc', SSN_KEY, SSN_IV);
    return cipher.update(ssn, 'utf8', 'hex') + cipher.final('hex');
};
// Only needed if you expose a read endpoint later — kept here for completeness
// const decryptSSN = (enc: string): string => {
//   const d = crypto.createDecipheriv('aes-256-cbc', SSN_KEY, SSN_IV);
//   return d.update(enc, 'hex', 'utf8') + d.final('utf8');
// };
// ─── Azure Blob (onboarding container) ────────────────────────────────────────
const blobClient = storage_blob_1.BlobServiceClient.fromConnectionString(process.env.AZURE_STORAGE_CONNECTION_STRING);
const ONBOARDING_CONTAINER = process.env.AZURE_ONBOARDING_DOCS_CONTAINER || 'onboarding-documents';
// FIX 1: Cache the ContainerClient — createIfNotExists ran on every submission
//         (~300ms Azure roundtrip). Now it runs once at startup and is reused.
let _containerClient = null;
const getOnboardingContainer = async () => {
    if (_containerClient)
        return _containerClient;
    const cc = blobClient.getContainerClient(ONBOARDING_CONTAINER);
    await cc.createIfNotExists({ access: 'blob' });
    _containerClient = cc;
    return cc;
};
const makeBlobName = (applicantId, originalName) => {
    const ts = Date.now();
    const rand = Math.random().toString(36).slice(2, 8);
    const safe = originalName.replace(/[^a-zA-Z0-9.\-]/g, '_');
    return `${applicantId}/${ts}-${rand}-${safe}`;
};
// ─── multer (memory, up to 20 files × 20 MB) ─────────────────────────────────
exports.uploadOnboardingDocs = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 },
}).array('files', 20);
// ══════════════════════════════════════════════════════════════════════════════
const onboardCandidate = async (req, res) => {
    try {
        const { pipelineStageId } = req.params;
        // ── 1. Parse body ──────────────────────────────────────────────────────────
        const { start_date, end_date, employment_type, ssn, filing_status, additional_withholding, exempt_from_federal, exempt_from_state, work_state, resident_state, } = req.body;
        let workersCompCodes = [];
        try {
            workersCompCodes = JSON.parse(req.body.workers_comp_codes || '[]');
        }
        catch {
            return (0, response_1.sendError)(res, 'Invalid workers_comp_codes format — expected JSON array', 400);
        }
        let companyCodes = [];
        try {
            companyCodes = JSON.parse(req.body.company_codes || '[]');
        }
        catch {
            return (0, response_1.sendError)(res, 'Invalid company_codes format — expected JSON array', 400);
        }
        const files = req.files ?? [];
        const documentNames = [req.body.document_names ?? []].flat();
        const documentTypes = [req.body.document_types ?? []].flat();
        const sendToCandidate = [req.body.send_to_candidate ?? []].flat();
        // ── 2. Basic validation ────────────────────────────────────────────────────
        if (!start_date || !employment_type)
            return (0, response_1.sendError)(res, 'start_date and employment_type are required', 400);
        if (!['W2', 'CONTRACTOR_1099'].includes(employment_type))
            return (0, response_1.sendError)(res, 'employment_type must be W2 or CONTRACTOR_1099', 400);
        const startDate = new Date(start_date);
        if (isNaN(startDate.getTime()))
            return (0, response_1.sendError)(res, 'Invalid start_date', 400);
        if (end_date) {
            const endDate = new Date(end_date);
            if (isNaN(endDate.getTime()))
                return (0, response_1.sendError)(res, 'Invalid end_date', 400);
            if (endDate <= startDate)
                return (0, response_1.sendError)(res, 'end_date must be after start_date', 400);
        }
        if (!workersCompCodes.length)
            return (0, response_1.sendError)(res, 'At least one workers\'s comp code is required', 400);
        if (workersCompCodes.some(w => !w.code?.trim()))
            return (0, response_1.sendError)(res, 'All workers\' comp entries must have a code', 400);
        if (workersCompCodes.some(w => typeof w.pct !== 'number' || w.pct <= 0))
            return (0, response_1.sendError)(res, 'All workers\' comp entries must have a valid pct > 0', 400);
        const totalWcPct = workersCompCodes.reduce((s, w) => s + w.pct, 0);
        if (Math.round(totalWcPct) !== 100)
            return (0, response_1.sendError)(res, `Workers' comp pct must total 100% (got ${totalWcPct}%)`, 400);
        if (!ssn || !/^\d{9}$/.test(ssn))
            return (0, response_1.sendError)(res, 'Valid 9-digit SSN is required', 400);
        if (!companyCodes.length)
            return (0, response_1.sendError)(res, 'At least one company code is required', 400);
        const totalAllocation = companyCodes.reduce((s, c) => s + (c.allocation_pct || 0), 0);
        if (Math.round(totalAllocation) !== 100)
            return (0, response_1.sendError)(res, `Company code allocations must total 100% (got ${totalAllocation}%)`, 400);
        if (companyCodes.some(c => !c.code?.trim()))
            return (0, response_1.sendError)(res, 'All company codes must have a non-empty code value', 400);
        if (!work_state)
            return (0, response_1.sendError)(res, 'work_state is required', 400);
        // ── 3. Fetch pipeline stage ────────────────────────────────────────────────
        const pipelineStage = await prisma_config_1.default.pipelineStage.findUnique({
            where: { pipeline_stage_id: pipelineStageId },
            include: {
                application: {
                    include: {
                        applicant: { include: { contact: true } },
                        job: {
                            include: {
                                organization: { select: { name: true, organization_id: true } },
                            },
                        },
                        interviews: { orderBy: { round: 'asc' } },
                    },
                },
                credit_user: { select: { user_id: true, name: true, email: true } },
                representative_user: { select: { user_id: true, name: true, email: true } },
            },
        });
        if (!pipelineStage)
            return (0, response_1.sendError)(res, 'Pipeline stage not found', 404);
        const { application } = pipelineStage;
        const job = application.job;
        const applicant = application.applicant;
        const { totalRounds, noInterviewRequired } = getInterviewRoundConfig(job);
        const interviews = application.interviews;
        // ── 4. Interview gate ──────────────────────────────────────────────────────
        if (!noInterviewRequired && !canOnboard(interviews, totalRounds)) {
            for (let r = 1; r <= totalRounds; r++) {
                const iv = interviews.find((i) => (i.round ?? 1) === r);
                if (!iv)
                    return (0, response_1.sendError)(res, `Cannot onboard: Round ${r} interview not scheduled`, 400);
                if (iv.status !== 'ACCEPTED')
                    return (0, response_1.sendError)(res, `Cannot onboard: Round ${r} must be ACCEPTED (is: ${iv.status})`, 400);
            }
        }
        // ── 5. Duplicate check ─────────────────────────────────────────────────────
        const existing = await prisma_config_1.default.assignment.findUnique({
            where: { application_id: application.application_id },
        });
        if (existing)
            return (0, response_1.sendError)(res, 'Assignment already exists for this application', 400);
        let uploadedDocs = [];
        if (files.length) {
            const container = await getOnboardingContainer();
            uploadedDocs = await Promise.all(files.map(async (f, i) => {
                const blobName = makeBlobName(applicant.applicant_id, f.originalname);
                const blob = container.getBlockBlobClient(blobName);
                await blob.upload(f.buffer, f.buffer.length, {
                    blobHTTPHeaders: { blobContentType: f.mimetype },
                    metadata: {
                        applicantId: applicant.applicant_id,
                        applicationId: application.application_id,
                        documentType: documentTypes[i] || 'OTHER',
                        uploadedVia: 'onboarding',
                    },
                });
                return {
                    document_type: documentTypes[i] || 'OTHER',
                    document_name: documentNames[i] || f.originalname.replace(/\.[^.]+$/, ''),
                    file_url: blob.url,
                    blob_name: blobName,
                    original_name: f.originalname,
                    mime_type: f.mimetype,
                    size: f.size,
                    send_to_candidate: sendToCandidate[i] === 'true',
                };
            }));
        }
        // ── 7. Encrypt SSN ─────────────────────────────────────────────────────────
        const encryptedSSN = encryptSSN(ssn);
        // Build tax payload once — reused in both upsert branches
        const taxInfoPayload = {
            filing_status,
            additional_withholding: parseFloat(additional_withholding || '0'),
            exempt_from_federal: exempt_from_federal === 'true',
            exempt_from_state: exempt_from_state === 'true',
            work_state,
            resident_state: resident_state || work_state,
        };
        // ── 8. DB transaction ─────────────────────────────────────────────────────
        // FIX 3: Parallel writes inside the transaction.
        //
        // Batch A — 3 status updates on independent tables/rows, no FK dependency
        //           between them. Run simultaneously.
        //
        // Batch B — demographic upsert + assignment create + all document inserts
        //           are also mutually independent. Run simultaneously after Batch A.
        //
        await prisma_config_1.default.$transaction(async (tx) => {
            // Batch A: parallel status updates
            await Promise.all([
                tx.pipelineStage.update({
                    where: { pipeline_stage_id: pipelineStageId },
                    data: { stage_name: 'ONBOARDED' },
                }),
                tx.application.update({
                    where: { application_id: application.application_id },
                    data: { status: 'HIRED' },
                }),
                tx.applicant.update({
                    where: { applicant_id: applicant.applicant_id },
                    data: { status: 'PLACED' },
                }),
            ]);
            // Batch B: demographic + assignment + document rows, all in parallel
            await Promise.all([
                tx.applicantDemographic.upsert({
                    where: { applicant_id: applicant.applicant_id },
                    update: { ssn_encrypted: encryptedSSN, tax_info: taxInfoPayload },
                    create: {
                        applicant_id: applicant.applicant_id,
                        ssn_encrypted: encryptedSSN,
                        tax_info: taxInfoPayload,
                    },
                }),
                tx.assignment.create({
                    data: {
                        application_id: application.application_id,
                        start_date: startDate,
                        end_date: end_date ? new Date(end_date) : null,
                        employment_type,
                        workers_comp_code: workersCompCodes[0]?.code || null,
                        workers_comp_codes: workersCompCodes,
                        company_codes: companyCodes,
                    },
                }),
                // Spread all document inserts into the same Promise.all
                ...uploadedDocs.map(doc => tx.applicantDocument.create({
                    data: {
                        applicant_id: applicant.applicant_id,
                        application_id: application.application_id,
                        document_type: doc.document_type,
                        file_url: JSON.stringify({
                            originalFileName: doc.original_name,
                            mimeType: doc.mime_type,
                            blobName: doc.blob_name,
                            size: doc.size,
                            url: doc.file_url,
                            sendToCandidate: doc.send_to_candidate,
                            containerName: ONBOARDING_CONTAINER,
                        }),
                    },
                })),
            ]);
        });
        // ── 9. Fetch full result for response ──────────────────────────────────────
        // FIX 4: Lean select — only fetch what the response and emails actually need.
        //         Removed unnecessary nested includes from the old version.
        const result = await prisma_config_1.default.pipelineStage.findUnique({
            where: { pipeline_stage_id: pipelineStageId },
            include: {
                application: {
                    include: {
                        job: { select: { job_id: true, job_title: true, withhold_emails: true, organization: { select: { name: true } } } },
                        applicant: {
                            select: {
                                full_name: true, status: true,
                                contact: { select: { email: true, phone: true } },
                            },
                        },
                        assignment: {
                            select: {
                                assignment_id: true,
                                start_date: true,
                                end_date: true,
                                employment_type: true,
                                workers_comp_code: true,
                                workers_comp_codes: true,
                                company_codes: true,
                            },
                        },
                    },
                },
                credit_user: { select: { user_id: true, name: true, email: true } },
                representative_user: { select: { user_id: true, name: true, email: true } },
            },
        });
        const orgName = result.application.job.organization.name;
        const jobTitle = result.application.job.job_title;
        const aName = result.application.applicant.full_name;
        const aEmail = result.application.applicant.contact?.email;
        const docSummary = uploadedDocs.map(d => ({
            document_name: d.document_name,
            document_type: d.document_type,
            send_to_candidate: d.send_to_candidate,
        }));
        // FIX 5: Build attachments array once — reused across all 3 emails
        //         instead of rebuilding files.map(...) three separate times.
        const allAttachments = files.map((f, i) => ({
            filename: documentNames[i] || f.originalname,
            content: f.buffer,
            contentType: f.mimetype,
        }));
        // ── 10. Emails ─────────────────────────────────────────────────────────────
        // FIX 5 cont.: All 3 emails fired simultaneously with Promise.all instead of
        //              3 separate staggered .then() chains. True fire-and-forget —
        //              response is sent before any email resolves.
        const emailPromises = [];
        // Three-layer check for each distinct trigger event
        const [canSendWelcome, canSendCreditNotif, canSendRepNotif] = await Promise.all([
            aEmail
                ? shouldSendEmail('ONBOARDING_WELCOME', applicant.applicant_id, result.application.job)
                : Promise.resolve(false),
            result.credit_user?.email
                ? shouldSendEmail('ASSIGNMENT_NOTIFICATION_CREDIT', applicant.applicant_id, result.application.job)
                : Promise.resolve(false),
            result.representative_user?.email
                ? shouldSendEmail('ASSIGNMENT_NOTIFICATION_REP', applicant.applicant_id, result.application.job)
                : Promise.resolve(false),
        ]);
        // Keep legacy flag for the withhold log below
        const shouldWithholdEmails = result.application.job?.withhold_emails === true;
        if (canSendWelcome && aEmail) {
            emailPromises.push((0, emailService_1.sendOnboardingWelcomeEmail)({
                applicantEmail: aEmail,
                applicantName: aName,
                jobTitle,
                organizationName: orgName,
                startDate,
                endDate: end_date ? new Date(end_date) : null,
                employmentType: employment_type,
                workersCompCodes,
                uploadedDocuments: docSummary.filter(d => d.send_to_candidate),
                attachments: allAttachments.filter((_, i) => sendToCandidate[i] === 'true'),
            }));
        }
        // Shared base for both notification emails — avoids duplicating every field
        const notificationBase = {
            applicantName: aName,
            applicantEmail: aEmail || '',
            jobTitle,
            organizationName: orgName,
            startDate,
            endDate: end_date ? new Date(end_date) : null,
            employmentType: employment_type,
            companyCodes,
            workersCompCodes,
            uploadedDocuments: docSummary,
            attachments: allAttachments,
        };
        if (canSendCreditNotif) {
            emailPromises.push((0, emailService_1.sendAssignmentNotificationEmail)({
                ...notificationBase,
                recipientEmail: result.credit_user.email,
                recipientName: result.credit_user.name,
                role: 'Credit User',
            }));
        }
        if (canSendRepNotif) {
            emailPromises.push((0, emailService_1.sendAssignmentNotificationEmail)({
                ...notificationBase,
                recipientEmail: result.representative_user.email,
                recipientName: result.representative_user.name,
                role: 'Representative',
            }));
        }
        Promise.all(emailPromises).then(results => {
            // Log the onboarding email to the applicant communication trail
            if (canSendWelcome && aEmail) {
                const onboardingResult = results[0];
                (0, applicantCommunicationController_1.logApplicantCommunication)({
                    applicant_id: result.application.applicant_id,
                    application_id: result.application_id,
                    communication_type: 'EMAIL',
                    direction: 'OUTBOUND',
                    trigger: 'AUTOMATIC',
                    status: onboardingResult?.success ? 'SENT' : 'FAILED',
                    subject: `Welcome to ${orgName} - Onboarding for ${jobTitle}`,
                    to_address: aEmail,
                    from_address: process.env.SMTP_USER || 'noreply@company.com',
                    email_message_id: onboardingResult?.messageId,
                    metadata: {
                        pipeline_stage_id: pipelineStageId,
                        employment_type,
                        start_date: startDate,
                    },
                });
            }
        }).catch(e => console.error('❌ One or more onboarding emails failed:', e.message));
        if (!canSendWelcome || !canSendCreditNotif || !canSendRepNotif) {
            console.log('ℹ️ One or more onboarding emails suppressed (withhold_emails, automation rule, or applicant preference)', {
                jobId: result.application.job.job_id,
                pipelineStageId,
                suppressed: {
                    welcome: !canSendWelcome,
                    credit_notification: !canSendCreditNotif,
                    rep_notification: !canSendRepNotif,
                },
            });
        }
        // ── 11. Respond ────────────────────────────────────────────────────────────
        return (0, response_1.sendSuccess)(res, {
            ...result,
            company_codes: companyCodes,
            workers_comp_codes: workersCompCodes,
            uploaded_documents: docSummary,
        });
    }
    catch (err) {
        console.error('Error onboarding candidate:', err);
        return (0, response_1.sendError)(res, 'Failed to onboard candidate', 500);
    }
};
// ─────────────────────────────────────────────────────────────────────────────
// UPDATE PIPELINE STAGE MANUALLY
// PATCH /api/pipeline/:pipelineStageId/stage
//
// Allows HR to manually set a pipeline stage to any valid PipelineStageName.
// Restricted stages (INTERVIEWED, ONBOARDED) cannot be set manually —
// those are system-controlled via interview/onboard flows.
//
// Body: { stage_name: PipelineStageName }
// ─────────────────────────────────────────────────────────────────────────────
const MANUALLY_SETTABLE_STAGES = new Set([
    // Active group
    'ACTIVE',
    'CONTACTED',
    'FOLLOWING_UP',
    'PACKET_1_COMPLETE',
    'QUALIFIED',
    'READY_TO_BE_SCREENED',
    'SCHEDULED_PHONE_SCREEN',
    'UNDER_REVIEW',
    'QUALIFIED_HOSPITALITY',
    'ORIENTATION_SCHEDULED',
    'ORIENTATION_COMPLETE',
    // Declined group
    'LACK_OF_RESPONSE',
    'NO_SHOW_FOR_PI',
    'NOT_A_FIT',
    'PAY_SALARY',
    'DECLINED_FROM_PIPELINE',
    // Base stage — allow moving back to pipelined manually if needed
    'PIPELINED',
]);
// Human-readable labels for each stage value — used in activity logs
const STAGE_LABELS = {
    ACTIVE: 'Active',
    CONTACTED: 'Contacted',
    FOLLOWING_UP: 'Following up',
    PACKET_1_COMPLETE: 'Packet 1_Complete',
    QUALIFIED: 'Qualified',
    READY_TO_BE_SCREENED: 'Ready to be Screened',
    SCHEDULED_PHONE_SCREEN: 'Scheduled Phone Screen',
    UNDER_REVIEW: 'Under Review',
    QUALIFIED_HOSPITALITY: 'Qualified: Hospitality',
    ORIENTATION_SCHEDULED: 'Orientation Scheduled',
    ORIENTATION_COMPLETE: 'Orientation Complete',
    LACK_OF_RESPONSE: 'Lack of Response',
    NO_SHOW_FOR_PI: 'No Show for P/I',
    NOT_A_FIT: 'Not a fit',
    PAY_SALARY: 'Pay/Salary',
    DECLINED_FROM_PIPELINE: 'Declined from Pipeline',
    PIPELINED: 'Pipelined',
    INTERVIEWED: 'Interviewed',
    ONBOARDED: 'Onboarded',
};
const updatePipelineStageManually = async (req, res) => {
    try {
        const { pipelineStageId } = req.params;
        const { stage_name } = req.body;
        // ── 1. Validate payload ────────────────────────────────────────────────
        if (!stage_name || typeof stage_name !== 'string') {
            return (0, response_1.sendError)(res, 'stage_name is required', 400);
        }
        const normalised = stage_name.trim().toUpperCase();
        if (!MANUALLY_SETTABLE_STAGES.has(normalised)) {
            return (0, response_1.sendError)(res, `Invalid or non-editable stage: "${stage_name}". ` +
                `Stages INTERVIEWED and ONBOARDED are system-controlled.`, 400);
        }
        // ── 2. Fetch current stage ─────────────────────────────────────────────
        const existing = await prisma_config_1.default.pipelineStage.findUnique({
            where: { pipeline_stage_id: pipelineStageId },
            include: {
                application: {
                    select: {
                        application_id: true,
                        applicant: { select: { applicant_id: true, full_name: true } },
                        job: { select: { job_id: true, job_title: true } },
                    },
                },
            },
        });
        if (!existing)
            return (0, response_1.sendError)(res, 'Pipeline stage not found', 404);
        // ── 3. Guard: never allow overwriting system-set stages ───────────────
        //    INTERVIEWED / ONBOARDED are locked once set by the system.
        if (existing.stage_name === 'INTERVIEWED' ||
            existing.stage_name === 'ONBOARDED') {
            return (0, response_1.sendError)(res, `Cannot manually change a stage that is already ${existing.stage_name}. ` +
                `Use the dedicated interview/onboard endpoints.`, 409);
        }
        // ── 4. No-op guard ─────────────────────────────────────────────────────
        if (existing.stage_name.toUpperCase() === normalised) {
            return (0, response_1.sendSuccess)(res, {
                message: `Stage is already set to "${stage_name}". No change made.`,
                data: existing,
            });
        }
        // ── 5. Persist ─────────────────────────────────────────────────────────
        const updated = await prisma_config_1.default.pipelineStage.update({
            where: { pipeline_stage_id: pipelineStageId },
            data: { stage_name: normalised }, // cast — Prisma enum sync lag
            include: pipelineInclude,
        });
        const appWithOrg = await prisma_config_1.default.application.findUnique({
            where: { application_id: existing.application.application_id },
            select: { job: { select: { job_id: true, organization_id: true } } },
        });
        if (appWithOrg) {
            (0, stageAutomationController_1.fireStageAutomations)(normalised, existing.application.applicant.applicant_id, existing.application.application_id, appWithOrg.job.job_id, appWithOrg.job.organization_id).catch(e => console.error('Stage automation error:', e.message));
        }
        // ── 6. Activity log ────────────────────────────────────────────────────
        const userId = req.user?.user_id;
        if (userId) {
            await (0, activityService_1.updateUserActivity)(userId, {
                action_type: 'UPDATE',
                entity_type: 'PIPELINE_STAGE',
                entity_id: pipelineStageId,
                entity_name: `Stage updated to "${STAGE_LABELS[normalised] ?? normalised}" ` +
                    `for ${existing.application.applicant.full_name} — ` +
                    `${existing.application.job.job_title}`,
                timestamp: new Date().toISOString(),
            });
        }
        return (0, response_1.sendSuccess)(res, {
            message: `Pipeline stage updated to "${STAGE_LABELS[normalised] ?? normalised}"`,
            data: reshapePipelineStage(updated),
        });
    }
    catch (err) {
        console.error('Error updating pipeline stage manually:', err);
        return (0, response_1.sendError)(res, 'Failed to update pipeline stage', 500);
    }
};
// ─────────────────────────────────────────────────────────────────────────────
// EXPORT
// ─────────────────────────────────────────────────────────────────────────────
exports.pipelineController = {
    getAll: getAllPipelineStages,
    create: createPipeline,
    getById: baseCrudMethods.getById,
    update: baseCrudMethods.update,
    delete: baseCrudMethods.delete,
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
    uploadOnboardingDocs: exports.uploadOnboardingDocs,
    updatePipelineStageManually
};
//# sourceMappingURL=pipelineController.js.map