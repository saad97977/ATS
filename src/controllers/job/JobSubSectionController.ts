import { Request, Response } from 'express';
import prisma from '../../prisma.config';
import { sendSuccess, sendError } from '../../utils/response';

// ============================================================
// SHARED HELPERS
// ============================================================

/**
 * Parse & clamp pagination query params.
 * Defaults: page=1, limit=20, maxLimit=200
 */
function parsePagination(query: Request['query'], defaultLimit = 20, maxLimit = 200) {
  const page  = Math.max(1, parseInt(query.page  as string) || 1);
  const limit = Math.min(maxLimit, Math.max(1, parseInt(query.limit as string) || defaultLimit));
  const skip  = (page - 1) * limit;
  return { page, limit, skip };
}

/**
 * Validate that a job exists and return it, or short-circuit with 404.
 */
async function requireJob(jobId: string, res: Response) {
  const job = await prisma.job.findUnique({
    where: { job_id: jobId },
    select: { job_id: true, job_title: true, organization_id: true, status: true },
  });
  if (!job) {
    sendError(res, 'Job not found', 404);
    return null;
  }
  return job;
}

/**
 * Lightweight existence check used by sub-section endpoints after an
 * empty result set — avoids an extra DB round-trip on the happy path.
 */
async function jobExists(jobId: string): Promise<boolean> {
  const count = await prisma.job.count({ where: { job_id: jobId } });
  return count > 0;
}

// ============================================================
// 1.  JOB APPLICATIONS SUB-SECTION
//     GET /api/jobs/:id/applications
// ============================================================

/**
 * Returns paginated applications for a specific job.
 *
 * Query filters:
 *   status         ApplicationStatus   (APPLIED | SCREENED | OFFERED | HIRED)
 *   source         string              partial match
 *   search         string              searches applicant full_name / email
 *   applied_from   ISO date            applied_at >= date
 *   applied_to     ISO date            applied_at <= date
 *   sort_by        field name          (applied_at | status | full_name) default: applied_at
 *   sort_dir       asc | desc          default: desc
 */
export const getJobApplications = async (req: Request, res: Response) => {
  try {
    const { id: job_id } = req.params;
    const { page, limit, skip } = parsePagination(req.query);

    const {
      status,
      source,
      search,
      applied_from,
      applied_to,
      sort_by   = 'applied_at',
      sort_dir  = 'desc',
    } = req.query as Record<string, string>;

    // ── WHERE clause ────────────────────────────────────────
    const where: any = { job_id };

    if (status)       where.status = status.toUpperCase();
    if (source)       where.source = { contains: source, mode: 'insensitive' };
    if (applied_from || applied_to) {
      where.applied_at = {};
      if (applied_from) where.applied_at.gte = new Date(applied_from);
      if (applied_to)   where.applied_at.lte = new Date(applied_to);
    }
    if (search) {
      where.applicant = {
        OR: [
          { full_name: { contains: search, mode: 'insensitive' } },
          { contact: { email: { contains: search, mode: 'insensitive' } } },
        ],
      };
    }

    // ── ORDER BY ─────────────────────────────────────────────
    const validSortFields: Record<string, any> = {
      applied_at : { applied_at : sort_dir },
      status     : { status     : sort_dir },
      full_name  : { applicant  : { full_name: sort_dir } },
    };
    const orderBy = validSortFields[sort_by] ?? { applied_at: 'desc' };

    // ── QUERY ────────────────────────────────────────────────
    const [applications, total] = await Promise.all([
      prisma.application.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        select: {
          application_id : true,
          job_id         : true,
          source         : true,
          status         : true,
          applied_at     : true,
          applicant: {
            select: {
              applicant_id         : true,
              full_name            : true,
              first_name           : true,
              last_name            : true,
              headline             : true,
              status               : true,
              employment_type_pref : true,
              first_impression     : true,
              add_to_hotlist       : true,
              contact: {
                select: {
                  email      : true,
                  phone      : true,
                  city       : true,
                  state      : true,
                },
              },
              classification: {
                select: {
                  talent_status       : true,
                  position_categories : true,
                  skill_sets          : true,
                },
              },
            },
          },
          pipeline_stages: {
            select: {
              stage_name    : true,
              pipeline_date : true,
            },
            orderBy: { pipeline_date: 'desc' },
            take: 1,
          },
          interviews: {
            select: {
              interview_id   : true,
              round          : true,
              interview_date : true,
              status         : true,
              interview_type : true,
            },
            orderBy: { interview_date: 'desc' },
          },
          evaluations: {
            select: {
              ai_score     : true,
              model_name   : true,
              evaluated_at : true,
            },
          },
          _count: {
            select: { documents: true },
          },
        },
      }),
      prisma.application.count({ where }),
    ]);

    if (total === 0) {
      if (!(await jobExists(job_id))) return sendError(res, 'Job not found', 404);
    }

    return sendSuccess(res, {
      data: applications,
      paging: { total, page, limit, totalPages: Math.ceil(total / limit) },
      filters_applied: { status, source, search, applied_from, applied_to, sort_by, sort_dir },
    });
  } catch (err) {
    console.error('getJobApplications error:', err);
    return sendError(res, 'Failed to fetch job applications', 500);
  }
};

