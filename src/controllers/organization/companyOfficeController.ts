import { Request, Response } from 'express';
import prisma from '../../prisma.config';
import { createCrudController } from '../../factories/crudFactory';
import { createCompanyOfficeSchema, updateCompanyOfficeSchema } from '../../validators/schemas';
import { sendSuccess, sendError } from '../../utils/response';

/**
 * CompanyOffice Controller - Custom CRUD for Company Office management
 * Provides: GET all, GET by id, GET by organization, GET by type, POST, PATCH, DELETE
 *
 * Validation Rules:
 * - organization_id: Required UUID
 * - office_name: Required string
 * - city: Required string
 * - state: Required string
 * - country: Required string
 * - type: Required enum (REMOTE, HYBRID, ONSITE)
 * - address: Optional string
 * - is_primary: Optional boolean (default: false)
 *
 * Business Context: Manages company office locations for organizations
 * Tracks office types and primary office designation
 */

// Generate base CRUD methods
const baseCrudMethods = createCrudController({
  model: prisma.companyOffice,
  modelName: 'CompanyOffice',
  idField: 'company_office_id',
  createSchema: createCompanyOfficeSchema,
  updateSchema: updateCompanyOfficeSchema,
  defaultLimit: 10,
  maxLimit: 100,
});


/**
 * Custom create method with organization validation and primary office handling
 */
const createCompanyOffice = async (req: Request, res: Response) => {
  try {
    // Validate request body
    const validation = createCompanyOfficeSchema.safeParse(req.body);
    if (!validation.success) {
      const errors = validation.error.issues.map((err: any) => ({
        field: err.path.join('.'),
        message: err.message,
      }));
      return sendError(res, 'Validation failed', 400, errors);
    }

    const { organization_id, office_name, is_primary, type, address } = req.body;

    // Check if type is not REMOTE, then address is required
    if (type !== 'REMOTE' && !address) {
      return sendError(
        res,
        'Address is required for non-remote offices',
        400,
        [{
          field: 'address',
          message: 'Address is required when office type is HYBRID or ONSITE',
        }]
      );
    }

    // Check if organization exists
    const organization = await prisma.organization.findUnique({
      where: { organization_id },
    });

    if (!organization) {
      return sendError(res, 'Organization not found', 404);
    }

    // Check if office with same name already exists for this organization
    const existingOffice = await prisma.companyOffice.findFirst({
      where: {
        organization_id,
        office_name,
      },
    });

    if (existingOffice) {
      return sendError(
        res,
        'Office with this name already exists for this organization',
        409,
        [{
          field: 'office_name',
          message: `An office named "${office_name}" already exists for this organization`,
        }]
      );
    }

    // If setting as primary, unset other primary offices for this organization
    if (is_primary) {
      await prisma.companyOffice.updateMany({
        where: {
          organization_id,
          is_primary: true,
        },
        data: {
          is_primary: false,
        },
      });
    }

    // Create new company office
    const companyOffice = await prisma.companyOffice.create({
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
      },
    });

    return sendSuccess(res, companyOffice, 201);
  } catch (err: any) {
    console.error('Error creating company office:', err);

    // Handle foreign key constraint (organization doesn't exist)
    if (err.code === 'P2003') {
      return sendError(res, 'Related organization not found', 404);
    }

    return sendError(res, 'Failed to create company office', 500);
  }
};

/**
 * Custom update method with primary office handling
 */
