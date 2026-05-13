import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../../prisma.config';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SectionFlags {
  core?:   boolean;
  detail?: boolean;
  rates?:  boolean;
  owners?: boolean;
  notes?:  boolean;
}

interface JobSnapshot {
  job_title?:                string;
  job_type?:                 string;
  location?:                 string;
  city?:                     string | null;
  state?:                    string | null;
  address?:                  string | null;
  manager_id?:               string | null;
  open_date?:                Date | null;
  manager_last_contacted?:   Date | null;
  custom_job_id?:            string | null;
  days_active?:              number | null;
  days_inactive?:            number | null;
  job_category?:             string | null;
  job_branch?:               string | null;
  max_positions?:            number | null;
  open_positions?:           number | null;
  contract_duration?:        string | null;
  time_capture?:             string;
  pay_period?:               string;
  week_duration?:            string;
  rate_type?:                string;
  resume_required?:          boolean;
  interview_rounds?:         number;
  interview_Round1?:         boolean;
  interview_Round2?:         boolean;
  po_number?:                string | null;
  po_amount?:                number | null;
  withhold_emails?:          boolean;
  invoice_with_hours?:       boolean;
  paycom_position?:          string | null;
  company_office_id?:        string | null;
  detail?: {
    description: string;
    skills: any;
  };
  rates?: Array<any>;
  owners?: Array<{ user_id: string; role_type: string }>;
  notes?: Array<string>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeSections(sections: SectionFlags = {}): Required<SectionFlags> {
  return {
    core:   sections.core   !== false,
    detail: sections.detail !== false,
    rates:  sections.rates  !== false,
    owners: sections.owners === true,
    notes:  sections.notes  === true,
  };
}

// Only fetch what the requested sections actually need
async function fetchJobForSnapshot(jobId: string, sections: Required<SectionFlags>) {
  return prisma.job.findUnique({
    where: { job_id: jobId },
    include: {
      job_detail: sections.detail,
      job_rates:  sections.rates,
      job_owners: sections.owners,
      job_notes:  sections.notes,
    },
  });
}

function buildSnapshot(
  job: any,
  sections: Required<SectionFlags>,
  fieldOverrides: Partial<JobSnapshot> = {}
): JobSnapshot {
  const snapshot: JobSnapshot = {};

  if (sections.core) {
    Object.assign(snapshot, {
      job_title:                job.job_title,
      job_type:                 job.job_type,
      location:                 job.location,
      city:                     job.city,
      state:                    job.state,
      address:                  job.address,
      manager_id:               job.manager_id,
      job_category:             job.job_category,
      job_branch:               job.job_branch,
      max_positions:            job.max_positions,
      open_positions:           job.open_positions,
      contract_duration:        job.contract_duration,
      days_active:              job.days_active,
      days_inactive:            job.days_inactive,
      open_date:                job.open_date             ?? null,
      manager_last_contacted:   job.manager_last_contacted ?? null,
      custom_job_id:            job.custom_job_id         ?? null,
      time_capture:             job.time_capture,
      pay_period:               job.pay_period,
      week_duration:            job.week_duration,
      rate_type:                job.rate_type,
      resume_required:          job.resume_required,
      interview_rounds:         job.interview_rounds,
      interview_Round1:         job.interview_Round1,
      interview_Round2:         job.interview_Round2,
      po_number:                job.po_number,
      po_amount:                job.po_amount ? Number(job.po_amount) : null,
      withhold_emails:          job.withhold_emails,
      invoice_with_hours:       job.invoice_with_hours,
      paycom_position:          job.paycom_position,
      company_office_id:        job.company_office_id ?? null,
    });
  }


  if (sections.detail && job.job_detail) {
    snapshot.detail = {
      description: job.job_detail.description,
      skills:      job.job_detail.skills ?? null,
    };
  }

  if (sections.rates && job.job_rates?.length) {
    snapshot.rates = job.job_rates.map((r: any) => {
      // Destructure out all DB-managed / non-creatable fields
      const {
        job_rate_id, job_id,
        created_at, updated_at,  // FIX 4: remove these
        ...rest
      } = r;
      return {
        ...rest,
        pay_rate:             rest.pay_rate             ? Number(rest.pay_rate)             : null,
        bill_rate:            rest.bill_rate            ? Number(rest.bill_rate)            : null,
        markup_percentage:    rest.markup_percentage    ? Number(rest.markup_percentage)    : null,
        ot_pay_rate:          rest.ot_pay_rate          ? Number(rest.ot_pay_rate)          : null,
        ot_bill_rate:         rest.ot_bill_rate         ? Number(rest.ot_bill_rate)         : null,
        min_bill_rate:        rest.min_bill_rate        ? Number(rest.min_bill_rate)        : null,
        max_bill_rate:        rest.max_bill_rate        ? Number(rest.max_bill_rate)        : null,
        target_bill_rate:     rest.target_bill_rate     ? Number(rest.target_bill_rate)     : null,
        min_pay_rate:         rest.min_pay_rate         ? Number(rest.min_pay_rate)         : null,
        max_pay_rate:         rest.max_pay_rate         ? Number(rest.max_pay_rate)         : null,
        target_pay_rate:      rest.target_pay_rate      ? Number(rest.target_pay_rate)      : null,
        burden:               rest.burden               ? Number(rest.burden)               : null,
        discounts:            rest.discounts            ? Number(rest.discounts)            : null,
        gross_margin_hourly:  rest.gross_margin_hourly  ? Number(rest.gross_margin_hourly)  : null,
        estimated_gp:         rest.estimated_gp         ? Number(rest.estimated_gp)         : null,
        dt_markup_percentage: rest.dt_markup_percentage ? Number(rest.dt_markup_percentage) : null,
        dt_bill_rate:         rest.dt_bill_rate         ? Number(rest.dt_bill_rate)         : null,
        dt_pay_rate:          rest.dt_pay_rate          ? Number(rest.dt_pay_rate)          : null,
      };
    });
  }


  if (sections.owners && job.job_owners?.length) {
    snapshot.owners = job.job_owners.map(({ user_id, role_type }: any) => ({
      user_id,
      role_type,
    }));
  }

  if (sections.notes && job.job_notes?.length) {
    snapshot.notes = job.job_notes.map(({ note }: any) => note);
  }

  return { ...snapshot, ...fieldOverrides };
}

// Shared job data builder from snapshot — used by both clone and createFromTemplate
function buildJobDataFromSnapshot(
  snap: JobSnapshot,
  resolvedOrgId: string,
  createdByUserId: string,
  fallbackTitle: string
): Prisma.JobCreateInput {
  return {
    job_title:          snap.job_title          ?? fallbackTitle,
    job_type:           (snap.job_type          as any) ?? 'TEMPORARY',
    location:           snap.location           ?? '',
    city:               snap.city               ?? null,
    state:              snap.state              ?? null,
    address:            snap.address            ?? null,
    job_category:       (snap.job_category      as any) ?? null,
    job_branch:         (snap.job_branch        as any) ?? null,
    max_positions:      snap.max_positions      ?? null,
    open_positions:     snap.open_positions     ?? null,
    contract_duration:  (snap.contract_duration as any) ?? null,
    time_capture:       (snap.time_capture      as any) ?? 'TIMESHEET',
    pay_period:         (snap.pay_period        as any) ?? 'WEEKLY',
    week_duration:      (snap.week_duration     as any) ?? 'MON_SUN',
    rate_type:          (snap.rate_type         as any) ?? 'HOURLY',
    resume_required:    snap.resume_required    ?? false,
    interview_rounds:   snap.interview_rounds   ?? 1,
    interview_Round1:   snap.interview_Round1   ?? true,
    interview_Round2:   snap.interview_Round2   ?? false,
    po_number:          snap.po_number          ?? null,
    po_amount:          snap.po_amount          ?? null,
    withhold_emails:    snap.withhold_emails    ?? false,
    invoice_with_hours: snap.invoice_with_hours ?? false,
    paycom_position:    snap.paycom_position    ?? null,

    // Always reset on new job
    status:    'DRAFT',
    approved:  false,
    start_date: null,
    end_date:   null,

    organization: { connect: { organization_id: resolvedOrgId } },
    created_by:   { connect: { user_id: createdByUserId } },

    ...(snap.detail ? {
      job_detail: {
        create: {
          description: snap.detail.description,
          skills:      snap.detail.skills ?? Prisma.JsonNull,
        },
      },
    } : {}),

    ...(snap.rates?.length ? {
      job_rates: { create: snap.rates },
    } : {}),

    ...(snap.owners?.length ? {
    job_owners: {
        create: snap.owners.map(({ user_id, role_type }) => ({
        role_type: role_type as any,
        user: { connect: { user_id } },
        })),
    },
    } : {}),

    ...(snap.notes?.length ? {
      job_notes: { create: snap.notes.map(note => ({ note })) },
    } : {}),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

// ─── 1. Preview snapshot ──────────────────────────────────────────────────────
// POST /api/job-templates/:jobId/preview-snapshot
// Body: { sections?, field_overrides? }

export const previewSnapshot = async (req: Request, res: Response): Promise<void> => {
  try {
    const { jobId } = req.params;
    const { sections = {}, field_overrides = {} } = req.body;

    const normalizedSections = normalizeSections(sections);
    const job = await fetchJobForSnapshot(jobId, normalizedSections);
    if (!job) { res.status(404).json({ error: 'Job not found' }); return; }

    const snapshot = buildSnapshot(job, normalizedSections, field_overrides);

    res.json({ snapshot, sections_included: normalizedSections, source_job_id: jobId });
  } catch (error) {
    console.error('previewSnapshot:', error);
    res.status(500).json({ error: 'Failed to preview snapshot' });
  }
};

// ─── 2. Save job as template ──────────────────────────────────────────────────
// POST /api/job-templates/:jobId/save-as-template
// Body: { name, description?, created_by_user_id, organization_id?, sections?, field_overrides? }

export const saveJobAsTemplate = async (req: Request, res: Response): Promise<void> => {
  try {
    const { jobId } = req.params;
    const {
      name,
      description,
      created_by_user_id,
      organization_id,
      sections = {},
      field_overrides = {},
    } = req.body;

    if (!name || !created_by_user_id) {
      res.status(400).json({ error: 'name and created_by_user_id are required' });
      return;
    }

    const normalizedSections = normalizeSections(sections);

    // Parallel: fetch job + check for duplicate name
    const [job, existing] = await Promise.all([
      fetchJobForSnapshot(jobId, normalizedSections),
      prisma.jobTemplate.findFirst({
        where: { job_id: jobId, name, is_active: true },
        select: { template_id: true },
      }),
    ]);

    if (!job)     { res.status(404).json({ error: 'Job not found' }); return; }
    if (existing) {
      res.status(409).json({ error: 'A template with this name already exists for this job' });
      return;
    }

    const snapshot = buildSnapshot(job, normalizedSections, field_overrides);

    const template = await prisma.jobTemplate.create({
      data: {
        job_id:             jobId,
        organization_id:    organization_id ?? job.organization_id,
        created_by_user_id,
        name,
        description,
        snapshot:           snapshot as any,
        // FIX 3: convert object to array of enabled section keys
        sections_included: normalizedSections as any,

      },
      include: {
        created_by:   { select: { user_id: true, name: true } },
        organization: { select: { organization_id: true, name: true } },
      },
    });


    res.status(201).json({ message: 'Template saved', template });
  } catch (error) {
    console.error('saveJobAsTemplate:', error);
    res.status(500).json({ error: 'Failed to save template' });
  }
};

// ─── 3. Get all templates ─────────────────────────────────────────────────────
// GET /api/job-templates
// Query: organization_id, include_global, search, is_active, page, limit
export const getTemplates = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      organization_id,
      include_global = 'true',
      search,
      is_active = 'true',
      page  = '1',
      limit = '20',
    } = req.query as Record<string, string>;

    const pageNum  = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));

    // FIX 1: Guard against "undefined" string and build correct OR conditions
    const orgConditions: Prisma.JobTemplateWhereInput[] = [];
    if (organization_id && organization_id !== 'undefined') {
      orgConditions.push({ organization_id });
      if (include_global === 'true') orgConditions.push({ organization_id: null });
    } else {
      // No valid org — return only global templates
      orgConditions.push({ organization_id: null });
    }

    const where: Prisma.JobTemplateWhereInput = {
      is_active: is_active === 'true',
      OR: orgConditions,
      ...(search ? {
        AND: [{
          OR: [
            { name:        { contains: search, mode: 'insensitive' } },
            { description: { contains: search, mode: 'insensitive' } },
          ],
        }],
      } : {}),
    };

    const [templates, total] = await Promise.all([
      prisma.jobTemplate.findMany({
        where,
        skip:    (pageNum - 1) * limitNum,
        take:    limitNum,
        orderBy: { created_at: 'desc' },
        select: {
          template_id:       true,
          name:              true,
          description:       true,
          is_active:         true,
          sections_included: true,  // FIX 2: was missing — needed for section chips
          snapshot:          true,  // FIX 2: include snapshot for list view
          created_at:        true,
          updated_at:        true,
          organization_id:   true,
          job_id:            true,
          created_by: { select: { user_id: true, name: true } },
          organization: { select: { organization_id: true, name: true } },
          job: { select: { job_title: true } },
        },
      }),
      prisma.jobTemplate.count({ where }),
    ]);

    res.json({
      templates,
      pagination: {
        total,
        page:        pageNum,
        limit:       limitNum,
        total_pages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error('getTemplates:', error);
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
};


// ─── 4. Get single template (full snapshot for form pre-fill) ─────────────────
// GET /api/job-templates/:templateId

export const getTemplateById = async (req: Request, res: Response): Promise<void> => {
  try {
    const template = await prisma.jobTemplate.findUnique({
      where: { template_id: req.params.templateId },
      include: {
        created_by:   { select: { user_id: true, name: true } },
        organization: { select: { organization_id: true, name: true } },
        job:          { select: { job_id: true, job_title: true, status: true } },
      },
    });

    if (!template) { res.status(404).json({ error: 'Template not found' }); return; }
    res.json({ template });
  } catch (error) {
    console.error('getTemplateById:', error);
    res.status(500).json({ error: 'Failed to fetch template' });
  }
};

// ─── 5. Update template metadata or snapshot ──────────────────────────────────
// PATCH /api/job-templates/:templateId
// Body: { name?, description?, is_active?, snapshot_overrides? }

export const updateTemplate = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, description, is_active, snapshot_overrides } = req.body;

    const existing = await prisma.jobTemplate.findUnique({
      where:  { template_id: req.params.templateId },
      select: { snapshot: true },
    });
    if (!existing) { res.status(404).json({ error: 'Template not found' }); return; }

    const updatedSnapshot = snapshot_overrides
      ? { ...(existing.snapshot as object), ...snapshot_overrides }
      : undefined;

    const template = await prisma.jobTemplate.update({
      where: { template_id: req.params.templateId },
      data: {
        ...(name            !== undefined ? { name }        : {}),
        ...(description     !== undefined ? { description } : {}),
        ...(is_active       !== undefined ? { is_active }   : {}),
        ...(updatedSnapshot !== undefined ? { snapshot: updatedSnapshot as any } : {}),
      },
    });

    res.json({ message: 'Template updated', template });
  } catch (error: any) {
    if (error.code === 'P2025') { res.status(404).json({ error: 'Template not found' }); return; }
    console.error('updateTemplate:', error);
    res.status(500).json({ error: 'Failed to update template' });
  }
};

