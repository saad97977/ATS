import { Router } from 'express';
import {
  getAllUsers,
  getUserById,
  registerUser,
  updateUserAdminStatus,
  updateUserStatus,
  updateUserInfo,       // new
  updateOfficeAccess,   // new
} from '../../controllers/user/userController';
import { loginUser, validateToken } from '../../controllers/user/authController';
import { authenticateToken, authorizeRole } from '../../middleware/authMiddleware';

const router = Router();

// ── Auth ──────────────────────────────────────────────────────
router.post('/login',    loginUser);
router.get('/validate',  validateToken);
router.post('/register', registerUser);

// ── Read ──────────────────────────────────────────────────────
router.get('/',    authenticateToken, authorizeRole('HCM_USER'), getAllUsers);
router.get('/:id', getUserById);

// ── Update ────────────────────────────────────────────────────

// Update name / email
router.patch('/:id',               authenticateToken, authorizeRole('HCM_USER', 'MANAGER'), updateUserInfo);

// Toggle admin flag (existing)
router.patch('/:id/admin',         authenticateToken, authorizeRole('HCM_USER', 'MANAGER'), updateUserAdminStatus);

// Toggle active / inactive (existing)
router.patch('/:id/status',        updateUserStatus);

// Toggle office-access flags (new)
router.patch('/:id/office-access', authenticateToken, authorizeRole('HCM_USER', 'MANAGER'), updateOfficeAccess);

export default router;