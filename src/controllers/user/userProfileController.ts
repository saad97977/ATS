import prisma from '../../prisma.config';
import { Request, Response } from 'express';
import { sendSuccess, sendError } from '../../utils/response';
import { BlobServiceClient } from '@azure/storage-blob';
import bcrypt from 'bcrypt';

// ─── Azure Setup ──────────────────────────────────────────────────────────────

if (!process.env.AZURE_STORAGE_CONNECTION_STRING) {
  throw new Error('AZURE_STORAGE_CONNECTION_STRING is not defined');
}

const blobServiceClient = BlobServiceClient.fromConnectionString(
  process.env.AZURE_STORAGE_CONNECTION_STRING
);

const AVATAR_CONTAINER = process.env.AZURE_USER_AVATARS_CONTAINER || 'user-avatars';
const BCRYPT_ROUNDS = 10;

const getAvatarContainerClient = async () => {
  const containerClient = blobServiceClient.getContainerClient(AVATAR_CONTAINER);
  await containerClient.createIfNotExists({ access: 'blob' });
  return containerClient;
};

const generateAvatarBlobName = (userId: string, originalName: string): string => {
  const ext = originalName.split('.').pop() || 'jpg';
  return `${userId}/avatar-${Date.now()}.${ext}`;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Delete a blob from Azure if it exists.
 * Swallows errors so a stale reference never blocks the update.
 */
const deleteBlobIfExists = async (blobName: string) => {
  try {
    const container = await getAvatarContainerClient();
    const blobClient = container.getBlockBlobClient(blobName);
    await blobClient.deleteIfExists();
  } catch (err) {
    console.warn('[userSettings] Could not delete old blob:', err);
  }
};

/**
 * Validate password strength
 */
const validatePasswordStrength = (password: string): { valid: boolean; message?: string } => {
  if (password.length < 8) {
    return { valid: false, message: 'Password must be at least 8 characters long' };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one lowercase letter' };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one number' };
  }
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one special character' };
  }
  return { valid: true };
};

// ─── Main Controllers ─────────────────────────────────────────────────────────

/**
 * GET /api/user-profile/:user_id/complete-profile
 *
 * Returns comprehensive user data including core user info, profile, and role.
 * For activity data, use the separate /activity-summary endpoint.
 */
export const getCompleteUserProfile = async (req: Request, res: Response) => {
  try {
    const { user_id } = req.params;

    const user = await prisma.user.findUnique({
      where: { user_id },
      select: {
        user_id: true,
        name: true,
        email: true,
        status: true,
        is_admin: true,
        client_office_allow: true,
        back_office_allow: true,
        front_office_allow: true,
        created_at: true,
        updated_at: true,

        user_role: {
          select: {
            role: {
              select: { role_id: true, role_name: true },
            },
          },
        },

        profile: true,
      },
    });

    if (!user) {
      return sendError(res, 'User not found', 404);
    }

    // Flatten role for convenience
    const role = user.user_role?.role ?? null;

    return sendSuccess(res, {
      data: {
        ...user,
        user_role: undefined,
        role,
      },
    });
  } catch (err) {
    console.error('[getCompleteUserProfile]', err);
    return sendError(res, 'Failed to fetch complete user profile', 500);
  }
};

/**
 * GET /api/user-profile/:user_id/settings
 *
 * Returns the full user object merged with their profile for settings page.
 * Safe - never returns password_hash.
 * For activity data, use the separate /activity-summary endpoint.
 */
