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
 * Assignment Controller - Custom CRUD for Assignment management
 * Provides: GET all, GET by id, GET by application, POST, PATCH, DELETE
 *
 * Validation Rules:
 * - application_id: Required UUID
 * - start_date: Required datetime
 * - end_date: Optional datetime
 * - employment_type: W2 or CONTRACTOR_1099
 * - workers_comp_code: Optional string
 *
 * Business Context: Manages post-hire assignments linking applications to employment
 * Tracks employment periods, time entries, and payroll
 * Business Rule: One application can only have one assignment
 */
// Generate base CRUD methods
const baseCrudMethods = (0, crudFactory_1.createCrudController)({
    model: prisma_config_1.default.assignment,
    modelName: 'Assignment',
    idField: 'assignment_id',
    createSchema: schemas_1.createAssignmentSchema,
    updateSchema: schemas_1.updateAssignmentSchema,
    defaultLimit: 10,
    maxLimit: 100,
});
/**
 * Override getById to include full related data
 * GET /api/assignments/:id
 */
const getAssignmentById = async (req, res) => {
    try {
        const { id } = req.params;
        if (!id) {
            return (0, response_1.sendError)(res, 'Assignment ID is required', 400);
        }
        const assignment = await prisma_config_1.default.assignment.findUnique({
            where: { assignment_id: id },
            include: {
                application: {
                    include: {
                        job: {
                            include: {
                                organization: {
                                    select: {
                                        organization_id: true,
                                        name: true,
                                        website: true,
                                        phone: true,
                                    },
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
        if (!assignment) {
            return (0, response_1.sendError)(res, 'Assignment not found', 404);
        }
        return (0, response_1.sendSuccess)(res, assignment);
    }
    catch (err) {
        console.error('Error fetching assignment:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch assignment', 500);
    }
};
/**
 * Get assignment by application ID
 * GET /api/assignments/application/:applicationId
 */
const getAssignmentByApplication = async (req, res) => {
    try {
        const { applicationId } = req.params;
        if (!applicationId) {
            return (0, response_1.sendError)(res, 'Application ID is required', 400);
        }
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
                                organization: {
                                    select: {
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
            },
        });
        if (!assignment) {
            return (0, response_1.sendError)(res, 'Assignment not found for this application', 404);
        }
        return (0, response_1.sendSuccess)(res, assignment);
    }
    catch (err) {
        console.error('Error fetching assignment by application:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch assignment', 500);
    }
};
/**
 * Get assignments by employment type
 * GET /api/assignments/employment-type/:type
 */
const getAssignmentsByEmploymentType = async (req, res) => {
    try {
        const { type } = req.params;
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
        const skip = (page - 1) * limit;
        if (!type) {
            return (0, response_1.sendError)(res, 'Employment type is required', 400);
        }
        // Validate employment type
        const validTypes = ['W2', 'CONTRACTOR_1099'];
        if (!validTypes.includes(type.toUpperCase())) {
            return (0, response_1.sendError)(res, `Invalid employment type. Must be one of: ${validTypes.join(', ')}`, 400);
        }
        const [assignments, total] = await Promise.all([
            prisma_config_1.default.assignment.findMany({
                where: {
                    employment_type: type.toUpperCase(),
                },
                skip,
                take: limit,
                orderBy: { start_date: 'desc' },
                include: {
                    application: {
                        select: {
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
            }),
            prisma_config_1.default.assignment.count({
                where: {
                    employment_type: type.toUpperCase(),
                },
            }),
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
        console.error('Error fetching assignments by employment type:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch assignments', 500);
    }
};
/**
 * Get active assignments (no end_date or end_date in future)
 * GET /api/assignments/active
 */
const getActiveAssignments = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
        const skip = (page - 1) * limit;
        const now = new Date();
        const [assignments, total] = await Promise.all([
            prisma_config_1.default.assignment.findMany({
                where: {
                    OR: [
                        { end_date: null },
                        { end_date: { gte: now } },
                    ],
                },
                skip,
                take: limit,
                orderBy: { start_date: 'desc' },
                include: {
                    application: {
                        select: {
                            application_id: true,
                            job: {
                                select: {
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
            }),
            prisma_config_1.default.assignment.count({
                where: {
                    OR: [
                        { end_date: null },
                        { end_date: { gte: now } },
                    ],
                },
            }),
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
        console.error('Error fetching active assignments:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch active assignments', 500);
    }
};
/**
 * Get completed assignments (end_date in past)
 * GET /api/assignments/completed
 */
const getCompletedAssignments = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
        const skip = (page - 1) * limit;
        const now = new Date();
        const [assignments, total] = await Promise.all([
            prisma_config_1.default.assignment.findMany({
                where: {
                    end_date: {
                        lt: now,
                    },
                },
                skip,
                take: limit,
                orderBy: { end_date: 'desc' },
                include: {
                    application: {
                        select: {
                            application_id: true,
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
                },
            }),
            prisma_config_1.default.assignment.count({
                where: {
                    end_date: {
                        lt: now,
                    },
                },
            }),
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
        console.error('Error fetching completed assignments:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch completed assignments', 500);
    }
};
/**
 * Get assignment statistics
 * GET /api/assignments/stats
 */
const getAssignmentStats = async (req, res) => {
    try {
        const now = new Date();
        const [totalAssignments, activeAssignments, completedAssignments, byEmploymentType] = await Promise.all([
            prisma_config_1.default.assignment.count(),
            prisma_config_1.default.assignment.count({
                where: {
                    OR: [
                        { end_date: null },
                        { end_date: { gte: now } },
                    ],
                },
            }),
            prisma_config_1.default.assignment.count({
                where: {
                    end_date: {
                        lt: now,
                    },
                },
            }),
            prisma_config_1.default.assignment.groupBy({
                by: ['employment_type'],
                _count: {
                    assignment_id: true,
                },
            }),
        ]);
        const formattedEmploymentStats = byEmploymentType.map(stat => ({
            employment_type: stat.employment_type,
            count: stat._count.assignment_id,
        }));
        return (0, response_1.sendSuccess)(res, {
            total: totalAssignments,
            active: activeAssignments,
            completed: completedAssignments,
            by_employment_type: formattedEmploymentStats,
        });
    }
    catch (err) {
        console.error('Error fetching assignment stats:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch assignment statistics', 500);
    }
};
/**
 * Custom create method with duplicate check
 * Ensures one application can only have one assignment
 */
const createAssignment = async (req, res) => {
    try {
        // Validate request body
        const validation = schemas_1.createAssignmentSchema.safeParse(req.body);
        if (!validation.success) {
            const errors = validation.error.issues.map((err) => ({
                field: err.path.join('.'),
                message: err.message,
            }));
            return (0, response_1.sendError)(res, 'Validation failed', 400, errors);
        }
        const { application_id, start_date, end_date } = req.body;
        // Validate that end_date is after start_date if provided
        if (end_date && new Date(end_date) <= new Date(start_date)) {
            return (0, response_1.sendError)(res, 'End date must be after start date', 400);
        }
        // Check if application exists
        const application = await prisma_config_1.default.application.findUnique({
            where: { application_id },
        });
        if (!application) {
            return (0, response_1.sendError)(res, 'Application not found', 404);
        }
        // Check if application status is HIRED
        if (application.status !== 'HIRED') {
            return (0, response_1.sendError)(res, 'Assignment can only be created for HIRED applications', 400, [{
                    field: 'application_status',
                    message: `Application status is ${application.status}. Only HIRED applications can have assignments.`,
                }]);
        }
        // Check for existing assignment for this application
        const existingAssignment = await prisma_config_1.default.assignment.findUnique({
            where: { application_id },
        });
        if (existingAssignment) {
            return (0, response_1.sendError)(res, 'Assignment already exists for this application', 409, [{
                    field: 'duplicate',
                    message: `Assignment already exists with assignment_id: ${existingAssignment.assignment_id}`,
                }]);
        }
        // Create new assignment
        const assignment = await prisma_config_1.default.assignment.create({
            data: req.body,
            include: {
                application: {
                    select: {
                        application_id: true,
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
        return (0, response_1.sendSuccess)(res, assignment, 201);
    }
    catch (err) {
        console.error('Error creating assignment:', err);
        // Handle duplicate assignment error (unique constraint violation)
        if (err.code === 'P2002') {
            return (0, response_1.sendError)(res, 'Assignment already exists for this application', 409, [{
                    field: 'application_id',
                    message: 'An assignment has already been created for this application',
                }]);
        }
        // Handle foreign key constraint (application doesn't exist)
        if (err.code === 'P2003') {
            return (0, response_1.sendError)(res, 'Related application not found', 404);
        }
        return (0, response_1.sendError)(res, 'Failed to create assignment', 500);
    }
};
/**
 * Custom update method with end_date validation
 */
const updateAssignment = async (req, res) => {
    try {
        const { id } = req.params;
        if (!id) {
            return (0, response_1.sendError)(res, 'Assignment ID is required', 400);
        }
        // Validate request body
        const validation = schemas_1.updateAssignmentSchema.safeParse(req.body);
        if (!validation.success) {
            const errors = validation.error.issues.map((err) => ({
                field: err.path.join('.'),
                message: err.message,
            }));
            return (0, response_1.sendError)(res, 'Validation failed', 400, errors);
        }
        // Check if assignment exists
        const existingAssignment = await prisma_config_1.default.assignment.findUnique({
            where: { assignment_id: id },
        });
        if (!existingAssignment) {
            return (0, response_1.sendError)(res, 'Assignment not found', 404);
        }
        // Validate end_date if provided
        if (req.body.end_date) {
            const startDate = req.body.start_date
                ? new Date(req.body.start_date)
                : existingAssignment.start_date;
            const endDate = new Date(req.body.end_date);
            if (endDate <= startDate) {
                return (0, response_1.sendError)(res, 'End date must be after start date', 400);
            }
        }
        // Update assignment
        const assignment = await prisma_config_1.default.assignment.update({
            where: { assignment_id: id },
            data: req.body,
            include: {
                application: {
                    select: {
                        job: {
                            select: {
                                job_title: true,
                            },
                        },
                        applicant: {
                            select: {
                                full_name: true,
                            },
                        },
                    },
                },
            },
        });
        return (0, response_1.sendSuccess)(res, assignment);
    }
    catch (err) {
        console.error('Error updating assignment:', err);
        if (err.code === 'P2025') {
            return (0, response_1.sendError)(res, 'Assignment not found', 404);
        }
        return (0, response_1.sendError)(res, 'Failed to update assignment', 500);
    }
};
// Export controller with custom methods
exports.assignmentController = {
    ...baseCrudMethods,
    getById: getAssignmentById, // Override with full details
    create: createAssignment, // Override with duplicate check and validation
    update: updateAssignment, // Override with date validation
    getAssignmentByApplication, // Custom query by application
    getAssignmentsByEmploymentType, // Custom query by employment type
    getActiveAssignments, // Custom query for active assignments
    getCompletedAssignments, // Custom query for completed assignments
    getAssignmentStats, // Get assignment statistics
};
//# sourceMappingURL=assignmentController.js.map