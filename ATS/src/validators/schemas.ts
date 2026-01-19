import { z } from 'zod';

/**
 * Zod Schemas for ATS Models
 * All schemas based on prisma.schema file
 * Provides validation and serialization for request/response data
 */

// ============================================
// ORGANIZATION SCHEMAS
// ============================================

export const createOrganizationSchema = z.object({
  name: z.string().min(1, 'Organization name is required'),
  created_by_user_id: z.string().uuid('Invalid user ID'),
  website: z.string().url('Invalid website URL').optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
  phone: z.string().optional(),
}).strict();

export const updateOrganizationSchema = createOrganizationSchema.partial();

// ============================================
// ORGANIZATION ADDRESS SCHEMAS
// ============================================

export const createOrganizationAddressSchema = z.object({
  organization_id: z.string().uuid('Invalid organization ID'),
  address_type: z.enum(['WORKSITE', 'BILLING']),
  address1: z.string().min(1, 'Address line 1 is required'),
  address2: z.string().optional(),
  city: z.string().min(1, 'City is required'),
  state: z.string().min(1, 'State is required'),
  zip: z.string().min(1, 'ZIP code is required'),
  phone: z.string().optional(),
}).strict();

export const updateOrganizationAddressSchema = createOrganizationAddressSchema.partial();

// ============================================
// ORGANIZATION CONTACT SCHEMAS
// ============================================

export const createOrganizationContactSchema = z.object({
  organization_id: z.string().uuid('Invalid organization ID'),
  name: z.string().min(1, 'Contact name is required'),
  email: z.string().email('Invalid email address'),
  phone: z.string().min(1, 'Phone number is required'),
  contact_type: z.enum(['PRIMARY', 'EMERGENCY']),
}).strict();

export const updateOrganizationContactSchema = createOrganizationContactSchema.partial();

// ============================================
// ORGANIZATION LICENSE SCHEMAS
// ============================================

export const createOrganizationLicenseSchema = z.object({
  organization_id: z.string().uuid('Invalid organization ID'),
  license_name: z.string().min(1, 'License name is required'),
  license_document: z.string().min(1, 'License document is required'),
  expiration_date: z.string().transform((val) => new Date(val)).optional(),
}).strict();

export const updateOrganizationLicenseSchema = createOrganizationLicenseSchema.partial();

// ============================================
// ORGANIZATION ACCOUNTING SCHEMAS
// ============================================

export const createOrganizationAccountingSchema = z.object({
  organization_id: z.string().uuid('Invalid organization ID'),
  account_type: z.string().min(1, 'Account type is required'),
  bank_name: z.string().min(1, 'Bank name is required'),
  account_number: z.string().min(1, 'Account number is required'),
  routing_number: z.string().regex(/^\d{9}$/, 'Invalid routing number'),
  country: z.string().min(1, 'Country is required'),
}).strict();

export const updateOrganizationAccountingSchema = createOrganizationAccountingSchema.partial();

// ============================================
// ORGANIZATION USER SCHEMAS
// ============================================

export const createOrganizationUserSchema = z.object({
  organization_id: z.string().uuid('Invalid organization ID'),
  user_id: z.string().uuid('Invalid user ID'),
  division: z.string().optional(),
  department: z.string().optional(),
  title: z.string().optional(),
  work_phone: z.string().optional(),
}).strict();

export const updateOrganizationUserSchema = createOrganizationUserSchema.partial();

// ============================================
// ORGANIZATION DOCUMENT TITLE SCHEMAS
// ============================================

export const createOrganizationDocumentTitleSchema = z.object({
  organization_id: z.string().uuid('Invalid organization ID'),
  document_title: z.string().min(1, 'Document title is required'),
}).strict();

export const updateOrganizationDocumentTitleSchema = createOrganizationDocumentTitleSchema.partial();

// ============================================
// ORGANIZATION DOCUMENT SCHEMAS
// ============================================

export const createOrganizationDocumentSchema = z.object({
  document_title_id: z.string().uuid('Invalid document title ID'),
  organization_id: z.string().uuid('Invalid organization ID'),
  document_type: z.string().min(1, 'Document type is required'),
  document_name: z.string().min(1, 'Document name is required'),
  user_id: z.string().uuid('Invalid user ID'),
  file: z.string().min(1, 'File path is required'),
  privacy: z.enum(['PUBLIC', 'PRIVATE']),
  expiration_date: z.string().transform((val) => new Date(val)).optional(),
}).strict();

export const updateOrganizationDocumentSchema = createOrganizationDocumentSchema.partial();

