"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.organizationCompleteController = void 0;
const prisma_config_1 = __importDefault(require("../../prisma.config"));
const zod_1 = require("zod");
const response_1 = require("../../utils/response");
const activityService_1 = require("../../services/activityService");
/**
 * Organization Complete Setup Controller
 * POST request to create Organization with all related data in a single transaction
 *
 * Creates:
 * - Organization
 * - CompanyOffice(s)
 * - OrganizationAccounting(s)
 * - OrganizationAddress(es)
 * - OrganizationContact(s)
 * - OrganizationUser(s)
 */
// Validation Schemas
const companyOfficeSchema = zod_1.z.object({
    office_name: zod_1.z.string().min(1, 'Office name is required'),
    city: zod_1.z.string().min(1, 'City is required'),
    state: zod_1.z.string().min(1, 'State is required'),
    country: zod_1.z.string().min(1, 'Country is required'),
    type: zod_1.z.enum(['REMOTE', 'HYBRID', 'ONSITE']),
    address: zod_1.z.string().min(1, 'Address is required'),
    is_primary: zod_1.z.boolean().optional().default(false),
});
const organizationAccountingSchema = zod_1.z.object({
    account_type: zod_1.z.string().min(1, 'Account type is required'),
    bank_name: zod_1.z.string().min(1, 'Bank name is required'),
    account_number: zod_1.z.string().min(1, 'Account number is required'),
    routing_number: zod_1.z.string().min(1, 'Routing number is required'),
    country: zod_1.z.string().min(1, 'Country is required'),
});
const organizationAddressSchema = zod_1.z.object({
    address_type: zod_1.z.enum(['WORKSITE', 'BILLING']),
    address1: zod_1.z.string().min(1, 'Address line 1 is required'),
    address2: zod_1.z.string().optional(),
    city: zod_1.z.string().min(1, 'City is required'),
    state: zod_1.z.string().min(1, 'State is required'),
    zip: zod_1.z.string().min(1, 'ZIP code is required'),
    phone: zod_1.z.string().optional(),
});
const organizationContactSchema = zod_1.z.object({
    name: zod_1.z.string().min(1, 'Contact name is required'),
    email: zod_1.z.string().email('Valid email is required'),
    phone: zod_1.z.string().min(1, 'Phone number is required'),
    contact_type: zod_1.z.enum(['PRIMARY', 'EMERGENCY'])
});
const organizationUserSchema = zod_1.z.object({
    user_id: zod_1.z.string().uuid('Valid user ID is required'),
    division: zod_1.z.string().min(1).optional(),
    department: zod_1.z.string().min(1).optional(),
    title: zod_1.z.string().min(1).optional(),
    work_phone: zod_1.z.string().min(1).optional(),
});
const createOrganizationCompleteSchema = zod_1.z.object({
    name: zod_1.z.string().min(1, 'Organization name is required'),
    website: zod_1.z.string().url('Valid URL is required').optional(),
    status: zod_1.z.enum(['ACTIVE', 'INACTIVE']).optional().default('ACTIVE'),
    phone: zod_1.z.string().optional(),
    created_by_user_id: zod_1.z.string().uuid('Valid user ID is required'),
    // Related entities arrays
    company_offices: zod_1.z.array(companyOfficeSchema).optional(),
    accounting: zod_1.z.array(organizationAccountingSchema).optional(),
    addresses: zod_1.z.array(organizationAddressSchema).optional(),
    contacts: zod_1.z.array(organizationContactSchema).optional(),
    organization_users: zod_1.z.array(organizationUserSchema).optional(),
});
/**
 * POST /api/organizations/complete
 * Creates organization with all related data in a single transaction
 */
