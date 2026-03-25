"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.applicationController = void 0;
const prisma_config_1 = __importDefault(require("../../prisma.config"));
const crudFactory_1 = require("../../factories/crudFactory");
const schemas_1 = require("../../validators/schemas");
const response_1 = require("../../utils/response");
/**
 * Application Controller - Custom CRUD for Application management
 * Provides: GET all, GET by id, GET by job, GET by applicant, GET by status, POST, PATCH, DELETE
 *
 * Validation Rules:
 * - job_id: Required UUID
 * - applicant_id: Required UUID
 * - source: Optional string (application source)
 * - status: APPLIED, SCREENED, OFFERED, HIRED (default: APPLIED)
 * - applied_at: Auto-generated timestamp
 *
 * Business Context: Manages job applications linking applicants to jobs
 * Includes pipeline stages, interviews, assignments, and AI evaluations
 */
// Generate base CRUD methods
const baseCrudMethods = (0, crudFactory_1.createCrudController)({
    model: prisma_config_1.default.application,
    modelName: 'Application',
    idField: 'application_id',
    createSchema: schemas_1.createApplicationSchema,
    updateSchema: schemas_1.updateApplicationSchema,
    defaultLimit: 10,
    maxLimit: 100,
});
/**
 * Override getAll to include necessary relationships for table view
 * GET /api/applications
 */
const getAllApplications = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
        const skip = (page - 1) * limit;
        const [applications, total] = await Promise.all([
            prisma_config_1.default.application.findMany({
                skip,
                take: limit,
                orderBy: { applied_at: 'desc' },
                include: {
                    job: {
                        select: {
                            job_id: true,
                            job_title: true,
                            status: true,
                            job_type: true,
                            location: true,
                            organization: {
                                select: {
                                    organization_id: true,
                                    name: true,
                                    website: true,
                                },
                            },
                        },
                    },
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
                    evaluations: {
                        select: {
                            ai_score: true,
                            evaluated_at: true,
                        },
                    },
                },
            }),
            prisma_config_1.default.application.count(),
        ]);
        return (0, response_1.sendSuccess)(res, {
            data: applications,
            paging: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        });
    }
    catch (err) {
        console.error('Error fetching applications:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch applications', 500);
    }
};
/**
 * Override getById to include full related data
 * GET /api/applications/:id
 */
const getApplicationById = async (req, res) => {
    try {
        const { id } = req.params;
        if (!id) {
            return (0, response_1.sendError)(res, 'Application ID is required', 400);
        }
        const application = await prisma_config_1.default.application.findUnique({
            where: { application_id: id },
            include: {
                job: {
                    include: {
                        organization: {
                            select: {
                                organization_id: true,
                                name: true,
                                website: true,
                            },
                        },
                        job_detail: true,
                    },
                },
                applicant: {
                    include: {
                        contact: true,
                        demographic: true,
                        documents: {
                            where: {
                                application_id: id, // Only documents for THIS application
                            },
                        },
                        social_profiles: true,
                        work_history: {
                            where: {
                                application_id: id, // Only work history for THIS application
                            },
                        },
                    },
                },
                interviews: {
                    orderBy: { interview_date: 'desc' },
                },
                pipeline_stages: {
                    orderBy: { pipeline_date: 'desc' },
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
                assignment: true,
                evaluations: true,
            },
        });
        if (!application) {
            return (0, response_1.sendError)(res, 'Application not found', 404);
        }
        return (0, response_1.sendSuccess)(res, application);
    }
    catch (err) {
        console.error('Error fetching application:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch application', 500);
    }
};
/**
 * Get all applications for a specific job
 * GET /api/applications/job/:jobId
 */
const getApplicationsByJob = async (req, res) => {
    try {
        const { jobId } = req.params;
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
        const skip = (page - 1) * limit;
        const status = req.query.status;
        if (!jobId) {
            return (0, response_1.sendError)(res, 'Job ID is required', 400);
        }
        const whereClause = { job_id: jobId };
        if (status) {
            whereClause.status = status;
        }
        const [applications, total] = await Promise.all([
            prisma_config_1.default.application.findMany({
                where: whereClause,
                skip,
                take: limit,
                orderBy: { applied_at: 'desc' },
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
                                },
                            },
                        },
                    },
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
                    pipeline_stages: {
                        orderBy: { pipeline_date: 'desc' },
                        take: 1,
                    },
                    evaluations: {
                        select: {
                            ai_score: true,
                            evaluated_at: true,
                        },
                    },
                },
            }),
            prisma_config_1.default.application.count({ where: whereClause }),
        ]);
        return (0, response_1.sendSuccess)(res, {
            data: applications,
            paging: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        });
    }
    catch (err) {
        console.error('Error fetching applications by job:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch applications', 500);
    }
};
/**
 * Get all applications for a specific applicant
 * GET /api/applications/applicant/:applicantId
 */
