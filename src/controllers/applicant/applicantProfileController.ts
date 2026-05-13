import { Request, Response } from 'express';
import prisma from '../../prisma.config';
import { sendSuccess, sendError } from '../../utils/response';
import { z } from 'zod';
import { BlobServiceClient } from '@azure/storage-blob';

// ─── Azure Blob Setup ────────────────────────────────────────────────────────
if (!process.env.AZURE_STORAGE_CONNECTION_STRING) {
  throw new Error('AZURE_STORAGE_CONNECTION_STRING is not defined');
}
const blobServiceClient = BlobServiceClient.fromConnectionString(
  process.env.AZURE_STORAGE_CONNECTION_STRING
);
const containerName = process.env.AZURE_CONTAINER_NAME || 'applicant-documents';

const getContainerClient = async () => {
  const cc = blobServiceClient.getContainerClient(containerName);
  await cc.createIfNotExists({ access: 'blob' });
  return cc;
};

const generateBlobName = (applicantId: string, suffix: string, originalName: string) => {
  const ts   = Date.now();
  const rand = Math.random().toString(36).substring(2, 8);
  const safe = originalName.replace(/[^a-zA-Z0-9.-]/g, '_');
  return `${applicantId}/${suffix}/${ts}-${rand}-${safe}`;
};

// ─── Validation Schemas ──────────────────────────────────────────────────────
const updateApplicantSchema = z.object({
  full_name:                z.string().min(2).optional(),
  first_name:               z.string().optional(),
  last_name:                z.string().optional(),
  headline:                 z.string().optional(),
  notes:                    z.string().optional(),
  comp_code_last:           z.string().max(4).optional(),
  source:                   z.string().optional(),
  is_us_citizen:            z.boolean().optional(),
  employment_type_pref:     z.enum(['W2', '1099', 'C2C']).optional(),
  first_impression:         z.enum(['A', 'B', 'C', 'D', 'F']).optional(),
  add_to_hotlist:           z.boolean().optional(),
  text_consent:             z.enum(['No Response', 'Yes', 'No']).optional(),
  communication_preference: z.string().optional(),
  is_optout:                z.boolean().optional(),
  is_private:               z.boolean().optional(),
  office_name:              z.string().optional(),
  office_division:          z.enum(['SMS_HOSPITALITY', 'SMS_MCL_JASCO_GOC', 'SMS_ADMIN', 'SMS_STAFFING_SOLUTIONS', 'SPECIAL_MULTI_ADMIN', 'SPECIAL_MULTI_INC']).optional(),
  home_office:              z.string().optional(),
  geo_code:                 z.string().optional(),
  school_district:          z.string().optional(),

  // Contact
  email:       z.string().email().optional(),
  email2:      z.string().email().optional(),
  phone:       z.string().optional(),
  work_phone:  z.string().optional(),
  home_phone:  z.string().optional(),
  address:     z.string().optional(),
  city:        z.string().optional(),
  state:       z.string().optional(),
  zip:         z.string().optional(),
  country:     z.string().optional(),

  // Demographics
  birth_date:            z.string().datetime().optional(),
  gender:                z.string().optional(),
  race:                  z.string().optional(),
  disability:            z.string().optional(),
  work_authorization:    z.string().optional(),
  authorization_expiry:  z.string().datetime().optional(),

  // Social
  linkedin_url:   z.string().url().optional(),
  portfolio_url:  z.string().url().optional(),
});

const bulkApplySchema = z.object({
  applicant_id: z.string().uuid('Valid applicant ID required'),
  job_ids:      z.array(z.string().uuid()).min(1, 'At least one job ID required').max(50),
  source:       z.string().optional().default('INTERNAL'),
});

// ─── Shared Includes ─────────────────────────────────────────────────────────
// Full applicant profile include — used by getProfile and getProfileById.
// Does NOT include applications — those are lazy-loaded via separate endpoints.
const FULL_PROFILE_INCLUDE = {
  contact:         true,
  demographic:     true,
  social_profiles: true,
  documents: {
    orderBy: { created_at: 'desc' as const },
  },
  work_history: {
    where:   { application_id: null },   // profile-level only (not application snapshots)
    orderBy: { created_at: 'desc' as const },
  },
  education: {
    orderBy: { school: 'asc' as const },
  },
  classification: true,
  applicant_tags: true,
  references: {
    include: {
      user: { select: { user_id: true, name: true, email: true } },
    },
  },
};

