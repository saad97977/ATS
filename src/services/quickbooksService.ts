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

// import prisma from '../../prisma.config';
// import QuickBooks from 'node-quickbooks';
// import OAuthClientLib from 'intuit-oauth';

// export interface QBSyncResult {
//   success:   boolean;
//   qb_id?:    string;
//   error?:    string;
//   synced_at: Date;
// }

// ── QB Client Factory ─────────────────────────────────────────
// const getQBClient = () =>
//   new QuickBooks(
//     process.env.QB_CLIENT_ID!,
//     process.env.QB_CLIENT_SECRET!,
//     process.env.QB_ACCESS_TOKEN!,
//     false,                              // no token secret (OAuth 2)
//     process.env.QB_REALM_ID!,
//     process.env.QB_SANDBOX === 'true',  // sandbox flag
//     false,                              // debug
//     null,                               // minor version (use default)
//     '2.0',
//     process.env.QB_REFRESH_TOKEN!
//   );

// ── Token Refresh ─────────────────────────────────────────────
// Call on app start or whenever you detect an expired token.
// export const refreshQBToken = async (): Promise<void> => {
//   const OAuthClient = new OAuthClientLib({
//     clientId:     process.env.QB_CLIENT_ID,
//     clientSecret: process.env.QB_CLIENT_SECRET,
//     environment:  process.env.QB_SANDBOX === 'true' ? 'sandbox' : 'production',
//     redirectUri:  process.env.QB_REDIRECT_URI,
//   });
//   const auth = await OAuthClient.refreshUsingToken(process.env.QB_REFRESH_TOKEN);
//   const { access_token, refresh_token } = auth.getJson();
//   process.env.QB_ACCESS_TOKEN  = access_token;
//   process.env.QB_REFRESH_TOKEN = refresh_token;
//   // TODO: Persist updated tokens to DB or your secrets manager
// };

// ── SYNC: Timesheet → QB Time Activities ─────────────────────
// One QB TimeActivity per daily TimeEntry row.
// export const syncTimesheetToQB = async (timesheetId: string): Promise<QBSyncResult> => {
//   try {
//     const timesheet = await prisma.timesheet.findUnique({
//       where: { timesheet_id: timesheetId },
//       include: {
//         time_entries: { orderBy: { work_date: 'asc' } },
//         assignment: {
//           include: {
//             application: {
//               include: {
//                 applicant: { select: { full_name: true } },
//                 job: {
//                   select: {
//                     job_title:    true,
//                     organization: { select: { name: true } },
//                   },
//                 },
//               },
//             },
//           },
//         },
//       },
//     });
//
//     if (!timesheet) throw new Error('Timesheet not found');
//     if (timesheet.status !== 'APPROVED') {
//       throw new Error('Only APPROVED timesheets can be synced to QuickBooks');
//     }
//
//     const qb = getQBClient();
//
//     for (const entry of timesheet.time_entries) {
//       const totalHours = Number(entry.total_hours);
//       const payload = {
//         NameOf:         'Vendor',
//         TxnDate:        entry.work_date.toISOString().slice(0, 10),
//         Hours:          Math.floor(totalHours),
//         Minutes:        Math.round((totalHours % 1) * 60),
//         Description:    `${timesheet.assignment.application.job.job_title} — ${entry.work_type}`,
//         VendorRef:      { value: '<YOUR_QB_VENDOR_ID>' },    // map applicant → QB Vendor
//         CustomerRef:    { value: '<YOUR_QB_CUSTOMER_ID>' },  // map org → QB Customer
//         ItemRef:        { value: '<YOUR_QB_ITEM_ID>' },
//         BillableStatus: 'Billable',
//         HourlyRate:     String(timesheet.bill_rate ?? 0),
//       };
//       await new Promise((resolve, reject) =>
//         qb.createTimeActivity(payload, (err: any, result: any) =>
//           err ? reject(err) : resolve(result)
//         )
//       );
//     }
//
//     const syncedAt = new Date();
//     await prisma.timesheet.update({
//       where: { timesheet_id: timesheetId },
//       data:  { qb_synced: true, qb_synced_at: syncedAt, qb_timesheet_id: '<QB_ID_FROM_RESPONSE>' },
//     });
//
//     return { success: true, qb_id: '<QB_ID_FROM_RESPONSE>', synced_at: syncedAt };
//   } catch (err: any) {
//     console.error('syncTimesheetToQB:', err);
//     return { success: false, error: err.message, synced_at: new Date() };
//   }
// };

