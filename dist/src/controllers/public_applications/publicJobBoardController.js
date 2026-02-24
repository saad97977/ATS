"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getJobsByOrganization = exports.getFeaturedJobs = exports.searchPublicJobs = exports.getPublicJobStats = exports.getPublicJobById = exports.getPublicJobs = void 0;
const prisma_config_1 = __importDefault(require("../../prisma.config"));
const response_1 = require("../../utils/response");
const client_1 = require("@prisma/client");
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
const getPublicJobs = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 10));
        const skip = (page - 1) * limit;
        const { search, location, job_type, organization_name } = req.query;
        // Build where clause
        const whereClause = {
            status: client_1.JobStatus.OPEN, // Only show open jobs
            organization: {
                status: client_1.OrganizationStatus.ACTIVE, // Only show jobs from active organizations
            },
        };
        // Apply filters
        if (job_type && ['TEMPORARY', 'PERMANENT'].includes(job_type.toUpperCase())) {
            whereClause.job_type = job_type.toUpperCase();
        }
        if (location) {
            whereClause.location = {
                contains: location,
                mode: 'insensitive',
            };
        }
        if (organization_name) {
            whereClause.organization = {
                ...whereClause.organization,
                name: {
                    contains: organization_name,
                    mode: 'insensitive',
                },
            };
        }
        // Global search across multiple fields
        if (search) {
            whereClause.OR = [
                {
                    job_title: {
                        contains: search,
                        mode: 'insensitive',
                    },
                },
                {
                    location: {
                        contains: search,
                        mode: 'insensitive',
                    },
                },
                {
                    organization: {
                        name: {
                            contains: search,
                            mode: 'insensitive',
                        },
                    },
                },
            ];
        }
        const [jobs, total] = await Promise.all([
            prisma_config_1.default.job.findMany({
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
            prisma_config_1.default.job.count({
                where: whereClause,
            }),
        ]);
        return (0, response_1.sendSuccess)(res, {
            data: jobs,
            paging: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        });
    }
    catch (err) {
        console.error('Error fetching public jobs:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch jobs', 500);
    }
};
exports.getPublicJobs = getPublicJobs;
/**
 * Get single public job details
 * GET /api/public/jobs/:id
 */