// ─── 6. Soft delete template ──────────────────────────────────────────────────
// DELETE /api/job-templates/:templateId

export const deleteTemplate = async (req: Request, res: Response): Promise<void> => {
  try {
    await prisma.jobTemplate.update({
      where: { template_id: req.params.templateId },
      data:  { is_active: false },
    });
    res.json({ message: 'Template deactivated' });
  } catch (error: any) {
    if (error.code === 'P2025') { res.status(404).json({ error: 'Template not found' }); return; }
    console.error('deleteTemplate:', error);
    res.status(500).json({ error: 'Failed to delete template' });
  }
};

// ─── 7. Create job from template (programmatic/bulk) ─────────────────────────
// POST /api/job-templates/:templateId/create-job
// Body: { created_by_user_id, organization_id?, overrides? }

export const createJobFromTemplate = async (req: Request, res: Response): Promise<void> => {
  try {
    const { created_by_user_id, organization_id, overrides = {} } = req.body;

    if (!created_by_user_id) {
      res.status(400).json({ error: 'created_by_user_id is required' });
      return;
    }

    const template = await prisma.jobTemplate.findUnique({
      where:  { template_id: req.params.templateId },
      select: { template_id: true, snapshot: true, organization_id: true, is_active: true, name: true },
    });

    if (!template)            { res.status(404).json({ error: 'Template not found' }); return; }
    if (!template.is_active)  { res.status(400).json({ error: 'Template is inactive' }); return; }

    const resolvedOrgId = organization_id ?? template.organization_id;
    if (!resolvedOrgId) {
      res.status(400).json({ error: 'organization_id is required' });
      return;
    }

    const snap: JobSnapshot = { ...(template.snapshot as JobSnapshot), ...overrides };
    const jobData = buildJobDataFromSnapshot(snap, resolvedOrgId, created_by_user_id, template.name);

    const job = await prisma.job.create({
      data: jobData,
      include: {
        job_detail:   true,
        job_rates:    true,
        organization: { select: { organization_id: true, name: true } },
      },
    });

    res.status(201).json({
      message:     'Job created from template',
      job,
      template_id: template.template_id,
    });
  } catch (error) {
    console.error('createJobFromTemplate:', error);
    res.status(500).json({ error: 'Failed to create job from template' });
  }
};

