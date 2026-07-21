"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.assignmentController = exports.downloadAssignmentDocument = exports.viewAssignmentDocument = void 0;
const storage_blob_1 = require("@azure/storage-blob");
const prisma_config_1 = __importDefault(require("../../prisma.config"));
const crudFactory_1 = require("../../factories/crudFactory");
const schemas_1 = require("../../validators/schemas");
const response_1 = require("../../utils/response");
const pipelineController_1 = require("./pipelineController");
// ─────────────────────────────────────────────────────────────────────────────
// AZURE SETUP
//
// Documents in this system live in TWO containers:
//
//   applicant-documents  (AZURE_CONTAINER_NAME)
//     → uploaded via the general applicant document upload flow
//
//   onboarding-documents (AZURE_ONBOARDING_DOCS_CONTAINER)
//     → uploaded via onboardCandidate() in pipelineController
//
// The stored file_url JSON looks like:
//   {
//     blobName:         "applicantId/ts-rand-file.pdf",  ← path within container
//     url:              "https://account.blob.core.windows.net/onboarding-documents/applicantId/...",
//     mimeType:         "application/pdf",
//     originalFileName: "offer_letter.pdf",
//     size:             12345,
//     sendToCandidate:  false
//   }
//
// The blobName alone does NOT encode the container, so we derive the correct
// container by:
//   1. Checking if the stored JSON has an explicit `containerName` field
//      (new uploads after this change will include it).
//   2. Parsing the container name out of the stored `url` (handles all
//      existing rows — the URL format is always:
//      https://<account>.blob.core.windows.net/<container>/<blobName>
//   3. Falling back to AZURE_CONTAINER_NAME if neither is available.
// ─────────────────────────────────────────────────────────────────────────────
const _blobServiceClient = storage_blob_1.BlobServiceClient.fromConnectionString(process.env.AZURE_STORAGE_CONNECTION_STRING);
// Known container names — used for validation and lookup
const CONTAINER_APPLICANT = process.env.AZURE_CONTAINER_NAME || 'applicant-documents';
const CONTAINER_ONBOARDING = process.env.AZURE_ONBOARDING_DOCS_CONTAINER || 'onboarding-documents';
/**
 * Parse the container name from an Azure Blob Storage URL.
 *
 * URL format:
 *   https://<account>.blob.core.windows.net/<container>/<blobPath...>
 *
 * Returns the container name string, or null if parsing fails.
 */
const parseContainerFromUrl = (url) => {
    try {
        const { pathname } = new URL(url);
        // pathname = "/<container>/<blobPath>" → split gives ['', container, ...blobParts]
        const parts = pathname.split('/').filter(Boolean);
        return parts[0] ?? null;
    }
    catch {
        return null;
    }
};
/**
 * Get the correct Azure ContainerClient for a given parsed file metadata object.
 *
 * Resolution order:
 *   1. fileMetadata.containerName   (explicit — set by new uploads)
 *   2. parse from fileMetadata.url  (covers all existing onboarding docs)
 *   3. CONTAINER_APPLICANT          (safe default)
 */
