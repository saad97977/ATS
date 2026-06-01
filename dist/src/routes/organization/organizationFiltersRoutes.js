"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const organizationFiltersController_1 = require("../../controllers/organization/organizationFiltersController");
const router = (0, express_1.Router)();
// Sub-resource routes
router.get('/:id/users', organizationFiltersController_1.getOrganizationUsers);
router.get('/:id/jobs', organizationFiltersController_1.getOrganizationJobs);
router.get('/:id/applicants', organizationFiltersController_1.getOrganizationApplicants);
// Detail / aggregate routes
router.get('/:id/stats', organizationFiltersController_1.getOrganizationStats);
router.get('/:id/contracts', organizationFiltersController_1.getOrganizationContracts);
router.get('/:id/activities', organizationFiltersController_1.getOrganizationActivities);
router.get('/:id/invoices', organizationFiltersController_1.getOrganizationInvoices);
router.get('/:id/timesheets', organizationFiltersController_1.getOrganizationTimesheets);
exports.default = router;
//# sourceMappingURL=organizationFiltersRoutes.js.map