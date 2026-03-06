export interface QBTokens {
    access_token: string;
    refresh_token: string;
    realm_id: string;
    expires_at: Date;
}
export declare const getAuthorizationUrl: (state?: string) => string;
export declare const exchangeCodeForTokens: (code: string, realmId: string) => Promise<QBTokens>;
export declare const refreshAccessToken: (realmId: string) => Promise<string>;
export declare const getRealmId: () => Promise<string>;
export declare const qbPost: (endpoint: string, body: object, realmId?: string) => Promise<any>;
export declare const qbGet: (endpoint: string, realmId?: string) => Promise<any>;
export declare const qbQuery: (sql: string, realmId?: string) => Promise<any>;
export declare const findOrCreateCustomer: (displayName: string, realmId?: string) => Promise<string>;
export declare const findOrCreateEmployee: (displayName: string, realmId?: string) => Promise<string>;
export declare const findOrCreateServiceItem: (name: string, incomeAccountId?: string, realmId?: string) => Promise<string>;
export declare const pushInvoiceToQB: (invoice: {
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
}, customerQbId: string, realmId?: string) => Promise<string>;
export declare const pushTimeActivityToQB: (entry: {
    work_date: Date;
    regular_hours: any;
    notes?: string | null;
}, employeeQbId: string, customerQbId: string, itemQbId: string, realmId?: string) => Promise<string>;
export declare const pushPayrollJournalEntry: (payroll: {
    pay_period: string;
    regular_hours: any;
    ot_hours: any;
    pay_rate: any;
    ot_pay_rate: any;
    gross_pay: any;
    net_pay: any;
}, workerName: string, realmId?: string) => Promise<string>;
//# sourceMappingURL=qbService.d.ts.map