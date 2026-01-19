
import { Router } from 'express';
import { organizationCompleteController } from '../../controllers/organization/fullOrganizationController';

const router = Router();

/**
 * Organization Complete Setup Routes
 * Base path: /api/organizations/complete
 */

/**
 * POST /api/organizations/complete
 * Create organization with all related data (offices, accounting, addresses, contacts)
 * 
 * Request Body:
 * {
 *   "name": "string (required)",
 *   "website": "string (optional, must be valid URL)",
 *   "status": "ACTIVE | INACTIVE (optional, default: ACTIVE)",
 *   "phone": "string (optional)",
 *   "created_by_user_id": "uuid (required)",
 *   "company_offices": [
 *     {
 *       "office_name": "string",
 *       "city": "string",
 *       "state": "string",
 *       "country": "string",
 *       "type": "REMOTE | HYBRID | ONSITE",
 *       "address": "string",
 *       "is_primary": "boolean (optional, default: false)"
 *     }
 *   ],
 *   "accounting": [
 *     {
 *       "account_type": "string",
 *       "bank_name": "string",
 *       "account_number": "string",
 *       "routing_number": "string",
 *       "country": "string"
 *     }
 *   ],
 *   "addresses": [
 *     {
 *       "address_type": "WORKSITE | BILLING",
 *       "address1": "string",
 *       "address2": "string (optional)",
 *       "city": "string",
 *       "state": "string",
 *       "zip": "string",
 *       "phone": "string (optional)"
 *     }
 *   ],
 *   "contacts": [
 *     {
 *       "name": "string",
 *       "email": "string",
 *       "phone": "string",
 *       "contact_type": "PRIMARY | EMERGENCY"
 *     }
 *   ]
 * }
 * 
 * Response: 201 Created
 * {
 *   "success": true,
 *   "data": {
 *     "organization_id": "uuid",
 *     "name": "string",
 *     "website": "string",
 *     "status": "string",
 *     "phone": "string",
 *     "created_by_user_id": "uuid",
 *     "created_at": "datetime",
 *     "company_offices": [...],
 *     "accounting": [...],
 *     "addresses": [...],
 *     "contacts": [...],
 *     "created_by": {
 *       "user_id": "uuid",
 *       "name": "string",
 *       "email": "string"
 *     }
 *   }
 * }
 */
router.post('/', organizationCompleteController.createOrganizationComplete);

export default router;