// ============================================================
// 2.  JOB APPLICATIONS — COUNTS SUMMARY
//     GET /api/jobs/:id/applications/counts
// ============================================================

/**
 * Returns aggregate counts broken down by ApplicationStatus.
 * Cheap widget-level call — no pagination needed.
 */
export const getJobApplicationsCounts = async (req: Request, res: Response) => {
  try {
    const { id: job_id } = req.params;

    const [total, byStatus, withInterview, hired] = await Promise.all([
      prisma.application.count({ where: { job_id } }),
      prisma.application.groupBy({
        by: ['status'],
        where: { job_id },
        _count: { application_id: true },
      }),
      prisma.application.count({
        where: { job_id, interviews: { some: {} } },
      }),
      prisma.application.count({ where: { job_id, status: 'HIRED' } }),
    ]);

    const statusMap = Object.fromEntries(
      byStatus.map(s => [s.status, s._count.application_id])
    );

    if (total === 0) {
      if (!(await jobExists(job_id))) return sendError(res, 'Job not found', 404);
    }

    return sendSuccess(res, {
      total,
      applied     : statusMap['APPLIED']  ?? 0,
      screened    : statusMap['SCREENED'] ?? 0,
      offered     : statusMap['OFFERED']  ?? 0,
      hired,
      with_interview: withInterview,
    });
  } catch (err) {
    console.error('getJobApplicationsCounts error:', err);
    return sendError(res, 'Failed to fetch application counts', 500);
  }
};

// ============================================================
// 3.  PIPELINED APPLICANTS SUB-SECTION
//     GET /api/jobs/:id/pipelined
// ============================================================

/**
 * Returns applicants who have a PipelineStage record linked to this job.
 *
 * Query filters:
 *   stage          PipelineStageName  (PIPELINED | INTERVIEWED | ONBOARDED)
 *   search         string             full_name / email
 *   from_date      ISO date           pipeline_date >=
 *   to_date        ISO date           pipeline_date <=
 *   sort_by        pipeline_date | full_name | stage_name   default: pipeline_date
 *   sort_dir       asc | desc         default: desc
 */