export const getUserSettings = async (req: Request, res: Response) => {
  try {
    const { user_id } = req.params;

    const user = await prisma.user.findUnique({
      where: { user_id },
      select: {
        user_id: true,
        name: true,
        email: true,
        status: true,
        is_admin: true,
        client_office_allow: true,
        back_office_allow: true,
        front_office_allow: true,
        created_at: true,
        updated_at: true,

        user_role: {
          select: {
            role: {
              select: { role_id: true, role_name: true },
            },
          },
        },

        profile: true,
      },
    });

    if (!user) {
      return sendError(res, 'User not found', 404);
    }

    const role = user.user_role?.role ?? null;

    return sendSuccess(res, {
      data: {
        ...user,
        user_role: undefined,
        role,
      },
    });
  } catch (err) {
    console.error('[getUserSettings]', err);
    return sendError(res, 'Failed to fetch user settings', 500);
  }
};

/**
 * PATCH /api/user-profile/:user_id/settings
 *
 * Updates core User row fields (name, email, office flags).
 * Does NOT update profile – that's a separate endpoint.
 */
export const updateUserSettings = async (req: Request, res: Response) => {
  try {
    const { user_id } = req.params;
    const {
      name,
      email,
      client_office_allow,
      back_office_allow,
      front_office_allow,
    } = req.body;

    const existing = await prisma.user.findUnique({ where: { user_id } });
    if (!existing) return sendError(res, 'User not found', 404);

    const data: Record<string, unknown> = {};
    
    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length === 0) {
        return sendError(res, 'Name cannot be empty', 400);
      }
      data.name = name.trim();
    }
    
    if (email !== undefined) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return sendError(res, 'Invalid email format', 400);
      }
      
      const emailTaken = await prisma.user.findFirst({
        where: { email, user_id: { not: user_id } },
      });
      if (emailTaken) return sendError(res, 'Email is already in use', 409);
      data.email = email.toLowerCase();
    }
    
    if (client_office_allow !== undefined) data.client_office_allow = Boolean(client_office_allow);
    if (back_office_allow !== undefined) data.back_office_allow = Boolean(back_office_allow);
    if (front_office_allow !== undefined) data.front_office_allow = Boolean(front_office_allow);

    if (Object.keys(data).length === 0) {
      return sendError(res, 'No valid fields provided', 400);
    }

    const updated = await prisma.user.update({
      where: { user_id },
      data,
      select: {
        user_id: true,
        name: true,
        email: true,
        status: true,
        is_admin: true,
        client_office_allow: true,
        back_office_allow: true,
        front_office_allow: true,
        updated_at: true,
      },
    });

    return sendSuccess(res, { message: 'User settings updated successfully', data: updated });
  } catch (err: any) {
    console.error('[updateUserSettings]', err);
    if (err.code === 'P2002') return sendError(res, 'Email already in use', 409);
    return sendError(res, 'Failed to update user settings', 500);
  }
};

/**
 * GET /api/user-profile/:user_id/profile
 *
 * Returns the extended profile row.
 * Creates an empty profile on first access (upsert pattern).
 */
export const getUserProfile = async (req: Request, res: Response) => {
  try {
    const { user_id } = req.params;

    const user = await prisma.user.findUnique({ where: { user_id } });
    if (!user) return sendError(res, 'User not found', 404);

    const profile = await prisma.userProfile.upsert({
      where: { user_id },
      create: { user_id },
      update: {},
    });

    return sendSuccess(res, { data: profile });
  } catch (err) {
    console.error('[getUserProfile]', err);
    return sendError(res, 'Failed to fetch profile', 500);
  }
};

/**
 * PATCH /api/user-profile/:user_id/profile
 *
 * Upserts the UserProfile row.
 * All fields optional – only provided keys are written.
 */
