"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.contactJobController = exports.organizationActivityController = exports.contactPreviewController = exports.contactActivityDropdownController = void 0;
const prisma_config_1 = __importDefault(require("../../prisma.config"));
const response_1 = require("../../utils/response");
const zod_1 = require("zod");
// ============================================================
// VALIDATION SCHEMAS
// ============================================================
const createContactPreviewSchema = zod_1.z.object({
    organization_user_id: zod_1.z.string().uuid('Invalid organization user ID'),
    user_id: zod_1.z.string().uuid('Invalid user ID'),
    type: zod_1.z.enum(['CALL_COMPLETED', 'CALL_SCHEDULED', 'CALL_RESCHEDULED']),
    notes: zod_1.z.string().optional(),
    date: zod_1.z.string().datetime().optional(),
    job_id: zod_1.z.string().uuid('Invalid job ID').optional().nullable(),
});
const updateContactPreviewSchema = zod_1.z.object({
    organization_user_id: zod_1.z.string().uuid('Invalid organization user ID').optional(),
    type: zod_1.z.enum(['CALL_COMPLETED', 'CALL_SCHEDULED', 'CALL_RESCHEDULED']).optional(),
    notes: zod_1.z.string().optional().nullable(),
    date: zod_1.z.string().datetime().optional(),
    job_id: zod_1.z.string().uuid('Invalid job ID').optional().nullable(),
});
const createOrganizationActivitySchema = zod_1.z.object({
    organization_id: zod_1.z.string().uuid('Invalid organization ID'),
    logged_by_user_id: zod_1.z.string().uuid('Invalid user ID'),
    activity_type: zod_1.z.enum(['CALL_COMPLETED', 'CALL_SCHEDULED']),
    details: zod_1.z.string().optional().nullable(),
});
const updateOrganizationActivitySchema = zod_1.z.object({
    activity_type: zod_1.z.enum(['CALL_COMPLETED', 'CALL_SCHEDULED']).optional(),
    details: zod_1.z.string().optional().nullable(),
});
const createContactJobSchema = zod_1.z.object({
    organization_user_id: zod_1.z.string().uuid('Invalid organization user ID'),
    job_id: zod_1.z.string().uuid('Invalid job ID'),
});
const bulkContactJobSchema = zod_1.z.object({
    organization_user_id: zod_1.z.string().uuid('Invalid organization user ID'),
    job_ids: zod_1.z.array(zod_1.z.string().uuid('Invalid job ID')).min(1, 'At least one job ID required'),
});
// ============================================================
// DROPDOWN ENDPOINTS
// These are lightweight, unpaginated lists used to populate
// select / autocomplete fields in the frontend.
// Route prefix: GET /api/contact-activity/dropdown/...
// ============================================================
/**
 * GET /api/contact-activity/dropdown/organization-users
 *
 * Returns all organization users (i.e. users affiliated with at least one
 * organization).  Each record includes the user's name, email, and their
 * primary organization name so the "Contact" autocomplete can display a
 * rich label (name + email + org).
 *
 * Optional query params:
 *   organization_id – filter to a specific organization
 */
const getOrganizationUsersDropdown = async (req, res) => {
    try {
        const { organization_id } = req.query;
        const where = {};
        if (organization_id)
            where.organization_id = organization_id;
        const orgUsers = await prisma_config_1.default.organizationUser.findMany({
            where,
            select: {
                organization_user_id: true,
                organization_id: true,
                user: {
                    select: {
                        user_id: true,
                        name: true,
                        email: true,
                    },
                },
                organization: {
                    select: {
                        organization_id: true,
                        name: true,
                    },
                },
            },
            orderBy: { user: { name: 'asc' } },
        });
        // Flatten so the frontend doesn't need deep nesting
        const data = orgUsers.map((ou) => ({
            organization_user_id: ou.organization_user_id,
            user_id: ou.user.user_id,
            name: ou.user.name,
            email: ou.user.email,
            organization_id: ou.organization.organization_id,
            organization_name: ou.organization.name,
        }));
        return (0, response_1.sendSuccess)(res, data);
    }
    catch (err) {
        console.error('Error fetching organization users dropdown:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch organization users', 500);
    }
};
/**
 * GET /api/contact-activity/dropdown/users
 *
 * Returns ALL platform users (no pagination) for the "Logged By" dropdown.
 */
