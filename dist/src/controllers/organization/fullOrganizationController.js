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
// ============================================
// VALIDATION SCHEMAS
// ============================================
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
    // Original fields
    name: zod_1.z.string().min(1, 'Contact name is required'),
    email: zod_1.z.string().email('Valid email is required'),
    phone: zod_1.z.string().min(1, 'Phone number is required'),
    contact_type: zod_1.z.enum(['PRIMARY', 'EMERGENCY', 'BILLING']),
    // New fields
    first_name: zod_1.z.string().optional(),
    last_name: zod_1.z.string().optional(),
    contact_title: zod_1.z.string().optional(),
    address: zod_1.z.string().optional(),
    mobile_phone: zod_1.z.string().optional(),
    fax: zod_1.z.string().optional(),
    city: zod_1.z.string().optional(),
    state: zod_1.z.string().optional(),
    zip: zod_1.z.string().optional(),
    division: zod_1.z.string().optional(),
    department: zod_1.z.string().optional(),
    title: zod_1.z.string().optional(),
    representative_id: zod_1.z.string().uuid().optional(),
    last_contacted_at: zod_1.z.string().datetime().optional(),
});
const organizationUserSchema = zod_1.z.object({
    user_id: zod_1.z.string().uuid('Valid user ID is required'),
    division: zod_1.z.string().min(1).optional(),
    department: zod_1.z.string().min(1).optional(),
    title: zod_1.z.string().min(1).optional(),
    work_phone: zod_1.z.string().min(1).optional(),
});
const createOrganizationCompleteSchema = zod_1.z.object({
    // Original fields
    name: zod_1.z.string().min(1, 'Organization name is required'),
    website: zod_1.z.string().url('Valid URL is required').optional(),
    status: zod_1.z.enum([
        'ACTIVE', 'INACTIVE', 'CREDIT_HOLD', 'DELETE',
        'DO_NOT_SERVICE', 'FORMER_CLIENT', 'ON_HOLD', 'PROSPECT',
    ]).optional().default('ACTIVE'),
    phone: zod_1.z.string().optional(),
    created_by_user_id: zod_1.z.string().uuid('Valid user ID is required'),
    // New Organization fields
    fax: zod_1.z.string().optional(),
    zip: zod_1.z.string().optional(),
    industry: zod_1.z.string().optional(),
    revenue: zod_1.z.string().optional(),
    employee_count: zod_1.z.number().int().positive().optional(),
    last_contacted_at: zod_1.z.string().datetime().optional(),
    representative_id: zod_1.z.string().uuid().optional(),
    branch_region: zod_1.z.string().optional(),
    branch_name: zod_1.z.string().optional(),
    default_ot_rule: zod_1.z.string().optional(),
    contract_markup: zod_1.z.number().optional(),
    permanent_markup: zod_1.z.number().optional(),
    overview: zod_1.z.string().optional(),
    custom_company_id: zod_1.z.string().optional(),
    org_branch_division: zod_1.z.enum([
        'SMS_HOSPITALITY', 'SMS_MCL_JASCO_GOC', 'SMS_ADMIN',
        'SMS_STAFFING_SOLUTIONS', 'SPECIAL_MULTI_ADMIN', 'SPECIAL_MULTI_INC',
    ]).optional(),
    // Related entities
    company_offices: zod_1.z.array(companyOfficeSchema).optional(),
    accounting: zod_1.z.array(organizationAccountingSchema).optional(),
    addresses: zod_1.z.array(organizationAddressSchema).optional(),
    contacts: zod_1.z.array(organizationContactSchema).optional(),
    organization_users: zod_1.z.array(organizationUserSchema).optional(),
});
// ============================================
// CONTROLLER
// ============================================
/**
 * POST /api/organizations/complete
 * Creates organization with all related data in a single transaction
 */
