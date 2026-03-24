import { Request, Response } from 'express';
import prisma from '../../prisma.config';
import { z } from 'zod';
import { sendSuccess, sendError } from '../../utils/response';
import { updateUserActivity } from '../../services/activityService';

// ============================================
// VALIDATION SCHEMAS
// ============================================

const companyOfficeSchema = z.object({
  office_name: z.string().min(1, 'Office name is required'),
  city: z.string().min(1, 'City is required'),
  state: z.string().min(1, 'State is required'),
  country: z.string().min(1, 'Country is required'),
  type: z.enum(['REMOTE', 'HYBRID', 'ONSITE']),
  address: z.string().min(1, 'Address is required'),
  is_primary: z.boolean().optional().default(false),
});

const organizationAccountingSchema = z.object({
  account_type: z.string().min(1, 'Account type is required'),
  bank_name: z.string().min(1, 'Bank name is required'),
  account_number: z.string().min(1, 'Account number is required'),
  routing_number: z.string().min(1, 'Routing number is required'),
  country: z.string().min(1, 'Country is required'),
});

const organizationAddressSchema = z.object({
  address_type: z.enum(['WORKSITE', 'BILLING']),
  address1: z.string().min(1, 'Address line 1 is required'),
  address2: z.string().optional(),
  city: z.string().min(1, 'City is required'),
  state: z.string().min(1, 'State is required'),
  zip: z.string().min(1, 'ZIP code is required'),
  phone: z.string().optional(),
});

const organizationContactSchema = z.object({
  // Original fields
  name: z.string().min(1, 'Contact name is required'),
  email: z.string().email('Valid email is required'),
  phone: z.string().min(1, 'Phone number is required'),
  contact_type: z.enum(['PRIMARY', 'EMERGENCY', 'BILLING']),
  // New fields
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  contact_title: z.string().optional(),
  address: z.string().optional(),
  mobile_phone: z.string().optional(),
  fax: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
  division: z.string().optional(),
  department: z.string().optional(),
  title: z.string().optional(),
  representative_id: z.string().uuid().optional(),
  last_contacted_at: z.string().datetime().optional(),
});

const organizationUserSchema = z.object({
  user_id: z.string().uuid('Valid user ID is required'),
  division: z.string().min(1).optional(),
  department: z.string().min(1).optional(),
  title: z.string().min(1).optional(),
  work_phone: z.string().min(1).optional(),
});

const createOrganizationCompleteSchema = z.object({
  // Original fields
  name: z.string().min(1, 'Organization name is required'),
  website: z.string().url('Valid URL is required').optional(),
  status: z.enum([
    'ACTIVE', 'INACTIVE', 'CREDIT_HOLD', 'DELETE',
    'DO_NOT_SERVICE', 'FORMER_CLIENT', 'ON_HOLD', 'PROSPECT',
  ]).optional().default('ACTIVE'),
  phone: z.string().optional(),
  created_by_user_id: z.string().uuid('Valid user ID is required'),

  // New Organization fields
  fax: z.string().optional(),
  zip: z.string().optional(),
  industry: z.string().optional(),
  revenue: z.string().optional(),
  employee_count: z.number().int().positive().optional(),
  last_contacted_at: z.string().datetime().optional(),
  representative_id: z.string().uuid().optional(),
  branch_region: z.string().optional(),
  branch_name: z.string().optional(),
  default_ot_rule: z.string().optional(),
  contract_markup: z.number().optional(),
  permanent_markup: z.number().optional(),
  overview: z.string().optional(),
  custom_company_id: z.string().optional(),
  org_branch_division: z.enum([
    'SMS_HOSPITALITY', 'SMS_MCL_JASCO_GOC', 'SMS_ADMIN',
    'SMS_STAFFING_SOLUTIONS', 'SPECIAL_MULTI_ADMIN', 'SPECIAL_MULTI_INC',
  ]).optional(),

  // Related entities
  company_offices: z.array(companyOfficeSchema).optional(),
  accounting: z.array(organizationAccountingSchema).optional(),
  addresses: z.array(organizationAddressSchema).optional(),
  contacts: z.array(organizationContactSchema).optional(),
  organization_users: z.array(organizationUserSchema).optional(),
});

// ============================================
// CONTROLLER
// ============================================

/**
 * POST /api/organizations/complete
 * Creates organization with all related data in a single transaction
 */
