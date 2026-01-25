"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.organizationController = void 0;
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
// GET ALL (FLAT RESPONSE)
// ===============================
const getAllOrganizations = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
        const skip = (page - 1) * limit;
        const [rows, total] = await Promise.all([
            prisma_config_1.default.organization.findMany({
                skip,
                take: limit,
                orderBy: { created_at: 'desc' },
                include: {
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
                },
            }),
            prisma_config_1.default.organization.count(),
        ]);
        const data = rows.map(org => ({
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
        }));
        return (0, response_1.sendSuccess)(res, {
            data,
            paging: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        });
    }
    catch (err) {
        console.error('Error fetching organizations:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch organizations', 500);
    }
};
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
                addresses: true,
                accounting: true,
                company_offices: true,
                contacts: true,
                organization_users: {
                    select: {
                        organization_user_id: true,
                        division: true,
                        department: true,
                        title: true,
                        work_phone: true,
                        user: {
                            select: {
                                name: true,
                                email: true,
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
                division: ou.division,
                department: ou.department,
                title: ou.title,
                work_phone: ou.work_phone,
                name: ou.user?.name || null,
                email: ou.user?.email || null,
            })),
        };
        return (0, response_1.sendSuccess)(res, formattedOrganization);
    }
    catch (err) {
        console.error('Error fetching organization by id:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch organization', 500);
    }
};
/**
 * Organization Complete Update Controller
 * PATCH request to update Organization with all related data in a single transaction
 *
 * Updates:
 * - Organization (base fields)
 * - CompanyOffice(s) - create, update, or delete
 * - OrganizationAccounting(s) - create, update, or delete
 * - OrganizationAddress(es) - create, update, or delete
 * - OrganizationContact(s) - create, update, or delete
 */
// Validation Schemas for nested updates
const companyOfficeUpdateSchema = zod_1.z.object({
    company_office_id: zod_1.z.string().uuid().optional(), // If provided, update existing; if not, create new
    office_name: zod_1.z.string().min(1, 'Office name is required').optional(),
    city: zod_1.z.string().min(1, 'City is required').optional(),
    state: zod_1.z.string().min(1, 'State is required').optional(),
    country: zod_1.z.string().min(1, 'Country is required').optional(),
    type: zod_1.z.enum(['REMOTE', 'HYBRID', 'ONSITE']).optional(),
    address: zod_1.z.string().min(1, 'Address is required').optional(),
    is_primary: zod_1.z.boolean().optional(),
    _action: zod_1.z.enum(['create', 'update', 'delete']).optional(), // Explicit action
});
const organizationAccountingUpdateSchema = zod_1.z.object({
    organization_accounting_id: zod_1.z.string().uuid().optional(),
    account_type: zod_1.z.string().min(1, 'Account type is required').optional(),
    bank_name: zod_1.z.string().min(1, 'Bank name is required').optional(),
    account_number: zod_1.z.string().min(1, 'Account number is required').optional(),
    routing_number: zod_1.z.string().min(1, 'Routing number is required').optional(),
    country: zod_1.z.string().min(1, 'Country is required').optional(),
    _action: zod_1.z.enum(['create', 'update', 'delete']).optional(),
});
const organizationAddressUpdateSchema = zod_1.z.object({
    organization_address_id: zod_1.z.string().uuid().optional(),
    address_type: zod_1.z.enum(['WORKSITE', 'BILLING']).optional(),
    address1: zod_1.z.string().min(1, 'Address line 1 is required').optional(),
    address2: zod_1.z.string().optional(),
    city: zod_1.z.string().min(1, 'City is required').optional(),
    state: zod_1.z.string().min(1, 'State is required').optional(),
    zip: zod_1.z.string().min(1, 'ZIP code is required').optional(),
    phone: zod_1.z.string().optional(),
    _action: zod_1.z.enum(['create', 'update', 'delete']).optional(),
});
const organizationContactUpdateSchema = zod_1.z.object({
    organization_contact_id: zod_1.z.string().uuid().optional(),
    name: zod_1.z.string().min(1, 'Contact name is required').optional(),
    email: zod_1.z.string().email('Valid email is required').optional(),
    phone: zod_1.z.string().min(1, 'Phone number is required').optional(),
    contact_type: zod_1.z.enum(['PRIMARY', 'EMERGENCY']).optional(),
    _action: zod_1.z.enum(['create', 'update', 'delete']).optional(),
});
const updateOrganizationCompleteSchema = zod_1.z.object({
    // Organization base fields (all optional for PATCH)
    name: zod_1.z.string().min(1, 'Organization name is required').optional(),
    website: zod_1.z.string().url('Valid URL is required').optional(),
    status: zod_1.z.enum(['ACTIVE', 'INACTIVE']).optional(),
    phone: zod_1.z.string().optional(),
    // Related entities arrays
    company_offices: zod_1.z.array(companyOfficeUpdateSchema).optional(),
    accounting: zod_1.z.array(organizationAccountingUpdateSchema).optional(),
    addresses: zod_1.z.array(organizationAddressUpdateSchema).optional(),
    contacts: zod_1.z.array(organizationContactUpdateSchema).optional(),
});
/**
 * PATCH /api/organizations/:id
 * Updates organization with all related data in a single transaction
 *
 * Usage patterns:
 * 1. Update organization base fields only: { name: "New Name" }
 * 2. Create new nested records: { company_offices: [{ office_name: "...", _action: "create" }] }
 * 3. Update existing nested records: { company_offices: [{ company_office_id: "uuid", office_name: "...", _action: "update" }] }
 * 4. Delete nested records: { company_offices: [{ company_office_id: "uuid", _action: "delete" }] }
 * 5. Mixed operations: Combine create, update, delete in same request
 */
