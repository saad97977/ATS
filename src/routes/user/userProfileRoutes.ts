import { Router } from 'express';
import multer from 'multer';
import {
  getCompleteUserProfile,
  getUserSettings,
  updateUserSettings,
  getUserProfile,
  updateUserProfile,
  uploadUserAvatar,
  deleteUserAvatar,
  uploadUserSignature,
  deleteUserSignature,
  changeUserPassword,
  getUserActivitySummary,
  getUserActivityPaginated,
  updateUserPreferences,
  getUserDashboardStats,
} from '../../controllers/user/userProfileController';

const router = Router();

// ─── Multer (in-memory) ───────────────────────────────────────────────────────
// Separate instances so we can enforce per-route size limits.

const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    allowed.includes(file.mimetype)
      ? cb(null, true)
      : cb(new Error('Avatar must be JPEG, PNG, or WebP'));
  },
});

const signatureUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];
    allowed.includes(file.mimetype)
      ? cb(null, true)
      : cb(new Error('Signature must be JPEG, PNG, WebP, or SVG'));
  },
});

// ─── Routes ──────────────────────────────────────────────────────────────────

/**
 * Complete profile (comprehensive user data summary)
 * GET /api/user-profile/:user_id/complete-profile → returns all profile data with aggregated stats
 */
router.get('/:user_id/complete-profile', getCompleteUserProfile);

/**
 * Core settings (User table fields)
 * GET  /api/user-profile/:user_id/settings   → full settings + profile snapshot
 * PATCH /api/user-profile/:user_id/settings  → update name, email, office flags
 */
router.get('/:user_id/settings', getUserSettings);
router.patch('/:user_id/settings', updateUserSettings);

/**
 * Extended profile (UserProfile table)
 * GET   /api/user-profile/:user_id/profile   → get/create profile
 * PATCH /api/user-profile/:user_id/profile   → upsert profile fields
 */
router.get('/:user_id/profile', getUserProfile);
router.patch('/:user_id/profile', updateUserProfile);

/**
 * Avatar
 * POST   /api/user-profile/:user_id/profile/avatar   → upload / replace avatar
 * DELETE /api/user-profile/:user_id/profile/avatar   → remove avatar
 */
router.post('/:user_id/profile/avatar', avatarUpload.single('avatar'), uploadUserAvatar);
router.delete('/:user_id/profile/avatar', deleteUserAvatar);

/**
 * Signature image
 * POST   /api/user-profile/:user_id/profile/signature   → upload / replace signature
 * DELETE /api/user-profile/:user_id/profile/signature   → remove signature
 */
router.post('/:user_id/profile/signature', signatureUpload.single('signature'), uploadUserSignature);
router.delete('/:user_id/profile/signature', deleteUserSignature);

/**
 * Password
 * POST /api/user-profile/:user_id/change-password
 * Body: { current_password, new_password }
 */
router.post('/:user_id/change-password', changeUserPassword);

/**
 * Activity summary
 * GET /api/user-profile/:user_id/activity-summary → recent tasks, jobs, organizations (limited)
 */
router.get('/:user_id/activity-summary', getUserActivitySummary);

/**
 * Activity paginated
 * GET /api/user-profile/:user_id/activity-paginated → paginated user activity with all details
 * Query: ?page=1&limit=10
 */
router.get('/:user_id/activity-paginated', getUserActivityPaginated);

/**
 * Preferences
 * PATCH /api/user-profile/:user_id/preferences → update notification preferences
 */
router.patch('/:user_id/preferences', updateUserPreferences);

/**
 * Dashboard stats
 * GET /api/user-profile/:user_id/dashboard-stats → comprehensive dashboard statistics
 */
router.get('/:user_id/dashboard-stats', getUserDashboardStats);

export default router;