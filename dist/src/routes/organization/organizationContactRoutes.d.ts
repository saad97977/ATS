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
declare const router: import("express-serve-static-core").Router;
export default router;
//# sourceMappingURL=organizationContactRoutes.d.ts.map