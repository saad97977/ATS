// ─────────────────────────────────────────────────────────────
// services/qbService.ts
// Handles all QuickBooks OAuth 2.0 + API calls
// ─────────────────────────────────────────────────────────────

import prisma from '../prisma.config';

const QB_BASE =
  process.env.QB_ENVIRONMENT === 'production'
    ? 'https://quickbooks.api.intuit.com/v3/company'
    : 'https://sandbox-quickbooks.api.intuit.com/v3/company';

const QB_TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
const QB_AUTH_URL  = 'https://appcenter.intuit.com/connect/oauth2';

// ─── Types ───────────────────────────────────────────────────

export interface QBTokens {
  access_token:  string;
  refresh_token: string;
  realm_id:      string;
  expires_at:    Date;
}

// ─── OAuth Step 1: Build Authorization URL ───────────────────

export const getAuthorizationUrl = (state?: string): string => {
  const params = new URLSearchParams({
    client_id:     process.env.QB_CLIENT_ID!,
    redirect_uri:  process.env.QB_REDIRECT_URI!,
    response_type: 'code',
    scope:         'com.intuit.quickbooks.accounting',
    state:         state || 'qb_auth',
  });
  return `${QB_AUTH_URL}?${params.toString()}`;
};

// ─── OAuth Step 2: Exchange code for tokens ──────────────────

export const exchangeCodeForTokens = async (code: string, realmId: string): Promise<QBTokens> => {
  const credentials = Buffer.from(
    `${process.env.QB_CLIENT_ID}:${process.env.QB_CLIENT_SECRET}`
  ).toString('base64');

  const res = await fetch(QB_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization:  `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept:         'application/json',
    },
    body: new URLSearchParams({
      grant_type:   'authorization_code',
      code,
      redirect_uri: process.env.QB_REDIRECT_URI!,
    }),
  });

  const data = await res.json() as any;
  if (!res.ok) throw new Error(data.error_description || 'QB token exchange failed');

  const expiresAt = new Date(Date.now() + data.expires_in * 1000);

  // Persist tokens in DB (qb_tokens table or org-level setting)
  await saveTokens(realmId, data.access_token, data.refresh_token, expiresAt);

  return {
    access_token:  data.access_token,
    refresh_token: data.refresh_token,
    realm_id:      realmId,
    expires_at:    expiresAt,
  };
};

// ─── Refresh access token ─────────────────────────────────────

export const refreshAccessToken = async (realmId: string): Promise<string> => {
  const stored = await loadTokens(realmId);
  if (!stored) throw new Error('No QuickBooks tokens found. Please re-authorize.');

  // Still valid (with 5 min buffer)
  if (stored.expires_at && new Date(stored.expires_at) > new Date(Date.now() + 5 * 60 * 1000)) {
    return stored.access_token;
  }

  const credentials = Buffer.from(
    `${process.env.QB_CLIENT_ID}:${process.env.QB_CLIENT_SECRET}`
  ).toString('base64');

  const res = await fetch(QB_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization:  `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept:         'application/json',
    },
    body: new URLSearchParams({
      grant_type:    'refresh_token',
      refresh_token: stored.refresh_token,
    }),
  });

  const data = await res.json() as any;
  if (!res.ok) throw new Error(data.error_description || 'QB token refresh failed');

  const expiresAt = new Date(Date.now() + data.expires_in * 1000);
  await saveTokens(realmId, data.access_token, data.refresh_token, expiresAt);

  return data.access_token;
};

// ─── Token persistence (stored in app_settings table via JSON) ─

const SETTINGS_KEY = (realmId: string) => `qb_tokens_${realmId}`;

const saveTokens = async (
  realmId: string,
  accessToken: string,
  refreshToken: string,
  expiresAt: Date
): Promise<void> => {
  const value = JSON.stringify({ access_token: accessToken, refresh_token: refreshToken, expires_at: expiresAt, realm_id: realmId });
  // Upsert into a simple key-value store or app_settings.
  // Using a raw upsert on a lightweight table:
  await (prisma as any).qBTokenStore.upsert({
    where:  { realm_id: realmId },
    update: { access_token: accessToken, refresh_token: refreshToken, expires_at: expiresAt },
    create: { realm_id: realmId, access_token: accessToken, refresh_token: refreshToken, expires_at: expiresAt },
  }).catch(async () => {
    // Fallback: store as serialized env or log warning if table doesn't exist yet
    console.warn('[QB] qBTokenStore table not found — tokens stored in memory only. Run the migration to persist them.');
    inMemoryTokens[realmId] = { access_token: accessToken, refresh_token: refreshToken, expires_at: expiresAt, realm_id: realmId };
  });
};

