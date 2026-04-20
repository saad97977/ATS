"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const userProfileController_1 = require("../../controllers/user/userProfileController");
const router = (0, express_1.Router)();
// ─── Multer (in-memory) ───────────────────────────────────────────────────────
// Separate instances so we can enforce per-route size limits.
const avatarUpload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
    fileFilter: (_req, file, cb) => {
        const allowed = ['image/jpeg', 'image/png', 'image/webp'];
        allowed.includes(file.mimetype)
            ? cb(null, true)
            : cb(new Error('Avatar must be JPEG, PNG, or WebP'));
    },
});
const signatureUpload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
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
router.get('/:user_id/complete-profile', userProfileController_1.getCompleteUserProfile);
/**
 * Core settings (User table fields)
 * GET  /api/user-profile/:user_id/settings   → full settings + profile snapshot
 * PATCH /api/user-profile/:user_id/settings  → update name, email, office flags
 */
router.get('/:user_id/settings', userProfileController_1.getUserSettings);
router.patch('/:user_id/settings', userProfileController_1.updateUserSettings);
/**
 * Extended profile (UserProfile table)
 * GET   /api/user-profile/:user_id/profile   → get/create profile
 * PATCH /api/user-profile/:user_id/profile   → upsert profile fields
 */
router.get('/:user_id/profile', userProfileController_1.getUserProfile);
router.patch('/:user_id/profile', userProfileController_1.updateUserProfile);
/**
 * Avatar
 * POST   /api/user-profile/:user_id/profile/avatar   → upload / replace avatar
 * DELETE /api/user-profile/:user_id/profile/avatar   → remove avatar
 */
router.post('/:user_id/profile/avatar', avatarUpload.single('avatar'), userProfileController_1.uploadUserAvatar);
router.delete('/:user_id/profile/avatar', userProfileController_1.deleteUserAvatar);
/**
 * Signature image
 * POST   /api/user-profile/:user_id/profile/signature   → upload / replace signature
 * DELETE /api/user-profile/:user_id/profile/signature   → remove signature
 */
router.post('/:user_id/profile/signature', signatureUpload.single('signature'), userProfileController_1.uploadUserSignature);
router.delete('/:user_id/profile/signature', userProfileController_1.deleteUserSignature);
/**
 * Password
 * POST /api/user-profile/:user_id/change-password
 * Body: { current_password, new_password }
 */
router.post('/:user_id/change-password', userProfileController_1.changeUserPassword);
/**
 * Activity summary
 * GET /api/user-profile/:user_id/activity-summary → recent tasks, jobs, organizations (limited)
 */
router.get('/:user_id/activity-summary', userProfileController_1.getUserActivitySummary);
/**
 * Activity paginated
 * GET /api/user-profile/:user_id/activity-paginated → paginated user activity with all details
 * Query: ?page=1&limit=10
 */
router.get('/:user_id/activity-paginated', userProfileController_1.getUserActivityPaginated);
/**
 * Preferences
 * PATCH /api/user-profile/:user_id/preferences → update notification preferences
 */
router.patch('/:user_id/preferences', userProfileController_1.updateUserPreferences);
/**
 * Dashboard stats
 * GET /api/user-profile/:user_id/dashboard-stats → comprehensive dashboard statistics
 */
router.get('/:user_id/dashboard-stats', userProfileController_1.getUserDashboardStats);
exports.default = router;
//# sourceMappingURL=userProfileRoutes.js.map