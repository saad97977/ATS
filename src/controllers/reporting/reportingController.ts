import prisma from '../../prisma.config';
import { Request, Response } from "express";
import PDFDocument from "pdfkit"; // npm install pdfkit --save
import { sendSuccess, sendError } from "../../utils/response";

// ═════════════════════════════════════════════════════════════════════════
// REPORTING & YEAR-END TAX DOCUMENTS CONTROLLER
// Covers: Module 11 (Year-End Tax Documents) + Module 12 (Reporting & Analytics)
// + the "priority" Avionte-parity reports (New Hire, OSHA, Federal EEO,
//   Accrued Hours, Active Assignment, Deduction Submittal, Employee
//   Deduction/Contribution) supplied as reference sample sheets.
//
// DESIGN NOTES (read before extending):
// - This is a pure READ + GENERATE module. Nothing here writes business
//   data or alters the schema. Reports are produced on demand and streamed
//   back as CSV, PDF, or JSON (?format=csv|pdf|json, default csv).
// - A handful of items in the source requirements have no matching table
//   in the current schema (OSHA incident tracking, Veteran Status,
//   a distinct legacy "Employee ID" separate from `employee_number`,
//   applicant middle name, and a first-class "tax document consent"
//   record). Each of those is called out inline with a NOTE comment and
//   handled with the closest safe, non-breaking approximation so nothing
//   here silently invents data. Search this file for "NOTE:" to find them.
// - Money fields come back from Prisma as Decimal; they are coerced with
//   Number(...) before arithmetic and re-formatted with .toFixed(2) for
//   display, which keeps CSV/PDF output stable regardless of driver.
// ═════════════════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────────────────
// SHARED TYPES
// ─────────────────────────────────────────────────────────────────────────

type ExportFormat = "csv" | "pdf" | "json";

interface ReportColumn {
  key: string;
  label: string;
}

// ─────────────────────────────────────────────────────────────────────────
// GENERIC EXPORT HELPERS (CSV / PDF / JSON)
// ─────────────────────────────────────────────────────────────────────────

function getFormat(req: Request): ExportFormat {
  const f = ((req.query.format as string) || "csv").toLowerCase();
  return (["csv", "pdf", "json"].includes(f) ? f : "csv") as ExportFormat;
}

function csvEscape(val: any): string {
  if (val === null || val === undefined) return "";
  const s = val instanceof Date ? val.toISOString().slice(0, 10) : String(val);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCSV(rows: Record<string, any>[], columns: ReportColumn[]): string {
  const header = columns.map((c) => csvEscape(c.label)).join(",");
  const lines = rows.map((r) => columns.map((c) => csvEscape(r[c.key])).join(","));
  return [header, ...lines].join("\n");
}

function sendCSV(res: Response, filename: string, rows: any[], columns: ReportColumn[]) {
  const csv = toCSV(rows, columns);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}.csv"`);
  return res.send(csv);
}

function sendPDFTable(
  res: Response,
  filename: string,
  title: string,
  rows: any[],
  columns: ReportColumn[],
  meta?: Record<string, string>
) {
  const landscape = columns.length > 6;
  const doc = new PDFDocument({ margin: 30, size: "A4", layout: landscape ? "landscape" : "portrait" });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}.pdf"`);
  doc.pipe(res);

  doc.fontSize(16).font("Helvetica-Bold").text(title, { align: "center" });
  doc.moveDown(0.4);

  if (meta) {
    doc.fontSize(8.5).font("Helvetica").fillColor("#555555");
    doc.text(Object.entries(meta).map(([k, v]) => `${k}: ${v}`).join("    |    "), { align: "center" });
    doc.fillColor("black");
  }
  doc.moveDown(0.8);

  const startX = doc.page.margins.left;
  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const colWidth = pageWidth / columns.length;
  let y = doc.y;

  const drawRow = (values: string[], isHeader = false) => {
    if (y > doc.page.height - doc.page.margins.bottom - 20) {
      doc.addPage();
      y = doc.page.margins.top;
    }
    doc.fontSize(isHeader ? 8 : 7.5).font(isHeader ? "Helvetica-Bold" : "Helvetica");
    values.forEach((v, i) => {
      doc.text(v ?? "", startX + i * colWidth, y, { width: colWidth - 4, ellipsis: true });
    });
    y += 14;
  };

  drawRow(columns.map((c) => c.label), true);
  doc.moveTo(startX, y).lineTo(startX + pageWidth, y).strokeColor("#999999").stroke();
  y += 4;

  if (!rows.length) {
    doc.fontSize(9).font("Helvetica-Oblique").text("No records match the selected filters.", startX, y);
  }

  rows.forEach((r) => {
    drawRow(
      columns.map((c) => {
        const val = r[c.key];
        if (val instanceof Date) return val.toISOString().slice(0, 10);
        return val === null || val === undefined ? "" : String(val);
      })
    );
  });

  doc.end();
}

/** Single dispatcher used by nearly every report handler below. */
function respondWithReport(
  req: Request,
  res: Response,
  opts: { filename: string; title: string; rows: any[]; columns: ReportColumn[]; meta?: Record<string, string> }
) {
  const format = getFormat(req);
  if (format === "json") return sendSuccess(res, { count: opts.rows.length, rows: opts.rows });
  if (format === "pdf") return sendPDFTable(res, opts.filename, opts.title, opts.rows, opts.columns, opts.meta);
  return sendCSV(res, opts.filename, opts.rows, opts.columns);
}

// ─────────────────────────────────────────────────────────────────────────
// SHARED QUERY / FORMAT HELPERS
// ─────────────────────────────────────────────────────────────────────────

/** Generic inclusive date-range parser: ?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD */
function parseDateFilter(req: Request): { gte?: Date; lte?: Date } | undefined {
  const start = req.query.startDate as string | undefined;
  const end = req.query.endDate as string | undefined;
  if (!start && !end) return undefined;
  const range: { gte?: Date; lte?: Date } = {};
  if (start) range.gte = new Date(start);
  if (end) range.lte = new Date(`${end}T23:59:59.999Z`);
  return range;
}

function parseCSVParam(raw?: string): string[] | undefined {
  if (!raw) return undefined;
  const arr = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return arr.length ? arr : undefined;
}

function num(v: any): number {
  return v === null || v === undefined ? 0 : Number(v);
}

function money(v: any): string {
  return num(v).toFixed(2);
}

function startOfMonth(): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

/**
 * NOTE: ssn_encrypted is stored AES-256-CBC encrypted (see ApplicantDemographic).
 * This module never displays a raw SSN. If a project-wide decrypt utility
 * exists (utils/encryption.ts), it is used to recover the last 4 digits only;
 * otherwise it degrades gracefully instead of throwing.
 */
function maskSSN(encrypted?: string | null): string {
  if (!encrypted) return "";
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const enc = require("../../utils/encryption");
    if (typeof enc.decrypt === "function") {
      const plain: string = enc.decrypt(encrypted);
      return plain && plain.length >= 4 ? `XXX-XX-${plain.slice(-4)}` : "XXX-XX-XXXX";
    }
  } catch {
    /* fall through to safe default below */
  }
  return "ON FILE (ENCRYPTED)";
}

/** Best-effort email send that never breaks the controller if the shared
 *  email service doesn't yet expose a generic sender. Swap for a direct
 *  import once services/emailService.ts adds `sendGenericEmail`. */
async function sendEmailSafely(payload: {
  to: string;
  subject: string;
  html: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const emailService = require("../../services/emailService");
    if (typeof emailService.sendGenericEmail === "function") {
      return await emailService.sendGenericEmail(payload);
    }
    console.warn(`[reportingController] sendGenericEmail not implemented — would have emailed ${payload.to}: "${payload.subject}"`);
    return { success: false, error: "sendGenericEmail not implemented in emailService" };
  } catch (err: any) {
    console.error("[reportingController] email send failed", err);
    return { success: false, error: err.message };
  }
}

/**
 * Approximate mapping of internal JobCategory enum values to the
 * standard EEO-1 nine job categories. Align with counsel/compliance
 * before filing — this is a starting point, not a certified mapping.
 */
const EEO_JOB_CATEGORY_MAP: Record<string, string> = {
  EXECUTIVE: "Executive/Senior Level Officials and Managers",
  MANAGEMENT: "First/Mid-Level Officials and Managers",
  SUPERVISORY: "First/Mid-Level Officials and Managers",
  HUMAN_RESOURCES: "Professionals",
  ACCOUNTING: "Professionals",
  ENGINEERING: "Professionals",
  SOFTWARE_OS: "Professionals",
  MARKETING: "Professionals",
  QUALITY_CONTROL: "Technicians",
  TECHNICAL: "Technicians",
  FIELD_TECHNICIAN: "Technicians",
  SALES: "Sales Workers",
  CLIENT_RELATIONS: "Sales Workers",
  ADMIN: "Administrative Support Workers",
  CLERICAL: "Administrative Support Workers",
  BILINGUAL_CSR: "Administrative Support Workers",
  LANGUAGE: "Administrative Support Workers",
  WELDING: "Craft Workers",
  MACHINE_OPERATOR: "Craft Workers",
  CONSTRUCTION: "Craft Workers",
  PRODUCTION: "Operatives",
  SEMICONDUCTOR: "Operatives",
  INDUSTRIAL: "Operatives",
  FORKLIFT: "Operatives",
  TRANSPORTATION: "Operatives",
  WAREHOUSE: "Laborers and Helpers",
  GENERAL_LABOR: "Laborers and Helpers",
  FOOD_SERVICE: "Service Workers",
  HOTEL_FOOD_BEVERAGE: "Service Workers",
  INTERNSHIP: "Professionals",
  SPECIFIC: "Other",
};

// ═════════════════════════════════════════════════════════════════════════
// MODULE 11 — YEAR-END TAX DOCUMENTS
// ═════════════════════════════════════════════════════════════════════════

// ── W-2 FORMS ────────────────────────────────────────────────────────────

/**
 * GET /api/reports/w2/employees?taxYear=2025
 * Employee Portal / print-batch source list: every applicant with a posted
 * paycheck in the given tax year, with YTD wage & tax totals.
 */
