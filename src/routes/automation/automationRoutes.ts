import { Router } from 'express';
import { emailAutomationController } from '../../controllers/automation/automationController';
// import { authenticateToken } from '../middleware/auth'; // uncomment if you use auth middleware

const router = Router();

// ── Global rules ──────────────────────────────────────────────────────────────
// GET  /api/email-automation/rules          → list all 7 rules with current state
// PATCH /api/email-automation/rules         → bulk update multiple rules at once
// PATCH /api/email-automation/rules/:event  → update a single rule

router.get(   '/rules',               emailAutomationController.getAllRules);
router.patch( '/rules',               emailAutomationController.bulkUpdateRules);
router.patch( '/rules/:triggerEvent', emailAutomationController.updateRule);

// ── Per-applicant preferences ─────────────────────────────────────────────────
// GET    /api/email-automation/applicant/:applicantId/preferences
//        → list suppression state for all applicant-facing triggers
//
// PATCH  /api/email-automation/applicant/:applicantId/preferences
//        → bulk update applicant preferences (save all toggles at once)
//
// POST   /api/email-automation/applicant/:applicantId/suppress
//        → suppress a single trigger for this applicant
//        → body: { trigger_event, suppressed_reason? }
//
// DELETE /api/email-automation/applicant/:applicantId/suppress/:triggerEvent
//        → re-enable (unsuppress) a single trigger for this applicant

router.get(    '/applicant/:applicantId/preferences',                emailAutomationController.getApplicantPreferences);
router.patch(  '/applicant/:applicantId/preferences',                emailAutomationController.bulkUpdateApplicantPreferences);
router.post(   '/applicant/:applicantId/suppress',                   emailAutomationController.suppressApplicantEmail);
router.delete( '/applicant/:applicantId/suppress/:triggerEvent',     emailAutomationController.unsuppressApplicantEmail);

export default router;