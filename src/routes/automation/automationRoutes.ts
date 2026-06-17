import { Router } from 'express';
import { emailAutomationController } from '../../controllers/automation/automationController';
import { authenticateToken } from '../../middleware/authMiddleware';
import { stageAutomationController } from '../../controllers/automation/stageAutomationController';


// whole on -> app.use('/api/email-automation', emailAutomationRoutes);


const router = Router();

// Apply authentication to all routes
router.use(authenticateToken);

router.get   ('/stage-automations',                stageAutomationController.getAllStageAutomations);
router.post  ('/stage-automations',                stageAutomationController.createStageAutomation);
router.patch ('/stage-automations/:automationId',  stageAutomationController.updateStageAutomation);
router.patch ('/stage-automations/:automationId/toggle', stageAutomationController.toggleStageAutomation);
router.delete('/stage-automations/:automationId',  stageAutomationController.deleteStageAutomation);



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