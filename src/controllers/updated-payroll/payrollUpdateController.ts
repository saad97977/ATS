import { Request, Response } from 'express';
import prisma from '../../prisma.config';
import { sendSuccess, sendError } from '../../utils/response';
import { generateClientInvoicePdf } from '../../services/updatedPayrollInvoiceService';
import { sendClientInvoiceEmail } from '../../services/emailService'; // adjust path to match your actual file

// ════════════════════════════════════════════════════════════════
// STEP 2 — Payroll Batch → Checks
// STEP 3 — Billing Batch → Client Invoices
// STEP 4 — Weekly Process → ACH File
//
// This picks up from your existing Batch Entry controller (Step 1,
// untouched) — it only ever reads VERIFIED PayrollTransactions that
// haven't been claimed by another Payroll Batch yet.
// ════════════════════════════════════════════════════════════════

function toNum(v: any): number {
  if (v === null || v === undefined) return 0;
  return typeof v === 'object' && typeof v.toNumber === 'function' ? v.toNumber() : Number(v);
}
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
function isFriday(d: Date): boolean {
  return d.getUTCDay() === 5;
}
function isSunday(d: Date): boolean {
  return d.getUTCDay() === 0;
}

export const CHECK_RUN_TYPES = [
  'Advance Bank Payout', 'Check Run', 'Check Reissue', 'Check Reverse', 'Check Void',
  'Clear AP Items', 'Deduction Authority Pay', 'SubAgency Pay', 'Direct Deposit',
  'Direct Deposit Reissue', 'Direct Deposit Reverse', 'Manual Check', 'Manual Check Void',
  'Off Cycle Payroll', 'On Cycle Payroll', 'Bonus Check', 'Commission Check',
  'Expense Reimbursement', 'Adjustment', 'Payroll Correction', 'Replacement Check',
  'Final Pay', 'Termination Pay', 'Holiday Pay', 'Vacation Pay', 'Sick Pay',
  'Retroactive Pay', 'Third Party Payment', 'Garnishment Payment', 'Tax Payment',
  'ACH Payment', 'Wire Transfer', 'Cash Payment', 'Net Pay Adjustment',
  'Year End Adjustment', 'Other',
];
// Maps the human label used by the frontend dropdown to the Prisma enum key
const RUN_TYPE_TO_ENUM: Record<string, string> = {
  'Advance Bank Payout': 'ADVANCE_BANK_PAYOUT', 'Check Run': 'CHECK_RUN', 'Check Reissue': 'CHECK_REISSUE',
  'Check Reverse': 'CHECK_REVERSE', 'Check Void': 'CHECK_VOID', 'Clear AP Items': 'CLEAR_AP_ITEMS',
  'Deduction Authority Pay': 'DEDUCTION_AUTHORITY_PAY', 'SubAgency Pay': 'SUBAGENCY_PAY',
  'Direct Deposit': 'DIRECT_DEPOSIT', 'Direct Deposit Reissue': 'DIRECT_DEPOSIT_REISSUE',
  'Direct Deposit Reverse': 'DIRECT_DEPOSIT_REVERSE', 'Manual Check': 'MANUAL_CHECK',
  'Manual Check Void': 'MANUAL_CHECK_VOID', 'Off Cycle Payroll': 'OFF_CYCLE_PAYROLL',
  'On Cycle Payroll': 'ON_CYCLE_PAYROLL', 'Bonus Check': 'BONUS_CHECK', 'Commission Check': 'COMMISSION_CHECK',
  'Expense Reimbursement': 'EXPENSE_REIMBURSEMENT', 'Adjustment': 'ADJUSTMENT',
  'Payroll Correction': 'PAYROLL_CORRECTION', 'Replacement Check': 'REPLACEMENT_CHECK',
  'Final Pay': 'FINAL_PAY', 'Termination Pay': 'TERMINATION_PAY', 'Holiday Pay': 'HOLIDAY_PAY',
  'Vacation Pay': 'VACATION_PAY', 'Sick Pay': 'SICK_PAY', 'Retroactive Pay': 'RETROACTIVE_PAY',
  'Third Party Payment': 'THIRD_PARTY_PAYMENT', 'Garnishment Payment': 'GARNISHMENT_PAYMENT',
  'Tax Payment': 'TAX_PAYMENT', 'ACH Payment': 'ACH_PAYMENT', 'Wire Transfer': 'WIRE_TRANSFER',
  'Cash Payment': 'CASH_PAYMENT', 'Net Pay Adjustment': 'NET_PAY_ADJUSTMENT',
  'Year End Adjustment': 'YEAR_END_ADJUSTMENT', 'Other': 'OTHER',
};

// ────────────────────────────────────────────────────────────────
// ⚠️ PLACEHOLDER TAX/DEDUCTION LOGIC
// Same caveat as before: flat-rate withholding, no bracket tables, no
// YTD wage-base tracking for SS/FUTA caps. Swap `calculateTaxes` out
// for a real tax engine before relying on these figures for real pay.
// Deductions/garnishments are read from the onboarding module's
// BenefitDeduction / Garnishment tables — nothing new to configure there.
// ────────────────────────────────────────────────────────────────
const SS_RATE = 0.062;
const MEDICARE_RATE = 0.0145;
const ADDITIONAL_MEDICARE_THRESHOLD = 200000; // employee-only 0.9% above this YTD
const SS_WAGE_BASE = 168600;   // 2026 placeholder — update yearly
const FUTA_WAGE_BASE = 7000;
const FUTA_RATE = 0.006;
const SUTA_WAGE_BASE = 9000;   // varies by state — placeholder, override per-state if needed
const DEFAULT_SUTA_RATE = 0.027;
const DEFAULT_STATE_FLAT_RATE = 0.04;   // fallback when no StateTaxRate row exists for the work state
const DEFAULT_LOCAL_TAX_RATE = 0.01;
const FREQUENCY_PER_YEAR: Record<string, number> = { WEEKLY: 52, BI_WEEKLY: 26, SEMI_MONTHLY: 24, MONTHLY: 12 };
 
async function getFederalBrackets(filingStatus: string, taxYear: number) {
  return (prisma as any).taxBracket.findMany({
    where: { filing_status: filingStatus, tax_year: taxYear },
    orderBy: { min_annual_income: 'asc' },
  });
}
 
function computeAnnualFederalTax(annualIncome: number, brackets: any[]): number {
  const bracket = brackets.find(
    (b) => annualIncome >= toNum(b.min_annual_income) && (b.max_annual_income == null || annualIncome < toNum(b.max_annual_income))
  );
  if (!bracket) return 0;
  return round2(toNum(bracket.base_tax) + (annualIncome - toNum(bracket.min_annual_income)) * toNum(bracket.rate));
}
 
// ⚠️ Still simplified vs. a full commercial tax engine: no W-4 step 2-4
// adjustments, no dependent-credit math, state modeled as flat-rate only.
// But this is now a real progressive bracket calculation with YTD wage-base
// caps on SS/FUTA — the flat 12%-of-everything placeholder is gone.
async function calculateTaxes(params: {
  grossPay: number; taxInfo: any; localTaxInfo: any; payFrequency: string; ytdGrossBeforeThisCheck: number; taxYear: number;
}) {
  const { grossPay, taxInfo, localTaxInfo, payFrequency, ytdGrossBeforeThisCheck, taxYear } = params;
  const filingStatus = taxInfo?.filing_status || 'SINGLE';
  const additionalWithholding = toNum(taxInfo?.additional_withholding);
  const periodsPerYear = FREQUENCY_PER_YEAR[payFrequency] ?? 52;
 
  let federal_tax = 0;
  if (!taxInfo?.exempt_from_federal) {
    const brackets = await getFederalBrackets(filingStatus, taxYear);
    if (brackets.length) {
      const annualIncome = grossPay * periodsPerYear;
      const annualTax = computeAnnualFederalTax(annualIncome, brackets);
      federal_tax = round2(annualTax / periodsPerYear + additionalWithholding);
    } else {
      // No bracket table configured for this tax_year/filing_status —
      // this is a data-setup gap (seed TaxBracket rows), not intended to
      // be a permanent fallback.
      federal_tax = round2(grossPay * 0.12 + additionalWithholding);
    }
  }
 
  let state_tax = 0;
  if (!taxInfo?.exempt_from_state) {
    const workState = taxInfo?.work_state;
    const stateRate = workState ? await (prisma as any).stateTaxRate.findUnique({ where: { state: workState } }) : null;
    state_tax = round2(grossPay * toNum(stateRate?.flat_rate ?? DEFAULT_STATE_FLAT_RATE));
  }
 
  const local_tax = localTaxInfo && !localTaxInfo?.exempt_from_local
    ? round2(grossPay * toNum(localTaxInfo?.local_tax_rate ?? DEFAULT_LOCAL_TAX_RATE))
    : 0;
 
  const ssRoomRemaining = Math.max(SS_WAGE_BASE - ytdGrossBeforeThisCheck, 0);
  const ssTaxableThisCheck = Math.min(grossPay, ssRoomRemaining);
  const employee_ss = round2(ssTaxableThisCheck * SS_RATE);
 
  const priorYtdOverThreshold = Math.max(ytdGrossBeforeThisCheck - ADDITIONAL_MEDICARE_THRESHOLD, 0);
  const newYtd = ytdGrossBeforeThisCheck + grossPay;
  const additionalMedicareBase = Math.max(Math.max(newYtd - ADDITIONAL_MEDICARE_THRESHOLD, 0) - priorYtdOverThreshold, 0);
  const employee_medicare = round2(grossPay * MEDICARE_RATE + additionalMedicareBase * 0.009);
 
  return { federal_tax, state_tax, local_tax, employee_ss, employee_medicare, ssTaxableThisCheck };
}
 
function calculateEmployerCosts(params: {
  grossPay: number; ssTaxableThisCheck: number; ytdGrossBeforeThisCheck: number; wcInsuranceRate: number | null; sutaRate: number;
}) {
  const { grossPay, ssTaxableThisCheck, ytdGrossBeforeThisCheck, wcInsuranceRate, sutaRate } = params;
 
  const employer_ss = round2(ssTaxableThisCheck * SS_RATE); // mirrors employee-side wage base
  const employer_medicare = round2(grossPay * MEDICARE_RATE); // no employer-side "additional Medicare"
 
  const futaRoomRemaining = Math.max(FUTA_WAGE_BASE - ytdGrossBeforeThisCheck, 0);
  const futaTaxable = Math.min(grossPay, futaRoomRemaining);
  const employer_futa = round2(futaTaxable * FUTA_RATE);
 
  const sutaRoomRemaining = Math.max(SUTA_WAGE_BASE - ytdGrossBeforeThisCheck, 0);
  const sutaTaxable = Math.min(grossPay, sutaRoomRemaining);
  const employer_suta = round2(sutaTaxable * sutaRate);
 
  const employer_wc_cost = wcInsuranceRate != null ? round2(grossPay * wcInsuranceRate) : 0;
  const total_employer_cost = round2(employer_ss + employer_medicare + employer_futa + employer_suta + employer_wc_cost);
 
  return { employer_ss, employer_medicare, employer_futa, employer_suta, employer_wc_cost, total_employer_cost };
}
 


function applyDeductions(netBeforeDeductions: number, benefitDeductions: any[], garnishments: any[]) {
  let remaining = netBeforeDeductions;
  const breakdown: { type: string; label: string; amount: number; source: string }[] = [];
  let benefitTotal = 0;
  let garnishmentTotal = 0;

  for (const b of benefitDeductions.filter((b) => b.is_active)) {
    const amt = b.percentage != null ? round2(netBeforeDeductions * (toNum(b.percentage) / 100)) : round2(toNum(b.amount));
    const applied = Math.min(amt, Math.max(remaining, 0));
    if (applied <= 0) continue;
    remaining = round2(remaining - applied);
    benefitTotal = round2(benefitTotal + applied);
    breakdown.push({ type: b.deduction_type, label: b.deduction_type, amount: applied, source: 'benefit' });
  }

  const sortedGarnishments = [...garnishments.filter((g) => g.is_active)].sort((a, b) => (a.priority_order ?? 1) - (b.priority_order ?? 1));
  for (const g of sortedGarnishments) {
    let amt = g.percentage != null ? round2(netBeforeDeductions * (toNum(g.percentage) / 100)) : round2(toNum(g.amount));
    if (g.max_amount != null) amt = Math.min(amt, toNum(g.max_amount));
    const applied = Math.min(amt, Math.max(remaining, 0));
    if (applied <= 0) continue;
    remaining = round2(remaining - applied);
    garnishmentTotal = round2(garnishmentTotal + applied);
    breakdown.push({ type: g.garnishment_type, label: g.garnishment_type, amount: applied, source: 'garnishment' });
  }

  return { netPay: remaining, benefitTotal, garnishmentTotal, breakdown };
}

