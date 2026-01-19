"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const organizationUserController_1 = require("../../controllers/organization/organizationUserController");
const router = (0, express_1.Router)();
/**
 * Organization User Routes
 * Base path: /api/organization-users
 */
// Statistics endpoint (place before :id to avoid conflicts)
router.get('/stats', organizationUserController_1.organizationUserController.getOrganizationUserStats);
// Get upcoming/filtered results (place before :id)
router.get('/organization/:organizationId', organizationUserController_1.organizationUserController.getUsersByOrganization);
router.get('/user/:userId', organizationUserController_1.organizationUserController.getOrganizationsByUser);
router.get('/department/:department', organizationUserController_1.organizationUserController.getUsersByDepartment);
router.get('/division/:division', organizationUserController_1.organizationUserController.getUsersByDivision);
// Standard CRUD operations
router.get('/', organizationUserController_1.organizationUserController.getAll);
router.get('/:id', organizationUserController_1.organizationUserController.getById);
router.post('/', organizationUserController_1.organizationUserController.create);
router.patch('/:id', organizationUserController_1.organizationUserController.update);
router.delete('/:id', organizationUserController_1.organizationUserController.delete);
exports.default = router;
//# sourceMappingURL=organizationUserRoutes.js.map