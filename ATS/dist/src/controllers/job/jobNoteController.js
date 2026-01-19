"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.jobNoteController = void 0;
const prisma_config_1 = __importDefault(require("../../prisma.config"));
const crudFactory_1 = require("../../factories/crudFactory");
const schemas_1 = require("../../validators/schemas");
const response_1 = require("../../utils/response");
/**
 * Job Note CRUD Controller - Generated using CRUD Factory with Zod validation
 * Provides: GET all, GET by id, POST (custom with job validation), PATCH, DELETE
 *
 * Validation Rules:
 * - job_id: Required UUID
 * - note: Required string (min 1 character)
 * - created_at: Auto-generated timestamp
 *
 * Business Context: Job notes are internal comments/updates for jobs
 * One job can have multiple notes (one-to-many relationship)
 */
// Generate base CRUD methods
const baseCrudMethods = (0, crudFactory_1.createCrudController)({
    model: prisma_config_1.default.jobNote,
    modelName: 'Job Note',
    idField: 'job_note_id',
    createSchema: schemas_1.createJobNoteSchema,
    updateSchema: schemas_1.updateJobNoteSchema,
    defaultLimit: 20,
    maxLimit: 100,
});
/**
 * Custom create method with job validation
 * Ensures the job exists before creating a note
 */
const createJobNote = async (req, res) => {
    try {
        // Validate request body
        const validation = schemas_1.createJobNoteSchema.safeParse(req.body);
        if (!validation.success) {
            const errors = validation.error.issues.map((err) => ({
                field: err.path.join('.'),
                message: err.message,
            }));
            return (0, response_1.sendError)(res, 'Validation failed', 400, errors);
        }
        const { job_id } = req.body;
        // Check if job exists
        const job = await prisma_config_1.default.job.findUnique({
            where: { job_id },
            select: {
                job_id: true,
                job_title: true,
            },
        });
        if (!job) {
            return (0, response_1.sendError)(res, 'Job not found', 404);
        }
        // Create new job note
        const jobNote = await prisma_config_1.default.jobNote.create({
            data: req.body,
            include: {
                job: {
                    select: {
                        job_id: true,
                        job_title: true,
                        status: true,
                    },
                },
            },
        });
        return (0, response_1.sendSuccess)(res, jobNote, 201);
    }
    catch (err) {
        console.error('Error creating Job Note:', err);
        // Handle foreign key constraint error
        if (err.code === 'P2003') {
            return (0, response_1.sendError)(res, 'Related job not found', 404);
        }
        return (0, response_1.sendError)(res, 'Failed to create Job Note', 500);
    }
};
/**
 * Get all notes for a specific job
 * GET /api/job-notes/job/:jobId
 */
const getJobNotesByJob = async (req, res) => {
    try {
        const { jobId } = req.params;
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
        const skip = (page - 1) * limit;
        if (!jobId) {
            return (0, response_1.sendError)(res, 'Job ID is required', 400);
        }
        // Check if job exists
        const job = await prisma_config_1.default.job.findUnique({
            where: { job_id: jobId },
            select: {
                job_id: true,
                job_title: true,
                status: true,
            },
        });
        if (!job) {
            return (0, response_1.sendError)(res, 'Job not found', 404);
        }
        // Fetch all notes for the specified job
        const [jobNotes, total] = await Promise.all([
            prisma_config_1.default.jobNote.findMany({
                where: {
                    job_id: jobId,
                },
                skip,
                take: limit,
                orderBy: {
                    created_at: 'desc', // Most recent notes first
                },
                include: {
                    job: {
                        select: {
                            job_id: true,
                            job_title: true,
                        },
                    },
                },
            }),
            prisma_config_1.default.jobNote.count({
                where: {
                    job_id: jobId,
                },
            }),
        ]);
        return (0, response_1.sendSuccess)(res, {
            job,
            data: jobNotes,
            paging: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        });
    }
    catch (err) {
        console.error('Error fetching Job Notes by Job:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch Job Notes', 500);
    }
};
// Export controller with custom methods
exports.jobNoteController = {
    ...baseCrudMethods,
    create: createJobNote, // Override the default create method
    getJobNotesByJob, // Get all notes for a specific job
};
//# sourceMappingURL=jobNoteController.js.map