const createOrganizationComplete = async (req: Request, res: Response) => {
  try {
    const validation = createOrganizationCompleteSchema.safeParse(req.body);

    if (!validation.success) {
      const errors = validation.error.issues.map((err: any) => ({
        field: err.path.join('.'),
        message: err.message,
      }));
      return sendError(res, 'Validation failed', 400, errors);
    }

    const {
      name, website, status, phone, created_by_user_id,
      // New org fields
      fax, zip, industry, revenue, employee_count, last_contacted_at,
      representative_id, branch_region, branch_name, default_ot_rule,
      contract_markup, permanent_markup, overview, custom_company_id,
      org_branch_division,
      // Relations
      company_offices, accounting, addresses, contacts, organization_users,
    } = validation.data;

    // Check if creator exists
    const userExists = await prisma.user.findFirst({
      where: { user_id: created_by_user_id },
    });
    if (!userExists) return sendError(res, 'User not found', 404);

    // Check duplicate org name
    const existingOrg = await prisma.organization.findUnique({ where: { name } });
    if (existingOrg) {
      return sendError(res, 'Organization with this name already exists', 409, [{
        field: 'duplicate',
        message: 'Organization already exists',
      }]);
    }

    // Check duplicate custom_company_id if provided
    if (custom_company_id) {
      const existingCustomId = await prisma.organization.findUnique({
        where: { custom_company_id },
      });
      if (existingCustomId) {
        return sendError(res, 'Company ID already in use', 409, [{
          field: 'custom_company_id',
          message: 'This Company ID is already assigned to another organization',
        }]);
      }
    }

    // Check representative exists if provided
    if (representative_id) {
      const repExists = await prisma.user.findFirst({ where: { user_id: representative_id } });
      if (!repExists) return sendError(res, 'Representative user not found', 404);
    }

    // Validate contacts have representative if provided
    if (contacts && contacts.length > 0) {
      const contactRepIds = contacts
        .map(c => c.representative_id)
        .filter(Boolean) as string[];

      if (contactRepIds.length > 0) {
        const reps = await prisma.user.findMany({
          where: { user_id: { in: contactRepIds } },
        });
        if (reps.length !== new Set(contactRepIds).size) {
          return sendError(res, 'One or more contact representatives not found', 404);
        }
      }
    }

    // Validate: Only one primary office
    if (company_offices && company_offices.filter(o => o.is_primary).length > 1) {
      return sendError(res, 'Only one company office can be marked as primary', 400);
    }

    // Validate: At least one PRIMARY contact if contacts provided
    if (contacts && contacts.length > 0) {
      const primaryContacts = contacts.filter(c => c.contact_type === 'PRIMARY');
      if (primaryContacts.length === 0) {
        return sendError(res, 'At least one PRIMARY contact is required when adding contacts', 400);
      }
    }

    // Validate organization users exist
    if (organization_users && organization_users.length > 0) {
      const userIds = organization_users.map(ou => ou.user_id);
      const uniqueUserIds = [...new Set(userIds)];

      if (userIds.length !== uniqueUserIds.length) {
        return sendError(res, 'Duplicate user IDs found in organization_users', 400);
      }

      const users = await prisma.user.findMany({
        where: { user_id: { in: uniqueUserIds } },
      });

      if (users.length !== uniqueUserIds.length) {
        const foundIds = users.map(u => u.user_id);
        const missingIds = uniqueUserIds.filter(id => !foundIds.includes(id));
        return sendError(res, 'One or more users not found', 404,
          missingIds.map(id => ({ field: 'organization_users', message: `User ${id} not found` }))
        );
      }
    }

    // ── Transaction ──────────────────────────────────────────
    const result = await prisma.$transaction(async (tx) => {

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
    const completeOrganization = await prisma.organization.findUnique({
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

    await updateUserActivity(created_by_user_id, {
      action_type: 'CREATE',
      entity_type: 'ORGANIZATION',
      entity_id: result.organization_id,
      entity_name: name,
      timestamp: new Date().toISOString(),
    });

    return sendSuccess(res, completeOrganization, 201);
  } catch (err: any) {
    console.error('Error creating organization:', err);

    if (err.code === 'P2002') return sendError(res, 'Duplicate entry found', 409);
    if (err.code === 'P2003') return sendError(res, 'Related record not found', 404);
    if (err.code === 'P2028') return sendError(res, 'Transaction timeout - please try again', 408);

    return sendError(res, 'Failed to create organization', 500);
  }
};

export const organizationCompleteController = {
  createOrganizationComplete,
};