const getAllUsersDropdown = async (req, res) => {
    try {
        const users = await prisma_config_1.default.user.findMany({
            select: {
                user_id: true,
                name: true,
                email: true,
            },
            orderBy: { name: 'asc' },
        });
        return (0, response_1.sendSuccess)(res, users);
    }
    catch (err) {
        console.error('Error fetching users dropdown:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch users', 500);
    }
};
/**
 * GET /api/contact-activity/dropdown/organizations
 *
 * Returns ALL organizations for the "Organization" dropdown.
 */
const getAllOrganizationsDropdown = async (req, res) => {
    try {
        const organizations = await prisma_config_1.default.organization.findMany({
            select: {
                organization_id: true,
                name: true,
                status: true,
            },
            orderBy: { name: 'asc' },
        });
        return (0, response_1.sendSuccess)(res, organizations);
    }
    catch (err) {
        console.error('Error fetching organizations dropdown:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch organizations', 500);
    }
};
/**
 * GET /api/contact-activity/dropdown/jobs
 *
 * Returns ALL jobs (no pagination) for the "Associated Job" dropdown.
 * Includes job_title, job_type, status, and organization name so the
 * frontend can render a rich option label.
 *
 * Optional query params:
 *   status – filter by job status (e.g. OPEN)
 */
const getAllJobsDropdown = async (req, res) => {
    try {
        const { status } = req.query;
        const where = {};
        if (status)
            where.status = status;
        const jobs = await prisma_config_1.default.job.findMany({
            where,
            select: {
                job_id: true,
                job_title: true,
                job_type: true,
                status: true,
                location: true,
                organization: {
                    select: {
                        organization_id: true,
                        name: true,
                    },
                },
            },
            orderBy: { job_title: 'asc' },
        });
        // Flatten organization name for easy access
        const data = jobs.map((j) => ({
            job_id: j.job_id,
            job_title: j.job_title,
            job_type: j.job_type,
            status: j.status,
            location: j.location,
            organization_id: j.organization?.organization_id,
            organization_name: j.organization?.name,
        }));
        return (0, response_1.sendSuccess)(res, data);
    }
    catch (err) {
        console.error('Error fetching jobs dropdown:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch jobs', 500);
    }
};
// ============================================================
// CONTACT PREVIEW CONTROLLER
// ============================================================
/**
 * GET /api/contact-previews
 * Paginated list with optional filters: contact_id, user_id, type, job_id
 */
const getAllContactPreviews = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
        const skip = (page - 1) * limit;
        const { organization_user_id, user_id, type, job_id } = req.query;
        const where = {};
        if (organization_user_id)
            where.organization_user_id = organization_user_id;
        if (user_id)
            where.user_id = user_id;
        if (type)
            where.type = type;
        if (job_id)
            where.job_id = job_id;
        const [rows, total] = await Promise.all([
            prisma_config_1.default.contactPreview.findMany({
                skip,
                take: limit,
                where,
                orderBy: { date: 'desc' },
                include: {
                    organization_user: {
                        select: {
                            organization_user_id: true,
                            user: {
                                select: { user_id: true, name: true, email: true },
                            },
                            organization: {
                                select: { organization_id: true, name: true },
                            },
                        },
                    },
                    user: {
                        select: { user_id: true, name: true, email: true },
                    },
                    job: {
                        select: { job_id: true, job_title: true, status: true },
                    },
                },
            }),
            prisma_config_1.default.contactPreview.count({ where }),
        ]);
        return (0, response_1.sendSuccess)(res, {
            data: rows,
            paging: { total, page, limit, totalPages: Math.ceil(total / limit) },
        });
    }
    catch (err) {
        console.error('Error fetching contact previews:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch contact previews', 500);
    }
};
/**
 * GET /api/contact-previews/:id
 */
