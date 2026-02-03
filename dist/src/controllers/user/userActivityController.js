"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.userActivityController = void 0;
const prisma_config_1 = __importDefault(require("../../prisma.config"));
const crudFactory_1 = require("../../factories/crudFactory");
const schemas_1 = require("../../validators/schemas");
const response_1 = require("../../utils/response");
/**
 * User Activity Controller - Optimized for performance
 * Provides: Standard CRUD + custom filtering with reduced queries
 *
 * Business Context: Tracks user login activity and recent actions
 */
// Helper function to safely parse JSON from Prisma
const parseJsonField = (field) => {
    if (!field)
        return null;
    if (typeof field === 'string') {
        try {
            return JSON.parse(field);
        }
        catch {
            return null;
        }
    }
    // Already an object (Prisma Json type)
    return field;
};
// Generate base CRUD methods
const baseCrudMethods = (0, crudFactory_1.createCrudController)({
    model: prisma_config_1.default.userActivity,
    modelName: 'User Activity',
    idField: 'activity_id',
    createSchema: schemas_1.createUserActivitySchema,
    updateSchema: schemas_1.updateUserActivitySchema,
    defaultLimit: 10,
    maxLimit: 100,
});
/**
 * Get all user activities with their recent actions (OPTIMIZED)
 * GET /api/user-activity/
 *
 * Query params:
 * @param {number} page - Page number (default: 1)
 * @param {number} limit - Items per page (default: 10, max: 100)
 * @param {string} entity_type - Filter by entity type (ORGANIZATION, JOB)
 * @param {string} action_type - Filter by action type (CREATE, UPDATE, DELETE)
 *
 * Returns paginated list of user activities with last_actions array
 */
const getAllUserActivities = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
        const skip = (page - 1) * limit;
        const entityType = req.query.entity_type;
        const actionType = req.query.action_type;
        // Fetch activities with user information
        const [activities, total] = await Promise.all([
            prisma_config_1.default.userActivity.findMany({
                skip,
                take: limit,
                orderBy: { updated_at: 'desc' },
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
            prisma_config_1.default.userActivity.count(),
        ]);
        // Parse and filter last_actions
        const formattedActivities = activities
            .map((activity) => {
            // Safely parse JSON field
            const lastActions = parseJsonField(activity.last_actions);
            const actionsArray = Array.isArray(lastActions) ? lastActions : [];
            // Filter actions based on entity_type and action_type if provided
            let filteredActions = actionsArray;
            if (actionsArray.length > 0 && (entityType || actionType)) {
                filteredActions = actionsArray.filter((action) => {
                    let match = true;
                    if (entityType && action.entity_type !== entityType) {
                        match = false;
                    }
                    if (actionType && action.action_type !== actionType) {
                        match = false;
                    }
                    return match;
                });
            }
            return {
                activity_id: activity.activity_id,
                user_id: activity.user_id,
                user_name: activity.user.name,
                user_email: activity.user.email,
                last_login_at: activity.last_login_at,
                last_actions: filteredActions,
                updated_at: activity.updated_at,
            };
        })
            // Only return activities with matching actions when filters are applied
            .filter((activity) => {
            if ((entityType || actionType) && activity.last_actions.length === 0) {
                return false;
            }
            return true;
        });
        // Calculate action counts for stats
        const organizationActions = formattedActivities.reduce((sum, activity) => sum + (activity.last_actions?.filter((a) => a.entity_type === 'ORGANIZATION').length || 0), 0);
        const jobActions = formattedActivities.reduce((sum, activity) => sum + (activity.last_actions?.filter((a) => a.entity_type === 'JOB').length || 0), 0);
        const totalActions = organizationActions + jobActions;
        return (0, response_1.sendSuccess)(res, {
            data: formattedActivities,
            stats: {
                total_actions: totalActions,
                organization_actions: organizationActions,
                job_actions: jobActions,
            },
            paging: {
                total: formattedActivities.length,
                page,
                limit,
                totalPages: Math.ceil(formattedActivities.length / limit),
            },
            filters: {
                entity_type: entityType || null,
                action_type: actionType || null,
            },
        });
    }
    catch (err) {
        console.error('Error fetching user activities:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch user activities', 500);
    }
};
/**
 * Get activity statistics (lightweight endpoint for stats only)
 * GET /api/user-activity/stats
 *
 * Query params:
 * @param {string} entity_type - Filter by entity type (ORGANIZATION, JOB)
 * @param {string} action_type - Filter by action type (CREATE, UPDATE, DELETE)
 */
const getActivityStats = async (req, res) => {
    try {
        const entityType = req.query.entity_type;
        const actionType = req.query.action_type;
        // Fetch all activities (lightweight - only what we need)
        const activities = await prisma_config_1.default.userActivity.findMany({
            select: {
                last_actions: true,
            },
        });
        let organizationActions = 0;
        let jobActions = 0;
        activities.forEach((activity) => {
            const actions = parseJsonField(activity.last_actions);
            if (Array.isArray(actions)) {
                actions.forEach((action) => {
                    // Apply filters if provided
                    let include = true;
                    if (entityType && action.entity_type !== entityType) {
                        include = false;
                    }
                    if (actionType && action.action_type !== actionType) {
                        include = false;
                    }
                    if (include) {
                        if (action.entity_type === 'ORGANIZATION') {
                            organizationActions++;
                        }
                        else if (action.entity_type === 'JOB') {
                            jobActions++;
                        }
                    }
                });
            }
        });
        const totalActions = organizationActions + jobActions;
        return (0, response_1.sendSuccess)(res, {
            total_actions: totalActions,
            organization_actions: organizationActions,
            job_actions: jobActions,
            filters: {
                entity_type: entityType || null,
                action_type: actionType || null,
            },
        });
    }
    catch (err) {
        console.error('Error fetching activity stats:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch activity statistics', 500);
    }
};
/**
 * Get user activity by user_id
 * GET /api/user-activity/user/:userId
 */
