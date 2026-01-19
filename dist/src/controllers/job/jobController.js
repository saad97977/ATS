"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.jobController = void 0;
const prisma_config_1 = __importDefault(require("../../prisma.config"));
const crudFactory_1 = require("../../factories/crudFactory");
const schemas_1 = require("../../validators/schemas");
const response_1 = require("../../utils/response");
const zod_1 = require("zod");
const activityService_1 = require("../../services/activityService");
/**
 * Job Controller - Custom CRUD for Job management
 * Provides: GET all, GET by id, GET by organization, GET by status, POST, PATCH, DELETE
 *
 * Validation Rules:
 * - organization_id: Required UUID
 * - manager_id: Optional UUID
 * - job_title: Required string
 * - status: Enum (DRAFT, OPEN, CLOSED)
 * - job_type: Enum (TEMPORARY, PERMANENT)
 * - location: Required string
 * - approved: Boolean (default: false)
 *
 * Business Context: Manages job postings and their lifecycle
 */
// Generate base CRUD methods
const baseCrudMethods = (0, crudFactory_1.createCrudController)({
    model: prisma_config_1.default.job,
    modelName: 'Job',
    idField: 'job_id',
    createSchema: schemas_1.createJobSchema,
    updateSchema: schemas_1.updateJobSchema,
    defaultLimit: 10,
    maxLimit: 100,
});
/**
 * Custom create method with validation and duplicate check
 */
const createJob = async (req, res) => {
    try {
        // Validate request body
        const validation = schemas_1.createJobSchema.safeParse(req.body);
        if (!validation.success) {
            const errors = validation.error.issues.map((err) => ({
                field: err.path.join('.'),
                message: err.message,
            }));
            return (0, response_1.sendError)(res, 'Validation failed', 400, errors);
        }
        const { organization_id, manager_id, job_title } = req.body;
        // Check if organization exists
        const organization = await prisma_config_1.default.organization.findUnique({
            where: { organization_id },
        });
        if (!organization) {
            return (0, response_1.sendError)(res, 'Organization not found', 404);
        }
        // Check if manager exists (if provided)
        if (manager_id) {
            const manager = await prisma_config_1.default.user.findUnique({
                where: { user_id: manager_id },
            });
            if (!manager) {
                return (0, response_1.sendError)(res, 'Manager not found', 404);
            }
        }
        // Check for duplicate job (same title and organization)
        const existingJob = await prisma_config_1.default.job.findFirst({
            where: {
                organization_id,
                job_title,
                status: {
                    not: 'CLOSED',
                },
            },
        });
        if (existingJob) {
            return (0, response_1.sendError)(res, 'Active job with this title already exists for this organization', 409, [{
                    field: 'duplicate',
                    message: `Job already exists with job_id: ${existingJob.job_id}`,
                }]);
        }
        // Create new job
        const job = await prisma_config_1.default.job.create({
            data: req.body,
            include: {
                organization: {
                    select: {
                        organization_id: true,
                        name: true,
                        status: true,
                    },
                },
                manager: {
                    select: {
                        user_id: true,
                        name: true,
                        email: true,
                    },
                },
            },
        });
        return (0, response_1.sendSuccess)(res, job, 201);
    }
    catch (err) {
        console.error('Error creating job:', err);
        if (err.code === 'P2003') {
            return (0, response_1.sendError)(res, 'Related organization or manager not found', 404);
        }
        return (0, response_1.sendError)(res, 'Failed to create job', 500);
    }
};
/**
 * Override getById to include full related data
 * GET /api/jobs/:id
 */
const getJobById = async (req, res) => {
    try {
        const { id } = req.params;
        if (!id) {
            return (0, response_1.sendError)(res, 'Job ID is required', 400);
        }
        const job = await prisma_config_1.default.job.findUnique({
            where: { job_id: id },
            include: {
                organization: {
                    include: {
                        addresses: true,
                        contacts: true,
                    },
                },
                manager: {
                    select: {
                        user_id: true,
                        name: true,
                        email: true,
                    },
                },
                job_detail: true,
                job_owners: {
                    include: {
                        user: {
                            select: {
                                user_id: true,
                                name: true,
                                email: true,
                            },
                        },
                    },
                },
                job_notes: {
                    orderBy: { created_at: 'desc' },
                },
                job_postings: true,
                job_rates: true,
                applications: {
                    select: {
                        application_id: true,
                        status: true,
                        applied_at: true,
                    },
                },
            },
        });
        if (!job) {
            return (0, response_1.sendError)(res, 'Job not found', 404);
        }
        return (0, response_1.sendSuccess)(res, job);
    }
    catch (err) {
        console.error('Error fetching job:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch job', 500);
    }
};
/**
 * Get all jobs for a specific organization
 * GET /api/jobs/organization/:organizationId
 */
