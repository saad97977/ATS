import { Request, Response } from 'express';
import prisma from '../../prisma.config';
import { createCrudController } from '../../factories/crudFactory';
import { createOrganizationUserSchema, updateOrganizationUserSchema } from '../../validators/schemas';
import { sendSuccess, sendError } from '../../utils/response';

/**
 * OrganizationUser Controller - Custom CRUD for OrganizationUser management
 * Provides: GET all, GET by id, GET by organization, GET by user, POST, PATCH, DELETE
 *
 * Validation Rules:
 * - organization_id: Required UUID
 * - user_id: Required UUID
 * - division: Optional string
 * - department: Optional string
 * - title: Optional string
 * - work_phone: Optional string
 *
 * Business Context: Links users to organizations with role and contact details
 * Prevents duplicate user-organization associations
 */

// Generate base CRUD methods
const baseCrudMethods = createCrudController({
  model: prisma.organizationUser,
  modelName: 'OrganizationUser',
  idField: 'organization_user_id',
  createSchema: createOrganizationUserSchema,
  updateSchema: updateOrganizationUserSchema,
  defaultLimit: 10,
  maxLimit: 100,
});

/**
 * Custom create method with duplicate prevention
 * Checks if user is already associated with the organization
 */
const createOrganizationUser = async (req: Request, res: Response) => {
  try {
    // Validate request body
    const validation = createOrganizationUserSchema.safeParse(req.body);
    if (!validation.success) {
      const errors = validation.error.issues.map((err: any) => ({
        field: err.path.join('.'),
        message: err.message,
      }));
      return sendError(res, 'Validation failed', 400, errors);
    }

    const { organization_id, user_id } = req.body;

    // Check if organization exists
    const organization = await prisma.organization.findUnique({
      where: { organization_id },
    });

    if (!organization) {
      return sendError(res, 'Organization not found', 404);
    }

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { user_id },
    });

    if (!user) {
      return sendError(res, 'User not found', 404);
    }

    // Check for duplicate user-organization association
    const existingAssociation = await prisma.organizationUser.findFirst({
      where: {
        organization_id,
        user_id,
        
      },
    });

    if (existingAssociation) {
      return sendError(
        res,
        'User is already associated with this organization',
        409,
        [{
          field: 'duplicate',
          message: `User-Organization association already exists with organization_user_id: ${existingAssociation.organization_user_id}`,
        }]
      );
    }

    // Create new organization user
    const organizationUser = await prisma.organizationUser.create({
      data: req.body,
      include: {
        organization: {
          select: {
            organization_id: true,
            name: true,
            website: true,
            status: true,
          },
        },
        user: {
          select: {
            user_id: true,
            name: true,
            email: true,
            status: true,
          },
        },
      },
    });

    return sendSuccess(res, organizationUser, 201);
  } catch (err: any) {
    console.error('Error creating organization user:', err);

    // Handle foreign key constraint errors
    if (err.code === 'P2003') {
      return sendError(res, 'Related organization or user not found', 404);
    }

    return sendError(res, 'Failed to create organization user', 500);
  }
};

/**
 * Override getById to include full related data
 * GET /api/organization-users/:id
 */
const getOrganizationUserById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!id) {
      return sendError(res, 'OrganizationUser ID is required', 400);
    }

    const organizationUser = await prisma.organizationUser.findUnique({
      where: { organization_user_id: id },
      include: {
        organization: {
          include: {
            addresses: true,
            contacts: true,
          },
        },
        user: {
          include: {
            user_role: {
              include: {
                role: true,
              },
            },
          },
        },
      },
    });

    if (!organizationUser) {
      return sendError(res, 'OrganizationUser not found', 404);
    }

    return sendSuccess(res, organizationUser);
  } catch (err: any) {
    console.error('Error fetching organization user:', err);
    return sendError(res, 'Failed to fetch organization user', 500);
  }
};

/**
 * Get all users for a specific organization
 * GET /api/organization-users/organization/:organizationId
 */
const getUsersByOrganization = async (req: Request, res: Response) => {
  try {
    const { organizationId } = req.params;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 10));
    const skip = (page - 1) * limit;

    if (!organizationId) {
      return sendError(res, 'Organization ID is required', 400);
    }

    const [organizationUsers, total] = await Promise.all([
      prisma.organizationUser.findMany({
        where: {
          organization_id: organizationId,
        },
        skip,
        take: limit,
        orderBy: { organization_user_id: 'desc' },
        include: {
          user: {
            select: {
              user_id: true,
              name: true,
              email: true,
              status: true,
              user_role: {
                include: {
                  role: true,
                },
              },
            },
          },
          organization: {
            select: {
              organization_id: true,
              name: true,
              status: true,
            },
          },
        },
      }),
      prisma.organizationUser.count({
        where: {
          organization_id: organizationId,
        },
      }),
    ]);

    return sendSuccess(res, {
      data: organizationUsers,
      paging: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err: any) {
    console.error('Error fetching users by organization:', err);
    return sendError(res, 'Failed to fetch organization users', 500);
  }
};

