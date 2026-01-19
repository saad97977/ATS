"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.applicantWorkHistoryController = void 0;
const prisma_config_1 = __importDefault(require("../../prisma.config"));
const crudFactory_1 = require("../../factories/crudFactory");
const schemas_1 = require("../../validators/schemas");
exports.applicantWorkHistoryController = (0, crudFactory_1.createCrudController)({
    model: prisma_config_1.default.applicantWorkHistory,
    modelName: 'ApplicantWorkHistory',
    idField: 'applicant_work_history_id',
    createSchema: schemas_1.createApplicantWorkHistorySchema,
    updateSchema: schemas_1.updateApplicantWorkHistorySchema,
    defaultLimit: 10,
    maxLimit: 100,
});
//# sourceMappingURL=applicantWorkHistoryController.js.map