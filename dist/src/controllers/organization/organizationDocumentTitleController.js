"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.organizationDocumentTitleController = void 0;
const prisma_config_1 = __importDefault(require("../../prisma.config"));
const crudFactory_1 = require("../../factories/crudFactory");
/**
 * Organization Document Title CRUD Controller - Generated using CRUD Factory with Zod validation
 * Provides: GET all, GET by id, POST, PATCH, DELETE
 *
 * Validation Rules:
 * - organization_id: Required UUID
 * - document_title: Required document title
 */
exports.organizationDocumentTitleController = (0, crudFactory_1.createCrudController)({
    model: prisma_config_1.default.organizationDocumentTitle,
    modelName: 'Organization Document Title',
    idField: 'document_title_id',
    defaultLimit: 10,
    maxLimit: 100,
});
//# sourceMappingURL=organizationDocumentTitleController.js.map