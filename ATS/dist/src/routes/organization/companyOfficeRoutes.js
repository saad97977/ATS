"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const companyOfficeController_1 = require("../../controllers/organization/companyOfficeController");
/**
 * Company Office Routes
 * Base path: /api/company-offices
 *
 * Routes:
 * - GET    /                                   -> Get all offices (paginated)
 * - GET    /stats                              -> Get office statistics
 * - GET    /type/:type                         -> Get offices by type (REMOTE/HYBRID/ONSITE)
 * - GET    /location                           -> Get offices by location (query: city, state, country)
 * - GET    /organization/:organizationId       -> Get all offices for an organization
 * - GET    /organization/:organizationId/primary -> Get primary office for an organization
 * - GET    /:id                                -> Get office by ID
 * - POST   /                                   -> Create new office
 * - PATCH  /:id                                -> Update office
 * - DELETE /:id                                -> Delete office
 */
const router = (0, express_1.Router)();
// Stats route - must come before /:id to avoid conflict
router.get('/stats', companyOfficeController_1.companyOfficeController.getOfficeStats);
// Type filter route - must come before /:id
router.get('/type/:type', companyOfficeController_1.companyOfficeController.getOfficesByType);
// Location search route
router.get('/location', companyOfficeController_1.companyOfficeController.getOfficesByLocation);
// Organization-specific routes - must come before /:id
router.get('/organization/:organizationId/primary', companyOfficeController_1.companyOfficeController.getPrimaryOffice);
router.get('/organization/:organizationId', companyOfficeController_1.companyOfficeController.getOfficesByOrganization);
// Standard CRUD routes
router.get('/', companyOfficeController_1.companyOfficeController.getAll);
router.get('/:id', companyOfficeController_1.companyOfficeController.getById);
router.post('/', companyOfficeController_1.companyOfficeController.create);
router.patch('/:id', companyOfficeController_1.companyOfficeController.update);
router.delete('/:id', companyOfficeController_1.companyOfficeController.delete);
exports.default = router;
//# sourceMappingURL=companyOfficeRoutes.js.map