const updateCompanyOffice = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!id) {
      return sendError(res, 'Company Office ID is required', 400);
    }

    // Validate request body
    const validation = updateCompanyOfficeSchema.safeParse(req.body);
    if (!validation.success) {
      const errors = validation.error.issues.map((err: any) => ({
        field: err.path.join('.'),
        message: err.message,
      }));
      return sendError(res, 'Validation failed', 400, errors);
    }

    // Check if office exists
    const existingOffice = await prisma.companyOffice.findUnique({
      where: { company_office_id: id },
    });

    if (!existingOffice) {
      return sendError(res, 'Company Office not found', 404);
    }

    // Determine the final type and address after update
    const finalType = req.body.type || existingOffice.type;
    const finalAddress = req.body.address !== undefined ? req.body.address : existingOffice.address;

    // Check if type is not REMOTE, then address is required
    if (finalType !== 'REMOTE' && !finalAddress) {
      return sendError(
        res,
        'Address is required for non-remote offices',
        400,
        [{
          field: 'address',
          message: 'Address is required when office type is HYBRID or ONSITE',
        }]
      );
    }

    // If updating office_name, check for duplicates in the same organization
    if (req.body.office_name && req.body.office_name !== existingOffice.office_name) {
      const duplicateOffice = await prisma.companyOffice.findFirst({
        where: {
          organization_id: existingOffice.organization_id,
          office_name: req.body.office_name,
          company_office_id: {
            not: id,
          },
        },
      });

      if (duplicateOffice) {
        return sendError(
          res,
          'Office with this name already exists for this organization',
          409,
          [{
            field: 'office_name',
            message: `An office named "${req.body.office_name}" already exists for this organization`,
          }]
        );
      }
    }

    // If setting as primary, unset other primary offices for this organization
    if (req.body.is_primary === true) {
      await prisma.companyOffice.updateMany({
        where: {
          organization_id: existingOffice.organization_id,
          is_primary: true,
          company_office_id: {
            not: id,
          },
        },
        data: {
          is_primary: false,
        },
      });
    }

    // Update company office
    const companyOffice = await prisma.companyOffice.update({
      where: { company_office_id: id },
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
      },
    });

    return sendSuccess(res, companyOffice);
  } catch (err: any) {
    console.error('Error updating company office:', err);

    if (err.code === 'P2025') {
      return sendError(res, 'Company Office not found', 404);
    }

    return sendError(res, 'Failed to update company office', 500);
  }
};


/**
 * Override getById to include organization details
 * GET /api/company-offices/:id
 */
const getCompanyOfficeById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!id) {
      return sendError(res, 'Company Office ID is required', 400);
    }

    const companyOffice = await prisma.companyOffice.findUnique({
      where: { company_office_id: id },
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
      },
    });

    if (!companyOffice) {
      return sendError(res, 'Company Office not found', 404);
    }

    return sendSuccess(res, companyOffice);
  } catch (err: any) {
    console.error('Error fetching company office:', err);
    return sendError(res, 'Failed to fetch company office', 500);
  }
};

/**
 * Get all offices for a specific organization
 * GET /api/company-offices/organization/:organizationId
 */
