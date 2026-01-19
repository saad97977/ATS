import { z } from 'zod';
/**
 * Zod Schemas for ATS Models
 * All schemas based on prisma.schema file
 * Provides validation and serialization for request/response data
 */
export declare const createOrganizationSchema: z.ZodObject<{
    name: z.ZodString;
    created_by_user_id: z.ZodString;
    website: z.ZodOptional<z.ZodString>;
    status: z.ZodDefault<z.ZodEnum<{
        ACTIVE: "ACTIVE";
        INACTIVE: "INACTIVE";
    }>>;
    phone: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
export declare const updateOrganizationSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    created_by_user_id: z.ZodOptional<z.ZodString>;
    website: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    status: z.ZodOptional<z.ZodDefault<z.ZodEnum<{
        ACTIVE: "ACTIVE";
        INACTIVE: "INACTIVE";
    }>>>;
    phone: z.ZodOptional<z.ZodOptional<z.ZodString>>;
}, z.core.$strict>;
export declare const createOrganizationAddressSchema: z.ZodObject<{
    organization_id: z.ZodString;
    address_type: z.ZodEnum<{
        WORKSITE: "WORKSITE";
        BILLING: "BILLING";
    }>;
    address1: z.ZodString;
    address2: z.ZodOptional<z.ZodString>;
    city: z.ZodString;
    state: z.ZodString;
    zip: z.ZodString;
    phone: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
export declare const updateOrganizationAddressSchema: z.ZodObject<{
    organization_id: z.ZodOptional<z.ZodString>;
    address_type: z.ZodOptional<z.ZodEnum<{
        WORKSITE: "WORKSITE";
        BILLING: "BILLING";
    }>>;
    address1: z.ZodOptional<z.ZodString>;
    address2: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    city: z.ZodOptional<z.ZodString>;
    state: z.ZodOptional<z.ZodString>;
    zip: z.ZodOptional<z.ZodString>;
    phone: z.ZodOptional<z.ZodOptional<z.ZodString>>;
}, z.core.$strict>;
export declare const createOrganizationContactSchema: z.ZodObject<{
    organization_id: z.ZodString;
    name: z.ZodString;
    email: z.ZodString;
    phone: z.ZodString;
    contact_type: z.ZodEnum<{
        PRIMARY: "PRIMARY";
        EMERGENCY: "EMERGENCY";
    }>;
}, z.core.$strict>;
export declare const updateOrganizationContactSchema: z.ZodObject<{
    organization_id: z.ZodOptional<z.ZodString>;
    name: z.ZodOptional<z.ZodString>;
    email: z.ZodOptional<z.ZodString>;
    phone: z.ZodOptional<z.ZodString>;
    contact_type: z.ZodOptional<z.ZodEnum<{
        PRIMARY: "PRIMARY";
        EMERGENCY: "EMERGENCY";
    }>>;
}, z.core.$strict>;
export declare const createOrganizationLicenseSchema: z.ZodObject<{
    organization_id: z.ZodString;
    license_name: z.ZodString;
    license_document: z.ZodString;
    expiration_date: z.ZodOptional<z.ZodPipe<z.ZodString, z.ZodTransform<Date, string>>>;
}, z.core.$strict>;
export declare const updateOrganizationLicenseSchema: z.ZodObject<{
    organization_id: z.ZodOptional<z.ZodString>;
    license_name: z.ZodOptional<z.ZodString>;
    license_document: z.ZodOptional<z.ZodString>;
    expiration_date: z.ZodOptional<z.ZodOptional<z.ZodPipe<z.ZodString, z.ZodTransform<Date, string>>>>;
}, z.core.$strict>;
export declare const createOrganizationAccountingSchema: z.ZodObject<{
    organization_id: z.ZodString;
    account_type: z.ZodString;
    bank_name: z.ZodString;
    account_number: z.ZodString;
    routing_number: z.ZodString;
    country: z.ZodString;
}, z.core.$strict>;
export declare const updateOrganizationAccountingSchema: z.ZodObject<{
    organization_id: z.ZodOptional<z.ZodString>;
    account_type: z.ZodOptional<z.ZodString>;
    bank_name: z.ZodOptional<z.ZodString>;
    account_number: z.ZodOptional<z.ZodString>;
    routing_number: z.ZodOptional<z.ZodString>;
    country: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
export declare const createOrganizationUserSchema: z.ZodObject<{
    organization_id: z.ZodString;
    user_id: z.ZodString;
    division: z.ZodOptional<z.ZodString>;
    department: z.ZodOptional<z.ZodString>;
    title: z.ZodOptional<z.ZodString>;
    work_phone: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
export declare const updateOrganizationUserSchema: z.ZodObject<{
    organization_id: z.ZodOptional<z.ZodString>;
    user_id: z.ZodOptional<z.ZodString>;
    division: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    department: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    title: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    work_phone: z.ZodOptional<z.ZodOptional<z.ZodString>>;
}, z.core.$strict>;
export declare const createOrganizationDocumentTitleSchema: z.ZodObject<{
    organization_id: z.ZodString;
    document_title: z.ZodString;
}, z.core.$strict>;
export declare const updateOrganizationDocumentTitleSchema: z.ZodObject<{
    organization_id: z.ZodOptional<z.ZodString>;
    document_title: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
export declare const createOrganizationDocumentSchema: z.ZodObject<{
    document_title_id: z.ZodString;
    organization_id: z.ZodString;
    document_type: z.ZodString;
    document_name: z.ZodString;
    user_id: z.ZodString;
    file: z.ZodString;
    privacy: z.ZodEnum<{
        PUBLIC: "PUBLIC";
        PRIVATE: "PRIVATE";
    }>;
    expiration_date: z.ZodOptional<z.ZodPipe<z.ZodString, z.ZodTransform<Date, string>>>;
}, z.core.$strict>;
export declare const updateOrganizationDocumentSchema: z.ZodObject<{
    document_title_id: z.ZodOptional<z.ZodString>;
    organization_id: z.ZodOptional<z.ZodString>;
    document_type: z.ZodOptional<z.ZodString>;
    document_name: z.ZodOptional<z.ZodString>;
    user_id: z.ZodOptional<z.ZodString>;
    file: z.ZodOptional<z.ZodString>;
    privacy: z.ZodOptional<z.ZodEnum<{
        PUBLIC: "PUBLIC";
        PRIVATE: "PRIVATE";
    }>>;
    expiration_date: z.ZodOptional<z.ZodOptional<z.ZodPipe<z.ZodString, z.ZodTransform<Date, string>>>>;
}, z.core.$strict>;
export declare const createCompanyOfficeSchema: z.ZodObject<{
    organization_id: z.ZodString;
    office_name: z.ZodString;
    city: z.ZodString;
    state: z.ZodString;
    country: z.ZodString;
    type: z.ZodEnum<{
        REMOTE: "REMOTE";
        HYBRID: "HYBRID";
        ONSITE: "ONSITE";
    }>;
    address: z.ZodString;
    is_primary: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strict>;
export declare const updateCompanyOfficeSchema: z.ZodObject<{
    organization_id: z.ZodOptional<z.ZodString>;
    office_name: z.ZodOptional<z.ZodString>;
    city: z.ZodOptional<z.ZodString>;
    state: z.ZodOptional<z.ZodString>;
    country: z.ZodOptional<z.ZodString>;
    type: z.ZodOptional<z.ZodEnum<{
        REMOTE: "REMOTE";
        HYBRID: "HYBRID";
        ONSITE: "ONSITE";
    }>>;
    address: z.ZodOptional<z.ZodString>;
    is_primary: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
}, z.core.$strict>;
export declare const createJobSchema: z.ZodObject<{
    organization_id: z.ZodString;
    created_by_user_id: z.ZodString;
    manager_id: z.ZodOptional<z.ZodString>;
    job_title: z.ZodString;
    status: z.ZodDefault<z.ZodEnum<{
        DRAFT: "DRAFT";
        OPEN: "OPEN";
        CLOSED: "CLOSED";
    }>>;
    job_type: z.ZodEnum<{
        TEMPORARY: "TEMPORARY";
        PERMANENT: "PERMANENT";
    }>;
    location: z.ZodString;
    days_active: z.ZodOptional<z.ZodNumber>;
    days_inactive: z.ZodOptional<z.ZodNumber>;
    approved: z.ZodDefault<z.ZodBoolean>;
    start_date: z.ZodOptional<z.ZodPipe<z.ZodString, z.ZodTransform<Date, string>>>;
    end_date: z.ZodOptional<z.ZodPipe<z.ZodString, z.ZodTransform<Date, string>>>;
}, z.core.$strict>;
export declare const updateJobSchema: z.ZodObject<{
    organization_id: z.ZodOptional<z.ZodString>;
    created_by_user_id: z.ZodOptional<z.ZodString>;
    manager_id: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    job_title: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodDefault<z.ZodEnum<{
        DRAFT: "DRAFT";
        OPEN: "OPEN";
        CLOSED: "CLOSED";
    }>>>;
    job_type: z.ZodOptional<z.ZodEnum<{
        TEMPORARY: "TEMPORARY";
        PERMANENT: "PERMANENT";
    }>>;
    location: z.ZodOptional<z.ZodString>;
    days_active: z.ZodOptional<z.ZodOptional<z.ZodNumber>>;
    days_inactive: z.ZodOptional<z.ZodOptional<z.ZodNumber>>;
    approved: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    start_date: z.ZodOptional<z.ZodOptional<z.ZodPipe<z.ZodString, z.ZodTransform<Date, string>>>>;
    end_date: z.ZodOptional<z.ZodOptional<z.ZodPipe<z.ZodString, z.ZodTransform<Date, string>>>>;
}, z.core.$strict>;
export declare const createJobDetailSchema: z.ZodObject<{
    job_id: z.ZodString;
    description: z.ZodString;
    skills: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
}, z.core.$strict>;
export declare const updateJobDetailSchema: z.ZodObject<{
    job_id: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodString>;
    skills: z.ZodOptional<z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>>;
}, z.core.$strict>;
export declare const createJobOwnerSchema: z.ZodObject<{
    job_id: z.ZodString;
    user_id: z.ZodString;
    role_type: z.ZodEnum<{
        SALES: "SALES";
        RECRUITER: "RECRUITER";
    }>;
}, z.core.$strict>;
export declare const updateJobOwnerSchema: z.ZodObject<{
    job_id: z.ZodOptional<z.ZodString>;
    user_id: z.ZodOptional<z.ZodString>;
    role_type: z.ZodOptional<z.ZodEnum<{
        SALES: "SALES";
        RECRUITER: "RECRUITER";
    }>>;
}, z.core.$strict>;
export declare const createJobNoteSchema: z.ZodObject<{
    job_id: z.ZodString;
    note: z.ZodString;
}, z.core.$strict>;
export declare const updateJobNoteSchema: z.ZodObject<{
    job_id: z.ZodOptional<z.ZodString>;
    note: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
export declare const createJobPostingSchema: z.ZodObject<{
    job_id: z.ZodString;
    channel: z.ZodString;
    external_posting_id: z.ZodString;
    status: z.ZodString;
}, z.core.$strict>;
export declare const updateJobPostingSchema: z.ZodObject<{
    job_id: z.ZodOptional<z.ZodString>;
    channel: z.ZodOptional<z.ZodString>;
    external_posting_id: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
export declare const createJobRateSchema: z.ZodObject<{
    job_id: z.ZodString;
    pay_rate: z.ZodOptional<z.ZodNumber>;
    bill_rate: z.ZodNumber;
    markup_percentage: z.ZodOptional<z.ZodNumber>;
    overtime_rule: z.ZodOptional<z.ZodString>;
    hours: z.ZodNumber;
    ot_pay_rate: z.ZodOptional<z.ZodNumber>;
    ot_bill_rate: z.ZodOptional<z.ZodNumber>;
}, z.core.$strict>;
export declare const updateJobRateSchema: z.ZodObject<{
    job_id: z.ZodOptional<z.ZodString>;
    pay_rate: z.ZodOptional<z.ZodOptional<z.ZodNumber>>;
    bill_rate: z.ZodOptional<z.ZodNumber>;
    markup_percentage: z.ZodOptional<z.ZodOptional<z.ZodNumber>>;
    overtime_rule: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    hours: z.ZodOptional<z.ZodNumber>;
    ot_pay_rate: z.ZodOptional<z.ZodOptional<z.ZodNumber>>;
    ot_bill_rate: z.ZodOptional<z.ZodOptional<z.ZodNumber>>;
}, z.core.$strict>;
export declare const createContractSchema: z.ZodObject<{
    organization_id: z.ZodString;
    user_id: z.ZodString;
    contract_name: z.ZodString;
    status: z.ZodString;
    is_organization_contractor: z.ZodBoolean;
    sent_status: z.ZodOptional<z.ZodString>;
    signed_status: z.ZodOptional<z.ZodString>;
    signed_at: z.ZodOptional<z.ZodPipe<z.ZodString, z.ZodTransform<Date, string>>>;
}, z.core.$strict>;
export declare const updateContractSchema: z.ZodObject<{
    organization_id: z.ZodOptional<z.ZodString>;
    user_id: z.ZodOptional<z.ZodString>;
    contract_name: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodString>;
    is_organization_contractor: z.ZodOptional<z.ZodBoolean>;
    sent_status: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    signed_status: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    signed_at: z.ZodOptional<z.ZodOptional<z.ZodPipe<z.ZodString, z.ZodTransform<Date, string>>>>;
}, z.core.$strict>;
export declare const createUserSchema: z.ZodObject<{
    name: z.ZodString;
    email: z.ZodString;
    password_hash: z.ZodString;
    status: z.ZodDefault<z.ZodEnum<{
        ACTIVE: "ACTIVE";
        INACTIVE: "INACTIVE";
    }>>;
    is_admin: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strict>;
export declare const updateUserSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    password_hash: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodEnum<{
        ACTIVE: "ACTIVE";
        INACTIVE: "INACTIVE";
    }>>;
    is_admin: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strict>;
export declare const createRoleSchema: z.ZodObject<{
    role_name: z.ZodEnum<{
        HCM_USER: "HCM_USER";
        MANAGER: "MANAGER";
        CONTRACTOR: "CONTRACTOR";
        SUB_VENDOR: "SUB_VENDOR";
    }>;
}, z.core.$strict>;
export declare const updateRoleSchema: z.ZodObject<{
    role_name: z.ZodOptional<z.ZodEnum<{
        HCM_USER: "HCM_USER";
        MANAGER: "MANAGER";
        CONTRACTOR: "CONTRACTOR";
        SUB_VENDOR: "SUB_VENDOR";
    }>>;
}, z.core.$strict>;
export declare const createUserRoleSchema: z.ZodObject<{
    user_id: z.ZodString;
    role_id: z.ZodString;
}, z.core.$strict>;
export declare const updateUserRoleSchema: z.ZodObject<{
    user_id: z.ZodOptional<z.ZodString>;
    role_id: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
export declare const createUserActivitySchema: z.ZodObject<{
    user_id: z.ZodString;
    last_login_at: z.ZodOptional<z.ZodPipe<z.ZodString, z.ZodTransform<Date, string>>>;
    last_actions: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
}, z.core.$strict>;
export declare const updateUserActivitySchema: z.ZodObject<{
    user_id: z.ZodOptional<z.ZodString>;
    last_login_at: z.ZodOptional<z.ZodOptional<z.ZodPipe<z.ZodString, z.ZodTransform<Date, string>>>>;
    last_actions: z.ZodOptional<z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>>;
}, z.core.$strict>;
export declare const createTaskSchema: z.ZodObject<{
    user_id: z.ZodString;
    assigned_to_user_id: z.ZodString;
    description: z.ZodString;
    status: z.ZodString;
    due_date: z.ZodOptional<z.ZodPipe<z.ZodString, z.ZodTransform<Date, string>>>;
}, z.core.$strict>;
export declare const updateTaskSchema: z.ZodObject<{
    user_id: z.ZodOptional<z.ZodString>;
    assigned_to_user_id: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodString>;
    due_date: z.ZodOptional<z.ZodOptional<z.ZodPipe<z.ZodString, z.ZodTransform<Date, string>>>>;
}, z.core.$strict>;
export declare const createApplicantSchema: z.ZodObject<{
    full_name: z.ZodString;
    status: z.ZodDefault<z.ZodEnum<{
        APPLIED: "APPLIED";
        PLACED: "PLACED";
        REJECTED: "REJECTED";
        SHORTLISTEDF: "SHORTLISTEDF";
        INTERVIEWING: "INTERVIEWING";
    }>>;
    last_active_at: z.ZodOptional<z.ZodCoercedDate<unknown>>;
}, z.core.$strict>;
export declare const updateApplicantSchema: z.ZodObject<{
    full_name: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodDefault<z.ZodEnum<{
        APPLIED: "APPLIED";
        PLACED: "PLACED";
        REJECTED: "REJECTED";
        SHORTLISTEDF: "SHORTLISTEDF";
        INTERVIEWING: "INTERVIEWING";
    }>>>;
    last_active_at: z.ZodOptional<z.ZodOptional<z.ZodCoercedDate<unknown>>>;
}, z.core.$strict>;
export declare const createApplicantContactSchema: z.ZodObject<{
    applicant_id: z.ZodString;
    email: z.ZodString;
    phone: z.ZodString;
    address: z.ZodOptional<z.ZodString>;
    city: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
export declare const updateApplicantContactSchema: z.ZodObject<{
    applicant_id: z.ZodOptional<z.ZodString>;
    email: z.ZodOptional<z.ZodString>;
    phone: z.ZodOptional<z.ZodString>;
    address: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    city: z.ZodOptional<z.ZodOptional<z.ZodString>>;
}, z.core.$strict>;
export declare const createApplicantDemographicSchema: z.ZodObject<{
    applicant_id: z.ZodString;
    birth_date: z.ZodOptional<z.ZodPipe<z.ZodString, z.ZodTransform<Date, string>>>;
    gender: z.ZodOptional<z.ZodString>;
    race: z.ZodOptional<z.ZodString>;
    disability: z.ZodOptional<z.ZodString>;
    work_authorization: z.ZodOptional<z.ZodString>;
    authorization_expiry: z.ZodOptional<z.ZodPipe<z.ZodString, z.ZodTransform<Date, string>>>;
}, z.core.$strict>;
export declare const updateApplicantDemographicSchema: z.ZodObject<{
    applicant_id: z.ZodOptional<z.ZodString>;
    birth_date: z.ZodOptional<z.ZodOptional<z.ZodPipe<z.ZodString, z.ZodTransform<Date, string>>>>;
    gender: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    race: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    disability: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    work_authorization: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    authorization_expiry: z.ZodOptional<z.ZodOptional<z.ZodPipe<z.ZodString, z.ZodTransform<Date, string>>>>;
}, z.core.$strict>;
export declare const createApplicantDocumentSchema: z.ZodObject<{
    applicant_id: z.ZodString;
    document_type: z.ZodString;
    file_url: z.ZodString;
}, z.core.$strict>;
export declare const updateApplicantDocumentSchema: z.ZodObject<{
    applicant_id: z.ZodOptional<z.ZodString>;
    document_type: z.ZodOptional<z.ZodString>;
    file_url: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
export declare const createApplicantSocialProfilesSchema: z.ZodObject<{
    applicant_id: z.ZodString;
    profile_title: z.ZodString;
    profile_link: z.ZodString;
}, z.core.$strict>;
export declare const updateApplicantSocialProfilesSchema: z.ZodObject<{
    applicant_id: z.ZodOptional<z.ZodString>;
    profile_title: z.ZodOptional<z.ZodString>;
    profile_link: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
export declare const createApplicantReferencesSchema: z.ZodObject<{
    applicant_id: z.ZodString;
    user_id: z.ZodString;
}, z.core.$strict>;
export declare const updateApplicantReferencesSchema: z.ZodObject<{
    applicant_id: z.ZodOptional<z.ZodString>;
    user_id: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
export declare const createApplicantWorkHistorySchema: z.ZodObject<{
    applicant_id: z.ZodString;
    title: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
export declare const updateApplicantWorkHistorySchema: z.ZodObject<{
    applicant_id: z.ZodOptional<z.ZodString>;
    title: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodOptional<z.ZodString>>;
}, z.core.$strict>;
export declare const createApplicationSchema: z.ZodObject<{
    job_id: z.ZodString;
    applicant_id: z.ZodString;
    source: z.ZodOptional<z.ZodString>;
    status: z.ZodDefault<z.ZodEnum<{
        APPLIED: "APPLIED";
        SCREENED: "SCREENED";
        OFFERED: "OFFERED";
        HIRED: "HIRED";
    }>>;
    applied_at: z.ZodOptional<z.ZodPipe<z.ZodString, z.ZodTransform<Date, string>>>;
}, z.core.$strict>;
export declare const updateApplicationSchema: z.ZodObject<{
    source: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodEnum<{
        APPLIED: "APPLIED";
        SCREENED: "SCREENED";
        OFFERED: "OFFERED";
        HIRED: "HIRED";
    }>>;
    applied_at: z.ZodOptional<z.ZodPipe<z.ZodString, z.ZodTransform<Date, string>>>;
}, z.core.$strict>;
export declare const createApplicationEvaluationSchema: z.ZodObject<{
    application_id: z.ZodString;
    ai_score: z.ZodNumber;
    model_name: z.ZodString;
    raw_response: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
    evaluated_at: z.ZodOptional<z.ZodPipe<z.ZodString, z.ZodTransform<Date, string>>>;
}, z.core.$strict>;
export declare const updateApplicationEvaluationSchema: z.ZodObject<{
    application_id: z.ZodOptional<z.ZodString>;
    ai_score: z.ZodOptional<z.ZodNumber>;
    model_name: z.ZodOptional<z.ZodString>;
    raw_response: z.ZodOptional<z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>>;
    evaluated_at: z.ZodOptional<z.ZodOptional<z.ZodPipe<z.ZodString, z.ZodTransform<Date, string>>>>;
}, z.core.$strict>;
export declare const createInterviewSchema: z.ZodObject<{
    application_id: z.ZodString;
    interview_date: z.ZodPipe<z.ZodString, z.ZodTransform<Date, string>>;
    status: z.ZodEnum<{
        REJECTED: "REJECTED";
        PENDING: "PENDING";
        COMPLETED_RESULT_PENDING: "COMPLETED_RESULT_PENDING";
        ACCEPTED: "ACCEPTED";
    }>;
}, z.core.$strict>;
export declare const updateInterviewSchema: z.ZodObject<{
    application_id: z.ZodOptional<z.ZodString>;
    interview_date: z.ZodOptional<z.ZodPipe<z.ZodString, z.ZodTransform<Date, string>>>;
    status: z.ZodOptional<z.ZodEnum<{
        REJECTED: "REJECTED";
        PENDING: "PENDING";
        COMPLETED_RESULT_PENDING: "COMPLETED_RESULT_PENDING";
        ACCEPTED: "ACCEPTED";
    }>>;
}, z.core.$strict>;
export declare const createPipelineStageSchema: z.ZodObject<{
    application_id: z.ZodString;
    job_id: z.ZodString;
    stage_name: z.ZodString;
    pipeline_date: z.ZodOptional<z.ZodPipe<z.ZodString, z.ZodTransform<Date, string>>>;
    credit_organization_user_id: z.ZodOptional<z.ZodString>;
    representative_organization_user_id: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
export declare const updatePipelineStageSchema: z.ZodObject<{
    application_id: z.ZodOptional<z.ZodString>;
    job_id: z.ZodOptional<z.ZodString>;
    stage_name: z.ZodOptional<z.ZodString>;
    pipeline_date: z.ZodOptional<z.ZodOptional<z.ZodPipe<z.ZodString, z.ZodTransform<Date, string>>>>;
    credit_organization_user_id: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    representative_organization_user_id: z.ZodOptional<z.ZodOptional<z.ZodString>>;
}, z.core.$strict>;
export declare const createAssignmentSchema: z.ZodObject<{
    application_id: z.ZodString;
    start_date: z.ZodPipe<z.ZodString, z.ZodTransform<Date, string>>;
    end_date: z.ZodOptional<z.ZodPipe<z.ZodString, z.ZodTransform<Date, string>>>;
    employment_type: z.ZodEnum<{
        W2: "W2";
        CONTRACTOR_1099: "CONTRACTOR_1099";
    }>;
    workers_comp_code: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
export declare const updateAssignmentSchema: z.ZodObject<{
    application_id: z.ZodOptional<z.ZodString>;
    start_date: z.ZodOptional<z.ZodPipe<z.ZodString, z.ZodTransform<Date, string>>>;
    end_date: z.ZodOptional<z.ZodOptional<z.ZodPipe<z.ZodString, z.ZodTransform<Date, string>>>>;
    employment_type: z.ZodOptional<z.ZodEnum<{
        W2: "W2";
        CONTRACTOR_1099: "CONTRACTOR_1099";
    }>>;
    workers_comp_code: z.ZodOptional<z.ZodOptional<z.ZodString>>;
}, z.core.$strict>;
export declare const createTimeEntrySchema: z.ZodObject<{
    assignment_id: z.ZodString;
    work_date: z.ZodPipe<z.ZodString, z.ZodTransform<Date, string>>;
    hours: z.ZodNumber;
    status: z.ZodDefault<z.ZodEnum<{
        SUBMITTED: "SUBMITTED";
        APPROVED: "APPROVED";
    }>>;
}, z.core.$strict>;
export declare const updateTimeEntrySchema: z.ZodObject<{
    assignment_id: z.ZodOptional<z.ZodString>;
    work_date: z.ZodOptional<z.ZodPipe<z.ZodString, z.ZodTransform<Date, string>>>;
    hours: z.ZodOptional<z.ZodNumber>;
    status: z.ZodOptional<z.ZodDefault<z.ZodEnum<{
        SUBMITTED: "SUBMITTED";
        APPROVED: "APPROVED";
    }>>>;
}, z.core.$strict>;
export declare const createPayrollSchema: z.ZodObject<{
    assignment_id: z.ZodString;
    pay_period: z.ZodString;
    gross_pay: z.ZodNumber;
    net_pay: z.ZodNumber;
    processed_at: z.ZodOptional<z.ZodPipe<z.ZodString, z.ZodTransform<Date, string>>>;
}, z.core.$strict>;
export declare const updatePayrollSchema: z.ZodObject<{
    assignment_id: z.ZodOptional<z.ZodString>;
    pay_period: z.ZodOptional<z.ZodString>;
    gross_pay: z.ZodOptional<z.ZodNumber>;
    net_pay: z.ZodOptional<z.ZodNumber>;
    processed_at: z.ZodOptional<z.ZodOptional<z.ZodPipe<z.ZodString, z.ZodTransform<Date, string>>>>;
}, z.core.$strict>;
export type CreateOrganization = z.infer<typeof createOrganizationSchema>;
export type UpdateOrganization = z.infer<typeof updateOrganizationSchema>;
export type CreateOrganizationAddress = z.infer<typeof createOrganizationAddressSchema>;
export type UpdateOrganizationAddress = z.infer<typeof updateOrganizationAddressSchema>;
export type CreateOrganizationContact = z.infer<typeof createOrganizationContactSchema>;
export type UpdateOrganizationContact = z.infer<typeof updateOrganizationContactSchema>;
export type CreateOrganizationLicense = z.infer<typeof createOrganizationLicenseSchema>;
export type UpdateOrganizationLicense = z.infer<typeof updateOrganizationLicenseSchema>;
export type CreateOrganizationAccounting = z.infer<typeof createOrganizationAccountingSchema>;
export type UpdateOrganizationAccounting = z.infer<typeof updateOrganizationAccountingSchema>;
export type CreateOrganizationUser = z.infer<typeof createOrganizationUserSchema>;
export type UpdateOrganizationUser = z.infer<typeof updateOrganizationUserSchema>;
export type CreateOrganizationDocumentTitle = z.infer<typeof createOrganizationDocumentTitleSchema>;
export type UpdateOrganizationDocumentTitle = z.infer<typeof updateOrganizationDocumentTitleSchema>;
export type CreateOrganizationDocument = z.infer<typeof createOrganizationDocumentSchema>;
export type UpdateOrganizationDocument = z.infer<typeof updateOrganizationDocumentSchema>;
export type CreateCompanyOffice = z.infer<typeof createCompanyOfficeSchema>;
export type UpdateCompanyOffice = z.infer<typeof updateCompanyOfficeSchema>;
export type CreateJob = z.infer<typeof createJobSchema>;
export type UpdateJob = z.infer<typeof updateJobSchema>;
export type CreateJobDetail = z.infer<typeof createJobDetailSchema>;
export type UpdateJobDetail = z.infer<typeof updateJobDetailSchema>;
export type CreateJobOwner = z.infer<typeof createJobOwnerSchema>;
export type UpdateJobOwner = z.infer<typeof updateJobOwnerSchema>;
export type CreateJobNote = z.infer<typeof createJobNoteSchema>;
export type UpdateJobNote = z.infer<typeof updateJobNoteSchema>;
export type CreateJobPosting = z.infer<typeof createJobPostingSchema>;
export type UpdateJobPosting = z.infer<typeof updateJobPostingSchema>;
export type CreateJobRate = z.infer<typeof createJobRateSchema>;
export type UpdateJobRate = z.infer<typeof updateJobRateSchema>;
export type CreateContract = z.infer<typeof createContractSchema>;
export type UpdateContract = z.infer<typeof updateContractSchema>;
export type CreateUser = z.infer<typeof createUserSchema>;
export type UpdateUser = z.infer<typeof updateUserSchema>;
export type CreateRole = z.infer<typeof createRoleSchema>;
export type UpdateRole = z.infer<typeof updateRoleSchema>;
export type CreateUserRole = z.infer<typeof createUserRoleSchema>;
export type UpdateUserRole = z.infer<typeof updateUserRoleSchema>;
export type CreateUserActivity = z.infer<typeof createUserActivitySchema>;
export type UpdateUserActivity = z.infer<typeof updateUserActivitySchema>;
export type CreateTask = z.infer<typeof createTaskSchema>;
export type UpdateTask = z.infer<typeof updateTaskSchema>;
export type CreateApplicant = z.infer<typeof createApplicantSchema>;
export type UpdateApplicant = z.infer<typeof updateApplicantSchema>;
export type CreateApplicantContact = z.infer<typeof createApplicantContactSchema>;
export type UpdateApplicantContact = z.infer<typeof updateApplicantContactSchema>;
export type CreateApplicantDemographic = z.infer<typeof createApplicantDemographicSchema>;
export type UpdateApplicantDemographic = z.infer<typeof updateApplicantDemographicSchema>;
export type CreateApplicantDocument = z.infer<typeof createApplicantDocumentSchema>;
export type UpdateApplicantDocument = z.infer<typeof updateApplicantDocumentSchema>;
export type CreateApplicantSocialProfiles = z.infer<typeof createApplicantSocialProfilesSchema>;
export type UpdateApplicantSocialProfiles = z.infer<typeof updateApplicantSocialProfilesSchema>;
export type CreateApplicantReferences = z.infer<typeof createApplicantReferencesSchema>;
export type UpdateApplicantReferences = z.infer<typeof updateApplicantReferencesSchema>;
export type CreateApplicantWorkHistory = z.infer<typeof createApplicantWorkHistorySchema>;
export type UpdateApplicantWorkHistory = z.infer<typeof updateApplicantWorkHistorySchema>;
export type CreateApplication = z.infer<typeof createApplicationSchema>;
export type UpdateApplication = z.infer<typeof updateApplicationSchema>;
export type CreateApplicationEvaluation = z.infer<typeof createApplicationEvaluationSchema>;
export type UpdateApplicationEvaluation = z.infer<typeof updateApplicationEvaluationSchema>;
export type CreateInterview = z.infer<typeof createInterviewSchema>;
export type UpdateInterview = z.infer<typeof updateInterviewSchema>;
export type CreatePipelineStage = z.infer<typeof createPipelineStageSchema>;
export type UpdatePipelineStage = z.infer<typeof updatePipelineStageSchema>;
export type CreateAssignment = z.infer<typeof createAssignmentSchema>;
export type UpdateAssignment = z.infer<typeof updateAssignmentSchema>;
export type CreateTimeEntry = z.infer<typeof createTimeEntrySchema>;
export type UpdateTimeEntry = z.infer<typeof updateTimeEntrySchema>;
export type CreatePayroll = z.infer<typeof createPayrollSchema>;
export type UpdatePayroll = z.infer<typeof updatePayrollSchema>;
//# sourceMappingURL=schemas.d.ts.map