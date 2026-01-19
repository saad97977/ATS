"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.applicantDemographicController = void 0;
const prisma_config_1 = __importDefault(require("../../prisma.config"));
const crudFactory_1 = require("../../factories/crudFactory");
const schemas_1 = require("../../validators/schemas");
exports.applicantDemographicController = (0, crudFactory_1.createCrudController)({
    model: prisma_config_1.default.applicantDemographic,
    modelName: 'ApplicantDemographic',
    idField: 'applicant_demo_id',
    createSchema: schemas_1.createApplicantDemographicSchema,
    updateSchema: schemas_1.updateApplicantDemographicSchema,
    defaultLimit: 10,
    maxLimit: 100,
});
//# sourceMappingURL=applicantDemographicController.js.map