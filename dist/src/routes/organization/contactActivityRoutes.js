"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.contactJobRouter = exports.organizationActivityRouter = exports.contactPreviewRouter = exports.contactActivityDropdownRouter = void 0;
const express_1 = require("express");
const authMiddleware_1 = require("../../middleware/authMiddleware");
const contactActivityController_1 = require("../../controllers/organization/contactActivityController");
// ============================================================
// DROPDOWN ROUTER
// ============================================================
const contactActivityDropdownRouter = (0, express_1.Router)();
exports.contactActivityDropdownRouter = contactActivityDropdownRouter;
/**
 * @route   GET /api/contact-activity/dropdown/organization-users
 * @desc    Get organization users for dropdown/autocomplete
 * @query   organization_id (optional - filter by organization)
 * @access  HCM_USER
 */
contactActivityDropdownRouter.get('/organization-users', authMiddleware_1.authenticateToken, contactActivityController_1.contactActivityDropdownController.getOrganizationUsers);
/**
 * @route   GET /api/contact-activity/dropdown/users
 * @desc    Get all platform users for dropdown
 * @access  HCM_USER
 */
contactActivityDropdownRouter.get('/users', authMiddleware_1.authenticateToken, contactActivityController_1.contactActivityDropdownController.getUsers);
/**
 * @route   GET /api/contact-activity/dropdown/organizations
 * @desc    Get all organizations for dropdown
 * @access  HCM_USER
 */
contactActivityDropdownRouter.get('/organizations', authMiddleware_1.authenticateToken, contactActivityController_1.contactActivityDropdownController.getOrganizations);
/**
 * @route   GET /api/contact-activity/dropdown/jobs
 * @desc    Get all jobs for dropdown
 * @query   status (optional - filter by job status)
 * @access  HCM_USER
 */
contactActivityDropdownRouter.get('/jobs', authMiddleware_1.authenticateToken, contactActivityController_1.contactActivityDropdownController.getJobs);
// ============================================================
// CONTACT PREVIEWS ROUTER
// ============================================================
const contactPreviewRouter = (0, express_1.Router)();
exports.contactPreviewRouter = contactPreviewRouter;
/**
 * @route   GET /api/contact-previews
 * @desc    Get all contact previews (paginated)
 * @query   organization_user_id, user_id, type, job_id, page, limit
 * @access  HCM_USER
 */
contactPreviewRouter.get('/', authMiddleware_1.authenticateToken, contactActivityController_1.contactPreviewController.getAll);
/**
 * @route   GET /api/contact-previews/:id
 * @desc    Get a single contact preview by ID
 * @access  HCM_USER
 */
contactPreviewRouter.get('/:id', authMiddleware_1.authenticateToken, contactActivityController_1.contactPreviewController.getById);
/**
 * @route   GET /api/contact-previews/organization-user/:organizationUserId
 * @desc    Get all previews for a specific organization user
 * @query   page, limit
 * @access  HCM_USER
 */
contactPreviewRouter.get('/organization-user/:organizationUserId', authMiddleware_1.authenticateToken, contactActivityController_1.contactPreviewController.getByOrganizationUser);
/**
 * @route   POST /api/contact-previews
 * @desc    Log a new contact preview (call, scheduled call, etc.)
 * @body    { contact_id, user_id, type, notes?, date?, job_id? }
 * @access  HCM_USER
 */
contactPreviewRouter.post('/', authMiddleware_1.authenticateToken, contactActivityController_1.contactPreviewController.create);
/**
 * @route   PATCH /api/contact-previews/:id
 * @desc    Update a contact preview
 * @body    { type?, notes?, date?, job_id? }
 * @access  HCM_USER
 */
contactPreviewRouter.patch('/:id', authMiddleware_1.authenticateToken, contactActivityController_1.contactPreviewController.update);
/**
 * @route   DELETE /api/contact-previews/:id
 * @desc    Delete a contact preview
 * @access  HCM_USER
 */
contactPreviewRouter.delete('/:id', authMiddleware_1.authenticateToken, contactActivityController_1.contactPreviewController.delete);
// ============================================================
// ORGANIZATION ACTIVITIES ROUTER
// ============================================================
const organizationActivityRouter = (0, express_1.Router)();
exports.organizationActivityRouter = organizationActivityRouter;
/**
 * @route   GET /api/organization-activities
 * @desc    Get all organization activities (paginated)
 * @query   organization_id, logged_by_user_id, activity_type, page, limit
 * @access  HCM_USER
 */