const getPublicJobById = async (req, res) => {
    try {
        const { id } = req.params;
        if (!id) {
            return (0, response_1.sendError)(res, 'Job ID is required', 400);
        }
        const job = await prisma_config_1.default.job.findFirst({
            where: {
                job_id: id,
                status: client_1.JobStatus.OPEN, // Only show open jobs
                organization: {
                    status: client_1.OrganizationStatus.ACTIVE, // Only from active organizations
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
            return (0, response_1.sendError)(res, 'Job not found or not available for applications', 404);
        }
        return (0, response_1.sendSuccess)(res, { data: job });
    }
    catch (err) {
        console.error('Error fetching public job:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch job', 500);
    }
};
exports.getPublicJobById = getPublicJobById;
/**
 * Get public job statistics
 * GET /api/public/jobs/stats
 */
const getPublicJobStats = async (req, res) => {
    try {
        const whereClause = {
            status: client_1.JobStatus.OPEN,
            organization: {
                status: client_1.OrganizationStatus.ACTIVE,
            },
        };
        const [totalOpenJobs, byType, byLocation, recentJobs,] = await Promise.all([
            prisma_config_1.default.job.count({ where: whereClause }),
            prisma_config_1.default.job.groupBy({
                by: ['job_type'],
                where: whereClause,
                _count: { job_id: true },
            }),
            prisma_config_1.default.job.groupBy({
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
            prisma_config_1.default.job.count({
                where: {
                    ...whereClause,
                    created_at: {
                        gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
                    },
                },
            }),
        ]);
        return (0, response_1.sendSuccess)(res, {
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
    }
    catch (err) {
        console.error('Error fetching public job stats:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch job statistics', 500);
    }
};
exports.getPublicJobStats = getPublicJobStats;
/**
 * Search jobs with advanced filters
 * POST /api/public/jobs/search
 */
const searchPublicJobs = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.body.page) || 1);
        const limit = Math.min(50, Math.max(1, parseInt(req.body.limit) || 10));
        const skip = (page - 1) * limit;
        const { keywords, organization, location, job_type, organization_id, min_pay_rate, max_pay_rate, office_type, posted_within_days, } = req.body;
        const whereClause = {
            status: client_1.JobStatus.OPEN,
            organization: {
                status: client_1.OrganizationStatus.ACTIVE,
                ...(organization
                    ? { name: { contains: organization, mode: 'insensitive' } }
                    : {}),
            },
        };
        // ✅ Step 1: Find job IDs where skills JSON matches the keyword (raw SQL)
        let skillMatchingJobIds = [];
        if (keywords) {
            const skillMatches = await prisma_config_1.default.$queryRaw `
        SELECT j.job_id
        FROM jobs j
        JOIN job_details jd ON jd.job_id = j.job_id
        WHERE LOWER(jd.skills::text) LIKE LOWER(${`%${keywords}%`})
      `;
            skillMatchingJobIds = skillMatches.map((r) => r.job_id);
        }
        // ✅ Step 2: Build OR clause with skills job IDs injected
        if (keywords) {
            whereClause.OR = [
                {
                    job_title: {
                        contains: keywords,
                        mode: 'insensitive',
                    },
                },
                {
                    location: {
                        contains: keywords,
                        mode: 'insensitive',
                    },
                },
                {
                    job_detail: {
                        description: {
                            contains: keywords,
                            mode: 'insensitive',
                        },
                    },
                },
                // ✅ Skills match via raw query result
                ...(skillMatchingJobIds.length > 0
                    ? [{ job_id: { in: skillMatchingJobIds } }]
                    : []),
            ];
        }
        // Location filter
        if (location) {
            whereClause.location = {
                contains: location,
                mode: 'insensitive',
            };
        }
        // Job type filter
        if (job_type && ['TEMPORARY', 'PERMANENT'].includes(job_type.toUpperCase())) {
            whereClause.job_type = job_type.toUpperCase();
        }
        // Organization filter
        if (organization_id) {
            whereClause.organization_id = organization_id;
        }
        // Office type filter
        if (office_type && ['REMOTE', 'HYBRID', 'ONSITE'].includes(office_type.toUpperCase())) {
            whereClause.company_office = {
                type: office_type.toUpperCase(),
            };
        }
        // Posted within days filter
        if (posted_within_days) {
            const days = parseInt(posted_within_days);
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
                const minRate = parseFloat(min_pay_rate);
                if (!isNaN(minRate)) {
                    whereClause.job_rates.some.pay_rate = {
                        gte: minRate,
                    };
                }
            }
            if (max_pay_rate) {
                const maxRate = parseFloat(max_pay_rate);
                if (!isNaN(maxRate)) {
                    whereClause.job_rates.some.pay_rate = {
                        ...whereClause.job_rates.some.pay_rate,
                        lte: maxRate,
                    };
                }
            }
        }
        const [jobs, total] = await Promise.all([
            prisma_config_1.default.job.findMany({
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
            prisma_config_1.default.job.count({
                where: whereClause,
            }),
        ]);
        return (0, response_1.sendSuccess)(res, {
            data: jobs,
            paging: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
            filters_applied: {
                keywords,
                organization,
                location,
                job_type,
                organization_id,
                min_pay_rate,
                max_pay_rate,
                office_type,
                posted_within_days,
            },
        });
    }
    catch (err) {
        console.error('Error searching public jobs:', err);
        return (0, response_1.sendError)(res, 'Failed to search jobs', 500);
    }
};
exports.searchPublicJobs = searchPublicJobs;
/**
 * Get featured/highlighted jobs
 * GET /api/public/jobs/featured
 *
 * Returns jobs with the most open positions or recently posted
 */
const getFeaturedJobs = async (req, res) => {
    try {
        const limit = Math.min(20, Math.max(1, parseInt(req.query.limit) || 10));
        const jobs = await prisma_config_1.default.job.findMany({
            where: {
                status: client_1.JobStatus.OPEN,
                organization: {
                    status: client_1.OrganizationStatus.ACTIVE,
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
        return (0, response_1.sendSuccess)(res, {
            data: jobs,
            total: jobs.length,
        });
    }
    catch (err) {
        console.error('Error fetching featured jobs:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch featured jobs', 500);
    }
};
exports.getFeaturedJobs = getFeaturedJobs;
/**
 * Get jobs by organization (public view)
 * GET /api/public/organizations/:organizationId/jobs
 */
const getJobsByOrganization = async (req, res) => {
    try {
        const { organizationId } = req.params;
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 10));
        const skip = (page - 1) * limit;
        if (!organizationId) {
            return (0, response_1.sendError)(res, 'Organization ID is required', 400);
        }
        // Check if organization exists and is active
        const organization = await prisma_config_1.default.organization.findFirst({
            where: {
                organization_id: organizationId,
                status: client_1.OrganizationStatus.ACTIVE,
            },
            select: {
                organization_id: true,
                name: true,
                website: true,
            },
        });
        if (!organization) {
            return (0, response_1.sendError)(res, 'Organization not found or not active', 404);
        }
        const [jobs, total] = await Promise.all([
            prisma_config_1.default.job.findMany({
                where: {
                    organization_id: organizationId,
                    status: client_1.JobStatus.OPEN,
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
            prisma_config_1.default.job.count({
                where: {
                    organization_id: organizationId,
                    status: client_1.JobStatus.OPEN,
                },
            }),
        ]);
        return (0, response_1.sendSuccess)(res, {
            organization,
            data: jobs,
            paging: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        });
    }
    catch (err) {
        console.error('Error fetching jobs by organization:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch organization jobs', 500);
    }
};
exports.getJobsByOrganization = getJobsByOrganization;
//# sourceMappingURL=publicJobBoardController.js.map