export const updateUserProfile = async (req: Request, res: Response) => {
  try {
    const { user_id } = req.params;

    const user = await prisma.user.findUnique({ where: { user_id } });
    if (!user) return sendError(res, 'User not found', 404);

    const ALLOWED_FIELDS = [
      'first_name', 'last_name', 'middle_name', 'display_name',
      'work_phone', 'mobile_phone', 'work_email', 'personal_email',
      'title', 'department', 'branch', 'division', 'office_location',
      'employee_id', 'hire_date', 'employment_status', 'manager_user_id',
      'timezone', 'language',
      'linkedin_url', 'bio',
      'notify_email', 'notify_sms', 'notify_in_app',
    ] as const;

    const data: Record<string, unknown> = {};
    for (const field of ALLOWED_FIELDS) {
      if (req.body[field] !== undefined) {
        data[field] = req.body[field];
      }
    }

    // Validate email fields if provided
    if (data.work_email || data.personal_email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (data.work_email && !emailRegex.test(data.work_email as string)) {
        return sendError(res, 'Invalid work email format', 400);
      }
      if (data.personal_email && !emailRegex.test(data.personal_email as string)) {
        return sendError(res, 'Invalid personal email format', 400);
      }
    }

    // Validate phone numbers (basic validation)
    const phoneRegex = /^[\d\s\-\(\)\+]+$/;
    if (data.work_phone && !phoneRegex.test(data.work_phone as string)) {
      return sendError(res, 'Invalid work phone format', 400);
    }
    if (data.mobile_phone && !phoneRegex.test(data.mobile_phone as string)) {
      return sendError(res, 'Invalid mobile phone format', 400);
    }

    // Coerce hire_date to Date if passed as string
    if (data.hire_date && typeof data.hire_date === 'string') {
      data.hire_date = new Date(data.hire_date);
      if (isNaN((data.hire_date as Date).getTime())) {
        return sendError(res, 'Invalid hire date format', 400);
      }
    }

    // Validate manager_user_id exists if provided
    if (data.manager_user_id) {
      const managerExists = await prisma.user.findUnique({
        where: { user_id: data.manager_user_id as string },
      });
      if (!managerExists) {
        return sendError(res, 'Manager user not found', 404);
      }
      // Prevent self-management
      if (data.manager_user_id === user_id) {
        return sendError(res, 'User cannot be their own manager', 400);
      }
    }

    if (Object.keys(data).length === 0) {
      return sendError(res, 'No valid fields provided', 400);
    }

    const profile = await prisma.userProfile.upsert({
      where: { user_id },
      create: { user_id, ...data },
      update: data,
    });

    return sendSuccess(res, { message: 'Profile updated successfully', data: profile });
  } catch (err: any) {
    console.error('[updateUserProfile]', err);
    if (err.code === 'P2002' && err.meta?.target?.includes('employee_id')) {
      return sendError(res, 'Employee ID is already assigned to another user', 409);
    }
    return sendError(res, 'Failed to update profile', 500);
  }
};

/**
 * POST /api/user-profile/:user_id/profile/avatar
 *
 * Uploads (or replaces) the user's avatar to Azure Blob Storage.
 * Expects multipart/form-data with field name "avatar".
 * Accepts: image/jpeg, image/png, image/webp (max 5 MB enforced by multer middleware)
 */
export const uploadUserAvatar = async (req: Request, res: Response) => {
  try {
    const { user_id } = req.params;
    const file = (req as any).file;

    if (!file) return sendError(res, 'No avatar file provided', 400);

    const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];
    if (!ALLOWED_MIME.includes(file.mimetype)) {
      return sendError(res, 'Avatar must be JPEG, PNG, or WebP', 415);
    }

    // Validate file size (5MB max)
    const MAX_SIZE = 5 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return sendError(res, 'Avatar file size must not exceed 5MB', 413);
    }

    const user = await prisma.user.findUnique({ where: { user_id } });
    if (!user) return sendError(res, 'User not found', 404);

    // Delete old avatar from Azure if one exists
    const existing = await prisma.userProfile.findUnique({ where: { user_id } });
    if (existing?.avatar_blob_name) {
      await deleteBlobIfExists(existing.avatar_blob_name);
    }

    // Upload new avatar
    const container = await getAvatarContainerClient();
    const blobName = generateAvatarBlobName(user_id, file.originalname);
    const blockBlobClient = container.getBlockBlobClient(blobName);

    await blockBlobClient.upload(file.buffer, file.buffer.length, {
      blobHTTPHeaders: { blobContentType: file.mimetype },
      metadata: { userId: user_id, uploadedAt: new Date().toISOString() },
    });

    const avatarUrl = blockBlobClient.url;

    // Upsert profile row with new avatar data
    const profile = await prisma.userProfile.upsert({
      where: { user_id },
      create: { user_id, avatar_url: avatarUrl, avatar_blob_name: blobName },
      update: { avatar_url: avatarUrl, avatar_blob_name: blobName },
    });

    return sendSuccess(res, {
      message: 'Avatar uploaded successfully',
      data: {
        avatar_url: profile.avatar_url,
      },
    });
  } catch (err) {
    console.error('[uploadUserAvatar]', err);
    return sendError(res, 'Failed to upload avatar', 500);
  }
};

