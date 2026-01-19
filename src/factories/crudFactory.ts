import { Request, Response } from 'express';
import { z, ZodSchema } from 'zod';
import { sendSuccess, sendError } from '../utils/response';

/**
 * CRUD Factory - Generates minimal CRUD controller methods
 * Similar to @nestjsx/crud but for Express + Prisma
 * 
 * Usage:
 * const crudMethods = createCrudController({
 *   model: prisma.jobDetail,
 *   modelName: 'JobDetail',
 *   createSchema: createJobDetailSchema,
 *   updateSchema: updateJobDetailSchema,
 * });
 */

export interface CrudFactoryConfig {
  model: any; // Prisma model
  modelName: string; // Name for error messages
  idField?: string; // Primary key field name (e.g., 'job_detail_id', 'user_id')
  defaultLimit?: number;
  maxLimit?: number;
  createSchema?: ZodSchema; // Optional Zod schema for POST validation
  updateSchema?: ZodSchema; // Optional Zod schema for PATCH validation
}

export interface CrudController {
  getAll: (req: Request, res: Response) => Promise<void>;
  getById: (req: Request, res: Response) => Promise<void>;
  create: (req: Request, res: Response) => Promise<void>;
  update: (req: Request, res: Response) => Promise<void>;
  delete: (req: Request, res: Response) => Promise<void>;
}

/**
 * Creates CRUD controller methods for any Prisma model
 * Handles: GET all with pagination, GET by id, POST, PATCH, DELETE
 * Supports optional Zod schema validation
 */
export function createCrudController(config: CrudFactoryConfig): CrudController {
  const { model, modelName, idField = 'id', defaultLimit = 10, maxLimit = 100, createSchema, updateSchema } = config;

  /**
   * Validates request body against a Zod schema
   * Returns null if valid, or error response if invalid
   */
  const validateRequest = (schema: ZodSchema | undefined, data: any) => {
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

  return {
    /**
     * GET / - Get all records with pagination
     */
    getAll: async (req: Request, res: Response) => {
      try {
        const page = Math.max(1, parseInt(req.query.page as string) || 1);
        const limit = Math.min(maxLimit, Math.max(1, parseInt(req.query.limit as string) || defaultLimit));
        const skip = (page - 1) * limit;

        const [data, total] = await Promise.all([
          model.findMany({ skip, take: limit, orderBy: { [idField]: 'desc' } }),
          model.count(),
        ]);

        return sendSuccess(res, {
          data,
          paging: {
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
          },
        });
      } catch (err: any) {
        console.error(`Error fetching ${modelName}:`, err);
        return sendError(res, `Failed to fetch ${modelName}`, 500);
      }
    },

    /**
     * GET /:id - Get single record by ID
     */
    getById: async (req: Request, res: Response) => {
      try {
        const { id } = req.params;

        if (!id) {
          return sendError(res, `${modelName} ID is required`, 400);
        }

        const data = await model.findUnique({ where: { [idField]: id } });

        if (!data) {
          return sendError(res, `${modelName} not found`, 404);
        }

        return sendSuccess(res, data);
      } catch (err: any) {
        console.error(`Error fetching ${modelName}:`, err);
        return sendError(res, `Failed to fetch ${modelName}`, 500);
      }
    },

    /**
     * POST / - Create new record
     * Validates request body against createSchema if provided
     */
    create: async (req: Request, res: Response) => {
      try {
        // Validate request body
        const validationErrors = validateRequest(createSchema, req.body);
        if (validationErrors) {
          return sendError(res, 'Validation failed', 400, validationErrors);
        }

        const data = await model.create({ data: req.body });
        return sendSuccess(res, data, 201);
      } catch (err: any) {
        console.error(`Error creating ${modelName}:`, err);

        // Handle common Prisma errors
        if (err.code === 'P2002') {
          return sendError(res, `${modelName} with this value already exists`, 409);
        }
        if (err.code === 'P2025') {
          return sendError(res, `Related record not found`, 404);
        }

        return sendError(res, `Failed to create ${modelName}`, 500);
      }
    },

    /**
     * PATCH /:id - Update record
     * Validates request body against updateSchema if provided
     */
    update: async (req: Request, res: Response) => {
      try {
        const { id } = req.params;

        if (!id) {
          return sendError(res, `${modelName} ID is required`, 400);
        }

        // Validate request body
        const validationErrors = validateRequest(updateSchema, req.body);
        if (validationErrors) {
          return sendError(res, 'Validation failed', 400, validationErrors);
        }

        // Check if record exists
        const exists = await model.findUnique({ where: { [idField]: id } });
        if (!exists) {
          return sendError(res, `${modelName} not found`, 404);
        }

        const data = await model.update({
          where: { [idField]: id },
          data: req.body,
        });

        return sendSuccess(res, data);
      } catch (err: any) {
        console.error(`Error updating ${modelName}:`, err);

        // Handle common Prisma errors
        if (err.code === 'P2002') {
          return sendError(res, `${modelName} with this value already exists`, 409);
        }
        if (err.code === 'P2025') {
          return sendError(res, `${modelName} not found`, 404);
        }

        return sendError(res, `Failed to update ${modelName}`, 500);
      }
    },

    /**
     * DELETE /:id - Delete record
     */
    delete: async (req: Request, res: Response) => {
      try {
        const { id } = req.params;

        if (!id) {
          return sendError(res, `${modelName} ID is required`, 400);
        }

        const data = await model.delete({ where: { [idField]: id } });
        return sendSuccess(res, data);
      } catch (err: any) {
        console.error(`Error deleting ${modelName}:`, err);

        if (err.code === 'P2025') {
          return sendError(res, `${modelName} not found`, 404);
        }

        return sendError(res, `Failed to delete ${modelName}`, 500);
      }
    },
  };
}