const getJobsByOrganization = async (req, res) => {
    try {
        const { organizationId } = req.params;
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
        const skip = (page - 1) * limit;
        if (!organizationId) {
            return (0, response_1.sendError)(res, 'Organization ID is required', 400);
        }
        const [jobs, total] = await Promise.all([
            prisma_config_1.default.job.findMany({
                where: {
                    organization_id: organizationId,
                },
                skip,
                take: limit,
                orderBy: { created_at: 'desc' },
                include: {
                    organization: {
                        select: {
                            organization_id: true,
                            name: true,
                            status: true,
                        },
                    },
                    manager: {
                        select: {
                            user_id: true,
                            name: true,
                            email: true,
                        },
                    },
                    job_detail: true,
                    created_by: {
                        select: {
                            user_id: true,
                        },
                    },
                    _count: {
                        select: {
                            applications: true,
                            job_owners: true,
                        },
                    },
                },
            }),
            prisma_config_1.default.job.count({
                where: {
                    organization_id: organizationId,
                },
            }),
        ]);
        // Transform the data to match the desired format
        const transformedJobs = jobs.map(job => ({
            job_id: job.job_id,
            job_title: job.job_title,
            status: job.status,
            job_type: job.job_type,
            location: job.location,
            approved: job.approved,
            days_active: job.days_active,
            days_inactive: job.days_inactive,
            start_date: job.start_date,
            end_date: job.end_date,
            created_at: job.created_at,
            organization_id: job.organization?.organization_id || null,
            organization_name: job.organization?.name || null,
            organization_status: job.organization?.status || null,
            manager_id: job.manager?.user_id || null,
            manager_name: job.manager?.name || 'N/A',
            manager_email: job.manager?.email || 'N/A',
            applications_count: job._count?.applications || 0,
            job_owners_count: job._count?.job_owners || 0,
            created_by_user_id: job.created_by?.user_id || null,
        }));
        return (0, response_1.sendSuccess)(res, {
            data: transformedJobs,
            paging: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        });
    }
    catch (err) {
        console.error('Error fetching jobs by organization:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch jobs', 500);
    }
};
/**
 * Get jobs by status
 * GET /api/jobs/status/:status
 */
const getJobsByStatus = async (req, res) => {
    try {
        const { status } = req.params;
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
        const skip = (page - 1) * limit;
        if (!status) {
            return (0, response_1.sendError)(res, 'Status is required', 400);
        }
        const [jobs, total] = await Promise.all([
            prisma_config_1.default.job.findMany({
                where: {
                    status: status.toUpperCase(),
                },
                skip,
                take: limit,
                orderBy: { created_at: 'desc' },
                include: {
                    organization: {
                        select: {
                            name: true,
                        },
                    },
                    manager: {
                        select: {
                            name: true,
                        },
                    },
                    _count: {
                        select: {
                            applications: true,
                        },
                    },
                },
            }),
            prisma_config_1.default.job.count({
                where: {
                    status: status.toUpperCase(),
                },
            }),
        ]);
        return (0, response_1.sendSuccess)(res, {
            data: jobs,
            paging: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        });
    }
    catch (err) {
        console.error('Error fetching jobs by status:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch jobs', 500);
    }
};
/**
 * Get jobs by type
 * GET /api/jobs/type/:type
 */
const getJobsByType = async (req, res) => {
    try {
        const { type } = req.params;
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
        const skip = (page - 1) * limit;
        if (!type) {
            return (0, response_1.sendError)(res, 'Type is required', 400);
        }
        const [jobs, total] = await Promise.all([
            prisma_config_1.default.job.findMany({
                where: {
                    job_type: type.toUpperCase(),
                },
                skip,
                take: limit,
                orderBy: { created_at: 'desc' },
                include: {
                    organization: {
                        select: {
                            name: true,
                        },
                    },
                    manager: {
                        select: {
                            name: true,
                        },
                    },
                },
            }),
            prisma_config_1.default.job.count({
                where: {
                    job_type: type.toUpperCase(),
                },
            }),
        ]);
        return (0, response_1.sendSuccess)(res, {
            data: jobs,
            paging: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        });
    }
    catch (err) {
        console.error('Error fetching jobs by type:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch jobs', 500);
    }
};
/**
 * Get jobs by manager
 * GET /api/jobs/manager/:managerId
 */
/**
 * Get jobs by manager
 * GET /api/jobs/manager/:managerId?approved=true/false
 */
