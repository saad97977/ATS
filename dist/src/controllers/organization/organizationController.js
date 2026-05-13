"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.organizationController = void 0;
const client_1 = require("@prisma/client");
const prisma_config_1 = __importDefault(require("../../prisma.config"));
const crudFactory_1 = require("../../factories/crudFactory");
const schemas_1 = require("../../validators/schemas");
const response_1 = require("../../utils/response");
const zod_1 = require("zod");
const activityService_1 = require("../../services/activityService");
// ===============================
// Base CRUD
// ===============================
const baseCrud = (0, crudFactory_1.createCrudController)({
    model: prisma_config_1.default.organization,
    modelName: 'Organization',
    idField: 'organization_id',
    createSchema: schemas_1.createOrganizationSchema,
    updateSchema: schemas_1.updateOrganizationSchema,
    defaultLimit: 10,
    maxLimit: 100,
});
// ===============================
// GET BY ID (FULL ORGANIZATION)
// ===============================
const getOrganizationById = async (req, res) => {
    try {
        const { id } = req.params;
        if (!id) {
            return (0, response_1.sendError)(res, 'Organization ID is required', 400);
        }
        const organization = await prisma_config_1.default.organization.findUnique({
            where: { organization_id: id },
            include: {
                // Base Relations
                created_by: {
                    select: {
                        user_id: true,
                        name: true,
                        email: true,
                        user_role: {
                            select: {
                                role: {
                                    select: {
                                        role_name: true,
                                    },
                                },
                            },
                        },
                    },
                },
                representative: {
                    select: {
                        user_id: true,
                        name: true,
                        email: true,
                    },
                },
                // Organization Details (from update schema)
                addresses: true,
                accounting: true,
                company_offices: true,
                // Contacts with representative details
                contacts: {
                    include: {
                        representative: {
                            select: {
                                user_id: true,
                                name: true,
                                email: true,
                            },
                        },
                    },
                },
                // Organization Users with User details
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
            },
        });
        if (!organization) {
            return (0, response_1.sendError)(res, 'Organization not found', 404);
        }
        // 🔹 Flatten organization_users (name & email at same level)
        const formattedOrganization = {
            ...organization,
            organization_users: organization.organization_users.map((ou) => ({
                organization_user_id: ou.organization_user_id,
                user_id: ou.user?.user_id || null,
                division: ou.division,
                department: ou.department,
                title: ou.title,
                work_phone: ou.work_phone,
                name: ou.user?.name || null,
                email: ou.user?.email || null,
                status: ou.user?.status || null,
            })),
        };
        return (0, response_1.sendSuccess)(res, formattedOrganization);
    }
    catch (err) {
        console.error('Error fetching organization by id:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch organization', 500);
    }
};
// ============================================
// VALIDATION SCHEMAS
// ============================================
const companyOfficeUpdateSchema = zod_1.z.object({
    company_office_id: zod_1.z.string().uuid().optional(),
    office_name: zod_1.z.string().min(1).optional(),
    city: zod_1.z.string().min(1).optional(),
    state: zod_1.z.string().min(1).optional(),
    country: zod_1.z.string().min(1).optional(),
    type: zod_1.z.enum(['REMOTE', 'HYBRID', 'ONSITE']).optional(),
    address: zod_1.z.string().min(1).optional(),
    is_primary: zod_1.z.boolean().optional(),
    _action: zod_1.z.enum(['create', 'update', 'delete']).optional(),
});
const organizationAccountingUpdateSchema = zod_1.z.object({
    organization_accounting_id: zod_1.z.string().uuid().optional(),
    account_type: zod_1.z.string().min(1).optional(),
    bank_name: zod_1.z.string().min(1).optional(),
    account_number: zod_1.z.string().min(1).optional(),
    routing_number: zod_1.z.string().min(1).optional(),
    country: zod_1.z.string().min(1).optional(),
    _action: zod_1.z.enum(['create', 'update', 'delete']).optional(),
});
const organizationAddressUpdateSchema = zod_1.z.object({
    organization_address_id: zod_1.z.string().uuid().optional(),
    address_type: zod_1.z.enum(['WORKSITE', 'BILLING']).optional(),
    address1: zod_1.z.string().min(1).optional(),
    address2: zod_1.z.string().optional(),
    city: zod_1.z.string().min(1).optional(),
    state: zod_1.z.string().min(1).optional(),
    zip: zod_1.z.string().min(1).optional(),
    phone: zod_1.z.string().optional(),
    _action: zod_1.z.enum(['create', 'update', 'delete']).optional(),
});
const organizationContactUpdateSchema = zod_1.z.object({
    organization_contact_id: zod_1.z.string().uuid().optional(),
    // Original fields
    name: zod_1.z.string().min(1).optional(),
    email: zod_1.z.string().email().optional(),
    phone: zod_1.z.string().min(1).optional(),
    contact_type: zod_1.z.enum(['PRIMARY', 'EMERGENCY', 'BILLING']).optional(),
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
    representative_id: zod_1.z.string().uuid().optional().nullable(),
    last_contacted_at: zod_1.z.string().datetime().optional().nullable(),
    _action: zod_1.z.enum(['create', 'update', 'delete']).optional(),
});
const organizationUserUpdateSchema = zod_1.z.object({
    organization_user_id: zod_1.z.string().uuid().optional(),
    user_id: zod_1.z.string().uuid().optional(),
    division: zod_1.z.string().optional(),
    department: zod_1.z.string().optional(),
    title: zod_1.z.string().optional(),
    work_phone: zod_1.z.string().optional(),
    _action: zod_1.z.enum(['create', 'update', 'delete']).optional(),
});
const updateOrganizationCompleteSchema = zod_1.z.object({
    // Original fields
    name: zod_1.z.string().min(1).optional(),
    website: zod_1.z.string().optional().or(zod_1.z.literal('')).or(zod_1.z.string().url()),
    status: zod_1.z.enum([
        'ACTIVE', 'INACTIVE', 'CREDIT_HOLD', 'DELETE',
        'DO_NOT_SERVICE', 'FORMER_CLIENT', 'ON_HOLD', 'PROSPECT',
    ]).optional(),
    phone: zod_1.z.string().optional(),
    // New Organization fields
    fax: zod_1.z.string().optional().nullable(),
    zip: zod_1.z.string().optional().nullable(),
    industry: zod_1.z.string().optional().nullable(),
    revenue: zod_1.z.string().optional().nullable(),
    employee_count: zod_1.z.number().int().positive().optional().nullable(),
    last_contacted_at: zod_1.z.string().datetime().optional().nullable(),
    representative_id: zod_1.z.string().uuid().optional().nullable(),
    branch_region: zod_1.z.string().optional().nullable(),
    branch_name: zod_1.z.string().optional().nullable(),
    default_ot_rule: zod_1.z.string().optional().nullable(),
    contract_markup: zod_1.z.number().optional().nullable(),
    permanent_markup: zod_1.z.number().optional().nullable(),
    overview: zod_1.z.string().optional().nullable(),
    custom_company_id: zod_1.z.string().optional().nullable(),
    org_branch_division: zod_1.z.enum([
        'SMS_HOSPITALITY', 'SMS_MCL_JASCO_GOC', 'SMS_ADMIN',
        'SMS_STAFFING_SOLUTIONS', 'SPECIAL_MULTI_ADMIN', 'SPECIAL_MULTI_INC',
    ]).optional().nullable(),
    // Related entities
    company_offices: zod_1.z.array(companyOfficeUpdateSchema).optional(),
    accounting: zod_1.z.array(organizationAccountingUpdateSchema).optional(),
    addresses: zod_1.z.array(organizationAddressUpdateSchema).optional(),
    contacts: zod_1.z.array(organizationContactUpdateSchema).optional(),
    organization_users: zod_1.z.array(organizationUserUpdateSchema).optional(),
});
// ============================================
// CONTROLLER
// ============================================
/**
 * PATCH /api/organizations/:id
 * Updates organization with all related data in a single transaction
 *
 * _action patterns per nested item:
 *   "create" — insert new record
 *   "update" — patch existing record (requires the PK field)
 *   "delete" — remove record (requires the PK field)
 *   omitted  — treated as "create" if no PK, "update" if PK present
 */
