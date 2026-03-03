import { Request, Response } from 'express';
import prisma from '../../prisma.config';
import { createCrudController } from '../../factories/crudFactory';
import { createJobSchema, updateJobSchema } from '../../validators/schemas';
import { sendSuccess, sendError } from '../../utils/response';
import { z } from 'zod';
import { updateUserActivity } from '../../services/activityService';


/**
 * Job Controller - Custom CRUD for Job management
 * Provides: GET all, GET by id, GET by organization, GET by status, POST, PATCH, DELETE
 *
 * Validation Rules:
 * - organization_id: Required UUID
 * - manager_id: Optional UUID
 * - job_title: Required string
 * - status: Enum (DRAFT, PENDING, OPEN, CLOSED, DECLINED)
 * - job_type: Enum (TEMPORARY, PERMANENT)
 * - location: Required string
 * - approved: Boolean (derived from status: OPEN = approved)
 *
 * Business Context: Manages job postings and their lifecycle
 * Status Flow: DRAFT -> PENDING (on create) -> OPEN (on approve) / DECLINED (on decline) -> CLOSED (auto/manual)
 */

// Generate base CRUD methods
const baseCrudMethods = createCrudController({
  model: prisma.job,
  modelName: 'Job',
  idField: 'job_id',
  createSchema: createJobSchema,
  updateSchema: updateJobSchema,
  defaultLimit: 10,
  maxLimit: 100,
});

/**
 * Custom create method with validation and duplicate check
 * New jobs are created with PENDING status by default
 */
