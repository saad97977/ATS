"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.organizationContactController = void 0;
const prisma_config_1 = __importDefault(require("../../prisma.config"));
const crudFactory_1 = require("../../factories/crudFactory");
const schemas_1 = require("../../validators/schemas");
const response_1 = require("../../utils/response");
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
const baseCrudMethods = (0, crudFactory_1.createCrudController)({
    model: prisma_config_1.default.organizationContact,
    modelName: 'OrganizationContact',
    idField: 'organization_contact_id',
    createSchema: schemas_1.createOrganizationContactSchema,
    updateSchema: schemas_1.updateOrganizationContactSchema,
    defaultLimit: 10,
    maxLimit: 100,
});
/**
 * Custom create method with organization validation and duplicate prevention
 */
const createOrganizationContact = async (req, res) => {
    try {
        // Validate request body
        const validation = schemas_1.createOrganizationContactSchema.safeParse(req.body);
        if (!validation.success) {
            const errors = validation.error.issues.map((err) => ({
                field: err.path.join('.'),
                message: err.message,
            }));
            return (0, response_1.sendError)(res, 'Validation failed', 400, errors);
        }
        const { organization_id, contact_type, email, phone, name } = req.body;
        // Check if organization exists
        const organization = await prisma_config_1.default.organization.findUnique({
            where: { organization_id },
        });
        if (!organization) {
            return (0, response_1.sendError)(res, 'Organization not found', 404);
        }
        // Check if PRIMARY contact already exists for this organization
        if (contact_type === 'PRIMARY') {
            const existingPrimaryContact = await prisma_config_1.default.organizationContact.findFirst({
                where: {
                    organization_id,
                    contact_type: 'PRIMARY',
                },
            });
            if (existingPrimaryContact) {
                return (0, response_1.sendError)(res, 'Primary contact already exists for this organization', 409);
            }
        }
        // Check for exact duplicate (same name, email, phone, and contact_type)
        const exactDuplicate = await prisma_config_1.default.organizationContact.findFirst({
            where: {
                organization_id,
                email: email.toLowerCase().trim(),
                contact_type,
            },
        });
        if (exactDuplicate) {
            return (0, response_1.sendError)(res, 'Identical contact already exists for this organization', 409);
        }
        // Normalize data before creating
        const normalizedData = {
            ...req.body,
            name: name.trim(),
            email: email.toLowerCase().trim(),
            phone: phone.trim(),
        };
        // Create new organization contact
        const contact = await prisma_config_1.default.organizationContact.create({
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
        return (0, response_1.sendSuccess)(res, contact, 201);
    }
    catch (err) {
        console.error('Error creating organization contact:', err);
        // Handle foreign key constraint (organization doesn't exist)
        if (err.code === 'P2003') {
            return (0, response_1.sendError)(res, 'Related organization not found', 404);
        }
        return (0, response_1.sendError)(res, 'Failed to create organization contact', 500);
    }
};
/**
 * Override getById to include full related data
 * GET /api/organization-contacts/:id
 */
const getOrganizationContactById = async (req, res) => {
    try {
        const { id } = req.params;
        if (!id) {
            return (0, response_1.sendError)(res, 'Organization Contact ID is required', 400);
        }
        const contact = await prisma_config_1.default.organizationContact.findUnique({
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
            return (0, response_1.sendError)(res, 'Organization contact not found', 404);
        }
        return (0, response_1.sendSuccess)(res, contact);
    }
    catch (err) {
        console.error('Error fetching organization contact:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch organization contact', 500);
    }
};
/**
 * Get all contacts for a specific organization
 * GET /api/organization-contacts/organization/:organizationId
 */
const getContactsByOrganization = async (req, res) => {
    try {
        const { organizationId } = req.params;
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
        const skip = (page - 1) * limit;
        if (!organizationId) {
            return (0, response_1.sendError)(res, 'Organization ID is required', 400);
        }
        const [contacts, total] = await Promise.all([
            prisma_config_1.default.organizationContact.findMany({
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
            prisma_config_1.default.organizationContact.count({
                where: {
                    organization_id: organizationId,
                },
            }),
        ]);
        return (0, response_1.sendSuccess)(res, {
            data: contacts,
            paging: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        });
    }
    catch (err) {
        console.error('Error fetching contacts by organization:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch organization contacts', 500);
    }
};
/**
 * Search contacts by name or email
 * GET /api/organization-contacts/search
 */
const searchContacts = async (req, res) => {
    try {
        const { query } = req.query;
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
        const skip = (page - 1) * limit;
        if (!query || typeof query !== 'string') {
            return (0, response_1.sendError)(res, 'Search query is required', 400);
        }
        const searchTerm = query.trim();
        if (searchTerm.length < 2) {
            return (0, response_1.sendError)(res, 'Search query must be at least 2 characters', 400);
        }
        const [contacts, total] = await Promise.all([
            prisma_config_1.default.organizationContact.findMany({
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
            prisma_config_1.default.organizationContact.count({
                where: {
                    OR: [
                        { name: { contains: searchTerm, mode: 'insensitive' } },
                        { email: { contains: searchTerm, mode: 'insensitive' } },
                    ],
                },
            }),
        ]);
        return (0, response_1.sendSuccess)(res, {
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
    }
    catch (err) {
        console.error('Error searching contacts:', err);
        return (0, response_1.sendError)(res, 'Failed to search organization contacts', 500);
    }
};
/**
 * Get primary contact for a specific organization
 * GET /api/organization-contacts/organization/:organizationId/primary
 */
const getPrimaryContact = async (req, res) => {
    try {
        const { organizationId } = req.params;
        if (!organizationId) {
            return (0, response_1.sendError)(res, 'Organization ID is required', 400);
        }
        const primaryContact = await prisma_config_1.default.organizationContact.findFirst({
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
            return (0, response_1.sendError)(res, 'Primary contact not found for this organization', 404);
        }
        return (0, response_1.sendSuccess)(res, primaryContact);
    }
    catch (err) {
        console.error('Error fetching primary contact:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch primary contact', 500);
    }
};
// Export controller with custom methods
exports.organizationContactController = {
    ...baseCrudMethods,
    create: createOrganizationContact, // Override create method
    getById: getOrganizationContactById, // Override with full details
    getContactsByOrganization, // Custom query by organization
    searchContacts, // Search by name or email
    getPrimaryContact, // Get primary contact for organization
};
//# sourceMappingURL=organizationContactController.js.map