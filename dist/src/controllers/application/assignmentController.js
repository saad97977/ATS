"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.assignmentController = void 0;
const prisma_config_1 = __importDefault(require("../../prisma.config"));
const crudFactory_1 = require("../../factories/crudFactory");
const schemas_1 = require("../../validators/schemas");
const response_1 = require("../../utils/response");
/**
 * Assignment Controller
 *
 * Key improvements:
 * - getAll now includes rich relational data (worker name, job title, org, rates, counts)
 * - getAll supports search (by worker name, assignment_id, application_id)
 * - getAll supports status filter (active | ended | ending_soon)
 * - getAll supports employment_type filter
 * - Stats endpoint accurately counts using DB queries, not client-side derivation
 * - No N+1 queries — all data loaded in single Prisma query
 */
const baseCrudMethods = (0, crudFactory_1.createCrudController)({
    model: prisma_config_1.default.assignment,
    modelName: 'Assignment',
    idField: 'assignment_id',
    createSchema: schemas_1.createAssignmentSchema,
    updateSchema: schemas_1.updateAssignmentSchema,
    defaultLimit: 10,
    maxLimit: 100,
});
// Shared include for list queries — rich enough to avoid secondary API calls.
// Typed with `satisfies Prisma.AssignmentInclude` so TypeScript validates the
// shape while keeping the literal types Prisma needs for orderBy / SortOrder.
const LIST_INCLUDE = {
    application: {
        select: {
            application_id: true,
            status: true,
            job: {
                select: {
                    job_id: true,
                    job_title: true,
                    location: true,
                    job_rates: {
                        take: 1,
                    },
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
        },
    },
    _count: {
        select: {
            time_entries: true,
            payrolls: true,
        },
    },
};
/**
 * Build Prisma where clause from query params
 */
const buildWhereClause = (query) => {
    const where = {};
    const now = new Date();
    // Employment type filter
    if (query.employment_type && query.employment_type !== 'all') {
        where.employment_type = query.employment_type.toUpperCase();
    }
    // Status filter
    if (query.status) {
        switch (query.status) {
            case 'active':
                where.OR = [{ end_date: null }, { end_date: { gte: now } }];
                break;
            case 'ended':
                where.end_date = { lt: now };
                break;
            case 'ending_soon': {
                const thirtyDaysFromNow = new Date(now);
                thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
                where.end_date = { gte: now, lte: thirtyDaysFromNow };
                break;
            }
        }
    }
    // Search — by assignment_id (prefix) or worker name via relation
    if (query.search) {
        const term = query.search.trim();
        const searchConditions = [
            { assignment_id: { contains: term, mode: 'insensitive' } },
            { application_id: { contains: term, mode: 'insensitive' } },
            {
                application: {
                    applicant: {
                        full_name: { contains: term, mode: 'insensitive' },
                    },
                },
            },
            {
                application: {
                    job: {
                        job_title: { contains: term, mode: 'insensitive' },
                    },
                },
            },
            {
                application: {
                    job: {
                        organization: {
                            name: { contains: term, mode: 'insensitive' },
                        },
                    },
                },
            },
        ];
        // Merge with existing OR if status filter also set an OR
        if (where.OR) {
            // Wrap: (status conditions) AND (search conditions)
            where.AND = [{ OR: where.OR }, { OR: searchConditions }];
            delete where.OR;
        }
        else {
            where.OR = searchConditions;
        }
    }
    return where;
};
/**
 * GET /api/assignments
 * Overrides base getAll with rich data + filtering
 */
const getAssignments = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
        const skip = (page - 1) * limit;
        const where = buildWhereClause(req.query);
        const [assignments, total] = await Promise.all([
            prisma_config_1.default.assignment.findMany({
                where,
                skip,
                take: limit,
                orderBy: { created_at: 'desc' },
                include: LIST_INCLUDE,
            }),
            prisma_config_1.default.assignment.count({ where }),
        ]);
        return (0, response_1.sendSuccess)(res, {
            data: assignments,
            paging: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        });
    }
    catch (err) {
        console.error('Error fetching assignments:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch assignments', 500);
    }
};
/**
 * GET /api/assignments/stats
 * Accurate counts from DB, not client-side
 */
