import { Request, Response } from 'express';
import prisma from '../../prisma.config';
import { sendSuccess, sendError } from '../../utils/response';
import { Decimal } from '@prisma/client/runtime/library';
import {
  getAuthorizationUrl,
  exchangeCodeForTokens,
  pushPayrollJournalEntry,
  getRealmId,
  qbQuery,
} from '../../services/qbService';

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

/** Convert a date to ISO week label, e.g. "2025-W12" */
const getWeekLabel = (date: Date): string => {
  const d    = new Date(date);
  const jan1 = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(
    ((d.getTime() - jan1.getTime()) / 86_400_000 + jan1.getUTCDay() + 1) / 7
  );
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
};

/** Parse a "2025-W12" label back to the Monday of that ISO week */
const weekLabelToDate = (label: string): Date | null => {
  const m = label.match(/^(\d{4})-W(\d{2})$/);
  if (!m) return null;
  const year = parseInt(m[1], 10);
  const week = parseInt(m[2], 10);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() + 6) % 7) + (week - 1) * 7);
  monday.setUTCHours(0, 0, 0, 0);
  return monday;
};

// Full include shape reused across several endpoints
const PAYROLL_INCLUDE = {
  assignment: {
    include: {
      application: {
        include: {
          applicant: {
            select: { applicant_id: true, full_name: true },
          },
          job: {
            select: {
              job_id: true,
              job_title: true,
              job_type: true,
              organization: { select: { organization_id: true, name: true } },
            },
          },
        },
      },
    },
  },
  timesheet: {
    select: {
      timesheet_id: true,
      week_start_date: true,
      week_end_date: true,
      status: true,
      total_hours: true,
      bill_rate: true,
      total_bill_amount: true,
    },
  },
} as const;

