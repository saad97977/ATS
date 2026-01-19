import { Request, Response } from 'express';
import prisma from '../../prisma.config';
import { createCrudController } from '../../factories/crudFactory';
import { createOrganizationAddressSchema, updateOrganizationAddressSchema } from '../../validators/schemas';
import { sendSuccess, sendError } from '../../utils/response';

/**
 * Organization Address Controller - Custom CRUD with address type validation
 * Provides: Standard CRUD + custom filtering and validation
 * 
 * Business Rules:
 * - Each organization can have ONE WORKSITE address and ONE BILLING address
 * - address_type must be either WORKSITE or BILLING (from AddressType enum)
 * - Cannot create duplicate address types for the same organization
 * 
 * Validation Rules:
 * - organization_id: Required UUID
 * - address_type: WORKSITE or BILLING
 * - address1: Required address line 1
 * - address2: Optional address line 2
 * - city: Required city
 * - state: Required state (min 2 chars)
 * - zip: Required ZIP code
 * - phone: Optional phone number
 */

// Generate base CRUD methods
const baseCrudMethods = createCrudController({
  model: prisma.organizationAddress,
  modelName: 'Organization Address',
  idField: 'organization_address_id',
  createSchema: createOrganizationAddressSchema,
  updateSchema: updateOrganizationAddressSchema,
  defaultLimit: 10,
  maxLimit: 100,
});

/**
 * Custom create method with duplicate address type validation
 * POST /api/organization-addresses
 * 
 * Ensures an organization can only have one address per type (WORKSITE or BILLING)
 */
const createOrganizationAddress = async (req: Request, res: Response) => {
  try {
    // Validate request body
    const validation = createOrganizationAddressSchema.safeParse(req.body);
    if (!validation.success) {
      const errors = validation.error.issues.map((err: any) => ({
        field: err.path.join('.'),
        message: err.message,
      }));
      return sendError(res, 'Validation failed', 400, errors);
    }

    const { organization_id, address_type } = req.body;

    // Check if organization exists
    const organization = await prisma.organization.findUnique({
      where: { organization_id },
    });

    if (!organization) {
      return sendError(res, 'Organization not found', 404);
    }

    // Check if address type already exists for this organization
    const existingAddress = await prisma.organizationAddress.findFirst({
      where: {
        organization_id,
        address_type,
      },
    });

    if (existingAddress) {
      return sendError(
        res,
        `${address_type} address already exists for this organization`,
        409,
        [{
          field: 'address_type',
          message: `Organization already has a ${address_type} address with ID: ${existingAddress.organization_address_id}`,
        }]
      );
    }

    // Create new address
    const address = await prisma.organizationAddress.create({
      data: req.body,
      include: {
        organization: {
          select: {
            organization_id: true,
            name: true,
            status: true,
          },
        },
      },
    });

    return sendSuccess(res, address, 201);
  } catch (err: any) {
    console.error('Error creating organization address:', err);

    // Handle Prisma errors
    if (err.code === 'P2002') {
      return sendError(res, 'Address with this type already exists for this organization', 409);
    }
    if (err.code === 'P2003') {
      return sendError(res, 'Related organization not found', 404);
    }

    return sendError(res, 'Failed to create organization address', 500);
  }
};

/**
 * Custom update method with address type validation
 * PATCH /api/organization-addresses/:id
 * 
 * Prevents changing address_type if it would create a duplicate
 */
const updateOrganizationAddress = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!id) {
      return sendError(res, 'Organization Address ID is required', 400);
    }

    // Validate request body
    const validation = updateOrganizationAddressSchema.safeParse(req.body);
    if (!validation.success) {
      const errors = validation.error.issues.map((err: any) => ({
        field: err.path.join('.'),
        message: err.message,
      }));
      return sendError(res, 'Validation failed', 400, errors);
    }

    // Check if address exists
    const existingAddress = await prisma.organizationAddress.findUnique({
      where: { organization_address_id: id },
    });

    if (!existingAddress) {
      return sendError(res, 'Organization Address not found', 404);
    }

    // If address_type is being changed, check for duplicates
    if (req.body.address_type && req.body.address_type !== existingAddress.address_type) {
      const duplicateAddress = await prisma.organizationAddress.findFirst({
        where: {
          organization_id: existingAddress.organization_id,
          address_type: req.body.address_type,
          organization_address_id: { not: id },
        },
      });

      if (duplicateAddress) {
        return sendError(
          res,
          `${req.body.address_type} address already exists for this organization`,
          409,
          [{
            field: 'address_type',
            message: `Cannot change address type. Organization already has a ${req.body.address_type} address.`,
          }]
        );
      }
    }

    // Update address
    const address = await prisma.organizationAddress.update({
      where: { organization_address_id: id },
      data: req.body,
      include: {
        organization: {
          select: {
            organization_id: true,
            name: true,
            status: true,
          },
        },
      },
    });

    return sendSuccess(res, address);
  } catch (err: any) {
    console.error('Error updating organization address:', err);

    if (err.code === 'P2002') {
      return sendError(res, 'Address with this type already exists for this organization', 409);
    }
    if (err.code === 'P2025') {
      return sendError(res, 'Organization Address not found', 404);
    }

    return sendError(res, 'Failed to update organization address', 500);
  }
};

