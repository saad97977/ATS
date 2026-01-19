import { Request, Response } from 'express';
import prisma from '../../prisma.config';
import { createCrudController } from '../../factories/crudFactory';
import { createJobOwnerSchema, updateJobOwnerSchema } from '../../validators/schemas';
import { sendSuccess, sendError } from '../../utils/response';

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
const baseCrudMethods = createCrudController({
  model: prisma.jobOwner,
  modelName: 'Job Owner',
  idField: 'job_owner_id',
  createSchema: createJobOwnerSchema,
  updateSchema: updateJobOwnerSchema,
  defaultLimit: 10,
  maxLimit: 100,
});

/**
 * Custom create method with duplicate check
 * Prevents creating duplicate job owner records with same job_id, user_id, and role_type
 */
const createJobOwner = async (req: Request, res: Response) => {
  try {
    // Validate request body
    const validation = createJobOwnerSchema.safeParse(req.body);
    if (!validation.success) {
      const errors = validation.error.issues.map((err: any) => ({
        field: err.path.join('.'),
        message: err.message,
      }));
      return sendError(res, 'Validation failed', 400, errors);
    }

    const { job_id, user_id, role_type } = req.body;

    // Check for existing record with same job_id, user_id, and role_type
    const existingJobOwner = await prisma.jobOwner.findFirst({
      where: {
        job_id,
        user_id,
        role_type,
      },
    });

    if (existingJobOwner) {
      return sendError(
        res,
        'Job Owner with this combination already exists',
        409,
        [{
          field: 'duplicate',
          message: `Job Owner already exists with job_owner_id: ${existingJobOwner.job_owner_id}`,
        }]
      );
    }

    // Create new job owner
    const data = await prisma.jobOwner.create({ 
      data: req.body 
    });

    return sendSuccess(res, data, 201);
  } catch (err: any) {
    console.error('Error creating Job Owner:', err);

    // Handle common Prisma errors
    if (err.code === 'P2003') {
      return sendError(res, 'Related job or user not found', 404);
    }

    return sendError(res, 'Failed to create Job Owner', 500);
  }
};

/**
 * Get all job owners for a specific job
 * GET /api/job-owners/job/:jobId
 */
const getJobOwnersByJob = async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;

    if (!jobId) {
      return sendError(res, 'Job ID is required', 400);
    }

    // Fetch all job owners for the specified job with user details
    const jobOwners = await prisma.jobOwner.findMany({
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

    return sendSuccess(res, {
      job_id: jobId,
      total: jobOwners.length,
      job_owners: jobOwners,
    });
  } catch (err: any) {
    console.error('Error fetching Job Owners by Job:', err);
    return sendError(res, 'Failed to fetch Job Owners', 500);
  }
};

// Export controller with custom create method and additional query
export const jobOwnerController = {
  ...baseCrudMethods,
  create: createJobOwner, // Override the default create method
  getJobOwnersByJob, // Add custom query method
};