// ============================================
// COMPANY OFFICE SCHEMAS
// ============================================

export const createCompanyOfficeSchema = z.object({
  organization_id: z.string().uuid('Invalid organization ID'),
  office_name: z.string().min(1, 'Office name is required'),
  city: z.string().min(1, 'City is required'),
  state: z.string().min(1, 'State is required'),
  country: z.string().min(1, 'Country is required'),
  type: z.enum(['REMOTE', 'HYBRID', 'ONSITE']),
  address: z.string().min(1, 'Address is required'),
  is_primary: z.boolean().default(false),
}).strict();

export const updateCompanyOfficeSchema = createCompanyOfficeSchema.partial();

// ============================================
// JOB SCHEMAS
// ============================================

export const createJobSchema = z.object({
  organization_id: z.string().uuid('Invalid organization ID'),
  created_by_user_id: z.string().uuid('Invalid user ID'),
  manager_id: z.string().uuid('Invalid manager ID').optional(),
  job_title: z.string().min(1, 'Job title is required'),
  status: z.enum(['DRAFT', 'OPEN', 'CLOSED']).default('DRAFT'),
  job_type: z.enum(['TEMPORARY', 'PERMANENT']),
  location: z.string().min(1, 'Job location is required'),
  days_active: z.number().int().positive().optional(),
  days_inactive: z.number().int().positive().optional(),
  approved: z.boolean().default(false),
  start_date: z.string().transform((val) => new Date(val)).optional(),
  end_date: z.string().transform((val) => new Date(val)).optional(),
}).strict();

export const updateJobSchema = createJobSchema.partial();

// ============================================
// JOB DETAIL SCHEMAS
// ============================================

export const createJobDetailSchema = z.object({
  job_id: z.string().uuid('Invalid job ID'),
  description: z.string().min(1, 'Job description is required'),
  skills: z.record(z.string(), z.any()).describe('JSON object with skill names as keys').optional(),
}).strict();

export const updateJobDetailSchema = createJobDetailSchema.partial();

// ============================================
// JOB OWNER SCHEMAS
// ============================================

export const createJobOwnerSchema = z.object({
  job_id: z.string().uuid('Invalid job ID'),
  user_id: z.string().uuid('Invalid user ID'),
  role_type: z.enum(['SALES', 'RECRUITER']),
}).strict();

export const updateJobOwnerSchema = createJobOwnerSchema.partial();

// ============================================
// JOB NOTE SCHEMAS
// ============================================

export const createJobNoteSchema = z.object({
  job_id: z.string().uuid('Invalid job ID'),
  note: z.string().min(1, 'Note content is required'),
}).strict();

export const updateJobNoteSchema = createJobNoteSchema.partial();

// ============================================
// JOB POSTING SCHEMAS
// ============================================

export const createJobPostingSchema = z.object({
  job_id: z.string().uuid('Invalid job ID'),
  channel: z.string().min(1, 'Channel is required'),
  external_posting_id: z.string().min(1, 'External posting ID is required'),
  status: z.string().min(1, 'Status is required'),
}).strict();

export const updateJobPostingSchema = createJobPostingSchema.partial();

// ============================================
// JOB RATE SCHEMAS
// ============================================

export const createJobRateSchema = z.object({
  job_id: z.string().uuid('Invalid job ID'),
  pay_rate: z.number().positive('Pay rate must be positive').optional(),
  bill_rate: z.number().positive('Bill rate must be positive'),
  markup_percentage: z.number().positive('Markup percentage must be positive').optional(),
  overtime_rule: z.string().optional(),
  hours: z.number().int().positive('Hours must be positive'),
  ot_pay_rate: z.number().positive('Overtime pay rate must be positive').optional(),
  ot_bill_rate: z.number().positive('Overtime bill rate must be positive').optional(),
}).strict();

export const updateJobRateSchema = createJobRateSchema.partial();

// ============================================
// CONTRACT SCHEMAS
// ============================================

export const createContractSchema = z.object({
  organization_id: z.string().uuid('Invalid organization ID'),
  user_id: z.string().uuid('Invalid user ID'),
  contract_name: z.string().min(1, 'Contract name is required'),
  status: z.string().min(1, 'Status is required'),
  is_organization_contractor: z.boolean(),
  sent_status: z.string().optional(),
  signed_status: z.string().optional(),
  signed_at: z.string().transform((val) => new Date(val)).optional(),
}).strict();

export const updateContractSchema = createContractSchema.partial();

