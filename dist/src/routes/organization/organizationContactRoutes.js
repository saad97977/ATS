"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const organizationContactController_1 = require("../../controllers/organization/organizationContactController");
/**
 * Organization Contact Routes
 * Base path: /api/organization-contacts
 *
 * Available endpoints:
 * - GET    /                                     Get all contacts (paginated)
 * - GET    /search?query=                        Search contacts by name/email
 * - GET    /type/:contactType                    Get contacts by type (PRIMARY/EMERGENCY)
 * - GET    /organization/:organizationId         Get all contacts for an organization
 * - GET    /organization/:organizationId/primary Get primary contact for organization
 * - GET    /:id                                  Get single contact by ID
 * - POST   /                                     Create new contact
 * - PATCH  /:id                                  Update contact
 * - DELETE /:id                                  Delete contact
 */
const router = (0, express_1.Router)();
// ============================================
// SEARCH ROUTES (must come before :id)
// ============================================
/**
 * GET /api/organization-contacts/search?query=john
 * Search contacts by name or email
 * Query params:
 * - query: Search term (min 2 chars)
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 10, max: 100)
 */
router.get('/search', organizationContactController_1.organizationContactController.searchContacts);
// ============================================
// FILTER BY ORGANIZATION
// ============================================
/**
 * GET /api/organization-contacts/organization/:organizationId/primary
 * Get primary contact for a specific organization
 */
router.get('/organization/:organizationId/primary', organizationContactController_1.organizationContactController.getPrimaryContact);
/**
 * GET /api/organization-contacts/organization/:organizationId
 * Get all contacts for a specific organization
 * Query params:
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 10, max: 100)
 */
router.get('/organization/:organizationId', organizationContactController_1.organizationContactController.getContactsByOrganization);
// ============================================
// STANDARD CRUD ROUTES
// ============================================
/**
 * GET /api/organization-contacts
 * Get all organization contacts with pagination
 * Query params:
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 10, max: 100)
 */
router.get('/', organizationContactController_1.organizationContactController.getAll);
/**
 * GET /api/organization-contacts/:id
 * Get single organization contact by ID
 */
router.get('/:id', organizationContactController_1.organizationContactController.getById);
/**
 * POST /api/organization-contacts
 * Create new organization contact
 * Body:
 * {
 *   "organization_id": "uuid",
 *   "name": "John Doe",
 *   "email": "john@example.com",
 *   "phone": "+1234567890",
 *   "contact_type": "PRIMARY" | "EMERGENCY"
 * }
 */
router.post('/', organizationContactController_1.organizationContactController.create);
/**
 * PATCH /api/organization-contacts/:id
 * Update organization contact
 * Body: Partial contact fields to update
 */
router.patch('/:id', organizationContactController_1.organizationContactController.update);
/**
 * DELETE /api/organization-contacts/:id
 * Delete organization contact
 */
router.delete('/:id', organizationContactController_1.organizationContactController.delete);
exports.default = router;
//# sourceMappingURL=organizationContactRoutes.js.map