// Sums this applicant's prior POSTED checks in the same calendar year as
// `uptoDate`, used to populate the pay stub's YTD columns.
async function computeYtd(applicantId: string, uptoDate: Date, excludeCheckId?: string) {
  const yearStart = new Date(Date.UTC(uptoDate.getUTCFullYear(), 0, 1));
  const priorChecks = await (prisma as any).payrollCheck.findMany({
    where: {
      applicant_id: applicantId,
      status: 'POSTED',
      payroll_check_id: excludeCheckId ? { not: excludeCheckId } : undefined,
      batch: { check_date: { gte: yearStart, lt: uptoDate } },
    },
    include: { batch: { select: { check_date: true } } },
  });

  const ytd = priorChecks.reduce(
    (acc: any, c: any) => {
      acc.gross += toNum(c.gross_pay);
      acc.federal_tax += toNum(c.federal_tax);
      acc.state_tax += toNum(c.state_tax);
      acc.local_tax += toNum(c.local_tax);
      acc.employee_ss += toNum(c.employee_ss);
      acc.employee_medicare += toNum(c.employee_medicare);
      const breakdown: any[] = c.deduction_breakdown ?? [];
      for (const d of breakdown) {
        acc.deductions[d.type] = (acc.deductions[d.type] ?? 0) + toNum(d.amount);
      }
      return acc;
    },
    { gross: 0, federal_tax: 0, state_tax: 0, local_tax: 0, employee_ss: 0, employee_medicare: 0, deductions: {} as Record<string, number> }
  );

  Object.keys(ytd.deductions).forEach((k) => (ytd.deductions[k] = round2(ytd.deductions[k])));
  return ytd;
}

// ════════════════════════════════════════════════════════════════
// BANK ACCOUNTS (front-office employee self-entry — extends the
// existing BankAccount model with sequence/prenote fields)
// ════════════════════════════════════════════════════════════════

// POST /applicants/:applicantId/bank-accounts
export const createEmployeeBankAccount = async (req: Request, res: Response) => {
  try {
    const { applicantId } = req.params;
    const {
      bank_name, account_type, routing_number, account_number,
      amount_type, amount, sequence, prenote_send_date, prenote_approve_date, is_active,
    } = req.body;

    if (!bank_name || !routing_number || !account_number) {
      return sendError(res, 'bank_name, routing_number, and account_number are required', 400);
    }
    if (!/^\d{9}$/.test(routing_number)) return sendError(res, 'routing_number must be exactly 9 digits', 400);

    const applicant = await (prisma as any).applicant.findUnique({ where: { applicant_id: applicantId } });
    if (!applicant) return sendError(res, 'Applicant not found', 404);

    const account = await (prisma as any).bankAccount.create({
      data: {
        applicant_id: applicantId,
        bank_name,
        account_type: account_type || 'CHECKING',
        routing_number,
        account_number,
        amount_type: amount_type || 'REMAINING',
        amount: amount ?? null,
        sequence: sequence ?? 1,
        prenote_send_date: prenote_send_date ? new Date(prenote_send_date) : null,
        prenote_approve_date: prenote_approve_date ? new Date(prenote_approve_date) : null,
        is_active: is_active ?? true,
      },
    });

    return sendSuccess(res, { account }, 201);
  } catch (err: any) {
    console.error('Error creating employee bank account:', err);
    return sendError(res, 'Failed to create bank account', 500);
  }
};

// GET /applicants/:applicantId/bank-accounts
export const listEmployeeBankAccounts = async (req: Request, res: Response) => {
  try {
    const { applicantId } = req.params;
    const accounts = await (prisma as any).bankAccount.findMany({
      where: { applicant_id: applicantId },
      orderBy: { sequence: 'asc' },
    });
    return sendSuccess(res, { accounts });
  } catch (err: any) {
    console.error('Error listing bank accounts:', err);
    return sendError(res, 'Failed to list bank accounts', 500);
  }
};

// PATCH /bank-accounts/:bankAccountId
export const updateEmployeeBankAccount = async (req: Request, res: Response) => {
  try {
    const { bankAccountId } = req.params;
    const {
      bank_name, account_type, routing_number, account_number,
      amount_type, amount, sequence, prenote_send_date, prenote_approve_date, is_active,
    } = req.body;

    const existing = await (prisma as any).bankAccount.findUnique({ where: { bank_account_id: bankAccountId } });
    if (!existing) return sendError(res, 'Bank account not found', 404);
    if (routing_number && !/^\d{9}$/.test(routing_number)) return sendError(res, 'routing_number must be exactly 9 digits', 400);

    const account = await (prisma as any).bankAccount.update({
      where: { bank_account_id: bankAccountId },
      data: {
        ...(bank_name !== undefined && { bank_name }),
        ...(account_type !== undefined && { account_type }),
        ...(routing_number !== undefined && { routing_number }),
        ...(account_number !== undefined && { account_number }),
        ...(amount_type !== undefined && { amount_type }),
        ...(amount !== undefined && { amount }),
        ...(sequence !== undefined && { sequence }),
        ...(prenote_send_date !== undefined && { prenote_send_date: prenote_send_date ? new Date(prenote_send_date) : null }),
        ...(prenote_approve_date !== undefined && { prenote_approve_date: prenote_approve_date ? new Date(prenote_approve_date) : null }),
        ...(is_active !== undefined && { is_active }),
      },
    });

    return sendSuccess(res, { account });
  } catch (err: any) {
    console.error('Error updating bank account:', err);
    return sendError(res, 'Failed to update bank account', 500);
  }
};

// ════════════════════════════════════════════════════════════════
// COMPANY BANK ACCOUNTS ("Bank" dropdown used by both Payroll Batch
// creation and ACH generation — must be the same bank for both)
// ════════════════════════════════════════════════════════════════

export const createCompanyBankAccount = async (req: Request, res: Response) => {
  try {
    const { company_name, description, ach_company_id, ach_company_name, originating_bank_name, originating_dfi_id, routing_number, account_number } = req.body;
    if (!company_name || !ach_company_id || !ach_company_name || !routing_number || !account_number || !originating_dfi_id) {
      return sendError(res, 'Missing required company bank account fields', 400);
    }
    const account = await (prisma as any).companyBankAccount.create({
      data: { company_name, description: description ?? null, ach_company_id, ach_company_name, originating_bank_name, originating_dfi_id, routing_number, account_number },
    });
    return sendSuccess(res, { account }, 201);
  } catch (err: any) {
    console.error('Error creating company bank account:', err);
    return sendError(res, 'Failed to create company bank account', 500);
  }
};

// GET /banks — dropdown source (bank id, bank name, description)
export const listCompanyBankAccounts = async (_req: Request, res: Response) => {
  try {
    const accounts = await (prisma as any).companyBankAccount.findMany({
      where: { is_active: true },
      select: { company_bank_account_id: true, company_name: true, description: true },
    });
    return sendSuccess(res, { banks: accounts });
  } catch (err: any) {
    console.error('Error listing company bank accounts:', err);
    return sendError(res, 'Failed to list banks', 500);
  }
};

// ════════════════════════════════════════════════════════════════
// STEP 2 — PAYROLL BATCH
// ════════════════════════════════════════════════════════════════

// GET /payroll/run-types — dropdown source
export const getRunTypes = async (_req: Request, res: Response) => {
  return sendSuccess(res, { run_types: CHECK_RUN_TYPES });
};

// POST /payroll-batches
// body: { accounting_period, check_date, run_type, bank_id, description?, message? }
export const createPayrollBatch = async (req: Request, res: Response) => {
  try {
    const { accounting_period, check_date, run_type, bank_id, description, message } = req.body;
    const created_by_user_id = (req as any).user?.user_id;
    if (!created_by_user_id) return sendError(res, 'Unauthorized', 401);

    if (!accounting_period || !check_date || !run_type || !bank_id) {
      return sendError(res, 'accounting_period, check_date, run_type, and bank_id are required', 400);
    }
    if (!CHECK_RUN_TYPES.includes(run_type)) return sendError(res, `run_type must be one of: ${CHECK_RUN_TYPES.join(', ')}`, 400);

    const accountingPeriodDate = new Date(accounting_period);
    const checkDateDate = new Date(check_date);
    if (isNaN(accountingPeriodDate.getTime()) || isNaN(checkDateDate.getTime())) {
      return sendError(res, 'Invalid accounting_period or check_date', 400);
    }
    if (!isSunday(accountingPeriodDate)) return sendError(res, 'accounting_period must be a Sunday', 400);
    if (!isFriday(checkDateDate)) return sendError(res, 'check_date must be a Friday', 400);

    const bank = await (prisma as any).companyBankAccount.findUnique({ where: { company_bank_account_id: bank_id } });
    if (!bank || !bank.is_active) return sendError(res, 'Bank not found or inactive', 404);

    const batch = await (prisma as any).payrollBatch.create({
      data: {
        accounting_period: accountingPeriodDate,
        check_date: checkDateDate,
        run_type: RUN_TYPE_TO_ENUM[run_type],
        bank_id,
        description: description ?? null,
        message: message ?? null,
        created_by_user_id,
      },
      include: { bank: { select: { company_name: true, description: true } } },
    });

    return sendSuccess(res, { batch }, 201);
  } catch (err: any) {
    console.error('Error creating payroll batch:', err);
    return sendError(res, 'Failed to create payroll batch', 500);
  }
};

// GET /payroll-batches?status=
export const getAllPayrollBatches = async (req: Request, res: Response) => {
  try {
    const { status } = req.query;
    const batches = await (prisma as any).payrollBatch.findMany({
      where: status ? { status } : {},
      orderBy: { created_at: 'desc' },
      include: { bank: { select: { company_name: true } }, _count: { select: { transactions: true, checks: true } } },
    });
    return sendSuccess(res, { batches });
  } catch (err: any) {
    console.error('Error fetching payroll batches:', err);
    return sendError(res, 'Failed to fetch payroll batches', 500);
  }
};

// GET /payroll-batches/:batchId
export const getPayrollBatchById = async (req: Request, res: Response) => {
  try {
    const { batchId } = req.params;
    const batch = await (prisma as any).payrollBatch.findUnique({
      where: { payroll_batch_id: batchId },
      include: {
        bank: true,
        checks: { select: { payroll_check_id: true, applicant_id: true, status: true, net_pay: true, check_number: true } },
        _count: { select: { transactions: true } },
      },
    });
    if (!batch) return sendError(res, 'Payroll batch not found', 404);
    return sendSuccess(res, { batch });
  } catch (err: any) {
    console.error('Error fetching payroll batch:', err);
    return sendError(res, 'Failed to fetch payroll batch', 500);
  }
};

