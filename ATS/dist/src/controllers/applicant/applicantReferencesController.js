"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getReferencesByApplicantId = exports.updateApplicantReference = exports.createApplicantReference = exports.applicantReferencesController = void 0;
const prisma_config_1 = __importDefault(require("../../prisma.config"));
const crudFactory_1 = require("../../factories/crudFactory");
const schemas_1 = require("../../validators/schemas");
const response_1 = require("../../utils/response");
// Generate CRUD controller
exports.applicantReferencesController = (0, crudFactory_1.createCrudController)({
    model: prisma_config_1.default.applicantReferences,
    modelName: 'ApplicantReferences',
    idField: 'applicant_references_id',
    createSchema: schemas_1.createApplicantReferencesSchema,
    updateSchema: schemas_1.updateApplicantReferencesSchema,
    defaultLimit: 10,
    maxLimit: 100,
});
/**
 * Validates request body against a Zod schema (matching your factory pattern)
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
/**
 * Create Applicant Reference with Duplicate Check
 * Prevents duplicate user_id for the same applicant
 */
const createApplicantReference = async (req, res) => {
    try {
        // Validate request body (using your factory's validation pattern)
        const validationErrors = validateRequest(schemas_1.createApplicantReferencesSchema, req.body);
        if (validationErrors) {
            return (0, response_1.sendError)(res, 'Validation failed', 400, validationErrors);
        }
        const { applicant_id, user_id } = req.body;
        // Check if applicant exists
        const applicant = await prisma_config_1.default.applicant.findUnique({
            where: { applicant_id },
        });
        if (!applicant) {
            return (0, response_1.sendError)(res, 'Applicant not found', 404);
        }
        // Check if user exists
        const user = await prisma_config_1.default.user.findUnique({
            where: { user_id },
        });
        if (!user) {
            return (0, response_1.sendError)(res, 'User not found', 404);
        }
        // Check if this user is already a reference for this applicant
        const existingReference = await prisma_config_1.default.applicantReferences.findFirst({
            where: {
                applicant_id,
                user_id,
            },
        });
        if (existingReference) {
            return (0, response_1.sendError)(res, 'This user is already a reference for this applicant', 409);
        }
        // Create the reference
        const data = await prisma_config_1.default.applicantReferences.create({
            data: {
                applicant_id,
                user_id,
            },
        });
        return (0, response_1.sendSuccess)(res, data, 201);
    }
    catch (err) {
        console.error('Error creating applicant reference:', err);
        // Handle unique constraint violation
        if (err.code === 'P2002') {
            return (0, response_1.sendError)(res, 'This user is already a reference for this applicant', 409);
        }
        // Handle related record not found
        if (err.code === 'P2025') {
            return (0, response_1.sendError)(res, 'Related record not found', 404);
        }
        return (0, response_1.sendError)(res, 'Failed to create ApplicantReferences', 500);
    }
};
exports.createApplicantReference = createApplicantReference;
/**
 * Update Applicant Reference with Duplicate Check
 * Prevents duplicate user_id for the same applicant when updating
 */
const updateApplicantReference = async (req, res) => {
    try {
        const { id } = req.params;
        if (!id) {
            return (0, response_1.sendError)(res, 'ApplicantReferences ID is required', 400);
        }
        // Validate request body
        const validationErrors = validateRequest(schemas_1.updateApplicantReferencesSchema, req.body);
        if (validationErrors) {
            return (0, response_1.sendError)(res, 'Validation failed', 400, validationErrors);
        }
        // Check if record exists
        const exists = await prisma_config_1.default.applicantReferences.findUnique({
            where: { applicant_references_id: id },
        });
        if (!exists) {
            return (0, response_1.sendError)(res, 'ApplicantReferences not found', 404);
        }
        const { applicant_id, user_id } = req.body;
        // If applicant_id is being updated, check if it exists
        if (applicant_id && applicant_id !== exists.applicant_id) {
            const applicant = await prisma_config_1.default.applicant.findUnique({
                where: { applicant_id },
            });
            if (!applicant) {
                return (0, response_1.sendError)(res, 'Applicant not found', 404);
            }
        }
        // If user_id is being updated, check if it exists
        if (user_id && user_id !== exists.user_id) {
            const user = await prisma_config_1.default.user.findUnique({
                where: { user_id },
            });
            if (!user) {
                return (0, response_1.sendError)(res, 'User not found', 404);
            }
        }
        // Check for duplicate: if updating creates a duplicate reference
        if (applicant_id || user_id) {
            const finalApplicantId = applicant_id || exists.applicant_id;
            const finalUserId = user_id || exists.user_id;
            // Only check if the combination is actually changing
            if (finalApplicantId !== exists.applicant_id || finalUserId !== exists.user_id) {
                const existingReference = await prisma_config_1.default.applicantReferences.findFirst({
                    where: {
                        applicant_id: finalApplicantId,
                        user_id: finalUserId,
                        NOT: {
                            applicant_references_id: id, // Exclude current record
                        },
                    },
                });
                if (existingReference) {
                    return (0, response_1.sendError)(res, 'This user is already a reference for this applicant', 409);
                }
            }
        }
        // Update the reference
        const data = await prisma_config_1.default.applicantReferences.update({
            where: { applicant_references_id: id },
            data: req.body,
        });
        return (0, response_1.sendSuccess)(res, data);
    }
    catch (err) {
        console.error('Error updating applicant reference:', err);
        // Handle unique constraint violation
        if (err.code === 'P2002') {
            return (0, response_1.sendError)(res, 'This user is already a reference for this applicant', 409);
        }
        // Handle record not found
        if (err.code === 'P2025') {
            return (0, response_1.sendError)(res, 'ApplicantReferences not found', 404);
        }
        return (0, response_1.sendError)(res, 'Failed to update ApplicantReferences', 500);
    }
};
exports.updateApplicantReference = updateApplicantReference;
/**
 * Get All References for a Specific Applicant
 */
const getReferencesByApplicantId = async (req, res) => {
    try {
        const { applicant_id } = req.params;
        if (!applicant_id) {
            return (0, response_1.sendError)(res, 'Applicant ID is required', 400);
        }
        // Check if applicant exists
        const applicant = await prisma_config_1.default.applicant.findUnique({
            where: { applicant_id },
        });
        if (!applicant) {
            return (0, response_1.sendError)(res, 'Applicant not found', 404);
        }
        // Get all references for this applicant
        const data = await prisma_config_1.default.applicantReferences.findMany({
            where: { applicant_id },
            include: {
                user: true,
            },
            orderBy: { applicant_references_id: 'desc' },
        });
        return (0, response_1.sendSuccess)(res, {
            data,
            count: data.length,
        });
    }
    catch (err) {
        console.error('Error fetching references by applicant:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch references', 500);
    }
};
exports.getReferencesByApplicantId = getReferencesByApplicantId;
//# sourceMappingURL=applicantReferencesController.js.map