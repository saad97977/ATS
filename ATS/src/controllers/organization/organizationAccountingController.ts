import { Request, Response } from 'express';
import prisma from '../../prisma.config';
import { createCrudController } from '../../factories/crudFactory';
import { createOrganizationAccountingSchema, updateOrganizationAccountingSchema } from '../../validators/schemas';
import { sendSuccess, sendError } from '../../utils/response';

/**
 * OrganizationAccounting Controller - Custom CRUD for Organization Accounting management
 * Provides: GET all, GET by id, GET by organization, POST, PATCH, DELETE
 *
 * Validation Rules:
 * - organization_id: Required UUID (unique per account)
 * - account_type: Required string
 * - bank_name: Required string
 * - account_number: Required string (unique)
 * - routing_number: Required string (unique)
 * - country: Required string
 *
 * Business Context: Manages banking and accounting information for organizations
 * Supports multiple accounts per organization with different account types
 */

// Generate base CRUD methods
const baseCrudMethods = createCrudController({
  model: prisma.organizationAccounting,
  modelName: 'OrganizationAccounting',
  idField: 'organization_accounting_id',
  createSchema: createOrganizationAccountingSchema,
  updateSchema: updateOrganizationAccountingSchema,
  defaultLimit: 10,
  maxLimit: 100,
});

/**
 * Custom create method with organization validation and duplicate prevention
 * Ensures unique combination of organization_id, account_number, and routing_number
 */
const createOrganizationAccounting = async (req: Request, res: Response) => {
  try {
    // Validate request body
    const validation = createOrganizationAccountingSchema.safeParse(req.body);
    if (!validation.success) {
      const errors = validation.error.issues.map((err: any) => ({
        field: err.path.join('.'),
        message: err.message,
      }));
      return sendError(res, 'Validation failed', 400, errors);
    }

    const { organization_id, account_number, routing_number, account_type, bank_name } = req.body;

    // Check if organization exists
    const organization = await prisma.organization.findUnique({
      where: { organization_id },
    });

    if (!organization) {
      return sendError(res, 'Organization not found', 404);
    }

    // Normalize account and routing numbers (remove spaces and special characters)
    const normalizedAccountNumber = account_number.replace(/[\s-]/g, '').trim();
    const normalizedRoutingNumber = routing_number.replace(/[\s-]/g, '').trim();

    // Check if this exact account already exists for this organization
    const duplicateForOrg = await prisma.organizationAccounting.findFirst({
      where: {
        organization_id,
        account_number: normalizedAccountNumber,
        routing_number: normalizedRoutingNumber,
      },
    });

    if (duplicateForOrg) {
      return sendError(
        res,
        'This bank account is already registered for this organization',
        409,
        [{
          field: 'duplicate',
          message: `Account already exists for this organization (Account ID: ${duplicateForOrg.organization_accounting_id})`,
        }]
      );
    }

    // Check if account_number already exists globally (across all organizations)
    const duplicateAccountNumber = await prisma.organizationAccounting.findFirst({
      where: {
        account_number: normalizedAccountNumber,
      },
      include: {
        organization: {
          select: {
            organization_id: true,
            name: true,
          },
        },
      },
    });

    if (duplicateAccountNumber) {
      return sendError(
        res,
        'This account number is already registered',
        409,
        [{
          field: 'account_number',
          message: `Account number already exists for organization: ${duplicateAccountNumber.organization.name} (Account ID: ${duplicateAccountNumber.organization_accounting_id})`,
        }]
      );
    }

    // Check if routing_number with same account exists globally
    const duplicateRoutingAndAccount = await prisma.organizationAccounting.findFirst({
      where: {
        routing_number: normalizedRoutingNumber,
        account_number: normalizedAccountNumber,
      },
      include: {
        organization: {
          select: {
            organization_id: true,
            name: true,
          },
        },
      },
    });

    if (duplicateRoutingAndAccount) {
      return sendError(
        res,
        'This routing number and account number combination already exists',
        409,
        [{
          field: 'routing_number',
          message: `Routing and account number combination already exists for organization: ${duplicateRoutingAndAccount.organization.name}`,
        }]
      );
    }

    // Normalize data before creating
    const normalizedData = {
      ...req.body,
      account_number: normalizedAccountNumber,
      routing_number: normalizedRoutingNumber,
      account_type: account_type.trim(),
      bank_name: bank_name.trim(),
      country: req.body.country.trim(),
    };

    // Create new organization accounting record
    const accounting = await prisma.organizationAccounting.create({
      data: normalizedData,
      include: {
        organization: {
          select: {
            organization_id: true,
            name: true,
            website: true,
            phone: true,
          },
        },
      },
    });

    return sendSuccess(res, accounting, 201);
  } catch (err: any) {
    console.error('Error creating organization accounting:', err);

    // Handle foreign key constraint (organization doesn't exist)
    if (err.code === 'P2003') {
      return sendError(res, 'Related organization not found', 404);
    }

    // Handle unique constraint violations
    if (err.code === 'P2002') {
      return sendError(res, 'Account with these details already exists', 409);
    }

    return sendError(res, 'Failed to create organization accounting', 500);
  }
};

