"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const applicantController_1 = require("../../controllers/applicant/applicantController");
const router = (0, express_1.Router)();
router.get('/', applicantController_1.applicantController.getAll);
router.post('/', applicantController_1.applicantController.create);
router.get('/:id', applicantController_1.applicantController.getById);
router.patch('/:id', applicantController_1.applicantController.update);
router.delete('/:id', applicantController_1.applicantController.delete);
exports.default = router;
//# sourceMappingURL=applicantRoutes.js.map