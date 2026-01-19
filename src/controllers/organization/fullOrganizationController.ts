import { Request, Response } from 'express';
import prisma from '../../prisma.config';
import { z } from 'zod';
import { sendSuccess, sendError } from '../../utils/response';
import { updateUserActivity } from '../../services/activityService';

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
  name: z.string().min(1, 'Contact name is required'),
  email: z.string().email('Valid email is required'),
  phone: z.string().min(1, 'Phone number is required'),
  contact_type: z.enum(['PRIMARY', 'EMERGENCY'])
});

const organizationUserSchema = z.object({
  user_id: z.string().uuid('Valid user ID is required'),
  division: z.string().min(1).optional(),
  department: z.string().min(1).optional(),
  title: z.string().min(1).optional(),
  work_phone: z.string().min(1).optional(),
});

const createOrganizationCompleteSchema = z.object({
  name: z.string().min(1, 'Organization name is required'),
  website: z.string().url('Valid URL is required').optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional().default('ACTIVE'),
  phone: z.string().optional(),
  created_by_user_id: z.string().uuid('Valid user ID is required'),
  
  // Related entities arrays
  company_offices: z.array(companyOfficeSchema).optional(),
  accounting: z.array(organizationAccountingSchema).optional(),
  addresses: z.array(organizationAddressSchema).optional(),
  contacts: z.array(organizationContactSchema).optional(),
  organization_users: z.array(organizationUserSchema).optional(),
});

/**
 * POST /api/organizations/complete
 * Creates organization with all related data in a single transaction
 */
const createOrganizationComplete = async (req: Request, res: Response) => {
  try {
    // Validate request body
    const validation = createOrganizationCompleteSchema.safeParse(req.body);
    
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
      created_by_user_id, 
      company_offices, 
      accounting, 
      addresses, 
      contacts,
      organization_users 
    } = validation.data;

    // Check if user exists
    const userExists = await prisma.user.findFirst({
      where: { user_id: created_by_user_id },
    });

    if (!userExists) {
      return sendError(res, 'User not found', 404);
    }

    // Check if organization name already exists
    const existingOrg = await prisma.organization.findUnique({
      where: { name },
    });

    if (existingOrg) {
      return sendError(
        res, 
        'Organization with this name already exists', 
        409,
        [{
          field: 'duplicate',
          message: `Organization already exists`,
        }]
      );
    }

    // Validate: Only one primary office allowed
    if (company_offices && company_offices.length > 0) {
      const primaryOffices = company_offices.filter(office => office.is_primary);
      if (primaryOffices.length > 1) {
        return sendError(res, 'Only one company office can be marked as primary', 400);
      }
    }

    // Validate: At least one PRIMARY contact if contacts provided
    if (contacts && contacts.length > 0) {
      const primaryContacts = contacts.filter(contact => contact.contact_type === 'PRIMARY');
      if (primaryContacts.length === 0) {
        return sendError(res, 'At least one PRIMARY contact is required when adding contacts', 400);
      }
    }

    // Validate: All organization users exist
    if (organization_users && organization_users.length > 0) {
      const userIds = organization_users.map(ou => ou.user_id);
      const uniqueUserIds = [...new Set(userIds)];
      
      // Check for duplicate user IDs in the request
      if (userIds.length !== uniqueUserIds.length) {
        return sendError(res, 'Duplicate user IDs found in organization_users', 400);
      }

      const users = await prisma.user.findMany({
        where: { user_id: { in: uniqueUserIds } },
      });

      if (users.length !== uniqueUserIds.length) {
        const foundUserIds = users.map(u => u.user_id);
        const missingUserIds = uniqueUserIds.filter(id => !foundUserIds.includes(id));
        return sendError(
          res, 
          'One or more users not found', 
          404,
          missingUserIds.map(id => ({
            field: 'organization_users',
            message: `User with ID ${id} not found`,
          }))
        );
      }
    }

    // Create organization with all related data in a transaction with increased timeout
    const result = await prisma.$transaction(async (tx) => {
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
      let createdOffices: typeof company_offices = [];
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
      let createdAccounting: typeof accounting = [];
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
      let createdAddresses: typeof addresses = [];
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
      let createdContacts: typeof contacts = [];
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
      let createdOrganizationUsers: typeof organization_users = [];
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
    const completeOrganization = await prisma.organization.findUnique({
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
    await updateUserActivity(created_by_user_id, {
      action_type: 'CREATE',
      entity_type: 'ORGANIZATION',
      entity_id: result.organization.organization_id,
      entity_name: name,
      timestamp: new Date().toISOString(),
    });

    return sendSuccess(res, completeOrganization, 201);
  } catch (err: any) {
    console.error('Error creating organization with complete data:', err);

    // Handle Prisma errors
    if (err.code === 'P2002') {
      return sendError(res, 'Duplicate entry found', 409);
    }

    if (err.code === 'P2003') {
      return sendError(res, 'Related record not found', 404);
    }

    if (err.code === 'P2028') {
      return sendError(res, 'Transaction timeout - please try again', 408);
    }

    return sendError(res, 'Failed to create organization', 500);
  }
};

/**
 * Export the controller
 */
export const organizationCompleteController = {
  createOrganizationComplete,
};