const getUserActivityByUserId = async (req, res) => {
    try {
        const { userId } = req.params;
        if (!userId) {
            return (0, response_1.sendError)(res, 'User ID is required', 400);
        }
        const userActivity = await prisma_config_1.default.userActivity.findUnique({
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
            return (0, response_1.sendError)(res, 'User activity not found', 404);
        }
        const formattedActivity = {
            activity_id: userActivity.activity_id,
            user_id: userActivity.user_id,
            user_name: userActivity.user.name,
            user_email: userActivity.user.email,
            last_login_at: userActivity.last_login_at,
            last_actions: parseJsonField(userActivity.last_actions),
            updated_at: userActivity.updated_at,
            user: userActivity.user,
        };
        return (0, response_1.sendSuccess)(res, formattedActivity);
    }
    catch (err) {
        console.error('Error fetching user activity by user_id:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch user activity', 500);
    }
};
/**
 * Get recent active users (logged in within last N days)
 * GET /api/user-activity/recent
 */
const getRecentActiveUsers = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
        const skip = (page - 1) * limit;
        const days = parseInt(req.query.days) || 7;
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);
        const [activities, total] = await Promise.all([
            prisma_config_1.default.userActivity.findMany({
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
            prisma_config_1.default.userActivity.count({
                where: {
                    last_login_at: {
                        gte: cutoffDate,
                    },
                },
            }),
        ]);
        const formattedActivities = activities.map((activity) => ({
            activity_id: activity.activity_id,
            user_id: activity.user_id,
            user_name: activity.user.name,
            user_email: activity.user.email,
            last_login_at: activity.last_login_at,
            last_actions: parseJsonField(activity.last_actions),
            updated_at: activity.updated_at,
        }));
        return (0, response_1.sendSuccess)(res, {
            data: formattedActivities,
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
    }
    catch (err) {
        console.error('Error fetching recent active users:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch recent active users', 500);
    }
};
/**
 * Get inactive users (not logged in for N days)
 * GET /api/user-activity/inactive
 */
const getInactiveUsers = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
        const skip = (page - 1) * limit;
        const days = parseInt(req.query.days) || 30;
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);
        const [activities, total] = await Promise.all([
            prisma_config_1.default.userActivity.findMany({
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
            prisma_config_1.default.userActivity.count({
                where: {
                    OR: [
                        { last_login_at: { lt: cutoffDate } },
                        { last_login_at: null },
                    ],
                },
            }),
        ]);
        const formattedActivities = activities.map((activity) => ({
            activity_id: activity.activity_id,
            user_id: activity.user_id,
            user_name: activity.user.name,
            user_email: activity.user.email,
            last_login_at: activity.last_login_at,
            last_actions: parseJsonField(activity.last_actions),
            updated_at: activity.updated_at,
        }));
        return (0, response_1.sendSuccess)(res, {
            data: formattedActivities,
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
    }
    catch (err) {
        console.error('Error fetching inactive users:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch inactive users', 500);
    }
};
/**
 * Get user activity statistics summary
 * GET /api/user-activity/summary
 */
const getUserActivitySummary = async (req, res) => {
    try {
        const now = new Date();
        const last7Days = new Date();
        last7Days.setDate(last7Days.getDate() - 7);
        const last30Days = new Date();
        last30Days.setDate(last30Days.getDate() - 30);
        const [totalUsers, activeLastWeek, activeLast30Days, neverLoggedIn,] = await Promise.all([
            prisma_config_1.default.userActivity.count(),
            prisma_config_1.default.userActivity.count({
                where: {
                    last_login_at: { gte: last7Days },
                },
            }),
            prisma_config_1.default.userActivity.count({
                where: {
                    last_login_at: { gte: last30Days },
                },
            }),
            prisma_config_1.default.userActivity.count({
                where: {
                    last_login_at: null,
                },
            }),
        ]);
        return (0, response_1.sendSuccess)(res, {
            total_users: totalUsers,
            active_last_7_days: activeLastWeek,
            active_last_30_days: activeLast30Days,
            never_logged_in: neverLoggedIn,
            inactive: totalUsers - activeLast30Days,
        });
    }
    catch (err) {
        console.error('Error fetching user activity summary:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch user activity summary', 500);
    }
};
// Export controller with custom methods
exports.userActivityController = {
    ...baseCrudMethods,
    getAllUserActivities, // Main endpoint with filtering
    getActivityStats, // Lightweight stats endpoint
    getUserActivityByUserId,
    getRecentActiveUsers,
    getInactiveUsers,
    getUserActivitySummary,
};
//# sourceMappingURL=userActivityController.js.map