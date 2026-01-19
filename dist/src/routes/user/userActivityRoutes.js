"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const userActivityController_1 = require("../../controllers/user/userActivityController");
const router = (0, express_1.Router)();
/**
 * User Activity Routes
 * Base path: /api/user-activities
 *
 * Available endpoints:
 * - GET    /api/user-activities              - Get all user activities (with pagination)
 * - GET    /api/user-activities/recent       - Get recently active users
 * - GET    /api/user-activities/inactive     - Get inactive users
 * - GET    /api/user-activities/stats        - Get activity statistics
 * - GET    /api/user-activities/user/:userId - Get activity by user_id
 * - GET    /api/user-activities/:id          - Get activity by activity_id
 * - POST   /api/user-activities              - Create new user activity
 * - PATCH  /api/user-activities/:id          - Update user activity
 * - DELETE /api/user-activities/:id          - Delete user activity
 */
// ==========================================
// CUSTOM QUERY ROUTES (Must come before /:id)
// ==========================================
/**
 * GET /api/user-activities/recent
 * Get users who have logged in within the last N days
 *
 * Query params:
 * @param {number} days - Number of days to look back (default: 7)
 * @param {number} page - Page number (default: 1)
 * @param {number} limit - Items per page (default: 10, max: 100)
 *
 * Example: GET /api/user-activities/recent?days=7&page=1&limit=20
 */
router.get('/recent', userActivityController_1.userActivityController.getRecentActiveUsers);
/**
 * GET /api/user-activities/inactive
 * Get users who have NOT logged in for N days or never logged in
 *
 * Query params:
 * @param {number} days - Number of days of inactivity (default: 30)
 * @param {number} page - Page number (default: 1)
 * @param {number} limit - Items per page (default: 10, max: 100)
 *
 * Example: GET /api/user-activities/inactive?days=30
 */
router.get('/inactive', userActivityController_1.userActivityController.getInactiveUsers);
/**
 * GET /api/user-activities/stats
 * Get user activity statistics
 *
 * Returns:
 * - total_users: Total number of user activity records
 * - active_last_7_days: Users logged in within last 7 days
 * - active_last_30_days: Users logged in within last 30 days
 * - never_logged_in: Users who have never logged in
 * - inactive: Users inactive for more than 30 days
 *
 * Example: GET /api/user-activities/stats
 */
router.get('/stats', userActivityController_1.userActivityController.getUserActivityStats);
/**
 * GET /api/user-activities/user/:userId
 * Get user activity by user_id
 *
 * Path params:
 * @param {string} userId - The user_id (UUID)
 *
 * Returns the activity record for the specified user including:
 * - last_login_at
 * - last_action_1, last_action_2, last_action_3
 * - Related user details (name, email, status)
 *
 * Example: GET /api/user-activities/user/550e8400-e29b-41d4-a716-446655440000
 */
router.get('/user/:userId', userActivityController_1.userActivityController.getUserActivityByUserId);
// ==========================================
// STANDARD CRUD ROUTES
// ==========================================
/**
 * GET /api/user-activities
 * Get all user activities with pagination
 *
 * Query params:
 * @param {number} page - Page number (default: 1)
 * @param {number} limit - Items per page (default: 10, max: 100)
 *
 * Example: GET /api/user-activities?page=1&limit=20
 */
router.get('/', userActivityController_1.userActivityController.getAll);
/**
 * GET /api/user-activities/:id
 * Get single user activity by activity_id
 *
 * @param {string} id - activity_id (UUID)
 *
 * Example: GET /api/user-activities/550e8400-e29b-41d4-a716-446655440000
 */
router.get('/:id', userActivityController_1.userActivityController.getById);
/**
 * POST /api/user-activities
 * Create a new user activity record
 *
 * Request body:
 * {
 *   "user_id": "uuid",                       // User ID (required)
 *   "last_login_at": "2025-12-30T10:00:00Z", // Last login datetime (optional)
 *   "last_action_1": "string",               // Recent action 1 (optional)
 *   "last_action_2": "string",               // Recent action 2 (optional)
 *   "last_action_3": "string"                // Recent action 3 (optional)
 * }
 *
 * Example:
 * POST /api/user-activities
 * Body: {
 *   "user_id": "550e8400-e29b-41d4-a716-446655440000",
 *   "last_login_at": "2025-12-30T10:00:00Z",
 *   "last_action_1": "Viewed dashboard"
 * }
 */
router.post('/', userActivityController_1.userActivityController.create);
/**
 * PATCH /api/user-activities/:id
 * Update an existing user activity record
 *
 * @param {string} id - activity_id (UUID)
 *
 * Request body (all fields optional):
 * {
 *   "last_login_at": "2025-12-30T10:00:00Z",
 *   "last_action_1": "string",
 *   "last_action_2": "string",
 *   "last_action_3": "string"
 * }
 *
 * Example:
 * PATCH /api/user-activities/550e8400-e29b-41d4-a716-446655440000
 * Body: {
 *   "last_login_at": "2025-12-30T15:30:00Z",
 *   "last_action_1": "Updated profile"
 * }
 */
router.patch('/:id', userActivityController_1.userActivityController.update);
/**
 * DELETE /api/user-activities/:id
 * Delete a user activity record
 *
 * @param {string} id - activity_id (UUID)
 *
 * Example: DELETE /api/user-activities/550e8400-e29b-41d4-a716-446655440000
 */
router.delete('/:id', userActivityController_1.userActivityController.delete);
exports.default = router;
//# sourceMappingURL=userActivityRoutes.js.map