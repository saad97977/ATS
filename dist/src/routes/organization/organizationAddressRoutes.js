"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const organizationAddressController_1 = require("../../controllers/organization/organizationAddressController");
const router = (0, express_1.Router)();
/**
 * Organization Address Routes
 * Base path: /api/organization-addresses
 *
 * Handles CRUD operations for organization addresses with custom business logic:
 * - Each organization can have ONE WORKSITE and ONE BILLING address
 * - Address type validation (WORKSITE or BILLING only)
 * - Duplicate prevention for address types
 */
// Custom routes (must come before parameterized routes)
router.get('/organization/:organizationId', organizationAddressController_1.organizationAddressController.getAddressesByOrganization);
router.get('/type/:addressType', organizationAddressController_1.organizationAddressController.getAddressesByType);
router.get('/check/:organizationId', organizationAddressController_1.organizationAddressController.checkOrganizationAddresses);
// Standard CRUD routes
router.post('/', organizationAddressController_1.organizationAddressController.create);
router.get('/', organizationAddressController_1.organizationAddressController.getAll);
router.get('/:id', organizationAddressController_1.organizationAddressController.getById);
router.patch('/:id', organizationAddressController_1.organizationAddressController.update);
router.delete('/:id', organizationAddressController_1.organizationAddressController.delete);
exports.default = router;
//# sourceMappingURL=organizationAddressRoutes.js.map