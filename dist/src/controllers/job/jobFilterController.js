"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.filterJobs = void 0;
const prisma_config_1 = __importDefault(require("../../prisma.config"));
const response_1 = require("../../utils/response");
/**
 * Helper function to parse boolean from string
 */
const parseBoolean = (value) => {
    if (value === undefined)
        return undefined;
    if (typeof value === 'boolean')
        return value;
    if (value === 'true')
        return true;
    if (value === 'false')
        return false;
    return undefined;
};
/**
 * Helper function to parse number from string
 */
const parseNumber = (value) => {
    if (value === undefined)
        return undefined;
    if (typeof value === 'number')
        return value;
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? undefined : parsed;
};
/**
 * Helper function to ensure array
 */
const ensureArray = (value) => {
    if (value === undefined)
        return undefined;
    return Array.isArray(value) ? value : [value];
};
/**
 * Main filter function
 */
const filterJobs = async (req, res) => {
    try {
        const params = req.query;
        // Parse pagination
        const page = Math.max(1, parseNumber(params.page) || 1);
        const limit = Math.min(100, Math.max(1, parseNumber(params.limit) || 10));
        const skip = (page - 1) * limit;
        // Build where clause
        const where = {};
        const andConditions = [];
        // ===========================
        // SEARCH & TEXT FILTERS
        // ===========================
        // Global search across multiple fields
        if (params.search) {
            andConditions.push({
                OR: [
                    { job_title: { contains: params.search, mode: 'insensitive' } },
                    { location: { contains: params.search, mode: 'insensitive' } },
                    { organization: { name: { contains: params.search, mode: 'insensitive' } } },
                ],
            });
        }
        // Job title filter
        if (params.job_title) {
            where.job_title = { contains: params.job_title, mode: 'insensitive' };
        }
        // Location filter
        if (params.location) {
            where.location = { contains: params.location, mode: 'insensitive' };
        }
        // ===========================
        // ENUM FILTERS
        // ===========================
        // Status filter (single or multiple)
        if (params.status) {
            const statuses = ensureArray(params.status)?.map(s => s.toUpperCase());
            if (statuses && statuses.length > 0) {
                where.status = statuses.length === 1 ? statuses[0] : { in: statuses };
            }
        }
        // Job type filter (single or multiple)
        if (params.job_type) {
            const types = ensureArray(params.job_type)?.map(t => t.toUpperCase());
            if (types && types.length > 0) {
                where.job_type = types.length === 1 ? types[0] : { in: types };
            }
        }
        // Approved filter
        if (params.approved !== undefined) {
            const approved = parseBoolean(params.approved);
            if (approved !== undefined) {
                where.approved = approved;
            }
        }
        // ===========================
        // RELATIONSHIP FILTERS
        // ===========================
        // Organization ID filter (single or multiple)
        if (params.organization_id) {
            const orgIds = ensureArray(params.organization_id);
            if (orgIds && orgIds.length > 0) {
                where.organization_id = orgIds.length === 1 ? orgIds[0] : { in: orgIds };
            }
        }
        // Organization name filter
        if (params.organization_name) {
            where.organization = {
                name: { contains: params.organization_name, mode: 'insensitive' },
            };
        }
        // Manager ID filter (single or multiple)
        if (params.manager_id) {
            const managerIds = ensureArray(params.manager_id);
            if (managerIds && managerIds.length > 0) {
                where.manager_id = managerIds.length === 1 ? managerIds[0] : { in: managerIds };
            }
        }
        // Created by user ID filter (single or multiple)
        if (params.created_by_user_id) {
            const creatorIds = ensureArray(params.created_by_user_id);
            if (creatorIds && creatorIds.length > 0) {
                where.created_by_user_id = creatorIds.length === 1 ? creatorIds[0] : { in: creatorIds };
            }
        }
        // Company office ID filter (single or multiple)
        if (params.company_office_id) {
            const officeIds = ensureArray(params.company_office_id);
            if (officeIds && officeIds.length > 0) {
                where.company_office_id = officeIds.length === 1 ? officeIds[0] : { in: officeIds };
            }
        }
        // Office type filter (REMOTE, HYBRID, ONSITE)
        if (params.office_type) {
            const officeTypes = ensureArray(params.office_type)?.map(t => t.toUpperCase());
            if (officeTypes && officeTypes.length > 0) {
                where.company_office = {
                    type: officeTypes.length === 1 ? officeTypes[0] : { in: officeTypes },
                };
            }
        }
        // ===========================
        // DATE RANGE FILTERS
        // ===========================
        // Created date range
        if (params.created_from || params.created_to) {
            where.created_at = {};
            if (params.created_from) {
                where.created_at.gte = new Date(params.created_from);
            }
            if (params.created_to) {
                where.created_at.lte = new Date(params.created_to);
            }
        }
        // Start date range
        if (params.start_date_from || params.start_date_to) {
            where.start_date = {};
            if (params.start_date_from) {
                where.start_date.gte = new Date(params.start_date_from);
            }
            if (params.start_date_to) {
                where.start_date.lte = new Date(params.start_date_to);
            }
        }
        // End date range
        if (params.end_date_from || params.end_date_to) {
            where.end_date = {};
            if (params.end_date_from) {
                where.end_date.gte = new Date(params.end_date_from);
            }
            if (params.end_date_to) {
                where.end_date.lte = new Date(params.end_date_to);
            }
        }
        // ===========================
        // NUMERIC RANGE FILTERS
        // ===========================
        // Days active range
        if (params.days_active_min !== undefined || params.days_active_max !== undefined) {
            where.days_active = {};
            const min = parseNumber(params.days_active_min);
            const max = parseNumber(params.days_active_max);
            if (min !== undefined)
                where.days_active.gte = min;
            if (max !== undefined)
                where.days_active.lte = max;
        }
        // Days inactive range
        if (params.days_inactive_min !== undefined || params.days_inactive_max !== undefined) {
            where.days_inactive = {};
            const min = parseNumber(params.days_inactive_min);
            const max = parseNumber(params.days_inactive_max);
            if (min !== undefined)
                where.days_inactive.gte = min;
            if (max !== undefined)
                where.days_inactive.lte = max;
        }
        // Max positions range
        if (params.max_positions_min !== undefined || params.max_positions_max !== undefined) {
            where.max_positions = {};
            const min = parseNumber(params.max_positions_min);
            const max = parseNumber(params.max_positions_max);
            if (min !== undefined)
                where.max_positions.gte = min;
            if (max !== undefined)
                where.max_positions.lte = max;
        }
        // Open positions range
        if (params.open_positions_min !== undefined || params.open_positions_max !== undefined) {
            where.open_positions = {};
            const min = parseNumber(params.open_positions_min);
            const max = parseNumber(params.open_positions_max);
            if (min !== undefined)
                where.open_positions.gte = min;
            if (max !== undefined)
                where.open_positions.lte = max;
        }
        // ===========================
        // ADVANCED FILTERS
        // ===========================
        // Has applications filter
        if (params.has_applications !== undefined) {
            const hasApps = parseBoolean(params.has_applications);
            if (hasApps !== undefined) {
                if (hasApps) {
                    where.applications = { some: {} };
                }
                else {
                    where.applications = { none: {} };
                }
            }
        }
        // Has job owners filter
        if (params.has_job_owners !== undefined) {
            const hasOwners = parseBoolean(params.has_job_owners);
            if (hasOwners !== undefined) {
                if (hasOwners) {
                    where.job_owners = { some: {} };
                }
                else {
                    where.job_owners = { none: {} };
                }
            }
        }
        // Has job rates filter
        if (params.has_job_rates !== undefined) {
            const hasRates = parseBoolean(params.has_job_rates);
            if (hasRates !== undefined) {
                if (hasRates) {
                    where.job_rates = { some: {} };
                }
                else {
                    where.job_rates = { none: {} };
                }
            }
        }
        // Has job details filter
        if (params.has_job_details !== undefined) {
            const hasDetails = parseBoolean(params.has_job_details);
            if (hasDetails !== undefined) {
                if (hasDetails) {
                    where.job_detail = { isNot: null };
                }
                else {
                    where.job_detail = { is: null };
                }
            }
        }
        // Combine all AND conditions
        if (andConditions.length > 0) {
            where.AND = andConditions;
        }
        // ===========================
        // SORTING
        // ===========================
        const sortBy = params.sort_by || 'created_at';
        const sortOrder = params.sort_order || 'desc';
        let orderBy = {};
        switch (sortBy) {
            case 'organization_name':
                orderBy = { organization: { name: sortOrder } };
                break;
            case 'applications_count':
                // For counting, we'll handle this after fetching
                orderBy = { created_at: sortOrder }; // Fallback
                break;
            default:
                orderBy = { [sortBy]: sortOrder };
        }
        // ===========================
        // EXECUTE QUERY
        // ===========================
        const [jobs, total] = await Promise.all([
            prisma_config_1.default.job.findMany({
                where,
                skip,
                take: limit,
                orderBy,
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
                    company_office: {
                        select: {
                            company_office_id: true,
                            office_name: true,
                            city: true,
                            state: true,
                            type: true,
                        },
                    },
                    job_detail: {
                        select: {
                            job_detail_id: true,
                            description: true,
                        },
                    },
                    _count: {
                        select: {
                            applications: true,
                            job_owners: true,
                            job_rates: true,
                        },
                    },
                },
            }),
            prisma_config_1.default.job.count({ where }),
        ]);
        // ===========================
        // POST-PROCESSING
        // ===========================
        // Filter by applications count if specified
        let filteredJobs = jobs;
        if (params.applications_count_min !== undefined || params.applications_count_max !== undefined) {
            const min = parseNumber(params.applications_count_min);
            const max = parseNumber(params.applications_count_max);
            filteredJobs = filteredJobs.filter(job => {
                const count = job._count.applications;
                if (min !== undefined && count < min)
                    return false;
                if (max !== undefined && count > max)
                    return false;
                return true;
            });
        }
        // Sort by applications count if requested
        if (sortBy === 'applications_count') {
            filteredJobs = filteredJobs.sort((a, b) => {
                const countA = a._count.applications;
                const countB = b._count.applications;
                return sortOrder === 'asc' ? countA - countB : countB - countA;
            });
        }
        // ===========================
        // TRANSFORM RESPONSE
        // ===========================
        const transformedJobs = filteredJobs.map(job => ({
            job_id: job.job_id,
            job_title: job.job_title,
            status: job.status,
            job_type: job.job_type,
            location: job.location,
            approved: job.approved,
            days_active: job.days_active,
            days_inactive: job.days_inactive,
            max_positions: job.max_positions,
            open_positions: job.open_positions,
            start_date: job.start_date,
            end_date: job.end_date,
            created_at: job.created_at,
            // Organization
            organization_id: job.organization?.organization_id || null,
            organization_name: job.organization?.name || null,
            organization_status: job.organization?.status || null,
            // Manager
            manager_id: job.manager_id,
            manager_name: job.manager?.name || null,
            manager_email: job.manager?.email || null,
            // Created by
            created_by_user_id: job.created_by_user_id,
            created_by_name: job.created_by?.name || null,
            created_by_email: job.created_by?.email || null,
            // Company office
            company_office_id: job.company_office_id,
            company_office_name: job.company_office?.office_name || null,
            company_office_city: job.company_office?.city || null,
            company_office_state: job.company_office?.state || null,
            company_office_type: job.company_office?.type || null,
            // Job details
            has_job_details: !!job.job_detail,
            job_description: job.job_detail?.description || null,
            // Counts
            applications_count: job._count.applications,
            job_owners_count: job._count.job_owners,
            job_rates_count: job._count.job_rates,
        }));
        // ===========================
        // APPLIED FILTERS SUMMARY
        // ===========================
        const appliedFilters = {};
        if (params.search)
            appliedFilters.search = params.search;
        if (params.job_title)
            appliedFilters.job_title = params.job_title;
        if (params.location)
            appliedFilters.location = params.location;
        if (params.status)
            appliedFilters.status = params.status;
        if (params.job_type)
            appliedFilters.job_type = params.job_type;
        if (params.approved !== undefined)
            appliedFilters.approved = parseBoolean(params.approved);
        if (params.organization_id)
            appliedFilters.organization_id = params.organization_id;
        if (params.organization_name)
            appliedFilters.organization_name = params.organization_name;
        if (params.manager_id)
            appliedFilters.manager_id = params.manager_id;
        if (params.created_by_user_id)
            appliedFilters.created_by_user_id = params.created_by_user_id;
        if (params.company_office_id)
            appliedFilters.company_office_id = params.company_office_id;
        if (params.office_type)
            appliedFilters.office_type = params.office_type;
        if (params.created_from)
            appliedFilters.created_from = params.created_from;
        if (params.created_to)
            appliedFilters.created_to = params.created_to;
        if (params.start_date_from)
            appliedFilters.start_date_from = params.start_date_from;
        if (params.start_date_to)
            appliedFilters.start_date_to = params.start_date_to;
        if (params.end_date_from)
            appliedFilters.end_date_from = params.end_date_from;
        if (params.end_date_to)
            appliedFilters.end_date_to = params.end_date_to;
        // ===========================
        // RETURN RESPONSE
        // ===========================
        return (0, response_1.sendSuccess)(res, {
            data: transformedJobs,
            paging: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
            filters: {
                applied: appliedFilters,
                sort_by: sortBy,
                sort_order: sortOrder,
            },
        });
    }
    catch (err) {
        console.error('Error filtering jobs:', err);
        // Handle date parsing errors
        if (err.message?.includes('Invalid time value')) {
            return (0, response_1.sendError)(res, 'Invalid date format provided', 400);
        }
        return (0, response_1.sendError)(res, 'Failed to filter jobs', 500);
    }
};
exports.filterJobs = filterJobs;
//# sourceMappingURL=jobFilterController.js.map