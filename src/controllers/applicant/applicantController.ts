import { Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../../prisma.config';
import { createCrudController } from '../../factories/crudFactory';
import { sendError, sendSuccess } from '../../utils/response';
import { createApplicantSchema, updateApplicantSchema } from '../../validators/schemas';

const baseApplicantController = createCrudController({
  model: prisma.applicant,
  modelName: 'Applicant',
  idField: 'applicant_id',
  createSchema: createApplicantSchema,
  updateSchema: updateApplicantSchema,
  defaultLimit: 10,
  maxLimit: 100,
});

const listApplicantQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().optional(),
  status: z.enum(['APPLIED', 'PLACED', 'REJECTED', 'SHORTLISTED', 'INTERVIEWING']).optional(),
  add_to_hotlist: z
    .union([z.literal('true'), z.literal('false')])
    .transform((v) => v === 'true')
    .optional(),
  sortBy: z
    .enum(['created_at', 'last_active_at', 'full_name', 'status'])
    .default('last_active_at'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

const getApplicantsForTable = async (req: Request, res: Response) => {
  try {
    const parsed = listApplicantQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return sendError(
        res,
        'Validation failed',
        400,
        parsed.error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        }))
      );
    }

    const { page, limit, search, status, add_to_hotlist, sortBy, sortOrder } = parsed.data;
    const skip = (page - 1) * limit;
    const now = new Date();

    const where: any = {};
    if (status) where.status = status;
    if (add_to_hotlist !== undefined) where.add_to_hotlist = add_to_hotlist;

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

    const orderBy =
      sortBy === 'full_name'
        ? [{ last_name: sortOrder }, { first_name: sortOrder }]
        : [{ [sortBy]: sortOrder }, { created_at: 'desc' as const }];

    const [total, applicants] = await Promise.all([
      prisma.applicant.count({ where }),
      prisma.applicant.findMany({
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
        .filter((a): a is NonNullable<typeof a> => Boolean(a));

      const activeAssignments = assignments.filter(
        (assignment) => !assignment.end_date || new Date(assignment.end_date) >= now
      );

      const timesheetStatuses = assignments.flatMap((assignment) =>
        assignment.timesheets.map((ts) => ts.status)
      );

      const pendingTimesheets = timesheetStatuses.filter(
        (statusValue) => statusValue === 'SUBMITTED' || statusValue === 'UNDER_REVIEW'
      ).length;

      const latestAppliedAt =
        applicant.applications.length > 0
          ? applicant.applications.reduce(
              (latest, item) => (!latest || item.applied_at > latest ? item.applied_at : latest),
              null as Date | null
            )
          : null;

      return {
        applicant_id: applicant.applicant_id,
        display_name:
          `${applicant.first_name || ''} ${applicant.last_name || ''}`.trim() || applicant.full_name,
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
          location:
            applicant.contact?.city || applicant.contact?.state
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

    return sendSuccess(res, {
      rows,
      paging: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching applicants table data:', error);
    return sendError(res, 'Failed to fetch applicants', 500);
  }
};

export const applicantController = {
  ...baseApplicantController,
  getAll: getApplicantsForTable,
};