"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const userController_1 = require("../../controllers/user/userController");
const authController_1 = require("../../controllers/user/authController");
const authMiddleware_1 = require("../../middleware/authMiddleware");
const router = (0, express_1.Router)();
router.post('/login', authController_1.loginUser);
router.get('/validate', authController_1.validateToken);
router.post('/register', userController_1.registerUser);
// router.get('/', getAllUsers);
router.get('/', authMiddleware_1.authenticateToken, (0, authMiddleware_1.authorizeRole)('HCM_USER'), userController_1.getAllUsers);
router.get('/:id', userController_1.getUserById);
router.patch('/:id/admin', authMiddleware_1.authenticateToken, (0, authMiddleware_1.authorizeRole)('HCM_USER', 'MANAGER'), userController_1.updateUserAdminStatus);
router.patch('/:id/status', userController_1.updateUserStatus);
exports.default = router;
//# sourceMappingURL=userRoutes.js.map