"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateApplicantDocumentSchema = exports.createApplicantDocumentSchema = exports.updateApplicantDemographicSchema = exports.createApplicantDemographicSchema = exports.updateApplicantContactSchema = exports.createApplicantContactSchema = exports.updateApplicantSchema = exports.createApplicantSchema = exports.updateTaskSchema = exports.createTaskSchema = exports.updateUserActivitySchema = exports.createUserActivitySchema = exports.updateUserRoleSchema = exports.createUserRoleSchema = exports.updateRoleSchema = exports.createRoleSchema = exports.updateUserSchema = exports.createUserSchema = exports.updateContractSchema = exports.createContractSchema = exports.updateJobRateSchema = exports.createJobRateSchema = exports.updateJobPostingSchema = exports.createJobPostingSchema = exports.updateJobNoteSchema = exports.createJobNoteSchema = exports.updateJobOwnerSchema = exports.createJobOwnerSchema = exports.updateJobDetailSchema = exports.createJobDetailSchema = exports.updateJobSchema = exports.createJobSchema = exports.updateCompanyOfficeSchema = exports.createCompanyOfficeSchema = exports.updateOrganizationDocumentSchema = exports.createOrganizationDocumentSchema = exports.updateOrganizationDocumentTitleSchema = exports.createOrganizationDocumentTitleSchema = exports.updateOrganizationUserSchema = exports.createOrganizationUserSchema = exports.updateOrganizationAccountingSchema = exports.createOrganizationAccountingSchema = exports.updateOrganizationLicenseSchema = exports.createOrganizationLicenseSchema = exports.updateOrganizationContactSchema = exports.createOrganizationContactSchema = exports.updateOrganizationAddressSchema = exports.createOrganizationAddressSchema = exports.updateOrganizationSchema = exports.createOrganizationSchema = void 0;
exports.updatePayrollSchema = exports.createPayrollSchema = exports.updateTimeEntrySchema = exports.createTimeEntrySchema = exports.updateAssignmentSchema = exports.createAssignmentSchema = exports.updatePipelineStageSchema = exports.createPipelineStageSchema = exports.updateInterviewSchema = exports.createInterviewSchema = exports.updateApplicationEvaluationSchema = exports.createApplicationEvaluationSchema = exports.updateApplicationSchema = exports.createApplicationSchema = exports.updateApplicantWorkHistorySchema = exports.createApplicantWorkHistorySchema = exports.updateApplicantReferencesSchema = exports.createApplicantReferencesSchema = exports.updateApplicantSocialProfilesSchema = exports.createApplicantSocialProfilesSchema = void 0;
const zod_1 = require("zod");
/**
 * Zod Schemas for ATS Models
 * All schemas based on prisma.schema file
 * Provides validation and serialization for request/response data
 */