const getJobsByManager = async (req, res) => {
    try {
        const { managerId } = req.params;
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
        const skip = (page - 1) * limit;
        // Get the approved filter from query params
        const approvedQuery = req.query.approved;
        if (!managerId) {
            return (0, response_1.sendError)(res, 'Manager ID is required', 400);
        }
        // Build the where clause
        const whereClause = {
            manager_id: managerId,
        };
        // Add approved filter if provided
        if (approvedQuery !== undefined) {
            if (approvedQuery === 'true') {
                whereClause.approved = true;
            }
            else if (approvedQuery === 'false') {
                whereClause.approved = false;
            }
            // If approvedQuery is neither 'true' nor 'false', ignore it (fetch all)
        }
        const [jobs, total] = await Promise.all([
            prisma_config_1.default.job.findMany({
                where: whereClause,
                skip,
                take: limit,
                orderBy: { created_at: 'desc' },
                include: {
                    organization: {
                        select: {
                            name: true,
                        },
                    },
                    job_detail: true,
                },
            }),
            prisma_config_1.default.job.count({
                where: whereClause,
            }),
        ]);
        return (0, response_1.sendSuccess)(res, {
            data: jobs,
            paging: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        });
    }
    catch (err) {
        console.error('Error fetching jobs by manager:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch jobs', 500);
    }
};
/**
 * Get approved jobs
 * GET /api/jobs/approved
 */
const getApprovedJobs = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
        const skip = (page - 1) * limit;
        const [jobs, total] = await Promise.all([
            prisma_config_1.default.job.findMany({
                where: {
                    approved: true,
                },
                skip,
                take: limit,
                orderBy: { created_at: 'desc' },
                include: {
                    organization: {
                        select: {
                            name: true,
                        },
                    },
                    manager: {
                        select: {
                            name: true,
                        },
                    },
                },
            }),
            prisma_config_1.default.job.count({
                where: {
                    approved: true,
                },
            }),
        ]);
        return (0, response_1.sendSuccess)(res, {
            data: jobs,
            paging: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        });
    }
    catch (err) {
        console.error('Error fetching approved jobs:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch approved jobs', 500);
    }
};
/**
 * Get active jobs (OPEN status and approved)
 * GET /api/jobs/active
 */
const getActiveJobs = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
        const skip = (page - 1) * limit;
        const [jobs, total] = await Promise.all([
            prisma_config_1.default.job.findMany({
                where: {
                    status: 'OPEN',
                    approved: true,
                },
                skip,
                take: limit,
                orderBy: { created_at: 'desc' },
                include: {
                    organization: {
                        select: {
                            name: true,
                        },
                    },
                    manager: {
                        select: {
                            name: true,
                        },
                    },
                    job_detail: true,
                    _count: {
                        select: {
                            applications: true,
                        },
                    },
                },
            }),
            prisma_config_1.default.job.count({
                where: {
                    status: 'OPEN',
                    approved: true,
                },
            }),
        ]);
        return (0, response_1.sendSuccess)(res, {
            data: jobs,
            paging: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        });
    }
    catch (err) {
        console.error('Error fetching active jobs:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch active jobs', 500);
    }
};
/**
 * Get job statistics
 * GET /api/jobs/stats
 */
const getJobStats = async (req, res) => {
    try {
        const { organization_id } = req.query;
        const whereClause = {};
        if (organization_id)
            whereClause.organization_id = organization_id;
        const [totalJobs, byStatus, byType, approvedCount, activeCount,] = await Promise.all([
            prisma_config_1.default.job.count({ where: whereClause }),
            prisma_config_1.default.job.groupBy({
                by: ['status'],
                where: whereClause,
                _count: { job_id: true },
            }),
            prisma_config_1.default.job.groupBy({
                by: ['job_type'],
                where: whereClause,
                _count: { job_id: true },
            }),
            prisma_config_1.default.job.count({
                where: { ...whereClause, approved: true },
            }),
            prisma_config_1.default.job.count({
                where: { ...whereClause, status: 'OPEN', approved: true },
            }),
        ]);
        return (0, response_1.sendSuccess)(res, {
            total: totalJobs,
            approved: approvedCount,
            active: activeCount,
            by_status: byStatus.map(s => ({
                status: s.status,
                count: s._count.job_id,
            })),
            by_type: byType.map(t => ({
                type: t.job_type,
                count: t._count.job_id,
            })),
        });
    }
    catch (err) {
        console.error('Error fetching job stats:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch job statistics', 500);
    }
};
/**
 * Get all jobs with detailed information for table view
 * GET /api/jobs/table-view
 */
