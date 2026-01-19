"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.contractController = void 0;
const prisma_config_1 = __importDefault(require("../../prisma.config"));
const crudFactory_1 = require("../../factories/crudFactory");
const schemas_1 = require("../../validators/schemas");
const response_1 = require("../../utils/response");
/**
 * Contract Controller - Custom CRUD for Contract management
 * Provides: GET all, GET by id, GET by organization, GET by user, GET by status, POST, PATCH, DELETE
 *
 * Validation Rules:
 * - organization_id: Required UUID
 * - user_id: Required UUID
 * - contract_name: Required string
 * - status: Required string
 * - is_organization_contractor: Required boolean
 * - sent_status: Optional string
 * - signed_status: Optional string
 * - signed_at: Optional datetime
 *
 * Business Context: Manages contracts between organizations and users
 * Tracks contract lifecycle from creation to signing
 */
// Generate base CRUD methods
const baseCrudMethods = (0, crudFactory_1.createCrudController)({
    model: prisma_config_1.default.contract,
    modelName: 'Contract',
    idField: 'contract_id',
    createSchema: schemas_1.createContractSchema,
    updateSchema: schemas_1.updateContractSchema,
    defaultLimit: 10,
    maxLimit: 100,
});
/**
 * Custom create method with validation and duplicate check
 */