/**
 * Override getById to include full related data
 * GET /api/organization-accounting/:id
 */
const getOrganizationAccountingById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!id) {
      return sendError(res, 'Organization Accounting ID is required', 400);
    }

    const accounting = await prisma.organizationAccounting.findUnique({
      where: { organization_accounting_id: id },
      include: {
        organization: {
          select: {
            organization_id: true,
            name: true,
            website: true,
            phone: true,
            status: true,
          },
        },
      },
    });

    if (!accounting) {
      return sendError(res, 'Organization accounting record not found', 404);
    }

    return sendSuccess(res, accounting);
  } catch (err: any) {
    console.error('Error fetching organization accounting:', err);
    return sendError(res, 'Failed to fetch organization accounting', 500);
  }
};

/**
 * Get all accounting records for a specific organization
 * GET /api/organization-accounting/organization/:organizationId
 */
const getAccountingByOrganization = async (req: Request, res: Response) => {
  try {
    const { organizationId } = req.params;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 10));
    const skip = (page - 1) * limit;

    if (!organizationId) {
      return sendError(res, 'Organization ID is required', 400);
    }

    const [accounts, total] = await Promise.all([
      prisma.organizationAccounting.findMany({
        where: {
          organization_id: organizationId,
        },
        skip,
        take: limit,
        orderBy: { account_type: 'asc' },
        include: {
          organization: {
            select: {
              organization_id: true,
              name: true,
              website: true,
            },
          },
        },
      }),
      prisma.organizationAccounting.count({
        where: {
          organization_id: organizationId,
        },
      }),
    ]);

    return sendSuccess(res, {
      data: accounts,
      paging: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err: any) {
    console.error('Error fetching accounting by organization:', err);
    return sendError(res, 'Failed to fetch organization accounting records', 500);
  }
};

/**
 * Get accounting records by account type
 * GET /api/organization-accounting/type/:accountType
 */
const getAccountingByType = async (req: Request, res: Response) => {
  try {
    const { accountType } = req.params;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 10));
    const skip = (page - 1) * limit;

    if (!accountType) {
      return sendError(res, 'Account type is required', 400);
    }

    const [accounts, total] = await Promise.all([
      prisma.organizationAccounting.findMany({
        where: {
          account_type: {
            contains: accountType,
            mode: 'insensitive',
          },
        },
        skip,
        take: limit,
        orderBy: { bank_name: 'asc' },
        include: {
          organization: {
            select: {
              organization_id: true,
              name: true,
              website: true,
              status: true,
            },
          },
        },
      }),
      prisma.organizationAccounting.count({
        where: {
          account_type: {
            contains: accountType,
            mode: 'insensitive',
          },
        },
      }),
    ]);

    return sendSuccess(res, {
      data: accounts,
      paging: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err: any) {
    console.error('Error fetching accounting by type:', err);
    return sendError(res, 'Failed to fetch organization accounting records', 500);
  }
};