// ─────────────────────────────────────────────────────────────
// GET ALL PAYROLLS  — paginated, filterable
// GET /api/payroll
// ─────────────────────────────────────────────────────────────
export const getAllPayrolls = async (req: Request, res: Response) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page  as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const skip  = (page - 1) * limit;

    const { assignmentId, payPeriod, weekStart, weekEnd, search, qbSynced } = req.query;
    const andClauses: any[] = [];

    if (assignmentId) andClauses.push({ assignment_id: assignmentId });

    if (payPeriod) {
      andClauses.push({ pay_period: payPeriod as string });
    } else {
      if (weekStart || weekEnd) {
        const timesheetFilter: any = {};
        if (weekStart) {
          const d = new Date(weekStart as string);
          d.setUTCHours(0, 0, 0, 0);
          timesheetFilter.gte = d;
        }
        if (weekEnd) {
          const d = new Date(weekEnd as string);
          d.setUTCHours(23, 59, 59, 999);
          timesheetFilter.lte = d;
        }
        andClauses.push({ timesheet: { week_start_date: timesheetFilter } });
      }
    }

    if (qbSynced !== undefined) {
      andClauses.push({ qb_synced: qbSynced === 'true' });
    }

    if (search) {
      const term = (search as string).trim();
      andClauses.push({
        OR: [
          { assignment: { application: { applicant: { full_name: { contains: term, mode: 'insensitive' } } } } },
          { assignment: { application: { job: { job_title: { contains: term, mode: 'insensitive' } } } } },
          { assignment: { application: { job: { organization: { name: { contains: term, mode: 'insensitive' } } } } } },
        ],
      });
    }

    const where: any = andClauses.length > 0 ? { AND: andClauses } : {};

    const [payrolls, total] = await Promise.all([
      prisma.payroll.findMany({
        where,
        skip,
        take: limit,
        orderBy: { processed_at: 'desc' },
        include: PAYROLL_INCLUDE,
      }),
      prisma.payroll.count({ where }),
    ]);

    return sendSuccess(res, {
      data:   payrolls,
      paging: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (err: any) {
    console.error('getAllPayrolls:', err);
    return sendError(res, 'Failed to fetch payrolls', 500);
  }
};

// ─────────────────────────────────────────────────────────────
// GET PAYROLL STATS
// GET /api/payroll/stats
// ─────────────────────────────────────────────────────────────
export const getPayrollStats = async (req: Request, res: Response) => {
  try {
    const { assignmentId, weekStart, weekEnd, payPeriod, qbSynced } = req.query;
    const andClauses: any[] = [];

    if (assignmentId) andClauses.push({ assignment_id: assignmentId });
    if (payPeriod)    andClauses.push({ pay_period: payPeriod as string });

    if (weekStart || weekEnd) {
      const tsFilter: any = {};
      if (weekStart) { const d = new Date(weekStart as string); d.setUTCHours(0,0,0,0); tsFilter.gte = d; }
      if (weekEnd)   { const d = new Date(weekEnd   as string); d.setUTCHours(23,59,59,999); tsFilter.lte = d; }
      andClauses.push({ timesheet: { week_start_date: tsFilter } });
    }
    if (qbSynced !== undefined) andClauses.push({ qb_synced: qbSynced === 'true' });

    const where: any = andClauses.length > 0 ? { AND: andClauses } : {};

    const [totals, qbPending] = await Promise.all([
      prisma.payroll.aggregate({
        where,
        _count: { payroll_id: true },
        _sum: {
          regular_hours: true,
          ot_hours:      true,
          gross_pay:     true,
          net_pay:       true,
        },
        _avg: {
          gross_pay: true,
        },
      }),
      prisma.payroll.count({ where: { ...where, qb_synced: false } }),
    ]);

    const totalGross = Number(totals._sum.gross_pay ?? 0);
    const totalNet   = Number(totals._sum.net_pay   ?? 0);
    const totalReg   = Number(totals._sum.regular_hours ?? 0);
    const totalOt    = Number(totals._sum.ot_hours      ?? 0);

    return sendSuccess(res, {
      total_payrolls:       totals._count.payroll_id,
      total_regular_hours:  totalReg,
      total_ot_hours:       totalOt,
      total_hours:          totalReg + totalOt,
      total_gross_pay:      totalGross,
      total_net_pay:        totalNet,
      avg_gross_pay:        Number(totals._avg.gross_pay ?? 0),
      qb_pending_sync:      qbPending,
    });
  } catch (err: any) {
    console.error('getPayrollStats:', err);
    return sendError(res, 'Failed to fetch payroll stats', 500);
  }
};

// ─────────────────────────────────────────────────────────────
// GET SINGLE PAYROLL
// GET /api/payroll/:payrollId
// ─────────────────────────────────────────────────────────────
export const getPayrollById = async (req: Request, res: Response) => {
  try {
    const { payrollId } = req.params;

    const payroll = await prisma.payroll.findUnique({
      where: { payroll_id: payrollId },
      include: {
        ...PAYROLL_INCLUDE,
        timesheet: {
          include: {
            time_entries: { orderBy: { work_date: 'asc' } },
          },
        },
      },
    });

    if (!payroll) return sendError(res, 'Payroll record not found', 404);

    return sendSuccess(res, payroll);
  } catch (err: any) {
    console.error('getPayrollById:', err);
    return sendError(res, 'Failed to fetch payroll record', 500);
  }
};

// ─────────────────────────────────────────────────────────────
// GET PAYROLLS BY ASSIGNMENT
// GET /api/payroll/assignment/:assignmentId
// ─────────────────────────────────────────────────────────────
export const getPayrollsByAssignment = async (req: Request, res: Response) => {
  try {
    const { assignmentId } = req.params;
    const page  = Math.max(1, parseInt(req.query.page  as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const skip  = (page - 1) * limit;

    const assignment = await prisma.assignment.findUnique({ where: { assignment_id: assignmentId } });
    if (!assignment) return sendError(res, 'Assignment not found', 404);

    const [payrolls, total] = await Promise.all([
      prisma.payroll.findMany({
        where: { assignment_id: assignmentId },
        skip,
        take: limit,
        orderBy: { processed_at: 'desc' },
        include: PAYROLL_INCLUDE,
      }),
      prisma.payroll.count({ where: { assignment_id: assignmentId } }),
    ]);

    const summary = await prisma.payroll.aggregate({
      where:  { assignment_id: assignmentId },
      _sum:   { gross_pay: true, net_pay: true, regular_hours: true, ot_hours: true },
      _count: { payroll_id: true },
    });

    return sendSuccess(res, {
      data:   payrolls,
      paging: { total, page, limit, totalPages: Math.ceil(total / limit) },
      summary: {
        total_payrolls:      summary._count.payroll_id,
        total_gross_pay:     Number(summary._sum.gross_pay     ?? 0),
        total_net_pay:       Number(summary._sum.net_pay       ?? 0),
        total_regular_hours: Number(summary._sum.regular_hours ?? 0),
        total_ot_hours:      Number(summary._sum.ot_hours      ?? 0),
      },
    });
  } catch (err: any) {
    console.error('getPayrollsByAssignment:', err);
    return sendError(res, 'Failed to fetch payrolls for assignment', 500);
  }
};

// ─────────────────────────────────────────────────────────────
// MANUAL CREATE PAYROLL
// POST /api/payroll
// ─────────────────────────────────────────────────────────────
export const createPayroll = async (req: Request, res: Response) => {
  try {
    const {
      assignment_id,
      timesheet_id,
      pay_period,
      regular_hours,
      ot_hours      = 0,
      pay_rate,
      ot_pay_rate,
      gross_pay,
      net_pay,
    } = req.body;

    if (!assignment_id)        return sendError(res, 'assignment_id is required', 400);
    if (regular_hours == null) return sendError(res, 'regular_hours is required', 400);
    if (pay_rate      == null) return sendError(res, 'pay_rate is required', 400);

    const assignment = await prisma.assignment.findUnique({ where: { assignment_id } });
    if (!assignment) return sendError(res, 'Assignment not found', 404);

    let linkedTimesheet: any = null;
    if (timesheet_id) {
      linkedTimesheet = await prisma.timesheet.findUnique({ where: { timesheet_id } });
      if (!linkedTimesheet) return sendError(res, 'Timesheet not found', 404);
      if (linkedTimesheet.assignment_id !== assignment_id) {
        return sendError(res, 'Timesheet does not belong to this assignment', 409);
      }
      const existing = await prisma.payroll.findUnique({ where: { timesheet_id } });
      if (existing) {
        return sendError(res, `A payroll record already exists for timesheet ${timesheet_id}`, 409);
      }
    }

    let resolvedPayPeriod = pay_period;
    if (!resolvedPayPeriod) {
      resolvedPayPeriod = linkedTimesheet
        ? getWeekLabel(linkedTimesheet.week_start_date)
        : getWeekLabel(new Date());
    }

    const regHours     = new Decimal(regular_hours);
    const otHrs        = new Decimal(ot_hours);
    const payRateDec   = new Decimal(pay_rate);
    const otPayRateDec = ot_pay_rate != null ? new Decimal(ot_pay_rate) : payRateDec.mul(1.5);

    const computedGross = payRateDec.mul(regHours).add(otPayRateDec.mul(otHrs));
    const finalGross    = gross_pay != null ? new Decimal(gross_pay) : computedGross;
    const finalNet      = net_pay   != null ? new Decimal(net_pay)   : finalGross;

    const payroll = await prisma.payroll.create({
      data: {
        assignment_id,
        timesheet_id:  timesheet_id ?? undefined,
        pay_period:    resolvedPayPeriod,
        regular_hours: regHours,
        ot_hours:      otHrs,
        pay_rate:      payRateDec,
        ot_pay_rate:   otPayRateDec,
        gross_pay:     finalGross,
        net_pay:       finalNet,
      },
      include: PAYROLL_INCLUDE,
    });

    return sendSuccess(res, payroll, 201);
  } catch (err: any) {
    console.error('createPayroll:', err);
    return sendError(res, 'Failed to create payroll record', 500);
  }
};

// ─────────────────────────────────────────────────────────────
// UPDATE PAYROLL
// PATCH /api/payroll/:payrollId
// ─────────────────────────────────────────────────────────────
export const updatePayroll = async (req: Request, res: Response) => {
  try {
    const { payrollId } = req.params;

    const payroll = await prisma.payroll.findUnique({ where: { payroll_id: payrollId } });
    if (!payroll) return sendError(res, 'Payroll record not found', 404);

    if (payroll.qb_synced) {
      return sendError(
        res,
        'This payroll has been synced to QuickBooks and cannot be edited directly. Use the void-and-replace flow instead.',
        409
      );
    }

    const { regular_hours, ot_hours, pay_rate, ot_pay_rate, gross_pay, net_pay } = req.body;

    const updateData: any = {};

    const newRegHours  = regular_hours != null ? new Decimal(regular_hours) : payroll.regular_hours;
    const newOtHours   = ot_hours      != null ? new Decimal(ot_hours)      : payroll.ot_hours;
    const newPayRate   = pay_rate      != null ? new Decimal(pay_rate)      : payroll.pay_rate;
    const newOtPayRate = ot_pay_rate   != null ? new Decimal(ot_pay_rate)   : (payroll.ot_pay_rate ?? newPayRate.mul(1.5));

    if (regular_hours != null) updateData.regular_hours = newRegHours;
    if (ot_hours      != null) updateData.ot_hours      = newOtHours;
    if (pay_rate      != null) updateData.pay_rate      = newPayRate;
    if (ot_pay_rate   != null) updateData.ot_pay_rate   = newOtPayRate;

    if (gross_pay != null) {
      updateData.gross_pay = new Decimal(gross_pay);
    } else if (regular_hours != null || ot_hours != null || pay_rate != null || ot_pay_rate != null) {
      updateData.gross_pay = newPayRate.mul(newRegHours).add(newOtPayRate.mul(newOtHours));
    }

    if (net_pay != null) {
      updateData.net_pay = new Decimal(net_pay);
    } else if (updateData.gross_pay) {
      updateData.net_pay = updateData.gross_pay;
    }

    if (Object.keys(updateData).length === 0) {
      return sendError(res, 'No updatable fields provided', 400);
    }

    const updated = await prisma.payroll.update({
      where: { payroll_id: payrollId },
      data:  updateData,
      include: PAYROLL_INCLUDE,
    });

    return sendSuccess(res, updated);
  } catch (err: any) {
    console.error('updatePayroll:', err);
    return sendError(res, 'Failed to update payroll record', 500);
  }
};

// ─────────────────────────────────────────────────────────────
// VOID AND REPLACE
// POST /api/payroll/:payrollId/void-and-replace
// ─────────────────────────────────────────────────────────────
export const voidAndReplacePayroll = async (req: Request, res: Response) => {
  try {
    const { payrollId } = req.params;

    const original = await prisma.payroll.findUnique({
      where: { payroll_id: payrollId },
      include: PAYROLL_INCLUDE,
    });
    if (!original) return sendError(res, 'Payroll record not found', 404);

    const {
      regular_hours = original.regular_hours,
      ot_hours      = original.ot_hours,
      pay_rate      = original.pay_rate,
      ot_pay_rate   = original.ot_pay_rate,
      gross_pay,
      net_pay,
    } = req.body;

    const newRegHours  = new Decimal(regular_hours);
    const newOtHours   = new Decimal(ot_hours);
    const newPayRate   = new Decimal(pay_rate);
    const newOtPayRate = new Decimal(ot_pay_rate ?? new Decimal(pay_rate).mul(1.5));

    const newGross = gross_pay != null
      ? new Decimal(gross_pay)
      : newPayRate.mul(newRegHours).add(newOtPayRate.mul(newOtHours));
    const newNet = net_pay != null ? new Decimal(net_pay) : newGross;

    const replacement = await prisma.payroll.create({
      data: {
        assignment_id:  original.assignment_id,
        timesheet_id:   undefined,
        pay_period:     original.pay_period,
        regular_hours:  newRegHours,
        ot_hours:       newOtHours,
        pay_rate:       newPayRate,
        ot_pay_rate:    newOtPayRate,
        gross_pay:      newGross,
        net_pay:        newNet,
      },
      include: PAYROLL_INCLUDE,
    });

    return sendSuccess(res, {
      voided:      { payroll_id: original.payroll_id, pay_period: original.pay_period },
      replacement,
      message:     'Original payroll voided; replacement record created. Re-sync the replacement to QuickBooks.',
    }, 201);
  } catch (err: any) {
    console.error('voidAndReplacePayroll:', err);
    return sendError(res, 'Failed to void-and-replace payroll', 500);
  }
};

// ─────────────────────────────────────────────────────────────
// DELETE PAYROLL  (only if NOT QB-synced)
// DELETE /api/payroll/:payrollId
// ─────────────────────────────────────────────────────────────
export const deletePayroll = async (req: Request, res: Response) => {
  try {
    const { payrollId } = req.params;

    const payroll = await prisma.payroll.findUnique({ where: { payroll_id: payrollId } });
    if (!payroll) return sendError(res, 'Payroll record not found', 404);

    if (payroll.qb_synced) {
      return sendError(
        res,
        'Cannot delete a QB-synced payroll. Use void-and-replace instead.',
        409
      );
    }

    await prisma.payroll.delete({ where: { payroll_id: payrollId } });

    return sendSuccess(res, { deleted: true, payroll_id: payrollId });
  } catch (err: any) {
    console.error('deletePayroll:', err);
    return sendError(res, 'Failed to delete payroll record', 500);
  }
};

// ─────────────────────────────────────────────────────────────
// MARK QB SYNCED (manual / after external push)
// POST /api/payroll/:payrollId/qb-sync
// Body: { qb_payroll_id: string }
// ─────────────────────────────────────────────────────────────
export const markQbSynced = async (req: Request, res: Response) => {
  try {
    const { payrollId } = req.params;
    const { qb_payroll_id } = req.body;

    if (!qb_payroll_id) return sendError(res, 'qb_payroll_id is required', 400);

    const payroll = await prisma.payroll.findUnique({ where: { payroll_id: payrollId } });
    if (!payroll) return sendError(res, 'Payroll record not found', 404);

    if (payroll.qb_synced) {
      return sendError(res, 'Payroll is already marked as QB-synced', 409);
    }

    const updated = await prisma.payroll.update({
      where: { payroll_id: payrollId },
      data: {
        qb_synced:     true,
        qb_synced_at:  new Date(),
        qb_payroll_id,
      },
      include: PAYROLL_INCLUDE,
    });

    return sendSuccess(res, updated);
  } catch (err: any) {
    console.error('markQbSynced:', err);
    return sendError(res, 'Failed to mark payroll as QB-synced', 500);
  }
};

// ─────────────────────────────────────────────────────────────
// BULK QB SYNC (manual mark)
// POST /api/payroll/qb-sync/bulk
// Body: { records: [ { payroll_id, qb_payroll_id }, ... ] }
// ─────────────────────────────────────────────────────────────
export const bulkMarkQbSynced = async (req: Request, res: Response) => {
  try {
    const { records } = req.body;

    if (!Array.isArray(records) || records.length === 0) {
      return sendError(res, 'records must be a non-empty array of { payroll_id, qb_payroll_id }', 400);
    }

    const errors:  { payroll_id: string; message: string }[] = [];
    const updated: string[] = [];
    const syncedAt = new Date();

    await prisma.$transaction(
      records.map((r: { payroll_id: string; qb_payroll_id: string }) =>
        prisma.payroll.update({
          where: { payroll_id: r.payroll_id },
          data: {
            qb_synced:     true,
            qb_synced_at:  syncedAt,
            qb_payroll_id: r.qb_payroll_id,
          },
        })
      )
    ).then(results => {
      results.forEach(r => updated.push(r.payroll_id));
    }).catch(err => {
      errors.push({ payroll_id: 'batch', message: err.message });
    });

    return sendSuccess(res, {
      synced_count:  updated.length,
      error_count:   errors.length,
      synced:        updated,
      errors,
    });
  } catch (err: any) {
    console.error('bulkMarkQbSynced:', err);
    return sendError(res, 'Failed to bulk sync payrolls', 500);
  }
};

// ─────────────────────────────────────────────────────────────
// ★ NEW: PUSH PAYROLL TO QUICKBOOKS AS JOURNAL ENTRY
// POST /api/payroll/:payrollId/qb-push
//
// Automatically pushes payroll to QB as a JournalEntry
// (Debit: Wages Expense / Credit: Accounts Payable).
// On success, marks qb_synced = true and stores qb_payroll_id.
// ─────────────────────────────────────────────────────────────
export const pushPayrollToQB = async (req: Request, res: Response) => {
  try {
    const { payrollId } = req.params;

    const payroll = await prisma.payroll.findUnique({
      where: { payroll_id: payrollId },
      include: PAYROLL_INCLUDE,
    });
    if (!payroll) return sendError(res, 'Payroll record not found', 404);

    if (payroll.qb_synced) {
      return sendError(res, 'Payroll is already synced to QuickBooks', 409);
    }

    // Resolve worker display name for the journal entry memo
    const workerName = (payroll.assignment as any)
      ?.application?.applicant?.full_name ?? 'Unknown Worker';

    const qbJournalEntryId = await pushPayrollJournalEntry(payroll, workerName);

    const updated = await prisma.payroll.update({
      where: { payroll_id: payrollId },
      data: {
        qb_synced:     true,
        qb_synced_at:  new Date(),
        qb_payroll_id: qbJournalEntryId,
      },
      include: PAYROLL_INCLUDE,
    });

    return sendSuccess(res, {
      message:              'Payroll pushed to QuickBooks as a Journal Entry',
      qb_journal_entry_id:  qbJournalEntryId,
      payroll:              updated,
    });
  } catch (err: any) {
    console.error('pushPayrollToQB:', err);
    return sendError(res, `QB push failed: ${err.message}`, 500);
  }
};

// ─────────────────────────────────────────────────────────────
// ★ NEW: BULK PUSH UNSYNCED PAYROLLS TO QUICKBOOKS
// POST /api/payroll/qb-push/bulk
//
// Pushes all payrolls where qb_synced = false.
// Optional body: { payroll_ids: string[] } to limit scope.
// ─────────────────────────────────────────────────────────────
export const bulkPushPayrollsToQB = async (req: Request, res: Response) => {
  try {
    const { payroll_ids } = req.body;

    const where: any = { qb_synced: false };
    if (Array.isArray(payroll_ids) && payroll_ids.length > 0) {
      where.payroll_id = { in: payroll_ids };
    }

    const pending = await prisma.payroll.findMany({
      where,
      include: PAYROLL_INCLUDE,
      orderBy: { processed_at: 'asc' },
    });

    if (pending.length === 0) {
      return sendSuccess(res, { message: 'No unsynced payrolls found', pushed: 0, errors: [] });
    }

    const pushed:  { payroll_id: string; qb_journal_entry_id: string }[] = [];
    const errors:  { payroll_id: string; message: string }[] = [];

    for (const payroll of pending) {
      try {
        const workerName = (payroll.assignment as any)
          ?.application?.applicant?.full_name ?? 'Unknown Worker';

        const qbJournalEntryId = await pushPayrollJournalEntry(payroll, workerName);

        await prisma.payroll.update({
          where: { payroll_id: payroll.payroll_id },
          data: {
            qb_synced:     true,
            qb_synced_at:  new Date(),
            qb_payroll_id: qbJournalEntryId,
          },
        });

        pushed.push({ payroll_id: payroll.payroll_id, qb_journal_entry_id: qbJournalEntryId });
      } catch (err: any) {
        errors.push({ payroll_id: payroll.payroll_id, message: err.message });
      }
    }

    return sendSuccess(res, {
      total_attempted: pending.length,
      pushed_count:    pushed.length,
      error_count:     errors.length,
      pushed,
      errors,
    });
  } catch (err: any) {
    console.error('bulkPushPayrollsToQB:', err);
    return sendError(res, 'Failed to bulk push payrolls to QB', 500);
  }
};

// ─────────────────────────────────────────────────────────────
// ★ NEW: QUICKBOOKS OAUTH — Start Connect Flow
// GET /api/payroll/quickbooks/connect
//
// Redirects browser to QuickBooks authorization page.
// ─────────────────────────────────────────────────────────────
export const qbConnect = async (req: Request, res: Response) => {
  try {
    const url = getAuthorizationUrl('payroll_auth');
    return res.redirect(url);
  } catch (err: any) {
    console.error('qbConnect:', err);
    return sendError(res, 'Failed to initiate QB OAuth', 500);
  }
};

// ─────────────────────────────────────────────────────────────
// ★ NEW: QUICKBOOKS OAUTH — Callback Handler
// GET /api/payroll/quickbooks/callback
//
// QB redirects here after user authorizes.
// Exchanges code for tokens and stores them.
// ─────────────────────────────────────────────────────────────
export const qbCallback = async (req: Request, res: Response) => {
  try {
    const { code, realmId, error, error_description } = req.query;

    if (error) {
      return sendError(res, `QB authorization denied: ${error_description ?? error}`, 400);
    }

    if (!code || !realmId) {
      return sendError(res, 'Missing code or realmId from QuickBooks callback', 400);
    }

    const tokens = await exchangeCodeForTokens(code as string, realmId as string);

    return sendSuccess(res, {
      message:   'QuickBooks connected successfully',
      realm_id:  tokens.realm_id,
      expires_at: tokens.expires_at,
    });
  } catch (err: any) {
    console.error('qbCallback:', err);
    return sendError(res, `QB callback failed: ${err.message}`, 500);
  }
};

// ─────────────────────────────────────────────────────────────
// ★ NEW: QUICKBOOKS CONNECTION STATUS
// GET /api/payroll/quickbooks/status
// ─────────────────────────────────────────────────────────────
export const qbStatus = async (req: Request, res: Response) => {
  try {
    const realmId = await getRealmId().catch(() => null);

    if (!realmId) {
      return sendSuccess(res, {
        connected: false,
        message:   'No QuickBooks company connected. Visit /api/payroll/quickbooks/connect to authorize.',
      });
    }

    // Quick ping — fetch company info
    const companyInfo = await (async () => {
      try {
        const { qbGet } = await import('../../services/qbService');
        const data = await qbGet('/companyinfo/' + realmId);
        return data?.CompanyInfo ?? null;
      } catch {
        return null;
      }
    })();

    return sendSuccess(res, {
      connected:    true,
      realm_id:     realmId,
      company_name: companyInfo?.CompanyName ?? null,
      environment:  process.env.QB_ENVIRONMENT ?? 'sandbox',
    });
  } catch (err: any) {
    console.error('qbStatus:', err);
    return sendError(res, 'Failed to check QB status', 500);
  }
};

// ─────────────────────────────────────────────────────────────
// GET PAYROLL SUMMARY BY PAY PERIOD
// GET /api/payroll/periods
// ─────────────────────────────────────────────────────────────
export const getPayrollPeriods = async (req: Request, res: Response) => {
  try {
    const { assignmentId, weekStart, weekEnd } = req.query;
    const andClauses: any[] = [];

    if (assignmentId) andClauses.push({ assignment_id: assignmentId });
    if (weekStart || weekEnd) {
      const tsFilter: any = {};
      if (weekStart) { const d = new Date(weekStart as string); d.setUTCHours(0,0,0,0); tsFilter.gte = d; }
      if (weekEnd)   { const d = new Date(weekEnd   as string); d.setUTCHours(23,59,59,999); tsFilter.lte = d; }
      andClauses.push({ timesheet: { week_start_date: tsFilter } });
    }

    const where: any = andClauses.length > 0 ? { AND: andClauses } : {};

    const groups = await prisma.payroll.groupBy({
      by:    ['pay_period'],
      where,
      _count: { payroll_id: true },
      _sum:   { regular_hours: true, ot_hours: true, gross_pay: true, net_pay: true },
      orderBy: { pay_period: 'desc' },
    });

    const periods = groups.map(g => {
      const monday = weekLabelToDate(g.pay_period);
      return {
        pay_period:          g.pay_period,
        week_start_date:     monday?.toISOString().slice(0, 10) ?? null,
        payroll_count:       g._count.payroll_id,
        total_regular_hours: Number(g._sum.regular_hours ?? 0),
        total_ot_hours:      Number(g._sum.ot_hours      ?? 0),
        total_hours:         Number(g._sum.regular_hours ?? 0) + Number(g._sum.ot_hours ?? 0),
        total_gross_pay:     Number(g._sum.gross_pay     ?? 0),
        total_net_pay:       Number(g._sum.net_pay       ?? 0),
      };
    });

    return sendSuccess(res, { data: periods, total: periods.length });
  } catch (err: any) {
    console.error('getPayrollPeriods:', err);
    return sendError(res, 'Failed to fetch payroll periods', 500);
  }
};

// ─────────────────────────────────────────────────────────────
// GET PAYROLLS FOR A SPECIFIC PERIOD
// GET /api/payroll/periods/:payPeriod
// ─────────────────────────────────────────────────────────────
export const getPayrollsByPeriod = async (req: Request, res: Response) => {
  try {
    const { payPeriod } = req.params;

    if (!/^\d{4}-W\d{2}$/.test(payPeriod)) {
      return sendError(res, 'payPeriod must be in format YYYY-WWW, e.g. 2025-W12', 400);
    }

    const payrolls = await prisma.payroll.findMany({
      where:   { pay_period: payPeriod },
      orderBy: { processed_at: 'asc' },
      include: PAYROLL_INCLUDE,
    });

    const totals = payrolls.reduce(
      (acc, p) => ({
        gross: acc.gross + Number(p.gross_pay),
        net:   acc.net   + Number(p.net_pay),
        reg:   acc.reg   + Number(p.regular_hours),
        ot:    acc.ot    + Number(p.ot_hours),
      }),
      { gross: 0, net: 0, reg: 0, ot: 0 }
    );

    return sendSuccess(res, {
      pay_period:          payPeriod,
      week_start_date:     weekLabelToDate(payPeriod)?.toISOString().slice(0, 10) ?? null,
      payroll_count:       payrolls.length,
      total_gross_pay:     totals.gross,
      total_net_pay:       totals.net,
      total_regular_hours: totals.reg,
      total_ot_hours:      totals.ot,
      total_hours:         totals.reg + totals.ot,
      data:                payrolls,
    });
  } catch (err: any) {
    console.error('getPayrollsByPeriod:', err);
    return sendError(res, 'Failed to fetch payrolls for period', 500);
  }
};

// ─────────────────────────────────────────────────────────────
// EXPORT
// ─────────────────────────────────────────────────────────────
export const payrollController = {
  // Core CRUD
  getAllPayrolls,
  getPayrollStats,
  getPayrollById,
  getPayrollsByAssignment,
  createPayroll,
  updatePayroll,
  deletePayroll,

  // Correction flow
  voidAndReplacePayroll,

  // QuickBooks — OAuth
  qbConnect,
  qbCallback,
  qbStatus,

  // QuickBooks — Sync
  markQbSynced,
  bulkMarkQbSynced,
  pushPayrollToQB,
  bulkPushPayrollsToQB,

  // Period views
  getPayrollPeriods,
  getPayrollsByPeriod,
};