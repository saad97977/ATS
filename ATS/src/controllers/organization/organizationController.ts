import { Request, Response } from 'express';
import prisma from '../../prisma.config';
import { createCrudController } from '../../factories/crudFactory';
import { createOrganizationSchema, updateOrganizationSchema } from '../../validators/schemas';
import { sendSuccess, sendError } from '../../utils/response'
import { z } from 'zod';
import { updateUserActivity } from '../../services/activityService';




// ===============================
// Base CRUD
// ===============================
const baseCrud = createCrudController({
  model: prisma.organization,
  modelName: 'Organization',
  idField: 'organization_id',
  createSchema: createOrganizationSchema,
  updateSchema: updateOrganizationSchema,
  defaultLimit: 10,
  maxLimit: 100,
});

// ===============================
// GET ALL (FLAT RESPONSE)
// ===============================
const getAllOrganizations = async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 10));
    const skip = (page - 1) * limit;

    const [rows, total] = await Promise.all([
      prisma.organization.findMany({
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
      prisma.organization.count(),
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

    return sendSuccess(res, {
      data,
      paging: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error('Error fetching organizations:', err);
    return sendError(res, 'Failed to fetch organizations', 500);
  }
};

// ===============================
// GET BY ID (FULL ORGANIZATION)
// ===============================
const getOrganizationById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!id) {
      return sendError(res, 'Organization ID is required', 400);
    }

    const organization = await prisma.organization.findUnique({
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

        // ✅ Full Organization Data
        addresses: true,
        accounting: true,
        company_offices: true,
        contacts: true,
        organization_users : true,

      },
    });

    if (!organization) {
      return sendError(res, 'Organization not found', 404);
    }

    return sendSuccess(res, organization);
  } catch (err) {
    console.error('Error fetching organization by id:', err);
    return sendError(res, 'Failed to fetch organization', 500);
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
const companyOfficeUpdateSchema = z.object({
  company_office_id: z.string().uuid().optional(), // If provided, update existing; if not, create new
  office_name: z.string().min(1, 'Office name is required').optional(),
  city: z.string().min(1, 'City is required').optional(),
  state: z.string().min(1, 'State is required').optional(),
  country: z.string().min(1, 'Country is required').optional(),
  type: z.enum(['REMOTE', 'HYBRID', 'ONSITE']).optional(),
  address: z.string().min(1, 'Address is required').optional(),
  is_primary: z.boolean().optional(),
  _action: z.enum(['create', 'update', 'delete']).optional(), // Explicit action
});

const organizationAccountingUpdateSchema = z.object({
  organization_accounting_id: z.string().uuid().optional(),
  account_type: z.string().min(1, 'Account type is required').optional(),
  bank_name: z.string().min(1, 'Bank name is required').optional(),
  account_number: z.string().min(1, 'Account number is required').optional(),
  routing_number: z.string().min(1, 'Routing number is required').optional(),
  country: z.string().min(1, 'Country is required').optional(),
  _action: z.enum(['create', 'update', 'delete']).optional(),
});

const organizationAddressUpdateSchema = z.object({
  organization_address_id: z.string().uuid().optional(),
  address_type: z.enum(['WORKSITE', 'BILLING']).optional(),
  address1: z.string().min(1, 'Address line 1 is required').optional(),
  address2: z.string().optional(),
  city: z.string().min(1, 'City is required').optional(),
  state: z.string().min(1, 'State is required').optional(),
  zip: z.string().min(1, 'ZIP code is required').optional(),
  phone: z.string().optional(),
  _action: z.enum(['create', 'update', 'delete']).optional(),
});

const organizationContactUpdateSchema = z.object({
  organization_contact_id: z.string().uuid().optional(),
  name: z.string().min(1, 'Contact name is required').optional(),
  email: z.string().email('Valid email is required').optional(),
  phone: z.string().min(1, 'Phone number is required').optional(),
  contact_type: z.enum(['PRIMARY', 'EMERGENCY']).optional(),
  _action: z.enum(['create', 'update', 'delete']).optional(),
});

const updateOrganizationCompleteSchema = z.object({
  // Organization base fields (all optional for PATCH)
  name: z.string().min(1, 'Organization name is required').optional(),
  website: z.string().url('Valid URL is required').optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  phone: z.string().optional(),
  
  // Related entities arrays
  company_offices: z.array(companyOfficeUpdateSchema).optional(),
  accounting: z.array(organizationAccountingUpdateSchema).optional(),
  addresses: z.array(organizationAddressUpdateSchema).optional(),
  contacts: z.array(organizationContactUpdateSchema).optional(),
});

/**
 * PATCH /api/organizations/complete/:id
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
const updateOrganizationComplete = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!id) {
      return sendError(res, 'Organization ID is required', 400);
    }

    // Validate request body
    const validation = updateOrganizationCompleteSchema.safeParse(req.body);
    
    if (!validation.success) {
      const errors = validation.error.issues.map((err: any) => ({
        field: err.path.join('.'),
        message: err.message,
      }));
      return sendError(res, 'Validation failed', 400, errors);
    }

    const { 
      name, 
      website, 
      status, 
      phone, 
      company_offices, 
      accounting, 
      addresses, 
      contacts 
    } = validation.data;

    // Check if organization exists
    const existingOrg = await prisma.organization.findUnique({
      where: { organization_id: id },
      include: {
        company_offices: true,
        accounting: true,
        addresses: true,
        contacts: true,
      },
    });

    if (!existingOrg) {
      return sendError(res, 'Organization not found', 404);
    }

    // Check for duplicate organization name (if updating name)
    if (name && name !== existingOrg.name) {
      const duplicateName = await prisma.organization.findFirst({
        where: { 
          name,
          organization_id: { not: id },
        },
      });

      if (duplicateName) {
        return sendError(
          res, 
          'Organization with this name already exists', 
          409,
          [{
            field: 'name',
            message: 'An organization with this name already exists',
          }]
        );
      }
    }

    // Validate: Only one primary office allowed across all offices
    if (company_offices && company_offices.length > 0) {
      const newPrimaryOffices = company_offices.filter(
        office => office.is_primary === true && office._action !== 'delete'
      );
      
      const existingPrimaryOffices = existingOrg.company_offices.filter(
        office => office.is_primary && 
        !company_offices.some(co => co.company_office_id === office.company_office_id && co._action === 'delete')
      );

      const totalPrimaryCount = newPrimaryOffices.length + 
        existingPrimaryOffices.filter(
          epo => !company_offices.some(
            co => co.company_office_id === epo.company_office_id && co.is_primary === false
          )
        ).length;

      if (totalPrimaryCount > 1) {
        return sendError(res, 'Only one company office can be marked as primary', 400);
      }
    }

    // Validate: At least one PRIMARY contact must remain
    if (contacts && contacts.length > 0) {
      const existingPrimaryContacts = existingOrg.contacts.filter(
        contact => contact.contact_type === 'PRIMARY' &&
        !contacts.some(c => c.organization_contact_id === contact.organization_contact_id && c._action === 'delete')
      );

      const newPrimaryContacts = contacts.filter(
        contact => contact.contact_type === 'PRIMARY' && contact._action !== 'delete'
      );

      if (existingPrimaryContacts.length === 0 && newPrimaryContacts.length === 0) {
        return sendError(res, 'At least one PRIMARY contact must exist', 400);
      }
    }

    // Perform update in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // 1. Update Organization base fields
      const organizationUpdateData: any = {};
      if (name !== undefined) organizationUpdateData.name = name;
      if (website !== undefined) organizationUpdateData.website = website;
      if (status !== undefined) organizationUpdateData.status = status;
      if (phone !== undefined) organizationUpdateData.phone = phone;

      const updatedOrganization = Object.keys(organizationUpdateData).length > 0
        ? await tx.organization.update({
            where: { organization_id: id },
            data: organizationUpdateData,
          })
        : existingOrg;

      // 2. Handle Company Offices
      const officeResults = {
        created: [] as any[],
        updated: [] as any[],
        deleted: [] as any[],
      };

      if (company_offices && company_offices.length > 0) {
        for (const office of company_offices) {
          if (office._action === 'delete' && office.company_office_id) {
            // Delete office
            const deleted = await tx.companyOffice.delete({
              where: { company_office_id: office.company_office_id },
            });
            officeResults.deleted.push(deleted);
          } else if (office._action === 'update' && office.company_office_id) {
            // Update existing office
            const updateData: any = {};
            if (office.office_name !== undefined) updateData.office_name = office.office_name;
            if (office.city !== undefined) updateData.city = office.city;
            if (office.state !== undefined) updateData.state = office.state;
            if (office.country !== undefined) updateData.country = office.country;
            if (office.type !== undefined) updateData.type = office.type;
            if (office.address !== undefined) updateData.address = office.address;
            if (office.is_primary !== undefined) updateData.is_primary = office.is_primary;

            const updated = await tx.companyOffice.update({
              where: { company_office_id: office.company_office_id },
              data: updateData,
            });
            officeResults.updated.push(updated);
          } else if (office._action === 'create' || !office.company_office_id) {
            // Create new office
            const created = await tx.companyOffice.create({
              data: {
                organization_id: id,
                office_name: office.office_name!,
                city: office.city!,
                state: office.state!,
                country: office.country!,
                type: office.type!,
                address: office.address!,
                is_primary: office.is_primary || false,
              },
            });
            officeResults.created.push(created);
          }
        }
      }

      // 3. Handle Organization Accounting
      const accountingResults = {
        created: [] as any[],
        updated: [] as any[],
        deleted: [] as any[],
      };

      if (accounting && accounting.length > 0) {
        for (const acc of accounting) {
          if (acc._action === 'delete' && acc.organization_accounting_id) {
            const deleted = await tx.organizationAccounting.delete({
              where: { organization_accounting_id: acc.organization_accounting_id },
            });
            accountingResults.deleted.push(deleted);
          } else if (acc._action === 'update' && acc.organization_accounting_id) {
            const updateData: any = {};
            if (acc.account_type !== undefined) updateData.account_type = acc.account_type;
            if (acc.bank_name !== undefined) updateData.bank_name = acc.bank_name;
            if (acc.account_number !== undefined) updateData.account_number = acc.account_number;
            if (acc.routing_number !== undefined) updateData.routing_number = acc.routing_number;
            if (acc.country !== undefined) updateData.country = acc.country;

            const updated = await tx.organizationAccounting.update({
              where: { organization_accounting_id: acc.organization_accounting_id },
              data: updateData,
            });
            accountingResults.updated.push(updated);
          } else if (acc._action === 'create' || !acc.organization_accounting_id) {
            const created = await tx.organizationAccounting.create({
              data: {
                organization_id: id,
                account_type: acc.account_type!,
                bank_name: acc.bank_name!,
                account_number: acc.account_number!,
                routing_number: acc.routing_number!,
                country: acc.country!,
              },
            });
            accountingResults.created.push(created);
          }
        }
      }

      // 4. Handle Organization Addresses
      const addressResults = {
        created: [] as any[],
        updated: [] as any[],
        deleted: [] as any[],
      };

      if (addresses && addresses.length > 0) {
        for (const addr of addresses) {
          if (addr._action === 'delete' && addr.organization_address_id) {
            const deleted = await tx.organizationAddress.delete({
              where: { organization_address_id: addr.organization_address_id },
            });
            addressResults.deleted.push(deleted);
          } else if (addr._action === 'update' && addr.organization_address_id) {
            const updateData: any = {};
            if (addr.address_type !== undefined) updateData.address_type = addr.address_type;
            if (addr.address1 !== undefined) updateData.address1 = addr.address1;
            if (addr.address2 !== undefined) updateData.address2 = addr.address2;
            if (addr.city !== undefined) updateData.city = addr.city;
            if (addr.state !== undefined) updateData.state = addr.state;
            if (addr.zip !== undefined) updateData.zip = addr.zip;
            if (addr.phone !== undefined) updateData.phone = addr.phone;

            const updated = await tx.organizationAddress.update({
              where: { organization_address_id: addr.organization_address_id },
              data: updateData,
            });
            addressResults.updated.push(updated);
          } else if (addr._action === 'create' || !addr.organization_address_id) {
            const created = await tx.organizationAddress.create({
              data: {
                organization_id: id,
                address_type: addr.address_type!,
                address1: addr.address1!,
                address2: addr.address2,
                city: addr.city!,
                state: addr.state!,
                zip: addr.zip!,
                phone: addr.phone,
              },
            });
            addressResults.created.push(created);
          }
        }
      }

      // 5. Handle Organization Contacts
      const contactResults = {
        created: [] as any[],
        updated: [] as any[],
        deleted: [] as any[],
      };

      if (contacts && contacts.length > 0) {
        for (const contact of contacts) {
          if (contact._action === 'delete' && contact.organization_contact_id) {
            const deleted = await tx.organizationContact.delete({
              where: { organization_contact_id: contact.organization_contact_id },
            });
            contactResults.deleted.push(deleted);
          } else if (contact._action === 'update' && contact.organization_contact_id) {
            const updateData: any = {};
            if (contact.name !== undefined) updateData.name = contact.name;
            if (contact.email !== undefined) updateData.email = contact.email;
            if (contact.phone !== undefined) updateData.phone = contact.phone;
            if (contact.contact_type !== undefined) updateData.contact_type = contact.contact_type;

            const updated = await tx.organizationContact.update({
              where: { organization_contact_id: contact.organization_contact_id },
              data: updateData,
            });
            contactResults.updated.push(updated);
          } else if (contact._action === 'create' || !contact.organization_contact_id) {
            const created = await tx.organizationContact.create({
              data: {
                organization_id: id,
                name: contact.name!,
                email: contact.email!,
                phone: contact.phone!,
                contact_type: contact.contact_type!,
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
    const completeOrganization = await prisma.organization.findUnique({
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
    await updateUserActivity(existingOrg.created_by_user_id, {
      action_type: 'UPDATE',
      entity_type: 'ORGANIZATION',
      entity_id: id,
      entity_name: completeOrganization?.name || existingOrg.name,
      timestamp: new Date().toISOString(),
    });

    return sendSuccess(res, {
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
  } catch (err: any) {
    console.error('Error updating organization with complete data:', err);

    // Handle Prisma errors
    if (err.code === 'P2002') {
      return sendError(res, 'Duplicate entry found', 409);
    }

    if (err.code === 'P2003') {
      return sendError(res, 'Related record not found', 404);
    }

    if (err.code === 'P2025') {
      return sendError(res, 'Record to update not found', 404);
    }

    return sendError(res, 'Failed to update organization', 500);
  }
};





// ===============================
// EXPORT CONTROLLER
// ===============================
export const organizationController = {
  ...baseCrud,
  getAll: getAllOrganizations,
  getById: getOrganizationById,
  update: updateOrganizationComplete,
};