export async function listW2Employees(req: Request, res: Response) {
  try {
    const taxYear = Number(req.query.taxYear ?? new Date().getFullYear());
    const yearStart = new Date(`${taxYear}-01-01T00:00:00.000Z`);
    const yearEnd = new Date(`${taxYear}-12-31T23:59:59.999Z`);

    const checks = await prisma.payrollCheck.findMany({
      where: {
        applicant_id: { not: null },
        batch: { status: "POSTED", check_date: { gte: yearStart, lte: yearEnd } },
      },
      select: {
        applicant_id: true,
        gross_pay: true,
        federal_tax: true,
        state_tax: true,
        local_tax: true,
        employee_ss: true,
        employee_medicare: true,
        net_pay: true,
      },
    });

    const totalsByApplicant = new Map<string, any>();
    for (const c of checks) {
      const key = c.applicant_id as string;
      const acc =
        totalsByApplicant.get(key) ??
        { gross: 0, federal: 0, state: 0, local: 0, ss: 0, medicare: 0, net: 0, checkCount: 0 };
      acc.gross += num(c.gross_pay);
      acc.federal += num(c.federal_tax);
      acc.state += num(c.state_tax);
      acc.local += num(c.local_tax);
      acc.ss += num(c.employee_ss);
      acc.medicare += num(c.employee_medicare);
      acc.net += num(c.net_pay);
      acc.checkCount += 1;
      totalsByApplicant.set(key, acc);
    }

    const applicantIds = [...totalsByApplicant.keys()];
    const applicants = applicantIds.length
      ? await prisma.applicant.findMany({
          where: { applicant_id: { in: applicantIds } },
          select: {
            applicant_id: true,
            full_name: true,
            office_division: true,
            office_name: true,
            contact: { select: { address: true, city: true, state: true, zip: true } },
            demographic: { select: { ssn_encrypted: true, employee_number: true } },
          },
        })
      : [];

    const rows = applicants.map((a) => {
      const t = totalsByApplicant.get(a.applicant_id);
      return {
        applicant_id: a.applicant_id,
        employee_name: a.full_name,
        ssn: maskSSN(a.demographic?.ssn_encrypted),
        employee_number: a.demographic?.employee_number ?? "",
        branch: a.office_division ?? a.office_name ?? "",
        address: a.contact?.address ?? "",
        city: a.contact?.city ?? "",
        state: a.contact?.state ?? "",
        zip: a.contact?.zip ?? "",
        gross_wages: money(t.gross),
        federal_tax_withheld: money(t.federal),
        state_tax_withheld: money(t.state),
        local_tax_withheld: money(t.local),
        social_security_withheld: money(t.ss),
        medicare_withheld: money(t.medicare),
        net_pay: money(t.net),
        pay_periods: t.checkCount,
      };
    });

    return respondWithReport(req, res, {
      filename: `w2-employees-${taxYear}`,
      title: `W-2 Employee Summary — Tax Year ${taxYear}`,
      rows,
      columns: [
        { key: "employee_name", label: "Employee Name" },
        { key: "ssn", label: "SSN" },
        { key: "employee_number", label: "Employee #" },
        { key: "branch", label: "Branch" },
        { key: "address", label: "Address" },
        { key: "city", label: "City" },
        { key: "state", label: "State" },
        { key: "zip", label: "Zip" },
        { key: "gross_wages", label: "Gross Wages" },
        { key: "federal_tax_withheld", label: "Federal Tax W/H" },
        { key: "state_tax_withheld", label: "State Tax W/H" },
        { key: "local_tax_withheld", label: "Local Tax W/H" },
        { key: "social_security_withheld", label: "SS W/H" },
        { key: "medicare_withheld", label: "Medicare W/H" },
        { key: "net_pay", label: "Net Pay" },
      ],
      meta: { "Tax Year": String(taxYear), "Employee Count": String(rows.length) },
    });
  } catch (err) {
    console.error(err);
    return sendError(res, "listW2Employees failed", 500);
  }
}

/**
 * GET /api/reports/w2/:applicantId/:taxYear/pdf
 * Single-employee W-2 summary PDF (Employee Portal "view/print" action).
 */
export async function generateW2PDF(req: Request, res: Response) {
  try {
    const { applicantId } = req.params;
    const taxYear = Number(req.params.taxYear ?? new Date().getFullYear());
    const yearStart = new Date(`${taxYear}-01-01T00:00:00.000Z`);
    const yearEnd = new Date(`${taxYear}-12-31T23:59:59.999Z`);

    const applicant = await prisma.applicant.findUnique({
      where: { applicant_id: applicantId },
      select: {
        full_name: true,
        contact: { select: { address: true, city: true, state: true, zip: true } },
        demographic: { select: { ssn_encrypted: true, employee_number: true } },
      },
    });
    if (!applicant) return sendError(res, "Applicant not found", 404);

    const checks = await prisma.payrollCheck.findMany({
      where: { applicant_id: applicantId, batch: { status: "POSTED", check_date: { gte: yearStart, lte: yearEnd } } },
      select: { gross_pay: true, federal_tax: true, state_tax: true, local_tax: true, employee_ss: true, employee_medicare: true },
    });

    const totals = checks.reduce(
      (acc, c) => ({
        gross: acc.gross + num(c.gross_pay),
        federal: acc.federal + num(c.federal_tax),
        state: acc.state + num(c.state_tax),
        local: acc.local + num(c.local_tax),
        ss: acc.ss + num(c.employee_ss),
        medicare: acc.medicare + num(c.employee_medicare),
      }),
      { gross: 0, federal: 0, state: 0, local: 0, ss: 0, medicare: 0 }
    );

    const doc = new PDFDocument({ margin: 40, size: "A4" });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="W2-${taxYear}-${applicantId}.pdf"`);
    doc.pipe(res);

    doc.fontSize(14).font("Helvetica-Bold").text(`Form W-2 — Wage and Tax Statement (${taxYear})`, { align: "center" });
    doc.moveDown(0.4);
    doc
      .fontSize(8.5)
      .font("Helvetica-Oblique")
      .text(
        "System-generated summary for electronic delivery. Official Copy A/B/C/1/2 issuance must follow current IRS formatting requirements.",
        { align: "center" }
      );
    doc.moveDown(1.2);

    const field = (label: string, value: string) => {
      doc.font("Helvetica-Bold").fontSize(9).text(label);
      doc.font("Helvetica").fontSize(11).text(value || "—");
      doc.moveDown(0.5);
    };

    field("Employee Name", applicant.full_name);
    field("SSN", maskSSN(applicant.demographic?.ssn_encrypted));
    field("Employee ID", applicant.demographic?.employee_number ?? "");
    field(
      "Address",
      [applicant.contact?.address, applicant.contact?.city, applicant.contact?.state, applicant.contact?.zip]
        .filter(Boolean)
        .join(", ")
    );

    doc.moveDown(0.3);
    doc.font("Helvetica-Bold").fontSize(11).text("Wage & Tax Detail");
    doc.moveDown(0.3);
    [
      ["Box 1 — Wages, tips, other compensation", totals.gross],
      ["Box 2 — Federal income tax withheld", totals.federal],
      ["Box 4 — Social security tax withheld", totals.ss],
      ["Box 6 — Medicare tax withheld", totals.medicare],
      ["Box 17 — State income tax", totals.state],
      ["Box 19 — Local income tax", totals.local],
    ].forEach(([label, val]) => {
      doc.font("Helvetica").fontSize(10).text(`${label}: $${money(val)}`);
    });

    doc.end();
  } catch (err) {
    console.error(err);
    return sendError(res, "generateW2PDF failed", 500);
  }
}

/**
 * GET /api/reports/w2/print-batch?taxYear=2025&applicantIds=a,b,c
 * Bulk "Print Option" — one PDF, one page per employee.
 */
export async function printW2Batch(req: Request, res: Response) {
  try {
    const taxYear = Number(req.query.taxYear ?? new Date().getFullYear());
    const idFilter = parseCSVParam(req.query.applicantIds as string);
    const yearStart = new Date(`${taxYear}-01-01T00:00:00.000Z`);
    const yearEnd = new Date(`${taxYear}-12-31T23:59:59.999Z`);

    const checks = await prisma.payrollCheck.findMany({
      where: {
        applicant_id: idFilter ? { in: idFilter } : { not: null },
        batch: { status: "POSTED", check_date: { gte: yearStart, lte: yearEnd } },
      },
      select: {
        applicant_id: true,
        gross_pay: true,
        federal_tax: true,
        state_tax: true,
        local_tax: true,
        employee_ss: true,
        employee_medicare: true,
      },
    });

    const totals = new Map<string, any>();
    for (const c of checks) {
      const key = c.applicant_id as string;
      const acc = totals.get(key) ?? { gross: 0, federal: 0, state: 0, local: 0, ss: 0, medicare: 0 };
      acc.gross += num(c.gross_pay);
      acc.federal += num(c.federal_tax);
      acc.state += num(c.state_tax);
      acc.local += num(c.local_tax);
      acc.ss += num(c.employee_ss);
      acc.medicare += num(c.employee_medicare);
      totals.set(key, acc);
    }

    const applicants = totals.size
      ? await prisma.applicant.findMany({
          where: { applicant_id: { in: [...totals.keys()] } },
          select: {
            applicant_id: true,
            full_name: true,
            contact: { select: { address: true, city: true, state: true, zip: true } },
            demographic: { select: { ssn_encrypted: true, employee_number: true } },
          },
        })
      : [];

    const doc = new PDFDocument({ margin: 40, size: "A4" });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="W2-batch-${taxYear}.pdf"`);
    doc.pipe(res);

    applicants.forEach((a, idx) => {
      if (idx > 0) doc.addPage();
      const t = totals.get(a.applicant_id);
      doc.fontSize(14).font("Helvetica-Bold").text(`Form W-2 (${taxYear}) — ${a.full_name}`, { align: "center" });
      doc.moveDown(1);
      doc.fontSize(10).font("Helvetica");
      doc.text(`SSN: ${maskSSN(a.demographic?.ssn_encrypted)}`);
      doc.text(`Employee ID: ${a.demographic?.employee_number ?? ""}`);
      doc.text(
        `Address: ${[a.contact?.address, a.contact?.city, a.contact?.state, a.contact?.zip].filter(Boolean).join(", ")}`
      );
      doc.moveDown(0.5);
      doc.text(`Box 1 — Wages: $${money(t.gross)}`);
      doc.text(`Box 2 — Federal tax withheld: $${money(t.federal)}`);
      doc.text(`Box 4 — Social security withheld: $${money(t.ss)}`);
      doc.text(`Box 6 — Medicare withheld: $${money(t.medicare)}`);
      doc.text(`Box 17 — State tax: $${money(t.state)}`);
      doc.text(`Box 19 — Local tax: $${money(t.local)}`);
    });

    if (!applicants.length) {
      doc.fontSize(11).text("No W-2 eligible employees found for the selected tax year / filter.");
    }

    doc.end();
  } catch (err) {
    console.error(err);
    return sendError(res, "printW2Batch failed", 500);
  }
}

// ── 1099 FORMS ───────────────────────────────────────────────────────────

/**
 * GET /api/reports/1099/contractors?taxYear=2025
 * Contractor Portal source list: 1099 (CONTRACTOR_1099) assignments with
 * posted pay in the given tax year.
 */
