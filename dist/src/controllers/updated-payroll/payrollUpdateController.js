"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.payrollController = exports.getClientInvoiceById = exports.listStateTaxRates = exports.createStateTaxRate = exports.listTaxBrackets = exports.createTaxBracket = exports.updateAgency = exports.listAgencies = exports.createAgency = exports.getEmployerCostSummary = exports.reopenPayrollBatch = exports.listWcCodes = exports.createWcCode = exports.downloadClientInvoicePdf = exports.discardBillingBatch = exports.postBillingBatch = exports.getBillingBatchPreview = exports.processBillingBatch = exports.getBillingBatchById = exports.getAllBillingBatches = exports.createBillingBatch = exports.BILLING_BATCH_TYPES = exports.downloadAchFile = exports.generateAchFile = exports.voidPayrollBatch = exports.postPayrollBatch = exports.resolveCheckCorrection = exports.verifyPayrollCheck = exports.getPayrollCheckStub = exports.printChecks = exports.processPayrollBatch = exports.saveAndCloseBatchSelection = exports.removeTransactionFromBatch = exports.selectTransactionsForBatch = exports.getAvailableTransactions = exports.getPayrollBatchById = exports.getAllPayrollBatches = exports.createPayrollBatch = exports.getRunTypes = exports.listCompanyBankAccounts = exports.createCompanyBankAccount = exports.updateEmployeeBankAccount = exports.listEmployeeBankAccounts = exports.createEmployeeBankAccount = exports.CHECK_RUN_TYPES = void 0;
const prisma_config_1 = __importDefault(require("../../prisma.config"));
const response_1 = require("../../utils/response");
const updatedPayrollInvoiceService_1 = require("../../services/updatedPayrollInvoiceService");
const emailService_1 = require("../../services/emailService"); // adjust path to match your actual file
// ════════════════════════════════════════════════════════════════
// STEP 2 — Payroll Batch → Checks
// STEP 3 — Billing Batch → Client Invoices
// STEP 4 — Weekly Process → ACH File
//
// This picks up from your existing Batch Entry controller (Step 1,
// untouched) — it only ever reads VERIFIED PayrollTransactions that
// haven't been claimed by another Payroll Batch yet.
// ════════════════════════════════════════════════════════════════
function toNum(v) {
    if (v === null || v === undefined)
        return 0;
    return typeof v === 'object' && typeof v.toNumber === 'function' ? v.toNumber() : Number(v);
}
function round2(n) {
    return Math.round((n + Number.EPSILON) * 100) / 100;
}
function isFriday(d) {
    return d.getUTCDay() === 5;
}
function isSunday(d) {
    return d.getUTCDay() === 0;
}
exports.CHECK_RUN_TYPES = [
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
const RUN_TYPE_TO_ENUM = {
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
const SS_WAGE_BASE = 168600; // 2026 placeholder — update yearly
const FUTA_WAGE_BASE = 7000;
const FUTA_RATE = 0.006;
const SUTA_WAGE_BASE = 9000; // varies by state — placeholder, override per-state if needed
const DEFAULT_SUTA_RATE = 0.027;
const DEFAULT_STATE_FLAT_RATE = 0.04; // fallback when no StateTaxRate row exists for the work state
const DEFAULT_LOCAL_TAX_RATE = 0.01;
const FREQUENCY_PER_YEAR = { WEEKLY: 52, BI_WEEKLY: 26, SEMI_MONTHLY: 24, MONTHLY: 12 };
async function getFederalBrackets(filingStatus, taxYear) {
    return prisma_config_1.default.taxBracket.findMany({
        where: { filing_status: filingStatus, tax_year: taxYear },
        orderBy: { min_annual_income: 'asc' },
    });
}
function computeAnnualFederalTax(annualIncome, brackets) {
    const bracket = brackets.find((b) => annualIncome >= toNum(b.min_annual_income) && (b.max_annual_income == null || annualIncome < toNum(b.max_annual_income)));
    if (!bracket)
        return 0;
    return round2(toNum(bracket.base_tax) + (annualIncome - toNum(bracket.min_annual_income)) * toNum(bracket.rate));
}
// ⚠️ Still simplified vs. a full commercial tax engine: no W-4 step 2-4
// adjustments, no dependent-credit math, state modeled as flat-rate only.
// But this is now a real progressive bracket calculation with YTD wage-base
// caps on SS/FUTA — the flat 12%-of-everything placeholder is gone.
async function calculateTaxes(params) {
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
        }
        else {
            // No bracket table configured for this tax_year/filing_status —
            // this is a data-setup gap (seed TaxBracket rows), not intended to
            // be a permanent fallback.
            federal_tax = round2(grossPay * 0.12 + additionalWithholding);
        }
    }
    let state_tax = 0;
    if (!taxInfo?.exempt_from_state) {
        const workState = taxInfo?.work_state;
        const stateRate = workState ? await prisma_config_1.default.stateTaxRate.findUnique({ where: { state: workState } }) : null;
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
function calculateEmployerCosts(params) {
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
function applyDeductions(netBeforeDeductions, benefitDeductions, garnishments) {
    let remaining = netBeforeDeductions;
    const breakdown = [];
    let benefitTotal = 0;
    let garnishmentTotal = 0;
    for (const b of benefitDeductions.filter((b) => b.is_active)) {
        const amt = b.percentage != null ? round2(netBeforeDeductions * (toNum(b.percentage) / 100)) : round2(toNum(b.amount));
        const applied = Math.min(amt, Math.max(remaining, 0));
        if (applied <= 0)
            continue;
        remaining = round2(remaining - applied);
        benefitTotal = round2(benefitTotal + applied);
        breakdown.push({ type: b.deduction_type, label: b.deduction_type, amount: applied, source: 'benefit' });
    }
    const sortedGarnishments = [...garnishments.filter((g) => g.is_active)].sort((a, b) => (a.priority_order ?? 1) - (b.priority_order ?? 1));
    for (const g of sortedGarnishments) {
        let amt = g.percentage != null ? round2(netBeforeDeductions * (toNum(g.percentage) / 100)) : round2(toNum(g.amount));
        if (g.max_amount != null)
            amt = Math.min(amt, toNum(g.max_amount));
        const applied = Math.min(amt, Math.max(remaining, 0));
        if (applied <= 0)
            continue;
        remaining = round2(remaining - applied);
        garnishmentTotal = round2(garnishmentTotal + applied);
        breakdown.push({ type: g.garnishment_type, label: g.garnishment_type, amount: applied, source: 'garnishment' });
    }
    return { netPay: remaining, benefitTotal, garnishmentTotal, breakdown };
}
// Sums this applicant's prior POSTED checks in the same calendar year as
// `uptoDate`, used to populate the pay stub's YTD columns.
async function computeYtd(applicantId, uptoDate, excludeCheckId) {
    const yearStart = new Date(Date.UTC(uptoDate.getUTCFullYear(), 0, 1));
    const priorChecks = await prisma_config_1.default.payrollCheck.findMany({
        where: {
            applicant_id: applicantId,
            status: 'POSTED',
            payroll_check_id: excludeCheckId ? { not: excludeCheckId } : undefined,
            batch: { check_date: { gte: yearStart, lt: uptoDate } },
        },
        include: { batch: { select: { check_date: true } } },
    });
    const ytd = priorChecks.reduce((acc, c) => {
        acc.gross += toNum(c.gross_pay);
        acc.federal_tax += toNum(c.federal_tax);
        acc.state_tax += toNum(c.state_tax);
        acc.local_tax += toNum(c.local_tax);
        acc.employee_ss += toNum(c.employee_ss);
        acc.employee_medicare += toNum(c.employee_medicare);
        const breakdown = c.deduction_breakdown ?? [];
        for (const d of breakdown) {
            acc.deductions[d.type] = (acc.deductions[d.type] ?? 0) + toNum(d.amount);
        }
        return acc;
    }, { gross: 0, federal_tax: 0, state_tax: 0, local_tax: 0, employee_ss: 0, employee_medicare: 0, deductions: {} });
    Object.keys(ytd.deductions).forEach((k) => (ytd.deductions[k] = round2(ytd.deductions[k])));
    return ytd;
}
// ════════════════════════════════════════════════════════════════
// BANK ACCOUNTS (front-office employee self-entry — extends the
// existing BankAccount model with sequence/prenote fields)
// ════════════════════════════════════════════════════════════════
// POST /applicants/:applicantId/bank-accounts
const createEmployeeBankAccount = async (req, res) => {
    try {
        const { applicantId } = req.params;
        const { bank_name, account_type, routing_number, account_number, amount_type, amount, sequence, prenote_send_date, prenote_approve_date, is_active, } = req.body;
        if (!bank_name || !routing_number || !account_number) {
            return (0, response_1.sendError)(res, 'bank_name, routing_number, and account_number are required', 400);
        }
        if (!/^\d{9}$/.test(routing_number))
            return (0, response_1.sendError)(res, 'routing_number must be exactly 9 digits', 400);
        const applicant = await prisma_config_1.default.applicant.findUnique({ where: { applicant_id: applicantId } });
        if (!applicant)
            return (0, response_1.sendError)(res, 'Applicant not found', 404);
        const account = await prisma_config_1.default.bankAccount.create({
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
        return (0, response_1.sendSuccess)(res, { account }, 201);
    }
    catch (err) {
        console.error('Error creating employee bank account:', err);
        return (0, response_1.sendError)(res, 'Failed to create bank account', 500);
    }
};
exports.createEmployeeBankAccount = createEmployeeBankAccount;
// GET /applicants/:applicantId/bank-accounts
const listEmployeeBankAccounts = async (req, res) => {
    try {
        const { applicantId } = req.params;
        const accounts = await prisma_config_1.default.bankAccount.findMany({
            where: { applicant_id: applicantId },
            orderBy: { sequence: 'asc' },
        });
        return (0, response_1.sendSuccess)(res, { accounts });
    }
    catch (err) {
        console.error('Error listing bank accounts:', err);
        return (0, response_1.sendError)(res, 'Failed to list bank accounts', 500);
    }
};
exports.listEmployeeBankAccounts = listEmployeeBankAccounts;
// PATCH /bank-accounts/:bankAccountId
const updateEmployeeBankAccount = async (req, res) => {
    try {
        const { bankAccountId } = req.params;
        const { bank_name, account_type, routing_number, account_number, amount_type, amount, sequence, prenote_send_date, prenote_approve_date, is_active, } = req.body;
        const existing = await prisma_config_1.default.bankAccount.findUnique({ where: { bank_account_id: bankAccountId } });
        if (!existing)
            return (0, response_1.sendError)(res, 'Bank account not found', 404);
        if (routing_number && !/^\d{9}$/.test(routing_number))
            return (0, response_1.sendError)(res, 'routing_number must be exactly 9 digits', 400);
        const account = await prisma_config_1.default.bankAccount.update({
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
        return (0, response_1.sendSuccess)(res, { account });
    }
    catch (err) {
        console.error('Error updating bank account:', err);
        return (0, response_1.sendError)(res, 'Failed to update bank account', 500);
    }
};
exports.updateEmployeeBankAccount = updateEmployeeBankAccount;
// ════════════════════════════════════════════════════════════════
// COMPANY BANK ACCOUNTS ("Bank" dropdown used by both Payroll Batch
// creation and ACH generation — must be the same bank for both)
// ════════════════════════════════════════════════════════════════
const createCompanyBankAccount = async (req, res) => {
    try {
        const { company_name, description, ach_company_id, ach_company_name, originating_bank_name, originating_dfi_id, routing_number, account_number } = req.body;
        if (!company_name || !ach_company_id || !ach_company_name || !routing_number || !account_number || !originating_dfi_id) {
            return (0, response_1.sendError)(res, 'Missing required company bank account fields', 400);
        }
        const account = await prisma_config_1.default.companyBankAccount.create({
            data: { company_name, description: description ?? null, ach_company_id, ach_company_name, originating_bank_name, originating_dfi_id, routing_number, account_number },
        });
        return (0, response_1.sendSuccess)(res, { account }, 201);
    }
    catch (err) {
        console.error('Error creating company bank account:', err);
        return (0, response_1.sendError)(res, 'Failed to create company bank account', 500);
    }
};
exports.createCompanyBankAccount = createCompanyBankAccount;
// GET /banks — dropdown source (bank id, bank name, description)
const listCompanyBankAccounts = async (_req, res) => {
    try {
        const accounts = await prisma_config_1.default.companyBankAccount.findMany({
            where: { is_active: true },
            select: { company_bank_account_id: true, company_name: true, description: true },
        });
        return (0, response_1.sendSuccess)(res, { banks: accounts });
    }
    catch (err) {
        console.error('Error listing company bank accounts:', err);
        return (0, response_1.sendError)(res, 'Failed to list banks', 500);
    }
};
exports.listCompanyBankAccounts = listCompanyBankAccounts;
// ════════════════════════════════════════════════════════════════
// STEP 2 — PAYROLL BATCH
// ════════════════════════════════════════════════════════════════
// GET /payroll/run-types — dropdown source
const getRunTypes = async (_req, res) => {
    return (0, response_1.sendSuccess)(res, { run_types: exports.CHECK_RUN_TYPES });
};
exports.getRunTypes = getRunTypes;
// POST /payroll-batches
// body: { accounting_period, check_date, run_type, bank_id, description?, message? }
const createPayrollBatch = async (req, res) => {
    try {
        const { accounting_period, check_date, run_type, bank_id, description, message } = req.body;
        const created_by_user_id = req.user?.user_id;
        if (!created_by_user_id)
            return (0, response_1.sendError)(res, 'Unauthorized', 401);
        if (!accounting_period || !check_date || !run_type || !bank_id) {
            return (0, response_1.sendError)(res, 'accounting_period, check_date, run_type, and bank_id are required', 400);
        }
        if (!exports.CHECK_RUN_TYPES.includes(run_type))
            return (0, response_1.sendError)(res, `run_type must be one of: ${exports.CHECK_RUN_TYPES.join(', ')}`, 400);
        const accountingPeriodDate = new Date(accounting_period);
        const checkDateDate = new Date(check_date);
        if (isNaN(accountingPeriodDate.getTime()) || isNaN(checkDateDate.getTime())) {
            return (0, response_1.sendError)(res, 'Invalid accounting_period or check_date', 400);
        }
        if (!isSunday(accountingPeriodDate))
            return (0, response_1.sendError)(res, 'accounting_period must be a Sunday', 400);
        if (!isFriday(checkDateDate))
            return (0, response_1.sendError)(res, 'check_date must be a Friday', 400);
        const bank = await prisma_config_1.default.companyBankAccount.findUnique({ where: { company_bank_account_id: bank_id } });
        if (!bank || !bank.is_active)
            return (0, response_1.sendError)(res, 'Bank not found or inactive', 404);
        const batch = await prisma_config_1.default.payrollBatch.create({
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
        return (0, response_1.sendSuccess)(res, { batch }, 201);
    }
    catch (err) {
        console.error('Error creating payroll batch:', err);
        return (0, response_1.sendError)(res, 'Failed to create payroll batch', 500);
    }
};
exports.createPayrollBatch = createPayrollBatch;
// GET /payroll-batches?status=
const getAllPayrollBatches = async (req, res) => {
    try {
        const { status } = req.query;
        const batches = await prisma_config_1.default.payrollBatch.findMany({
            where: status ? { status } : {},
            orderBy: { created_at: 'desc' },
            include: { bank: { select: { company_name: true } }, _count: { select: { transactions: true, checks: true } } },
        });
        return (0, response_1.sendSuccess)(res, { batches });
    }
    catch (err) {
        console.error('Error fetching payroll batches:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch payroll batches', 500);
    }
};
exports.getAllPayrollBatches = getAllPayrollBatches;
// GET /payroll-batches/:batchId
const getPayrollBatchById = async (req, res) => {
    try {
        const { batchId } = req.params;
        const batch = await prisma_config_1.default.payrollBatch.findUnique({
            where: { payroll_batch_id: batchId },
            include: {
                bank: true,
                checks: { select: { payroll_check_id: true, applicant_id: true, status: true, net_pay: true, check_number: true } },
                _count: { select: { transactions: true } },
            },
        });
        if (!batch)
            return (0, response_1.sendError)(res, 'Payroll batch not found', 404);
        return (0, response_1.sendSuccess)(res, { batch });
    }
    catch (err) {
        console.error('Error fetching payroll batch:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch payroll batch', 500);
    }
};
exports.getPayrollBatchById = getPayrollBatchById;
// GET /payroll-batches/:batchId/available-transactions
// The "Select Transaction" screen — VERIFIED transactions not yet
// claimed by any payroll batch, grouped by Bill To with a totals row.
const getAvailableTransactions = async (req, res) => {
    var _a;
    try {
        const { groupBy } = req.query; // 'organization' | 'branch' | 'employee' | 'batch' (default: organization)
        const transactions = await prisma_config_1.default.payrollTransaction.findMany({
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
        const rows = transactions.map((t) => {
            const applicant = t.assignment?.application?.applicant;
            const hasActiveBank = (applicant?.bank_accounts ?? []).some((b) => b.is_active);
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
        const groups = {};
        for (const r of rows)
            (groups[_a = r.group_key] ?? (groups[_a] = [])).push(r);
        const grouped = Object.entries(groups).map(([group_key, groupRows]) => ({
            group_key,
            rows: groupRows,
            total_pay: round2(groupRows.reduce((s, r) => s + r.total_pay, 0)),
        }));
        return (0, response_1.sendSuccess)(res, { groups: grouped, total_transactions: rows.length });
    }
    catch (err) {
        console.error('Error fetching available transactions:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch available transactions', 500);
    }
};
exports.getAvailableTransactions = getAvailableTransactions;
// POST /payroll-batches/:batchId/select-transactions
// body: { transaction_ids: string[] }
const selectTransactionsForBatch = async (req, res) => {
    try {
        const { batchId } = req.params;
        const { transaction_ids } = req.body;
        if (!Array.isArray(transaction_ids) || !transaction_ids.length) {
            return (0, response_1.sendError)(res, 'transaction_ids array is required', 400);
        }
        const batch = await prisma_config_1.default.payrollBatch.findUnique({ where: { payroll_batch_id: batchId } });
        if (!batch)
            return (0, response_1.sendError)(res, 'Payroll batch not found', 404);
        if (batch.status !== 'DRAFT')
            return (0, response_1.sendError)(res, 'Transactions can only be selected while the batch is DRAFT', 400);
        const alreadyClaimed = await prisma_config_1.default.payrollTransaction.findMany({
            where: { transaction_id: { in: transaction_ids }, OR: [{ payroll_batch_id: { not: null } }, { status: { not: 'VERIFIED' } }] },
            select: { transaction_id: true },
        });
        if (alreadyClaimed.length) {
            return (0, response_1.sendError)(res, 'Some transactions are already in another payroll batch or not VERIFIED', 409, alreadyClaimed);
        }
        await prisma_config_1.default.payrollTransaction.updateMany({
            where: { transaction_id: { in: transaction_ids } },
            data: { payroll_batch_id: batchId },
        });
        return (0, response_1.sendSuccess)(res, { message: `${transaction_ids.length} transactions added to batch.`, batch_id: batchId });
    }
    catch (err) {
        console.error('Error selecting transactions:', err);
        return (0, response_1.sendError)(res, 'Failed to select transactions', 500);
    }
};
exports.selectTransactionsForBatch = selectTransactionsForBatch;
// POST /payroll-batches/:batchId/remove-transaction
// "delete with a reason" — unclaims a transaction from the batch
// body: { transaction_id, reason }
const removeTransactionFromBatch = async (req, res) => {
    try {
        const { batchId } = req.params;
        const { transaction_id, reason } = req.body;
        if (!transaction_id || !reason?.trim())
            return (0, response_1.sendError)(res, 'transaction_id and reason are required', 400);
        const batch = await prisma_config_1.default.payrollBatch.findUnique({ where: { payroll_batch_id: batchId } });
        if (!batch)
            return (0, response_1.sendError)(res, 'Payroll batch not found', 404);
        if (batch.status !== 'DRAFT')
            return (0, response_1.sendError)(res, 'Transactions can only be removed while the batch is DRAFT', 400);
        const transaction = await prisma_config_1.default.payrollTransaction.findFirst({ where: { transaction_id, payroll_batch_id: batchId } });
        if (!transaction)
            return (0, response_1.sendError)(res, 'Transaction not found in this batch', 404);
        await prisma_config_1.default.payrollTransaction.update({
            where: { transaction_id },
            data: { payroll_batch_id: null, removed_from_batch_reason: reason },
        });
        return (0, response_1.sendSuccess)(res, { message: 'Transaction removed from batch.' });
    }
    catch (err) {
        console.error('Error removing transaction:', err);
        return (0, response_1.sendError)(res, 'Failed to remove transaction', 500);
    }
};
exports.removeTransactionFromBatch = removeTransactionFromBatch;
// POST /payroll-batches/:batchId/save-and-close
// Just a state confirmation — no status change (still DRAFT until processed).
const saveAndCloseBatchSelection = async (req, res) => {
    try {
        const { batchId } = req.params;
        const batch = await prisma_config_1.default.payrollBatch.findUnique({
            where: { payroll_batch_id: batchId },
            include: { _count: { select: { transactions: true } } },
        });
        if (!batch)
            return (0, response_1.sendError)(res, 'Payroll batch not found', 404);
        return (0, response_1.sendSuccess)(res, { message: 'Batch saved.', transaction_count: batch._count.transactions });
    }
    catch (err) {
        console.error('Error saving batch selection:', err);
        return (0, response_1.sendError)(res, 'Failed to save batch', 500);
    }
};
exports.saveAndCloseBatchSelection = saveAndCloseBatchSelection;
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
const processPayrollBatch = async (req, res) => {
    try {
        const { batchId } = req.params;
        const batch = await prisma_config_1.default.payrollBatch.findUnique({ where: { payroll_batch_id: batchId } });
        if (!batch)
            return (0, response_1.sendError)(res, 'Payroll batch not found', 404);
        if (batch.status !== 'DRAFT')
            return (0, response_1.sendError)(res, 'Batch must be DRAFT to process', 400);
        const transactions = await prisma_config_1.default.payrollTransaction.findMany({
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
        if (!transactions.length)
            return (0, response_1.sendError)(res, 'No transactions selected for this batch', 400);
        const wcCodes = await prisma_config_1.default.wCCode.findMany({ where: { is_active: true } });
        const wcRateByCode = new Map(wcCodes.map((w) => [w.code, toNum(w.insurance_rate)]));
        const taxYear = batch.check_date.getUTCFullYear();
        // Group by payee — agency (if assignment.agency_id is set) or applicant.
        const byPayee = new Map();
        for (const t of transactions) {
            const assignment = t.assignment;
            const agency = assignment?.agency;
            const applicant = assignment?.application?.applicant;
            if (!agency && !applicant)
                continue;
            const key = agency ? `agency:${agency.agency_id}` : `applicant:${applicant.applicant_id}`;
            if (!byPayee.has(key))
                byPayee.set(key, { applicant: agency ? null : applicant, agency: agency ?? null, transactions: [] });
            byPayee.get(key).transactions.push(t);
        }
        const createdChecks = [];
        const errors = [];
        for (const [key, { applicant, agency, transactions: txns }] of byPayee) {
            try {
                const grossPay = round2(txns.reduce((s, t) => s + toNum(t.total_pay_amount), 0));
                if (grossPay <= 0) {
                    errors.push({ payee: key, message: 'Gross pay is 0' });
                    continue;
                }
                // Weighted-average WC insurance rate across this payee's assignments
                let wcRate = null;
                const wcAssignmentCodes = txns[0]?.assignment?.workers_comp_codes ?? [];
                if (wcAssignmentCodes.length) {
                    let weightedSum = 0, weightTotal = 0;
                    for (const w of wcAssignmentCodes) {
                        const rate = wcRateByCode.get(w.code);
                        if (rate == null)
                            continue;
                        const pct = toNum(w.pct) || 100 / wcAssignmentCodes.length;
                        weightedSum += rate * pct;
                        weightTotal += pct;
                    }
                    wcRate = weightTotal > 0 ? weightedSum / weightTotal : null;
                }
                let checkData;
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
                }
                else {
                    const payFrequency = txns[0]?.assignment?.payroll_frequency ?? txns[0]?.assignment?.application?.job?.pay_period ?? 'WEEKLY';
                    const ytd = await computeYtd(applicant.applicant_id, batch.check_date);
                    const taxInfo = applicant.demographic?.tax_info ?? {};
                    const localTaxInfo = applicant.demographic?.local_tax_info ?? null;
                    const taxes = await calculateTaxes({
                        grossPay, taxInfo, localTaxInfo, payFrequency, ytdGrossBeforeThisCheck: ytd.gross, taxYear,
                    });
                    const netBeforeDeductions = round2(grossPay - taxes.federal_tax - taxes.state_tax - taxes.local_tax - taxes.employee_ss - taxes.employee_medicare);
                    const deductionResult = applyDeductions(netBeforeDeductions, applicant.benefit_deductions ?? [], applicant.garnishments ?? []);
                    const isDirectDeposit = (applicant.bank_accounts ?? []).some((b) => b.is_active);
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
                const check = await prisma_config_1.default.payrollCheck.create({
                    data: {
                        ...checkData,
                        lines: {
                            create: txns.flatMap((t) => t.lines.map((l) => ({
                                transaction_id: t.transaction_id,
                                week_worked: t.week_worked,
                                customer_name: t.organization?.name ?? 'Unknown',
                                department: t.department,
                                earning_type: l.custom_earning_label ?? l.earning_type,
                                hours: l.pay_units,
                                pay_rate: l.pay_rate,
                                amount: l.item_pay,
                            }))),
                        },
                    },
                    include: { lines: true },
                });
                createdChecks.push(check);
            }
            catch (e) {
                errors.push({ payee: key, message: e.message });
            }
        }
        const updated = await prisma_config_1.default.payrollBatch.update({
            where: { payroll_batch_id: batchId },
            data: { status: 'PROCESSED', processed_at: new Date() },
        });
        return (0, response_1.sendSuccess)(res, {
            batch: updated,
            checks_created: createdChecks.length,
            errors,
            batch_log: { batch_id: batchId, transactions_processed: transactions.length, payees_paid: createdChecks.length },
            check_summary: createdChecks.map((c) => ({
                payroll_check_id: c.payroll_check_id, applicant_id: c.applicant_id, agency_id: c.agency_id,
                gross_pay: c.gross_pay, net_pay: c.net_pay, total_employer_cost: c.total_employer_cost,
            })),
        });
    }
    catch (err) {
        console.error('Error processing payroll batch:', err);
        return (0, response_1.sendError)(res, 'Failed to process payroll batch', 500);
    }
};
exports.processPayrollBatch = processPayrollBatch;
// POST /payroll-batches/:batchId/print-checks
// body: { starting_check_number? } — auto-increments if omitted.
// Enforces the "must be 8 characters" rule + global uniqueness.
const printChecks = async (req, res) => {
    try {
        const { batchId } = req.params;
        const { starting_check_number } = req.body;
        const batch = await prisma_config_1.default.payrollBatch.findUnique({ where: { payroll_batch_id: batchId } });
        if (!batch)
            return (0, response_1.sendError)(res, 'Payroll batch not found', 404);
        if (batch.status !== 'PROCESSED')
            return (0, response_1.sendError)(res, 'Batch must be PROCESSED before printing checks', 400);
        const checks = await prisma_config_1.default.payrollCheck.findMany({ where: { payroll_batch_id: batchId, check_number: null } });
        if (!checks.length)
            return (0, response_1.sendError)(res, 'No unprinted checks found for this batch', 400);
        let nextNumber;
        if (starting_check_number) {
            if (String(starting_check_number).length !== 8)
                return (0, response_1.sendError)(res, 'Check number must be exactly 8 characters', 400);
            nextNumber = parseInt(starting_check_number, 10);
            if (isNaN(nextNumber))
                return (0, response_1.sendError)(res, 'starting_check_number must be numeric (8 digits)', 400);
        }
        else {
            const last = await prisma_config_1.default.payrollCheck.findFirst({ where: { check_number: { not: null } }, orderBy: { check_number: 'desc' } });
            nextNumber = last ? parseInt(last.check_number, 10) + 1 : 10000001;
        }
        const printed = [];
        for (const check of checks) {
            const checkNumber = String(nextNumber).padStart(8, '0');
            if (checkNumber.length !== 8)
                return (0, response_1.sendError)(res, 'Check number sequence exceeded 8 digits — reset your numbering', 400);
            const existing = await prisma_config_1.default.payrollCheck.findUnique({ where: { check_number: checkNumber } });
            if (existing)
                return (0, response_1.sendError)(res, `Check number ${checkNumber} is already in use — please pick a different starting number`, 409);
            const updatedCheck = await prisma_config_1.default.payrollCheck.update({
                where: { payroll_check_id: check.payroll_check_id },
                data: { check_number: checkNumber, status: 'PRINTED', printed_at: new Date() },
            });
            printed.push(updatedCheck);
            nextNumber++;
        }
        await prisma_config_1.default.payrollBatch.update({
            where: { payroll_batch_id: batchId },
            data: { status: 'CHECKS_PRINTED', checks_printed_at: new Date() },
        });
        return (0, response_1.sendSuccess)(res, { printed_count: printed.length, checks: printed.map((c) => ({ payroll_check_id: c.payroll_check_id, check_number: c.check_number })) });
    }
    catch (err) {
        console.error('Error printing checks:', err);
        return (0, response_1.sendError)(res, 'Failed to print checks', 500);
    }
};
exports.printChecks = printChecks;
// ════════════════════════════════════════════════════════════════
// PAYROLL CHECK — full pay stub + verify / correction workflow
// ════════════════════════════════════════════════════════════════
// GET /payroll-checks/:checkId — full Earnings Statement payload
const getPayrollCheckStub = async (req, res) => {
    try {
        const { checkId } = req.params;
        const check = await prisma_config_1.default.payrollCheck.findUnique({
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
        if (!check)
            return (0, response_1.sendError)(res, 'Payroll check not found', 404);
        const applicant = check.applicant;
        const ssnLast4 = applicant?.demographic?.ssn_encrypted ? '****' : null; // real last-4 requires your decrypt helper
        const ytd = await computeYtd(applicant.applicant_id, check.batch.check_date, check.payroll_check_id);
        const currentYtdGross = round2(ytd.gross + toNum(check.gross_pay));
        const weekStart = check.lines.reduce((min, l) => (!min || l.week_worked < min ? l.week_worked : min), null);
        const weekEnd = check.lines.reduce((max, l) => (!max || l.week_worked > max ? l.week_worked : max), null);
        const totalHours = round2(check.lines.reduce((s, l) => s + toNum(l.hours), 0));
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
            earnings: check.lines.map((l) => ({
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
            deductions: (check.deduction_breakdown ?? []).map((d) => ({
                deduction_type: d.label,
                amount: d.amount,
                ytd_deduction: round2((ytd.deductions[d.type] ?? 0) + toNum(d.amount)),
            })),
            direct_deposit: applicant.bank_accounts.map((b) => ({
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
            leave_accruals: [],
            status: check.status,
            correction_reason: check.correction_reason,
        };
        return (0, response_1.sendSuccess)(res, { stub });
    }
    catch (err) {
        console.error('Error building payroll check stub:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch payroll check', 500);
    }
};
exports.getPayrollCheckStub = getPayrollCheckStub;
// POST /payroll-checks/:checkId/verify
// "Was everything alright with check?" — body: { is_correct: boolean, description? }
const verifyPayrollCheck = async (req, res) => {
    try {
        const { checkId } = req.params;
        const { is_correct, description } = req.body;
        const verified_by_user_id = req.user?.user_id;
        if (typeof is_correct !== 'boolean')
            return (0, response_1.sendError)(res, 'is_correct (boolean) is required', 400);
        if (!is_correct && !description?.trim())
            return (0, response_1.sendError)(res, 'description is required when the check is not correct', 400);
        const check = await prisma_config_1.default.payrollCheck.findUnique({ where: { payroll_check_id: checkId } });
        if (!check)
            return (0, response_1.sendError)(res, 'Payroll check not found', 404);
        if (check.status !== 'PRINTED')
            return (0, response_1.sendError)(res, 'Only PRINTED checks can be verified', 400);
        const updated = await prisma_config_1.default.payrollCheck.update({
            where: { payroll_check_id: checkId },
            data: is_correct
                ? { status: 'VERIFIED_OK', verified_at: new Date(), verified_by_user_id, correction_reason: null }
                : { status: 'CORRECTION_NEEDED', verified_at: new Date(), verified_by_user_id, correction_reason: description },
        });
        return (0, response_1.sendSuccess)(res, { check: updated });
    }
    catch (err) {
        console.error('Error verifying payroll check:', err);
        return (0, response_1.sendError)(res, 'Failed to verify payroll check', 500);
    }
};
exports.verifyPayrollCheck = verifyPayrollCheck;
// POST /payroll-checks/:checkId/resolve-correction
// body: { action: 'VOID' | 'MARK_OK', note? }
const resolveCheckCorrection = async (req, res) => {
    try {
        const { checkId } = req.params;
        const { action, note } = req.body;
        if (!['VOID', 'MARK_OK'].includes(action))
            return (0, response_1.sendError)(res, "action must be 'VOID' or 'MARK_OK'", 400);
        const check = await prisma_config_1.default.payrollCheck.findUnique({ where: { payroll_check_id: checkId } });
        if (!check)
            return (0, response_1.sendError)(res, 'Payroll check not found', 404);
        if (check.status !== 'CORRECTION_NEEDED')
            return (0, response_1.sendError)(res, 'Only checks in CORRECTION_NEEDED can be resolved here', 400);
        const updated = await prisma_config_1.default.payrollCheck.update({
            where: { payroll_check_id: checkId },
            data: action === 'VOID'
                ? { status: 'VOIDED', correction_reason: note ? `${check.correction_reason} — VOIDED: ${note}` : check.correction_reason }
                : { status: 'VERIFIED_OK', correction_reason: note ? `${check.correction_reason} — RESOLVED: ${note}` : check.correction_reason },
        });
        return (0, response_1.sendSuccess)(res, { check: updated });
    }
    catch (err) {
        console.error('Error resolving check correction:', err);
        return (0, response_1.sendError)(res, 'Failed to resolve correction', 500);
    }
};
exports.resolveCheckCorrection = resolveCheckCorrection;
// POST /payroll-batches/:batchId/post
// Finalizes — requires no outstanding CORRECTION_NEEDED checks.
const postPayrollBatch = async (req, res) => {
    try {
        const { batchId } = req.params;
        const posted_by_user_id = req.user?.user_id;
        if (!posted_by_user_id)
            return (0, response_1.sendError)(res, 'Unauthorized', 401);
        const batch = await prisma_config_1.default.payrollBatch.findUnique({ where: { payroll_batch_id: batchId } });
        if (!batch)
            return (0, response_1.sendError)(res, 'Payroll batch not found', 404);
        if (batch.status !== 'CHECKS_PRINTED')
            return (0, response_1.sendError)(res, 'Batch must be CHECKS_PRINTED before posting', 400);
        const outstanding = await prisma_config_1.default.payrollCheck.findMany({
            where: { payroll_batch_id: batchId, status: 'CORRECTION_NEEDED' },
            select: { payroll_check_id: true, applicant_id: true, correction_reason: true },
        });
        if (outstanding.length) {
            return (0, response_1.sendError)(res, 'Resolve all check corrections before posting this batch', 409, outstanding);
        }
        await prisma_config_1.default.payrollCheck.updateMany({
            where: { payroll_batch_id: batchId, status: { in: ['PRINTED', 'VERIFIED_OK'] } },
            data: { status: 'POSTED', posted_at: new Date() },
        });
        const updated = await prisma_config_1.default.payrollBatch.update({
            where: { payroll_batch_id: batchId },
            data: { status: 'POSTED', posted_at: new Date(), posted_by_user_id },
        });
        return (0, response_1.sendSuccess)(res, { batch: updated, message: 'Payroll batch posted.' });
    }
    catch (err) {
        console.error('Error posting payroll batch:', err);
        return (0, response_1.sendError)(res, 'Failed to post payroll batch', 500);
    }
};
exports.postPayrollBatch = postPayrollBatch;
// POST /payroll-batches/:batchId/void
// body: { reason }
const voidPayrollBatch = async (req, res) => {
    try {
        const { batchId } = req.params;
        const { reason } = req.body;
        if (!reason?.trim())
            return (0, response_1.sendError)(res, 'reason is required', 400);
        const batch = await prisma_config_1.default.payrollBatch.findUnique({ where: { payroll_batch_id: batchId } });
        if (!batch)
            return (0, response_1.sendError)(res, 'Payroll batch not found', 404);
        if (batch.status === 'POSTED')
            return (0, response_1.sendError)(res, 'Posted batches cannot be voided — process a Check Reverse / Check Void run instead', 400);
        await prisma_config_1.default.payrollTransaction.updateMany({ where: { payroll_batch_id: batchId }, data: { payroll_batch_id: null } });
        await prisma_config_1.default.payrollCheck.updateMany({ where: { payroll_batch_id: batchId }, data: { status: 'VOIDED' } });
        const updated = await prisma_config_1.default.payrollBatch.update({
            where: { payroll_batch_id: batchId },
            data: { status: 'VOIDED', voided_at: new Date(), void_reason: reason },
        });
        return (0, response_1.sendSuccess)(res, { batch: updated });
    }
    catch (err) {
        console.error('Error voiding payroll batch:', err);
        return (0, response_1.sendError)(res, 'Failed to void payroll batch', 500);
    }
};
exports.voidPayrollBatch = voidPayrollBatch;
// ════════════════════════════════════════════════════════════════
// STEP 4 — WEEKLY PROCESS: ACH FILE GENERATION
// ════════════════════════════════════════════════════════════════
function buildNachaFile(params) {
    const pad = (v, len, padChar = ' ', left = false) => {
        const s = String(v);
        return left ? s.padEnd(len, padChar).slice(0, len) : s.padStart(len, padChar).slice(0, len);
    };
    const yymmdd = (d) => d.toISOString().slice(2, 10).replace(/-/g, '');
    const now = new Date();
    const fileHeader = '1' + '01' + pad(params.company.routing_number, 10) + pad(params.company.originating_dfi_id, 10) +
        yymmdd(now) + pad(now.toTimeString().slice(0, 5).replace(':', ''), 4) +
        'A' + '094' + '10' + '1' +
        pad(params.company.ach_company_name, 23, ' ', true) + pad('', 23, ' ', true) + pad('', 8);
    const batchHeader = '5' + '200' + pad(params.company.ach_company_name, 16, ' ', true) + pad('', 20, ' ', true) +
        pad(params.company.ach_company_id, 10) + 'PPD' + pad('PAYROLL', 10, ' ', true) +
        yymmdd(params.effectiveDate) + yymmdd(params.effectiveDate) + '   ' + '1' +
        pad(params.company.originating_dfi_id.slice(0, 8), 8) + pad('1', 7);
    let entryLines = [];
    let totalCredit = 0;
    let traceSeq = params.entries[0]?.traceSeq ?? 1;
    params.entries.forEach((e) => {
        const transactionCode = e.accountType === 'CHECKING' ? '22' : '32';
        totalCredit += e.amountCents;
        entryLines.push('6' + transactionCode + pad(e.routingNumber.slice(0, 9), 9) +
            pad(e.accountNumber, 17, ' ', true) + pad(e.amountCents, 10) +
            pad('', 15, ' ', true) + pad(e.employeeName.toUpperCase(), 22, ' ', true) +
            '  ' + '0' + pad(params.company.originating_dfi_id.slice(0, 8), 8) + pad(e.traceSeq, 7));
    });
    let totalDebit = 0;
    // Balancing line: one offsetting debit entry against the company's own
    // origination account for the batch total, per the "include balancing
    // line" checkbox.
    if (params.includeBalancingLine) {
        totalDebit = totalCredit;
        entryLines.push('6' + '27' + pad(params.company.routing_number.slice(0, 9), 9) +
            pad(params.company.originating_dfi_id, 17, ' ', true) + pad(totalDebit, 10) +
            pad('', 15, ' ', true) + pad(params.company.ach_company_name, 22, ' ', true) +
            '  ' + '0' + pad(params.company.originating_dfi_id.slice(0, 8), 8) + pad(traceSeq + entryLines.length + 1, 7));
    }
    const entryHash = params.entries.reduce((s, e) => s + Number(e.routingNumber.slice(0, 8)), 0).toString().slice(-10);
    const batchControl = '8' + '200' + pad(entryLines.length, 6) + pad(entryHash, 10) +
        pad(totalDebit, 12) + pad(totalCredit, 12) + pad(params.company.ach_company_id, 10) +
        pad('', 25, ' ', true) + pad('', 8) + pad(params.company.originating_dfi_id.slice(0, 8), 8) + pad('1', 7);
    const totalRecords = 4 + entryLines.length;
    const blockCount = Math.ceil(totalRecords / 10);
    const fileControl = '9' + pad('1', 6) + pad(blockCount, 6) + pad(entryLines.length, 8) +
        pad(entryHash, 10) + pad(totalDebit, 12) + pad(totalCredit, 12) + pad('', 39, ' ', true);
    const lines = [fileHeader, batchHeader, ...entryLines, batchControl, fileControl];
    while (lines.length % 10 !== 0)
        lines.push('9'.repeat(94));
    return { content: lines.join('\n'), totalAmountCents: totalCredit };
}
// POST /payroll-batches/:batchId/ach
// body: { bank_id, accounting_period, effective_date, include_balancing_line }
// bank_id MUST match the bank chosen when the payroll batch was created.
const generateAchFile = async (req, res) => {
    try {
        const { batchId } = req.params;
        const { bank_id, accounting_period, effective_date, include_balancing_line } = req.body;
        if (!bank_id || !accounting_period || !effective_date || typeof include_balancing_line !== 'boolean') {
            return (0, response_1.sendError)(res, 'bank_id, accounting_period, effective_date, and include_balancing_line are all required', 400);
        }
        const batch = await prisma_config_1.default.payrollBatch.findUnique({ where: { payroll_batch_id: batchId }, include: { bank: true } });
        if (!batch)
            return (0, response_1.sendError)(res, 'Payroll batch not found', 404);
        if (batch.status !== 'POSTED')
            return (0, response_1.sendError)(res, 'Payroll batch must be POSTED before generating ACH', 400);
        if (bank_id !== batch.bank_id)
            return (0, response_1.sendError)(res, 'bank_id must match the bank selected when this payroll batch was created', 400);
        const existing = await prisma_config_1.default.aCHFile.findFirst({ where: { payroll_batch_id: batchId, status: { not: 'VOID' } } });
        if (existing)
            return (0, response_1.sendError)(res, 'An ACH file already exists for this batch', 409);
        // Check POSTED status first, then filter to checks whose employee
        // currently has an active bank account — instead of trusting the
        // is_direct_deposit flag frozen at process-time, which goes stale if
        // a bank account is added/activated afterward.
        const postedChecks = await prisma_config_1.default.payrollCheck.findMany({
            where: { payroll_batch_id: batchId, status: 'POSTED' },
            include: { applicant: { include: { bank_accounts: { where: { is_active: true } } } } },
        });
        if (!postedChecks.length) {
            return (0, response_1.sendError)(res, 'No POSTED checks found in this batch — post the payroll batch before generating ACH', 400);
        }
        const checks = postedChecks.filter((c) => (c.applicant?.bank_accounts ?? []).length > 0);
        if (!checks.length) {
            return (0, response_1.sendError)(res, `${postedChecks.length} POSTED check(s) found, but none of those employees have an active bank account on file for direct deposit`, 400);
        }
        const achEntries = [];
        let traceSeq = 1;
        for (const c of checks) {
            const netPay = toNum(c.net_pay);
            if (netPay <= 0)
                continue;
            const accounts = c.applicant.bank_accounts;
            let remaining = netPay;
            const fixedAccounts = accounts.filter((a) => a.amount_type === 'FIXED');
            const remainingAccount = accounts.find((a) => a.amount_type === 'REMAINING');
            for (const acc of fixedAccounts) {
                const amt = Math.min(toNum(acc.amount), remaining);
                if (amt <= 0)
                    continue;
                remaining = round2(remaining - amt);
                achEntries.push({ routingNumber: acc.routing_number, accountNumber: acc.account_number, accountType: acc.account_type, amountCents: Math.round(amt * 100), employeeName: c.applicant.full_name, traceSeq: traceSeq++ });
            }
            if (remainingAccount && remaining > 0) {
                achEntries.push({ routingNumber: remainingAccount.routing_number, accountNumber: remainingAccount.account_number, accountType: remainingAccount.account_type, amountCents: Math.round(remaining * 100), employeeName: c.applicant.full_name, traceSeq: traceSeq++ });
            }
        }
        if (!achEntries.length)
            return (0, response_1.sendError)(res, 'No payable ACH entries found', 400);
        const { content, totalAmountCents } = buildNachaFile({
            company: batch.bank,
            entries: achEntries,
            effectiveDate: new Date(effective_date),
            includeBalancingLine: include_balancing_line,
        });
        const fileName = `ACH_${batch.batch_number}_${new Date(effective_date).toISOString().slice(0, 10)}.ach`;
        const achFile = await prisma_config_1.default.aCHFile.create({
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
        return (0, response_1.sendSuccess)(res, {
            ach_file: { ...achFile, file_content: undefined },
            entry_count: achEntries.length,
            total_amount: totalAmountCents / 100,
        }, 201);
    }
    catch (err) {
        console.error('Error generating ACH file:', err);
        return (0, response_1.sendError)(res, 'Failed to generate ACH file', 500);
    }
};
exports.generateAchFile = generateAchFile;
// GET /ach-files/:achFileId/download
// "Choose Location" is a browser/OS save dialog — this endpoint just
// streams the raw file; where the user saves it is a frontend concern.
const downloadAchFile = async (req, res) => {
    try {
        const { achFileId } = req.params;
        const achFile = await prisma_config_1.default.aCHFile.findUnique({ where: { ach_file_id: achFileId } });
        if (!achFile)
            return (0, response_1.sendError)(res, 'ACH file not found', 404);
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${achFile.file_name}"`);
        return res.send(achFile.file_content);
    }
    catch (err) {
        console.error('Error downloading ACH file:', err);
        return (0, response_1.sendError)(res, 'Failed to download ACH file', 500);
    }
};
exports.downloadAchFile = downloadAchFile;
// ════════════════════════════════════════════════════════════════
// STEP 3 — BILLING BATCH (weekly, after payroll process — uses bill
// rates instead of pay rates)
// ════════════════════════════════════════════════════════════════
// ⚠️ Placeholder list — replace with your real billing batch types.
exports.BILLING_BATCH_TYPES = ['WEEKLY_BILLING', 'OFF_CYCLE_BILLING', 'ADJUSTMENT_BILLING', 'CREDIT_MEMO', 'MANUAL_INVOICE', 'CORRECTION'];
async function generateClientInvoiceNumber() {
    const year = new Date().getUTCFullYear();
    const count = await prisma_config_1.default.clientInvoice.count({ where: { invoice_date: { gte: new Date(`${year}-01-01T00:00:00Z`) } } });
    return `CINV-${year}-${String(count + 1).padStart(4, '0')}`;
}
// POST /billing-batches
// body: { accounting_period, invoice_date, batch_type, description? }
const createBillingBatch = async (req, res) => {
    try {
        const { accounting_period, invoice_date, batch_type, description } = req.body;
        const created_by_user_id = req.user?.user_id;
        if (!created_by_user_id)
            return (0, response_1.sendError)(res, 'Unauthorized', 401);
        if (!accounting_period || !invoice_date || !batch_type)
            return (0, response_1.sendError)(res, 'accounting_period, invoice_date, and batch_type are required', 400);
        if (!exports.BILLING_BATCH_TYPES.includes(batch_type))
            return (0, response_1.sendError)(res, `batch_type must be one of: ${exports.BILLING_BATCH_TYPES.join(', ')}`, 400);
        const batch = await prisma_config_1.default.billingBatch.create({
            data: {
                accounting_period: new Date(accounting_period),
                invoice_date: new Date(invoice_date),
                batch_type,
                description: description ?? null,
                created_by_user_id,
            },
        });
        return (0, response_1.sendSuccess)(res, { batch }, 201);
    }
    catch (err) {
        console.error('Error creating billing batch:', err);
        return (0, response_1.sendError)(res, 'Failed to create billing batch', 500);
    }
};
exports.createBillingBatch = createBillingBatch;
// GET /billing-batches?status=
const getAllBillingBatches = async (req, res) => {
    try {
        const { status } = req.query;
        const batches = await prisma_config_1.default.billingBatch.findMany({
            where: status ? { status } : {},
            orderBy: { created_at: 'desc' },
            include: { _count: { select: { invoices: true } } },
        });
        return (0, response_1.sendSuccess)(res, { batches });
    }
    catch (err) {
        console.error('Error fetching billing batches:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch billing batches', 500);
    }
};
exports.getAllBillingBatches = getAllBillingBatches;
// GET /billing-batches/:batchId
const getBillingBatchById = async (req, res) => {
    try {
        const { batchId } = req.params;
        const batch = await prisma_config_1.default.billingBatch.findUnique({
            where: { billing_batch_id: batchId },
            include: { invoices: { include: { organization: { select: { name: true } }, lines: true } } },
        });
        if (!batch)
            return (0, response_1.sendError)(res, 'Billing batch not found', 404);
        return (0, response_1.sendSuccess)(res, { batch });
    }
    catch (err) {
        console.error('Error fetching billing batch:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch billing batch', 500);
    }
};
exports.getBillingBatchById = getBillingBatchById;
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
const processBillingBatch = async (req, res) => {
    try {
        const { batchId } = req.params;
        const batch = await prisma_config_1.default.billingBatch.findUnique({ where: { billing_batch_id: batchId } });
        if (!batch)
            return (0, response_1.sendError)(res, 'Billing batch not found', 404);
        if (batch.status !== 'DRAFT')
            return (0, response_1.sendError)(res, 'Batch must be DRAFT to process', 400);
        const alreadyInvoicedTxnIds = (await prisma_config_1.default.clientInvoiceLine.findMany({ select: { transaction_id: true } })).map((l) => l.transaction_id);
        const transactions = await prisma_config_1.default.payrollTransaction.findMany({
            where: { transaction_id: { notIn: alreadyInvoicedTxnIds }, payroll_batch: { status: 'POSTED' } },
            include: {
                lines: true,
                organization: true,
                assignment: { include: { application: { include: { applicant: { select: { full_name: true } } } } } },
            },
        });
        if (!transactions.length)
            return (0, response_1.sendError)(res, 'No posted, uninvoiced transactions found', 400);
        const byOrg = new Map();
        for (const t of transactions) {
            if (t.organization?.do_not_invoice)
                continue;
            if (!byOrg.has(t.organization_id))
                byOrg.set(t.organization_id, { organization: t.organization, transactions: [] });
            byOrg.get(t.organization_id).transactions.push(t);
        }
        const previewRows = [];
        const createdInvoices = [];
        const sortLines = (lines, sortOrder) => {
            const key = sortOrder === 'DEPARTMENT' ? 'department' : sortOrder === 'EARNING_TYPE' ? 'earning_type' : 'employee_name';
            return [...lines].sort((a, b) => String(a[key] ?? '').localeCompare(String(b[key] ?? '')));
        };
        for (const [organizationId, { organization, transactions: orgTxns }] of byOrg) {
            let lineItems = orgTxns.flatMap((t) => t.lines.map((l) => ({
                transaction_id: t.transaction_id,
                employee_name: t.assignment?.application?.applicant?.full_name ?? 'Unknown',
                department: t.department,
                earning_type: l.custom_earning_label ?? l.earning_type,
                bill_units: toNum(l.bill_units),
                bill_rate: toNum(l.bill_rate),
                amount: toNum(l.item_bill),
            })));
            lineItems = sortLines(lineItems, organization?.invoice_sort_order ?? 'EMPLOYEE_NAME');
            const subtotal = round2(lineItems.reduce((s, l) => s + l.amount, 0));
            if (subtotal <= 0)
                continue;
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
            const chunks = [];
            if (maxAmount && subtotal > maxAmount) {
                let current = [];
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
                if (current.length)
                    chunks.push(current);
            }
            else {
                chunks.push(lineItems);
            }
            for (const chunkLines of chunks) {
                const chunkSubtotal = round2(chunkLines.reduce((s, l) => s + l.amount, 0));
                const invoice = await prisma_config_1.default.clientInvoice.create({
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
        await prisma_config_1.default.billingBatch.update({ where: { billing_batch_id: batchId }, data: { status: 'PROCESSED', processed_at: new Date() } });
        return (0, response_1.sendSuccess)(res, { invoices_created: createdInvoices.length, preview: previewRows, invoices: createdInvoices });
    }
    catch (err) {
        console.error('Error processing billing batch:', err);
        return (0, response_1.sendError)(res, 'Failed to process billing batch', 500);
    }
};
exports.processBillingBatch = processBillingBatch;
// GET /billing-batches/:batchId/preview
const getBillingBatchPreview = async (req, res) => {
    try {
        const { batchId } = req.params;
        const invoices = await prisma_config_1.default.clientInvoice.findMany({
            where: { billing_batch_id: batchId },
            include: { organization: { select: { name: true } }, lines: true },
        });
        const rows = invoices.flatMap((inv) => inv.lines.map((l) => ({ assigned_employee: l.employee_name, bill_to: inv.organization.name, department_name: l.department, total_bill: toNum(l.amount) })));
        return (0, response_1.sendSuccess)(res, { rows, invoices });
    }
    catch (err) {
        console.error('Error fetching billing batch preview:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch billing batch preview', 500);
    }
};
exports.getBillingBatchPreview = getBillingBatchPreview;
// POST /billing-batches/:batchId/post
// body: {
//   email_to_customers: boolean,
//   organization_emails?: { [organization_id]: string },   // supply/override email for orgs missing one
//   skip_email_organization_ids?: string[]                  // finalize these orgs without emailing them
// }
const postBillingBatch = async (req, res) => {
    try {
        const { batchId } = req.params;
        const { email_to_customers, organization_emails, skip_email_organization_ids } = req.body;
        const posted_by_user_id = req.user?.user_id;
        if (!posted_by_user_id)
            return (0, response_1.sendError)(res, 'Unauthorized', 401);
        const batch = await prisma_config_1.default.billingBatch.findUnique({
            where: { billing_batch_id: batchId },
            include: { invoices: { include: { organization: { select: { organization_id: true, name: true, email: true } } } } },
        });
        if (!batch)
            return (0, response_1.sendError)(res, 'Billing batch not found', 404);
        if (batch.status !== 'PROCESSED')
            return (0, response_1.sendError)(res, 'Batch must be PROCESSED before posting', 400);
        if (!batch.invoices.length)
            return (0, response_1.sendError)(res, 'No invoices found in this batch', 400);
        const emailOverrides = organization_emails || {};
        const skipEmailOrgIds = new Set(skip_email_organization_ids || []);
        // ── Pre-flight: every org we're about to email needs an address, unless
        // the caller explicitly chose to skip that org ──
        if (email_to_customers) {
            const missingByOrg = new Map();
            for (const inv of batch.invoices) {
                const orgId = inv.organization?.organization_id;
                if (!orgId)
                    continue;
                const hasEmail = !!inv.organization.email || !!emailOverrides[orgId];
                if (hasEmail || skipEmailOrgIds.has(orgId))
                    continue;
                if (!missingByOrg.has(orgId))
                    missingByOrg.set(orgId, { organization_id: orgId, organization_name: inv.organization.name, invoice_ids: [], total_amount: 0 });
                const entry = missingByOrg.get(orgId);
                entry.invoice_ids.push(inv.client_invoice_id);
                entry.total_amount = round2(entry.total_amount + toNum(inv.total_amount));
            }
            if (missingByOrg.size > 0) {
                return (0, response_1.sendError)(res, 'Some customers are missing an email address — add one, or mark them as sent without emailing.', 409, { missing_emails: Array.from(missingByOrg.values()) });
            }
            // Persist any newly-supplied emails for orgs that didn't have one on file
            for (const [orgId, email] of Object.entries(emailOverrides)) {
                const org = batch.invoices.find((i) => i.organization?.organization_id === orgId)?.organization;
                if (org && !org.email && email?.trim()) {
                    await prisma_config_1.default.organization.update({ where: { organization_id: orgId }, data: { email: email.trim() } });
                    org.email = email.trim(); // keep in-memory copy in sync for the send loop below
                }
            }
        }
        await prisma_config_1.default.clientInvoice.updateMany({ where: { billing_batch_id: batchId }, data: { status: 'SENT' } });
        // Always generate the PDF on post, regardless of whether we're emailing
        // it — so the download endpoint has something to serve immediately.
        for (const inv of batch.invoices) {
            try {
                const pdfUrl = await (0, updatedPayrollInvoiceService_1.generateClientInvoicePdf)(inv.client_invoice_id);
                inv.pdf_url = pdfUrl;
                await prisma_config_1.default.clientInvoice.update({ where: { client_invoice_id: inv.client_invoice_id }, data: { pdf_url: pdfUrl } });
            }
            catch (e) {
                console.error(`Error generating PDF for invoice ${inv.client_invoice_id}:`, e);
            }
        }
        const emailResults = [];
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
                const result = await (0, emailService_1.sendClientInvoiceEmail)({
                    organizationEmail: emailAddress,
                    organizationName: org?.name ?? 'Customer',
                    invoiceNumber: inv.invoice_number,
                    invoiceDate: inv.invoice_date,
                    dueDate: inv.due_date,
                    totalAmount: toNum(inv.total_amount),
                    pdfUrl: inv.pdf_url,
                });
                if (result.success) {
                    await prisma_config_1.default.clientInvoice.update({ where: { client_invoice_id: inv.client_invoice_id }, data: { emailed_at: new Date() } });
                    emailResults.push({ invoice_id: inv.client_invoice_id, organization_name: org?.name ?? 'Unknown', status: 'sent' });
                }
                else {
                    emailResults.push({ invoice_id: inv.client_invoice_id, organization_name: org?.name ?? 'Unknown', status: 'failed', error: result.error });
                }
            }
        }
        const updated = await prisma_config_1.default.billingBatch.update({
            where: { billing_batch_id: batchId },
            data: { status: 'POSTED', posted_at: new Date(), posted_by_user_id },
        });
        return (0, response_1.sendSuccess)(res, { batch: updated, emailed: !!email_to_customers, email_results: emailResults });
    }
    catch (err) {
        console.error('Error posting billing batch:', err);
        return (0, response_1.sendError)(res, 'Failed to post billing batch', 500);
    }
};
exports.postBillingBatch = postBillingBatch;
// POST /billing-batches/:batchId/discard
const discardBillingBatch = async (req, res) => {
    try {
        const { batchId } = req.params;
        const batch = await prisma_config_1.default.billingBatch.findUnique({ where: { billing_batch_id: batchId } });
        if (!batch)
            return (0, response_1.sendError)(res, 'Billing batch not found', 404);
        if (batch.status === 'POSTED')
            return (0, response_1.sendError)(res, 'Posted batches cannot be discarded', 400);
        await prisma_config_1.default.clientInvoice.deleteMany({ where: { billing_batch_id: batchId } }); // cascades to lines
        const updated = await prisma_config_1.default.billingBatch.update({
            where: { billing_batch_id: batchId },
            data: { status: 'DISCARDED', discarded_at: new Date() },
        });
        return (0, response_1.sendSuccess)(res, { batch: updated });
    }
    catch (err) {
        console.error('Error discarding billing batch:', err);
        return (0, response_1.sendError)(res, 'Failed to discard billing batch', 500);
    }
};
exports.discardBillingBatch = discardBillingBatch;
const downloadClientInvoicePdf = async (req, res) => {
    try {
        const { invoiceId } = req.params;
        const invoice = await prisma_config_1.default.clientInvoice.findUnique({ where: { client_invoice_id: invoiceId } });
        if (!invoice)
            return (0, response_1.sendError)(res, 'Invoice not found', 404);
        let pdfUrl = invoice.pdf_url;
        if (!pdfUrl) {
            pdfUrl = await (0, updatedPayrollInvoiceService_1.generateClientInvoicePdf)(invoiceId);
            await prisma_config_1.default.clientInvoice.update({ where: { client_invoice_id: invoiceId }, data: { pdf_url: pdfUrl } });
        }
        const blobResponse = await fetch(pdfUrl);
        if (!blobResponse.ok)
            return (0, response_1.sendError)(res, 'Failed to retrieve invoice PDF from storage', 502);
        const arrayBuffer = await blobResponse.arrayBuffer();
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${invoice.invoice_number}.pdf"`);
        return res.send(Buffer.from(arrayBuffer));
    }
    catch (err) {
        console.error('Error downloading client invoice PDF:', err);
        return (0, response_1.sendError)(res, 'Failed to download invoice PDF', 500);
    }
};
exports.downloadClientInvoicePdf = downloadClientInvoicePdf;
// ════════════════════════════════════════════════════════════════
// WC CODE ADMIN (Module 3 support — Admin creates WC Codes)
// ════════════════════════════════════════════════════════════════
const createWcCode = async (req, res) => {
    try {
        const { code, description, insurance_rate, cost_pct } = req.body;
        if (!code || !description || insurance_rate == null)
            return (0, response_1.sendError)(res, 'code, description, and insurance_rate are required', 400);
        const wcCode = await prisma_config_1.default.wCCode.create({ data: { code, description, insurance_rate, cost_pct: cost_pct ?? null } });
        return (0, response_1.sendSuccess)(res, { wc_code: wcCode }, 201);
    }
    catch (err) {
        console.error('Error creating WC code:', err);
        return (0, response_1.sendError)(res, 'Failed to create WC code', 500);
    }
};
exports.createWcCode = createWcCode;
const listWcCodes = async (_req, res) => {
    try {
        const wcCodes = await prisma_config_1.default.wCCode.findMany({ where: { is_active: true }, orderBy: { code: 'asc' } });
        return (0, response_1.sendSuccess)(res, { wc_codes: wcCodes });
    }
    catch (err) {
        console.error('Error listing WC codes:', err);
        return (0, response_1.sendError)(res, 'Failed to list WC codes', 500);
    }
};
exports.listWcCodes = listWcCodes;
// ════════════════════════════════════════════════════════════════
// APPEND — new functions, add these before the final export object
// ════════════════════════════════════════════════════════════════
// ── Reopen (non-destructive — unlike voidPayrollBatch, this keeps
// transactions claimed and checks intact, just rewinds the status
// gate so corrections can be made and the batch re-processed/re-posted) ──
// POST /payroll-batches/:batchId/reopen
// body: { reason, target_status?: 'DRAFT' | 'PROCESSED' | 'CHECKS_PRINTED' }
const reopenPayrollBatch = async (req, res) => {
    try {
        const { batchId } = req.params;
        const { reason, target_status } = req.body;
        const reopened_by_user_id = req.user?.user_id;
        if (!reopened_by_user_id)
            return (0, response_1.sendError)(res, 'Unauthorized', 401);
        if (!reason?.trim())
            return (0, response_1.sendError)(res, 'reason is required to reopen a batch', 400);
        const batch = await prisma_config_1.default.payrollBatch.findUnique({ where: { payroll_batch_id: batchId } });
        if (!batch)
            return (0, response_1.sendError)(res, 'Payroll batch not found', 404);
        if (!['CHECKS_PRINTED', 'POSTED'].includes(batch.status)) {
            return (0, response_1.sendError)(res, `Cannot reopen a batch in ${batch.status} status`, 400);
        }
        const targetStatus = target_status || 'PROCESSED';
        if (!['DRAFT', 'PROCESSED', 'CHECKS_PRINTED'].includes(targetStatus)) {
            return (0, response_1.sendError)(res, 'target_status must be DRAFT, PROCESSED, or CHECKS_PRINTED', 400);
        }
        // Rewinding past PROCESSED means the generated checks are stale —
        // clear them so process can be re-run cleanly. Rewinding only to
        // CHECKS_PRINTED (e.g. to fix one check) leaves them in place.
        if (targetStatus === 'DRAFT' || targetStatus === 'PROCESSED') {
            if (batch.status === 'POSTED') {
                return (0, response_1.sendError)(res, 'A POSTED batch can only reopen to CHECKS_PRINTED — void it instead if checks need to be discarded entirely', 400);
            }
        }
        const updated = await prisma_config_1.default.payrollBatch.update({
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
            await prisma_config_1.default.payrollCheck.deleteMany({ where: { payroll_batch_id: batchId } });
        }
        else if (targetStatus === 'PROCESSED') {
            // Un-print but keep the calculated figures; print-checks can re-run
            await prisma_config_1.default.payrollCheck.updateMany({
                where: { payroll_batch_id: batchId },
                data: { status: 'PENDING', check_number: null, printed_at: null, verified_at: null, verified_by_user_id: null, posted_at: null, correction_reason: null },
            });
        }
        else {
            // CHECKS_PRINTED — leave check numbers in place, just unpost them
            await prisma_config_1.default.payrollCheck.updateMany({
                where: { payroll_batch_id: batchId, status: 'POSTED' },
                data: { status: 'PRINTED', posted_at: null },
            });
        }
        return (0, response_1.sendSuccess)(res, { batch: updated });
    }
    catch (err) {
        console.error('Error reopening payroll batch:', err);
        return (0, response_1.sendError)(res, 'Failed to reopen payroll batch', 500);
    }
};
exports.reopenPayrollBatch = reopenPayrollBatch;
// GET /payroll-batches/:batchId/employer-cost-summary
const getEmployerCostSummary = async (req, res) => {
    try {
        const { batchId } = req.params;
        const checks = await prisma_config_1.default.payrollCheck.findMany({ where: { payroll_batch_id: batchId } });
        const totals = checks.reduce((acc, c) => {
            acc.gross_pay += toNum(c.gross_pay);
            acc.employer_wc_cost += toNum(c.employer_wc_cost);
            acc.employer_ss += toNum(c.employer_ss);
            acc.employer_medicare += toNum(c.employer_medicare);
            acc.employer_futa += toNum(c.employer_futa);
            acc.employer_suta += toNum(c.employer_suta);
            acc.total_employer_cost += toNum(c.total_employer_cost);
            return acc;
        }, { gross_pay: 0, employer_wc_cost: 0, employer_ss: 0, employer_medicare: 0, employer_futa: 0, employer_suta: 0, total_employer_cost: 0 });
        Object.keys(totals).forEach((k) => (totals[k] = round2(totals[k])));
        return (0, response_1.sendSuccess)(res, { batch_id: batchId, totals, check_count: checks.length });
    }
    catch (err) {
        console.error('Error fetching employer cost summary:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch employer cost summary', 500);
    }
};
exports.getEmployerCostSummary = getEmployerCostSummary;
// ── Agency CRUD ──────────────────────────────────────────────────
const createAgency = async (req, res) => {
    try {
        const { name, contact_name, contact_email, contact_phone, address, bank_name, routing_number, account_number } = req.body;
        if (!name?.trim())
            return (0, response_1.sendError)(res, 'name is required', 400);
        if (routing_number && !/^\d{9}$/.test(routing_number))
            return (0, response_1.sendError)(res, 'routing_number must be exactly 9 digits', 400);
        const agency = await prisma_config_1.default.agency.create({
            data: { name, contact_name, contact_email, contact_phone, address, bank_name, routing_number, account_number },
        });
        return (0, response_1.sendSuccess)(res, { agency }, 201);
    }
    catch (err) {
        console.error('Error creating agency:', err);
        return (0, response_1.sendError)(res, 'Failed to create agency', 500);
    }
};
exports.createAgency = createAgency;
const listAgencies = async (_req, res) => {
    try {
        const agencies = await prisma_config_1.default.agency.findMany({ where: { is_active: true }, orderBy: { name: 'asc' } });
        return (0, response_1.sendSuccess)(res, { agencies });
    }
    catch (err) {
        console.error('Error listing agencies:', err);
        return (0, response_1.sendError)(res, 'Failed to list agencies', 500);
    }
};
exports.listAgencies = listAgencies;
const updateAgency = async (req, res) => {
    try {
        const { agencyId } = req.params;
        const { name, contact_name, contact_email, contact_phone, address, bank_name, routing_number, account_number, is_active } = req.body;
        const existing = await prisma_config_1.default.agency.findUnique({ where: { agency_id: agencyId } });
        if (!existing)
            return (0, response_1.sendError)(res, 'Agency not found', 404);
        if (routing_number && !/^\d{9}$/.test(routing_number))
            return (0, response_1.sendError)(res, 'routing_number must be exactly 9 digits', 400);
        const agency = await prisma_config_1.default.agency.update({
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
        return (0, response_1.sendSuccess)(res, { agency });
    }
    catch (err) {
        console.error('Error updating agency:', err);
        return (0, response_1.sendError)(res, 'Failed to update agency', 500);
    }
};
exports.updateAgency = updateAgency;
// ── Tax configuration admin (feeds calculateTaxes above) ───────────
const createTaxBracket = async (req, res) => {
    try {
        const { tax_year, filing_status, min_annual_income, max_annual_income, rate, base_tax } = req.body;
        if (!tax_year || !filing_status || min_annual_income == null || rate == null || base_tax == null) {
            return (0, response_1.sendError)(res, 'tax_year, filing_status, min_annual_income, rate, and base_tax are required', 400);
        }
        const bracket = await prisma_config_1.default.taxBracket.create({
            data: { tax_year, filing_status, min_annual_income, max_annual_income: max_annual_income ?? null, rate, base_tax },
        });
        return (0, response_1.sendSuccess)(res, { bracket }, 201);
    }
    catch (err) {
        console.error('Error creating tax bracket:', err);
        return (0, response_1.sendError)(res, 'Failed to create tax bracket', 500);
    }
};
exports.createTaxBracket = createTaxBracket;
const listTaxBrackets = async (req, res) => {
    try {
        const { tax_year, filing_status } = req.query;
        const brackets = await prisma_config_1.default.taxBracket.findMany({
            where: { ...(tax_year && { tax_year: Number(tax_year) }), ...(filing_status && { filing_status }) },
            orderBy: [{ tax_year: 'desc' }, { filing_status: 'asc' }, { min_annual_income: 'asc' }],
        });
        return (0, response_1.sendSuccess)(res, { brackets });
    }
    catch (err) {
        console.error('Error listing tax brackets:', err);
        return (0, response_1.sendError)(res, 'Failed to list tax brackets', 500);
    }
};
exports.listTaxBrackets = listTaxBrackets;
const createStateTaxRate = async (req, res) => {
    try {
        const { state, flat_rate, tax_year, notes } = req.body;
        if (!state || flat_rate == null || !tax_year)
            return (0, response_1.sendError)(res, 'state, flat_rate, and tax_year are required', 400);
        const stateRate = await prisma_config_1.default.stateTaxRate.upsert({
            where: { state },
            update: { flat_rate, tax_year, notes },
            create: { state, flat_rate, tax_year, notes },
        });
        return (0, response_1.sendSuccess)(res, { state_tax_rate: stateRate }, 201);
    }
    catch (err) {
        console.error('Error creating state tax rate:', err);
        return (0, response_1.sendError)(res, 'Failed to create state tax rate', 500);
    }
};
exports.createStateTaxRate = createStateTaxRate;
const listStateTaxRates = async (_req, res) => {
    try {
        const rates = await prisma_config_1.default.stateTaxRate.findMany({ orderBy: { state: 'asc' } });
        return (0, response_1.sendSuccess)(res, { state_tax_rates: rates });
    }
    catch (err) {
        console.error('Error listing state tax rates:', err);
        return (0, response_1.sendError)(res, 'Failed to list state tax rates', 500);
    }
};
exports.listStateTaxRates = listStateTaxRates;
// GET /client-invoices/:invoiceId
const getClientInvoiceById = async (req, res) => {
    try {
        const { invoiceId } = req.params;
        const invoice = await prisma_config_1.default.clientInvoice.findUnique({
            where: { client_invoice_id: invoiceId },
            include: {
                organization: { select: { name: true, email: true } },
                lines: true,
                batch: { select: { batch_number: true, batch_type: true } },
            },
        });
        if (!invoice)
            return (0, response_1.sendError)(res, 'Invoice not found', 404);
        return (0, response_1.sendSuccess)(res, { invoice });
    }
    catch (err) {
        console.error('Error fetching client invoice:', err);
        return (0, response_1.sendError)(res, 'Failed to fetch client invoice', 500);
    }
};
exports.getClientInvoiceById = getClientInvoiceById;
exports.payrollController = {
    // Bank accounts (front office / employee)
    createEmployeeBankAccount: exports.createEmployeeBankAccount,
    listEmployeeBankAccounts: exports.listEmployeeBankAccounts,
    updateEmployeeBankAccount: exports.updateEmployeeBankAccount,
    // Company bank ("Bank" dropdown)
    createCompanyBankAccount: exports.createCompanyBankAccount,
    listCompanyBankAccounts: exports.listCompanyBankAccounts,
    // Step 2 — Payroll Batch
    getRunTypes: exports.getRunTypes,
    createPayrollBatch: exports.createPayrollBatch,
    getAllPayrollBatches: exports.getAllPayrollBatches,
    getPayrollBatchById: exports.getPayrollBatchById,
    getAvailableTransactions: exports.getAvailableTransactions,
    selectTransactionsForBatch: exports.selectTransactionsForBatch,
    removeTransactionFromBatch: exports.removeTransactionFromBatch,
    saveAndCloseBatchSelection: exports.saveAndCloseBatchSelection,
    processPayrollBatch: exports.processPayrollBatch,
    printChecks: exports.printChecks,
    postPayrollBatch: exports.postPayrollBatch,
    voidPayrollBatch: exports.voidPayrollBatch,
    // Payroll Check
    getPayrollCheckStub: exports.getPayrollCheckStub,
    verifyPayrollCheck: exports.verifyPayrollCheck,
    resolveCheckCorrection: exports.resolveCheckCorrection,
    // Step 4 — ACH
    generateAchFile: exports.generateAchFile,
    downloadAchFile: exports.downloadAchFile,
    // Step 3 — Billing Batch
    createBillingBatch: exports.createBillingBatch,
    getAllBillingBatches: exports.getAllBillingBatches,
    getBillingBatchById: exports.getBillingBatchById,
    processBillingBatch: exports.processBillingBatch,
    getBillingBatchPreview: exports.getBillingBatchPreview,
    postBillingBatch: exports.postBillingBatch,
    discardBillingBatch: exports.discardBillingBatch,
    downloadClientInvoicePdf: exports.downloadClientInvoicePdf,
    // WC Codes
    createWcCode: exports.createWcCode,
    listWcCodes: exports.listWcCodes,
    reopenPayrollBatch: exports.reopenPayrollBatch,
    getEmployerCostSummary: exports.getEmployerCostSummary,
    createAgency: exports.createAgency,
    listAgencies: exports.listAgencies,
    updateAgency: exports.updateAgency,
    createTaxBracket: exports.createTaxBracket,
    listTaxBrackets: exports.listTaxBrackets,
    createStateTaxRate: exports.createStateTaxRate,
    listStateTaxRates: exports.listStateTaxRates,
    // invoice
    getClientInvoiceById: exports.getClientInvoiceById
};
//# sourceMappingURL=payrollUpdateController.js.map