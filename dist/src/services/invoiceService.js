"use strict";
/**
 * invoiceService.ts
 *
 * Generates professional PDF invoices using PDFKit (pure Node.js, no system deps).
 * The PDF is built in-memory as a Buffer â€” no temp files, no subprocesses.
 * Buffer is then handed off to the storage layer for upload.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateInvoicePdf = void 0;
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
const pdfkit_1 = __importDefault(require("pdfkit"));
const storage_blob_1 = require("@azure/storage-blob");
require("dotenv/config");
// â”€â”€â”€ Palette â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const C = {
    PRIMARY: '#1a365d',
    SECONDARY: '#2b6cb0',
    LIGHT: '#e2e8f0',
    MUTED: '#718096',
    TEXT: '#1a202c',
    WHITE: '#ffffff',
    BG: '#f7fafc',
    BORDER: '#cbd5e0',
};
// â”€â”€â”€ Storage Upload â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
if (!process.env.AZURE_STORAGE_CONNECTION_STRING) {
    throw new Error('AZURE_STORAGE_CONNECTION_STRING is not defined in environment variables');
}
const blobServiceClient = storage_blob_1.BlobServiceClient.fromConnectionString(process.env.AZURE_STORAGE_CONNECTION_STRING);
const invoicesContainerName = process.env.AZURE_INVOICES_CONTAINER_NAME || 'invoices';
const getInvoicesContainerClient = async () => {
    const containerClient = blobServiceClient.getContainerClient(invoicesContainerName);
    await containerClient.createIfNotExists({ access: 'blob' });
    return containerClient;
};
const uploadPdfToStorage = async (buffer, filename) => {
    const containerClient = await getInvoicesContainerClient();
    const blockBlobClient = containerClient.getBlockBlobClient(filename);
    await blockBlobClient.upload(buffer, buffer.length, {
        blobHTTPHeaders: { blobContentType: 'application/pdf' },
    });
    return blockBlobClient.url;
};
// â”€â”€â”€ Data Fetcher â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const fetchInvoiceData = async (invoiceId) => {
    const invoice = await prisma.invoice.findUnique({
        where: { invoice_id: invoiceId },
        include: {
            timesheet: {
                include: {
                    time_entries: { orderBy: { work_date: 'asc' } },
                },
            },
            assignment: {
                include: {
                    application: {
                        include: {
                            applicant: { include: { contact: true } },
                            job: {
                                include: { organization: true },
                            },
                        },
                    },
                },
            },
        },
    });
    if (!invoice)
        throw new Error(`Invoice ${invoiceId} not found`);
    const { applicant, job } = invoice.assignment.application;
    const org = job.organization;
    const ts = invoice.timesheet;
    return {
        invoice_number: invoice.invoice_number,
        invoice_date: invoice.invoice_date.toISOString().slice(0, 10),
        due_date: invoice.due_date.toISOString().slice(0, 10),
        worker_name: applicant.full_name,
        worker_email: applicant.contact?.email ?? '',
        worker_phone: applicant.contact?.phone ?? '',
        job_title: job.job_title,
        organization_name: org.name,
        organization_website: org.website ?? '',
        week_start: ts.week_start_date.toISOString().slice(0, 10),
        week_end: ts.week_end_date.toISOString().slice(0, 10),
        bill_rate: Number(invoice.bill_rate).toFixed(2),
        ot_bill_rate: Number(invoice.ot_bill_rate ?? 0).toFixed(2),
        regular_hours: Number(invoice.regular_hours).toFixed(2),
        ot_hours: Number(invoice.ot_hours).toFixed(2),
        subtotal: Number(invoice.subtotal).toFixed(2),
        tax_rate: Number(invoice.tax_rate).toFixed(4),
        tax_amount: Number(invoice.tax_amount).toFixed(2),
        total_amount: Number(invoice.total_amount).toFixed(2),
        status: invoice.status,
        daily_entries: ts.time_entries.map(e => ({
            date: e.work_date.toISOString().slice(0, 10),
            regular: Number(e.regular_hours).toFixed(2),
            ot: Number(e.ot_hours).toFixed(2),
            total: Number(e.total_hours).toFixed(2),
            type: e.work_type,
        })),
    };
};
/**
 * Builds the invoice PDF entirely in-memory and resolves with a Buffer.
 * No temp files, no subprocesses.
 */