export const getJobPipelinedApplicants = async (req: Request, res: Response) => {
  try {
    const { id: job_id } = req.params;
    const { page, limit, skip } = parsePagination(req.query);

    const {
      stage,
      search,
      from_date,
      to_date,
      sort_by  = 'pipeline_date',
      sort_dir = 'desc',
    } = req.query as Record<string, string>;

    // ── WHERE on PipelineStage ───────────────────────────────
    const stageWhere: any = {};
    if (stage)     stageWhere.stage_name   = stage.toUpperCase();
    if (from_date || to_date) {
      stageWhere.pipeline_date = {};
      if (from_date) stageWhere.pipeline_date.gte = new Date(from_date);
      if (to_date)   stageWhere.pipeline_date.lte = new Date(to_date);
    }

    // ── WHERE on Application (→ Job) ────────────────────────
    const applicationWhere: any = { job_id };
    if (search) {
      applicationWhere.applicant = {
        OR: [
          { full_name: { contains: search, mode: 'insensitive' } },
          { contact:   { email: { contains: search, mode: 'insensitive' } } },
        ],
      };
    }

    // ── ORDER BY ─────────────────────────────────────────────
    const validSortFields: Record<string, any> = {
      pipeline_date : { pipeline_date : sort_dir },
      full_name     : { application   : { applicant: { full_name: sort_dir } } },
      stage_name    : { stage_name    : sort_dir },
    };
    const orderBy = validSortFields[sort_by] ?? { pipeline_date: 'desc' };

    // ── QUERY on PipelineStage ───────────────────────────────
    const where = { ...stageWhere, application: applicationWhere };

    const [stages, total] = await Promise.all([
      prisma.pipelineStage.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        select: {
          pipeline_stage_id : true,
          stage_name        : true,
          pipeline_date     : true,
          application: {
            select: {
              application_id : true,
              status         : true,
              applied_at     : true,
              source         : true,
              applicant: {
                select: {
                  applicant_id         : true,
                  full_name            : true,
                  first_name           : true,
                  last_name            : true,
                  headline             : true,
                  status               : true,
                  employment_type_pref : true,
                  first_impression     : true,
                  add_to_hotlist       : true,
                  contact: {
                    select: { email: true, phone: true, city: true, state: true },
                  },
                  classification: {
                    select: { talent_status: true, skill_sets: true },
                  },
                },
              },
              interviews: {
                select: {
                  interview_id   : true,
                  round          : true,
                  status         : true,
                  interview_date : true,
                  interview_type : true,
                },
                orderBy: { interview_date: 'desc' },
              },
            },
          },
          credit_user: {
            select: { user_id: true, name: true, email: true },
          },
          representative_user: {
            select: { user_id: true, name: true, email: true },
          },
        },
      }),
      prisma.pipelineStage.count({ where }),
    ]);

    if (total === 0) {
      if (!(await jobExists(job_id))) return sendError(res, 'Job not found', 404);
    }

    return sendSuccess(res, {
      data: stages,
      paging: { total, page, limit, totalPages: Math.ceil(total / limit) },
      filters_applied: { stage, search, from_date, to_date, sort_by, sort_dir },
    });
  } catch (err) {
    console.error('getJobPipelinedApplicants error:', err);
    return sendError(res, 'Failed to fetch pipelined applicants', 500);
  }
};

// ── Pipeline stage counts ────────────────────────────────────
export const getJobPipelineCounts = async (req: Request, res: Response) => {
  try {
    const { id: job_id } = req.params;

    const grouped = await prisma.pipelineStage.groupBy({
      by: ['stage_name'],
      where: { application: { job_id } },
      _count: { pipeline_stage_id: true },
    });

    const map = Object.fromEntries(
      grouped.map(g => [g.stage_name, g._count.pipeline_stage_id])
    );

    const total = grouped.reduce((s, g) => s + g._count.pipeline_stage_id, 0);
    if (total === 0) {
      if (!(await jobExists(job_id))) return sendError(res, 'Job not found', 404);
    }

    return sendSuccess(res, {
      total,
      pipelined  : map['PIPELINED']   ?? 0,
      interviewed: map['INTERVIEWED'] ?? 0,
      onboarded  : map['ONBOARDED']   ?? 0,
    });
  } catch (err) {
    console.error('getJobPipelineCounts error:', err);
    return sendError(res, 'Failed to fetch pipeline counts', 500);
  }
};

// ============================================================
// 4.  NOMINATED / ASSIGNED APPLICANTS SUB-SECTION
//     GET /api/jobs/:id/assignments
// ============================================================

/**
 * Returns workers who have been placed (have an Assignment) for this job.
 *
 * Query filters:
 *   employment_type  EmploymentType  (W2 | 1099)
 *   search           string          full_name / email
 *   start_from       ISO date        start_date >=
 *   start_to         ISO date        start_date <=
 *   end_from         ISO date        end_date >=
 *   end_to           ISO date        end_date <=
 *   active_only      boolean         omit ended assignments
 *   falloff          boolean         filter by falloff flag
 *   sort_by          start_date | full_name | employment_type   default: start_date
 *   sort_dir         asc | desc      default: desc
 */