// ════════════════════════════════════════════════════════════════════════════
//  1. LIST ALL APPLICANTS
//     GET /api/applicantprofiles/applicants
//     Paginated list with search, status filter, source filter, and sorting.
//     Supports cursor-based pagination via ?cursor=<applicant_id>.
// ════════════════════════════════════════════════════════════════════════════
export const listApplicants = async (req: Request, res: Response) => {
  try {
    const {
      page    = '1',
      limit   = '20',
      search  = '',
      status,
      source,
      hotlist,
      is_private,
      employment_type_pref,
      work_authorization,
      office_name,
      sort_by  = 'created_at',
      sort_dir = 'desc',
      cursor,
    } = req.query as Record<string, string>;

    const take = Math.min(parseInt(limit) || 20, 100);
    const skip = cursor ? undefined : (parseInt(page) - 1) * take;

    // ── WHERE clause ─────────────────────────────────────────────────────────
    const where: any = {};

    if (search?.trim()) {
      const q = search.trim();
      where.OR = [
        { full_name:  { contains: q, mode: 'insensitive' } },
        { first_name: { contains: q, mode: 'insensitive' } },
        { last_name:  { contains: q, mode: 'insensitive' } },
        { headline:   { contains: q, mode: 'insensitive' } },
        { contact:    { email: { contains: q, mode: 'insensitive' } } },
        { contact:    { phone: { contains: q, mode: 'insensitive' } } },
        { contact:    { city:  { contains: q, mode: 'insensitive' } } },
      ];
    }

    if (status)               where.status               = status;
    if (source)               where.source               = source;
    if (office_name)          where.office_name           = { contains: office_name, mode: 'insensitive' };
    if (employment_type_pref) where.employment_type_pref = employment_type_pref;
    if (hotlist === 'true')   where.add_to_hotlist        = true;
    if (is_private === 'true')  where.is_private          = true;
    if (is_private === 'false') where.is_private          = false;

    if (work_authorization) {
      where.demographic = { work_authorization };
    }

    if (cursor) {
      where.applicant_id = { gt: cursor };
    }

    // ── ORDER BY ──────────────────────────────────────────────────────────────
    const allowedSorts: Record<string, any> = {
      created_at:     { created_at:    sort_dir === 'asc' ? 'asc' : 'desc' },
      full_name:      { full_name:     sort_dir === 'asc' ? 'asc' : 'desc' },
      last_active_at: { last_active_at: sort_dir === 'asc' ? 'asc' : 'desc' },
      status:         { status:        sort_dir === 'asc' ? 'asc' : 'desc' },
    };
    const orderBy = allowedSorts[sort_by] ?? { created_at: 'desc' };

    // ── QUERIES (parallel) ────────────────────────────────────────────────────
    const [applicants, total] = await Promise.all([
      prisma.applicant.findMany({
        where,
        take,
        skip,
        ...(cursor ? { cursor: { applicant_id: cursor }, skip: 1 } : {}),
        orderBy,
        select: {
          applicant_id:          true,
          full_name:             true,
          first_name:            true,
          last_name:             true,
          headline:              true,
          status:                true,
          source:                true,
          add_to_hotlist:        true,
          is_private:            true,
          office_name:           true,
          employment_type_pref:  true,
          last_active_at:        true,
          created_at:            true,
          contact: {
            select: {
              email: true,
              phone: true,
              city:  true,
              state: true,
            },
          },
          demographic: {
            select: { work_authorization: true },
          },
          _count: { select: { applications: true } },
          // Latest application snippet for the table row
          applications: {
            orderBy: { applied_at: 'desc' },
            take:    1,
            select: {
              status:     true,
              applied_at: true,
              job: {
                select: {
                  job_title: true,
                  organization: { select: { name: true } },
                },
              },
              pipeline_stages: {
                orderBy: { pipeline_date: 'desc' },
                take: 1,
                select: { stage_name: true },
              },
            },
          },
          // Resume presence flag only
          documents: {
            where:  { document_type: 'RESUME', application_id: null },
            select: { applicant_document_id: true },
            take:   1,
          },
        },
      }),
      prisma.applicant.count({ where }),
    ]);

    const pageCount  = Math.ceil(total / take);
    const nextCursor = applicants.length === take
      ? applicants[applicants.length - 1].applicant_id
      : null;

    return sendSuccess(res, {
      data: applicants.map(a => ({
        ...a,
        has_resume:        a.documents.length > 0,
        application_count: a._count.applications,
        documents:         undefined,
        _count:            undefined,
      })),
      paging: {
        total,
        page:        parseInt(page),
        limit:       take,
        page_count:  pageCount,
        has_next:    parseInt(page) < pageCount,
        next_cursor: nextCursor,
      },
    });
  } catch (err: any) {
    console.error('listApplicants error:', err);
    return sendError(res, 'Failed to fetch applicants', 500);
  }
};

// ════════════════════════════════════════════════════════════════════════════
//  2. GET SINGLE APPLICANT FULL PROFILE
//     GET /api/applicantprofiles/applicants/:applicantId
//     Returns core profile: contact, demographics, social, documents,
//     work history (profile-level), education, classification, tags,
//     references.
//     Applications are NOT returned here — use dedicated endpoints below.
// ════════════════════════════════════════════════════════════════════════════
export const getApplicantProfile = async (req: Request, res: Response) => {
  try {
    const { applicantId } = req.params;

    const applicant = await prisma.applicant.findUnique({
      where:   { applicant_id: applicantId },
      include: FULL_PROFILE_INCLUDE,
    }) as any;

    if (!applicant) return sendError(res, 'Applicant not found', 404);

    // Separate resume docs from other profile docs
    const resume_documents = (applicant.documents || []).filter(
      (d: any) => d.document_type === 'RESUME' && !d.application_id
    );
    const other_documents = (applicant.documents || []).filter(
      (d: any) => d.document_type !== 'RESUME' || d.application_id
    );

    return sendSuccess(res, {
      applicant: {
        ...applicant,
        resume_documents,
        other_documents,
        documents: undefined,
      },
    });
  } catch (err: any) {
    console.error('getApplicantProfile error:', err);
    return sendError(res, 'Failed to fetch applicant profile', 500);
  }
};

// ════════════════════════════════════════════════════════════════════════════
//  3. UPDATE APPLICANT PROFILE
//     PATCH /api/applicantprofiles/applicants/:applicantId
// ════════════════════════════════════════════════════════════════════════════
export const updateApplicantProfile = async (req: Request, res: Response) => {
  try {
    const { applicantId } = req.params;

    const validation = updateApplicantSchema.safeParse(req.body);
    if (!validation.success) {
      return sendError(res, 'Validation failed', 400,
        validation.error.issues.map(i => ({ field: i.path.join('.'), message: i.message }))
      );
    }
    const data = validation.data;

    const existing = await prisma.applicant.findUnique({
      where:   { applicant_id: applicantId },
      include: { contact: true, demographic: true, social_profiles: true },
    });
    if (!existing) return sendError(res, 'Applicant not found', 404);

    // ── Contact fields ────────────────────────────────────────────────────────
    const contactFields: Record<string, any> = {};
    ['email','email2','phone','work_phone','home_phone','address','city','state','zip','country']
      .forEach(f => { if ((data as any)[f] !== undefined) contactFields[f] = (data as any)[f]; });

    // ── Demographic fields ────────────────────────────────────────────────────
    const demoFields: Record<string, any> = {};
    ['gender','race','disability','work_authorization']
      .forEach(f => { if ((data as any)[f] !== undefined) demoFields[f] = (data as any)[f]; });
    if (data.birth_date)           demoFields.birth_date           = new Date(data.birth_date);
    if (data.authorization_expiry) demoFields.authorization_expiry = new Date(data.authorization_expiry);

    // ── Core fields ───────────────────────────────────────────────────────────
    const coreFields: Record<string, any> = { last_active_at: new Date() };
    [
      'full_name','first_name','last_name','headline','notes','comp_code_last',
      'source','is_us_citizen','employment_type_pref','first_impression',
      'add_to_hotlist','text_consent','communication_preference','is_optout',
      'is_private','office_name','office_division','home_office','geo_code','school_district',
    ].forEach(f => { if ((data as any)[f] !== undefined) coreFields[f] = (data as any)[f]; });

    await prisma.$transaction(async (tx) => {
      await tx.applicant.update({ where: { applicant_id: applicantId }, data: coreFields });

      if (Object.keys(contactFields).length > 0) {
        if (existing.contact) {
          await tx.applicantContact.update({ where: { applicant_id: applicantId }, data: contactFields });
        } else if (contactFields.email && contactFields.phone) {
          await tx.applicantContact.create({
            data: { applicant_id: applicantId, email: contactFields.email, phone: contactFields.phone, ...contactFields } as any,
          });
        }
      }

      if (Object.keys(demoFields).length > 0) {
        if (existing.demographic) {
          await tx.applicantDemographic.update({ where: { applicant_id: applicantId }, data: demoFields });
        } else {
          await tx.applicantDemographic.create({ data: { applicant_id: applicantId, ...demoFields } });
        }
      }

      const socialMap: Record<string, string> = {};
      if (data.linkedin_url)  socialMap['LinkedIn']  = data.linkedin_url;
      if (data.portfolio_url) socialMap['Portfolio'] = data.portfolio_url;

      for (const [title, link] of Object.entries(socialMap)) {
        const sp = existing.social_profiles.find(p => p.profile_title === title);
        if (sp) {
          await tx.applicantSocialProfiles.update({
            where: { applicant_social_profiles_id: sp.applicant_social_profiles_id },
            data:  { profile_link: link },
          });
        } else {
          await tx.applicantSocialProfiles.create({
            data: { applicant_id: applicantId, profile_title: title, profile_link: link },
          });
        }
      }
    });

    const updated = await prisma.applicant.findUnique({
      where:   { applicant_id: applicantId },
      include: FULL_PROFILE_INCLUDE,
    }) as any;

    return sendSuccess(res, { applicant: updated, message: 'Applicant profile updated successfully' });
  } catch (err: any) {
    console.error('updateApplicantProfile error:', err);
    if (err.code === 'P2002') return sendError(res, 'Email already exists for another applicant', 409);
    return sendError(res, 'Failed to update applicant profile', 500);
  }
};

