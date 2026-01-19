import prisma from '../../prisma.config';
import { createCrudController } from '../../factories/crudFactory';

/**
 * Organization Document Title CRUD Controller - Generated using CRUD Factory with Zod validation
 * Provides: GET all, GET by id, POST, PATCH, DELETE
 * 
 * Validation Rules:
 * - organization_id: Required UUID
 * - document_title: Required document title
 */
export const organizationDocumentTitleController = createCrudController({
  model: prisma.organizationDocumentTitle,
  modelName: 'Organization Document Title',
  idField: 'document_title_id',
  defaultLimit: 10,
  maxLimit: 100,
});
