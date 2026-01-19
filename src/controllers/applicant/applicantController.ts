import prisma from '../../prisma.config';
import { createCrudController } from '../../factories/crudFactory';
import { createApplicantSchema, updateApplicantSchema } from '../../validators/schemas';


export const applicantController = createCrudController({
    model: prisma.applicant,
    modelName: 'Applicant',
    idField: 'applicant_id',
    createSchema: createApplicantSchema,
    updateSchema: updateApplicantSchema,
    defaultLimit: 10,
    maxLimit: 100,
});