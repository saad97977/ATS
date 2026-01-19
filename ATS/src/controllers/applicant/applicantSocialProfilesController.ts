import prisma from '../../prisma.config';
import { createCrudController } from '../../factories/crudFactory';
import { createApplicantSocialProfilesSchema, updateApplicantSocialProfilesSchema } from '../../validators/schemas';

export const applicantSocialProfilesController = createCrudController({
  model: prisma.applicantSocialProfiles,
  modelName: 'ApplicantSocialProfiles',
  idField: 'applicant_social_profiles_id',
  createSchema: createApplicantSocialProfilesSchema,
  updateSchema: updateApplicantSocialProfilesSchema,
  defaultLimit: 10,
  maxLimit: 100,
});