// GET /payroll-batches/:batchId/available-transactions
// The "Select Transaction" screen — VERIFIED transactions not yet
// claimed by any payroll batch, grouped by Bill To with a totals row.
export const getAvailableTransactions = async (req: Request, res: Response) => {
  try {
    const { groupBy } = req.query; // 'organization' | 'branch' | 'employee' | 'batch' (default: organization)

    const transactions = await (prisma as any).payrollTransaction.findMany({
      where: { status: 'VERIFIED', payroll_batch_id: null },
      include: {
        organization: { select: { organization_id: true, name: true } },
        batch: { select: { batch_number: true } },
        assignment: {
          include: {
            application: { include: { applicant: { include: { contact: true, bank_accounts: true } } } },
          },
        },
      },
      orderBy: { week_worked: 'desc' },
    });

    const rows = transactions.map((t: any) => {
      const applicant = t.assignment?.application?.applicant;
      const hasActiveBank = (applicant?.bank_accounts ?? []).some((b: any) => b.is_active);
      return {
        transaction_id: t.transaction_id,
        select: false,
        bill_to: t.organization?.name ?? null,
        dept_name: t.department,
        payee_name: applicant?.full_name ?? null,
        total_pay: toNum(t.total_pay_amount),
        week_worked: t.week_worked,
        employee: applicant?.full_name ?? null,
        applicant_id: applicant?.applicant_id ?? null,
        direct_deposit: hasActiveBank,
        site_name: t.branch,
        is_w2: t.assignment?.employment_type === 'W2',
        batch_number: t.batch?.batch_number ?? null,
        group_key: groupBy === 'employee' ? (applicant?.full_name ?? 'Unknown')
          : groupBy === 'branch' ? (t.branch ?? 'Unassigned')
          : groupBy === 'batch' ? `Batch #${t.batch?.batch_number ?? ''}`
          : (t.organization?.name ?? 'Unknown'),
      };
    });

    const groups: Record<string, any[]> = {};
    for (const r of rows) (groups[r.group_key] ??= []).push(r);

    const grouped = Object.entries(groups).map(([group_key, groupRows]) => ({
      group_key,
      rows: groupRows,
      total_pay: round2(groupRows.reduce((s, r) => s + r.total_pay, 0)),
    }));

    return sendSuccess(res, { groups: grouped, total_transactions: rows.length });
  } catch (err: any) {
    console.error('Error fetching available transactions:', err);
    return sendError(res, 'Failed to fetch available transactions', 500);
  }
};

// POST /payroll-batches/:batchId/select-transactions
// body: { transaction_ids: string[] }
export const selectTransactionsForBatch = async (req: Request, res: Response) => {
  try {
    const { batchId } = req.params;
    const { transaction_ids } = req.body;
    if (!Array.isArray(transaction_ids) || !transaction_ids.length) {
      return sendError(res, 'transaction_ids array is required', 400);
    }

    const batch = await (prisma as any).payrollBatch.findUnique({ where: { payroll_batch_id: batchId } });
    if (!batch) return sendError(res, 'Payroll batch not found', 404);
    if (batch.status !== 'DRAFT') return sendError(res, 'Transactions can only be selected while the batch is DRAFT', 400);

    const alreadyClaimed = await (prisma as any).payrollTransaction.findMany({
      where: { transaction_id: { in: transaction_ids }, OR: [{ payroll_batch_id: { not: null } }, { status: { not: 'VERIFIED' } }] },
      select: { transaction_id: true },
    });
    if (alreadyClaimed.length) {
      return sendError(res, 'Some transactions are already in another payroll batch or not VERIFIED', 409, alreadyClaimed as any);
    }

    await (prisma as any).payrollTransaction.updateMany({
      where: { transaction_id: { in: transaction_ids } },
      data: { payroll_batch_id: batchId },
    });

    return sendSuccess(res, { message: `${transaction_ids.length} transactions added to batch.`, batch_id: batchId });
  } catch (err: any) {
    console.error('Error selecting transactions:', err);
    return sendError(res, 'Failed to select transactions', 500);
  }
};

// POST /payroll-batches/:batchId/remove-transaction
// "delete with a reason" — unclaims a transaction from the batch
// body: { transaction_id, reason }
export const removeTransactionFromBatch = async (req: Request, res: Response) => {
  try {
    const { batchId } = req.params;
    const { transaction_id, reason } = req.body;
    if (!transaction_id || !reason?.trim()) return sendError(res, 'transaction_id and reason are required', 400);

    const batch = await (prisma as any).payrollBatch.findUnique({ where: { payroll_batch_id: batchId } });
    if (!batch) return sendError(res, 'Payroll batch not found', 404);
    if (batch.status !== 'DRAFT') return sendError(res, 'Transactions can only be removed while the batch is DRAFT', 400);

    const transaction = await (prisma as any).payrollTransaction.findFirst({ where: { transaction_id, payroll_batch_id: batchId } });
    if (!transaction) return sendError(res, 'Transaction not found in this batch', 404);

    await (prisma as any).payrollTransaction.update({
      where: { transaction_id },
      data: { payroll_batch_id: null, removed_from_batch_reason: reason },
    });

    return sendSuccess(res, { message: 'Transaction removed from batch.' });
  } catch (err: any) {
    console.error('Error removing transaction:', err);
    return sendError(res, 'Failed to remove transaction', 500);
  }
};

// POST /payroll-batches/:batchId/save-and-close
// Just a state confirmation — no status change (still DRAFT until processed).
export const saveAndCloseBatchSelection = async (req: Request, res: Response) => {
  try {
    const { batchId } = req.params;
    const batch = await (prisma as any).payrollBatch.findUnique({
      where: { payroll_batch_id: batchId },
      include: { _count: { select: { transactions: true } } },
    });
    if (!batch) return sendError(res, 'Payroll batch not found', 404);
    return sendSuccess(res, { message: 'Batch saved.', transaction_count: batch._count.transactions });
  } catch (err: any) {
    console.error('Error saving batch selection:', err);
    return sendError(res, 'Failed to save batch', 500);
  }
};

// // POST /payroll-batches/:batchId/process
// // Runs Module 4 calculation grouped BY EMPLOYEE (not per-transaction —
// // multiple assignments for the same employee combine into one check).
// export const processPayrollBatch = async (req: Request, res: Response) => {
//   try {
//     const { batchId } = req.params;

//     const batch = await (prisma as any).payrollBatch.findUnique({ where: { payroll_batch_id: batchId } });
//     if (!batch) return sendError(res, 'Payroll batch not found', 404);
//     if (batch.status !== 'DRAFT') return sendError(res, 'Batch must be DRAFT to process', 400);

//     const transactions = await (prisma as any).payrollTransaction.findMany({
//       where: { payroll_batch_id: batchId },
//       include: {
//         lines: true,
//         organization: { select: { name: true } },
//         assignment: {
//           include: {
//             application: {
//               include: { applicant: { include: { demographic: true, benefit_deductions: true, garnishments: true, bank_accounts: true } } },
//             },
//           },
//         },
//       },
//     });
//     if (!transactions.length) return sendError(res, 'No transactions selected for this batch', 400);

//     const byApplicant = new Map<string, { applicant: any; transactions: any[] }>();
//     for (const t of transactions) {
//       const applicant = t.assignment?.application?.applicant;
//       if (!applicant) continue;
//       if (!byApplicant.has(applicant.applicant_id)) byApplicant.set(applicant.applicant_id, { applicant, transactions: [] });
//       byApplicant.get(applicant.applicant_id)!.transactions.push(t);
//     }

//     const createdChecks: any[] = [];
//     const errors: { applicant_id: string; message: string }[] = [];

//     for (const [applicantId, { applicant, transactions: txns }] of byApplicant) {
//       try {
//         const grossPay = round2(txns.reduce((s: number, t: any) => s + toNum(t.total_pay_amount), 0));
//         if (grossPay <= 0) { errors.push({ applicant_id: applicantId, message: 'Gross pay is 0' }); continue; }

//         const taxInfo = applicant.demographic?.tax_info ?? {};
//         const localTaxInfo = applicant.demographic?.local_tax_info ?? null;
//         const taxes = calculateTaxes(grossPay, taxInfo, localTaxInfo);
//         const netBeforeDeductions = round2(grossPay - taxes.federal_tax - taxes.state_tax - taxes.local_tax - taxes.employee_ss - taxes.employee_medicare);
//         const deductionResult = applyDeductions(netBeforeDeductions, applicant.benefit_deductions ?? [], applicant.garnishments ?? []);
//         const isDirectDeposit = (applicant.bank_accounts ?? []).some((b: any) => b.is_active);

//         const check = await (prisma as any).payrollCheck.create({
//           data: {
//             payroll_batch_id: batchId,
//             applicant_id: applicantId,
//             gross_pay: grossPay,
//             federal_tax: taxes.federal_tax,
//             state_tax: taxes.state_tax,
//             local_tax: taxes.local_tax,
//             employee_ss: taxes.employee_ss,
//             employee_medicare: taxes.employee_medicare,
//             benefit_deductions_total: deductionResult.benefitTotal,
//             garnishments_total: deductionResult.garnishmentTotal,
//             deduction_breakdown: deductionResult.breakdown,
//             net_pay: deductionResult.netPay,
//             is_direct_deposit: isDirectDeposit,
//             lines: {
//               create: txns.flatMap((t: any) =>
//                 t.lines.map((l: any) => ({
//                   transaction_id: t.transaction_id,
//                   week_worked: t.week_worked,
//                   customer_name: t.organization?.name ?? 'Unknown',
//                   department: t.department,
//                   earning_type: l.custom_earning_label ?? l.earning_type,
//                   hours: l.pay_units,
//                   pay_rate: l.pay_rate,
//                   amount: l.item_pay,
//                 }))
//               ),
//             },
//           },
//           include: { lines: true },
//         });

//         createdChecks.push(check);
//       } catch (e: any) {
//         errors.push({ applicant_id: applicantId, message: e.message });
//       }
//     }

//     const updated = await (prisma as any).payrollBatch.update({
//       where: { payroll_batch_id: batchId },
//       data: { status: 'PROCESSED', processed_at: new Date() },
//     });

//     return sendSuccess(res, {
//       batch: updated,
//       checks_created: createdChecks.length,
//       errors,
//       // Batch log / transaction summary / check summary for the UI:
//       batch_log: { batch_id: batchId, transactions_processed: transactions.length, employees_paid: createdChecks.length },
//       check_summary: createdChecks.map((c) => ({ payroll_check_id: c.payroll_check_id, applicant_id: c.applicant_id, gross_pay: c.gross_pay, net_pay: c.net_pay })),
//     });
//   } catch (err: any) {
//     console.error('Error processing payroll batch:', err);
//     return sendError(res, 'Failed to process payroll batch', 500);
//   }
// };


// ────────────────────────────────────────────────────────────────
// FIND: the ENTIRE existing `processPayrollBatch` function (from the
// `// POST /payroll-batches/:batchId/process` comment down through its
// closing `};`) and REPLACE the whole thing with the version below.
// It now: computes YTD wage bases, applies real tax brackets, computes
// employer-side costs (WC/ER-SS/ER-Medicare/FUTA/SUTA), and branches
// agency-linked assignments into a separate zero-withholding check.
// ────────────────────────────────────────────────────────────────
 