export const getJobAssignments = async (req: Request, res: Response) => {
  try {
    const { id: job_id } = req.params;
    const { page, limit, skip } = parsePagination(req.query);

    const {
      employment_type,
      search,
      start_from,
      start_to,
      end_from,
      end_to,
      active_only,
      falloff,
      sort_by  = 'start_date',
      sort_dir = 'desc',
    } = req.query as Record<string, string>;

    // ── WHERE on Assignment ──────────────────────────────────
    const assignmentWhere: any = {};
    if (employment_type)   assignmentWhere.employment_type = employment_type.toUpperCase();
    if (falloff !== undefined)   assignmentWhere.falloff   = falloff === 'true';
    if (start_from || start_to) {
      assignmentWhere.start_date = {};
      if (start_from) assignmentWhere.start_date.gte = new Date(start_from);
      if (start_to)   assignmentWhere.start_date.lte = new Date(start_to);
    }
    if (end_from || end_to) {
      assignmentWhere.end_date = {};
      if (end_from) assignmentWhere.end_date.gte = new Date(end_from);
      if (end_to)   assignmentWhere.end_date.lte = new Date(end_to);
    }
    if (active_only === 'true') {
      const now = new Date();
      assignmentWhere.start_date = { ...(assignmentWhere.start_date ?? {}), lte: now };
      assignmentWhere.OR = [
        { end_date: null },
        { end_date: { gte: now } },
      ];
    }

    // ── WHERE on Application / Applicant (search) ────────────
    const applicationWhere: any = { job_id };
    if (search) {
      applicationWhere.applicant = {
        OR: [
          { full_name: { contains: search, mode: 'insensitive' } },
          { contact:   { email: { contains: search, mode: 'insensitive' } } },
        ],
      };
    }

    const where = {
      ...assignmentWhere,
      application: applicationWhere,
    };

    // ── ORDER BY ─────────────────────────────────────────────
    const validSortFields: Record<string, any> = {
      start_date      : { start_date      : sort_dir },
      employment_type : { employment_type : sort_dir },
      full_name       : { application     : { applicant: { full_name: sort_dir } } },
    };
    const orderBy = validSortFields[sort_by] ?? { start_date: 'desc' };

    const [assignments, total] = await Promise.all([
      prisma.assignment.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        select: {
          assignment_id      : true,
          start_date         : true,
          end_date           : true,
          employment_type    : true,
          workers_comp_code  : true,
          timesheets_enabled : true,
          hire_pay_rate      : true,
          hire_bill_rate     : true,
          hire_ot_pay_rate   : true,
          hire_ot_bill_rate  : true,
          hire_markup        : true,
          falloff            : true,
          extended           : true,
          hired_notes        : true,
          created_at         : true,
          application: {
            select: {
              application_id : true,
              status         : true,
              applied_at     : true,
              source         : true,
              applicant: {
                select: {
                  applicant_id         : true,
                  full_name            : true,
                  first_name           : true,
                  last_name            : true,
                  headline             : true,
                  status               : true,
                  employment_type_pref : true,
                  contact: {
                    select: { email: true, phone: true, city: true, state: true },
                  },
                  demographic: {
                    select: { work_authorization: true },
                  },
                },
              },
            },
          },
          _count: {
            select: { timesheets: true, invoices: true },
          },
        },
      }),
      prisma.assignment.count({ where }),
    ]);

    if (total === 0) {
      if (!(await jobExists(job_id))) return sendError(res, 'Job not found', 404);
    }

    return sendSuccess(res, {
      data: assignments,
      paging: { total, page, limit, totalPages: Math.ceil(total / limit) },
      filters_applied: {
        employment_type, search, start_from, start_to,
        end_from, end_to, active_only, falloff, sort_by, sort_dir,
      },
    });
  } catch (err) {
    console.error('getJobAssignments error:', err);
    return sendError(res, 'Failed to fetch job assignments', 500);
  }
};

// ── Assignment counts ────────────────────────────────────────
export const getJobAssignmentCounts = async (req: Request, res: Response) => {
  try {
    const { id: job_id } = req.params;
    const now = new Date();

    const [total, active, w2, contractor, falloffs, extended] = await Promise.all([
      prisma.assignment.count({ where: { application: { job_id } } }),
      prisma.assignment.count({
        where: {
          application: { job_id },
          start_date: { lte: now },
          OR: [{ end_date: null }, { end_date: { gte: now } }],
        },
      }),
      prisma.assignment.count({ where: { application: { job_id }, employment_type: 'W2' } }),
      prisma.assignment.count({
        where: { application: { job_id }, employment_type: 'CONTRACTOR_1099' },
      }),
      prisma.assignment.count({ where: { application: { job_id }, falloff: true } }),
      prisma.assignment.count({ where: { application: { job_id }, extended: true } }),
    ]);

    if (total === 0) {
      if (!(await jobExists(job_id))) return sendError(res, 'Job not found', 404);
    }

    return sendSuccess(res, { total, active, w2, contractor, falloffs, extended });
  } catch (err) {
    console.error('getJobAssignmentCounts error:', err);
    return sendError(res, 'Failed to fetch assignment counts', 500);
  }
};

