import { Router } from 'express';
import { authenticateToken, authorizeRole } from '../../middleware/authMiddleware';
import { dropdownController } from '../../controllers/dropdown/dropdownController';

/**
 * Unified Dropdown Routes
 * Base path: /api/dropdowns
 *
 * All endpoints support:
 *   ?search=<string>  – case-insensitive partial match (server-side)
 *   ?take=<number>    – result cap (default 20, max 50)
 *
 * Available endpoints:
 * - GET /organizations                Get organizations for dropdown
 * - GET /jobs                         Get jobs for dropdown
 * - GET /organization-users           Get organization users for dropdown
 * - GET /document-categories          Get document categories (titles) for dropdown
 * - GET /locations                    Get all unique job locations
 */

const router = Router();

/**
 * @route   GET /api/dropdowns/organizations
 * @desc    Get organizations for dropdown/autocomplete
 * @query   search (partial org name), take (default 20, max 50)
 * @access  HCM_USER
 * @example GET /api/dropdowns/organizations?search=acme&take=50
 */
router.get(
  '/organizations',
  authenticateToken,
  dropdownController.getOrganizations
);

/**
 * @route   GET /api/dropdowns/jobs
 * @desc    Get jobs for dropdown/autocomplete
 * @query   search (job title or location), organization_id, status, take (default 20, max 50)
 * @access  HCM_USER
 * @example GET /api/dropdowns/jobs?search=developer&organization_id=org123&status=OPEN&take=50
 */
router.get(
  '/jobs',
  authenticateToken,
  dropdownController.getJobs
);

/**
 * @route   GET /api/dropdowns/organization-users
 * @desc    Get organization users for dropdown/autocomplete
 * @query   search (name or email), organization_id, take (default 20, max 50)
 * @access  HCM_USER
 * @example GET /api/dropdowns/organization-users?search=john&organization_id=org123&take=50
 */
router.get(
  '/organization-users',
  authenticateToken,
  dropdownController.getOrganizationUsers
);

/**
 * @route   GET /api/dropdowns/document-categories
 * @desc    Get document categories (titles) for dropdown/autocomplete
 * @query   search (category name), organization_id, take (default 20, max 50)
 * @access  HCM_USER
 * @example GET /api/dropdowns/document-categories?search=contract&organization_id=org123&take=50
 */
router.get(
  '/document-categories',
  authenticateToken,
  dropdownController.getDocumentCategories
);

/**
 * @route   GET /api/dropdowns/locations
 * @desc    Get all unique job locations grouped by location
 * @query   none required
 * @access  HCM_USER
 * @example GET /api/dropdowns/locations
 */
router.get(
  '/locations',
  dropdownController.getLocations
);

export default router;