/**
 * DELETE /api/user-profile/:user_id/profile/avatar
 *
 * Removes the avatar from Azure Blob Storage and clears the DB reference.
 */
export const deleteUserAvatar = async (req: Request, res: Response) => {
  try {
    const { user_id } = req.params;

    const profile = await prisma.userProfile.findUnique({ where: { user_id } });
    if (!profile) return sendError(res, 'Profile not found', 404);

    if (!profile.avatar_blob_name) {
      return sendError(res, 'No avatar to delete', 404);
    }

    await deleteBlobIfExists(profile.avatar_blob_name);

    await prisma.userProfile.update({
      where: { user_id },
      data: { avatar_url: null, avatar_blob_name: null },
    });

    return sendSuccess(res, { message: 'Avatar removed successfully' });
  } catch (err) {
    console.error('[deleteUserAvatar]', err);
    return sendError(res, 'Failed to delete avatar', 500);
  }
};

/**
 * POST /api/user-profile/:user_id/profile/signature
 *
 * Uploads a signature image (drawn/typed/uploaded) to Azure.
 * Field name: "signature"
 */
export const uploadUserSignature = async (req: Request, res: Response) => {
  try {
    const { user_id } = req.params;
    const file = (req as any).file;

    if (!file) return sendError(res, 'No signature file provided', 400);

    const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];
    if (!ALLOWED_MIME.includes(file.mimetype)) {
      return sendError(res, 'Signature must be JPEG, PNG, WebP, or SVG', 415);
    }

    // Validate file size (2MB max for signatures)
    const MAX_SIZE = 2 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return sendError(res, 'Signature file size must not exceed 2MB', 413);
    }

    const user = await prisma.user.findUnique({ where: { user_id } });
    if (!user) return sendError(res, 'User not found', 404);

    // Delete old signature from Azure
    const existing = await prisma.userProfile.findUnique({ where: { user_id } });
    if (existing?.signature_blob_name) {
      await deleteBlobIfExists(existing.signature_blob_name);
    }

    // Upload new signature
    const container = await getAvatarContainerClient();
    const ext = file.originalname.split('.').pop() || 'png';
    const blobName = `${user_id}/signature-${Date.now()}.${ext}`;
    const blockBlobClient = container.getBlockBlobClient(blobName);

    await blockBlobClient.upload(file.buffer, file.buffer.length, {
      blobHTTPHeaders: { blobContentType: file.mimetype },
      metadata: { userId: user_id, type: 'signature', uploadedAt: new Date().toISOString() },
    });

    const signatureUrl = blockBlobClient.url;

    const profile = await prisma.userProfile.upsert({
      where: { user_id },
      create: { user_id, signature_image_url: signatureUrl, signature_blob_name: blobName },
      update: { signature_image_url: signatureUrl, signature_blob_name: blobName },
    });

    return sendSuccess(res, {
      message: 'Signature uploaded successfully',
      data: { signature_image_url: profile.signature_image_url },
    });
  } catch (err) {
    console.error('[uploadUserSignature]', err);
    return sendError(res, 'Failed to upload signature', 500);
  }
};