// ============================================================
// 5.  TIMESHEETS SUB-SECTION
//     GET /api/jobs/:id/timesheets
// ============================================================

/**
 * Returns paginated timesheets for all assignments under this job.
 *
 * Query filters:
 *   status         TimesheetStatus   (DRAFT|SUBMITTED|UNDER_REVIEW|APPROVED|REJECTED|PROCESSED)
 *   search         string            applicant full_name / email
 *   week_from      ISO date          week_start_date >=
 *   week_to        ISO date          week_start_date <=
 *   assignment_id  UUID              narrow to one worker
 *   qb_synced      boolean
 *   sort_by        week_start_date | status | total_hours | total_bill_amount  default: week_start_date
 *   sort_dir       asc | desc        default: desc
 */
export const getJobTimesheets = async (req: Request, res: Response) => {
  try {
    const { id: job_id } = req.params;
    const { page, limit, skip } = parsePagination(req.query);

    const {
      status,
      search,
      week_from,
      week_to,
      assignment_id,
      qb_synced,
      sort_by  = 'week_start_date',
      sort_dir = 'desc',
    } = req.query as Record<string, string>;

    // ── WHERE on Timesheet ───────────────────────────────────
    const where: any = {
    assignment: {
        application: {
        job_id,
        ...(search && {
            applicant: {
            OR: [
                { full_name: { contains: search, mode: 'insensitive' } },
                { contact:   { email: { contains: search, mode: 'insensitive' } } },
            ],
            },
        }),
        },
    },
    };

    if (status)        where.status    = status.toUpperCase();
    if (assignment_id) where.assignment_id = assignment_id;
    if (qb_synced !== undefined) where.qb_synced = qb_synced === 'true';
    if (week_from || week_to) {
      where.week_start_date = {};
      if (week_from) where.week_start_date.gte = new Date(week_from);
      if (week_to)   where.week_start_date.lte = new Date(week_to);
    }


    // ── ORDER BY ─────────────────────────────────────────────
    const validSortFields: Record<string, any> = {
      week_start_date    : { week_start_date    : sort_dir },
      status             : { status             : sort_dir },
      total_hours        : { total_hours        : sort_dir },
      total_bill_amount  : { total_bill_amount  : sort_dir },
      total_pay_amount   : { total_pay_amount   : sort_dir },
    };
    const orderBy = validSortFields[sort_by] ?? { week_start_date: 'desc' };

    const [timesheets, total] = await Promise.all([
      prisma.timesheet.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        select: {
          timesheet_id          : true,
          assignment_id         : true,
          week_start_date       : true,
          week_end_date         : true,
          status                : true,
          total_regular_hours   : true,
          total_ot_hours        : true,
          total_hours           : true,
          bill_rate             : true,
          ot_bill_rate          : true,
          total_bill_amount     : true,
          pay_rate              : true,
          ot_pay_rate           : true,
          total_pay_amount      : true,
          submitted_at          : true,
          reviewed_at           : true,
          approved_at           : true,
          rejected_at           : true,
          rejection_reason      : true,
          notes                 : true,
          qb_synced             : true,
          qb_synced_at          : true,
          created_at            : true,
          custom_bill_rate      : true,
          custom_pay_rate       : true,
          rate_override_reason  : true,
          assignment: {
            select: {
              employment_type : true,
              start_date      : true,
              end_date        : true,
              application: {
                select: {
                  applicant: {
                    select: {
                      applicant_id : true,
                      full_name    : true,
                      first_name   : true,
                      last_name    : true,
                      contact: {
                        select: { email: true, phone: true },
                      },
                    },
                  },
                },
              },
            },
          },
          reviewed_by: {
            select: { user_id: true, name: true, email: true },
          },
          invoice: {
            select: {
              invoice_id     : true,
              invoice_number : true,
              status         : true,
              total_amount   : true,
              paid_at        : true,
            },
          },
          _count: {
            select: { time_entries: true },
          },
        },
      }),
      prisma.timesheet.count({ where }),
    ]);

    if (total === 0) {
      if (!(await jobExists(job_id))) return sendError(res, 'Job not found', 404);
    }

    return sendSuccess(res, {
      data: timesheets,
      paging: { total, page, limit, totalPages: Math.ceil(total / limit) },
      filters_applied: {
        status, search, week_from, week_to,
        assignment_id, qb_synced, sort_by, sort_dir,
      },
    });
  } catch (err) {
    console.error('getJobTimesheets error:', err);
    return sendError(res, 'Failed to fetch job timesheets', 500);
  }
};