const getContactPreviewById = async (req, res) => {
    try {
        const { id } = req.params;
        if (!id)
            return (0, response_1.sendError)(res, 'Preview ID is required', 400);
        const preview = await prisma_config_1.default.contactPreview.findUnique({
            where: { preview_id: id },
            include: {
                organization_user: {
                    select: {
                        organization_user_id: true,
                        user: {
                            select: { user_id: true, name: true, email: true },
                        },
                        organization: {
                            select: { organization_id: true, name: true },
                        },
                    },
                },
                user: { select: { user_id: true, name: true, email: true } },
                job: { select: { job_id: true, job_title: true, status: true } },
            },
        });
        if (!preview)
            return (0, response_1.sendError)(res, 'Contact preview not found', 404);
        return (0, response_1.sendSuccess)(res, preview);
    }
    catch (err) {
        console.error('Error fetching contact preview by id:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch contact preview', 500);
    }
};
/**
 * GET /api/contact-previews/organization-user/:organizationUserId
 */
const getPreviewsByOrganizationUser = async (req, res) => {
    try {
        const { organizationUserId } = req.params;
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
        const skip = (page - 1) * limit;
        const orgUser = await prisma_config_1.default.organizationUser.findUnique({
            where: { organization_user_id: organizationUserId },
            select: {
                organization_user_id: true,
                user: {
                    select: { name: true, email: true },
                },
            },
        });
        if (!orgUser)
            return (0, response_1.sendError)(res, 'Organization user not found', 404);
        const [rows, total] = await Promise.all([
            prisma_config_1.default.contactPreview.findMany({
                skip,
                take: limit,
                where: { organization_user_id: organizationUserId },
                orderBy: { date: 'desc' },
                include: {
                    user: { select: { user_id: true, name: true, email: true } },
                    job: { select: { job_id: true, job_title: true } },
                },
            }),
            prisma_config_1.default.contactPreview.count({ where: { organization_user_id: organizationUserId } }),
        ]);
        return (0, response_1.sendSuccess)(res, {
            organizationUser: orgUser,
            data: rows,
            paging: { total, page, limit, totalPages: Math.ceil(total / limit) },
        });
    }
    catch (err) {
        console.error('Error fetching previews by organization user:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch contact previews', 500);
    }
};
/**
 * POST /api/contact-previews
 */
const createContactPreview = async (req, res) => {
    try {
        const validation = createContactPreviewSchema.safeParse(req.body);
        if (!validation.success) {
            const errors = validation.error.issues.map((e) => ({ field: e.path.join('.'), message: e.message }));
            return (0, response_1.sendError)(res, 'Validation failed', 400, errors);
        }
        const { organization_user_id, user_id, type, notes, date, job_id } = validation.data;
        const orgUser = await prisma_config_1.default.organizationUser.findUnique({ where: { organization_user_id } });
        if (!orgUser)
            return (0, response_1.sendError)(res, 'Organization user not found', 404);
        const user = await prisma_config_1.default.user.findUnique({ where: { user_id } });
        if (!user)
            return (0, response_1.sendError)(res, 'User not found', 404);
        if (job_id) {
            const job = await prisma_config_1.default.job.findUnique({ where: { job_id } });
            if (!job)
                return (0, response_1.sendError)(res, 'Job not found', 404);
        }
        const preview = await prisma_config_1.default.contactPreview.create({
            data: {
                organization_user_id,
                user_id,
                type,
                notes,
                date: date ? new Date(date) : new Date(),
                job_id: job_id ?? null,
            },
            include: {
                organization_user: {
                    select: {
                        organization_user_id: true,
                        user: {
                            select: { user_id: true, name: true, email: true },
                        },
                    },
                },
                user: { select: { user_id: true, name: true, email: true } },
                job: { select: { job_id: true, job_title: true } },
            },
        });
        return (0, response_1.sendSuccess)(res, preview, 201);
    }
    catch (err) {
        console.error('Error creating contact preview:', err);
        return (0, response_1.sendError)(res, 'Failed to create contact preview', 500);
    }
};
/**
 * PATCH /api/contact-previews/:id
 */
