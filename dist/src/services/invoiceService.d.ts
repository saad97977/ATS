/**
 * invoice.service.ts
 *
 * Generates professional PDF invoices using Python + ReportLab.
 * The PDF is built via a subprocess, saved to /tmp, then uploaded
 * to your storage layer (S3/GCS — stub provided below).
 *
 * Install Python dep: pip3 install reportlab
 */
import 'dotenv/config';
/**
 * Generate a PDF for the given invoiceId and return the storage URL.
 * Called async after approval, or synchronously on /download.
 */
export declare const generateInvoicePdf: (invoiceId: string) => Promise<string>;
//# sourceMappingURL=invoiceService.d.ts.map