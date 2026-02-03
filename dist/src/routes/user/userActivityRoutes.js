"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const userActivityController_1 = require("../../controllers/user/userActivityController");
const router = (0, express_1.Router)();
/**
 * User Activity Routes (Optimized)
 * Base path: /api/user-activity
 *
 * Available endpoints:
 * - GET    /api/user-activity              - Get all activities with optional filters
 * - GET    /api/user-activity/stats        - Get activity statistics (lightweight)
 * - GET    /api/user-activity/summary      - Get user activity summary
 * - GET    /api/user-activity/recent       - Get recently active users
 * - GET    /api/user-activity/inactive     - Get inactive users
 * - GET    /api/user-activity/user/:userId - Get activity by user ID
 * - GET    /api/user-activity/:id          - Get by activity ID
 * - POST   /api/user-activity              - Create new activity
 * - PATCH  /api/user-activity/:id          - Update activity
 * - DELETE /api/user-activity/:id          - Delete activity
 */
// ==========================================
// CUSTOM QUERY ROUTES (Must come before /:id)
// ==========================================
/**
 * GET /api/user-activity/stats
 * Lightweight endpoint for fetching stats only
 * Query params: entity_type, action_type
 */
router.get('/stats', userActivityController_1.userActivityController.getActivityStats);
/**
 * GET /api/user-activity/summary
 * Get user activity summary statistics
 */
router.get('/summary', userActivityController_1.userActivityController.getUserActivitySummary);
/**
 * GET /api/user-activity/recent
 * Get recently active users
 * Query params: days, page, limit
 */
router.get('/recent', userActivityController_1.userActivityController.getRecentActiveUsers);
/**
 * GET /api/user-activity/inactive
 * Get inactive users
 * Query params: days, page, limit
 */
router.get('/inactive', userActivityController_1.userActivityController.getInactiveUsers);
/**
 * GET /api/user-activity/user/:userId
 * Get activity by user ID
 */
router.get('/user/:userId', userActivityController_1.userActivityController.getUserActivityByUserId);
// ==========================================
// STANDARD CRUD ROUTES
// ==========================================
/**
 * GET /api/user-activity
 * Get all activities with optional filtering
 * Query params: page, limit, entity_type, action_type
 */
router.get('/', userActivityController_1.userActivityController.getAllUserActivities);
/**
 * GET /api/user-activity/:id
 * Get by activity ID
 */
router.get('/:id', userActivityController_1.userActivityController.getById);
/**
 * POST /api/user-activity
 * Create new activity
 */
router.post('/', userActivityController_1.userActivityController.create);
/**
 * PATCH /api/user-activity/:id
 * Update activity
 */
router.patch('/:id', userActivityController_1.userActivityController.update);
/**
 * DELETE /api/user-activity/:id
 * Delete activity
 */
router.delete('/:id', userActivityController_1.userActivityController.delete);
exports.default = router;
//# sourceMappingURL=userActivityRoutes.js.map