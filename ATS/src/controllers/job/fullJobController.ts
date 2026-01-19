import { Request, Response } from 'express';
import prisma from '../../prisma.config';
import { z } from 'zod';
import { sendSuccess, sendError } from '../../utils/response';
import { updateUserActivity } from '../../services/activityService';

/**
 * Job Complete Setup Controller
 * POST request to create Job with all related data in a single transaction
 * 
 * Creates:
 * - Job
 * - JobDetail
 * - JobNote(s)
 * - JobRate(s)
 * - JobOwner(s)
 */

// Validation Schemas
const jobDetailSchema = z.object({
  description: z.string().min(1, 'Job description is required'),
  skills: z.any().optional(), // Json field
});

const jobNoteSchema = z.object({
  note: z.string().min(1, 'Note content is required'),
});

const jobRateSchema = z.object({
  pay_rate: z.number().optional(),
  bill_rate: z.number().min(0, 'Bill rate is required'),
  markup_percentage: z.number().optional(),
  overtime_rule: z.string().optional(),
  hours: z.number().int().min(0, 'Hours must be a positive integer'),
  ot_pay_rate: z.number().optional(),
  ot_bill_rate: z.number().optional(),
});

const jobOwnerSchema = z.object({
  user_id: z.string().uuid('Valid user ID is required'),
  role_type: z.enum(['SALES', 'RECRUITER']),
});

const createJobCompleteSchema = z.object({
  // Core Job fields
  organization_id: z.string().uuid('Valid organization ID is required'),
  manager_id: z.string().uuid('Valid manager ID is required').optional(),
  job_title: z.string().min(1, 'Job title is required'),
  status: z.enum(['DRAFT', 'OPEN', 'CLOSED']).optional().default('DRAFT'),
  job_type: z.enum(['TEMPORARY', 'PERMANENT']),
  location: z.string().min(1, 'Location is required'),
  days_active: z.number().int().optional(),
  days_inactive: z.number().int().optional(),
  approved: z.boolean().optional().default(false),
  start_date: z.string().datetime().optional(),
  end_date: z.string().datetime().optional(),
  created_by_user_id: z.string().uuid('Valid user ID is required'),
  
  // Related entities
  job_detail: jobDetailSchema.optional(),
  job_notes: z.array(jobNoteSchema).optional(),
  job_rates: z.array(jobRateSchema).optional(),
  job_owners: z.array(jobOwnerSchema).optional(),
});

/**
 * POST /api/jobs/complete
 * Creates job with all related data in a single transaction
 */
