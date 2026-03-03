import { Request, Response } from 'express';
import prisma from '../../prisma.config';
import { sendSuccess, sendError } from '../../utils/response';
import { Decimal } from '@prisma/client/runtime/library';
import { generateInvoicePdf } from './../../services/invoiceService';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

const getWeekStart = (date: Date): Date => {
  const d = new Date(date);
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  d.setUTCHours(0, 0, 0, 0);
  return d;
};

const getWeekEnd = (weekStart: Date): Date => {
  const d = new Date(weekStart);
  d.setUTCDate(d.getUTCDate() + 6);
  d.setUTCHours(23, 59, 59, 999);
  return d;
};

const getWeekLabel = (weekStart: Date): string => {
  const jan1   = new Date(Date.UTC(weekStart.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(
    ((weekStart.getTime() - jan1.getTime()) / 86400000 + jan1.getUTCDay() + 1) / 7
  );
  return `${weekStart.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
};

const currentWeekBounds = () => {
  const now   = new Date();
  const start = getWeekStart(now);
  const end   = getWeekEnd(start);
  return { start, end };
};

const recalculateTimesheetTotals = async (timesheetId: string): Promise<void> => {
  const entries = await prisma.timeEntry.findMany({ where: { timesheet_id: timesheetId } });
  const totalRegular = entries.reduce((s, e) => s + Number(e.regular_hours), 0);
  const totalOt      = entries.reduce((s, e) => s + Number(e.ot_hours), 0);
  await prisma.timesheet.update({
    where: { timesheet_id: timesheetId },
    data: {
      total_regular_hours: new Decimal(totalRegular),
      total_ot_hours:      new Decimal(totalOt),
      total_hours:         new Decimal(totalRegular + totalOt),
    },
  });
};

/**
 * Compute billing. Now respects per-timesheet custom rates.
 * Priority: timesheet.custom_* → JobRate → error
 */
const computeBilling = async (
  assignmentId: string,
  regularHours: Decimal,
  otHours: Decimal,
  timesheetRateOverrides?: {
    custom_bill_rate?:         Decimal | null;
    custom_ot_bill_rate?:      Decimal | null;
    custom_pay_rate?:          Decimal | null;
    custom_ot_pay_rate?:       Decimal | null;
  }
) => {
  const assignment = await prisma.assignment.findUnique({
    where: { assignment_id: assignmentId },
    include: {
      application: {
        include: {
          job: {
            include: { job_rates: { take: 1, orderBy: { job_rate_id: 'desc' } } },
          },
        },
      },
    },
  });

  if (!assignment) throw new Error('Assignment not found');

  const rate = assignment.application.job.job_rates[0];

  // Resolve rates: custom override → job rate → error
  const resolveRate = (custom: Decimal | null | undefined, jobVal: Decimal | null | undefined, fallback?: () => Decimal): Decimal => {
    if (custom != null) return new Decimal(custom);
    if (jobVal != null) return new Decimal(jobVal);
    if (fallback) return fallback();
    throw new Error(
      `No billing rate configured for job "${assignment.application.job.job_title}". ` +
      `Please add a rate or set a custom rate on this timesheet.`
    );
  };

  const billRate   = resolveRate(timesheetRateOverrides?.custom_bill_rate, rate?.bill_rate);
  const otBillRate = resolveRate(timesheetRateOverrides?.custom_ot_bill_rate, rate?.ot_bill_rate, () => billRate.mul(1.5));
  const payRate    = resolveRate(timesheetRateOverrides?.custom_pay_rate, rate?.pay_rate, () => new Decimal(0));
  const otPayRate  = resolveRate(timesheetRateOverrides?.custom_ot_pay_rate, rate?.ot_pay_rate, () => payRate.mul(1.5));

  const totalBill = billRate.mul(regularHours).add(otBillRate.mul(otHours));
  const totalPay  = payRate.mul(regularHours).add(otPayRate.mul(otHours));

  return { billRate, otBillRate, payRate, otPayRate, totalBill, totalPay };
};

const generateInvoiceNumber = async (): Promise<string> => {
  const year  = new Date().getUTCFullYear();
  const count = await prisma.invoice.count({
    where: { invoice_date: { gte: new Date(`${year}-01-01T00:00:00Z`) } },
  });
  return `INV-${year}-${String(count + 1).padStart(4, '0')}`;
};

// ─────────────────────────────────────────────────────────────
// TIMESHEET ENDPOINTS
// ─────────────────────────────────────────────────────────────

export const getAllTimesheets = async (req: Request, res: Response) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page  as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const skip  = (page - 1) * limit;

    const { assignmentId, status, weekStart, search } = req.query;
    const andClauses: any[] = [];

    if (assignmentId) andClauses.push({ assignment_id: assignmentId });
    if (status)       andClauses.push({ status });
    if (weekStart)    andClauses.push({ week_start_date: getWeekStart(new Date(weekStart as string)) });
    if (search) {
      const term = (search as string).trim();
      andClauses.push({
        OR: [
          { assignment: { application: { applicant: { full_name: { contains: term, mode: 'insensitive' } } } } },
          { assignment: { application: { job: { job_title:  { contains: term, mode: 'insensitive' } } } } },
          { assignment: { application: { job: { organization: { name: { contains: term, mode: 'insensitive' } } } } } },
        ],
      });
    }

    const where: any = andClauses.length > 0 ? { AND: andClauses } : {};

    const [timesheets, total] = await Promise.all([
      prisma.timesheet.findMany({
        where, skip, take: limit,
        orderBy: { created_at: 'desc' },
        include: {
          assignment: {
            include: {
              application: {
                include: {
                  applicant: { select: { applicant_id: true, full_name: true } },
                  job: {
                    select: {
                      job_id: true, job_title: true,
                      organization: { select: { organization_id: true, name: true } },
                    },
                  },
                },
              },
            },
          },
          reviewed_by: { select: { user_id: true, name: true } },
          invoice: {
            select: { invoice_id: true, invoice_number: true, status: true, total_amount: true, pdf_url: true },
          },
          _count: { select: { time_entries: true } },
        },
      }),
      prisma.timesheet.count({ where }),
    ]);

    return sendSuccess(res, {
      data:   timesheets,
      paging: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (err: any) {
    console.error('getAllTimesheets:', err);
    return sendError(res, 'Failed to fetch timesheets', 500);
  }
};

export const getTimesheetStats = async (req: Request, res: Response) => {
  try {
    const { assignmentId, status, weekStart, weekEnd } = req.query;
    const where: any = {};
    if (assignmentId) where.assignment_id = assignmentId;
    if (status)       where.status        = status;
    if (weekStart || weekEnd) {
      where.week_start_date = {};
      if (weekStart) where.week_start_date.gte = getWeekStart(new Date(weekStart as string));
      if (weekEnd)   where.week_start_date.lte = getWeekStart(new Date(weekEnd   as string));
    }

    const [statusGroups, totals] = await Promise.all([
      prisma.timesheet.groupBy({ by: ['status'], where, _count: { timesheet_id: true } }),
      prisma.timesheet.aggregate({
        where,
        _sum: {
          total_regular_hours: true, total_ot_hours: true, total_hours: true,
          total_bill_amount: true, total_pay_amount: true,
        },
        _avg:   { total_hours: true },
        _count: { timesheet_id: true },
      }),
    ]);

    return sendSuccess(res, {
      total_timesheets:    totals._count.timesheet_id,
      total_regular_hours: totals._sum.total_regular_hours ?? 0,
      total_ot_hours:      totals._sum.total_ot_hours      ?? 0,
      total_hours:         totals._sum.total_hours         ?? 0,
      total_billed:        totals._sum.total_bill_amount   ?? 0,
      total_payroll:       totals._sum.total_pay_amount    ?? 0,
      avg_hours_per_week:  totals._avg.total_hours         ?? 0,
      by_status: statusGroups.map(g => ({ status: g.status, count: g._count.timesheet_id })),
    });
  } catch (err: any) {
    console.error('getTimesheetStats:', err);
    return sendError(res, 'Failed to fetch statistics', 500);
  }
};

export const getTimesheetsByAssignment = async (req: Request, res: Response) => {
  try {
    const { assignmentId } = req.params;
    const page  = Math.max(1, parseInt(req.query.page  as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const skip  = (page - 1) * limit;

    const assignment = await prisma.assignment.findUnique({ where: { assignment_id: assignmentId } });
    if (!assignment) return sendError(res, 'Assignment not found', 404);

    const [timesheets, total] = await Promise.all([
      prisma.timesheet.findMany({
        where: { assignment_id: assignmentId }, skip, take: limit,
        orderBy: { week_start_date: 'desc' },
        include: {
          time_entries: { orderBy: { work_date: 'asc' } },
          reviewed_by:  { select: { user_id: true, name: true } },
          invoice: {
            select: { invoice_id: true, invoice_number: true, status: true, total_amount: true, pdf_url: true },
          },
          payroll: { select: { payroll_id: true, gross_pay: true, net_pay: true, processed_at: true } },
        },
      }),
      prisma.timesheet.count({ where: { assignment_id: assignmentId } }),
    ]);

    return sendSuccess(res, {
      data:   timesheets,
      paging: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (err: any) {
    console.error('getTimesheetsByAssignment:', err);
    return sendError(res, 'Failed to fetch timesheets', 500);
  }
};

export const getTimesheetById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const timesheet = await prisma.timesheet.findUnique({
      where: { timesheet_id: id },
      include: {
        time_entries: { orderBy: { work_date: 'asc' } },
        reviewed_by:  { select: { user_id: true, name: true, email: true } },
        invoice: true,
        payroll: true,
        assignment: {
          include: {
            application: {
              include: {
                applicant: { include: { contact: true } },
                job: {
                  include: {
                    job_rates:    { take: 1, orderBy: { job_rate_id: 'desc' } },
                    organization: { select: { organization_id: true, name: true, website: true } },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!timesheet) return sendError(res, 'Timesheet not found', 404);
    return sendSuccess(res, timesheet);
  } catch (err: any) {
    console.error('getTimesheetById:', err);
    return sendError(res, 'Failed to fetch timesheet', 500);
  }
};

/**
 * POST /api/timesheets
 * Create or retrieve the timesheet for a given assignment + week (idempotent).
 * NEW: checks timesheets_enabled on the assignment.
 * NEW: accepts optional rate override fields.
 * Body: {
 *   assignment_id, week_start_date, notes?,
 *   custom_bill_rate?, custom_ot_bill_rate?, custom_pay_rate?, custom_ot_pay_rate?,
 *   custom_markup_percentage?, custom_overtime_rule?, rate_override_reason?
 * }
 */
export const createOrGetTimesheet = async (req: Request, res: Response) => {
  try {
    const {
      assignment_id, week_start_date, notes,
      custom_bill_rate, custom_ot_bill_rate, custom_pay_rate, custom_ot_pay_rate,
      custom_markup_percentage, custom_overtime_rule, rate_override_reason,
    } = req.body;

    if (!assignment_id || !week_start_date) {
      return sendError(res, 'assignment_id and week_start_date are required', 400);
    }

    const assignment = await prisma.assignment.findUnique({ where: { assignment_id } });
    if (!assignment) return sendError(res, 'Assignment not found', 404);

    // Block if timesheets are disabled for this assignment
    if ((assignment as any).timesheets_enabled === false) {
      return sendError(res, 'Timesheets are disabled for this assignment', 403);
    }

    const weekStart = getWeekStart(new Date(week_start_date));
    const weekEnd   = getWeekEnd(weekStart);

    const existing = await prisma.timesheet.findUnique({
      where: { assignment_id_week_start_date: { assignment_id, week_start_date: weekStart } },
      include: { time_entries: { orderBy: { work_date: 'asc' } } },
    });

    if (existing) {
      return sendSuccess(res, { ...existing, _returned_existing: true }, 200);
    }

    // Build rate override data — only set fields that were provided
    const rateData: any = {};
    if (custom_bill_rate        != null) rateData.custom_bill_rate        = new Decimal(custom_bill_rate);
    if (custom_ot_bill_rate     != null) rateData.custom_ot_bill_rate     = new Decimal(custom_ot_bill_rate);
    if (custom_pay_rate         != null) rateData.custom_pay_rate         = new Decimal(custom_pay_rate);
    if (custom_ot_pay_rate      != null) rateData.custom_ot_pay_rate      = new Decimal(custom_ot_pay_rate);
    if (custom_markup_percentage!= null) rateData.custom_markup_percentage= new Decimal(custom_markup_percentage);
    if (custom_overtime_rule)            rateData.custom_overtime_rule    = custom_overtime_rule;
    if (rate_override_reason)            rateData.rate_override_reason    = rate_override_reason;

    const timesheet = await prisma.timesheet.create({
      data: {
        assignment_id,
        week_start_date: weekStart,
        week_end_date: weekEnd,
        notes,
        status: 'DRAFT',
        ...rateData,
      },
      include: { time_entries: true },
    });

    return sendSuccess(res, timesheet, 201);
  } catch (err: any) {
    console.error('createOrGetTimesheet:', err);
    return sendError(res, 'Failed to create timesheet', 500);
  }
};

/**
 * PATCH /api/timesheets/:id/rates
 * Update per-timesheet rate overrides on a DRAFT or REJECTED timesheet.
 */
export const updateTimesheetRates = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      custom_bill_rate, custom_ot_bill_rate, custom_pay_rate, custom_ot_pay_rate,
      custom_markup_percentage, custom_overtime_rule, rate_override_reason,
    } = req.body;

    const timesheet = await prisma.timesheet.findUnique({ where: { timesheet_id: id } });
    if (!timesheet) return sendError(res, 'Timesheet not found', 404);
    if (!['DRAFT', 'REJECTED'].includes(timesheet.status)) {
      return sendError(res, `Cannot update rates on a ${timesheet.status} timesheet`, 409);
    }

    const updateData: any = {};
    if (custom_bill_rate         !== undefined) updateData.custom_bill_rate         = custom_bill_rate != null ? new Decimal(custom_bill_rate) : null;
    if (custom_ot_bill_rate      !== undefined) updateData.custom_ot_bill_rate      = custom_ot_bill_rate != null ? new Decimal(custom_ot_bill_rate) : null;
    if (custom_pay_rate          !== undefined) updateData.custom_pay_rate          = custom_pay_rate != null ? new Decimal(custom_pay_rate) : null;
    if (custom_ot_pay_rate       !== undefined) updateData.custom_ot_pay_rate       = custom_ot_pay_rate != null ? new Decimal(custom_ot_pay_rate) : null;
    if (custom_markup_percentage !== undefined) updateData.custom_markup_percentage = custom_markup_percentage != null ? new Decimal(custom_markup_percentage) : null;
    if (custom_overtime_rule     !== undefined) updateData.custom_overtime_rule     = custom_overtime_rule;
    if (rate_override_reason     !== undefined) updateData.rate_override_reason     = rate_override_reason;

    const updated = await prisma.timesheet.update({ where: { timesheet_id: id }, data: updateData });
    return sendSuccess(res, updated);
  } catch (err: any) {
    console.error('updateTimesheetRates:', err);
    return sendError(res, 'Failed to update timesheet rates', 500);
  }
};

export const upsertTimeEntry = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { work_date, regular_hours, ot_hours = 0, break_minutes = 0, work_type = 'REGULAR', notes } = req.body;

    if (work_date === undefined || regular_hours === undefined) {
      return sendError(res, 'work_date and regular_hours are required', 400);
    }

    const timesheet = await prisma.timesheet.findUnique({ where: { timesheet_id: id } });
    if (!timesheet) return sendError(res, 'Timesheet not found', 404);
    if (!['DRAFT', 'REJECTED'].includes(timesheet.status)) {
      return sendError(res, `Cannot edit entries on a ${timesheet.status} timesheet`, 409);
    }

    const entryDate = new Date(work_date);
    entryDate.setUTCHours(0, 0, 0, 0);

    if (entryDate < timesheet.week_start_date || entryDate > timesheet.week_end_date) {
      return sendError(res,
        `work_date must fall within: ${timesheet.week_start_date.toISOString().slice(0, 10)} – ${timesheet.week_end_date.toISOString().slice(0, 10)}`,
        400);
    }

    const regDec = new Decimal(regular_hours);
    const otDec  = new Decimal(ot_hours);

    const entry = await prisma.timeEntry.upsert({
      where: { timesheet_id_work_date: { timesheet_id: id, work_date: entryDate } },
      update:  { regular_hours: regDec, ot_hours: otDec, total_hours: regDec.add(otDec), break_minutes, work_type, notes },
      create:  { timesheet_id: id, assignment_id: timesheet.assignment_id, work_date: entryDate, regular_hours: regDec, ot_hours: otDec, total_hours: regDec.add(otDec), break_minutes, work_type, notes },
    });

    await recalculateTimesheetTotals(id);
    const updatedTotals = await prisma.timesheet.findUnique({
      where:  { timesheet_id: id },
      select: { total_regular_hours: true, total_ot_hours: true, total_hours: true },
    });

    return sendSuccess(res, { entry, timesheet_totals: updatedTotals });
  } catch (err: any) {
    console.error('upsertTimeEntry:', err);
    return sendError(res, 'Failed to save time entry', 500);
  }
};

export const deleteTimeEntry = async (req: Request, res: Response) => {
  try {
    const { id, entryId } = req.params;

    const timesheet = await prisma.timesheet.findUnique({ where: { timesheet_id: id } });
    if (!timesheet) return sendError(res, 'Timesheet not found', 404);
    if (!['DRAFT', 'REJECTED'].includes(timesheet.status)) {
      return sendError(res, `Cannot delete entries on a ${timesheet.status} timesheet`, 409);
    }

    const entry = await prisma.timeEntry.findFirst({ where: { time_entry_id: entryId, timesheet_id: id } });
    if (!entry) return sendError(res, 'Time entry not found', 404);

    await prisma.timeEntry.delete({ where: { time_entry_id: entryId } });
    await recalculateTimesheetTotals(id);

    return sendSuccess(res, { deleted: true, time_entry_id: entryId });
  } catch (err: any) {
    console.error('deleteTimeEntry:', err);
    return sendError(res, 'Failed to delete time entry', 500);
  }
};

export const submitTimesheet = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const timesheet = await prisma.timesheet.findUnique({
      where: { timesheet_id: id },
      include: { time_entries: true },
    });
    if (!timesheet) return sendError(res, 'Timesheet not found', 404);
    if (!['DRAFT', 'REJECTED'].includes(timesheet.status)) {
      return sendError(res, `Timesheet is already ${timesheet.status}`, 409);
    }
    if (timesheet.time_entries.length === 0) {
      return sendError(res, 'Cannot submit a timesheet with no time entries', 400);
    }

    const updated = await prisma.timesheet.update({
      where: { timesheet_id: id },
      data:  { status: 'SUBMITTED', submitted_at: new Date() },
    });

    return sendSuccess(res, updated);
  } catch (err: any) {
    console.error('submitTimesheet:', err);
    return sendError(res, 'Failed to submit timesheet', 500);
  }
};

/**
 * POST /api/timesheets/:id/approve
 * Now reads custom rate overrides from the timesheet row itself.
 */
export const approveTimesheet = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { reviewed_by_user_id, tax_rate = 0, net_terms_days = 30 } = req.body;

    if (!reviewed_by_user_id) return sendError(res, 'reviewed_by_user_id is required', 400);

    const timesheet = await prisma.timesheet.findUnique({
      where: { timesheet_id: id },
      include: { time_entries: true },
    });
    if (!timesheet) return sendError(res, 'Timesheet not found', 404);
    if (!['SUBMITTED', 'UNDER_REVIEW'].includes(timesheet.status)) {
      return sendError(res, `Cannot approve a ${timesheet.status} timesheet`, 409);
    }

    const reviewer = await prisma.user.findUnique({ where: { user_id: reviewed_by_user_id } });
    if (!reviewer) return sendError(res, 'Reviewer user not found', 404);

    // Pass custom overrides from the timesheet row
    const billing = await computeBilling(
      timesheet.assignment_id,
      timesheet.total_regular_hours,
      timesheet.total_ot_hours,
      {
        custom_bill_rate:    (timesheet as any).custom_bill_rate,
        custom_ot_bill_rate: (timesheet as any).custom_ot_bill_rate,
        custom_pay_rate:     (timesheet as any).custom_pay_rate,
        custom_ot_pay_rate:  (timesheet as any).custom_ot_pay_rate,
      }
    );

    const taxRateDec    = new Decimal(tax_rate);
    const taxAmount     = billing.totalBill.mul(taxRateDec);
    const invoiceTotal  = billing.totalBill.add(taxAmount);
    const invoiceNumber = await generateInvoiceNumber();
    const invoiceDate   = new Date();
    const dueDate       = new Date(invoiceDate);
    dueDate.setUTCDate(dueDate.getUTCDate() + net_terms_days);
    const payPeriod = getWeekLabel(timesheet.week_start_date);

    const { updatedTimesheet, invoice, payroll } = await prisma.$transaction(async (tx) => {
      const updatedTimesheet = await tx.timesheet.update({
        where: { timesheet_id: id },
        data: {
          status: 'APPROVED', reviewed_by_user_id, reviewed_at: new Date(), approved_at: new Date(),
          rejected_at: null, rejection_reason: null,
          bill_rate: billing.billRate, ot_bill_rate: billing.otBillRate,
          pay_rate: billing.payRate, ot_pay_rate: billing.otPayRate,
          total_bill_amount: billing.totalBill, total_pay_amount: billing.totalPay,
        },
      });

      const invoice = await tx.invoice.create({
        data: {
          assignment_id: timesheet.assignment_id, timesheet_id: id,
          invoice_number: invoiceNumber, status: 'DRAFT', invoice_date: invoiceDate, due_date: dueDate,
          regular_hours: timesheet.total_regular_hours, ot_hours: timesheet.total_ot_hours,
          bill_rate: billing.billRate, ot_bill_rate: billing.otBillRate,
          subtotal: billing.totalBill, tax_rate: taxRateDec, tax_amount: taxAmount, total_amount: invoiceTotal,
        },
      });

      const payroll = await tx.payroll.create({
        data: {
          assignment_id: timesheet.assignment_id, timesheet_id: id,
          pay_period: payPeriod,
          regular_hours: timesheet.total_regular_hours, ot_hours: timesheet.total_ot_hours,
          pay_rate: billing.payRate, ot_pay_rate: billing.otPayRate,
          gross_pay: billing.totalPay, net_pay: billing.totalPay,
        },
      });

      return { updatedTimesheet, invoice, payroll };
    });

    generateInvoicePdf(invoice.invoice_id)
      .then(async (pdfUrl) => {
        await prisma.invoice.update({
          where: { invoice_id: invoice.invoice_id },
          data:  { pdf_url: pdfUrl, pdf_generated_at: new Date() },
        });
      })
      .catch(err => console.error('PDF generation failed:', err));

    return sendSuccess(res, {
      timesheet: updatedTimesheet,
      invoice: {
        invoice_id: invoice.invoice_id, invoice_number: invoice.invoice_number,
        subtotal: invoice.subtotal, tax_amount: invoice.tax_amount, total_amount: invoice.total_amount,
        due_date: invoice.due_date, pdf_generating: true,
      },
      payroll: { payroll_id: payroll.payroll_id, pay_period: payroll.pay_period, gross_pay: payroll.gross_pay },
    });
  } catch (err: any) {
    console.error('approveTimesheet:', err);
    if (err.message?.includes('No billing rate') || err.message?.includes('billing rate')) {
      return sendError(res, err.message, 422);
    }
    return sendError(res, 'Failed to approve timesheet', 500);
  }
};

export const rejectTimesheet = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { reviewed_by_user_id, rejection_reason } = req.body;

    if (!reviewed_by_user_id || !rejection_reason) {
      return sendError(res, 'reviewed_by_user_id and rejection_reason are required', 400);
    }

    const timesheet = await prisma.timesheet.findUnique({ where: { timesheet_id: id } });
    if (!timesheet) return sendError(res, 'Timesheet not found', 404);
    if (!['SUBMITTED', 'UNDER_REVIEW'].includes(timesheet.status)) {
      return sendError(res, `Cannot reject a ${timesheet.status} timesheet`, 409);
    }

    const updated = await prisma.timesheet.update({
      where: { timesheet_id: id },
      data: {
        status: 'REJECTED', reviewed_by_user_id, reviewed_at: new Date(),
        rejected_at: new Date(), rejection_reason, approved_at: null,
      },
    });

    return sendSuccess(res, updated);
  } catch (err: any) {
    console.error('rejectTimesheet:', err);
    return sendError(res, 'Failed to reject timesheet', 500);
  }
};

// ─────────────────────────────────────────────────────────────
// ASSIGNMENT TIMESHEET TOGGLE
// ─────────────────────────────────────────────────────────────

/**
 * PATCH /api/timesheets/assignments/:assignmentId/toggle
 * Enable or disable timesheet creation for this assignment.
 * Body: { timesheets_enabled: boolean }
 */
export const toggleAssignmentTimesheets = async (req: Request, res: Response) => {
  try {
    const { assignmentId } = req.params;
    const { timesheets_enabled } = req.body;

    if (typeof timesheets_enabled !== 'boolean') {
      return sendError(res, 'timesheets_enabled must be a boolean', 400);
    }

    const assignment = await prisma.assignment.findUnique({ where: { assignment_id: assignmentId } });
    if (!assignment) return sendError(res, 'Assignment not found', 404);

    const updated = await prisma.assignment.update({
      where: { assignment_id: assignmentId },
      data:  { timesheets_enabled } as any,
    });

    return sendSuccess(res, {
      assignment_id:      assignmentId,
      timesheets_enabled: (updated as any).timesheets_enabled,
      message:            timesheets_enabled ? 'Timesheets enabled for this assignment' : 'Timesheets disabled for this assignment',
    });
  } catch (err: any) {
    console.error('toggleAssignmentTimesheets:', err);
    return sendError(res, 'Failed to update assignment', 500);
  }
};

// ─────────────────────────────────────────────────────────────
// CSV / EXCEL IMPORT
// ─────────────────────────────────────────────────────────────

/**
 * GET /api/timesheets/import/template
 * Returns CSV column headers and example rows as text/csv.
 */
export const downloadImportTemplate = async (_req: Request, res: Response) => {
  const header  = 'week_start_date,worker_email,work_date,regular_hours,ot_hours,break_minutes,work_type,notes';
  const example = '2025-01-06,worker@example.com,2025-01-06,8,0,30,REGULAR,Normal day';
  const example2= '2025-01-06,worker@example.com,2025-01-07,8,2,30,REGULAR,Late project';
  const csv     = [header, example, example2].join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="timesheet_import_template.csv"');
  return res.send(csv);
};

/**
 * POST /api/timesheets/import
 * Accepts a multipart/form-data upload with field "file" (CSV or XLSX).
 * Additional fields: assignment_id, (optional) custom_bill_rate etc.
 *
 * Parsing strategy:
 *   - CSV: built-in line-by-line parse (no dep needed)
 *   - XLSX: uses the 'xlsx' npm package (install: npm i xlsx)
 *
 * One timesheet is created per unique week_start_date found in the file.
 * Rows with errors are skipped; all valid rows are upserted.
 *
 * Returns a detailed import result summary.
 */
export const importTimesheets = async (req: Request, res: Response) => {
  let importRecord: any = null;

  try {
    // multer (or similar) must be configured on this route.
    // Here we read from req.file (memStorage) or req.body.fileContent (base64).
    const {
      assignment_id,
      custom_bill_rate, custom_ot_bill_rate, custom_pay_rate, custom_ot_pay_rate,
      custom_markup_percentage, custom_overtime_rule, rate_override_reason,
      imported_by_user_id,
    } = req.body;

    if (!assignment_id) return sendError(res, 'assignment_id is required', 400);

    const assignment = await prisma.assignment.findUnique({ where: { assignment_id } });
    if (!assignment) return sendError(res, 'Assignment not found', 404);
    if ((assignment as any).timesheets_enabled === false) {
      return sendError(res, 'Timesheets are disabled for this assignment', 403);
    }

    // Get uploaded file
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) return sendError(res, 'No file uploaded. Use multipart/form-data with field name "file"', 400);

    const fileName = file.originalname;
    const isXlsx   = /\.(xlsx|xls)$/i.test(fileName);
    const isCsv    = /\.csv$/i.test(fileName);

    if (!isXlsx && !isCsv) {
      return sendError(res, 'Only CSV (.csv) and Excel (.xlsx / .xls) files are supported', 400);
    }

    // Create import tracking record
    importRecord = await (prisma as any).timesheetImport.create({
      data: {
        assignment_id,
        imported_by: imported_by_user_id || 'system',
        file_name: fileName,
        file_type: isXlsx ? 'XLSX' : 'CSV',
        status: 'PROCESSING',
      },
    });

    // Parse rows
    let rawRows: Record<string, string>[] = [];

    if (isCsv) {
      rawRows = parseCsv(file.buffer.toString('utf-8'));
    } else {
      // xlsx
      try {
        const XLSX = require('xlsx');
        const wb   = XLSX.read(file.buffer, { type: 'buffer', cellDates: true });
        const ws   = wb.Sheets[wb.SheetNames[0]];
        rawRows    = XLSX.utils.sheet_to_json(ws, { raw: false, defval: '' });
      } catch (e: any) {
        await (prisma as any).timesheetImport.update({
          where: { import_id: importRecord.import_id },
          data:  { status: 'FAILED', completed_at: new Date(), errors: [{ row: 0, message: 'Failed to parse XLSX: ' + e.message }] },
        });
        return sendError(res, 'Failed to parse XLSX file: ' + e.message, 422);
      }
    }

    if (rawRows.length === 0) {
      await (prisma as any).timesheetImport.update({
        where: { import_id: importRecord.import_id },
        data:  { status: 'DONE', completed_at: new Date(), row_count: 0, success_count: 0, error_count: 0 },
      });
      return sendSuccess(res, { message: 'File contained no data rows', import_id: importRecord.import_id, success_count: 0, error_count: 0, errors: [] });
    }

    // Rate override object for timesheet creation
    const rateData: any = {};
    if (custom_bill_rate        != null) rateData.custom_bill_rate        = new Decimal(custom_bill_rate);
    if (custom_ot_bill_rate     != null) rateData.custom_ot_bill_rate     = new Decimal(custom_ot_bill_rate);
    if (custom_pay_rate         != null) rateData.custom_pay_rate         = new Decimal(custom_pay_rate);
    if (custom_ot_pay_rate      != null) rateData.custom_ot_pay_rate      = new Decimal(custom_ot_pay_rate);
    if (custom_markup_percentage!= null) rateData.custom_markup_percentage= new Decimal(custom_markup_percentage);
    if (custom_overtime_rule)            rateData.custom_overtime_rule    = custom_overtime_rule;
    if (rate_override_reason)            rateData.rate_override_reason    = rate_override_reason;

    const VALID_WORK_TYPES = ['REGULAR', 'OVERTIME', 'HOLIDAY', 'SICK', 'PTO', 'UNPAID'];
    const errors: { row: number; message: string }[] = [];
    let successCount = 0;

    // Group rows by week
    const weekMap: Map<string, { weekStart: Date; entries: any[] }> = new Map();

    for (let i = 0; i < rawRows.length; i++) {
      const row     = rawRows[i];
      const rowNum  = i + 2; // 1-indexed + header row
      const rowErrs: string[] = [];

      // Normalize column names (trim, lowercase)
      const get = (key: string): string => {
        const val = row[key] ?? row[key.toLowerCase()] ?? row[key.toUpperCase()] ?? '';
        return String(val).trim();
      };

      const workDateStr = get('work_date');
      const weekStartStr = get('week_start_date');
      const regularHoursStr = get('regular_hours');
      const otHoursStr      = get('ot_hours') || '0';
      const breakMinsStr    = get('break_minutes') || '0';
      const workType        = (get('work_type') || 'REGULAR').toUpperCase();
      const notes           = get('notes') || null;

      if (!workDateStr)    rowErrs.push('work_date is required');
      if (!weekStartStr)   rowErrs.push('week_start_date is required');
      if (!regularHoursStr) rowErrs.push('regular_hours is required');

      const workDate = workDateStr ? new Date(workDateStr) : null;
      const weekStartRaw = weekStartStr ? new Date(weekStartStr) : null;

      if (workDate && isNaN(workDate.getTime()))     rowErrs.push(`Invalid work_date: "${workDateStr}"`);
      if (weekStartRaw && isNaN(weekStartRaw.getTime())) rowErrs.push(`Invalid week_start_date: "${weekStartStr}"`);

      const regularHours = parseFloat(regularHoursStr);
      const otHours      = parseFloat(otHoursStr);
      const breakMins    = parseInt(breakMinsStr, 10);

      if (isNaN(regularHours) || regularHours < 0) rowErrs.push(`Invalid regular_hours: "${regularHoursStr}"`);
      if (isNaN(otHours)      || otHours < 0)      rowErrs.push(`Invalid ot_hours: "${otHoursStr}"`);
      if (!VALID_WORK_TYPES.includes(workType))     rowErrs.push(`Invalid work_type: "${workType}". Must be one of: ${VALID_WORK_TYPES.join(', ')}`);

      if (rowErrs.length > 0) {
        errors.push({ row: rowNum, message: rowErrs.join('; ') });
        continue;
      }

      workDate!.setUTCHours(0, 0, 0, 0);
      const weekStart = getWeekStart(weekStartRaw!);
      const weekKey   = weekStart.toISOString();

      if (!weekMap.has(weekKey)) {
        weekMap.set(weekKey, { weekStart, entries: [] });
      }

      weekMap.get(weekKey)!.entries.push({
        work_date:     workDate,
        regular_hours: new Decimal(regularHours),
        ot_hours:      new Decimal(otHours),
        total_hours:   new Decimal(regularHours + otHours),
        break_minutes: isNaN(breakMins) ? 0 : Math.max(0, breakMins),
        work_type:     workType,
        notes:         notes || null,
      });
    }

    // Process each week
    for (const [, { weekStart, entries }] of weekMap.entries()) {
      const weekEnd = getWeekEnd(weekStart);

      // Validate all entries fall within the week
      const weekErrors: { row: number; message: string }[] = [];
      const validEntries = entries.filter(e => {
        if (e.work_date < weekStart || e.work_date > weekEnd) {
          // we don't have original row numbers here, so just note the date
          weekErrors.push({ row: 0, message: `work_date ${e.work_date.toISOString().slice(0,10)} is outside week ${weekStart.toISOString().slice(0,10)}` });
          return false;
        }
        return true;
      });

      errors.push(...weekErrors);

      if (validEntries.length === 0) continue;

      try {
        // Create or get timesheet for this week
        let timesheet = await prisma.timesheet.findUnique({
          where: { assignment_id_week_start_date: { assignment_id, week_start_date: weekStart } },
        });

        if (!timesheet) {
          timesheet = await prisma.timesheet.create({
            data: {
              assignment_id,
              week_start_date: weekStart,
              week_end_date:   weekEnd,
              status: 'DRAFT',
              import_id: importRecord.import_id,
              ...rateData,
            } as any,
          });
        }

        if (!['DRAFT', 'REJECTED'].includes(timesheet.status)) {
          errors.push({ row: 0, message: `Week ${weekStart.toISOString().slice(0,10)}: timesheet is ${timesheet.status} — cannot import to it` });
          continue;
        }

        // Upsert all entries for this week
        await prisma.$transaction(
          validEntries.map(e =>
            prisma.timeEntry.upsert({
              where:  { timesheet_id_work_date: { timesheet_id: timesheet!.timesheet_id, work_date: e.work_date } },
              update: { regular_hours: e.regular_hours, ot_hours: e.ot_hours, total_hours: e.total_hours, break_minutes: e.break_minutes, work_type: e.work_type, notes: e.notes },
              create: { timesheet_id: timesheet!.timesheet_id, assignment_id, work_date: e.work_date, regular_hours: e.regular_hours, ot_hours: e.ot_hours, total_hours: e.total_hours, break_minutes: e.break_minutes, work_type: e.work_type, notes: e.notes },
            })
          )
        );

        await recalculateTimesheetTotals(timesheet.timesheet_id);
        successCount += validEntries.length;
      } catch (e: any) {
        errors.push({ row: 0, message: `Week ${weekStart.toISOString().slice(0,10)}: ${e.message}` });
      }
    }

    // Finalise import record
    await (prisma as any).timesheetImport.update({
      where: { import_id: importRecord.import_id },
      data: {
        status:        errors.length > 0 && successCount === 0 ? 'FAILED' : 'DONE',
        row_count:     rawRows.length,
        success_count: successCount,
        error_count:   errors.length,
        errors:        errors.length > 0 ? errors : undefined,
        completed_at:  new Date(),
      },
    });

    return sendSuccess(res, {
      import_id:     importRecord.import_id,
      file_name:     fileName,
      row_count:     rawRows.length,
      success_count: successCount,
      error_count:   errors.length,
      weeks_created: weekMap.size,
      errors,
    });
  } catch (err: any) {
    console.error('importTimesheets:', err);
    if (importRecord) {
      await (prisma as any).timesheetImport.update({
        where: { import_id: importRecord.import_id },
        data:  { status: 'FAILED', completed_at: new Date(), errors: [{ row: 0, message: err.message }] },
      }).catch(() => {});
    }
    return sendError(res, 'Failed to process import', 500);
  }
};

// ─────────────────────────────────────────────────────────────
// CSV PARSER HELPER
// ─────────────────────────────────────────────────────────────

function parseCsv(content: string): Record<string, string>[] {
  const lines   = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];

  const headers = splitCsvLine(lines[0]);
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const vals = splitCsvLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h.trim()] = (vals[idx] ?? '').trim(); });
    rows.push(row);
  }

  return rows;
}

function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuote = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') { current += '"'; i++; }
      else inQuote = !inQuote;
    } else if (ch === ',' && !inQuote) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

// ─────────────────────────────────────────────────────────────
// INVOICE ENDPOINTS
// ─────────────────────────────────────────────────────────────

export const getAllInvoices = async (req: Request, res: Response) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page  as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const skip  = (page - 1) * limit;

    const { assignmentId, status } = req.query;
    const where: any = {};
    if (assignmentId) where.assignment_id = assignmentId;
    if (status)       where.status        = status;

    const [invoices, total] = await Promise.all([
      prisma.invoice.findMany({
        where, skip, take: limit,
        orderBy: { invoice_date: 'desc' },
        include: {
          timesheet: { select: { week_start_date: true, week_end_date: true, total_hours: true } },
          assignment: {
            include: {
              application: {
                include: {
                  applicant: { select: { full_name: true } },
                  job: {
                    select: {
                      job_title: true,
                      organization: { select: { name: true } },
                    },
                  },
                },
              },
            },
          },
        },
      }),
      prisma.invoice.count({ where }),
    ]);

    return sendSuccess(res, {
      data:   invoices,
      paging: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (err: any) {
    console.error('getAllInvoices:', err);
    return sendError(res, 'Failed to fetch invoices', 500);
  }
};

export const getInvoiceById = async (req: Request, res: Response) => {
  try {
    const { invoiceId } = req.params;
    const invoice = await prisma.invoice.findUnique({
      where: { invoice_id: invoiceId },
      include: {
        timesheet: { include: { time_entries: { orderBy: { work_date: 'asc' } } } },
        assignment: {
          include: {
            application: {
              include: {
                applicant: { include: { contact: true } },
                job: {
                  include: {
                    organization: true,
                    job_rates: { take: 1, orderBy: { job_rate_id: 'desc' } },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!invoice) return sendError(res, 'Invoice not found', 404);
    return sendSuccess(res, invoice);
  } catch (err: any) {
    console.error('getInvoiceById:', err);
    return sendError(res, 'Failed to fetch invoice', 500);
  }
};

export const downloadInvoicePdf = async (req: Request, res: Response) => {
  try {
    const { invoiceId } = req.params;
    const invoice = await prisma.invoice.findUnique({ where: { invoice_id: invoiceId } });
    if (!invoice) return sendError(res, 'Invoice not found', 404);

    let pdfUrl = invoice.pdf_url;

    // Generate if missing, or regenerate if it's an old local URL (pre-Azure migration)
    const isLocalUrl = pdfUrl && (
      pdfUrl.includes('localhost') ||
      pdfUrl.includes('generated-invoices')
    );

    if (!pdfUrl || isLocalUrl) {
      pdfUrl = await generateInvoicePdf(invoiceId);
      await prisma.invoice.update({
        where: { invoice_id: invoiceId },
        data:  { pdf_url: pdfUrl, pdf_generated_at: new Date() },
      });
    }

    // Stream the PDF through our server — the Azure blob URL is never exposed to the client
    const { BlobServiceClient } = await import('@azure/storage-blob');
    const blobServiceClient = BlobServiceClient.fromConnectionString(
      process.env.AZURE_STORAGE_CONNECTION_STRING!
    );
    const containerName = process.env.AZURE_INVOICES_CONTAINER_NAME || 'invoices';
    const filename      = pdfUrl.split('/').pop()!;
    const blockBlobClient = blobServiceClient
      .getContainerClient(containerName)
      .getBlockBlobClient(filename);

    const exists = await blockBlobClient.exists();
    if (!exists) return sendError(res, 'Invoice PDF not found in storage', 404);

    const downloadResponse = await blockBlobClient.download();
    if (!downloadResponse.readableStreamBody) {
      return sendError(res, 'Failed to stream invoice PDF', 500);
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    if (downloadResponse.contentLength) {
      res.setHeader('Content-Length', downloadResponse.contentLength);
    }
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

    downloadResponse.readableStreamBody.pipe(res);
  } catch (err: any) {
    console.error('downloadInvoicePdf:', err);
    return sendError(res, 'Failed to generate invoice PDF', 500);
  }
};

export const updateInvoiceStatus = async (req: Request, res: Response) => {
  try {
    const { invoiceId } = req.params;
    const { status, payment_method, payment_reference } = req.body;

    const VALID = ['DRAFT', 'SENT', 'VIEWED', 'PAID', 'OVERDUE', 'VOID'];
    if (!status || !VALID.includes(status)) {
      return sendError(res, `status must be one of: ${VALID.join(', ')}`, 400);
    }

    const invoice = await prisma.invoice.findUnique({ where: { invoice_id: invoiceId } });
    if (!invoice) return sendError(res, 'Invoice not found', 404);
    if (invoice.status === 'VOID') return sendError(res, 'Cannot update a voided invoice', 409);

    const updateData: any = { status };
    if (status === 'PAID') {
      updateData.paid_at = new Date();
      if (payment_method)    updateData.payment_method    = payment_method;
      if (payment_reference) updateData.payment_reference = payment_reference;
    }

    const updated = await prisma.invoice.update({ where: { invoice_id: invoiceId }, data: updateData });
    return sendSuccess(res, updated);
  } catch (err: any) {
    console.error('updateInvoiceStatus:', err);
    return sendError(res, 'Failed to update invoice status', 500);
  }
};

// ─────────────────────────────────────────────────────────────
// ASSIGNMENT LISTING
// ─────────────────────────────────────────────────────────────

export const getAssignmentsForTimesheets = async (req: Request, res: Response) => {
  try {
    const { start: currentWeekStart } = currentWeekBounds();
    const includeEnded = req.query.includeEnded === 'true';

    const where: any = includeEnded
      ? {}
      : { OR: [{ end_date: null }, { end_date: { gte: currentWeekStart } }] };

    const assignments = await prisma.assignment.findMany({
      where,
      orderBy: { start_date: 'desc' },
      take: 200,
      include: {
        application: {
          include: {
            applicant: { select: { applicant_id: true, full_name: true } },
            job: {
              select: {
                job_id: true, job_title: true, location: true, job_type: true,
                organization: { select: { organization_id: true, name: true } },
                job_rates: {
                  orderBy: { job_rate_id: 'desc' },
                  select: { job_rate_id: true, bill_rate: true, pay_rate: true, ot_bill_rate: true, ot_pay_rate: true, hours: true, markup_percentage: true, overtime_rule: true },
                },
              },
            },
          },
        },
        timesheets: {
          where: { week_start_date: currentWeekStart },
          select: { timesheet_id: true, status: true, total_hours: true },
        },
      },
    });

    const result = assignments.map((a) => {
      const job       = a.application.job;
      const applicant = a.application.applicant;
      const rate      = job.job_rates[0] ?? null;
      const cwt       = a.timesheets[0] ?? null;

      return {
        assignment_id:       a.assignment_id,
        employment_type:     a.employment_type,
        start_date:          a.start_date,
        end_date:            a.end_date,
        timesheets_enabled:  (a as any).timesheets_enabled ?? true,
        applicant: { applicant_id: applicant.applicant_id, full_name: applicant.full_name },
        job: { job_id: job.job_id, job_title: job.job_title, location: job.location, job_type: job.job_type, organization: job.organization },
        rate: rate ? {
          bill_rate: rate.bill_rate, pay_rate: rate.pay_rate,
          ot_bill_rate: rate.ot_bill_rate, ot_pay_rate: rate.ot_pay_rate,
          standard_hours: rate.hours,
        } : null,
        job_rates: job.job_rates,
        current_week_timesheet: cwt,
        display_label: `${applicant.full_name} — ${job.job_title} @ ${job.organization.name}`,
      };
    });

    return sendSuccess(res, { data: result, current_week_start: currentWeekStart, total: result.length });
  } catch (err: any) {
    console.error('getAssignmentsForTimesheets:', err);
    return sendError(res, 'Failed to fetch assignments', 500);
  }
};

export const getTimesheetNotifications = async (req: Request, res: Response) => {
  try {
    const { start: currentWeekStart, end: currentWeekEnd } = currentWeekBounds();

    const activeAssignments = await prisma.assignment.findMany({
      where: {
        AND: [
          { start_date: { lte: currentWeekEnd } },
          { OR: [{ end_date: null }, { end_date: { gte: currentWeekStart } }] },
          { timesheets_enabled: true } as any,
        ],
      },
      include: {
        application: {
          include: {
            applicant: { select: { full_name: true } },
            job: { select: { job_title: true, organization: { select: { name: true } } } },
          },
        },
        timesheets: {
          where: { week_start_date: currentWeekStart },
          select: { timesheet_id: true, status: true, total_hours: true },
        },
      },
      orderBy: { start_date: 'desc' },
    });

    const missing: any[] = [];
    const drafts:  any[] = [];
    const pendingApproval: any[] = [];

    for (const a of activeAssignments) {
      const ts   = a.timesheets[0];
      const base = {
        assignment_id: a.assignment_id,
        worker_name:   a.application.applicant.full_name,
        job_title:     a.application.job.job_title,
        company:       a.application.job.organization.name,
        week_start:    currentWeekStart,
        week_end:      currentWeekEnd,
      };

      if (!ts) {
        missing.push({ ...base, timesheet_id: null, status: 'NOT_STARTED', hours: 0 });
      } else if (['DRAFT', 'REJECTED'].includes(ts.status)) {
        drafts.push({ ...base, timesheet_id: ts.timesheet_id, status: ts.status, hours: Number(ts.total_hours) });
      } else if (['SUBMITTED', 'UNDER_REVIEW'].includes(ts.status)) {
        pendingApproval.push({ ...base, timesheet_id: ts.timesheet_id, status: ts.status, hours: Number(ts.total_hours) });
      }
    }

    return sendSuccess(res, {
      week_start: currentWeekStart, week_end: currentWeekEnd,
      total_active_assignments: activeAssignments.length,
      unread_count: missing.length + drafts.length,
      notifications: { missing, drafts, pending_approval: pendingApproval },
    });
  } catch (err: any) {
    console.error('getTimesheetNotifications:', err);
    return sendError(res, 'Failed to fetch notifications', 500);
  }
};

export const bulkUpsertTimeEntries = async (req: Request, res: Response) => {
  try {
    const { id }      = req.params;
    const { entries } = req.body;

    if (!Array.isArray(entries) || entries.length === 0) {
      return sendError(res, 'entries array is required and must not be empty', 400);
    }
    if (entries.length > 7) {
      return sendError(res, 'A week can have at most 7 entries', 400);
    }

    const timesheet = await prisma.timesheet.findUnique({ where: { timesheet_id: id } });
    if (!timesheet) return sendError(res, 'Timesheet not found', 404);
    if (!['DRAFT', 'REJECTED'].includes(timesheet.status)) {
      return sendError(res, `Cannot edit a ${timesheet.status} timesheet. Only DRAFT and REJECTED can be edited.`, 409);
    }

    const validationErrors: string[] = [];
    const parsedEntries = entries.map((e: any, idx: number) => {
      const entryDate = new Date(e.work_date);
      entryDate.setUTCHours(0, 0, 0, 0);

      if (isNaN(entryDate.getTime())) {
        validationErrors.push(`Entry ${idx}: invalid work_date "${e.work_date}"`);
        return null;
      }
      if (entryDate < timesheet.week_start_date || entryDate > timesheet.week_end_date) {
        validationErrors.push(`Entry ${idx}: work_date ${e.work_date} is outside the timesheet week`);
        return null;
      }

      const toNum = (v: any): number => { const n = parseFloat(v); return isNaN(n) ? 0 : Math.max(0, n); };
      const reg   = new Decimal(toNum(e.regular_hours));
      const ot    = new Decimal(toNum(e.ot_hours));
      const breakMins = parseInt(e.break_minutes, 10);

      return {
        work_date:     entryDate,
        regular_hours: reg,
        ot_hours:      ot,
        total_hours:   reg.add(ot),
        break_minutes: isNaN(breakMins) ? 0 : Math.max(0, breakMins),
        work_type:     e.work_type ?? 'REGULAR',
        notes:         e.notes?.trim() || null,
      };
    });

    if (validationErrors.length > 0) {
      return sendError(res, 'Validation failed', 400, validationErrors.map(msg => ({ field: 'entries', message: msg })));
    }

    const validParsed = parsedEntries.filter(Boolean) as NonNullable<typeof parsedEntries[0]>[];

    await prisma.$transaction(
      validParsed.map(e =>
        prisma.timeEntry.upsert({
          where: { timesheet_id_work_date: { timesheet_id: id, work_date: e!.work_date } },
          update: { regular_hours: e!.regular_hours, ot_hours: e!.ot_hours, total_hours: e!.total_hours, break_minutes: e!.break_minutes, work_type: e!.work_type, notes: e!.notes },
          create: { timesheet_id: id, assignment_id: timesheet.assignment_id, work_date: e!.work_date, regular_hours: e!.regular_hours, ot_hours: e!.ot_hours, total_hours: e!.total_hours, break_minutes: e!.break_minutes, work_type: e!.work_type, notes: e!.notes },
        })
      )
    );

    const allEntries   = await prisma.timeEntry.findMany({ where: { timesheet_id: id } });
    const totalRegular = allEntries.reduce((s, e) => s + Number(e.regular_hours), 0);
    const totalOt      = allEntries.reduce((s, e) => s + Number(e.ot_hours), 0);

    const updated = await prisma.timesheet.update({
      where: { timesheet_id: id },
      data: {
        total_regular_hours: new Decimal(totalRegular),
        total_ot_hours:      new Decimal(totalOt),
        total_hours:         new Decimal(totalRegular + totalOt),
      },
      include: { time_entries: { orderBy: { work_date: 'asc' } } },
    });

    return sendSuccess(res, {
      timesheet:     updated,
      entries_saved: validParsed.length,
      totals: { regular_hours: totalRegular, ot_hours: totalOt, total_hours: totalRegular + totalOt },
    });
  } catch (err: any) {
    console.error('bulkUpsertTimeEntries:', err);
    return sendError(res, err.message || 'Failed to save time entries', 500);
  }
};

// ─────────────────────────────────────────────────────────────
// EXPORT
// ─────────────────────────────────────────────────────────────
export const timesheetController = {
  getAllTimesheets,
  getTimesheetById,
  getTimesheetsByAssignment,
  getTimesheetStats,
  createOrGetTimesheet,
  updateTimesheetRates,
  upsertTimeEntry,
  deleteTimeEntry,
  submitTimesheet,
  approveTimesheet,
  rejectTimesheet,
  toggleAssignmentTimesheets,
  downloadImportTemplate,
  importTimesheets,
  getAllInvoices,
  getInvoiceById,
  downloadInvoicePdf,
  updateInvoiceStatus,
  getAssignmentsForTimesheets,
  getTimesheetNotifications,
  bulkUpsertTimeEntries,
};