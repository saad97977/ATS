/**
 * invoiceService.ts
 *
 * Generates professional PDF invoices using PDFKit (pure Node.js, no system deps).
 * The PDF is built in-memory as a Buffer â€” no temp files, no subprocesses.
 * Buffer is then handed off to the storage layer for upload.
 */
import 'dotenv/config';
/**
 * Generate a PDF for the given invoiceId and return the storage URL.
 * Called after approval or on /download.
 */
export declare const generateInvoicePdf: (invoiceId: string) => Promise<string>;
//# sourceMappingURL=invoiceService.d.ts.map