import { Request, Response } from 'express';
import prisma from '../../prisma.config';
import { sendSuccess, sendError } from '../../utils/response';

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

export const TRIGGER_EVENT_META: Record<
  string,
  { label: string; description: string; audience: 'APPLICANT' | 'STAFF' | 'BOTH' }
> = {
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

export const ALL_TRIGGER_EVENTS = Object.keys(TRIGGER_EVENT_META);

// ─────────────────────────────────────────────────────────────────────────────
// SHARED HELPER — imported by pipelineController.ts
//
// Usage:
//   import { shouldSendEmail } from '../emailAutomation/emailAutomationController';
//   const canSend = await shouldSendEmail('INTERVIEW_SCHEDULED', applicantId, job);
//   if (canSend) { sendInterviewInvitationEmail(...) }
// ─────────────────────────────────────────────────────────────────────────────
export const shouldSendEmail = async (
  triggerEvent: string,
  applicantId: string,
  job: { withhold_emails?: boolean | null },
): Promise<boolean> => {
  // 1. Legacy job-level hard block — always respected first
  if (job?.withhold_emails === true) return false;

  // 2. Global rule check — "no row" means enabled (opt-out model)
  const rule = await (prisma as any).emailAutomationRule.findFirst({
    where: { trigger_event: triggerEvent },
  });
  if (rule && !rule.is_enabled) return false;

  // 3. Per-applicant suppression override
  // Staff-audience triggers (ASSIGNMENT_NOTIFICATION_*) are not suppressible
  // at the applicant level — they target HR users, not the applicant.
  const meta = TRIGGER_EVENT_META[triggerEvent];
  if (meta?.audience !== 'STAFF') {
  const pref = await (prisma as any).applicantEmailPreference.findFirst({
    where: {
      applicant_id: applicantId,
      trigger_event: triggerEvent,
    },
  });
    if (pref?.is_suppressed) return false;
  }

  return true;
};

// ─────────────────────────────────────────────────────────────────────────────
// GET ALL RULES
// GET /api/email-automation/rules
//
// Returns all 7 trigger events enriched with their current rule state.
// Events with no DB row are returned with is_enabled: true (default).
// ─────────────────────────────────────────────────────────────────────────────
export const getAllRules = async (_req: Request, res: Response) => {
  try {
    const existingRules = await (prisma as any).emailAutomationRule.findMany();

    const ruleMap: Record<string, any> = {};
    for (const r of existingRules) {
      ruleMap[r.trigger_event] = r;
    }

    const rules = ALL_TRIGGER_EVENTS.map((event) => {
      const dbRow = ruleMap[event];
      const meta  = TRIGGER_EVENT_META[event];
      return {
        trigger_event:          event,
        label:                  meta.label,
        description:            meta.description,
        audience:               meta.audience,
        is_enabled:             dbRow ? dbRow.is_enabled : true,   // no row = enabled
        email_subject_override: dbRow?.email_subject_override ?? null,
        rule_id:                dbRow?.rule_id ?? null,
        updated_at:             dbRow?.updated_at ?? null,
      };
    });

    return sendSuccess(res, { rules });
  } catch (err: any) {
    console.error('Error fetching email automation rules:', err);
    return sendError(res, 'Failed to fetch email automation rules', 500);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// UPDATE RULE (upsert)
// PATCH /api/email-automation/rules/:triggerEvent
//
// Body: { is_enabled: boolean, email_subject_override?: string | null }
//
// Uses upsert so the row is created on first toggle — no manual seeding needed.
// ─────────────────────────────────────────────────────────────────────────────
export const updateRule = async (req: Request, res: Response) => {
  try {
    const { triggerEvent }          = req.params;
    const { is_enabled, email_subject_override } = req.body;

    if (!ALL_TRIGGER_EVENTS.includes(triggerEvent)) {
      return sendError(res, `Unknown trigger event: "${triggerEvent}"`, 400);
    }

    if (typeof is_enabled !== 'boolean') {
      return sendError(res, 'is_enabled must be a boolean', 400);
    }

  const existing = await (prisma as any).emailAutomationRule.findFirst({
  where: { trigger_event: triggerEvent },
  });

  const rule = existing
  ? await (prisma as any).emailAutomationRule.update({
      where: { rule_id: existing.rule_id },
      data: {
        is_enabled,
        ...(email_subject_override !== undefined && { email_subject_override }),
      },
    })
  : await (prisma as any).emailAutomationRule.create({
      data: {
        trigger_event: triggerEvent,
        is_enabled,
        email_subject_override: email_subject_override ?? null,
      },
    });


    const meta = TRIGGER_EVENT_META[triggerEvent];

    return sendSuccess(res, {
      message: `"${meta.label}" emails are now ${is_enabled ? 'enabled' : 'disabled'}.`,
      rule: {
        ...rule,
        label:       meta.label,
        description: meta.description,
        audience:    meta.audience,
      },
    });
  } catch (err: any) {
    console.error('Error updating email automation rule:', err);
    return sendError(res, 'Failed to update rule', 500);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// BULK UPDATE RULES
// PATCH /api/email-automation/rules
//
// Body: { rules: [{ trigger_event: string, is_enabled: boolean }] }
//
// Lets the frontend save all toggles in one request.
// ─────────────────────────────────────────────────────────────────────────────
export const bulkUpdateRules = async (req: Request, res: Response) => {
  try {
    const { rules } = req.body;

    if (!Array.isArray(rules) || !rules.length) {
      return sendError(res, 'rules must be a non-empty array', 400);
    }

    for (const r of rules) {
      if (!ALL_TRIGGER_EVENTS.includes(r.trigger_event)) {
        return sendError(res, `Unknown trigger event: "${r.trigger_event}"`, 400);
      }
      if (typeof r.is_enabled !== 'boolean') {
        return sendError(res, `is_enabled must be boolean for "${r.trigger_event}"`, 400);
      }
    }

    // Run all upserts in a transaction
    const updated = await prisma.$transaction(async (tx) => {
      const results = [];
      for (const r of rules) {
        const existing = await (tx as any).emailAutomationRule.findFirst({
          where: { trigger_event: r.trigger_event },
        });
        const result = existing
          ? await (tx as any).emailAutomationRule.update({
              where: { rule_id: existing.rule_id },
              data: { is_enabled: r.is_enabled },
            })
          : await (tx as any).emailAutomationRule.create({
              data: { trigger_event: r.trigger_event, is_enabled: r.is_enabled },
            });
        results.push(result);
      }
      return results;
    });


    return sendSuccess(res, {
      message: `${updated.length} rule(s) updated.`,
      updated_count: updated.length,
    });
  } catch (err: any) {
    console.error('Error bulk-updating email automation rules:', err);
    return sendError(res, 'Failed to bulk-update rules', 500);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET APPLICANT EMAIL PREFERENCES
// GET /api/email-automation/applicant/:applicantId/preferences
//
// Returns suppression state for all APPLICANT-audience trigger events
// for a specific applicant. Useful for rendering per-applicant toggles
// in the pipeline drawer / applicant profile.
// ─────────────────────────────────────────────────────────────────────────────
export const getApplicantPreferences = async (req: Request, res: Response) => {
  try {
    const { applicantId } = req.params;

    const applicant = await prisma.applicant.findUnique({
      where:  { applicant_id: applicantId },
      select: { applicant_id: true, full_name: true },
    });
    if (!applicant) return sendError(res, 'Applicant not found', 404);

    const existing = await (prisma as any).applicantEmailPreference.findMany({
      where: { applicant_id: applicantId },
    });

    const prefMap: Record<string, any> = {};
    for (const p of existing) prefMap[p.trigger_event] = p;

    // Only return applicant-facing triggers — staff notification suppression
    // is not per-applicant, it's per-rule.
    const applicantTriggers = ALL_TRIGGER_EVENTS.filter(
      (e) => TRIGGER_EVENT_META[e].audience !== 'STAFF'
    );

    const preferences = applicantTriggers.map((event) => {
      const pref = prefMap[event];
      const meta = TRIGGER_EVENT_META[event];
      return {
        trigger_event:     event,
        label:             meta.label,
        description:       meta.description,
        is_suppressed:     pref?.is_suppressed ?? false,   // no row = not suppressed
        suppressed_at:     pref?.suppressed_at ?? null,
        suppressed_reason: pref?.suppressed_reason ?? null,
        preference_id:     pref?.preference_id ?? null,
      };
    });

    return sendSuccess(res, {
      applicant_id:   applicant.applicant_id,
      applicant_name: applicant.full_name,
      preferences,
    });
  } catch (err: any) {
    console.error('Error fetching applicant email preferences:', err);
    return sendError(res, 'Failed to fetch applicant email preferences', 500);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// SUPPRESS EMAIL FOR APPLICANT (upsert)
// POST /api/email-automation/applicant/:applicantId/suppress
//
// Body: { trigger_event: string, suppressed_reason?: string }
//
// Sets is_suppressed = true for this applicant + trigger combination.
// ─────────────────────────────────────────────────────────────────────────────
export const suppressApplicantEmail = async (req: Request, res: Response) => {
  try {
    const { applicantId }                        = req.params;
    const { trigger_event, suppressed_reason }   = req.body;

    if (!trigger_event || !ALL_TRIGGER_EVENTS.includes(trigger_event)) {
      return sendError(res, `Invalid or missing trigger_event`, 400);
    }

    // Prevent suppressing staff-only triggers at the applicant level
    if (TRIGGER_EVENT_META[trigger_event].audience === 'STAFF') {
      return sendError(
        res,
        `"${trigger_event}" targets staff users, not applicants. ` +
        `Use the global rule endpoint to disable it.`,
        400,
      );
    }

    const applicant = await prisma.applicant.findUnique({
      where:  { applicant_id: applicantId },
      select: { applicant_id: true, full_name: true },
    });
    if (!applicant) return sendError(res, 'Applicant not found', 404);

    const existingPref = await (prisma as any).applicantEmailPreference.findFirst({
      where: { applicant_id: applicantId, trigger_event },
    });
  const pref = existingPref
  ? await (prisma as any).applicantEmailPreference.update({
      where: { preference_id: existingPref.preference_id },
      data: {
        is_suppressed:     true,
        suppressed_at:     new Date(),
        suppressed_reason: suppressed_reason ?? null,
      },
    })
  : await (prisma as any).applicantEmailPreference.create({
      data: {
        applicant_id:      applicantId,
        trigger_event,
        is_suppressed:     true,
        suppressed_at:     new Date(),
        suppressed_reason: suppressed_reason ?? null,
      },
    });


    const meta = TRIGGER_EVENT_META[trigger_event];

    return sendSuccess(res, {
      message:  `"${meta.label}" emails suppressed for ${applicant.full_name}.`,
      preference: pref,
    });
  } catch (err: any) {
    console.error('Error suppressing applicant email:', err);
    return sendError(res, 'Failed to suppress email', 500);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// RE-ENABLE EMAIL FOR APPLICANT
// DELETE /api/email-automation/applicant/:applicantId/suppress/:triggerEvent
//
// Sets is_suppressed = false (keeps the row, clears suppression).
// ─────────────────────────────────────────────────────────────────────────────
export const unsuppressApplicantEmail = async (req: Request, res: Response) => {
  try {
    const { applicantId, triggerEvent } = req.params;

    if (!ALL_TRIGGER_EVENTS.includes(triggerEvent)) {
      return sendError(res, `Unknown trigger event: "${triggerEvent}"`, 400);
    }

    const applicant = await prisma.applicant.findUnique({
      where:  { applicant_id: applicantId },
      select: { applicant_id: true, full_name: true },
    });
    if (!applicant) return sendError(res, 'Applicant not found', 404);

    // upsert: if somehow no row exists, create it as not-suppressed
    const existingPref = await (prisma as any).applicantEmailPreference.findFirst({
      where: { applicant_id: applicantId, trigger_event: triggerEvent },
    });
    const pref = existingPref
      ? await (prisma as any).applicantEmailPreference.update({
      where: { preference_id: existingPref.preference_id },
      data: {
        is_suppressed:     false,
        suppressed_at:     null,
        suppressed_reason: null,
      },
    })
  : await (prisma as any).applicantEmailPreference.create({
      data: {
        applicant_id:  applicantId,
        trigger_event: triggerEvent,
        is_suppressed: false,
      },
    });


    const meta = TRIGGER_EVENT_META[triggerEvent];

    return sendSuccess(res, {
      message:    `"${meta.label}" emails re-enabled for ${applicant.full_name}.`,
      preference: pref,
    });
  } catch (err: any) {
    console.error('Error unsuppressing applicant email:', err);
    return sendError(res, 'Failed to re-enable email', 500);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// BULK UPDATE APPLICANT PREFERENCES
// PATCH /api/email-automation/applicant/:applicantId/preferences
//
// Body: { preferences: [{ trigger_event: string, is_suppressed: boolean }] }
//
// Lets the frontend save all per-applicant toggles in one request.
// ─────────────────────────────────────────────────────────────────────────────
export const bulkUpdateApplicantPreferences = async (req: Request, res: Response) => {
  try {
    const { applicantId }  = req.params;
    const { preferences }  = req.body;

    if (!Array.isArray(preferences) || !preferences.length) {
      return sendError(res, 'preferences must be a non-empty array', 400);
    }

    const applicant = await prisma.applicant.findUnique({
      where:  { applicant_id: applicantId },
      select: { applicant_id: true, full_name: true },
    });
    if (!applicant) return sendError(res, 'Applicant not found', 404);

    for (const p of preferences) {
      if (!ALL_TRIGGER_EVENTS.includes(p.trigger_event)) {
        return sendError(res, `Unknown trigger_event: "${p.trigger_event}"`, 400);
      }
      if (TRIGGER_EVENT_META[p.trigger_event].audience === 'STAFF') {
        return sendError(
          res,
          `"${p.trigger_event}" targets staff — use the global rule endpoint.`,
          400,
        );
      }
      if (typeof p.is_suppressed !== 'boolean') {
        return sendError(res, `is_suppressed must be boolean for "${p.trigger_event}"`, 400);
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
    const results = [];
    for (const p of preferences) {
      const existing = await (tx as any).applicantEmailPreference.findFirst({
        where: { applicant_id: applicantId, trigger_event: p.trigger_event },
      });
      const result = existing
        ? await (tx as any).applicantEmailPreference.update({
            where: { preference_id: existing.preference_id },
            data: {
              is_suppressed:     p.is_suppressed,
              suppressed_at:     p.is_suppressed ? new Date() : null,
              suppressed_reason: p.suppressed_reason ?? null,
            },
          })
        : await (tx as any).applicantEmailPreference.create({
            data: {
              applicant_id:      applicantId,
              trigger_event:     p.trigger_event,
              is_suppressed:     p.is_suppressed,
              suppressed_at:     p.is_suppressed ? new Date() : null,
              suppressed_reason: p.suppressed_reason ?? null,
            },
          });
      results.push(result);
    }
    return results;
    });


    return sendSuccess(res, {
      message:       `${updated.length} preference(s) updated for ${applicant.full_name}.`,
      updated_count: updated.length,
    });
  } catch (err: any) {
    console.error('Error bulk-updating applicant preferences:', err);
    return sendError(res, 'Failed to bulk-update applicant preferences', 500);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// EXPORT
// ─────────────────────────────────────────────────────────────────────────────
export const emailAutomationController = {
  getAllRules,
  updateRule,
  bulkUpdateRules,
  getApplicantPreferences,
  suppressApplicantEmail,
  unsuppressApplicantEmail,
  bulkUpdateApplicantPreferences,
  // Re-export helper so pipelineController can import from one place
  shouldSendEmail,
};