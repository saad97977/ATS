import { Router } from 'express';
import { organizationAddressController } from '../../controllers/organization/organizationAddressController';

const router = Router();

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
router.get(
  '/organization/:organizationId',
  organizationAddressController.getAddressesByOrganization
);

router.get(
  '/type/:addressType',
  organizationAddressController.getAddressesByType
);

router.get(
  '/check/:organizationId',
  organizationAddressController.checkOrganizationAddresses
);

// Standard CRUD routes
router.post(
  '/',
  organizationAddressController.create
);

router.get(
  '/',
  organizationAddressController.getAll
);

router.get(
  '/:id',
  organizationAddressController.getById
);

router.patch(
  '/:id',
  organizationAddressController.update
);

router.delete(
  '/:id',
  organizationAddressController.delete
);

export default router;