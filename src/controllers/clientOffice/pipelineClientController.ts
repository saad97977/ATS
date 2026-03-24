import { Request, Response } from 'express';
import prisma from '../../prisma.config';
import { sendSuccess, sendError } from '../../utils/response';

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Get all organization IDs the authenticated user belongs to.
// Throws a 401 if no user on request, returns empty array if no orgs found.
// ─────────────────────────────────────────────────────────────────────────────
const getUserOrgIds = async (req: Request): Promise<string[]> => {
  const userId = (req as any).user?.user_id;
  if (!userId) throw new Error('UNAUTHORIZED');

  const orgUsers = await prisma.organizationUser.findMany({
    where: { user_id: userId },
    select: { organization_id: true },
  });

  return orgUsers.map((o) => o.organization_id);
};

// ─────────────────────────────────────────────────────────────────────────────
// SHARED INCLUDE — identical shape to pipelineController so frontend
// can reuse the same response-parsing logic.
// ─────────────────────────────────────────────────────────────────────────────
const pipelineInclude = {
  application: {
    include: {
      applicant: {
        select: {
          applicant_id: true,
          full_name: true,
          status: true,
          contact: { select: { email: true, phone: true } },
        },
      },
      job: {
        select: {
          job_id: true,
          job_title: true,
          organization: { select: { organization_id: true, name: true } },
          resume_required: true,
          interview_Round1: true,
          interview_Round2: true,
          interview_rounds: true,
        },
      },
      interviews: {
        select: {
          interview_id: true,
          interview_date: true,
          status: true,
          round: true,
          interview_type: true,
        },
        orderBy: { round: 'asc' as const },
      },
    },
  },
  credit_user:         { select: { user_id: true, name: true, email: true } },
  representative_user: { select: { user_id: true, name: true, email: true } },
};