// ════════════════════════════════════════════════════════════════════════════
//  4. DELETE APPLICANT
//     DELETE /api/applicantprofiles/applicants/:applicantId
// ════════════════════════════════════════════════════════════════════════════
export const deleteApplicant = async (req: Request, res: Response) => {
  try {
    const { applicantId } = req.params;

    const applicant = await prisma.applicant.findUnique({
      where:   { applicant_id: applicantId },
      include: { documents: true },
    });
    if (!applicant) return sendError(res, 'Applicant not found', 404);

    // Purge Azure blobs (best-effort)
    try {
      const cc = await getContainerClient();
      for (const doc of applicant.documents) {
        try {
          const meta = JSON.parse(doc.file_url);
          if (meta?.blobName) await cc.getBlockBlobClient(meta.blobName).deleteIfExists();
        } catch { /* ignore per-doc errors */ }
      }
    } catch (azureErr) {
      console.warn('Azure blob cleanup failed (applicant still deleted):', azureErr);
    }

    await prisma.applicant.delete({ where: { applicant_id: applicantId } });
    return sendSuccess(res, { message: 'Applicant deleted successfully' });
  } catch (err: any) {
    console.error('deleteApplicant error:', err);
    return sendError(res, 'Failed to delete applicant', 500);
  }
};

// ════════════════════════════════════════════════════════════════════════════
//  5. GET APPLICANT STATS (header cards)
//     GET /api/applicantprofiles/applicants/:applicantId/stats
// ════════════════════════════════════════════════════════════════════════════
export const getApplicantStats = async (req: Request, res: Response) => {
  try {
    const { applicantId } = req.params;

    const [applicant, applicationsByStatus, documentCount] = await Promise.all([
      prisma.applicant.findUnique({
        where:  { applicant_id: applicantId },
        select: { applicant_id: true, full_name: true, last_active_at: true, created_at: true },
      }),
      prisma.application.groupBy({
        by:     ['status'],
        where:  { applicant_id: applicantId },
        _count: { status: true },
      }),
      prisma.applicantDocument.count({
        where: { applicant_id: applicantId, application_id: null },
      }),
    ]);

    if (!applicant) return sendError(res, 'Applicant not found', 404);

    const byStatus: Record<string, number> = {};
    let totalApplications = 0;
    for (const row of applicationsByStatus) {
      byStatus[row.status]  = row._count.status;
      totalApplications    += row._count.status;
    }

    return sendSuccess(res, {
      applicant_id:       applicant.applicant_id,
      full_name:          applicant.full_name,
      total_applications: totalApplications,
      by_status:          byStatus,
      document_count:     documentCount,
      last_active_at:     applicant.last_active_at,
      member_since:       applicant.created_at,
    });
  } catch (err: any) {
    console.error('getApplicantStats error:', err);
    return sendError(res, 'Failed to fetch applicant stats', 500);
  }
};

// ════════════════════════════════════════════════════════════════════════════
//  6. TOGGLE HOTLIST
//     PATCH /api/applicantprofiles/applicants/:applicantId/hotlist
// ════════════════════════════════════════════════════════════════════════════
export const toggleHotlist = async (req: Request, res: Response) => {
  try {
    const { applicantId } = req.params;

    const applicant = await prisma.applicant.findUnique({
      where:  { applicant_id: applicantId },
      select: { applicant_id: true, add_to_hotlist: true },
    });
    if (!applicant) return sendError(res, 'Applicant not found', 404);

    const updated = await prisma.applicant.update({
      where:  { applicant_id: applicantId },
      data:   { add_to_hotlist: !applicant.add_to_hotlist },
      select: { add_to_hotlist: true },
    });

    return sendSuccess(res, {
      add_to_hotlist: updated.add_to_hotlist,
      message: updated.add_to_hotlist ? 'Added to hotlist' : 'Removed from hotlist',
    });
  } catch (err: any) {
    console.error('toggleHotlist error:', err);
    return sendError(res, 'Failed to toggle hotlist', 500);
  }
};