// ============================================
// USER SCHEMAS
// ============================================

export const createUserSchema = z.object({
  name: z.string().min(1, 'User name is required'),
  email: z.string().email('Invalid email address'),
  password_hash: z.string().min(8, 'Password must be at least 8 characters'),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
  is_admin: z.boolean().default(true),
}).strict();

export const updateUserSchema = z.object({
  name: z.string().min(1, 'User name is required').optional(),
  password_hash: z.string().min(8, 'Password must be at least 8 characters').optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  is_admin: z.boolean().optional(),
}).strict();

// ============================================
// ROLE SCHEMAS
// ============================================

export const createRoleSchema = z.object({
  role_name: z.enum(['HCM_USER', 'MANAGER', 'CONTRACTOR', 'SUB_VENDOR']),
}).strict();

export const updateRoleSchema = createRoleSchema.partial();

// ============================================
// USER ROLE SCHEMAS
// ============================================

export const createUserRoleSchema = z.object({
  user_id: z.string().uuid('Invalid user ID'),
  role_id: z.string().uuid('Invalid role ID'),
}).strict();

export const updateUserRoleSchema = createUserRoleSchema.partial();

// ============================================
// USER ACTIVITY SCHEMAS
// ============================================

export const createUserActivitySchema = z.object({
  user_id: z.string().uuid('Invalid user ID'),
  last_login_at: z.string().transform((val) => new Date(val)).optional(),
  last_actions: z.record(z.string(), z.any()).optional(),
}).strict();

export const updateUserActivitySchema = createUserActivitySchema.partial();

// ============================================
// TASK SCHEMAS
// ============================================

export const createTaskSchema = z.object({
  user_id: z.string().uuid('Invalid user ID'),
  assigned_to_user_id: z.string().uuid('Invalid user ID'),
  description: z.string().min(1, 'Task description is required'),
  status: z.string().min(1, 'Status is required'),
  due_date: z.string().transform((val) => new Date(val)).optional(),
}).strict();

export const updateTaskSchema = createTaskSchema.partial();

// ============================================
// APPLICANT SCHEMAS
// ============================================

export const createApplicantSchema = z.object({
  full_name: z.string().min(1, 'Full name is required'),
  status: z.enum(['APPLIED', 'PLACED', 'REJECTED', 'SHORTLISTEDF', 'INTERVIEWING']).default('APPLIED'),
  last_active_at: z.coerce.date().optional(),
}).strict();

export const updateApplicantSchema = createApplicantSchema.partial();

// ============================================
// APPLICANT CONTACT SCHEMAS
// ============================================

export const createApplicantContactSchema = z.object({
  applicant_id: z.string().uuid('Invalid applicant ID'),
  email: z.string().email('Invalid email address'),
  phone: z.string().min(1, 'Phone number is required'),
  address: z.string().optional(),
  city: z.string().optional(),
}).strict();

export const updateApplicantContactSchema = createApplicantContactSchema.partial();

// ============================================
// APPLICANT DEMOGRAPHIC SCHEMAS
// ============================================

export const createApplicantDemographicSchema = z.object({
  applicant_id: z.string().uuid(),
  birth_date: z.string().transform((val) => new Date(val)).optional(),
  gender: z.string().optional(),
  race: z.string().optional(),
  disability: z.string().optional(),
  work_authorization: z.string().optional(),
  authorization_expiry: z.string().transform((val) => new Date(val)).optional(),
}).strict();

export const updateApplicantDemographicSchema = createApplicantDemographicSchema.partial();

// ============================================
// APPLICANT DOCUMENT SCHEMAS
// ============================================

export const createApplicantDocumentSchema = z.object({
  applicant_id: z.string().uuid('Invalid applicant ID'),
  document_type: z.string().min(1, 'Document type is required'),
  file_url: z.string().url('Invalid file URL'),
}).strict();

export const updateApplicantDocumentSchema = createApplicantDocumentSchema.partial();

// ============================================
// APPLICANT SOCIAL PROFILES SCHEMAS
// ============================================

export const createApplicantSocialProfilesSchema = z.object({
  applicant_id: z.string().uuid('Invalid applicant ID'),
  profile_title: z.string().min(1, 'Profile title is required'),
  profile_link: z.string().url('Invalid profile URL'),
}).strict();

export const updateApplicantSocialProfilesSchema = createApplicantSocialProfilesSchema.partial();

// ============================================
// APPLICANT REFERENCES SCHEMAS
// ============================================