const createOrganizationComplete = async (req, res) => {
    try {
        const validation = createOrganizationCompleteSchema.safeParse(req.body);
        if (!validation.success) {
            const errors = validation.error.issues.map((err) => ({
                field: err.path.join('.'),
                message: err.message,
            }));
            return (0, response_1.sendError)(res, 'Validation failed', 400, errors);
        }
        const { name, website, status, phone, created_by_user_id, 
        // New org fields
        fax, zip, industry, revenue, employee_count, last_contacted_at, representative_id, branch_region, branch_name, default_ot_rule, contract_markup, permanent_markup, overview, custom_company_id, org_branch_division, 
        // Relations
        company_offices, accounting, addresses, contacts, organization_users, } = validation.data;
        // Check if creator exists
        const userExists = await prisma_config_1.default.user.findFirst({
            where: { user_id: created_by_user_id },
        });
        if (!userExists)
            return (0, response_1.sendError)(res, 'User not found', 404);
        // Check duplicate org name
        const existingOrg = await prisma_config_1.default.organization.findUnique({ where: { name } });
        if (existingOrg) {
            return (0, response_1.sendError)(res, 'Organization with this name already exists', 409, [{
                    field: 'duplicate',
                    message: 'Organization already exists',
                }]);
        }
        // Check duplicate custom_company_id if provided
        if (custom_company_id) {
            const existingCustomId = await prisma_config_1.default.organization.findUnique({
                where: { custom_company_id },
            });
            if (existingCustomId) {
                return (0, response_1.sendError)(res, 'Company ID already in use', 409, [{
                        field: 'custom_company_id',
                        message: 'This Company ID is already assigned to another organization',
                    }]);
            }
        }
        // Check representative exists if provided
        if (representative_id) {
            const repExists = await prisma_config_1.default.user.findFirst({ where: { user_id: representative_id } });
            if (!repExists)
                return (0, response_1.sendError)(res, 'Representative user not found', 404);
        }
        // Validate contacts have representative if provided
        if (contacts && contacts.length > 0) {
            const contactRepIds = contacts
                .map(c => c.representative_id)
                .filter(Boolean);
            if (contactRepIds.length > 0) {
                const reps = await prisma_config_1.default.user.findMany({
                    where: { user_id: { in: contactRepIds } },
                });
                if (reps.length !== new Set(contactRepIds).size) {
                    return (0, response_1.sendError)(res, 'One or more contact representatives not found', 404);
                }
            }
        }
        // Validate: Only one primary office
        if (company_offices && company_offices.filter(o => o.is_primary).length > 1) {
            return (0, response_1.sendError)(res, 'Only one company office can be marked as primary', 400);
        }
        // Validate: At least one PRIMARY contact if contacts provided
        if (contacts && contacts.length > 0) {
            const primaryContacts = contacts.filter(c => c.contact_type === 'PRIMARY');
            if (primaryContacts.length === 0) {
                return (0, response_1.sendError)(res, 'At least one PRIMARY contact is required when adding contacts', 400);
            }
        }
        // Validate organization users exist
        if (organization_users && organization_users.length > 0) {
            const userIds = organization_users.map(ou => ou.user_id);
            const uniqueUserIds = [...new Set(userIds)];
            if (userIds.length !== uniqueUserIds.length) {
                return (0, response_1.sendError)(res, 'Duplicate user IDs found in organization_users', 400);
            }
            const users = await prisma_config_1.default.user.findMany({
                where: { user_id: { in: uniqueUserIds } },
            });
            if (users.length !== uniqueUserIds.length) {
                const foundIds = users.map(u => u.user_id);
                const missingIds = uniqueUserIds.filter(id => !foundIds.includes(id));
                return (0, response_1.sendError)(res, 'One or more users not found', 404, missingIds.map(id => ({ field: 'organization_users', message: `User ${id} not found` })));
            }
        }
        // ── Transaction ──────────────────────────────────────────
        const result = await prisma_config_1.default.$transaction(async (tx) => {
            // 1. Create Organization
            const newOrganization = await tx.organization.create({
                data: {
                    name,
                    website,
                    status,
                    phone,
                    created_by_user_id,
                    // New fields
                    fax,
                    zip,
                    industry,
                    revenue,
                    employee_count,
                    last_contacted_at: last_contacted_at ? new Date(last_contacted_at) : undefined,
                    representative_id,
                    branch_region,
                    branch_name,
                    default_ot_rule,
                    contract_markup,
                    permanent_markup,
                    overview,
                    custom_company_id,
                    org_branch_division,
                },
            });
            // 2. Company Offices
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
            }
            // 3. Accounting
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
            }
            // 4. Addresses
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
            }
            // 5. Contacts (use create — not createMany — to support all new nullable fields)
            if (contacts && contacts.length > 0) {
                await tx.organizationContact.createMany({
                    data: contacts.map(contact => ({
                        organization_id: newOrganization.organization_id,
                        name: contact.name,
                        email: contact.email,
                        phone: contact.phone,
                        contact_type: contact.contact_type,
                        // New fields
                        first_name: contact.first_name,
                        last_name: contact.last_name,
                        contact_title: contact.contact_title,
                        address: contact.address,
                        mobile_phone: contact.mobile_phone,
                        fax: contact.fax,
                        city: contact.city,
                        state: contact.state,
                        zip: contact.zip,
                        division: contact.division,
                        department: contact.department,
                        title: contact.title,
                        representative_id: contact.representative_id,
                        last_contacted_at: contact.last_contacted_at
                            ? new Date(contact.last_contacted_at)
                            : undefined,
                    })),
                });
            }
            // 6. Organization Users
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
            }
            return newOrganization;
        }, {
            maxWait: 10000,
            timeout: 15000,
        });
        // Fetch complete result
        const completeOrganization = await prisma_config_1.default.organization.findUnique({
            where: { organization_id: result.organization_id },
            include: {
                company_offices: true,
                accounting: true,
                addresses: true,
                contacts: {
                    include: {
                        representative: {
                            select: { user_id: true, name: true, email: true },
                        },
                    },
                },
                organization_users: {
                    include: {
                        user: {
                            select: { user_id: true, name: true, email: true, status: true },
                        },
                    },
                },
                created_by: {
                    select: { user_id: true, name: true, email: true },
                },
                representative: {
                    select: { user_id: true, name: true, email: true },
                },
            },
        });
        await (0, activityService_1.updateUserActivity)(created_by_user_id, {
            action_type: 'CREATE',
            entity_type: 'ORGANIZATION',
            entity_id: result.organization_id,
            entity_name: name,
            timestamp: new Date().toISOString(),
        });
        return (0, response_1.sendSuccess)(res, completeOrganization, 201);
    }
    catch (err) {
        console.error('Error creating organization:', err);
        if (err.code === 'P2002')
            return (0, response_1.sendError)(res, 'Duplicate entry found', 409);
        if (err.code === 'P2003')
            return (0, response_1.sendError)(res, 'Related record not found', 404);
        if (err.code === 'P2028')
            return (0, response_1.sendError)(res, 'Transaction timeout - please try again', 408);
        return (0, response_1.sendError)(res, 'Failed to create organization', 500);
    }
};
exports.organizationCompleteController = {
    createOrganizationComplete,
};
//# sourceMappingURL=fullOrganizationController.js.map