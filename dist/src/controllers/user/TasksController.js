"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TasksController = void 0;
const prisma_config_1 = __importDefault(require("../../prisma.config"));
const crudFactory_1 = require("../../factories/crudFactory");
const schemas_1 = require("../../validators/schemas");
const response_1 = require("../../utils/response");
/**
 * ============================================================================
 * TASK CONTROLLER - Task Management API
 * ============================================================================
 *
 * Handles all task-related operations including CRUD operations, filtering,
 * upcoming tasks, and task statistics.
 *
 * Business Context: Manages tasks assigned to users within an ATS workflow.
 * Tracks task status, assignments, due dates, and task analytics.
 *
 * ============================================================================
 * AVAILABLE ENDPOINTS
 * ============================================================================
 *
 * BASE CRUD OPERATIONS:
 * ─────────────────────────────────────────────────────────────────────────
 * GET    /api/tasks
 *        Retrieve all tasks with pagination
 *        Query Params: page (default: 1), limit (default: 10, max: 100)
 *        Returns: Array of tasks with pagination info
 *
 * GET    /api/tasks/:id
 *        Retrieve a specific task by ID
 *        Params: task_id (required)
 *        Returns: Single task object or 404 error
 *
 * POST   /api/tasks
 *        Create a new task
 *        Body: { title, description, status, user_id, assigned_to_user_id, due_date, ... }
 *        Validation: Uses createTaskSchema
 *        Returns: Created task object with task_id
 *
 * PUT    /api/tasks/:id
 *        Update an existing task
 *        Params: task_id (required)
 *        Body: { title, description, status, assigned_to_user_id, due_date, ... }
 *        Validation: Uses updateTaskSchema
 *        Returns: Updated task object
 *
 * DELETE /api/tasks/:id
 *        Delete a specific task
 *        Params: task_id (required)
 *        Returns: Confirmation message or error
 *
 * CUSTOM ENDPOINTS:
 * ─────────────────────────────────────────────────────────────────────────
 * GET    /api/tasks/filter
 *        Get tasks with advanced filtering capabilities
 *        Query Params:
 *          - status: Filter by task status (e.g., PENDING, IN_PROGRESS, COMPLETED)
 *          - user_id: Filter by creator user_id
 *          - assigned_to_user_id: Filter by assigned user
 *          - page: Page number for pagination (default: 1)
 *          - limit: Items per page (default: 10, max: 100)
 *        Returns: Filtered tasks with pagination and filter metadata
 *        Use Case: Frontend needs to show tasks with multiple filter criteria
 *
 * GET    /api/tasks/upcoming
 *        Retrieve upcoming tasks due within a specified number of days
 *        Query Params:
 *          - days: Number of days to look ahead (default: 7)
 *          - assigned_to_user_id: Optional filter by assigned user
 *          - page: Page number for pagination (default: 1)
 *          - limit: Items per page (default: 10, max: 100)
 *        Returns: Tasks sorted by nearest due date first, with assigned user details
 *        Use Case: Dashboard widget showing tasks due in next 7 days
 *
 * GET    /api/tasks/stats
 *        Get task statistics and analytics
 *        Query Params:
 *          - assigned_to_user_id: Optional filter stats for specific user
 *        Returns: {
 *                   total: number of tasks,
 *                   by_status: [{ status, count }, ...],
 *                   upcoming_next_7_days: number,
 *                   overdue: number
 *                 }
 *        Use Case: Display task summary on dashboard
 *
 * ============================================================================
 */
// Generate base CRUD methods
// These are automatically generated and include standard REST operations:
// - GET /api/tasks (list all with pagination)
// - GET /api/tasks/:id (get single task)
// - POST /api/tasks (create new task)
// - PUT /api/tasks/:id (update existing task)
// - DELETE /api/tasks/:id (delete task)
const baseCrudMethods = (0, crudFactory_1.createCrudController)({
    model: prisma_config_1.default.task,
    modelName: 'Task',
    idField: 'task_id',
    createSchema: schemas_1.createTaskSchema,
    updateSchema: schemas_1.updateTaskSchema,
    defaultLimit: 10,
    maxLimit: 100,
});
/**
 * GET /api/tasks
 * Override default readAll to include assigned_to and created_by user info
 */
const getAllTasks = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
        const skip = (page - 1) * limit;
        const [tasks, total] = await Promise.all([
            prisma_config_1.default.task.findMany({
                skip,
                take: limit,
                orderBy: { created_at: 'desc' },
                include: {
                    assigned_to: {
                        select: { user_id: true, name: true, email: true },
                    },
                    created_by: {
                        select: { user_id: true, name: true, email: true },
                    },
                },
            }),
            prisma_config_1.default.task.count(),
        ]);
        return (0, response_1.sendSuccess)(res, {
            data: tasks,
            paging: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        });
    }
    catch (err) {
        console.error('Error fetching tasks:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch tasks', 500);
    }
};
/**
 * GET /api/tasks/:id
 * Override default read to include assigned_to and created_by user info
 */