const getAssignmentStats = async (req, res) => {
    try {
        const now = new Date();
        const thirtyDaysFromNow = new Date(now);
        thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
        const [total, active, completed, endingSoon, byEmploymentType] = await Promise.all([
            prisma_config_1.default.assignment.count(),
            prisma_config_1.default.assignment.count({
                where: { OR: [{ end_date: null }, { end_date: { gte: now } }] },
            }),
            prisma_config_1.default.assignment.count({
                where: { end_date: { lt: now } },
            }),
            prisma_config_1.default.assignment.count({
                where: { end_date: { gte: now, lte: thirtyDaysFromNow } },
            }),
            prisma_config_1.default.assignment.groupBy({
                by: ['employment_type'],
                _count: { assignment_id: true },
            }),
        ]);
        return (0, response_1.sendSuccess)(res, {
            total,
            active,
            completed,
            ending_soon: endingSoon,
            by_employment_type: byEmploymentType.map(s => ({
                employment_type: s.employment_type,
                count: s._count.assignment_id,
            })),
        });
    }
    catch (err) {
        console.error('Error fetching assignment stats:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch assignment statistics', 500);
    }
};
/**
 * GET /api/assignments/:id
 * Full detail including recent time entries and payrolls
 */
const getAssignmentById = async (req, res) => {
    try {
        const { id } = req.params;
        if (!id)
            return (0, response_1.sendError)(res, 'Assignment ID is required', 400);
        const assignment = await prisma_config_1.default.assignment.findUnique({
            where: { assignment_id: id },
            include: {
                ...LIST_INCLUDE,
                application: {
                    include: {
                        job: {
                            include: {
                                organization: {
                                    select: { organization_id: true, name: true, website: true, phone: true },
                                },
                                job_detail: true,
                                job_rates: true,
                            },
                        },
                        applicant: {
                            include: {
                                contact: true,
                                demographic: true,
                                work_history: true,
                            },
                        },
                    },
                },
                time_entries: {
                    orderBy: { work_date: 'desc' },
                    take: 10,
                },
                payrolls: {
                    orderBy: { processed_at: 'desc' },
                    take: 5,
                },
            },
        });
        if (!assignment)
            return (0, response_1.sendError)(res, 'Assignment not found', 404);
        return (0, response_1.sendSuccess)(res, assignment);
    }
    catch (err) {
        console.error('Error fetching assignment:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch assignment', 500);
    }
};
/**
 * GET /api/assignments/application/:applicationId
 */
const getAssignmentByApplication = async (req, res) => {
    try {
        const { applicationId } = req.params;
        if (!applicationId)
            return (0, response_1.sendError)(res, 'Application ID is required', 400);
        const assignment = await prisma_config_1.default.assignment.findUnique({
            where: { application_id: applicationId },
            include: {
                application: {
                    select: {
                        application_id: true,
                        status: true,
                        job: {
                            select: {
                                job_id: true,
                                job_title: true,
                                location: true,
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
                    },
                },
                _count: { select: { time_entries: true, payrolls: true } },
            },
        });
        if (!assignment)
            return (0, response_1.sendError)(res, 'Assignment not found for this application', 404);
        return (0, response_1.sendSuccess)(res, assignment);
    }
    catch (err) {
        console.error('Error fetching assignment by application:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch assignment', 500);
    }
};
/**
 * POST /api/assignments
 * Validates: HIRED status, no duplicate, end > start
 */
const createAssignment = async (req, res) => {
    try {
        const validation = schemas_1.createAssignmentSchema.safeParse(req.body);
        if (!validation.success) {
            return (0, response_1.sendError)(res, 'Validation failed', 400, validation.error.issues.map((e) => ({ field: e.path.join('.'), message: e.message })));
        }
        const { application_id, start_date, end_date } = req.body;
        if (end_date && new Date(end_date) <= new Date(start_date)) {
            return (0, response_1.sendError)(res, 'End date must be after start date', 400);
        }
        const [application, existingAssignment] = await Promise.all([
            prisma_config_1.default.application.findUnique({ where: { application_id } }),
            prisma_config_1.default.assignment.findUnique({ where: { application_id } }),
        ]);
        if (!application)
            return (0, response_1.sendError)(res, 'Application not found', 404);
        if (application.status !== 'HIRED') {
            return (0, response_1.sendError)(res, 'Assignment can only be created for HIRED applications', 400, [{
                    field: 'application_status',
                    message: `Application status is ${application.status}. Only HIRED applications can have assignments.`,
                }]);
        }
        if (existingAssignment) {
            return (0, response_1.sendError)(res, 'Assignment already exists for this application', 409, [{
                    field: 'duplicate',
                    message: `Assignment already exists with assignment_id: ${existingAssignment.assignment_id}`,
                }]);
        }
        const assignment = await prisma_config_1.default.assignment.create({
            data: req.body,
            include: LIST_INCLUDE,
        });
        return (0, response_1.sendSuccess)(res, assignment, 201);
    }
    catch (err) {
        console.error('Error creating assignment:', err);
        if (err.code === 'P2002')
            return (0, response_1.sendError)(res, 'Assignment already exists for this application', 409);
        if (err.code === 'P2003')
            return (0, response_1.sendError)(res, 'Related application not found', 404);
        return (0, response_1.sendError)(res, 'Failed to create assignment', 500);
    }
};
/**
 * PATCH /api/assignments/:id
 */
const updateAssignment = async (req, res) => {
    try {
        const { id } = req.params;
        if (!id)
            return (0, response_1.sendError)(res, 'Assignment ID is required', 400);
        const validation = schemas_1.updateAssignmentSchema.safeParse(req.body);
        if (!validation.success) {
            return (0, response_1.sendError)(res, 'Validation failed', 400, validation.error.issues.map((e) => ({ field: e.path.join('.'), message: e.message })));
        }
        const existingAssignment = await prisma_config_1.default.assignment.findUnique({ where: { assignment_id: id } });
        if (!existingAssignment)
            return (0, response_1.sendError)(res, 'Assignment not found', 404);
        if (req.body.end_date) {
            const startDate = req.body.start_date ? new Date(req.body.start_date) : existingAssignment.start_date;
            if (new Date(req.body.end_date) <= startDate) {
                return (0, response_1.sendError)(res, 'End date must be after start date', 400);
            }
        }
        const assignment = await prisma_config_1.default.assignment.update({
            where: { assignment_id: id },
            data: req.body,
            include: LIST_INCLUDE,
        });
        return (0, response_1.sendSuccess)(res, assignment);
    }
    catch (err) {
        console.error('Error updating assignment:', err);
        if (err.code === 'P2025')
            return (0, response_1.sendError)(res, 'Assignment not found', 404);
        return (0, response_1.sendError)(res, 'Failed to update assignment', 500);
    }
};
/**
 * GET /api/assignments/active
 */
const getActiveAssignments = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
        const skip = (page - 1) * limit;
        const now = new Date();
        const where = { OR: [{ end_date: null }, { end_date: { gte: now } }] };
        const [assignments, total] = await Promise.all([
            prisma_config_1.default.assignment.findMany({ where, skip, take: limit, orderBy: { created_at: 'desc' }, include: LIST_INCLUDE }),
            prisma_config_1.default.assignment.count({ where }),
        ]);
        return (0, response_1.sendSuccess)(res, { data: assignments, paging: { total, page, limit, totalPages: Math.ceil(total / limit) } });
    }
    catch (err) {
        console.error('Error fetching active assignments:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch active assignments', 500);
    }
};
/**
 * GET /api/assignments/completed
 */
