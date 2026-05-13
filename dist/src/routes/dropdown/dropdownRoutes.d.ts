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
declare const router: import("express-serve-static-core").Router;
export default router;
//# sourceMappingURL=dropdownRoutes.d.ts.map