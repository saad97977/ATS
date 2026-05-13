"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authMiddleware_1 = require("../../middleware/authMiddleware");
const dropdownController_1 = require("../../controllers/dropdown/dropdownController");
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
const router = (0, express_1.Router)();
/**
 * @route   GET /api/dropdowns/organizations
 * @desc    Get organizations for dropdown/autocomplete
 * @query   search (partial org name), take (default 20, max 50)
 * @access  HCM_USER
 * @example GET /api/dropdowns/organizations?search=acme&take=50
 */
router.get('/organizations', authMiddleware_1.authenticateToken, dropdownController_1.dropdownController.getOrganizations);
/**
 * @route   GET /api/dropdowns/jobs
 * @desc    Get jobs for dropdown/autocomplete
 * @query   search (job title or location), organization_id, status, take (default 20, max 50)
 * @access  HCM_USER
 * @example GET /api/dropdowns/jobs?search=developer&organization_id=org123&status=OPEN&take=50
 */
router.get('/jobs', authMiddleware_1.authenticateToken, dropdownController_1.dropdownController.getJobs);
/**
 * @route   GET /api/dropdowns/organization-users
 * @desc    Get organization users for dropdown/autocomplete
 * @query   search (name or email), organization_id, take (default 20, max 50)
 * @access  HCM_USER
 * @example GET /api/dropdowns/organization-users?search=john&organization_id=org123&take=50
 */
router.get('/organization-users', authMiddleware_1.authenticateToken, dropdownController_1.dropdownController.getOrganizationUsers);
/**
 * @route   GET /api/dropdowns/document-categories
 * @desc    Get document categories (titles) for dropdown/autocomplete
 * @query   search (category name), organization_id, take (default 20, max 50)
 * @access  HCM_USER
 * @example GET /api/dropdowns/document-categories?search=contract&organization_id=org123&take=50
 */
router.get('/document-categories', authMiddleware_1.authenticateToken, dropdownController_1.dropdownController.getDocumentCategories);
/**
 * @route   GET /api/dropdowns/locations
 * @desc    Get all unique job locations grouped by location
 * @query   none required
 * @access  HCM_USER
 * @example GET /api/dropdowns/locations
 */
router.get('/locations', dropdownController_1.dropdownController.getLocations);
exports.default = router;
//# sourceMappingURL=dropdownRoutes.js.map