/**
 * DELETE /api/user-profile/:user_id/profile/signature
 */
export const deleteUserSignature = async (req: Request, res: Response) => {
  try {
    const { user_id } = req.params;

    const profile = await prisma.userProfile.findUnique({ where: { user_id } });
    if (!profile) return sendError(res, 'Profile not found', 404);

    if (!profile.signature_blob_name) {
      return sendError(res, 'No signature to delete', 404);
    }

    await deleteBlobIfExists(profile.signature_blob_name);

    await prisma.userProfile.update({
      where: { user_id },
      data: { signature_image_url: null, signature_blob_name: null },
    });

    return sendSuccess(res, { message: 'Signature removed successfully' });
  } catch (err) {
    console.error('[deleteUserSignature]', err);
    return sendError(res, 'Failed to delete signature', 500);
  }
};

/**
 * POST /api/user-profile/:user_id/change-password
 *
 * Changes user password with proper verification.
 * Expects { current_password, new_password }.
 * Validates current password, checks new password strength, then hashes and updates.
 */
export const changeUserPassword = async (req: Request, res: Response) => {
  try {
    const { user_id } = req.params;
    const { current_password, new_password } = req.body;

    // Validation
    if (!current_password || !new_password) {
      return sendError(res, 'Both current_password and new_password are required', 400);
    }

    if (typeof current_password !== 'string' || typeof new_password !== 'string') {
      return sendError(res, 'Passwords must be strings', 400);
    }

    // Get user with password_hash
    const user = await prisma.user.findUnique({
      where: { user_id },
      select: { user_id: true, password_hash: true },
    });

    if (!user) {
      return sendError(res, 'User not found', 404);
    }

    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(current_password, user.password_hash);
    if (!isCurrentPasswordValid) {
      return sendError(res, 'Current password is incorrect', 401);
    }

    // Check if new password is same as current
    const isSamePassword = await bcrypt.compare(new_password, user.password_hash);
    if (isSamePassword) {
      return sendError(res, 'New password must be different from current password', 400);
    }

    // Validate new password strength
    const passwordValidation = validatePasswordStrength(new_password);
    if (!passwordValidation.valid) {
      return sendError(res, passwordValidation.message || 'Password does not meet requirements', 400);
    }

    // Hash new password
    const new_password_hash = await bcrypt.hash(new_password, BCRYPT_ROUNDS);

    // Update password
    await prisma.user.update({
      where: { user_id },
      data: { password_hash: new_password_hash },
    });

    return sendSuccess(res, { message: 'Password updated successfully' });
  } catch (err) {
    console.error('[changeUserPassword]', err);
    return sendError(res, 'Failed to update password', 500);
  }
};

/**
 * GET /api/user-profile/:user_id/activity-summary
 *
 * Returns user's recent activity summary including:
 * - Recent tasks
 * - Recent jobs
 * - Recent organizations
 */
