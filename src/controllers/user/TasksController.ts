import { Request, Response } from 'express';
import prisma from '../../prisma.config';
import { createCrudController } from '../../factories/crudFactory';
import { createTaskSchema, updateTaskSchema } from '../../validators/schemas';
import { sendSuccess, sendError } from '../../utils/response';

/**
 * Task Controller - CRUD operations for Task management
 * Provides: Standard CRUD + custom filtering and queries
 * 
 * Business Context: Manages tasks assigned to users
 * Tracks task status, assignments, and due dates
 */

// Generate base CRUD methods
const baseCrudMethods = createCrudController({
  model: prisma.task,
  modelName: 'Task',
  idField: 'task_id',
  createSchema: createTaskSchema,
  updateSchema: updateTaskSchema,
  defaultLimit: 10,
  maxLimit: 100,
});

/**
 * Get tasks with filters (status, user_id, assigned_to_user_id)
 * GET /api/tasks/filter
 * 
 * Query params:
 * - status: Filter by task status
 * - user_id: Filter by creator user_id
 * - assigned_to_user_id: Filter by assigned user
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 10, max: 100)
 */
const getFilteredTasks = async (req: Request, res: Response) => {
  try {
    const { status, user_id, assigned_to_user_id } = req.query;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 10));
    const skip = (page - 1) * limit;

    // Build dynamic where clause
    const whereClause: any = {};

    if (status) {
      whereClause.status = status as string;
    }

    if (user_id) {
      whereClause.user_id = user_id as string;
    }

    if (assigned_to_user_id) {
      whereClause.assigned_to_user_id = assigned_to_user_id as string;
    }

    // Fetch tasks with filters
    const [tasks, total] = await Promise.all([
      prisma.task.findMany({
        where: whereClause,
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
      }),
      prisma.task.count({
        where: whereClause,
      }),
    ]);

    return sendSuccess(res, {
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
  } catch (err: any) {
    console.error('Error fetching filtered tasks:', err);
    return sendError(res, 'Failed to fetch tasks', 500);
  }
};

/**
 * Get upcoming tasks (due in next 7 days)
 * GET /api/tasks/upcoming
 * 
 * Query params:
 * - days: Number of days to look ahead (default: 7)
 * - assigned_to_user_id: Optional filter by assigned user
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 10, max: 100)
 */
const getUpcomingTasks = async (req: Request, res: Response) => {
  try {
    const { assigned_to_user_id } = req.query;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 10));
    const skip = (page - 1) * limit;
    const days = parseInt(req.query.days as string) || 7; // Default: next 7 days

    const now = new Date();
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + days);

    // Build where clause
    const whereClause: any = {
      due_date: {
        gte: now,
        lte: futureDate,
      },
    };

    // Optional filter by assigned user
    if (assigned_to_user_id) {
      whereClause.assigned_to_user_id = assigned_to_user_id as string;
    }

    const [tasks, total] = await Promise.all([
      prisma.task.findMany({
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
      prisma.task.count({
        where: whereClause,
      }),
    ]);

    return sendSuccess(res, {
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
  } catch (err: any) {
    console.error('Error fetching upcoming tasks:', err);
    return sendError(res, 'Failed to fetch upcoming tasks', 500);
  }
};


/**
 * Get task statistics
 * GET /api/tasks/stats
 */
const getTaskStats = async (req: Request, res: Response) => {
  try {
    const { assigned_to_user_id } = req.query;

    const whereClause: any = {};
    if (assigned_to_user_id) {
      whereClause.assigned_to_user_id = assigned_to_user_id as string;
    }

    // Get stats by status
    const statsByStatus = await prisma.task.groupBy({
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

    const upcomingCount = await prisma.task.count({
      where: {
        ...whereClause,
        due_date: {
          gte: now,
          lte: futureDate,
        },
      },
    });

    // Get overdue count
    const overdueCount = await prisma.task.count({
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

    return sendSuccess(res, {
      total,
      by_status: formattedStats,
      upcoming_next_7_days: upcomingCount,
      overdue: overdueCount,
    });
  } catch (err: any) {
    console.error('Error fetching task stats:', err);
    return sendError(res, 'Failed to fetch task statistics', 500);
  }
};

// Export controller with custom methods
export const TasksController = {
  ...baseCrudMethods,
  getFilteredTasks, // Custom filter API
  getUpcomingTasks, // Upcoming tasks API
  getTaskStats, // Bonus: Task statistics API
};