"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.jobRateController = void 0;
const prisma_config_1 = __importDefault(require("../../prisma.config"));
const crudFactory_1 = require("../../factories/crudFactory");
const schemas_1 = require("../../validators/schemas");
const response_1 = require("../../utils/response");
/**
 * Job Rate CRUD Controller - Generated using CRUD Factory with Zod validation
 * Provides: GET all, GET by id, POST (custom with duplicate check), PATCH, DELETE
 *
 * Validation Rules:
 * - job_id: Required UUID
 * - pay_rate: Optional positive decimal
 * - bill_rate: Required positive decimal
 * - markup_percentage: Optional positive decimal
 * - overtime_rule: Optional string
 * - hours: Required positive integer
 * - ot_pay_rate: Optional positive decimal
 * - ot_bill_rate: Optional positive decimal
 *
 * Business Rule: One job can only have one job rate
 */
// Generate base CRUD methods
const baseCrudMethods = (0, crudFactory_1.createCrudController)({
    model: prisma_config_1.default.jobRate,
    modelName: 'Job Rate',
    idField: 'job_rate_id',
    createSchema: schemas_1.createJobRateSchema,
    updateSchema: schemas_1.updateJobRateSchema,
    defaultLimit: 10,
    maxLimit: 100,
});
/**
 * Custom create method with duplicate check
 * Ensures one job can only have one job rate
 */
const createJobRate = async (req, res) => {
    try {
        // Validate request body
        const validation = schemas_1.createJobRateSchema.safeParse(req.body);
        if (!validation.success) {
            const errors = validation.error.issues.map((err) => ({
                field: err.path.join('.'),
                message: err.message,
            }));
            return (0, response_1.sendError)(res, 'Validation failed', 400, errors);
        }
        const { job_id } = req.body;
        // Check for existing job rate for this job
        const existingJobRate = await prisma_config_1.default.jobRate.findFirst({
            where: {
                job_id,
            },
        });
        if (existingJobRate) {
            return (0, response_1.sendError)(res, 'Job Rate already exists for this job', 409, [{
                    field: 'duplicate',
                    message: `Job Rate already exists with job_rate_id: ${existingJobRate.job_rate_id}`,
                }]);
        }
        // Create new job rate
        const data = await prisma_config_1.default.jobRate.create({
            data: req.body
        });
        return (0, response_1.sendSuccess)(res, data, 201);
    }
    catch (err) {
        console.error('Error creating Job Rate:', err);
        // Handle common Prisma errors
        if (err.code === 'P2003') {
            return (0, response_1.sendError)(res, 'Related job not found', 404);
        }
        return (0, response_1.sendError)(res, 'Failed to create Job Rate', 500);
    }
};
/**
 * Get job rate for a specific job
 * GET /api/job-rates/job/:jobId
 */
const getJobRateByJob = async (req, res) => {
    try {
        const { jobId } = req.params;
        if (!jobId) {
            return (0, response_1.sendError)(res, 'Job ID is required', 400);
        }
        // Fetch job rate for the specified job
        const jobRate = await prisma_config_1.default.jobRate.findFirst({
            where: {
                job_id: jobId,
            },
            include: {
                job: {
                    select: {
                        job_id: true,
                        job_title: true,
                        job_type: true,
                    },
                },
            },
        });
        if (!jobRate) {
            return (0, response_1.sendError)(res, 'Job Rate not found for this job', 404);
        }
        return (0, response_1.sendSuccess)(res, jobRate);
    }
    catch (err) {
        console.error('Error fetching Job Rate by Job:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch Job Rate', 500);
    }
};
// Export controller with custom create method and additional query
exports.jobRateController = {
    ...baseCrudMethods,
    create: createJobRate, // Override the default create method
    getJobRateByJob, // Add custom query method
};
//# sourceMappingURL=jobRateController.js.map