/**
 * Get addresses by organization_id
 * GET /api/organization-addresses/organization/:organizationId
 * 
 * Returns both WORKSITE and BILLING addresses for the organization
 */
const getAddressesByOrganization = async (req: Request, res: Response) => {
  try {
    const { organizationId } = req.params;

    if (!organizationId) {
      return sendError(res, 'Organization ID is required', 400);
    }

    // Check if organization exists
    const organization = await prisma.organization.findUnique({
      where: { organization_id: organizationId },
    });

    if (!organization) {
      return sendError(res, 'Organization not found', 404);
    }

    const addresses = await prisma.organizationAddress.findMany({
      where: { organization_id: organizationId },
      orderBy: { address_type: 'asc' },
    });

    return sendSuccess(res, {
      organization: {
        organization_id: organization.organization_id,
        name: organization.name,
      },
      addresses: {
        worksite: addresses.find(addr => addr.address_type === 'WORKSITE') || null,
        billing: addresses.find(addr => addr.address_type === 'BILLING') || null,
      },
      total: addresses.length,
    });
  } catch (err: any) {
    console.error('Error fetching addresses by organization:', err);
    return sendError(res, 'Failed to fetch organization addresses', 500);
  }
};

/**
 * Get addresses by address type
 * GET /api/organization-addresses/type/:addressType
 * 
 * Get all addresses of a specific type (WORKSITE or BILLING)
 */
const getAddressesByType = async (req: Request, res: Response) => {
  try {
    const { addressType } = req.params;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 10));
    const skip = (page - 1) * limit;

    if (!addressType) {
      return sendError(res, 'Address type is required', 400);
    }

    // Validate address type
    const validTypes = ['WORKSITE', 'BILLING'];
    if (!validTypes.includes(addressType.toUpperCase())) {
      return sendError(
        res,
        'Invalid address type. Must be WORKSITE or BILLING',
        400,
        [{
          field: 'address_type',
          message: `Address type must be one of: ${validTypes.join(', ')}`,
        }]
      );
    }

    const [addresses, total] = await Promise.all([
      prisma.organizationAddress.findMany({
        where: {
          address_type: addressType.toUpperCase() as 'WORKSITE' | 'BILLING',
        },
        skip,
        take: limit,
        include: {
          organization: {
            select: {
              organization_id: true,
              name: true,
              status: true,
            },
          },
        },
      }),
      prisma.organizationAddress.count({
        where: {
          address_type: addressType.toUpperCase() as 'WORKSITE' | 'BILLING',
        },
      }),
    ]);

    return sendSuccess(res, {
      data: addresses,
      paging: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
      filters: {
        address_type: addressType.toUpperCase(),
      },
    });
  } catch (err: any) {
    console.error('Error fetching addresses by type:', err);
    return sendError(res, 'Failed to fetch addresses', 500);
  }
};

/**
 * Override getById to include organization details
 * GET /api/organization-addresses/:id
 */
const getAddressById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!id) {
      return sendError(res, 'Organization Address ID is required', 400);
    }

    const address = await prisma.organizationAddress.findUnique({
      where: { organization_address_id: id },
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

    if (!address) {
      return sendError(res, 'Organization Address not found', 404);
    }

    return sendSuccess(res, address);
  } catch (err: any) {
    console.error('Error fetching organization address:', err);
    return sendError(res, 'Failed to fetch organization address', 500);
  }
};

/**
 * Check if organization has both required addresses
 * GET /api/organization-addresses/check/:organizationId
 */
const checkOrganizationAddresses = async (req: Request, res: Response) => {
  try {
    const { organizationId } = req.params;

    if (!organizationId) {
      return sendError(res, 'Organization ID is required', 400);
    }

    const addresses = await prisma.organizationAddress.findMany({
      where: { organization_id: organizationId },
      select: {
        organization_address_id: true,
        address_type: true,
      },
    });

    const hasWorksite = addresses.some(addr => addr.address_type === 'WORKSITE');
    const hasBilling = addresses.some(addr => addr.address_type === 'BILLING');

    return sendSuccess(res, {
      organization_id: organizationId,
      has_worksite: hasWorksite,
      has_billing: hasBilling,
      is_complete: hasWorksite && hasBilling,
      missing: [
        ...(!hasWorksite ? ['WORKSITE'] : []),
        ...(!hasBilling ? ['BILLING'] : []),
      ],
    });
  } catch (err: any) {
    console.error('Error checking organization addresses:', err);
    return sendError(res, 'Failed to check organization addresses', 500);
  }
};

// Export controller with custom methods
export const organizationAddressController = {
  ...baseCrudMethods,
  create: createOrganizationAddress, // Override with validation
  update: updateOrganizationAddress, // Override with validation
  getById: getAddressById, // Override with organization details
  getAddressesByOrganization, // Get both addresses for an organization
  getAddressesByType, // Get addresses by type (WORKSITE/BILLING)
  checkOrganizationAddresses, // Check if organization has both addresses
};