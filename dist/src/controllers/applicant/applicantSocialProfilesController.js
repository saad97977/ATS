"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.applicantSocialProfilesController = void 0;
const prisma_config_1 = __importDefault(require("../../prisma.config"));
const crudFactory_1 = require("../../factories/crudFactory");
const schemas_1 = require("../../validators/schemas");
exports.applicantSocialProfilesController = (0, crudFactory_1.createCrudController)({
    model: prisma_config_1.default.applicantSocialProfiles,
    modelName: 'ApplicantSocialProfiles',
    idField: 'applicant_social_profiles_id',
    createSchema: schemas_1.createApplicantSocialProfilesSchema,
    updateSchema: schemas_1.updateApplicantSocialProfilesSchema,
    defaultLimit: 10,
    maxLimit: 100,
});
//# sourceMappingURL=applicantSocialProfilesController.js.map