export async function list1099Contractors(req: Request, res: Response) {
  try {
    const taxYear = Number(req.query.taxYear ?? new Date().getFullYear());
    const yearStart = new Date(`${taxYear}-01-01T00:00:00.000Z`);
    const yearEnd = new Date(`${taxYear}-12-31T23:59:59.999Z`);

    const checks = await prisma.payrollCheck.findMany({
      where: {
        applicant_id: { not: null },
        batch: { status: "POSTED", check_date: { gte: yearStart, lte: yearEnd } },
        applicant: {
          applications: { some: { assignment: { employment_type: "CONTRACTOR_1099" } } },
        },
      },
      select: { applicant_id: true, gross_pay: true },
    });

    const totals = new Map<string, number>();
    for (const c of checks) {
      const key = c.applicant_id as string;
      totals.set(key, (totals.get(key) ?? 0) + num(c.gross_pay));
    }

    const applicants = totals.size
      ? await prisma.applicant.findMany({
          where: { applicant_id: { in: [...totals.keys()] } },
          select: {
            applicant_id: true,
            full_name: true,
            office_division: true,
            contact: { select: { email: true, address: true, city: true, state: true, zip: true } },
            demographic: { select: { ssn_encrypted: true, employee_number: true } },
          },
        })
      : [];

    const rows = applicants.map((a) => ({
      applicant_id: a.applicant_id,
      contractor_name: a.full_name,
      tin_ssn: maskSSN(a.demographic?.ssn_encrypted),
      contractor_id: a.demographic?.employee_number ?? "",
      branch: a.office_division ?? "",
      email: a.contact?.email ?? "",
      address: a.contact?.address ?? "",
      city: a.contact?.city ?? "",
      state: a.contact?.state ?? "",
      zip: a.contact?.zip ?? "",
      nonemployee_compensation: money(totals.get(a.applicant_id)),
    }));

    return respondWithReport(req, res, {
      filename: `1099-contractors-${taxYear}`,
      title: `1099 Contractor Summary — Tax Year ${taxYear}`,
      rows,
      columns: [
        { key: "contractor_name", label: "Contractor" },
        { key: "tin_ssn", label: "TIN / SSN" },
        { key: "contractor_id", label: "Contractor ID" },
        { key: "branch", label: "Branch" },
        { key: "email", label: "Email" },
        { key: "address", label: "Address" },
        { key: "city", label: "City" },
        { key: "state", label: "State" },
        { key: "zip", label: "Zip" },
        { key: "nonemployee_compensation", label: "Box 1 — Nonemployee Comp." },
      ],
      meta: { "Tax Year": String(taxYear), "Contractor Count": String(rows.length) },
    });
  } catch (err) {
    console.error(err);
    return sendError(res, "list1099Contractors failed", 500);
  }
}