const updateContactPreview = async (req, res) => {
    try {
        const { id } = req.params;
        if (!id)
            return (0, response_1.sendError)(res, 'Preview ID is required', 400);
        const validation = updateContactPreviewSchema.safeParse(req.body);
        if (!validation.success) {
            const errors = validation.error.issues.map((e) => ({ field: e.path.join('.'), message: e.message }));
            return (0, response_1.sendError)(res, 'Validation failed', 400, errors);
        }
        const existing = await prisma_config_1.default.contactPreview.findUnique({ where: { preview_id: id } });
        if (!existing)
            return (0, response_1.sendError)(res, 'Contact preview not found', 404);
        const { organization_user_id, type, notes, date, job_id } = validation.data;
        const data = {};
        if (organization_user_id !== undefined)
            data.organization_user_id = organization_user_id;
        if (type !== undefined)
            data.type = type;
        if (notes !== undefined)
            data.notes = notes;
        if (date !== undefined)
            data.date = new Date(date);
        if (job_id !== undefined)
            data.job_id = job_id;
        const updated = await prisma_config_1.default.contactPreview.update({
            where: { preview_id: id },
            data,
            include: {
                organization_user: {
                    select: {
                        organization_user_id: true,
                        user: {
                            select: { user_id: true, name: true, email: true },
                        },
                    },
                },
                user: { select: { user_id: true, name: true, email: true } },
                job: { select: { job_id: true, job_title: true } },
            },
        });
        return (0, response_1.sendSuccess)(res, updated);
    }
    catch (err) {
        console.error('Error updating contact preview:', err);
        if (err.code === 'P2025')
            return (0, response_1.sendError)(res, 'Contact preview not found', 404);
        return (0, response_1.sendError)(res, 'Failed to update contact preview', 500);
    }
};
/**
 * DELETE /api/contact-previews/:id
 */
const deleteContactPreview = async (req, res) => {
    try {
        const { id } = req.params;
        if (!id)
            return (0, response_1.sendError)(res, 'Preview ID is required', 400);
        const existing = await prisma_config_1.default.contactPreview.findUnique({ where: { preview_id: id } });
        if (!existing)
            return (0, response_1.sendError)(res, 'Contact preview not found', 404);
        await prisma_config_1.default.contactPreview.delete({ where: { preview_id: id } });
        return (0, response_1.sendSuccess)(res, { message: 'Contact preview deleted successfully' });
    }
    catch (err) {
        console.error('Error deleting contact preview:', err);
        if (err.code === 'P2025')
            return (0, response_1.sendError)(res, 'Contact preview not found', 404);
        return (0, response_1.sendError)(res, 'Failed to delete contact preview', 500);
    }
};
// ============================================================
// ORGANIZATION ACTIVITY CONTROLLER
// ============================================================
/**
 * GET /api/organization-activities
 */
const getAllOrganizationActivities = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
        const skip = (page - 1) * limit;
        const { organization_id, logged_by_user_id, activity_type } = req.query;
        const where = {};
        if (organization_id)
            where.organization_id = organization_id;
        if (logged_by_user_id)
            where.logged_by_user_id = logged_by_user_id;
        if (activity_type)
            where.activity_type = activity_type;
        const [rows, total] = await Promise.all([
            prisma_config_1.default.organizationActivity.findMany({
                skip,
                take: limit,
                where,
                orderBy: { created_at: 'desc' },
                include: {
                    organization: { select: { organization_id: true, name: true, status: true } },
                    logged_by: { select: { user_id: true, name: true, email: true } },
                },
            }),
            prisma_config_1.default.organizationActivity.count({ where }),
        ]);
        return (0, response_1.sendSuccess)(res, {
            data: rows,
            paging: { total, page, limit, totalPages: Math.ceil(total / limit) },
        });
    }
    catch (err) {
        console.error('Error fetching organization activities:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch organization activities', 500);
    }
};
/**
 * GET /api/organization-activities/:id
 */
const getOrganizationActivityById = async (req, res) => {
    try {
        const { id } = req.params;
        if (!id)
            return (0, response_1.sendError)(res, 'Activity ID is required', 400);
        const activity = await prisma_config_1.default.organizationActivity.findUnique({
            where: { activity_id: id },
            include: {
                organization: { select: { organization_id: true, name: true, status: true } },
                logged_by: { select: { user_id: true, name: true, email: true } },
            },
        });
        if (!activity)
            return (0, response_1.sendError)(res, 'Organization activity not found', 404);
        return (0, response_1.sendSuccess)(res, activity);
    }
    catch (err) {
        console.error('Error fetching organization activity:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch organization activity', 500);
    }
};
/**
 * GET /api/organization-activities/organization/:orgId
 */
