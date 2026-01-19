/**
 * Helper function to update user activity log
 * Adds action to last_actions JSON array in user_activities table
 */
declare const updateUserActivity: (userId: string, action: {
    action_type: string;
    entity_type: string;
    entity_id: string;
    entity_name: string;
    timestamp: string;
}) => Promise<void>;
export { updateUserActivity };
//# sourceMappingURL=activityService.d.ts.map