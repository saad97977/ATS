"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateUserActivity = void 0;
const prisma_config_1 = __importDefault(require("../prisma.config"));
/**
 * Helper function to update user activity log
 * Adds action to last_actions JSON array in user_activities table
 */
const updateUserActivity = async (userId, action) => {
    try {
        // Check if user activity exists
        const existingActivity = await prisma_config_1.default.userActivity.findUnique({
            where: { user_id: userId },
        });
        if (existingActivity) {
            // Get existing actions or initialize empty array
            const currentActions = existingActivity.last_actions || [];
            // Add new action at the beginning (most recent first)
            const updatedActions = [action, ...currentActions];
            // Keep only last 50 actions to prevent JSON from growing too large
            const trimmedActions = updatedActions.slice(0, 50);
            // Update existing activity
            await prisma_config_1.default.userActivity.update({
                where: { user_id: userId },
                data: {
                    last_actions: trimmedActions,
                },
            });
        }
        else {
            // Create new user activity record
            await prisma_config_1.default.userActivity.create({
                data: {
                    user_id: userId,
                    last_actions: [action],
                },
            });
        }
    }
    catch (error) {
        console.error('Error updating user activity:', error);
        // Don't throw error - activity logging shouldn't break the main operation
    }
};
exports.updateUserActivity = updateUserActivity;
//# sourceMappingURL=activityService.js.map