export const processPayrollBatch = async (req: Request, res: Response) => {
  try {
    const { batchId } = req.params;
 
    const batch = await (prisma as any).payrollBatch.findUnique({ where: { payroll_batch_id: batchId } });
    if (!batch) return sendError(res, 'Payroll batch not found', 404);
    if (batch.status !== 'DRAFT') return sendError(res, 'Batch must be DRAFT to process', 400);
 
    const transactions = await (prisma as any).payrollTransaction.findMany({
      where: { payroll_batch_id: batchId },
      include: {
        lines: true,
        organization: { select: { name: true } },
        assignment: {
          include: {
            agency: true,
            application: {
              include: {
                job: { select: { pay_period: true } },
                applicant: { include: { demographic: true, benefit_deductions: true, garnishments: true, bank_accounts: true } },
              },
            },
          },
        },
      },
    });
    if (!transactions.length) return sendError(res, 'No transactions selected for this batch', 400);
 
    const wcCodes = await (prisma as any).wCCode.findMany({ where: { is_active: true } });
    const wcRateByCode = new Map(wcCodes.map((w: any) => [w.code, toNum(w.insurance_rate)]));
    const taxYear = batch.check_date.getUTCFullYear();
 
    // Group by payee — agency (if assignment.agency_id is set) or applicant.
    const byPayee = new Map<string, { applicant: any | null; agency: any | null; transactions: any[] }>();
    for (const t of transactions) {
      const assignment = t.assignment;
      const agency = assignment?.agency;
      const applicant = assignment?.application?.applicant;
      if (!agency && !applicant) continue;
      const key = agency ? `agency:${agency.agency_id}` : `applicant:${applicant.applicant_id}`;
      if (!byPayee.has(key)) byPayee.set(key, { applicant: agency ? null : applicant, agency: agency ?? null, transactions: [] });
      byPayee.get(key)!.transactions.push(t);
    }
 
    const createdChecks: any[] = [];
    const errors: { payee: string; message: string }[] = [];
 
    for (const [key, { applicant, agency, transactions: txns }] of byPayee) {
      try {
        const grossPay = round2(txns.reduce((s: number, t: any) => s + toNum(t.total_pay_amount), 0));
        if (grossPay <= 0) { errors.push({ payee: key, message: 'Gross pay is 0' }); continue; }
 
        // Weighted-average WC insurance rate across this payee's assignments
        let wcRate: number | null = null;
        const wcAssignmentCodes: any[] = txns[0]?.assignment?.workers_comp_codes ?? [];
        if (wcAssignmentCodes.length) {
          let weightedSum = 0, weightTotal = 0;
          for (const w of wcAssignmentCodes) {
            const rate = wcRateByCode.get(w.code);
            if (rate == null) continue;
            const pct = toNum(w.pct) || 100 / wcAssignmentCodes.length;
            weightedSum += (rate as number) * pct;
            weightTotal += pct;
          }
          wcRate = weightTotal > 0 ? weightedSum / weightTotal : null;
        }
 
        let checkData: any;
 
        if (agency) {
          // Agency is paid as a vendor — no employee tax withholding, no
          // employer-side payroll taxes on our side (the agency runs its
          // own payroll for its workers).
          checkData = {
            payroll_batch_id: batchId,
            applicant_id: null,
            agency_id: agency.agency_id,
            gross_pay: grossPay,
            federal_tax: 0, state_tax: 0, local_tax: 0, employee_ss: 0, employee_medicare: 0,
            benefit_deductions_total: 0, garnishments_total: 0, deduction_breakdown: [],
            net_pay: grossPay,
            employer_wc_cost: 0, employer_ss: 0, employer_medicare: 0, employer_futa: 0, employer_suta: 0, total_employer_cost: 0,
            is_direct_deposit: !!(agency.routing_number && agency.account_number),
          };
        } else {
          const payFrequency = txns[0]?.assignment?.payroll_frequency ?? txns[0]?.assignment?.application?.job?.pay_period ?? 'WEEKLY';
          const ytd = await computeYtd(applicant.applicant_id, batch.check_date);
          const taxInfo = applicant.demographic?.tax_info ?? {};
          const localTaxInfo = applicant.demographic?.local_tax_info ?? null;
 
          const taxes = await calculateTaxes({
            grossPay, taxInfo, localTaxInfo, payFrequency, ytdGrossBeforeThisCheck: ytd.gross, taxYear,
          });
          const netBeforeDeductions = round2(
            grossPay - taxes.federal_tax - taxes.state_tax - taxes.local_tax - taxes.employee_ss - taxes.employee_medicare
          );
          const deductionResult = applyDeductions(netBeforeDeductions, applicant.benefit_deductions ?? [], applicant.garnishments ?? []);
          const isDirectDeposit = (applicant.bank_accounts ?? []).some((b: any) => b.is_active);
 
          const employerCosts = calculateEmployerCosts({
            grossPay, ssTaxableThisCheck: taxes.ssTaxableThisCheck, ytdGrossBeforeThisCheck: ytd.gross,
            wcInsuranceRate: wcRate, sutaRate: DEFAULT_SUTA_RATE,
          });
 
          checkData = {
            payroll_batch_id: batchId,
            applicant_id: applicant.applicant_id,
            agency_id: null,
            gross_pay: grossPay,
            federal_tax: taxes.federal_tax, state_tax: taxes.state_tax, local_tax: taxes.local_tax,
            employee_ss: taxes.employee_ss, employee_medicare: taxes.employee_medicare,
            benefit_deductions_total: deductionResult.benefitTotal, garnishments_total: deductionResult.garnishmentTotal,
            deduction_breakdown: deductionResult.breakdown,
            net_pay: deductionResult.netPay,
            employer_wc_cost: employerCosts.employer_wc_cost, employer_ss: employerCosts.employer_ss,
            employer_medicare: employerCosts.employer_medicare, employer_futa: employerCosts.employer_futa,
            employer_suta: employerCosts.employer_suta, total_employer_cost: employerCosts.total_employer_cost,
            is_direct_deposit: isDirectDeposit,
          };
        }
 
        const check = await (prisma as any).payrollCheck.create({
          data: {
            ...checkData,
            lines: {
              create: txns.flatMap((t: any) =>
                t.lines.map((l: any) => ({
                  transaction_id: t.transaction_id,
                  week_worked: t.week_worked,
                  customer_name: t.organization?.name ?? 'Unknown',
                  department: t.department,
                  earning_type: l.custom_earning_label ?? l.earning_type,
                  hours: l.pay_units,
                  pay_rate: l.pay_rate,
                  amount: l.item_pay,
                }))
              ),
            },
          },
          include: { lines: true },
        });
 
        createdChecks.push(check);
      } catch (e: any) {
        errors.push({ payee: key, message: e.message });
      }
    }
 
    const updated = await (prisma as any).payrollBatch.update({
      where: { payroll_batch_id: batchId },
      data: { status: 'PROCESSED', processed_at: new Date() },
    });
 
    return sendSuccess(res, {
      batch: updated,
      checks_created: createdChecks.length,
      errors,
      batch_log: { batch_id: batchId, transactions_processed: transactions.length, payees_paid: createdChecks.length },
      check_summary: createdChecks.map((c) => ({
        payroll_check_id: c.payroll_check_id, applicant_id: c.applicant_id, agency_id: c.agency_id,
        gross_pay: c.gross_pay, net_pay: c.net_pay, total_employer_cost: c.total_employer_cost,
      })),
    });
  } catch (err: any) {
    console.error('Error processing payroll batch:', err);
    return sendError(res, 'Failed to process payroll batch', 500);
  }
};



// POST /payroll-batches/:batchId/print-checks
// body: { starting_check_number? } — auto-increments if omitted.
// Enforces the "must be 8 characters" rule + global uniqueness.
export const printChecks = async (req: Request, res: Response) => {
  try {
    const { batchId } = req.params;
    const { starting_check_number } = req.body;

    const batch = await (prisma as any).payrollBatch.findUnique({ where: { payroll_batch_id: batchId } });
    if (!batch) return sendError(res, 'Payroll batch not found', 404);
    if (batch.status !== 'PROCESSED') return sendError(res, 'Batch must be PROCESSED before printing checks', 400);

    const checks = await (prisma as any).payrollCheck.findMany({ where: { payroll_batch_id: batchId, check_number: null } });
    if (!checks.length) return sendError(res, 'No unprinted checks found for this batch', 400);

    let nextNumber: number;
    if (starting_check_number) {
      if (String(starting_check_number).length !== 8) return sendError(res, 'Check number must be exactly 8 characters', 400);
      nextNumber = parseInt(starting_check_number, 10);
      if (isNaN(nextNumber)) return sendError(res, 'starting_check_number must be numeric (8 digits)', 400);
    } else {
      const last = await (prisma as any).payrollCheck.findFirst({ where: { check_number: { not: null } }, orderBy: { check_number: 'desc' } });
      nextNumber = last ? parseInt(last.check_number, 10) + 1 : 10000001;
    }

    const printed: any[] = [];
    for (const check of checks) {
      const checkNumber = String(nextNumber).padStart(8, '0');
      if (checkNumber.length !== 8) return sendError(res, 'Check number sequence exceeded 8 digits — reset your numbering', 400);

      const existing = await (prisma as any).payrollCheck.findUnique({ where: { check_number: checkNumber } });
      if (existing) return sendError(res, `Check number ${checkNumber} is already in use — please pick a different starting number`, 409);

      const updatedCheck = await (prisma as any).payrollCheck.update({
        where: { payroll_check_id: check.payroll_check_id },
        data: { check_number: checkNumber, status: 'PRINTED', printed_at: new Date() },
      });
      printed.push(updatedCheck);
      nextNumber++;
    }

    await (prisma as any).payrollBatch.update({
      where: { payroll_batch_id: batchId },
      data: { status: 'CHECKS_PRINTED', checks_printed_at: new Date() },
    });

    return sendSuccess(res, { printed_count: printed.length, checks: printed.map((c) => ({ payroll_check_id: c.payroll_check_id, check_number: c.check_number })) });
  } catch (err: any) {
    console.error('Error printing checks:', err);
    return sendError(res, 'Failed to print checks', 500);
  }
};

// ════════════════════════════════════════════════════════════════
// PAYROLL CHECK — full pay stub + verify / correction workflow
// ════════════════════════════════════════════════════════════════

// GET /payroll-checks/:checkId — full Earnings Statement payload
export const getPayrollCheckStub = async (req: Request, res: Response) => {
  try {
    const { checkId } = req.params;

    const check = await (prisma as any).payrollCheck.findUnique({
      where: { payroll_check_id: checkId },
      include: {
        lines: true,
        batch: { include: { bank: true } },
        applicant: {
          include: {
            contact: true,
            demographic: true,
            bank_accounts: { where: { is_active: true } },
            benefit_deductions: { where: { is_active: true } },
          },
        },
      },
    });
    if (!check) return sendError(res, 'Payroll check not found', 404);

    const applicant = check.applicant;
    const ssnLast4 = applicant?.demographic?.ssn_encrypted ? '****' : null; // real last-4 requires your decrypt helper

    const ytd = await computeYtd(applicant.applicant_id, check.batch.check_date, check.payroll_check_id);
    const currentYtdGross = round2(ytd.gross + toNum(check.gross_pay));

    const weekStart = check.lines.reduce((min: Date | null, l: any) => (!min || l.week_worked < min ? l.week_worked : min), null as Date | null);
    const weekEnd = check.lines.reduce((max: Date | null, l: any) => (!max || l.week_worked > max ? l.week_worked : max), null as Date | null);

    const totalHours = round2(check.lines.reduce((s: number, l: any) => s + toNum(l.hours), 0));

    const stub = {
      company: { name: check.lines[0]?.customer_name ?? 'Company' }, // TODO: replace with your actual employer/company entity if separate from client orgs

      employee: {
        name: applicant.full_name,
        address: applicant.contact?.address ?? null,
        city: applicant.contact?.city ?? null,
        state: applicant.contact?.state ?? null,
        zip: applicant.contact?.zip ?? null,
        ssn_masked: ssnLast4 ? `***-**-${ssnLast4}` : null,
      },

      payment_info: {
        pay_date: check.batch.check_date,
        pay_period_start: weekStart,
        pay_period_end: weekEnd,
        check_number: check.check_number,
      },

      earnings: check.lines.map((l: any) => ({
        week_worked: l.week_worked,
        employee: applicant.full_name,
        customer: l.customer_name,
        department: l.department,
        type: l.earning_type,
        hours: toNum(l.hours),
        pay_rate: toNum(l.pay_rate),
        total_pay: toNum(l.amount),
      })),
      earnings_total: { total_hours: totalHours, total_gross_pay: toNum(check.gross_pay) },

      taxes: [
        { tax_name: 'Federal Income Tax', taxable_gross: toNum(check.gross_pay), tax_amount: toNum(check.federal_tax), ytd_tax: round2(ytd.federal_tax + toNum(check.federal_tax)) },
        { tax_name: 'State Withholding', taxable_gross: toNum(check.gross_pay), tax_amount: toNum(check.state_tax), ytd_tax: round2(ytd.state_tax + toNum(check.state_tax)) },
        { tax_name: 'Local Tax', taxable_gross: toNum(check.gross_pay), tax_amount: toNum(check.local_tax), ytd_tax: round2(ytd.local_tax + toNum(check.local_tax)) },
        { tax_name: 'FICA Employee (SS)', taxable_gross: toNum(check.gross_pay), tax_amount: toNum(check.employee_ss), ytd_tax: round2(ytd.employee_ss + toNum(check.employee_ss)) },
        { tax_name: 'Medicare Employee', taxable_gross: toNum(check.gross_pay), tax_amount: toNum(check.employee_medicare), ytd_tax: round2(ytd.employee_medicare + toNum(check.employee_medicare)) },
      ],

      deductions: (check.deduction_breakdown ?? []).map((d: any) => ({
        deduction_type: d.label,
        amount: d.amount,
        ytd_deduction: round2((ytd.deductions[d.type] ?? 0) + toNum(d.amount)),
      })),

      direct_deposit: applicant.bank_accounts.map((b: any) => ({
        bank_name: b.bank_name,
        deposit_amount: b.amount_type === 'FIXED' ? toNum(b.amount) : toNum(check.net_pay),
        account_masked: `*****${String(b.account_number).slice(-4)}`,
      })),

      payroll_summary: {
        ytd_gross: currentYtdGross,
        current_gross: toNum(check.gross_pay),
        net_amount: toNum(check.net_pay),
      },

      // Leave/accruals require a dedicated accrual-balance table not yet
      // in the schema — stubbed empty until that model exists.
      leave_accruals: [] as { plan_name: string; accrued_hours: number; balance: number }[],

      status: check.status,
      correction_reason: check.correction_reason,
    };

    return sendSuccess(res, { stub });
  } catch (err: any) {
    console.error('Error building payroll check stub:', err);
    return sendError(res, 'Failed to fetch payroll check', 500);
  }
};

