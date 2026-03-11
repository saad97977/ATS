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
        const allDocs = assignment.application.applicant.documents ?? [];
        // Prefer application-scoped docs; fall back to all applicant docs
        const appScopedDocs = allDocs.filter((d) => d.application_id === applicationId);
        const docsToUse = appScopedDocs.length > 0 ? appScopedDocs : allDocs;
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
        return (0, response_1.sendSuccess)(res, {
            assignment: {
                assignment_id: assignment.assignment_id,
                application_id: assignment.application_id,
                start_date: assignment.start_date,
                end_date: assignment.end_date,
                employment_type: assignment.employment_type,
                workers_comp_code: assignment.workers_comp_code ?? null,
                workers_comp_codes: parseJson(assignment.workers_comp_codes),
                company_codes: parseJson(assignment.company_codes),
                created_at: assignment.created_at,
            },
            applicant: {
                applicant_id: assignment.application.applicant.applicant_id,
                full_name: assignment.application.applicant.full_name,
                status: assignment.application.applicant.status,
                contact: assignment.application.applicant.contact,
            },
            job: {
                job_id: assignment.application.job.job_id,
                job_title: assignment.application.job.job_title,
                location: assignment.application.job.location ?? null,
                organization: assignment.application.job.organization,
                rates: assignment.application.job.job_rates?.[0] ?? null,
            },
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
};
//# sourceMappingURL=assignmentController.js.map