const updateOrganizationComplete = async (req, res) => {
    try {
        const { id } = req.params;
        if (!id)
            return (0, response_1.sendError)(res, 'Organization ID is required', 400);
        const validation = updateOrganizationCompleteSchema.safeParse(req.body);
        if (!validation.success) {
            const errors = validation.error.issues.map((err) => ({
                field: err.path.join('.'),
                message: err.message,
            }));
            return (0, response_1.sendError)(res, 'Validation failed', 400, errors);
        }
        const { name, website, status, phone, fax, zip, industry, revenue, employee_count, last_contacted_at, representative_id, branch_region, branch_name, default_ot_rule, contract_markup, permanent_markup, overview, custom_company_id, org_branch_division, company_offices, accounting, addresses, contacts, organization_users, } = validation.data;
        // Check organization exists
        const existingOrg = await prisma_config_1.default.organization.findUnique({
            where: { organization_id: id },
            include: {
                company_offices: true,
                accounting: true,
                addresses: true,
                contacts: true,
                organization_users: true,
            },
        });
        if (!existingOrg)
            return (0, response_1.sendError)(res, 'Organization not found', 404);
        // Duplicate name check
        if (name && name !== existingOrg.name) {
            const duplicateName = await prisma_config_1.default.organization.findFirst({
                where: { name, organization_id: { not: id } },
            });
            if (duplicateName) {
                return (0, response_1.sendError)(res, 'Organization with this name already exists', 409, [{
                        field: 'name', message: 'An organization with this name already exists',
                    }]);
            }
        }
        // Duplicate custom_company_id check
        if (custom_company_id && custom_company_id !== existingOrg.custom_company_id) {
            const duplicateCustomId = await prisma_config_1.default.organization.findFirst({
                where: { custom_company_id, organization_id: { not: id } },
            });
            if (duplicateCustomId) {
                return (0, response_1.sendError)(res, 'Company ID already in use', 409, [{
                        field: 'custom_company_id', message: 'This Company ID is already in use',
                    }]);
            }
        }
        // Representative exists check
        if (representative_id) {
            const repExists = await prisma_config_1.default.user.findFirst({ where: { user_id: representative_id } });
            if (!repExists)
                return (0, response_1.sendError)(res, 'Representative user not found', 404);
        }
        // Primary office validation
        if (company_offices && company_offices.length > 0) {
            const incomingPrimary = company_offices.filter(o => o.is_primary === true && o._action !== 'delete');
            const survivingExistingPrimary = existingOrg.company_offices.filter(eo => eo.is_primary &&
                !company_offices.some(co => co.company_office_id === eo.company_office_id &&
                    (co._action === 'delete' || co.is_primary === false)));
            if (incomingPrimary.length + survivingExistingPrimary.length > 1) {
                return (0, response_1.sendError)(res, 'Only one company office can be marked as primary', 400);
            }
        }
        // Primary contact validation
        if (contacts && contacts.length > 0) {
            const survivingExistingPrimary = existingOrg.contacts.filter(ec => ec.contact_type === 'PRIMARY' &&
                !contacts.some(c => c.organization_contact_id === ec.organization_contact_id && c._action === 'delete'));
            const incomingPrimary = contacts.filter(c => c.contact_type === 'PRIMARY' && c._action !== 'delete');
            if (survivingExistingPrimary.length === 0 && incomingPrimary.length === 0) {
                return (0, response_1.sendError)(res, 'At least one PRIMARY contact must exist', 400);
            }
        }
        // ── Transaction ──────────────────────────────────────────
        const result = await prisma_config_1.default.$transaction(async (tx) => {
            // 1. Update Organization base fields
            const orgData = {};
            if (name !== undefined)
                orgData.name = name;
            if (website !== undefined)
                orgData.website = website;
            if (status !== undefined)
                orgData.status = status;
            if (phone !== undefined)
                orgData.phone = phone;
            if (fax !== undefined)
                orgData.fax = fax;
            if (zip !== undefined)
                orgData.zip = zip;
            if (industry !== undefined)
                orgData.industry = industry;
            if (revenue !== undefined)
                orgData.revenue = revenue;
            if (employee_count !== undefined)
                orgData.employee_count = employee_count;
            if (last_contacted_at !== undefined)
                orgData.last_contacted_at = last_contacted_at ? new Date(last_contacted_at) : null;
            if (representative_id !== undefined)
                orgData.representative_id = representative_id;
            if (branch_region !== undefined)
                orgData.branch_region = branch_region;
            if (branch_name !== undefined)
                orgData.branch_name = branch_name;
            if (default_ot_rule !== undefined)
                orgData.default_ot_rule = default_ot_rule;
            if (contract_markup !== undefined)
                orgData.contract_markup = contract_markup;
            if (permanent_markup !== undefined)
                orgData.permanent_markup = permanent_markup;
            if (overview !== undefined)
                orgData.overview = overview;
            if (custom_company_id !== undefined)
                orgData.custom_company_id = custom_company_id;
            if (org_branch_division !== undefined)
                orgData.org_branch_division = org_branch_division;
            const updatedOrganization = Object.keys(orgData).length > 0
                ? await tx.organization.update({ where: { organization_id: id }, data: orgData })
                : existingOrg;
            // 2. Company Offices
            const officeResults = { created: [], updated: [], deleted: [] };
            if (company_offices && company_offices.length > 0) {
                for (const office of company_offices) {
                    if (office._action === 'delete' && office.company_office_id) {
                        officeResults.deleted.push(await tx.companyOffice.delete({ where: { company_office_id: office.company_office_id } }));
                    }
                    else if (office._action === 'update' && office.company_office_id) {
                        const d = {};
                        if (office.office_name !== undefined)
                            d.office_name = office.office_name;
                        if (office.city !== undefined)
                            d.city = office.city;
                        if (office.state !== undefined)
                            d.state = office.state;
                        if (office.country !== undefined)
                            d.country = office.country;
                        if (office.type !== undefined)
                            d.type = office.type;
                        if (office.address !== undefined)
                            d.address = office.address;
                        if (office.is_primary !== undefined)
                            d.is_primary = office.is_primary;
                        officeResults.updated.push(await tx.companyOffice.update({ where: { company_office_id: office.company_office_id }, data: d }));
                    }
                    else {
                        officeResults.created.push(await tx.companyOffice.create({
                            data: {
                                organization_id: id,
                                office_name: office.office_name,
                                city: office.city,
                                state: office.state,
                                country: office.country,
                                type: office.type,
                                address: office.address,
                                is_primary: office.is_primary || false,
                            },
                        }));
                    }
                }
            }
            // 3. Accounting
            const accountingResults = { created: [], updated: [], deleted: [] };
            if (accounting && accounting.length > 0) {
                for (const acc of accounting) {
                    if (acc._action === 'delete' && acc.organization_accounting_id) {
                        accountingResults.deleted.push(await tx.organizationAccounting.delete({ where: { organization_accounting_id: acc.organization_accounting_id } }));
                    }
                    else if (acc._action === 'update' && acc.organization_accounting_id) {
                        const d = {};
                        if (acc.account_type !== undefined)
                            d.account_type = acc.account_type;
                        if (acc.bank_name !== undefined)
                            d.bank_name = acc.bank_name;
                        if (acc.account_number !== undefined)
                            d.account_number = acc.account_number;
                        if (acc.routing_number !== undefined)
                            d.routing_number = acc.routing_number;
                        if (acc.country !== undefined)
                            d.country = acc.country;
                        accountingResults.updated.push(await tx.organizationAccounting.update({ where: { organization_accounting_id: acc.organization_accounting_id }, data: d }));
                    }
                    else {
                        accountingResults.created.push(await tx.organizationAccounting.create({
                            data: {
                                organization_id: id,
                                account_type: acc.account_type,
                                bank_name: acc.bank_name,
                                account_number: acc.account_number,
                                routing_number: acc.routing_number,
                                country: acc.country,
                            },
                        }));
                    }
                }
            }
            // 4. Addresses
            const addressResults = { created: [], updated: [], deleted: [] };
            if (addresses && addresses.length > 0) {
                for (const addr of addresses) {
                    if (addr._action === 'delete' && addr.organization_address_id) {
                        addressResults.deleted.push(await tx.organizationAddress.delete({ where: { organization_address_id: addr.organization_address_id } }));
                    }
                    else if (addr._action === 'update' && addr.organization_address_id) {
                        const d = {};
                        if (addr.address_type !== undefined)
                            d.address_type = addr.address_type;
                        if (addr.address1 !== undefined)
                            d.address1 = addr.address1;
                        if (addr.address2 !== undefined)
                            d.address2 = addr.address2;
                        if (addr.city !== undefined)
                            d.city = addr.city;
                        if (addr.state !== undefined)
                            d.state = addr.state;
                        if (addr.zip !== undefined)
                            d.zip = addr.zip;
                        if (addr.phone !== undefined)
                            d.phone = addr.phone;
                        addressResults.updated.push(await tx.organizationAddress.update({ where: { organization_address_id: addr.organization_address_id }, data: d }));
                    }
                    else {
                        addressResults.created.push(await tx.organizationAddress.create({
                            data: {
                                organization_id: id,
                                address_type: addr.address_type,
                                address1: addr.address1,
                                address2: addr.address2,
                                city: addr.city,
                                state: addr.state,
                                zip: addr.zip,
                                phone: addr.phone,
                            },
                        }));
                    }
                }
            }
            // 5. Contacts (with new fields)
            const contactResults = { created: [], updated: [], deleted: [] };
            if (contacts && contacts.length > 0) {
                for (const contact of contacts) {
                    if (contact._action === 'delete' && contact.organization_contact_id) {
                        contactResults.deleted.push(await tx.organizationContact.delete({ where: { organization_contact_id: contact.organization_contact_id } }));
                    }
                    else if (contact._action === 'update' && contact.organization_contact_id) {
                        const d = {};
                        if (contact.name !== undefined)
                            d.name = contact.name;
                        if (contact.email !== undefined)
                            d.email = contact.email;
                        if (contact.phone !== undefined)
                            d.phone = contact.phone;
                        if (contact.contact_type !== undefined)
                            d.contact_type = contact.contact_type;
                        if (contact.first_name !== undefined)
                            d.first_name = contact.first_name;
                        if (contact.last_name !== undefined)
                            d.last_name = contact.last_name;
                        if (contact.contact_title !== undefined)
                            d.contact_title = contact.contact_title;
                        if (contact.address !== undefined)
                            d.address = contact.address;
                        if (contact.mobile_phone !== undefined)
                            d.mobile_phone = contact.mobile_phone;
                        if (contact.fax !== undefined)
                            d.fax = contact.fax;
                        if (contact.city !== undefined)
                            d.city = contact.city;
                        if (contact.state !== undefined)
                            d.state = contact.state;
                        if (contact.zip !== undefined)
                            d.zip = contact.zip;
                        if (contact.division !== undefined)
                            d.division = contact.division;
                        if (contact.department !== undefined)
                            d.department = contact.department;
                        if (contact.title !== undefined)
                            d.title = contact.title;
                        if (contact.representative_id !== undefined)
                            d.representative_id = contact.representative_id;
                        if (contact.last_contacted_at !== undefined)
                            d.last_contacted_at = contact.last_contacted_at ? new Date(contact.last_contacted_at) : null;
                        contactResults.updated.push(await tx.organizationContact.update({ where: { organization_contact_id: contact.organization_contact_id }, data: d }));
                    }
                    else {
                        contactResults.created.push(await tx.organizationContact.create({
                            data: {
                                organization_id: id,
                                name: contact.name,
                                email: contact.email,
                                phone: contact.phone,
                                contact_type: contact.contact_type,
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
                            },
                        }));
                    }
                }
            }
            // 6. Organization Users
            const orgUserResults = { created: [], updated: [], deleted: [] };
            if (organization_users && organization_users.length > 0) {
                for (const ou of organization_users) {
                    if (ou._action === 'delete' && ou.organization_user_id) {
                        orgUserResults.deleted.push(await tx.organizationUser.delete({ where: { organization_user_id: ou.organization_user_id } }));
                    }
                    else if (ou._action === 'update' && ou.organization_user_id) {
                        const d = {};
                        if (ou.division !== undefined)
                            d.division = ou.division;
                        if (ou.department !== undefined)
                            d.department = ou.department;
                        if (ou.title !== undefined)
                            d.title = ou.title;
                        if (ou.work_phone !== undefined)
                            d.work_phone = ou.work_phone;
                        orgUserResults.updated.push(await tx.organizationUser.update({ where: { organization_user_id: ou.organization_user_id }, data: d }));
                    }
                    else {
                        orgUserResults.created.push(await tx.organizationUser.create({
                            data: {
                                organization_id: id,
                                user_id: ou.user_id,
                                division: ou.division,
                                department: ou.department,
                                title: ou.title,
                                work_phone: ou.work_phone,
                            },
                        }));
                    }
                }
            }
            return {
                organization: updatedOrganization,
                company_offices: officeResults,
                accounting: accountingResults,
                addresses: addressResults,
                contacts: contactResults,
                organization_users: orgUserResults,
            };
        });
        // Fetch complete updated data
        const completeOrganization = await prisma_config_1.default.organization.findUnique({
            where: { organization_id: id },
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
        await (0, activityService_1.updateUserActivity)(existingOrg.created_by_user_id, {
            action_type: 'UPDATE',
            entity_type: 'ORGANIZATION',
            entity_id: id,
            entity_name: completeOrganization?.name || existingOrg.name,
            timestamp: new Date().toISOString(),
        });
        return (0, response_1.sendSuccess)(res, {
            organization: completeOrganization,
            changes: {
                company_offices: {
                    created: result.company_offices.created.length,
                    updated: result.company_offices.updated.length,
                    deleted: result.company_offices.deleted.length,
                },
                accounting: {
                    created: result.accounting.created.length,
                    updated: result.accounting.updated.length,
                    deleted: result.accounting.deleted.length,
                },
                addresses: {
                    created: result.addresses.created.length,
                    updated: result.addresses.updated.length,
                    deleted: result.addresses.deleted.length,
                },
                contacts: {
                    created: result.contacts.created.length,
                    updated: result.contacts.updated.length,
                    deleted: result.contacts.deleted.length,
                },
                organization_users: {
                    created: result.organization_users.created.length,
                    updated: result.organization_users.updated.length,
                    deleted: result.organization_users.deleted.length,
                },
            },
        });
    }
    catch (err) {
        console.error('Error updating organization:', err);
        if (err.code === 'P2002')
            return (0, response_1.sendError)(res, 'Duplicate entry found', 409);
        if (err.code === 'P2003')
            return (0, response_1.sendError)(res, 'Related record not found', 404);
        if (err.code === 'P2025')
            return (0, response_1.sendError)(res, 'Record to update not found', 404);
        return (0, response_1.sendError)(res, 'Failed to update organization', 500);
    }
};
// ===============================
// GET ALL (FLAT RESPONSE)
// ===============================
// const getAllOrganizations = async (req: Request, res: Response) => {
//   try {
//     const getAll = req.query.all === 'true';
//     const statusFilter = req.query.status as string | undefined;
//     const page = Math.max(1, parseInt(req.query.page as string) || 1);
//     const limit = getAll
//       ? undefined
//       : Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 10));
//     const skip = getAll ? undefined : (page - 1) * limit!;
//     // Build where clause for status filter
//     const whereClause: any = {};
//     if (statusFilter) {
//       whereClause.status = statusFilter.toUpperCase();
//     }
//     const [rows, total, totalActive] = await Promise.all([
//       prisma.organization.findMany({
//         skip,
//         take: limit,
//         where: whereClause,
//         orderBy: { created_at: 'desc' },
//         select: getAll
//           ? {
//               organization_id: true,
//               name: true,
//               status: true,
//               jobs: {
//                 select: {
//                   _count: {
//                     select: {
//                       applications: true,
//                     },
//                   },
//                 },
//               },
//               _count: {
//                 select: {
//                   jobs: true,
//                   organization_users: true,
//                 },
//               },
//             }
//           : {
//               organization_id: true,
//               name: true,
//               website: true,
//               status: true,
//               phone: true,
//               created_at: true,
//               created_by_user_id: true,
//               created_by: {
//                 select: {
//                   name: true,
//                   email: true,
//                   user_role: {
//                     select: {
//                       role: {
//                         select: {
//                           role_name: true,
//                         },
//                       },
//                     },
//                   },
//                 },
//               },
//               jobs: {
//                 select: {
//                   _count: {
//                     select: {
//                       applications: true,
//                     },
//                   },
//                 },
//               },
//               _count: {
//                 select: {
//                   jobs: true,
//                   organization_users: true,
//                 },
//               },
//             },
//       }),
//       prisma.organization.count({ where: whereClause }),
//       prisma.organization.count({
//         where: {
//           status: 'ACTIVE',
//         },
//       }),
//     ]);
//     // If all=true → data already in final shape with counts
//     if (getAll) {
//       const formattedData = rows.map((org: any) => ({
//         organization_id: org.organization_id,
//         name: org.name,
//         status: org.status,
//         jobs: org._count.jobs,
//         applicants: org.jobs.reduce((sum: number, job: any) => sum + job._count.applications, 0),
//         users: org._count.organization_users,
//       }));
//       return sendSuccess(res, {
//         data: formattedData,
//         paging: null,
//         totalActive,
//       });
//     }
//     // Normal paginated response
//     const data = rows.map((org: any) => ({
//       organization_id: org.organization_id,
//       name: org.name,
//       website: org.website,
//       status: org.status,
//       phone: org.phone,
//       created_at: org.created_at,
//       created_by_user_id: org.created_by_user_id,
//       created_by_name: org.created_by?.name ?? null,
//       created_by_email: org.created_by?.email ?? null,
//       created_by_role: org.created_by?.user_role?.role?.role_name ?? null,
//       jobs: org._count.jobs,
//       applicants: org.jobs.reduce((sum: number, job: any) => sum + job._count.applications, 0),
//       users: org._count.organization_users,
//     }));
//     return sendSuccess(res, {
//       data,
//       paging: {
//         total,
//         page,
//         limit,
//         totalPages: Math.ceil(total / limit!),
//       },
//       totalActive,
//     });
//   } catch (err) {
//     console.error('Error fetching organizations:', err);
//     return sendError(res, 'Failed to fetch organizations', 500);
//   }
// };
const getAllOrganizations = async (req, res) => {
    try {
        const { page, limit: limitParam, status, search, } = req.query;
        const pageNum = Math.max(1, parseInt(page) || 1);
        const limitNum = Math.min(100, Math.max(1, parseInt(limitParam) || 10));
        const skip = (pageNum - 1) * limitNum;
        // ── Where clause ─────────────────────────────────────────────
        const where = {
            // Never surface soft-deleted orgs
            NOT: { status: 'DELETE' },
            // Status filter — only apply when a valid enum value is passed
            ...(status && status !== 'all' && isValidOrgStatus(status)
                ? { status: status.toUpperCase() }
                : {}),
            // Server-side search on name (Postgres ILIKE)
            ...(search?.trim()
                ? {
                    name: {
                        contains: search.trim(),
                        mode: 'insensitive',
                    },
                }
                : {}),
        };
        // ── Shared select ─────────────────────────────────────────────
        const select = {
            organization_id: true,
            name: true,
            website: true,
            status: true,
            phone: true,
            created_at: true,
            created_by_user_id: true,
            created_by: {
                select: {
                    name: true,
                    email: true,
                    user_role: {
                        select: {
                            role: {
                                select: { role_name: true },
                            },
                        },
                    },
                },
            },
            jobs: {
                select: {
                    _count: {
                        select: { applications: true },
                    },
                },
            },
            _count: {
                select: {
                    jobs: true,
                    organization_users: true,
                },
            },
        };
        // ── Parallel queries ──────────────────────────────────────────
        const [rows, total, totalActive] = await Promise.all([
            prisma_config_1.default.organization.findMany({
                where,
                skip,
                take: limitNum,
                orderBy: { created_at: 'desc' },
                select,
            }),
            // Total matching current search + filter
            prisma_config_1.default.organization.count({ where }),
            // Active count always reflects global active (unaffected by search/filter)
            prisma_config_1.default.organization.count({
                where: { status: client_1.OrganizationStatus.ACTIVE },
            }),
        ]);
        // ── Shape response — same format as before ────────────────────
        const data = rows.map((org) => ({
            organization_id: org.organization_id,
            name: org.name,
            website: org.website,
            status: org.status,
            phone: org.phone,
            created_at: org.created_at,
            created_by_user_id: org.created_by_user_id,
            created_by_name: org.created_by?.name ?? null,
            created_by_email: org.created_by?.email ?? null,
            created_by_role: org.created_by?.user_role?.role?.role_name ?? null,
            jobs: org._count.jobs,
            applicants: org.jobs.reduce((sum, job) => sum + job._count.applications, 0),
            users: org._count.organization_users,
        }));
        return (0, response_1.sendSuccess)(res, {
            data,
            paging: {
                total,
                page: pageNum,
                limit: limitNum,
                totalPages: Math.ceil(total / limitNum),
            },
            totalActive,
        });
    }
    catch (err) {
        console.error('Error fetching organizations:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch organizations', 500);
    }
};
// ── Guard: keeps the status cast safe ────────────────────────────
function isValidOrgStatus(val) {
    return Object.values(client_1.OrganizationStatus).includes(val.toUpperCase());
}
// ===============================
// EXPORT CONTROLLER
// ===============================
exports.organizationController = {
    ...baseCrud,
    getAll: getAllOrganizations,
    getById: getOrganizationById,
    update: updateOrganizationComplete,
};
//# sourceMappingURL=organizationController.js.map