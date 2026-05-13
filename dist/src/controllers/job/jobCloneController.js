"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.cloneJob = exports.createJobFromTemplate = exports.deleteTemplate = exports.updateTemplate = exports.getTemplateById = exports.getTemplates = exports.saveJobAsTemplate = exports.previewSnapshot = void 0;
const client_1 = require("@prisma/client");
const prisma_config_1 = __importDefault(require("../../prisma.config"));
// ─── Helpers ──────────────────────────────────────────────────────────────────
function normalizeSections(sections = {}) {
    return {
        core: sections.core !== false,
        detail: sections.detail !== false,
        rates: sections.rates !== false,
        owners: sections.owners === true,
        notes: sections.notes === true,
    };
}
// Only fetch what the requested sections actually need
async function fetchJobForSnapshot(jobId, sections) {
    return prisma_config_1.default.job.findUnique({
        where: { job_id: jobId },
        include: {
            job_detail: sections.detail,
            job_rates: sections.rates,
            job_owners: sections.owners,
            job_notes: sections.notes,
        },
    });
}
function buildSnapshot(job, sections, fieldOverrides = {}) {
    const snapshot = {};
    if (sections.core) {
        Object.assign(snapshot, {
            job_title: job.job_title,
            job_type: job.job_type,
            location: job.location,
            city: job.city,
            state: job.state,
            address: job.address,
            manager_id: job.manager_id,
            job_category: job.job_category,
            job_branch: job.job_branch,
            max_positions: job.max_positions,
            open_positions: job.open_positions,
            contract_duration: job.contract_duration,
            days_active: job.days_active,
            days_inactive: job.days_inactive,
            open_date: job.open_date ?? null,
            manager_last_contacted: job.manager_last_contacted ?? null,
            custom_job_id: job.custom_job_id ?? null,
            time_capture: job.time_capture,
            pay_period: job.pay_period,
            week_duration: job.week_duration,
            rate_type: job.rate_type,
            resume_required: job.resume_required,
            interview_rounds: job.interview_rounds,
            interview_Round1: job.interview_Round1,
            interview_Round2: job.interview_Round2,
            po_number: job.po_number,
            po_amount: job.po_amount ? Number(job.po_amount) : null,
            withhold_emails: job.withhold_emails,
            invoice_with_hours: job.invoice_with_hours,
            paycom_position: job.paycom_position,
            company_office_id: job.company_office_id ?? null,
        });
    }
    if (sections.detail && job.job_detail) {
        snapshot.detail = {
            description: job.job_detail.description,
            skills: job.job_detail.skills ?? null,
        };
    }
    if (sections.rates && job.job_rates?.length) {
        snapshot.rates = job.job_rates.map((r) => {
            // Destructure out all DB-managed / non-creatable fields
            const { job_rate_id, job_id, created_at, updated_at, // FIX 4: remove these
            ...rest } = r;
            return {
                ...rest,
                pay_rate: rest.pay_rate ? Number(rest.pay_rate) : null,
                bill_rate: rest.bill_rate ? Number(rest.bill_rate) : null,
                markup_percentage: rest.markup_percentage ? Number(rest.markup_percentage) : null,
                ot_pay_rate: rest.ot_pay_rate ? Number(rest.ot_pay_rate) : null,
                ot_bill_rate: rest.ot_bill_rate ? Number(rest.ot_bill_rate) : null,
                min_bill_rate: rest.min_bill_rate ? Number(rest.min_bill_rate) : null,
                max_bill_rate: rest.max_bill_rate ? Number(rest.max_bill_rate) : null,
                target_bill_rate: rest.target_bill_rate ? Number(rest.target_bill_rate) : null,
                min_pay_rate: rest.min_pay_rate ? Number(rest.min_pay_rate) : null,
                max_pay_rate: rest.max_pay_rate ? Number(rest.max_pay_rate) : null,
                target_pay_rate: rest.target_pay_rate ? Number(rest.target_pay_rate) : null,
                burden: rest.burden ? Number(rest.burden) : null,
                discounts: rest.discounts ? Number(rest.discounts) : null,
                gross_margin_hourly: rest.gross_margin_hourly ? Number(rest.gross_margin_hourly) : null,
                estimated_gp: rest.estimated_gp ? Number(rest.estimated_gp) : null,
                dt_markup_percentage: rest.dt_markup_percentage ? Number(rest.dt_markup_percentage) : null,
                dt_bill_rate: rest.dt_bill_rate ? Number(rest.dt_bill_rate) : null,
                dt_pay_rate: rest.dt_pay_rate ? Number(rest.dt_pay_rate) : null,
            };
        });
    }
    if (sections.owners && job.job_owners?.length) {
        snapshot.owners = job.job_owners.map(({ user_id, role_type }) => ({
            user_id,
            role_type,
        }));
    }
    if (sections.notes && job.job_notes?.length) {
        snapshot.notes = job.job_notes.map(({ note }) => note);
    }
    return { ...snapshot, ...fieldOverrides };
}
// Shared job data builder from snapshot — used by both clone and createFromTemplate
function buildJobDataFromSnapshot(snap, resolvedOrgId, createdByUserId, fallbackTitle) {
    return {
        job_title: snap.job_title ?? fallbackTitle,
        job_type: snap.job_type ?? 'TEMPORARY',
        location: snap.location ?? '',
        city: snap.city ?? null,
        state: snap.state ?? null,
        address: snap.address ?? null,
        job_category: snap.job_category ?? null,
        job_branch: snap.job_branch ?? null,
        max_positions: snap.max_positions ?? null,
        open_positions: snap.open_positions ?? null,
        contract_duration: snap.contract_duration ?? null,
        time_capture: snap.time_capture ?? 'TIMESHEET',
        pay_period: snap.pay_period ?? 'WEEKLY',
        week_duration: snap.week_duration ?? 'MON_SUN',
        rate_type: snap.rate_type ?? 'HOURLY',
        resume_required: snap.resume_required ?? false,
        interview_rounds: snap.interview_rounds ?? 1,
        interview_Round1: snap.interview_Round1 ?? true,
        interview_Round2: snap.interview_Round2 ?? false,
        po_number: snap.po_number ?? null,
        po_amount: snap.po_amount ?? null,
        withhold_emails: snap.withhold_emails ?? false,
        invoice_with_hours: snap.invoice_with_hours ?? false,
        paycom_position: snap.paycom_position ?? null,
        // Always reset on new job
        status: 'DRAFT',
        approved: false,
        start_date: null,
        end_date: null,
        organization: { connect: { organization_id: resolvedOrgId } },
        created_by: { connect: { user_id: createdByUserId } },
        ...(snap.detail ? {
            job_detail: {
                create: {
                    description: snap.detail.description,
                    skills: snap.detail.skills ?? client_1.Prisma.JsonNull,
                },
            },
        } : {}),
        ...(snap.rates?.length ? {
            job_rates: { create: snap.rates },
        } : {}),
        ...(snap.owners?.length ? {
            job_owners: {
                create: snap.owners.map(({ user_id, role_type }) => ({
                    role_type: role_type,
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
const previewSnapshot = async (req, res) => {
    try {
        const { jobId } = req.params;
        const { sections = {}, field_overrides = {} } = req.body;
        const normalizedSections = normalizeSections(sections);
        const job = await fetchJobForSnapshot(jobId, normalizedSections);
        if (!job) {
            res.status(404).json({ error: 'Job not found' });
            return;
        }
        const snapshot = buildSnapshot(job, normalizedSections, field_overrides);
        res.json({ snapshot, sections_included: normalizedSections, source_job_id: jobId });
    }
    catch (error) {
        console.error('previewSnapshot:', error);
        res.status(500).json({ error: 'Failed to preview snapshot' });
    }
};
exports.previewSnapshot = previewSnapshot;
// ─── 2. Save job as template ──────────────────────────────────────────────────
// POST /api/job-templates/:jobId/save-as-template
// Body: { name, description?, created_by_user_id, organization_id?, sections?, field_overrides? }
const saveJobAsTemplate = async (req, res) => {
    try {
        const { jobId } = req.params;
        const { name, description, created_by_user_id, organization_id, sections = {}, field_overrides = {}, } = req.body;
        if (!name || !created_by_user_id) {
            res.status(400).json({ error: 'name and created_by_user_id are required' });
            return;
        }
        const normalizedSections = normalizeSections(sections);
        // Parallel: fetch job + check for duplicate name
        const [job, existing] = await Promise.all([
            fetchJobForSnapshot(jobId, normalizedSections),
            prisma_config_1.default.jobTemplate.findFirst({
                where: { job_id: jobId, name, is_active: true },
                select: { template_id: true },
            }),
        ]);
        if (!job) {
            res.status(404).json({ error: 'Job not found' });
            return;
        }
        if (existing) {
            res.status(409).json({ error: 'A template with this name already exists for this job' });
            return;
        }
        const snapshot = buildSnapshot(job, normalizedSections, field_overrides);
        const template = await prisma_config_1.default.jobTemplate.create({
            data: {
                job_id: jobId,
                organization_id: organization_id ?? job.organization_id,
                created_by_user_id,
                name,
                description,
                snapshot: snapshot,
                // FIX 3: convert object to array of enabled section keys
                sections_included: normalizedSections,
            },
            include: {
                created_by: { select: { user_id: true, name: true } },
                organization: { select: { organization_id: true, name: true } },
            },
        });
        res.status(201).json({ message: 'Template saved', template });
    }
    catch (error) {
        console.error('saveJobAsTemplate:', error);
        res.status(500).json({ error: 'Failed to save template' });
    }
};
exports.saveJobAsTemplate = saveJobAsTemplate;
// ─── 3. Get all templates ─────────────────────────────────────────────────────
// GET /api/job-templates
// Query: organization_id, include_global, search, is_active, page, limit
const getTemplates = async (req, res) => {
    try {
        const { organization_id, include_global = 'true', search, is_active = 'true', page = '1', limit = '20', } = req.query;
        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
        // FIX 1: Guard against "undefined" string and build correct OR conditions
        const orgConditions = [];
        if (organization_id && organization_id !== 'undefined') {
            orgConditions.push({ organization_id });
            if (include_global === 'true')
                orgConditions.push({ organization_id: null });
        }
        else {
            // No valid org — return only global templates
            orgConditions.push({ organization_id: null });
        }
        const where = {
            is_active: is_active === 'true',
            OR: orgConditions,
            ...(search ? {
                AND: [{
                        OR: [
                            { name: { contains: search, mode: 'insensitive' } },
                            { description: { contains: search, mode: 'insensitive' } },
                        ],
                    }],
            } : {}),
        };
        const [templates, total] = await Promise.all([
            prisma_config_1.default.jobTemplate.findMany({
                where,
                skip: (pageNum - 1) * limitNum,
                take: limitNum,
                orderBy: { created_at: 'desc' },
                select: {
                    template_id: true,
                    name: true,
                    description: true,
                    is_active: true,
                    sections_included: true, // FIX 2: was missing — needed for section chips
                    snapshot: true, // FIX 2: include snapshot for list view
                    created_at: true,
                    updated_at: true,
                    organization_id: true,
                    job_id: true,
                    created_by: { select: { user_id: true, name: true } },
                    organization: { select: { organization_id: true, name: true } },
                    job: { select: { job_title: true } },
                },
            }),
            prisma_config_1.default.jobTemplate.count({ where }),
        ]);
        res.json({
            templates,
            pagination: {
                total,
                page: pageNum,
                limit: limitNum,
                total_pages: Math.ceil(total / limitNum),
            },
        });
    }
    catch (error) {
        console.error('getTemplates:', error);
        res.status(500).json({ error: 'Failed to fetch templates' });
    }
};
exports.getTemplates = getTemplates;
// ─── 4. Get single template (full snapshot for form pre-fill) ─────────────────
// GET /api/job-templates/:templateId
const getTemplateById = async (req, res) => {
    try {
        const template = await prisma_config_1.default.jobTemplate.findUnique({
            where: { template_id: req.params.templateId },
            include: {
                created_by: { select: { user_id: true, name: true } },
                organization: { select: { organization_id: true, name: true } },
                job: { select: { job_id: true, job_title: true, status: true } },
            },
        });
        if (!template) {
            res.status(404).json({ error: 'Template not found' });
            return;
        }
        res.json({ template });
    }
    catch (error) {
        console.error('getTemplateById:', error);
        res.status(500).json({ error: 'Failed to fetch template' });
    }
};
exports.getTemplateById = getTemplateById;
// ─── 5. Update template metadata or snapshot ──────────────────────────────────
// PATCH /api/job-templates/:templateId
// Body: { name?, description?, is_active?, snapshot_overrides? }
const updateTemplate = async (req, res) => {
    try {
        const { name, description, is_active, snapshot_overrides } = req.body;
        const existing = await prisma_config_1.default.jobTemplate.findUnique({
            where: { template_id: req.params.templateId },
            select: { snapshot: true },
        });
        if (!existing) {
            res.status(404).json({ error: 'Template not found' });
            return;
        }
        const updatedSnapshot = snapshot_overrides
            ? { ...existing.snapshot, ...snapshot_overrides }
            : undefined;
        const template = await prisma_config_1.default.jobTemplate.update({
            where: { template_id: req.params.templateId },
            data: {
                ...(name !== undefined ? { name } : {}),
                ...(description !== undefined ? { description } : {}),
                ...(is_active !== undefined ? { is_active } : {}),
                ...(updatedSnapshot !== undefined ? { snapshot: updatedSnapshot } : {}),
            },
        });
        res.json({ message: 'Template updated', template });
    }
    catch (error) {
        if (error.code === 'P2025') {
            res.status(404).json({ error: 'Template not found' });
            return;
        }
        console.error('updateTemplate:', error);
        res.status(500).json({ error: 'Failed to update template' });
    }
};
exports.updateTemplate = updateTemplate;
// ─── 6. Soft delete template ──────────────────────────────────────────────────
// DELETE /api/job-templates/:templateId
const deleteTemplate = async (req, res) => {
    try {
        await prisma_config_1.default.jobTemplate.update({
            where: { template_id: req.params.templateId },
            data: { is_active: false },
        });
        res.json({ message: 'Template deactivated' });
    }
    catch (error) {
        if (error.code === 'P2025') {
            res.status(404).json({ error: 'Template not found' });
            return;
        }
        console.error('deleteTemplate:', error);
        res.status(500).json({ error: 'Failed to delete template' });
    }
};
exports.deleteTemplate = deleteTemplate;
// ─── 7. Create job from template (programmatic/bulk) ─────────────────────────
// POST /api/job-templates/:templateId/create-job
// Body: { created_by_user_id, organization_id?, overrides? }
const createJobFromTemplate = async (req, res) => {
    try {
        const { created_by_user_id, organization_id, overrides = {} } = req.body;
        if (!created_by_user_id) {
            res.status(400).json({ error: 'created_by_user_id is required' });
            return;
        }
        const template = await prisma_config_1.default.jobTemplate.findUnique({
            where: { template_id: req.params.templateId },
            select: { template_id: true, snapshot: true, organization_id: true, is_active: true, name: true },
        });
        if (!template) {
            res.status(404).json({ error: 'Template not found' });
            return;
        }
        if (!template.is_active) {
            res.status(400).json({ error: 'Template is inactive' });
            return;
        }
        const resolvedOrgId = organization_id ?? template.organization_id;
        if (!resolvedOrgId) {
            res.status(400).json({ error: 'organization_id is required' });
            return;
        }
        const snap = { ...template.snapshot, ...overrides };
        const jobData = buildJobDataFromSnapshot(snap, resolvedOrgId, created_by_user_id, template.name);
        const job = await prisma_config_1.default.job.create({
            data: jobData,
            include: {
                job_detail: true,
                job_rates: true,
                organization: { select: { organization_id: true, name: true } },
            },
        });
        res.status(201).json({
            message: 'Job created from template',
            job,
            template_id: template.template_id,
        });
    }
    catch (error) {
        console.error('createJobFromTemplate:', error);
        res.status(500).json({ error: 'Failed to create job from template' });
    }
};
exports.createJobFromTemplate = createJobFromTemplate;
// ─── 8. Clone a job directly ──────────────────────────────────────────────────
// POST /api/job-templates/:jobId/clone
// Body: { created_by_user_id, organization_id?, sections?, field_overrides?, overrides? }
const cloneJob = async (req, res) => {
    try {
        const { jobId } = req.params;
        const { created_by_user_id, organization_id, sections = {}, field_overrides = {}, overrides = {}, } = req.body;
        if (!created_by_user_id) {
            res.status(400).json({ error: 'created_by_user_id is required' });
            return;
        }
        const normalizedSections = normalizeSections(sections);
        const source = await fetchJobForSnapshot(jobId, normalizedSections);
        if (!source) {
            res.status(404).json({ error: 'Job not found' });
            return;
        }
        const snap = {
            ...buildSnapshot(source, normalizedSections, field_overrides),
            ...overrides,
        };
        const resolvedOrgId = organization_id ?? source.organization_id;
        const jobData = buildJobDataFromSnapshot(snap, resolvedOrgId, created_by_user_id, `${source.job_title} (Copy)`);
        const cloned = await prisma_config_1.default.job.create({
            data: jobData,
            include: {
                job_detail: true,
                job_rates: true,
                organization: { select: { organization_id: true, name: true } },
            },
        });
        res.status(201).json({
            message: 'Job cloned successfully',
            cloned_job: cloned,
            source_job_id: jobId,
            sections_copied: normalizedSections,
        });
    }
    catch (error) {
        console.error('cloneJob:', error);
        res.status(500).json({ error: 'Failed to clone job' });
    }
};
exports.cloneJob = cloneJob;
//# sourceMappingURL=jobCloneController.js.map