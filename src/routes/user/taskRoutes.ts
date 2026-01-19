import { Router } from 'express';
import { TasksController } from '../../controllers/user/TasksController';

const router = Router();

/**
 * Task Routes
 * Base path: /api/tasks
 * 
 * Available endpoints:
 * - GET    /api/tasks              - Get all tasks (with pagination)
 * - GET    /api/tasks/filter       - Get filtered tasks (by status, user_id, assigned_to_user_id)
 * - GET    /api/tasks/upcoming     - Get upcoming tasks (due in next 7 days)
 * - GET    /api/tasks/stats        - Get task statistics
 * - GET    /api/tasks/:id          - Get task by ID
 * - POST   /api/tasks              - Create new task
 * - PATCH  /api/tasks/:id          - Update task
 * - DELETE /api/tasks/:id          - Delete task
 */

// ==========================================
// CUSTOM QUERY ROUTES (Must come before /:id)
// ==========================================

/**
 * GET /api/tasks/filter
 * Filter tasks by status, user_id, or assigned_to_user_id
 * 
 * Query params:
 * @param {string} status - Filter by task status
 * @param {string} user_id - Filter by creator user_id
 * @param {string} assigned_to_user_id - Filter by assigned user
 * @param {number} page - Page number (default: 1)
 * @param {number} limit - Items per page (default: 10, max: 100)
 * 
 * Example: GET /api/tasks/filter?status=PENDING&assigned_to_user_id=123&page=1&limit=10
 */
router.get('/filter', TasksController.getFilteredTasks);

/**
 * GET /api/tasks/upcoming
 * Get tasks due in the next N days (default: 7)
 * 
 * Query params:
 * @param {number} days - Number of days to look ahead (default: 7)
 * @param {string} assigned_to_user_id - Optional filter by assigned user
 * @param {number} page - Page number (default: 1)
 * @param {number} limit - Items per page (default: 10, max: 100)
 * 
 * Example: GET /api/tasks/upcoming?days=7&assigned_to_user_id=123
 */
router.get('/upcoming', TasksController.getUpcomingTasks);


/**
 * GET /api/tasks/stats
 * Get task statistics (total, by status, upcoming, overdue)
 * 
 * Query params:
 * @param {string} assigned_to_user_id - Optional filter by assigned user
 * 
 * Example: GET /api/tasks/stats
 */
router.get('/stats', TasksController.getTaskStats);

// ==========================================
// STANDARD CRUD ROUTES
// ==========================================

/**
 * GET /api/tasks
 * Get all tasks with pagination
 * 
 * Query params:
 * @param {number} page - Page number (default: 1)
 * @param {number} limit - Items per page (default: 10, max: 100)
 * 
 * Example: GET /api/tasks?page=1&limit=20
 */
router.get('/', TasksController.getAll);

/**
 * GET /api/tasks/:id
 * Get single task by task_id
 * 
 * @param {string} id - task_id (UUID)
 * 
 * Example: GET /api/tasks/550e8400-e29b-41d4-a716-446655440000
 */
router.get('/:id', TasksController.getById);

/**
 * POST /api/tasks
 * Create a new task
 * 
 * Request body:
 * {
 *   "user_id": "uuid",                  // Creator user_id (required)
 *   "assigned_to_user_id": "uuid",      // Assigned user_id (required)
 *   "description": "string",             // Task description (required)
 *   "status": "string",                  // Task status (required)
 *   "due_date": "2025-01-15T10:00:00Z"  // Due date (optional)
 * }
 * 
 * Example:
 * POST /api/tasks
 * Body: {
 *   "user_id": "550e8400-e29b-41d4-a716-446655440000",
 *   "assigned_to_user_id": "650e8400-e29b-41d4-a716-446655440001",
 *   "description": "Review Q4 reports",
 *   "status": "PENDING",
 *   "due_date": "2025-01-15T10:00:00Z"
 * }
 */
router.post('/', TasksController.create);

/**
 * PATCH /api/tasks/:id
 * Update an existing task
 * 
 * @param {string} id - task_id (UUID)
 * 
 * Request body (all fields optional):
 * {
 *   "description": "string",
 *   "status": "string",
 *   "due_date": "2025-01-15T10:00:00Z",
 *   "assigned_to_user_id": "uuid"
 * }
 * 
 * Example:
 * PATCH /api/tasks/550e8400-e29b-41d4-a716-446655440000
 * Body: {
 *   "status": "COMPLETED"
 * }
 */
router.patch('/:id', TasksController.update);

/**
 * DELETE /api/tasks/:id
 * Delete a task
 * 
 * @param {string} id - task_id (UUID)
 * 
 * Example: DELETE /api/tasks/550e8400-e29b-41d4-a716-446655440000
 */
router.delete('/:id', TasksController.delete);

export default router