// ── Timesheet aggregate counts ───────────────────────────────
export const getJobTimesheetCounts = async (req: Request, res: Response) => {
  try {
    const { id: job_id } = req.params;

    const baseWhere = { assignment: { application: { job_id } } };

    const [total, byStatus, aggHours, aggBill] = await Promise.all([
      prisma.timesheet.count({ where: baseWhere }),
      prisma.timesheet.groupBy({
        by: ['status'],
        where: baseWhere,
        _count: { timesheet_id: true },
      }),
      prisma.timesheet.aggregate({
        where: baseWhere,
        _sum: {
          total_regular_hours : true,
          total_ot_hours      : true,
          total_hours         : true,
        },
      }),
      prisma.timesheet.aggregate({
        where: { ...baseWhere, status: 'APPROVED' },
        _sum: {
          total_bill_amount : true,
          total_pay_amount  : true,
        },
      }),
    ]);

    const statusMap = Object.fromEntries(
      byStatus.map(s => [s.status, s._count.timesheet_id])
    );

    if (total === 0) {
      if (!(await jobExists(job_id))) return sendError(res, 'Job not found', 404);
    }

    return sendSuccess(res, {
      total,
      draft        : statusMap['DRAFT']        ?? 0,
      submitted    : statusMap['SUBMITTED']    ?? 0,
      under_review : statusMap['UNDER_REVIEW'] ?? 0,
      approved     : statusMap['APPROVED']     ?? 0,
      rejected     : statusMap['REJECTED']     ?? 0,
      processed    : statusMap['PROCESSED']    ?? 0,
      aggregate: {
        total_regular_hours : aggHours._sum.total_regular_hours ?? 0,
        total_ot_hours      : aggHours._sum.total_ot_hours      ?? 0,
        total_hours         : aggHours._sum.total_hours         ?? 0,
        total_bill_amount   : aggBill._sum.total_bill_amount    ?? 0,
        total_pay_amount    : aggBill._sum.total_pay_amount     ?? 0,
      },
    });
  } catch (err) {
    console.error('getJobTimesheetCounts error:', err);
    return sendError(res, 'Failed to fetch timesheet counts', 500);
  }
};

// ============================================================
// 6.  TIMESHEET TIME-ENTRIES DRILL-DOWN
//     GET /api/jobs/:id/timesheets/:timesheetId/entries
// ============================================================

/**
 * Returns day-level time entries for a specific timesheet,
 * verifying the timesheet belongs to this job.
 *
 * Query filters:
 *   work_type    WorkType   (REGULAR|OVERTIME|HOLIDAY|SICK|PTO|UNPAID)
 *   from_date    ISO date   work_date >=
 *   to_date      ISO date   work_date <=
 */
