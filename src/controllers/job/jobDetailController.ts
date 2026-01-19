import { Request, Response } from 'express';
import prisma from '../../prisma.config';
import { createCrudController } from '../../factories/crudFactory';
import { createJobDetailSchema, updateJobDetailSchema } from '../../validators/schemas';
import { sendSuccess, sendError } from '../../utils/response';

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
const baseCrudMethods = createCrudController({
  model: prisma.jobDetail,
  modelName: 'Job Detail',
  idField: 'job_detail_id',
  createSchema: createJobDetailSchema,
  updateSchema: updateJobDetailSchema,
  defaultLimit: 10,
  maxLimit: 100,
});

/**
 * Get job detail for a specific job
 * GET /api/job-details/job/:jobId
 */
const getJobDetailByJob = async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;

    if (!jobId) {
      return sendError(res, 'Job ID is required', 400);
    }

    // Fetch job detail for the specified job
    const jobDetail = await prisma.jobDetail.findUnique({
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
      return sendError(res, 'Job Detail not found for this job', 404);
    }

    return sendSuccess(res, jobDetail);
  } catch (err: any) {
    console.error('Error fetching Job Detail by Job:', err);
    return sendError(res, 'Failed to fetch Job Detail', 500);
  }
};

// Export controller with additional query method
export const jobDetailController = {
  ...baseCrudMethods,
  getJobDetailByJob, // Add custom query method
};