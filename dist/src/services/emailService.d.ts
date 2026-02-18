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
export declare const sendOnboardingWelcomeEmail: (data: {
    applicantEmail: string;
    applicantName: string;
    jobTitle: string;
    organizationName: string;
    startDate: Date;
    endDate?: Date | null;
    employmentType: string;
    workersCompCode?: string | null;
}) => Promise<{
    success: boolean;
    messageId?: string;
    error?: string;
}>;
export declare const verifyEmailConfiguration: () => Promise<boolean>;
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
        workersCompCode?: string | null;
    }) => Promise<{
        success: boolean;
        messageId?: string;
        error?: string;
    }>;
    verifyEmailConfiguration: () => Promise<boolean>;
};
export default _default;
//# sourceMappingURL=emailService.d.ts.map