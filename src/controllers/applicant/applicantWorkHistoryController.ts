import prisma from '../../prisma.config';
import { createCrudController } from '../../factories/crudFactory';
import { createApplicantWorkHistorySchema, updateApplicantWorkHistorySchema } from '../../validators/schemas';

export const applicantWorkHistoryController = createCrudController({
  model: prisma.applicantWorkHistory,
  modelName: 'ApplicantWorkHistory',
  idField: 'applicant_work_history_id',
  createSchema: createApplicantWorkHistorySchema,
  updateSchema: updateApplicantWorkHistorySchema,
  defaultLimit: 10,
  maxLimit: 100,
});