export const getUserActivitySummary = async (req: Request, res: Response) => {
  try {
    const { user_id } = req.params;
    const limit = parseInt(req.query.limit as string) || 5;

    const user = await prisma.user.findUnique({ where: { user_id } });
    if (!user) return sendError(res, 'User not found', 404);

    // Get recent tasks assigned to user
    const recentAssignedTasks = await prisma.task.findMany({
      where: { assigned_to_user_id: user_id },
      orderBy: { created_at: 'desc' },
      take: limit,
      select: {
        task_id: true,
        description: true,
        status: true,
        due_date: true,
        created_at: true,
        created_by: {
          select: { user_id: true, name: true },
        },
      },
    });

    // Get recent tasks created by user
    const recentCreatedTasks = await prisma.task.findMany({
      where: { user_id },
      orderBy: { created_at: 'desc' },
      take: limit,
      select: {
        task_id: true,
        description: true,
        status: true,
        due_date: true,
        created_at: true,
        assigned_to: {
          select: { user_id: true, name: true },
        },
      },
    });

    // Get recent jobs created by user
    const recentJobs = await prisma.job.findMany({
      where: { created_by_user_id: user_id },
      orderBy: { created_at: 'desc' },
      take: limit,
      select: {
        job_id: true,
        job_title: true,
        status: true,
        job_type: true,
        location: true,
        created_at: true,
        organization: {
          select: { organization_id: true, name: true },
        },
      },
    });

    // Get recent organizations created by user
    const recentOrganizations = await prisma.organization.findMany({
      where: { created_by_user_id: user_id },
      orderBy: { created_at: 'desc' },
      take: limit,
      select: {
        organization_id: true,
        name: true,
        status: true,
        industry: true,
        created_at: true,
      },
    });

    return sendSuccess(res, {
      data: {
        assigned_tasks: recentAssignedTasks,
        created_tasks: recentCreatedTasks,
        recent_jobs: recentJobs,
        recent_organizations: recentOrganizations,
      },
    });
  } catch (err) {
    console.error('[getUserActivitySummary]', err);
    return sendError(res, 'Failed to fetch activity summary', 500);
  }
};

/**
 * PATCH /api/user-profile/:user_id/preferences
 *
 * Updates user notification preferences
 */
export const updateUserPreferences = async (req: Request, res: Response) => {
  try {
    const { user_id } = req.params;
    const { notify_email, notify_sms, notify_in_app } = req.body;

    const user = await prisma.user.findUnique({ where: { user_id } });
    if (!user) return sendError(res, 'User not found', 404);

    const data: Record<string, unknown> = {};
    if (notify_email !== undefined) data.notify_email = Boolean(notify_email);
    if (notify_sms !== undefined) data.notify_sms = Boolean(notify_sms);
    if (notify_in_app !== undefined) data.notify_in_app = Boolean(notify_in_app);

    if (Object.keys(data).length === 0) {
      return sendError(res, 'No valid preferences provided', 400);
    }

    const profile = await prisma.userProfile.upsert({
      where: { user_id },
      create: { user_id, ...data },
      update: data,
    });

    return sendSuccess(res, {
      message: 'Preferences updated successfully',
      data: {
        notify_email: profile.notify_email,
        notify_sms: profile.notify_sms,
        notify_in_app: profile.notify_in_app,
      },
    });
  } catch (err) {
    console.error('[updateUserPreferences]', err);
    return sendError(res, 'Failed to update preferences', 500);
  }
};

/**
 * GET /api/user-profile/:user_id/dashboard-stats
 *
 * Returns comprehensive dashboard statistics for the user
 */
export const getUserDashboardStats = async (req: Request, res: Response) => {
  try {
    const { user_id } = req.params;

    const user = await prisma.user.findUnique({ where: { user_id } });
    if (!user) return sendError(res, 'User not found', 404);

    // Parallel queries for better performance
    const [
      pendingTasks,
      completedTasks,
      activeJobs,
      totalJobsCreated,
      totalOrgsCreated,
      recentActivity,
    ] = await Promise.all([
      prisma.task.count({
        where: {
          assigned_to_user_id: user_id,
          status: { not: 'COMPLETED' },
        },
      }),
      prisma.task.count({
        where: {
          assigned_to_user_id: user_id,
          status: 'COMPLETED',
        },
      }),
      prisma.job.count({
        where: {
          manager_id: user_id,
          status: 'OPEN',
        },
      }),
      prisma.job.count({
        where: { created_by_user_id: user_id },
      }),
      prisma.organization.count({
        where: { created_by_user_id: user_id },
      }),
      prisma.userActivity.findUnique({
        where: { user_id },
        select: { last_login_at: true, updated_at: true },
      }),
    ]);

    return sendSuccess(res, {
      data: {
        tasks: {
          pending: pendingTasks,
          completed: completedTasks,
          total: pendingTasks + completedTasks,
        },
        jobs: {
          active: activeJobs,
          total_created: totalJobsCreated,
        },
        organizations: {
          total_created: totalOrgsCreated,
        },
        activity: {
          last_login: recentActivity?.last_login_at || null,
          last_activity: recentActivity?.updated_at || null,
        },
      },
    });
  } catch (err) {
    console.error('[getUserDashboardStats]', err);
    return sendError(res, 'Failed to fetch dashboard stats', 500);
  }
};