// ============================================
// ORGANIZATION SCHEMAS
// ============================================
exports.createOrganizationSchema = zod_1.z.object({
    name: zod_1.z.string().min(1, 'Organization name is required'),
    created_by_user_id: zod_1.z.string().uuid('Invalid user ID'),
    website: zod_1.z.string().url('Invalid website URL').optional(),
    status: zod_1.z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
    phone: zod_1.z.string().optional(),
}).strict();
exports.updateOrganizationSchema = exports.createOrganizationSchema.partial();
// ============================================
// ORGANIZATION ADDRESS SCHEMAS
// ============================================
exports.createOrganizationAddressSchema = zod_1.z.object({
    organization_id: zod_1.z.string().uuid('Invalid organization ID'),
    address_type: zod_1.z.enum(['WORKSITE', 'BILLING']),
    address1: zod_1.z.string().min(1, 'Address line 1 is required'),
    address2: zod_1.z.string().optional(),
    city: zod_1.z.string().min(1, 'City is required'),
    state: zod_1.z.string().min(1, 'State is required'),
    zip: zod_1.z.string().min(1, 'ZIP code is required'),
    phone: zod_1.z.string().optional(),
}).strict();
exports.updateOrganizationAddressSchema = exports.createOrganizationAddressSchema.partial();
// ============================================
// ORGANIZATION CONTACT SCHEMAS
// ============================================
exports.createOrganizationContactSchema = zod_1.z.object({
    organization_id: zod_1.z.string().uuid('Invalid organization ID'),
    name: zod_1.z.string().min(1, 'Contact name is required'),
    email: zod_1.z.string().email('Invalid email address'),
    phone: zod_1.z.string().min(1, 'Phone number is required'),
    contact_type: zod_1.z.enum(['PRIMARY', 'EMERGENCY']),
}).strict();
exports.updateOrganizationContactSchema = exports.createOrganizationContactSchema.partial();
// ============================================
// ORGANIZATION LICENSE SCHEMAS
// ============================================
exports.createOrganizationLicenseSchema = zod_1.z.object({
    organization_id: zod_1.z.string().uuid('Invalid organization ID'),
    license_name: zod_1.z.string().min(1, 'License name is required'),
    license_document: zod_1.z.string().min(1, 'License document is required'),
    expiration_date: zod_1.z.string().transform((val) => new Date(val)).optional(),
}).strict();
exports.updateOrganizationLicenseSchema = exports.createOrganizationLicenseSchema.partial();
// ============================================
// ORGANIZATION ACCOUNTING SCHEMAS
// ============================================
exports.createOrganizationAccountingSchema = zod_1.z.object({
    organization_id: zod_1.z.string().uuid('Invalid organization ID'),
    account_type: zod_1.z.string().min(1, 'Account type is required'),
    bank_name: zod_1.z.string().min(1, 'Bank name is required'),
    account_number: zod_1.z.string().min(1, 'Account number is required'),
    routing_number: zod_1.z.string().regex(/^\d{9}$/, 'Invalid routing number'),
    country: zod_1.z.string().min(1, 'Country is required'),
}).strict();
exports.updateOrganizationAccountingSchema = exports.createOrganizationAccountingSchema.partial();
// ============================================
// ORGANIZATION USER SCHEMAS
// ============================================
exports.createOrganizationUserSchema = zod_1.z.object({
    organization_id: zod_1.z.string().uuid('Invalid organization ID'),
    user_id: zod_1.z.string().uuid('Invalid user ID'),
    division: zod_1.z.string().optional(),
    department: zod_1.z.string().optional(),
    title: zod_1.z.string().optional(),
    work_phone: zod_1.z.string().optional(),
}).strict();
exports.updateOrganizationUserSchema = exports.createOrganizationUserSchema.partial();
// ============================================
// ORGANIZATION DOCUMENT TITLE SCHEMAS
// ============================================
exports.createOrganizationDocumentTitleSchema = zod_1.z.object({
    organization_id: zod_1.z.string().uuid('Invalid organization ID'),
    document_title: zod_1.z.string().min(1, 'Document title is required'),
}).strict();
exports.updateOrganizationDocumentTitleSchema = exports.createOrganizationDocumentTitleSchema.partial();
// ============================================
// ORGANIZATION DOCUMENT SCHEMAS
// ============================================
exports.createOrganizationDocumentSchema = zod_1.z.object({
    document_title_id: zod_1.z.string().uuid('Invalid document title ID'),
    organization_id: zod_1.z.string().uuid('Invalid organization ID'),
    document_type: zod_1.z.string().min(1, 'Document type is required'),
    document_name: zod_1.z.string().min(1, 'Document name is required'),
    user_id: zod_1.z.string().uuid('Invalid user ID'),
    file: zod_1.z.string().min(1, 'File path is required'),
    privacy: zod_1.z.enum(['PUBLIC', 'PRIVATE']),
    expiration_date: zod_1.z.string().transform((val) => new Date(val)).optional(),
}).strict();
exports.updateOrganizationDocumentSchema = exports.createOrganizationDocumentSchema.partial();
// ============================================
// COMPANY OFFICE SCHEMAS
// ============================================
exports.createCompanyOfficeSchema = zod_1.z.object({
    organization_id: zod_1.z.string().uuid('Invalid organization ID'),
    office_name: zod_1.z.string().min(1, 'Office name is required'),
    city: zod_1.z.string().min(1, 'City is required'),
    state: zod_1.z.string().min(1, 'State is required'),
    country: zod_1.z.string().min(1, 'Country is required'),
    type: zod_1.z.enum(['REMOTE', 'HYBRID', 'ONSITE']),
    address: zod_1.z.string().min(1, 'Address is required'),
    is_primary: zod_1.z.boolean().default(false),
}).strict();
exports.updateCompanyOfficeSchema = exports.createCompanyOfficeSchema.partial();
// ============================================
// JOB SCHEMAS
// ============================================
exports.createJobSchema = zod_1.z.object({
    organization_id: zod_1.z.string().uuid('Invalid organization ID'),
    created_by_user_id: zod_1.z.string().uuid('Invalid user ID'),
    manager_id: zod_1.z.string().uuid('Invalid manager ID').optional(),
    job_title: zod_1.z.string().min(1, 'Job title is required'),
    status: zod_1.z.enum(['DRAFT', 'OPEN', 'CLOSED']).default('DRAFT'),
    job_type: zod_1.z.enum(['TEMPORARY', 'PERMANENT']),
    location: zod_1.z.string().min(1, 'Job location is required'),
    days_active: zod_1.z.number().int().positive().optional(),
    days_inactive: zod_1.z.number().int().positive().optional(),
    approved: zod_1.z.boolean().default(false),
    start_date: zod_1.z.string().transform((val) => new Date(val)).optional(),
    end_date: zod_1.z.string().transform((val) => new Date(val)).optional(),
}).strict();
exports.updateJobSchema = exports.createJobSchema.partial();
// ============================================
// JOB DETAIL SCHEMAS
// ============================================
exports.createJobDetailSchema = zod_1.z.object({
    job_id: zod_1.z.string().uuid('Invalid job ID'),
    description: zod_1.z.string().min(1, 'Job description is required'),
    skills: zod_1.z.record(zod_1.z.string(), zod_1.z.any()).describe('JSON object with skill names as keys').optional(),
}).strict();
exports.updateJobDetailSchema = exports.createJobDetailSchema.partial();
// ============================================
// JOB OWNER SCHEMAS
// ============================================
exports.createJobOwnerSchema = zod_1.z.object({
    job_id: zod_1.z.string().uuid('Invalid job ID'),
    user_id: zod_1.z.string().uuid('Invalid user ID'),
    role_type: zod_1.z.enum(['SALES', 'RECRUITER']),
}).strict();
exports.updateJobOwnerSchema = exports.createJobOwnerSchema.partial();
// ============================================
// JOB NOTE SCHEMAS
// ============================================
exports.createJobNoteSchema = zod_1.z.object({
    job_id: zod_1.z.string().uuid('Invalid job ID'),
    note: zod_1.z.string().min(1, 'Note content is required'),
}).strict();
exports.updateJobNoteSchema = exports.createJobNoteSchema.partial();
// ============================================
// JOB POSTING SCHEMAS
// ============================================
exports.createJobPostingSchema = zod_1.z.object({
    job_id: zod_1.z.string().uuid('Invalid job ID'),
    channel: zod_1.z.string().min(1, 'Channel is required'),
    external_posting_id: zod_1.z.string().min(1, 'External posting ID is required'),
    status: zod_1.z.string().min(1, 'Status is required'),
}).strict();
exports.updateJobPostingSchema = exports.createJobPostingSchema.partial();
// ============================================
// JOB RATE SCHEMAS
// ============================================
exports.createJobRateSchema = zod_1.z.object({
    job_id: zod_1.z.string().uuid('Invalid job ID'),
    pay_rate: zod_1.z.number().positive('Pay rate must be positive').optional(),
    bill_rate: zod_1.z.number().positive('Bill rate must be positive'),
    markup_percentage: zod_1.z.number().positive('Markup percentage must be positive').optional(),
    overtime_rule: zod_1.z.string().optional(),
    hours: zod_1.z.number().int().positive('Hours must be positive'),
    ot_pay_rate: zod_1.z.number().positive('Overtime pay rate must be positive').optional(),
    ot_bill_rate: zod_1.z.number().positive('Overtime bill rate must be positive').optional(),
}).strict();
exports.updateJobRateSchema = exports.createJobRateSchema.partial();
// ============================================
// CONTRACT SCHEMAS
// ============================================
exports.createContractSchema = zod_1.z.object({
    organization_id: zod_1.z.string().uuid('Invalid organization ID'),
    user_id: zod_1.z.string().uuid('Invalid user ID'),
    contract_name: zod_1.z.string().min(1, 'Contract name is required'),
    status: zod_1.z.string().min(1, 'Status is required'),
    is_organization_contractor: zod_1.z.boolean(),
    sent_status: zod_1.z.string().optional(),
    signed_status: zod_1.z.string().optional(),
    signed_at: zod_1.z.string().transform((val) => new Date(val)).optional(),
}).strict();
exports.updateContractSchema = exports.createContractSchema.partial();
// ============================================
// USER SCHEMAS
// ============================================
exports.createUserSchema = zod_1.z.object({
    name: zod_1.z.string().min(1, 'User name is required'),
    email: zod_1.z.string().email('Invalid email address'),
    password_hash: zod_1.z.string().min(8, 'Password must be at least 8 characters'),
    status: zod_1.z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
    is_admin: zod_1.z.boolean().default(true),
}).strict();
exports.updateUserSchema = zod_1.z.object({
    name: zod_1.z.string().min(1, 'User name is required').optional(),
    password_hash: zod_1.z.string().min(8, 'Password must be at least 8 characters').optional(),
    status: zod_1.z.enum(['ACTIVE', 'INACTIVE']).optional(),
    is_admin: zod_1.z.boolean().optional(),
}).strict();
// ============================================
// ROLE SCHEMAS
// ============================================
exports.createRoleSchema = zod_1.z.object({
    role_name: zod_1.z.enum(['HCM_USER', 'MANAGER', 'CONTRACTOR', 'SUB_VENDOR']),
}).strict();
exports.updateRoleSchema = exports.createRoleSchema.partial();
// ============================================
// USER ROLE SCHEMAS
// ============================================
exports.createUserRoleSchema = zod_1.z.object({
    user_id: zod_1.z.string().uuid('Invalid user ID'),
    role_id: zod_1.z.string().uuid('Invalid role ID'),
}).strict();
exports.updateUserRoleSchema = exports.createUserRoleSchema.partial();
// ============================================
// USER ACTIVITY SCHEMAS
// ============================================
exports.createUserActivitySchema = zod_1.z.object({
    user_id: zod_1.z.string().uuid('Invalid user ID'),
    last_login_at: zod_1.z.string().transform((val) => new Date(val)).optional(),
    last_actions: zod_1.z.record(zod_1.z.string(), zod_1.z.any()).optional(),
}).strict();
exports.updateUserActivitySchema = exports.createUserActivitySchema.partial();
// ============================================
// TASK SCHEMAS
// ============================================
exports.createTaskSchema = zod_1.z.object({
    user_id: zod_1.z.string().uuid('Invalid user ID'),
    assigned_to_user_id: zod_1.z.string().uuid('Invalid user ID'),
    description: zod_1.z.string().min(1, 'Task description is required'),
    status: zod_1.z.string().min(1, 'Status is required'),
    due_date: zod_1.z.string().transform((val) => new Date(val)).optional(),
}).strict();
exports.updateTaskSchema = exports.createTaskSchema.partial();
// ============================================
// APPLICANT SCHEMAS
// ============================================
exports.createApplicantSchema = zod_1.z.object({
    full_name: zod_1.z.string().min(1, 'Full name is required'),
    status: zod_1.z.enum(['APPLIED', 'PLACED', 'REJECTED', 'SHORTLISTEDF', 'INTERVIEWING']).default('APPLIED'),
    last_active_at: zod_1.z.coerce.date().optional(),
}).strict();
exports.updateApplicantSchema = exports.createApplicantSchema.partial();
// ============================================
// APPLICANT CONTACT SCHEMAS
// ============================================
exports.createApplicantContactSchema = zod_1.z.object({
    applicant_id: zod_1.z.string().uuid('Invalid applicant ID'),
    email: zod_1.z.string().email('Invalid email address'),
    phone: zod_1.z.string().min(1, 'Phone number is required'),
    address: zod_1.z.string().optional(),
    city: zod_1.z.string().optional(),
}).strict();
exports.updateApplicantContactSchema = exports.createApplicantContactSchema.partial();
// ============================================
// APPLICANT DEMOGRAPHIC SCHEMAS
// ============================================
exports.createApplicantDemographicSchema = zod_1.z.object({
    applicant_id: zod_1.z.string().uuid(),
    birth_date: zod_1.z.string().transform((val) => new Date(val)).optional(),
    gender: zod_1.z.string().optional(),
    race: zod_1.z.string().optional(),
    disability: zod_1.z.string().optional(),
    work_authorization: zod_1.z.string().optional(),
    authorization_expiry: zod_1.z.string().transform((val) => new Date(val)).optional(),
}).strict();
exports.updateApplicantDemographicSchema = exports.createApplicantDemographicSchema.partial();
// ============================================
// APPLICANT DOCUMENT SCHEMAS
// ============================================
exports.createApplicantDocumentSchema = zod_1.z.object({
    applicant_id: zod_1.z.string().uuid('Invalid applicant ID'),
    document_type: zod_1.z.string().min(1, 'Document type is required'),
    file_url: zod_1.z.string().url('Invalid file URL'),
}).strict();
exports.updateApplicantDocumentSchema = exports.createApplicantDocumentSchema.partial();
// ============================================
// APPLICANT SOCIAL PROFILES SCHEMAS
// ============================================
exports.createApplicantSocialProfilesSchema = zod_1.z.object({
    applicant_id: zod_1.z.string().uuid('Invalid applicant ID'),
    profile_title: zod_1.z.string().min(1, 'Profile title is required'),
    profile_link: zod_1.z.string().url('Invalid profile URL'),
}).strict();
exports.updateApplicantSocialProfilesSchema = exports.createApplicantSocialProfilesSchema.partial();
// ============================================
// APPLICANT REFERENCES SCHEMAS
// ============================================
exports.createApplicantReferencesSchema = zod_1.z.object({
    applicant_id: zod_1.z.string().uuid('Invalid applicant ID'),
    user_id: zod_1.z.string().uuid('Invalid user ID'),
}).strict();
exports.updateApplicantReferencesSchema = exports.createApplicantReferencesSchema.partial();
// ============================================
// APPLICANT WORK HISTORY SCHEMAS
// ============================================
exports.createApplicantWorkHistorySchema = zod_1.z.object({
    applicant_id: zod_1.z.string().uuid('Invalid applicant ID'),
    title: zod_1.z.string().min(1, 'Job title is required'),
    description: zod_1.z.string().optional(),
}).strict();
exports.updateApplicantWorkHistorySchema = exports.createApplicantWorkHistorySchema.partial();
// ============================================
// APPLICATION SCHEMAS
// ============================================
exports.createApplicationSchema = zod_1.z.object({
    job_id: zod_1.z.string().uuid('Invalid job ID'),
    applicant_id: zod_1.z.string().uuid('Invalid applicant ID'),
    source: zod_1.z.string().optional(),
    status: zod_1.z.enum(['APPLIED', 'SCREENED', 'OFFERED', 'HIRED']).default('APPLIED'),
    applied_at: zod_1.z.string().transform((val) => new Date(val)).optional(),
}).strict();
exports.updateApplicationSchema = zod_1.z.object({
    source: zod_1.z.string().optional(),
    status: zod_1.z.enum(['APPLIED', 'SCREENED', 'OFFERED', 'HIRED']).optional(),
    applied_at: zod_1.z.string().transform((val) => new Date(val)).optional(),
}).strict();
// ============================================
// APPLICATION EVALUATION SCHEMAS
// ============================================
exports.createApplicationEvaluationSchema = zod_1.z.object({
    application_id: zod_1.z.string().uuid('Invalid application ID'),
    ai_score: zod_1.z.number().positive('AI score must be positive'),
    model_name: zod_1.z.string().min(1, 'Model name is required'),
    raw_response: zod_1.z.record(zod_1.z.string(), zod_1.z.any()).optional(),
    evaluated_at: zod_1.z.string().transform((val) => new Date(val)).optional(),
}).strict();
exports.updateApplicationEvaluationSchema = exports.createApplicationEvaluationSchema.partial();
// ============================================
// INTERVIEW SCHEMAS
// ============================================
exports.createInterviewSchema = zod_1.z.object({
    application_id: zod_1.z.string().uuid('Invalid application ID'),
    interview_date: zod_1.z.string().transform((val) => new Date(val)),
    status: zod_1.z.enum(['PENDING', 'COMPLETED_RESULT_PENDING', 'REJECTED', 'ACCEPTED']),
}).strict();
exports.updateInterviewSchema = exports.createInterviewSchema.partial();
// ============================================
// PIPELINE STAGE SCHEMAS
// ============================================
exports.createPipelineStageSchema = zod_1.z.object({
    application_id: zod_1.z.string().uuid('Invalid application ID'),
    job_id: zod_1.z.string().uuid('Invalid job ID'),
    stage_name: zod_1.z.string().min(1, 'Stage name is required'),
    pipeline_date: zod_1.z.string().transform((val) => new Date(val)).optional(),
    credit_organization_user_id: zod_1.z.string().uuid('Invalid user ID').optional(),
    representative_organization_user_id: zod_1.z.string().uuid('Invalid user ID').optional(),
}).strict();
exports.updatePipelineStageSchema = exports.createPipelineStageSchema.partial();
// ============================================
// ASSIGNMENT SCHEMAS
// ============================================
exports.createAssignmentSchema = zod_1.z.object({
    application_id: zod_1.z.string().uuid('Invalid application ID'),
    start_date: zod_1.z.string().transform((val) => new Date(val)),
    end_date: zod_1.z.string().transform((val) => new Date(val)).optional(),
    employment_type: zod_1.z.enum(['W2', 'CONTRACTOR_1099']),
    workers_comp_code: zod_1.z.string().optional(),
}).strict();
exports.updateAssignmentSchema = exports.createAssignmentSchema.partial();
// ============================================
// TIME ENTRY SCHEMAS
// ============================================
exports.createTimeEntrySchema = zod_1.z.object({
    assignment_id: zod_1.z.string().uuid('Invalid assignment ID'),
    work_date: zod_1.z.string().transform((val) => new Date(val)),
    hours: zod_1.z.number().positive('Hours must be positive'),
    status: zod_1.z.enum(['SUBMITTED', 'APPROVED']).default('SUBMITTED'),
}).strict();
exports.updateTimeEntrySchema = exports.createTimeEntrySchema.partial();
// ============================================
// PAYROLL SCHEMAS
// ============================================
exports.createPayrollSchema = zod_1.z.object({
    assignment_id: zod_1.z.string().uuid('Invalid assignment ID'),
    pay_period: zod_1.z.string().min(1, 'Pay period is required'),
    gross_pay: zod_1.z.number().positive('Gross pay must be positive'),
    net_pay: zod_1.z.number().positive('Net pay must be positive'),
    processed_at: zod_1.z.string().transform((val) => new Date(val)).optional(),
}).strict();
exports.updatePayrollSchema = exports.createPayrollSchema.partial();
//# sourceMappingURL=schemas.js.map