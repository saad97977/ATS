"use strict";
/**
 * invoice.service.ts
 *
 * Generates professional PDF invoices using Python + ReportLab.
 * The PDF is built via a subprocess, saved to /tmp, then uploaded
 * to your storage layer (S3/GCS — stub provided below).
 *
 * Install Python dep: pip3 install reportlab
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateInvoicePdf = void 0;
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
const child_process_1 = require("child_process");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
require("dotenv/config");
// ─── Storage Upload ───────────────────────────────────────────
// Replace this stub with your actual S3 / GCS / Azure logic.
const uploadPdfToStorage = async (localPath, filename) => {
    /*
    // S3 example:
    import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
    const s3 = new S3Client({ region: process.env.AWS_REGION });
    await s3.send(new PutObjectCommand({
      Bucket:      process.env.S3_BUCKET!,
      Key:         `invoices/${filename}`,
      Body:        fs.createReadStream(localPath),
      ContentType: 'application/pdf',
    }));
    return `https://${process.env.S3_BUCKET}.s3.amazonaws.com/invoices/${filename}`;
    */
    // Dev stub: save to local folder and return the URL
    const dir = path.join(process.cwd(), 'generated-invoices');
    if (!fs.existsSync(dir))
        fs.mkdirSync(dir, { recursive: true });
    const dest = path.join(dir, filename);
    fs.copyFileSync(localPath, dest);
    // Return full URL compatible with the Express static middleware
    const baseUrl = process.env.API_URL || 'http://localhost:5000';
    return `${baseUrl}/generated-invoices/${filename}`;
};
// ─── Data Fetcher ─────────────────────────────────────────────
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
// ─── Python PDF Script Builder ────────────────────────────────
const buildPythonScript = (data, outputPath) => `
import json
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
)
from reportlab.lib.enums import TA_RIGHT, TA_CENTER, TA_LEFT

data        = ${JSON.stringify(data)}
output_path = "${outputPath.replace(/\\/g, '/')}"

PRIMARY   = colors.HexColor("#1a365d")
SECONDARY = colors.HexColor("#2b6cb0")
LIGHT     = colors.HexColor("#e2e8f0")
MUTED     = colors.HexColor("#718096")
TEXT      = colors.HexColor("#1a202c")
WHITE     = colors.white
GREEN     = colors.HexColor("#276749")

doc   = SimpleDocTemplate(output_path, pagesize=letter,
          rightMargin=0.65*inch, leftMargin=0.65*inch,
          topMargin=0.6*inch,  bottomMargin=0.6*inch,
          title=data["invoice_number"] + " - " + data["organization_name"],
          author=data["organization_name"])
sty   = getSampleStyleSheet()
story = []

def s(base, **kw):
    c = sty[base].clone(base + "_c")
    for k,v in kw.items(): setattr(c, k, v)
    return c

H1   = s("Normal", fontSize=22, textColor=PRIMARY, leading=26, fontName="Helvetica-Bold")
H2   = s("Normal", fontSize=10, textColor=PRIMARY, leading=13, fontName="Helvetica-Bold")
BODY = s("Normal", fontSize=8.5, textColor=TEXT,   leading=12)
BODYB= s("Normal", fontSize=8.5, textColor=TEXT,   leading=12, fontName="Helvetica-Bold")
SM   = s("Normal", fontSize=7.5, textColor=MUTED,  leading=11)
RGT  = s("Normal", fontSize=8.5, textColor=TEXT,   leading=12, alignment=TA_RIGHT)
RGTB = s("Normal", fontSize=8.5, textColor=TEXT,   leading=12, alignment=TA_RIGHT, fontName="Helvetica-Bold")

# ── HEADER ────────────────────────────────────────────────────
hdr = Table([[
    Paragraph(data["organization_name"], H1),
    Paragraph(
        '<font color="#2b6cb0" size="18">INVOICE</font><br/>'
        '<font size="8" color="#718096">' + data["invoice_number"] + '</font>',
        s("Normal", fontSize=18, textColor=PRIMARY, leading=22,
          fontName="Helvetica-Bold", alignment=TA_RIGHT)
    )
]], colWidths=[3.9*inch, 3.3*inch])
hdr.setStyle(TableStyle([("VALIGN",(0,0),(-1,-1),"MIDDLE")]))
story += [hdr, Spacer(1,4), HRFlowable(width="100%", thickness=2, color=SECONDARY), Spacer(1,12)]

# ── BILL TO / WORKER / DETAILS ────────────────────────────────
info = Table([[
    [Paragraph("BILL TO", SM),
     Paragraph(data["organization_name"], BODYB),
     Paragraph(data["organization_website"] or "", BODY)],
    [Paragraph("WORKER", SM),
     Paragraph(data["worker_name"],  BODYB),
     Paragraph(data["worker_email"], BODY),
     Paragraph(data["worker_phone"], BODY)],
    [Paragraph("INVOICE DETAILS", SM),
     Paragraph("Date: <b>" + data["invoice_date"] + "</b>", BODY),
     Paragraph("Due:  <b>" + data["due_date"]     + "</b>", BODY),
     Paragraph("Job:  <b>" + data["job_title"]    + "</b>", BODY),
     Paragraph("Week: <b>" + data["week_start"]   + " to " + data["week_end"] + "</b>", BODY)],
]], colWidths=[2.4*inch, 2.4*inch, 2.4*inch])
info.setStyle(TableStyle([
    ("VALIGN",(0,0),(-1,-1),"TOP"),
    ("BACKGROUND",(0,0),(-1,-1),colors.HexColor("#f7fafc")),
    ("TOPPADDING",(0,0),(-1,-1),10),
    ("BOTTOMPADDING",(0,0),(-1,-1),10),
    ("LEFTPADDING",(0,0),(-1,-1),10),
    ("RIGHTPADDING",(0,0),(-1,-1),10),
    ("LINEAFTER",(0,0),(1,-1),0.5,colors.HexColor("#cbd5e0")),
]))
story += [info, Spacer(1,20)]

# ── DAILY TIME ENTRIES ────────────────────────────────────────
story.append(Paragraph("Daily Time Entries", H2))
story.append(Spacer(1,6))
erows = [["Date","Type","Regular Hrs","OT Hrs","Total Hrs"]]
for e in data["daily_entries"]:
    erows.append([e["date"], e["type"], e["regular"], e["ot"], e["total"]])

et = Table(erows, colWidths=[1.7*inch,1.4*inch,1.4*inch,1.3*inch,1.4*inch])
et.setStyle(TableStyle([
    ("BACKGROUND",   (0,0),(-1,0), PRIMARY),
    ("TEXTCOLOR",    (0,0),(-1,0), WHITE),
    ("FONTNAME",     (0,0),(-1,0), "Helvetica-Bold"),
    ("FONTSIZE",     (0,0),(-1,-1), 8),
    ("ALIGN",        (0,0),(-1,-1), "CENTER"),
    ("VALIGN",       (0,0),(-1,-1), "MIDDLE"),
    ("ROWBACKGROUNDS",(0,1),(-1,-1),[WHITE, colors.HexColor("#f7fafc")]),
    ("GRID",         (0,0),(-1,-1), 0.4, LIGHT),
    ("TOPPADDING",   (0,0),(-1,-1), 6),
    ("BOTTOMPADDING",(0,0),(-1,-1), 6),
]))
story += [et, Spacer(1,20)]

# ── BILLING SUMMARY ───────────────────────────────────────────
story.append(Paragraph("Billing Summary", H2))
story.append(Spacer(1,6))

def m(v): return "$" + "{:,.2f}".format(float(v))
def h(v): return "{:.2f} hrs".format(float(v))

brows = [["Description","Hours","Rate","Amount"],
         ["Regular Hours", h(data["regular_hours"]),
          m(data["bill_rate"])+"/hr",
          m(float(data["regular_hours"])*float(data["bill_rate"]))]]
if float(data["ot_hours"]) > 0:
    brows.append(["Overtime Hours", h(data["ot_hours"]),
                  m(data["ot_bill_rate"])+"/hr",
                  m(float(data["ot_hours"])*float(data["ot_bill_rate"]))])

bt = Table(brows, colWidths=[2.9*inch,1.3*inch,1.5*inch,1.5*inch])
bt.setStyle(TableStyle([
    ("BACKGROUND",   (0,0),(-1,0), PRIMARY),
    ("TEXTCOLOR",    (0,0),(-1,0), WHITE),
    ("FONTNAME",     (0,0),(-1,0), "Helvetica-Bold"),
    ("FONTSIZE",     (0,0),(-1,-1), 8),
    ("ALIGN",        (1,0),(-1,-1), "RIGHT"),
    ("ALIGN",        (0,0),(0,-1), "LEFT"),
    ("VALIGN",       (0,0),(-1,-1), "MIDDLE"),
    ("ROWBACKGROUNDS",(0,1),(-1,-1),[WHITE, colors.HexColor("#f7fafc")]),
    ("GRID",         (0,0),(-1,-1), 0.4, LIGHT),
    ("TOPPADDING",   (0,0),(-1,-1), 7),
    ("BOTTOMPADDING",(0,0),(-1,-1), 7),
    ("LEFTPADDING",  (0,0),(0,-1), 10),
]))
story += [bt, Spacer(1,8)]

# ── TOTALS ────────────────────────────────────────────────────
tax_pct = round(float(data["tax_rate"])*100, 2)
trows = [
    ["Subtotal",               m(data["subtotal"])],
    ["Tax (" + str(tax_pct) + "%)",  m(data["tax_amount"])],
    ["", ""],
    ["TOTAL DUE",              m(data["total_amount"])],
]
tt = Table(trows, colWidths=[5.45*inch,1.75*inch])
tt.setStyle(TableStyle([
    ("ALIGN",        (0,0),(-1,-1),"RIGHT"),
    ("FONTSIZE",     (0,0),(-1,-1), 9),
    ("TOPPADDING",   (0,0),(-1,-1), 4),
    ("BOTTOMPADDING",(0,0),(-1,-1), 4),
    ("BACKGROUND",   (0,3),(-1,3), PRIMARY),
    ("TEXTCOLOR",    (0,3),(-1,3), WHITE),
    ("FONTNAME",     (0,3),(-1,3), "Helvetica-Bold"),
    ("FONTSIZE",     (0,3),(-1,3), 12),
    ("TOPPADDING",   (0,3),(-1,3), 10),
    ("BOTTOMPADDING",(0,3),(-1,3), 10),
]))
story += [tt, Spacer(1,28)]

# ── FOOTER ────────────────────────────────────────────────────
story.append(HRFlowable(width="100%", thickness=0.5, color=LIGHT))
story.append(Spacer(1,6))
story.append(Paragraph(
    "Generated by ATS Billing System  ·  " + data["invoice_number"] +
    "  ·  Thank you for your business.",
    s("Normal", fontSize=7, textColor=MUTED, alignment=TA_CENTER)
))

doc.build(story)
print("OK:" + output_path)
`;
// ─── Main Export ──────────────────────────────────────────────
/**
 * Generate a PDF for the given invoiceId and return the storage URL.
 * Called async after approval, or synchronously on /download.
 */
