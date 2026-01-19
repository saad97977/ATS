import { Request, Response } from 'express';
import prisma from '../../prisma.config';
import { createCrudController } from '../../factories/crudFactory';
import { createJobRateSchema, updateJobRateSchema } from '../../validators/schemas';
import { sendSuccess, sendError } from '../../utils/response';

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
const baseCrudMethods = createCrudController({
  model: prisma.jobRate,
  modelName: 'Job Rate',
  idField: 'job_rate_id',
  createSchema: createJobRateSchema,
  updateSchema: updateJobRateSchema,
  defaultLimit: 10,
  maxLimit: 100,
});

/**
 * Custom create method with duplicate check
 * Ensures one job can only have one job rate
 */
const createJobRate = async (req: Request, res: Response) => {
  try {
    // Validate request body
    const validation = createJobRateSchema.safeParse(req.body);
    if (!validation.success) {
      const errors = validation.error.issues.map((err: any) => ({
        field: err.path.join('.'),
        message: err.message,
      }));
      return sendError(res, 'Validation failed', 400, errors);
    }

    const { job_id } = req.body;

    // Check for existing job rate for this job
    const existingJobRate = await prisma.jobRate.findFirst({
      where: {
        job_id,
      },
    });

    if (existingJobRate) {
      return sendError(
        res,
        'Job Rate already exists for this job',
        409,
        [{
          field: 'duplicate',
          message: `Job Rate already exists with job_rate_id: ${existingJobRate.job_rate_id}`,
        }]
      );
    }

    // Create new job rate
    const data = await prisma.jobRate.create({ 
      data: req.body 
    });

    return sendSuccess(res, data, 201);
  } catch (err: any) {
    console.error('Error creating Job Rate:', err);

    // Handle common Prisma errors
    if (err.code === 'P2003') {
      return sendError(res, 'Related job not found', 404);
    }

    return sendError(res, 'Failed to create Job Rate', 500);
  }
};

/**
 * Get job rate for a specific job
 * GET /api/job-rates/job/:jobId
 */
const getJobRateByJob = async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;

    if (!jobId) {
      return sendError(res, 'Job ID is required', 400);
    }

    // Fetch job rate for the specified job
    const jobRate = await prisma.jobRate.findFirst({
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
      return sendError(res, 'Job Rate not found for this job', 404);
    }

    return sendSuccess(res, jobRate);
  } catch (err: any) {
    console.error('Error fetching Job Rate by Job:', err);
    return sendError(res, 'Failed to fetch Job Rate', 500);
  }
};

// Export controller with custom create method and additional query
export const jobRateController = {
  ...baseCrudMethods,
  create: createJobRate, // Override the default create method
  getJobRateByJob, // Add custom query method
};