/**
 * Get accounting records by bank name
 * GET /api/organization-accounting/bank/:bankName
 */
const getAccountingByBank = async (req: Request, res: Response) => {
  try {
    const { bankName } = req.params;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 10));
    const skip = (page - 1) * limit;

    if (!bankName) {
      return sendError(res, 'Bank name is required', 400);
    }

    const [accounts, total] = await Promise.all([
      prisma.organizationAccounting.findMany({
        where: {
          bank_name: {
            contains: bankName,
            mode: 'insensitive',
          },
        },
        skip,
        take: limit,
        orderBy: { bank_name: 'asc' },
        include: {
          organization: {
            select: {
              organization_id: true,
              name: true,
              website: true,
            },
          },
        },
      }),
      prisma.organizationAccounting.count({
        where: {
          bank_name: {
            contains: bankName,
            mode: 'insensitive',
          },
        },
      }),
    ]);

    return sendSuccess(res, {
      data: accounts,
      paging: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err: any) {
    console.error('Error fetching accounting by bank:', err);
    return sendError(res, 'Failed to fetch organization accounting records', 500);
  }
};

/**
 * Get accounting records by country
 * GET /api/organization-accounting/country/:country
 */
const getAccountingByCountry = async (req: Request, res: Response) => {
  try {
    const { country } = req.params;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 10));
    const skip = (page - 1) * limit;

    if (!country) {
      return sendError(res, 'Country is required', 400);
    }

    const [accounts, total] = await Promise.all([
      prisma.organizationAccounting.findMany({
        where: {
          country: {
            contains: country,
            mode: 'insensitive',
          },
        },
        skip,
        take: limit,
        orderBy: { bank_name: 'asc' },
        include: {
          organization: {
            select: {
              organization_id: true,
              name: true,
              website: true,
            },
          },
        },
      }),
      prisma.organizationAccounting.count({
        where: {
          country: {
            contains: country,
            mode: 'insensitive',
          },
        },
      }),
    ]);

    return sendSuccess(res, {
      data: accounts,
      paging: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err: any) {
    console.error('Error fetching accounting by country:', err);
    return sendError(res, 'Failed to fetch organization accounting records', 500);
  }
};

/**
 * Get accounting statistics
 * GET /api/organization-accounting/stats
 */
const getAccountingStats = async (req: Request, res: Response) => {
  try {
    const [totalAccounts, byAccountType, byCountry, organizationsWithoutAccounting] = await Promise.all([
      prisma.organizationAccounting.count(),
      prisma.organizationAccounting.groupBy({
        by: ['account_type'],
        _count: {
          organization_accounting_id: true,
        },
      }),
      prisma.organizationAccounting.groupBy({
        by: ['country'],
        _count: {
          organization_accounting_id: true,
        },
      }),
      prisma.organization.count({
        where: {
          accounting: {
            none: {},
          },
          status: 'ACTIVE',
        },
      }),
    ]);

    const accountTypeStats = byAccountType.map(stat => ({
      account_type: stat.account_type,
      count: stat._count.organization_accounting_id,
    }));

    const countryStats = byCountry.map(stat => ({
      country: stat.country,
      count: stat._count.organization_accounting_id,
    }));

    return sendSuccess(res, {
      total: totalAccounts,
      by_account_type: accountTypeStats,
      by_country: countryStats,
      organizations_without_accounting: organizationsWithoutAccounting,
    });
  } catch (err: any) {
    console.error('Error fetching accounting stats:', err);
    return sendError(res, 'Failed to fetch accounting statistics', 500);
  }
};

// Export controller with custom methods
export const organizationAccountingController = {
  ...baseCrudMethods,
  create: createOrganizationAccounting, // Override create method
  getById: getOrganizationAccountingById, // Override with full details
  getAccountingByOrganization, // Custom query by organization
  getAccountingByType, // Custom query by account type
  getAccountingByBank, // Custom query by bank name
  getAccountingByCountry, // Custom query by country
  getAccountingStats, // Get accounting statistics
};