"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.jobDetailController = void 0;
const prisma_config_1 = __importDefault(require("../../prisma.config"));
const crudFactory_1 = require("../../factories/crudFactory");
const schemas_1 = require("../../validators/schemas");
const response_1 = require("../../utils/response");
/**
 * JobDetail CRUD Controller - Generated using CRUD Factory
 * Provides: GET all, GET by id, POST, PATCH, DELETE
 *
 * Validation Rules:
 * - job_id: Required UUID (unique, one-to-one with Job)
 * - description: Required, job description text
 * - skills: Optional array of skill strings
 *
 * Business Rule: One job can only have one job detail (one-to-one relationship)
 */
// Generate base CRUD methods
const baseCrudMethods = (0, crudFactory_1.createCrudController)({
    model: prisma_config_1.default.jobDetail,
    modelName: 'Job Detail',
    idField: 'job_detail_id',
    createSchema: schemas_1.createJobDetailSchema,
    updateSchema: schemas_1.updateJobDetailSchema,
    defaultLimit: 10,
    maxLimit: 100,
});
/**
 * Get job detail for a specific job
 * GET /api/job-details/job/:jobId
 */
const getJobDetailByJob = async (req, res) => {
    try {
        const { jobId } = req.params;
        if (!jobId) {
            return (0, response_1.sendError)(res, 'Job ID is required', 400);
        }
        // Fetch job detail for the specified job
        const jobDetail = await prisma_config_1.default.jobDetail.findUnique({
            where: {
                job_id: jobId,
            },
            include: {
                job: {
                    select: {
                        job_id: true,
                        job_title: true,
                        job_type: true,
                        status: true,
                        location: true,
                    },
                },
            },
        });
        if (!jobDetail) {
            return (0, response_1.sendError)(res, 'Job Detail not found for this job', 404);
        }
        return (0, response_1.sendSuccess)(res, jobDetail);
    }
    catch (err) {
        console.error('Error fetching Job Detail by Job:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch Job Detail', 500);
    }
};
// Export controller with additional query method
exports.jobDetailController = {
    ...baseCrudMethods,
    getJobDetailByJob, // Add custom query method
};
//# sourceMappingURL=jobDetailController.js.map