const createJobComplete = async (req: Request, res: Response) => {
  try {
    // Validate request body
    const validation = createJobCompleteSchema.safeParse(req.body);
    
    if (!validation.success) {
      const errors = validation.error.issues.map((err: any) => ({
        field: err.path.join('.'),
        message: err.message,
      }));
      return sendError(res, 'Validation failed', 400, errors);
    }

    const { 
      organization_id,
      manager_id,
      job_title,
      status,
      job_type,
      location,
      days_active,
      days_inactive,
      approved,
      start_date,
      end_date,
      created_by_user_id,
      job_detail,
      job_notes,
      job_rates,
      job_owners,
    } = validation.data;

    // Check if organization exists
    const organizationExists = await prisma.organization.findUnique({
      where: { organization_id },
    });

    if (!organizationExists) {
      return sendError(res, 'Organization not found', 404);
    }

    // Check if created_by user exists
    const userExists = await prisma.user.findUnique({
      where: { user_id: created_by_user_id },
    });

    if (!userExists) {
      return sendError(res, 'Creator user not found', 404);
    }

    // Check if manager exists (if provided)
    if (manager_id) {
      const managerExists = await prisma.user.findUnique({
        where: { user_id: manager_id },
      });

      if (!managerExists) {
        return sendError(res, 'Manager user not found', 404);
      }
    }

    // Validate job owner users exist (if provided)
    if (job_owners && job_owners.length > 0) {
      const ownerUserIds = job_owners.map(owner => owner.user_id);
      const ownersExist = await prisma.user.findMany({
        where: { user_id: { in: ownerUserIds } },
        select: { user_id: true },
      });

      if (ownersExist.length !== ownerUserIds.length) {
        const foundIds = ownersExist.map(u => u.user_id);
        const missingIds = ownerUserIds.filter(id => !foundIds.includes(id));
        return sendError(
          res, 
          `Job owner user(s) not found: ${missingIds.join(', ')}`, 
          404
        );
      }

      // Check for duplicate user_id in job_owners
      const uniqueOwnerIds = new Set(ownerUserIds);
      if (uniqueOwnerIds.size !== ownerUserIds.length) {
        return sendError(res, 'Duplicate user IDs found in job_owners', 400);
      }
    }

    // Validate date range if both provided
    if (start_date && end_date) {
      const startDateTime = new Date(start_date);
      const endDateTime = new Date(end_date);
      
      if (startDateTime >= endDateTime) {
        return sendError(res, 'Start date must be before end date', 400);
      }
    }

    // Create job with all related data in a transaction with increased timeout
    const result = await prisma.$transaction(async (tx) => {
      // 1. Create Job
      const newJob = await tx.job.create({
        data: {
          organization_id,
          manager_id,
          job_title,
          status,
          job_type,
          location,
          days_active,
          days_inactive,
          approved,
          start_date: start_date ? new Date(start_date) : undefined,
          end_date: end_date ? new Date(end_date) : undefined,
          created_by_user_id,
        },
      });

      // 2. Create JobDetail (if provided)
      let createdJobDetail = null;
      if (job_detail) {
        createdJobDetail = await tx.jobDetail.create({
          data: {
            job_id: newJob.job_id,
            description: job_detail.description,
            skills: job_detail.skills,
          },
        });
      }

      // 3. Create JobNotes using createMany (more efficient)
      let createdJobNotes: typeof job_notes = [];
      if (job_notes && job_notes.length > 0) {
        await tx.jobNote.createMany({
          data: job_notes.map(note => ({
            job_id: newJob.job_id,
            note: note.note,
          })),
        });
        createdJobNotes = job_notes; // For response tracking
      }

      // 4. Create JobRates using createMany (more efficient)
      let createdJobRates: typeof job_rates = [];
      if (job_rates && job_rates.length > 0) {
        await tx.jobRate.createMany({
          data: job_rates.map(rate => ({
            job_id: newJob.job_id,
            pay_rate: rate.pay_rate,
            bill_rate: rate.bill_rate,
            markup_percentage: rate.markup_percentage,
            overtime_rule: rate.overtime_rule,
            hours: rate.hours,
            ot_pay_rate: rate.ot_pay_rate,
            ot_bill_rate: rate.ot_bill_rate,
          })),
        });
        createdJobRates = job_rates; // For response tracking
      }

      // 5. Create JobOwners using createMany (more efficient)
      let createdJobOwners: typeof job_owners = [];
      if (job_owners && job_owners.length > 0) {
        await tx.jobOwner.createMany({
          data: job_owners.map(owner => ({
            job_id: newJob.job_id,
            user_id: owner.user_id,
            role_type: owner.role_type,
          })),
        });
        createdJobOwners = job_owners; // For response tracking
      }

      return {
        job: newJob,
        job_detail: createdJobDetail,
        job_notes: createdJobNotes,
        job_rates: createdJobRates,
        job_owners: createdJobOwners,
      };
    }, {
      maxWait: 10000, // Maximum wait time for transaction to start (10 seconds)
      timeout: 15000, // Maximum time transaction can run (15 seconds)
    });

    // Fetch complete job data with all relations
    const completeJob = await prisma.job.findUnique({
      where: { job_id: result.job.job_id },
      include: {
        organization: {
          select: {
            organization_id: true,
            name: true,
            website: true,
            status: true,
          },
        },
        manager: {
          select: {
            user_id: true,
            name: true,
            email: true,
          },
        },
        created_by: {
          select: {
            user_id: true,
            name: true,
            email: true,
          },
        },
        job_detail: true,
        job_notes: {
          orderBy: {
            created_at: 'desc',
          },
        },
        job_rates: true,
        job_owners: {
          include: {
            user: {
              select: {
                user_id: true,
                name: true,
                email: true,
              },
            },
          },
        },
      },
    });

    // ✅ UPDATE USER ACTIVITY - Log job creation
    await updateUserActivity(created_by_user_id, {
      action_type: 'CREATE',
      entity_type: 'JOB',
      entity_id: result.job.job_id,
      entity_name: job_title,
      timestamp: new Date().toISOString(),
    });

    return sendSuccess(res, completeJob, 201);

  } catch (err: any) {
    console.error('Error creating job with complete data:', err);

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

    return sendError(res, 'Failed to create job', 500);
  }
};

/**
 * Export the controller
 */
export const jobCompleteController = {
  createJobComplete,
};