// ════════════════════════════════════════════════════════════════════════════
//  7. GET ALL APPLICATIONS (lazy-loaded tab)
//     GET /api/applicantprofiles/applicants/:applicantId/applications
//     Returns all applications with job, pipeline stages summary, interview
//     count and evaluation score — enough for the Applications tab list.
//     Drill into a single application via endpoint #8.
// ════════════════════════════════════════════════════════════════════════════
export const getApplicantApplications = async (req: Request, res: Response) => {
  try {
    const { applicantId } = req.params;
    const { status } = req.query as Record<string, string>;

    const applicant = await prisma.applicant.findUnique({
      where:  { applicant_id: applicantId },
      select: { applicant_id: true, full_name: true },
    });
    if (!applicant) return sendError(res, 'Applicant not found', 404);

    const where: any = { applicant_id: applicantId };
    if (status) where.status = status;

    const applications = await prisma.application.findMany({
      where,
      orderBy: { applied_at: 'desc' },
      select: {
        application_id: true,
        status:         true,
        source:         true,
        applied_at:     true,
        job: {
          select: {
            job_id:    true,
            job_title: true,
            job_type:  true,
            status:    true,
            location:  true,
            city:      true,
            state:     true,
            organization: { select: { name: true } },
          },
        },
        // Latest pipeline stage only for the list view
        pipeline_stages: {
          orderBy: { pipeline_date: 'desc' },
          take:    1,
          select: {
            stage_name:    true,
            pipeline_date: true,
          },
        },
        // AI score for the badge
        evaluations: {
          select: { ai_score: true },
        },
        // Quick counts
        _count: {
          select: {
            interviews:      true,
            pipeline_stages: true,
            documents:       true,
          },
        },
        // Assignment presence flag
        assignment: {
          select: {
            assignment_id:   true,
            start_date:      true,
            end_date:        true,
            employment_type: true,
          },
        },
      },
    });

    return sendSuccess(res, {
      applicant_id:   applicant.applicant_id,
      applicant_name: applicant.full_name,
      applications:   applications.map(a => ({
        ...a,
        latest_stage:       a.pipeline_stages[0] ?? null,
        ai_score:           a.evaluations?.ai_score ?? null,
        interview_count:    a._count.interviews,
        pipeline_stage_count: a._count.pipeline_stages,
        document_count:     a._count.documents,
        pipeline_stages:    undefined,
        evaluations:        undefined,
        _count:             undefined,
      })),
      total: applications.length,
    });
  } catch (err: any) {
    console.error('getApplicantApplications error:', err);
    return sendError(res, 'Failed to fetch applicant applications', 500);
  }
};

// ════════════════════════════════════════════════════════════════════════════
//  8. GET SINGLE APPLICATION DETAIL
//     GET /api/applicantprofiles/applicants/:applicantId/applications/:applicationId
//     Full detail for ONE application: job info, all pipeline stages,
//     all interviews, evaluation, assignment, documents snapshot,
//     work history snapshot tied to this application.
// ════════════════════════════════════════════════════════════════════════════
export const getApplicationDetail = async (req: Request, res: Response) => {
  try {
    const { applicantId, applicationId } = req.params;

    const application = await prisma.application.findFirst({
      where: { application_id: applicationId, applicant_id: applicantId },
      include: {
        job: {
          select: {
            job_id:          true,
            job_title:       true,
            job_type:        true,
            status:          true,
            location:        true,
            city:            true,
            state:           true,
            open_positions:  true,
            start_date:      true,
            end_date:        true,
            organization: {
              select: { organization_id: true, name: true, website: true },
            },
            job_rates: {
              select: {
                pay_rate:  true,
                bill_rate: true,
                ot_pay_rate: true,
                ot_bill_rate: true,
              },
              take: 1,
            },
            job_detail: {
              select: { description: true, skills: true },
            },
          },
        },
        pipeline_stages: {
          orderBy: { pipeline_date: 'desc' },
          include: {
            credit_user: {
              select: { user_id: true, name: true, email: true },
            },
            representative_user: {
              select: { user_id: true, name: true, email: true },
            },
          },
        },
        interviews: {
          orderBy: { interview_date: 'asc' },
        },
        evaluations: true,
        assignment: {
          include: {
            timesheets: {
              orderBy: { week_start_date: 'desc' },
              take: 5,
              select: {
                timesheet_id:        true,
                week_start_date:     true,
                week_end_date:       true,
                status:              true,
                total_regular_hours: true,
                total_ot_hours:      true,
                total_hours:         true,
                total_bill_amount:   true,
                total_pay_amount:    true,
                approved_at:         true,
              },
            },
          },
        },
        documents: {
          where:   { application_id: applicationId },
          orderBy: { created_at: 'desc' },
        },
        work_history: {
          where: { application_id: applicationId },
        },
      },
    });

    if (!application) return sendError(res, 'Application not found', 404);

    return sendSuccess(res, { application });
  } catch (err: any) {
    console.error('getApplicationDetail error:', err);
    return sendError(res, 'Failed to fetch application detail', 500);
  }
};

// ════════════════════════════════════════════════════════════════════════════
//  9. GET PIPELINE STAGES FOR AN APPLICATION
//     GET /api/applicantprofiles/applicants/:applicantId/applications/:applicationId/pipeline
//     All pipeline stage history for a single application.
// ════════════════════════════════════════════════════════════════════════════
export const getApplicationPipeline = async (req: Request, res: Response) => {
  try {
    const { applicantId, applicationId } = req.params;

    // Verify ownership
    const application = await prisma.application.findFirst({
      where:  { application_id: applicationId, applicant_id: applicantId },
      select: { application_id: true, status: true },
    });
    if (!application) return sendError(res, 'Application not found', 404);

    const stages = await prisma.pipelineStage.findMany({
      where:   { application_id: applicationId },
      orderBy: { pipeline_date: 'desc' },
      include: {
        credit_user: {
          select: { user_id: true, name: true, email: true },
        },
        representative_user: {
          select: { user_id: true, name: true, email: true },
        },
      },
    });

    return sendSuccess(res, {
      application_id: applicationId,
      current_status: application.status,
      stages,
      total: stages.length,
    });
  } catch (err: any) {
    console.error('getApplicationPipeline error:', err);
    return sendError(res, 'Failed to fetch pipeline stages', 500);
  }
};

// ════════════════════════════════════════════════════════════════════════════
//  10. GET INTERVIEWS FOR AN APPLICATION
//      GET /api/applicantprofiles/applicants/:applicantId/applications/:applicationId/interviews
// ════════════════════════════════════════════════════════════════════════════
export const getApplicationInterviews = async (req: Request, res: Response) => {
  try {
    const { applicantId, applicationId } = req.params;

    const application = await prisma.application.findFirst({
      where:  { application_id: applicationId, applicant_id: applicantId },
      select: { application_id: true },
    });
    if (!application) return sendError(res, 'Application not found', 404);

    const interviews = await prisma.interview.findMany({
      where:   { application_id: applicationId },
      orderBy: { interview_date: 'asc' },
    });

    return sendSuccess(res, { application_id: applicationId, interviews, total: interviews.length });
  } catch (err: any) {
    console.error('getApplicationInterviews error:', err);
    return sendError(res, 'Failed to fetch interviews', 500);
  }
};

