"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logApplicantCommunication = exports.deleteCommunicationLog = exports.updateCommunicationLog = exports.getCommunicationById = exports.logNote = exports.logCallRecord = exports.sendManualEmail = exports.getCommunicationStats = exports.listCommunications = void 0;
const zod_1 = require("zod");
const nodemailer_1 = __importDefault(require("nodemailer"));
const prisma_config_1 = __importDefault(require("../../prisma.config"));
const response_1 = require("../../utils/response");
// ─── Validation Schemas ───────────────────────────────────────────────────────
const listQuerySchema = zod_1.z.object({
    page: zod_1.z.coerce.number().int().min(1).default(1),
    limit: zod_1.z.coerce.number().int().min(1).max(100).default(20),
    type: zod_1.z.enum(['EMAIL', 'CALL', 'SMS', 'NOTE']).optional(),
    trigger: zod_1.z.enum(['MANUAL', 'AUTOMATIC']).optional(),
    application_id: zod_1.z.string().uuid().optional(),
});
const sendEmailSchema = zod_1.z.object({
    to_address: zod_1.z.string().email('Valid recipient email required'),
    subject: zod_1.z.string().min(1, 'Subject is required').max(255),
    body: zod_1.z.string().min(1, 'Email body is required'),
    application_id: zod_1.z.string().uuid().optional(),
    notes: zod_1.z.string().optional(),
    metadata: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
});
const logCallSchema = zod_1.z.object({
    direction: zod_1.z.enum(['OUTBOUND', 'INBOUND']).default('OUTBOUND'),
    call_outcome: zod_1.z.enum(['ANSWERED', 'NO_ANSWER', 'VOICEMAIL', 'BUSY']),
    call_duration_minutes: zod_1.z.number().int().min(0).optional(),
    notes: zod_1.z.string().min(1, 'Call notes are required'),
    application_id: zod_1.z.string().uuid().optional(),
    metadata: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
});
const logNoteSchema = zod_1.z.object({
    notes: zod_1.z.string().min(1, 'Note content is required'),
    application_id: zod_1.z.string().uuid().optional(),
    metadata: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
});
const updateLogSchema = zod_1.z.object({
    notes: zod_1.z.string().optional(),
    metadata: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
});
// ─── SMTP transporter (mirrors emailService.ts) ───────────────────────────────
const createTransporter = () => nodemailer_1.default.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: false,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
    },
});
// ─── Shared select for listing ────────────────────────────────────────────────
const COMM_SELECT = {
    communication_id: true,
    communication_type: true,
    direction: true,
    trigger: true,
    subject: true,
    body: true,
    from_address: true,
    to_address: true,
    email_message_id: true,
    call_duration_minutes: true,
    call_outcome: true,
    status: true,
    notes: true,
    application_id: true,
    metadata: true,
    created_at: true,
    updated_at: true,
    sent_by: {
        select: {
            user_id: true,
            name: true,
            email: true,
        },
    },
    application: {
        select: {
            application_id: true,
            status: true,
            job: {
                select: { job_id: true, job_title: true },
            },
        },
    },
};
// ─── Helper: verify applicant exists ─────────────────────────────────────────
async function assertApplicant(applicantId) {
    const applicant = await prisma_config_1.default.applicant.findUnique({
        where: { applicant_id: applicantId },
        select: {
            applicant_id: true,
            full_name: true,
            contact: { select: { email: true } },
        },
    });
    if (!applicant)
        throw { status: 404, message: 'Applicant not found' };
    return applicant;
}
// ─────────────────────────────────────────────────────────────────────────────
// GET /api/applicant-communications/:applicantId
// List all communication logs for an applicant (paginated + filterable)
// ─────────────────────────────────────────────────────────────────────────────
const listCommunications = async (req, res) => {
    try {
        const { applicantId } = req.params;
        const parsed = listQuerySchema.safeParse(req.query);
        if (!parsed.success) {
            return (0, response_1.sendError)(res, 'Invalid query parameters', 400, parsed.error.issues.map((e) => ({ field: e.path.join('.'), message: e.message })));
        }
        const { page, limit, type, trigger, application_id } = parsed.data;
        await assertApplicant(applicantId);
        const where = { applicant_id: applicantId };
        if (type)
            where.communication_type = type;
        if (trigger)
            where.trigger = trigger;
        if (application_id)
            where.application_id = application_id;
        const [total, records] = await Promise.all([
            prisma_config_1.default.applicantCommunication.count({ where }),
            prisma_config_1.default.applicantCommunication.findMany({
                where,
                select: COMM_SELECT,
                orderBy: { created_at: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
            }),
        ]);
        return (0, response_1.sendSuccess)(res, {
            data: records,
            meta: {
                total,
                page,
                limit,
                total_pages: Math.ceil(total / limit),
            },
        });
    }
    catch (err) {
        if (err?.status)
            return (0, response_1.sendError)(res, err.message, err.status);
        console.error('[listCommunications]', err);
        return (0, response_1.sendError)(res, 'Failed to fetch communications', 500);
    }
};
exports.listCommunications = listCommunications;
// ─────────────────────────────────────────────────────────────────────────────
// GET /api/applicant-communications/:applicantId/stats
// Summary counts by type for the applicant profile header
// ─────────────────────────────────────────────────────────────────────────────
const getCommunicationStats = async (req, res) => {
    try {
        const { applicantId } = req.params;
        await assertApplicant(applicantId);
        const [byType, byTrigger, lastComm] = await Promise.all([
            prisma_config_1.default.applicantCommunication.groupBy({
                by: ['communication_type'],
                where: { applicant_id: applicantId },
                _count: true,
            }),
            prisma_config_1.default.applicantCommunication.groupBy({
                by: ['trigger'],
                where: { applicant_id: applicantId },
                _count: true,
            }),
            prisma_config_1.default.applicantCommunication.findFirst({
                where: { applicant_id: applicantId },
                orderBy: { created_at: 'desc' },
                select: { created_at: true, communication_type: true },
            }),
        ]);
        const typeCounts = Object.fromEntries(byType.map(r => [r.communication_type, r._count]));
        const triggerCounts = Object.fromEntries(byTrigger.map(r => [r.trigger, r._count]));
        return (0, response_1.sendSuccess)(res, {
            total: Object.values(typeCounts).reduce((a, b) => a + b, 0),
            by_type: typeCounts,
            by_trigger: triggerCounts,
            last_contact_at: lastComm?.created_at ?? null,
            last_comm_type: lastComm?.communication_type ?? null,
        });
    }
    catch (err) {
        if (err?.status)
            return (0, response_1.sendError)(res, err.message, err.status);
        console.error('[getCommunicationStats]', err);
        return (0, response_1.sendError)(res, 'Failed to fetch communication stats', 500);
    }
};
exports.getCommunicationStats = getCommunicationStats;
// ─────────────────────────────────────────────────────────────────────────────
// POST /api/applicant-communications/:applicantId/email
// HR manually composes + sends an email, then logs it
// ─────────────────────────────────────────────────────────────────────────────
const sendManualEmail = async (req, res) => {
    try {
        const { applicantId } = req.params;
        const parsed = sendEmailSchema.safeParse(req.body);
        if (!parsed.success) {
            return (0, response_1.sendError)(res, 'Validation failed', 400, parsed.error.issues.map((e) => ({ field: e.path.join('.'), message: e.message })));
        }
        const { to_address, subject, body, application_id, notes, metadata } = parsed.data;
        const userId = req.user?.user_id;
        const applicant = await assertApplicant(applicantId);
        // Validate application belongs to this applicant (if provided)
        if (application_id) {
            const app = await prisma_config_1.default.application.findFirst({
                where: { application_id, applicant_id: applicantId },
                select: { application_id: true },
            });
            if (!app)
                return (0, response_1.sendError)(res, 'Application not found for this applicant', 404);
        }
        // ── Send the email ────────────────────────────────────────────────────────
        let emailStatus = 'SENT';
        let messageId;
        try {
            const transporter = createTransporter();
            const senderName = process.env.SMTP_FROM_NAME || 'Hiring Team';
            const senderAddr = process.env.SMTP_USER || 'noreply@company.com';
            const info = await transporter.sendMail({
                from: { name: senderName, address: senderAddr },
                to: to_address,
                subject,
                html: body,
                text: body.replace(/<[^>]+>/g, '').trim(),
            });
            messageId = info.messageId;
        }
        catch (smtpErr) {
            console.error('[sendManualEmail] SMTP error:', smtpErr);
            emailStatus = 'FAILED';
        }
        // ── Log regardless of send outcome ────────────────────────────────────────
        const record = await prisma_config_1.default.applicantCommunication.create({
            data: {
                applicant_id: applicantId,
                communication_type: 'EMAIL',
                direction: 'OUTBOUND',
                trigger: 'MANUAL',
                status: emailStatus,
                subject,
                body,
                from_address: process.env.SMTP_USER || 'noreply@company.com',
                to_address,
                email_message_id: messageId,
                notes: notes ?? undefined,
                application_id: application_id ?? undefined,
                sent_by_user_id: userId ?? undefined,
                metadata: metadata,
            },
            select: COMM_SELECT,
        });
        if (emailStatus === 'FAILED') {
            return (0, response_1.sendError)(res, 'Email delivery failed but the attempt has been logged', 502);
        }
        return (0, response_1.sendSuccess)(res, record, 201);
    }
    catch (err) {
        if (err?.status)
            return (0, response_1.sendError)(res, err.message, err.status);
        console.error('[sendManualEmail]', err);
        return (0, response_1.sendError)(res, 'Failed to send email', 500);
    }
};
exports.sendManualEmail = sendManualEmail;
// ─────────────────────────────────────────────────────────────────────────────
// POST /api/applicant-communications/:applicantId/call
// HR records a call note (inbound or outbound)
// ─────────────────────────────────────────────────────────────────────────────
const logCallRecord = async (req, res) => {
    try {
        const { applicantId } = req.params;
        const parsed = logCallSchema.safeParse(req.body);
        if (!parsed.success) {
            return (0, response_1.sendError)(res, 'Validation failed', 400, parsed.error.issues.map((e) => ({ field: e.path.join('.'), message: e.message })));
        }
        const { direction, call_outcome, call_duration_minutes, notes, application_id, metadata } = parsed.data;
        const userId = req.user?.user_id;
        await assertApplicant(applicantId);
        if (application_id) {
            const app = await prisma_config_1.default.application.findFirst({
                where: { application_id, applicant_id: applicantId },
                select: { application_id: true },
            });
            if (!app)
                return (0, response_1.sendError)(res, 'Application not found for this applicant', 404);
        }
        const record = await prisma_config_1.default.applicantCommunication.create({
            data: {
                applicant_id: applicantId,
                communication_type: 'CALL',
                direction,
                trigger: 'MANUAL',
                status: 'LOGGED',
                call_outcome,
                call_duration_minutes: call_duration_minutes ?? undefined,
                notes,
                application_id: application_id ?? undefined,
                sent_by_user_id: userId ?? undefined,
                metadata: metadata,
            },
            select: COMM_SELECT,
        });
        return (0, response_1.sendSuccess)(res, record, 201);
    }
    catch (err) {
        if (err?.status)
            return (0, response_1.sendError)(res, err.message, err.status);
        console.error('[logCallRecord]', err);
        return (0, response_1.sendError)(res, 'Failed to log call record', 500);
    }
};
exports.logCallRecord = logCallRecord;
// ─────────────────────────────────────────────────────────────────────────────
// POST /api/applicant-communications/:applicantId/note
// HR adds an internal note (no email/call, just a memo)
// ─────────────────────────────────────────────────────────────────────────────
const logNote = async (req, res) => {
    try {
        const { applicantId } = req.params;
        const parsed = logNoteSchema.safeParse(req.body);
        if (!parsed.success) {
            return (0, response_1.sendError)(res, 'Validation failed', 400, parsed.error.issues.map((e) => ({ field: e.path.join('.'), message: e.message })));
        }
        const { notes, application_id, metadata } = parsed.data;
        const userId = req.user?.user_id;
        await assertApplicant(applicantId);
        if (application_id) {
            const app = await prisma_config_1.default.application.findFirst({
                where: { application_id, applicant_id: applicantId },
                select: { application_id: true },
            });
            if (!app)
                return (0, response_1.sendError)(res, 'Application not found for this applicant', 404);
        }
        const record = await prisma_config_1.default.applicantCommunication.create({
            data: {
                applicant_id: applicantId,
                communication_type: 'NOTE',
                trigger: 'MANUAL',
                status: 'LOGGED',
                notes,
                application_id: application_id ?? undefined,
                sent_by_user_id: userId ?? undefined,
                metadata: metadata,
            },
            select: COMM_SELECT,
        });
        return (0, response_1.sendSuccess)(res, record, 201);
    }
    catch (err) {
        if (err?.status)
            return (0, response_1.sendError)(res, err.message, err.status);
        console.error('[logNote]', err);
        return (0, response_1.sendError)(res, 'Failed to log note', 500);
    }
};
exports.logNote = logNote;
// ─────────────────────────────────────────────────────────────────────────────
// GET /api/applicant-communications/entry/:communicationId
// Get a single communication log entry
// ─────────────────────────────────────────────────────────────────────────────
const getCommunicationById = async (req, res) => {
    try {
        const { communicationId } = req.params;
        const record = await prisma_config_1.default.applicantCommunication.findUnique({
            where: { communication_id: communicationId },
            select: COMM_SELECT,
        });
        if (!record)
            return (0, response_1.sendError)(res, 'Communication log not found', 404);
        return (0, response_1.sendSuccess)(res, record);
    }
    catch (err) {
        console.error('[getCommunicationById]', err);
        return (0, response_1.sendError)(res, 'Failed to fetch communication', 500);
    }
};
exports.getCommunicationById = getCommunicationById;
// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/applicant-communications/entry/:communicationId
// Update notes / metadata on an existing log entry
// ─────────────────────────────────────────────────────────────────────────────
const updateCommunicationLog = async (req, res) => {
    try {
        const { communicationId } = req.params;
        const parsed = updateLogSchema.safeParse(req.body);
        if (!parsed.success) {
            return (0, response_1.sendError)(res, 'Validation failed', 400, parsed.error.issues.map((e) => ({ field: e.path.join('.'), message: e.message })));
        }
        const existing = await prisma_config_1.default.applicantCommunication.findUnique({
            where: { communication_id: communicationId },
            select: { communication_id: true },
        });
        if (!existing)
            return (0, response_1.sendError)(res, 'Communication log not found', 404);
        const { notes, metadata } = parsed.data;
        const updated = await prisma_config_1.default.applicantCommunication.update({
            where: { communication_id: communicationId },
            data: {
                ...(notes !== undefined && { notes }),
                ...(metadata !== undefined && { metadata: metadata }),
            },
            select: COMM_SELECT,
        });
        return (0, response_1.sendSuccess)(res, updated);
    }
    catch (err) {
        console.error('[updateCommunicationLog]', err);
        return (0, response_1.sendError)(res, 'Failed to update communication log', 500);
    }
};
exports.updateCommunicationLog = updateCommunicationLog;
// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/applicant-communications/entry/:communicationId
// Delete a single log entry
// ─────────────────────────────────────────────────────────────────────────────
const deleteCommunicationLog = async (req, res) => {
    try {
        const { communicationId } = req.params;
        const existing = await prisma_config_1.default.applicantCommunication.findUnique({
            where: { communication_id: communicationId },
            select: { communication_id: true },
        });
        if (!existing)
            return (0, response_1.sendError)(res, 'Communication log not found', 404);
        await prisma_config_1.default.applicantCommunication.delete({
            where: { communication_id: communicationId },
        });
        return (0, response_1.sendSuccess)(res, { deleted: true });
    }
    catch (err) {
        console.error('[deleteCommunicationLog]', err);
        return (0, response_1.sendError)(res, 'Failed to delete communication log', 500);
    }
};
exports.deleteCommunicationLog = deleteCommunicationLog;
const logApplicantCommunication = async (payload) => {
    try {
        await prisma_config_1.default.applicantCommunication.create({ data: payload });
    }
    catch (err) {
        // Non-fatal: log but never crash the calling flow
        console.error('[logApplicantCommunication] Failed to persist log:', err);
    }
};
exports.logApplicantCommunication = logApplicantCommunication;
//# sourceMappingURL=applicantCommunicationController.js.map