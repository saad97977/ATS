import { Router } from 'express';
import {
  listCommunications,
  getCommunicationStats,
  sendManualEmail,
  logCallRecord,
  logNote,
  getCommunicationById,
  updateCommunicationLog,
  deleteCommunicationLog,
} from '../../controllers/applicant/applicantCommunicationController';

const router = Router();

// ── Per-applicant endpoints ───────────────────────────────────────────────────

// GET  /api/applicant-communications/:applicantId          — list all logs
router.get('/:applicantId', listCommunications);

// GET  /api/applicant-communications/:applicantId/stats    — summary counts
router.get('/:applicantId/stats', getCommunicationStats);

// POST /api/applicant-communications/:applicantId/email    — HR sends manual email
router.post('/:applicantId/email', sendManualEmail);

// POST /api/applicant-communications/:applicantId/call     — HR logs a call
router.post('/:applicantId/call', logCallRecord);

// POST /api/applicant-communications/:applicantId/note     — HR adds a note
router.post('/:applicantId/note', logNote);

// ── Per-entry endpoints ───────────────────────────────────────────────────────

// GET    /api/applicant-communications/entry/:communicationId
router.get('/entry/:communicationId', getCommunicationById);

// PATCH  /api/applicant-communications/entry/:communicationId
router.patch('/entry/:communicationId', updateCommunicationLog);

// DELETE /api/applicant-communications/entry/:communicationId
router.delete('/entry/:communicationId', deleteCommunicationLog);

export default router;
