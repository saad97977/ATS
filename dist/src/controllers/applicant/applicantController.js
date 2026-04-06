"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.applicantController = void 0;
const zod_1 = require("zod");
const prisma_config_1 = __importDefault(require("../../prisma.config"));
const crudFactory_1 = require("../../factories/crudFactory");
const response_1 = require("../../utils/response");
const schemas_1 = require("../../validators/schemas");
const baseApplicantController = (0, crudFactory_1.createCrudController)({
    model: prisma_config_1.default.applicant,
    modelName: 'Applicant',
    idField: 'applicant_id',
    createSchema: schemas_1.createApplicantSchema,
    updateSchema: schemas_1.updateApplicantSchema,
    defaultLimit: 10,
    maxLimit: 100,
});
const listApplicantQuerySchema = zod_1.z.object({
    page: zod_1.z.coerce.number().int().min(1).default(1),
    limit: zod_1.z.coerce.number().int().min(1).max(100).default(20),
    search: zod_1.z.string().trim().optional(),
    status: zod_1.z.enum(['APPLIED', 'PLACED', 'REJECTED', 'SHORTLISTED', 'INTERVIEWING']).optional(),
    add_to_hotlist: zod_1.z
        .union([zod_1.z.literal('true'), zod_1.z.literal('false')])
        .transform((v) => v === 'true')
        .optional(),
    sortBy: zod_1.z
        .enum(['created_at', 'last_active_at', 'full_name', 'status'])
        .default('last_active_at'),
    sortOrder: zod_1.z.enum(['asc', 'desc']).default('desc'),
});
const getApplicantsForTable = async (req, res) => {
    try {
        const parsed = listApplicantQuerySchema.safeParse(req.query);
        if (!parsed.success) {
            return (0, response_1.sendError)(res, 'Validation failed', 400, parsed.error.issues.map((issue) => ({
                field: issue.path.join('.'),
                message: issue.message,
            })));
        }
        const { page, limit, search, status, add_to_hotlist, sortBy, sortOrder } = parsed.data;
        const skip = (page - 1) * limit;
        const now = new Date();
        const where = {};
        if (status)
            where.status = status;
        if (add_to_hotlist !== undefined)
            where.add_to_hotlist = add_to_hotlist;
        if (search) {
            where.OR = [
                { full_name: { contains: search, mode: 'insensitive' } },
                { first_name: { contains: search, mode: 'insensitive' } },
                { last_name: { contains: search, mode: 'insensitive' } },
                { headline: { contains: search, mode: 'insensitive' } },
                { source: { contains: search, mode: 'insensitive' } },
                {
                    contact: {
                        is: {
                            email: { contains: search, mode: 'insensitive' },
                        },
                    },
                },
                {
                    contact: {
                        is: {
                            phone: { contains: search, mode: 'insensitive' },
                        },
                    },
                },
            ];
        }
        const orderBy = sortBy === 'full_name'
            ? [{ last_name: sortOrder }, { first_name: sortOrder }]
            : [{ [sortBy]: sortOrder }, { created_at: 'desc' }];
        const [total, applicants] = await Promise.all([
            prisma_config_1.default.applicant.count({ where }),
            prisma_config_1.default.applicant.findMany({
                where,
                skip,
                take: limit,
                orderBy,
                select: {
                    applicant_id: true,
                    first_name: true,
                    last_name: true,
                    full_name: true,
                    headline: true,
                    status: true,
                    source: true,
                    add_to_hotlist: true,
                    first_impression: true,
                    employment_type_pref: true,
                    comp_code_last: true,
                    created_at: true,
                    last_active_at: true,
                    contact: {
                        select: {
                            email: true,
                            phone: true,
                            city: true,
                            state: true,
                        },
                    },
                    applications: {
                        select: {
                            application_id: true,
                            status: true,
                            applied_at: true,
                            assignment: {
                                select: {
                                    assignment_id: true,
                                    start_date: true,
                                    end_date: true,
                                    timesheets: {
                                        select: {
                                            status: true,
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            }),
        ]);
        const rows = applicants.map((applicant) => {
            const assignments = applicant.applications
                .map((a) => a.assignment)
                .filter((a) => Boolean(a));
            const activeAssignments = assignments.filter((assignment) => !assignment.end_date || new Date(assignment.end_date) >= now);
            const timesheetStatuses = assignments.flatMap((assignment) => assignment.timesheets.map((ts) => ts.status));
            const pendingTimesheets = timesheetStatuses.filter((statusValue) => statusValue === 'SUBMITTED' || statusValue === 'UNDER_REVIEW').length;
            const latestAppliedAt = applicant.applications.length > 0
                ? applicant.applications.reduce((latest, item) => (!latest || item.applied_at > latest ? item.applied_at : latest), null)
                : null;
            return {
                applicant_id: applicant.applicant_id,
                display_name: `${applicant.first_name || ''} ${applicant.last_name || ''}`.trim() || applicant.full_name,
                headline: applicant.headline,
                status: applicant.status,
                source: applicant.source,
                first_impression: applicant.first_impression,
                employment_type_pref: applicant.employment_type_pref,
                add_to_hotlist: applicant.add_to_hotlist,
                comp_code_last: applicant.comp_code_last,
                contact: {
                    email: applicant.contact?.email || null,
                    phone: applicant.contact?.phone || null,
                    location: applicant.contact?.city || applicant.contact?.state
                        ? `${applicant.contact?.city || ''}${applicant.contact?.city && applicant.contact?.state ? ', ' : ''}${applicant.contact?.state || ''}`
                        : null,
                },
                metrics: {
                    applications_count: applicant.applications.length,
                    active_assignments_count: activeAssignments.length,
                    pending_timesheets_count: pendingTimesheets,
                },
                timeline: {
                    latest_applied_at: latestAppliedAt,
                    last_active_at: applicant.last_active_at,
                    created_at: applicant.created_at,
                },
            };
        });
        return (0, response_1.sendSuccess)(res, {
            rows,
            paging: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        });
    }
    catch (error) {
        console.error('Error fetching applicants table data:', error);
        return (0, response_1.sendError)(res, 'Failed to fetch applicants', 500);
    }
};
exports.applicantController = {
    ...baseApplicantController,
    getAll: getApplicantsForTable,
};
//# sourceMappingURL=applicantController.js.map