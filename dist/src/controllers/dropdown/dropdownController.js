"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.dropdownController = void 0;
const prisma_config_1 = __importDefault(require("../../prisma.config"));
const response_1 = require("../../utils/response");
/**
 * Unified Dropdown Controller
 * Optimized for large datasets (5000+ records)
 *
 * Strategy:
 *   - No search query → returns empty (prevents full-table scans)
 *   - search < MIN_SEARCH_LENGTH → returns empty (prevents broad scans)
 *   - search provided → server-side filtered, cursor-paginated results
 *
 * All endpoints support:
 *   - ?search=<string>  – REQUIRED for results; min 2 chars
 *   - ?take=<number>    – result cap (default 20, max 50)
 *   - ?cursor=<string>  – ID of last record for next-page fetching
 */
// ============================================================
// HELPERS
// ============================================================
const MIN_SEARCH_LENGTH = 2;
const DEFAULT_TAKE = 20;
const MAX_TAKE = 50;
/** Clamps `take` to [1, MAX_TAKE]. Defaults to DEFAULT_TAKE. */
const parseTake = (raw) => Math.min(MAX_TAKE, Math.max(1, parseInt(String(raw ?? DEFAULT_TAKE)) || DEFAULT_TAKE));
/** Returns true when the search string is long enough to query */
const isSearchable = (search) => typeof search === 'string' && search.trim().length >= MIN_SEARCH_LENGTH;
// ============================================================
// ORGANIZATIONS DROPDOWN
// ============================================================
/**
 * GET /api/dropdowns/organizations
 *
 * Query params:
 *   search – partial name filter (min 2 chars)
 *   take   – result cap (default 20, max 50)
 *   cursor – organization_id of last record (for pagination)
 */
const getOrganizationsDropdown = async (req, res) => {
    try {
        const { search, cursor } = req.query;
        const take = parseTake(req.query.take);
        if (!isSearchable(search)) {
            return (0, response_1.sendSuccess)(res, []);
        }
        const organizations = await prisma_config_1.default.organization.findMany({
            take: take + 1, // fetch one extra to determine hasMore
            ...(cursor ? { skip: 1, cursor: { organization_id: cursor } } : {}),
            where: {
                name: { contains: search.trim(), mode: 'insensitive' },
            },
            select: {
                organization_id: true,
                name: true,
                status: true,
                phone: true,
                website: true,
            },
            orderBy: { name: 'asc' },
        });
        const hasMore = organizations.length > take;
        const data = hasMore ? organizations.slice(0, take) : organizations;
        const nextCursor = hasMore ? data[data.length - 1].organization_id : null;
        return (0, response_1.sendSuccess)(res, { data, hasMore, nextCursor });
    }
    catch (err) {
        console.error('Error fetching organizations dropdown:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch organizations', 500);
    }
};
// ============================================================
// JOBS DROPDOWN
// ============================================================
/**
 * GET /api/dropdowns/jobs
 *
 * Query params:
 *   search          – partial job_title/location filter (min 2 chars)
 *   take            – result cap (default 20, max 50)
 *   cursor          – job_id of last record (for pagination)
 *   organization_id – optional org filter
 *   status          – optional status filter
 */
const getJobsDropdown = async (req, res) => {
    try {
        const { search, cursor, organization_id, status } = req.query;
        const take = parseTake(req.query.take);
        if (!isSearchable(search)) {
            return (0, response_1.sendSuccess)(res, []);
        }
        const q = search.trim();
        const where = {
            OR: [
                { job_title: { contains: q, mode: 'insensitive' } },
                { location: { contains: q, mode: 'insensitive' } },
            ],
        };
        if (organization_id)
            where.organization_id = organization_id;
        if (status)
            where.status = status;
        const jobs = await prisma_config_1.default.job.findMany({
            take: take + 1,
            ...(cursor ? { skip: 1, cursor: { job_id: cursor } } : {}),
            where,
            select: {
                job_id: true,
                job_title: true,
                job_type: true,
                status: true,
                location: true,
                city: true,
                state: true,
                organization: {
                    select: { organization_id: true, name: true },
                },
            },
            orderBy: { job_title: 'asc' },
        });
        const hasMore = jobs.length > take;
        const slice = hasMore ? jobs.slice(0, take) : jobs;
        const nextCursor = hasMore ? slice[slice.length - 1].job_id : null;
        const data = slice.map((j) => ({
            job_id: j.job_id,
            job_title: j.job_title,
            job_type: j.job_type,
            status: j.status,
            location: j.location,
            city: j.city,
            state: j.state,
            organization_id: j.organization?.organization_id,
            organization_name: j.organization?.name,
        }));
        return (0, response_1.sendSuccess)(res, { data, hasMore, nextCursor });
    }
    catch (err) {
        console.error('Error fetching jobs dropdown:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch jobs', 500);
    }
};
// ============================================================
// ORGANIZATION USERS DROPDOWN
// ============================================================
/**
 * GET /api/dropdowns/organization-users
 *
 * Query params:
 *   search          – partial name/email filter (min 2 chars)
 *   take            – result cap (default 20, max 50)
 *   cursor          – organization_user_id of last record (for pagination)
 *   organization_id – optional org filter
 */
