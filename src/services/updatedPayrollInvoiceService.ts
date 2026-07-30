/**
 * invoiceService.ts
 *
 * Generates client (organization-level) PDF invoices for the payroll/billing
 * batch system — ClientInvoice + ClientInvoiceLine, NOT the old per-worker
 * Invoice/timesheet model. One invoice may contain many employees/departments.
 */

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
import PDFDocument from 'pdfkit';
import { BlobServiceClient } from '@azure/storage-blob';
import 'dotenv/config';

const C = {
  PRIMARY: '#c22127', SECONDARY: '#a01a1f', LIGHT: '#e2e8f0',
  MUTED: '#718096', TEXT: '#1a202c', WHITE: '#ffffff', BG: '#f7fafc', BORDER: '#cbd5e0',
};

// ─── Storage Upload ──────────────────────────────────────────────
if (!process.env.AZURE_STORAGE_CONNECTION_STRING) {
  throw new Error('AZURE_STORAGE_CONNECTION_STRING is not defined in environment variables');
}
const blobServiceClient = BlobServiceClient.fromConnectionString(process.env.AZURE_STORAGE_CONNECTION_STRING);
const invoicesContainerName = process.env.AZURE_INVOICES_CONTAINER_NAME || 'invoices';

const getInvoicesContainerClient = async () => {
  const containerClient = blobServiceClient.getContainerClient(invoicesContainerName);
  await containerClient.createIfNotExists({ access: 'blob' });
  return containerClient;
};

const uploadPdfToStorage = async (buffer: Buffer, filename: string): Promise<string> => {
  const containerClient = await getInvoicesContainerClient();
  const blockBlobClient = containerClient.getBlockBlobClient(filename);
  await blockBlobClient.upload(buffer, buffer.length, { blobHTTPHeaders: { blobContentType: 'application/pdf' } });
  return blockBlobClient.url;
};

// ─── Data Fetcher ────────────────────────────────────────────────
// ⚠️ Assumes `pdf_url` column exists on ClientInvoice (see schema note below).
// ⚠️ Assumes Organization has `email` and `address` fields — you already
// reference organization.email in postBillingBatch, so this should exist;
// adjust field names if yours differ.
const fetchClientInvoiceData = async (invoiceId: string) => {
  const invoice = await (prisma as any).clientInvoice.findUnique({
    where: { client_invoice_id: invoiceId },
    include: {
      organization: true,
      lines: {
        orderBy: [
          {
            employee_name: "asc"
          }
        ]
      },
      batch: {
        select: {
          batch_number: true,
          batch_type: true
        }
      },
    }
  });
  if (!invoice) throw new Error(`Client invoice ${invoiceId} not found`);

  const toNum = (v: any) => (v == null ? 0 : Number(v));

  return {
    invoice_number: invoice.invoice_number,
    invoice_date: invoice.invoice_date.toISOString().slice(0, 10),
    due_date: invoice.due_date.toISOString().slice(0, 10),
    batch_number: invoice.billing_batch?.batch_number ?? null,
    status: invoice.status,

    bill_to_name: invoice.organization?.name ?? 'Unknown Organization',
    bill_to_email: invoice.organization?.email ?? '',
    bill_to_address: invoice.organization?.address ?? '',

    subtotal: toNum(invoice.subtotal).toFixed(2),
    total_amount: toNum(invoice.total_amount).toFixed(2),

    lines: invoice.lines.map((l: any) => ({
      employee_name: l.employee_name,
      department: l.department ?? '—',
      earning_type: l.earning_type,
      bill_units: toNum(l.bill_units).toFixed(2),
      bill_rate: toNum(l.bill_rate).toFixed(2),
      amount: toNum(l.amount).toFixed(2),
    })),
  };
};

type ClientInvoiceData = Awaited<ReturnType<typeof fetchClientInvoiceData>>;