const getActivitiesByOrganization = async (req, res) => {
    try {
        const { orgId } = req.params;
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
        const skip = (page - 1) * limit;
        const { activity_type } = req.query;
        const org = await prisma_config_1.default.organization.findUnique({
            where: { organization_id: orgId },
            select: { organization_id: true, name: true },
        });
        if (!org)
            return (0, response_1.sendError)(res, 'Organization not found', 404);
        const where = { organization_id: orgId };
        if (activity_type)
            where.activity_type = activity_type;
        const [rows, total] = await Promise.all([
            prisma_config_1.default.organizationActivity.findMany({
                skip,
                take: limit,
                where,
                orderBy: { created_at: 'desc' },
                include: { logged_by: { select: { user_id: true, name: true, email: true } } },
            }),
            prisma_config_1.default.organizationActivity.count({ where }),
        ]);
        const breakdown = await prisma_config_1.default.organizationActivity.groupBy({
            by: ['activity_type'],
            where: { organization_id: orgId },
            _count: { activity_type: true },
        });
        return (0, response_1.sendSuccess)(res, {
            organization: org,
            data: rows,
            breakdown: breakdown.map((b) => ({ type: b.activity_type, count: b._count.activity_type })),
            paging: { total, page, limit, totalPages: Math.ceil(total / limit) },
        });
    }
    catch (err) {
        console.error('Error fetching activities by organization:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch organization activities', 500);
    }
};
/**
 * POST /api/organization-activities
 */
const createOrganizationActivity = async (req, res) => {
    try {
        const validation = createOrganizationActivitySchema.safeParse(req.body);
        if (!validation.success) {
            const errors = validation.error.issues.map((e) => ({ field: e.path.join('.'), message: e.message }));
            return (0, response_1.sendError)(res, 'Validation failed', 400, errors);
        }
        const { organization_id, logged_by_user_id, activity_type, details } = validation.data;
        const org = await prisma_config_1.default.organization.findUnique({ where: { organization_id } });
        if (!org)
            return (0, response_1.sendError)(res, 'Organization not found', 404);
        const user = await prisma_config_1.default.user.findUnique({ where: { user_id: logged_by_user_id } });
        if (!user)
            return (0, response_1.sendError)(res, 'User not found', 404);
        const activity = await prisma_config_1.default.organizationActivity.create({
            data: { organization_id, logged_by_user_id, activity_type, details: details ?? null },
            include: {
                organization: { select: { organization_id: true, name: true } },
                logged_by: { select: { user_id: true, name: true, email: true } },
            },
        });
        await prisma_config_1.default.organization.update({
            where: { organization_id },
            data: { last_contacted_at: activity.created_at },
        });
        return (0, response_1.sendSuccess)(res, activity, 201);
    }
    catch (err) {
        console.error('Error creating organization activity:', err);
        return (0, response_1.sendError)(res, 'Failed to create organization activity', 500);
    }
};
/**
 * PATCH /api/organization-activities/:id
 */
const updateOrganizationActivity = async (req, res) => {
    try {
        const { id } = req.params;
        if (!id)
            return (0, response_1.sendError)(res, 'Activity ID is required', 400);
        const validation = updateOrganizationActivitySchema.safeParse(req.body);
        if (!validation.success) {
            const errors = validation.error.issues.map((e) => ({ field: e.path.join('.'), message: e.message }));
            return (0, response_1.sendError)(res, 'Validation failed', 400, errors);
        }
        const existing = await prisma_config_1.default.organizationActivity.findUnique({ where: { activity_id: id } });
        if (!existing)
            return (0, response_1.sendError)(res, 'Organization activity not found', 404);
        const { activity_type, details } = validation.data;
        const data = {};
        if (activity_type !== undefined)
            data.activity_type = activity_type;
        if (details !== undefined)
            data.details = details;
        const updated = await prisma_config_1.default.organizationActivity.update({
            where: { activity_id: id },
            data,
            include: {
                organization: { select: { organization_id: true, name: true } },
                logged_by: { select: { user_id: true, name: true, email: true } },
            },
        });
        return (0, response_1.sendSuccess)(res, updated);
    }
    catch (err) {
        console.error('Error updating organization activity:', err);
        if (err.code === 'P2025')
            return (0, response_1.sendError)(res, 'Organization activity not found', 404);
        return (0, response_1.sendError)(res, 'Failed to update organization activity', 500);
    }
};
/**
 * DELETE /api/organization-activities/:id
 */
