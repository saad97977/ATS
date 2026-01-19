"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const organizationContractController_1 = require("../../controllers/organization/organizationContractController");
const router = (0, express_1.Router)();
/**
 * Contract Routes
 * Base path: /api/contracts
 */
// Statistics and special queries (place before :id to avoid conflicts)
router.get('/stats', organizationContractController_1.contractController.getContractStats);
router.get('/pending', organizationContractController_1.contractController.getPendingContracts);
router.get('/signed', organizationContractController_1.contractController.getSignedContracts);
// Filter by relationships
router.get('/organization/:organizationId', organizationContractController_1.contractController.getContractsByOrganization);
router.get('/user/:userId', organizationContractController_1.contractController.getContractsByUser);
// Filter by statuses
router.get('/status/:status', organizationContractController_1.contractController.getContractsByStatus);
router.get('/signed-status/:signedStatus', organizationContractController_1.contractController.getContractsBySignedStatus);
router.get('/sent-status/:sentStatus', organizationContractController_1.contractController.getContractsBySentStatus);
router.get('/contractor-type/:isContractor', organizationContractController_1.contractController.getContractsByContractorType);
// Standard CRUD operations
router.get('/', organizationContractController_1.contractController.getAll);
router.get('/:id', organizationContractController_1.contractController.getById);
router.post('/', organizationContractController_1.contractController.create);
router.patch('/:id', organizationContractController_1.contractController.update);
router.delete('/:id', organizationContractController_1.contractController.delete);
exports.default = router;
//# sourceMappingURL=organizationContractRoutes.js.map