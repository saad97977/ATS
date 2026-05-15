import { Request, Response } from 'express';
import { z } from 'zod';
import nodemailer from 'nodemailer';
import prisma from '../../prisma.config';
import { sendSuccess, sendError } from '../../utils/response';

// ─── Types ────────────────────────────────────────────────────────────────────

type CommType      = 'EMAIL' | 'CALL' | 'SMS' | 'NOTE';
type CommDirection = 'OUTBOUND' | 'INBOUND';
type CommTrigger   = 'MANUAL' | 'AUTOMATIC';
type CommStatus    = 'SENT' | 'FAILED' | 'LOGGED' | 'DRAFT';
type CallOutcome   = 'ANSWERED' | 'NO_ANSWER' | 'VOICEMAIL' | 'BUSY';

// ─── Validation Schemas ───────────────────────────────────────────────────────

const listQuerySchema = z.object({
  page:  z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  type:  z.enum(['EMAIL', 'CALL', 'SMS', 'NOTE']).optional(),
  trigger: z.enum(['MANUAL', 'AUTOMATIC']).optional(),
  application_id: z.string().uuid().optional(),
});

const sendEmailSchema = z.object({
  to_address:     z.string().email('Valid recipient email required'),
  subject:        z.string().min(1, 'Subject is required').max(255),
  body:           z.string().min(1, 'Email body is required'),
  application_id: z.string().uuid().optional(),
  notes:          z.string().optional(),
  metadata:       z.record(z.string(), z.unknown()).optional(),
});

const logCallSchema = z.object({
  direction:            z.enum(['OUTBOUND', 'INBOUND']).default('OUTBOUND'),
  call_outcome:         z.enum(['ANSWERED', 'NO_ANSWER', 'VOICEMAIL', 'BUSY']),
  call_duration_minutes: z.number().int().min(0).optional(),
  notes:                z.string().min(1, 'Call notes are required'),
  application_id:       z.string().uuid().optional(),
  metadata:             z.record(z.string(), z.unknown()).optional(),
});

const logNoteSchema = z.object({
  notes:          z.string().min(1, 'Note content is required'),
  application_id: z.string().uuid().optional(),
  metadata:       z.record(z.string(), z.unknown()).optional(),
});

