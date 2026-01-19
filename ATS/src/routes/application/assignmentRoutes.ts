import { Router } from 'express';
import { assignmentController } from '../../controllers/application/assignmentController';

const router = Router();

/**
 * Assignment Routes
 * Base path: /api/assignments
 * 
 * Endpoints:
 * - GET    /api/assignments                          - Get all assignments (paginated, filterable)
 * - GET    /api/assignments/stats                    - Get assignment statistics
 * - GET    /api/assignments/active                   - Get active assignments
 * - GET    /api/assignments/completed                - Get completed assignments
 * - GET    /api/assignments/employment-type/:type    - Get assignments by employment type
 * - GET    /api/assignments/application/:applicationId - Get assignment by application ID
 * - GET    /api/assignments/:id                      - Get assignment by ID
 * - POST   /api/assignments                          - Create new assignment
 * - PATCH  /api/assignments/:id                      - Update assignment
 * - DELETE /api/assignments/:id                      - Delete assignment
 * 
 * Query Parameters (for GET all, active, completed, employment-type):
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 10, max: 100)
 * - employment_type: Filter by W2 or CONTRACTOR_1099 (for GET all)
 * - active_only: Filter for active assignments only (for GET all)
 */

// Statistics endpoint - must come before :id route
router.get('/stats', assignmentController.getAssignmentStats);

// Active assignments endpoint - must come before :id route
router.get('/active', assignmentController.getActiveAssignments);

// Completed assignments endpoint - must come before :id route
router.get('/completed', assignmentController.getCompletedAssignments);

// Get assignments by employment type - must come before :id route
router.get('/employment-type/:type', assignmentController.getAssignmentsByEmploymentType);

// Get assignment by application ID - must come before :id route
router.get('/application/:applicationId', assignmentController.getAssignmentByApplication);

// Standard CRUD routes
router.get('/', assignmentController.getAll);
router.get('/:id', assignmentController.getById);
router.post('/', assignmentController.create);
router.patch('/:id', assignmentController.update);
router.delete('/:id', assignmentController.delete);

export default router;