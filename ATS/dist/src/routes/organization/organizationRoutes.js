"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const organizationController_1 = require("../../controllers/organization/organizationController");
const authMiddleware_1 = require("../../middleware/authMiddleware");
const router = (0, express_1.Router)();
router.get('/', authMiddleware_1.authenticateToken, (0, authMiddleware_1.authorizeRole)('HCM_USER'), organizationController_1.organizationController.getAll);
router.get('/:id', organizationController_1.organizationController.getById);
router.post('/', organizationController_1.organizationController.create);
router.patch('/:id', organizationController_1.organizationController.update);
router.delete('/:id', organizationController_1.organizationController.delete);
exports.default = router;
//# sourceMappingURL=organizationRoutes.js.map