// In-memory fallback for tokens (used if DB table isn't migrated yet)
const inMemoryTokens: Record<string, { access_token: string; refresh_token: string; expires_at: Date; realm_id: string }> = {};

const loadTokens = async (realmId: string): Promise<{ access_token: string; refresh_token: string; expires_at: Date } | null> => {
  try {
    const row = await (prisma as any).qBTokenStore.findUnique({ where: { realm_id: realmId } });
    return row ?? null;
  } catch {
    return inMemoryTokens[realmId] ?? null;
  }
};

// ─── Core API helpers ─────────────────────────────────────────

/**
 * Returns the realmId from the first stored token record.
 * In a multi-company setup, pass realmId explicitly.
 */
export const getRealmId = async (): Promise<string> => {
  try {
    const row = await (prisma as any).qBTokenStore.findFirst({ orderBy: { realm_id: 'asc' } });
    if (row) return row.realm_id;
  } catch { /* no table yet */ }
  const keys = Object.keys(inMemoryTokens);
  if (keys.length) return keys[0];
  throw new Error('No QuickBooks company connected. Authorize at /api/payroll/quickbooks/connect');
};

export const qbPost = async (endpoint: string, body: object, realmId?: string): Promise<any> => {
  const rid   = realmId ?? await getRealmId();
  const token = await refreshAccessToken(rid);
  const res   = await fetch(`${QB_BASE}/${rid}${endpoint}?minorversion=70`, {
    method: 'POST',
    headers: {
      Authorization:  `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept:         'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = await res.json() as any;
  if (!res.ok) {
    const msg = data?.Fault?.Error?.[0]?.Detail ?? data?.Fault?.Error?.[0]?.Message ?? JSON.stringify(data);
    throw new Error(`QB API error on ${endpoint}: ${msg}`);
  }
  return data;
};

export const qbGet = async (endpoint: string, realmId?: string): Promise<any> => {
  const rid   = realmId ?? await getRealmId();
  const token = await refreshAccessToken(rid);
  const res   = await fetch(`${QB_BASE}/${rid}${endpoint}?minorversion=70`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept:        'application/json',
    },
  });
  const data = await res.json() as any;
  if (!res.ok) {
    const msg = data?.Fault?.Error?.[0]?.Detail ?? JSON.stringify(data);
    throw new Error(`QB GET error on ${endpoint}: ${msg}`);
  }
  return data;
};

export const qbQuery = async (sql: string, realmId?: string): Promise<any> => {
  const rid   = realmId ?? await getRealmId();
  const token = await refreshAccessToken(rid);
  const url   = `${QB_BASE}/${rid}/query?query=${encodeURIComponent(sql)}&minorversion=70`;
  const res   = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  const data = await res.json() as any;
  if (!res.ok) {
    const msg = data?.Fault?.Error?.[0]?.Detail ?? JSON.stringify(data);
    throw new Error(`QB query error: ${msg}`);
  }
  return data?.QueryResponse;
};

// ─── Domain helpers ───────────────────────────────────────────

/**
 * Find or create a QB Customer by display name.
 * Returns the QB Customer.Id
 */
export const findOrCreateCustomer = async (displayName: string, realmId?: string): Promise<string> => {
  const rid = realmId ?? await getRealmId();
  const qr  = await qbQuery(`SELECT * FROM Customer WHERE DisplayName = '${displayName.replace(/'/g, "\\'")}'`, rid);
  if (qr?.Customer?.length) return qr.Customer[0].Id;

  const res = await qbPost('/customer', { DisplayName: displayName }, rid);
  return res.Customer.Id;
};

/**
 * Find or create a QB Employee by display name.
 * Returns the QB Employee.Id
 */
export const findOrCreateEmployee = async (displayName: string, realmId?: string): Promise<string> => {
  const rid = realmId ?? await getRealmId();
  const qr  = await qbQuery(`SELECT * FROM Employee WHERE DisplayName = '${displayName.replace(/'/g, "\\'")}'`, rid);
  if (qr?.Employee?.length) return qr.Employee[0].Id;

  const res = await qbPost('/employee', { DisplayName: displayName }, rid);
  return res.Employee.Id;
};

/**
 * Find or create a QB Item (service item for invoicing).
 */
export const findOrCreateServiceItem = async (name: string, incomeAccountId = '1', realmId?: string): Promise<string> => {
  const rid = realmId ?? await getRealmId();
  const qr  = await qbQuery(`SELECT * FROM Item WHERE Name = '${name.replace(/'/g, "\\'")}'`, rid);
  if (qr?.Item?.length) return qr.Item[0].Id;

  const res = await qbPost('/item', {
    Name:        name,
    Type:        'Service',
    IncomeAccountRef: { value: incomeAccountId },
  }, rid);
  return res.Item.Id;
};

/**
 * Push an Invoice row to QB.
 * Returns the QB Invoice.Id
 */
export const pushInvoiceToQB = async (
  invoice: {
    invoice_id: string;
    invoice_number: string;
    regular_hours: any;
    ot_hours: any;
    bill_rate: any;
    ot_bill_rate: any;
    subtotal: any;
    tax_amount: any;
    total_amount: any;
    due_date: Date;
  },
  customerQbId: string,
  realmId?: string
): Promise<string> => {
  const rid          = realmId ?? await getRealmId();
  const regItemId    = await findOrCreateServiceItem('Regular Hours', '1', rid);
  const otItemId     = await findOrCreateServiceItem('Overtime Hours', '1', rid);

  const lines: any[] = [
    {
      Amount:     Number(invoice.bill_rate) * Number(invoice.regular_hours),
      DetailType: 'SalesItemLineDetail',
      SalesItemLineDetail: {
        ItemRef:    { value: regItemId },
        Qty:        Number(invoice.regular_hours),
        UnitPrice:  Number(invoice.bill_rate),
      },
    },
  ];

  if (Number(invoice.ot_hours) > 0) {
    lines.push({
      Amount:     Number(invoice.ot_bill_rate ?? 0) * Number(invoice.ot_hours),
      DetailType: 'SalesItemLineDetail',
      SalesItemLineDetail: {
        ItemRef:    { value: otItemId },
        Qty:        Number(invoice.ot_hours),
        UnitPrice:  Number(invoice.ot_bill_rate ?? 0),
      },
    });
  }

  const body = {
    CustomerRef:  { value: customerQbId },
    DocNumber:    invoice.invoice_number,
    DueDate:      invoice.due_date.toISOString().slice(0, 10),
    Line: lines,
    ...(Number(invoice.tax_amount) > 0 && {
      TxnTaxDetail: { TotalTax: Number(invoice.tax_amount) },
    }),
  };

  const res = await qbPost('/invoice', body, rid);
  return res.Invoice.Id;
};

/**
 * Push a TimeActivity (per day) to QB Timesheets.
 * Returns the QB TimeActivity.Id
 */
export const pushTimeActivityToQB = async (
  entry: { work_date: Date; regular_hours: any; notes?: string | null },
  employeeQbId: string,
  customerQbId: string,
  itemQbId: string,
  realmId?: string
): Promise<string> => {
  const rid  = realmId ?? await getRealmId();
  const hrs  = Number(entry.regular_hours);
  const body = {
    EmployeeRef:  { value: employeeQbId },
    CustomerRef:  { value: customerQbId },
    ItemRef:      { value: itemQbId },
    TxnDate:      entry.work_date.toISOString().slice(0, 10),
    Hours:        Math.floor(hrs),
    Minutes:      Math.round((hrs % 1) * 60),
    BillableStatus: 'Billable',
    Description:  entry.notes ?? '',
  };
  const res = await qbPost('/timeactivity', body, rid);
  return res.TimeActivity.Id;
};

/**
 * Push a JournalEntry for payroll to QB.
 * Returns the QB JournalEntry.Id
 */
export const pushPayrollJournalEntry = async (
  payroll: {
    pay_period: string;
    regular_hours: any;
    ot_hours: any;
    pay_rate: any;
    ot_pay_rate: any;
    gross_pay: any;
    net_pay: any;
  },
  workerName: string,
  realmId?: string
): Promise<string> => {
  const rid = realmId ?? await getRealmId();
  const gross = Number(payroll.gross_pay);

  const body = {
    TxnDate:  new Date().toISOString().slice(0, 10),
    PrivateNote: `Payroll ${payroll.pay_period} — ${workerName} | Reg: ${Number(payroll.regular_hours)}h @ $${Number(payroll.pay_rate)} | OT: ${Number(payroll.ot_hours)}h @ $${Number(payroll.ot_pay_rate)}`,
    Line: [
      // Debit: Wages Expense
      {
        JournalEntryLineDetail: {
          PostingType: 'Debit',
          AccountRef:  { name: 'Salaries & Wages' },
        },
        DetailType: 'JournalEntryLineDetail',
        Amount:     gross,
        Description: `Gross pay — ${workerName} (${payroll.pay_period})`,
      },
      // Credit: Accounts Payable / Accrued Payroll
      {
        JournalEntryLineDetail: {
          PostingType: 'Credit',
          AccountRef:  { name: 'Accounts Payable (A/P)' },
        },
        DetailType: 'JournalEntryLineDetail',
        Amount:     gross,
        Description: `Payroll payable — ${workerName} (${payroll.pay_period})`,
      },
    ],
  };

  const res = await qbPost('/journalentry', body, rid);
  return res.JournalEntry.Id;
};