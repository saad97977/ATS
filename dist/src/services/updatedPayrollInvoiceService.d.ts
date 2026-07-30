/**
 * invoiceService.ts
 *
 * Generates client (organization-level) PDF invoices for the payroll/billing
 * batch system — ClientInvoice + ClientInvoiceLine, NOT the old per-worker
 * Invoice/timesheet model. One invoice may contain many employees/departments.
 */
import 'dotenv/config';
export declare const generateClientInvoicePdf: (invoiceId: string) => Promise<string>;
//# sourceMappingURL=updatedPayrollInvoiceService.d.ts.map