const getContainerForDoc = (fileMetadata) => {
    // 1. Explicit container name (future uploads will include this)
    if (fileMetadata.containerName) {
        return _blobServiceClient.getContainerClient(fileMetadata.containerName);
    }
    // 2. Parse from stored URL — handles all existing onboarding docs
    if (fileMetadata.url) {
        const parsed = parseContainerFromUrl(fileMetadata.url);
        if (parsed) {
            return _blobServiceClient.getContainerClient(parsed);
        }
    }
    // 3. Default fallback
    console.warn('[getContainerForDoc] Could not determine container from metadata — using default');
    return _blobServiceClient.getContainerClient(CONTAINER_APPLICANT);
};
// ─── Base CRUD ────────────────────────────────────────────────────────────────
const baseCrudMethods = (0, crudFactory_1.createCrudController)({
    model: prisma_config_1.default.assignment,
    modelName: 'Assignment',
    idField: 'assignment_id',
    createSchema: schemas_1.createAssignmentSchema,
    updateSchema: schemas_1.updateAssignmentSchema,
    defaultLimit: 10,
    maxLimit: 100,
});
// ─── LIST_INCLUDE ─────────────────────────────────────────────────────────────
const LIST_INCLUDE = {
    application: {
        select: {
            application_id: true,
            status: true,
            job: {
                select: {
                    job_id: true,
                    job_title: true,
                    location: true,
                    job_rates: { take: 1 },
                    organization: {
                        select: { organization_id: true, name: true },
                    },
                },
            },
            applicant: {
                select: {
                    applicant_id: true,
                    full_name: true,
                    contact: { select: { email: true, phone: true } },
                },
            },
        },
    },
    _count: { select: { time_entries: true, payrolls: true } },
};
// ─── WHERE CLAUSE BUILDER ─────────────────────────────────────────────────────
const buildWhereClause = (query) => {
    const where = {};
    const now = new Date();
    if (query.employment_type && query.employment_type !== 'all') {
        where.employment_type = query.employment_type.toUpperCase();
    }
    if (query.status) {
        switch (query.status) {
            case 'active':
                where.OR = [{ end_date: null }, { end_date: { gte: now } }];
                break;
            case 'ended':
                where.end_date = { lt: now };
                break;
            case 'ending_soon': {
                const thirtyDaysFromNow = new Date(now);
                thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
                where.end_date = { gte: now, lte: thirtyDaysFromNow };
                break;
            }
        }
    }
    if (query.search) {
        const term = query.search.trim();
        const searchConditions = [
            { assignment_id: { contains: term, mode: 'insensitive' } },
            { application_id: { contains: term, mode: 'insensitive' } },
            { application: { applicant: { full_name: { contains: term, mode: 'insensitive' } } } },
            { application: { job: { job_title: { contains: term, mode: 'insensitive' } } } },
            { application: { job: { organization: { name: { contains: term, mode: 'insensitive' } } } } },
        ];
        if (where.OR) {
            where.AND = [{ OR: where.OR }, { OR: searchConditions }];
            delete where.OR;
        }
        else {
            where.OR = searchConditions;
        }
    }
    return where;
};
// ─────────────────────────────────────────────────────────────────────────────
// GET /api/assignments
// ─────────────────────────────────────────────────────────────────────────────
const getAssignments = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
        const skip = (page - 1) * limit;
        const where = buildWhereClause(req.query);
        const [assignments, total] = await Promise.all([
            prisma_config_1.default.assignment.findMany({
                where, skip, take: limit,
                orderBy: { created_at: 'desc' },
                include: LIST_INCLUDE,
            }),
            prisma_config_1.default.assignment.count({ where }),
        ]);
        return (0, response_1.sendSuccess)(res, {
            data: assignments,
            paging: { total, page, limit, totalPages: Math.ceil(total / limit) },
        });
    }
    catch (err) {
        console.error('Error fetching assignments:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch assignments', 500);
    }
};
// ─────────────────────────────────────────────────────────────────────────────
// GET /api/assignments/stats
// ─────────────────────────────────────────────────────────────────────────────
const getAssignmentStats = async (req, res) => {
    try {
        const now = new Date();
        const thirtyDaysFromNow = new Date(now);
        thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
        const [total, active, completed, endingSoon, byEmploymentType] = await Promise.all([
            prisma_config_1.default.assignment.count(),
            prisma_config_1.default.assignment.count({ where: { OR: [{ end_date: null }, { end_date: { gte: now } }] } }),
            prisma_config_1.default.assignment.count({ where: { end_date: { lt: now } } }),
            prisma_config_1.default.assignment.count({ where: { end_date: { gte: now, lte: thirtyDaysFromNow } } }),
            prisma_config_1.default.assignment.groupBy({ by: ['employment_type'], _count: { assignment_id: true } }),
        ]);
        return (0, response_1.sendSuccess)(res, {
            total, active, completed,
            ending_soon: endingSoon,
            by_employment_type: byEmploymentType.map(s => ({
                employment_type: s.employment_type,
                count: s._count.assignment_id,
            })),
        });
    }
    catch (err) {
        console.error('Error fetching assignment stats:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch assignment statistics', 500);
    }
};
// ─────────────────────────────────────────────────────────────────────────────
// GET /api/assignments/:id  (full detail)
// ─────────────────────────────────────────────────────────────────────────────
const getAssignmentById = async (req, res) => {
    try {
        const { id } = req.params;
        if (!id)
            return (0, response_1.sendError)(res, 'Assignment ID is required', 400);
        const assignment = await prisma_config_1.default.assignment.findUnique({
            where: { assignment_id: id },
            include: {
                ...LIST_INCLUDE,
                application: {
                    include: {
                        job: {
                            include: {
                                organization: {
                                    select: { organization_id: true, name: true, website: true, phone: true },
                                },
                                job_detail: true,
                                job_rates: true,
                            },
                        },
                        applicant: {
                            include: { contact: true, demographic: true, work_history: true },
                        },
                    },
                },
                time_entries: { orderBy: { work_date: 'desc' }, take: 10 },
                payrolls: { orderBy: { processed_at: 'desc' }, take: 5 },
            },
        });
        if (!assignment)
            return (0, response_1.sendError)(res, 'Assignment not found', 404);
        return (0, response_1.sendSuccess)(res, assignment);
    }
    catch (err) {
        console.error('Error fetching assignment:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch assignment', 500);
    }
};
// ─────────────────────────────────────────────────────────────────────────────
// GET /api/assignments/application/:applicationId
// ─────────────────────────────────────────────────────────────────────────────
const getAssignmentByApplication = async (req, res) => {
    try {
        const { applicationId } = req.params;
        if (!applicationId)
            return (0, response_1.sendError)(res, 'Application ID is required', 400);
        const assignment = await prisma_config_1.default.assignment.findUnique({
            where: { application_id: applicationId },
            include: {
                application: {
                    select: {
                        application_id: true,
                        status: true,
                        job: {
                            select: {
                                job_id: true, job_title: true, location: true,
                                organization: { select: { name: true } },
                            },
                        },
                        applicant: {
                            select: {
                                applicant_id: true, full_name: true,
                                contact: { select: { email: true, phone: true } },
                            },
                        },
                    },
                },
                _count: { select: { time_entries: true, payrolls: true } },
            },
        });
        if (!assignment)
            return (0, response_1.sendError)(res, 'Assignment not found for this application', 404);
        return (0, response_1.sendSuccess)(res, assignment);
    }
    catch (err) {
        console.error('Error fetching assignment by application:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch assignment', 500);
    }
};
// ─────────────────────────────────────────────────────────────────────────────
// POST /api/assignments
// ─────────────────────────────────────────────────────────────────────────────
const createAssignment = async (req, res) => {
    try {
        const validation = schemas_1.createAssignmentSchema.safeParse(req.body);
        if (!validation.success) {
            return (0, response_1.sendError)(res, 'Validation failed', 400, validation.error.issues.map((e) => ({ field: e.path.join('.'), message: e.message })));
        }
        const { application_id, start_date, end_date } = req.body;
        if (end_date && new Date(end_date) <= new Date(start_date)) {
            return (0, response_1.sendError)(res, 'End date must be after start date', 400);
        }
        const [application, existingAssignment] = await Promise.all([
            prisma_config_1.default.application.findUnique({ where: { application_id } }),
            prisma_config_1.default.assignment.findUnique({ where: { application_id } }),
        ]);
        if (!application)
            return (0, response_1.sendError)(res, 'Application not found', 404);
        if (application.status !== 'HIRED') {
            return (0, response_1.sendError)(res, 'Assignment can only be created for HIRED applications', 400, [{
                    field: 'application_status',
                    message: `Application status is ${application.status}. Only HIRED applications can have assignments.`,
                }]);
        }
        if (existingAssignment) {
            return (0, response_1.sendError)(res, 'Assignment already exists for this application', 409, [{
                    field: 'duplicate',
                    message: `Assignment already exists with assignment_id: ${existingAssignment.assignment_id}`,
                }]);
        }
        const assignment = await prisma_config_1.default.assignment.create({ data: req.body, include: LIST_INCLUDE });
        return (0, response_1.sendSuccess)(res, assignment, 201);
    }
    catch (err) {
        console.error('Error creating assignment:', err);
        if (err.code === 'P2002')
            return (0, response_1.sendError)(res, 'Assignment already exists for this application', 409);
        if (err.code === 'P2003')
            return (0, response_1.sendError)(res, 'Related application not found', 404);
        return (0, response_1.sendError)(res, 'Failed to create assignment', 500);
    }
};
// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/assignments/:id
// ─────────────────────────────────────────────────────────────────────────────
const updateAssignment = async (req, res) => {
    try {
        const { id } = req.params;
        if (!id)
            return (0, response_1.sendError)(res, 'Assignment ID is required', 400);
        const validation = schemas_1.updateAssignmentSchema.safeParse(req.body);
        if (!validation.success) {
            return (0, response_1.sendError)(res, 'Validation failed', 400, validation.error.issues.map((e) => ({ field: e.path.join('.'), message: e.message })));
        }
        const existingAssignment = await prisma_config_1.default.assignment.findUnique({ where: { assignment_id: id } });
        if (!existingAssignment)
            return (0, response_1.sendError)(res, 'Assignment not found', 404);
        if (req.body.end_date) {
            const startDate = req.body.start_date ? new Date(req.body.start_date) : existingAssignment.start_date;
            if (new Date(req.body.end_date) <= startDate) {
                return (0, response_1.sendError)(res, 'End date must be after start date', 400);
            }
        }
        const assignment = await prisma_config_1.default.assignment.update({
            where: { assignment_id: id }, data: req.body, include: LIST_INCLUDE,
        });
        return (0, response_1.sendSuccess)(res, assignment);
    }
    catch (err) {
        console.error('Error updating assignment:', err);
        if (err.code === 'P2025')
            return (0, response_1.sendError)(res, 'Assignment not found', 404);
        return (0, response_1.sendError)(res, 'Failed to update assignment', 500);
    }
};
// ─────────────────────────────────────────────────────────────────────────────
// GET /api/assignments/active
// ─────────────────────────────────────────────────────────────────────────────
const getActiveAssignments = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
        const skip = (page - 1) * limit;
        const now = new Date();
        const where = { OR: [{ end_date: null }, { end_date: { gte: now } }] };
        const [assignments, total] = await Promise.all([
            prisma_config_1.default.assignment.findMany({ where, skip, take: limit, orderBy: { created_at: 'desc' }, include: LIST_INCLUDE }),
            prisma_config_1.default.assignment.count({ where }),
        ]);
        return (0, response_1.sendSuccess)(res, { data: assignments, paging: { total, page, limit, totalPages: Math.ceil(total / limit) } });
    }
    catch (err) {
        return (0, response_1.sendError)(res, 'Failed to fetch active assignments', 500);
    }
};
// ─────────────────────────────────────────────────────────────────────────────
// GET /api/assignments/completed
// ─────────────────────────────────────────────────────────────────────────────
const getCompletedAssignments = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
        const skip = (page - 1) * limit;
        const now = new Date();
        const where = { end_date: { lt: now } };
        const [assignments, total] = await Promise.all([
            prisma_config_1.default.assignment.findMany({ where, skip, take: limit, orderBy: { created_at: 'desc' }, include: LIST_INCLUDE }),
            prisma_config_1.default.assignment.count({ where }),
        ]);
        return (0, response_1.sendSuccess)(res, { data: assignments, paging: { total, page, limit, totalPages: Math.ceil(total / limit) } });
    }
    catch (err) {
        return (0, response_1.sendError)(res, 'Failed to fetch completed assignments', 500);
    }
};
// ─────────────────────────────────────────────────────────────────────────────
// GET /api/assignments/employment-type/:type
// ─────────────────────────────────────────────────────────────────────────────
const getAssignmentsByEmploymentType = async (req, res) => {
    try {
        const { type } = req.params;
        const validTypes = ['W2', 'CONTRACTOR_1099'];
        if (!validTypes.includes(type?.toUpperCase())) {
            return (0, response_1.sendError)(res, `Invalid employment type. Must be one of: ${validTypes.join(', ')}`, 400);
        }
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
        const skip = (page - 1) * limit;
        const where = { employment_type: type.toUpperCase() };
        const [assignments, total] = await Promise.all([
            prisma_config_1.default.assignment.findMany({ where, skip, take: limit, orderBy: { created_at: 'desc' }, include: LIST_INCLUDE }),
            prisma_config_1.default.assignment.count({ where }),
        ]);
        return (0, response_1.sendSuccess)(res, { data: assignments, paging: { total, page, limit, totalPages: Math.ceil(total / limit) } });
    }
    catch (err) {
        return (0, response_1.sendError)(res, 'Failed to fetch assignments', 500);
    }
};
// ─────────────────────────────────────────────────────────────────────────────
// GET /api/assignments/:assignmentId/details
// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// GET /api/assignments/:assignmentId/details
// Now also returns the full payroll/onboarding snapshot (tax info, bank
// accounts, benefit deductions, garnishments, workers comp / company codes)
// so this endpoint can prefill the "update onboarding info" form — mirrors
// every field updateOnboardingInfo (PATCH) is capable of writing.
// ─────────────────────────────────────────────────────────────────────────────
const getAssignmentDetails = async (req, res) => {
    try {
        const { assignmentId } = req.params;
        const assignment = await prisma_config_1.default.assignment.findUnique({
            where: { assignment_id: assignmentId },
            include: {
                application: {
                    include: {
                        applicant: {
                            include: {
                                contact: true,
                                demographic: true,
                                documents: { orderBy: { created_at: 'desc' } },
                                // ADDED: needed to populate the onboarding/payroll edit form
                                bank_accounts: true,
                                benefit_deductions: true,
                                garnishments: true,
                            },
                        },
                        job: {
                            include: {
                                organization: {
                                    select: {
                                        organization_id: true,
                                        name: true,
                                        website: true,
                                        contacts: {
                                            where: { contact_type: 'PRIMARY' },
                                            select: { name: true, email: true, phone: true },
                                            take: 1,
                                        },
                                    },
                                },
                                job_rates: {
                                    select: { bill_rate: true, pay_rate: true, ot_bill_rate: true, ot_pay_rate: true },
                                    take: 1,
                                },
                            },
                        },
                    },
                },
            },
        });
        if (!assignment)
            return (0, response_1.sendError)(res, 'Assignment not found', 404);
        const applicationId = assignment.application_id;
        const applicant = assignment.application.applicant;
        const allDocs = applicant.documents ?? [];
        const isOnboardingDoc = (doc) => {
            const raw = doc?.file_url;
            if (!raw)
                return false;
            let fileInfo = {};
            try {
                fileInfo = typeof raw === 'string' ? JSON.parse(raw) : raw;
            }
            catch {
                fileInfo = {};
            }
            const containerName = typeof fileInfo?.containerName === 'string' ? fileInfo.containerName : null;
            let urlContainer = null;
            if (typeof fileInfo?.url === 'string') {
                urlContainer = parseContainerFromUrl(fileInfo.url);
            }
            return containerName === CONTAINER_ONBOARDING || urlContainer === CONTAINER_ONBOARDING;
        };
        // Return only onboarding docs for this assignment's application.
        const docsToUse = allDocs.filter((d) => d.application_id === applicationId && isOnboardingDoc(d));
        const documents = docsToUse.map((doc) => {
            const documentId = doc.applicant_document_id; // correct PK field per schema
            let fileInfo = {};
            try {
                fileInfo = typeof doc.file_url === 'string'
                    ? JSON.parse(doc.file_url)
                    : (doc.file_url ?? {});
            }
            catch {
                fileInfo = { url: doc.file_url };
            }
            return {
                document_id: documentId,
                document_type: doc.document_type,
                document_name: fileInfo.originalFileName
                    ?? doc.document_type?.replace(/_/g, ' ')
                    ?? 'Document',
                view_url: documentId
                    ? `/assignments/${assignmentId}/documents/${documentId}/view`
                    : null,
                download_url: documentId
                    ? `/assignments/${assignmentId}/documents/${documentId}/download`
                    : null,
                file_url: fileInfo.url ?? null,
                mime_type: fileInfo.mimeType ?? null,
                size: fileInfo.size ?? null,
                send_to_candidate: fileInfo.sendToCandidate ?? false,
                created_at: doc.created_at,
                application_scoped: doc.application_id === applicationId,
            };
        });
        const parseJson = (v) => {
            try {
                if (Array.isArray(v))
                    return v;
                if (typeof v === 'string')
                    return JSON.parse(v);
                return [];
            }
            catch {
                return [];
            }
        };
        const parseObj = (v) => {
            try {
                if (v && typeof v === 'object')
                    return v;
                if (typeof v === 'string')
                    return JSON.parse(v);
                return {};
            }
            catch {
                return {};
            }
        };
        // ── Build the payroll/onboarding snapshot ──
        // Mirrors every field updateOnboardingInfo (PATCH) can write, so the
        // edit form can be prefilled directly from this response.
        const demographic = applicant.demographic;
        const taxInfo = parseObj(demographic?.tax_info);
        const localTaxInfo = parseObj(demographic?.local_tax_info);
        const payrollInfo = {
            // Tax / withholding — from ApplicantDemographic.tax_info
            filing_status: taxInfo.filing_status ?? null,
            additional_withholding: taxInfo.additional_withholding ?? null,
            exempt_from_federal: taxInfo.exempt_from_federal ?? false,
            exempt_from_state: taxInfo.exempt_from_state ?? false,
            work_state: taxInfo.work_state ?? null,
            resident_state: taxInfo.resident_state ?? null,
            // Local tax — from ApplicantDemographic.local_tax_info
            local_tax_jurisdiction: localTaxInfo.jurisdiction ?? null,
            local_tax_rate: localTaxInfo.local_tax_rate ?? null,
            exempt_from_local: localTaxInfo.exempt_from_local ?? false,
            // SSN: never return the plaintext/decrypted value from a details GET.
            // Expose only whether one is on file. If the edit form truly needs a
            // masked last-4, wire in a decryptSSN() + mask helper here instead.
            ssn_on_file: !!demographic?.ssn_encrypted,
            employee_number: demographic?.employee_number ?? null,
            flsa_status: demographic?.flsa_status ?? null,
            // Assignment-level payroll fields
            start_date: assignment.start_date,
            end_date: assignment.end_date,
            employment_type: assignment.employment_type,
            payroll_frequency: assignment.payroll_frequency ?? null,
            workers_comp_code: assignment.workers_comp_code ?? null,
            workers_comp_codes: parseJson(assignment.workers_comp_codes),
            company_codes: parseJson(assignment.company_codes),
            // Full-replace collections
            bank_accounts: (applicant.bank_accounts ?? []).map((b) => ({
                bank_account_id: b.bank_account_id,
                bank_name: b.bank_name,
                account_type: b.account_type,
                // Mask account/routing numbers the same way SSN is handled — full
                // numbers shouldn't round-trip through a details GET response.
                routing_number: b.routing_number,
                account_number: b.account_number ? `••••${String(b.account_number).slice(-4)}` : null,
                amount: b.amount,
                amount_type: b.amount_type,
                is_active: b.is_active,
            })),
            benefit_deductions: (applicant.benefit_deductions ?? []).map((d) => ({
                benefit_deduction_id: d.benefit_deduction_id,
                deduction_type: d.deduction_type,
                amount: d.amount,
                percentage: d.percentage,
                is_active: d.is_active,
                effective_date: d.effective_date,
                end_date: d.end_date,
                notes: d.notes,
            })),
            garnishments: (applicant.garnishments ?? []).map((g) => ({
                garnishment_id: g.garnishment_id,
                garnishment_type: g.garnishment_type,
                case_number: g.case_number,
                priority_order: g.priority_order,
                amount: g.amount,
                percentage: g.percentage,
                max_amount: g.max_amount,
                is_active: g.is_active,
                start_date: g.start_date,
                end_date: g.end_date,
                notes: g.notes,
            })),
        };
        return (0, response_1.sendSuccess)(res, {
            assignment: {
                assignment_id: assignment.assignment_id,
                application_id: assignment.application_id,
                start_date: assignment.start_date,
                end_date: assignment.end_date,
                employment_type: assignment.employment_type,
                payroll_frequency: assignment.payroll_frequency ?? null,
                workers_comp_code: assignment.workers_comp_code ?? null,
                workers_comp_codes: parseJson(assignment.workers_comp_codes),
                company_codes: parseJson(assignment.company_codes),
                created_at: assignment.created_at,
            },
            applicant: {
                applicant_id: applicant.applicant_id,
                full_name: applicant.full_name,
                status: applicant.status,
                contact: applicant.contact,
            },
            job: {
                job_id: assignment.application.job.job_id,
                job_title: assignment.application.job.job_title,
                location: assignment.application.job.location ?? null,
                organization: assignment.application.job.organization,
                rates: assignment.application.job.job_rates?.[0] ?? null,
            },
            // ADDED: full onboarding/payroll snapshot for the edit form
            payroll_info: payrollInfo,
            documents,
        });
    }
    catch (err) {
        console.error('Error fetching assignment details:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch assignment details', 500);
    }
};
// ─────────────────────────────────────────────────────────────────────────────
// SHARED DOCUMENT STREAMING HELPER
//
// Handles documents across BOTH containers by deriving the correct
// container from the stored JSON metadata (containerName field, then
// parsed from the blob URL, then default fallback).
// ─────────────────────────────────────────────────────────────────────────────
const streamDocument = async (req, res, forceDownload) => {
    try {
        const { assignmentId, documentId } = req.params;
        // 1. Resolve applicant_id (cross-tenant guard)
        const assignment = await prisma_config_1.default.assignment.findUnique({
            where: { assignment_id: assignmentId },
            select: { application: { select: { applicant_id: true } } },
        });
        if (!assignment) {
            console.error(`[streamDocument] Assignment not found: ${assignmentId}`);
            return (0, response_1.sendError)(res, 'Assignment not found', 404);
        }
        const applicantId = assignment.application.applicant_id;
        // 2. Fetch the document row — scoped to this applicant
        //    Schema PK: applicant_document_id  (NOT document_id)
        const doc = await prisma_config_1.default.applicantDocument.findFirst({
            where: {
                applicant_document_id: documentId, // correct PK field
                applicant_id: applicantId, // cross-tenant guard
            },
        });
        if (!doc) {
            console.error(`[streamDocument] Not found — applicant_document_id=${documentId} applicant_id=${applicantId}`);
            return (0, response_1.sendError)(res, 'Document not found', 404);
        }
        if (!doc.file_url) {
            return (0, response_1.sendError)(res, 'Document has no file attached', 404);
        }
        // 3. Parse the JSON metadata stored in file_url
        //
        //    Onboarding uploads store:
        //      { originalFileName, mimeType, blobName, size, url, sendToCandidate }
        //
        //    The `url` field is the full Azure blob URL which contains the container
        //    name — we use this to route to the correct container automatically.
        let fileMetadata = {};
        try {
            fileMetadata = typeof doc.file_url === 'string'
                ? JSON.parse(doc.file_url)
                : doc.file_url;
        }
        catch {
            // Legacy plain URL stored directly in file_url (not JSON)
            fileMetadata = { url: doc.file_url };
        }
        // 4a. No blobName → legacy plain URL or unrecognised format → redirect
        if (!fileMetadata.blobName) {
            if (fileMetadata.url) {
                console.log(`[streamDocument] Legacy plain-URL redirect for doc ${documentId}`);
                return res.redirect(302, fileMetadata.url);
            }
            console.error(`[streamDocument] No blobName or url for doc ${documentId}`);
            return (0, response_1.sendError)(res, 'Document file reference not found', 404);
        }
        // 4b. Derive the correct container — the KEY fix for onboarding docs
        //     which live in "onboarding-documents", not "applicant-documents"
        const containerClient = getContainerForDoc(fileMetadata);
        const blockBlobClient = containerClient.getBlockBlobClient(fileMetadata.blobName);
        console.log(`[streamDocument] doc=${documentId} container=${containerClient.containerName} blob=${fileMetadata.blobName}`);
        const exists = await blockBlobClient.exists();
        if (!exists) {
            console.error(`[streamDocument] Blob missing — container=${containerClient.containerName} blob=${fileMetadata.blobName}`);
            return (0, response_1.sendError)(res, 'Document file not found in storage', 404);
        }
        const downloadResponse = await blockBlobClient.download(0);
        if (!downloadResponse.readableStreamBody) {
            return (0, response_1.sendError)(res, 'Failed to read document from storage', 500);
        }
        const mimeType = fileMetadata.mimeType || 'application/octet-stream';
        const fileName = fileMetadata.originalFileName || doc.document_type || 'document';
        const disposition = forceDownload
            ? `attachment; filename="${fileName}"`
            : (mimeType.startsWith('image/') || mimeType === 'application/pdf'
                ? 'inline'
                : `attachment; filename="${fileName}"`);
        res.setHeader('Content-Type', mimeType);
        res.setHeader('Content-Disposition', disposition);
        res.setHeader('Cache-Control', 'private, max-age=3600');
        if (downloadResponse.contentLength) {
            res.setHeader('Content-Length', String(downloadResponse.contentLength));
        }
        downloadResponse.readableStreamBody.pipe(res);
    }
    catch (err) {
        console.error('[streamDocument] Unexpected error:', err);
        return (0, response_1.sendError)(res, 'Failed to stream document', 500);
    }
};
// ─────────────────────────────────────────────────────────────────────────────
// GET /api/assignments/:assignmentId/documents/:documentId/view
// ─────────────────────────────────────────────────────────────────────────────
const viewAssignmentDocument = (req, res) => streamDocument(req, res, false);
exports.viewAssignmentDocument = viewAssignmentDocument;
// ─────────────────────────────────────────────────────────────────────────────
// GET /api/assignments/:assignmentId/documents/:documentId/download
// ─────────────────────────────────────────────────────────────────────────────
const downloadAssignmentDocument = (req, res) => streamDocument(req, res, true);
exports.downloadAssignmentDocument = downloadAssignmentDocument;
// ══════════════════════════════════════════════════════════════════════════
// PATCH /assignments/:assignmentId/update
// Edits payroll/onboarding data captured in onboardCandidate.
// Only fields present in the request are updated (partial update).
// Array collections (bank accounts, benefit deductions, garnishments) use
// a full-replace strategy when their key is present in the body.
// payroll_frequency lives on Assignment (per-placement).
// ══════════════════════════════════════════════════════════════════════════
const updateOnboardingInfo = async (req, res) => {
    try {
        const { assignmentId } = req.params;
        // Route only gives us assignmentId — resolve the applicant through it
        const assignment = await prisma_config_1.default.assignment.findUnique({
            where: { assignment_id: assignmentId },
            include: { application: { include: { applicant: { include: { demographic: true } } } } },
        });
        if (!assignment)
            return (0, response_1.sendError)(res, 'Assignment not found', 404);
        const applicantId = assignment.application.applicant_id;
        const applicant = assignment.application.applicant;
        if (!applicant)
            return (0, response_1.sendError)(res, 'Applicant not found', 404);
        const { ssn, employee_number, filing_status, additional_withholding, exempt_from_federal, exempt_from_state, work_state, resident_state, local_tax_jurisdiction, local_tax_rate, exempt_from_local, flsa_status, start_date, end_date, employment_type, payroll_frequency, } = req.body;
        const hasBankAccounts = 'bank_accounts' in req.body;
        const hasBenefitDeductions = 'benefit_deductions' in req.body;
        const hasGarnishments = 'garnishments' in req.body;
        const hasWorkersCompCodes = 'workers_comp_codes' in req.body;
        const hasCompanyCodes = 'company_codes' in req.body;
        let bankAccounts = [];
        if (hasBankAccounts) {
            try {
                bankAccounts = JSON.parse(req.body.bank_accounts || '[]');
            }
            catch {
                return (0, response_1.sendError)(res, 'Invalid bank_accounts format — expected JSON array', 400);
            }
            for (const b of bankAccounts) {
                if (!b.bank_name?.trim() || !b.routing_number || !b.account_number)
                    return (0, response_1.sendError)(res, 'Each bank account requires bank_name, routing_number, and account_number', 400);
                if (!/^\d{9}$/.test(b.routing_number))
                    return (0, response_1.sendError)(res, 'Each routing_number must be exactly 9 digits', 400);
                if (b.account_type && !['CHECKING', 'SAVINGS'].includes(b.account_type))
                    return (0, response_1.sendError)(res, 'account_type must be CHECKING or SAVINGS', 400);
                if (b.amount_type && !['FIXED', 'REMAINING'].includes(b.amount_type))
                    return (0, response_1.sendError)(res, 'amount_type must be FIXED or REMAINING', 400);
            }
            const remainingCount = bankAccounts.filter(b => (b.amount_type || 'REMAINING') === 'REMAINING').length;
            if (remainingCount > 1)
                return (0, response_1.sendError)(res, 'Only one bank account can be set to amount_type REMAINING', 400);
        }
        let benefitDeductions = [];
        if (hasBenefitDeductions) {
            try {
                benefitDeductions = JSON.parse(req.body.benefit_deductions || '[]');
            }
            catch {
                return (0, response_1.sendError)(res, 'Invalid benefit_deductions format — expected JSON array', 400);
            }
            if (benefitDeductions.some(d => !d.deduction_type?.trim()))
                return (0, response_1.sendError)(res, 'Each benefit deduction requires a deduction_type', 400);
        }
        let garnishments = [];
        if (hasGarnishments) {
            try {
                garnishments = JSON.parse(req.body.garnishments || '[]');
            }
            catch {
                return (0, response_1.sendError)(res, 'Invalid garnishments format — expected JSON array', 400);
            }
            if (garnishments.some(g => !g.garnishment_type?.trim()))
                return (0, response_1.sendError)(res, 'Each garnishment requires a garnishment_type', 400);
        }
        let workersCompCodes = [];
        if (hasWorkersCompCodes) {
            try {
                workersCompCodes = JSON.parse(req.body.workers_comp_codes || '[]');
            }
            catch {
                return (0, response_1.sendError)(res, 'Invalid workers_comp_codes format — expected JSON array', 400);
            }
            if (!workersCompCodes.length)
                return (0, response_1.sendError)(res, 'At least one workers\' comp code is required', 400);
            if (workersCompCodes.some(w => !w.code?.trim() || typeof w.pct !== 'number' || w.pct <= 0))
                return (0, response_1.sendError)(res, 'All workers\' comp entries must have a code and a valid pct > 0', 400);
            const totalWcPct = workersCompCodes.reduce((s, w) => s + w.pct, 0);
            if (Math.round(totalWcPct) !== 100)
                return (0, response_1.sendError)(res, `Workers' comp pct must total 100% (got ${totalWcPct}%)`, 400);
        }
        let companyCodes = [];
        if (hasCompanyCodes) {
            try {
                companyCodes = JSON.parse(req.body.company_codes || '[]');
            }
            catch {
                return (0, response_1.sendError)(res, 'Invalid company_codes format — expected JSON array', 400);
            }
            if (!companyCodes.length)
                return (0, response_1.sendError)(res, 'At least one company code is required', 400);
            const totalAllocation = companyCodes.reduce((s, c) => s + (c.allocation_pct || 0), 0);
            if (Math.round(totalAllocation) !== 100)
                return (0, response_1.sendError)(res, `Company code allocations must total 100% (got ${totalAllocation}%)`, 400);
        }
        if (ssn !== undefined && ssn !== '' && !/^\d{9}$/.test(ssn))
            return (0, response_1.sendError)(res, 'SSN must be exactly 9 digits', 400);
        if (flsa_status && !['EXEMPT', 'NON_EXEMPT'].includes(flsa_status))
            return (0, response_1.sendError)(res, 'flsa_status must be EXEMPT or NON_EXEMPT', 400);
        if (payroll_frequency && !['WEEKLY', 'BI_WEEKLY', 'SEMI_MONTHLY', 'MONTHLY'].includes(payroll_frequency))
            return (0, response_1.sendError)(res, 'payroll_frequency must be WEEKLY, BI_WEEKLY, SEMI_MONTHLY, or MONTHLY', 400);
        if (employment_type && !['W2', 'CONTRACTOR_1099'].includes(employment_type))
            return (0, response_1.sendError)(res, 'employment_type must be W2 or CONTRACTOR_1099', 400);
        let parsedStartDate;
        if (start_date !== undefined) {
            parsedStartDate = new Date(start_date);
            if (isNaN(parsedStartDate.getTime()))
                return (0, response_1.sendError)(res, 'Invalid start_date', 400);
        }
        if (end_date !== undefined && end_date !== null && end_date !== '') {
            const parsedEnd = new Date(end_date);
            if (isNaN(parsedEnd.getTime()))
                return (0, response_1.sendError)(res, 'Invalid end_date', 400);
            if (parsedStartDate && parsedEnd <= parsedStartDate)
                return (0, response_1.sendError)(res, 'end_date must be after start_date', 400);
        }
        // FIX: applicant.demographic, not applicant.applicantDemographic
        const existingTaxInfo = applicant.demographic?.tax_info || {};
        const existingLocalTaxInfo = applicant.demographic?.local_tax_info || {};
        const taxInfoPayload = {
            ...existingTaxInfo,
            ...(filing_status !== undefined && { filing_status }),
            ...(additional_withholding !== undefined && { additional_withholding: parseFloat(additional_withholding || '0') }),
            ...(exempt_from_federal !== undefined && { exempt_from_federal: exempt_from_federal === 'true' || exempt_from_federal === true }),
            ...(exempt_from_state !== undefined && { exempt_from_state: exempt_from_state === 'true' || exempt_from_state === true }),
            ...(work_state !== undefined && { work_state }),
            ...(resident_state !== undefined && { resident_state: resident_state || work_state }),
        };
        const localTaxInfoPayload = (local_tax_jurisdiction !== undefined || local_tax_rate !== undefined || exempt_from_local !== undefined)
            ? {
                ...existingLocalTaxInfo,
                ...(local_tax_jurisdiction !== undefined && { jurisdiction: local_tax_jurisdiction || null }),
                ...(local_tax_rate !== undefined && { local_tax_rate: local_tax_rate ? parseFloat(local_tax_rate) : null }),
                ...(exempt_from_local !== undefined && { exempt_from_local: exempt_from_local === 'true' || exempt_from_local === true }),
            }
            : undefined;
        // ── 7. Encrypt SSN ─────────────────────────────────────────────────────────
        const encryptedSSN = (0, pipelineController_1.encryptSSN)(ssn);
        await prisma_config_1.default.$transaction(async (tx) => {
            // 1. Demographic / tax patch — model accessor `applicantDemographic` is correct here
            await tx.applicantDemographic.upsert({
                where: { applicant_id: applicantId },
                update: {
                    ...(encryptedSSN !== undefined && { ssn_encrypted: encryptedSSN }),
                    tax_info: taxInfoPayload,
                    ...(localTaxInfoPayload !== undefined && { local_tax_info: localTaxInfoPayload }),
                    ...(employee_number !== undefined && { employee_number }),
                    ...(flsa_status !== undefined && { flsa_status }),
                },
                create: {
                    applicant_id: applicantId,
                    ssn_encrypted: encryptedSSN || '',
                    tax_info: taxInfoPayload,
                    local_tax_info: localTaxInfoPayload,
                    employee_number: employee_number || null,
                    flsa_status: flsa_status || null,
                },
            });
            // 2. Assignment patch — payroll_frequency lives here
            const assignmentUpdates = {};
            if (parsedStartDate)
                assignmentUpdates.start_date = parsedStartDate;
            if (end_date !== undefined)
                assignmentUpdates.end_date = end_date ? new Date(end_date) : null;
            if (employment_type !== undefined)
                assignmentUpdates.employment_type = employment_type;
            if (payroll_frequency !== undefined)
                assignmentUpdates.payroll_frequency = payroll_frequency || null;
            if (hasWorkersCompCodes) {
                assignmentUpdates.workers_comp_code = workersCompCodes[0]?.code || null;
                assignmentUpdates.workers_comp_codes = workersCompCodes;
            }
            if (hasCompanyCodes)
                assignmentUpdates.company_codes = companyCodes;
            if (Object.keys(assignmentUpdates).length) {
                await tx.assignment.update({
                    where: { assignment_id: assignmentId },
                    data: assignmentUpdates,
                });
            }
            // 3. Bank accounts — full replace when key present
            if (hasBankAccounts) {
                await tx.bankAccount.deleteMany({ where: { applicant_id: applicantId } });
                if (bankAccounts.length) {
                    await tx.bankAccount.createMany({
                        data: bankAccounts.map(b => ({
                            applicant_id: applicantId,
                            bank_name: b.bank_name,
                            account_type: b.account_type || 'CHECKING',
                            routing_number: b.routing_number,
                            account_number: b.account_number,
                            amount: b.amount ?? null,
                            amount_type: b.amount_type || 'REMAINING',
                            is_active: b.is_active ?? true,
                        })),
                    });
                }
            }
            // 4. Benefit deductions — full replace when key present
            if (hasBenefitDeductions) {
                await tx.benefitDeduction.deleteMany({ where: { applicant_id: applicantId } });
                if (benefitDeductions.length) {
                    await tx.benefitDeduction.createMany({
                        data: benefitDeductions.map(d => ({
                            applicant_id: applicantId,
                            deduction_type: d.deduction_type,
                            amount: d.amount ?? null,
                            percentage: d.percentage ?? null,
                            is_active: d.is_active ?? true,
                            effective_date: d.effective_date ? new Date(d.effective_date) : null,
                            end_date: d.end_date ? new Date(d.end_date) : null,
                            notes: d.notes || null,
                        })),
                    });
                }
            }
            // 5. Garnishments — full replace when key present
            if (hasGarnishments) {
                await tx.garnishment.deleteMany({ where: { applicant_id: applicantId } });
                if (garnishments.length) {
                    await tx.garnishment.createMany({
                        data: garnishments.map(g => ({
                            applicant_id: applicantId,
                            garnishment_type: g.garnishment_type,
                            case_number: g.case_number || null,
                            priority_order: g.priority_order ?? 1,
                            amount: g.amount ?? null,
                            percentage: g.percentage ?? null,
                            max_amount: g.max_amount ?? null,
                            is_active: g.is_active ?? true,
                            start_date: g.start_date ? new Date(g.start_date) : null,
                            end_date: g.end_date ? new Date(g.end_date) : null,
                            notes: g.notes || null,
                        })),
                    });
                }
            }
        });
        // ── Fetch fresh state for response ──
        // FIX: relation field names match schema exactly: demographic,
        // bank_accounts, benefit_deductions, garnishments (snake_case, no @map)
        const result = await prisma_config_1.default.applicant.findUnique({
            where: { applicant_id: applicantId },
            include: {
                demographic: true,
                bank_accounts: true,
                benefit_deductions: true,
                garnishments: true,
                applications: {
                    include: { assignment: true },
                },
            },
        });
        return (0, response_1.sendSuccess)(res, result);
    }
    catch (err) {
        console.error('Error updating onboarding info:', err);
        return (0, response_1.sendError)(res, 'Failed to update onboarding info', 500);
    }
};
// ─────────────────────────────────────────────────────────────────────────────
// EXPORT
// ─────────────────────────────────────────────────────────────────────────────
exports.assignmentController = {
    ...baseCrudMethods,
    getAll: getAssignments,
    getById: getAssignmentById,
    create: createAssignment,
    update: updateAssignment,
    getAssignmentByApplication,
    getAssignmentsByEmploymentType,
    getActiveAssignments,
    getCompletedAssignments,
    getAssignmentStats,
    getAssignmentDetails,
    viewAssignmentDocument: exports.viewAssignmentDocument,
    downloadAssignmentDocument: exports.downloadAssignmentDocument,
    updateOnboardingInfo
};
//# sourceMappingURL=assignmentController.js.map