export const getTimesheetEntries = async (req: Request, res: Response) => {
  try {
    const { id: job_id, timesheetId } = req.params;

    // Verify the timesheet belongs to this job
    const timesheet = await prisma.timesheet.findFirst({
      where: {
        timesheet_id : timesheetId,
        assignment   : { application: { job_id } },
      },
      select: {
        timesheet_id         : true,
        week_start_date      : true,
        week_end_date        : true,
        status               : true,
        total_regular_hours  : true,
        total_ot_hours       : true,
        total_hours          : true,
        bill_rate            : true,
        ot_bill_rate         : true,
        total_bill_amount    : true,
        pay_rate             : true,
        ot_pay_rate          : true,
        total_pay_amount     : true,
      },
    });

    if (!timesheet) {
      return sendError(res, 'Timesheet not found for this job', 404);
    }

    const { work_type, from_date, to_date } = req.query as Record<string, string>;
    const { page, limit, skip } = parsePagination(req.query, 31, 31); // max 31 days

    const where: any = { timesheet_id: timesheetId };
    if (work_type) where.work_type = work_type.toUpperCase();
    if (from_date || to_date) {
      where.work_date = {};
      if (from_date) where.work_date.gte = new Date(from_date);
      if (to_date)   where.work_date.lte = new Date(to_date);
    }

    const entries = await prisma.timeEntry.findMany({
      where,
      skip,
      take: limit,
      orderBy: { work_date: 'asc' },
      select: {
        time_entry_id  : true,
        work_date      : true,
        regular_hours  : true,
        ot_hours       : true,
        total_hours    : true,
        break_minutes  : true,
        work_type      : true,
        notes          : true,
        created_at     : true,
        updated_at     : true,
      },
    });

    return sendSuccess(res, {
      timesheet,
      entries,
      total_entries: entries.length,
    });
  } catch (err) {
    console.error('getTimesheetEntries error:', err);
    return sendError(res, 'Failed to fetch timesheet entries', 500);
  }
};

// ============================================================
// 7.  COMPREHENSIVE JOB OVERVIEW (all sub-sections, counts only)
//     GET /api/jobs/:id/overview
// ============================================================

/**
 * Single call that returns all sub-section counts in parallel.
 * Ideal for populating badge numbers on tabs.
 */
export const getJobOverview = async (req: Request, res: Response) => {
  try {
    const { id: job_id } = req.params;
    const job = await requireJob(job_id, res);
    if (!job) return;

    const now = new Date();

    const [
      appTotal,
      appByStatus,
      pipelineGrouped,
      assignmentTotal,
      activeAssignments,
      timesheetTotal,
      timesheetByStatus,
      hoursAggregate,
      interviewTotal,
    ] = await Promise.all([
      // Applications
      prisma.application.count({ where: { job_id } }),
      prisma.application.groupBy({
        by: ['status'],
        where: { job_id },
        _count: { application_id: true },
      }),

      // Pipeline
      prisma.pipelineStage.groupBy({
        by: ['stage_name'],
        where: { application: { job_id } },
        _count: { pipeline_stage_id: true },
      }),

      // Assignments
      prisma.assignment.count({ where: { application: { job_id } } }),
      prisma.assignment.count({
        where: {
          application: { job_id },
          start_date: { lte: now },
          OR: [{ end_date: null }, { end_date: { gte: now } }],
        },
      }),

      // Timesheets
      prisma.timesheet.count({ where: { assignment: { application: { job_id } } } }),
      prisma.timesheet.groupBy({
        by: ['status'],
        where: { assignment: { application: { job_id } } },
        _count: { timesheet_id: true },
      }),

      // Hours / billing aggregate (approved timesheets only)
      prisma.timesheet.aggregate({
        where: {
          status     : 'APPROVED',
          assignment : { application: { job_id } },
        },
        _sum: {
          total_hours        : true,
          total_bill_amount  : true,
          total_pay_amount   : true,
        },
      }),

      // Interviews
      prisma.interview.count({ where: { application: { job_id } } }),
    ]);

    const appMap      = Object.fromEntries(appByStatus.map(s      => [s.status,     s._count.application_id]));
    const stageMap    = Object.fromEntries(pipelineGrouped.map(s  => [s.stage_name, s._count.pipeline_stage_id]));
    const tsMap       = Object.fromEntries(timesheetByStatus.map(s => [s.status,    s._count.timesheet_id]));

    return sendSuccess(res, {
      job: {
        job_id         : job.job_id,
        job_title      : job.job_title,
        status         : job.status,
        organization_id: job.organization_id,
      },
      applications: {
        total   : appTotal,
        applied : appMap['APPLIED']  ?? 0,
        screened: appMap['SCREENED'] ?? 0,
        offered : appMap['OFFERED']  ?? 0,
        hired   : appMap['HIRED']    ?? 0,
      },
      pipeline: {
        total      : pipelineGrouped.reduce((s, g) => s + g._count.pipeline_stage_id, 0),
        pipelined  : stageMap['PIPELINED']   ?? 0,
        interviewed: stageMap['INTERVIEWED'] ?? 0,
        onboarded  : stageMap['ONBOARDED']   ?? 0,
      },
      assignments: {
        total  : assignmentTotal,
        active : activeAssignments,
        ended  : assignmentTotal - activeAssignments,
      },
      timesheets: {
        total        : timesheetTotal,
        draft        : tsMap['DRAFT']        ?? 0,
        submitted    : tsMap['SUBMITTED']    ?? 0,
        under_review : tsMap['UNDER_REVIEW'] ?? 0,
        approved     : tsMap['APPROVED']     ?? 0,
        rejected     : tsMap['REJECTED']     ?? 0,
        processed    : tsMap['PROCESSED']    ?? 0,
      },
      financials: {
        total_approved_hours : hoursAggregate._sum.total_hours        ?? 0,
        total_bill_amount    : hoursAggregate._sum.total_bill_amount   ?? 0,
        total_pay_amount     : hoursAggregate._sum.total_pay_amount    ?? 0,
      },
      interviews: {
        total: interviewTotal,
      },
    });
  } catch (err) {
    console.error('getJobOverview error:', err);
    return sendError(res, 'Failed to fetch job overview', 500);
  }
};

