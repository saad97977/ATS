import prisma from '../../prisma.config';
import { createCrudController } from '../../factories/crudFactory';
import { createApplicantReferencesSchema, updateApplicantReferencesSchema } from '../../validators/schemas';
import { Request, Response } from 'express';
import { sendSuccess, sendError } from '../../utils/response';

// Generate CRUD controller
export const applicantReferencesController = createCrudController({
  model: prisma.applicantReferences,
  modelName: 'ApplicantReferences',
  idField: 'applicant_references_id',
  createSchema: createApplicantReferencesSchema,
  updateSchema: updateApplicantReferencesSchema,
  defaultLimit: 10,
  maxLimit: 100,
});

/**
 * Validates request body against a Zod schema (matching your factory pattern)
 */
const validateRequest = (schema: any, data: any) => {
  if (!schema) return null;
  
  const result = schema.safeParse(data);
  if (!result.success) {
    const errors = result.error.issues.map((err: any) => ({
      field: err.path.join('.'),
      message: err.message,
    }));
    return errors;
  }
  return null;
};

/**
 * Create Applicant Reference with Duplicate Check
 * Prevents duplicate user_id for the same applicant
 */
export const createApplicantReference = async (req: Request, res: Response) => {
  try {
    // Validate request body (using your factory's validation pattern)
    const validationErrors = validateRequest(createApplicantReferencesSchema, req.body);
    if (validationErrors) {
      return sendError(res, 'Validation failed', 400, validationErrors);
    }

    const { applicant_id, user_id } = req.body;

    // Check if applicant exists
    const applicant = await prisma.applicant.findUnique({
      where: { applicant_id },
    });

    if (!applicant) {
      return sendError(res, 'Applicant not found', 404);
    }

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { user_id },
    });

    if (!user) {
      return sendError(res, 'User not found', 404);
    }

    // Check if this user is already a reference for this applicant
    const existingReference = await prisma.applicantReferences.findFirst({
      where: {
        applicant_id,
        user_id,
      },
    });

    if (existingReference) {
      return sendError(
        res,
        'This user is already a reference for this applicant',
        409
      );
    }

    // Create the reference
    const data = await prisma.applicantReferences.create({
      data: {
        applicant_id,
        user_id,
      },
    });

    return sendSuccess(res, data, 201);
  } catch (err: any) {
    console.error('Error creating applicant reference:', err);
    
    // Handle unique constraint violation
    if (err.code === 'P2002') {
      return sendError(
        res,
        'This user is already a reference for this applicant',
        409
      );
    }
    
    // Handle related record not found
    if (err.code === 'P2025') {
      return sendError(res, 'Related record not found', 404);
    }
    
    return sendError(res, 'Failed to create ApplicantReferences', 500);
  }
};

/**
 * Update Applicant Reference with Duplicate Check
 * Prevents duplicate user_id for the same applicant when updating
 */
export const updateApplicantReference = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!id) {
      return sendError(res, 'ApplicantReferences ID is required', 400);
    }

    // Validate request body
    const validationErrors = validateRequest(updateApplicantReferencesSchema, req.body);
    if (validationErrors) {
      return sendError(res, 'Validation failed', 400, validationErrors);
    }

    // Check if record exists
    const exists = await prisma.applicantReferences.findUnique({
      where: { applicant_references_id: id },
    });

    if (!exists) {
      return sendError(res, 'ApplicantReferences not found', 404);
    }

    const { applicant_id, user_id } = req.body;

    // If applicant_id is being updated, check if it exists
    if (applicant_id && applicant_id !== exists.applicant_id) {
      const applicant = await prisma.applicant.findUnique({
        where: { applicant_id },
      });

      if (!applicant) {
        return sendError(res, 'Applicant not found', 404);
      }
    }

    // If user_id is being updated, check if it exists
    if (user_id && user_id !== exists.user_id) {
      const user = await prisma.user.findUnique({
        where: { user_id },
      });

      if (!user) {
        return sendError(res, 'User not found', 404);
      }
    }

    // Check for duplicate: if updating creates a duplicate reference
    if (applicant_id || user_id) {
      const finalApplicantId = applicant_id || exists.applicant_id;
      const finalUserId = user_id || exists.user_id;

      // Only check if the combination is actually changing
      if (finalApplicantId !== exists.applicant_id || finalUserId !== exists.user_id) {
        const existingReference = await prisma.applicantReferences.findFirst({
          where: {
            applicant_id: finalApplicantId,
            user_id: finalUserId,
            NOT: {
              applicant_references_id: id, // Exclude current record
            },
          },
        });

        if (existingReference) {
          return sendError(
            res,
            'This user is already a reference for this applicant',
            409
          );
        }
      }
    }

    // Update the reference
    const data = await prisma.applicantReferences.update({
      where: { applicant_references_id: id },
      data: req.body,
    });

    return sendSuccess(res, data);
  } catch (err: any) {
    console.error('Error updating applicant reference:', err);

    // Handle unique constraint violation
    if (err.code === 'P2002') {
      return sendError(
        res,
        'This user is already a reference for this applicant',
        409
      );
    }

    // Handle record not found
    if (err.code === 'P2025') {
      return sendError(res, 'ApplicantReferences not found', 404);
    }

    return sendError(res, 'Failed to update ApplicantReferences', 500);
  }
};

/**
 * Get All References for a Specific Applicant
 */
export const getReferencesByApplicantId = async (req: Request, res: Response) => {
  try {
    const { applicant_id } = req.params;

    if (!applicant_id) {
      return sendError(res, 'Applicant ID is required', 400);
    }

    // Check if applicant exists
    const applicant = await prisma.applicant.findUnique({
      where: { applicant_id },
    });

    if (!applicant) {
      return sendError(res, 'Applicant not found', 404);
    }

    // Get all references for this applicant
    const data = await prisma.applicantReferences.findMany({
      where: { applicant_id },
      include: {
        user: true,
      },
      orderBy: { applicant_references_id: 'desc' },
    });

    return sendSuccess(res, {
      data,
      count: data.length,
    });
  } catch (err: any) {
    console.error('Error fetching references by applicant:', err);
    return sendError(res, 'Failed to fetch references', 500);
  }
};