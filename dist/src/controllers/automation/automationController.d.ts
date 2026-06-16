import { Request, Response } from 'express';
export declare const TRIGGER_EVENT_META: Record<string, {
    label: string;
    description: string;
    audience: 'APPLICANT' | 'STAFF' | 'BOTH';
}>;
export declare const ALL_TRIGGER_EVENTS: string[];
export declare const shouldSendEmail: (triggerEvent: string, applicantId: string, job: {
    withhold_emails?: boolean | null;
}) => Promise<boolean>;
export declare const getAllRules: (_req: Request, res: Response) => Promise<void>;
export declare const updateRule: (req: Request, res: Response) => Promise<void>;
export declare const bulkUpdateRules: (req: Request, res: Response) => Promise<void>;
export declare const getApplicantPreferences: (req: Request, res: Response) => Promise<void>;
export declare const suppressApplicantEmail: (req: Request, res: Response) => Promise<void>;
export declare const unsuppressApplicantEmail: (req: Request, res: Response) => Promise<void>;
export declare const bulkUpdateApplicantPreferences: (req: Request, res: Response) => Promise<void>;
export declare const emailAutomationController: {
    getAllRules: (_req: Request, res: Response) => Promise<void>;
    updateRule: (req: Request, res: Response) => Promise<void>;
    bulkUpdateRules: (req: Request, res: Response) => Promise<void>;
    getApplicantPreferences: (req: Request, res: Response) => Promise<void>;
    suppressApplicantEmail: (req: Request, res: Response) => Promise<void>;
    unsuppressApplicantEmail: (req: Request, res: Response) => Promise<void>;
    bulkUpdateApplicantPreferences: (req: Request, res: Response) => Promise<void>;
    shouldSendEmail: (triggerEvent: string, applicantId: string, job: {
        withhold_emails?: boolean | null;
    }) => Promise<boolean>;
};
//# sourceMappingURL=automationController.d.ts.map