// POST /payroll-checks/:checkId/verify
// "Was everything alright with check?" — body: { is_correct: boolean, description? }
export const verifyPayrollCheck = async (req: Request, res: Response) => {
  try {
    const { checkId } = req.params;
    const { is_correct, description } = req.body;
    const verified_by_user_id = (req as any).user?.user_id;
    if (typeof is_correct !== 'boolean') return sendError(res, 'is_correct (boolean) is required', 400);
    if (!is_correct && !description?.trim()) return sendError(res, 'description is required when the check is not correct', 400);

    const check = await (prisma as any).payrollCheck.findUnique({ where: { payroll_check_id: checkId } });
    if (!check) return sendError(res, 'Payroll check not found', 404);
    if (check.status !== 'PRINTED') return sendError(res, 'Only PRINTED checks can be verified', 400);

    const updated = await (prisma as any).payrollCheck.update({
      where: { payroll_check_id: checkId },
      data: is_correct
        ? { status: 'VERIFIED_OK', verified_at: new Date(), verified_by_user_id, correction_reason: null }
        : { status: 'CORRECTION_NEEDED', verified_at: new Date(), verified_by_user_id, correction_reason: description },
    });

    return sendSuccess(res, { check: updated });
  } catch (err: any) {
    console.error('Error verifying payroll check:', err);
    return sendError(res, 'Failed to verify payroll check', 500);
  }
};

// POST /payroll-checks/:checkId/resolve-correction
// body: { action: 'VOID' | 'MARK_OK', note? }
export const resolveCheckCorrection = async (req: Request, res: Response) => {
  try {
    const { checkId } = req.params;
    const { action, note } = req.body;
    if (!['VOID', 'MARK_OK'].includes(action)) return sendError(res, "action must be 'VOID' or 'MARK_OK'", 400);

    const check = await (prisma as any).payrollCheck.findUnique({ where: { payroll_check_id: checkId } });
    if (!check) return sendError(res, 'Payroll check not found', 404);
    if (check.status !== 'CORRECTION_NEEDED') return sendError(res, 'Only checks in CORRECTION_NEEDED can be resolved here', 400);

    const updated = await (prisma as any).payrollCheck.update({
      where: { payroll_check_id: checkId },
      data: action === 'VOID'
        ? { status: 'VOIDED', correction_reason: note ? `${check.correction_reason} — VOIDED: ${note}` : check.correction_reason }
        : { status: 'VERIFIED_OK', correction_reason: note ? `${check.correction_reason} — RESOLVED: ${note}` : check.correction_reason },
    });

    return sendSuccess(res, { check: updated });
  } catch (err: any) {
    console.error('Error resolving check correction:', err);
    return sendError(res, 'Failed to resolve correction', 500);
  }
};

// POST /payroll-batches/:batchId/post
// Finalizes — requires no outstanding CORRECTION_NEEDED checks.
export const postPayrollBatch = async (req: Request, res: Response) => {
  try {
    const { batchId } = req.params;
    const posted_by_user_id = (req as any).user?.user_id;
    if (!posted_by_user_id) return sendError(res, 'Unauthorized', 401);

    const batch = await (prisma as any).payrollBatch.findUnique({ where: { payroll_batch_id: batchId } });
    if (!batch) return sendError(res, 'Payroll batch not found', 404);
    if (batch.status !== 'CHECKS_PRINTED') return sendError(res, 'Batch must be CHECKS_PRINTED before posting', 400);

    const outstanding = await (prisma as any).payrollCheck.findMany({
      where: { payroll_batch_id: batchId, status: 'CORRECTION_NEEDED' },
      select: { payroll_check_id: true, applicant_id: true, correction_reason: true },
    });
    if (outstanding.length) {
      return sendError(res, 'Resolve all check corrections before posting this batch', 409, outstanding as any);
    }

    await (prisma as any).payrollCheck.updateMany({
      where: { payroll_batch_id: batchId, status: { in: ['PRINTED', 'VERIFIED_OK'] } },
      data: { status: 'POSTED', posted_at: new Date() },
    });

    const updated = await (prisma as any).payrollBatch.update({
      where: { payroll_batch_id: batchId },
      data: { status: 'POSTED', posted_at: new Date(), posted_by_user_id },
    });

    return sendSuccess(res, { batch: updated, message: 'Payroll batch posted.' });
  } catch (err: any) {
    console.error('Error posting payroll batch:', err);
    return sendError(res, 'Failed to post payroll batch', 500);
  }
};

// POST /payroll-batches/:batchId/void
// body: { reason }
export const voidPayrollBatch = async (req: Request, res: Response) => {
  try {
    const { batchId } = req.params;
    const { reason } = req.body;
    if (!reason?.trim()) return sendError(res, 'reason is required', 400);

    const batch = await (prisma as any).payrollBatch.findUnique({ where: { payroll_batch_id: batchId } });
    if (!batch) return sendError(res, 'Payroll batch not found', 404);
    if (batch.status === 'POSTED') return sendError(res, 'Posted batches cannot be voided — process a Check Reverse / Check Void run instead', 400);

    await (prisma as any).payrollTransaction.updateMany({ where: { payroll_batch_id: batchId }, data: { payroll_batch_id: null } });
    await (prisma as any).payrollCheck.updateMany({ where: { payroll_batch_id: batchId }, data: { status: 'VOIDED' } });

    const updated = await (prisma as any).payrollBatch.update({
      where: { payroll_batch_id: batchId },
      data: { status: 'VOIDED', voided_at: new Date(), void_reason: reason },
    });

    return sendSuccess(res, { batch: updated });
  } catch (err: any) {
    console.error('Error voiding payroll batch:', err);
    return sendError(res, 'Failed to void payroll batch', 500);
  }
};

// ════════════════════════════════════════════════════════════════
// STEP 4 — WEEKLY PROCESS: ACH FILE GENERATION
// ════════════════════════════════════════════════════════════════

function buildNachaFile(params: {
  company: { ach_company_id: string; ach_company_name: string; originating_dfi_id: string; routing_number: string };
  entries: { routingNumber: string; accountNumber: string; accountType: 'CHECKING' | 'SAVINGS'; amountCents: number; employeeName: string; traceSeq: number }[];
  effectiveDate: Date;
  includeBalancingLine: boolean;
}) {
  const pad = (v: string | number, len: number, padChar = ' ', left = false) => {
    const s = String(v);
    return left ? s.padEnd(len, padChar).slice(0, len) : s.padStart(len, padChar).slice(0, len);
  };
  const yymmdd = (d: Date) => d.toISOString().slice(2, 10).replace(/-/g, '');
  const now = new Date();

  const fileHeader =
    '1' + '01' + pad(params.company.routing_number, 10) + pad(params.company.originating_dfi_id, 10) +
    yymmdd(now) + pad(now.toTimeString().slice(0, 5).replace(':', ''), 4) +
    'A' + '094' + '10' + '1' +
    pad(params.company.ach_company_name, 23, ' ', true) + pad('', 23, ' ', true) + pad('', 8);

  const batchHeader =
    '5' + '200' + pad(params.company.ach_company_name, 16, ' ', true) + pad('', 20, ' ', true) +
    pad(params.company.ach_company_id, 10) + 'PPD' + pad('PAYROLL', 10, ' ', true) +
    yymmdd(params.effectiveDate) + yymmdd(params.effectiveDate) + '   ' + '1' +
    pad(params.company.originating_dfi_id.slice(0, 8), 8) + pad('1', 7);

  let entryLines: string[] = [];
  let totalCredit = 0;
  let traceSeq = params.entries[0]?.traceSeq ?? 1;

  params.entries.forEach((e) => {
    const transactionCode = e.accountType === 'CHECKING' ? '22' : '32';
    totalCredit += e.amountCents;
    entryLines.push(
      '6' + transactionCode + pad(e.routingNumber.slice(0, 9), 9) +
      pad(e.accountNumber, 17, ' ', true) + pad(e.amountCents, 10) +
      pad('', 15, ' ', true) + pad(e.employeeName.toUpperCase(), 22, ' ', true) +
      '  ' + '0' + pad(params.company.originating_dfi_id.slice(0, 8), 8) + pad(e.traceSeq, 7)
    );
  });

  let totalDebit = 0;
  // Balancing line: one offsetting debit entry against the company's own
  // origination account for the batch total, per the "include balancing
  // line" checkbox.
  if (params.includeBalancingLine) {
    totalDebit = totalCredit;
    entryLines.push(
      '6' + '27' + pad(params.company.routing_number.slice(0, 9), 9) +
      pad(params.company.originating_dfi_id, 17, ' ', true) + pad(totalDebit, 10) +
      pad('', 15, ' ', true) + pad(params.company.ach_company_name, 22, ' ', true) +
      '  ' + '0' + pad(params.company.originating_dfi_id.slice(0, 8), 8) + pad(traceSeq + entryLines.length + 1, 7)
    );
  }

  const entryHash = params.entries.reduce((s, e) => s + Number(e.routingNumber.slice(0, 8)), 0).toString().slice(-10);
  const batchControl =
    '8' + '200' + pad(entryLines.length, 6) + pad(entryHash, 10) +
    pad(totalDebit, 12) + pad(totalCredit, 12) + pad(params.company.ach_company_id, 10) +
    pad('', 25, ' ', true) + pad('', 8) + pad(params.company.originating_dfi_id.slice(0, 8), 8) + pad('1', 7);

  const totalRecords = 4 + entryLines.length;
  const blockCount = Math.ceil(totalRecords / 10);
  const fileControl =
    '9' + pad('1', 6) + pad(blockCount, 6) + pad(entryLines.length, 8) +
    pad(entryHash, 10) + pad(totalDebit, 12) + pad(totalCredit, 12) + pad('', 39, ' ', true);

  const lines = [fileHeader, batchHeader, ...entryLines, batchControl, fileControl];
  while (lines.length % 10 !== 0) lines.push('9'.repeat(94));

  return { content: lines.join('\n'), totalAmountCents: totalCredit };
}

