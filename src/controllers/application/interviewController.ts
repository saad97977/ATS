import { Request, Response } from 'express';
import prisma from '../../prisma.config';
import { createCrudController } from '../../factories/crudFactory';
import { createInterviewSchema, updateInterviewSchema } from '../../validators/schemas';
import { sendSuccess, sendError } from '../../utils/response';

/**
 * Interview Controller - Custom CRUD for Interview management
 * Provides: GET all, GET by id, GET by application, POST, PATCH, DELETE
 * 
 * Validation Rules:
 * - application_id: Required UUID
 * - interview_date: Required datetime
 * - status: Required InterviewStatus enum (PENDING, COMPLETED_RESULT_PENDING, REJECTED, ACCEPTED)
 * 
 * Business Context: Manages interviews linked to job applications
 * Tracks interview scheduling and status throughout the hiring process
 */

// Generate base CRUD methods
const baseCrudMethods = createCrudController({
  model: prisma.interview,
  modelName: 'Interview',
  idField: 'interview_id',
  createSchema: createInterviewSchema,
  updateSchema: updateInterviewSchema,
  defaultLimit: 10,
  maxLimit: 100,
});

/**
 * Custom create method with application validation and duplicate check
 */
const createInterview = async (req: Request, res: Response) => {
  try {
    // Validate request body
    const validation = createInterviewSchema.safeParse(req.body);
    if (!validation.success) {
      const errors = validation.error.issues.map((err: any) => ({
        field: err.path.join('.'),
        message: err.message,
      }));
      return sendError(res, 'Validation failed', 400, errors);
    }

    const { application_id } = req.body;

    // Check if application exists
    const application = await prisma.application.findUnique({
      where: { application_id },
    });

    if (!application) {
      return sendError(res, 'Application not found', 404);
    }

    // Check if interview already exists for this application
    const existingInterview = await prisma.interview.findFirst({
      where: { application_id },
    });

    if (existingInterview) {
      return sendError(
        res,
        'Interview already exists for this application',
        409,
        [{
          field: 'duplicate',
          message: `Interview already exists with interview_id: ${existingInterview.interview_id}`,
        }]
      );
    }

    // Create new interview
    const interview = await prisma.interview.create({
      data: req.body,
      include: {
        application: {
          select: {
            application_id: true,
            job: {
              select: {
                job_title: true,
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

    return sendSuccess(res, interview, 201);
  } catch (err: any) {
    console.error('Error creating interview:', err);

    // Handle duplicate interview error (unique constraint violation)
    if (err.code === 'P2002') {
      return sendError(
        res, 
        'Interview already exists for this application', 
        409,
        [{
          field: 'application_id',
          message: 'An interview has already been scheduled for this application',
        }]
      );
    }

    // Handle foreign key constraint (application doesn't exist)
    if (err.code === 'P2003') {
      return sendError(res, 'Related application not found', 404);
    }

    return sendError(res, 'Failed to create interview', 500);
  }
};

/**
 * Override getById to include full related data
 * GET /api/interviews/:id
 */
const getInterviewById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!id) {
      return sendError(res, 'Interview ID is required', 400);
    }

    const interview = await prisma.interview.findUnique({
      where: { interview_id: id },
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
      },
    });

    if (!interview) {
      return sendError(res, 'Interview not found', 404);
    }

    return sendSuccess(res, interview);
  } catch (err: any) {
    console.error('Error fetching interview:', err);
    return sendError(res, 'Failed to fetch interview', 500);
  }
};

/**
 * Get all interviews for a specific application
 * GET /api/interviews/application/:applicationId
 */
const getInterviewsByApplication = async (req: Request, res: Response) => {
  try {
    const { applicationId } = req.params;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 10));
    const skip = (page - 1) * limit;

    if (!applicationId) {
      return sendError(res, 'Application ID is required', 400);
    }

    const [interviews, total] = await Promise.all([
      prisma.interview.findMany({
        where: {
          application_id: applicationId,
        },
        skip,
        take: limit,
        orderBy: { interview_date: 'desc' },
        include: {
          application: {
            select: {
              application_id: true,
              status: true,
              job: {
                select: {
                  job_id: true,
                  job_title: true,
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
        },
      }),
      prisma.interview.count({
        where: {
          application_id: applicationId,
        },
      }),
    ]);

    return sendSuccess(res, {
      data: interviews,
      paging: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err: any) {
    console.error('Error fetching interviews by application:', err);
    return sendError(res, 'Failed to fetch interviews', 500);
  }
};

/**
 * Get interviews by status
 * GET /api/interviews/status/:status
 */
const getInterviewsByStatus = async (req: Request, res: Response) => {
  try {
    const { status } = req.params;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 10));
    const skip = (page - 1) * limit;

    if (!status) {
      return sendError(res, 'Status is required', 400);
    }

    // Validate status enum
    const validStatuses = ['PENDING', 'COMPLETED_RESULT_PENDING', 'REJECTED', 'ACCEPTED'];
    const upperStatus = status.toUpperCase();

    if (!validStatuses.includes(upperStatus)) {
      return sendError(
        res,
        `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
        400
      );
    }

    const [interviews, total] = await Promise.all([
      prisma.interview.findMany({
        where: {
          status: upperStatus as any,
        },
        skip,
        take: limit,
        orderBy: { interview_date: 'desc' },
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
                      phone: true,
                    },
                  },
                },
              },
            },
          },
        },
      }),
      prisma.interview.count({
        where: {
          status: upperStatus as any,
        },
      }),
    ]);

    return sendSuccess(res, {
      data: interviews,
      paging: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
      filters: {
        status: upperStatus,
      },
    });
  } catch (err: any) {
    console.error('Error fetching interviews by status:', err);
    return sendError(res, 'Failed to fetch interviews', 500);
  }
};

/**
 * Get upcoming interviews (pending interviews scheduled for future dates)
 * GET /api/interviews/upcoming
 */
const getUpcomingInterviews = async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 10));
    const skip = (page - 1) * limit;
    const days = parseInt(req.query.days as string) || 7; // Default: next 7 days

    const now = new Date();
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + days);

    const [interviews, total] = await Promise.all([
      prisma.interview.findMany({
        where: {
          interview_date: {
            gte: now,
            lte: futureDate,
          },
          status: 'PENDING', // Only pending interviews are upcoming
        },
        skip,
        take: limit,
        orderBy: { interview_date: 'asc' },
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
      prisma.interview.count({
        where: {
          interview_date: {
            gte: now,
            lte: futureDate,
          },
          status: 'PENDING',
        },
      }),
    ]);

    return sendSuccess(res, {
      data: interviews,
      paging: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
      filters: {
        days,
        start_date: now,
        end_date: futureDate,
      },
    });
  } catch (err: any) {
    console.error('Error fetching upcoming interviews:', err);
    return sendError(res, 'Failed to fetch upcoming interviews', 500);
  }
};

/**
 * Get interviews by date range
 * GET /api/interviews/date-range
 */
const getInterviewsByDateRange = async (req: Request, res: Response) => {
  try {
    const { start_date, end_date } = req.query;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 10));
    const skip = (page - 1) * limit;

    if (!start_date || !end_date) {
      return sendError(res, 'Both start_date and end_date are required', 400);
    }

    const startDate = new Date(start_date as string);
    const endDate = new Date(end_date as string);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return sendError(res, 'Invalid date format. Use ISO 8601 format (YYYY-MM-DD)', 400);
    }

    if (startDate > endDate) {
      return sendError(res, 'start_date must be before end_date', 400);
    }

    const [interviews, total] = await Promise.all([
      prisma.interview.findMany({
        where: {
          interview_date: {
            gte: startDate,
            lte: endDate,
          },
        },
        skip,
        take: limit,
        orderBy: { interview_date: 'asc' },
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
                      phone: true,
                    },
                  },
                },
              },
            },
          },
        },
      }),
      prisma.interview.count({
        where: {
          interview_date: {
            gte: startDate,
            lte: endDate,
          },
        },
      }),
    ]);

    return sendSuccess(res, {
      data: interviews,
      paging: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
      filters: {
        start_date: startDate,
        end_date: endDate,
      },
    });
  } catch (err: any) {
    console.error('Error fetching interviews by date range:', err);
    return sendError(res, 'Failed to fetch interviews', 500);
  }
};

/**
 * Get interview statistics
 * GET /api/interviews/stats
 */
const getInterviewStats = async (req: Request, res: Response) => {
  try {
    const stats = await prisma.interview.groupBy({
      by: ['status'],
      _count: {
        interview_id: true,
      },
    });

    const formattedStats = stats.map(stat => ({
      status: stat.status,
      count: stat._count.interview_id,
    }));

    const total = formattedStats.reduce((sum, stat) => sum + stat.count, 0);

    // Get upcoming interviews count (next 7 days, pending only)
    const now = new Date();
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 7);

    const upcomingCount = await prisma.interview.count({
      where: {
        interview_date: {
          gte: now,
          lte: futureDate,
        },
        status: 'PENDING',
      },
    });

    return sendSuccess(res, {
      total,
      by_status: formattedStats,
      upcoming_next_7_days: upcomingCount,
    });
  } catch (err: any) {
    console.error('Error fetching interview stats:', err);
    return sendError(res, 'Failed to fetch interview statistics', 500);
  }
};

// Export controller with custom methods
export const interviewController = {
  ...baseCrudMethods,
  create: createInterview, // Override create method
  getById: getInterviewById, // Override with full details
  getInterviewsByApplication, // Custom query by application
  getInterviewsByStatus, // Custom query by status
  getUpcomingInterviews, // Custom query for upcoming interviews
  getInterviewsByDateRange, // Custom query by date range
  getInterviewStats, // Get interview statistics
};