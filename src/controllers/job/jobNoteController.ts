import { Request, Response } from 'express';
import prisma from '../../prisma.config';
import { createCrudController } from '../../factories/crudFactory';
import { createJobNoteSchema, updateJobNoteSchema } from '../../validators/schemas';
import { sendSuccess, sendError } from '../../utils/response';

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
const baseCrudMethods = createCrudController({
  model: prisma.jobNote,
  modelName: 'Job Note',
  idField: 'job_note_id',
  createSchema: createJobNoteSchema,
  updateSchema: updateJobNoteSchema,
  defaultLimit: 20,
  maxLimit: 100,
});

/**
 * Custom create method with job validation
 * Ensures the job exists before creating a note
 */
const createJobNote = async (req: Request, res: Response) => {
  try {
    // Validate request body
    const validation = createJobNoteSchema.safeParse(req.body);
    if (!validation.success) {
      const errors = validation.error.issues.map((err: any) => ({
        field: err.path.join('.'),
        message: err.message,
      }));
      return sendError(res, 'Validation failed', 400, errors);
    }

    const { job_id } = req.body;

    // Check if job exists
    const job = await prisma.job.findUnique({
      where: { job_id },
      select: {
        job_id: true,
        job_title: true,
      },
    });

    if (!job) {
      return sendError(res, 'Job not found', 404);
    }

    // Create new job note
    const jobNote = await prisma.jobNote.create({
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

    return sendSuccess(res, jobNote, 201);
  } catch (err: any) {
    console.error('Error creating Job Note:', err);

    // Handle foreign key constraint error
    if (err.code === 'P2003') {
      return sendError(res, 'Related job not found', 404);
    }

    return sendError(res, 'Failed to create Job Note', 500);
  }
};

/**
 * Get all notes for a specific job
 * GET /api/job-notes/job/:jobId
 */
const getJobNotesByJob = async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const skip = (page - 1) * limit;

    if (!jobId) {
      return sendError(res, 'Job ID is required', 400);
    }

    // Check if job exists
    const job = await prisma.job.findUnique({
      where: { job_id: jobId },
      select: {
        job_id: true,
        job_title: true,
        status: true,
      },
    });

    if (!job) {
      return sendError(res, 'Job not found', 404);
    }

    // Fetch all notes for the specified job
    const [jobNotes, total] = await Promise.all([
      prisma.jobNote.findMany({
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
      prisma.jobNote.count({
        where: {
          job_id: jobId,
        },
      }),
    ]);

    return sendSuccess(res, {
      job,
      data: jobNotes,
      paging: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err: any) {
    console.error('Error fetching Job Notes by Job:', err);
    return sendError(res, 'Failed to fetch Job Notes', 500);
  }
};


// Export controller with custom methods
export const jobNoteController = {
  ...baseCrudMethods,
  create: createJobNote, // Override the default create method
  getJobNotesByJob, // Get all notes for a specific job
};