// ════════════════════════════════════════════════════════════════════════════
//  11. GET EVALUATION FOR AN APPLICATION
//      GET /api/applicantprofiles/applicants/:applicantId/applications/:applicationId/evaluation
// ════════════════════════════════════════════════════════════════════════════
export const getApplicationEvaluation = async (req: Request, res: Response) => {
  try {
    const { applicantId, applicationId } = req.params;

    const application = await prisma.application.findFirst({
      where:  { application_id: applicationId, applicant_id: applicantId },
      select: { application_id: true },
    });
    if (!application) return sendError(res, 'Application not found', 404);

    const evaluation = await prisma.applicationEvaluation.findUnique({
      where: { application_id: applicationId },
    });

    if (!evaluation) return sendError(res, 'No evaluation found for this application', 404);

    return sendSuccess(res, { application_id: applicationId, evaluation });
  } catch (err: any) {
    console.error('getApplicationEvaluation error:', err);
    return sendError(res, 'Failed to fetch evaluation', 500);
  }
};

// ════════════════════════════════════════════════════════════════════════════
//  12. GET ASSIGNMENT FOR AN APPLICATION
//      GET /api/applicantprofiles/applicants/:applicantId/applications/:applicationId/assignment
//      Returns assignment with recent timesheets and payrolls.
// ════════════════════════════════════════════════════════════════════════════
export const getApplicationAssignment = async (req: Request, res: Response) => {
  try {
    const { applicantId, applicationId } = req.params;

    const application = await prisma.application.findFirst({
      where:  { application_id: applicationId, applicant_id: applicantId },
      select: { application_id: true },
    });
    if (!application) return sendError(res, 'Application not found', 404);

    const assignment = await prisma.assignment.findUnique({
      where:   { application_id: applicationId },
      include: {
        timesheets: {
          orderBy: { week_start_date: 'desc' },
          take:    10,
          select: {
            timesheet_id:        true,
            week_start_date:     true,
            week_end_date:       true,
            status:              true,
            total_regular_hours: true,
            total_ot_hours:      true,
            total_hours:         true,
            bill_rate:           true,
            pay_rate:            true,
            total_bill_amount:   true,
            total_pay_amount:    true,
            submitted_at:        true,
            approved_at:         true,
            rejected_at:         true,
            rejection_reason:    true,
          },
        },
        payrolls: {
          orderBy: { processed_at: 'desc' },
          take:    10,
          select: {
            payroll_id:     true,
            pay_period:     true,
            regular_hours:  true,
            ot_hours:       true,
            pay_rate:       true,
            gross_pay:      true,
            net_pay:        true,
            processed_at:   true,
            qb_synced:      true,
          },
        },
        invoices: {
          orderBy: { invoice_date: 'desc' },
          take:    10,
          select: {
            invoice_id:     true,
            invoice_number: true,
            status:         true,
            invoice_date:   true,
            due_date:       true,
            total_amount:   true,
            paid_at:        true,
          },
        },
      },
    });

    if (!assignment) return sendError(res, 'No assignment found for this application', 404);

    return sendSuccess(res, { application_id: applicationId, assignment });
  } catch (err: any) {
    console.error('getApplicationAssignment error:', err);
    return sendError(res, 'Failed to fetch assignment', 500);
  }
};

// ════════════════════════════════════════════════════════════════════════════
//  13. GET APPLICATION DOCUMENTS (snapshot for this application)
//      GET /api/applicantprofiles/applicants/:applicantId/applications/:applicationId/documents
// ════════════════════════════════════════════════════════════════════════════
export const getApplicationDocuments = async (req: Request, res: Response) => {
  try {
    const { applicantId, applicationId } = req.params;

    const application = await prisma.application.findFirst({
      where:  { application_id: applicationId, applicant_id: applicantId },
      select: { application_id: true },
    });
    if (!application) return sendError(res, 'Application not found', 404);

    const documents = await prisma.applicantDocument.findMany({
      where:   { application_id: applicationId },
      orderBy: { created_at: 'desc' },
    });

    return sendSuccess(res, { application_id: applicationId, documents, total: documents.length });
  } catch (err: any) {
    console.error('getApplicationDocuments error:', err);
    return sendError(res, 'Failed to fetch application documents', 500);
  }
};

// ════════════════════════════════════════════════════════════════════════════
//  14. BULK APPLY — ASSIGN APPLICANT TO ONE OR MORE JOBS
//      POST /api/applicantprofiles/applicants/:applicantId/apply
//      Body: { job_ids: string[], source?: string }
// ════════════════════════════════════════════════════════════════════════════
export const bulkApplyToJobs = async (req: Request, res: Response) => {
  try {
    const { applicantId } = req.params;

    const validation = bulkApplySchema.safeParse({ applicant_id: applicantId, ...req.body });
    if (!validation.success) {
      return sendError(res, 'Validation failed', 400,
        validation.error.issues.map(i => ({ field: i.path.join('.'), message: i.message }))
      );
    }
    const { job_ids, source } = validation.data;

    const applicant = await prisma.applicant.findUnique({
      where:  { applicant_id: applicantId },
      select: { applicant_id: true, full_name: true },
    });
    if (!applicant) return sendError(res, 'Applicant not found', 404);

    const [jobs, existingApps] = await Promise.all([
      prisma.job.findMany({
        where:  { job_id: { in: job_ids } },
        select: {
          job_id:         true,
          job_title:      true,
          status:         true,
          open_positions: true,
          organization:   { select: { name: true } },
        },
      }),
      prisma.application.findMany({
        where:  { applicant_id: applicantId, job_id: { in: job_ids } },
        select: { job_id: true, application_id: true },
      }),
    ]);

    const existingAppMap = new Map(existingApps.map(a => [a.job_id, a.application_id]));
    const jobMap         = new Map(jobs.map(j => [j.job_id, j]));

    const results: {
      job_id:          string;
      job_title?:      string;
      status:          'applied' | 'already_exists' | 'not_found' | 'closed' | 'no_positions';
      application_id?: string;
      message:         string;
    }[] = [];

    const toCreate: typeof results = [];

    for (const job_id of job_ids) {
      const job = jobMap.get(job_id);

      if (!job) {
        results.push({ job_id, status: 'not_found', message: 'Job not found' });
        continue;
      }
      if (job.status !== 'OPEN') {
        results.push({ job_id, job_title: job.job_title, status: 'closed', message: `Job is ${job.status}` });
        continue;
      }
      if (job.open_positions !== null && job.open_positions <= 0) {
        results.push({ job_id, job_title: job.job_title, status: 'no_positions', message: 'No open positions available' });
        continue;
      }

      const existingId = existingAppMap.get(job_id);
      if (existingId) {
        results.push({ job_id, job_title: job.job_title, status: 'already_exists', application_id: existingId, message: 'Application already exists' });
        continue;
      }

      toCreate.push({ job_id, status: 'applied', message: `Applied to ${job.job_title} at ${job.organization.name}` });
    }

    if (toCreate.length > 0) {
      await prisma.$transaction(async (tx) => {
        for (const item of toCreate) {
          const job = jobMap.get(item.job_id)!;
          const app = await tx.application.create({
            data: {
              job_id:       item.job_id,
              applicant_id: applicantId,
              source:       source || 'INTERNAL',
              status:       'APPLIED',
            },
          });
          item.application_id = app.application_id;

          if (job.open_positions !== null && job.open_positions > 0) {
            await tx.job.update({
              where: { job_id: item.job_id },
              data:  { open_positions: { decrement: 1 } },
            });
          }
        }
      }, { maxWait: 8000, timeout: 20000 });
    }

    results.push(...toCreate);

    const summary = {
      total_requested: job_ids.length,
      applied:         results.filter(r => r.status === 'applied').length,
      already_existed: results.filter(r => r.status === 'already_exists').length,
      skipped:         results.filter(r => ['not_found','closed','no_positions'].includes(r.status)).length,
    };

    await prisma.applicant.update({
      where: { applicant_id: applicantId },
      data:  { last_active_at: new Date() },
    });

    const statusCode = summary.applied > 0 ? 201 : 200;
    return sendSuccess(res, {
      applicant_id:   applicantId,
      applicant_name: applicant.full_name,
      results,
      summary,
      message: `${summary.applied} application(s) created, ${summary.already_existed} already existed, ${summary.skipped} skipped.`,
    }, statusCode);
  } catch (err: any) {
    console.error('bulkApplyToJobs error:', err);
    if (err.code === 'P2028') return sendError(res, 'Request timed out, please try again', 503);
    return sendError(res, 'Failed to create applications', 500);
  }
};