const createJob = async (req: Request, res: Response) => {
  try {
    // Validate request body
    const validation = createJobSchema.safeParse(req.body);
    if (!validation.success) {
      const errors = validation.error.issues.map((err: any) => ({
        field: err.path.join('.'),
        message: err.message,
      }));
      return sendError(res, 'Validation failed', 400, errors);
    }

    const { organization_id, manager_id, job_title } = req.body;

    // Check if organization exists
    const organization = await prisma.organization.findUnique({
      where: { organization_id },
    });

    if (!organization) {
      return sendError(res, 'Organization not found', 404);
    }

    // Check if manager exists (if provided)
    if (manager_id) {
      const manager = await prisma.user.findUnique({
        where: { user_id: manager_id },
      });

      if (!manager) {
        return sendError(res, 'Manager not found', 404);
      }
    }

    // Check for duplicate job (same title and organization, excluding CLOSED and DECLINED)
    const existingJob = await prisma.job.findFirst({
      where: {
        organization_id,
        job_title,
        status: {
          in: ['OPEN', 'PENDING', 'DRAFT'],
        },
      },
    });

    if (existingJob) {
      return sendError(
        res,
        'Active job with this title already exists for this organization',
        409,
        [{
          field: 'duplicate',
          message: `Job already exists with job_id: ${existingJob.job_id}`,
        }]
      );
    }

    // Create new job with PENDING status by default
    const job = await prisma.job.create({
      data: {
        ...req.body,
        status: 'PENDING', // Always start with PENDING
        approved: false, // Not approved until status is OPEN
      },
      include: {
        organization: {
          select: {
            organization_id: true,
            name: true,
            status: true,
          },
        },
        manager: {
          select: {
            user_id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    return sendSuccess(res, job, 201);
  } catch (err: any) {
    console.error('Error creating job:', err);

    if (err.code === 'P2003') {
      return sendError(res, 'Related organization or manager not found', 404);
    }

    return sendError(res, 'Failed to create job', 500);
  }
};

/**
 * Approve a job - Changes status from PENDING to OPEN
 * PATCH /api/jobs/:id/approve
 */
const approveJob = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!id) {
      return sendError(res, 'Job ID is required', 400);
    }

    // Check if job exists
    const existingJob = await prisma.job.findUnique({
      where: { job_id: id },
    });

    if (!existingJob) {
      return sendError(res, 'Job not found', 404);
    }

    // Check if job is in PENDING status
    if (existingJob.status !== 'PENDING') {
      return sendError(
        res, 
        `Cannot approve job. Current status is ${existingJob.status}. Only PENDING jobs can be approved.`, 
        400
      );
    }

    // Update job status to OPEN
    const updatedJob = await prisma.job.update({
      where: { job_id: id },
      data: {
        status: 'OPEN',
        approved: true,
      },
      include: {
        organization: {
          select: {
            organization_id: true,
            name: true,
            status: true,
          },
        },
        manager: {
          select: {
            user_id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    // Log user activity
    if (existingJob.created_by_user_id) {
      await updateUserActivity(existingJob.created_by_user_id, {
        action_type: 'APPROVE',
        entity_type: 'JOB',
        entity_id: id,
        entity_name: updatedJob.job_title,
        timestamp: new Date().toISOString(),
      });
    }

    return sendSuccess(res, updatedJob);
  } catch (err: any) {
    console.error('Error approving job:', err);
    return sendError(res, 'Failed to approve job', 500);
  }
};

/**
 * Decline a job - Changes status from PENDING to DECLINED
 * PATCH /api/jobs/:id/decline
 */
const declineJob = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { reason } = req.body || {}; // Optional decline reason

    if (!id) {
      return sendError(res, 'Job ID is required', 400);
    }

    // Check if job exists
    const existingJob = await prisma.job.findUnique({
      where: { job_id: id },
    });

    if (!existingJob) {
      return sendError(res, 'Job not found', 404);
    }

    // Check if job is in PENDING status
    if (existingJob.status !== 'PENDING') {
      return sendError(
        res, 
        `Cannot decline job. Current status is ${existingJob.status}. Only PENDING jobs can be declined.`, 
        400
      );
    }

    // Update job status to DECLINED
    const updatedJob = await prisma.job.update({
      where: { job_id: id },
      data: {
        status: 'DECLINED',
        approved: false,
      },
      include: {
        organization: {
          select: {
            organization_id: true,
            name: true,
            status: true,
          },
        },
        manager: {
          select: {
            user_id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    // Log user activity
    if (existingJob.created_by_user_id) {
      await updateUserActivity(existingJob.created_by_user_id, {
        action_type: 'DECLINE',
        entity_type: 'JOB',
        entity_id: id,
        entity_name: updatedJob.job_title,
        timestamp: new Date().toISOString(),
      });
    }

    return sendSuccess(res, updatedJob);
  } catch (err: any) {
    console.error('Error declining job:', err);
    return sendError(res, 'Failed to decline job', 500);
  }
};

/**
 * Auto-close jobs past end_date
 * CRON job or manual trigger: PATCH /api/jobs/auto-close
 */
const autoCloseExpiredJobs = async (req: Request, res: Response) => {
  try {
    const now = new Date();

    // Find jobs that are past their end_date and still OPEN
    const expiredJobs = await prisma.job.findMany({
      where: {
        status: 'OPEN',
        end_date: {
          lte: now,
        },
      },
    });

    if (expiredJobs.length === 0) {
      return sendSuccess(res, {
        message: 'No expired jobs found',
        closed_count: 0,
      });
    }

    // Close all expired jobs
    const result = await prisma.job.updateMany({
      where: {
        job_id: {
          in: expiredJobs.map(job => job.job_id),
        },
      },
      data: {
        status: 'CLOSED',
        approved: false, // Closed jobs are no longer considered approved
      },
    });

    return sendSuccess(res, {
      message: 'Expired jobs closed successfully',
      closed_count: result.count,
      jobs_closed: expiredJobs.map(job => ({
        job_id: job.job_id,
        job_title: job.job_title,
        end_date: job.end_date,
      })),
    });
  } catch (err: any) {
    console.error('Error auto-closing expired jobs:', err);
    return sendError(res, 'Failed to auto-close expired jobs', 500);
  }
};

/**
 * Get jobs by status
 * GET /api/jobs/status/:status (DRAFT, PENDING, OPEN, CLOSED, DECLINED)
 */
const getJobsByStatus = async (req: Request, res: Response) => {
  try {
    const { status } = req.params;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 10));
    const skip = (page - 1) * limit;

    if (!status) {
      return sendError(res, 'Status is required', 400);
    }

    const validStatuses = ['DRAFT', 'PENDING', 'OPEN', 'CLOSED', 'DECLINED'];
    if (!validStatuses.includes(status.toUpperCase())) {
      return sendError(res, 'Invalid status. Must be DRAFT, PENDING, OPEN, CLOSED, or DECLINED', 400);
    }

    const [jobs, total] = await Promise.all([
      prisma.job.findMany({
        where: {
          status: status.toUpperCase() as any,
        },
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
        include: {
          organization: {
            select: {
              organization_id: true,
              name: true,
              status: true,
            },
          },
          manager: {
            select: {
              user_id: true,
              name: true,
              email: true,
            },
          },
          created_by: {
            select: {
              user_id: true,
              name: true,
              email: true,
            },
          },
          _count: {
            select: {
              applications: true,
            },
          },
        },
      }),
      prisma.job.count({
        where: {
          status: status.toUpperCase() as any,
        },
      }),
    ]);

    return sendSuccess(res, {
      data: jobs,
      paging: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err: any) {
    console.error('Error fetching jobs by status:', err);
    return sendError(res, 'Failed to fetch jobs', 500);
  }
};

/**
 * Override getById to include full related data
 * GET /api/jobs/:id
 */
const getJobById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!id) {
      return sendError(res, 'Job ID is required', 400);
    }

    const job = await prisma.job.findUnique({
      where: { job_id: id },
      include: {
        organization: {
          include: {
            addresses: true,
            contacts: true,
            company_offices: true,
          },
        },
        manager: {
          select: {
            user_id: true,
            name: true,
            email: true,
          },
        },
        created_by: {
          select: {
            user_id: true,
            name: true,
            email: true,
          },
        },
        company_office: {
          select: {
            company_office_id: true,
            office_name: true,
            city: true,
            state: true,
            country: true,
            type: true,
            address: true,
            is_primary: true,
          },
        },
        job_detail: true,
        job_owners: {
          include: {
            user: {
              select: {
                user_id: true,
                name: true,
                email: true,
              },
            },
          },
        },
        job_notes: {
          orderBy: { created_at: 'desc' },
        },
        job_postings: true,
        job_rates: true,
        _count: {
          select: {
            applications: true,
          },
        },
      },
    });

    if (!job) {
      return sendError(res, 'Job not found', 404);
    }

    const { _count, ...jobData } = job;
    return sendSuccess(res, {
      ...jobData,
      applications_count: _count.applications,
    });
  } catch (err: any) {
    console.error('Error fetching job:', err);
    return sendError(res, 'Failed to fetch job', 500);
  }
};

/**
 * Get all jobs for a specific organization
 * GET /api/jobs/organization/:organizationId
 */
const getJobsByOrganization = async (req: Request, res: Response) => {
  try {
    const { organizationId } = req.params;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 10));
    const skip = (page - 1) * limit;

    if (!organizationId) {
      return sendError(res, 'Organization ID is required', 400);
    }

    const [jobs, total] = await Promise.all([
      prisma.job.findMany({
        where: {
          organization_id: organizationId,
        },
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
        include: {
          organization: {
            select: {
              organization_id: true,
              name: true,
              status: true,
            },
          },
          manager: {
            select: {
              user_id: true,
              name: true,
              email: true,
            },
          },
          job_detail: true,
          created_by: {
            select: {
              user_id: true,
            },
          },
          _count: {
            select: {
              applications: true,
              job_owners: true,
            },
          },
        },
      }),
      prisma.job.count({
        where: {
          organization_id: organizationId,
        },
      }),
    ]);

    // Transform the data to match the desired format
    const transformedJobs = jobs.map(job => ({
      job_id: job.job_id,
      job_title: job.job_title,
      status: job.status,
      job_type: job.job_type,
      location: job.location,
      approved: job.approved,
      days_active: job.days_active,
      days_inactive: job.days_inactive,
      start_date: job.start_date,
      end_date: job.end_date,
      created_at: job.created_at,
      organization_id: job.organization?.organization_id || null,
      organization_name: job.organization?.name || null,
      organization_status: job.organization?.status || null,
      manager_id: job.manager?.user_id || null,
      manager_name: job.manager?.name || 'N/A',
      manager_email: job.manager?.email || 'N/A',
      applications_count: job._count?.applications || 0,
      job_owners_count: job._count?.job_owners || 0,
      created_by_user_id: job.created_by?.user_id || null,
    }));

    return sendSuccess(res, {
      data: transformedJobs,
      paging: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err: any) {
    console.error('Error fetching jobs by organization:', err);
    return sendError(res, 'Failed to fetch jobs', 500);
  }
};

/**
 * Get jobs by type
 * GET /api/jobs/type/:type (TEMPORARY, PERMANENT)
 */
const getJobsByType = async (req: Request, res: Response) => {
  try {
    const { type } = req.params;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 10));
    const skip = (page - 1) * limit;

    if (!type) {
      return sendError(res, 'Type is required', 400);
    }

    const [jobs, total] = await Promise.all([
      prisma.job.findMany({
        where: {
          job_type: type.toUpperCase() as any,
        },
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
        include: {
          organization: {
            select: {
              name: true,
            },
          },
          manager: {
            select: {
              name: true,
            },
          },
        },
      }),
      prisma.job.count({
        where: {
          job_type: type.toUpperCase() as any,
        },
      }),
    ]);

    return sendSuccess(res, {
      data: jobs,
      paging: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err: any) {
    console.error('Error fetching jobs by type:', err);
    return sendError(res, 'Failed to fetch jobs', 500);
  }
};

/**
 * Get jobs by manager
 * GET /api/jobs/manager/:managerId?approved=true/false
 */
const getJobsByManager = async (req: Request, res: Response) => {
  try {
    const { managerId } = req.params;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 10));
    const skip = (page - 1) * limit;
    
    // Get the approved filter from query params
    const approvedQuery = req.query.approved as string;

    if (!managerId) {
      return sendError(res, 'Manager ID is required', 400);
    }

    // Build the where clause
    const whereClause: any = {
      manager_id: managerId,
    };

    // Add approved filter if provided (approved means status is OPEN)
    if (approvedQuery !== undefined) {
      if (approvedQuery === 'true') {
        whereClause.status = 'OPEN';
      } else if (approvedQuery === 'false') {
        whereClause.status = {
          not: 'OPEN',
        };
      }
    }

    const [jobs, total] = await Promise.all([
      prisma.job.findMany({
        where: whereClause,
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
        include: {
          organization: {
            select: {
              name: true,
            },
          },
          job_detail: true,
        },
      }),
      prisma.job.count({
        where: whereClause,
      }),
    ]);

    return sendSuccess(res, {
      data: jobs,
      paging: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err: any) {
    console.error('Error fetching jobs by manager:', err);
    return sendError(res, 'Failed to fetch jobs', 500);
  }
};

/**
 * Get approved jobs (status = OPEN)
 * GET /api/jobs/approved
 */
const getApprovedJobs = async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 10));
    const skip = (page - 1) * limit;

    const [jobs, total] = await Promise.all([
      prisma.job.findMany({
        where: {
          status: 'OPEN',
        },
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
        include: {
          organization: {
            select: {
              name: true,
            },
          },
          manager: {
            select: {
              name: true,
            },
          },
        },
      }),
      prisma.job.count({
        where: {
          status: 'OPEN',
        },
      }),
    ]);

    return sendSuccess(res, {
      data: jobs,
      paging: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err: any) {
    console.error('Error fetching approved jobs:', err);
    return sendError(res, 'Failed to fetch approved jobs', 500);
  }
};

/**
 * Get active jobs (OPEN status)
 * GET /api/jobs/active
 */
const getActiveJobs = async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 10));
    const skip = (page - 1) * limit;

    const [jobs, total] = await Promise.all([
      prisma.job.findMany({
        where: {
          status: 'OPEN',
        },
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
        include: {
          organization: {
            select: {
              name: true,
            },
          },
          manager: {
            select: {
              name: true,
            },
          },
          job_detail: true,
          _count: {
            select: {
              applications: true,
            },
          },
        },
      }),
      prisma.job.count({
        where: {
          status: 'OPEN',
        },
      }),
    ]);

    return sendSuccess(res, {
      data: jobs,
      paging: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err: any) {
    console.error('Error fetching active jobs:', err);
    return sendError(res, 'Failed to fetch active jobs', 500);
  }
};

/**
 * Get job statistics
 * GET /api/jobs/stats
 */
const getJobStats = async (req: Request, res: Response) => {
  try {
    const { organization_id } = req.query;

    const whereClause: any = {};
    if (organization_id) whereClause.organization_id = organization_id as string;

    const [
      totalJobs,
      byStatus,
      byType,
      openCount,
      pendingCount,
    ] = await Promise.all([
      prisma.job.count({ where: whereClause }),
      prisma.job.groupBy({
        by: ['status'],
        where: whereClause,
        _count: { job_id: true },
      }),
      prisma.job.groupBy({
        by: ['job_type'],
        where: whereClause,
        _count: { job_id: true },
      }),
      prisma.job.count({
        where: { ...whereClause, status: 'OPEN' },
      }),
      prisma.job.count({
        where: { ...whereClause, status: 'PENDING' },
      }),
    ]);

    return sendSuccess(res, {
      total: totalJobs,
      open: openCount,
      pending: pendingCount,
      by_status: byStatus.map(s => ({
        status: s.status,
        count: s._count.job_id,
      })),
      by_type: byType.map(t => ({
        type: t.job_type,
        count: t._count.job_id,
      })),
    });
  } catch (err: any) {
    console.error('Error fetching job stats:', err);
    return sendError(res, 'Failed to fetch job statistics', 500);
  }
};

/**
 * Get all jobs with detailed information for table view
 * GET /api/jobs/table-view
 */
const getJobs = async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 10));
    const skip = (page - 1) * limit;

    // Optional filters
    const { status, job_type, approved, organization_id } = req.query;
    
    const whereClause: any = {};
    if (status) whereClause.status = (status as string).toUpperCase();
    if (job_type) whereClause.job_type = (job_type as string).toUpperCase();
    // approved filter: true = OPEN, false = not OPEN
    if (approved !== undefined) {
      whereClause.status = approved === 'true' ? 'OPEN' : { not: 'OPEN' };
    }
    if (organization_id) whereClause.organization_id = organization_id as string;

    const [jobs, total] = await Promise.all([
      prisma.job.findMany({
        where: whereClause,
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
        include: {
          organization: {
            select: {
              name: true,
              status: true,
            },
          },
          manager: {
            select: {
              name: true,
              email: true,
            },
          },
          created_by : {
            select: {
              name: true,
              email: true,
            },
          },
          _count: {
            select: {
              applications: true,
              job_owners: true,
            },
          },
        },
      }),
      prisma.job.count({ where: whereClause }),
    ]);

    // Transform data for table view
    const tableData = jobs.map(job => ({
      job_id: job.job_id,
      job_title: job.job_title,
      status: job.status,
      job_type: job.job_type,
      location: job.location,
      approved: job.approved,
      days_active: job.days_active,
      days_inactive: job.days_inactive,
      start_date: job.start_date,
      end_date: job.end_date,
      created_at: job.created_at,
      
      // Organization details
      organization_id: job.organization_id,
      organization_name: job.organization?.name || 'N/A',
      organization_status: job.organization?.status || null,
      
      // Manager details
      manager_id: job.manager_id,
      manager_name: job.manager?.name || 'N/A',
      manager_email: job.manager?.email || 'N/A',
      
      // Counts
      applications_count: job._count.applications,
      job_owners_count: job._count.job_owners,
      
      // Created by
      created_by_user_id: job.created_by_user_id,
    }));

    return sendSuccess(res, {
      data: tableData,
      paging: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err: any) {
    console.error('Error fetching jobs table view:', err);
    return sendError(res, 'Failed to fetch jobs table view', 500);
  }
};

/**
 * Job Complete Update Controller
 * PATCH request to update Job with all related data in a single transaction
 */

// Validation Schemas for nested updates
const jobDetailUpdateSchema = z.object({
  job_detail_id: z.string().uuid().optional(),
  description: z.string().min(1, 'Job description is required').optional(),
  skills: z.any().optional(),
  _action: z.enum(['create', 'update']).optional(),
});

const jobNoteUpdateSchema = z.object({
  job_note_id: z.string().uuid().optional(),
  note: z.string().min(1, 'Note content is required').optional(),
  _action: z.enum(['create', 'update', 'delete']).optional(),
});

const jobRateUpdateSchema = z.object({
  job_rate_id: z.string().uuid().optional(),
  pay_rate: z.number().optional(),
  bill_rate: z.number().min(0, 'Bill rate must be positive').optional(),
  markup_percentage: z.number().optional(),
  overtime_rule: z.string().optional(),
  hours: z.number().int().min(0, 'Hours must be a positive integer').optional(),
  ot_pay_rate: z.number().optional(),
  ot_bill_rate: z.number().optional(),
  _action: z.enum(['create', 'update', 'delete']).optional(),
});

const jobOwnerUpdateSchema = z.object({
  job_owner_id: z.string().uuid().optional(),
  user_id: z.string().uuid('Valid user ID is required').optional(),
  role_type: z.enum(['SALES', 'RECRUITER']).optional(),
  _action: z.enum(['create', 'update', 'delete']).optional(),
});

const updateJobCompleteSchema = z.object({
  // Job base fields (all optional for PATCH)
  organization_id: z.string().uuid('Valid organization ID is required').optional(),
  manager_id: z.string().uuid('Valid manager ID is required').optional().nullable(),
  company_office_id: z.string().uuid('Valid company office ID is required').optional().nullable(),
  job_title: z.string().min(1, 'Job title is required').optional(),
  status: z.enum(['DRAFT', 'PENDING', 'OPEN', 'CLOSED', 'DECLINED']).optional(),
  job_type: z.enum(['TEMPORARY', 'PERMANENT']).optional(),
  location: z.string().min(1, 'Location is required').optional(),
  days_active: z.number().int().optional().nullable(),
  days_inactive: z.number().int().optional().nullable(),
  start_date: z.string().datetime().optional().nullable(),
  end_date: z.string().datetime().optional().nullable(),
  
  // New fields
  max_positions: z.number().int().min(1, 'Max positions must be at least 1').optional().nullable(),
  open_positions: z.number().int().min(0, 'Open positions cannot be negative').optional().nullable(),
  resume_required: z.boolean().optional(),
  interview_Round1: z.boolean().optional(),
  interview_Round2: z.boolean().optional(),
  interview_rounds: z.number().int().min(0).optional().nullable(),
  
  // Related entities
  job_detail: jobDetailUpdateSchema.optional(),
  job_notes: z.array(jobNoteUpdateSchema).optional(),
  job_rates: z.array(jobRateUpdateSchema).optional(),
  job_owners: z.array(jobOwnerUpdateSchema).optional(),
});

/**
 * PATCH /api/jobs/:id
 * Updates job with all related data in a single transaction
 */
const updateJobComplete = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!id) {
      return sendError(res, 'Job ID is required', 400);
    }

    // Validate request body
    const validation = updateJobCompleteSchema.safeParse(req.body);
    
    if (!validation.success) {
      const errors = validation.error.issues.map((err: any) => ({
        field: err.path.join('.'),
        message: err.message,
      }));
      return sendError(res, 'Validation failed', 400, errors);
    }

    const { 
      organization_id,
      manager_id,
      company_office_id,
      job_title,
      status,
      job_type,
      location,
      days_active,
      days_inactive,
      start_date,
      end_date,
      max_positions,
      open_positions,
      resume_required,
      interview_Round1,
      interview_Round2,
      interview_rounds,
      job_detail,
      job_notes,
      job_rates,
      job_owners,
    } = validation.data;

    // Check if job exists
    const existingJob = await prisma.job.findUnique({
      where: { job_id: id },
      include: {
        job_detail: true,
        job_notes: true,
        job_rates: true,
        job_owners: true,
      },
    });

    if (!existingJob) {
      return sendError(res, 'Job not found', 404);
    }

    // Check if organization exists (if updating)
    if (organization_id && organization_id !== existingJob.organization_id) {
      const organizationExists = await prisma.organization.findUnique({
        where: { organization_id },
      });

      if (!organizationExists) {
        return sendError(res, 'Organization not found', 404);
      }
    }

    // Check if manager exists (if updating)
    if (manager_id !== undefined && manager_id !== null) {
      const managerExists = await prisma.user.findUnique({
        where: { user_id: manager_id },
      });

      if (!managerExists) {
        return sendError(res, 'Manager user not found', 404);
      }
    }

    // Check if company office exists and belongs to the organization (if updating)
    if (company_office_id !== undefined && company_office_id !== null) {
      const checkOrgId = organization_id || existingJob.organization_id;
      
      const companyOfficeExists = await prisma.companyOffice.findFirst({
        where: { 
          company_office_id,
          organization_id: checkOrgId,
        },
      });

      if (!companyOfficeExists) {
        return sendError(res, 'Company office not found or does not belong to the organization', 404);
      }
    }

    // Validate job owner users exist (if updating)
    if (job_owners && job_owners.length > 0) {
      const newOwnerUserIds = job_owners
        .filter(owner => owner._action !== 'delete' && owner.user_id)
        .map(owner => owner.user_id!);

      if (newOwnerUserIds.length > 0) {
        const ownersExist = await prisma.user.findMany({
          where: { user_id: { in: newOwnerUserIds } },
          select: { user_id: true },
        });

        if (ownersExist.length !== newOwnerUserIds.length) {
          const foundIds = ownersExist.map(u => u.user_id);
          const missingIds = newOwnerUserIds.filter(id => !foundIds.includes(id));
          return sendError(
            res, 
            `Job owner user(s) not found: ${missingIds.join(', ')}`, 
            404
          );
        }

        // Check for duplicate user_id in job_owners
        const existingOwnerUserIds = existingJob.job_owners
          .filter(owner => !job_owners.some(jo => jo.job_owner_id === owner.job_owner_id && jo._action === 'delete'))
          .map(owner => owner.user_id);

        const allOwnerUserIds = [...existingOwnerUserIds, ...newOwnerUserIds];
        const uniqueOwnerIds = new Set(allOwnerUserIds);
        
        if (uniqueOwnerIds.size !== allOwnerUserIds.length) {
          return sendError(res, 'Duplicate user IDs found in job_owners', 400);
        }
      }
    }

    // Validate date range if updating dates
    const finalStartDate = start_date !== undefined ? start_date : existingJob.start_date?.toISOString();
    const finalEndDate = end_date !== undefined ? end_date : existingJob.end_date?.toISOString();

    if (finalStartDate && finalEndDate) {
      const startDateTime = new Date(finalStartDate);
      const endDateTime = new Date(finalEndDate);
      
      if (startDateTime >= endDateTime) {
        return sendError(res, 'Start date must be before end date', 400);
      }
    }

    // Validate open_positions does not exceed max_positions
    const finalMaxPositions = max_positions !== undefined ? max_positions : existingJob.max_positions;
    const finalOpenPositions = open_positions !== undefined ? open_positions : existingJob.open_positions;

    if (finalMaxPositions !== null && finalOpenPositions !== null) {
      if (finalOpenPositions > finalMaxPositions) {
        return sendError(res, 'Open positions cannot exceed max positions', 400);
      }
    }

    // Check for duplicate job title (excluding CLOSED and DECLINED)
    const checkTitle = job_title || existingJob.job_title;
    const checkOrgId = organization_id || existingJob.organization_id;

    if ((job_title && job_title !== existingJob.job_title) || 
        (organization_id && organization_id !== existingJob.organization_id)) {
      const duplicateJob = await prisma.job.findFirst({
        where: {
          organization_id: checkOrgId,
          job_title: checkTitle,
          status: { 
            notIn: ['CLOSED', 'DECLINED']
          },
          job_id: { not: id },
        },
      });

      if (duplicateJob) {
        return sendError(
          res,
          'Active job with this title already exists for this organization',
          409,
          [{
            field: 'duplicate',
            message: `Job already exists with job_id: ${duplicateJob.job_id}`,
          }]
        );
      }
    }

    // Sync approved boolean with status
    let syncedApproved = existingJob.approved;
    const finalStatus = status || existingJob.status;

    // Only flip approved when explicitly moving to OPEN
    if (status === 'OPEN') {
      syncedApproved = true;
    }

    // Perform update in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // 1. Update Job base fields
      const jobUpdateData: any = {};
      if (organization_id !== undefined) jobUpdateData.organization_id = organization_id;
      if (manager_id !== undefined) jobUpdateData.manager_id = manager_id;
      if (company_office_id !== undefined) jobUpdateData.company_office_id = company_office_id;
      if (job_title !== undefined) jobUpdateData.job_title = job_title;
      if (status !== undefined) {
        jobUpdateData.status = status;
        // Only flip approved when explicitly moving to OPEN.
        // All other status changes (CLOSED, DECLINED, DRAFT, PENDING)
        // leave approved untouched so callers must change it on purpose.
        if (status === 'OPEN') {
          jobUpdateData.approved = true;
        }
      }
      if (job_type !== undefined) jobUpdateData.job_type = job_type;
      if (location !== undefined) jobUpdateData.location = location;
      if (days_active !== undefined) jobUpdateData.days_active = days_active;
      if (days_inactive !== undefined) jobUpdateData.days_inactive = days_inactive;
      if (start_date !== undefined) jobUpdateData.start_date = start_date ? new Date(start_date) : null;
      if (end_date !== undefined) jobUpdateData.end_date = end_date ? new Date(end_date) : null;
      if (max_positions !== undefined) jobUpdateData.max_positions = max_positions;
      if (open_positions !== undefined) jobUpdateData.open_positions = open_positions;
      if (resume_required !== undefined) jobUpdateData.resume_required = resume_required;
      if (interview_Round1 !== undefined) jobUpdateData.interview_Round1 = interview_Round1;
      if (interview_Round2 !== undefined) jobUpdateData.interview_Round2 = interview_Round2;
      if (interview_rounds !== undefined) jobUpdateData.interview_rounds = interview_rounds;

      const updatedJob = Object.keys(jobUpdateData).length > 0
        ? await tx.job.update({
            where: { job_id: id },
            data: jobUpdateData,
          })
        : existingJob;

      // 2. Handle JobDetail
      let jobDetailResult = null;
      if (job_detail) {
        if (job_detail._action === 'update' && job_detail.job_detail_id) {
          const updateData: any = {};
          if (job_detail.description !== undefined) updateData.description = job_detail.description;
          if (job_detail.skills !== undefined) updateData.skills = job_detail.skills;

          jobDetailResult = await tx.jobDetail.update({
            where: { job_detail_id: job_detail.job_detail_id },
            data: updateData,
          });
        } else if (job_detail._action === 'create' || !job_detail.job_detail_id) {
          if (!existingJob.job_detail) {
            jobDetailResult = await tx.jobDetail.create({
              data: {
                job_id: id,
                description: job_detail.description!,
                skills: job_detail.skills,
              },
            });
          }
        }
      }

      // 3. Handle JobNotes
      const noteResults = {
        created: [] as any[],
        updated: [] as any[],
        deleted: [] as any[],
      };

      if (job_notes && job_notes.length > 0) {
        for (const note of job_notes) {
          if (note._action === 'delete' && note.job_note_id) {
            const deleted = await tx.jobNote.delete({
              where: { job_note_id: note.job_note_id },
            });
            noteResults.deleted.push(deleted);
          } else if (note._action === 'update' && note.job_note_id) {
            const updateData: any = {};
            if (note.note !== undefined) updateData.note = note.note;

            const updated = await tx.jobNote.update({
              where: { job_note_id: note.job_note_id },
              data: updateData,
            });
            noteResults.updated.push(updated);
          } else if (note._action === 'create' || !note.job_note_id) {
            const created = await tx.jobNote.create({
              data: {
                job_id: id,
                note: note.note!,
              },
            });
            noteResults.created.push(created);
          }
        }
      }

      // 4. Handle JobRates
      const rateResults = {
        created: [] as any[],
        updated: [] as any[],
        deleted: [] as any[],
      };

      if (job_rates && job_rates.length > 0) {
        for (const rate of job_rates) {
          if (rate._action === 'delete' && rate.job_rate_id) {
            const deleted = await tx.jobRate.delete({
              where: { job_rate_id: rate.job_rate_id },
            });
            rateResults.deleted.push(deleted);
          } else if (rate._action === 'update' && rate.job_rate_id) {
            const updateData: any = {};
            if (rate.pay_rate !== undefined) updateData.pay_rate = rate.pay_rate;
            if (rate.bill_rate !== undefined) updateData.bill_rate = rate.bill_rate;
            if (rate.markup_percentage !== undefined) updateData.markup_percentage = rate.markup_percentage;
            if (rate.overtime_rule !== undefined) updateData.overtime_rule = rate.overtime_rule;
            if (rate.hours !== undefined) updateData.hours = rate.hours;
            if (rate.ot_pay_rate !== undefined) updateData.ot_pay_rate = rate.ot_pay_rate;
            if (rate.ot_bill_rate !== undefined) updateData.ot_bill_rate = rate.ot_bill_rate;

            const updated = await tx.jobRate.update({
              where: { job_rate_id: rate.job_rate_id },
              data: updateData,
            });
            rateResults.updated.push(updated);
          } else if (rate._action === 'create' || !rate.job_rate_id) {
            const created = await tx.jobRate.create({
              data: {
                job_id: id,
                pay_rate: rate.pay_rate,
                bill_rate: rate.bill_rate!,
                markup_percentage: rate.markup_percentage,
                overtime_rule: rate.overtime_rule,
                hours: rate.hours!,
                ot_pay_rate: rate.ot_pay_rate,
                ot_bill_rate: rate.ot_bill_rate,
              },
            });
            rateResults.created.push(created);
          }
        }
      }

      // 5. Handle JobOwners
      const ownerResults = {
        created: [] as any[],
        updated: [] as any[],
        deleted: [] as any[],
      };

      if (job_owners && job_owners.length > 0) {
        for (const owner of job_owners) {
          if (owner._action === 'delete' && owner.job_owner_id) {
            const deleted = await tx.jobOwner.delete({
              where: { job_owner_id: owner.job_owner_id },
            });
            ownerResults.deleted.push(deleted);
          } else if (owner._action === 'update' && owner.job_owner_id) {
            const updateData: any = {};
            if (owner.user_id !== undefined) updateData.user_id = owner.user_id;
            if (owner.role_type !== undefined) updateData.role_type = owner.role_type;

            const updated = await tx.jobOwner.update({
              where: { job_owner_id: owner.job_owner_id },
              data: updateData,
            });
            ownerResults.updated.push(updated);
          } else if (owner._action === 'create' || !owner.job_owner_id) {
            const created = await tx.jobOwner.create({
              data: {
                job_id: id,
                user_id: owner.user_id!,
                role_type: owner.role_type!,
              },
            });
            ownerResults.created.push(created);
          }
        }
      }

      return {
        job: updatedJob,
        job_detail: jobDetailResult,
        job_notes: noteResults,
        job_rates: rateResults,
        job_owners: ownerResults,
      };
    }, {
      maxWait: 10000,
      timeout: 15000,
    });

    // Fetch complete updated job data
    const completeJob = await prisma.job.findUnique({
      where: { job_id: id },
      include: {
        organization: {
          select: {
            organization_id: true,
            name: true,
            website: true,
            status: true,
          },
        },
        manager: {
          select: {
            user_id: true,
            name: true,
            email: true,
          },
        },
        created_by: {
          select: {
            user_id: true,
            name: true,
            email: true,
          },
        },
        company_office: {
          select: {
            company_office_id: true,
            office_name: true,
            city: true,
            state: true,
            country: true,
            type: true,
            address: true,
            is_primary: true,
          },
        },
        job_detail: true,
        job_notes: {
          orderBy: {
            created_at: 'desc',
          },
        },
        job_rates: true,
        job_owners: {
          include: {
            user: {
              select: {
                user_id: true,
                name: true,
                email: true,
              },
            },
          },
        },
      },
    });

    // Update user activity
    if (existingJob.created_by_user_id) {
      await updateUserActivity(existingJob.created_by_user_id, {
        action_type: 'UPDATE',
        entity_type: 'JOB',
        entity_id: id,
        entity_name: completeJob?.job_title || existingJob.job_title,
        timestamp: new Date().toISOString(),
      });
    }

    return sendSuccess(res, {
      job: completeJob,
      changes: {
        job_detail: result.job_detail ? 'updated' : 'unchanged',
        job_notes: {
          created: result.job_notes.created.length,
          updated: result.job_notes.updated.length,
          deleted: result.job_notes.deleted.length,
        },
        job_rates: {
          created: result.job_rates.created.length,
          updated: result.job_rates.updated.length,
          deleted: result.job_rates.deleted.length,
        },
        job_owners: {
          created: result.job_owners.created.length,
          updated: result.job_owners.updated.length,
          deleted: result.job_owners.deleted.length,
        },
      },
    });

  } catch (err: any) {
    console.error('Error updating job with complete data:', err);

    if (err.code === 'P2002') {
      return sendError(res, 'Duplicate entry found', 409);
    }

    if (err.code === 'P2003') {
      return sendError(res, 'Related record not found', 404);
    }

    if (err.code === 'P2025') {
      return sendError(res, 'Record to update not found', 404);
    }

    if (err.code === 'P2028') {
      return sendError(res, 'Transaction timeout - please try again', 408);
    }

    return sendError(res, 'Failed to update job', 500);
  }
};

