import { Router } from 'express';
import { authenticateToken } from '../../middleware/authMiddleware';
import {
  contactActivityDropdownController,
  contactPreviewController,
  organizationActivityController,
  contactJobController,
} from '../../controllers/organization/contactActivityController';

// ============================================================
// DROPDOWN ROUTER
// ============================================================

const contactActivityDropdownRouter = Router();

/**
 * @route   GET /api/contact-activity/dropdown/organization-users
 * @desc    Get organization users for dropdown/autocomplete
 * @query   organization_id (optional - filter by organization)
 * @access  HCM_USER
 */
contactActivityDropdownRouter.get(
  '/organization-users',
  authenticateToken,
  contactActivityDropdownController.getOrganizationUsers
);

/**
 * @route   GET /api/contact-activity/dropdown/users
 * @desc    Get all platform users for dropdown
 * @access  HCM_USER
 */
contactActivityDropdownRouter.get(
  '/users',
  authenticateToken,
  contactActivityDropdownController.getUsers
);

/**
 * @route   GET /api/contact-activity/dropdown/organizations
 * @desc    Get all organizations for dropdown
 * @access  HCM_USER
 */
contactActivityDropdownRouter.get(
  '/organizations',
  authenticateToken,
  contactActivityDropdownController.getOrganizations
);

/**
 * @route   GET /api/contact-activity/dropdown/jobs
 * @desc    Get all jobs for dropdown
 * @query   status (optional - filter by job status)
 * @access  HCM_USER
 */
contactActivityDropdownRouter.get(
  '/jobs',
  authenticateToken,
  contactActivityDropdownController.getJobs
);

// ============================================================
// CONTACT PREVIEWS ROUTER
// ============================================================

const contactPreviewRouter = Router();

/**
 * @route   GET /api/contact-previews
 * @desc    Get all contact previews (paginated)
 * @query   organization_user_id, user_id, type, job_id, page, limit
 * @access  HCM_USER
 */
contactPreviewRouter.get('/', authenticateToken, contactPreviewController.getAll);

/**
 * @route   GET /api/contact-previews/:id
 * @desc    Get a single contact preview by ID
 * @access  HCM_USER
 */
contactPreviewRouter.get('/:id', authenticateToken, contactPreviewController.getById);

/**
 * @route   GET /api/contact-previews/organization-user/:organizationUserId
 * @desc    Get all previews for a specific organization user
 * @query   page, limit
 * @access  HCM_USER
 */
contactPreviewRouter.get('/organization-user/:organizationUserId', authenticateToken, contactPreviewController.getByOrganizationUser);

/**
 * @route   POST /api/contact-previews
 * @desc    Log a new contact preview (call, scheduled call, etc.)
 * @body    { contact_id, user_id, type, notes?, date?, job_id? }
 * @access  HCM_USER
 */
contactPreviewRouter.post('/', authenticateToken, contactPreviewController.create);

/**
 * @route   PATCH /api/contact-previews/:id
 * @desc    Update a contact preview
 * @body    { type?, notes?, date?, job_id? }
 * @access  HCM_USER
 */
contactPreviewRouter.patch('/:id', authenticateToken, contactPreviewController.update);

/**
 * @route   DELETE /api/contact-previews/:id
 * @desc    Delete a contact preview
 * @access  HCM_USER
 */
contactPreviewRouter.delete('/:id', authenticateToken, contactPreviewController.delete);

// ============================================================
// ORGANIZATION ACTIVITIES ROUTER
// ============================================================

const organizationActivityRouter = Router();

/**
 * @route   GET /api/organization-activities
 * @desc    Get all organization activities (paginated)
 * @query   organization_id, logged_by_user_id, activity_type, page, limit
 * @access  HCM_USER
 */
organizationActivityRouter.get('/', authenticateToken, organizationActivityController.getAll);

/**
 * @route   GET /api/organization-activities/:id
 * @desc    Get a single organization activity by ID
 * @access  HCM_USER
 */
organizationActivityRouter.get('/:id', authenticateToken, organizationActivityController.getById);

/**
 * @route   GET /api/organization-activities/organization/:orgId
 * @desc    Get all activities for a specific organization (with type breakdown)
 * @query   activity_type, page, limit
 * @access  HCM_USER
 */
organizationActivityRouter.get('/organization/:orgId', authenticateToken, organizationActivityController.getByOrganization);

/**
 * @route   POST /api/organization-activities
 * @desc    Log a new organization activity
 * @body    { organization_id, logged_by_user_id, activity_type, details? }
 * @access  HCM_USER
 */
organizationActivityRouter.post('/', authenticateToken, organizationActivityController.create);

/**
 * @route   PATCH /api/organization-activities/:id
 * @desc    Update an organization activity
 * @body    { activity_type?, details? }
 * @access  HCM_USER
 */
organizationActivityRouter.patch('/:id', authenticateToken, organizationActivityController.update);

/**
 * @route   DELETE /api/organization-activities/:id
 * @desc    Delete an organization activity
 * @access  HCM_USER
 */
organizationActivityRouter.delete('/:id', authenticateToken, organizationActivityController.delete);

// ============================================================
// CONTACT JOBS ROUTER
// ============================================================

const contactJobRouter = Router();

/**
 * @route   GET /api/contact-jobs
 * @desc    Get all contact-job links (paginated)
 * @query   organization_user_id, job_id, page, limit
 * @access  HCM_USER
 */
contactJobRouter.get('/', authenticateToken, contactJobController.getAll);

/**
 * @route   GET /api/contact-jobs/organization-user/:organizationUserId
 * @desc    Get all jobs linked to an organization user
 * @access  HCM_USER
 */
contactJobRouter.get('/organization-user/:organizationUserId', authenticateToken, contactJobController.getByOrganizationUser);

/**
 * @route   GET /api/contact-jobs/job/:jobId
 * @desc    Get all organization users linked to a job
 * @access  HCM_USER
 */
contactJobRouter.get('/job/:jobId', authenticateToken, contactJobController.getByJob);

/**
 * @route   POST /api/contact-jobs
 * @desc    Link an organization user to a single job
 * @body    { organization_user_id, job_id }
 * @access  HCM_USER
 */
contactJobRouter.post('/', authenticateToken, contactJobController.create);

/**
 * @route   POST /api/contact-jobs/bulk
 * @desc    Link an organization user to multiple jobs at once
 * @body    { organization_user_id, job_ids: string[] }
 * @access  HCM_USER
 */
contactJobRouter.post('/bulk', authenticateToken, contactJobController.bulkCreate);

/**
 * @route   DELETE /api/contact-jobs/organization-user/:organizationUserId/job/:jobId
 * @desc    Remove a contact-job link by composite key
 * @access  HCM_USER
 */
contactJobRouter.delete('/organization-user/:organizationUserId/job/:jobId', authenticateToken, contactJobController.deleteByComposite);

/**
 * @route   DELETE /api/contact-jobs/:id
 * @desc    Remove a contact-job link by contact_job_id
 * @access  HCM_USER
 */
contactJobRouter.delete('/:id', authenticateToken, contactJobController.delete);

// ============================================================
// EXPORTS
// ============================================================

export { contactActivityDropdownRouter, contactPreviewRouter, organizationActivityRouter, contactJobRouter };