// POST /payroll-batches/:batchId/ach
// body: { bank_id, accounting_period, effective_date, include_balancing_line }
// bank_id MUST match the bank chosen when the payroll batch was created.
export const generateAchFile = async (req: Request, res: Response) => {
  try {
    const { batchId } = req.params;
    const { bank_id, accounting_period, effective_date, include_balancing_line } = req.body;

    if (!bank_id || !accounting_period || !effective_date || typeof include_balancing_line !== 'boolean') {
      return sendError(res, 'bank_id, accounting_period, effective_date, and include_balancing_line are all required', 400);
    }

    const batch = await (prisma as any).payrollBatch.findUnique({ where: { payroll_batch_id: batchId }, include: { bank: true } });
    if (!batch) return sendError(res, 'Payroll batch not found', 404);
    if (batch.status !== 'POSTED') return sendError(res, 'Payroll batch must be POSTED before generating ACH', 400);
    if (bank_id !== batch.bank_id) return sendError(res, 'bank_id must match the bank selected when this payroll batch was created', 400);

    const existing = await (prisma as any).aCHFile.findFirst({ where: { payroll_batch_id: batchId, status: { not: 'VOID' } } });
    if (existing) return sendError(res, 'An ACH file already exists for this batch', 409);

    // Check POSTED status first, then filter to checks whose employee
    // currently has an active bank account — instead of trusting the
    // is_direct_deposit flag frozen at process-time, which goes stale if
    // a bank account is added/activated afterward.
    const postedChecks = await (prisma as any).payrollCheck.findMany({
      where: { payroll_batch_id: batchId, status: 'POSTED' },
      include: { applicant: { include: { bank_accounts: { where: { is_active: true } } } } },
    });
    if (!postedChecks.length) {
      return sendError(res, 'No POSTED checks found in this batch — post the payroll batch before generating ACH', 400);
    }

    const checks = postedChecks.filter((c: any) => (c.applicant?.bank_accounts ?? []).length > 0);
    if (!checks.length) {
      return sendError(
        res,
        `${postedChecks.length} POSTED check(s) found, but none of those employees have an active bank account on file for direct deposit`,
        400
      );
    }

    const achEntries: any[] = [];
    let traceSeq = 1;
    for (const c of checks) {
      const netPay = toNum(c.net_pay);
      if (netPay <= 0) continue;
      const accounts = c.applicant.bank_accounts;
      let remaining = netPay;
      const fixedAccounts = accounts.filter((a: any) => a.amount_type === 'FIXED');
      const remainingAccount = accounts.find((a: any) => a.amount_type === 'REMAINING');

      for (const acc of fixedAccounts) {
        const amt = Math.min(toNum(acc.amount), remaining);
        if (amt <= 0) continue;
        remaining = round2(remaining - amt);
        achEntries.push({ routingNumber: acc.routing_number, accountNumber: acc.account_number, accountType: acc.account_type, amountCents: Math.round(amt * 100), employeeName: c.applicant.full_name, traceSeq: traceSeq++ });
      }
      if (remainingAccount && remaining > 0) {
        achEntries.push({ routingNumber: remainingAccount.routing_number, accountNumber: remainingAccount.account_number, accountType: remainingAccount.account_type, amountCents: Math.round(remaining * 100), employeeName: c.applicant.full_name, traceSeq: traceSeq++ });
      }
    }
    if (!achEntries.length) return sendError(res, 'No payable ACH entries found', 400);

    const { content, totalAmountCents } = buildNachaFile({
      company: batch.bank,
      entries: achEntries,
      effectiveDate: new Date(effective_date),
      includeBalancingLine: include_balancing_line,
    });

    const fileName = `ACH_${batch.batch_number}_${new Date(effective_date).toISOString().slice(0, 10)}.ach`;

    const achFile = await (prisma as any).aCHFile.create({
      data: {
        payroll_batch_id: batchId,
        company_bank_account_id: bank_id,
        file_name: fileName,
        file_content: content,
        total_amount: totalAmountCents / 100,
        entry_count: achEntries.length,
        accounting_period: new Date(accounting_period),
        effective_date: new Date(effective_date),
        include_balancing_line,
      },
    });

    return sendSuccess(res, {
      ach_file: { ...achFile, file_content: undefined },
      entry_count: achEntries.length,
      total_amount: totalAmountCents / 100,
    }, 201);
  } catch (err: any) {
    console.error('Error generating ACH file:', err);
    return sendError(res, 'Failed to generate ACH file', 500);
  }
};

// GET /ach-files/:achFileId/download
// "Choose Location" is a browser/OS save dialog — this endpoint just
// streams the raw file; where the user saves it is a frontend concern.
export const downloadAchFile = async (req: Request, res: Response) => {
  try {
    const { achFileId } = req.params;
    const achFile = await (prisma as any).aCHFile.findUnique({ where: { ach_file_id: achFileId } });
    if (!achFile) return sendError(res, 'ACH file not found', 404);

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${achFile.file_name}"`);
    return res.send(achFile.file_content);
  } catch (err: any) {
    console.error('Error downloading ACH file:', err);
    return sendError(res, 'Failed to download ACH file', 500);
  }
};

// ════════════════════════════════════════════════════════════════
// STEP 3 — BILLING BATCH (weekly, after payroll process — uses bill
// rates instead of pay rates)
// ════════════════════════════════════════════════════════════════

// ⚠️ Placeholder list — replace with your real billing batch types.
export const BILLING_BATCH_TYPES = ['WEEKLY_BILLING', 'OFF_CYCLE_BILLING', 'ADJUSTMENT_BILLING', 'CREDIT_MEMO', 'MANUAL_INVOICE', 'CORRECTION'];

async function generateClientInvoiceNumber(): Promise<string> {
  const year = new Date().getUTCFullYear();
  const count = await (prisma as any).clientInvoice.count({ where: { invoice_date: { gte: new Date(`${year}-01-01T00:00:00Z`) } } });
  return `CINV-${year}-${String(count + 1).padStart(4, '0')}`;
}

// POST /billing-batches
// body: { accounting_period, invoice_date, batch_type, description? }
export const createBillingBatch = async (req: Request, res: Response) => {
  try {
    const { accounting_period, invoice_date, batch_type, description } = req.body;
    const created_by_user_id = (req as any).user?.user_id;
    if (!created_by_user_id) return sendError(res, 'Unauthorized', 401);
    if (!accounting_period || !invoice_date || !batch_type) return sendError(res, 'accounting_period, invoice_date, and batch_type are required', 400);
    if (!BILLING_BATCH_TYPES.includes(batch_type)) return sendError(res, `batch_type must be one of: ${BILLING_BATCH_TYPES.join(', ')}`, 400);

    const batch = await (prisma as any).billingBatch.create({
      data: {
        accounting_period: new Date(accounting_period),
        invoice_date: new Date(invoice_date),
        batch_type,
        description: description ?? null,
        created_by_user_id,
      },
    });
    return sendSuccess(res, { batch }, 201);
  } catch (err: any) {
    console.error('Error creating billing batch:', err);
    return sendError(res, 'Failed to create billing batch', 500);
  }
};

// GET /billing-batches?status=
export const getAllBillingBatches = async (req: Request, res: Response) => {
  try {
    const { status } = req.query;
    const batches = await (prisma as any).billingBatch.findMany({
      where: status ? { status } : {},
      orderBy: { created_at: 'desc' },
      include: { _count: { select: { invoices: true } } },
    });
    return sendSuccess(res, { batches });
  } catch (err: any) {
    console.error('Error fetching billing batches:', err);
    return sendError(res, 'Failed to fetch billing batches', 500);
  }
};

// GET /billing-batches/:batchId
export const getBillingBatchById = async (req: Request, res: Response) => {
  try {
    const { batchId } = req.params;
    const batch = await (prisma as any).billingBatch.findUnique({
      where: { billing_batch_id: batchId },
      include: { invoices: { include: { organization: { select: { name: true } }, lines: true } } },
    });
    if (!batch) return sendError(res, 'Billing batch not found', 404);
    return sendSuccess(res, { batch });
  } catch (err: any) {
    console.error('Error fetching billing batch:', err);
    return sendError(res, 'Failed to fetch billing batch', 500);
  }
};

// POST /billing-batches/:batchId/process
// Pulls transactions from POSTED payroll batches not yet invoiced,
// groups by Bill-To organization, and creates DRAFT ClientInvoices.
// export const processBillingBatch = async (req: Request, res: Response) => {
//   try {
//     const { batchId } = req.params;
//     const batch = await (prisma as any).billingBatch.findUnique({ where: { billing_batch_id: batchId } });
//     if (!batch) return sendError(res, 'Billing batch not found', 404);
//     if (batch.status !== 'DRAFT') return sendError(res, 'Batch must be DRAFT to process', 400);

//     const alreadyInvoicedTxnIds = (
//       await (prisma as any).clientInvoiceLine.findMany({ select: { transaction_id: true } })
//     ).map((l: any) => l.transaction_id);

//     const transactions = await (prisma as any).payrollTransaction.findMany({
//       where: {
//         transaction_id: { notIn: alreadyInvoicedTxnIds },
//         payroll_batch: { status: 'POSTED' },
//       },
//       include: {
//         lines: true,
//         organization: true,
//         assignment: { include: { application: { include: { applicant: { select: { full_name: true } } } } } },
//       },
//     });
//     if (!transactions.length) return sendError(res, 'No posted, uninvoiced transactions found', 400);

//     const byOrg = new Map<string, { organization: any; transactions: any[] }>();
//     for (const t of transactions) {
//       if (t.organization?.do_not_invoice) continue;
//       if (!byOrg.has(t.organization_id)) byOrg.set(t.organization_id, { organization: t.organization, transactions: [] });
//       byOrg.get(t.organization_id)!.transactions.push(t);
//     }

//     const previewRows: any[] = [];
//     const createdInvoices: any[] = [];

//     for (const [organizationId, { organization, transactions: orgTxns }] of byOrg) {
//       const lineItems = orgTxns.flatMap((t: any) =>
//         t.lines.map((l: any) => ({
//           transaction_id: t.transaction_id,
//           employee_name: t.assignment?.application?.applicant?.full_name ?? 'Unknown',
//           department: t.department,
//           earning_type: l.custom_earning_label ?? l.earning_type,
//           bill_units: toNum(l.bill_units),
//           bill_rate: toNum(l.bill_rate),
//           amount: toNum(l.item_bill),
//         }))
//       );
//       const subtotal = round2(lineItems.reduce((s: number, l: any) => s + l.amount, 0));
//       if (subtotal <= 0) continue;

//       for (const t of orgTxns) {
//         previewRows.push({
//           assigned_employee: t.assignment?.application?.applicant?.full_name ?? 'Unknown',
//           bill_to: organization.name,
//           department_name: t.department,
//           total_bill: toNum(t.total_bill_amount),
//         });
//       }

//       const netTermsDays = organization?.invoice_net_terms_days ?? 30;
//       const dueDate = new Date(batch.invoice_date);
//       dueDate.setUTCDate(dueDate.getUTCDate() + netTermsDays);

//       const invoice = await (prisma as any).clientInvoice.create({
//         data: {
//           billing_batch_id: batchId,
//           organization_id: organizationId,
//           invoice_number: await generateClientInvoiceNumber(),
//           status: 'DRAFT',
//           invoice_date: batch.invoice_date,
//           due_date: dueDate,
//           subtotal,
//           total_amount: subtotal,
//           lines: { create: lineItems },
//         },
//         include: { lines: true },
//       });
//       createdInvoices.push(invoice);
//     }

//     await (prisma as any).billingBatch.update({ where: { billing_batch_id: batchId }, data: { status: 'PROCESSED', processed_at: new Date() } });

//     return sendSuccess(res, { invoices_created: createdInvoices.length, preview: previewRows, invoices: createdInvoices });
//   } catch (err: any) {
//     console.error('Error processing billing batch:', err);
//     return sendError(res, 'Failed to process billing batch', 500);
//   }
// };


// ────────────────────────────────────────────────────────────────
// FIND (the entire `processBillingBatch` function) and REPLACE with
// the version below — now respects Organization.invoice_grouping /
// invoice_sort_order / max_invoice_amount, and splits an org's charges
// into multiple invoices if they exceed max_invoice_amount.
// ────────────────────────────────────────────────────────────────
 