const createContract = async (req, res) => {
    try {
        // Validate request body
        const validation = schemas_1.createContractSchema.safeParse(req.body);
        if (!validation.success) {
            const errors = validation.error.issues.map((err) => ({
                field: err.path.join('.'),
                message: err.message,
            }));
            return (0, response_1.sendError)(res, 'Validation failed', 400, errors);
        }
        const { organization_id, user_id, contract_name } = req.body;
        // Check if organization exists
        const organization = await prisma_config_1.default.organization.findUnique({
            where: { organization_id },
        });
        if (!organization) {
            return (0, response_1.sendError)(res, 'Organization not found', 404);
        }
        // Check if user exists
        const user = await prisma_config_1.default.user.findUnique({
            where: { user_id },
        });
        if (!user) {
            return (0, response_1.sendError)(res, 'User not found', 404);
        }
        // Check for duplicate contract (same name, organization, and user)
        const existingContract = await prisma_config_1.default.contract.findFirst({
            where: {
                organization_id,
                user_id,
                contract_name,
            },
        });
        if (existingContract) {
            return (0, response_1.sendError)(res, 'Contract with this name already exists for this organization and user', 409, [{
                    field: 'duplicate',
                    message: `Contract already exists with contract_id: ${existingContract.contract_id}`,
                }]);
        }
        // Create new contract
        const contract = await prisma_config_1.default.contract.create({
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
        return (0, response_1.sendSuccess)(res, contract, 201);
    }
    catch (err) {
        console.error('Error creating contract:', err);
        // Handle foreign key constraint errors
        if (err.code === 'P2003') {
            return (0, response_1.sendError)(res, 'Related organization or user not found', 404);
        }
        return (0, response_1.sendError)(res, 'Failed to create contract', 500);
    }
};
/**
 * Override getById to include full related data
 * GET /api/contracts/:id
 */
const getContractById = async (req, res) => {
    try {
        const { id } = req.params;
        if (!id) {
            return (0, response_1.sendError)(res, 'Contract ID is required', 400);
        }
        const contract = await prisma_config_1.default.contract.findUnique({
            where: { contract_id: id },
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
        if (!contract) {
            return (0, response_1.sendError)(res, 'Contract not found', 404);
        }
        return (0, response_1.sendSuccess)(res, contract);
    }
    catch (err) {
        console.error('Error fetching contract:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch contract', 500);
    }
};
/**
 * Get all contracts for a specific organization
 * GET /api/contracts/organization/:organizationId
 */
const getContractsByOrganization = async (req, res) => {
    try {
        const { organizationId } = req.params;
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
        const skip = (page - 1) * limit;
        if (!organizationId) {
            return (0, response_1.sendError)(res, 'Organization ID is required', 400);
        }
        const [contracts, total] = await Promise.all([
            prisma_config_1.default.contract.findMany({
                where: {
                    organization_id: organizationId,
                },
                skip,
                take: limit,
                orderBy: { created_at: 'desc' },
                include: {
                    organization: {
                        select: {
                            organization_id: true,
                            name: true,
                            status: true,
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
            prisma_config_1.default.contract.count({
                where: {
                    organization_id: organizationId,
                },
            }),
        ]);
        return (0, response_1.sendSuccess)(res, {
            data: contracts,
            paging: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        });
    }
    catch (err) {
        console.error('Error fetching contracts by organization:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch contracts', 500);
    }
};
/**
 * Get all contracts for a specific user
 * GET /api/contracts/user/:userId
 */
const getContractsByUser = async (req, res) => {
    try {
        const { userId } = req.params;
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
        const skip = (page - 1) * limit;
        if (!userId) {
            return (0, response_1.sendError)(res, 'User ID is required', 400);
        }
        const [contracts, total] = await Promise.all([
            prisma_config_1.default.contract.findMany({
                where: {
                    user_id: userId,
                },
                skip,
                take: limit,
                orderBy: { created_at: 'desc' },
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
                        },
                    },
                },
            }),
            prisma_config_1.default.contract.count({
                where: {
                    user_id: userId,
                },
            }),
        ]);
        return (0, response_1.sendSuccess)(res, {
            data: contracts,
            paging: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        });
    }
    catch (err) {
        console.error('Error fetching contracts by user:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch contracts', 500);
    }
};
/**
 * Get contracts by status
 * GET /api/contracts/status/:status
 */
const getContractsByStatus = async (req, res) => {
    try {
        const { status } = req.params;
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
        const skip = (page - 1) * limit;
        if (!status) {
            return (0, response_1.sendError)(res, 'Status is required', 400);
        }
        const [contracts, total] = await Promise.all([
            prisma_config_1.default.contract.findMany({
                where: {
                    status: status.toUpperCase(),
                },
                skip,
                take: limit,
                orderBy: { created_at: 'desc' },
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
            prisma_config_1.default.contract.count({
                where: {
                    status: status.toUpperCase(),
                },
            }),
        ]);
        return (0, response_1.sendSuccess)(res, {
            data: contracts,
            paging: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        });
    }
    catch (err) {
        console.error('Error fetching contracts by status:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch contracts', 500);
    }
};
/**
 * Get contracts by signed status
 * GET /api/contracts/signed-status/:signedStatus
 */
const getContractsBySignedStatus = async (req, res) => {
    try {
        const { signedStatus } = req.params;
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
        const skip = (page - 1) * limit;
        if (!signedStatus) {
            return (0, response_1.sendError)(res, 'Signed status is required', 400);
        }
        const [contracts, total] = await Promise.all([
            prisma_config_1.default.contract.findMany({
                where: {
                    signed_status: signedStatus.toUpperCase(),
                },
                skip,
                take: limit,
                orderBy: { signed_at: 'desc' },
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
            prisma_config_1.default.contract.count({
                where: {
                    signed_status: signedStatus.toUpperCase(),
                },
            }),
        ]);
        return (0, response_1.sendSuccess)(res, {
            data: contracts,
            paging: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        });
    }
    catch (err) {
        console.error('Error fetching contracts by signed status:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch contracts', 500);
    }
};
/**
 * Get contracts by sent status
 * GET /api/contracts/sent-status/:sentStatus
 */
const getContractsBySentStatus = async (req, res) => {
    try {
        const { sentStatus } = req.params;
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
        const skip = (page - 1) * limit;
        if (!sentStatus) {
            return (0, response_1.sendError)(res, 'Sent status is required', 400);
        }
        const [contracts, total] = await Promise.all([
            prisma_config_1.default.contract.findMany({
                where: {
                    sent_status: sentStatus.toUpperCase(),
                },
                skip,
                take: limit,
                orderBy: { created_at: 'desc' },
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
            prisma_config_1.default.contract.count({
                where: {
                    sent_status: sentStatus.toUpperCase(),
                },
            }),
        ]);
        return (0, response_1.sendSuccess)(res, {
            data: contracts,
            paging: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        });
    }
    catch (err) {
        console.error('Error fetching contracts by sent status:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch contracts', 500);
    }
};
/**
 * Get contracts by contractor type
 * GET /api/contracts/contractor-type/:isContractor
 */
const getContractsByContractorType = async (req, res) => {
    try {
        const { isContractor } = req.params;
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
        const skip = (page - 1) * limit;
        if (!isContractor) {
            return (0, response_1.sendError)(res, 'Contractor type is required', 400);
        }
        const isOrganizationContractor = isContractor.toLowerCase() === 'true';
        const [contracts, total] = await Promise.all([
            prisma_config_1.default.contract.findMany({
                where: {
                    is_organization_contractor: isOrganizationContractor,
                },
                skip,
                take: limit,
                orderBy: { created_at: 'desc' },
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
            prisma_config_1.default.contract.count({
                where: {
                    is_organization_contractor: isOrganizationContractor,
                },
            }),
        ]);
        return (0, response_1.sendSuccess)(res, {
            data: contracts,
            paging: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        });
    }
    catch (err) {
        console.error('Error fetching contracts by contractor type:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch contracts', 500);
    }
};
/**
 * Get pending contracts (not signed)
 * GET /api/contracts/pending
 */
const getPendingContracts = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
        const skip = (page - 1) * limit;
        const [contracts, total] = await Promise.all([
            prisma_config_1.default.contract.findMany({
                where: {
                    OR: [
                        { signed_status: null },
                        { signed_status: { not: 'SIGNED' } },
                    ],
                },
                skip,
                take: limit,
                orderBy: { created_at: 'desc' },
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
            prisma_config_1.default.contract.count({
                where: {
                    OR: [
                        { signed_status: null },
                        { signed_status: { not: 'SIGNED' } },
                    ],
                },
            }),
        ]);
        return (0, response_1.sendSuccess)(res, {
            data: contracts,
            paging: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        });
    }
    catch (err) {
        console.error('Error fetching pending contracts:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch pending contracts', 500);
    }
};
/**
 * Get signed contracts
 * GET /api/contracts/signed
 */
const getSignedContracts = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
        const skip = (page - 1) * limit;
        const [contracts, total] = await Promise.all([
            prisma_config_1.default.contract.findMany({
                where: {
                    signed_status: 'SIGNED',
                    signed_at: {
                        not: null,
                    },
                },
                skip,
                take: limit,
                orderBy: { signed_at: 'desc' },
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
            prisma_config_1.default.contract.count({
                where: {
                    signed_status: 'SIGNED',
                    signed_at: {
                        not: null,
                    },
                },
            }),
        ]);
        return (0, response_1.sendSuccess)(res, {
            data: contracts,
            paging: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        });
    }
    catch (err) {
        console.error('Error fetching signed contracts:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch signed contracts', 500);
    }
};
/**
 * Get contract statistics
 * GET /api/contracts/stats
 */
const getContractStats = async (req, res) => {
    try {
        const { organization_id, user_id } = req.query;
        const whereClause = {};
        if (organization_id)
            whereClause.organization_id = organization_id;
        if (user_id)
            whereClause.user_id = user_id;
        const [totalContracts, byStatus, bySignedStatus, bySentStatus, byContractorType,] = await Promise.all([
            prisma_config_1.default.contract.count({ where: whereClause }),
            prisma_config_1.default.contract.groupBy({
                by: ['status'],
                where: whereClause,
                _count: { contract_id: true },
            }),
            prisma_config_1.default.contract.groupBy({
                by: ['signed_status'],
                where: whereClause,
                _count: { contract_id: true },
            }),
            prisma_config_1.default.contract.groupBy({
                by: ['sent_status'],
                where: whereClause,
                _count: { contract_id: true },
            }),
            prisma_config_1.default.contract.groupBy({
                by: ['is_organization_contractor'],
                where: whereClause,
                _count: { contract_id: true },
            }),
        ]);
        return (0, response_1.sendSuccess)(res, {
            total: totalContracts,
            by_status: byStatus.map(s => ({
                status: s.status,
                count: s._count.contract_id,
            })),
            by_signed_status: bySignedStatus.map(s => ({
                signed_status: s.signed_status || 'NOT_SIGNED',
                count: s._count.contract_id,
            })),
            by_sent_status: bySentStatus.map(s => ({
                sent_status: s.sent_status || 'NOT_SENT',
                count: s._count.contract_id,
            })),
            by_contractor_type: byContractorType.map(s => ({
                type: s.is_organization_contractor ? 'Organization Contractor' : 'Direct Contractor',
                count: s._count.contract_id,
            })),
        });
    }
    catch (err) {
        console.error('Error fetching contract stats:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch contract statistics', 500);
    }
};
// Export controller with custom methods
exports.contractController = {
    ...baseCrudMethods,
    create: createContract, // Override create method with duplicate prevention
    getById: getContractById, // Override with full details
    getContractsByOrganization, // Custom query by organization
    getContractsByUser, // Custom query by user
    getContractsByStatus, // Custom query by status
    getContractsBySignedStatus, // Custom query by signed status
    getContractsBySentStatus, // Custom query by sent status
    getContractsByContractorType, // Custom query by contractor type
    getPendingContracts, // Get pending contracts
    getSignedContracts, // Get signed contracts
    getContractStats, // Get contract statistics
};
//# sourceMappingURL=organizationContractController.js.map