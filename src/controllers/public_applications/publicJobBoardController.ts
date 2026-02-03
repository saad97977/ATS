import { Request, Response } from 'express';
import prisma from '../../prisma.config';
import { sendSuccess, sendError } from '../../utils/response';
import { JobStatus, OrganizationStatus, JobType, OfficeType } from '@prisma/client';

/**
 * Public Job Board Controller
 * 
 * Handles public-facing job listings for applicants
 * No authentication required for viewing jobs
 * 
 * Business Rules:
 * - Only shows jobs with status = 'OPEN' 
 * - Only shows jobs from ACTIVE organizations
 * - Hides sensitive information (manager details, internal notes, etc.)
 * - Supports filtering, searching, and pagination
 */

/**
 * Get all public job listings
 * GET /api/public/jobs
 * 
 * Query params:
 * - search: Search in job title, location, organization name
 * - location: Filter by location
 * - job_type: Filter by TEMPORARY or PERMANENT
 * - organization_name: Filter by organization name
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 10, max: 50)
 */
export const getPublicJobs = async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 10));
    const skip = (page - 1) * limit;

    const { search, location, job_type, organization_name } = req.query;

    // Build where clause
    const whereClause: any = {
      status: JobStatus.OPEN, // Only show open jobs
      organization: {
        status: OrganizationStatus.ACTIVE, // Only show jobs from active organizations
      },
    };

    // Apply filters
    if (job_type && ['TEMPORARY', 'PERMANENT'].includes((job_type as string).toUpperCase())) {
      whereClause.job_type = (job_type as string).toUpperCase() as JobType;
    }

    if (location) {
      whereClause.location = {
        contains: location as string,
        mode: 'insensitive',
      };
    }

    if (organization_name) {
      whereClause.organization = {
        ...whereClause.organization,
        name: {
          contains: organization_name as string,
          mode: 'insensitive',
        },
      };
    }

    // Global search across multiple fields
    if (search) {
      whereClause.OR = [
        {
          job_title: {
            contains: search as string,
            mode: 'insensitive',
          },
        },
        {
          location: {
            contains: search as string,
            mode: 'insensitive',
          },
        },
        {
          organization: {
            name: {
              contains: search as string,
              mode: 'insensitive',
            },
          },
        },
      ];
    }

    const [jobs, total] = await Promise.all([
      prisma.job.findMany({
        where: whereClause,
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
        select: {
          job_id: true,
          job_title: true,
          job_type: true,
          location: true,
          start_date: true,
          end_date: true,
          created_at: true,
          max_positions: true,
          open_positions: true,
          organization: {
            select: {
              organization_id: true,
              name: true,
              website: true,
            },
          },
          company_office: {
            select: {
              office_name: true,
              city: true,
              state: true,
              country: true,
              type: true,
            },
          },
          job_detail: {
            select: {
              description: true,
              skills: true,
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
    console.error('Error fetching public jobs:', err);
    return sendError(res, 'Failed to fetch jobs', 500);
  }
};

/**
 * Get single public job details
 * GET /api/public/jobs/:id
 */
export const getPublicJobById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!id) {
      return sendError(res, 'Job ID is required', 400);
    }

    const job = await prisma.job.findFirst({
      where: {
        job_id: id,
        status: JobStatus.OPEN, // Only show open jobs
        organization: {
          status: OrganizationStatus.ACTIVE, // Only from active organizations
        },
      },
      select: {
        job_id: true,
        job_title: true,
        job_type: true,
        location: true,
        start_date: true,
        end_date: true,
        created_at: true,
        max_positions: true,
        open_positions: true,
        organization: {
          select: {
            organization_id: true,
            name: true,
            website: true,
          },
        },
        company_office: {
          select: {
            office_name: true,
            city: true,
            state: true,
            country: true,
            type: true,
            address: true,
          },
        },
        job_detail: {
          select: {
            description: true,
            skills: true,
          },
        },
        job_rates: {
          select: {
            pay_rate: true,
            bill_rate: true,
            hours: true,
          },
        },
        _count: {
          select: {
            applications: true,
          },
        },
      },
    });

    if (!job) {
      return sendError(res, 'Job not found or not available for applications', 404);
    }

    return sendSuccess(res, { data: job });
  } catch (err: any) {
    console.error('Error fetching public job:', err);
    return sendError(res, 'Failed to fetch job', 500);
  }
};

/**
 * Get public job statistics
 * GET /api/public/jobs/stats
 */
export const getPublicJobStats = async (req: Request, res: Response) => {
  try {
    const whereClause = {
      status: JobStatus.OPEN,
      organization: {
        status: OrganizationStatus.ACTIVE,
      },
    };

    const [
      totalOpenJobs,
      byType,
      byLocation,
      recentJobs,
    ] = await Promise.all([
      prisma.job.count({ where: whereClause }),
      prisma.job.groupBy({
        by: ['job_type'],
        where: whereClause,
        _count: { job_id: true },
      }),
      prisma.job.groupBy({
        by: ['location'],
        where: whereClause,
        _count: { job_id: true },
        orderBy: {
          _count: {
            job_id: 'desc',
          },
        },
        take: 10,
      }),
      prisma.job.count({
        where: {
          ...whereClause,
          created_at: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
          },
        },
      }),
    ]);

    return sendSuccess(res, {
      data: {
        total_open_jobs: totalOpenJobs,
        new_jobs_this_week: recentJobs,
        by_type: byType.map(t => ({
          type: t.job_type,
          count: t._count.job_id,
        })),
        top_locations: byLocation.map(l => ({
          location: l.location,
          count: l._count.job_id,
        })),
      },
    });
  } catch (err: any) {
    console.error('Error fetching public job stats:', err);
    return sendError(res, 'Failed to fetch job statistics', 500);
  }
};

/**
 * Search jobs with advanced filters
 * POST /api/public/jobs/search
 * 
 * Body params:
 * - keywords: Search keywords
 * - location: Location filter
 * - job_type: TEMPORARY or PERMANENT
 * - organization_id: Filter by organization
 * - min_pay_rate: Minimum pay rate
 * - max_pay_rate: Maximum pay rate
 * - office_type: REMOTE, HYBRID, or ONSITE
 * - posted_within_days: Number of days (e.g., 7, 30)
 * - page: Page number
 * - limit: Items per page
 */
export const searchPublicJobs = async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.body.page as string) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.body.limit as string) || 10));
    const skip = (page - 1) * limit;

    const {
      keywords,
      location,
      job_type,
      organization_id,
      min_pay_rate,
      max_pay_rate,
      office_type,
      posted_within_days,
    } = req.body;

    const whereClause: any = {
      status: JobStatus.OPEN,
      organization: {
        status: OrganizationStatus.ACTIVE,
      },
    };

    // Keyword search
    if (keywords) {
      whereClause.OR = [
        {
          job_title: {
            contains: keywords as string,
            mode: 'insensitive',
          },
        },
        {
          location: {
            contains: keywords as string,
            mode: 'insensitive',
          },
        },
        {
          job_detail: {
            description: {
              contains: keywords as string,
              mode: 'insensitive',
            },
          },
        },
      ];
    }

    // Location filter
    if (location) {
      whereClause.location = {
        contains: location as string,
        mode: 'insensitive',
      };
    }

    // Job type filter
    if (job_type && ['TEMPORARY', 'PERMANENT'].includes((job_type as string).toUpperCase())) {
      whereClause.job_type = (job_type as string).toUpperCase() as JobType;
    }

    // Organization filter
    if (organization_id) {
      whereClause.organization_id = organization_id as string;
    }

    // Office type filter
    if (office_type && ['REMOTE', 'HYBRID', 'ONSITE'].includes((office_type as string).toUpperCase())) {
      whereClause.company_office = {
        type: (office_type as string).toUpperCase() as OfficeType,
      };
    }

    // Posted within days filter
    if (posted_within_days) {
      const days = parseInt(posted_within_days as string);
      if (!isNaN(days) && days > 0) {
        whereClause.created_at = {
          gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000),
        };
      }
    }

    // Pay rate filters
    if (min_pay_rate || max_pay_rate) {
      whereClause.job_rates = {
        some: {},
      };
      
      if (min_pay_rate) {
        const minRate = parseFloat(min_pay_rate as string);
        if (!isNaN(minRate)) {
          whereClause.job_rates.some.pay_rate = {
            gte: minRate,
          };
        }
      }
      
      if (max_pay_rate) {
        const maxRate = parseFloat(max_pay_rate as string);
        if (!isNaN(maxRate)) {
          whereClause.job_rates.some.pay_rate = {
            ...whereClause.job_rates.some.pay_rate,
            lte: maxRate,
          };
        }
      }
    }

    const [jobs, total] = await Promise.all([
      prisma.job.findMany({
        where: whereClause,
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
        select: {
          job_id: true,
          job_title: true,
          job_type: true,
          location: true,
          start_date: true,
          end_date: true,
          created_at: true,
          max_positions: true,
          open_positions: true,
          organization: {
            select: {
              organization_id: true,
              name: true,
              website: true,
            },
          },
          company_office: {
            select: {
              office_name: true,
              city: true,
              state: true,
              country: true,
              type: true,
            },
          },
          job_detail: {
            select: {
              description: true,
              skills: true,
            },
          },
          job_rates: {
            select: {
              pay_rate: true,
              hours: true,
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
      filters_applied: {
        keywords,
        location,
        job_type,
        organization_id,
        min_pay_rate,
        max_pay_rate,
        office_type,
        posted_within_days,
      },
    });
  } catch (err: any) {
    console.error('Error searching public jobs:', err);
    return sendError(res, 'Failed to search jobs', 500);
  }
};

/**
 * Get featured/highlighted jobs
 * GET /api/public/jobs/featured
 * 
 * Returns jobs with the most open positions or recently posted
 */
export const getFeaturedJobs = async (req: Request, res: Response) => {
  try {
    const limit = Math.min(20, Math.max(1, parseInt(req.query.limit as string) || 10));

    const jobs = await prisma.job.findMany({
      where: {
        status: JobStatus.OPEN,
        organization: {
          status: OrganizationStatus.ACTIVE,
        },
        open_positions: {
          gt: 0,
        },
      },
      take: limit,
      orderBy: [
        { open_positions: 'desc' },
        { created_at: 'desc' },
      ],
      select: {
        job_id: true,
        job_title: true,
        job_type: true,
        location: true,
        created_at: true,
        max_positions: true,
        open_positions: true,
        organization: {
          select: {
            organization_id: true,
            name: true,
            website: true,
          },
        },
        company_office: {
          select: {
            office_name: true,
            type: true,
          },
        },
        job_detail: {
          select: {
            description: true,
          },
        },
      },
    });

    return sendSuccess(res, {
      data: jobs,
      total: jobs.length,
    });
  } catch (err: any) {
    console.error('Error fetching featured jobs:', err);
    return sendError(res, 'Failed to fetch featured jobs', 500);
  }
};

/**
 * Get jobs by organization (public view)
 * GET /api/public/organizations/:organizationId/jobs
 */
export const getJobsByOrganization = async (req: Request, res: Response) => {
  try {
    const { organizationId } = req.params;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 10));
    const skip = (page - 1) * limit;

    if (!organizationId) {
      return sendError(res, 'Organization ID is required', 400);
    }

    // Check if organization exists and is active
    const organization = await prisma.organization.findFirst({
      where: {
        organization_id: organizationId,
        status: OrganizationStatus.ACTIVE,
      },
      select: {
        organization_id: true,
        name: true,
        website: true,
      },
    });

    if (!organization) {
      return sendError(res, 'Organization not found or not active', 404);
    }

    const [jobs, total] = await Promise.all([
      prisma.job.findMany({
        where: {
          organization_id: organizationId,
          status: JobStatus.OPEN,
        },
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
        select: {
          job_id: true,
          job_title: true,
          job_type: true,
          location: true,
          start_date: true,
          end_date: true,
          created_at: true,
          max_positions: true,
          open_positions: true,
          company_office: {
            select: {
              office_name: true,
              city: true,
              state: true,
              type: true,
            },
          },
          job_detail: {
            select: {
              description: true,
              skills: true,
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
          organization_id: organizationId,
          status: JobStatus.OPEN,
        },
      }),
    ]);

    return sendSuccess(res, {
      organization,
      data: jobs,
      paging: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err: any) {
    console.error('Error fetching jobs by organization:', err);
    return sendError(res, 'Failed to fetch organization jobs', 500);
  }
};