// ── SYNC: Invoice → QB Invoice ────────────────────────────────
// Creates or updates a QuickBooks Invoice from your Invoice record.
// export const syncInvoiceToQB = async (invoiceId: string): Promise<QBSyncResult> => {
//   try {
//     const invoice = await prisma.invoice.findUnique({
//       where: { invoice_id: invoiceId },
//       include: {
//         timesheet: { select: { week_start_date: true, week_end_date: true } },
//         assignment: {
//           include: {
//             application: {
//               include: {
//                 job: {
//                   select: {
//                     job_title:    true,
//                     organization: { select: { name: true } },
//                   },
//                 },
//               },
//             },
//           },
//         },
//       },
//     });
//
//     if (!invoice) throw new Error('Invoice not found');
//
//     const qb = getQBClient();
//
//     const lineItems: any[] = [
//       {
//         Amount:      Number(invoice.subtotal) - Number(invoice.tax_amount),
//         DetailType:  'SalesItemLineDetail',
//         Description: `Regular hours — week of ${invoice.timesheet.week_start_date.toISOString().slice(0, 10)}`,
//         SalesItemLineDetail: {
//           ItemRef:   { value: '<QB_REGULAR_SERVICE_ITEM_ID>' },
//           UnitPrice: Number(invoice.bill_rate),
//           Qty:       Number(invoice.regular_hours),
//         },
//       },
//     ];
//
//     if (Number(invoice.ot_hours) > 0) {
//       lineItems.push({
//         Amount:      Number(invoice.ot_bill_rate ?? 0) * Number(invoice.ot_hours),
//         DetailType:  'SalesItemLineDetail',
//         Description: 'Overtime hours',
//         SalesItemLineDetail: {
//           ItemRef:   { value: '<QB_OT_SERVICE_ITEM_ID>' },
//           UnitPrice: Number(invoice.ot_bill_rate),
//           Qty:       Number(invoice.ot_hours),
//         },
//       });
//     }
//
//     const qbPayload: any = {
//       DocNumber:   invoice.invoice_number,
//       TxnDate:     invoice.invoice_date.toISOString().slice(0, 10),
//       DueDate:     invoice.due_date.toISOString().slice(0, 10),
//       CustomerRef: { value: '<QB_CUSTOMER_ID>' }, // map organization → QB Customer
//       Line:        lineItems,
//     };
//
//     let qbInvoiceId: string;
//     if (invoice.qb_invoice_id) {
//       // Update existing QB invoice
//       qbPayload.Id        = invoice.qb_invoice_id;
//       qbPayload.SyncToken = '<fetch current SyncToken from QB before updating>';
//       await new Promise((res, rej) =>
//         qb.updateInvoice(qbPayload, (err: any, r: any) => err ? rej(err) : res(r))
//       );
//       qbInvoiceId = invoice.qb_invoice_id;
//     } else {
//       // Create new QB invoice
//       const result: any = await new Promise((res, rej) =>
//         qb.createInvoice(qbPayload, (err: any, r: any) => err ? rej(err) : res(r))
//       );
//       qbInvoiceId = result.Id;
//     }
//
//     const syncedAt = new Date();
//     await prisma.invoice.update({
//       where: { invoice_id: invoiceId },
//       data:  { qb_synced: true, qb_synced_at: syncedAt, qb_invoice_id: qbInvoiceId, qb_sync_error: null },
//     });
//
//     return { success: true, qb_id: qbInvoiceId, synced_at: syncedAt };
//   } catch (err: any) {
//     console.error('syncInvoiceToQB:', err);
//     await prisma.invoice.update({
//       where: { invoice_id: invoiceId },
//       data:  { qb_sync_error: err.message },
//     }).catch(() => {});
//     return { success: false, error: err.message, synced_at: new Date() };
//   }
// };

// ── SYNC: Payroll → QB Bill ───────────────────────────────────
// Maps your Payroll record to a QB Bill (worker paid as a vendor).
// export const syncPayrollToQB = async (payrollId: string): Promise<QBSyncResult> => {
//   try {
//     const payroll = await prisma.payroll.findUnique({
//       where: { payroll_id: payrollId },
//       include: {
//         assignment: {
//           include: {
//             application: {
//               include: {
//                 applicant: { select: { full_name: true } },
//               },
//             },
//           },
//         },
//       },
//     });
//
//     if (!payroll) throw new Error('Payroll not found');
//
//     const qb = getQBClient();
//     const qbBill = {
//       DocNumber:  payroll.pay_period,
//       TxnDate:    payroll.processed_at.toISOString().slice(0, 10),
//       VendorRef:  { value: '<QB_VENDOR_ID>' }, // map applicant → QB Vendor
//       Line: [{
//         Amount:     Number(payroll.gross_pay),
//         DetailType: 'AccountBasedExpenseLineDetail',
//         Description: `Payroll ${payroll.pay_period} — ${payroll.assignment.application.applicant.full_name}`,
//         AccountBasedExpenseLineDetail: {
//           AccountRef: { value: '<QB_PAYROLL_EXPENSE_ACCOUNT_ID>' },
//         },
//       }],
//     };
//     const result: any = await new Promise((res, rej) =>
//       qb.createBill(qbBill, (err: any, r: any) => err ? rej(err) : res(r))
//     );
//
//     const syncedAt = new Date();
//     await prisma.payroll.update({
//       where: { payroll_id: payrollId },
//       data:  { qb_synced: true, qb_synced_at: syncedAt, qb_payroll_id: result.Id },
//     });
//
//     return { success: true, qb_id: result.Id, synced_at: syncedAt };
//   } catch (err: any) {
//     console.error('syncPayrollToQB:', err);
//     return { success: false, error: err.message, synced_at: new Date() };
//   }
// };

// Temporary no-op export so the file imports without errors until QB is enabled
export {};