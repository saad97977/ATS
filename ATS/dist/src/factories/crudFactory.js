"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCrudController = createCrudController;
const response_1 = require("../utils/response");
/**
 * Creates CRUD controller methods for any Prisma model
 * Handles: GET all with pagination, GET by id, POST, PATCH, DELETE
 * Supports optional Zod schema validation
 */
function createCrudController(config) {
    const { model, modelName, idField = 'id', defaultLimit = 10, maxLimit = 100, createSchema, updateSchema } = config;
    /**
     * Validates request body against a Zod schema
     * Returns null if valid, or error response if invalid
     */
    const validateRequest = (schema, data) => {
        if (!schema)
            return null;
        const result = schema.safeParse(data);
        if (!result.success) {
            const errors = result.error.issues.map((err) => ({
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
        getAll: async (req, res) => {
            try {
                const page = Math.max(1, parseInt(req.query.page) || 1);
                const limit = Math.min(maxLimit, Math.max(1, parseInt(req.query.limit) || defaultLimit));
                const skip = (page - 1) * limit;
                const [data, total] = await Promise.all([
                    model.findMany({ skip, take: limit, orderBy: { [idField]: 'desc' } }),
                    model.count(),
                ]);
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
                console.error(`Error fetching ${modelName}:`, err);
                return (0, response_1.sendError)(res, `Failed to fetch ${modelName}`, 500);
            }
        },
        /**
         * GET /:id - Get single record by ID
         */
        getById: async (req, res) => {
            try {
                const { id } = req.params;
                if (!id) {
                    return (0, response_1.sendError)(res, `${modelName} ID is required`, 400);
                }
                const data = await model.findUnique({ where: { [idField]: id } });
                if (!data) {
                    return (0, response_1.sendError)(res, `${modelName} not found`, 404);
                }
                return (0, response_1.sendSuccess)(res, data);
            }
            catch (err) {
                console.error(`Error fetching ${modelName}:`, err);
                return (0, response_1.sendError)(res, `Failed to fetch ${modelName}`, 500);
            }
        },
        /**
         * POST / - Create new record
         * Validates request body against createSchema if provided
         */
        create: async (req, res) => {
            try {
                // Validate request body
                const validationErrors = validateRequest(createSchema, req.body);
                if (validationErrors) {
                    return (0, response_1.sendError)(res, 'Validation failed', 400, validationErrors);
                }
                const data = await model.create({ data: req.body });
                return (0, response_1.sendSuccess)(res, data, 201);
            }
            catch (err) {
                console.error(`Error creating ${modelName}:`, err);
                // Handle common Prisma errors
                if (err.code === 'P2002') {
                    return (0, response_1.sendError)(res, `${modelName} with this value already exists`, 409);
                }
                if (err.code === 'P2025') {
                    return (0, response_1.sendError)(res, `Related record not found`, 404);
                }
                return (0, response_1.sendError)(res, `Failed to create ${modelName}`, 500);
            }
        },
        /**
         * PATCH /:id - Update record
         * Validates request body against updateSchema if provided
         */
        update: async (req, res) => {
            try {
                const { id } = req.params;
                if (!id) {
                    return (0, response_1.sendError)(res, `${modelName} ID is required`, 400);
                }
                // Validate request body
                const validationErrors = validateRequest(updateSchema, req.body);
                if (validationErrors) {
                    return (0, response_1.sendError)(res, 'Validation failed', 400, validationErrors);
                }
                // Check if record exists
                const exists = await model.findUnique({ where: { [idField]: id } });
                if (!exists) {
                    return (0, response_1.sendError)(res, `${modelName} not found`, 404);
                }
                const data = await model.update({
                    where: { [idField]: id },
                    data: req.body,
                });
                return (0, response_1.sendSuccess)(res, data);
            }
            catch (err) {
                console.error(`Error updating ${modelName}:`, err);
                // Handle common Prisma errors
                if (err.code === 'P2002') {
                    return (0, response_1.sendError)(res, `${modelName} with this value already exists`, 409);
                }
                if (err.code === 'P2025') {
                    return (0, response_1.sendError)(res, `${modelName} not found`, 404);
                }
                return (0, response_1.sendError)(res, `Failed to update ${modelName}`, 500);
            }
        },
        /**
         * DELETE /:id - Delete record
         */
        delete: async (req, res) => {
            try {
                const { id } = req.params;
                if (!id) {
                    return (0, response_1.sendError)(res, `${modelName} ID is required`, 400);
                }
                const data = await model.delete({ where: { [idField]: id } });
                return (0, response_1.sendSuccess)(res, data);
            }
            catch (err) {
                console.error(`Error deleting ${modelName}:`, err);
                if (err.code === 'P2025') {
                    return (0, response_1.sendError)(res, `${modelName} not found`, 404);
                }
                return (0, response_1.sendError)(res, `Failed to delete ${modelName}`, 500);
            }
        },
    };
}
//# sourceMappingURL=crudFactory.js.map