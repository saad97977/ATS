/**
 * Send interview invitation email
 */
export declare const sendInterviewInvitationEmail: (interviewData: {
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
/**
 * Send interview reschedule email
 */
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
/**
 * Send interview rejection email
 */
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
/**
 * Send offer letter email
 */
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
/**
 * Send onboarding welcome email
 */
export declare const sendOnboardingWelcomeEmail: (data: {
    applicantEmail: string;
    applicantName: string;
    jobTitle: string;
    organizationName: string;
}) => Promise<{
    success: boolean;
    messageId?: string;
    error?: string;
}>;
/**
 * Verify email configuration
 */
export declare const verifyEmailConfiguration: () => Promise<boolean>;
declare const _default: {
    sendInterviewInvitationEmail: (interviewData: {
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
    }) => Promise<{
        success: boolean;
        messageId?: string;
        error?: string;
    }>;
    verifyEmailConfiguration: () => Promise<boolean>;
};
export default _default;
//# sourceMappingURL=emailService.d.ts.map