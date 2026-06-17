export declare const sendInterviewInvitationEmail: (data: {
    applicantEmail: string;
    applicantName: string;
    jobTitle: string;
    organizationName: string;
    organizationWebsite?: string;
    interviewDate: Date;
    location: string;
    contactEmail?: string;
    contactPhone?: string;
    round?: number;
    totalRounds?: number;
    interviewType?: "ONLINE" | "OFFLINE";
}) => Promise<{
    success: boolean;
    messageId?: string;
    error?: string;
}>;
export declare const sendInterviewRescheduleEmail: (data: {
    applicantEmail: string;
    applicantName: string;
    jobTitle: string;
    organizationName: string;
    oldDate: Date;
    newDate: Date;
    location: string;
}) => Promise<{
    success: boolean;
    messageId?: string;
    error?: string;
}>;
export declare const sendInterviewRejectionEmail: (data: {
    applicantEmail: string;
    applicantName: string;
    jobTitle: string;
    organizationName: string;
}) => Promise<{
    success: boolean;
    messageId?: string;
    error?: string;
}>;
export declare const sendOfferLetterEmail: (data: {
    applicantEmail: string;
    applicantName: string;
    jobTitle: string;
    organizationName: string;
}) => Promise<{
    success: boolean;
    messageId?: string;
    error?: string;
}>;
export declare const verifyEmailConfiguration: () => Promise<boolean>;
interface EmailAttachment {
    filename: string;
    content: Buffer;
    contentType: string;
}
export declare const sendOnboardingWelcomeEmail: (data: {
    applicantEmail: string;
    applicantName: string;
    jobTitle: string;
    organizationName: string;
    startDate: Date;
    endDate?: Date | null;
    employmentType: string;
    workersCompCodes?: Array<{
        code: string;
        description?: string;
        pct: number;
    }>;
    uploadedDocuments?: Array<{
        document_name: string;
        document_type: string;
        send_to_candidate?: boolean;
    }>;
    attachments?: EmailAttachment[];
}) => Promise<{
    success: boolean;
    messageId?: string;
    error?: string;
}>;
export declare const sendAssignmentNotificationEmail: (data: {
    recipientEmail: string;
    recipientName: string;
    role: string;
    applicantName: string;
    applicantEmail: string;
    jobTitle: string;
    organizationName: string;
    startDate: Date;
    endDate?: Date | null;
    employmentType: string;
    companyCodes: Array<{
        code: string;
        description?: string;
        allocation_pct: number;
    }>;
    uploadedDocuments: Array<{
        document_name: string;
        document_type: string;
        send_to_candidate?: boolean;
    }>;
    attachments?: EmailAttachment[];
}) => Promise<{
    success: boolean;
    messageId?: string;
    error?: string;
}>;
export declare const sendDocumentExpiryReminderEmail: (data: {
    recipientEmail: string;
    recipientName: string;
    documentName: string;
    documentType: string;
    documentTitle: string;
    organizationName: string;
    expirationDate: Date;
    expirationReason?: string | null;
    daysLeft: number;
}) => Promise<{
    success: boolean;
    messageId?: string;
    error?: string;
}>;
export declare const sendNewApplicationEmail: (data: {
    managerEmail: string;
    managerName: string;
    applicantName: string;
    applicantEmail: string;
    jobTitle: string;
    organizationName: string;
    applicationId: string;
}) => Promise<{
    success: boolean;
    messageId?: string;
    error?: string;
}>;
export declare const sendCustomStageEmail: ({ to, subject, body, }: {
    to: string;
    subject: string;
    body: string;
}) => Promise<{
    success: boolean;
    messageId: string;
    error?: undefined;
} | {
    success: boolean;
    error: any;
    messageId?: undefined;
}>;
declare const _default: {
    sendInterviewInvitationEmail: (data: {
        applicantEmail: string;
        applicantName: string;
        jobTitle: string;
        organizationName: string;
        organizationWebsite?: string;
        interviewDate: Date;
        location: string;
        contactEmail?: string;
        contactPhone?: string;
        round?: number;
        totalRounds?: number;
        interviewType?: "ONLINE" | "OFFLINE";
    }) => Promise<{
        success: boolean;
        messageId?: string;
        error?: string;
    }>;
    sendInterviewRescheduleEmail: (data: {
        applicantEmail: string;
        applicantName: string;
        jobTitle: string;
        organizationName: string;
        oldDate: Date;
        newDate: Date;
        location: string;
    }) => Promise<{
        success: boolean;
        messageId?: string;
        error?: string;
    }>;
    sendInterviewRejectionEmail: (data: {
        applicantEmail: string;
        applicantName: string;
        jobTitle: string;
        organizationName: string;
    }) => Promise<{
        success: boolean;
        messageId?: string;
        error?: string;
    }>;
    sendCustomStageEmail: ({ to, subject, body, }: {
        to: string;
        subject: string;
        body: string;
    }) => Promise<{
        success: boolean;
        messageId: string;
        error?: undefined;
    } | {
        success: boolean;
        error: any;
        messageId?: undefined;
    }>;
    sendOfferLetterEmail: (data: {
        applicantEmail: string;
        applicantName: string;
        jobTitle: string;
        organizationName: string;
    }) => Promise<{
        success: boolean;
        messageId?: string;
        error?: string;
    }>;
    sendOnboardingWelcomeEmail: (data: {
        applicantEmail: string;
        applicantName: string;
        jobTitle: string;
        organizationName: string;
        startDate: Date;
        endDate?: Date | null;
        employmentType: string;
        workersCompCodes?: Array<{
            code: string;
            description?: string;
            pct: number;
        }>;
        uploadedDocuments?: Array<{
            document_name: string;
            document_type: string;
            send_to_candidate?: boolean;
        }>;
        attachments?: EmailAttachment[];
    }) => Promise<{
        success: boolean;
        messageId?: string;
        error?: string;
    }>;
    sendAssignmentNotificationEmail: (data: {
        recipientEmail: string;
        recipientName: string;
        role: string;
        applicantName: string;
        applicantEmail: string;
        jobTitle: string;
        organizationName: string;
        startDate: Date;
        endDate?: Date | null;
        employmentType: string;
        companyCodes: Array<{
            code: string;
            description?: string;
            allocation_pct: number;
        }>;
        uploadedDocuments: Array<{
            document_name: string;
            document_type: string;
            send_to_candidate?: boolean;
        }>;
        attachments?: EmailAttachment[];
    }) => Promise<{
        success: boolean;
        messageId?: string;
        error?: string;
    }>;
    sendDocumentExpiryReminderEmail: (data: {
        recipientEmail: string;
        recipientName: string;
        documentName: string;
        documentType: string;
        documentTitle: string;
        organizationName: string;
        expirationDate: Date;
        expirationReason?: string | null;
        daysLeft: number;
    }) => Promise<{
        success: boolean;
        messageId?: string;
        error?: string;
    }>;
    sendNewApplicationEmail: (data: {
        managerEmail: string;
        managerName: string;
        applicantName: string;
        applicantEmail: string;
        jobTitle: string;
        organizationName: string;
        applicationId: string;
    }) => Promise<{
        success: boolean;
        messageId?: string;
        error?: string;
    }>;
    verifyEmailConfiguration: () => Promise<boolean>;
};
export default _default;
//# sourceMappingURL=emailService.d.ts.map