const getOfficesByOrganization = async (req: Request, res: Response) => {
  try {
    const { organizationId } = req.params;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 10));
    const skip = (page - 1) * limit;

    if (!organizationId) {
      return sendError(res, 'Organization ID is required', 400);
    }

    const [offices, total] = await Promise.all([
      prisma.companyOffice.findMany({
        where: {
          organization_id: organizationId,
        },
        skip,
        take: limit,
        orderBy: [
          { is_primary: 'desc' },
          { office_name: 'asc' },
        ],
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
      prisma.companyOffice.count({
        where: {
          organization_id: organizationId,
        },
      }),
    ]);

    return sendSuccess(res, {
      data: offices,
      paging: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err: any) {
    console.error('Error fetching offices by organization:', err);
    return sendError(res, 'Failed to fetch company offices', 500);
  }
};

/**
 * Get offices by type
 * GET /api/company-offices/type/:type
 */
const getOfficesByType = async (req: Request, res: Response) => {
  try {
    const { type } = req.params;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 10));
    const skip = (page - 1) * limit;

    if (!type) {
      return sendError(res, 'Office type is required', 400);
    }

    const validTypes = ['REMOTE', 'HYBRID', 'ONSITE'];
    const upperType = type.toUpperCase();

    if (!validTypes.includes(upperType)) {
      return sendError(
        res,
        `Invalid office type. Must be one of: ${validTypes.join(', ')}`,
        400
      );
    }

    const [offices, total] = await Promise.all([
      prisma.companyOffice.findMany({
        where: {
          type: upperType as any,
        },
        skip,
        take: limit,
        orderBy: { office_name: 'asc' },
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
      prisma.companyOffice.count({
        where: {
          type: upperType as any,
        },
      }),
    ]);

    return sendSuccess(res, {
      data: offices,
      paging: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err: any) {
    console.error('Error fetching offices by type:', err);
    return sendError(res, 'Failed to fetch company offices', 500);
  }
};

/**
 * Get primary office for an organization
 * GET /api/company-offices/organization/:organizationId/primary
 */
const getPrimaryOffice = async (req: Request, res: Response) => {
  try {
    const { organizationId } = req.params;

    if (!organizationId) {
      return sendError(res, 'Organization ID is required', 400);
    }

    const primaryOffice = await prisma.companyOffice.findFirst({
      where: {
        organization_id: organizationId,
        is_primary: true,
      },
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
    });

    if (!primaryOffice) {
      return sendError(res, 'No primary office found for this organization', 404);
    }

    return sendSuccess(res, primaryOffice);
  } catch (err: any) {
    console.error('Error fetching primary office:', err);
    return sendError(res, 'Failed to fetch primary office', 500);
  }
};

/**
 * Get offices by location (city, state, or country)
 * GET /api/company-offices/location
 * Query params: city, state, country
 */
const getOfficesByLocation = async (req: Request, res: Response) => {
  try {
    const { city, state, country } = req.query;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 10));
    const skip = (page - 1) * limit;

    if (!city && !state && !country) {
      return sendError(res, 'At least one location parameter (city, state, or country) is required', 400);
    }

    const whereClause: any = {};
    if (city) whereClause.city = { contains: city as string, mode: 'insensitive' };
    if (state) whereClause.state = { contains: state as string, mode: 'insensitive' };
    if (country) whereClause.country = { contains: country as string, mode: 'insensitive' };

    const [offices, total] = await Promise.all([
      prisma.companyOffice.findMany({
        where: whereClause,
        skip,
        take: limit,
        orderBy: { office_name: 'asc' },
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
      prisma.companyOffice.count({
        where: whereClause,
      }),
    ]);

    return sendSuccess(res, {
      data: offices,
      paging: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
      filters: { city, state, country },
    });
  } catch (err: any) {
    console.error('Error fetching offices by location:', err);
    return sendError(res, 'Failed to fetch company offices', 500);
  }
};

/**
 * Get company office statistics
 * GET /api/company-offices/stats
 */
const getOfficeStats = async (req: Request, res: Response) => {
  try {
    const [typeStats, totalOffices, primaryOffices, organizationsWithOffices] = await Promise.all([
      prisma.companyOffice.groupBy({
        by: ['type'],
        _count: {
          company_office_id: true,
        },
      }),
      prisma.companyOffice.count(),
      prisma.companyOffice.count({
        where: { is_primary: true },
      }),
      prisma.companyOffice.groupBy({
        by: ['organization_id'],
        _count: {
          company_office_id: true,
        },
      }),
    ]);

    const formattedTypeStats = typeStats.map(stat => ({
      type: stat.type,
      count: stat._count.company_office_id,
    }));

    return sendSuccess(res, {
      total_offices: totalOffices,
      primary_offices: primaryOffices,
      organizations_with_offices: organizationsWithOffices.length,
      by_type: formattedTypeStats,
    });
  } catch (err: any) {
    console.error('Error fetching office stats:', err);
    return sendError(res, 'Failed to fetch company office statistics', 500);
  }
};

// Export controller with custom methods
export const companyOfficeController = {
  ...baseCrudMethods,
  create: createCompanyOffice, // Override create method
  update: updateCompanyOffice, // Override update method
  getById: getCompanyOfficeById, // Override with full details
  getOfficesByOrganization, // Custom query by organization
  getOfficesByType, // Custom query by office type
  getPrimaryOffice, // Get primary office for organization
  getOfficesByLocation, // Custom query by location
  getOfficeStats, // Get office statistics
};