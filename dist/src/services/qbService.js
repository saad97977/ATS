"use strict";
// ─────────────────────────────────────────────────────────────
// services/qbService.ts
// Handles all QuickBooks OAuth 2.0 + API calls
// ─────────────────────────────────────────────────────────────
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.pushPayrollJournalEntry = exports.pushTimeActivityToQB = exports.pushInvoiceToQB = exports.findOrCreateServiceItem = exports.findOrCreateEmployee = exports.findOrCreateCustomer = exports.qbQuery = exports.qbGet = exports.qbPost = exports.getRealmId = exports.refreshAccessToken = exports.exchangeCodeForTokens = exports.getAuthorizationUrl = void 0;
const prisma_config_1 = __importDefault(require("../prisma.config"));
const QB_BASE = process.env.QB_ENVIRONMENT === 'production'
    ? 'https://quickbooks.api.intuit.com/v3/company'
    : 'https://sandbox-quickbooks.api.intuit.com/v3/company';
const QB_TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
const QB_AUTH_URL = 'https://appcenter.intuit.com/connect/oauth2';
// ─── OAuth Step 1: Build Authorization URL ───────────────────
const getAuthorizationUrl = (state) => {
    const params = new URLSearchParams({
        client_id: process.env.QB_CLIENT_ID,
        redirect_uri: process.env.QB_REDIRECT_URI,
        response_type: 'code',
        scope: 'com.intuit.quickbooks.accounting',
        state: state || 'qb_auth',
    });
    return `${QB_AUTH_URL}?${params.toString()}`;
};
exports.getAuthorizationUrl = getAuthorizationUrl;
// ─── OAuth Step 2: Exchange code for tokens ──────────────────
const exchangeCodeForTokens = async (code, realmId) => {
    const credentials = Buffer.from(`${process.env.QB_CLIENT_ID}:${process.env.QB_CLIENT_SECRET}`).toString('base64');
    const res = await fetch(QB_TOKEN_URL, {
        method: 'POST',
        headers: {
            Authorization: `Basic ${credentials}`,
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json',
        },
        body: new URLSearchParams({
            grant_type: 'authorization_code',
            code,
            redirect_uri: process.env.QB_REDIRECT_URI,
        }),
    });
    const data = await res.json();
    if (!res.ok)
        throw new Error(data.error_description || 'QB token exchange failed');
    const expiresAt = new Date(Date.now() + data.expires_in * 1000);
    await saveTokens(realmId, data.access_token, data.refresh_token, expiresAt);
    return {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        realm_id: realmId,
        expires_at: expiresAt,
    };
};
exports.exchangeCodeForTokens = exchangeCodeForTokens;
// ─── Refresh access token ─────────────────────────────────────
const refreshAccessToken = async (realmId) => {
    const stored = await loadTokens(realmId);
    if (!stored)
        throw new Error('No QuickBooks tokens found. Please re-authorize.');
    if (stored.expires_at && new Date(stored.expires_at) > new Date(Date.now() + 5 * 60 * 1000)) {
        return stored.access_token;
    }
    const credentials = Buffer.from(`${process.env.QB_CLIENT_ID}:${process.env.QB_CLIENT_SECRET}`).toString('base64');
    const res = await fetch(QB_TOKEN_URL, {
        method: 'POST',
        headers: {
            Authorization: `Basic ${credentials}`,
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json',
        },
        body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: stored.refresh_token,
        }),
    });
    const data = await res.json();
    if (!res.ok)
        throw new Error(data.error_description || 'QB token refresh failed');
    const expiresAt = new Date(Date.now() + data.expires_in * 1000);
    await saveTokens(realmId, data.access_token, data.refresh_token, expiresAt);
    return data.access_token;
};
exports.refreshAccessToken = refreshAccessToken;
// ─── Token persistence ────────────────────────────────────────
const inMemoryTokens = {};
const saveTokens = async (realmId, accessToken, refreshToken, expiresAt) => {
    await prisma_config_1.default.qBTokenStore.upsert({
        where: { realm_id: realmId },
        update: { access_token: accessToken, refresh_token: refreshToken, expires_at: expiresAt },
        create: { realm_id: realmId, access_token: accessToken, refresh_token: refreshToken, expires_at: expiresAt },
    }).catch(() => {
        console.warn('[QB] qBTokenStore table not found — tokens stored in memory only.');
        inMemoryTokens[realmId] = { access_token: accessToken, refresh_token: refreshToken, expires_at: expiresAt, realm_id: realmId };
    });
};
const loadTokens = async (realmId) => {
    try {
        const row = await prisma_config_1.default.qBTokenStore.findUnique({ where: { realm_id: realmId } });
        return row ?? null;
    }
    catch {
        return inMemoryTokens[realmId] ?? null;
    }
};
// ─── Core API helpers ─────────────────────────────────────────
const getRealmId = async () => {
    try {
        const row = await prisma_config_1.default.qBTokenStore.findFirst({ orderBy: { realm_id: 'asc' } });
        if (row)
            return row.realm_id;
    }
    catch { /* no table yet */ }
    const keys = Object.keys(inMemoryTokens);
    if (keys.length)
        return keys[0];
    throw new Error('No QuickBooks company connected. Authorize at /api/payroll/quickbooks/connect');
};
exports.getRealmId = getRealmId;
const qbPost = async (endpoint, body, realmId) => {
    const rid = realmId ?? await (0, exports.getRealmId)();
    const token = await (0, exports.refreshAccessToken)(rid);
    const res = await fetch(`${QB_BASE}/${rid}${endpoint}?minorversion=70`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
        },
        body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
        const msg = data?.Fault?.Error?.[0]?.Detail ?? data?.Fault?.Error?.[0]?.Message ?? JSON.stringify(data);
        throw new Error(`QB API error on ${endpoint}: ${msg}`);
    }
    return data;
};
exports.qbPost = qbPost;
const qbGet = async (endpoint, realmId) => {
    const rid = realmId ?? await (0, exports.getRealmId)();
    const token = await (0, exports.refreshAccessToken)(rid);
    const res = await fetch(`${QB_BASE}/${rid}${endpoint}?minorversion=70`, {
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
        },
    });
    const data = await res.json();
    if (!res.ok) {
        const msg = data?.Fault?.Error?.[0]?.Detail ?? JSON.stringify(data);
        throw new Error(`QB GET error on ${endpoint}: ${msg}`);
    }
    return data;
};
exports.qbGet = qbGet;
const qbQuery = async (sql, realmId) => {
    const rid = realmId ?? await (0, exports.getRealmId)();
    const token = await (0, exports.refreshAccessToken)(rid);
    const url = `${QB_BASE}/${rid}/query?query=${encodeURIComponent(sql)}&minorversion=70`;
    const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    const data = await res.json();
    if (!res.ok) {
        const msg = data?.Fault?.Error?.[0]?.Detail ?? JSON.stringify(data);
        throw new Error(`QB query error: ${msg}`);
    }
    return data?.QueryResponse;
};
exports.qbQuery = qbQuery;
// ─── Account lookup helper ────────────────────────────────────
/**
 * Look up a QB Account by name and return its Id.
 *
 * canCreate = true  → if not found by name, create it (safe for regular Expense accounts).
 * canCreate = false → if not found by name, fall back to matching by AccountType instead.
 *                     Use this for system-managed accounts like Accounts Payable that
 *                     the QB API will reject when you try to POST /account to create them.
 *
 * Valid AccountType + AccountSubType combos used here:
 *   Expense  / SuppliesMaterials  — wages / payroll expense (QB-valid enum pair)
 *   Liability / AccountsPayable   — A/P   (system account, cannot be created via API)
 */