// ════════════════════════════════════════════════════════════════════════════
//  15. REMOVE APPLICATION
//      DELETE /api/applicantprofiles/applicants/:applicantId/applications/:applicationId
// ════════════════════════════════════════════════════════════════════════════
export const removeApplication = async (req: Request, res: Response) => {
  try {
    const { applicantId, applicationId } = req.params;

    const application = await prisma.application.findFirst({
      where:   { application_id: applicationId, applicant_id: applicantId },
      include: {
        job:        { select: { job_id: true, open_positions: true } },
        assignment: { select: { assignment_id: true } },
      },
    });

    if (!application) return sendError(res, 'Application not found', 404);
    if (application.assignment) {
      return sendError(res, 'Cannot withdraw — applicant has an active assignment for this job', 400);
    }

    await prisma.$transaction(async (tx) => {
      await tx.application.delete({ where: { application_id: applicationId } });
      if (application.job.open_positions !== null) {
        await tx.job.update({
          where: { job_id: application.job.job_id },
          data:  { open_positions: { increment: 1 } },
        });
      }
    });

    return sendSuccess(res, { message: 'Application removed successfully' });
  } catch (err: any) {
    console.error('removeApplication error:', err);
    return sendError(res, 'Failed to remove application', 500);
  }
};

// ════════════════════════════════════════════════════════════════════════════
//  16. ADD WORK HISTORY ENTRY (profile-level)
//      POST /api/applicantprofiles/applicants/:applicantId/work-history
// ════════════════════════════════════════════════════════════════════════════
export const addWorkHistoryEntry = async (req: Request, res: Response) => {
  try {
    const { applicantId } = req.params;
    const { title, company, description, from_date, to_date } = req.body;

    if (!title?.trim()) return sendError(res, 'Title is required', 400);

    const exists = await prisma.applicant.findUnique({
      where:  { applicant_id: applicantId },
      select: { applicant_id: true },
    });
    if (!exists) return sendError(res, 'Applicant not found', 404);

    const entry = await prisma.applicantWorkHistory.create({
      data: {
        applicant_id:   applicantId,
        application_id: null,
        title,
        company:        company      || null,
        description:    description  || null,
        from_date:      from_date    ? new Date(from_date) : null,
        to_date:        to_date      ? new Date(to_date)   : null,
      },
    });

    return sendSuccess(res, { entry, message: 'Work history entry added' }, 201);
  } catch (err: any) {
    console.error('addWorkHistoryEntry error:', err);
    return sendError(res, 'Failed to add work history entry', 500);
  }
};

export const updateWorkHistoryEntry = async (req: Request, res: Response) => {
  try {
    const { applicantId, entryId } = req.params;
    const { title, company, description, from_date, to_date } = req.body;

    const entry = await prisma.applicantWorkHistory.findFirst({
      where: { applicant_work_history_id: entryId, applicant_id: applicantId },
    });
    if (!entry) return sendError(res, 'Work history entry not found', 404);

    const updated = await prisma.applicantWorkHistory.update({
      where: { applicant_work_history_id: entryId },
      data: {
        ...(title !== undefined       && { title }),
        ...(company !== undefined     && { company }),
        ...(description !== undefined && { description }),
        ...(from_date                 && { from_date: new Date(from_date) }),
        ...(to_date                   && { to_date:   new Date(to_date) }),
      },
    });

    return sendSuccess(res, { entry: updated, message: 'Work history entry updated' });
  } catch (err: any) {
    console.error('updateWorkHistoryEntry error:', err);
    return sendError(res, 'Failed to update work history entry', 500);
  }
};

export const deleteWorkHistoryEntry = async (req: Request, res: Response) => {
  try {
    const { applicantId, entryId } = req.params;

    const entry = await prisma.applicantWorkHistory.findFirst({
      where: { applicant_work_history_id: entryId, applicant_id: applicantId },
    });
    if (!entry) return sendError(res, 'Work history entry not found', 404);

    await prisma.applicantWorkHistory.delete({ where: { applicant_work_history_id: entryId } });
    return sendSuccess(res, { message: 'Work history entry deleted' });
  } catch (err: any) {
    console.error('deleteWorkHistoryEntry error:', err);
    return sendError(res, 'Failed to delete work history entry', 500);
  }
};