const deleteOrganizationActivity = async (req, res) => {
    try {
        const { id } = req.params;
        if (!id)
            return (0, response_1.sendError)(res, 'Activity ID is required', 400);
        const existing = await prisma_config_1.default.organizationActivity.findUnique({ where: { activity_id: id } });
        if (!existing)
            return (0, response_1.sendError)(res, 'Organization activity not found', 404);
        await prisma_config_1.default.organizationActivity.delete({ where: { activity_id: id } });
        return (0, response_1.sendSuccess)(res, { message: 'Organization activity deleted successfully' });
    }
    catch (err) {
        console.error('Error deleting organization activity:', err);
        if (err.code === 'P2025')
            return (0, response_1.sendError)(res, 'Organization activity not found', 404);
        return (0, response_1.sendError)(res, 'Failed to delete organization activity', 500);
    }
};
// ============================================================
// CONTACT JOB CONTROLLER
// ============================================================
/**
 * GET /api/contact-jobs
 */
const getAllContactJobs = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
        const skip = (page - 1) * limit;
        const { organization_user_id, job_id } = req.query;
        const where = {};
        if (organization_user_id)
            where.organization_user_id = organization_user_id;
        if (job_id)
            where.job_id = job_id;
        const [rows, total] = await Promise.all([
            prisma_config_1.default.contactJob.findMany({
                skip,
                take: limit,
                where,
                orderBy: { contact_job_id: 'desc' },
                include: {
                    organization_user: {
                        select: {
                            organization_user_id: true,
                            user: {
                                select: { user_id: true, name: true, email: true },
                            },
                            organization: {
                                select: { organization_id: true, name: true },
                            },
                        },
                    },
                    job: {
                        select: {
                            job_id: true,
                            job_title: true,
                            status: true,
                            job_type: true,
                            location: true,
                            organization: { select: { organization_id: true, name: true } },
                        },
                    },
                },
            }),
            prisma_config_1.default.contactJob.count({ where }),
        ]);
        return (0, response_1.sendSuccess)(res, {
            data: rows,
            paging: { total, page, limit, totalPages: Math.ceil(total / limit) },
        });
    }
    catch (err) {
        console.error('Error fetching contact jobs:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch contact jobs', 500);
    }
};
/**
 * GET /api/contact-jobs/organization-user/:organizationUserId
 */
const getJobsByOrganizationUser = async (req, res) => {
    try {
        const { organizationUserId } = req.params;
        const orgUser = await prisma_config_1.default.organizationUser.findUnique({
            where: { organization_user_id: organizationUserId },
            select: {
                organization_user_id: true,
                user: {
                    select: { user_id: true, name: true, email: true },
                },
                organization: { select: { name: true } },
            },
        });
        if (!orgUser)
            return (0, response_1.sendError)(res, 'Organization user not found', 404);
        const contactJobs = await prisma_config_1.default.contactJob.findMany({
            where: { organization_user_id: organizationUserId },
            include: {
                job: {
                    select: {
                        job_id: true,
                        job_title: true,
                        status: true,
                        job_type: true,
                        location: true,
                        created_at: true,
                        organization: { select: { name: true } },
                    },
                },
            },
            orderBy: { contact_job_id: 'desc' },
        });
        return (0, response_1.sendSuccess)(res, {
            organizationUser: orgUser,
            jobs: contactJobs.map((cj) => ({ contact_job_id: cj.contact_job_id, ...cj.job })),
        });
    }
    catch (err) {
        console.error('Error fetching jobs by organization user:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch contact jobs', 500);
    }
};
/**
 * GET /api/contact-jobs/job/:jobId
 */