const updateLogSchema = z.object({
  notes:    z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

// ─── SMTP transporter (mirrors emailService.ts) ───────────────────────────────

const createTransporter = () =>
  nodemailer.createTransport({
    host:   process.env.SMTP_HOST     || 'smtp.gmail.com',
    port:   parseInt(process.env.SMTP_PORT || '587'),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
  });

// ─── Shared select for listing ────────────────────────────────────────────────

const COMM_SELECT = {
  communication_id:      true,
  communication_type:    true,
  direction:             true,
  trigger:               true,
  subject:               true,
  body:                  true,
  from_address:          true,
  to_address:            true,
  email_message_id:      true,
  call_duration_minutes: true,
  call_outcome:          true,
  status:                true,
  notes:                 true,
  application_id:        true,
  metadata:              true,
  created_at:            true,
  updated_at:            true,
  sent_by: {
    select: {
      user_id: true,
      name:    true,
      email:   true,
    },
  },
  application: {
    select: {
      application_id: true,
      status:         true,
      job: {
        select: { job_id: true, job_title: true },
      },
    },
  },
};

// ─── Helper: verify applicant exists ─────────────────────────────────────────

async function assertApplicant(applicantId: string) {
  const applicant = await prisma.applicant.findUnique({
    where: { applicant_id: applicantId },
    select: {
      applicant_id: true,
      full_name:    true,
      contact: { select: { email: true } },
    },
  });
  if (!applicant) throw { status: 404, message: 'Applicant not found' };
  return applicant;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/applicant-communications/:applicantId
// List all communication logs for an applicant (paginated + filterable)
// ─────────────────────────────────────────────────────────────────────────────

export const listCommunications = async (req: Request, res: Response) => {
  try {
    const { applicantId } = req.params;

    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return sendError(res, 'Invalid query parameters', 400,
        parsed.error.issues.map((e: any) => ({ field: e.path.join('.'), message: e.message })));
    }

    const { page, limit, type, trigger, application_id } = parsed.data;

    await assertApplicant(applicantId);

    const where: any = { applicant_id: applicantId };
    if (type)           where.communication_type = type;
    if (trigger)        where.trigger = trigger;
    if (application_id) where.application_id = application_id;

    const [total, records] = await Promise.all([
      prisma.applicantCommunication.count({ where }),
      prisma.applicantCommunication.findMany({
        where,
        select:  COMM_SELECT,
        orderBy: { created_at: 'desc' },
        skip:    (page - 1) * limit,
        take:    limit,
      }),
    ]);

    return sendSuccess(res, {
      data:  records,
      meta: {
        total,
        page,
        limit,
        total_pages: Math.ceil(total / limit),
      },
    });
  } catch (err: any) {
    if (err?.status) return sendError(res, err.message, err.status);
    console.error('[listCommunications]', err);
    return sendError(res, 'Failed to fetch communications', 500);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/applicant-communications/:applicantId/stats
// Summary counts by type for the applicant profile header
// ─────────────────────────────────────────────────────────────────────────────

export const getCommunicationStats = async (req: Request, res: Response) => {
  try {
    const { applicantId } = req.params;
    await assertApplicant(applicantId);

    const [byType, byTrigger, lastComm] = await Promise.all([
      prisma.applicantCommunication.groupBy({
        by:    ['communication_type'],
        where: { applicant_id: applicantId },
        _count: true,
      }),
      prisma.applicantCommunication.groupBy({
        by:    ['trigger'],
        where: { applicant_id: applicantId },
        _count: true,
      }),
      prisma.applicantCommunication.findFirst({
        where:   { applicant_id: applicantId },
        orderBy: { created_at: 'desc' },
        select:  { created_at: true, communication_type: true },
      }),
    ]);

    const typeCounts = Object.fromEntries(
      byType.map(r => [r.communication_type, r._count])
    );
    const triggerCounts = Object.fromEntries(
      byTrigger.map(r => [r.trigger, r._count])
    );

    return sendSuccess(res, {
      total:          Object.values(typeCounts).reduce((a: any, b: any) => a + b, 0),
      by_type:        typeCounts,
      by_trigger:     triggerCounts,
      last_contact_at: lastComm?.created_at ?? null,
      last_comm_type:  lastComm?.communication_type ?? null,
    });
  } catch (err: any) {
    if (err?.status) return sendError(res, err.message, err.status);
    console.error('[getCommunicationStats]', err);
    return sendError(res, 'Failed to fetch communication stats', 500);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/applicant-communications/:applicantId/email
// HR manually composes + sends an email, then logs it
// ─────────────────────────────────────────────────────────────────────────────

export const sendManualEmail = async (req: Request, res: Response) => {
  try {
    const { applicantId } = req.params;

    const parsed = sendEmailSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(res, 'Validation failed', 400,
        parsed.error.issues.map((e: any) => ({ field: e.path.join('.'), message: e.message })));
    }

    const { to_address, subject, body, application_id, notes, metadata } = parsed.data;
    const userId: string | undefined = (req as any).user?.user_id;

    const applicant = await assertApplicant(applicantId);

    // Validate application belongs to this applicant (if provided)
    if (application_id) {
      const app = await prisma.application.findFirst({
        where: { application_id, applicant_id: applicantId },
        select: { application_id: true },
      });
      if (!app) return sendError(res, 'Application not found for this applicant', 404);
    }

    // ── Send the email ────────────────────────────────────────────────────────
    let emailStatus: CommStatus = 'SENT';
    let messageId: string | undefined;

    try {
      const transporter = createTransporter();
      const senderName  = process.env.SMTP_FROM_NAME || 'Hiring Team';
      const senderAddr  = process.env.SMTP_USER || 'noreply@company.com';

      const info = await transporter.sendMail({
        from:    { name: senderName, address: senderAddr },
        to:      to_address,
        subject,
        html:    body,
        text:    body.replace(/<[^>]+>/g, '').trim(),
      });

      messageId = info.messageId;
    } catch (smtpErr: any) {
      console.error('[sendManualEmail] SMTP error:', smtpErr);
      emailStatus = 'FAILED';
    }

    // ── Log regardless of send outcome ────────────────────────────────────────
    const record = await prisma.applicantCommunication.create({
      data: {
        applicant_id:     applicantId,
        communication_type: 'EMAIL',
        direction:        'OUTBOUND',
        trigger:          'MANUAL',
        status:           emailStatus,
        subject,
        body,
        from_address:     process.env.SMTP_USER || 'noreply@company.com',
        to_address,
        email_message_id: messageId,
        notes:            notes ?? undefined,
        application_id:   application_id ?? undefined,
        sent_by_user_id:  userId ?? undefined,
        metadata:         metadata as any,
      },
      select: COMM_SELECT,
    });

    if (emailStatus === 'FAILED') {
      return sendError(res, 'Email delivery failed but the attempt has been logged', 502);
    }

    return sendSuccess(res, record, 201);
  } catch (err: any) {
    if (err?.status) return sendError(res, err.message, err.status);
    console.error('[sendManualEmail]', err);
    return sendError(res, 'Failed to send email', 500);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/applicant-communications/:applicantId/call
// HR records a call note (inbound or outbound)
// ─────────────────────────────────────────────────────────────────────────────

export const logCallRecord = async (req: Request, res: Response) => {
  try {
    const { applicantId } = req.params;

    const parsed = logCallSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(res, 'Validation failed', 400,
        parsed.error.issues.map((e: any) => ({ field: e.path.join('.'), message: e.message })));
    }

    const { direction, call_outcome, call_duration_minutes, notes, application_id, metadata } = parsed.data;
    const userId: string | undefined = (req as any).user?.user_id;

    await assertApplicant(applicantId);

    if (application_id) {
      const app = await prisma.application.findFirst({
        where: { application_id, applicant_id: applicantId },
        select: { application_id: true },
      });
      if (!app) return sendError(res, 'Application not found for this applicant', 404);
    }

    const record = await prisma.applicantCommunication.create({
      data: {
        applicant_id:          applicantId,
        communication_type:    'CALL',
        direction,
        trigger:               'MANUAL',
        status:                'LOGGED',
        call_outcome,
        call_duration_minutes: call_duration_minutes ?? undefined,
        notes,
        application_id:        application_id ?? undefined,
        sent_by_user_id:       userId ?? undefined,
        metadata:              metadata as any,
      },
      select: COMM_SELECT,
    });

    return sendSuccess(res, record, 201);
  } catch (err: any) {
    if (err?.status) return sendError(res, err.message, err.status);
    console.error('[logCallRecord]', err);
    return sendError(res, 'Failed to log call record', 500);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/applicant-communications/:applicantId/note
// HR adds an internal note (no email/call, just a memo)
// ─────────────────────────────────────────────────────────────────────────────

export const logNote = async (req: Request, res: Response) => {
  try {
    const { applicantId } = req.params;

    const parsed = logNoteSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(res, 'Validation failed', 400,
        parsed.error.issues.map((e: any) => ({ field: e.path.join('.'), message: e.message })));
    }

    const { notes, application_id, metadata } = parsed.data;
    const userId: string | undefined = (req as any).user?.user_id;

    await assertApplicant(applicantId);

    if (application_id) {
      const app = await prisma.application.findFirst({
        where: { application_id, applicant_id: applicantId },
        select: { application_id: true },
      });
      if (!app) return sendError(res, 'Application not found for this applicant', 404);
    }

    const record = await prisma.applicantCommunication.create({
      data: {
        applicant_id:       applicantId,
        communication_type: 'NOTE',
        trigger:            'MANUAL',
        status:             'LOGGED',
        notes,
        application_id:     application_id ?? undefined,
        sent_by_user_id:    userId ?? undefined,
        metadata:           metadata as any,
      },
      select: COMM_SELECT,
    });

    return sendSuccess(res, record, 201);
  } catch (err: any) {
    if (err?.status) return sendError(res, err.message, err.status);
    console.error('[logNote]', err);
    return sendError(res, 'Failed to log note', 500);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/applicant-communications/entry/:communicationId
// Get a single communication log entry
// ─────────────────────────────────────────────────────────────────────────────

export const getCommunicationById = async (req: Request, res: Response) => {
  try {
    const { communicationId } = req.params;

    const record = await prisma.applicantCommunication.findUnique({
      where:  { communication_id: communicationId },
      select: COMM_SELECT,
    });

    if (!record) return sendError(res, 'Communication log not found', 404);

    return sendSuccess(res, record);
  } catch (err: any) {
    console.error('[getCommunicationById]', err);
    return sendError(res, 'Failed to fetch communication', 500);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/applicant-communications/entry/:communicationId
// Update notes / metadata on an existing log entry
// ─────────────────────────────────────────────────────────────────────────────

export const updateCommunicationLog = async (req: Request, res: Response) => {
  try {
    const { communicationId } = req.params;

    const parsed = updateLogSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(res, 'Validation failed', 400,
        parsed.error.issues.map((e: any) => ({ field: e.path.join('.'), message: e.message })));
    }

    const existing = await prisma.applicantCommunication.findUnique({
      where:  { communication_id: communicationId },
      select: { communication_id: true },
    });
    if (!existing) return sendError(res, 'Communication log not found', 404);

    const { notes, metadata } = parsed.data;
    const updated = await prisma.applicantCommunication.update({
      where: { communication_id: communicationId },
      data: {
        ...(notes    !== undefined && { notes }),
        ...(metadata !== undefined && { metadata: metadata as any }),
      },
      select: COMM_SELECT,
    });

    return sendSuccess(res, updated);
  } catch (err: any) {
    console.error('[updateCommunicationLog]', err);
    return sendError(res, 'Failed to update communication log', 500);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/applicant-communications/entry/:communicationId
// Delete a single log entry
// ─────────────────────────────────────────────────────────────────────────────

export const deleteCommunicationLog = async (req: Request, res: Response) => {
  try {
    const { communicationId } = req.params;

    const existing = await prisma.applicantCommunication.findUnique({
      where:  { communication_id: communicationId },
      select: { communication_id: true },
    });
    if (!existing) return sendError(res, 'Communication log not found', 404);

    await prisma.applicantCommunication.delete({
      where: { communication_id: communicationId },
    });

    return sendSuccess(res, { deleted: true });
  } catch (err: any) {
    console.error('[deleteCommunicationLog]', err);
    return sendError(res, 'Failed to delete communication log', 500);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// UTILITY — logApplicantCommunication
//
// Called by other controllers (e.g. interviewController) after they
// successfully send an automatic email so it gets recorded here.
//
// Usage:
//   import { logApplicantCommunication } from './applicantCommunicationController';
//   await logApplicantCommunication({ ... });
// ─────────────────────────────────────────────────────────────────────────────

export interface AutoCommPayload {
  applicant_id:          string;
  communication_type:    CommType;
  direction?:            CommDirection;
  trigger:               CommTrigger;
  status:                CommStatus;
  subject?:              string;
  body?:                 string;
  from_address?:         string;
  to_address?:           string;
  email_message_id?:     string;
  call_duration_minutes?: number;
  call_outcome?:         CallOutcome;
  notes?:                string;
  sent_by_user_id?:      string;
  application_id?:       string;
  metadata?:             Record<string, unknown>;
}

export const logApplicantCommunication = async (payload: AutoCommPayload): Promise<void> => {
  try {
    await prisma.applicantCommunication.create({ data: payload as any });
  } catch (err) {
    // Non-fatal: log but never crash the calling flow
    console.error('[logApplicantCommunication] Failed to persist log:', err);
  }
};