// ════════════════════════════════════════════════════════════════════════════
//  17. EDUCATION CRUD
//      POST /api/applicantprofiles/applicants/:applicantId/education
// ════════════════════════════════════════════════════════════════════════════
export const addEducationEntry = async (req: Request, res: Response) => {
  try {
    const { applicantId } = req.params;
    const { school, degree, field, from_date, to_date } = req.body;

    if (!school?.trim()) return sendError(res, 'School name is required', 400);

    const exists = await prisma.applicant.findUnique({
      where:  { applicant_id: applicantId },
      select: { applicant_id: true },
    });
    if (!exists) return sendError(res, 'Applicant not found', 404);

    const entry = await prisma.applicantEducation.create({
      data: {
        applicant_id: applicantId,
        school,
        degree:    degree    || null,
        field:     field     || null,
        from_date: from_date ? new Date(from_date) : null,
        to_date:   to_date   ? new Date(to_date)   : null,
      },
    });

    return sendSuccess(res, { entry, message: 'Education entry added' }, 201);
  } catch (err: any) {
    console.error('addEducationEntry error:', err);
    return sendError(res, 'Failed to add education entry', 500);
  }
};

export const updateEducationEntry = async (req: Request, res: Response) => {
  try {
    const { applicantId, educationId } = req.params;
    const { school, degree, field, from_date, to_date } = req.body;

    const entry = await prisma.applicantEducation.findFirst({
      where: { education_id: educationId, applicant_id: applicantId },
    });
    if (!entry) return sendError(res, 'Education entry not found', 404);

    const updated = await prisma.applicantEducation.update({
      where: { education_id: educationId },
      data: {
        ...(school !== undefined && { school }),
        ...(degree !== undefined && { degree }),
        ...(field  !== undefined && { field }),
        ...(from_date            && { from_date: new Date(from_date) }),
        ...(to_date              && { to_date:   new Date(to_date) }),
      },
    });

    return sendSuccess(res, { entry: updated, message: 'Education entry updated' });
  } catch (err: any) {
    console.error('updateEducationEntry error:', err);
    return sendError(res, 'Failed to update education entry', 500);
  }
};

export const deleteEducationEntry = async (req: Request, res: Response) => {
  try {
    const { applicantId, educationId } = req.params;

    const entry = await prisma.applicantEducation.findFirst({
      where: { education_id: educationId, applicant_id: applicantId },
    });
    if (!entry) return sendError(res, 'Education entry not found', 404);

    await prisma.applicantEducation.delete({ where: { education_id: educationId } });
    return sendSuccess(res, { message: 'Education entry deleted' });
  } catch (err: any) {
    console.error('deleteEducationEntry error:', err);
    return sendError(res, 'Failed to delete education entry', 500);
  }
};

// ════════════════════════════════════════════════════════════════════════════
//  18. UPLOAD PROFILE DOCUMENT
//      POST /api/applicantprofiles/applicants/:applicantId/documents
// ════════════════════════════════════════════════════════════════════════════
export const uploadApplicantDocument = async (req: Request, res: Response) => {
  try {
    const { applicantId } = req.params;
    const { document_type = 'RESUME' } = req.body;
    const file = (req as any).file;

    if (!file) return sendError(res, 'File is required', 400);

    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'application/rtf',
    ];
    if (!allowedTypes.includes(file.mimetype))
      return sendError(res, 'Invalid file type. Allowed: PDF, DOC, DOCX, TXT, RTF', 400);
    if (file.size > 10 * 1024 * 1024)
      return sendError(res, 'File too large. Max 10MB', 400);

    const exists = await prisma.applicant.findUnique({
      where:  { applicant_id: applicantId },
      select: { applicant_id: true },
    });
    if (!exists) return sendError(res, 'Applicant not found', 404);

    const cc       = await getContainerClient();
    const blobName = generateBlobName(applicantId, 'profile', file.originalname);
    const blob     = cc.getBlockBlobClient(blobName);

    await blob.upload(file.buffer, file.buffer.length, {
      blobHTTPHeaders: { blobContentType: file.mimetype },
    });

    const metadata = {
      originalFileName: file.originalname,
      mimeType:         file.mimetype,
      blobName,
      size:             file.size,
      url:              blob.url,
      uploadedAt:       new Date().toISOString(),
    };

    const doc = await prisma.applicantDocument.create({
      data: {
        applicant_id:   applicantId,
        application_id: null,
        document_type,
        file_url:       JSON.stringify(metadata),
      },
    });

    return sendSuccess(res, {
      document: doc,
      file:     { filename: file.originalname, size: file.size, url: blob.url },
      message:  'Document uploaded successfully',
    }, 201);
  } catch (err: any) {
    console.error('uploadApplicantDocument error:', err);
    return sendError(res, 'Failed to upload document', 500);
  }
};

// ════════════════════════════════════════════════════════════════════════════
//  19. DELETE PROFILE DOCUMENT
//      DELETE /api/applicantprofiles/applicants/:applicantId/documents/:documentId
// ════════════════════════════════════════════════════════════════════════════
export const deleteApplicantDocument = async (req: Request, res: Response) => {
  try {
    const { applicantId, documentId } = req.params;

    const doc = await prisma.applicantDocument.findFirst({
      where: { applicant_document_id: documentId, applicant_id: applicantId },
    });
    if (!doc) return sendError(res, 'Document not found', 404);

    try {
      const meta = JSON.parse(doc.file_url);
      if (meta?.blobName) {
        const cc = await getContainerClient();
        await cc.getBlockBlobClient(meta.blobName).deleteIfExists();
      }
    } catch { /* ignore blob errors */ }

    await prisma.applicantDocument.delete({ where: { applicant_document_id: documentId } });
    return sendSuccess(res, { message: 'Document deleted successfully' });
  } catch (err: any) {
    console.error('deleteApplicantDocument error:', err);
    return sendError(res, 'Failed to delete document', 500);
  }
};