const getOrganizationUsersDropdown = async (req, res) => {
    try {
        const { search, cursor, organization_id } = req.query;
        const take = parseTake(req.query.take);
        if (!isSearchable(search)) {
            return (0, response_1.sendSuccess)(res, []);
        }
        const q = search.trim();
        const where = {
            OR: [
                { user: { name: { contains: q, mode: 'insensitive' } } },
                { user: { email: { contains: q, mode: 'insensitive' } } },
            ],
        };
        if (organization_id)
            where.organization_id = organization_id;
        const orgUsers = await prisma_config_1.default.organizationUser.findMany({
            take: take + 1,
            ...(cursor ? { skip: 1, cursor: { organization_user_id: cursor } } : {}),
            where,
            select: {
                organization_user_id: true,
                organization_id: true,
                user_id: true,
                title: true,
                division: true,
                department: true,
                user: {
                    select: { user_id: true, name: true, email: true },
                },
                organization: {
                    select: { organization_id: true, name: true },
                },
            },
            orderBy: { user: { name: 'asc' } },
        });
        const hasMore = orgUsers.length > take;
        const slice = hasMore ? orgUsers.slice(0, take) : orgUsers;
        const nextCursor = hasMore ? slice[slice.length - 1].organization_user_id : null;
        const data = slice.map((ou) => ({
            organization_user_id: ou.organization_user_id,
            organization_id: ou.organization_id,
            user_id: ou.user.user_id,
            user_name: ou.user.name,
            user_email: ou.user.email,
            title: ou.title,
            division: ou.division,
            department: ou.department,
            organization_name: ou.organization?.name,
        }));
        return (0, response_1.sendSuccess)(res, { data, hasMore, nextCursor });
    }
    catch (err) {
        console.error('Error fetching organization users dropdown:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch organization users', 500);
    }
};
// ============================================================
// DOCUMENT CATEGORIES (TITLES) DROPDOWN
// ============================================================
/**
 * GET /api/dropdowns/document-categories
 *
 * Query params:
 *   search          – partial document_title filter (min 2 chars)
 *   take            – result cap (default 20, max 50)
 *   cursor          – document_title_id of last record (for pagination)
 *   organization_id – optional org filter
 */
const getDocumentCategoriesDropdown = async (req, res) => {
    try {
        const { search, cursor, organization_id } = req.query;
        const take = parseTake(req.query.take);
        if (!isSearchable(search)) {
            return (0, response_1.sendSuccess)(res, []);
        }
        const where = {
            document_title: { contains: search.trim(), mode: 'insensitive' },
        };
        if (organization_id)
            where.organization_id = organization_id;
        const docCategories = await prisma_config_1.default.organizationDocumentTitle.findMany({
            take: take + 1,
            ...(cursor ? { skip: 1, cursor: { document_title_id: cursor } } : {}),
            where,
            select: {
                document_title_id: true,
                document_title: true,
                organization_id: true,
                organization: {
                    select: { organization_id: true, name: true },
                },
            },
            orderBy: { document_title: 'asc' },
        });
        const hasMore = docCategories.length > take;
        const slice = hasMore ? docCategories.slice(0, take) : docCategories;
        const nextCursor = hasMore ? slice[slice.length - 1].document_title_id : null;
        const data = slice.map((dc) => ({
            document_title_id: dc.document_title_id,
            document_title: dc.document_title,
            organization_id: dc.organization_id,
            organization_name: dc.organization?.name,
        }));
        return (0, response_1.sendSuccess)(res, { data, hasMore, nextCursor });
    }
    catch (err) {
        console.error('Error fetching document categories dropdown:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch document categories', 500);
    }
};
// ============================================================
// LOCATIONS DROPDOWN
// ============================================================
/**
 * GET /api/dropdowns/locations
 *
 * Returns all unique locations from Job table (grouped by location)
 * Useful for location filter dropdowns
 *
 * Response:
 *   [
 *     { location: "New York, NY" },
 *     { location: "San Francisco, CA" },
 *     ...
 *   ]
 */
const getLocations = async (req, res) => {
    try {
        const locations = await prisma_config_1.default.job.groupBy({
            by: ['location'],
            _count: true,
            orderBy: { location: 'asc' },
            where: {
                location: {
                    not: '',
                },
            },
        });
        // Transform to simple array of location strings
        const data = locations
            .filter((loc) => loc.location && loc.location.trim() !== '')
            .map((loc) => ({
            location: loc.location,
            count: loc._count,
        }));
        return (0, response_1.sendSuccess)(res, data);
    }
    catch (err) {
        console.error('Error fetching locations dropdown:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch locations', 500);
    }
};
// ============================================================
// EXPORTS
// ============================================================
exports.dropdownController = {
    getOrganizations: getOrganizationsDropdown,
    getJobs: getJobsDropdown,
    getOrganizationUsers: getOrganizationUsersDropdown,
    getDocumentCategories: getDocumentCategoriesDropdown,
    getLocations: getLocations,
};
//# sourceMappingURL=dropdownController.js.map