/**
 * Get jobs by user's organizations
 * GET /api/jobs/user/:userId
 */
const getJobsByUser = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 10));
    const skip = (page - 1) * limit;

    if (!userId) {
      return sendError(res, 'User ID is required', 400);
    }

    const userExists = await prisma.user.findUnique({
      where: { user_id: userId },
    });

    if (!userExists) {
      return sendError(res, 'User not found', 404);
    }

    const userOrganizations = await prisma.organizationUser.findMany({
      where: {
        user_id: userId,
      },
      select: {
        organization_id: true,
      },
    });

    if (userOrganizations.length === 0) {
      return sendSuccess(res, {
        data: [],
        paging: {
          total: 0,
          page,
          limit,
          totalPages: 0,
        },
      });
    }

    const organizationIds = userOrganizations.map(org => org.organization_id);

    const { status, job_type, approved } = req.query;
    
    const whereClause: any = {
      organization_id: {
        in: organizationIds,
      },
    };

    if (status) whereClause.status = (status as string).toUpperCase();
    if (job_type) whereClause.job_type = (job_type as string).toUpperCase();
    // approved filter: true = OPEN, false = not OPEN
    if (approved !== undefined) {
      whereClause.status = approved === 'true' ? 'OPEN' : { not: 'OPEN' };
    }

    const [jobs, total] = await Promise.all([
      prisma.job.findMany({
        where: whereClause,
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
        include: {
          organization: {
            select: {
              organization_id: true,
              name: true,
              status: true,
            },
          },
          manager: {
            select: {
              user_id: true,
              name: true,
              email: true,
            },
          },
          _count: {
            select: {
              applications: true,
              job_owners: true,
            },
          },
        },
      }),
      prisma.job.count({
        where: whereClause,
      }),
    ]);

    const transformedJobs = jobs.map(job => ({
      job_id: job.job_id,
      job_title: job.job_title,
      status: job.status,
      job_type: job.job_type,
      location: job.location,
      approved: job.approved,
      days_active: job.days_active,
      days_inactive: job.days_inactive,
      start_date: job.start_date,
      end_date: job.end_date,
      created_at: job.created_at,
      organization_id: job.organization?.organization_id || null,
      organization_name: job.organization?.name || 'N/A',
      organization_status: job.organization?.status || null,
      manager_id: job.manager_id,
      manager_name: job.manager?.name || 'N/A',
      manager_email: job.manager?.email || 'N/A',
      applications_count: job._count?.applications || 0,
      job_owners_count: job._count?.job_owners || 0,
      created_by_user_id: job.created_by_user_id,
    }));

    return sendSuccess(res, {
      data: transformedJobs,
      paging: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err: any) {
    console.error('Error fetching jobs by user organizations:', err);
    return sendError(res, 'Failed to fetch jobs', 500);
  }
};

