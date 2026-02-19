/**
 * quickbooks.service.ts
 *
 * QuickBooks Online integration — fully commented out until you have credentials.
 *
 * ── WHEN YOU'RE READY TO INTEGRATE ──────────────────────────────────────────
 * Step 1: Add these to your .env file:
 *           QB_CLIENT_ID=<from Intuit Developer Portal>
 *           QB_CLIENT_SECRET=<from Intuit Developer Portal>
 *           QB_REDIRECT_URI=http://localhost:3000/auth/qb/callback
 *           QB_ACCESS_TOKEN=<from OAuth flow>
 *           QB_REFRESH_TOKEN=<from OAuth flow>
 *           QB_REALM_ID=<your company ID>
 *           QB_SANDBOX=true          ← set to false in production
 *
 * Step 2: npm install node-quickbooks intuit-oauth
 *
 * Step 3: Uncomment everything in this file
 *
 * Step 4: In timesheetController.ts:
 *           - Uncomment the import at the top
 *           - Uncomment the QB sync block inside approveTimesheet()
 *           - Uncomment syncInvoiceToQuickBooks() and its export
 *
 * Step 5: In timesheets.routes.ts:
 *           - Uncomment the sync-qb route
 * ─────────────────────────────────────────────────────────────────────────────
 */
export {};
//# sourceMappingURL=quickbooksService.d.ts.map