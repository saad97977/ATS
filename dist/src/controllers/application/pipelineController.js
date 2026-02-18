"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.pipelineController = void 0;
const prisma_config_1 = __importDefault(require("../../prisma.config"));
const crudFactory_1 = require("../../factories/crudFactory");
const schemas_1 = require("../../validators/schemas");
const response_1 = require("../../utils/response");
const emailService_1 = require("../../services/emailService");
const activityService_1 = require("../../services/activityService");
// ─────────────────────────────────────────────────────────────────────────────
// TIMEZONE CONFIGURATION
// ─────────────────────────────────────────────────────────────────────────────
// The frontend sends datetime-local values converted to UTC ISO strings using
// localInputToUTCISOString(), which already accounts for the local offset.
// The controller therefore receives correct UTC strings and stores them as-is.
//
// The ONLY place where a timezone offset is needed here is when comparing
// "now" against stored dates for validation (e.g. "must be in the future").
// That comparison is done in UTC so no offset is needed on the server side.
//
// TIMEZONE_OFFSET_HOURS is kept here purely for documentation / symmetry.
// Do NOT apply it to incoming dates — the frontend already did the conversion.
//
// Examples:
//   -5   → EST  (Eastern Standard Time)
//   -4   → EDT  (Eastern Daylight Time)
//    0   → UTC
//   +5   → PKT  (Pakistan Standard Time)
// ─────────────────────────────────────────────────────────────────────────────
const TIMEZONE_OFFSET_HOURS = -5; // informational only — see note above
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
        if (stage && ['PIPELINED', 'INTERVIEWED', 'ONBOARDED'].includes(stage.toUpperCase())) {
            whereClause.stage_name = stage.toUpperCase();
        }
        const [pipelineStages, total] = await Promise.all([
            prisma_config_1.default.pipelineStage.findMany({
                where: whereClause, skip, take: limit,
                orderBy: { pipeline_date: 'desc' },
                include: {
                    application: {
                        include: {
                            applicant: { select: { applicant_id: true, full_name: true, status: true, contact: { select: { email: true, phone: true } } } },
                            job: { select: { job_id: true, job_title: true, organization: { select: { organization_id: true, name: true } } } },
                            interviews: { select: { interview_id: true, interview_date: true, status: true } },
                        },
                    },
                    credit_user: { select: { user_id: true, name: true, email: true } },
                    representative_user: { select: { user_id: true, name: true, email: true } },
                },
            }),
            prisma_config_1.default.pipelineStage.count({ where: whereClause }),
        ]);
        return (0, response_1.sendSuccess)(res, { data: pipelineStages, paging: { total, page, limit, totalPages: Math.ceil(total / limit) } });
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
            return (0, response_1.sendError)(res, 'Pipeline already exists for this application', 409, [{ field: 'duplicate', message: `Pipeline already exists with ID: ${existing.pipeline_stage_id}` }]);
        }
        const pipelineStageId = await prisma_config_1.default.$transaction(async (tx) => {
            const ps = await tx.pipelineStage.create({
                data: { application_id, stage_name: 'PIPELINED', credit_organization_user_id: credit_organization_user_id || null, representative_organization_user_id: representative_organization_user_id || null },
                select: { pipeline_stage_id: true },
            });
            await tx.application.update({ where: { application_id }, data: { status: 'SCREENED' } });
            await tx.applicant.update({ where: { applicant_id: application.applicant_id }, data: { status: 'SHORTLISTED' } });
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
// The frontend sends interview_date as a UTC ISO string (already converted
// from EST via localInputToUTCISOString). We store it directly as UTC.
// ─────────────────────────────────────────────────────────────────────────────
const createInterviewForPipeline = async (req, res) => {
    try {
        const { pipelineStageId } = req.params;
        const { interview_date } = req.body;
        if (!interview_date)
            return (0, response_1.sendError)(res, 'interview_date is required', 400);
        // The incoming value is already UTC (frontend converted EST → UTC).
        // Parse directly — no offset adjustment needed here.
        const interviewDateUTC = new Date(interview_date);
        if (isNaN(interviewDateUTC.getTime()))
            return (0, response_1.sendError)(res, 'Invalid interview_date format', 400);
        const pipelineStage = await prisma_config_1.default.pipelineStage.findUnique({
            where: { pipeline_stage_id: pipelineStageId },
            include: {
                application: {
                    include: {
                        applicant: { include: { contact: true } },
                        job: {
                            include: {
                                organization: {
                                    select: { name: true, website: true, contacts: { where: { contact_type: 'PRIMARY' }, take: 1 } },
                                },
                            },
                        },
                        interviews: true,
                    },
                },
            },
        });
        if (!pipelineStage)
            return (0, response_1.sendError)(res, 'Pipeline stage not found', 404);
        if (pipelineStage.application.interviews?.length > 0) {
            return (0, response_1.sendError)(res, 'Interview already exists for this application', 409, [{
                    field: 'interview',
                    message: `An interview is already scheduled for ${pipelineStage.application.interviews[0].interview_date}`,
                }]);
        }
        const applicantEmail = pipelineStage.application.applicant.contact?.email;
        if (!applicantEmail)
            return (0, response_1.sendError)(res, 'Applicant email not found. Cannot send interview invitation.', 400);
        const interviewId = await prisma_config_1.default.$transaction(async (tx) => {
            const iv = await tx.interview.create({
                data: {
                    application_id: pipelineStage.application_id,
                    interview_date: interviewDateUTC, // stored as UTC
                    status: 'PENDING',
                },
                select: { interview_id: true },
            });
            await tx.applicant.update({ where: { applicant_id: pipelineStage.application.applicant_id }, data: { status: 'INTERVIEWING' } });
            return iv.interview_id;
        });
        const result = await prisma_config_1.default.interview.findUnique({
            where: { interview_id: interviewId },
            include: {
                application: {
                    include: {
                        job: {
                            select: {
                                job_id: true, job_title: true, location: true,
                                organization: { select: { organization_id: true, name: true, website: true, contacts: { where: { contact_type: 'PRIMARY' }, select: { email: true, phone: true } } } },
                            },
                        },
                        applicant: { select: { applicant_id: true, full_name: true, contact: { select: { email: true, phone: true } } } },
                    },
                },
            },
        });
        // Send invitation email (async)
        (0, emailService_1.sendInterviewInvitationEmail)({
            applicantEmail: result.application.applicant.contact.email,
            applicantName: result.application.applicant.full_name,
            jobTitle: result.application.job.job_title,
            organizationName: result.application.job.organization.name,
            organizationWebsite: result.application.job.organization.website || undefined,
            interviewDate: result.interview_date, // UTC Date — emailService formats in EST
            location: result.application.job.location,
            contactEmail: result.application.job.organization.contacts[0]?.email || undefined,
            contactPhone: result.application.job.organization.contacts[0]?.phone || undefined,
        }).then((r) => {
            if (r.success)
                console.log('✅ Interview invitation email sent', { interviewId: result.interview_id });
            else
                console.error('❌ Failed to send invitation email', { error: r.error });
        }).catch((e) => console.error('❌ Email error', e.message));
        const userId = req.user?.user_id;
        if (userId) {
            await (0, activityService_1.updateUserActivity)(userId, {
                action_type: 'SCEDULE', entity_type: 'INTERVIEW', entity_id: result.interview_id,
                entity_name: `Interview for ${result.application.applicant.full_name} - ${result.application.job.job_title}`,
                timestamp: new Date().toISOString(),
            });
        }
        return (0, response_1.sendSuccess)(res, result, 201);
    }
    catch (err) {
        console.error('Error creating interview:', err);
        if (err.code === 'P2002')
            return (0, response_1.sendError)(res, 'Interview already exists for this application', 409);
        return (0, response_1.sendError)(res, 'Failed to create interview', 500);
    }
};
// ─────────────────────────────────────────────────────────────────────────────
// UPDATE INTERVIEW DATE
// PATCH /api/pipeline/interview/:interviewId/update-date
//
// The frontend sends the new date as a UTC ISO string (EST → UTC conversion
// already applied by localInputToUTCISOString). Store directly.
// ─────────────────────────────────────────────────────────────────────────────
const updateInterviewDate = async (req, res) => {
    try {
        const { interviewId } = req.params;
        const { interview_date } = req.body;
        if (!interview_date)
            return (0, response_1.sendError)(res, 'interview_date is required', 400);
        // Incoming value is already UTC — parse and validate against now (UTC)
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
            data: { interview_date: selectedDateUTC }, // stored as UTC
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
            (0, emailService_1.sendInterviewRescheduleEmail)({
                applicantEmail: aEmail,
                applicantName: updated.application.applicant.full_name,
                jobTitle: updated.application.job.job_title,
                organizationName: updated.application.job.organization.name,
                oldDate, // UTC Date — emailService formats in EST
                newDate: updated.interview_date, // UTC Date — emailService formats in EST
                location: updated.application.job.location,
            }).then((r) => { if (!r.success)
                console.error('❌ Reschedule email failed:', r.error); })
                .catch((e) => console.error('❌ Reschedule email error:', e.message));
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
        const interview = await prisma_config_1.default.interview.findUnique({
            where: { application_id: applicationId },
            include: {
                application: {
                    include: {
                        job: {
                            select: {
                                job_id: true, job_title: true, job_type: true, location: true,
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
        if (!interview)
            return (0, response_1.sendError)(res, 'Interview not found for this application', 404);
        const statusTimeline = {
            application_status: interview.application.status,
            applicant_status: interview.application.applicant.status,
            interview_status: interview.status,
            pipeline_stage: interview.application.pipeline_stages[0]?.stage_name || null,
            events: [
                { stage: 'APPLIED', date: interview.application.applied_at, description: 'Application submitted', status: 'completed' },
                { stage: 'SCREENED', date: interview.application.pipeline_stages[0]?.pipeline_date || null, description: 'Application screened and shortlisted', status: interview.application.status === 'APPLIED' ? 'pending' : 'completed' },
                { stage: 'INTERVIEWING', date: interview.interview_date, description: 'Interview scheduled', status: interview.status === 'PENDING' ? 'current' : 'completed' },
                { stage: 'INTERVIEW_RESULT', date: null, description: 'Interview result pending',
                    status: interview.status === 'COMPLETED_RESULT_PENDING' ? 'current' : interview.status === 'REJECTED' ? 'rejected' : interview.status === 'ACCEPTED' ? 'completed' : 'pending' },
                { stage: 'OFFERED', date: null, description: 'Offer extended',
                    status: interview.application.status === 'OFFERED' ? 'current' : interview.application.status === 'HIRED' ? 'completed' : 'pending' },
                { stage: 'HIRED', date: null, description: 'Candidate hired and onboarded', status: interview.application.status === 'HIRED' ? 'completed' : 'pending' },
            ],
        };
        return (0, response_1.sendSuccess)(res, { interview, status_timeline: statusTimeline });
    }
    catch (err) {
        console.error('Error fetching interview by application:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch interview details', 500);
    }
};
// ─────────────────────────────────────────────────────────────────────────────
// AUTO-UPDATE COMPLETED INTERVIEWS
// POST /api/pipeline/auto-update-completed
// Compares stored UTC dates against UTC now — no offset needed.
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
            const r = await tx.interview.updateMany({ where: { status: 'PENDING', interview_date: { lt: nowUTC } }, data: { status: 'COMPLETED_RESULT_PENDING' } });
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
        await prisma_config_1.default.$transaction(async (tx) => {
            await tx.interview.update({ where: { interview_id: interviewId }, data: { status: 'REJECTED' } });
        });
        const result = await prisma_config_1.default.interview.findUnique({
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
            (0, emailService_1.sendInterviewRejectionEmail)({
                applicantEmail: aEmail,
                applicantName: result.application.applicant.full_name,
                jobTitle: result.application.job.job_title,
                organizationName: result.application.job.organization.name,
            }).then((r) => { if (!r.success)
                console.error('❌ Rejection email failed:', r.error); })
                .catch((e) => console.error('❌ Rejection email error:', e.message));
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
                    },
                },
            },
        });
        if (!interview)
            return (0, response_1.sendError)(res, 'Interview not found', 404);
        await prisma_config_1.default.$transaction(async (tx) => {
            await tx.interview.update({ where: { interview_id: interviewId }, data: { status: 'ACCEPTED' } });
            await tx.application.update({ where: { application_id: interview.application_id }, data: { status: 'OFFERED' } });
        });
        const result = await prisma_config_1.default.interview.findUnique({
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
            (0, emailService_1.sendOfferLetterEmail)({
                applicantEmail: aEmail,
                applicantName: result.application.applicant.full_name,
                jobTitle: result.application.job.job_title,
                organizationName: result.application.job.organization.name,
            }).then((r) => { if (!r.success)
                console.error('❌ Offer email failed:', r.error); })
                .catch((e) => console.error('❌ Offer email error:', e.message));
        }
        return (0, response_1.sendSuccess)(res, result);
    }
    catch (err) {
        console.error('Error accepting interview:', err);
        return (0, response_1.sendError)(res, 'Failed to accept interview', 500);
    }
};
// ─────────────────────────────────────────────────────────────────────────────
// ONBOARD CANDIDATE
// PATCH /api/pipeline/:pipelineStageId/onboard
// ─────────────────────────────────────────────────────────────────────────────
const onboardCandidate = async (req, res) => {
    try {
        const { pipelineStageId } = req.params;
        const { start_date, end_date, employment_type, workers_comp_code } = req.body;
        if (!start_date || !employment_type)
            return (0, response_1.sendError)(res, 'start_date and employment_type are required', 400);
        if (!['W2', 'CONTRACTOR_1099'].includes(employment_type))
            return (0, response_1.sendError)(res, 'employment_type must be W2 or CONTRACTOR_1099', 400);
        const startDate = new Date(start_date);
        if (isNaN(startDate.getTime()))
            return (0, response_1.sendError)(res, 'Invalid start_date format', 400);
        if (end_date) {
            const endDate = new Date(end_date);
            if (isNaN(endDate.getTime()))
                return (0, response_1.sendError)(res, 'Invalid end_date format', 400);
            if (endDate <= startDate)
                return (0, response_1.sendError)(res, 'end_date must be after start_date', 400);
        }
        const pipelineStage = await prisma_config_1.default.pipelineStage.findUnique({
            where: { pipeline_stage_id: pipelineStageId },
            include: {
                application: {
                    include: {
                        applicant: { include: { contact: true } },
                        job: { include: { organization: { select: { name: true } } } },
                    },
                },
            },
        });
        if (!pipelineStage)
            return (0, response_1.sendError)(res, 'Pipeline stage not found', 404);
        const interview = await prisma_config_1.default.interview.findUnique({ where: { application_id: pipelineStage.application_id } });
        if (!interview || interview.status !== 'ACCEPTED')
            return (0, response_1.sendError)(res, 'Cannot onboard: Interview must be accepted first', 400);
        const existing = await prisma_config_1.default.assignment.findUnique({ where: { application_id: pipelineStage.application_id } });
        if (existing)
            return (0, response_1.sendError)(res, 'Assignment already exists for this application', 400);
        await prisma_config_1.default.$transaction(async (tx) => {
            await tx.pipelineStage.update({ where: { pipeline_stage_id: pipelineStageId }, data: { stage_name: 'ONBOARDED' } });
            await tx.application.update({ where: { application_id: pipelineStage.application_id }, data: { status: 'HIRED' } });
            await tx.applicant.update({ where: { applicant_id: pipelineStage.application.applicant_id }, data: { status: 'PLACED' } });
            await tx.assignment.create({
                data: {
                    application_id: pipelineStage.application_id,
                    start_date: startDate,
                    end_date: end_date ? new Date(end_date) : null,
                    employment_type,
                    workers_comp_code: workers_comp_code || null,
                },
            });
        });
        const result = await prisma_config_1.default.pipelineStage.findUnique({
            where: { pipeline_stage_id: pipelineStageId },
            include: {
                application: {
                    include: {
                        job: { select: { job_title: true, organization: { select: { name: true } } } },
                        applicant: { select: { full_name: true, status: true, contact: { select: { email: true } } } },
                        assignment: { select: { assignment_id: true, start_date: true, end_date: true, employment_type: true, workers_comp_code: true } },
                    },
                },
                credit_user: { select: { user_id: true, name: true } },
                representative_user: { select: { user_id: true, name: true } },
            },
        });
        const aEmail = result.application.applicant.contact?.email;
        if (aEmail) {
            (0, emailService_1.sendOnboardingWelcomeEmail)({
                applicantEmail: aEmail,
                applicantName: result.application.applicant.full_name,
                jobTitle: result.application.job.job_title,
                organizationName: result.application.job.organization.name,
                startDate,
                endDate: end_date ? new Date(end_date) : null,
                employmentType: employment_type,
                workersCompCode: workers_comp_code ?? null,
            }).then((r) => { if (!r.success)
                console.error('❌ Onboarding email failed:', r.error); })
                .catch((e) => console.error('❌ Onboarding email error:', e.message));
        }
        return (0, response_1.sendSuccess)(res, result);
    }
    catch (err) {
        console.error('Error onboarding candidate:', err);
        return (0, response_1.sendError)(res, 'Failed to onboard candidate', 500);
    }
};
// ─────────────────────────────────────────────────────────────────────────────
// GET PIPELINE BY JOB
// GET /api/pipeline/job/:jobId
// ─────────────────────────────────────────────────────────────────────────────
const getPipelineByJob = async (req, res) => {
    try {
        const { jobId } = req.params;
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
        const skip = (page - 1) * limit;
        const stage = req.query.stage;
        const whereClause = { application: { job_id: jobId } };
        if (stage && ['PIPELINED', 'INTERVIEWED', 'ONBOARDED'].includes(stage.toUpperCase())) {
            whereClause.stage_name = stage.toUpperCase();
        }
        const [pipelineStages, total] = await Promise.all([
            prisma_config_1.default.pipelineStage.findMany({
                where: whereClause, skip, take: limit, orderBy: { pipeline_date: 'desc' },
                include: {
                    application: {
                        include: {
                            applicant: { select: { applicant_id: true, full_name: true, status: true, contact: { select: { email: true, phone: true } } } },
                            job: { select: { job_id: true, job_title: true, organization: { select: { organization_id: true, name: true } } } },
                            interviews: { select: { interview_id: true, interview_date: true, status: true } },
                        },
                    },
                    credit_user: { select: { user_id: true, name: true, email: true } },
                    representative_user: { select: { user_id: true, name: true, email: true } },
                },
            }),
            prisma_config_1.default.pipelineStage.count({ where: whereClause }),
        ]);
        return (0, response_1.sendSuccess)(res, { data: pipelineStages, paging: { total, page, limit, totalPages: Math.ceil(total / limit) } });
    }
    catch (err) {
        console.error('Error fetching pipeline by job:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch pipeline', 500);
    }
};
// ─────────────────────────────────────────────────────────────────────────────
// GET PIPELINE STATS
// GET /api/pipeline/stats
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
// GET /api/pipeline/:pipelineStageId/overview
// ─────────────────────────────────────────────────────────────────────────────
const getPipelineOverview = async (req, res) => {
    try {
        const { pipelineStageId } = req.params;
        const ps = await prisma_config_1.default.pipelineStage.findUnique({
            where: { pipeline_stage_id: pipelineStageId },
            include: {
                application: {
                    include: {
                        job: { select: { job_title: true, job_type: true, location: true, organization: { select: { name: true, website: true } } } },
                        applicant: {
                            include: {
                                contact: true, demographic: true,
                                work_history: { where: { OR: [{ application_id: { equals: null } }, { application_id: { not: null } }] }, orderBy: { created_at: 'desc' } },
                                documents: { where: { OR: [{ application_id: { equals: null } }, { application_id: { not: null } }] }, orderBy: { created_at: 'desc' } },
                            },
                        },
                        interviews: true,
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
// GET /api/pipeline/filter-by-interview-status?status=PENDING
// ─────────────────────────────────────────────────────────────────────────────
const getPipelineByInterviewStatus = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
        const skip = (page - 1) * limit;
        const status = req.query.status;
        if (!status || !['PENDING', 'COMPLETED_RESULT_PENDING', 'REJECTED', 'ACCEPTED'].includes(status.toUpperCase())) {
            return (0, response_1.sendError)(res, 'Invalid or missing interview status. Valid values: PENDING, COMPLETED_RESULT_PENDING, REJECTED, ACCEPTED', 400);
        }
        const whereClause = { application: { interviews: { some: { status: status.toUpperCase() } } } };
        const [pipelineStages, total] = await Promise.all([
            prisma_config_1.default.pipelineStage.findMany({
                where: whereClause, skip, take: limit, orderBy: { pipeline_date: 'desc' },
                include: {
                    application: {
                        include: {
                            applicant: { select: { applicant_id: true, full_name: true, status: true, contact: { select: { email: true, phone: true } } } },
                            job: { select: { job_id: true, job_title: true, organization: { select: { organization_id: true, name: true } } } },
                            interviews: { select: { interview_id: true, interview_date: true, status: true } },
                        },
                    },
                    credit_user: { select: { user_id: true, name: true, email: true } },
                    representative_user: { select: { user_id: true, name: true, email: true } },
                },
            }),
            prisma_config_1.default.pipelineStage.count({ where: whereClause }),
        ]);
        return (0, response_1.sendSuccess)(res, { data: pipelineStages, paging: { total, page, limit, totalPages: Math.ceil(total / limit) }, filter: { interview_status: status.toUpperCase() } });
    }
    catch (err) {
        console.error('Error fetching pipeline by interview status:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch pipeline stages', 500);
    }
};
// ─────────────────────────────────────────────────────────────────────────────
// SEARCH PIPELINED APPLICANTS
// GET /api/pipeline/search?query=john
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
                include: {
                    application: {
                        include: {
                            applicant: { select: { applicant_id: true, full_name: true, status: true, contact: { select: { email: true, phone: true } } } },
                            job: { select: { job_id: true, job_title: true, organization: { select: { organization_id: true, name: true } } } },
                            interviews: { select: { interview_id: true, interview_date: true, status: true } },
                        },
                    },
                    credit_user: { select: { user_id: true, name: true, email: true } },
                    representative_user: { select: { user_id: true, name: true, email: true } },
                },
            }),
            prisma_config_1.default.pipelineStage.count({ where: whereClause }),
        ]);
        return (0, response_1.sendSuccess)(res, { data: pipelineStages, paging: { total, page, limit, totalPages: Math.ceil(total / limit) }, search: { query: term, fields: ['organization_name', 'job_title', 'applicant_name', 'applicant_email'] } });
    }
    catch (err) {
        console.error('Error searching pipelined applicants:', err);
        return (0, response_1.sendError)(res, 'Failed to search applicants', 500);
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
};
//# sourceMappingURL=pipelineController.js.map