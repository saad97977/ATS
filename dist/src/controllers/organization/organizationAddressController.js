"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.organizationAddressController = void 0;
const prisma_config_1 = __importDefault(require("../../prisma.config"));
const crudFactory_1 = require("../../factories/crudFactory");
const schemas_1 = require("../../validators/schemas");
const response_1 = require("../../utils/response");
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
const baseCrudMethods = (0, crudFactory_1.createCrudController)({
    model: prisma_config_1.default.organizationAddress,
    modelName: 'Organization Address',
    idField: 'organization_address_id',
    createSchema: schemas_1.createOrganizationAddressSchema,
    updateSchema: schemas_1.updateOrganizationAddressSchema,
    defaultLimit: 10,
    maxLimit: 100,
});
/**
 * Custom create method with duplicate address type validation
 * POST /api/organization-addresses
 *
 * Ensures an organization can only have one address per type (WORKSITE or BILLING)
 */
const createOrganizationAddress = async (req, res) => {
    try {
        // Validate request body
        const validation = schemas_1.createOrganizationAddressSchema.safeParse(req.body);
        if (!validation.success) {
            const errors = validation.error.issues.map((err) => ({
                field: err.path.join('.'),
                message: err.message,
            }));
            return (0, response_1.sendError)(res, 'Validation failed', 400, errors);
        }
        const { organization_id, address_type } = req.body;
        // Check if organization exists
        const organization = await prisma_config_1.default.organization.findUnique({
            where: { organization_id },
        });
        if (!organization) {
            return (0, response_1.sendError)(res, 'Organization not found', 404);
        }
        // Check if address type already exists for this organization
        const existingAddress = await prisma_config_1.default.organizationAddress.findFirst({
            where: {
                organization_id,
                address_type,
            },
        });
        if (existingAddress) {
            return (0, response_1.sendError)(res, `${address_type} address already exists for this organization`, 409, [{
                    field: 'address_type',
                    message: `Organization already has a ${address_type} address with ID: ${existingAddress.organization_address_id}`,
                }]);
        }
        // Create new address
        const address = await prisma_config_1.default.organizationAddress.create({
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
        return (0, response_1.sendSuccess)(res, address, 201);
    }
    catch (err) {
        console.error('Error creating organization address:', err);
        // Handle Prisma errors
        if (err.code === 'P2002') {
            return (0, response_1.sendError)(res, 'Address with this type already exists for this organization', 409);
        }
        if (err.code === 'P2003') {
            return (0, response_1.sendError)(res, 'Related organization not found', 404);
        }
        return (0, response_1.sendError)(res, 'Failed to create organization address', 500);
    }
};
/**
 * Custom update method with address type validation
 * PATCH /api/organization-addresses/:id
 *
 * Prevents changing address_type if it would create a duplicate
 */
const updateOrganizationAddress = async (req, res) => {
    try {
        const { id } = req.params;
        if (!id) {
            return (0, response_1.sendError)(res, 'Organization Address ID is required', 400);
        }
        // Validate request body
        const validation = schemas_1.updateOrganizationAddressSchema.safeParse(req.body);
        if (!validation.success) {
            const errors = validation.error.issues.map((err) => ({
                field: err.path.join('.'),
                message: err.message,
            }));
            return (0, response_1.sendError)(res, 'Validation failed', 400, errors);
        }
        // Check if address exists
        const existingAddress = await prisma_config_1.default.organizationAddress.findUnique({
            where: { organization_address_id: id },
        });
        if (!existingAddress) {
            return (0, response_1.sendError)(res, 'Organization Address not found', 404);
        }
        // If address_type is being changed, check for duplicates
        if (req.body.address_type && req.body.address_type !== existingAddress.address_type) {
            const duplicateAddress = await prisma_config_1.default.organizationAddress.findFirst({
                where: {
                    organization_id: existingAddress.organization_id,
                    address_type: req.body.address_type,
                    organization_address_id: { not: id },
                },
            });
            if (duplicateAddress) {
                return (0, response_1.sendError)(res, `${req.body.address_type} address already exists for this organization`, 409, [{
                        field: 'address_type',
                        message: `Cannot change address type. Organization already has a ${req.body.address_type} address.`,
                    }]);
            }
        }
        // Update address
        const address = await prisma_config_1.default.organizationAddress.update({
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
        return (0, response_1.sendSuccess)(res, address);
    }
    catch (err) {
        console.error('Error updating organization address:', err);
        if (err.code === 'P2002') {
            return (0, response_1.sendError)(res, 'Address with this type already exists for this organization', 409);
        }
        if (err.code === 'P2025') {
            return (0, response_1.sendError)(res, 'Organization Address not found', 404);
        }
        return (0, response_1.sendError)(res, 'Failed to update organization address', 500);
    }
};
/**
 * Get addresses by organization_id
 * GET /api/organization-addresses/organization/:organizationId
 *
 * Returns both WORKSITE and BILLING addresses for the organization
 */
const getAddressesByOrganization = async (req, res) => {
    try {
        const { organizationId } = req.params;
        if (!organizationId) {
            return (0, response_1.sendError)(res, 'Organization ID is required', 400);
        }
        // Check if organization exists
        const organization = await prisma_config_1.default.organization.findUnique({
            where: { organization_id: organizationId },
        });
        if (!organization) {
            return (0, response_1.sendError)(res, 'Organization not found', 404);
        }
        const addresses = await prisma_config_1.default.organizationAddress.findMany({
            where: { organization_id: organizationId },
            orderBy: { address_type: 'asc' },
        });
        return (0, response_1.sendSuccess)(res, {
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
    }
    catch (err) {
        console.error('Error fetching addresses by organization:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch organization addresses', 500);
    }
};
/**
 * Get addresses by address type
 * GET /api/organization-addresses/type/:addressType
 *
 * Get all addresses of a specific type (WORKSITE or BILLING)
 */
const getAddressesByType = async (req, res) => {
    try {
        const { addressType } = req.params;
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
        const skip = (page - 1) * limit;
        if (!addressType) {
            return (0, response_1.sendError)(res, 'Address type is required', 400);
        }
        // Validate address type
        const validTypes = ['WORKSITE', 'BILLING'];
        if (!validTypes.includes(addressType.toUpperCase())) {
            return (0, response_1.sendError)(res, 'Invalid address type. Must be WORKSITE or BILLING', 400, [{
                    field: 'address_type',
                    message: `Address type must be one of: ${validTypes.join(', ')}`,
                }]);
        }
        const [addresses, total] = await Promise.all([
            prisma_config_1.default.organizationAddress.findMany({
                where: {
                    address_type: addressType.toUpperCase(),
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
            prisma_config_1.default.organizationAddress.count({
                where: {
                    address_type: addressType.toUpperCase(),
                },
            }),
        ]);
        return (0, response_1.sendSuccess)(res, {
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
    }
    catch (err) {
        console.error('Error fetching addresses by type:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch addresses', 500);
    }
};
/**
 * Override getById to include organization details
 * GET /api/organization-addresses/:id
 */
const getAddressById = async (req, res) => {
    try {
        const { id } = req.params;
        if (!id) {
            return (0, response_1.sendError)(res, 'Organization Address ID is required', 400);
        }
        const address = await prisma_config_1.default.organizationAddress.findUnique({
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
            return (0, response_1.sendError)(res, 'Organization Address not found', 404);
        }
        return (0, response_1.sendSuccess)(res, address);
    }
    catch (err) {
        console.error('Error fetching organization address:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch organization address', 500);
    }
};
/**
 * Check if organization has both required addresses
 * GET /api/organization-addresses/check/:organizationId
 */
const checkOrganizationAddresses = async (req, res) => {
    try {
        const { organizationId } = req.params;
        if (!organizationId) {
            return (0, response_1.sendError)(res, 'Organization ID is required', 400);
        }
        const addresses = await prisma_config_1.default.organizationAddress.findMany({
            where: { organization_id: organizationId },
            select: {
                organization_address_id: true,
                address_type: true,
            },
        });
        const hasWorksite = addresses.some(addr => addr.address_type === 'WORKSITE');
        const hasBilling = addresses.some(addr => addr.address_type === 'BILLING');
        return (0, response_1.sendSuccess)(res, {
            organization_id: organizationId,
            has_worksite: hasWorksite,
            has_billing: hasBilling,
            is_complete: hasWorksite && hasBilling,
            missing: [
                ...(!hasWorksite ? ['WORKSITE'] : []),
                ...(!hasBilling ? ['BILLING'] : []),
            ],
        });
    }
    catch (err) {
        console.error('Error checking organization addresses:', err);
        return (0, response_1.sendError)(res, 'Failed to check organization addresses', 500);
    }
};
// Export controller with custom methods
exports.organizationAddressController = {
    ...baseCrudMethods,
    create: createOrganizationAddress, // Override with validation
    update: updateOrganizationAddress, // Override with validation
    getById: getAddressById, // Override with organization details
    getAddressesByOrganization, // Get both addresses for an organization
    getAddressesByType, // Get addresses by type (WORKSITE/BILLING)
    checkOrganizationAddresses, // Check if organization has both addresses
};
//# sourceMappingURL=organizationAddressController.js.map