/**
 * Get all organizations for a specific user
 * GET /api/organization-users/user/:userId
 */
const getOrganizationsByUser = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 10));
    const skip = (page - 1) * limit;

    if (!userId) {
      return sendError(res, 'User ID is required', 400);
    }

    const [organizationUsers, total] = await Promise.all([
      prisma.organizationUser.findMany({
        where: {
          user_id: userId,
        },
        skip,
        take: limit,
        orderBy: { organization_user_id: 'desc' },
        include: {
          organization: {
            select: {
              organization_id: true,
              name: true,
              website: true,
              status: true,
              phone: true,
            },
          },
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
      prisma.organizationUser.count({
        where: {
          user_id: userId,
        },
      }),
    ]);

    return sendSuccess(res, {
      data: organizationUsers,
      paging: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err: any) {
    console.error('Error fetching organizations by user:', err);
    return sendError(res, 'Failed to fetch user organizations', 500);
  }
};

/**
 * Get organization users by department
 * GET /api/organization-users/department/:department
 */
const getUsersByDepartment = async (req: Request, res: Response) => {
  try {
    const { department } = req.params;
    const { organization_id } = req.query;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 10));
    const skip = (page - 1) * limit;

    if (!department) {
      return sendError(res, 'Department is required', 400);
    }

    const whereClause: any = {
      department: department,
    };

    if (organization_id) {
      whereClause.organization_id = organization_id as string;
    }

    const [organizationUsers, total] = await Promise.all([
      prisma.organizationUser.findMany({
        where: whereClause,
        skip,
        take: limit,
        orderBy: { organization_user_id: 'desc' },
        include: {
          organization: {
            select: {
              organization_id: true,
              name: true,
            },
          },
          user: {
            select: {
              user_id: true,
              name: true,
              email: true,
            },
          },
        },
      }),
      prisma.organizationUser.count({
        where: whereClause,
      }),
    ]);

    return sendSuccess(res, {
      data: organizationUsers,
      paging: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err: any) {
    console.error('Error fetching users by department:', err);
    return sendError(res, 'Failed to fetch organization users', 500);
  }
};

/**
 * Get organization users by division
 * GET /api/organization-users/division/:division
 */
const getUsersByDivision = async (req: Request, res: Response) => {
  try {
    const { division } = req.params;
    const { organization_id } = req.query;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 10));
    const skip = (page - 1) * limit;

    if (!division) {
      return sendError(res, 'Division is required', 400);
    }

    const whereClause: any = {
      division: division,
    };

    if (organization_id) {
      whereClause.organization_id = organization_id as string;
    }

    const [organizationUsers, total] = await Promise.all([
      prisma.organizationUser.findMany({
        where: whereClause,
        skip,
        take: limit,
        orderBy: { organization_user_id: 'desc' },
        include: {
          organization: {
            select: {
              organization_id: true,
              name: true,
            },
          },
          user: {
            select: {
              user_id: true,
              name: true,
              email: true,
            },
          },
        },
      }),
      prisma.organizationUser.count({
        where: whereClause,
      }),
    ]);

    return sendSuccess(res, {
      data: organizationUsers,
      paging: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err: any) {
    console.error('Error fetching users by division:', err);
    return sendError(res, 'Failed to fetch organization users', 500);
  }
};

/**
 * Get organization user statistics
 * GET /api/organization-users/stats
 */
const getOrganizationUserStats = async (req: Request, res: Response) => {
  try {
    const { organization_id } = req.query;

    const whereClause = organization_id ? { organization_id: organization_id as string } : {};

    const [totalUsers, byDepartment, byDivision] = await Promise.all([
      prisma.organizationUser.count({
        where: whereClause,
      }),
      prisma.organizationUser.groupBy({
        by: ['department'],
        where: whereClause,
        _count: {
          organization_user_id: true,
        },
      }),
      prisma.organizationUser.groupBy({
        by: ['division'],
        where: whereClause,
        _count: {
          organization_user_id: true,
        },
      }),
    ]);

    const formattedDepartmentStats = byDepartment.map(stat => ({
      department: stat.department || 'Unassigned',
      count: stat._count.organization_user_id,
    }));

    const formattedDivisionStats = byDivision.map(stat => ({
      division: stat.division || 'Unassigned',
      count: stat._count.organization_user_id,
    }));

    return sendSuccess(res, {
      total: totalUsers,
      by_department: formattedDepartmentStats,
      by_division: formattedDivisionStats,
    });
  } catch (err: any) {
    console.error('Error fetching organization user stats:', err);
    return sendError(res, 'Failed to fetch organization user statistics', 500);
  }
};

// Export controller with custom methods
export const organizationUserController = {
  ...baseCrudMethods,
  create: createOrganizationUser, // Override create method with duplicate prevention
  getById: getOrganizationUserById, // Override with full details
  getUsersByOrganization, // Custom query by organization
  getOrganizationsByUser, // Custom query by user
  getUsersByDepartment, // Custom query by department
  getUsersByDivision, // Custom query by division
  getOrganizationUserStats, // Get statistics
};