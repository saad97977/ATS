"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const userController_1 = require("../../controllers/user/userController");
const authController_1 = require("../../controllers/user/authController");
const authMiddleware_1 = require("../../middleware/authMiddleware");
const router = (0, express_1.Router)();
// ── Auth ──────────────────────────────────────────────────────
router.post('/login', authController_1.loginUser);
router.get('/validate', authController_1.validateToken);
router.post('/register', userController_1.registerUser);
// ── Read ──────────────────────────────────────────────────────
router.get('/', authMiddleware_1.authenticateToken, userController_1.getAllUsers);
router.get('/:id', userController_1.getUserById);
// ── Update ────────────────────────────────────────────────────
// Update name / email
router.patch('/:id', authMiddleware_1.authenticateToken, userController_1.updateUserInfo);
// Toggle admin flag (existing)
router.patch('/:id/admin', authMiddleware_1.authenticateToken, userController_1.updateUserAdminStatus);
// Toggle active / inactive (existing)
router.patch('/:id/status', userController_1.updateUserStatus);
// Toggle office-access flags (new)
router.patch('/:id/office-access', authMiddleware_1.authenticateToken, userController_1.updateOfficeAccess);
exports.default = router;
//# sourceMappingURL=userRoutes.js.map