const getJobs = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
        const skip = (page - 1) * limit;
        // Optional filters
        const { status, job_type, approved, organization_id } = req.query;
        const whereClause = {};
        if (status)
            whereClause.status = status.toUpperCase();
        if (job_type)
            whereClause.job_type = job_type.toUpperCase();
        if (approved !== undefined)
            whereClause.approved = approved === 'true';
        if (organization_id)
            whereClause.organization_id = organization_id;
        const [jobs, total] = await Promise.all([
            prisma_config_1.default.job.findMany({
                where: whereClause,
                skip,
                take: limit,
                orderBy: { created_at: 'desc' },
                include: {
                    organization: {
                        select: {
                            name: true,
                            status: true,
                        },
                    },
                    manager: {
                        select: {
                            name: true,
                            email: true,
                        },
                    },
                    created_by: {
                        select: {
                            name: true,
                            email: true,
                        },
                    },
                    _count: {
                        select: {
                            applications: true,
                            job_owners: true,
                        },
                    },
                },
            }),
            prisma_config_1.default.job.count({ where: whereClause }),
        ]);
        // Transform data for table view
        const tableData = jobs.map(job => ({
            job_id: job.job_id,
            job_title: job.job_title,
            status: job.status,
            job_type: job.job_type,
            location: job.location,
            approved: job.approved,
            days_active: job.days_active,
            days_inactive: job.days_inactive,
            start_date: job.start_date,
            end_date: job.end_date,
            created_at: job.created_at,
            // Organization details
            organization_id: job.organization_id,
            organization_name: job.organization?.name || 'N/A',
            organization_status: job.organization?.status || null,
            // Manager details
            manager_id: job.manager_id,
            manager_name: job.manager?.name || 'N/A',
            manager_email: job.manager?.email || 'N/A',
            // Counts
            applications_count: job._count.applications,
            job_owners_count: job._count.job_owners,
            // Created by
            created_by_user_id: job.created_by_user_id,
        }));
        return (0, response_1.sendSuccess)(res, {
            data: tableData,
            paging: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        });
    }
    catch (err) {
        console.error('Error fetching jobs table view:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch jobs table view', 500);
    }
};
/**
 * Job Complete Update Controller
 * PATCH request to update Job with all related data in a single transaction
 *
 * Updates:
 * - Job (base fields)
 * - JobDetail - create or update
 * - JobNote(s) - create, update, or delete
 * - JobRate(s) - create, update, or delete
 * - JobOwner(s) - create, update, or delete
 */
// Validation Schemas for nested updates
const jobDetailUpdateSchema = zod_1.z.object({
    job_detail_id: zod_1.z.string().uuid().optional(),
    description: zod_1.z.string().min(1, 'Job description is required').optional(),
    skills: zod_1.z.any().optional(),
    _action: zod_1.z.enum(['create', 'update']).optional(),
});
const jobNoteUpdateSchema = zod_1.z.object({
    job_note_id: zod_1.z.string().uuid().optional(),
    note: zod_1.z.string().min(1, 'Note content is required').optional(),
    _action: zod_1.z.enum(['create', 'update', 'delete']).optional(),
});
const jobRateUpdateSchema = zod_1.z.object({
    job_rate_id: zod_1.z.string().uuid().optional(),
    pay_rate: zod_1.z.number().optional(),
    bill_rate: zod_1.z.number().min(0, 'Bill rate must be positive').optional(),
    markup_percentage: zod_1.z.number().optional(),
    overtime_rule: zod_1.z.string().optional(),
    hours: zod_1.z.number().int().min(0, 'Hours must be a positive integer').optional(),
    ot_pay_rate: zod_1.z.number().optional(),
    ot_bill_rate: zod_1.z.number().optional(),
    _action: zod_1.z.enum(['create', 'update', 'delete']).optional(),
});
const jobOwnerUpdateSchema = zod_1.z.object({
    job_owner_id: zod_1.z.string().uuid().optional(),
    user_id: zod_1.z.string().uuid('Valid user ID is required').optional(),
    role_type: zod_1.z.enum(['SALES', 'RECRUITER']).optional(),
    _action: zod_1.z.enum(['create', 'update', 'delete']).optional(),
});
const updateJobCompleteSchema = zod_1.z.object({
    // Job base fields (all optional for PATCH)
    organization_id: zod_1.z.string().uuid('Valid organization ID is required').optional(),
    manager_id: zod_1.z.string().uuid('Valid manager ID is required').optional().nullable(),
    job_title: zod_1.z.string().min(1, 'Job title is required').optional(),
    status: zod_1.z.enum(['DRAFT', 'OPEN', 'CLOSED']).optional(),
    job_type: zod_1.z.enum(['TEMPORARY', 'PERMANENT']).optional(),
    location: zod_1.z.string().min(1, 'Location is required').optional(),
    days_active: zod_1.z.number().int().optional().nullable(),
    days_inactive: zod_1.z.number().int().optional().nullable(),
    approved: zod_1.z.boolean().optional(),
    start_date: zod_1.z.string().datetime().optional().nullable(),
    end_date: zod_1.z.string().datetime().optional().nullable(),
    // Related entities
    job_detail: jobDetailUpdateSchema.optional(),
    job_notes: zod_1.z.array(jobNoteUpdateSchema).optional(),
    job_rates: zod_1.z.array(jobRateUpdateSchema).optional(),
    job_owners: zod_1.z.array(jobOwnerUpdateSchema).optional(),
});
/**
 * PATCH /api/jobs/complete/:id
 * Updates job with all related data in a single transaction
 *
 * Usage patterns:
 * 1. Update job base fields only: { job_title: "New Title" }
 * 2. Create job detail: { job_detail: { description: "...", _action: "create" } }
 * 3. Update job detail: { job_detail: { job_detail_id: "uuid", description: "...", _action: "update" } }
 * 4. Create new nested records: { job_notes: [{ note: "...", _action: "create" }] }
 * 5. Update existing nested records: { job_notes: [{ job_note_id: "uuid", note: "...", _action: "update" }] }
 * 6. Delete nested records: { job_rates: [{ job_rate_id: "uuid", _action: "delete" }] }
 * 7. Mixed operations: Combine create, update, delete in same request
 */
