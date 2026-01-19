import prisma from '../../prisma.config';
import { createCrudController } from '../../factories/crudFactory';
import { createApplicantContactSchema, updateApplicantContactSchema } from '../../validators/schemas';

export const applicantContactController = createCrudController({
  model: prisma.applicantContact,
  modelName: 'ApplicantContact',
  idField: 'applicant_contact_id',
  createSchema: createApplicantContactSchema,
  updateSchema: updateApplicantContactSchema,
  defaultLimit: 10,
  maxLimit: 100,
});
