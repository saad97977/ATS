import { Request, Response } from 'express';
import prisma from '../../prisma.config';
import { createCrudController } from '../../factories/crudFactory';
import { createUserActivitySchema, updateUserActivitySchema } from '../../validators/schemas';
import { sendSuccess, sendError } from '../../utils/response';

/**
 * User Activity Controller - CRUD operations for User Activity management
 * Provides: Standard CRUD + custom filtering
 * 
 * Business Context: Tracks user login activity and recent actions
 */

// Generate base CRUD methods
const baseCrudMethods = createCrudController({
  model: prisma.userActivity,
  modelName: 'User Activity',
  idField: 'activity_id',
  createSchema: createUserActivitySchema,
  updateSchema: updateUserActivitySchema,
  defaultLimit: 10,
  maxLimit: 100,
});

/**
 * Get user activity by user_id
 * GET /api/user-activities/user/:userId
 * 
 * Path params:
 * @param {string} userId - The user_id to filter by
 * 
 * Returns the user activity record for the specified user
 */
const getUserActivityByUserId = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return sendError(res, 'User ID is required', 400);
    }

    // Find user activity by user_id
    const userActivity = await prisma.userActivity.findUnique({
      where: { user_id: userId },
      include: {
        user: {
          select: {
            user_id: true,
            name: true,
            email: true,
            status: true,
            created_at: true,
          },
        },
      },
    });

    if (!userActivity) {
      return sendError(res, 'User activity not found', 404);
    }

    return sendSuccess(res, userActivity);
  } catch (err: any) {
    console.error('Error fetching user activity by user_id:', err);
    return sendError(res, 'Failed to fetch user activity', 500);
  }
};

/**
 * Get recent active users (logged in within last N days)
 * GET /api/user-activities/recent
 * 
 * Query params:
 * @param {number} days - Number of days to look back (default: 7)
 * @param {number} page - Page number (default: 1)
 * @param {number} limit - Items per page (default: 10, max: 100)
 */
const getRecentActiveUsers = async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 10));
    const skip = (page - 1) * limit;
    const days = parseInt(req.query.days as string) || 7;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const [activities, total] = await Promise.all([
      prisma.userActivity.findMany({
        where: {
          last_login_at: {
            gte: cutoffDate,
          },
        },
        skip,
        take: limit,
        orderBy: { last_login_at: 'desc' },
        include: {
          user: {
            select: {
              user_id: true,
              name: true,
              email: true,
              status: true,
            },
          },
        },
      }),
      prisma.userActivity.count({
        where: {
          last_login_at: {
            gte: cutoffDate,
          },
        },
      }),
    ]);

    return sendSuccess(res, {
      data: activities,
      paging: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
      filters: {
        days,
        cutoff_date: cutoffDate,
      },
    });
  } catch (err: any) {
    console.error('Error fetching recent active users:', err);
    return sendError(res, 'Failed to fetch recent active users', 500);
  }
};

/**
 * Get inactive users (not logged in for N days)
 * GET /api/user-activities/inactive
 * 
 * Query params:
 * @param {number} days - Number of days of inactivity (default: 30)
 * @param {number} page - Page number (default: 1)
 * @param {number} limit - Items per page (default: 10, max: 100)
 */
const getInactiveUsers = async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 10));
    const skip = (page - 1) * limit;
    const days = parseInt(req.query.days as string) || 30;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const [activities, total] = await Promise.all([
      prisma.userActivity.findMany({
        where: {
          OR: [
            { last_login_at: { lt: cutoffDate } },
            { last_login_at: null },
          ],
        },
        skip,
        take: limit,
        orderBy: { last_login_at: 'asc' },
        include: {
          user: {
            select: {
              user_id: true,
              name: true,
              email: true,
              status: true,
            },
          },
        },
      }),
      prisma.userActivity.count({
        where: {
          OR: [
            { last_login_at: { lt: cutoffDate } },
            { last_login_at: null },
          ],
        },
      }),
    ]);

    return sendSuccess(res, {
      data: activities,
      paging: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
      filters: {
        days,
        cutoff_date: cutoffDate,
      },
    });
  } catch (err: any) {
    console.error('Error fetching inactive users:', err);
    return sendError(res, 'Failed to fetch inactive users', 500);
  }
};

/**
 * Get user activity statistics
 * GET /api/user-activities/stats
 */
const getUserActivityStats = async (req: Request, res: Response) => {
  try {
    const now = new Date();
    
    // Last 7 days
    const last7Days = new Date();
    last7Days.setDate(last7Days.getDate() - 7);
    
    // Last 30 days
    const last30Days = new Date();
    last30Days.setDate(last30Days.getDate() - 30);

    const [
      totalUsers,
      activeLastWeek,
      activeLast30Days,
      neverLoggedIn,
    ] = await Promise.all([
      prisma.userActivity.count(),
      prisma.userActivity.count({
        where: {
          last_login_at: { gte: last7Days },
        },
      }),
      prisma.userActivity.count({
        where: {
          last_login_at: { gte: last30Days },
        },
      }),
      prisma.userActivity.count({
        where: {
          last_login_at: null,
        },
      }),
    ]);

    return sendSuccess(res, {
      total_users: totalUsers,
      active_last_7_days: activeLastWeek,
      active_last_30_days: activeLast30Days,
      never_logged_in: neverLoggedIn,
      inactive: totalUsers - activeLast30Days,
    });
  } catch (err: any) {
    console.error('Error fetching user activity stats:', err);
    return sendError(res, 'Failed to fetch user activity statistics', 500);
  }
};

// Export controller with custom methods
export const userActivityController = {
  ...baseCrudMethods,
  getUserActivityByUserId, // Custom filter by user_id
  getRecentActiveUsers, // Bonus: Get recently active users
  getInactiveUsers, // Bonus: Get inactive users
  getUserActivityStats, // Bonus: Get activity statistics
};