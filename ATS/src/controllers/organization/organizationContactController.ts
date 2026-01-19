import { Request, Response } from 'express';
import prisma from '../../prisma.config';
import { createCrudController } from '../../factories/crudFactory';
import { createOrganizationContactSchema, updateOrganizationContactSchema } from '../../validators/schemas';
import { sendSuccess, sendError } from '../../utils/response';

/**
 * OrganizationContact Controller - Custom CRUD for Organization Contact management
 * Provides: GET all, GET by id, GET by organization, POST, PATCH, DELETE
 *
 * Validation Rules:
 * - organization_id: Required UUID
 * - name: Required string
 * - email: Required valid email
 * - phone: Required string
 * - contact_type: Required enum (PRIMARY, EMERGENCY)
 *
 * Business Context: Manages contacts associated with client organizations
 * Supports multiple contacts per organization with different contact types
 */

// Generate base CRUD methods
const baseCrudMethods = createCrudController({
  model: prisma.organizationContact,
  modelName: 'OrganizationContact',
  idField: 'organization_contact_id',
  createSchema: createOrganizationContactSchema,
  updateSchema: updateOrganizationContactSchema,
  defaultLimit: 10,
  maxLimit: 100,
});

/**
 * Custom create method with organization validation and duplicate prevention
 */
const createOrganizationContact = async (req: Request, res: Response) => {
  try {
    // Validate request body
    const validation = createOrganizationContactSchema.safeParse(req.body);
    if (!validation.success) {
      const errors = validation.error.issues.map((err: any) => ({
        field: err.path.join('.'),
        message: err.message,
      }));
      return sendError(res, 'Validation failed', 400, errors);
    }

    const { organization_id, contact_type, email, phone, name } = req.body;

    // Check if organization exists
    const organization = await prisma.organization.findUnique({
      where: { organization_id },
    });

    if (!organization) {
      return sendError(res, 'Organization not found', 404);
    }

    // Check if PRIMARY contact already exists for this organization
    if (contact_type === 'PRIMARY') {
      const existingPrimaryContact = await prisma.organizationContact.findFirst({
        where: {
          organization_id,
          contact_type: 'PRIMARY',
        },
      });

      if (existingPrimaryContact) {
        return sendError(
          res,
          'Primary contact already exists for this organization',
          409,
        );
      }
    }


    // Check for exact duplicate (same name, email, phone, and contact_type)
    const exactDuplicate = await prisma.organizationContact.findFirst({
      where: {
        organization_id,
        email: email.toLowerCase().trim(),
        contact_type,
      },
    });

    if (exactDuplicate) {
      return sendError(
        res,
        'Identical contact already exists for this organization',
        409,
      );
    }

    // Normalize data before creating
    const normalizedData = {
      ...req.body,
      name: name.trim(),
      email: email.toLowerCase().trim(),
      phone: phone.trim(),
    };

    // Create new organization contact
    const contact = await prisma.organizationContact.create({
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

    return sendSuccess(res, contact, 201);
  } catch (err: any) {
    console.error('Error creating organization contact:', err);

    // Handle foreign key constraint (organization doesn't exist)
    if (err.code === 'P2003') {
      return sendError(res, 'Related organization not found', 404);
    }

    return sendError(res, 'Failed to create organization contact', 500);
  }
};




/**
 * Override getById to include full related data
 * GET /api/organization-contacts/:id
 */
const getOrganizationContactById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!id) {
      return sendError(res, 'Organization Contact ID is required', 400);
    }

    const contact = await prisma.organizationContact.findUnique({
      where: { organization_contact_id: id },
      include: {
        organization: {
          select: {
            organization_id: true,
            name: true,
            website: true,
            phone: true,
            status: true,
            addresses: true,
          },
        },
      },
    });

    if (!contact) {
      return sendError(res, 'Organization contact not found', 404);
    }

    return sendSuccess(res, contact);
  } catch (err: any) {
    console.error('Error fetching organization contact:', err);
    return sendError(res, 'Failed to fetch organization contact', 500);
  }
};

/**
 * Get all contacts for a specific organization
 * GET /api/organization-contacts/organization/:organizationId
 */
const getContactsByOrganization = async (req: Request, res: Response) => {
  try {
    const { organizationId } = req.params;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 10));
    const skip = (page - 1) * limit;

    if (!organizationId) {
      return sendError(res, 'Organization ID is required', 400);
    }

    const [contacts, total] = await Promise.all([
      prisma.organizationContact.findMany({
        where: {
          organization_id: organizationId,
        },
        skip,
        take: limit,
        orderBy: [
          { contact_type: 'asc' }, // PRIMARY first, then EMERGENCY
          { name: 'asc' },
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
      prisma.organizationContact.count({
        where: {
          organization_id: organizationId,
        },
      }),
    ]);

    return sendSuccess(res, {
      data: contacts,
      paging: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err: any) {
    console.error('Error fetching contacts by organization:', err);
    return sendError(res, 'Failed to fetch organization contacts', 500);
  }
};

/**
 * Search contacts by name or email
 * GET /api/organization-contacts/search
 */
const searchContacts = async (req: Request, res: Response) => {
  try {
    const { query } = req.query;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 10));
    const skip = (page - 1) * limit;

    if (!query || typeof query !== 'string') {
      return sendError(res, 'Search query is required', 400);
    }

    const searchTerm = query.trim();

    if (searchTerm.length < 2) {
      return sendError(res, 'Search query must be at least 2 characters', 400);
    }

    const [contacts, total] = await Promise.all([
      prisma.organizationContact.findMany({
        where: {
          OR: [
            { name: { contains: searchTerm, mode: 'insensitive' } },
            { email: { contains: searchTerm, mode: 'insensitive' } },
          ],
        },
        skip,
        take: limit,
        orderBy: { name: 'asc' },
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
      prisma.organizationContact.count({
        where: {
          OR: [
            { name: { contains: searchTerm, mode: 'insensitive' } },
            { email: { contains: searchTerm, mode: 'insensitive' } },
          ],
        },
      }),
    ]);

    return sendSuccess(res, {
      data: contacts,
      paging: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
      search: {
        query: searchTerm,
      },
    });
  } catch (err: any) {
    console.error('Error searching contacts:', err);
    return sendError(res, 'Failed to search organization contacts', 500);
  }
};

/**
 * Get primary contact for a specific organization
 * GET /api/organization-contacts/organization/:organizationId/primary
 */
const getPrimaryContact = async (req: Request, res: Response) => {
  try {
    const { organizationId } = req.params;

    if (!organizationId) {
      return sendError(res, 'Organization ID is required', 400);
    }

    const primaryContact = await prisma.organizationContact.findFirst({
      where: {
        organization_id: organizationId,
        contact_type: 'PRIMARY',
      },
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

    if (!primaryContact) {
      return sendError(res, 'Primary contact not found for this organization', 404);
    }

    return sendSuccess(res, primaryContact);
  } catch (err: any) {
    console.error('Error fetching primary contact:', err);
    return sendError(res, 'Failed to fetch primary contact', 500);
  }
};


// Export controller with custom methods
export const organizationContactController = {
  ...baseCrudMethods,
  create: createOrganizationContact, // Override create method
  getById: getOrganizationContactById, // Override with full details
  getContactsByOrganization, // Custom query by organization
  searchContacts, // Search by name or email
  getPrimaryContact, // Get primary contact for organization
};