// ─── 8. Clone a job directly ──────────────────────────────────────────────────
// POST /api/job-templates/:jobId/clone
// Body: { created_by_user_id, organization_id?, sections?, field_overrides?, overrides? }

export const cloneJob = async (req: Request, res: Response): Promise<void> => {
  try {
    const { jobId } = req.params;
    const {
      created_by_user_id,
      organization_id,
      sections      = {},
      field_overrides = {},
      overrides     = {},
    } = req.body;

    if (!created_by_user_id) {
      res.status(400).json({ error: 'created_by_user_id is required' });
      return;
    }

    const normalizedSections = normalizeSections(sections);
    const source = await fetchJobForSnapshot(jobId, normalizedSections);
    if (!source) { res.status(404).json({ error: 'Job not found' }); return; }

    const snap: JobSnapshot = {
      ...buildSnapshot(source, normalizedSections, field_overrides),
      ...overrides,
    };

    const resolvedOrgId = organization_id ?? source.organization_id;
    const jobData = buildJobDataFromSnapshot(
      snap,
      resolvedOrgId,
      created_by_user_id,
      `${source.job_title} (Copy)`
    );

    const cloned = await prisma.job.create({
      data: jobData,
      include: {
        job_detail:   true,
        job_rates:    true,
        organization: { select: { organization_id: true, name: true } },
      },
    });

    res.status(201).json({
      message:         'Job cloned successfully',
      cloned_job:      cloned,
      source_job_id:   jobId,
      sections_copied: normalizedSections,
    });
  } catch (error) {
    console.error('cloneJob:', error);
    res.status(500).json({ error: 'Failed to clone job' });
  }
};