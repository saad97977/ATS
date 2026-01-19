import { Router } from 'express';
import { companyOfficeController } from '../../controllers/organization/companyOfficeController';

/**
 * Company Office Routes
 * Base path: /api/company-offices
 *
 * Routes:
 * - GET    /                                   -> Get all offices (paginated)
 * - GET    /stats                              -> Get office statistics
 * - GET    /type/:type                         -> Get offices by type (REMOTE/HYBRID/ONSITE)
 * - GET    /location                           -> Get offices by location (query: city, state, country)
 * - GET    /organization/:organizationId       -> Get all offices for an organization
 * - GET    /organization/:organizationId/primary -> Get primary office for an organization
 * - GET    /:id                                -> Get office by ID
 * - POST   /                                   -> Create new office
 * - PATCH  /:id                                -> Update office
 * - DELETE /:id                                -> Delete office
 */

const router = Router();

// Stats route - must come before /:id to avoid conflict
router.get('/stats', companyOfficeController.getOfficeStats);

// Type filter route - must come before /:id
router.get('/type/:type', companyOfficeController.getOfficesByType);

// Location search route
router.get('/location', companyOfficeController.getOfficesByLocation);

// Organization-specific routes - must come before /:id
router.get('/organization/:organizationId/primary', companyOfficeController.getPrimaryOffice);
router.get('/organization/:organizationId', companyOfficeController.getOfficesByOrganization);

// Standard CRUD routes
router.get('/', companyOfficeController.getAll);
router.get('/:id', companyOfficeController.getById);
router.post('/', companyOfficeController.create);
router.patch('/:id', companyOfficeController.update);
router.delete('/:id', companyOfficeController.delete);

export default router;