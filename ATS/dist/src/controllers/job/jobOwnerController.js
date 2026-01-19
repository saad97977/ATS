"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.jobOwnerController = void 0;
const prisma_config_1 = __importDefault(require("../../prisma.config"));
const crudFactory_1 = require("../../factories/crudFactory");
const schemas_1 = require("../../validators/schemas");
const response_1 = require("../../utils/response");
/**
 * Job Owner CRUD Controller - Generated using CRUD Factory with Zod validation
 * Provides: GET all, GET by id, POST (custom with duplicate check), PATCH, DELETE
 *
 * Validation Rules:
 * - job_id: Required UUID
 * - user_id: Required UUID
 * - role_type: Required (SALES, RECRUITER)
 */
// Generate base CRUD methods
const baseCrudMethods = (0, crudFactory_1.createCrudController)({
    model: prisma_config_1.default.jobOwner,
    modelName: 'Job Owner',
    idField: 'job_owner_id',
    createSchema: schemas_1.createJobOwnerSchema,
    updateSchema: schemas_1.updateJobOwnerSchema,
    defaultLimit: 10,
    maxLimit: 100,
});
/**
 * Custom create method with duplicate check
 * Prevents creating duplicate job owner records with same job_id, user_id, and role_type
 */
const createJobOwner = async (req, res) => {
    try {
        // Validate request body
        const validation = schemas_1.createJobOwnerSchema.safeParse(req.body);
        if (!validation.success) {
            const errors = validation.error.issues.map((err) => ({
                field: err.path.join('.'),
                message: err.message,
            }));
            return (0, response_1.sendError)(res, 'Validation failed', 400, errors);
        }
        const { job_id, user_id, role_type } = req.body;
        // Check for existing record with same job_id, user_id, and role_type
        const existingJobOwner = await prisma_config_1.default.jobOwner.findFirst({
            where: {
                job_id,
                user_id,
                role_type,
            },
        });
        if (existingJobOwner) {
            return (0, response_1.sendError)(res, 'Job Owner with this combination already exists', 409, [{
                    field: 'duplicate',
                    message: `Job Owner already exists with job_owner_id: ${existingJobOwner.job_owner_id}`,
                }]);
        }
        // Create new job owner
        const data = await prisma_config_1.default.jobOwner.create({
            data: req.body
        });
        return (0, response_1.sendSuccess)(res, data, 201);
    }
    catch (err) {
        console.error('Error creating Job Owner:', err);
        // Handle common Prisma errors
        if (err.code === 'P2003') {
            return (0, response_1.sendError)(res, 'Related job or user not found', 404);
        }
        return (0, response_1.sendError)(res, 'Failed to create Job Owner', 500);
    }
};
/**
 * Get all job owners for a specific job
 * GET /api/job-owners/job/:jobId
 */
const getJobOwnersByJob = async (req, res) => {
    try {
        const { jobId } = req.params;
        if (!jobId) {
            return (0, response_1.sendError)(res, 'Job ID is required', 400);
        }
        // Fetch all job owners for the specified job with user details
        const jobOwners = await prisma_config_1.default.jobOwner.findMany({
            where: {
                job_id: jobId,
            },
            include: {
                user: {
                    select: {
                        user_id: true,
                        name: true,
                        email: true,
                    },
                },
            },
            orderBy: {
                role_type: 'asc',
            },
        });
        return (0, response_1.sendSuccess)(res, {
            job_id: jobId,
            total: jobOwners.length,
            job_owners: jobOwners,
        });
    }
    catch (err) {
        console.error('Error fetching Job Owners by Job:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch Job Owners', 500);
    }
};
// Export controller with custom create method and additional query
exports.jobOwnerController = {
    ...baseCrudMethods,
    create: createJobOwner, // Override the default create method
    getJobOwnersByJob, // Add custom query method
};
//# sourceMappingURL=jobOwnerController.js.map