/**
 * Get user's organizations
 * GET /api/jobs/user/:userId/organizations
 */
const getUserOrganizations = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return sendError(res, 'User ID is required', 400);
    }

    const userExists = await prisma.user.findUnique({
      where: { user_id: userId },
    });

    if (!userExists) {
      return sendError(res, 'User not found', 404);
    }

    const organizations = await prisma.organizationUser.findMany({
      where: {
        user_id: userId,
      },
      select: {
        organization: {
          select: {
            organization_id: true,
            name: true,
          },
        },
      },
    });

    const transformedOrganizations = organizations.map(org => ({
      organization_id: org.organization.organization_id,
      name: org.organization.name,
    }));

    return sendSuccess(res, {
      data: transformedOrganizations,
      total: transformedOrganizations.length,
    });
  } catch (err: any) {
    console.error('Error fetching user organizations:', err);
    return sendError(res, 'Failed to fetch organizations', 500);
  }
};



/**
 * Get pending jobs by manager
 * GET /api/jobs/manager/:managerId/pending
 */
const getPendingJobsByManager = async (req: Request, res: Response) => {
  try {
    const { managerId } = req.params;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 10));
    const skip = (page - 1) * limit;

    if (!managerId) {
      return sendError(res, 'Manager ID is required', 400);
    }

    const [jobs, total] = await Promise.all([
      prisma.job.findMany({
        where: {
          manager_id: managerId,
          status: 'PENDING',
        },
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
        include: {
          organization: {
            select: {
              organization_id: true,
              name: true,
              status: true,
            },
          },
          manager: {
            select: {
              user_id: true,
              name: true,
              email: true,
            },
          },
          job_detail: true,
          _count: {
            select: {
              applications: true,
              job_owners: true,
            },
          },
        },
      }),
      prisma.job.count({
        where: {
          manager_id: managerId,
          status: 'PENDING',
        },
      }),
    ]);

    return sendSuccess(res, {
      data: jobs,
      paging: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err: any) {
    console.error('Error fetching pending jobs by manager:', err);
    return sendError(res, 'Failed to fetch pending jobs', 500);
  }
};

