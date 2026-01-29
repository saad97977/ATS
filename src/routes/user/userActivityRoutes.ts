import { Router } from 'express';
import { userActivityController } from '../../controllers/user/userActivityController';

const router = Router();

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
router.get('/stats', userActivityController.getActivityStats);

/**
 * GET /api/user-activity/summary
 * Get user activity summary statistics
 */
router.get('/summary', userActivityController.getUserActivitySummary);

/**
 * GET /api/user-activity/recent
 * Get recently active users
 * Query params: days, page, limit
 */
router.get('/recent', userActivityController.getRecentActiveUsers);

/**
 * GET /api/user-activity/inactive
 * Get inactive users
 * Query params: days, page, limit
 */
router.get('/inactive', userActivityController.getInactiveUsers);

/**
 * GET /api/user-activity/user/:userId
 * Get activity by user ID
 */
router.get('/user/:userId', userActivityController.getUserActivityByUserId);

// ==========================================
// STANDARD CRUD ROUTES
// ==========================================

/**
 * GET /api/user-activity
 * Get all activities with optional filtering
 * Query params: page, limit, entity_type, action_type
 */
router.get('/', userActivityController.getAllUserActivities);

/**
 * GET /api/user-activity/:id
 * Get by activity ID
 */
router.get('/:id', userActivityController.getById);

/**
 * POST /api/user-activity
 * Create new activity
 */
router.post('/', userActivityController.create);

/**
 * PATCH /api/user-activity/:id
 * Update activity
 */
router.patch('/:id', userActivityController.update);

/**
 * DELETE /api/user-activity/:id
 * Delete activity
 */
router.delete('/:id', userActivityController.delete);

export default router;