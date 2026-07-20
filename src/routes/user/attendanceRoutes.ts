import { Router } from 'express';
import {
  clockIn,
  clockOut,
  pauseClock,
  resumeClock,
  getTodayStatus,
  getUserAttendance,
  getAllAttendance,
  getAttendanceByDate,
  updateAttendanceRecord,
  getAttendanceSummary,
getLiveStatus,
} from '../../controllers/user/attendanceController'; // adjust path to match your folder structure
import { authenticateToken, authorizeRole } from '../../middleware/authMiddleware';

const router = Router();

// ── Clock actions ──────────────────────────────────────────────
router.post('/clock-in', clockIn);
router.post('/clock-out', clockOut);
router.post('/pause', pauseClock);
router.post('/resume', resumeClock);

// ── Status / reads ──────────────────────────────────────────────
router.get('/live-status', authenticateToken, getLiveStatus);

router.get('/status/:userId', getTodayStatus);
router.get('/:userId/summary', getAttendanceSummary);
router.get('/:userId/:date', getAttendanceByDate);
router.get('/:userId', getUserAttendance);
router.get('/', getAllAttendance);

// ── Admin correction ─────────────────────────────────────────────
router.patch('/:attendanceId', updateAttendanceRecord);

export default router;