const getTaskById = async (req, res) => {
    try {
        const { id } = req.params;
        const task = await prisma_config_1.default.task.findUnique({
            where: { task_id: id },
            include: {
                assigned_to: {
                    select: { user_id: true, name: true, email: true },
                },
                created_by: {
                    select: { user_id: true, name: true, email: true },
                },
            },
        });
        if (!task) {
            return (0, response_1.sendError)(res, 'Task not found', 404);
        }
        return (0, response_1.sendSuccess)(res, task);
    }
    catch (err) {
        console.error('Error fetching task:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch task', 500);
    }
};
/**
 * GET /api/tasks/filter
 * ─────────────────────────────────────────────────────────────────────────
 * Get tasks with advanced filtering by status, creator, or assigned user
 *
 * Query Parameters:
 *   - status (optional): Task status to filter by (e.g., "PENDING", "IN_PROGRESS", "COMPLETED")
 *   - user_id (optional): Creator's user ID to filter by
 *   - assigned_to_user_id (optional): User ID to filter tasks assigned to specific person
 *   - page (optional): Page number for pagination (default: 1)
 *   - limit (optional): Number of items per page (default: 10, max: 100)
 *
 * Example Request:
 *   GET /api/tasks/filter?status=IN_PROGRESS&assigned_to_user_id=user123&page=1&limit=20
 *
 * Response:
 *   {
 *     success: true,
 *     data: [{ task_id, title, status, assigned_to_user_id, due_date, ... }, ...],
 *     paging: { total, page, limit, totalPages },
 *     filters: { status, user_id, assigned_to_user_id }
 *   }
 *
 * Frontend Use Cases:
 *   - Task filter/search page with multiple criteria
 *   - Employee dashboard showing their assigned tasks with status filter
 *   - Manager view of all team tasks by creator
 */
const getFilteredTasks = async (req, res) => {
    try {
        const { status, user_id, assigned_to_user_id } = req.query;
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
        const skip = (page - 1) * limit;
        // Build dynamic where clause
        const whereClause = {};
        if (status) {
            whereClause.status = status;
        }
        if (user_id) {
            whereClause.user_id = user_id;
        }
        if (assigned_to_user_id) {
            whereClause.assigned_to_user_id = assigned_to_user_id;
        }
        // Fetch tasks with filters
        const [tasks, total] = await Promise.all([
            prisma_config_1.default.task.findMany({
                where: whereClause,
                skip,
                take: limit,
                orderBy: { created_at: 'desc' },
                include: {
                    assigned_to: {
                        select: { user_id: true, name: true, email: true },
                    },
                    created_by: {
                        select: { user_id: true, name: true, email: true },
                    },
                },
            }),
            prisma_config_1.default.task.count({
                where: whereClause,
            }),
        ]);
        return (0, response_1.sendSuccess)(res, {
            data: tasks,
            paging: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
            filters: {
                status: status || null,
                user_id: user_id || null,
                assigned_to_user_id: assigned_to_user_id || null,
            },
        });
    }
    catch (err) {
        console.error('Error fetching filtered tasks:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch tasks', 500);
    }
};
/**
 * GET /api/tasks/upcoming
 * ─────────────────────────────────────────────────────────────────────────
 * Retrieve upcoming tasks due within a specified number of days
 * Tasks are sorted by nearest due date first
 *
 * Query Parameters:
 *   - days (optional): Number of days to look ahead (default: 7)
 *   - assigned_to_user_id (optional): Filter by specific assigned user
 *   - page (optional): Page number for pagination (default: 1)
 *   - limit (optional): Number of items per page (default: 10, max: 100)
 *
 * Example Requests:
 *   GET /api/tasks/upcoming                                    (next 7 days)
 *   GET /api/tasks/upcoming?days=14&assigned_to_user_id=user123
 *   GET /api/tasks/upcoming?days=30&page=1&limit=50
 *
 * Response:
 *   {
 *     success: true,
 *     data: [{
 *       task_id, title, status, due_date,
 *       assigned_to: { user_id, name, email },
 *       ...
 *     }, ...],
 *     paging: { total, page, limit, totalPages },
 *     filters: { days, start_date, end_date, assigned_to_user_id }
 *   }
 *
 * Frontend Use Cases:
 *   - Dashboard widget: "Tasks Due in Next 7 Days"
 *   - Task reminder/notification feature
 *   - Upcoming tasks view with user assignment info
 *   - Team workload planning based on upcoming deadlines
 */
