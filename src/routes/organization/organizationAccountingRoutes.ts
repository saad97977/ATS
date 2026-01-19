import { Router } from 'express';
import { organizationAccountingController } from '../../controllers/organization/organizationAccountingController';

/**
 * Organization Accounting Routes
 * Base path: /api/organization-accounting
 *
 * Available endpoints:
 * - GET    /                                Get all accounting records (paginated)
 * - GET    /stats                           Get accounting statistics
 * - GET    /type/:accountType               Get accounts by type
 * - GET    /bank/:bankName                  Get accounts by bank name
 * - GET    /country/:country                Get accounts by country
 * - GET    /organization/:organizationId    Get all accounts for an organization
 * - GET    /:id                             Get single accounting record by ID
 * - POST   /                                Create new accounting record
 * - PATCH  /:id                             Update accounting record
 * - DELETE /:id                             Delete accounting record
 */

const router = Router();

// ============================================
// STATS ROUTE (must come before :id)
// ============================================

/**
 * GET /api/organization-accounting/stats
 * Get accounting statistics
 */
router.get('/stats', organizationAccountingController.getAccountingStats);

// ============================================
// FILTER BY TYPE
// ============================================

/**
 * GET /api/organization-accounting/type/:accountType
 * Get accounting records by account type
 * Query params:
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 10, max: 100)
 */
router.get('/type/:accountType', organizationAccountingController.getAccountingByType);

// ============================================
// FILTER BY BANK
// ============================================

/**
 * GET /api/organization-accounting/bank/:bankName
 * Get accounting records by bank name (partial match)
 * Query params:
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 10, max: 100)
 */
router.get('/bank/:bankName', organizationAccountingController.getAccountingByBank);

// ============================================
// FILTER BY COUNTRY
// ============================================

/**
 * GET /api/organization-accounting/country/:country
 * Get accounting records by country
 * Query params:
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 10, max: 100)
 */
router.get('/country/:country', organizationAccountingController.getAccountingByCountry);

// ============================================
// FILTER BY ORGANIZATION
// ============================================

/**
 * GET /api/organization-accounting/organization/:organizationId
 * Get all accounting records for a specific organization
 * Query params:
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 10, max: 100)
 */
router.get(
  '/organization/:organizationId',
  organizationAccountingController.getAccountingByOrganization
);

// ============================================
// STANDARD CRUD ROUTES
// ============================================

/**
 * GET /api/organization-accounting
 * Get all organization accounting records with pagination
 * Query params:
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 10, max: 100)
 */
router.get('/', organizationAccountingController.getAll);

/**
 * GET /api/organization-accounting/:id
 * Get single organization accounting record by ID
 */
router.get('/:id', organizationAccountingController.getById);

/**
 * POST /api/organization-accounting
 * Create new organization accounting record
 * Body:
 * {
 *   "organization_id": "uuid",
 *   "account_type": "Checking",
 *   "bank_name": "Bank of America",
 *   "account_number": "1234567890",
 *   "routing_number": "021000021",
 *   "country": "USA"
 * }
 * 
 * Note: account_number and routing_number must be globally unique
 */
router.post('/', organizationAccountingController.create);

/**
 * PATCH /api/organization-accounting/:id
 * Update organization accounting record
 * Body: Partial accounting fields to update
 */
router.patch('/:id', organizationAccountingController.update);

/**
 * DELETE /api/organization-accounting/:id
 * Delete organization accounting record
 */
router.delete('/:id', organizationAccountingController.delete);

export default router;