export const createApplicantReferencesSchema = z.object({
  applicant_id: z.string().uuid('Invalid applicant ID'),
  user_id: z.string().uuid('Invalid user ID'),
}).strict();

export const updateApplicantReferencesSchema = createApplicantReferencesSchema.partial();

// ============================================
// APPLICANT WORK HISTORY SCHEMAS
// ============================================

export const createApplicantWorkHistorySchema = z.object({
  applicant_id: z.string().uuid('Invalid applicant ID'),
  title: z.string().min(1, 'Job title is required'),
  description: z.string().optional(),
}).strict();

export const updateApplicantWorkHistorySchema = createApplicantWorkHistorySchema.partial();

// ============================================
// APPLICATION SCHEMAS
// ============================================

export const createApplicationSchema = z.object({
  job_id: z.string().uuid('Invalid job ID'),
  applicant_id: z.string().uuid('Invalid applicant ID'),
  source: z.string().optional(),
  status: z.enum(['APPLIED', 'SCREENED', 'OFFERED', 'HIRED']).default('APPLIED'),
  applied_at: z.string().transform((val) => new Date(val)).optional(),
}).strict();

export const updateApplicationSchema = z.object({
  source: z.string().optional(),
  status: z.enum(['APPLIED', 'SCREENED', 'OFFERED', 'HIRED']).optional(),
  applied_at: z.string().transform((val) => new Date(val)).optional(),
}).strict();

// ============================================
// APPLICATION EVALUATION SCHEMAS
// ============================================

export const createApplicationEvaluationSchema = z.object({
  application_id: z.string().uuid('Invalid application ID'),
  ai_score: z.number().positive('AI score must be positive'),
  model_name: z.string().min(1, 'Model name is required'),
  raw_response: z.record(z.string(), z.any()).optional(),
  evaluated_at: z.string().transform((val) => new Date(val)).optional(),
}).strict();

export const updateApplicationEvaluationSchema = createApplicationEvaluationSchema.partial();

// ============================================
// INTERVIEW SCHEMAS
// ============================================

export const createInterviewSchema = z.object({
  application_id: z.string().uuid('Invalid application ID'),
  interview_date: z.string().transform((val) => new Date(val)),
  status: z.enum(['PENDING', 'COMPLETED_RESULT_PENDING', 'REJECTED', 'ACCEPTED']),
}).strict();

export const updateInterviewSchema = createInterviewSchema.partial();

// ============================================
// PIPELINE STAGE SCHEMAS
// ============================================

export const createPipelineStageSchema = z.object({
  application_id: z.string().uuid('Invalid application ID'),
  job_id: z.string().uuid('Invalid job ID'),
  stage_name: z.string().min(1, 'Stage name is required'),
  pipeline_date: z.string().transform((val) => new Date(val)).optional(),
  credit_organization_user_id: z.string().uuid('Invalid user ID').optional(),
  representative_organization_user_id: z.string().uuid('Invalid user ID').optional(),
}).strict();

export const updatePipelineStageSchema = createPipelineStageSchema.partial();

// ============================================
// ASSIGNMENT SCHEMAS
// ============================================

export const createAssignmentSchema = z.object({
  application_id: z.string().uuid('Invalid application ID'),
  start_date: z.string().transform((val) => new Date(val)),
  end_date: z.string().transform((val) => new Date(val)).optional(),
  employment_type: z.enum(['W2', 'CONTRACTOR_1099']),
  workers_comp_code: z.string().optional(),
}).strict();

export const updateAssignmentSchema = createAssignmentSchema.partial();

// ============================================
// TIME ENTRY SCHEMAS
// ============================================

export const createTimeEntrySchema = z.object({
  assignment_id: z.string().uuid('Invalid assignment ID'),
  work_date: z.string().transform((val) => new Date(val)),
  hours: z.number().positive('Hours must be positive'),
  status: z.enum(['SUBMITTED', 'APPROVED']).default('SUBMITTED'),
}).strict();

export const updateTimeEntrySchema = createTimeEntrySchema.partial();

// ============================================
// PAYROLL SCHEMAS
// ============================================

export const createPayrollSchema = z.object({
  assignment_id: z.string().uuid('Invalid assignment ID'),
  pay_period: z.string().min(1, 'Pay period is required'),
  gross_pay: z.number().positive('Gross pay must be positive'),
  net_pay: z.number().positive('Net pay must be positive'),
  processed_at: z.string().transform((val) => new Date(val)).optional(),
}).strict();

export const updatePayrollSchema = createPayrollSchema.partial();

// ============================================
// TYPE EXPORTS
// ============================================

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