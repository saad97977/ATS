import { Request, Response } from 'express';
/**
 * Submit a job application with application-specific snapshots
 * POST /api/public/jobs/:jobId/apply
 *
 * OPTIMIZATIONS vs original:
 * - Pre-fetch job + applicant in parallel before transaction opens
 * - Duplicate application check done pre-transaction (no wasted tx time)
 * - Social profile upserts replaced with a single Promise.all inside tx
 * - Demographics upsert collapsed to one conditional call
 * - Cover letter + work history inserts batched via Promise.all
 * - Transaction timeout raised to 20s with maxWait 8s
 * - Final application fetch runs with only needed includes
 * - Resume upload fully outside transaction (unchanged from your version)
 */
export declare const submitApplication: (req: Request, res: Response) => Promise<void>;
/**
 * Upload resume for an existing application
 * POST /api/public/applications/:applicationId/upload-resume
 *
 * USE CASE:
 * - Applicant submitted application without resume
 * - Applicant wants to add/replace resume for a specific application
 *
 * FLOW:
 * 1. Verify application exists and belongs to the applicant (via email)
 * 2. Check if resume already exists (optional warning)
 * 3. Upload resume to Azure Blob Storage
 * 4. Create/update applicant document record
 * 5. Return success with file details
 */
export declare const uploadApplicationResume: (req: Request, res: Response) => Promise<void>;
/**
 * HELPER FUNCTION: Get application details with all snapshots
 *
 * This is the CORRECT way to retrieve an application for recruiter review.
 * It returns the exact data that was submitted, not the applicant's current profile.
 *
 * USAGE:
 * - Recruiter views application
 * - Application comparison
 * - Audit trail
 */
export declare const getApplicationDetails: (applicationId: string) => Promise<({
    job: {
        organization: {
            name: string;
            status: import(".prisma/client").$Enums.OrganizationStatus;
            created_at: Date;
            created_by_user_id: string;
            website: string | null;
            phone: string | null;
            organization_id: string;
            last_updated_at: Date | null;
        };
    } & {
        status: import(".prisma/client").$Enums.JobStatus;
        created_at: Date;
        created_by_user_id: string;
        organization_id: string;
        manager_id: string | null;
        job_title: string;
        job_type: import(".prisma/client").$Enums.JobType;
        location: string;
        days_active: number | null;
        days_inactive: number | null;
        approved: boolean;
        start_date: Date | null;
        end_date: Date | null;
        job_id: string;
        company_office_id: string | null;
        max_positions: number | null;
        open_positions: number | null;
        resume_required: boolean | null;
        interview_Round1: boolean | null;
        interview_Round2: boolean | null;
    };
    documents: {
        created_at: Date;
        document_type: string;
        applicant_id: string;
        file_url: string;
        application_id: string | null;
        applicant_document_id: string;
    }[];
    applicant: {
        contact: {
            email: string;
            phone: string;
            city: string | null;
            address: string | null;
            applicant_id: string;
            applicant_contact_id: string;
        } | null;
        demographic: {
            applicant_id: string;
            birth_date: Date | null;
            gender: string | null;
            race: string | null;
            disability: string | null;
            work_authorization: string | null;
            authorization_expiry: Date | null;
            applicant_demo_id: string;
        } | null;
        social_profiles: {
            applicant_id: string;
            profile_title: string;
            profile_link: string;
            applicant_social_profiles_id: string;
        }[];
    } & {
        status: import(".prisma/client").$Enums.ApplicantStatus;
        created_at: Date;
        full_name: string;
        last_active_at: Date | null;
        applicant_id: string;
        comp_code_last: string | null;
    };
    work_history: {
        created_at: Date;
        title: string;
        description: string | null;
        applicant_id: string;
        application_id: string | null;
        applicant_work_history_id: string;
    }[];
} & {
    status: import(".prisma/client").$Enums.ApplicationStatus;
    job_id: string;
    applicant_id: string;
    source: string | null;
    applied_at: Date;
    application_id: string;
}) | null>;
/**
 * View applicant's resume in browser (for in-app viewing)
 * GET /api/public/applications/:applicationId/resume/view
 *
 * KEY CHANGE: Fetches resume specific to this application
 */
export declare const viewApplicationResume: (req: Request, res: Response) => Promise<void>;
/**
 * View applicant's cover letter in browser (for in-app viewing)
 * GET /api/public/applications/:applicationId/coverletter/view
 *
 * Fetches cover letter specific to this application
 * Handles both text-based and file-based cover letters
 */
export declare const viewApplicationCoverLetter: (req: Request, res: Response) => Promise<void | Response<any, Record<string, any>>>;
/**
 *
 * Download applicant's resume
 * GET /api/public/applications/:applicationId/resume
 *
 * KEY CHANGE: Downloads resume specific to this application
 * Allows downloading resume for a specific application
 * Public endpoint for applicants to download their own resume
 */
export declare const downloadApplicationResume: (req: Request, res: Response) => Promise<void>;
/**
 * ADDITIONAL HELPER: Get applicant's latest resume (from master profile)
 *
 * This is useful for showing the applicant their current resume,
 * NOT for recruiter review (recruiters should use getApplicationDetails)
 */
export declare const getApplicantLatestResume: (applicantId: string) => Promise<{
    created_at: Date;
    document_type: string;
    applicant_id: string;
    file_url: string;
    application_id: string | null;
    applicant_document_id: string;
} | null>;
/**
 * Check if applicant has already applied to a job
 * GET /api/public/jobs/:jobId/check-application?email=xxx
 */
export declare const checkExistingApplication: (req: Request, res: Response) => Promise<void>;
/**
 * Get application status with resume download link
 * GET /api/public/applications/:applicationId
 *
 * Allows applicants to check their application status
 * Requires application ID (sent via email after applying)
 */
export declare const getApplicationStatus: (req: Request, res: Response) => Promise<void>;
/**
 * Withdraw application
 * DELETE /api/public/applications/:applicationId/withdraw
 *
 * Allows applicants to withdraw their application
 * Requires email verification for security
 */
export declare const withdrawApplication: (req: Request, res: Response) => Promise<void>;
/**
 * Get applicant's application history with resume info
 * GET /api/public/applicants/applications?email=xxx
 *
 * Returns all applications for an applicant by email
 */
export declare const getApplicantApplications: (req: Request, res: Response) => Promise<void>;
//# sourceMappingURL=publicApplicationsController.d.ts.map