organizationActivityRouter.get('/', authMiddleware_1.authenticateToken, contactActivityController_1.organizationActivityController.getAll);
/**
 * @route   GET /api/organization-activities/:id
 * @desc    Get a single organization activity by ID
 * @access  HCM_USER
 */
organizationActivityRouter.get('/:id', authMiddleware_1.authenticateToken, contactActivityController_1.organizationActivityController.getById);
/**
 * @route   GET /api/organization-activities/organization/:orgId
 * @desc    Get all activities for a specific organization (with type breakdown)
 * @query   activity_type, page, limit
 * @access  HCM_USER
 */
organizationActivityRouter.get('/organization/:orgId', authMiddleware_1.authenticateToken, contactActivityController_1.organizationActivityController.getByOrganization);
/**
 * @route   POST /api/organization-activities
 * @desc    Log a new organization activity
 * @body    { organization_id, logged_by_user_id, activity_type, details? }
 * @access  HCM_USER
 */
organizationActivityRouter.post('/', authMiddleware_1.authenticateToken, contactActivityController_1.organizationActivityController.create);
/**
 * @route   PATCH /api/organization-activities/:id
 * @desc    Update an organization activity
 * @body    { activity_type?, details? }
 * @access  HCM_USER
 */
organizationActivityRouter.patch('/:id', authMiddleware_1.authenticateToken, contactActivityController_1.organizationActivityController.update);
/**
 * @route   DELETE /api/organization-activities/:id
 * @desc    Delete an organization activity
 * @access  HCM_USER
 */
organizationActivityRouter.delete('/:id', authMiddleware_1.authenticateToken, contactActivityController_1.organizationActivityController.delete);
// ============================================================
// CONTACT JOBS ROUTER
// ============================================================
const contactJobRouter = (0, express_1.Router)();
exports.contactJobRouter = contactJobRouter;
/**
 * @route   GET /api/contact-jobs
 * @desc    Get all contact-job links (paginated)
 * @query   organization_user_id, job_id, page, limit
 * @access  HCM_USER
 */
contactJobRouter.get('/', authMiddleware_1.authenticateToken, contactActivityController_1.contactJobController.getAll);
/**
 * @route   GET /api/contact-jobs/organization-user/:organizationUserId
 * @desc    Get all jobs linked to an organization user
 * @access  HCM_USER
 */
contactJobRouter.get('/organization-user/:organizationUserId', authMiddleware_1.authenticateToken, contactActivityController_1.contactJobController.getByOrganizationUser);
/**
 * @route   GET /api/contact-jobs/job/:jobId
 * @desc    Get all organization users linked to a job
 * @access  HCM_USER
 */
contactJobRouter.get('/job/:jobId', authMiddleware_1.authenticateToken, contactActivityController_1.contactJobController.getByJob);
/**
 * @route   POST /api/contact-jobs
 * @desc    Link an organization user to a single job
 * @body    { organization_user_id, job_id }
 * @access  HCM_USER
 */
contactJobRouter.post('/', authMiddleware_1.authenticateToken, contactActivityController_1.contactJobController.create);
/**
 * @route   POST /api/contact-jobs/bulk
 * @desc    Link an organization user to multiple jobs at once
 * @body    { organization_user_id, job_ids: string[] }
 * @access  HCM_USER
 */
contactJobRouter.post('/bulk', authMiddleware_1.authenticateToken, contactActivityController_1.contactJobController.bulkCreate);
/**
 * @route   DELETE /api/contact-jobs/organization-user/:organizationUserId/job/:jobId
 * @desc    Remove a contact-job link by composite key
 * @access  HCM_USER
 */
contactJobRouter.delete('/organization-user/:organizationUserId/job/:jobId', authMiddleware_1.authenticateToken, contactActivityController_1.contactJobController.deleteByComposite);
/**
 * @route   DELETE /api/contact-jobs/:id
 * @desc    Remove a contact-job link by contact_job_id
 * @access  HCM_USER
 */
contactJobRouter.delete('/:id', authMiddleware_1.authenticateToken, contactActivityController_1.contactJobController.delete);
//# sourceMappingURL=contactActivityRoutes.js.map