const generateInvoicePdf = async (invoiceId) => {
    const data = await fetchInvoiceData(invoiceId);
    const filename = `${data.invoice_number.replace(/[^A-Za-z0-9\-]/g, '_')}.pdf`;
    const tmpDir = os.tmpdir();
    const pdfPath = path.join(tmpDir, filename);
    const pyPath = path.join(tmpDir, `inv_${invoiceId}.py`);
    const pythonCmd = process.env.PYTHON_CMD || process.env.PYTHON_BIN || 'python3';
    try {
        if (!fs.existsSync(tmpDir))
            fs.mkdirSync(tmpDir, { recursive: true });
        fs.writeFileSync(pyPath, buildPythonScript(data, pdfPath));
        let out = '';
        try {
            out = (0, child_process_1.execSync)(`${pythonCmd} "${pyPath}"`, { timeout: 30000 }).toString().trim();
        }
        catch (err) {
            // 9009 = Windows (command not found), 127 = *nix (command not found)
            if (err?.status !== 9009 && err?.status !== 127)
                throw err;
            out = (0, child_process_1.execSync)(`python "${pyPath}"`, { timeout: 30000 }).toString().trim();
        }
        if (!out.startsWith('OK:'))
            throw new Error(`PDF script error: ${out}`);
        return await uploadPdfToStorage(pdfPath, filename);
    }
    finally {
        if (fs.existsSync(pyPath))
            fs.unlinkSync(pyPath);
        if (fs.existsSync(pdfPath))
            fs.unlinkSync(pdfPath);
    }
};
exports.generateInvoicePdf = generateInvoicePdf;
//# sourceMappingURL=invoiceService.js.map