const getOrganizationUsersByJob = async (req, res) => {
    try {
        const { jobId } = req.params;
        const job = await prisma_config_1.default.job.findUnique({
            where: { job_id: jobId },
            select: { job_id: true, job_title: true, status: true },
        });
        if (!job)
            return (0, response_1.sendError)(res, 'Job not found', 404);
        const contactJobs = await prisma_config_1.default.contactJob.findMany({
            where: { job_id: jobId },
            include: {
                organization_user: {
                    select: {
                        organization_user_id: true,
                        user: {
                            select: { user_id: true, name: true, email: true },
                        },
                        organization: {
                            select: { organization_id: true, name: true },
                        },
                    },
                },
            },
            orderBy: { contact_job_id: 'desc' },
        });
        return (0, response_1.sendSuccess)(res, {
            job,
            organizationUsers: contactJobs.map((cj) => ({ contact_job_id: cj.contact_job_id, ...cj.organization_user })),
        });
    }
    catch (err) {
        console.error('Error fetching organization users by job:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch contact jobs', 500);
    }
};
/**
 * POST /api/contact-jobs
 */
const createContactJob = async (req, res) => {
    try {
        const validation = createContactJobSchema.safeParse(req.body);
        if (!validation.success) {
            const errors = validation.error.issues.map((e) => ({ field: e.path.join('.'), message: e.message }));
            return (0, response_1.sendError)(res, 'Validation failed', 400, errors);
        }
        const { organization_user_id, job_id } = validation.data;
        const [orgUser, job] = await Promise.all([
            prisma_config_1.default.organizationUser.findUnique({ where: { organization_user_id } }),
            prisma_config_1.default.job.findUnique({ where: { job_id } }),
        ]);
        if (!orgUser)
            return (0, response_1.sendError)(res, 'Organization user not found', 404);
        if (!job)
            return (0, response_1.sendError)(res, 'Job not found', 404);
        const existing = await prisma_config_1.default.contactJob.findUnique({
            where: { organization_user_id_job_id: { organization_user_id, job_id } },
        });
        if (existing)
            return (0, response_1.sendError)(res, 'Organization user is already linked to this job', 409);
        const contactJob = await prisma_config_1.default.contactJob.create({
            data: { organization_user_id, job_id },
            include: {
                organization_user: {
                    select: {
                        organization_user_id: true,
                        user: {
                            select: { user_id: true, name: true, email: true },
                        },
                    },
                },
                job: { select: { job_id: true, job_title: true } },
            },
        });
        return (0, response_1.sendSuccess)(res, contactJob, 201);
    }
    catch (err) {
        console.error('Error creating contact job:', err);
        if (err.code === 'P2002')
            return (0, response_1.sendError)(res, 'Organization user is already linked to this job', 409);
        return (0, response_1.sendError)(res, 'Failed to create contact job', 500);
    }
};
/**
 * POST /api/contact-jobs/bulk
 */
const bulkCreateContactJobs = async (req, res) => {
    try {
        const validation = bulkContactJobSchema.safeParse(req.body);
        if (!validation.success) {
            const errors = validation.error.issues.map((e) => ({ field: e.path.join('.'), message: e.message }));
            return (0, response_1.sendError)(res, 'Validation failed', 400, errors);
        }
        const { organization_user_id, job_ids } = validation.data;
        const orgUser = await prisma_config_1.default.organizationUser.findUnique({
            where: { organization_user_id },
        });
        if (!orgUser)
            return (0, response_1.sendError)(res, 'Organization user not found', 404);
        const jobs = await prisma_config_1.default.job.findMany({
            where: { job_id: { in: job_ids } },
            select: { job_id: true },
        });
        if (jobs.length !== job_ids.length)
            return (0, response_1.sendError)(res, 'One or more job IDs not found', 404);
        const existingLinks = await prisma_config_1.default.contactJob.findMany({
            where: { organization_user_id, job_id: { in: job_ids } },
            select: { job_id: true },
        });
        const existingJobIds = new Set(existingLinks.map((l) => l.job_id));
        const newJobIds = job_ids.filter((id) => !existingJobIds.has(id));
        let created = [];
        if (newJobIds.length > 0) {
            await prisma_config_1.default.contactJob.createMany({
                data: newJobIds.map((job_id) => ({ organization_user_id, job_id })),
                skipDuplicates: true,
            });
            created = await prisma_config_1.default.contactJob.findMany({
                where: { organization_user_id, job_id: { in: newJobIds } },
                include: { job: { select: { job_title: true } } },
            });
        }
        return (0, response_1.sendSuccess)(res, { created: created.length, skipped: existingJobIds.size, data: created }, 201);
    }
    catch (err) {
        console.error('Error bulk creating contact jobs:', err);
        return (0, response_1.sendError)(res, 'Failed to link organization user to jobs', 500);
    }
};
/**
 * DELETE /api/contact-jobs/:id
 */