// organization user is yet to add in this complete update controller
const updateOrganizationComplete = async (req, res) => {
    try {
        const { id } = req.params;
        if (!id) {
            return (0, response_1.sendError)(res, 'Organization ID is required', 400);
        }
        // Validate request body
        const validation = updateOrganizationCompleteSchema.safeParse(req.body);
        if (!validation.success) {
            const errors = validation.error.issues.map((err) => ({
                field: err.path.join('.'),
                message: err.message,
            }));
            return (0, response_1.sendError)(res, 'Validation failed', 400, errors);
        }
        const { name, website, status, phone, company_offices, accounting, addresses, contacts } = validation.data;
        // Check if organization exists
        const existingOrg = await prisma_config_1.default.organization.findUnique({
            where: { organization_id: id },
            include: {
                company_offices: true,
                accounting: true,
                addresses: true,
                contacts: true,
            },
        });
        if (!existingOrg) {
            return (0, response_1.sendError)(res, 'Organization not found', 404);
        }
        // Check for duplicate organization name (if updating name)
        if (name && name !== existingOrg.name) {
            const duplicateName = await prisma_config_1.default.organization.findFirst({
                where: {
                    name,
                    organization_id: { not: id },
                },
            });
            if (duplicateName) {
                return (0, response_1.sendError)(res, 'Organization with this name already exists', 409, [{
                        field: 'name',
                        message: 'An organization with this name already exists',
                    }]);
            }
        }
        // Validate: Only one primary office allowed across all offices
        if (company_offices && company_offices.length > 0) {
            const newPrimaryOffices = company_offices.filter(office => office.is_primary === true && office._action !== 'delete');
            const existingPrimaryOffices = existingOrg.company_offices.filter(office => office.is_primary &&
                !company_offices.some(co => co.company_office_id === office.company_office_id && co._action === 'delete'));
            const totalPrimaryCount = newPrimaryOffices.length +
                existingPrimaryOffices.filter(epo => !company_offices.some(co => co.company_office_id === epo.company_office_id && co.is_primary === false)).length;
            if (totalPrimaryCount > 1) {
                return (0, response_1.sendError)(res, 'Only one company office can be marked as primary', 400);
            }
        }
        // Validate: At least one PRIMARY contact must remain
        if (contacts && contacts.length > 0) {
            const existingPrimaryContacts = existingOrg.contacts.filter(contact => contact.contact_type === 'PRIMARY' &&
                !contacts.some(c => c.organization_contact_id === contact.organization_contact_id && c._action === 'delete'));
            const newPrimaryContacts = contacts.filter(contact => contact.contact_type === 'PRIMARY' && contact._action !== 'delete');
            if (existingPrimaryContacts.length === 0 && newPrimaryContacts.length === 0) {
                return (0, response_1.sendError)(res, 'At least one PRIMARY contact must exist', 400);
            }
        }
        // Perform update in a transaction
        const result = await prisma_config_1.default.$transaction(async (tx) => {
            // 1. Update Organization base fields
            const organizationUpdateData = {};
            if (name !== undefined)
                organizationUpdateData.name = name;
            if (website !== undefined)
                organizationUpdateData.website = website;
            if (status !== undefined)
                organizationUpdateData.status = status;
            if (phone !== undefined)
                organizationUpdateData.phone = phone;
            const updatedOrganization = Object.keys(organizationUpdateData).length > 0
                ? await tx.organization.update({
                    where: { organization_id: id },
                    data: organizationUpdateData,
                })
                : existingOrg;
            // 2. Handle Company Offices
            const officeResults = {
                created: [],
                updated: [],
                deleted: [],
            };
            if (company_offices && company_offices.length > 0) {
                for (const office of company_offices) {
                    if (office._action === 'delete' && office.company_office_id) {
                        // Delete office
                        const deleted = await tx.companyOffice.delete({
                            where: { company_office_id: office.company_office_id },
                        });
                        officeResults.deleted.push(deleted);
                    }
                    else if (office._action === 'update' && office.company_office_id) {
                        // Update existing office
                        const updateData = {};
                        if (office.office_name !== undefined)
                            updateData.office_name = office.office_name;
                        if (office.city !== undefined)
                            updateData.city = office.city;
                        if (office.state !== undefined)
                            updateData.state = office.state;
                        if (office.country !== undefined)
                            updateData.country = office.country;
                        if (office.type !== undefined)
                            updateData.type = office.type;
                        if (office.address !== undefined)
                            updateData.address = office.address;
                        if (office.is_primary !== undefined)
                            updateData.is_primary = office.is_primary;
                        const updated = await tx.companyOffice.update({
                            where: { company_office_id: office.company_office_id },
                            data: updateData,
                        });
                        officeResults.updated.push(updated);
                    }
                    else if (office._action === 'create' || !office.company_office_id) {
                        // Create new office
                        const created = await tx.companyOffice.create({
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
                        });
                        officeResults.created.push(created);
                    }
                }
            }
            // 3. Handle Organization Accounting
            const accountingResults = {
                created: [],
                updated: [],
                deleted: [],
            };
            if (accounting && accounting.length > 0) {
                for (const acc of accounting) {
                    if (acc._action === 'delete' && acc.organization_accounting_id) {
                        const deleted = await tx.organizationAccounting.delete({
                            where: { organization_accounting_id: acc.organization_accounting_id },
                        });
                        accountingResults.deleted.push(deleted);
                    }
                    else if (acc._action === 'update' && acc.organization_accounting_id) {
                        const updateData = {};
                        if (acc.account_type !== undefined)
                            updateData.account_type = acc.account_type;
                        if (acc.bank_name !== undefined)
                            updateData.bank_name = acc.bank_name;
                        if (acc.account_number !== undefined)
                            updateData.account_number = acc.account_number;
                        if (acc.routing_number !== undefined)
                            updateData.routing_number = acc.routing_number;
                        if (acc.country !== undefined)
                            updateData.country = acc.country;
                        const updated = await tx.organizationAccounting.update({
                            where: { organization_accounting_id: acc.organization_accounting_id },
                            data: updateData,
                        });
                        accountingResults.updated.push(updated);
                    }
                    else if (acc._action === 'create' || !acc.organization_accounting_id) {
                        const created = await tx.organizationAccounting.create({
                            data: {
                                organization_id: id,
                                account_type: acc.account_type,
                                bank_name: acc.bank_name,
                                account_number: acc.account_number,
                                routing_number: acc.routing_number,
                                country: acc.country,
                            },
                        });
                        accountingResults.created.push(created);
                    }
                }
            }
            // 4. Handle Organization Addresses
            const addressResults = {
                created: [],
                updated: [],
                deleted: [],
            };
            if (addresses && addresses.length > 0) {
                for (const addr of addresses) {
                    if (addr._action === 'delete' && addr.organization_address_id) {
                        const deleted = await tx.organizationAddress.delete({
                            where: { organization_address_id: addr.organization_address_id },
                        });
                        addressResults.deleted.push(deleted);
                    }
                    else if (addr._action === 'update' && addr.organization_address_id) {
                        const updateData = {};
                        if (addr.address_type !== undefined)
                            updateData.address_type = addr.address_type;
                        if (addr.address1 !== undefined)
                            updateData.address1 = addr.address1;
                        if (addr.address2 !== undefined)
                            updateData.address2 = addr.address2;
                        if (addr.city !== undefined)
                            updateData.city = addr.city;
                        if (addr.state !== undefined)
                            updateData.state = addr.state;
                        if (addr.zip !== undefined)
                            updateData.zip = addr.zip;
                        if (addr.phone !== undefined)
                            updateData.phone = addr.phone;
                        const updated = await tx.organizationAddress.update({
                            where: { organization_address_id: addr.organization_address_id },
                            data: updateData,
                        });
                        addressResults.updated.push(updated);
                    }
                    else if (addr._action === 'create' || !addr.organization_address_id) {
                        const created = await tx.organizationAddress.create({
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
                        });
                        addressResults.created.push(created);
                    }
                }
            }
            // 5. Handle Organization Contacts
            const contactResults = {
                created: [],
                updated: [],
                deleted: [],
            };
            if (contacts && contacts.length > 0) {
                for (const contact of contacts) {
                    if (contact._action === 'delete' && contact.organization_contact_id) {
                        const deleted = await tx.organizationContact.delete({
                            where: { organization_contact_id: contact.organization_contact_id },
                        });
                        contactResults.deleted.push(deleted);
                    }
                    else if (contact._action === 'update' && contact.organization_contact_id) {
                        const updateData = {};
                        if (contact.name !== undefined)
                            updateData.name = contact.name;
                        if (contact.email !== undefined)
                            updateData.email = contact.email;
                        if (contact.phone !== undefined)
                            updateData.phone = contact.phone;
                        if (contact.contact_type !== undefined)
                            updateData.contact_type = contact.contact_type;
                        const updated = await tx.organizationContact.update({
                            where: { organization_contact_id: contact.organization_contact_id },
                            data: updateData,
                        });
                        contactResults.updated.push(updated);
                    }
                    else if (contact._action === 'create' || !contact.organization_contact_id) {
                        const created = await tx.organizationContact.create({
                            data: {
                                organization_id: id,
                                name: contact.name,
                                email: contact.email,
                                phone: contact.phone,
                                contact_type: contact.contact_type,
                            },
                        });
                        contactResults.created.push(created);
                    }
                }
            }
            return {
                organization: updatedOrganization,
                company_offices: officeResults,
                accounting: accountingResults,
                addresses: addressResults,
                contacts: contactResults,
            };
        });
        // Fetch complete updated organization data
        const completeOrganization = await prisma_config_1.default.organization.findUnique({
            where: { organization_id: id },
            include: {
                company_offices: true,
                accounting: true,
                addresses: true,
                contacts: true,
                created_by: {
                    select: {
                        user_id: true,
                        name: true,
                        email: true,
                    },
                },
            },
        });
        // ✅ UPDATE USER ACTIVITY - Log organization update
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
            },
        });
    }
    catch (err) {
        console.error('Error updating organization with complete data:', err);
        // Handle Prisma errors
        if (err.code === 'P2002') {
            return (0, response_1.sendError)(res, 'Duplicate entry found', 409);
        }
        if (err.code === 'P2003') {
            return (0, response_1.sendError)(res, 'Related record not found', 404);
        }
        if (err.code === 'P2025') {
            return (0, response_1.sendError)(res, 'Record to update not found', 404);
        }
        return (0, response_1.sendError)(res, 'Failed to update organization', 500);
    }
};
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