const updateJobComplete = async (req, res) => {
    try {
        const { id } = req.params;
        if (!id) {
            return (0, response_1.sendError)(res, 'Job ID is required', 400);
        }
        // Validate request body
        const validation = updateJobCompleteSchema.safeParse(req.body);
        if (!validation.success) {
            const errors = validation.error.issues.map((err) => ({
                field: err.path.join('.'),
                message: err.message,
            }));
            return (0, response_1.sendError)(res, 'Validation failed', 400, errors);
        }
        const { organization_id, manager_id, job_title, status, job_type, location, days_active, days_inactive, approved, start_date, end_date, job_detail, job_notes, job_rates, job_owners, } = validation.data;
        // Check if job exists
        const existingJob = await prisma_config_1.default.job.findUnique({
            where: { job_id: id },
            include: {
                job_detail: true,
                job_notes: true,
                job_rates: true,
                job_owners: true,
            },
        });
        if (!existingJob) {
            return (0, response_1.sendError)(res, 'Job not found', 404);
        }
        // Check if organization exists (if updating)
        if (organization_id && organization_id !== existingJob.organization_id) {
            const organizationExists = await prisma_config_1.default.organization.findUnique({
                where: { organization_id },
            });
            if (!organizationExists) {
                return (0, response_1.sendError)(res, 'Organization not found', 404);
            }
        }
        // Check if manager exists (if updating)
        if (manager_id !== undefined && manager_id !== null) {
            const managerExists = await prisma_config_1.default.user.findUnique({
                where: { user_id: manager_id },
            });
            if (!managerExists) {
                return (0, response_1.sendError)(res, 'Manager user not found', 404);
            }
        }
        // Validate job owner users exist (if updating)
        if (job_owners && job_owners.length > 0) {
            const newOwnerUserIds = job_owners
                .filter(owner => owner._action !== 'delete' && owner.user_id)
                .map(owner => owner.user_id);
            if (newOwnerUserIds.length > 0) {
                const ownersExist = await prisma_config_1.default.user.findMany({
                    where: { user_id: { in: newOwnerUserIds } },
                    select: { user_id: true },
                });
                if (ownersExist.length !== newOwnerUserIds.length) {
                    const foundIds = ownersExist.map(u => u.user_id);
                    const missingIds = newOwnerUserIds.filter(id => !foundIds.includes(id));
                    return (0, response_1.sendError)(res, `Job owner user(s) not found: ${missingIds.join(', ')}`, 404);
                }
                // Check for duplicate user_id in job_owners (excluding deletes)
                const existingOwnerUserIds = existingJob.job_owners
                    .filter(owner => !job_owners.some(jo => jo.job_owner_id === owner.job_owner_id && jo._action === 'delete'))
                    .map(owner => owner.user_id);
                const allOwnerUserIds = [...existingOwnerUserIds, ...newOwnerUserIds];
                const uniqueOwnerIds = new Set(allOwnerUserIds);
                if (uniqueOwnerIds.size !== allOwnerUserIds.length) {
                    return (0, response_1.sendError)(res, 'Duplicate user IDs found in job_owners', 400);
                }
            }
        }
        // Validate date range if updating dates
        const finalStartDate = start_date !== undefined ? start_date : existingJob.start_date?.toISOString();
        const finalEndDate = end_date !== undefined ? end_date : existingJob.end_date?.toISOString();
        if (finalStartDate && finalEndDate) {
            const startDateTime = new Date(finalStartDate);
            const endDateTime = new Date(finalEndDate);
            if (startDateTime >= endDateTime) {
                return (0, response_1.sendError)(res, 'Start date must be before end date', 400);
            }
        }
        // Check for duplicate job title (if updating title or organization)
        const checkTitle = job_title || existingJob.job_title;
        const checkOrgId = organization_id || existingJob.organization_id;
        if ((job_title && job_title !== existingJob.job_title) ||
            (organization_id && organization_id !== existingJob.organization_id)) {
            const duplicateJob = await prisma_config_1.default.job.findFirst({
                where: {
                    organization_id: checkOrgId,
                    job_title: checkTitle,
                    status: { not: 'CLOSED' },
                    job_id: { not: id },
                },
            });
            if (duplicateJob) {
                return (0, response_1.sendError)(res, 'Active job with this title already exists for this organization', 409, [{
                        field: 'duplicate',
                        message: `Job already exists with job_id: ${duplicateJob.job_id}`,
                    }]);
            }
        }
        // Perform update in a transaction
        const result = await prisma_config_1.default.$transaction(async (tx) => {
            // 1. Update Job base fields
            const jobUpdateData = {};
            if (organization_id !== undefined)
                jobUpdateData.organization_id = organization_id;
            if (manager_id !== undefined)
                jobUpdateData.manager_id = manager_id;
            if (job_title !== undefined)
                jobUpdateData.job_title = job_title;
            if (status !== undefined)
                jobUpdateData.status = status;
            if (job_type !== undefined)
                jobUpdateData.job_type = job_type;
            if (location !== undefined)
                jobUpdateData.location = location;
            if (days_active !== undefined)
                jobUpdateData.days_active = days_active;
            if (days_inactive !== undefined)
                jobUpdateData.days_inactive = days_inactive;
            if (approved !== undefined)
                jobUpdateData.approved = approved;
            if (start_date !== undefined)
                jobUpdateData.start_date = start_date ? new Date(start_date) : null;
            if (end_date !== undefined)
                jobUpdateData.end_date = end_date ? new Date(end_date) : null;
            const updatedJob = Object.keys(jobUpdateData).length > 0
                ? await tx.job.update({
                    where: { job_id: id },
                    data: jobUpdateData,
                })
                : existingJob;
            // 2. Handle JobDetail
            let jobDetailResult = null;
            if (job_detail) {
                if (job_detail._action === 'update' && job_detail.job_detail_id) {
                    // Update existing job detail
                    const updateData = {};
                    if (job_detail.description !== undefined)
                        updateData.description = job_detail.description;
                    if (job_detail.skills !== undefined)
                        updateData.skills = job_detail.skills;
                    jobDetailResult = await tx.jobDetail.update({
                        where: { job_detail_id: job_detail.job_detail_id },
                        data: updateData,
                    });
                }
                else if (job_detail._action === 'create' || !job_detail.job_detail_id) {
                    // Create new job detail (if none exists)
                    if (!existingJob.job_detail) {
                        jobDetailResult = await tx.jobDetail.create({
                            data: {
                                job_id: id,
                                description: job_detail.description,
                                skills: job_detail.skills,
                            },
                        });
                    }
                }
            }
            // 3. Handle JobNotes
            const noteResults = {
                created: [],
                updated: [],
                deleted: [],
            };
            if (job_notes && job_notes.length > 0) {
                for (const note of job_notes) {
                    if (note._action === 'delete' && note.job_note_id) {
                        const deleted = await tx.jobNote.delete({
                            where: { job_note_id: note.job_note_id },
                        });
                        noteResults.deleted.push(deleted);
                    }
                    else if (note._action === 'update' && note.job_note_id) {
                        const updateData = {};
                        if (note.note !== undefined)
                            updateData.note = note.note;
                        const updated = await tx.jobNote.update({
                            where: { job_note_id: note.job_note_id },
                            data: updateData,
                        });
                        noteResults.updated.push(updated);
                    }
                    else if (note._action === 'create' || !note.job_note_id) {
                        const created = await tx.jobNote.create({
                            data: {
                                job_id: id,
                                note: note.note,
                            },
                        });
                        noteResults.created.push(created);
                    }
                }
            }
            // 4. Handle JobRates
            const rateResults = {
                created: [],
                updated: [],
                deleted: [],
            };
            if (job_rates && job_rates.length > 0) {
                for (const rate of job_rates) {
                    if (rate._action === 'delete' && rate.job_rate_id) {
                        const deleted = await tx.jobRate.delete({
                            where: { job_rate_id: rate.job_rate_id },
                        });
                        rateResults.deleted.push(deleted);
                    }
                    else if (rate._action === 'update' && rate.job_rate_id) {
                        const updateData = {};
                        if (rate.pay_rate !== undefined)
                            updateData.pay_rate = rate.pay_rate;
                        if (rate.bill_rate !== undefined)
                            updateData.bill_rate = rate.bill_rate;
                        if (rate.markup_percentage !== undefined)
                            updateData.markup_percentage = rate.markup_percentage;
                        if (rate.overtime_rule !== undefined)
                            updateData.overtime_rule = rate.overtime_rule;
                        if (rate.hours !== undefined)
                            updateData.hours = rate.hours;
                        if (rate.ot_pay_rate !== undefined)
                            updateData.ot_pay_rate = rate.ot_pay_rate;
                        if (rate.ot_bill_rate !== undefined)
                            updateData.ot_bill_rate = rate.ot_bill_rate;
                        const updated = await tx.jobRate.update({
                            where: { job_rate_id: rate.job_rate_id },
                            data: updateData,
                        });
                        rateResults.updated.push(updated);
                    }
                    else if (rate._action === 'create' || !rate.job_rate_id) {
                        const created = await tx.jobRate.create({
                            data: {
                                job_id: id,
                                pay_rate: rate.pay_rate,
                                bill_rate: rate.bill_rate,
                                markup_percentage: rate.markup_percentage,
                                overtime_rule: rate.overtime_rule,
                                hours: rate.hours,
                                ot_pay_rate: rate.ot_pay_rate,
                                ot_bill_rate: rate.ot_bill_rate,
                            },
                        });
                        rateResults.created.push(created);
                    }
                }
            }
            // 5. Handle JobOwners
            const ownerResults = {
                created: [],
                updated: [],
                deleted: [],
            };
            if (job_owners && job_owners.length > 0) {
                for (const owner of job_owners) {
                    if (owner._action === 'delete' && owner.job_owner_id) {
                        const deleted = await tx.jobOwner.delete({
                            where: { job_owner_id: owner.job_owner_id },
                        });
                        ownerResults.deleted.push(deleted);
                    }
                    else if (owner._action === 'update' && owner.job_owner_id) {
                        const updateData = {};
                        if (owner.user_id !== undefined)
                            updateData.user_id = owner.user_id;
                        if (owner.role_type !== undefined)
                            updateData.role_type = owner.role_type;
                        const updated = await tx.jobOwner.update({
                            where: { job_owner_id: owner.job_owner_id },
                            data: updateData,
                        });
                        ownerResults.updated.push(updated);
                    }
                    else if (owner._action === 'create' || !owner.job_owner_id) {
                        const created = await tx.jobOwner.create({
                            data: {
                                job_id: id,
                                user_id: owner.user_id,
                                role_type: owner.role_type,
                            },
                        });
                        ownerResults.created.push(created);
                    }
                }
            }
            return {
                job: updatedJob,
                job_detail: jobDetailResult,
                job_notes: noteResults,
                job_rates: rateResults,
                job_owners: ownerResults,
            };
        }, {
            maxWait: 10000,
            timeout: 15000,
        });
        // Fetch complete updated job data
        const completeJob = await prisma_config_1.default.job.findUnique({
            where: { job_id: id },
            include: {
                organization: {
                    select: {
                        organization_id: true,
                        name: true,
                        website: true,
                        status: true,
                    },
                },
                manager: {
                    select: {
                        user_id: true,
                        name: true,
                        email: true,
                    },
                },
                created_by: {
                    select: {
                        user_id: true,
                        name: true,
                        email: true,
                    },
                },
                job_detail: true,
                job_notes: {
                    orderBy: {
                        created_at: 'desc',
                    },
                },
                job_rates: true,
                job_owners: {
                    include: {
                        user: {
                            select: {
                                user_id: true,
                                name: true,
                                email: true,
                            },
                        },
                    },
                },
            },
        });
        // ✅ UPDATE USER ACTIVITY - Log job update
        await (0, activityService_1.updateUserActivity)(existingJob.created_by_user_id, {
            action_type: 'UPDATE',
            entity_type: 'JOB',
            entity_id: id,
            entity_name: completeJob?.job_title || existingJob.job_title,
            timestamp: new Date().toISOString(),
        });
        return (0, response_1.sendSuccess)(res, {
            job: completeJob,
            changes: {
                job_detail: result.job_detail ? 'updated' : 'unchanged',
                job_notes: {
                    created: result.job_notes.created.length,
                    updated: result.job_notes.updated.length,
                    deleted: result.job_notes.deleted.length,
                },
                job_rates: {
                    created: result.job_rates.created.length,
                    updated: result.job_rates.updated.length,
                    deleted: result.job_rates.deleted.length,
                },
                job_owners: {
                    created: result.job_owners.created.length,
                    updated: result.job_owners.updated.length,
                    deleted: result.job_owners.deleted.length,
                },
            },
        });
    }
    catch (err) {
        console.error('Error updating job with complete data:', err);
        // Handle Prisma errors
        if (err.code === 'P2002') {
            return (0, response_1.sendError)(res, 'Duplicate entry found', 409);
        }
        if (err.code === 'P2003') {
            return (0, response_1.sendError)(res, 'Related record not found', 404);
        }
        if (err.code === 'P2025') {
            return (0, response_1.sendError)(res, 'Record to update not found', 404);
        }
        if (err.code === 'P2028') {
            return (0, response_1.sendError)(res, 'Transaction timeout - please try again', 408);
        }
        return (0, response_1.sendError)(res, 'Failed to update job', 500);
    }
};
/**
 * Get jobs by user's organizations
 * GET /api/jobs/user/:userId
 * Returns all jobs from organizations where the user is an organization_user
 */