// ============================================================
// 8.  INTERVIEWS SUB-SECTION
//     GET /api/jobs/:id/interviews
// ============================================================

/**
 * Returns paginated interviews for all applications under this job.
 *
 * Query filters:
 *   status         InterviewStatus   (PENDING|COMPLETED_RESULT_PENDING|REJECTED|ACCEPTED)
 *   interview_type InterviewType     (ONLINE|OFFLINE)
 *   round          number
 *   search         string            applicant full_name / email
 *   from_date      ISO date          interview_date >=
 *   to_date        ISO date          interview_date <=
 *   sort_by        interview_date | round | status   default: interview_date
 *   sort_dir       asc | desc        default: desc
 */
export const getJobInterviews = async (req: Request, res: Response) => {
  try {
    const { id: job_id } = req.params;
    const { page, limit, skip } = parsePagination(req.query);

    const {
      status,
      interview_type,
      round,
      search,
      from_date,
      to_date,
      sort_by  = 'interview_date',
      sort_dir = 'desc',
    } = req.query as Record<string, string>;

    const where: any = { application: { job_id } };

    if (status)         where.status         = status.toUpperCase();
    if (interview_type) where.interview_type = interview_type.toUpperCase();
    if (round)          where.round          = parseInt(round);
    if (from_date || to_date) {
      where.interview_date = {};
      if (from_date) where.interview_date.gte = new Date(from_date);
      if (to_date)   where.interview_date.lte = new Date(to_date);
    }
    if (search) {
      where.application = {
        job_id,
        applicant: {
          OR: [
            { full_name: { contains: search, mode: 'insensitive' } },
            { contact:   { email: { contains: search, mode: 'insensitive' } } },
          ],
        },
      };
    }

    const validSortFields: Record<string, any> = {
      interview_date : { interview_date : sort_dir },
      round          : { round          : sort_dir },
      status         : { status         : sort_dir },
    };
    const orderBy = validSortFields[sort_by] ?? { interview_date: 'desc' };

    const [interviews, total] = await Promise.all([
      prisma.interview.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        select: {
          interview_id   : true,
          round          : true,
          interview_date : true,
          status         : true,
          interview_type : true,
          application: {
            select: {
              application_id : true,
              status         : true,
              applied_at     : true,
              applicant: {
                select: {
                  applicant_id : true,
                  full_name    : true,
                  first_name   : true,
                  last_name    : true,
                  contact: {
                    select: { email: true, phone: true },
                  },
                },
              },
            },
          },
        },
      }),
      prisma.interview.count({ where }),
    ]);

    if (total === 0) {
      if (!(await jobExists(job_id))) return sendError(res, 'Job not found', 404);
    }

    return sendSuccess(res, {
      data: interviews,
      paging: { total, page, limit, totalPages: Math.ceil(total / limit) },
      filters_applied: {
        status, interview_type, round, search,
        from_date, to_date, sort_by, sort_dir,
      },
    });
  } catch (err) {
    console.error('getJobInterviews error:', err);
    return sendError(res, 'Failed to fetch job interviews', 500);
  }
};