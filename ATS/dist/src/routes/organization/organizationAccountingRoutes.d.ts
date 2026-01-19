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
declare const router: import("express-serve-static-core").Router;
export default router;
//# sourceMappingURL=organizationAccountingRoutes.d.ts.map