// ─────────────────────────────────────────────────────────────────────────────
// RESHAPE — mirrors pipelineController so frontend gets the same shape
// ─────────────────────────────────────────────────────────────────────────────
const reshapePipelineStage = (stage: any) => {
  const { application, ...stageRest } = stage;
  const { job, ...applicationRest } = application as any;
  const { resume_required, interview_Round1, interview_Round2, interview_rounds, ...jobRest } = job ?? {};
  return {
    ...stageRest,
    application: { ...applicationRest, job: jobRest },
    job_requirements: { resume_required, interview_Round1, interview_Round2, interview_rounds },
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// SCOPING HELPER: Build a Prisma where-clause that restricts pipeline stages
// to jobs belonging to the user's organizations.
// ─────────────────────────────────────────────────────────────────────────────
const orgScopedWhere = (orgIds: string[], extra: Record<string, any> = {}) => ({
  ...extra,
  application: {
    ...extra.application,
    job: {
      ...(extra.application?.job ?? {}),
      organization_id: { in: orgIds },
    },
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// GET ALL PIPELINE STAGES (org-scoped)
// GET /api/clientOffice/pipeline?stage=PIPELINED&page=1&limit=10
// ─────────────────────────────────────────────────────────────────────────────
const getAllPipelineStages = async (req: Request, res: Response) => {
  try {
    const orgIds = await getUserOrgIds(req).catch(() => null);
    if (!orgIds) return sendError(res, 'Unauthorized', 401);
    if (!orgIds.length) return sendSuccess(res, { data: [], paging: { total: 0, page: 1, limit: 10, totalPages: 0 } });

    const page  = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 10));
    const skip  = (page - 1) * limit;
    const stage = req.query.stage as string;

    const stageFilter: any = {};
    if (stage && ['PIPELINED', 'INTERVIEWED', 'ONBOARDED'].includes(stage.toUpperCase())) {
      stageFilter.stage_name = stage.toUpperCase();
    }

    const where = orgScopedWhere(orgIds, stageFilter);

    const [pipelineStages, total] = await Promise.all([
      prisma.pipelineStage.findMany({
        where, skip, take: limit,
        orderBy: { pipeline_date: 'desc' },
        include: pipelineInclude,
      }),
      prisma.pipelineStage.count({ where }),
    ]);

    return sendSuccess(res, {
      data: pipelineStages.map(reshapePipelineStage),
      paging: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (err: any) {
    console.error('[clientOffice] getAllPipelineStages:', err);
    return sendError(res, 'Failed to fetch pipeline stages', 500);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET PIPELINE BY JOB (org-scoped)
// GET /api/clientOffice/pipeline/job/:jobId?stage=PIPELINED
// ─────────────────────────────────────────────────────────────────────────────
const getPipelineByJob = async (req: Request, res: Response) => {
  try {
    const orgIds = await getUserOrgIds(req).catch(() => null);
    if (!orgIds) return sendError(res, 'Unauthorized', 401);
    if (!orgIds.length) return sendSuccess(res, { data: [], paging: { total: 0, page: 1, limit: 10, totalPages: 0 } });

    const { jobId } = req.params;
    const page  = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 10));
    const skip  = (page - 1) * limit;
    const stage = req.query.stage as string;

    const stageFilter: any = {};
    if (stage && ['PIPELINED', 'INTERVIEWED', 'ONBOARDED'].includes(stage.toUpperCase())) {
      stageFilter.stage_name = stage.toUpperCase();
    }

    // Verify the job actually belongs to one of the user's orgs
    const job = await prisma.job.findFirst({
      where: { job_id: jobId, organization_id: { in: orgIds } },
      select: { job_id: true },
    });
    if (!job) return sendError(res, 'Job not found or access denied', 404);

    const where = orgScopedWhere(orgIds, {
      ...stageFilter,
      application: { job_id: jobId },
    });

    const [pipelineStages, total] = await Promise.all([
      prisma.pipelineStage.findMany({
        where, skip, take: limit,
        orderBy: { pipeline_date: 'desc' },
        include: pipelineInclude,
      }),
      prisma.pipelineStage.count({ where }),
    ]);

    return sendSuccess(res, {
      data: pipelineStages.map(reshapePipelineStage),
      paging: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (err: any) {
    console.error('[clientOffice] getPipelineByJob:', err);
    return sendError(res, 'Failed to fetch pipeline', 500);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET PIPELINE OVERVIEW (org-scoped)
// GET /api/clientOffice/pipeline/:pipelineStageId/overview
// ─────────────────────────────────────────────────────────────────────────────
const getPipelineOverview = async (req: Request, res: Response) => {
  try {
    const orgIds = await getUserOrgIds(req).catch(() => null);
    if (!orgIds) return sendError(res, 'Unauthorized', 401);

    const { pipelineStageId } = req.params;

    const ps = await prisma.pipelineStage.findFirst({
      where: {
        pipeline_stage_id: pipelineStageId,
        application: { job: { organization_id: { in: orgIds } } },
      },
      include: {
        application: {
          include: {
            job: {
              select: {
                job_title: true, job_type: true, location: true,
                interview_Round1: true, interview_Round2: true, interview_rounds: true,
                organization: { select: { name: true, website: true } },
              },
            },
            applicant: {
              include: {
                contact: true, demographic: true,
                work_history: { orderBy: { created_at: 'desc' } },
                documents:    { orderBy: { created_at: 'desc' } },
              },
            },
            interviews: { orderBy: { round: 'asc' } },
          },
        },
        credit_user:         { select: { user_id: true, name: true, email: true } },
        representative_user: { select: { user_id: true, name: true, email: true } },
      },
    });

    if (!ps) return sendError(res, 'Pipeline stage not found or access denied', 404);
    return sendSuccess(res, ps);
  } catch (err: any) {
    console.error('[clientOffice] getPipelineOverview:', err);
    return sendError(res, 'Failed to fetch pipeline overview', 500);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET PIPELINE STATS (org-scoped)
// GET /api/clientOffice/pipeline/stats
// ─────────────────────────────────────────────────────────────────────────────
const getPipelineStats = async (req: Request, res: Response) => {
  try {
    const orgIds = await getUserOrgIds(req).catch(() => null);
    if (!orgIds) return sendError(res, 'Unauthorized', 401);
    if (!orgIds.length) {
      return sendSuccess(res, {
        total_candidates: 0,
        by_stage: [
          { stage: 'PIPELINED',  count: 0 },
          { stage: 'INTERVIEWED', count: 0 },
          { stage: 'ONBOARDED',  count: 0 },
        ],
      });
    }

    const where = orgScopedWhere(orgIds);

    const [grouped, total] = await Promise.all([
      prisma.pipelineStage.groupBy({
        by: ['stage_name'],
        where,
        _count: { pipeline_stage_id: true },
      }),
      prisma.pipelineStage.count({ where }),
    ]);

    const by_stage = ['PIPELINED', 'INTERVIEWED', 'ONBOARDED'].map((s) => ({
      stage: s,
      count: grouped.find((g) => g.stage_name === s)?._count.pipeline_stage_id ?? 0,
    }));

    return sendSuccess(res, { total_candidates: total, by_stage });
  } catch (err: any) {
    console.error('[clientOffice] getPipelineStats:', err);
    return sendError(res, 'Failed to fetch pipeline statistics', 500);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET PIPELINE BY INTERVIEW STATUS (org-scoped)
// GET /api/clientOffice/pipeline/filter-by-interview-status?status=PENDING
// ─────────────────────────────────────────────────────────────────────────────
const getPipelineByInterviewStatus = async (req: Request, res: Response) => {
  try {
    const orgIds = await getUserOrgIds(req).catch(() => null);
    if (!orgIds) return sendError(res, 'Unauthorized', 401);
    if (!orgIds.length) return sendSuccess(res, { data: [], paging: { total: 0, page: 1, limit: 10, totalPages: 0 } });

    const page   = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 10));
    const skip   = (page - 1) * limit;
    const status = req.query.status as string;

    const VALID_STATUSES = ['PENDING', 'COMPLETED_RESULT_PENDING', 'REJECTED', 'ACCEPTED'];
    if (!status || !VALID_STATUSES.includes(status.toUpperCase())) {
      return sendError(res, 'Invalid or missing interview status.', 400);
    }

    const where = orgScopedWhere(orgIds, {
      application: {
        interviews: { some: { status: status.toUpperCase() } },
      },
    });

    const [pipelineStages, total] = await Promise.all([
      prisma.pipelineStage.findMany({
        where, skip, take: limit,
        orderBy: { pipeline_date: 'desc' },
        include: pipelineInclude,
      }),
      prisma.pipelineStage.count({ where }),
    ]);

    return sendSuccess(res, {
      data: pipelineStages.map(reshapePipelineStage),
      paging: { total, page, limit, totalPages: Math.ceil(total / limit) },
      filter: { interview_status: status.toUpperCase() },
    });
  } catch (err: any) {
    console.error('[clientOffice] getPipelineByInterviewStatus:', err);
    return sendError(res, 'Failed to fetch pipeline stages', 500);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// SEARCH PIPELINED APPLICANTS (org-scoped)
// GET /api/clientOffice/pipeline/search?query=john
// ─────────────────────────────────────────────────────────────────────────────
const searchPipelinedApplicants = async (req: Request, res: Response) => {
  try {
    const orgIds = await getUserOrgIds(req).catch(() => null);
    if (!orgIds) return sendError(res, 'Unauthorized', 401);
    if (!orgIds.length) return sendSuccess(res, { data: [], paging: { total: 0, page: 1, limit: 10, totalPages: 0 } });

    const page  = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 10));
    const skip  = (page - 1) * limit;
    const query = req.query.query as string;

    if (!query?.trim()) return sendError(res, 'Search query is required', 400);
    const term = query.trim();

    const where = {
      application: {
        job: { organization_id: { in: orgIds } },
        OR: [
          { job: { organization: { name: { contains: term, mode: 'insensitive' as const } } } },
          { job: { job_title:      { contains: term, mode: 'insensitive' as const } } },
          { applicant: { full_name: { contains: term, mode: 'insensitive' as const } } },
          { applicant: { contact: { email: { contains: term, mode: 'insensitive' as const } } } },
        ],
      },
    };

    const [pipelineStages, total] = await Promise.all([
      prisma.pipelineStage.findMany({
        where, skip, take: limit,
        orderBy: { pipeline_date: 'desc' },
        include: pipelineInclude,
      }),
      prisma.pipelineStage.count({ where }),
    ]);

    return sendSuccess(res, {
      data: pipelineStages.map(reshapePipelineStage),
      paging: { total, page, limit, totalPages: Math.ceil(total / limit) },
      search: { query: term },
    });
  } catch (err: any) {
    console.error('[clientOffice] searchPipelinedApplicants:', err);
    return sendError(res, 'Failed to search applicants', 500);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET INTERVIEW BY APPLICATION (org-scoped)
// GET /api/clientOffice/pipeline/interview/application/:applicationId
// ─────────────────────────────────────────────────────────────────────────────
const getInterviewByApplication = async (req: Request, res: Response) => {
  try {
    const orgIds = await getUserOrgIds(req).catch(() => null);
    if (!orgIds) return sendError(res, 'Unauthorized', 401);

    const { applicationId } = req.params;

    // Verify application belongs to user's org
    const application = await prisma.application.findFirst({
      where: {
        application_id: applicationId,
        job: { organization_id: { in: orgIds } },
      },
      select: { application_id: true },
    });
    if (!application) return sendError(res, 'Application not found or access denied', 404);

    const interviews = await (prisma.interview as any).findMany({
      where: { application_id: applicationId },
      orderBy: { round: 'asc' },
      include: {
        application: {
          include: {
            job: {
              select: {
                job_id: true, job_title: true, job_type: true, location: true,
                interview_Round1: true, interview_Round2: true, interview_rounds: true,
                organization: {
                  select: {
                    organization_id: true, name: true, website: true,
                    contacts: { where: { contact_type: 'PRIMARY' }, select: { name: true, email: true, phone: true } },
                  },
                },
              },
            },
            applicant: { include: { contact: true, demographic: true } },
            pipeline_stages: {
              include: {
                credit_user:         { select: { user_id: true, name: true, email: true } },
                representative_user: { select: { user_id: true, name: true, email: true } },
              },
            },
          },
        },
      },
    });

    if (!interviews.length) return sendError(res, 'No interviews found for this application', 404);

    return sendSuccess(res, { interviews });
  } catch (err: any) {
    console.error('[clientOffice] getInterviewByApplication:', err);
    return sendError(res, 'Failed to fetch interview details', 500);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET JOBS (org-scoped)
// GET /api/clientOffice/pipeline/jobs?status=OPEN
// ─────────────────────────────────────────────────────────────────────────────
const getJobs = async (req: Request, res: Response) => {
  try {
    const orgIds = await getUserOrgIds(req).catch(() => null);
    if (!orgIds) return sendError(res, 'Unauthorized', 401);
    if (!orgIds.length) return sendSuccess(res, { data: [], paging: { total: 0, page: 1, limit: 10, totalPages: 0 } });

    const page   = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 10));
    const skip   = (page - 1) * limit;
    const status = req.query.status as string;

    const VALID_STATUSES = ['DRAFT', 'PENDING', 'OPEN', 'CLOSED', 'DECLINED'];
    const where: any = { organization_id: { in: orgIds } };
    if (status && VALID_STATUSES.includes(status.toUpperCase())) {
      where.status = status.toUpperCase();
    }

    const [jobs, total] = await Promise.all([
      prisma.job.findMany({
        where, skip, take: limit,
        orderBy: { created_at: 'desc' },
        include: {
          organization:  { select: { organization_id: true, name: true } },
          job_detail:    true,
          job_owners:    { include: { user: { select: { user_id: true, name: true, email: true } } } },
          job_rates:     true,
          company_office: true,
          _count:        { select: { applications: true } },
        },
      }),
      prisma.job.count({ where }),
    ]);

    return sendSuccess(res, {
      data: jobs,
      paging: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (err: any) {
    console.error('[clientOffice] getJobs:', err);
    return sendError(res, 'Failed to fetch jobs', 500);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET APPLICANTS (org-scoped — applicants who have applied to org's jobs)
// GET /api/clientOffice/pipeline/applicants?status=SHORTLISTED
// ─────────────────────────────────────────────────────────────────────────────
const getApplicants = async (req: Request, res: Response) => {
  try {
    const orgIds = await getUserOrgIds(req).catch(() => null);
    if (!orgIds) return sendError(res, 'Unauthorized', 401);
    if (!orgIds.length) return sendSuccess(res, { data: [], paging: { total: 0, page: 1, limit: 10, totalPages: 0 } });

    const page   = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 10));
    const skip   = (page - 1) * limit;
    const status = req.query.status as string;

    const VALID_STATUSES = ['APPLIED', 'PLACED', 'REJECTED', 'SHORTLISTED', 'INTERVIEWING'];
    const applicantWhere: any = {};
    if (status && VALID_STATUSES.includes(status.toUpperCase())) {
      applicantWhere.status = status.toUpperCase();
    }

    // Only applicants who have an application linked to one of the user's org's jobs
    applicantWhere.applications = {
      some: { job: { organization_id: { in: orgIds } } },
    };

    const [applicants, total] = await Promise.all([
      prisma.applicant.findMany({
        where: applicantWhere, skip, take: limit,
        orderBy: { created_at: 'desc' },
        include: {
          contact:   true,
          documents: { orderBy: { created_at: 'desc' }, take: 5 },
          applications: {
            where: { job: { organization_id: { in: orgIds } } },
            include: {
              job: { select: { job_id: true, job_title: true, organization: { select: { name: true } } } },
              pipeline_stages: { select: { stage_name: true, pipeline_date: true } },
            },
          },
        },
      }),
      prisma.applicant.count({ where: applicantWhere }),
    ]);

    return sendSuccess(res, {
      data: applicants,
      paging: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (err: any) {
    console.error('[clientOffice] getApplicants:', err);
    return sendError(res, 'Failed to fetch applicants', 500);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET ASSIGNMENTS (org-scoped)
// GET /api/clientOffice/pipeline/assignments
// ─────────────────────────────────────────────────────────────────────────────
const getAssignments = async (req: Request, res: Response) => {
  try {
    const orgIds = await getUserOrgIds(req).catch(() => null);
    if (!orgIds) return sendError(res, 'Unauthorized', 401);
    if (!orgIds.length) return sendSuccess(res, { data: [], paging: { total: 0, page: 1, limit: 10, totalPages: 0 } });

    const page  = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 10));
    const skip  = (page - 1) * limit;

    const where = {
      application: {
        job: { organization_id: { in: orgIds } },
      },
    };

    const [assignments, total] = await Promise.all([
      prisma.assignment.findMany({
        where, skip, take: limit,
        orderBy: { created_at: 'desc' },
        include: {
          application: {
            include: {
              applicant: {
                select: {
                  applicant_id: true, full_name: true, status: true,
                  contact: { select: { email: true, phone: true } },
                },
              },
              job: {
                select: {
                  job_id: true, job_title: true,
                  organization: { select: { organization_id: true, name: true } },
                  job_rates: true,
                },
              },
            },
          },
        },
      }),
      prisma.assignment.count({ where }),
    ]);

    return sendSuccess(res, {
      data: assignments,
      paging: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (err: any) {
    console.error('[clientOffice] getAssignments:', err);
    return sendError(res, 'Failed to fetch assignments', 500);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET ORGANIZATIONS THE USER BELONGS TO
// GET /api/clientOffice/pipeline/my-organizations
// ─────────────────────────────────────────────────────────────────────────────
const getMyOrganizations = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.user_id;
    if (!userId) return sendError(res, 'Unauthorized', 401);

    const orgUsers = await prisma.organizationUser.findMany({
      where: { user_id: userId },
      include: {
        organization: {
          include: {
            addresses: true,
            contacts:  true,
            company_offices: true,
            _count: { select: { jobs: true } },
          },
        },
      },
    });

    const organizations = orgUsers.map((ou) => ({
      ...ou.organization,
      user_meta: {
        division:   ou.division,
        department: ou.department,
        title:      ou.title,
        work_phone: ou.work_phone,
      },
    }));

    return sendSuccess(res, { data: organizations });
  } catch (err: any) {
    console.error('[clientOffice] getMyOrganizations:', err);
    return sendError(res, 'Failed to fetch organizations', 500);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// EXPORT
// ─────────────────────────────────────────────────────────────────────────────
export const clientOfficePipelineController = {
  getAllPipelineStages,
  getPipelineByJob,
  getPipelineOverview,
  getPipelineStats,
  getPipelineByInterviewStatus,
  searchPipelinedApplicants,
  getInterviewByApplication,
  getJobs,
  getApplicants,
  getAssignments,
  getMyOrganizations,
};