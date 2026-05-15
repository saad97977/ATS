import { Request, Response } from 'express';
type CommType = 'EMAIL' | 'CALL' | 'SMS' | 'NOTE';
type CommDirection = 'OUTBOUND' | 'INBOUND';
type CommTrigger = 'MANUAL' | 'AUTOMATIC';
type CommStatus = 'SENT' | 'FAILED' | 'LOGGED' | 'DRAFT';
type CallOutcome = 'ANSWERED' | 'NO_ANSWER' | 'VOICEMAIL' | 'BUSY';
export declare const listCommunications: (req: Request, res: Response) => Promise<void>;
export declare const getCommunicationStats: (req: Request, res: Response) => Promise<void>;
export declare const sendManualEmail: (req: Request, res: Response) => Promise<void>;
export declare const logCallRecord: (req: Request, res: Response) => Promise<void>;
export declare const logNote: (req: Request, res: Response) => Promise<void>;
export declare const getCommunicationById: (req: Request, res: Response) => Promise<void>;
export declare const updateCommunicationLog: (req: Request, res: Response) => Promise<void>;
export declare const deleteCommunicationLog: (req: Request, res: Response) => Promise<void>;
export interface AutoCommPayload {
    applicant_id: string;
    communication_type: CommType;
    direction?: CommDirection;
    trigger: CommTrigger;
    status: CommStatus;
    subject?: string;
    body?: string;
    from_address?: string;
    to_address?: string;
    email_message_id?: string;
    call_duration_minutes?: number;
    call_outcome?: CallOutcome;
    notes?: string;
    sent_by_user_id?: string;
    application_id?: string;
    metadata?: Record<string, unknown>;
}
export declare const logApplicantCommunication: (payload: AutoCommPayload) => Promise<void>;
export {};
//# sourceMappingURL=applicantCommunicationController.d.ts.map