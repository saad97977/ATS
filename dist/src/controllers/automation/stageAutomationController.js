"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.stageAutomationController = exports.fireStageAutomations = exports.updateStageAutomation = exports.deleteStageAutomation = exports.toggleStageAutomation = exports.createStageAutomation = exports.getAllStageAutomations = void 0;
const prisma_config_1 = __importDefault(require("../../prisma.config"));
const response_1 = require("../../utils/response");
const emailService_1 = require("../../services/emailService");
// ── GET all automations (with filters) ───────────────────────────────────────
const getAllStageAutomations = async (req, res) => {
    try {
        const { organization_id, job_id, stage_name } = req.query;
        const where = {};
        if (organization_id)
            where.organization_id = organization_id;
        if (job_id)
            where.job_id = job_id;
        if (stage_name)
            where.stage_name = stage_name;
        const automations = await prisma_config_1.default.stageEmailAutomation.findMany({
            where,
            orderBy: { created_at: 'desc' },
            include: {
                organization: { select: { organization_id: true, name: true } },
                job: { select: { job_id: true, job_title: true } },
                created_by: { select: { user_id: true, name: true } },
            },
        });
        return (0, response_1.sendSuccess)(res, { automations });
    }
    catch (err) {
        console.error('Error fetching stage automations:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch stage automations', 500);
    }
};
exports.getAllStageAutomations = getAllStageAutomations;
// ── CREATE automation ─────────────────────────────────────────────────────────
const createStageAutomation = async (req, res) => {
    try {
        const { organization_id, job_id, stage_name, email_subject, email_body, attachments, } = req.body;
        const created_by_user_id = req.user?.user_id;
        if (!organization_id)
            return (0, response_1.sendError)(res, 'organization_id is required', 400);
        if (!stage_name)
            return (0, response_1.sendError)(res, 'stage_name is required', 400);
        if (!email_subject?.trim())
            return (0, response_1.sendError)(res, 'email_subject is required', 400);
        if (!email_body?.trim())
            return (0, response_1.sendError)(res, 'email_body is required', 400);
        if (!created_by_user_id)
            return (0, response_1.sendError)(res, 'Unauthorized', 401);
        const automation = await prisma_config_1.default.stageEmailAutomation.create({
            data: {
                organization_id,
                job_id: job_id || null,
                stage_name,
                email_subject: email_subject.trim(),
                email_body: email_body.trim(),
                attachments: attachments || null,
                created_by_user_id,
                is_enabled: true,
            },
            include: {
                organization: { select: { organization_id: true, name: true } },
                job: { select: { job_id: true, job_title: true } },
            },
        });
        return (0, response_1.sendSuccess)(res, { automation }, 201);
    }
    catch (err) {
        console.error('Error creating stage automation:', err);
        return (0, response_1.sendError)(res, 'Failed to create stage automation', 500);
    }
};
exports.createStageAutomation = createStageAutomation;
// ── TOGGLE on/off ─────────────────────────────────────────────────────────────
const toggleStageAutomation = async (req, res) => {
    try {
        const { automationId } = req.params;
        const { is_enabled } = req.body;
        if (typeof is_enabled !== 'boolean')
            return (0, response_1.sendError)(res, 'is_enabled must be a boolean', 400);
        const automation = await prisma_config_1.default.stageEmailAutomation.update({
            where: { automation_id: automationId },
            data: { is_enabled },
        });
        return (0, response_1.sendSuccess)(res, {
            message: `Automation ${is_enabled ? 'enabled' : 'disabled'}.`,
            automation,
        });
    }
    catch (err) {
        console.error('Error toggling stage automation:', err);
        return (0, response_1.sendError)(res, 'Failed to toggle automation', 500);
    }
};
exports.toggleStageAutomation = toggleStageAutomation;
// ── DELETE automation ─────────────────────────────────────────────────────────
const deleteStageAutomation = async (req, res) => {
    try {
        const { automationId } = req.params;
        await prisma_config_1.default.stageEmailAutomation.delete({
            where: { automation_id: automationId },
        });
        return (0, response_1.sendSuccess)(res, { message: 'Automation deleted.' });
    }
    catch (err) {
        console.error('Error deleting stage automation:', err);
        return (0, response_1.sendError)(res, 'Failed to delete automation', 500);
    }
};
exports.deleteStageAutomation = deleteStageAutomation;
// ── UPDATE automation ─────────────────────────────────────────────────────────
const updateStageAutomation = async (req, res) => {
    try {
        const { automationId } = req.params;
        const { email_subject, email_body, attachments, is_enabled } = req.body;
        const automation = await prisma_config_1.default.stageEmailAutomation.update({
            where: { automation_id: automationId },
            data: {
                ...(email_subject !== undefined && { email_subject }),
                ...(email_body !== undefined && { email_body }),
                ...(attachments !== undefined && { attachments }),
                ...(is_enabled !== undefined && { is_enabled }),
            },
            include: {
                organization: { select: { organization_id: true, name: true } },
                job: { select: { job_id: true, job_title: true } },
            },
        });
        return (0, response_1.sendSuccess)(res, { automation });
    }
    catch (err) {
        console.error('Error updating stage automation:', err);
        return (0, response_1.sendError)(res, 'Failed to update automation', 500);
    }
};
exports.updateStageAutomation = updateStageAutomation;
// ── FIRE automations for a stage change (called by pipeline) ─────────────────
// Call this whenever a pipeline stage changes.
// It finds all enabled automations matching org+job+stage and sends emails.
const fireStageAutomations = async (stageName, applicantId, applicationId, jobId, organizationId) => {
    try {
        const automations = await prisma_config_1.default.stageEmailAutomation.findMany({
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
        if (!automations.length)
            return;
        const applicant = await prisma_config_1.default.applicant.findUnique({
            where: { applicant_id: applicantId },
            include: { contact: true },
        });
        const email = applicant?.contact?.email;
        if (!email)
            return;
        for (const automation of automations) {
            try {
                await (0, emailService_1.sendCustomStageEmail)({
                    to: email,
                    subject: automation.email_subject,
                    body: automation.email_body,
                });
                console.log(`✅ Stage automation email sent for stage ${stageName} to ${email}`);
            }
            catch (e) {
                console.error(`❌ Stage automation email failed:`, e.message);
            }
        }
    }
    catch (err) {
        console.error('Error firing stage automations:', err);
    }
};
exports.fireStageAutomations = fireStageAutomations;
exports.stageAutomationController = {
    getAllStageAutomations: exports.getAllStageAutomations,
    createStageAutomation: exports.createStageAutomation,
    toggleStageAutomation: exports.toggleStageAutomation,
    deleteStageAutomation: exports.deleteStageAutomation,
    updateStageAutomation: exports.updateStageAutomation,
    fireStageAutomations: exports.fireStageAutomations,
};
//# sourceMappingURL=stageAutomationController.js.map