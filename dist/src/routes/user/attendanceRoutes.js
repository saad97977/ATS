"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const attendanceController_1 = require("../../controllers/user/attendanceController"); // adjust path to match your folder structure
const authMiddleware_1 = require("../../middleware/authMiddleware");
const router = (0, express_1.Router)();
// ── Clock actions ──────────────────────────────────────────────
router.post('/clock-in', attendanceController_1.clockIn);
router.post('/clock-out', attendanceController_1.clockOut);
router.post('/pause', attendanceController_1.pauseClock);
router.post('/resume', attendanceController_1.resumeClock);
// ── Status / reads ──────────────────────────────────────────────
router.get('/live-status', authMiddleware_1.authenticateToken, attendanceController_1.getLiveStatus);
router.get('/status/:userId', attendanceController_1.getTodayStatus);
router.get('/:userId/summary', attendanceController_1.getAttendanceSummary);
router.get('/:userId/:date', attendanceController_1.getAttendanceByDate);
router.get('/:userId', attendanceController_1.getUserAttendance);
router.get('/', attendanceController_1.getAllAttendance);
// ── Admin correction ─────────────────────────────────────────────
router.patch('/:attendanceId', attendanceController_1.updateAttendanceRecord);
exports.default = router;
//# sourceMappingURL=attendanceRoutes.js.map