/**
 * Get approved/open jobs by manager
 * GET /api/jobs/manager/:managerId/approved
 */
const getApprovedJobsByManager = async (req: Request, res: Response) => {
  try {
    const { managerId } = req.params;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 10));
    const skip = (page - 1) * limit;

    if (!managerId) {
      return sendError(res, 'Manager ID is required', 400);
    }

    const [jobs, total] = await Promise.all([
      prisma.job.findMany({
        where: {
          manager_id: managerId,
          status: 'OPEN',
        },
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
        include: {
          organization: {
            select: {
              organization_id: true,
              name: true,
              status: true,
            },
          },
          manager: {
            select: {
              user_id: true,
              name: true,
              email: true,
            },
          },
          job_detail: true,
          _count: {
            select: {
              applications: true,
              job_owners: true,
            },
          },
        },
      }),
      prisma.job.count({
        where: {
          manager_id: managerId,
          status: 'OPEN',
        },
      }),
    ]);

    return sendSuccess(res, {
      data: jobs,
      paging: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err: any) {
    console.error('Error fetching approved jobs by manager:', err);
    return sendError(res, 'Failed to fetch approved jobs', 500);
  }
};

/**
 * Get declined jobs by manager
 * GET /api/jobs/manager/:managerId/declined
 */
const getDeclinedJobsByManager = async (req: Request, res: Response) => {
  try {
    const { managerId } = req.params;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 10));
    const skip = (page - 1) * limit;

    if (!managerId) {
      return sendError(res, 'Manager ID is required', 400);
    }

    const [jobs, total] = await Promise.all([
      prisma.job.findMany({
        where: {
          manager_id: managerId,
          status: 'DECLINED',
        },
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
        include: {
          organization: {
            select: {
              organization_id: true,
              name: true,
              status: true,
            },
          },
          manager: {
            select: {
              user_id: true,
              name: true,
              email: true,
            },
          },
          job_detail: true,
          _count: {
            select: {
              applications: true,
              job_owners: true,
            },
          },
        },
      }),
      prisma.job.count({
        where: {
          manager_id: managerId,
          status: 'DECLINED',
        },
      }),
    ]);

    return sendSuccess(res, {
      data: jobs,
      paging: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err: any) {
    console.error('Error fetching declined jobs by manager:', err);
    return sendError(res, 'Failed to fetch declined jobs', 500);
  }
};