/**
 * GET /api/user-profile/:user_id/activity-paginated
 *
 * Returns paginated user activity including tasks, jobs, and organizations.
 * Query params: page (default: 1), limit (default: 10, max: 50)
 */
export const getUserActivityPaginated = async (req: Request, res: Response) => {
  try {
    const { user_id } = req.params;
    let page = parseInt(req.query.page as string) || 1;
    let limit = parseInt(req.query.limit as string) || 10;

    // Validation
    if (page < 1) page = 1;
    if (limit < 1) limit = 10;
    if (limit > 50) limit = 50; // Max 50 per page

    const skip = (page - 1) * limit;

    const user = await prisma.user.findUnique({ where: { user_id } });
    if (!user) return sendError(res, 'User not found', 404);

    // Get total counts for each activity type
    const [
      totalAssignedTasks,
      totalCreatedTasks,
      totalJobs,
      totalOrganizations,
    ] = await Promise.all([
      prisma.task.count({ where: { assigned_to_user_id: user_id } }),
      prisma.task.count({ where: { user_id } }),
      prisma.job.count({ where: { created_by_user_id: user_id } }),
      prisma.organization.count({ where: { created_by_user_id: user_id } }),
    ]);

    // Fetch paginated tasks assigned to user
    const assignedTasks = await prisma.task.findMany({
      where: { assigned_to_user_id: user_id },
      orderBy: { created_at: 'desc' },
      skip,
      take: limit,
      select: {
        task_id: true,
        description: true,
        status: true,
        due_date: true,
        created_at: true,
        created_by: {
          select: { user_id: true, name: true },
        },
      },
    });

    // Fetch paginated tasks created by user
    const createdTasks = await prisma.task.findMany({
      where: { user_id },
      orderBy: { created_at: 'desc' },
      skip,
      take: limit,
      select: {
        task_id: true,
        description: true,
        status: true,
        due_date: true,
        created_at: true,
        assigned_to: {
          select: { user_id: true, name: true },
        },
      },
    });

    // Fetch paginated jobs created by user
    const createdJobs = await prisma.job.findMany({
      where: { created_by_user_id: user_id },
      orderBy: { created_at: 'desc' },
      skip,
      take: limit,
      select: {
        job_id: true,
        job_title: true,
        status: true,
        job_type: true,
        location: true,
        created_at: true,
        organization: {
          select: { organization_id: true, name: true },
        },
      },
    });

    // Fetch paginated organizations created by user
    const createdOrganizations = await prisma.organization.findMany({
      where: { created_by_user_id: user_id },
      orderBy: { created_at: 'desc' },
      skip,
      take: limit,
      select: {
        organization_id: true,
        name: true,
        status: true,
        industry: true,
        created_at: true,
      },
    });

    return sendSuccess(res, {
      data: {
        pagination: {
          page,
          limit,
          total_pages: Math.ceil(Math.max(totalAssignedTasks, totalCreatedTasks, totalJobs, totalOrganizations) / limit),
        },
        activities: {
          assigned_tasks: {
            total: totalAssignedTasks,
            data: assignedTasks,
          },
          created_tasks: {
            total: totalCreatedTasks,
            data: createdTasks,
          },
          created_jobs: {
            total: totalJobs,
            data: createdJobs,
          },
          created_organizations: {
            total: totalOrganizations,
            data: createdOrganizations,
          },
        },
      },
    });
  } catch (err) {
    console.error('[getUserActivityPaginated]', err);
    return sendError(res, 'Failed to fetch paginated activity', 500);
  }
};