"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.clientOfficePipelineController = void 0;
const prisma_config_1 = __importDefault(require("../../prisma.config"));
const response_1 = require("../../utils/response");
// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Get all organization IDs the authenticated user belongs to.
// Throws a 401 if no user on request, returns empty array if no orgs found.
// ─────────────────────────────────────────────────────────────────────────────
const getUserOrgIds = async (req) => {
    const userId = req.user?.user_id;
    if (!userId)
        throw new Error('UNAUTHORIZED');
    const orgUsers = await prisma_config_1.default.organizationUser.findMany({
        where: { user_id: userId },
        select: { organization_id: true },
    });
    return orgUsers.map((o) => o.organization_id);
};
// ─────────────────────────────────────────────────────────────────────────────
// SHARED INCLUDE — identical shape to pipelineController so frontend
// can reuse the same response-parsing logic.
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
// RESHAPE — mirrors pipelineController so frontend gets the same shape
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
// SCOPING HELPER: Build a Prisma where-clause that restricts pipeline stages
// to jobs belonging to the user's organizations.
// ─────────────────────────────────────────────────────────────────────────────
const orgScopedWhere = (orgIds, extra = {}) => ({
    ...extra,
    application: {
        ...extra.application,
        job: {
            ...(extra.application?.job ?? {}),
            organization_id: { in: orgIds },
        },
    },
});
// ─────────────────────────────────────────────────────────────────────────────
// GET ALL PIPELINE STAGES (org-scoped)
// GET /api/clientOffice/pipeline?stage=PIPELINED&page=1&limit=10
// ─────────────────────────────────────────────────────────────────────────────
const getAllPipelineStages = async (req, res) => {
    try {
        const orgIds = await getUserOrgIds(req).catch(() => null);
        if (!orgIds)
            return (0, response_1.sendError)(res, 'Unauthorized', 401);
        if (!orgIds.length)
            return (0, response_1.sendSuccess)(res, { data: [], paging: { total: 0, page: 1, limit: 10, totalPages: 0 } });
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
        const skip = (page - 1) * limit;
        const stage = req.query.stage;
        const stageFilter = {};
        if (stage && ['PIPELINED', 'INTERVIEWED', 'ONBOARDED'].includes(stage.toUpperCase())) {
            stageFilter.stage_name = stage.toUpperCase();
        }
        const where = orgScopedWhere(orgIds, stageFilter);
        const [pipelineStages, total] = await Promise.all([
            prisma_config_1.default.pipelineStage.findMany({
                where, skip, take: limit,
                orderBy: { pipeline_date: 'desc' },
                include: pipelineInclude,
            }),
            prisma_config_1.default.pipelineStage.count({ where }),
        ]);
        return (0, response_1.sendSuccess)(res, {
            data: pipelineStages.map(reshapePipelineStage),
            paging: { total, page, limit, totalPages: Math.ceil(total / limit) },
        });
    }
    catch (err) {
        console.error('[clientOffice] getAllPipelineStages:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch pipeline stages', 500);
    }
};
// ─────────────────────────────────────────────────────────────────────────────
// GET PIPELINE BY JOB (org-scoped)
// GET /api/clientOffice/pipeline/job/:jobId?stage=PIPELINED
// ─────────────────────────────────────────────────────────────────────────────
const getPipelineByJob = async (req, res) => {
    try {
        const orgIds = await getUserOrgIds(req).catch(() => null);
        if (!orgIds)
            return (0, response_1.sendError)(res, 'Unauthorized', 401);
        if (!orgIds.length)
            return (0, response_1.sendSuccess)(res, { data: [], paging: { total: 0, page: 1, limit: 10, totalPages: 0 } });
        const { jobId } = req.params;
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
        const skip = (page - 1) * limit;
        const stage = req.query.stage;
        const stageFilter = {};
        if (stage && ['PIPELINED', 'INTERVIEWED', 'ONBOARDED'].includes(stage.toUpperCase())) {
            stageFilter.stage_name = stage.toUpperCase();
        }
        // Verify the job actually belongs to one of the user's orgs
        const job = await prisma_config_1.default.job.findFirst({
            where: { job_id: jobId, organization_id: { in: orgIds } },
            select: { job_id: true },
        });
        if (!job)
            return (0, response_1.sendError)(res, 'Job not found or access denied', 404);
        const where = orgScopedWhere(orgIds, {
            ...stageFilter,
            application: { job_id: jobId },
        });
        const [pipelineStages, total] = await Promise.all([
            prisma_config_1.default.pipelineStage.findMany({
                where, skip, take: limit,
                orderBy: { pipeline_date: 'desc' },
                include: pipelineInclude,
            }),
            prisma_config_1.default.pipelineStage.count({ where }),
        ]);
        return (0, response_1.sendSuccess)(res, {
            data: pipelineStages.map(reshapePipelineStage),
            paging: { total, page, limit, totalPages: Math.ceil(total / limit) },
        });
    }
    catch (err) {
        console.error('[clientOffice] getPipelineByJob:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch pipeline', 500);
    }
};
// ─────────────────────────────────────────────────────────────────────────────
// GET PIPELINE OVERVIEW (org-scoped)
// GET /api/clientOffice/pipeline/:pipelineStageId/overview
// ─────────────────────────────────────────────────────────────────────────────
const getPipelineOverview = async (req, res) => {
    try {
        const orgIds = await getUserOrgIds(req).catch(() => null);
        if (!orgIds)
            return (0, response_1.sendError)(res, 'Unauthorized', 401);
        const { pipelineStageId } = req.params;
        const ps = await prisma_config_1.default.pipelineStage.findFirst({
            where: {
                pipeline_stage_id: pipelineStageId,
                application: { job: { organization_id: { in: orgIds } } },
            },
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
            return (0, response_1.sendError)(res, 'Pipeline stage not found or access denied', 404);
        return (0, response_1.sendSuccess)(res, ps);
    }
    catch (err) {
        console.error('[clientOffice] getPipelineOverview:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch pipeline overview', 500);
    }
};
// ─────────────────────────────────────────────────────────────────────────────
// GET PIPELINE STATS (org-scoped)
// GET /api/clientOffice/pipeline/stats
// ─────────────────────────────────────────────────────────────────────────────
const getPipelineStats = async (req, res) => {
    try {
        const orgIds = await getUserOrgIds(req).catch(() => null);
        if (!orgIds)
            return (0, response_1.sendError)(res, 'Unauthorized', 401);
        if (!orgIds.length) {
            return (0, response_1.sendSuccess)(res, {
                total_candidates: 0,
                by_stage: [
                    { stage: 'PIPELINED', count: 0 },
                    { stage: 'INTERVIEWED', count: 0 },
                    { stage: 'ONBOARDED', count: 0 },
                ],
            });
        }
        const where = orgScopedWhere(orgIds);
        const [grouped, total] = await Promise.all([
            prisma_config_1.default.pipelineStage.groupBy({
                by: ['stage_name'],
                where,
                _count: { pipeline_stage_id: true },
            }),
            prisma_config_1.default.pipelineStage.count({ where }),
        ]);
        const by_stage = ['PIPELINED', 'INTERVIEWED', 'ONBOARDED'].map((s) => ({
            stage: s,
            count: grouped.find((g) => g.stage_name === s)?._count.pipeline_stage_id ?? 0,
        }));
        return (0, response_1.sendSuccess)(res, { total_candidates: total, by_stage });
    }
    catch (err) {
        console.error('[clientOffice] getPipelineStats:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch pipeline statistics', 500);
    }
};
// ─────────────────────────────────────────────────────────────────────────────
// GET PIPELINE BY INTERVIEW STATUS (org-scoped)
// GET /api/clientOffice/pipeline/filter-by-interview-status?status=PENDING
// ─────────────────────────────────────────────────────────────────────────────
const getPipelineByInterviewStatus = async (req, res) => {
    try {
        const orgIds = await getUserOrgIds(req).catch(() => null);
        if (!orgIds)
            return (0, response_1.sendError)(res, 'Unauthorized', 401);
        if (!orgIds.length)
            return (0, response_1.sendSuccess)(res, { data: [], paging: { total: 0, page: 1, limit: 10, totalPages: 0 } });
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
        const skip = (page - 1) * limit;
        const status = req.query.status;
        const VALID_STATUSES = ['PENDING', 'COMPLETED_RESULT_PENDING', 'REJECTED', 'ACCEPTED'];
        if (!status || !VALID_STATUSES.includes(status.toUpperCase())) {
            return (0, response_1.sendError)(res, 'Invalid or missing interview status.', 400);
        }
        const where = orgScopedWhere(orgIds, {
            application: {
                interviews: { some: { status: status.toUpperCase() } },
            },
        });
        const [pipelineStages, total] = await Promise.all([
            prisma_config_1.default.pipelineStage.findMany({
                where, skip, take: limit,
                orderBy: { pipeline_date: 'desc' },
                include: pipelineInclude,
            }),
            prisma_config_1.default.pipelineStage.count({ where }),
        ]);
        return (0, response_1.sendSuccess)(res, {
            data: pipelineStages.map(reshapePipelineStage),
            paging: { total, page, limit, totalPages: Math.ceil(total / limit) },
            filter: { interview_status: status.toUpperCase() },
        });
    }
    catch (err) {
        console.error('[clientOffice] getPipelineByInterviewStatus:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch pipeline stages', 500);
    }
};
// ─────────────────────────────────────────────────────────────────────────────
// SEARCH PIPELINED APPLICANTS (org-scoped)
// GET /api/clientOffice/pipeline/search?query=john
// ─────────────────────────────────────────────────────────────────────────────
const searchPipelinedApplicants = async (req, res) => {
    try {
        const orgIds = await getUserOrgIds(req).catch(() => null);
        if (!orgIds)
            return (0, response_1.sendError)(res, 'Unauthorized', 401);
        if (!orgIds.length)
            return (0, response_1.sendSuccess)(res, { data: [], paging: { total: 0, page: 1, limit: 10, totalPages: 0 } });
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
        const skip = (page - 1) * limit;
        const query = req.query.query;
        if (!query?.trim())
            return (0, response_1.sendError)(res, 'Search query is required', 400);
        const term = query.trim();
        const where = {
            application: {
                job: { organization_id: { in: orgIds } },
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
                where, skip, take: limit,
                orderBy: { pipeline_date: 'desc' },
                include: pipelineInclude,
            }),
            prisma_config_1.default.pipelineStage.count({ where }),
        ]);
        return (0, response_1.sendSuccess)(res, {
            data: pipelineStages.map(reshapePipelineStage),
            paging: { total, page, limit, totalPages: Math.ceil(total / limit) },
            search: { query: term },
        });
    }
    catch (err) {
        console.error('[clientOffice] searchPipelinedApplicants:', err);
        return (0, response_1.sendError)(res, 'Failed to search applicants', 500);
    }
};
// ─────────────────────────────────────────────────────────────────────────────
// GET INTERVIEW BY APPLICATION (org-scoped)
// GET /api/clientOffice/pipeline/interview/application/:applicationId
// ─────────────────────────────────────────────────────────────────────────────
const getInterviewByApplication = async (req, res) => {
    try {
        const orgIds = await getUserOrgIds(req).catch(() => null);
        if (!orgIds)
            return (0, response_1.sendError)(res, 'Unauthorized', 401);
        const { applicationId } = req.params;
        // Verify application belongs to user's org
        const application = await prisma_config_1.default.application.findFirst({
            where: {
                application_id: applicationId,
                job: { organization_id: { in: orgIds } },
            },
            select: { application_id: true },
        });
        if (!application)
            return (0, response_1.sendError)(res, 'Application not found or access denied', 404);
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
            return (0, response_1.sendError)(res, 'No interviews found for this application', 404);
        return (0, response_1.sendSuccess)(res, { interviews });
    }
    catch (err) {
        console.error('[clientOffice] getInterviewByApplication:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch interview details', 500);
    }
};
// ─────────────────────────────────────────────────────────────────────────────
// GET JOBS (org-scoped)
// GET /api/clientOffice/pipeline/jobs?status=OPEN
// ─────────────────────────────────────────────────────────────────────────────
const getJobs = async (req, res) => {
    try {
        const orgIds = await getUserOrgIds(req).catch(() => null);
        if (!orgIds)
            return (0, response_1.sendError)(res, 'Unauthorized', 401);
        if (!orgIds.length)
            return (0, response_1.sendSuccess)(res, { data: [], paging: { total: 0, page: 1, limit: 10, totalPages: 0 } });
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
        const skip = (page - 1) * limit;
        const status = req.query.status;
        const VALID_STATUSES = ['DRAFT', 'PENDING', 'OPEN', 'CLOSED', 'DECLINED'];
        const where = { organization_id: { in: orgIds } };
        if (status && VALID_STATUSES.includes(status.toUpperCase())) {
            where.status = status.toUpperCase();
        }
        const [jobs, total] = await Promise.all([
            prisma_config_1.default.job.findMany({
                where, skip, take: limit,
                orderBy: { created_at: 'desc' },
                include: {
                    organization: { select: { organization_id: true, name: true } },
                    job_detail: true,
                    job_owners: { include: { user: { select: { user_id: true, name: true, email: true } } } },
                    job_rates: true,
                    company_office: true,
                    _count: { select: { applications: true } },
                },
            }),
            prisma_config_1.default.job.count({ where }),
        ]);
        return (0, response_1.sendSuccess)(res, {
            data: jobs,
            paging: { total, page, limit, totalPages: Math.ceil(total / limit) },
        });
    }
    catch (err) {
        console.error('[clientOffice] getJobs:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch jobs', 500);
    }
};
// ─────────────────────────────────────────────────────────────────────────────
// GET APPLICANTS (org-scoped — applicants who have applied to org's jobs)
// GET /api/clientOffice/pipeline/applicants?status=SHORTLISTED
// ─────────────────────────────────────────────────────────────────────────────
const getApplicants = async (req, res) => {
    try {
        const orgIds = await getUserOrgIds(req).catch(() => null);
        if (!orgIds)
            return (0, response_1.sendError)(res, 'Unauthorized', 401);
        if (!orgIds.length)
            return (0, response_1.sendSuccess)(res, { data: [], paging: { total: 0, page: 1, limit: 10, totalPages: 0 } });
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
        const skip = (page - 1) * limit;
        const status = req.query.status;
        const VALID_STATUSES = ['APPLIED', 'PLACED', 'REJECTED', 'SHORTLISTED', 'INTERVIEWING'];
        const applicantWhere = {};
        if (status && VALID_STATUSES.includes(status.toUpperCase())) {
            applicantWhere.status = status.toUpperCase();
        }
        // Only applicants who have an application linked to one of the user's org's jobs
        applicantWhere.applications = {
            some: { job: { organization_id: { in: orgIds } } },
        };
        const [applicants, total] = await Promise.all([
            prisma_config_1.default.applicant.findMany({
                where: applicantWhere, skip, take: limit,
                orderBy: { created_at: 'desc' },
                include: {
                    contact: true,
                    documents: { orderBy: { created_at: 'desc' }, take: 5 },
                    applications: {
                        where: { job: { organization_id: { in: orgIds } } },
                        include: {
                            job: { select: { job_id: true, job_title: true, organization: { select: { name: true } } } },
                            pipeline_stages: { select: { stage_name: true, pipeline_date: true } },
                        },
                    },
                },
            }),
            prisma_config_1.default.applicant.count({ where: applicantWhere }),
        ]);
        return (0, response_1.sendSuccess)(res, {
            data: applicants,
            paging: { total, page, limit, totalPages: Math.ceil(total / limit) },
        });
    }
    catch (err) {
        console.error('[clientOffice] getApplicants:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch applicants', 500);
    }
};
// ─────────────────────────────────────────────────────────────────────────────
// GET ASSIGNMENTS (org-scoped)
// GET /api/clientOffice/pipeline/assignments
// ─────────────────────────────────────────────────────────────────────────────
const getAssignments = async (req, res) => {
    try {
        const orgIds = await getUserOrgIds(req).catch(() => null);
        if (!orgIds)
            return (0, response_1.sendError)(res, 'Unauthorized', 401);
        if (!orgIds.length)
            return (0, response_1.sendSuccess)(res, { data: [], paging: { total: 0, page: 1, limit: 10, totalPages: 0 } });
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
        const skip = (page - 1) * limit;
        const where = {
            application: {
                job: { organization_id: { in: orgIds } },
            },
        };
        const [assignments, total] = await Promise.all([
            prisma_config_1.default.assignment.findMany({
                where, skip, take: limit,
                orderBy: { created_at: 'desc' },
                include: {
                    application: {
                        include: {
                            applicant: {
                                select: {
                                    applicant_id: true, full_name: true, status: true,
                                    contact: { select: { email: true, phone: true } },
                                },
                            },
                            job: {
                                select: {
                                    job_id: true, job_title: true,
                                    organization: { select: { organization_id: true, name: true } },
                                    job_rates: true,
                                },
                            },
                        },
                    },
                },
            }),
            prisma_config_1.default.assignment.count({ where }),
        ]);
        return (0, response_1.sendSuccess)(res, {
            data: assignments,
            paging: { total, page, limit, totalPages: Math.ceil(total / limit) },
        });
    }
    catch (err) {
        console.error('[clientOffice] getAssignments:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch assignments', 500);
    }
};
// ─────────────────────────────────────────────────────────────────────────────
// GET ORGANIZATIONS THE USER BELONGS TO
// GET /api/clientOffice/pipeline/my-organizations
// ─────────────────────────────────────────────────────────────────────────────
const getMyOrganizations = async (req, res) => {
    try {
        const userId = req.user?.user_id;
        if (!userId)
            return (0, response_1.sendError)(res, 'Unauthorized', 401);
        const orgUsers = await prisma_config_1.default.organizationUser.findMany({
            where: { user_id: userId },
            include: {
                organization: {
                    include: {
                        addresses: true,
                        contacts: true,
                        company_offices: true,
                        _count: { select: { jobs: true } },
                    },
                },
            },
        });
        const organizations = orgUsers.map((ou) => ({
            ...ou.organization,
            user_meta: {
                division: ou.division,
                department: ou.department,
                title: ou.title,
                work_phone: ou.work_phone,
            },
        }));
        return (0, response_1.sendSuccess)(res, { data: organizations });
    }
    catch (err) {
        console.error('[clientOffice] getMyOrganizations:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch organizations', 500);
    }
};
// ─────────────────────────────────────────────────────────────────────────────
// EXPORT
// ─────────────────────────────────────────────────────────────────────────────
exports.clientOfficePipelineController = {
    getAllPipelineStages,
    getPipelineByJob,
    getPipelineOverview,
    getPipelineStats,
    getPipelineByInterviewStatus,
    searchPipelinedApplicants,
    getInterviewByApplication,
    getJobs,
    getApplicants,
    getAssignments,
    getMyOrganizations,
};
//# sourceMappingURL=pipelineClientController.js.map