const getApplicationsByApplicant = async (req, res) => {
    try {
        const { applicantId } = req.params;
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
        const skip = (page - 1) * limit;
        if (!applicantId) {
            return (0, response_1.sendError)(res, 'Applicant ID is required', 400);
        }
        const [applications, total] = await Promise.all([
            prisma_config_1.default.application.findMany({
                where: {
                    applicant_id: applicantId,
                },
                skip,
                take: limit,
                orderBy: { applied_at: 'desc' },
                include: {
                    job: {
                        select: {
                            job_id: true,
                            job_title: true,
                            status: true,
                            job_type: true,
                            location: true,
                            organization: {
                                select: {
                                    organization_id: true,
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
                    pipeline_stages: {
                        orderBy: { pipeline_date: 'desc' },
                        take: 1,
                    },
                    evaluations: {
                        select: {
                            ai_score: true,
                            evaluated_at: true,
                        },
                    },
                },
            }),
            prisma_config_1.default.application.count({
                where: {
                    applicant_id: applicantId,
                },
            }),
        ]);
        return (0, response_1.sendSuccess)(res, {
            data: applications,
            paging: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        });
    }
    catch (err) {
        console.error('Error fetching applications by applicant:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch applications', 500);
    }
};
/**
 * Get applications by status
 * GET /api/applications/status/:status
 */
const getApplicationsByStatus = async (req, res) => {
    try {
        const { status } = req.params;
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
        const skip = (page - 1) * limit;
        if (!status) {
            return (0, response_1.sendError)(res, 'Status is required', 400);
        }
        // Validate status enum
        const validStatuses = ['APPLIED', 'SCREENED', 'OFFERED', 'HIRED'];
        if (!validStatuses.includes(status.toUpperCase())) {
            return (0, response_1.sendError)(res, `Invalid status. Must be one of: ${validStatuses.join(', ')}`, 400);
        }
        const [applications, total] = await Promise.all([
            prisma_config_1.default.application.findMany({
                where: {
                    status: status.toUpperCase(),
                },
                skip,
                take: limit,
                orderBy: { applied_at: 'desc' },
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
                    evaluations: {
                        select: {
                            ai_score: true,
                            evaluated_at: true,
                        },
                    },
                },
            }),
            prisma_config_1.default.application.count({
                where: {
                    status: status.toUpperCase(),
                },
            }),
        ]);
        return (0, response_1.sendSuccess)(res, {
            data: applications,
            paging: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        });
    }
    catch (err) {
        console.error('Error fetching applications by status:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch applications', 500);
    }
};
/**
 * Search applications by job title, applicant name, organization name, or work history
 * GET /api/applications/search?q=searchTerm
 * Query params:
 * - q: search term (required) - searches in job title, organization name, applicant name, work history title, and work history description
 * - page: page number (optional, default: 1)
 * - limit: items per page (optional, default: 10, max: 100)
 * - status: filter by application status (optional)
 */
const searchApplications = async (req, res) => {
    try {
        const searchTerm = req.query.q;
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
        const skip = (page - 1) * limit;
        const status = req.query.status;
        if (!searchTerm || searchTerm.trim() === '') {
            return (0, response_1.sendError)(res, 'Search term (q) is required', 400);
        }
        // Build where clause for search
        const whereClause = {
            OR: [
                {
                    job: {
                        job_title: {
                            contains: searchTerm,
                            mode: 'insensitive',
                        },
                    },
                },
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
                {
                    applicant: {
                        full_name: {
                            contains: searchTerm,
                            mode: 'insensitive',
                        },
                    },
                },
                {
                    work_history: {
                        some: {
                            title: {
                                contains: searchTerm,
                                mode: 'insensitive',
                            },
                        },
                    },
                },
                {
                    work_history: {
                        some: {
                            description: {
                                contains: searchTerm,
                                mode: 'insensitive',
                            },
                        },
                    },
                },
            ],
        };
        // Add status filter if provided
        if (status) {
            const validStatuses = ['APPLIED', 'SCREENED', 'OFFERED', 'HIRED'];
            if (!validStatuses.includes(status.toUpperCase())) {
                return (0, response_1.sendError)(res, `Invalid status. Must be one of: ${validStatuses.join(', ')}`, 400);
            }
            whereClause.status = status.toUpperCase();
        }
        const [applications, total] = await Promise.all([
            prisma_config_1.default.application.findMany({
                where: whereClause,
                skip,
                take: limit,
                orderBy: { applied_at: 'desc' },
                include: {
                    job: {
                        select: {
                            job_id: true,
                            job_title: true,
                            status: true,
                            job_type: true,
                            location: true,
                            organization: {
                                select: {
                                    organization_id: true,
                                    name: true,
                                    website: true,
                                },
                            },
                        },
                    },
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
                    work_history: {
                        select: {
                            applicant_work_history_id: true,
                            title: true,
                            description: true,
                            created_at: true,
                        },
                    },
                    evaluations: {
                        select: {
                            ai_score: true,
                            evaluated_at: true,
                        },
                    },
                },
            }),
            prisma_config_1.default.application.count({ where: whereClause }),
        ]);
        return (0, response_1.sendSuccess)(res, {
            data: applications,
            paging: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
            search: {
                term: searchTerm,
                status: status || null,
            },
        });
    }
    catch (err) {
        console.error('Error searching applications:', err);
        return (0, response_1.sendError)(res, 'Failed to search applications', 500);
    }
};
/**
 * Get dropdown data for filtering applications
 * Returns all unique job titles and organizations with their IDs
 * GET /api/applications/dropdown-data
 */
const getApplicationsDropdownData = async (req, res) => {
    try {
        // Get all unique jobs with their organizations
        const jobs = await prisma_config_1.default.job.findMany({
            distinct: ['job_id'],
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
            where: {
                applications: {
                    some: {}, // Only include jobs that have applications
                },
            },
            orderBy: {
                job_title: 'asc',
            },
        });
        // Get unique organizations
        const organizations = await prisma_config_1.default.organization.findMany({
            distinct: ['organization_id'],
            select: {
                organization_id: true,
                name: true,
            },
            where: {
                jobs: {
                    some: {
                        applications: {
                            some: {}, // Only include organizations with jobs that have applications
                        },
                    },
                },
            },
            orderBy: {
                name: 'asc',
            },
        });
        // Format jobs data
        const jobsData = jobs.map(job => ({
            job_id: job.job_id,
            job_title: job.job_title,
            organization_name: job.organization.name,
            organization_id: job.organization.organization_id,
        }));
        return (0, response_1.sendSuccess)(res, {
            jobs: jobsData,
            organizations: organizations,
        });
    }
    catch (err) {
        console.error('Error fetching dropdown data:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch dropdown data', 500);
    }
};
/**
 * Custom create method to check for duplicate applications
 * Prevents same applicant from applying to same job multiple times
 * POST /api/applications
 */
const createApplication = async (req, res) => {
    try {
        // Validate request body
        const validation = schemas_1.createApplicationSchema.safeParse(req.body);
        if (!validation.success) {
            const errors = validation.error.issues.map((err) => ({
                field: err.path.join('.'),
                message: err.message,
            }));
            return (0, response_1.sendError)(res, 'Validation failed', 400, errors);
        }
        const { job_id, applicant_id } = req.body;
        // Check for existing application
        const existingApplication = await prisma_config_1.default.application.findFirst({
            where: {
                job_id,
                applicant_id,
            },
        });
        if (existingApplication) {
            return (0, response_1.sendError)(res, 'Application already exists for this job and applicant', 409, [{
                    field: 'duplicate',
                    message: `Application already exists with application_id: ${existingApplication.application_id}`,
                }]);
        }
        // Create new application
        const application = await prisma_config_1.default.application.create({
            data: req.body,
            include: {
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
                applicant: {
                    select: {
                        applicant_id: true,
                        full_name: true,
                        contact: {
                            select: {
                                email: true,
                            },
                        },
                    },
                },
            },
        });
        return (0, response_1.sendSuccess)(res, application, 201);
    }
    catch (err) {
        console.error('Error creating application:', err);
        // Handle common Prisma errors
        if (err.code === 'P2003') {
            return (0, response_1.sendError)(res, 'Related job or applicant not found', 404);
        }
        return (0, response_1.sendError)(res, 'Failed to create application', 500);
    }
};
/**
 * Update application (PATCH)
 * Only allows updating source and status fields
 * PATCH /api/applications/:id
 */
const updateApplication = async (req, res) => {
    try {
        const { id } = req.params;
        if (!id) {
            return (0, response_1.sendError)(res, 'Application ID is required', 400);
        }
        // Validate request body
        const validation = schemas_1.updateApplicationSchema.safeParse(req.body);
        if (!validation.success) {
            const errors = validation.error.issues.map((err) => ({
                field: err.path.join('.'),
                message: err.message,
            }));
            return (0, response_1.sendError)(res, 'Validation failed', 400, errors);
        }
        // Check if application exists
        const existing = await prisma_config_1.default.application.findUnique({
            where: { application_id: id },
        });
        if (!existing) {
            return (0, response_1.sendError)(res, 'Application not found', 404);
        }
        // Only allow updating source and status
        const { source, status } = req.body;
        const updateData = {};
        if (source !== undefined)
            updateData.source = source;
        if (status !== undefined)
            updateData.status = status;
        const application = await prisma_config_1.default.application.update({
            where: { application_id: id },
            data: updateData,
            include: {
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
                applicant: {
                    select: {
                        applicant_id: true,
                        full_name: true,
                        contact: {
                            select: {
                                email: true,
                            },
                        },
                    },
                },
            },
        });
        return (0, response_1.sendSuccess)(res, application);
    }
    catch (err) {
        console.error('Error updating application:', err);
        return (0, response_1.sendError)(res, 'Failed to update application', 500);
    }
};
/**
 * Get application statistics for a job
 * GET /api/applications/job/:jobId/stats
 */
const getApplicationStatsByJob = async (req, res) => {
    try {
        const { jobId } = req.params;
        if (!jobId) {
            return (0, response_1.sendError)(res, 'Job ID is required', 400);
        }
        const stats = await prisma_config_1.default.application.groupBy({
            by: ['status'],
            where: {
                job_id: jobId,
            },
            _count: {
                application_id: true,
            },
        });
        const formattedStats = stats.map(stat => ({
            status: stat.status,
            count: stat._count.application_id,
        }));
        const total = formattedStats.reduce((sum, stat) => sum + stat.count, 0);
        return (0, response_1.sendSuccess)(res, {
            total,
            by_status: formattedStats,
        });
    }
    catch (err) {
        console.error('Error fetching application stats:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch application statistics', 500);
    }
};
/**
 * Get overall application statistics (all applications)
 * GET /api/applications/stats
 */
const getOverallStats = async (req, res) => {
    try {
        const stats = await prisma_config_1.default.application.groupBy({
            by: ['status'],
            _count: {
                application_id: true,
            },
        });
        const formattedStats = stats.map(stat => ({
            status: stat.status,
            count: stat._count.application_id,
        }));
        const total = formattedStats.reduce((sum, stat) => sum + stat.count, 0);
        return (0, response_1.sendSuccess)(res, {
            total,
            by_status: formattedStats,
        });
    }
    catch (err) {
        console.error('Error fetching overall stats:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch overall statistics', 500);
    }
};
/**
 * Get application detail with job info, notes, and applicant info
 * GET /api/applications/:id/detail
 * Returns: job_title, job_details, job_notes, applicant name, applicant work_history, applicant demographic
 */
const getApplicationDetail = async (req, res) => {
    try {
        const { id } = req.params;
        if (!id) {
            return (0, response_1.sendError)(res, 'Application ID is required', 400);
        }
        const application = await prisma_config_1.default.application.findUnique({
            where: { application_id: id },
            include: {
                job: {
                    select: {
                        job_id: true,
                        job_title: true,
                        job_category: true,
                        job_detail: {
                            select: {
                                job_detail_id: true,
                                description: true,
                                skills: true,
                            },
                        },
                        job_notes: {
                            select: {
                                job_note_id: true,
                                note: true,
                                created_at: true,
                            },
                            orderBy: { created_at: 'desc' },
                        },
                    },
                },
                applicant: {
                    select: {
                        applicant_id: true,
                        full_name: true,
                        status: true,
                        work_history: {
                            where: {
                                application_id: id, // Only work history for THIS application
                            },
                            select: {
                                applicant_work_history_id: true,
                                title: true,
                                description: true,
                                created_at: true,
                            },
                            orderBy: { created_at: 'desc' },
                        },
                        demographic: {
                            select: {
                                applicant_demo_id: true,
                                birth_date: true,
                                gender: true,
                                race: true,
                                disability: true,
                                work_authorization: true,
                                authorization_expiry: true,
                            },
                        },
                    },
                },
            },
        });
        if (!application) {
            return (0, response_1.sendError)(res, 'Application not found', 404);
        }
        // Format response with all requested details
        return (0, response_1.sendSuccess)(res, {
            application_id: application.application_id,
            job: {
                job_id: application.job.job_id,
                job_title: application.job.job_title,
                job_category: application.job.job_category,
                job_detail: application.job.job_detail,
                job_notes: application.job.job_notes,
            },
            applicant: {
                applicant_id: application.applicant.applicant_id,
                full_name: application.applicant.full_name,
                status: application.applicant.status,
                work_history: application.applicant.work_history,
                demographic: application.applicant.demographic,
            },
        });
    }
    catch (err) {
        console.error('Error fetching application detail:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch application detail', 500);
    }
};
// Export controller with custom methods
exports.applicationController = {
    ...baseCrudMethods,
    getAll: getAllApplications, // Override with proper includes
    getById: getApplicationById, // Override with full details
    create: createApplication, // Override with duplicate check
    update: updateApplication, // Override with field restrictions
    getApplicationsByJob, // Custom query by job
    getApplicationsByApplicant, // Custom query by applicant
    getApplicationsByStatus, // Custom query by status
    getApplicationStatsByJob, // Get statistics for a job
    getOverallStats, // NEW: Get overall statistics for all applications
    searchApplications, // NEW: Search applications by job title, applicant name, or organization
    getApplicationsDropdownData, // NEW: Get dropdown data for filtering
    getApplicationDetail, // NEW: Get application detail with job and applicant info
};
//# sourceMappingURL=applicationController.js.map