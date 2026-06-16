"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.emailAutomationController = exports.bulkUpdateApplicantPreferences = exports.unsuppressApplicantEmail = exports.suppressApplicantEmail = exports.getApplicantPreferences = exports.bulkUpdateRules = exports.updateRule = exports.getAllRules = exports.shouldSendEmail = exports.ALL_TRIGGER_EVENTS = exports.TRIGGER_EVENT_META = void 0;
const prisma_config_1 = __importDefault(require("../../prisma.config"));
const response_1 = require("../../utils/response");
// ─────────────────────────────────────────────────────────────────────────────
// EMAIL AUTOMATION CONTROLLER
// Manages global email trigger rules and per-applicant email suppressions.
//
// Architecture:
//   EmailAutomationRule     → global on/off per trigger event (admin-managed)
//   ApplicantEmailPreference → per-applicant suppress override on top of rules
//
// Resolution order (in shouldSendEmail helper imported by pipeline.ts):
//   1. job.withhold_emails === true  → block (legacy hard-stop, always respected)
//   2. EmailAutomationRule.is_enabled === false → block
//   3. ApplicantEmailPreference.is_suppressed === true → block
//   4. Otherwise → send
//
// "No row = enabled" — missing rule rows default to enabled so existing
// deployments see zero behaviour change after migration.
// ─────────────────────────────────────────────────────────────────────────────
// ─── Canonical trigger event metadata ────────────────────────────────────────
// Single source of truth for labels + which audience each email targets.
// Used by GET /rules to return enriched data the frontend can render directly.
exports.TRIGGER_EVENT_META = {
    INTERVIEW_SCHEDULED: {
        label: 'Interview Invitation',
        description: 'Sent to applicant when an interview round is scheduled.',
        audience: 'APPLICANT',
    },
    INTERVIEW_RESCHEDULED: {
        label: 'Interview Rescheduled',
        description: 'Sent to applicant when an existing interview date is changed.',
        audience: 'APPLICANT',
    },
    INTERVIEW_REJECTED: {
        label: 'Interview Rejected',
        description: 'Sent to applicant when they do not pass an interview round.',
        audience: 'APPLICANT',
    },
    OFFER_LETTER_SENT: {
        label: 'Offer Letter',
        description: 'Sent to applicant after all interview rounds are accepted.',
        audience: 'APPLICANT',
    },
    ONBOARDING_WELCOME: {
        label: 'Onboarding Welcome',
        description: 'Sent to applicant when they are successfully onboarded.',
        audience: 'APPLICANT',
    },
    ASSIGNMENT_NOTIFICATION_CREDIT: {
        label: 'Assignment Notification — Credit User',
        description: 'Sent to the credit user when a candidate is onboarded.',
        audience: 'STAFF',
    },
    ASSIGNMENT_NOTIFICATION_REP: {
        label: 'Assignment Notification — Representative',
        description: 'Sent to the representative user when a candidate is onboarded.',
        audience: 'STAFF',
    },
};
exports.ALL_TRIGGER_EVENTS = Object.keys(exports.TRIGGER_EVENT_META);
// ─────────────────────────────────────────────────────────────────────────────
// SHARED HELPER — imported by pipelineController.ts
//
// Usage:
//   import { shouldSendEmail } from '../emailAutomation/emailAutomationController';
//   const canSend = await shouldSendEmail('INTERVIEW_SCHEDULED', applicantId, job);
//   if (canSend) { sendInterviewInvitationEmail(...) }
// ─────────────────────────────────────────────────────────────────────────────
const shouldSendEmail = async (triggerEvent, applicantId, job) => {
    // 1. Legacy job-level hard block — always respected first
    if (job?.withhold_emails === true)
        return false;
    // 2. Global rule check — "no row" means enabled (opt-out model)
    const rule = await prisma_config_1.default.emailAutomationRule.findFirst({
        where: { trigger_event: triggerEvent },
    });
    if (rule && !rule.is_enabled)
        return false;
    // 3. Per-applicant suppression override
    // Staff-audience triggers (ASSIGNMENT_NOTIFICATION_*) are not suppressible
    // at the applicant level — they target HR users, not the applicant.
    const meta = exports.TRIGGER_EVENT_META[triggerEvent];
    if (meta?.audience !== 'STAFF') {
        const pref = await prisma_config_1.default.applicantEmailPreference.findFirst({
            where: {
                applicant_id: applicantId,
                trigger_event: triggerEvent,
            },
        });
        if (pref?.is_suppressed)
            return false;
    }
    return true;
};
exports.shouldSendEmail = shouldSendEmail;
// ─────────────────────────────────────────────────────────────────────────────
// GET ALL RULES
// GET /api/email-automation/rules
//
// Returns all 7 trigger events enriched with their current rule state.
// Events with no DB row are returned with is_enabled: true (default).
// ─────────────────────────────────────────────────────────────────────────────
const getAllRules = async (_req, res) => {
    try {
        const existingRules = await prisma_config_1.default.emailAutomationRule.findMany();
        const ruleMap = {};
        for (const r of existingRules) {
            ruleMap[r.trigger_event] = r;
        }
        const rules = exports.ALL_TRIGGER_EVENTS.map((event) => {
            const dbRow = ruleMap[event];
            const meta = exports.TRIGGER_EVENT_META[event];
            return {
                trigger_event: event,
                label: meta.label,
                description: meta.description,
                audience: meta.audience,
                is_enabled: dbRow ? dbRow.is_enabled : true, // no row = enabled
                email_subject_override: dbRow?.email_subject_override ?? null,
                rule_id: dbRow?.rule_id ?? null,
                updated_at: dbRow?.updated_at ?? null,
            };
        });
        return (0, response_1.sendSuccess)(res, { rules });
    }
    catch (err) {
        console.error('Error fetching email automation rules:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch email automation rules', 500);
    }
};
exports.getAllRules = getAllRules;
// ─────────────────────────────────────────────────────────────────────────────
// UPDATE RULE (upsert)
// PATCH /api/email-automation/rules/:triggerEvent
//
// Body: { is_enabled: boolean, email_subject_override?: string | null }
//
// Uses upsert so the row is created on first toggle — no manual seeding needed.
// ─────────────────────────────────────────────────────────────────────────────
const updateRule = async (req, res) => {
    try {
        const { triggerEvent } = req.params;
        const { is_enabled, email_subject_override } = req.body;
        if (!exports.ALL_TRIGGER_EVENTS.includes(triggerEvent)) {
            return (0, response_1.sendError)(res, `Unknown trigger event: "${triggerEvent}"`, 400);
        }
        if (typeof is_enabled !== 'boolean') {
            return (0, response_1.sendError)(res, 'is_enabled must be a boolean', 400);
        }
        const existing = await prisma_config_1.default.emailAutomationRule.findFirst({
            where: { trigger_event: triggerEvent },
        });
        const rule = existing
            ? await prisma_config_1.default.emailAutomationRule.update({
                where: { rule_id: existing.rule_id },
                data: {
                    is_enabled,
                    ...(email_subject_override !== undefined && { email_subject_override }),
                },
            })
            : await prisma_config_1.default.emailAutomationRule.create({
                data: {
                    trigger_event: triggerEvent,
                    is_enabled,
                    email_subject_override: email_subject_override ?? null,
                },
            });
        const meta = exports.TRIGGER_EVENT_META[triggerEvent];
        return (0, response_1.sendSuccess)(res, {
            message: `"${meta.label}" emails are now ${is_enabled ? 'enabled' : 'disabled'}.`,
            rule: {
                ...rule,
                label: meta.label,
                description: meta.description,
                audience: meta.audience,
            },
        });
    }
    catch (err) {
        console.error('Error updating email automation rule:', err);
        return (0, response_1.sendError)(res, 'Failed to update rule', 500);
    }
};
exports.updateRule = updateRule;
// ─────────────────────────────────────────────────────────────────────────────
// BULK UPDATE RULES
// PATCH /api/email-automation/rules
//
// Body: { rules: [{ trigger_event: string, is_enabled: boolean }] }
//
// Lets the frontend save all toggles in one request.
// ─────────────────────────────────────────────────────────────────────────────
const bulkUpdateRules = async (req, res) => {
    try {
        const { rules } = req.body;
        if (!Array.isArray(rules) || !rules.length) {
            return (0, response_1.sendError)(res, 'rules must be a non-empty array', 400);
        }
        for (const r of rules) {
            if (!exports.ALL_TRIGGER_EVENTS.includes(r.trigger_event)) {
                return (0, response_1.sendError)(res, `Unknown trigger event: "${r.trigger_event}"`, 400);
            }
            if (typeof r.is_enabled !== 'boolean') {
                return (0, response_1.sendError)(res, `is_enabled must be boolean for "${r.trigger_event}"`, 400);
            }
        }
        // Run all upserts in a transaction
        const updated = await prisma_config_1.default.$transaction(async (tx) => {
            const results = [];
            for (const r of rules) {
                const existing = await tx.emailAutomationRule.findFirst({
                    where: { trigger_event: r.trigger_event },
                });
                const result = existing
                    ? await tx.emailAutomationRule.update({
                        where: { rule_id: existing.rule_id },
                        data: { is_enabled: r.is_enabled },
                    })
                    : await tx.emailAutomationRule.create({
                        data: { trigger_event: r.trigger_event, is_enabled: r.is_enabled },
                    });
                results.push(result);
            }
            return results;
        });
        return (0, response_1.sendSuccess)(res, {
            message: `${updated.length} rule(s) updated.`,
            updated_count: updated.length,
        });
    }
    catch (err) {
        console.error('Error bulk-updating email automation rules:', err);
        return (0, response_1.sendError)(res, 'Failed to bulk-update rules', 500);
    }
};
exports.bulkUpdateRules = bulkUpdateRules;
// ─────────────────────────────────────────────────────────────────────────────
// GET APPLICANT EMAIL PREFERENCES
// GET /api/email-automation/applicant/:applicantId/preferences
//
// Returns suppression state for all APPLICANT-audience trigger events
// for a specific applicant. Useful for rendering per-applicant toggles
// in the pipeline drawer / applicant profile.
// ─────────────────────────────────────────────────────────────────────────────
const getApplicantPreferences = async (req, res) => {
    try {
        const { applicantId } = req.params;
        const applicant = await prisma_config_1.default.applicant.findUnique({
            where: { applicant_id: applicantId },
            select: { applicant_id: true, full_name: true },
        });
        if (!applicant)
            return (0, response_1.sendError)(res, 'Applicant not found', 404);
        const existing = await prisma_config_1.default.applicantEmailPreference.findMany({
            where: { applicant_id: applicantId },
        });
        const prefMap = {};
        for (const p of existing)
            prefMap[p.trigger_event] = p;
        // Only return applicant-facing triggers — staff notification suppression
        // is not per-applicant, it's per-rule.
        const applicantTriggers = exports.ALL_TRIGGER_EVENTS.filter((e) => exports.TRIGGER_EVENT_META[e].audience !== 'STAFF');
        const preferences = applicantTriggers.map((event) => {
            const pref = prefMap[event];
            const meta = exports.TRIGGER_EVENT_META[event];
            return {
                trigger_event: event,
                label: meta.label,
                description: meta.description,
                is_suppressed: pref?.is_suppressed ?? false, // no row = not suppressed
                suppressed_at: pref?.suppressed_at ?? null,
                suppressed_reason: pref?.suppressed_reason ?? null,
                preference_id: pref?.preference_id ?? null,
            };
        });
        return (0, response_1.sendSuccess)(res, {
            applicant_id: applicant.applicant_id,
            applicant_name: applicant.full_name,
            preferences,
        });
    }
    catch (err) {
        console.error('Error fetching applicant email preferences:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch applicant email preferences', 500);
    }
};
exports.getApplicantPreferences = getApplicantPreferences;
// ─────────────────────────────────────────────────────────────────────────────
// SUPPRESS EMAIL FOR APPLICANT (upsert)
// POST /api/email-automation/applicant/:applicantId/suppress
//
// Body: { trigger_event: string, suppressed_reason?: string }
//
// Sets is_suppressed = true for this applicant + trigger combination.
// ─────────────────────────────────────────────────────────────────────────────
const suppressApplicantEmail = async (req, res) => {
    try {
        const { applicantId } = req.params;
        const { trigger_event, suppressed_reason } = req.body;
        if (!trigger_event || !exports.ALL_TRIGGER_EVENTS.includes(trigger_event)) {
            return (0, response_1.sendError)(res, `Invalid or missing trigger_event`, 400);
        }
        // Prevent suppressing staff-only triggers at the applicant level
        if (exports.TRIGGER_EVENT_META[trigger_event].audience === 'STAFF') {
            return (0, response_1.sendError)(res, `"${trigger_event}" targets staff users, not applicants. ` +
                `Use the global rule endpoint to disable it.`, 400);
        }
        const applicant = await prisma_config_1.default.applicant.findUnique({
            where: { applicant_id: applicantId },
            select: { applicant_id: true, full_name: true },
        });
        if (!applicant)
            return (0, response_1.sendError)(res, 'Applicant not found', 404);
        const existingPref = await prisma_config_1.default.applicantEmailPreference.findFirst({
            where: { applicant_id: applicantId, trigger_event },
        });
        const pref = existingPref
            ? await prisma_config_1.default.applicantEmailPreference.update({
                where: { preference_id: existingPref.preference_id },
                data: {
                    is_suppressed: true,
                    suppressed_at: new Date(),
                    suppressed_reason: suppressed_reason ?? null,
                },
            })
            : await prisma_config_1.default.applicantEmailPreference.create({
                data: {
                    applicant_id: applicantId,
                    trigger_event,
                    is_suppressed: true,
                    suppressed_at: new Date(),
                    suppressed_reason: suppressed_reason ?? null,
                },
            });
        const meta = exports.TRIGGER_EVENT_META[trigger_event];
        return (0, response_1.sendSuccess)(res, {
            message: `"${meta.label}" emails suppressed for ${applicant.full_name}.`,
            preference: pref,
        });
    }
    catch (err) {
        console.error('Error suppressing applicant email:', err);
        return (0, response_1.sendError)(res, 'Failed to suppress email', 500);
    }
};
exports.suppressApplicantEmail = suppressApplicantEmail;
// ─────────────────────────────────────────────────────────────────────────────
// RE-ENABLE EMAIL FOR APPLICANT
// DELETE /api/email-automation/applicant/:applicantId/suppress/:triggerEvent
//
// Sets is_suppressed = false (keeps the row, clears suppression).
// ─────────────────────────────────────────────────────────────────────────────
const unsuppressApplicantEmail = async (req, res) => {
    try {
        const { applicantId, triggerEvent } = req.params;
        if (!exports.ALL_TRIGGER_EVENTS.includes(triggerEvent)) {
            return (0, response_1.sendError)(res, `Unknown trigger event: "${triggerEvent}"`, 400);
        }
        const applicant = await prisma_config_1.default.applicant.findUnique({
            where: { applicant_id: applicantId },
            select: { applicant_id: true, full_name: true },
        });
        if (!applicant)
            return (0, response_1.sendError)(res, 'Applicant not found', 404);
        // upsert: if somehow no row exists, create it as not-suppressed
        const existingPref = await prisma_config_1.default.applicantEmailPreference.findFirst({
            where: { applicant_id: applicantId, trigger_event: triggerEvent },
        });
        const pref = existingPref
            ? await prisma_config_1.default.applicantEmailPreference.update({
                where: { preference_id: existingPref.preference_id },
                data: {
                    is_suppressed: false,
                    suppressed_at: null,
                    suppressed_reason: null,
                },
            })
            : await prisma_config_1.default.applicantEmailPreference.create({
                data: {
                    applicant_id: applicantId,
                    trigger_event: triggerEvent,
                    is_suppressed: false,
                },
            });
        const meta = exports.TRIGGER_EVENT_META[triggerEvent];
        return (0, response_1.sendSuccess)(res, {
            message: `"${meta.label}" emails re-enabled for ${applicant.full_name}.`,
            preference: pref,
        });
    }
    catch (err) {
        console.error('Error unsuppressing applicant email:', err);
        return (0, response_1.sendError)(res, 'Failed to re-enable email', 500);
    }
};
exports.unsuppressApplicantEmail = unsuppressApplicantEmail;
// ─────────────────────────────────────────────────────────────────────────────
// BULK UPDATE APPLICANT PREFERENCES
// PATCH /api/email-automation/applicant/:applicantId/preferences
//
// Body: { preferences: [{ trigger_event: string, is_suppressed: boolean }] }
//
// Lets the frontend save all per-applicant toggles in one request.
// ─────────────────────────────────────────────────────────────────────────────
const bulkUpdateApplicantPreferences = async (req, res) => {
    try {
        const { applicantId } = req.params;
        const { preferences } = req.body;
        if (!Array.isArray(preferences) || !preferences.length) {
            return (0, response_1.sendError)(res, 'preferences must be a non-empty array', 400);
        }
        const applicant = await prisma_config_1.default.applicant.findUnique({
            where: { applicant_id: applicantId },
            select: { applicant_id: true, full_name: true },
        });
        if (!applicant)
            return (0, response_1.sendError)(res, 'Applicant not found', 404);
        for (const p of preferences) {
            if (!exports.ALL_TRIGGER_EVENTS.includes(p.trigger_event)) {
                return (0, response_1.sendError)(res, `Unknown trigger_event: "${p.trigger_event}"`, 400);
            }
            if (exports.TRIGGER_EVENT_META[p.trigger_event].audience === 'STAFF') {
                return (0, response_1.sendError)(res, `"${p.trigger_event}" targets staff — use the global rule endpoint.`, 400);
            }
            if (typeof p.is_suppressed !== 'boolean') {
                return (0, response_1.sendError)(res, `is_suppressed must be boolean for "${p.trigger_event}"`, 400);
            }
        }
        const updated = await prisma_config_1.default.$transaction(async (tx) => {
            const results = [];
            for (const p of preferences) {
                const existing = await tx.applicantEmailPreference.findFirst({
                    where: { applicant_id: applicantId, trigger_event: p.trigger_event },
                });
                const result = existing
                    ? await tx.applicantEmailPreference.update({
                        where: { preference_id: existing.preference_id },
                        data: {
                            is_suppressed: p.is_suppressed,
                            suppressed_at: p.is_suppressed ? new Date() : null,
                            suppressed_reason: p.suppressed_reason ?? null,
                        },
                    })
                    : await tx.applicantEmailPreference.create({
                        data: {
                            applicant_id: applicantId,
                            trigger_event: p.trigger_event,
                            is_suppressed: p.is_suppressed,
                            suppressed_at: p.is_suppressed ? new Date() : null,
                            suppressed_reason: p.suppressed_reason ?? null,
                        },
                    });
                results.push(result);
            }
            return results;
        });
        return (0, response_1.sendSuccess)(res, {
            message: `${updated.length} preference(s) updated for ${applicant.full_name}.`,
            updated_count: updated.length,
        });
    }
    catch (err) {
        console.error('Error bulk-updating applicant preferences:', err);
        return (0, response_1.sendError)(res, 'Failed to bulk-update applicant preferences', 500);
    }
};
exports.bulkUpdateApplicantPreferences = bulkUpdateApplicantPreferences;
// ─────────────────────────────────────────────────────────────────────────────
// EXPORT
// ─────────────────────────────────────────────────────────────────────────────
exports.emailAutomationController = {
    getAllRules: exports.getAllRules,
    updateRule: exports.updateRule,
    bulkUpdateRules: exports.bulkUpdateRules,
    getApplicantPreferences: exports.getApplicantPreferences,
    suppressApplicantEmail: exports.suppressApplicantEmail,
    unsuppressApplicantEmail: exports.unsuppressApplicantEmail,
    bulkUpdateApplicantPreferences: exports.bulkUpdateApplicantPreferences,
    // Re-export helper so pipelineController can import from one place
    shouldSendEmail: exports.shouldSendEmail,
};
//# sourceMappingURL=automationController.js.map