const buildPdf = (data) => {
    return new Promise((resolve, reject) => {
        const PT = 72; // points per inch
        const doc = new pdfkit_1.default({
            size: 'LETTER',
            margins: { top: 43, bottom: 43, left: 47, right: 47 },
            info: {
                Title: `${data.invoice_number} - ${data.organization_name}`,
                Author: data.organization_name,
            },
        });
        const chunks = [];
        doc.on('data', (chunk) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);
        const W = doc.page.width; // 612 pt
        const L = doc.page.margins.left; // 47 pt
        const R = doc.page.margins.right; // 47 pt
        const contentW = W - L - R; // 518 pt
        // â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        const money = (v) => '$' + parseFloat(String(v)).toLocaleString('en-US', {
            minimumFractionDigits: 2, maximumFractionDigits: 2,
        });
        const hrs = (v) => `${parseFloat(String(v)).toFixed(2)} hrs`;
        // Draw a filled row rect, then a grid stroke on top
        const drawRow = (x, y, w, h, fill) => {
            doc.rect(x, y, w, h).fill(fill);
            doc.rect(x, y, w, h).lineWidth(0.4).strokeColor(C.LIGHT).stroke();
        };
        // Write centred text inside a cell (does not move the cursor line)
        const cell = (text, x, y, w, h, opts = {}) => {
            const { font = 'Helvetica', size = 8, color = C.TEXT, align = 'center' } = opts;
            const pad = align === 'left' ? 8 : 4;
            doc.font(font).fontSize(size).fillColor(color)
                .text(text, x + pad, y + (h / 2) - (size / 2) + 1, { width: w - pad * 2, align, lineBreak: false });
        };
        // â”€â”€ HEADER â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        let y = doc.page.margins.top; // 43 pt
        doc.font('Helvetica-Bold').fontSize(22).fillColor(C.PRIMARY)
            .text(data.organization_name, L, y, { width: contentW * 0.55, lineBreak: false });
        doc.font('Helvetica-Bold').fontSize(18).fillColor(C.SECONDARY)
            .text('INVOICE', L, y, { width: contentW, align: 'right', lineBreak: false });
        y += 26;
        doc.font('Helvetica').fontSize(8).fillColor(C.MUTED)
            .text(data.invoice_number, L, y, { width: contentW, align: 'right', lineBreak: false });
        // Divider
        y += 14;
        doc.moveTo(L, y).lineTo(W - R, y).lineWidth(2).strokeColor(C.SECONDARY).stroke();
        // â”€â”€ INFO SECTION (3 columns) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        y += 14;
        const colW = contentW / 3; // ~172.7 pt per column
        const pad = 10;
        const lineH = 12;
        // Count max lines in col3 (Invoice Details: label + 4 fields)
        const infoH = pad + lineH * 5 + pad; // ~120 pt â†’ comfortable
        doc.rect(L, y, contentW, infoH).fill(C.BG);
        doc.moveTo(L + colW, y).lineTo(L + colW, y + infoH).lineWidth(0.5).strokeColor(C.BORDER).stroke();
        doc.moveTo(L + colW * 2, y).lineTo(L + colW * 2, y + infoH).lineWidth(0.5).strokeColor(C.BORDER).stroke();
        // Col 1 â€“ Bill To
        let c1y = y + pad;
        doc.font('Helvetica').fontSize(7.5).fillColor(C.MUTED)
            .text('BILL TO', L + pad, c1y, { width: colW - pad * 2, lineBreak: false });
        c1y += lineH;
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor(C.TEXT)
            .text(data.organization_name, L + pad, c1y, { width: colW - pad * 2, lineBreak: false });
        c1y += lineH;
        if (data.organization_website) {
            doc.font('Helvetica').fontSize(8.5).fillColor(C.TEXT)
                .text(data.organization_website, L + pad, c1y, { width: colW - pad * 2, lineBreak: false });
        }
        // Col 2 â€“ Worker
        let c2y = y + pad;
        const c2x = L + colW + pad;
        doc.font('Helvetica').fontSize(7.5).fillColor(C.MUTED)
            .text('WORKER', c2x, c2y, { width: colW - pad * 2, lineBreak: false });
        c2y += lineH;
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor(C.TEXT)
            .text(data.worker_name, c2x, c2y, { width: colW - pad * 2, lineBreak: false });
        c2y += lineH;
        doc.font('Helvetica').fontSize(8.5).fillColor(C.TEXT)
            .text(data.worker_email, c2x, c2y, { width: colW - pad * 2, lineBreak: false });
        c2y += lineH;
        if (data.worker_phone) {
            doc.font('Helvetica').fontSize(8.5).fillColor(C.TEXT)
                .text(data.worker_phone, c2x, c2y, { width: colW - pad * 2, lineBreak: false });
        }
        // Col 3 â€“ Invoice Details
        let c3y = y + pad;
        const c3x = L + colW * 2 + pad;
        doc.font('Helvetica').fontSize(7.5).fillColor(C.MUTED)
            .text('INVOICE DETAILS', c3x, c3y, { width: colW - pad * 2, lineBreak: false });
        c3y += lineH;
        const detailFields = [
            ['Date', data.invoice_date],
            ['Due', data.due_date],
            ['Job', data.job_title],
            ['Week', `${data.week_start} to ${data.week_end}`],
        ];
        for (const [label, value] of detailFields) {
            doc.font('Helvetica').fontSize(8.5).fillColor(C.TEXT)
                .text(`${label}: `, c3x, c3y, { continued: true, lineBreak: false })
                .font('Helvetica-Bold')
                .text(value, { lineBreak: false });
            c3y += lineH;
        }
        // â”€â”€ DAILY TIME ENTRIES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        y += infoH + 20;
        doc.font('Helvetica-Bold').fontSize(10).fillColor(C.PRIMARY)
            .text('Daily Time Entries', L, y);
        y += 16;
        const eCols = [1.7 * PT, 1.4 * PT, 1.4 * PT, 1.3 * PT, 1.4 * PT]; // 518 pt total
        const eHdrs = ['Date', 'Type', 'Regular Hrs', 'OT Hrs', 'Total Hrs'];
        const rowH = 20;
        // Header row
        doc.rect(L, y, contentW, rowH).fill(C.PRIMARY);
        let cx = L;
        for (let i = 0; i < eHdrs.length; i++) {
            cell(eHdrs[i], cx, y, eCols[i], rowH, { font: 'Helvetica-Bold', color: C.WHITE });
            cx += eCols[i];
        }
        y += rowH;
        // Data rows
        for (let ri = 0; ri < data.daily_entries.length; ri++) {
            const e = data.daily_entries[ri];
            drawRow(L, y, contentW, rowH, ri % 2 === 0 ? C.WHITE : C.BG);
            cx = L;
            for (const [i, val] of [e.date, e.type, e.regular, e.ot, e.total].entries()) {
                cell(val, cx, y, eCols[i], rowH);
                cx += eCols[i];
            }
            y += rowH;
        }
        // â”€â”€ BILLING SUMMARY â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        y += 20;
        doc.font('Helvetica-Bold').fontSize(10).fillColor(C.PRIMARY)
            .text('Billing Summary', L, y);
        y += 16;
        const bCols = [2.9 * PT, 1.3 * PT, 1.5 * PT, 1.5 * PT]; // 518 pt total
        const bHdrs = ['Description', 'Hours', 'Rate', 'Amount'];
        // Header row
        doc.rect(L, y, contentW, rowH).fill(C.PRIMARY);
        cx = L;
        for (let i = 0; i < bHdrs.length; i++) {
            cell(bHdrs[i], cx, y, bCols[i], rowH, { font: 'Helvetica-Bold', color: C.WHITE, align: i === 0 ? 'left' : 'right' });
            cx += bCols[i];
        }
        y += rowH;
        const billRows = [
            [
                'Regular Hours',
                hrs(data.regular_hours),
                `${money(data.bill_rate)}/hr`,
                money(parseFloat(data.regular_hours) * parseFloat(data.bill_rate)),
            ],
        ];
        if (parseFloat(data.ot_hours) > 0) {
            billRows.push([
                'Overtime Hours',
                hrs(data.ot_hours),
                `${money(data.ot_bill_rate)}/hr`,
                money(parseFloat(data.ot_hours) * parseFloat(data.ot_bill_rate)),
            ]);
        }
        for (let ri = 0; ri < billRows.length; ri++) {
            drawRow(L, y, contentW, rowH, ri % 2 === 0 ? C.WHITE : C.BG);
            cx = L;
            for (let i = 0; i < billRows[ri].length; i++) {
                cell(billRows[ri][i], cx, y, bCols[i], rowH, { align: i === 0 ? 'left' : 'right' });
                cx += bCols[i];
            }
            y += rowH;
        }
        // â”€â”€ TOTALS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        y += 8;
        const taxPct = (parseFloat(data.tax_rate) * 100).toFixed(2);
        const totals = [
            ['Subtotal', money(data.subtotal)],
            [`Tax (${taxPct}%)`, money(data.tax_amount)],
            ['TOTAL DUE', money(data.total_amount)],
        ];
        const labelW = contentW - 1.75 * PT;
        const valW = 1.75 * PT;
        for (let ri = 0; ri < totals.length; ri++) {
            const isTotalRow = ri === 2;
            const rH = isTotalRow ? 32 : 18;
            const fSize = isTotalRow ? 12 : 9;
            const font = isTotalRow ? 'Helvetica-Bold' : 'Helvetica';
            const color = isTotalRow ? C.WHITE : C.TEXT;
            if (isTotalRow) {
                doc.rect(L, y, contentW, rH).fill(C.PRIMARY);
                y += 6; // extra top padding for the total row
            }
            const textY = y + (isTotalRow ? 4 : 4);
            doc.font(font).fontSize(fSize).fillColor(color)
                .text(totals[ri][0], L, textY, { width: labelW, align: 'right', lineBreak: false });
            doc.font(font).fontSize(fSize).fillColor(color)
                .text(totals[ri][1], L + labelW, textY, { width: valW - 4, align: 'right', lineBreak: false });
            y += isTotalRow ? rH : rH;
        }
        // â”€â”€ FOOTER â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        y += 28;
        doc.moveTo(L, y).lineTo(W - R, y).lineWidth(0.5).strokeColor(C.LIGHT).stroke();
        y += 8;
        doc.font('Helvetica').fontSize(7).fillColor(C.MUTED)
            .text(`Generated by ATS Billing System  Â·  ${data.invoice_number}  Â·  Thank you for your business.`, L, y, { width: contentW, align: 'center', lineBreak: false });
        doc.end();
    });
};
// â”€â”€â”€ Main Export â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
/**
 * Generate a PDF for the given invoiceId and return the storage URL.
 * Called after approval or on /download.
 */
const generateInvoicePdf = async (invoiceId) => {
    const data = await fetchInvoiceData(invoiceId);
    const filename = `${data.invoice_number.replace(/[^A-Za-z0-9\-]/g, '_')}.pdf`;
    const buffer = await buildPdf(data);
    return await uploadPdfToStorage(buffer, filename);
};
exports.generateInvoicePdf = generateInvoicePdf;
//# sourceMappingURL=invoiceService.js.map