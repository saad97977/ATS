import { Router } from 'express';
import {
  getOrganizationUsers,
  getOrganizationJobs,
  getOrganizationApplicants,
  getOrganizationStats,
  getOrganizationContracts,
  getOrganizationActivities,
  getOrganizationInvoices,
  getOrganizationTimesheets,
} from '../../controllers/organization/organizationFiltersController';

const router = Router();

// Sub-resource routes
router.get('/:id/users',      getOrganizationUsers);
router.get('/:id/jobs',       getOrganizationJobs);
router.get('/:id/applicants', getOrganizationApplicants);

// Detail / aggregate routes
router.get('/:id/stats',      getOrganizationStats);
router.get('/:id/contracts',  getOrganizationContracts);
router.get('/:id/activities', getOrganizationActivities);
router.get('/:id/invoices',   getOrganizationInvoices);
router.get('/:id/timesheets', getOrganizationTimesheets);

export default router;
