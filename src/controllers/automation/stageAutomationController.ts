import { Request, Response } from 'express';
import prisma from '../../prisma.config';
import { sendSuccess, sendError } from '../../utils/response';
import { sendCustomStageEmail } from '../../services/emailService';

// ── GET all automations (with filters) ───────────────────────────────────────
export const getAllStageAutomations = async (req: Request, res: Response) => {
  try {
    const { organization_id, job_id, stage_name } = req.query;

    const where: any = {};
    if (organization_id) where.organization_id = organization_id;
    if (job_id)          where.job_id = job_id;
    if (stage_name)      where.stage_name = stage_name;

    const automations = await (prisma as any).stageEmailAutomation.findMany({
      where,
      orderBy: { created_at: 'desc' },
      include: {
        organization: { select: { organization_id: true, name: true } },
        job:          { select: { job_id: true, job_title: true } },
        created_by:   { select: { user_id: true, name: true } },
      },
    });

    return sendSuccess(res, { automations });
  } catch (err: any) {
    console.error('Error fetching stage automations:', err);
    return sendError(res, 'Failed to fetch stage automations', 500);
  }
};

// ── CREATE automation ─────────────────────────────────────────────────────────
export const createStageAutomation = async (req: Request, res: Response) => {
  try {
    const {
      organization_id, job_id, stage_name,
      email_subject, email_body, attachments,
    } = req.body;

    const created_by_user_id = (req as any).user?.user_id;

    if (!organization_id) return sendError(res, 'organization_id is required', 400);
    if (!stage_name)      return sendError(res, 'stage_name is required', 400);
    if (!email_subject?.trim()) return sendError(res, 'email_subject is required', 400);
    if (!email_body?.trim())    return sendError(res, 'email_body is required', 400);
    if (!created_by_user_id)    return sendError(res, 'Unauthorized', 401);

    const automation = await (prisma as any).stageEmailAutomation.create({
      data: {
        organization_id,
        job_id:       job_id || null,
        stage_name,
        email_subject: email_subject.trim(),
        email_body:    email_body.trim(),
        attachments:   attachments || null,
        created_by_user_id,
        is_enabled:    true,
      },
      include: {
        organization: { select: { organization_id: true, name: true } },
        job:          { select: { job_id: true, job_title: true } },
      },
    });

    return sendSuccess(res, { automation }, 201);
  } catch (err: any) {
    console.error('Error creating stage automation:', err);
    return sendError(res, 'Failed to create stage automation', 500);
  }
};

// ── TOGGLE on/off ─────────────────────────────────────────────────────────────
export const toggleStageAutomation = async (req: Request, res: Response) => {
  try {
    const { automationId } = req.params;
    const { is_enabled }   = req.body;

    if (typeof is_enabled !== 'boolean')
      return sendError(res, 'is_enabled must be a boolean', 400);

    const automation = await (prisma as any).stageEmailAutomation.update({
      where: { automation_id: automationId },
      data:  { is_enabled },
    });

    return sendSuccess(res, {
      message: `Automation ${is_enabled ? 'enabled' : 'disabled'}.`,
      automation,
    });
  } catch (err: any) {
    console.error('Error toggling stage automation:', err);
    return sendError(res, 'Failed to toggle automation', 500);
  }
};

// ── DELETE automation ─────────────────────────────────────────────────────────
export const deleteStageAutomation = async (req: Request, res: Response) => {
  try {
    const { automationId } = req.params;
    await (prisma as any).stageEmailAutomation.delete({
      where: { automation_id: automationId },
    });
    return sendSuccess(res, { message: 'Automation deleted.' });
  } catch (err: any) {
    console.error('Error deleting stage automation:', err);
    return sendError(res, 'Failed to delete automation', 500);
  }
};

// ── UPDATE automation ─────────────────────────────────────────────────────────
export const updateStageAutomation = async (req: Request, res: Response) => {
  try {
    const { automationId } = req.params;
    const { email_subject, email_body, attachments, is_enabled } = req.body;

    const automation = await (prisma as any).stageEmailAutomation.update({
      where: { automation_id: automationId },
      data: {
        ...(email_subject !== undefined && { email_subject }),
        ...(email_body    !== undefined && { email_body }),
        ...(attachments   !== undefined && { attachments }),
        ...(is_enabled    !== undefined && { is_enabled }),
      },
      include: {
        organization: { select: { organization_id: true, name: true } },
        job:          { select: { job_id: true, job_title: true } },
      },
    });

    return sendSuccess(res, { automation });
  } catch (err: any) {
    console.error('Error updating stage automation:', err);
    return sendError(res, 'Failed to update automation', 500);
  }
};

// ── FIRE automations for a stage change (called by pipeline) ─────────────────
// Call this whenever a pipeline stage changes.
// It finds all enabled automations matching org+job+stage and sends emails.
export const fireStageAutomations = async (
  stageName: string,
  applicantId: string,
  applicationId: string,
  jobId: string,
  organizationId: string,
) => {
  try {
    const automations = await (prisma as any).stageEmailAutomation.findMany({
      where: {
        stage_name: stageName,
        is_enabled: true,
        organization_id: organizationId,
        OR: [
          { job_id: jobId },
          { job_id: null },
        ],
      },
    });

    if (!automations.length) return;

    const applicant = await prisma.applicant.findUnique({
      where: { applicant_id: applicantId },
      include: { contact: true },
    });

    const email = applicant?.contact?.email;
    if (!email) return;

    for (const automation of automations) {
      try {
            await sendCustomStageEmail({
            to:      email,
            subject: automation.email_subject,
            body:    automation.email_body,
            });
        console.log(`✅ Stage automation email sent for stage ${stageName} to ${email}`);
      } catch (e: any) {
        console.error(`❌ Stage automation email failed:`, e.message);
      }
    }
  } catch (err: any) {
    console.error('Error firing stage automations:', err);
  }
};

export const stageAutomationController = {
  getAllStageAutomations,
  createStageAutomation,
  toggleStageAutomation,
  deleteStageAutomation,
  updateStageAutomation,
  fireStageAutomations,
};