const findOrCreateAccount = async (name, accountType, accountSubType, realmId, canCreate = true) => {
    const safeName = name.replace(/'/g, "\\'");
    // 1. Try exact name match first
    const qrByName = await (0, exports.qbQuery)(`SELECT Id, Name FROM Account WHERE Name = '${safeName}'`, realmId);
    if (qrByName?.Account?.length) {
        return qrByName.Account[0].Id;
    }
    // 2. System accounts (A/P etc.) — QB won't let us create them, fall back to type lookup
    if (!canCreate) {
        console.warn(`[QB] Account "${name}" not found by name — falling back to AccountType="${accountType}" lookup.`);
        const qrByType = await (0, exports.qbQuery)(`SELECT Id, Name FROM Account WHERE AccountType = '${accountType}' MAXRESULTS 1`, realmId);
        if (qrByType?.Account?.length) {
            const match = qrByType.Account[0];
            console.warn(`[QB] Using account "${match.Name}" (Id: ${match.Id}) as fallback for "${name}".`);
            return match.Id;
        }
        throw new Error(`QuickBooks account "${name}" not found and cannot be auto-created. ` +
            `Please ensure your QB Chart of Accounts has an account of type "${accountType}".`);
    }
    // 3. Create the account on the fly
    console.warn(`[QB] Account "${name}" not found — creating it automatically.`);
    const res = await (0, exports.qbPost)('/account', {
        Name: name,
        AccountType: accountType, // 'Expense'
        AccountSubType: accountSubType, // 'SuppliesMaterials'
    }, realmId);
    return res.Account.Id;
};
// ─── Domain helpers ───────────────────────────────────────────
const findOrCreateCustomer = async (displayName, realmId) => {
    const rid = realmId ?? await (0, exports.getRealmId)();
    const qr = await (0, exports.qbQuery)(`SELECT * FROM Customer WHERE DisplayName = '${displayName.replace(/'/g, "\\'")}'`, rid);
    if (qr?.Customer?.length)
        return qr.Customer[0].Id;
    const res = await (0, exports.qbPost)('/customer', { DisplayName: displayName }, rid);
    return res.Customer.Id;
};
exports.findOrCreateCustomer = findOrCreateCustomer;
const findOrCreateEmployee = async (displayName, realmId) => {
    const rid = realmId ?? await (0, exports.getRealmId)();
    const qr = await (0, exports.qbQuery)(`SELECT * FROM Employee WHERE DisplayName = '${displayName.replace(/'/g, "\\'")}'`, rid);
    if (qr?.Employee?.length)
        return qr.Employee[0].Id;
    const res = await (0, exports.qbPost)('/employee', { DisplayName: displayName }, rid);
    return res.Employee.Id;
};
exports.findOrCreateEmployee = findOrCreateEmployee;
const findOrCreateServiceItem = async (name, incomeAccountId = '1', realmId) => {
    const rid = realmId ?? await (0, exports.getRealmId)();
    const qr = await (0, exports.qbQuery)(`SELECT * FROM Item WHERE Name = '${name.replace(/'/g, "\\'")}'`, rid);
    if (qr?.Item?.length)
        return qr.Item[0].Id;
    const res = await (0, exports.qbPost)('/item', {
        Name: name,
        Type: 'Service',
        IncomeAccountRef: { value: incomeAccountId },
    }, rid);
    return res.Item.Id;
};
exports.findOrCreateServiceItem = findOrCreateServiceItem;
const pushInvoiceToQB = async (invoice, customerQbId, realmId) => {
    const rid = realmId ?? await (0, exports.getRealmId)();
    const regItemId = await (0, exports.findOrCreateServiceItem)('Regular Hours', '1', rid);
    const otItemId = await (0, exports.findOrCreateServiceItem)('Overtime Hours', '1', rid);
    const lines = [
        {
            Amount: Number(invoice.bill_rate) * Number(invoice.regular_hours),
            DetailType: 'SalesItemLineDetail',
            SalesItemLineDetail: {
                ItemRef: { value: regItemId },
                Qty: Number(invoice.regular_hours),
                UnitPrice: Number(invoice.bill_rate),
            },
        },
    ];
    if (Number(invoice.ot_hours) > 0) {
        lines.push({
            Amount: Number(invoice.ot_bill_rate ?? 0) * Number(invoice.ot_hours),
            DetailType: 'SalesItemLineDetail',
            SalesItemLineDetail: {
                ItemRef: { value: otItemId },
                Qty: Number(invoice.ot_hours),
                UnitPrice: Number(invoice.ot_bill_rate ?? 0),
            },
        });
    }
    const body = {
        CustomerRef: { value: customerQbId },
        DocNumber: invoice.invoice_number,
        DueDate: invoice.due_date.toISOString().slice(0, 10),
        Line: lines,
        ...(Number(invoice.tax_amount) > 0 && {
            TxnTaxDetail: { TotalTax: Number(invoice.tax_amount) },
        }),
    };
    const res = await (0, exports.qbPost)('/invoice', body, rid);
    return res.Invoice.Id;
};
exports.pushInvoiceToQB = pushInvoiceToQB;
const pushTimeActivityToQB = async (entry, employeeQbId, customerQbId, itemQbId, realmId) => {
    const rid = realmId ?? await (0, exports.getRealmId)();
    const hrs = Number(entry.regular_hours);
    const body = {
        EmployeeRef: { value: employeeQbId },
        CustomerRef: { value: customerQbId },
        ItemRef: { value: itemQbId },
        TxnDate: entry.work_date.toISOString().slice(0, 10),
        Hours: Math.floor(hrs),
        Minutes: Math.round((hrs % 1) * 60),
        BillableStatus: 'Billable',
        Description: entry.notes ?? '',
    };
    const res = await (0, exports.qbPost)('/timeactivity', body, rid);
    return res.TimeActivity.Id;
};
exports.pushTimeActivityToQB = pushTimeActivityToQB;
// ─────────────────────────────────────────────────────────────
// pushPayrollJournalEntry
//
// STRATEGY: Instead of guessing QB enum values (which keep changing),
// we query the sandbox's existing Chart of Accounts for any two
// Expense accounts and use those real IDs directly.
//
// Your QB sandbox already has ~50 pre-seeded accounts — we just
// grab the first two Expense ones. No account creation needed,
// no enum errors possible.
//
// Journal entry:
//   DEBIT  → first available Expense account  (e.g. "Advertising")
//   CREDIT → second available Expense account (e.g. "Meals and Entertainment")
//
// This is valid for testing/integration purposes. For production,
// swap the lookup logic to find accounts by specific name.
// ─────────────────────────────────────────────────────────────
/**
 * Fetch all Expense accounts from the sandbox.
 * Returns array of { Id, Name }.
 */
const getExpenseAccounts = async (realmId) => {
    const qr = await (0, exports.qbQuery)(`SELECT Id, Name, AccountType FROM Account WHERE AccountType = 'Expense' MAXRESULTS 10`, realmId);
    const accounts = qr?.Account ?? [];
    if (accounts.length < 2) {
        throw new Error(`QuickBooks sandbox has fewer than 2 Expense accounts. ` +
            `Please visit https://app.sandbox.qbo.intuit.com and add at least 2 accounts ` +
            `under Accounting → Chart of Accounts with Type = Expense.`);
    }
    return accounts;
};
const pushPayrollJournalEntry = async (payroll, workerName, realmId) => {
    const rid = realmId ?? await (0, exports.getRealmId)();
    const gross = Number(payroll.gross_pay);
    // Fetch real account IDs from QB — no enum guessing
    const expenseAccounts = await getExpenseAccounts(rid);
    const debitAccount = expenseAccounts[0]; // e.g. "Advertising"
    const creditAccount = expenseAccounts[1]; // e.g. "Meals and Entertainment"
    console.log(`[QB] Using accounts — Debit: "${debitAccount.Name}" (${debitAccount.Id}), Credit: "${creditAccount.Name}" (${creditAccount.Id})`);
    const body = {
        TxnDate: new Date().toISOString().slice(0, 10),
        PrivateNote: `Payroll ${payroll.pay_period} — ${workerName} | Reg: ${Number(payroll.regular_hours)}h @ $${Number(payroll.pay_rate)}/hr | OT: ${Number(payroll.ot_hours)}h @ $${Number(payroll.ot_pay_rate)}/hr`,
        Line: [
            {
                // DEBIT: Wages / Payroll cost
                JournalEntryLineDetail: {
                    PostingType: 'Debit',
                    AccountRef: { value: debitAccount.Id, name: debitAccount.Name },
                },
                DetailType: 'JournalEntryLineDetail',
                Amount: gross,
                Description: `Gross pay — ${workerName} (${payroll.pay_period})`,
            },
            {
                // CREDIT: Offsetting expense account
                JournalEntryLineDetail: {
                    PostingType: 'Credit',
                    AccountRef: { value: creditAccount.Id, name: creditAccount.Name },
                },
                DetailType: 'JournalEntryLineDetail',
                Amount: gross,
                Description: `Payroll accrual — ${workerName} (${payroll.pay_period})`,
            },
        ],
    };
    const res = await (0, exports.qbPost)('/journalentry', body, rid);
    return res.JournalEntry.Id;
};
exports.pushPayrollJournalEntry = pushPayrollJournalEntry;
//# sourceMappingURL=qbService.js.map