/**
 * Get closed jobs by manager
 * GET /api/jobs/manager/:managerId/closed
 */
const getClosedJobsByManager = async (req: Request, res: Response) => {
  try {
    const { managerId } = req.params;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 10));
    const skip = (page - 1) * limit;

    if (!managerId) {
      return sendError(res, 'Manager ID is required', 400);
    }

    const [jobs, total] = await Promise.all([
      prisma.job.findMany({
        where: {
          manager_id: managerId,
          status: 'CLOSED',
        },
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
        include: {
          organization: {
            select: {
              organization_id: true,
              name: true,
              status: true,
            },
          },
          manager: {
            select: {
              user_id: true,
              name: true,
              email: true,
            },
          },
          job_detail: true,
          _count: {
            select: {
              applications: true,
              job_owners: true,
            },
          },
        },
      }),
      prisma.job.count({
        where: {
          manager_id: managerId,
          status: 'CLOSED',
        },
      }),
    ]);

    return sendSuccess(res, {
      data: jobs,
      paging: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err: any) {
    console.error('Error fetching closed jobs by manager:', err);
    return sendError(res, 'Failed to fetch closed jobs', 500);
  }
};

/**
 * Get draft jobs by manager
 * GET /api/jobs/manager/:managerId/draft
 */
const getDraftJobsByManager = async (req: Request, res: Response) => {
  try {
    const { managerId } = req.params;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 10));
    const skip = (page - 1) * limit;

    if (!managerId) {
      return sendError(res, 'Manager ID is required', 400);
    }

    const [jobs, total] = await Promise.all([
      prisma.job.findMany({
        where: {
          manager_id: managerId,
          status: 'DRAFT',
        },
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
        include: {
          organization: {
            select: {
              organization_id: true,
              name: true,
              status: true,
            },
          },
          manager: {
            select: {
              user_id: true,
              name: true,
              email: true,
            },
          },
          job_detail: true,
          _count: {
            select: {
              applications: true,
              job_owners: true,
            },
          },
        },
      }),
      prisma.job.count({
        where: {
          manager_id: managerId,
          status: 'DRAFT',
        },
      }),
    ]);

    return sendSuccess(res, {
      data: jobs,
      paging: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err: any) {
    console.error('Error fetching draft jobs by manager:', err);
    return sendError(res, 'Failed to fetch draft jobs', 500);
  }
};