export const processBillingBatch = async (req: Request, res: Response) => {
  try {
    const { batchId } = req.params;
    const batch = await (prisma as any).billingBatch.findUnique({ where: { billing_batch_id: batchId } });
    if (!batch) return sendError(res, 'Billing batch not found', 404);
    if (batch.status !== 'DRAFT') return sendError(res, 'Batch must be DRAFT to process', 400);
 
    const alreadyInvoicedTxnIds = (await (prisma as any).clientInvoiceLine.findMany({ select: { transaction_id: true } })).map((l: any) => l.transaction_id);
 
    const transactions = await (prisma as any).payrollTransaction.findMany({
      where: { transaction_id: { notIn: alreadyInvoicedTxnIds }, payroll_batch: { status: 'POSTED' } },
      include: {
        lines: true,
        organization: true,
        assignment: { include: { application: { include: { applicant: { select: { full_name: true } } } } } },
      },
    });
    if (!transactions.length) return sendError(res, 'No posted, uninvoiced transactions found', 400);
 
    const byOrg = new Map<string, { organization: any; transactions: any[] }>();
    for (const t of transactions) {
      if (t.organization?.do_not_invoice) continue;
      if (!byOrg.has(t.organization_id)) byOrg.set(t.organization_id, { organization: t.organization, transactions: [] });
      byOrg.get(t.organization_id)!.transactions.push(t);
    }
 
    const previewRows: any[] = [];
    const createdInvoices: any[] = [];
 
    const sortLines = (lines: any[], sortOrder: string) => {
      const key = sortOrder === 'DEPARTMENT' ? 'department' : sortOrder === 'EARNING_TYPE' ? 'earning_type' : 'employee_name';
      return [...lines].sort((a, b) => String(a[key] ?? '').localeCompare(String(b[key] ?? '')));
    };
 
    for (const [organizationId, { organization, transactions: orgTxns }] of byOrg) {
      let lineItems = orgTxns.flatMap((t: any) =>
        t.lines.map((l: any) => ({
          transaction_id: t.transaction_id,
          employee_name: t.assignment?.application?.applicant?.full_name ?? 'Unknown',
          department: t.department,
          earning_type: l.custom_earning_label ?? l.earning_type,
          bill_units: toNum(l.bill_units),
          bill_rate: toNum(l.bill_rate),
          amount: toNum(l.item_bill),
        }))
      );
      lineItems = sortLines(lineItems, organization?.invoice_sort_order ?? 'EMPLOYEE_NAME');
 
      const subtotal = round2(lineItems.reduce((s: number, l: any) => s + l.amount, 0));
      if (subtotal <= 0) continue;
 
      for (const t of orgTxns) {
        previewRows.push({
          assigned_employee: t.assignment?.application?.applicant?.full_name ?? 'Unknown',
          bill_to: organization.name,
          department_name: t.department,
          total_bill: toNum(t.total_bill_amount),
        });
      }
 
      const netTermsDays = organization?.invoice_net_terms_days ?? 30;
      const dueDate = new Date(batch.invoice_date);
      dueDate.setUTCDate(dueDate.getUTCDate() + netTermsDays);
      const maxAmount = organization?.max_invoice_amount != null ? toNum(organization.max_invoice_amount) : null;
 
      // Split into multiple invoices if this org's charges exceed their
      // configured max_invoice_amount, chunking lines in order.
      const chunks: any[][] = [];
      if (maxAmount && subtotal > maxAmount) {
        let current: any[] = [];
        let currentTotal = 0;
        for (const line of lineItems) {
          if (currentTotal + line.amount > maxAmount && current.length) {
            chunks.push(current);
            current = [];
            currentTotal = 0;
          }
          current.push(line);
          currentTotal = round2(currentTotal + line.amount);
        }
        if (current.length) chunks.push(current);
      } else {
        chunks.push(lineItems);
      }
 
      for (const chunkLines of chunks) {
        const chunkSubtotal = round2(chunkLines.reduce((s, l) => s + l.amount, 0));
        const invoice = await (prisma as any).clientInvoice.create({
          data: {
            billing_batch_id: batchId,
            organization_id: organizationId,
            invoice_number: await generateClientInvoiceNumber(),
            status: 'DRAFT',
            invoice_date: batch.invoice_date,
            due_date: dueDate,
            subtotal: chunkSubtotal,
            total_amount: chunkSubtotal,
            lines: { create: chunkLines },
          },
          include: { lines: true },
        });
        createdInvoices.push(invoice);
      }
    }
 
    await (prisma as any).billingBatch.update({ where: { billing_batch_id: batchId }, data: { status: 'PROCESSED', processed_at: new Date() } });
 
    return sendSuccess(res, { invoices_created: createdInvoices.length, preview: previewRows, invoices: createdInvoices });
  } catch (err: any) {
    console.error('Error processing billing batch:', err);
    return sendError(res, 'Failed to process billing batch', 500);
  }
};



// GET /billing-batches/:batchId/preview
export const getBillingBatchPreview = async (req: Request, res: Response) => {
  try {
    const { batchId } = req.params;
    const invoices = await (prisma as any).clientInvoice.findMany({
      where: { billing_batch_id: batchId },
      include: { organization: { select: { name: true } }, lines: true },
    });

    const rows = invoices.flatMap((inv: any) =>
      inv.lines.map((l: any) => ({ assigned_employee: l.employee_name, bill_to: inv.organization.name, department_name: l.department, total_bill: toNum(l.amount) }))
    );

    return sendSuccess(res, { rows, invoices });
  } catch (err: any) {
    console.error('Error fetching billing batch preview:', err);
    return sendError(res, 'Failed to fetch billing batch preview', 500);
  }
};

// POST /billing-batches/:batchId/post
// body: {
//   email_to_customers: boolean,
//   organization_emails?: { [organization_id]: string },   // supply/override email for orgs missing one
//   skip_email_organization_ids?: string[]                  // finalize these orgs without emailing them
// }
export const postBillingBatch = async (req: Request, res: Response) => {
  try {
    const { batchId } = req.params;
    const { email_to_customers, organization_emails, skip_email_organization_ids } = req.body;
    const posted_by_user_id = (req as any).user?.user_id;
    if (!posted_by_user_id) return sendError(res, 'Unauthorized', 401);

    const batch = await (prisma as any).billingBatch.findUnique({
      where: { billing_batch_id: batchId },
      include: { invoices: { include: { organization: { select: { organization_id: true, name: true, email: true } } } } },
    });
    if (!batch) return sendError(res, 'Billing batch not found', 404);
    if (batch.status !== 'PROCESSED') return sendError(res, 'Batch must be PROCESSED before posting', 400);
    if (!batch.invoices.length) return sendError(res, 'No invoices found in this batch', 400);

    const emailOverrides: Record<string, string> = organization_emails || {};
    const skipEmailOrgIds: Set<string> = new Set(skip_email_organization_ids || []);

    // ── Pre-flight: every org we're about to email needs an address, unless
    // the caller explicitly chose to skip that org ──
    if (email_to_customers) {
      const missingByOrg = new Map<string, { organization_id: string; organization_name: string; invoice_ids: string[]; total_amount: number }>();
      for (const inv of batch.invoices) {
        const orgId = inv.organization?.organization_id;
        if (!orgId) continue;
        const hasEmail = !!inv.organization.email || !!emailOverrides[orgId];
        if (hasEmail || skipEmailOrgIds.has(orgId)) continue;
        if (!missingByOrg.has(orgId)) missingByOrg.set(orgId, { organization_id: orgId, organization_name: inv.organization.name, invoice_ids: [], total_amount: 0 });
        const entry = missingByOrg.get(orgId)!;
        entry.invoice_ids.push(inv.client_invoice_id);
        entry.total_amount = round2(entry.total_amount + toNum(inv.total_amount));
      }
      if (missingByOrg.size > 0) {
        return sendError(
          res,
          'Some customers are missing an email address — add one, or mark them as sent without emailing.',
          409,
          { missing_emails: Array.from(missingByOrg.values()) } as any
        );
      }

      // Persist any newly-supplied emails for orgs that didn't have one on file
      for (const [orgId, email] of Object.entries(emailOverrides)) {
        const org = batch.invoices.find((i: any) => i.organization?.organization_id === orgId)?.organization;
        if (org && !org.email && email?.trim()) {
          await (prisma as any).organization.update({ where: { organization_id: orgId }, data: { email: email.trim() } });
          org.email = email.trim(); // keep in-memory copy in sync for the send loop below
        }
      }
    }

    await (prisma as any).clientInvoice.updateMany({ where: { billing_batch_id: batchId }, data: { status: 'SENT' } });

    // Always generate the PDF on post, regardless of whether we're emailing
    // it — so the download endpoint has something to serve immediately.
    for (const inv of batch.invoices) {
      try {
        const pdfUrl = await generateClientInvoicePdf(inv.client_invoice_id);
        inv.pdf_url = pdfUrl;
        await (prisma as any).clientInvoice.update({ where: { client_invoice_id: inv.client_invoice_id }, data: { pdf_url: pdfUrl } });
      } catch (e: any) {
        console.error(`Error generating PDF for invoice ${inv.client_invoice_id}:`, e);
      }
    }

    const emailResults: { invoice_id: string; organization_name: string; status: 'sent' | 'skipped' | 'failed'; error?: string }[] = [];

    if (email_to_customers) {
      for (const inv of batch.invoices) {
        const org = inv.organization;
        const orgId = org?.organization_id;
        const emailAddress = org?.email || (orgId ? emailOverrides[orgId] : undefined);

        if (!emailAddress) {
          // Caller explicitly chose to skip this org
          emailResults.push({ invoice_id: inv.client_invoice_id, organization_name: org?.name ?? 'Unknown', status: 'skipped' });
          continue;
        }

        const result = await sendClientInvoiceEmail({
          organizationEmail: emailAddress,
          organizationName: org?.name ?? 'Customer',
          invoiceNumber: inv.invoice_number,
          invoiceDate: inv.invoice_date,
          dueDate: inv.due_date,
          totalAmount: toNum(inv.total_amount),
          pdfUrl: inv.pdf_url,
        });

        if (result.success) {
          await (prisma as any).clientInvoice.update({ where: { client_invoice_id: inv.client_invoice_id }, data: { emailed_at: new Date() } });
          emailResults.push({ invoice_id: inv.client_invoice_id, organization_name: org?.name ?? 'Unknown', status: 'sent' });
        } else {
          emailResults.push({ invoice_id: inv.client_invoice_id, organization_name: org?.name ?? 'Unknown', status: 'failed', error: result.error });
        }
      }
    }

    const updated = await (prisma as any).billingBatch.update({
      where: { billing_batch_id: batchId },
      data: { status: 'POSTED', posted_at: new Date(), posted_by_user_id },
    });

    return sendSuccess(res, { batch: updated, emailed: !!email_to_customers, email_results: emailResults });
  } catch (err: any) {
    console.error('Error posting billing batch:', err);
    return sendError(res, 'Failed to post billing batch', 500);
  }
};

// POST /billing-batches/:batchId/discard
export const discardBillingBatch = async (req: Request, res: Response) => {
  try {
    const { batchId } = req.params;
    const batch = await (prisma as any).billingBatch.findUnique({ where: { billing_batch_id: batchId } });
    if (!batch) return sendError(res, 'Billing batch not found', 404);
    if (batch.status === 'POSTED') return sendError(res, 'Posted batches cannot be discarded', 400);

    await (prisma as any).clientInvoice.deleteMany({ where: { billing_batch_id: batchId } }); // cascades to lines
    const updated = await (prisma as any).billingBatch.update({
      where: { billing_batch_id: batchId },
      data: { status: 'DISCARDED', discarded_at: new Date() },
    });

    return sendSuccess(res, { batch: updated });
  } catch (err: any) {
    console.error('Error discarding billing batch:', err);
    return sendError(res, 'Failed to discard billing batch', 500);
  }
};

export const downloadClientInvoicePdf = async (req: Request, res: Response) => {
  try {
    const { invoiceId } = req.params;
    const invoice = await (prisma as any).clientInvoice.findUnique({ where: { client_invoice_id: invoiceId } });
    if (!invoice) return sendError(res, 'Invoice not found', 404);

    let pdfUrl = invoice.pdf_url;
    if (!pdfUrl) {
      pdfUrl = await generateClientInvoicePdf(invoiceId);
      await (prisma as any).clientInvoice.update({ where: { client_invoice_id: invoiceId }, data: { pdf_url: pdfUrl } });
    }

    const blobResponse = await fetch(pdfUrl);
    if (!blobResponse.ok) return sendError(res, 'Failed to retrieve invoice PDF from storage', 502);

    const arrayBuffer = await blobResponse.arrayBuffer();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${invoice.invoice_number}.pdf"`);
    return res.send(Buffer.from(arrayBuffer));
  } catch (err: any) {
    console.error('Error downloading client invoice PDF:', err);
    return sendError(res, 'Failed to download invoice PDF', 500);
  }
};


// ════════════════════════════════════════════════════════════════
// WC CODE ADMIN (Module 3 support — Admin creates WC Codes)
// ════════════════════════════════════════════════════════════════

export const createWcCode = async (req: Request, res: Response) => {
  try {
    const { code, description, insurance_rate, cost_pct } = req.body;
    if (!code || !description || insurance_rate == null) return sendError(res, 'code, description, and insurance_rate are required', 400);
    const wcCode = await (prisma as any).wCCode.create({ data: { code, description, insurance_rate, cost_pct: cost_pct ?? null } });
    return sendSuccess(res, { wc_code: wcCode }, 201);
  } catch (err: any) {
    console.error('Error creating WC code:', err);
    return sendError(res, 'Failed to create WC code', 500);
  }
};

