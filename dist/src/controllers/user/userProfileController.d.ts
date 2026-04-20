import { Request, Response } from 'express';
/**
 * GET /api/user-profile/:user_id/complete-profile
 *
 * Returns comprehensive user data including core user info, profile, and role.
 * For activity data, use the separate /activity-summary endpoint.
 */
export declare const getCompleteUserProfile: (req: Request, res: Response) => Promise<void>;
/**
 * GET /api/user-profile/:user_id/settings
 *
 * Returns the full user object merged with their profile for settings page.
 * Safe - never returns password_hash.
 * For activity data, use the separate /activity-summary endpoint.
 */
export declare const getUserSettings: (req: Request, res: Response) => Promise<void>;
/**
 * PATCH /api/user-profile/:user_id/settings
 *
 * Updates core User row fields (name, email, office flags).
 * Does NOT update profile – that's a separate endpoint.
 */
export declare const updateUserSettings: (req: Request, res: Response) => Promise<void>;
/**
 * GET /api/user-profile/:user_id/profile
 *
 * Returns the extended profile row.
 * Creates an empty profile on first access (upsert pattern).
 */
export declare const getUserProfile: (req: Request, res: Response) => Promise<void>;
/**
 * PATCH /api/user-profile/:user_id/profile
 *
 * Upserts the UserProfile row.
 * All fields optional – only provided keys are written.
 */
export declare const updateUserProfile: (req: Request, res: Response) => Promise<void>;
/**
 * POST /api/user-profile/:user_id/profile/avatar
 *
 * Uploads (or replaces) the user's avatar to Azure Blob Storage.
 * Expects multipart/form-data with field name "avatar".
 * Accepts: image/jpeg, image/png, image/webp (max 5 MB enforced by multer middleware)
 */
export declare const uploadUserAvatar: (req: Request, res: Response) => Promise<void>;
/**
 * DELETE /api/user-profile/:user_id/profile/avatar
 *
 * Removes the avatar from Azure Blob Storage and clears the DB reference.
 */
export declare const deleteUserAvatar: (req: Request, res: Response) => Promise<void>;
/**
 * POST /api/user-profile/:user_id/profile/signature
 *
 * Uploads a signature image (drawn/typed/uploaded) to Azure.
 * Field name: "signature"
 */
export declare const uploadUserSignature: (req: Request, res: Response) => Promise<void>;
/**
 * DELETE /api/user-profile/:user_id/profile/signature
 */
export declare const deleteUserSignature: (req: Request, res: Response) => Promise<void>;
/**
 * POST /api/user-profile/:user_id/change-password
 *
 * Changes user password with proper verification.
 * Expects { current_password, new_password }.
 * Validates current password, checks new password strength, then hashes and updates.
 */
export declare const changeUserPassword: (req: Request, res: Response) => Promise<void>;
/**
 * GET /api/user-profile/:user_id/activity-summary
 *
 * Returns user's recent activity summary including:
 * - Recent tasks
 * - Recent jobs
 * - Recent organizations
 */
export declare const getUserActivitySummary: (req: Request, res: Response) => Promise<void>;
/**
 * PATCH /api/user-profile/:user_id/preferences
 *
 * Updates user notification preferences
 */
export declare const updateUserPreferences: (req: Request, res: Response) => Promise<void>;
/**
 * GET /api/user-profile/:user_id/dashboard-stats
 *
 * Returns comprehensive dashboard statistics for the user
 */
export declare const getUserDashboardStats: (req: Request, res: Response) => Promise<void>;
/**
 * GET /api/user-profile/:user_id/activity-paginated
 *
 * Returns paginated user activity including tasks, jobs, and organizations.
 * Query params: page (default: 1), limit (default: 10, max: 50)
 */
export declare const getUserActivityPaginated: (req: Request, res: Response) => Promise<void>;
//# sourceMappingURL=userProfileController.d.ts.map