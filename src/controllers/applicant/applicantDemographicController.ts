import prisma from '../../prisma.config';
import { createCrudController } from '../../factories/crudFactory';
import { createApplicantDemographicSchema, updateApplicantDemographicSchema } from '../../validators/schemas';

export const applicantDemographicController = createCrudController({
  model: prisma.applicantDemographic,
  modelName: 'ApplicantDemographic',
  idField: 'applicant_demo_id',
  createSchema: createApplicantDemographicSchema,
  updateSchema: updateApplicantDemographicSchema,
  defaultLimit: 10,
  maxLimit: 100,
});
