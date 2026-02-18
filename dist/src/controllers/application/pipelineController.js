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
 *
 * DATE HANDLING:
 * All dates from the frontend are treated as UTC. The helper `toUTCDate()` ensures
 * that a string like "2025-03-17T22:26:00" is stored as 2025-03-17T22:26:00.000Z
 * rather than being silently shifted by the server's local timezone. This matches
 * the emailService.ts which always reads dates via getUTC*() methods.
 */
// ─── UTC Date Parsing Helper ──────────────────────────────────────────────────
/**
 * Parse a date input from the frontend and return a Date object whose UTC value
 * matches the wall-clock time the user entered.
 *
 * Handles three common frontend formats:
 *  • "2025-03-17T22:26:00"      → already looks like UTC, just append "Z"
 *  • "2025-03-17T22:26:00Z"     → already UTC, parse directly
 *  • "2025-03-17T22:26:00+05:00"→ offset present, JS normalises to UTC correctly
 *  • "2025-03-17"               → date-only, treated as midnight UTC
 */
const toUTCDate = (input) => {
    if (input instanceof Date)
        return input;
    const s = input.trim();
    // If no timezone info is present (no Z, no +HH:MM, no -HH:MM at the end),
    // append "Z" so JS treats the value as UTC instead of local time.
    const hasTimezone = /[Zz]$/.test(s) || /[+-]\d{2}:\d{2}$/.test(s);
    return new Date(hasTimezone ? s : `${s}Z`);
};
// Generate base CRUD methods
const baseCrudMethods = (0, crudFactory_1.createCrudController)({
    model: prisma_config_1.default.pipelineStage,
    modelName: 'PipelineStage',
    idField: 'pipeline_stage_id',
    createSchema: schemas_1.createPipelineStageSchema,
    updateSchema: schemas_1.updatePipelineStageSchema,
    defaultLimit: 10,
    maxLimit: 100,
});
/**
 * GET ALL PIPELINE STAGES WITH FILTERING
 * GET /api/pipeline?stage=PIPELINED&page=1&limit=10
 */
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
            prisma_config_1.default.pipelineStage.count({ where: whereClause }),
        ]);
        return (0, response_1.sendSuccess)(res, {
            data: pipelineStages,
            paging: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        });
    }
    catch (err) {
        console.error('Error fetching pipeline stages:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch pipeline stages', 500);
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
const createPipeline = async (req, res) => {
    try {
        const validation = schemas_1.createPipelineStageSchema.safeParse(req.body);
        if (!validation.success) {
            const errors = validation.error.issues.map((err) => ({
                field: err.path.join('.'),
                message: err.message,
            }));
            return (0, response_1.sendError)(res, 'Validation failed', 400, errors);
        }
        const { application_id, credit_organization_user_id, representative_organization_user_id } = req.body;
        const application = await prisma_config_1.default.application.findUnique({
            where: { application_id },
            include: {
                applicant: true,
                job: true,
            },
        });
        if (!application) {
            return (0, response_1.sendError)(res, 'Application not found', 404);
        }
        const existingPipeline = await prisma_config_1.default.pipelineStage.findFirst({
            where: { application_id },
        });
        if (existingPipeline) {
            return (0, response_1.sendError)(res, 'Pipeline already exists for this application', 409, [{
                    field: 'duplicate',
                    message: `Pipeline already exists with ID: ${existingPipeline.pipeline_stage_id}`,
                }]);
        }
        const pipelineStageId = await prisma_config_1.default.$transaction(async (tx) => {
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
            await tx.application.update({
                where: { application_id },
                data: { status: 'SCREENED' },
            });
            await tx.applicant.update({
                where: { applicant_id: application.applicant_id },
                data: { status: 'SHORTLISTED' },
            });
            return pipelineStage.pipeline_stage_id;
        });
        const result = await prisma_config_1.default.pipelineStage.findUnique({
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
        return (0, response_1.sendSuccess)(res, result, 201);
    }
    catch (err) {
        console.error('Error creating pipeline:', err);
        if (err.code === 'P2002') {
            return (0, response_1.sendError)(res, 'Pipeline already exists for this application', 409);
        }
        if (err.code === 'P2003') {
            return (0, response_1.sendError)(res, 'Related application or job not found', 404);
        }
        return (0, response_1.sendError)(res, 'Failed to create pipeline', 500);
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
 */
const createInterviewForPipeline = async (req, res) => {
    try {
        const { pipelineStageId } = req.params;
        const { interview_date } = req.body;
        if (!interview_date) {
            return (0, response_1.sendError)(res, 'interview_date is required', 400);
        }
        // ✅ Parse as UTC — toUTCDate() appends "Z" when no timezone offset is present,
        //    so "2025-03-17T22:26:00" is stored as 2025-03-17T22:26:00.000Z (not shifted).
        const interviewDateUTC = toUTCDate(interview_date);
        if (isNaN(interviewDateUTC.getTime())) {
            return (0, response_1.sendError)(res, 'Invalid interview_date format', 400);
        }
        const pipelineStage = await prisma_config_1.default.pipelineStage.findUnique({
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
                        interviews: true,
                    },
                },
            },
        });
        if (!pipelineStage) {
            return (0, response_1.sendError)(res, 'Pipeline stage not found', 404);
        }
        if (pipelineStage.application.interviews && pipelineStage.application.interviews.length > 0) {
            return (0, response_1.sendError)(res, 'Interview already exists for this application', 409, [{
                    field: 'interview',
                    message: `An interview is already scheduled for ${new Date(pipelineStage.application.interviews[0].interview_date).toLocaleString()}`,
                }]);
        }
        const applicantEmail = pipelineStage.application.applicant.contact?.email;
        if (!applicantEmail) {
            return (0, response_1.sendError)(res, 'Applicant email not found. Cannot send interview invitation.', 400);
        }
        const interviewId = await prisma_config_1.default.$transaction(async (tx) => {
            const interview = await tx.interview.create({
                data: {
                    application_id: pipelineStage.application_id,
                    // ✅ Store the pre-parsed UTC Date object directly
                    interview_date: interviewDateUTC,
                    status: 'PENDING',
                },
                select: {
                    interview_id: true,
                },
            });
            await tx.applicant.update({
                where: { applicant_id: pipelineStage.application.applicant_id },
                data: { status: 'INTERVIEWING' },
            });
            return interview.interview_id;
        });
        const result = await prisma_config_1.default.interview.findUnique({
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
        const emailData = {
            applicantEmail: result.application.applicant.contact.email,
            applicantName: result.application.applicant.full_name,
            jobTitle: result.application.job.job_title,
            organizationName: result.application.job.organization.name,
            organizationWebsite: result.application.job.organization.website || undefined,
            // ✅ interview_date is already a proper UTC Date from the DB — email helper reads it correctly
            interviewDate: result.interview_date,
            location: result.application.job.location,
            contactEmail: result.application.job.organization.contacts[0]?.email || undefined,
            contactPhone: result.application.job.organization.contacts[0]?.phone || undefined,
        };
        (0, emailService_1.sendInterviewInvitationEmail)(emailData)
            .then((emailResult) => {
            if (emailResult.success) {
                console.log('✅ Interview invitation email sent successfully', {
                    interviewId: result.interview_id,
                    applicantEmail: emailData.applicantEmail,
                    messageId: emailResult.messageId,
                });
            }
            else {
                console.error('❌ Failed to send interview invitation email', {
                    interviewId: result.interview_id,
                    applicantEmail: emailData.applicantEmail,
                    error: emailResult.error,
                });
            }
        })
            .catch((error) => {
            console.error('❌ Error in email sending process', {
                interviewId: result.interview_id,
                error: error.message,
            });
        });
        const userId = req.user?.user_id;
        if (userId) {
            await (0, activityService_1.updateUserActivity)(userId, {
                action_type: 'SCEDULE',
                entity_type: 'INTERVIEW',
                entity_id: result.interview_id,
                entity_name: `Interview for ${result.application.applicant.full_name} - ${result.application.job.job_title}`,
                timestamp: new Date().toISOString(),
            });
        }
        return (0, response_1.sendSuccess)(res, result, 201);
    }
    catch (err) {
        console.error('Error creating interview:', err);
        if (err.code === 'P2002') {
            return (0, response_1.sendError)(res, 'Interview already exists for this application', 409);
        }
        return (0, response_1.sendError)(res, 'Failed to create interview', 500);
    }
};
/**
 * UPDATE INTERVIEW DATE
 * PATCH /api/pipeline/interview/:interviewId/update-date
 */
const updateInterviewDate = async (req, res) => {
    try {
        const { interviewId } = req.params;
        const { interview_date } = req.body;
        if (!interview_date) {
            return (0, response_1.sendError)(res, 'interview_date is required', 400);
        }
        // ✅ Parse as UTC consistently with createInterviewForPipeline
        const newInterviewDateUTC = toUTCDate(interview_date);
        if (isNaN(newInterviewDateUTC.getTime())) {
            return (0, response_1.sendError)(res, 'Invalid interview_date format', 400);
        }
        const nowUTC = new Date();
        if (newInterviewDateUTC.getTime() < nowUTC.getTime()) {
            return (0, response_1.sendError)(res, 'Interview date must be in the future', 400);
        }
        const interview = await prisma_config_1.default.interview.findUnique({
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
            return (0, response_1.sendError)(res, 'Interview not found', 404);
        }
        if (interview.status !== 'PENDING') {
            return (0, response_1.sendError)(res, `Cannot update interview date. Interview status is ${interview.status}. Only PENDING interviews can be rescheduled.`, 400);
        }
        const oldInterviewDate = interview.interview_date;
        const updatedInterview = await prisma_config_1.default.interview.update({
            where: { interview_id: interviewId },
            // ✅ Store the pre-parsed UTC Date object directly
            data: { interview_date: newInterviewDateUTC },
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
        const applicantEmail = updatedInterview.application.applicant.contact?.email;
        if (applicantEmail) {
            (0, emailService_1.sendInterviewRescheduleEmail)({
                applicantEmail,
                applicantName: updatedInterview.application.applicant.full_name,
                jobTitle: updatedInterview.application.job.job_title,
                organizationName: updatedInterview.application.job.organization.name,
                // ✅ Both dates are proper UTC Date objects — email helper reads them correctly
                oldDate: oldInterviewDate,
                newDate: updatedInterview.interview_date,
                location: updatedInterview.application.job.location,
            })
                .then((emailResult) => {
                if (emailResult.success) {
                    console.log('✅ Interview reschedule email sent successfully');
                }
                else {
                    console.error('❌ Failed to send reschedule email:', emailResult.error);
                }
            })
                .catch((error) => {
                console.error('❌ Error in reschedule email process:', error.message);
            });
        }
        const userId = req.user?.user_id;
        if (userId) {
            await (0, activityService_1.updateUserActivity)(userId, {
                action_type: 'UPDATE',
                entity_type: 'INTERVIEW',
                entity_id: interviewId,
                entity_name: `Rescheduled interview for ${interview.application.applicant.full_name} - ${interview.application.job.job_title}`,
                timestamp: new Date().toISOString(),
            });
        }
        return (0, response_1.sendSuccess)(res, updatedInterview);
    }
    catch (err) {
        console.error('Error updating interview date:', err);
        return (0, response_1.sendError)(res, 'Failed to update interview date', 500);
    }
};
/**
 * GET INTERVIEW DETAILS BY APPLICATION ID
 * GET /api/pipeline/interview/application/:applicationId
 */
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
            return (0, response_1.sendError)(res, 'Interview not found for this application', 404);
        }
        const statusTimeline = {
            application_status: interview.application.status,
            applicant_status: interview.application.applicant.status,
            interview_status: interview.status,
            pipeline_stage: interview.application.pipeline_stages[0]?.stage_name || null,
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
        return (0, response_1.sendSuccess)(res, {
            interview,
            status_timeline: statusTimeline,
        });
    }
    catch (err) {
        console.error('Error fetching interview by application:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch interview details', 500);
    }
};
/**
 * AUTO-UPDATE COMPLETED INTERVIEWS
 * POST /api/pipeline/auto-update-completed
 */
const autoUpdateCompletedInterviews = async (req, res) => {
    try {
        const nowUTC = new Date();
        const pendingInterviews = await prisma_config_1.default.interview.findMany({
            where: {
                status: 'PENDING',
                interview_date: {
                    lt: nowUTC,
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
            return (0, response_1.sendSuccess)(res, {
                message: 'No interviews to update',
                updated_count: 0,
            });
        }
        const updateResults = await prisma_config_1.default.$transaction(async (tx) => {
            const interviewUpdate = await tx.interview.updateMany({
                where: {
                    status: 'PENDING',
                    interview_date: { lt: nowUTC },
                },
                data: { status: 'COMPLETED_RESULT_PENDING' },
            });
            await tx.pipelineStage.updateMany({
                where: {
                    application: {
                        interviews: {
                            some: {
                                status: 'COMPLETED_RESULT_PENDING',
                                interview_date: { lt: nowUTC },
                            },
                        },
                    },
                },
                data: { stage_name: 'INTERVIEWED' },
            });
            return interviewUpdate.count;
        });
        return (0, response_1.sendSuccess)(res, {
            message: `Successfully updated ${updateResults} interviews`,
            updated_count: updateResults,
        });
    }
    catch (err) {
        console.error('Error auto-updating interviews:', err);
        return (0, response_1.sendError)(res, 'Failed to auto-update interviews', 500);
    }
};
/**
 * REJECT INTERVIEW
 * PATCH /api/pipeline/interview/:interviewId/reject
 */
const rejectInterview = async (req, res) => {
    try {
        const { interviewId } = req.params;
        const interview = await prisma_config_1.default.interview.findUnique({
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
            return (0, response_1.sendError)(res, 'Interview not found', 404);
        }
        await prisma_config_1.default.$transaction(async (tx) => {
            await tx.interview.update({
                where: { interview_id: interviewId },
                data: { status: 'REJECTED' },
            });
        });
        const result = await prisma_config_1.default.interview.findUnique({
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
        const applicantEmail = result.application.applicant.contact?.email;
        if (applicantEmail) {
            (0, emailService_1.sendInterviewRejectionEmail)({
                applicantEmail,
                applicantName: result.application.applicant.full_name,
                jobTitle: result.application.job.job_title,
                organizationName: result.application.job.organization.name,
            })
                .then((emailResult) => {
                if (emailResult.success) {
                    console.log('✅ Rejection email sent successfully');
                }
                else {
                    console.error('❌ Failed to send rejection email:', emailResult.error);
                }
            })
                .catch((error) => {
                console.error('❌ Error in rejection email process:', error.message);
            });
        }
        return (0, response_1.sendSuccess)(res, result);
    }
    catch (err) {
        console.error('Error rejecting interview:', err);
        return (0, response_1.sendError)(res, 'Failed to reject interview', 500);
    }
};
/**
 * ACCEPT INTERVIEW
 * PATCH /api/pipeline/interview/:interviewId/accept
 */
const acceptInterview = async (req, res) => {
    try {
        const { interviewId } = req.params;
        const interview = await prisma_config_1.default.interview.findUnique({
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
            return (0, response_1.sendError)(res, 'Interview not found', 404);
        }
        await prisma_config_1.default.$transaction(async (tx) => {
            await tx.interview.update({
                where: { interview_id: interviewId },
                data: { status: 'ACCEPTED' },
            });
            await tx.application.update({
                where: { application_id: interview.application_id },
                data: { status: 'OFFERED' },
            });
        });
        const result = await prisma_config_1.default.interview.findUnique({
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
        const applicantEmail = result.application.applicant.contact?.email;
        if (applicantEmail) {
            (0, emailService_1.sendOfferLetterEmail)({
                applicantEmail,
                applicantName: result.application.applicant.full_name,
                jobTitle: result.application.job.job_title,
                organizationName: result.application.job.organization.name,
            })
                .then((emailResult) => {
                if (emailResult.success) {
                    console.log('✅ Offer letter email sent successfully');
                }
                else {
                    console.error('❌ Failed to send offer email:', emailResult.error);
                }
            })
                .catch((error) => {
                console.error('❌ Error in offer email process:', error.message);
            });
        }
        return (0, response_1.sendSuccess)(res, result);
    }
    catch (err) {
        console.error('Error accepting interview:', err);
        return (0, response_1.sendError)(res, 'Failed to accept interview', 500);
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
const onboardCandidate = async (req, res) => {
    try {
        const { pipelineStageId } = req.params;
        const { start_date, end_date, employment_type, workers_comp_code } = req.body;
        if (!start_date || !employment_type) {
            return (0, response_1.sendError)(res, 'start_date and employment_type are required', 400);
        }
        if (!['W2', 'CONTRACTOR_1099'].includes(employment_type)) {
            return (0, response_1.sendError)(res, 'employment_type must be either W2 or CONTRACTOR_1099', 400);
        }
        // ✅ Parse as UTC consistently
        const startDate = toUTCDate(start_date);
        if (isNaN(startDate.getTime())) {
            return (0, response_1.sendError)(res, 'Invalid start_date format', 400);
        }
        let endDate = null;
        if (end_date) {
            endDate = toUTCDate(end_date);
            if (isNaN(endDate.getTime())) {
                return (0, response_1.sendError)(res, 'Invalid end_date format', 400);
            }
            if (endDate.getTime() <= startDate.getTime()) {
                return (0, response_1.sendError)(res, 'end_date must be after start_date', 400);
            }
        }
        const pipelineStage = await prisma_config_1.default.pipelineStage.findUnique({
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
            return (0, response_1.sendError)(res, 'Pipeline stage not found', 404);
        }
        const interview = await prisma_config_1.default.interview.findUnique({
            where: { application_id: pipelineStage.application_id },
        });
        if (!interview || interview.status !== 'ACCEPTED') {
            return (0, response_1.sendError)(res, 'Cannot onboard: Interview must be accepted first', 400);
        }
        const existingAssignment = await prisma_config_1.default.assignment.findUnique({
            where: { application_id: pipelineStage.application_id },
        });
        if (existingAssignment) {
            return (0, response_1.sendError)(res, 'Assignment already exists for this application', 400);
        }
        await prisma_config_1.default.$transaction(async (tx) => {
            await tx.pipelineStage.update({
                where: { pipeline_stage_id: pipelineStageId },
                data: { stage_name: 'ONBOARDED' },
            });
            await tx.application.update({
                where: { application_id: pipelineStage.application_id },
                data: { status: 'HIRED' },
            });
            await tx.applicant.update({
                where: { applicant_id: pipelineStage.application.applicant_id },
                data: { status: 'PLACED' },
            });
            await tx.assignment.create({
                data: {
                    application_id: pipelineStage.application_id,
                    // ✅ Use the pre-parsed UTC Date objects
                    start_date: startDate,
                    end_date: endDate,
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
        const applicantEmail = result.application.applicant.contact?.email;
        if (applicantEmail) {
            (0, emailService_1.sendOnboardingWelcomeEmail)({
                applicantEmail,
                applicantName: result.application.applicant.full_name,
                jobTitle: result.application.job.job_title,
                organizationName: result.application.job.organization.name,
                // ✅ Pass the pre-parsed UTC Date objects — email helper reads them correctly
                startDate,
                endDate,
                employmentType: employment_type,
                workersCompCode: workers_comp_code ?? null,
            })
                .then((emailResult) => {
                if (emailResult.success) {
                    console.log('✅ Onboarding welcome email sent successfully');
                }
                else {
                    console.error('❌ Failed to send onboarding email:', emailResult.error);
                }
            })
                .catch((error) => {
                console.error('❌ Error in onboarding email process:', error.message);
            });
        }
        return (0, response_1.sendSuccess)(res, result);
    }
    catch (err) {
        console.error('Error onboarding candidate:', err);
        return (0, response_1.sendError)(res, 'Failed to onboard candidate', 500);
    }
};
/**
 * Get pipeline stages by job
 * GET /api/pipeline/job/:jobId?stage=PIPELINED
 */
const getPipelineByJob = async (req, res) => {
    try {
        const { jobId } = req.params;
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
        const skip = (page - 1) * limit;
        const stage = req.query.stage;
        const whereClause = {
            application: {
                job_id: jobId
            }
        };
        if (stage && ['PIPELINED', 'INTERVIEWED', 'ONBOARDED'].includes(stage.toUpperCase())) {
            whereClause.stage_name = stage.toUpperCase();
        }
        const [pipelineStages, total] = await Promise.all([
            prisma_config_1.default.pipelineStage.findMany({
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
            prisma_config_1.default.pipelineStage.count({ where: whereClause }),
        ]);
        return (0, response_1.sendSuccess)(res, {
            data: pipelineStages,
            paging: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        });
    }
    catch (err) {
        console.error('Error fetching pipeline by job:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch pipeline', 500);
    }
};
/**
 * Get pipeline statistics
 * GET /api/pipeline/stats
 */
const getPipelineStats = async (req, res) => {
    try {
        const [pipelineStages, totalCandidates] = await Promise.all([
            prisma_config_1.default.pipelineStage.groupBy({
                by: ['stage_name'],
                _count: {
                    pipeline_stage_id: true,
                },
            }),
            prisma_config_1.default.pipelineStage.count(),
        ]);
        const allStages = ['PIPELINED', 'INTERVIEWED', 'ONBOARDED'];
        const formattedStats = allStages.map((stageName) => {
            const stat = pipelineStages.find((s) => s.stage_name === stageName);
            return {
                stage: stageName,
                count: stat ? stat._count.pipeline_stage_id : 0,
            };
        });
        return (0, response_1.sendSuccess)(res, {
            total_candidates: totalCandidates,
            by_stage: formattedStats,
        });
    }
    catch (err) {
        console.error('Error fetching pipeline stats:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch pipeline statistics', 500);
    }
};
/**
 * Get complete pipeline overview with interview status
 * GET /api/pipeline/:pipelineStageId/overview
 */
const getPipelineOverview = async (req, res) => {
    try {
        const { pipelineStageId } = req.params;
        const pipelineStage = await prisma_config_1.default.pipelineStage.findUnique({
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
            return (0, response_1.sendError)(res, 'Pipeline stage not found', 404);
        }
        return (0, response_1.sendSuccess)(res, pipelineStage);
    }
    catch (err) {
        console.error('Error fetching pipeline overview:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch pipeline overview', 500);
    }
};
/**
 * GET PIPELINE STAGES BY INTERVIEW STATUS
 * GET /api/pipeline/filter-by-interview-status?status=PENDING&page=1&limit=10
 */
const getPipelineByInterviewStatus = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
        const skip = (page - 1) * limit;
        const status = req.query.status;
        const validStatuses = ['PENDING', 'COMPLETED_RESULT_PENDING', 'REJECTED', 'ACCEPTED'];
        if (!status || !validStatuses.includes(status.toUpperCase())) {
            return (0, response_1.sendError)(res, 'Invalid or missing interview status. Valid values: PENDING, COMPLETED_RESULT_PENDING, REJECTED, ACCEPTED', 400);
        }
        const whereClause = {
            application: {
                interviews: {
                    some: {
                        status: status.toUpperCase(),
                    },
                },
            },
        };
        const [pipelineStages, total] = await Promise.all([
            prisma_config_1.default.pipelineStage.findMany({
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
            prisma_config_1.default.pipelineStage.count({ where: whereClause }),
        ]);
        return (0, response_1.sendSuccess)(res, {
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
    }
    catch (err) {
        console.error('Error fetching pipeline by interview status:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch pipeline stages', 500);
    }
};
/**
 * SEARCH PIPELINED APPLICANTS
 * GET /api/pipeline/search?query=john&page=1&limit=10
 */
const searchPipelinedApplicants = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
        const skip = (page - 1) * limit;
        const query = req.query.query;
        if (!query || query.trim().length === 0) {
            return (0, response_1.sendError)(res, 'Search query is required', 400);
        }
        const searchTerm = query.trim();
        const whereClause = {
            application: {
                OR: [
                    {
                        job: {
                            organization: {
                                name: { contains: searchTerm, mode: 'insensitive' },
                            },
                        },
                    },
                    {
                        job: {
                            job_title: { contains: searchTerm, mode: 'insensitive' },
                        },
                    },
                    {
                        applicant: {
                            full_name: { contains: searchTerm, mode: 'insensitive' },
                        },
                    },
                    {
                        applicant: {
                            contact: {
                                email: { contains: searchTerm, mode: 'insensitive' },
                            },
                        },
                    },
                ],
            },
        };
        const [pipelineStages, total] = await Promise.all([
            prisma_config_1.default.pipelineStage.findMany({
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
            prisma_config_1.default.pipelineStage.count({ where: whereClause }),
        ]);
        return (0, response_1.sendSuccess)(res, {
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
    }
    catch (err) {
        console.error('Error searching pipelined applicants:', err);
        return (0, response_1.sendError)(res, 'Failed to search applicants', 500);
    }
};
// Export controller
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