const getUpcomingTasks = async (req, res) => {
    try {
        const { assigned_to_user_id } = req.query;
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
        const skip = (page - 1) * limit;
        const days = parseInt(req.query.days) || 7; // Default: next 7 days
        const now = new Date();
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + days);
        // Build where clause
        const whereClause = {
            due_date: {
                gte: now,
                lte: futureDate,
            },
        };
        // Optional filter by assigned user
        if (assigned_to_user_id) {
            whereClause.assigned_to_user_id = assigned_to_user_id;
        }
        const [tasks, total] = await Promise.all([
            prisma_config_1.default.task.findMany({
                where: whereClause,
                skip,
                take: limit,
                orderBy: { due_date: 'asc' }, // Sort by nearest due date first
                include: {
                    assigned_to: {
                        select: {
                            user_id: true,
                            name: true,
                            email: true,
                        },
                    },
                },
            }),
            prisma_config_1.default.task.count({
                where: whereClause,
            }),
        ]);
        return (0, response_1.sendSuccess)(res, {
            data: tasks,
            paging: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
            filters: {
                days,
                start_date: now,
                end_date: futureDate,
                assigned_to_user_id: assigned_to_user_id || null,
            },
        });
    }
    catch (err) {
        console.error('Error fetching upcoming tasks:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch upcoming tasks', 500);
    }
};
/**
 * GET /api/tasks/stats
 * ─────────────────────────────────────────────────────────────────────────
 * Get comprehensive task statistics and analytics
 * Returns counts broken down by status, upcoming, and overdue tasks
 *
 * Query Parameters:
 *   - assigned_to_user_id (optional): Filter statistics for a specific assigned user
 *
 * Example Requests:
 *   GET /api/tasks/stats                           (all tasks stats)
 *   GET /api/tasks/stats?assigned_to_user_id=user123  (user-specific stats)
 *
 * Response:
 *   {
 *     success: true,
 *     data: {
 *       total: 45,
 *       by_status: [
 *         { status: "PENDING", count: 12 },
 *         { status: "IN_PROGRESS", count: 28 },
 *         { status: "COMPLETED", count: 5 }
 *       ],
 *       upcoming_next_7_days: 8,
 *       overdue: 2
 *     }
 *   }
 *
 * Frontend Use Cases:
 *   - Dashboard summary card: "Total Tasks: 45"
 *   - Task status breakdown chart/pie chart
 *   - Alerts for overdue tasks
 *   - User workload summary (upcoming and overdue counts)
 *   - Manager overview of team task metrics
 */
const getTaskStats = async (req, res) => {
    try {
        const { assigned_to_user_id } = req.query;
        const whereClause = {};
        if (assigned_to_user_id) {
            whereClause.assigned_to_user_id = assigned_to_user_id;
        }
        // Get stats by status
        const statsByStatus = await prisma_config_1.default.task.groupBy({
            by: ['status'],
            where: whereClause,
            _count: {
                task_id: true,
            },
        });
        const formattedStats = statsByStatus.map(stat => ({
            status: stat.status,
            count: stat._count.task_id,
        }));
        const total = formattedStats.reduce((sum, stat) => sum + stat.count, 0);
        // Get upcoming count (next 7 days)
        const now = new Date();
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + 7);
        const upcomingCount = await prisma_config_1.default.task.count({
            where: {
                ...whereClause,
                due_date: {
                    gte: now,
                    lte: futureDate,
                },
            },
        });
        // Get overdue count
        const overdueCount = await prisma_config_1.default.task.count({
            where: {
                ...whereClause,
                due_date: {
                    lt: now,
                },
                status: {
                    not: 'COMPLETED',
                },
            },
        });
        return (0, response_1.sendSuccess)(res, {
            total,
            by_status: formattedStats,
            upcoming_next_7_days: upcomingCount,
            overdue: overdueCount,
        });
    }
    catch (err) {
        console.error('Error fetching task stats:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch task statistics', 500);
    }
};
// Export controller with all available methods
// Includes: Standard CRUD methods + custom specialized endpoints
// 
// Summary of exported methods:
//   - create: POST /api/tasks
//   - read: GET /api/tasks/:id
//   - readAll: GET /api/tasks
//   - update: PUT /api/tasks/:id
//   - delete: DELETE /api/tasks/:id
//   - getFilteredTasks: GET /api/tasks/filter (custom)
//   - getUpcomingTasks: GET /api/tasks/upcoming (custom)
//   - getTaskStats: GET /api/tasks/stats (custom)
exports.TasksController = {
    ...baseCrudMethods,
    getAll: getAllTasks, // Override default readAll
    getById: getTaskById, // Override default read
    getFilteredTasks, // Custom filter API
    getUpcomingTasks, // Upcoming tasks API
    getTaskStats, // Bonus: Task statistics API
};
//# sourceMappingURL=TasksController.js.map