const getJobsByUser = async (req, res) => {
    try {
        const { userId } = req.params;
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
        const skip = (page - 1) * limit;
        if (!userId) {
            return (0, response_1.sendError)(res, 'User ID is required', 400);
        }
        // Check if user exists
        const userExists = await prisma_config_1.default.user.findUnique({
            where: { user_id: userId },
        });
        if (!userExists) {
            return (0, response_1.sendError)(res, 'User not found', 404);
        }
        // Get all organizations where user is an organization_user
        const userOrganizations = await prisma_config_1.default.organizationUser.findMany({
            where: {
                user_id: userId,
            },
            select: {
                organization_id: true,
            },
        });
        // If user is not associated with any organizations
        if (userOrganizations.length === 0) {
            return (0, response_1.sendSuccess)(res, {
                data: [],
                paging: {
                    total: 0,
                    page,
                    limit,
                    totalPages: 0,
                },
            });
        }
        // Extract organization IDs
        const organizationIds = userOrganizations.map(org => org.organization_id);
        // Optional filters
        const { status, job_type, approved } = req.query;
        const whereClause = {
            organization_id: {
                in: organizationIds,
            },
        };
        if (status)
            whereClause.status = status.toUpperCase();
        if (job_type)
            whereClause.job_type = job_type.toUpperCase();
        if (approved !== undefined)
            whereClause.approved = approved === 'true';
        // Fetch jobs and total count
        const [jobs, total] = await Promise.all([
            prisma_config_1.default.job.findMany({
                where: whereClause,
                skip,
                take: limit,
                orderBy: { created_at: 'desc' },
                include: {
                    organization: {
                        select: {
                            organization_id: true,
                            name: true,
                            status: true,
                        },
                    },
                    manager: {
                        select: {
                            user_id: true,
                            name: true,
                            email: true,
                        },
                    },
                    _count: {
                        select: {
                            applications: true,
                            job_owners: true,
                        },
                    },
                },
            }),
            prisma_config_1.default.job.count({
                where: whereClause,
            }),
        ]);
        // Transform data for response
        const transformedJobs = jobs.map(job => ({
            job_id: job.job_id,
            job_title: job.job_title,
            status: job.status,
            job_type: job.job_type,
            location: job.location,
            approved: job.approved,
            days_active: job.days_active,
            days_inactive: job.days_inactive,
            start_date: job.start_date,
            end_date: job.end_date,
            created_at: job.created_at,
            organization_id: job.organization?.organization_id || null,
            organization_name: job.organization?.name || 'N/A',
            organization_status: job.organization?.status || null,
            manager_id: job.manager_id,
            manager_name: job.manager?.name || 'N/A',
            manager_email: job.manager?.email || 'N/A',
            applications_count: job._count?.applications || 0,
            job_owners_count: job._count?.job_owners || 0,
            created_by_user_id: job.created_by_user_id,
        }));
        return (0, response_1.sendSuccess)(res, {
            data: transformedJobs,
            paging: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        });
    }
    catch (err) {
        console.error('Error fetching jobs by user organizations:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch jobs', 500);
    }
};
/**
 * Get user's organizations
 * GET /api/jobs/user/:userId/organizations
 * Returns all organizations where the user is an organization_user
 */