const createOrganizationComplete = async (req, res) => {
    try {
        // Validate request body
        const validation = createOrganizationCompleteSchema.safeParse(req.body);
        if (!validation.success) {
            const errors = validation.error.issues.map((err) => ({
                field: err.path.join('.'),
                message: err.message,
            }));
            return (0, response_1.sendError)(res, 'Validation failed', 400, errors);
        }
        const { name, website, status, phone, created_by_user_id, company_offices, accounting, addresses, contacts, organization_users } = validation.data;
        // Check if user exists
        const userExists = await prisma_config_1.default.user.findFirst({
            where: { user_id: created_by_user_id },
        });
        if (!userExists) {
            return (0, response_1.sendError)(res, 'User not found', 404);
        }
        // Check if organization name already exists
        const existingOrg = await prisma_config_1.default.organization.findUnique({
            where: { name },
        });
        if (existingOrg) {
            return (0, response_1.sendError)(res, 'Organization with this name already exists', 409, [{
                    field: 'duplicate',
                    message: `Organization already exists`,
                }]);
        }
        // Validate: Only one primary office allowed
        if (company_offices && company_offices.length > 0) {
            const primaryOffices = company_offices.filter(office => office.is_primary);
            if (primaryOffices.length > 1) {
                return (0, response_1.sendError)(res, 'Only one company office can be marked as primary', 400);
            }
        }
        // Validate: At least one PRIMARY contact if contacts provided
        if (contacts && contacts.length > 0) {
            const primaryContacts = contacts.filter(contact => contact.contact_type === 'PRIMARY');
            if (primaryContacts.length === 0) {
                return (0, response_1.sendError)(res, 'At least one PRIMARY contact is required when adding contacts', 400);
            }
        }
        // Validate: All organization users exist
        if (organization_users && organization_users.length > 0) {
            const userIds = organization_users.map(ou => ou.user_id);
            const uniqueUserIds = [...new Set(userIds)];
            // Check for duplicate user IDs in the request
            if (userIds.length !== uniqueUserIds.length) {
                return (0, response_1.sendError)(res, 'Duplicate user IDs found in organization_users', 400);
            }
            const users = await prisma_config_1.default.user.findMany({
                where: { user_id: { in: uniqueUserIds } },
            });
            if (users.length !== uniqueUserIds.length) {
                const foundUserIds = users.map(u => u.user_id);
                const missingUserIds = uniqueUserIds.filter(id => !foundUserIds.includes(id));
                return (0, response_1.sendError)(res, 'One or more users not found', 404, missingUserIds.map(id => ({
                    field: 'organization_users',
                    message: `User with ID ${id} not found`,
                })));
            }
        }
        // Create organization with all related data in a transaction with increased timeout
        const result = await prisma_config_1.default.$transaction(async (tx) => {
            // 1. Create Organization
            const newOrganization = await tx.organization.create({
                data: {
                    name,
                    website,
                    status,
                    phone,
                    created_by_user_id,
                },
            });
            // 2. Create Company Offices using createMany (optimized)
            let createdOffices = [];
            if (company_offices && company_offices.length > 0) {
                await tx.companyOffice.createMany({
                    data: company_offices.map(office => ({
                        organization_id: newOrganization.organization_id,
                        office_name: office.office_name,
                        city: office.city,
                        state: office.state,
                        country: office.country,
                        type: office.type,
                        address: office.address,
                        is_primary: office.is_primary || false,
                    })),
                });
                createdOffices = company_offices;
            }
            // 3. Create Organization Accounting using createMany (optimized)
            let createdAccounting = [];
            if (accounting && accounting.length > 0) {
                await tx.organizationAccounting.createMany({
                    data: accounting.map(acc => ({
                        organization_id: newOrganization.organization_id,
                        account_type: acc.account_type,
                        bank_name: acc.bank_name,
                        account_number: acc.account_number,
                        routing_number: acc.routing_number,
                        country: acc.country,
                    })),
                });
                createdAccounting = accounting;
            }
            // 4. Create Organization Addresses using createMany (optimized)
            let createdAddresses = [];
            if (addresses && addresses.length > 0) {
                await tx.organizationAddress.createMany({
                    data: addresses.map(addr => ({
                        organization_id: newOrganization.organization_id,
                        address_type: addr.address_type,
                        address1: addr.address1,
                        address2: addr.address2,
                        city: addr.city,
                        state: addr.state,
                        zip: addr.zip,
                        phone: addr.phone,
                    })),
                });
                createdAddresses = addresses;
            }
            // 5. Create Organization Contacts using createMany (optimized)
            let createdContacts = [];
            if (contacts && contacts.length > 0) {
                await tx.organizationContact.createMany({
                    data: contacts.map(contact => ({
                        organization_id: newOrganization.organization_id,
                        name: contact.name,
                        email: contact.email,
                        phone: contact.phone,
                        contact_type: contact.contact_type,
                    })),
                });
                createdContacts = contacts;
            }
            // 6. Create Organization Users using createMany (optimized)
            let createdOrganizationUsers = [];
            if (organization_users && organization_users.length > 0) {
                await tx.organizationUser.createMany({
                    data: organization_users.map(orgUser => ({
                        organization_id: newOrganization.organization_id,
                        user_id: orgUser.user_id,
                        division: orgUser.division,
                        department: orgUser.department,
                        title: orgUser.title,
                        work_phone: orgUser.work_phone,
                    })),
                });
                createdOrganizationUsers = organization_users;
            }
            return {
                organization: newOrganization,
                company_offices: createdOffices,
                accounting: createdAccounting,
                addresses: createdAddresses,
                contacts: createdContacts,
                organization_users: createdOrganizationUsers,
            };
        }, {
            maxWait: 10000, // Maximum wait time for transaction to start (10 seconds)
            timeout: 15000, // Maximum time transaction can run (15 seconds)
        });
        // Fetch complete organization data with all relations
        const completeOrganization = await prisma_config_1.default.organization.findUnique({
            where: { organization_id: result.organization.organization_id },
            include: {
                company_offices: true,
                accounting: true,
                addresses: true,
                contacts: true,
                organization_users: {
                    include: {
                        user: {
                            select: {
                                user_id: true,
                                name: true,
                                email: true,
                                status: true,
                            },
                        },
                    },
                },
                created_by: {
                    select: {
                        user_id: true,
                        name: true,
                        email: true,
                    },
                },
            },
        });
        // ✅ UPDATE USER ACTIVITY - Log organization creation
        await (0, activityService_1.updateUserActivity)(created_by_user_id, {
            action_type: 'CREATE',
            entity_type: 'ORGANIZATION',
            entity_id: result.organization.organization_id,
            entity_name: name,
            timestamp: new Date().toISOString(),
        });
        return (0, response_1.sendSuccess)(res, completeOrganization, 201);
    }
    catch (err) {
        console.error('Error creating organization with complete data:', err);
        // Handle Prisma errors
        if (err.code === 'P2002') {
            return (0, response_1.sendError)(res, 'Duplicate entry found', 409);
        }
        if (err.code === 'P2003') {
            return (0, response_1.sendError)(res, 'Related record not found', 404);
        }
        if (err.code === 'P2028') {
            return (0, response_1.sendError)(res, 'Transaction timeout - please try again', 408);
        }
        return (0, response_1.sendError)(res, 'Failed to create organization', 500);
    }
};
/**
 * Export the controller
 */
exports.organizationCompleteController = {
    createOrganizationComplete,
};
//# sourceMappingURL=fullOrganizationController.js.map