const deleteContactJob = async (req, res) => {
    try {
        const { id } = req.params;
        if (!id)
            return (0, response_1.sendError)(res, 'Contact Job ID is required', 400);
        const existing = await prisma_config_1.default.contactJob.findUnique({ where: { contact_job_id: id } });
        if (!existing)
            return (0, response_1.sendError)(res, 'Contact job link not found', 404);
        await prisma_config_1.default.contactJob.delete({ where: { contact_job_id: id } });
        return (0, response_1.sendSuccess)(res, { message: 'Contact job link removed successfully' });
    }
    catch (err) {
        console.error('Error deleting contact job:', err);
        if (err.code === 'P2025')
            return (0, response_1.sendError)(res, 'Contact job link not found', 404);
        return (0, response_1.sendError)(res, 'Failed to delete contact job link', 500);
    }
};
/**
 * DELETE /api/contact-jobs/organization-user/:organizationUserId/job/:jobId
 */
const deleteContactJobByComposite = async (req, res) => {
    try {
        const { organizationUserId, jobId } = req.params;
        const existing = await prisma_config_1.default.contactJob.findUnique({
            where: { organization_user_id_job_id: { organization_user_id: organizationUserId, job_id: jobId } },
        });
        if (!existing)
            return (0, response_1.sendError)(res, 'Contact job link not found', 404);
        await prisma_config_1.default.contactJob.delete({
            where: { organization_user_id_job_id: { organization_user_id: organizationUserId, job_id: jobId } },
        });
        return (0, response_1.sendSuccess)(res, { message: 'Contact job link removed successfully' });
    }
    catch (err) {
        console.error('Error deleting contact job by composite:', err);
        if (err.code === 'P2025')
            return (0, response_1.sendError)(res, 'Contact job link not found', 404);
        return (0, response_1.sendError)(res, 'Failed to delete contact job link', 500);
    }
};
// ============================================================
// EXPORTS
// ============================================================
/**
 * Dropdown helpers — register these under:
 *   GET /api/contact-activity/dropdown/organization-users
 *   GET /api/contact-activity/dropdown/users
 *   GET /api/contact-activity/dropdown/organizations
 *   GET /api/contact-activity/dropdown/jobs
 */
exports.contactActivityDropdownController = {
    getOrganizationUsers: getOrganizationUsersDropdown,
    getUsers: getAllUsersDropdown,
    getOrganizations: getAllOrganizationsDropdown,
    getJobs: getAllJobsDropdown,
};
exports.contactPreviewController = {
    getAll: getAllContactPreviews,
    getById: getContactPreviewById,
    getByOrganizationUser: getPreviewsByOrganizationUser,
    create: createContactPreview,
    update: updateContactPreview,
    delete: deleteContactPreview,
};
exports.organizationActivityController = {
    getAll: getAllOrganizationActivities,
    getById: getOrganizationActivityById,
    getByOrganization: getActivitiesByOrganization,
    create: createOrganizationActivity,
    update: updateOrganizationActivity,
    delete: deleteOrganizationActivity,
};
exports.contactJobController = {
    getAll: getAllContactJobs,
    getByOrganizationUser: getJobsByOrganizationUser,
    getByJob: getOrganizationUsersByJob,
    create: createContactJob,
    bulkCreate: bulkCreateContactJobs,
    delete: deleteContactJob,
    deleteByComposite: deleteContactJobByComposite,
};
//# sourceMappingURL=contactActivityController.js.map