export const listWcCodes = async (_req: Request, res: Response) => {
  try {
    const wcCodes = await (prisma as any).wCCode.findMany({ where: { is_active: true }, orderBy: { code: 'asc' } });
    return sendSuccess(res, { wc_codes: wcCodes });
  } catch (err: any) {
    console.error('Error listing WC codes:', err);
    return sendError(res, 'Failed to list WC codes', 500);
  }
};




// ════════════════════════════════════════════════════════════════
// APPEND — new functions, add these before the final export object
// ════════════════════════════════════════════════════════════════
 
// ── Reopen (non-destructive — unlike voidPayrollBatch, this keeps
// transactions claimed and checks intact, just rewinds the status
// gate so corrections can be made and the batch re-processed/re-posted) ──
 
// POST /payroll-batches/:batchId/reopen
// body: { reason, target_status?: 'DRAFT' | 'PROCESSED' | 'CHECKS_PRINTED' }
export const reopenPayrollBatch = async (req: Request, res: Response) => {
  try {
    const { batchId } = req.params;
    const { reason, target_status } = req.body;
    const reopened_by_user_id = (req as any).user?.user_id;
    if (!reopened_by_user_id) return sendError(res, 'Unauthorized', 401);
    if (!reason?.trim()) return sendError(res, 'reason is required to reopen a batch', 400);
 
    const batch = await (prisma as any).payrollBatch.findUnique({ where: { payroll_batch_id: batchId } });
    if (!batch) return sendError(res, 'Payroll batch not found', 404);
    if (!['CHECKS_PRINTED', 'POSTED'].includes(batch.status)) {
      return sendError(res, `Cannot reopen a batch in ${batch.status} status`, 400);
    }
 
    const targetStatus = target_status || 'PROCESSED';
    if (!['DRAFT', 'PROCESSED', 'CHECKS_PRINTED'].includes(targetStatus)) {
      return sendError(res, 'target_status must be DRAFT, PROCESSED, or CHECKS_PRINTED', 400);
    }
 
    // Rewinding past PROCESSED means the generated checks are stale —
    // clear them so process can be re-run cleanly. Rewinding only to
    // CHECKS_PRINTED (e.g. to fix one check) leaves them in place.
    if (targetStatus === 'DRAFT' || targetStatus === 'PROCESSED') {
      if (batch.status === 'POSTED') {
        return sendError(res, 'A POSTED batch can only reopen to CHECKS_PRINTED — void it instead if checks need to be discarded entirely', 400);
      }
    }
 
    const updated = await (prisma as any).payrollBatch.update({
      where: { payroll_batch_id: batchId },
      data: {
        status: targetStatus,
        reopened_at: new Date(),
        reopened_by_user_id,
        reopen_reason: reason,
        ...(targetStatus === 'DRAFT' && { processed_at: null }),
        ...(targetStatus !== 'CHECKS_PRINTED' && { checks_printed_at: null }),
        posted_at: null, posted_by_user_id: null,
      },
    });
 
    if (targetStatus === 'DRAFT') {
      // Full rewind — delete stale checks so process can rebuild them
      await (prisma as any).payrollCheck.deleteMany({ where: { payroll_batch_id: batchId } });
    } else if (targetStatus === 'PROCESSED') {
      // Un-print but keep the calculated figures; print-checks can re-run
      await (prisma as any).payrollCheck.updateMany({
        where: { payroll_batch_id: batchId },
        data: { status: 'PENDING', check_number: null, printed_at: null, verified_at: null, verified_by_user_id: null, posted_at: null, correction_reason: null },
      });
    } else {
      // CHECKS_PRINTED — leave check numbers in place, just unpost them
      await (prisma as any).payrollCheck.updateMany({
        where: { payroll_batch_id: batchId, status: 'POSTED' },
        data: { status: 'PRINTED', posted_at: null },
      });
    }
 
    return sendSuccess(res, { batch: updated });
  } catch (err: any) {
    console.error('Error reopening payroll batch:', err);
    return sendError(res, 'Failed to reopen payroll batch', 500);
  }
};
 
// GET /payroll-batches/:batchId/employer-cost-summary
export const getEmployerCostSummary = async (req: Request, res: Response) => {
  try {
    const { batchId } = req.params;
    const checks = await (prisma as any).payrollCheck.findMany({ where: { payroll_batch_id: batchId } });
 
    const totals = checks.reduce(
      (acc: any, c: any) => {
        acc.gross_pay += toNum(c.gross_pay);
        acc.employer_wc_cost += toNum(c.employer_wc_cost);
        acc.employer_ss += toNum(c.employer_ss);
        acc.employer_medicare += toNum(c.employer_medicare);
        acc.employer_futa += toNum(c.employer_futa);
        acc.employer_suta += toNum(c.employer_suta);
        acc.total_employer_cost += toNum(c.total_employer_cost);
        return acc;
      },
      { gross_pay: 0, employer_wc_cost: 0, employer_ss: 0, employer_medicare: 0, employer_futa: 0, employer_suta: 0, total_employer_cost: 0 }
    );
    Object.keys(totals).forEach((k) => (totals[k] = round2(totals[k])));
 
    return sendSuccess(res, { batch_id: batchId, totals, check_count: checks.length });
  } catch (err: any) {
    console.error('Error fetching employer cost summary:', err);
    return sendError(res, 'Failed to fetch employer cost summary', 500);
  }
};
 
// ── Agency CRUD ──────────────────────────────────────────────────
export const createAgency = async (req: Request, res: Response) => {
  try {
    const { name, contact_name, contact_email, contact_phone, address, bank_name, routing_number, account_number } = req.body;
    if (!name?.trim()) return sendError(res, 'name is required', 400);
    if (routing_number && !/^\d{9}$/.test(routing_number)) return sendError(res, 'routing_number must be exactly 9 digits', 400);
 
    const agency = await (prisma as any).agency.create({
      data: { name, contact_name, contact_email, contact_phone, address, bank_name, routing_number, account_number },
    });
    return sendSuccess(res, { agency }, 201);
  } catch (err: any) {
    console.error('Error creating agency:', err);
    return sendError(res, 'Failed to create agency', 500);
  }
};
 
export const listAgencies = async (_req: Request, res: Response) => {
  try {
    const agencies = await (prisma as any).agency.findMany({ where: { is_active: true }, orderBy: { name: 'asc' } });
    return sendSuccess(res, { agencies });
  } catch (err: any) {
    console.error('Error listing agencies:', err);
    return sendError(res, 'Failed to list agencies', 500);
  }
};
 
export const updateAgency = async (req: Request, res: Response) => {
  try {
    const { agencyId } = req.params;
    const { name, contact_name, contact_email, contact_phone, address, bank_name, routing_number, account_number, is_active } = req.body;
    const existing = await (prisma as any).agency.findUnique({ where: { agency_id: agencyId } });
    if (!existing) return sendError(res, 'Agency not found', 404);
    if (routing_number && !/^\d{9}$/.test(routing_number)) return sendError(res, 'routing_number must be exactly 9 digits', 400);
 
    const agency = await (prisma as any).agency.update({
      where: { agency_id: agencyId },
      data: {
        ...(name !== undefined && { name }),
        ...(contact_name !== undefined && { contact_name }),
        ...(contact_email !== undefined && { contact_email }),
        ...(contact_phone !== undefined && { contact_phone }),
        ...(address !== undefined && { address }),
        ...(bank_name !== undefined && { bank_name }),
        ...(routing_number !== undefined && { routing_number }),
        ...(account_number !== undefined && { account_number }),
        ...(is_active !== undefined && { is_active }),
      },
    });
    return sendSuccess(res, { agency });
  } catch (err: any) {
    console.error('Error updating agency:', err);
    return sendError(res, 'Failed to update agency', 500);
  }
};
 
// ── Tax configuration admin (feeds calculateTaxes above) ───────────
export const createTaxBracket = async (req: Request, res: Response) => {
  try {
    const { tax_year, filing_status, min_annual_income, max_annual_income, rate, base_tax } = req.body;
    if (!tax_year || !filing_status || min_annual_income == null || rate == null || base_tax == null) {
      return sendError(res, 'tax_year, filing_status, min_annual_income, rate, and base_tax are required', 400);
    }
    const bracket = await (prisma as any).taxBracket.create({
      data: { tax_year, filing_status, min_annual_income, max_annual_income: max_annual_income ?? null, rate, base_tax },
    });
    return sendSuccess(res, { bracket }, 201);
  } catch (err: any) {
    console.error('Error creating tax bracket:', err);
    return sendError(res, 'Failed to create tax bracket', 500);
  }
};
 
export const listTaxBrackets = async (req: Request, res: Response) => {
  try {
    const { tax_year, filing_status } = req.query;
    const brackets = await (prisma as any).taxBracket.findMany({
      where: { ...(tax_year && { tax_year: Number(tax_year) }), ...(filing_status && { filing_status }) },
      orderBy: [{ tax_year: 'desc' }, { filing_status: 'asc' }, { min_annual_income: 'asc' }],
    });
    return sendSuccess(res, { brackets });
  } catch (err: any) {
    console.error('Error listing tax brackets:', err);
    return sendError(res, 'Failed to list tax brackets', 500);
  }
};
 
export const createStateTaxRate = async (req: Request, res: Response) => {
  try {
    const { state, flat_rate, tax_year, notes } = req.body;
    if (!state || flat_rate == null || !tax_year) return sendError(res, 'state, flat_rate, and tax_year are required', 400);
    const stateRate = await (prisma as any).stateTaxRate.upsert({
      where: { state },
      update: { flat_rate, tax_year, notes },
      create: { state, flat_rate, tax_year, notes },
    });
    return sendSuccess(res, { state_tax_rate: stateRate }, 201);
  } catch (err: any) {
    console.error('Error creating state tax rate:', err);
    return sendError(res, 'Failed to create state tax rate', 500);
  }
};
 
export const listStateTaxRates = async (_req: Request, res: Response) => {
  try {
    const rates = await (prisma as any).stateTaxRate.findMany({ orderBy: { state: 'asc' } });
    return sendSuccess(res, { state_tax_rates: rates });
  } catch (err: any) {
    console.error('Error listing state tax rates:', err);
    return sendError(res, 'Failed to list state tax rates', 500);
  }
};
 
// GET /client-invoices/:invoiceId
export const getClientInvoiceById = async (req: Request, res: Response) => {
  try {
    const { invoiceId } = req.params;
    const invoice = await (prisma as any).clientInvoice.findUnique({
      where: { client_invoice_id: invoiceId },
      include: {
        organization: { select: { name: true, email: true } },
        lines: true,
        batch: { select: { batch_number: true, batch_type: true } },
      },
    });
    if (!invoice) return sendError(res, 'Invoice not found', 404);
    return sendSuccess(res, { invoice });
  } catch (err: any) {
    console.error('Error fetching client invoice:', err);
    return sendError(res, 'Failed to fetch client invoice', 500);
  }
};



export const payrollController = {
  // Bank accounts (front office / employee)
  createEmployeeBankAccount,
  listEmployeeBankAccounts,
  updateEmployeeBankAccount,

  // Company bank ("Bank" dropdown)
  createCompanyBankAccount,
  listCompanyBankAccounts,

  // Step 2 — Payroll Batch
  getRunTypes,
  createPayrollBatch,
  getAllPayrollBatches,
  getPayrollBatchById,
  getAvailableTransactions,
  selectTransactionsForBatch,
  removeTransactionFromBatch,
  saveAndCloseBatchSelection,
  processPayrollBatch,
  printChecks,
  postPayrollBatch,
  voidPayrollBatch,

  // Payroll Check
  getPayrollCheckStub,
  verifyPayrollCheck,
  resolveCheckCorrection,

  // Step 4 — ACH
  generateAchFile,
  downloadAchFile,

  // Step 3 — Billing Batch
  createBillingBatch,
  getAllBillingBatches,
  getBillingBatchById,
  processBillingBatch,
  getBillingBatchPreview,
  postBillingBatch,
  discardBillingBatch,
  downloadClientInvoicePdf,

  // WC Codes
  createWcCode,
  listWcCodes,

  reopenPayrollBatch,
  getEmployerCostSummary,
 
  createAgency,
  listAgencies,
  updateAgency,
 
  createTaxBracket,
  listTaxBrackets,
  createStateTaxRate,
  listStateTaxRates,

  // invoice
  getClientInvoiceById

};