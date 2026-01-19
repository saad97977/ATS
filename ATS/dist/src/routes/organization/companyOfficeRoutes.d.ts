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
declare const router: import("express-serve-static-core").Router;
export default router;
//# sourceMappingURL=companyOfficeRoutes.d.ts.map