// ════════════════════════════════════════════════════════════════════════════
//  20. VIEW PROFILE DOCUMENT (inline stream)
//      GET /api/applicantprofiles/applicants/:applicantId/documents/:documentId/view
// ════════════════════════════════════════════════════════════════════════════
export const viewApplicantDocument = async (req: Request, res: Response) => {
  try {
    const { applicantId, documentId } = req.params;

    const doc = await prisma.applicantDocument.findFirst({
      where: { applicant_document_id: documentId, applicant_id: applicantId },
    });
    if (!doc) return sendError(res, 'Document not found', 404);

    const meta = JSON.parse(doc.file_url);
    if (!meta?.blobName) return sendError(res, 'File reference not found', 404);

    const cc   = await getContainerClient();
    const blob = cc.getBlockBlobClient(meta.blobName);

    if (!(await blob.exists())) return sendError(res, 'File not found in storage', 404);

    const download = await blob.download();
    if (!download.readableStreamBody) return sendError(res, 'Failed to stream file', 500);

    res.setHeader('Content-Type',        meta.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('Cache-Control',       'public, max-age=3600');
    if (download.contentLength) res.setHeader('Content-Length', download.contentLength);

    download.readableStreamBody.pipe(res);
  } catch (err: any) {
    console.error('viewApplicantDocument error:', err);
    return sendError(res, 'Failed to view document', 500);
  }
};

// ════════════════════════════════════════════════════════════════════════════
//  21. DOWNLOAD PROFILE DOCUMENT
//      GET /api/applicantprofiles/applicants/:applicantId/documents/:documentId/download
// ════════════════════════════════════════════════════════════════════════════
export const downloadApplicantDocument = async (req: Request, res: Response) => {
  try {
    const { applicantId, documentId } = req.params;

    const doc = await prisma.applicantDocument.findFirst({
      where: { applicant_document_id: documentId, applicant_id: applicantId },
    });
    if (!doc) return sendError(res, 'Document not found', 404);

    const meta = JSON.parse(doc.file_url);
    if (!meta?.blobName) return sendError(res, 'File reference not found', 404);

    const cc   = await getContainerClient();
    const blob = cc.getBlockBlobClient(meta.blobName);

    if (!(await blob.exists())) return sendError(res, 'File not found in storage', 404);

    const download = await blob.download();
    if (!download.readableStreamBody) return sendError(res, 'Failed to download file', 500);

    const safeName = (meta.originalFileName || 'document')
      .replace(/[^a-zA-Z0-9._\- ]/g, '')
      .replace(/\s+/g, '_');

    res.setHeader('Content-Type',        meta.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
    res.setHeader('Cache-Control',       'no-cache, no-store, must-revalidate');
    if (download.contentLength) res.setHeader('Content-Length', download.contentLength);

    download.readableStreamBody.pipe(res);
  } catch (err: any) {
    console.error('downloadApplicantDocument error:', err);
    return sendError(res, 'Failed to download document', 500);
  }
};

// ════════════════════════════════════════════════════════════════════════════
//  22. UPDATE CLASSIFICATION & TAGS
//      PATCH /api/applicantprofiles/applicants/:applicantId/classification
// ════════════════════════════════════════════════════════════════════════════
export const updateClassification = async (req: Request, res: Response) => {
  try {
    const { applicantId } = req.params;
    const {
      talent_status,
      position_categories,
      skill_sets,
      applicant_tags,
      tag_details,
      industry_experience,
      identifications,
      certifications,
    } = req.body;

    const exists = await prisma.applicant.findUnique({
      where:   { applicant_id: applicantId },
      include: { classification: true },
    });
    if (!exists) return sendError(res, 'Applicant not found', 404);

    const data: any = {};
    if (talent_status       !== undefined) data.talent_status       = talent_status;
    if (position_categories !== undefined) data.position_categories = position_categories;
    if (skill_sets          !== undefined) data.skill_sets          = skill_sets;
    if (applicant_tags      !== undefined) data.applicant_tags      = applicant_tags;
    if (tag_details         !== undefined) data.tag_details         = tag_details;
    if (industry_experience !== undefined) data.industry_experience = industry_experience;
    if (identifications     !== undefined) data.identifications     = identifications;
    if (certifications      !== undefined) data.certifications      = certifications;

    const classification = exists.classification
      ? await prisma.applicantClassification.update({ where: { applicant_id: applicantId }, data })
      : await prisma.applicantClassification.create({ data: { applicant_id: applicantId, ...data } });

    return sendSuccess(res, { classification, message: 'Classification updated' });
  } catch (err: any) {
    console.error('updateClassification error:', err);
    return sendError(res, 'Failed to update classification', 500);
  }
};

// ════════════════════════════════════════════════════════════════════════════
//  23. UPSERT RATED TAGS
//      PUT /api/applicantprofiles/applicants/:applicantId/tags
// ════════════════════════════════════════════════════════════════════════════
export const upsertApplicantTags = async (req: Request, res: Response) => {
  try {
    const { applicantId } = req.params;
    const { tags } = req.body as { tags: { tag_title: string; stars: number }[] };

    if (!Array.isArray(tags)) return sendError(res, 'tags must be an array', 400);

    const exists = await prisma.applicant.findUnique({
      where:  { applicant_id: applicantId },
      select: { applicant_id: true },
    });
    if (!exists) return sendError(res, 'Applicant not found', 404);

    await prisma.$transaction(async (tx) => {
      await tx.applicantTag.deleteMany({ where: { applicant_id: applicantId } });
      if (tags.length > 0) {
        await tx.applicantTag.createMany({
          data: tags.map(t => ({
            applicant_id: applicantId,
            tag_title:    t.tag_title,
            stars:        Math.min(5, Math.max(1, t.stars)),
          })),
          skipDuplicates: true,
        });
      }
    });

    const updated = await prisma.applicantTag.findMany({ where: { applicant_id: applicantId } });
    return sendSuccess(res, { tags: updated, message: 'Tags updated' });
  } catch (err: any) {
    console.error('upsertApplicantTags error:', err);
    return sendError(res, 'Failed to update tags', 500);
  }
};

// ════════════════════════════════════════════════════════════════════════════
//  24. JOBS DROPDOWN
//      GET /api/applicantprofiles/applicants/jobs-dropdown
// ════════════════════════════════════════════════════════════════════════════
export const getJobsDropdown = async (req: Request, res: Response) => {
  try {
    const {
      q      = '',
      org_id = '',
      cursor = '',
      limit  = '50',
    } = req.query as Record<string, string>;

    const take = Math.min(parseInt(limit) || 50, 200);

    const where: any = { status: 'OPEN' };

    if (q?.trim())      where.job_title       = { contains: q.trim(), mode: 'insensitive' };
    if (org_id?.trim()) where.organization_id = org_id.trim();
    if (cursor?.trim()) where.job_id          = { gt: cursor.trim() };

    const jobs = await prisma.job.findMany({
      where,
      take,
      orderBy: { job_title: 'asc' },
      select: {
        job_id:         true,
        job_title:      true,
        job_type:       true,
        location:       true,
        open_positions: true,
        organization: {
          select: { organization_id: true, name: true },
        },
      },
    });

    const nextCursor = jobs.length === take ? jobs[jobs.length - 1].job_id : null;

    res.setHeader('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');

    return sendSuccess(res, {
      jobs,
      next_cursor: nextCursor,
      has_more:    !!nextCursor,
      count:       jobs.length,
    });
  } catch (err: any) {
    console.error('getJobsDropdown error:', err);
    return sendError(res, 'Failed to fetch jobs', 500);
  }
};