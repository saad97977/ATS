import { Request, Response } from 'express';
import { ZodSchema } from 'zod';
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
    model: any;
    modelName: string;
    idField?: string;
    defaultLimit?: number;
    maxLimit?: number;
    createSchema?: ZodSchema;
    updateSchema?: ZodSchema;
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
export declare function createCrudController(config: CrudFactoryConfig): CrudController;
//# sourceMappingURL=crudFactory.d.ts.map