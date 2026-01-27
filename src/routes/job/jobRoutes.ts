import { Router } from 'express';
import { jobController } from '../../controllers/job/jobController';
import { filterJobs } from '../../controllers/job/jobFilterController';


const router = Router();

/**
 * Job Routes
 * Base path: /api/jobs
 */

// Statistics endpoint (must be before :id routes)
router.get('/stats', jobController.getJobStats);

// Special query endpoints (must be before :id routes)
router.get('/approved', jobController.getApprovedJobs);
router.get('/active', jobController.getActiveJobs);

// Filtered list endpoints
router.get('/organization/:organizationId', jobController.getJobsByOrganization);
router.get('/status/:status', jobController.getJobsByStatus);
router.get('/type/:type', jobController.getJobsByType);
router.get('/manager/:managerId', jobController.getJobsByManager);
router.get('/user/:userId', jobController.getJobsByUser);
router.get('/user/:userId/organizations', jobController.getUserOrganizations);


/**
 * Job Filter Routes
 * Base path: /api/jobs/filter
 */

/**
 * GET /api/jobs/filter
 * 
 * Dynamic job filtering endpoint with comprehensive search capabilities
 * 
 * @route GET /api/jobs/filter
 * @access Public/Protected (based on your auth requirements)
 * 
 * @queryparam {string} [search] - Global search across job_title, location, organization
 * @queryparam {string} [job_title] - Filter by job title
 * @queryparam {string} [location] - Filter by location
 * @queryparam {string|string[]} [status] - Filter by status (DRAFT, OPEN, CLOSED)
 * @queryparam {string|string[]} [job_type] - Filter by type (TEMPORARY, PERMANENT)
 * @queryparam {boolean} [approved] - Filter by approval status
 * @queryparam {string|string[]} [organization_id] - Filter by organization ID(s)
 * @queryparam {string} [organization_name] - Filter by organization name
 * @queryparam {string|string[]} [manager_id] - Filter by manager ID(s)
 * @queryparam {string|string[]} [created_by_user_id] - Filter by creator ID(s)
 * @queryparam {string|string[]} [company_office_id] - Filter by office ID(s)
 * @queryparam {string|string[]} [office_type] - Filter by office type (REMOTE, HYBRID, ONSITE)
 * @queryparam {string} [created_from] - Filter jobs created from date (ISO)
 * @queryparam {string} [created_to] - Filter jobs created to date (ISO)
 * @queryparam {string} [start_date_from] - Filter by start date from (ISO)
 * @queryparam {string} [start_date_to] - Filter by start date to (ISO)
 * @queryparam {string} [end_date_from] - Filter by end date from (ISO)
 * @queryparam {string} [end_date_to] - Filter by end date to (ISO)
 * @queryparam {number} [days_active_min] - Minimum days active
 * @queryparam {number} [days_active_max] - Maximum days active
 * @queryparam {number} [days_inactive_min] - Minimum days inactive
 * @queryparam {number} [days_inactive_max] - Maximum days inactive
 * @queryparam {number} [max_positions_min] - Minimum max positions
 * @queryparam {number} [max_positions_max] - Maximum max positions
 * @queryparam {number} [open_positions_min] - Minimum open positions
 * @queryparam {number} [open_positions_max] - Maximum open positions
 * @queryparam {number} [applications_count_min] - Minimum application count
 * @queryparam {number} [applications_count_max] - Maximum application count
 * @queryparam {boolean} [has_applications] - Filter jobs with/without applications
 * @queryparam {boolean} [has_job_owners] - Filter jobs with/without owners
 * @queryparam {boolean} [has_job_rates] - Filter jobs with/without rates
 * @queryparam {boolean} [has_job_details] - Filter jobs with/without details
 * @queryparam {string} [sort_by] - Sort field (default: created_at)
 * @queryparam {string} [sort_order] - Sort direction (asc|desc, default: desc)
 * @queryparam {number} [page] - Page number (default: 1)
 * @queryparam {number} [limit] - Items per page (default: 10, max: 100)
 * 
 * @returns {Object} Response object with filtered jobs, pagination, and applied filters
 * 
 * @example
 * // Simple search
 * GET /api/jobs/filter?search=developer
 * 
 * @example
 * // Multiple filters with pagination
 * GET /api/jobs/filter?status=OPEN&approved=true&page=1&limit=20
 * 
 * @example
 * // Date range with organization filter
 * GET /api/jobs/filter?organization_id=123&created_from=2024-01-01&created_to=2024-12-31
 * 
 * @example
 * // Complex filtering with sorting
 * GET /api/jobs/filter?status=OPEN&applications_count_min=5&sort_by=applications_count&sort_order=desc
 */
router.get('/filter', filterJobs);








// Standard CRUD operations
router.get('/', jobController.getAll);
router.get('/:id', jobController.getById);
router.post('/', jobController.create);
router.patch('/:id', jobController.update);
router.delete('/:id', jobController.delete);

export default router;