// ─── PDF Builder ─────────────────────────────────────────────────
const buildClientInvoicePdf = (data: ClientInvoiceData): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    const PT = 72;
    const doc = new PDFDocument({
      size: 'LETTER',
      margins: { top: 43, bottom: 43, left: 47, right: 47 },
      info: { Title: `${data.invoice_number} - ${data.bill_to_name}`, Author: process.env.COMPANY_NAME || 'Payroll' },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const W = doc.page.width;
    const L = doc.page.margins.left;
    const R = doc.page.margins.right;
    const contentW = W - L - R;
    const BOTTOM = doc.page.height - doc.page.margins.bottom;

    const money = (v: string | number) =>
      '$' + parseFloat(String(v)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const drawRow = (x: number, y: number, w: number, h: number, fill: string) => {
      doc.rect(x, y, w, h).fill(fill);
      doc.rect(x, y, w, h).lineWidth(0.4).strokeColor(C.LIGHT).stroke();
    };

    const cell = (
      text: string, x: number, y: number, w: number, h: number,
      opts: { font?: string; size?: number; color?: string; align?: 'left' | 'center' | 'right' } = {}
    ) => {
      const { font = 'Helvetica', size = 8, color = C.TEXT, align = 'left' } = opts;
      const pad = align === 'left' ? 8 : 4;
      doc.font(font).fontSize(size).fillColor(color)
        .text(text, x + pad, y + (h / 2) - (size / 2) + 1, { width: w - pad * 2, align, lineBreak: false });
    };

    const lineColW = [1.9 * PT, 1.2 * PT, 1.2 * PT, 0.9 * PT, 1.0 * PT, 1.0 * PT]; // 518pt total
    const lineHdrs = ['Employee', 'Department', 'Type', 'Units', 'Rate', 'Amount'];
    const rowH = 20;

    const drawLineHeader = (y: number) => {
      doc.rect(L, y, contentW, rowH).fill(C.PRIMARY);
      let cx = L;
      for (let i = 0; i < lineHdrs.length; i++) {
        cell(lineHdrs[i], cx, y, lineColW[i], rowH, { font: 'Helvetica-Bold', color: C.WHITE, align: i >= 3 ? 'right' : 'left' });
        cx += lineColW[i];
      }
      return y + rowH;
    };

    // ── HEADER ──
    let y = doc.page.margins.top;
    doc.font('Helvetica-Bold').fontSize(20).fillColor(C.PRIMARY)
      .text(process.env.COMPANY_NAME || 'SMS Staffing Solutions', L, y, { width: contentW * 0.55, lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(18).fillColor(C.SECONDARY)
      .text('INVOICE', L, y, { width: contentW, align: 'right', lineBreak: false });

    y += 24;
    doc.font('Helvetica').fontSize(8).fillColor(C.MUTED)
      .text(data.invoice_number, L, y, { width: contentW, align: 'right', lineBreak: false });

    y += 14;
    doc.moveTo(L, y).lineTo(W - R, y).lineWidth(2).strokeColor(C.SECONDARY).stroke();

    // ── INFO SECTION (Bill To / Invoice Details) ──
    y += 14;
    const colW = contentW / 2;
    const pad = 10;
    const lineH = 12;
    const infoH = pad + lineH * 4 + pad;
    doc.rect(L, y, contentW, infoH).fill(C.BG);
    doc.moveTo(L + colW, y).lineTo(L + colW, y + infoH).lineWidth(0.5).strokeColor(C.BORDER).stroke();

    let c1y = y + pad;
    doc.font('Helvetica').fontSize(7.5).fillColor(C.MUTED).text('BILL TO', L + pad, c1y, { width: colW - pad * 2, lineBreak: false });
    c1y += lineH;
    doc.font('Helvetica-Bold').fontSize(9).fillColor(C.TEXT).text(data.bill_to_name, L + pad, c1y, { width: colW - pad * 2, lineBreak: false });
    c1y += lineH;
    if (data.bill_to_address) { doc.font('Helvetica').fontSize(8.5).fillColor(C.TEXT).text(data.bill_to_address, L + pad, c1y, { width: colW - pad * 2, lineBreak: false }); c1y += lineH; }
    if (data.bill_to_email) doc.font('Helvetica').fontSize(8.5).fillColor(C.TEXT).text(data.bill_to_email, L + pad, c1y, { width: colW - pad * 2, lineBreak: false });

    let c2y = y + pad;
    const c2x = L + colW + pad;
    doc.font('Helvetica').fontSize(7.5).fillColor(C.MUTED).text('INVOICE DETAILS', c2x, c2y, { width: colW - pad * 2, lineBreak: false });
    c2y += lineH;
    const details: [string, string][] = [
      ['Date', data.invoice_date], ['Due', data.due_date],
      ['Batch', data.batch_number ? `#${data.batch_number}` : '—'],
    ];
    for (const [label, value] of details) {
      doc.font('Helvetica').fontSize(8.5).fillColor(C.TEXT)
        .text(`${label}: `, c2x, c2y, { continued: true, lineBreak: false })
        .font('Helvetica-Bold').text(value, { lineBreak: false });
      c2y += lineH;
    }

    // ── LINE ITEMS (paginated) ──
    y += infoH + 20;
    doc.font('Helvetica-Bold').fontSize(10).fillColor(C.PRIMARY).text('Line Items', L, y);
    y += 16;
    y = drawLineHeader(y);

    for (let ri = 0; ri < data.lines.length; ri++) {
      if (y + rowH > BOTTOM) {
        doc.addPage();
        y = doc.page.margins.top;
        y = drawLineHeader(y);
      }
      const l = data.lines[ri];
      drawRow(L, y, contentW, rowH, ri % 2 === 0 ? C.WHITE : C.BG);
      let cx = L;
      const vals = [l.employee_name, l.department, l.earning_type, l.bill_units, `${money(l.bill_rate)}`, money(l.amount)];
      for (let i = 0; i < vals.length; i++) {
        cell(vals[i], cx, y, lineColW[i], rowH, { align: i >= 3 ? 'right' : 'left' });
        cx += lineColW[i];
      }
      y += rowH;
    }

    // ── TOTALS ──
    if (y + 70 > BOTTOM) { doc.addPage(); y = doc.page.margins.top; }
    y += 12;
    const totals: [string, string][] = [
      ['Subtotal', money(data.subtotal)],
      ['TOTAL DUE', money(data.total_amount)],
    ];
    const labelW = contentW - 1.75 * PT;
    const valW = 1.75 * PT;
    for (let ri = 0; ri < totals.length; ri++) {
      const isTotal = ri === totals.length - 1;
      const fSize = isTotal ? 12 : 9;
      const font = isTotal ? 'Helvetica-Bold' : 'Helvetica';
      const color = isTotal ? C.WHITE : C.TEXT;
      const rH = isTotal ? 32 : 18;
      if (isTotal) { doc.rect(L, y, contentW, rH).fill(C.PRIMARY); y += 6; }
      doc.font(font).fontSize(fSize).fillColor(color).text(totals[ri][0], L, y + 4, { width: labelW, align: 'right', lineBreak: false });
      doc.font(font).fontSize(fSize).fillColor(color).text(totals[ri][1], L + labelW, y + 4, { width: valW - 4, align: 'right', lineBreak: false });
      y += rH;
    }

    // ── FOOTER ──
    y += 20;
    doc.moveTo(L, y).lineTo(W - R, y).lineWidth(0.5).strokeColor(C.LIGHT).stroke();
    y += 8;
    doc.font('Helvetica').fontSize(7).fillColor(C.MUTED)
      .text(`${data.invoice_number} · Thank you for your business.`, L, y, { width: contentW, align: 'center', lineBreak: false });

    doc.end();
  });
};

// ─── Main Export ─────────────────────────────────────────────────
export const generateClientInvoicePdf = async (invoiceId: string): Promise<string> => {
  const data = await fetchClientInvoiceData(invoiceId);
  const filename = `${data.invoice_number.replace(/[^A-Za-z0-9\-]/g, '_')}.pdf`;
  const buffer = await buildClientInvoicePdf(data);
  return await uploadPdfToStorage(buffer, filename);
};