/** GET /api/reports/1099/:applicantId/:taxYear/pdf */
export async function generate1099PDF(req: Request, res: Response) {
  try {
    const { applicantId } = req.params;
    const taxYear = Number(req.params.taxYear ?? new Date().getFullYear());
    const yearStart = new Date(`${taxYear}-01-01T00:00:00.000Z`);
    const yearEnd = new Date(`${taxYear}-12-31T23:59:59.999Z`);

    const applicant = await prisma.applicant.findUnique({
      where: { applicant_id: applicantId },
      select: {
        full_name: true,
        contact: { select: { address: true, city: true, state: true, zip: true } },
        demographic: { select: { ssn_encrypted: true, employee_number: true } },
      },
    });
    if (!applicant) return sendError(res, "Applicant not found", 404);

    const gross = await prisma.payrollCheck.aggregate({
      _sum: { gross_pay: true },
      where: { applicant_id: applicantId, batch: { status: "POSTED", check_date: { gte: yearStart, lte: yearEnd } } },
    });

    const doc = new PDFDocument({ margin: 40, size: "A4" });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="1099-${taxYear}-${applicantId}.pdf"`);
    doc.pipe(res);

    doc.fontSize(14).font("Helvetica-Bold").text(`Form 1099-NEC (${taxYear})`, { align: "center" });
    doc.moveDown(0.4);
    doc
      .fontSize(8.5)
      .font("Helvetica-Oblique")
      .text("System-generated summary for electronic delivery. Official filing copy must follow current IRS formatting requirements.", {
        align: "center",
      });
    doc.moveDown(1.2);

    doc.font("Helvetica-Bold").fontSize(9).text("Recipient");
    doc.font("Helvetica").fontSize(11).text(applicant.full_name);
    doc.moveDown(0.4);
    doc.font("Helvetica-Bold").fontSize(9).text("TIN / SSN");
    doc.font("Helvetica").fontSize(11).text(maskSSN(applicant.demographic?.ssn_encrypted));
    doc.moveDown(0.4);
    doc.font("Helvetica-Bold").fontSize(9).text("Address");
    doc
      .font("Helvetica")
      .fontSize(11)
      .text([applicant.contact?.address, applicant.contact?.city, applicant.contact?.state, applicant.contact?.zip].filter(Boolean).join(", "));
    doc.moveDown(0.8);
    doc.font("Helvetica-Bold").fontSize(11).text(`Box 1 — Nonemployee compensation: $${money(gross._sum.gross_pay)}`);

    doc.end();
  } catch (err) {
    console.error(err);
    return sendError(res, "generate1099PDF failed", 500);
  }
}

// ── SHARED: NOTIFICATIONS + ELECTRONIC CONSENT (W-2 and 1099) ───────────

/**
 * POST /api/reports/tax-documents/:applicantId/notify
 * body: { docType: "W2" | "1099", taxYear }
 * Email Notification + Contractor/Employee Portal "new document" ping.
 */
export async function notifyTaxDocumentAvailable(req: Request, res: Response) {
  try {
    const { applicantId } = req.params;
    const docType = (req.body.docType as string) === "1099" ? "1099" : "W2";
    const taxYear = Number(req.body.taxYear ?? new Date().getFullYear());

    const applicant = await prisma.applicant.findUnique({
      where: { applicant_id: applicantId },
      select: { full_name: true, contact: { select: { email: true } } },
    });
    if (!applicant?.contact?.email) return sendError(res, "Applicant email not on file", 400);

    const result = await sendEmailSafely({
      to: applicant.contact.email,
      subject: `Your ${taxYear} ${docType} is available`,
      html: `<p>Hi ${applicant.full_name},</p><p>Your ${taxYear} ${docType} is ready to view${docType === "1099" ? " in your contractor portal" : " in your employee portal"}.</p>`,
    });

    await prisma.applicantCommunication.create({
      data: {
        applicant_id: applicantId,
        communication_type: "EMAIL",
        direction: "OUTBOUND",
        trigger: "AUTOMATIC",
        status: result.success ? "SENT" : "FAILED",
        subject: `Your ${taxYear} ${docType} is available`,
        to_address: applicant.contact.email,
        notes: result.error ?? undefined,
        metadata: { docType, taxYear, purpose: "year-end-tax-document-notification" },
      },
    });

    return sendSuccess(res, { emailSent: result.success, error: result.error ?? null });
  } catch (err) {
    console.error(err);
    return sendError(res, "notifyTaxDocumentAvailable failed", 500);
  }
}

/**
 * POST /api/reports/tax-documents/:applicantId/consent
 * body: { docType: "W2" | "1099", consentGiven: boolean }
 *
 * NOTE: the schema has no dedicated consent table/field. Rather than
 * invent one, the consent event is logged on ApplicantCommunication
 * (type NOTE) so it stays fully auditable without a migration. If a
 * first-class consent record becomes a compliance requirement, add a
 * small TaxDocumentConsent model and swap this implementation in.
 */
export async function recordTaxDocumentConsent(req: Request, res: Response) {
  try {
    const { applicantId } = req.params;
    const docType = (req.body.docType as string) === "1099" ? "1099" : "W2";
    const consentGiven = req.body.consentGiven !== false;

    const applicant = await prisma.applicant.findUnique({
      where: { applicant_id: applicantId },
      select: { applicant_id: true },
    });
    if (!applicant) return sendError(res, "Applicant not found", 404);

    const log = await prisma.applicantCommunication.create({
      data: {
        applicant_id: applicantId,
        communication_type: "NOTE",
        trigger: "MANUAL",
        status: "LOGGED",
        notes: `${docType} electronic delivery consent ${consentGiven ? "GRANTED" : "REVOKED"} on ${new Date().toISOString()}`,
        sent_by_user_id: (req as any).user?.user_id ?? null,        metadata: { docType, consentGiven, source: "tax-document-consent" },
      },
    });

    return sendSuccess(res, { message: "Consent recorded", log });
  } catch (err) {
    console.error(err);
    return sendError(res, "recordTaxDocumentConsent failed", 500);
  }
}

// ═════════════════════════════════════════════════════════════════════════
// MODULE 12 — REPORTING & ANALYTICS
// ═════════════════════════════════════════════════════════════════════════

// ── PAYROLL REPORTS ──────────────────────────────────────────────────────

/** GET /api/reports/payroll/register?startDate=&endDate=&branch=&batchId= */
export async function payrollRegister(req: Request, res: Response) {
  try {
    const dateRange = parseDateFilter(req);
    const branchFilter = req.query.branch as string | undefined;
    const batchId = req.query.batchId as string | undefined;

    const checks = await prisma.payrollCheck.findMany({
      where: {
        batch: {
          ...(dateRange ? { check_date: dateRange } : {}),
          ...(batchId ? { payroll_batch_id: batchId } : {}),
        },
      },
      orderBy: { created_at: "desc" },
      take: Number(req.query.limit ?? 500),
      select: {
        check_number: true,
        status: true,
        gross_pay: true,
        federal_tax: true,
        state_tax: true,
        local_tax: true,
        employee_ss: true,
        employee_medicare: true,
        net_pay: true,
        is_direct_deposit: true,
        batch: { select: { check_date: true, run_type: true } },
        applicant: { select: { full_name: true, office_division: true, office_name: true } },
        agency: { select: { name: true } },
      },
    });

    const rows = checks
      .filter((c) => !branchFilter || c.applicant?.office_division === branchFilter || c.applicant?.office_name === branchFilter)
      .map((c) => ({
        check_number: c.check_number ?? "",
        employee_name: c.applicant?.full_name ?? c.agency?.name ?? "(Agency Pay)",
        branch: c.applicant?.office_division ?? c.applicant?.office_name ?? "",
        check_date: c.batch.check_date,
        run_type: c.batch.run_type,
        gross_pay: money(c.gross_pay),
        federal_tax: money(c.federal_tax),
        state_tax: money(c.state_tax),
        local_tax: money(c.local_tax),
        ss: money(c.employee_ss),
        medicare: money(c.employee_medicare),
        net_pay: money(c.net_pay),
        direct_deposit: c.is_direct_deposit ? "Y" : "N",
        status: c.status,
      }));

    return respondWithReport(req, res, {
      filename: "payroll-register",
      title: "Payroll Register",
      rows,
      columns: [
        { key: "check_number", label: "Check #" },
        { key: "employee_name", label: "Employee" },
        { key: "branch", label: "Branch" },
        { key: "check_date", label: "Check Date" },
        { key: "run_type", label: "Run Type" },
        { key: "gross_pay", label: "Gross Pay" },
        { key: "federal_tax", label: "Federal Tax" },
        { key: "state_tax", label: "State Tax" },
        { key: "local_tax", label: "Local Tax" },
        { key: "ss", label: "Soc. Security" },
        { key: "medicare", label: "Medicare" },
        { key: "net_pay", label: "Net Pay" },
        { key: "direct_deposit", label: "Direct Deposit" },
        { key: "status", label: "Status" },
      ],
    });
  } catch (err) {
    console.error(err);
    return sendError(res, "payrollRegister failed", 500);
  }
}

/** GET /api/reports/payroll/summary?startDate=&endDate= — totals grouped by branch */
export async function payrollSummary(req: Request, res: Response) {
  try {
    const dateRange = parseDateFilter(req);

    const checks = await prisma.payrollCheck.findMany({
      where: { batch: dateRange ? { check_date: dateRange } : undefined },
      select: {
        gross_pay: true,
        net_pay: true,
        federal_tax: true,
        state_tax: true,
        local_tax: true,
        total_employer_cost: true,
        applicant: { select: { office_division: true, office_name: true } },
      },
    });

    const byBranch = new Map<string, any>();
    for (const c of checks) {
      const branch = c.applicant?.office_division ?? c.applicant?.office_name ?? "Unassigned";
      const acc = byBranch.get(branch) ?? { gross: 0, net: 0, federal: 0, state: 0, local: 0, employerCost: 0, checkCount: 0 };
      acc.gross += num(c.gross_pay);
      acc.net += num(c.net_pay);
      acc.federal += num(c.federal_tax);
      acc.state += num(c.state_tax);
      acc.local += num(c.local_tax);
      acc.employerCost += num(c.total_employer_cost);
      acc.checkCount += 1;
      byBranch.set(branch, acc);
    }

    const rows = [...byBranch.entries()].map(([branch, t]) => ({
      branch,
      check_count: t.checkCount,
      gross_pay: money(t.gross),
      net_pay: money(t.net),
      federal_tax: money(t.federal),
      state_tax: money(t.state),
      local_tax: money(t.local),
      employer_cost: money(t.employerCost),
    }));

    return respondWithReport(req, res, {
      filename: "payroll-summary",
      title: "Payroll Summary by Branch",
      rows,
      columns: [
        { key: "branch", label: "Branch" },
        { key: "check_count", label: "# Checks" },
        { key: "gross_pay", label: "Gross Pay" },
        { key: "net_pay", label: "Net Pay" },
        { key: "federal_tax", label: "Federal Tax" },
        { key: "state_tax", label: "State Tax" },
        { key: "local_tax", label: "Local Tax" },
        { key: "employer_cost", label: "Employer Cost" },
      ],
    });
  } catch (err) {
    console.error(err);
    return sendError(res, "payrollSummary failed", 500);
  }
}

/** GET /api/reports/payroll/earnings?startDate=&endDate= — grouped by earning type */
export async function earningsReport(req: Request, res: Response) {
  try {
    const dateRange = parseDateFilter(req);

    const lines = await prisma.payrollCheckLine.findMany({
      where: dateRange ? { week_worked: dateRange } : undefined,
      select: { earning_type: true, hours: true, amount: true, customer_name: true },
    });

    const byType = new Map<string, { hours: number; amount: number; count: number }>();
    for (const l of lines) {
      const key = l.earning_type || "REGULAR";
      const acc = byType.get(key) ?? { hours: 0, amount: 0, count: 0 };
      acc.hours += num(l.hours);
      acc.amount += num(l.amount);
      acc.count += 1;
      byType.set(key, acc);
    }

    const rows = [...byType.entries()].map(([earning_type, t]) => ({
      earning_type,
      line_count: t.count,
      total_hours: t.hours.toFixed(2),
      total_amount: money(t.amount),
    }));

    return respondWithReport(req, res, {
      filename: "earnings-report",
      title: "Earnings Report",
      rows,
      columns: [
        { key: "earning_type", label: "Earning Type" },
        { key: "line_count", label: "# Lines" },
        { key: "total_hours", label: "Total Hours" },
        { key: "total_amount", label: "Total Amount" },
      ],
    });
  } catch (err) {
    console.error(err);
    return sendError(res, "earningsReport failed", 500);
  }
}

/** GET /api/reports/payroll/deductions?startDate=&endDate=&branch= */
export async function deductionReport(req: Request, res: Response) {
  try {
    const dateRange = parseDateFilter(req);
    const branchFilter = req.query.branch as string | undefined;

    const [deductions, garnishments] = await Promise.all([
      prisma.benefitDeduction.findMany({
        where: { is_active: true, ...(dateRange ? { effective_date: dateRange } : {}) },
        select: {
          deduction_type: true,
          amount: true,
          percentage: true,
          applicant: { select: { full_name: true, office_division: true } },
        },
      }),
      prisma.garnishment.findMany({
        where: { is_active: true, ...(dateRange ? { start_date: dateRange } : {}) },
        select: {
          garnishment_type: true,
          amount: true,
          percentage: true,
          applicant: { select: { full_name: true, office_division: true } },
        },
      }),
    ]);

    const rows = [
      ...deductions
        .filter((d) => !branchFilter || d.applicant.office_division === branchFilter)
        .map((d) => ({
          employee_name: d.applicant.full_name,
          branch: d.applicant.office_division ?? "",
          category: "Deduction",
          type: d.deduction_type,
          amount: d.amount ? money(d.amount) : "",
          percentage: d.percentage ? `${money(d.percentage)}%` : "",
        })),
      ...garnishments
        .filter((g) => !branchFilter || g.applicant.office_division === branchFilter)
        .map((g) => ({
          employee_name: g.applicant.full_name,
          branch: g.applicant.office_division ?? "",
          category: "Garnishment",
          type: g.garnishment_type,
          amount: g.amount ? money(g.amount) : "",
          percentage: g.percentage ? `${money(g.percentage)}%` : "",
        })),
    ];

    return respondWithReport(req, res, {
      filename: "deduction-report",
      title: "Deduction Report",
      rows,
      columns: [
        { key: "employee_name", label: "Employee" },
        { key: "branch", label: "Branch" },
        { key: "category", label: "Category" },
        { key: "type", label: "Type" },
        { key: "amount", label: "Amount" },
        { key: "percentage", label: "Percentage" },
      ],
    });
  } catch (err) {
    console.error(err);
    return sendError(res, "deductionReport failed", 500);
  }
}

/** GET /api/reports/payroll/tax-liability?startDate=&endDate= */
export async function taxLiabilityReport(req: Request, res: Response) {
  try {
    const dateRange = parseDateFilter(req);

    const checks = await prisma.payrollCheck.findMany({
      where: { batch: dateRange ? { check_date: dateRange } : undefined },
      select: {
        federal_tax: true,
        state_tax: true,
        local_tax: true,
        employee_ss: true,
        employee_medicare: true,
        employer_ss: true,
        employer_medicare: true,
        employer_futa: true,
        employer_suta: true,
        batch: { select: { check_date: true } },
      },
    });

    const byPeriod = new Map<string, any>();
    for (const c of checks) {
      const key = c.batch.check_date.toISOString().slice(0, 10);
      const acc =
        byPeriod.get(key) ??
        { federal: 0, state: 0, local: 0, employeeSS: 0, employeeMedicare: 0, employerSS: 0, employerMedicare: 0, futa: 0, suta: 0 };
      acc.federal += num(c.federal_tax);
      acc.state += num(c.state_tax);
      acc.local += num(c.local_tax);
      acc.employeeSS += num(c.employee_ss);
      acc.employeeMedicare += num(c.employee_medicare);
      acc.employerSS += num(c.employer_ss);
      acc.employerMedicare += num(c.employer_medicare);
      acc.futa += num(c.employer_futa);
      acc.suta += num(c.employer_suta);
      byPeriod.set(key, acc);
    }

    const rows = [...byPeriod.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([check_date, t]) => ({
        check_date,
        federal_income_tax: money(t.federal),
        state_income_tax: money(t.state),
        local_income_tax: money(t.local),
        employee_social_security: money(t.employeeSS),
        employee_medicare: money(t.employeeMedicare),
        employer_social_security: money(t.employerSS),
        employer_medicare: money(t.employerMedicare),
        futa: money(t.futa),
        suta: money(t.suta),
      }));

    return respondWithReport(req, res, {
      filename: "tax-liability-report",
      title: "Tax Liability Report",
      rows,
      columns: [
        { key: "check_date", label: "Check Date" },
        { key: "federal_income_tax", label: "Fed. Income Tax" },
        { key: "state_income_tax", label: "State Income Tax" },
        { key: "local_income_tax", label: "Local Income Tax" },
        { key: "employee_social_security", label: "EE Social Security" },
        { key: "employee_medicare", label: "EE Medicare" },
        { key: "employer_social_security", label: "ER Social Security" },
        { key: "employer_medicare", label: "ER Medicare" },
        { key: "futa", label: "FUTA" },
        { key: "suta", label: "SUTA" },
      ],
    });
  } catch (err) {
    console.error(err);
    return sendError(res, "taxLiabilityReport failed", 500);
  }
}

/** GET /api/reports/payroll/ach-register?startDate=&endDate= */
export async function achRegister(req: Request, res: Response) {
  try {
    const dateRange = parseDateFilter(req);

    const files = await prisma.aCHFile.findMany({
      where: dateRange ? { effective_date: dateRange } : undefined,
      orderBy: { effective_date: "desc" },
      select: {
        file_name: true,
        total_amount: true,
        entry_count: true,
        effective_date: true,
        status: true,
        transmitted_at: true,
        company_bank_account: { select: { company_name: true, originating_bank_name: true } },
        batch: { select: { batch_number: true, run_type: true } },
      },
    });

    const rows = files.map((f) => ({
      batch_number: f.batch.batch_number,
      run_type: f.batch.run_type,
      file_name: f.file_name,
      bank: f.company_bank_account.originating_bank_name,
      company: f.company_bank_account.company_name,
      effective_date: f.effective_date,
      entry_count: f.entry_count,
      total_amount: money(f.total_amount),
      status: f.status,
      transmitted_at: f.transmitted_at ?? "",
    }));

    return respondWithReport(req, res, {
      filename: "ach-register",
      title: "ACH Register",
      rows,
      columns: [
        { key: "batch_number", label: "Batch #" },
        { key: "run_type", label: "Run Type" },
        { key: "file_name", label: "File Name" },
        { key: "bank", label: "Bank" },
        { key: "company", label: "Company" },
        { key: "effective_date", label: "Effective Date" },
        { key: "entry_count", label: "# Entries" },
        { key: "total_amount", label: "Total Amount" },
        { key: "status", label: "Status" },
        { key: "transmitted_at", label: "Transmitted At" },
      ],
    });
  } catch (err) {
    console.error(err);
    return sendError(res, "achRegister failed", 500);
  }
}

// ── BILLING REPORTS ──────────────────────────────────────────────────────

/** GET /api/reports/billing/invoice-register?startDate=&endDate=&statuses=&orgId= */
export async function invoiceRegister(req: Request, res: Response) {
  try {
    const dateRange = parseDateFilter(req);
    const statusFilter = parseCSVParam(req.query.statuses as string);
    const orgId = req.query.orgId as string | undefined;

    const invoices = await prisma.clientInvoice.findMany({
      where: {
        ...(dateRange ? { invoice_date: dateRange } : {}),
        ...(statusFilter ? { status: { in: statusFilter } } : {}),
        ...(orgId ? { organization_id: orgId } : {}),
      },
      orderBy: { invoice_date: "desc" },
      take: Number(req.query.limit ?? 500),
      select: {
        invoice_number: true,
        status: true,
        invoice_date: true,
        due_date: true,
        subtotal: true,
        tax_amount: true,
        total_amount: true,
        paid_at: true,
        organization: { select: { name: true } },
      },
    });

    const rows = invoices.map((i) => ({
      invoice_number: i.invoice_number,
      customer: i.organization.name,
      status: i.status,
      invoice_date: i.invoice_date,
      due_date: i.due_date,
      subtotal: money(i.subtotal),
      tax_amount: money(i.tax_amount),
      total_amount: money(i.total_amount),
      paid_at: i.paid_at ?? "",
    }));

    return respondWithReport(req, res, {
      filename: "invoice-register",
      title: "Invoice Register",
      rows,
      columns: [
        { key: "invoice_number", label: "Invoice #" },
        { key: "customer", label: "Customer" },
        { key: "status", label: "Status" },
        { key: "invoice_date", label: "Invoice Date" },
        { key: "due_date", label: "Due Date" },
        { key: "subtotal", label: "Subtotal" },
        { key: "tax_amount", label: "Tax" },
        { key: "total_amount", label: "Total" },
        { key: "paid_at", label: "Paid At" },
      ],
    });
  } catch (err) {
    console.error(err);
    return sendError(res, "invoiceRegister failed", 500);
  }
}

/** GET /api/reports/billing/revenue-by-customer?startDate=&endDate= */
export async function revenueByCustomer(req: Request, res: Response) {
  try {
    const dateRange = parseDateFilter(req);

    const invoices = await prisma.clientInvoice.findMany({
      where: dateRange ? { invoice_date: dateRange } : undefined,
      select: { total_amount: true, status: true, organization: { select: { name: true, organization_id: true } } },
    });

    const byOrg = new Map<string, any>();
    for (const inv of invoices) {
      const key = inv.organization.organization_id;
      const acc = byOrg.get(key) ?? { name: inv.organization.name, invoiced: 0, paid: 0, invoiceCount: 0 };
      acc.invoiced += num(inv.total_amount);
      if (inv.status === "PAID") acc.paid += num(inv.total_amount);
      acc.invoiceCount += 1;
      byOrg.set(key, acc);
    }

    const rows = [...byOrg.values()]
      .sort((a, b) => b.invoiced - a.invoiced)
      .map((o) => ({
        customer: o.name,
        invoice_count: o.invoiceCount,
        total_invoiced: money(o.invoiced),
        total_paid: money(o.paid),
        total_outstanding: money(o.invoiced - o.paid),
      }));

    return respondWithReport(req, res, {
      filename: "revenue-by-customer",
      title: "Revenue by Customer",
      rows,
      columns: [
        { key: "customer", label: "Customer" },
        { key: "invoice_count", label: "# Invoices" },
        { key: "total_invoiced", label: "Total Invoiced" },
        { key: "total_paid", label: "Total Paid" },
        { key: "total_outstanding", label: "Outstanding" },
      ],
    });
  } catch (err) {
    console.error(err);
    return sendError(res, "revenueByCustomer failed", 500);
  }
}

/** GET /api/reports/billing/revenue-by-employee?startDate=&endDate= */
export async function revenueByEmployee(req: Request, res: Response) {
  try {
    const dateRange = parseDateFilter(req);

    const lines = await prisma.clientInvoiceLine.findMany({
      where: dateRange ? { invoice: { invoice_date: dateRange } } : undefined,
      select: { employee_name: true, department: true, bill_units: true, amount: true },
    });

    const byEmployee = new Map<string, any>();
    for (const l of lines) {
      const key = l.employee_name;
      const acc = byEmployee.get(key) ?? { department: l.department ?? "", billUnits: 0, amount: 0 };
      acc.billUnits += num(l.bill_units);
      acc.amount += num(l.amount);
      byEmployee.set(key, acc);
    }

    const rows = [...byEmployee.entries()]
      .sort((a, b) => b[1].amount - a[1].amount)
      .map(([employee_name, t]) => ({
        employee_name,
        department: t.department,
        bill_units: t.billUnits.toFixed(2),
        total_revenue: money(t.amount),
      }));

    return respondWithReport(req, res, {
      filename: "revenue-by-employee",
      title: "Revenue by Employee",
      rows,
      columns: [
        { key: "employee_name", label: "Employee" },
        { key: "department", label: "Department" },
        { key: "bill_units", label: "Bill Units" },
        { key: "total_revenue", label: "Total Revenue" },
      ],
    });
  } catch (err) {
    console.error(err);
    return sendError(res, "revenueByEmployee failed", 500);
  }
}

/** GET /api/reports/billing/revenue-by-branch?startDate=&endDate= */
export async function revenueByBranch(req: Request, res: Response) {
  try {
    const dateRange = parseDateFilter(req);

    const invoices = await prisma.clientInvoice.findMany({
      where: dateRange ? { invoice_date: dateRange } : undefined,
      select: { total_amount: true, organization: { select: { branch_region: true, branch_name: true } } },
    });

    const byBranch = new Map<string, number>();
    for (const inv of invoices) {
      const branch = inv.organization.branch_region ?? inv.organization.branch_name ?? "Unassigned";
      byBranch.set(branch, (byBranch.get(branch) ?? 0) + num(inv.total_amount));
    }

    const rows = [...byBranch.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([branch, total]) => ({ branch, total_revenue: money(total) }));

    return respondWithReport(req, res, {
      filename: "revenue-by-branch",
      title: "Revenue by Branch",
      rows,
      columns: [
        { key: "branch", label: "Branch" },
        { key: "total_revenue", label: "Total Revenue" },
      ],
    });
  } catch (err) {
    console.error(err);
    return sendError(res, "revenueByBranch failed", 500);
  }
}

/** GET /api/reports/billing/outstanding-invoices?orgId= */
export async function outstandingInvoices(req: Request, res: Response) {
  try {
    const orgId = req.query.orgId as string | undefined;
    const now = new Date();

    const invoices = await prisma.clientInvoice.findMany({
      where: {
        status: { in: ["SENT", "VIEWED", "OVERDUE"] },
        ...(orgId ? { organization_id: orgId } : {}),
      },
      orderBy: { due_date: "asc" },
      select: {
        invoice_number: true,
        status: true,
        invoice_date: true,
        due_date: true,
        total_amount: true,
        organization: { select: { name: true } },
      },
    });

    const rows = invoices.map((i) => ({
      invoice_number: i.invoice_number,
      customer: i.organization.name,
      status: i.status,
      invoice_date: i.invoice_date,
      due_date: i.due_date,
      total_amount: money(i.total_amount),
      days_overdue: Math.max(0, Math.floor((now.getTime() - i.due_date.getTime()) / (1000 * 60 * 60 * 24))),
    }));

    return respondWithReport(req, res, {
      filename: "outstanding-invoices",
      title: "Outstanding Invoices",
      rows,
      columns: [
        { key: "invoice_number", label: "Invoice #" },
        { key: "customer", label: "Customer" },
        { key: "status", label: "Status" },
        { key: "invoice_date", label: "Invoice Date" },
        { key: "due_date", label: "Due Date" },
        { key: "total_amount", label: "Amount Due" },
        { key: "days_overdue", label: "Days Overdue" },
      ],
      meta: { "Total Outstanding": money(invoices.reduce((s, i) => s + num(i.total_amount), 0)) },
    });
  } catch (err) {
    console.error(err);
    return sendError(res, "outstandingInvoices failed", 500);
  }
}

/** GET /api/reports/billing/customer-summary */
export async function customerBillingSummary(req: Request, res: Response) {
  try {
    const orgs = await prisma.organization.findMany({
      select: {
        organization_id: true,
        name: true,
        client_invoices: { select: { total_amount: true, status: true } },
      },
    });

    const rows = orgs
      .filter((o) => o.client_invoices.length)
      .map((o) => {
        const invoiced = o.client_invoices.reduce((s, i) => s + num(i.total_amount), 0);
        const paid = o.client_invoices.filter((i) => i.status === "PAID").reduce((s, i) => s + num(i.total_amount), 0);
        return {
          customer: o.name,
          invoice_count: o.client_invoices.length,
          total_invoiced: money(invoiced),
          total_paid: money(paid),
          total_outstanding: money(invoiced - paid),
        };
      })
      .sort((a, b) => Number(b.total_invoiced) - Number(a.total_invoiced));

    return respondWithReport(req, res, {
      filename: "customer-billing-summary",
      title: "Customer Billing Summary",
      rows,
      columns: [
        { key: "customer", label: "Customer" },
        { key: "invoice_count", label: "# Invoices" },
        { key: "total_invoiced", label: "Total Invoiced" },
        { key: "total_paid", label: "Total Paid" },
        { key: "total_outstanding", label: "Outstanding" },
      ],
    });
  } catch (err) {
    console.error(err);
    return sendError(res, "customerBillingSummary failed", 500);
  }
}

// ── COMPLIANCE REPORTS ───────────────────────────────────────────────────

/**
 * GET /api/reports/compliance/aca-eligibility?measurementDays=365
 * Flags assignments averaging >= 30 hrs/week over the measurement period
 * (standard ACA full-time equivalency threshold).
 */
export async function acaEligibilityReport(req: Request, res: Response) {
  try {
    const measurementDays = Number(req.query.measurementDays ?? 365);
    const since = new Date(Date.now() - measurementDays * 24 * 60 * 60 * 1000);

    const assignments = await prisma.assignment.findMany({
      where: { OR: [{ end_date: null }, { end_date: { gte: new Date() } }] },
      select: {
        assignment_id: true,
        employment_type: true,
        start_date: true,
        application: {
          select: {
            applicant: { select: { full_name: true } },
            job: { select: { organization: { select: { name: true } } } },
          },
        },
        timesheets: {
          where: { week_start_date: { gte: since } },
          select: { total_hours: true },
        },
      },
    });

    const rows = assignments.map((a) => {
      const totalHours = a.timesheets.reduce((s, t) => s + num(t.total_hours), 0);
      const weeks = Math.max(1, Math.round(measurementDays / 7));
      const avgWeeklyHours = totalHours / weeks;
      return {
        employee_name: a.application.applicant.full_name,
        customer: a.application.job.organization.name,
        employment_type: a.employment_type,
        avg_weekly_hours: avgWeeklyHours.toFixed(2),
        aca_eligible: avgWeeklyHours >= 30 ? "Yes" : "No",
        measurement_period_days: measurementDays,
      };
    });

    return respondWithReport(req, res, {
      filename: "aca-eligibility-report",
      title: "ACA Eligibility Report",
      rows,
      columns: [
        { key: "employee_name", label: "Employee" },
        { key: "customer", label: "Customer" },
        { key: "employment_type", label: "Type" },
        { key: "avg_weekly_hours", label: "Avg Weekly Hours" },
        { key: "aca_eligible", label: "ACA Eligible (>=30 hrs/wk)" },
        { key: "measurement_period_days", label: "Measurement Days" },
      ],
      meta: { "Measurement Window (days)": String(measurementDays) },
    });
  } catch (err) {
    console.error(err);
    return sendError(res, "acaEligibilityReport failed", 500);
  }
}

/** GET /api/reports/compliance/workers-comp?startDate=&endDate= */
export async function workersCompensationReport(req: Request, res: Response) {
  try {
    const dateRange = parseDateFilter(req);

    const checks = await prisma.payrollCheck.findMany({
      where: { batch: dateRange ? { check_date: dateRange } : undefined, employer_wc_cost: { gt: 0 } },
      select: {
        employer_wc_cost: true,
        applicant: { select: { full_name: true, office_division: true } },
      },
    });

    // Pull WC codes per assignment via the transaction/assignment path since
    // PayrollCheck itself doesn't carry a direct assignment_id.
    const rows = checks.map((c) => ({
      employee_name: c.applicant?.full_name ?? "",
      branch: c.applicant?.office_division ?? "",
      employer_wc_cost: money(c.employer_wc_cost),
    }));

    return respondWithReport(req, res, {
      filename: "workers-compensation-report",
      title: "Workers' Compensation Cost Report",
      rows,
      columns: [
        { key: "employee_name", label: "Employee" },
        { key: "branch", label: "Branch" },
        { key: "employer_wc_cost", label: "Employer WC Cost" },
      ],
      meta: {
        Note: "WC classification codes/rates live on Assignment.workers_comp_codes and WCCode; join there for a code-level breakdown.",
      },
    });
  } catch (err) {
    console.error(err);
    return sendError(res, "workersCompensationReport failed", 500);
  }
}

/** GET /api/reports/compliance/paid-sick-leave?startDate=&endDate= */
export async function paidSickLeaveReport(req: Request, res: Response) {
  try {
    const dateRange = parseDateFilter(req);

    const entries = await prisma.timeEntry.findMany({
      where: { work_type: "SICK", ...(dateRange ? { work_date: dateRange } : {}) },
      select: {
        total_hours: true,
        work_date: true,
        assignment: {
          select: {
            application: {
              select: { applicant: { select: { full_name: true } }, job: { select: { organization: { select: { name: true } } } } },
            },
          },
        },
      },
    });

    const byEmployee = new Map<string, any>();
    for (const e of entries) {
      const name = e.assignment.application.applicant.full_name;
      const acc = byEmployee.get(name) ?? { hours: 0, customer: e.assignment.application.job.organization.name, entryCount: 0 };
      acc.hours += num(e.total_hours);
      acc.entryCount += 1;
      byEmployee.set(name, acc);
    }

    const rows = [...byEmployee.entries()].map(([employee_name, t]) => ({
      employee_name,
      customer: t.customer,
      sick_hours_used: t.hours.toFixed(2),
      sick_days_used: t.entryCount,
    }));

    return respondWithReport(req, res, {
      filename: "paid-sick-leave-report",
      title: "Paid Sick Leave Report",
      rows,
      columns: [
        { key: "employee_name", label: "Employee" },
        { key: "customer", label: "Customer" },
        { key: "sick_hours_used", label: "Sick Hours Used" },
        { key: "sick_days_used", label: "Sick Days Used" },
      ],
      meta: { Note: "Accrual-balance tracking (e.g. state-specific caps) is not modeled — this reflects usage only." },
    });
  } catch (err) {
    console.error(err);
    return sendError(res, "paidSickLeaveReport failed", 500);
  }
}

/** GET /api/reports/compliance/employee-hours?startDate=&endDate=&branch= */
export async function employeeHoursReport(req: Request, res: Response) {
  try {
    const dateRange = parseDateFilter(req);
    const branchFilter = req.query.branch as string | undefined;

    const entries = await prisma.timeEntry.findMany({
      where: dateRange ? { work_date: dateRange } : undefined,
      select: {
        regular_hours: true,
        ot_hours: true,
        total_hours: true,
        assignment: {
          select: {
            application: {
              select: {
                applicant: { select: { full_name: true, office_division: true } },
                job: { select: { organization: { select: { name: true } } } },
              },
            },
          },
        },
      },
    });

    const byEmployee = new Map<string, any>();
    for (const e of entries) {
      const applicant = e.assignment.application.applicant;
      const branch = applicant.office_division ?? "";
      if (branchFilter && branch !== branchFilter) continue;
      const key = applicant.full_name;
      const acc =
        byEmployee.get(key) ?? { branch, customer: e.assignment.application.job.organization.name, regular: 0, ot: 0, total: 0 };
      acc.regular += num(e.regular_hours);
      acc.ot += num(e.ot_hours);
      acc.total += num(e.total_hours);
      byEmployee.set(key, acc);
    }

    const rows = [...byEmployee.entries()].map(([employee_name, t]) => ({
      employee_name,
      branch: t.branch,
      customer: t.customer,
      regular_hours: t.regular.toFixed(2),
      overtime_hours: t.ot.toFixed(2),
      total_hours: t.total.toFixed(2),
    }));

    return respondWithReport(req, res, {
      filename: "employee-hours-report",
      title: "Employee Hours Report",
      rows,
      columns: [
        { key: "employee_name", label: "Employee" },
        { key: "branch", label: "Branch" },
        { key: "customer", label: "Customer" },
        { key: "regular_hours", label: "Regular Hours" },
        { key: "overtime_hours", label: "OT Hours" },
        { key: "total_hours", label: "Total Hours" },
      ],
    });
  } catch (err) {
    console.error(err);
    return sendError(res, "employeeHoursReport failed", 500);
  }
}

/** Shared directory used by w2EmployeesReport / contractors1099Report / activeAssignmentReport below. */
async function buildAssignmentDirectory(employmentType?: "W2" | "1099", branchFilter?: string, activeOnly = false) {
  const assignments = await prisma.assignment.findMany({
    where: {
      ...(employmentType ? { employment_type: employmentType === "1099" ? "CONTRACTOR_1099" : "W2" } : {}),
      ...(activeOnly ? { OR: [{ end_date: null }, { end_date: { gte: new Date() } }] } : {}),
    },
    orderBy: { start_date: "desc" },
    select: {
      employment_type: true,
      start_date: true,
      end_date: true,
      application: {
        select: {
          applicant: { select: { full_name: true, office_division: true, office_name: true } },
          job: { select: { job_title: true, job_branch: true, organization: { select: { name: true } } } },
        },
      },
    },
  });

  return assignments
    .map((a) => ({
      employee_name: a.application.applicant.full_name,
      branch: a.application.applicant.office_division ?? a.application.applicant.office_name ?? a.application.job.job_branch ?? "",
      customer: a.application.job.organization.name,
      job_title: a.application.job.job_title,
      employee_type: a.employment_type === "CONTRACTOR_1099" ? "1099" : "W2",
      start_date: a.start_date,
      end_date: a.end_date,
    }))
    .filter((r) => !branchFilter || r.branch === branchFilter);
}

/** GET /api/reports/compliance/w2-employees?branch= */
export async function w2EmployeesReport(req: Request, res: Response) {
  try {
    const rows = await buildAssignmentDirectory("W2", req.query.branch as string | undefined);
    return respondWithReport(req, res, {
      filename: "w2-employees-directory",
      title: "W-2 Employees Directory",
      rows,
      columns: [
        { key: "employee_name", label: "Employee" },
        { key: "branch", label: "Branch" },
        { key: "customer", label: "Customer" },
        { key: "job_title", label: "Job Title" },
        { key: "start_date", label: "Start Date" },
        { key: "end_date", label: "End Date" },
      ],
    });
  } catch (err) {
    console.error(err);
    return sendError(res, "w2EmployeesReport failed", 500);
  }
}

/** GET /api/reports/compliance/1099-contractors?branch= */
export async function contractors1099Report(req: Request, res: Response) {
  try {
    const rows = await buildAssignmentDirectory("1099", req.query.branch as string | undefined);
    return respondWithReport(req, res, {
      filename: "1099-contractors-directory",
      title: "1099 Contractors Directory",
      rows,
      columns: [
        { key: "employee_name", label: "Contractor" },
        { key: "branch", label: "Branch" },
        { key: "customer", label: "Customer" },
        { key: "job_title", label: "Job Title" },
        { key: "start_date", label: "Start Date" },
        { key: "end_date", label: "End Date" },
      ],
    });
  } catch (err) {
    console.error(err);
    return sendError(res, "contractors1099Report failed", 500);
  }
}

// ═════════════════════════════════════════════════════════════════════════
// PRIORITY / AVIONTE-PARITY REPORTS
// (kept 1:1 with the sample filter sets and column layouts supplied)
// ═════════════════════════════════════════════════════════════════════════

/**
 * GET /api/reports/legacy/new-hire
 * Filters: division/branch, client (orgId), startDate, endDate, jobTitle
 * Columns match the supplied "New Hire Report" sample sheet.
 */
export async function newHireReport(req: Request, res: Response) {
  try {
    const dateRange = parseDateFilter(req);
    const branch = req.query.branch as string | undefined;
    const orgId = req.query.orgId as string | undefined;
    const jobTitle = req.query.jobTitle as string | undefined;
    const employeeType = req.query.employeeType as string | undefined; // "W2" | "1099"

    const assignments = await prisma.assignment.findMany({
      where: {
        ...(dateRange ? { start_date: dateRange } : {}),
        ...(employeeType ? { employment_type: employeeType === "1099" ? "CONTRACTOR_1099" : "W2" } : {}),
        application: {
          ...(jobTitle ? { job: { job_title: { contains: jobTitle, mode: "insensitive" } } } : {}),
          ...(orgId ? { job: { organization_id: orgId } } : {}),
        },
      },
      orderBy: { start_date: "desc" },
      select: {
        start_date: true,
        application: {
          select: {
            applicant: {
              select: {
                full_name: true,
                office_division: true,
                contact: { select: { address: true, city: true, state: true, zip: true } },
                demographic: { select: { ssn_encrypted: true, birth_date: true } },
              },
            },
            job: { select: { job_title: true, job_branch: true, organization: { select: { name: true } } } },
          },
        },
      },
    });

    const rows = assignments
      .map((a) => ({
        branch: a.application.applicant.office_division ?? a.application.job.job_branch ?? "",
        ssn: maskSSN(a.application.applicant.demographic?.ssn_encrypted),
        employee_name: a.application.applicant.full_name,
        address: a.application.applicant.contact?.address ?? "",
        city: a.application.applicant.contact?.city ?? "",
        state: a.application.applicant.contact?.state ?? "",
        zip: a.application.applicant.contact?.zip ?? "",
        start_date: a.start_date,
        dob: a.application.applicant.demographic?.birth_date ?? "",
        job_title: a.application.job.job_title,
        customer: a.application.job.organization.name,
      }))
      .filter((r) => !branch || r.branch === branch);

    return respondWithReport(req, res, {
      filename: "new-hire-report",
      title: "New Hire Report",
      rows,
      columns: [
        { key: "branch", label: "Branch" },
        { key: "ssn", label: "SSN" },
        { key: "employee_name", label: "Employee Name" },
        { key: "address", label: "Address" },
        { key: "city", label: "City" },
        { key: "state", label: "State" },
        { key: "zip", label: "Zip Code" },
        { key: "start_date", label: "Start Date" },
        { key: "dob", label: "DOB" },
        { key: "job_title", label: "Position Title" },
        { key: "customer", label: "Client" },
      ],
    });
  } catch (err) {
    console.error(err);
    return sendError(res, "newHireReport failed", 500);
  }
}

/**
 * GET /api/reports/legacy/osha
 *
 * NOTE: the schema has no OSHA/workers'-comp incident or claims table
 * (no injury date, claim type, or "reportable" flag anywhere). Rather than
 * fabricate incident data, this returns the requested shape with zero rows
 * and a clear message. Add an `OSHAIncident` model (division/branch,
 * customer, year, claim_type, reportable, incident description) to make
 * this fully functional — the filter contract below is ready for it.
 */
export async function oshaReport(req: Request, res: Response) {
  try {
    const rows: any[] = [];
    const format = getFormat(req);

    if (format === "json") {
      return sendSuccess(res, {
        count: 0,
        rows,
        message:
          "OSHA incident tracking is not yet modeled in the schema (no claim/incident table). This endpoint is wired and ready — add an OSHAIncident model to populate it.",
      });
    }

    return respondWithReport(req, res, {
      filename: "osha-report",
      title: "OSHA Report",
      rows,
      columns: [
        { key: "branch", label: "Division/Branch" },
        { key: "customer", label: "Customer Name" },
        { key: "year", label: "Year" },
        { key: "claim_type", label: "Claim Type" },
        { key: "reportable", label: "Reportable" },
        { key: "incident", label: "Incident" },
      ],
      meta: { Note: "No OSHA incident data model exists yet — see code comment for the schema addition needed." },
    });
  } catch (err) {
    console.error(err);
    return sendError(res, "oshaReport failed", 500);
  }
}

/**
 * GET /api/reports/legacy/federal-eeo
 * Filters: branch, dateType(applied loosely to assignment start_date), startDate, endDate
 *
 * NOTE: "Veteran Status" is requested in the sample but ApplicantDemographic
 * has no veteran_status field — it is returned as "Not Captured" rather than
 * guessed. Job-category → EEO-1 category mapping is approximate; see
 * EEO_JOB_CATEGORY_MAP above.
 */
export async function federalEEOReport(req: Request, res: Response) {
  try {
    const branch = req.query.branch as string | undefined;
    const dateRange = parseDateFilter(req);

    const applicants = await prisma.applicant.findMany({
      where: {
        ...(branch ? { office_name: branch } : {}),
        applications: {
          some: {
            assignment: {
              ...(dateRange ? { start_date: dateRange } : {}),
              OR: [{ end_date: null }, { end_date: { gte: new Date() } }],
            },
          },
        },
      },
      select: {
        full_name: true,
        office_name: true,
        demographic: { select: { gender: true, race: true, disability: true, employee_number: true } },
        applications: {
          select: {
            job: { select: { job_title: true, job_category: true } },
            assignment: { select: { start_date: true, end_date: true } },
          },
        },
      },
    });

    const rows = applicants
      .filter((a) => a.applications.some((app) => app.assignment))
      .map((a) => {
        const activeApp = a.applications.find((app) => app.assignment && (!app.assignment.end_date || app.assignment.end_date >= new Date())) ?? a.applications[0];
        return {
          site_name: a.office_name ?? "",
          employee_id: a.demographic?.employee_number ?? "",
          employee_name: a.full_name,
          gender: a.demographic?.gender ?? "",
          eeo_race: a.demographic?.race ?? "",
          disability: a.demographic?.disability ?? "",
          veteran_status: "Not Captured",
          job_position: activeApp?.job.job_title ?? "",
          mapping_job_category: activeApp?.job.job_category ? EEO_JOB_CATEGORY_MAP[activeApp.job.job_category] ?? "Other" : "",
        };
      });

    return respondWithReport(req, res, {
      filename: "federal-eeo-report",
      title: "Federal EEO Report",
      rows,
      columns: [
        { key: "site_name", label: "SiteName" },
        { key: "employee_id", label: "EmployeeID" },
        { key: "employee_name", label: "EmployeeName" },
        { key: "gender", label: "Gender" },
        { key: "eeo_race", label: "EEORace" },
        { key: "disability", label: "Disability" },
        { key: "veteran_status", label: "VeteranStatus" },
        { key: "job_position", label: "JobPosition" },
        { key: "mapping_job_category", label: "MappingJobCategory" },
      ],
    });
  } catch (err) {
    console.error(err);
    return sendError(res, "federalEEOReport failed", 500);
  }
}

/**
 * GET /api/reports/legacy/accrued-hours
 * Filters: customer(orgId), employeeName(search), assigned(Y/N), startDate, endDate, branch
 */
export async function accruedHoursReport(req: Request, res: Response) {
  try {
    const dateRange = parseDateFilter(req);
    const orgId = req.query.orgId as string | undefined;
    const branch = req.query.branch as string | undefined;
    const assignedFilter = req.query.assigned as string | undefined; // "Y" | "N"

    const assignments = await prisma.assignment.findMany({
      where: {
        application: { job: orgId ? { organization_id: orgId } : undefined },
      },
      select: {
        start_date: true,
        end_date: true,
        application: {
          select: {
            applicant: { select: { full_name: true, office_division: true } },
            job: { select: { organization: { select: { name: true } } } },
          },
        },
        timesheets: {
          where: dateRange ? { week_start_date: dateRange } : undefined,
          select: { total_hours: true },
        },
      },
    });

    const now = new Date();
    const rows = assignments
      .map((a) => {
        const isAssigned = !a.end_date || a.end_date >= now;
        return {
          customer: a.application.job.organization.name,
          employee_name: a.application.applicant.full_name,
          branch: a.application.applicant.office_division ?? "",
          assigned: isAssigned ? "Yes" : "No",
          start_date: a.start_date,
          end_date: a.end_date,
          accrued_hours: a.timesheets.reduce((s, t) => s + num(t.total_hours), 0).toFixed(2),
        };
      })
      .filter((r) => !branch || r.branch === branch)
      .filter((r) => !assignedFilter || (assignedFilter.toUpperCase() === "Y" ? r.assigned === "Yes" : r.assigned === "No"));

    return respondWithReport(req, res, {
      filename: "accrued-hours-report",
      title: "Accrued Hours Report",
      rows,
      columns: [
        { key: "customer", label: "Customer Name" },
        { key: "employee_name", label: "Employee Name" },
        { key: "branch", label: "Branch" },
        { key: "assigned", label: "Assigned" },
        { key: "start_date", label: "Start Date" },
        { key: "end_date", label: "End Date" },
        { key: "accrued_hours", label: "Accrued Hours" },
      ],
    });
  } catch (err) {
    console.error(err);
    return sendError(res, "accruedHoursReport failed", 500);
  }
}

/**
 * GET /api/reports/legacy/active-assignment
 * Filters: branch, startDate, endDate, orgId (customer), employeeType (W2/1099)
 */
export async function activeAssignmentReport(req: Request, res: Response) {
  try {
    const branch = req.query.branch as string | undefined;
    const employeeType = req.query.employeeType as "W2" | "1099" | undefined;
    const rows = await buildAssignmentDirectory(employeeType, branch, true);

    return respondWithReport(req, res, {
      filename: "active-assignment-report",
      title: "Active Assignment Report",
      rows,
      columns: [
        { key: "branch", label: "Branch" },
        { key: "start_date", label: "Start Date" },
        { key: "end_date", label: "End Date" },
        { key: "customer", label: "Customer" },
        { key: "employee_type", label: "Employee Type" },
        { key: "employee_name", label: "Employee" },
        { key: "job_title", label: "Job Title" },
      ],
    });
  } catch (err) {
    console.error(err);
    return sendError(res, "activeAssignmentReport failed", 500);
  }
}

/**
 * GET /api/reports/legacy/deduction-submittal
 * Filters: dateType (effectiveDate only — no separate check-date field on
 * BenefitDeduction), startDate, endDate, deductionCategory, groupBy (branch|deduction)
 */
export async function deductionSubmittalReport(req: Request, res: Response) {
  try {
    const dateRange = parseDateFilter(req);
    const category = req.query.deductionCategory as string | undefined;
    const groupBy = (req.query.groupBy as string) || "branch";

    const deductions = await prisma.benefitDeduction.findMany({
      where: {
        is_active: true,
        ...(dateRange ? { effective_date: dateRange } : {}),
        ...(category ? { deduction_type: { equals: category, mode: "insensitive" } } : {}),
      },
      select: {
        deduction_type: true,
        amount: true,
        percentage: true,
        effective_date: true,
        applicant: { select: { office_division: true } },
      },
    });

    const key = (d: (typeof deductions)[number]) => (groupBy === "deduction" ? d.deduction_type : d.applicant.office_division ?? "Unassigned");

    const grouped = new Map<string, { amount: number; count: number }>();
    for (const d of deductions) {
      const k = key(d);
      const acc = grouped.get(k) ?? { amount: 0, count: 0 };
      acc.amount += num(d.amount);
      acc.count += 1;
      grouped.set(k, acc);
    }

    const rows = [...grouped.entries()].map(([groupLabel, t]) => ({
      group: groupLabel,
      deduction_count: t.count,
      total_amount: money(t.amount),
    }));

    return respondWithReport(req, res, {
      filename: "deduction-submittal-report",
      title: `Deduction Submittal Report (grouped by ${groupBy})`,
      rows,
      columns: [
        { key: "group", label: groupBy === "deduction" ? "Deduction" : "Branch" },
        { key: "deduction_count", label: "# Deductions" },
        { key: "total_amount", label: "Total Amount" },
      ],
    });
  } catch (err) {
    console.error(err);
    return sendError(res, "deductionSubmittalReport failed", 500);
  }
}

/**
 * GET /api/reports/legacy/employee-deduction-contribution
 * Column layout matches the supplied sample sheet 2, unified across
 * BenefitDeduction, Garnishment, and BankAccount (the "AdvanceBank"
 * sample row lines up with the BankAccount model).
 *
 * NOTE: the sample distinguishes "EmployeeID" from "BoldTalentID" as two
 * separate identifiers, and includes an applicant "MiddleName". The
 * current schema only has one HR identifier (`ApplicantDemographic
 * .employee_number`) and no applicant middle name — both are surfaced
 * from the closest available field with the gap called out below.
 */
export async function employeeDeductionContributionReport(req: Request, res: Response) {
  try {
    const branch = req.query.branch as string | undefined;

    const [deductions, garnishments, bankAccounts] = await Promise.all([
      prisma.benefitDeduction.findMany({
        where: { is_active: true },
        select: {
          deduction_type: true,
          amount: true,
          percentage: true,
          applicant: {
            select: { applicant_id: true, status: true, first_name: true, last_name: true, office_division: true, demographic: { select: { employee_number: true } } },
          },
        },
      }),
      prisma.garnishment.findMany({
        where: { is_active: true },
        select: {
          garnishment_type: true,
          amount: true,
          percentage: true,
          priority_order: true,
          applicant: {
            select: { applicant_id: true, status: true, first_name: true, last_name: true, office_division: true, demographic: { select: { employee_number: true } } },
          },
        },
      }),
      prisma.bankAccount.findMany({
        where: { is_active: true },
        select: {
          bank_name: true,
          amount: true,
          amount_type: true,
          sequence: true,
          applicant: {
            select: { applicant_id: true, status: true, first_name: true, last_name: true, office_division: true, demographic: { select: { employee_number: true } } },
          },
        },
      }),
    ]);

    type Row = {
      employee_branch: string;
      employee_status: string;
      employee_id: string;
      bold_talent_id: string;
      first_name: string;
      middle_name: string;
      last_name: string;
      type: string;
      name: string;
      amount: string;
      is_fixed_amount: string;
      is_levy: string;
      is_per_hour: string;
      sequence: string | number;
      active: string;
      percent_of_gross: string;
      percent_of_net: string;
    };

    const baseRow = (a: { office_division: string | null; status: string; first_name: string | null; last_name: string | null; demographic: { employee_number: string | null } | null; applicant_id: string }): Omit<Row, "type" | "name" | "amount" | "is_fixed_amount" | "is_levy" | "is_per_hour" | "sequence" | "active" | "percent_of_gross" | "percent_of_net"> => ({
      employee_branch: a.office_division ?? "",
      employee_status: a.status,
      employee_id: a.demographic?.employee_number ?? a.applicant_id, // NOTE: legacy "EmployeeID" isn't separately modeled; falls back to internal ID
      bold_talent_id: a.demographic?.employee_number ?? "",
      first_name: a.first_name ?? "",
      middle_name: "", // NOTE: not captured on Applicant in current schema
      last_name: a.last_name ?? "",
    });

    const rows: Row[] = [
      ...deductions.map((d) => ({
        ...baseRow(d.applicant),
        type: "Deduction",
        name: d.deduction_type,
        amount: money(d.amount),
        is_fixed_amount: d.amount ? "TRUE" : "FALSE",
        is_levy: "FALSE",
        is_per_hour: "FALSE",
        sequence: "",
        active: "TRUE",
        percent_of_gross: d.percentage ? "TRUE" : "FALSE",
        percent_of_net: "FALSE",
      })),
      ...garnishments.map((g) => ({
        ...baseRow(g.applicant),
        type: "Garnishment",
        name: g.garnishment_type,
        amount: money(g.amount),
        is_fixed_amount: g.amount ? "TRUE" : "FALSE",
        is_levy: /levy/i.test(g.garnishment_type) ? "TRUE" : "FALSE",
        is_per_hour: "FALSE",
        sequence: g.priority_order,
        active: "TRUE",
        percent_of_gross: g.percentage ? "TRUE" : "FALSE",
        percent_of_net: "FALSE",
      })),
      ...bankAccounts.map((b) => ({
        ...baseRow(b.applicant),
        type: "Deduction",
        name: b.bank_name,
        amount: money(b.amount),
        is_fixed_amount: b.amount_type === "FIXED" ? "TRUE" : "FALSE",
        is_levy: "FALSE",
        is_per_hour: "FALSE",
        sequence: b.sequence ?? "",
        active: "TRUE",
        percent_of_gross: "FALSE",
        percent_of_net: "FALSE",
      })),
    ].filter((r) => !branch || r.employee_branch === branch);

    return respondWithReport(req, res, {
      filename: "employee-deduction-contribution-report",
      title: "Employee Deduction/Contribution Report",
      rows,
      columns: [
        { key: "employee_branch", label: "EmployeeBranch" },
        { key: "employee_status", label: "EmployeeStatus" },
        { key: "employee_id", label: "EmployeeID" },
        { key: "bold_talent_id", label: "BoldTalentID" },
        { key: "first_name", label: "FirstName" },
        { key: "middle_name", label: "MiddleName" },
        { key: "last_name", label: "LastName" },
        { key: "type", label: "Deduction/Contribution Type" },
        { key: "name", label: "Deduction/Contribution Name" },
        { key: "amount", label: "Amount" },
        { key: "is_fixed_amount", label: "IsFixedAmount" },
        { key: "is_levy", label: "IsLevy" },
        { key: "is_per_hour", label: "IsPerHour" },
        { key: "sequence", label: "Sequence" },
        { key: "active", label: "Active" },
        { key: "percent_of_gross", label: "PercentOfGross" },
        { key: "percent_of_net", label: "PercentOfNet" },
      ],
    });
  } catch (err) {
    console.error(err);
    return sendError(res, "employeeDeductionContributionReport failed", 500);
  }
}

// ═════════════════════════════════════════════════════════════════════════
// REPORT CATALOG — discovery endpoint for the frontend reports directory
// ═════════════════════════════════════════════════════════════════════════

/** GET /api/reports/catalog */
export async function getReportCatalog(req: Request, res: Response) {
  const catalog = {
    yearEndTaxDocuments: [
      { key: "w2-employees", path: "/api/reports/w2/employees", params: ["taxYear"] },
      { key: "w2-pdf", path: "/api/reports/w2/:applicantId/:taxYear/pdf" },
      { key: "w2-print-batch", path: "/api/reports/w2/print-batch", params: ["taxYear", "applicantIds"] },
      { key: "1099-contractors", path: "/api/reports/1099/contractors", params: ["taxYear"] },
      { key: "1099-pdf", path: "/api/reports/1099/:applicantId/:taxYear/pdf" },
      { key: "notify-tax-document", path: "POST /api/reports/tax-documents/:applicantId/notify" },
      { key: "record-consent", path: "POST /api/reports/tax-documents/:applicantId/consent" },
    ],
    payrollReports: [
      { key: "payroll-register", path: "/api/reports/payroll/register", params: ["startDate", "endDate", "branch", "batchId"] },
      { key: "payroll-summary", path: "/api/reports/payroll/summary", params: ["startDate", "endDate"] },
      { key: "earnings-report", path: "/api/reports/payroll/earnings", params: ["startDate", "endDate"] },
      { key: "deduction-report", path: "/api/reports/payroll/deductions", params: ["startDate", "endDate", "branch"] },
      { key: "tax-liability-report", path: "/api/reports/payroll/tax-liability", params: ["startDate", "endDate"] },
      { key: "ach-register", path: "/api/reports/payroll/ach-register", params: ["startDate", "endDate"] },
    ],
    billingReports: [
      { key: "invoice-register", path: "/api/reports/billing/invoice-register", params: ["startDate", "endDate", "statuses", "orgId"] },
      { key: "revenue-by-customer", path: "/api/reports/billing/revenue-by-customer", params: ["startDate", "endDate"] },
      { key: "revenue-by-employee", path: "/api/reports/billing/revenue-by-employee", params: ["startDate", "endDate"] },
      { key: "revenue-by-branch", path: "/api/reports/billing/revenue-by-branch", params: ["startDate", "endDate"] },
      { key: "outstanding-invoices", path: "/api/reports/billing/outstanding-invoices", params: ["orgId"] },
      { key: "customer-billing-summary", path: "/api/reports/billing/customer-summary" },
    ],
    complianceReports: [
      { key: "aca-eligibility", path: "/api/reports/compliance/aca-eligibility", params: ["measurementDays"] },
      { key: "workers-comp", path: "/api/reports/compliance/workers-comp", params: ["startDate", "endDate"] },
      { key: "paid-sick-leave", path: "/api/reports/compliance/paid-sick-leave", params: ["startDate", "endDate"] },
      { key: "employee-hours", path: "/api/reports/compliance/employee-hours", params: ["startDate", "endDate", "branch"] },
      { key: "w2-employees-directory", path: "/api/reports/compliance/w2-employees", params: ["branch"] },
      { key: "1099-contractors-directory", path: "/api/reports/compliance/1099-contractors", params: ["branch"] },
    ],
    priorityReports: [
      { key: "new-hire", path: "/api/reports/legacy/new-hire", params: ["startDate", "endDate", "branch", "orgId", "jobTitle", "employeeType"] },
      { key: "osha", path: "/api/reports/legacy/osha", note: "Stubbed — no OSHA incident table in schema yet." },
      { key: "federal-eeo", path: "/api/reports/legacy/federal-eeo", params: ["branch", "startDate", "endDate"] },
      { key: "accrued-hours", path: "/api/reports/legacy/accrued-hours", params: ["orgId", "branch", "assigned", "startDate", "endDate"] },
      { key: "active-assignment", path: "/api/reports/legacy/active-assignment", params: ["branch", "employeeType"] },
      { key: "deduction-submittal", path: "/api/reports/legacy/deduction-submittal", params: ["startDate", "endDate", "deductionCategory", "groupBy"] },
      { key: "employee-deduction-contribution", path: "/api/reports/legacy/employee-deduction-contribution", params: ["branch"] },
    ],
    formats: ["csv (default)", "pdf", "json"],
  };

  return sendSuccess(res, catalog);
}

// ═════════════════════════════════════════════════════════════════════════
// SUGGESTED ROUTES (wire these up in your routes file — not included here
// since only the controller was requested):
//
// router.get("/reports/catalog", getReportCatalog);
//
// // Module 11
// router.get("/reports/w2/employees", listW2Employees);
// router.get("/reports/w2/:applicantId/:taxYear/pdf", generateW2PDF);
// router.get("/reports/w2/print-batch", printW2Batch);
// router.get("/reports/1099/contractors", list1099Contractors);
// router.get("/reports/1099/:applicantId/:taxYear/pdf", generate1099PDF);
// router.post("/reports/tax-documents/:applicantId/notify", notifyTaxDocumentAvailable);
// router.post("/reports/tax-documents/:applicantId/consent", recordTaxDocumentConsent);
//
// // Module 12 — Payroll
// router.get("/reports/payroll/register", payrollRegister);
// router.get("/reports/payroll/summary", payrollSummary);
// router.get("/reports/payroll/earnings", earningsReport);
// router.get("/reports/payroll/deductions", deductionReport);
// router.get("/reports/payroll/tax-liability", taxLiabilityReport);
// router.get("/reports/payroll/ach-register", achRegister);
//
// // Module 12 — Billing
// router.get("/reports/billing/invoice-register", invoiceRegister);
// router.get("/reports/billing/revenue-by-customer", revenueByCustomer);
// router.get("/reports/billing/revenue-by-employee", revenueByEmployee);
// router.get("/reports/billing/revenue-by-branch", revenueByBranch);
// router.get("/reports/billing/outstanding-invoices", outstandingInvoices);
// router.get("/reports/billing/customer-summary", customerBillingSummary);
//
// // Module 12 — Compliance
// router.get("/reports/compliance/aca-eligibility", acaEligibilityReport);
// router.get("/reports/compliance/workers-comp", workersCompensationReport);
// router.get("/reports/compliance/paid-sick-leave", paidSickLeaveReport);
// router.get("/reports/compliance/employee-hours", employeeHoursReport);
// router.get("/reports/compliance/w2-employees", w2EmployeesReport);
// router.get("/reports/compliance/1099-contractors", contractors1099Report);
//
// // Priority / Avionte-parity reports
// router.get("/reports/legacy/new-hire", newHireReport);
// router.get("/reports/legacy/osha", oshaReport);
// router.get("/reports/legacy/federal-eeo", federalEEOReport);
// router.get("/reports/legacy/accrued-hours", accruedHoursReport);
// router.get("/reports/legacy/active-assignment", activeAssignmentReport);
// router.get("/reports/legacy/deduction-submittal", deductionSubmittalReport);
// router.get("/reports/legacy/employee-deduction-contribution", employeeDeductionContributionReport);
// ═════════════════════════════════════════════════════════════════════════