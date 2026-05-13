"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const organizationController_1 = require("../../controllers/organization/organizationController");
const router = (0, express_1.Router)();
router.get('/', organizationController_1.organizationController.getAll);
router.get('/:id', organizationController_1.organizationController.getById);
router.post('/', organizationController_1.organizationController.create);
router.patch('/:id', organizationController_1.organizationController.update);
router.delete('/:id', organizationController_1.organizationController.delete);
exports.default = router;
//# sourceMappingURL=organizationRoutes.js.map