const getCompletedAssignments = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
        const skip = (page - 1) * limit;
        const now = new Date();
        const where = { end_date: { lt: now } };
        const [assignments, total] = await Promise.all([
            prisma_config_1.default.assignment.findMany({ where, skip, take: limit, orderBy: { created_at: 'desc' }, include: LIST_INCLUDE }),
            prisma_config_1.default.assignment.count({ where }),
        ]);
        return (0, response_1.sendSuccess)(res, { data: assignments, paging: { total, page, limit, totalPages: Math.ceil(total / limit) } });
    }
    catch (err) {
        console.error('Error fetching completed assignments:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch completed assignments', 500);
    }
};
/**
 * GET /api/assignments/employment-type/:type
 */
const getAssignmentsByEmploymentType = async (req, res) => {
    try {
        const { type } = req.params;
        const validTypes = ['W2', 'CONTRACTOR_1099'];
        if (!validTypes.includes(type?.toUpperCase())) {
            return (0, response_1.sendError)(res, `Invalid employment type. Must be one of: ${validTypes.join(', ')}`, 400);
        }
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
        const skip = (page - 1) * limit;
        const where = { employment_type: type.toUpperCase() };
        const [assignments, total] = await Promise.all([
            prisma_config_1.default.assignment.findMany({ where, skip, take: limit, orderBy: { created_at: 'desc' }, include: LIST_INCLUDE }),
            prisma_config_1.default.assignment.count({ where }),
        ]);
        return (0, response_1.sendSuccess)(res, { data: assignments, paging: { total, page, limit, totalPages: Math.ceil(total / limit) } });
    }
    catch (err) {
        console.error('Error fetching assignments by employment type:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch assignments', 500);
    }
};
exports.assignmentController = {
    ...baseCrudMethods,
    getAll: getAssignments, // Override: rich data + filtering + search
    getById: getAssignmentById, // Override: full detail
    create: createAssignment, // Override: validation + duplicate check
    update: updateAssignment, // Override: date validation
    getAssignmentByApplication,
    getAssignmentsByEmploymentType,
    getActiveAssignments,
    getCompletedAssignments,
    getAssignmentStats,
};
//# sourceMappingURL=assignmentController.js.map