const getUserOrganizations = async (req, res) => {
    try {
        const { userId } = req.params;
        if (!userId) {
            return (0, response_1.sendError)(res, 'User ID is required', 400);
        }
        // Check if user exists
        const userExists = await prisma_config_1.default.user.findUnique({
            where: { user_id: userId },
        });
        if (!userExists) {
            return (0, response_1.sendError)(res, 'User not found', 404);
        }
        // Get all organizations where user is an organization_user
        const organizations = await prisma_config_1.default.organizationUser.findMany({
            where: {
                user_id: userId,
            },
            select: {
                organization: {
                    select: {
                        organization_id: true,
                        name: true,
                    },
                },
            },
        });
        const transformedOrganizations = organizations.map(org => ({
            organization_id: org.organization.organization_id,
            name: org.organization.name,
        }));
        return (0, response_1.sendSuccess)(res, {
            data: transformedOrganizations,
            total: transformedOrganizations.length,
        });
    }
    catch (err) {
        console.error('Error fetching user organizations:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch organizations', 500);
    }
};
// Export controller with custom methods
exports.jobController = {
    ...baseCrudMethods,
    create: createJob,
    getById: getJobById,
    update: updateJobComplete,
    getAll: getJobs,
    getJobsByOrganization,
    getJobsByStatus,
    getJobsByType,
    getJobsByManager,
    getApprovedJobs,
    getActiveJobs,
    getJobStats,
    getJobsByUser,
    getUserOrganizations,
};
//# sourceMappingURL=jobController.js.map