/**
 * Get job interview and resume requirements
 * GET /api/jobs/:id/requirements
 * Returns only resume_required, interview_Round1, and interview_Round2 fields
 */
const getJobRequirements = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!id) {
      return sendError(res, 'Job ID is required', 400);
    }

    const job = await prisma.job.findUnique({
      where: { job_id: id },
      select: {
        job_id: true,
        resume_required: true,
        interview_Round1: true,
        interview_Round2: true,
      },
    });

    if (!job) {
      return sendError(res, 'Job not found', 404);
    }

    return sendSuccess(res, job);
  } catch (err: any) {
    console.error('Error fetching job requirements:', err);
    return sendError(res, 'Failed to fetch job requirements', 500);
  }
};


// Export controller with custom methods
export const jobController = {
  ...baseCrudMethods,
  create: createJob,
  getById: getJobById,
  update: updateJobComplete,
  getAll: getJobs,
  getJobsByOrganization,
  getJobsByStatus,
  getJobsByType,
  getJobsByManager,
  getApprovedJobs,
  getActiveJobs,
  getJobStats,
  getJobsByUser,
  getUserOrganizations,
  approveJob,
  declineJob,
  autoCloseExpiredJobs,
  getPendingJobsByManager,
  getApprovedJobsByManager,
  getDeclinedJobsByManager,
  getClosedJobsByManager,
  getDraftJobsByManager,
  getJobRequirements,

};