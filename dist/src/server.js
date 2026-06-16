"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const child_process_1 = require("child_process");
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const userRoutes_1 = __importDefault(require("./routes/user/userRoutes"));
const jobRoutes_1 = __importDefault(require("./routes/job/jobRoutes"));
const jobDetailRoutes_1 = __importDefault(require("./routes/job/jobDetailRoutes"));
const errorHandler_1 = require("./middleware/errorHandler");
const jobRateRoutes_1 = __importDefault(require("./routes/job/jobRateRoutes"));
const jobNoteRoutes_1 = __importDefault(require("./routes/job/jobNoteRoutes"));
const jobOwnerRoutes_1 = __importDefault(require("./routes/job/jobOwnerRoutes"));
const organizationRoutes_1 = __importDefault(require("./routes/organization/organizationRoutes"));
const organizationAddressRoutes_1 = __importDefault(require("./routes/organization/organizationAddressRoutes"));
const organizationContactRoutes_1 = __importDefault(require("./routes/organization/organizationContactRoutes"));
const organizationLicenseRoutes_1 = __importDefault(require("./routes/organization/organizationLicenseRoutes"));
const companyOfficeRoutes_1 = __importDefault(require("./routes/organization/companyOfficeRoutes"));
const contactActivityRoutes_1 = require("./routes/organization/contactActivityRoutes");
const organizationUserRoutes_1 = __importDefault(require("./routes/organization/organizationUserRoutes"));
const organizationDocumentTitleRoutes_1 = __importDefault(require("./routes/organization/organizationDocumentTitleRoutes"));
const organizationDocumentRoutes_1 = __importDefault(require("./routes/organization/organizationDocumentRoutes"));
const organizationDocumentSignatureRoutes_1 = __importDefault(require("./routes/organization/organizationDocumentSignatureRoutes"));
const applicantRoutes_1 = __importDefault(require("./routes/applicant/applicantRoutes"));
const applicantContactRoutes_1 = __importDefault(require("./routes/applicant/applicantContactRoutes"));
const applicantDemographicRoutes_1 = __importDefault(require("./routes/applicant/applicantDemographicRoutes"));
const applicantWorkHistoryRoutes_1 = __importDefault(require("./routes/applicant/applicantWorkHistoryRoutes"));
const applicantReferencesRoutes_1 = __importDefault(require("./routes/applicant/applicantReferencesRoutes"));
const applicantSocialProfilesRoutes_1 = __importDefault(require("./routes/applicant/applicantSocialProfilesRoutes"));
const applicantDocumentsRoutes_1 = __importDefault(require("./routes/applicant/applicantDocumentsRoutes"));
const organizationContractRoutes_1 = __importDefault(require("./routes/organization/organizationContractRoutes"));
const organizationFiltersRoutes_1 = __importDefault(require("./routes/organization/organizationFiltersRoutes"));
const applicationRoutes_1 = __importDefault(require("./routes/application/applicationRoutes"));
const interviewRoutes_1 = __importDefault(require("./routes/application/interviewRoutes"));
const assignmentRoutes_1 = __importDefault(require("./routes/application/assignmentRoutes"));
const userActivityRoutes_1 = __importDefault(require("./routes/user/userActivityRoutes"));
const taskRoutes_1 = __importDefault(require("./routes/user/taskRoutes"));
const fullOrganizationRoutes_1 = __importDefault(require("./routes/organization/fullOrganizationRoutes"));
const fullJobRoutes_1 = __importDefault(require("./routes/job/fullJobRoutes"));
const publicRoutes_1 = __importDefault(require("./routes/public_application/publicRoutes"));
const applicantProfileRoutes_1 = __importDefault(require("./routes/applicant/applicantProfileRoutes"));
const applicantCommunicationRoutes_1 = __importDefault(require("./routes/applicant/applicantCommunicationRoutes"));
const pipelineRoutes_1 = __importDefault(require("./routes/application/pipelineRoutes"));
const cronJobService_1 = __importDefault(require("../src/services/cronJobService"));
const timesheetRoutes_1 = __importDefault(require("./routes/timesheets/timesheetRoutes"));
const payrollRoutes_1 = __importDefault(require("./routes/timesheets/payrollRoutes"));
const dropdownRoutes_1 = __importDefault(require("./routes/dropdown/dropdownRoutes"));
const dashboardRoutes_1 = __importDefault(require("./routes/dashboard/dashboardRoutes"));
const userProfileRoutes_1 = __importDefault(require("./routes/user/userProfileRoutes"));
const jobCloneRoutes_1 = __importDefault(require("./routes/job/jobCloneRoutes"));
const jobSubSectionRoutes_1 = __importDefault(require("./routes/job/jobSubSectionRoutes"));
const automationRoutes_1 = __importDefault(require("./routes/automation/automationRoutes"));
dotenv_1.default.config();
// At the top of your main server file or this controller file
const storage_blob_1 = require("@azure/storage-blob");
async function testAzureConnection() {
    try {
        if (!process.env.AZURE_STORAGE_CONNECTION_STRING) {
            console.error('❌ AZURE_STORAGE_CONNECTION_STRING not found');
            return;
        }
        const blobServiceClient = storage_blob_1.BlobServiceClient.fromConnectionString(process.env.AZURE_STORAGE_CONNECTION_STRING);
        const containerClient = blobServiceClient.getContainerClient(process.env.AZURE_CONTAINER_NAME || 'applicant-documents');
        await containerClient.createIfNotExists({ access: 'blob' });
        console.log('✅ Azure Blob Storage connected successfully');
    }
    catch (error) {
        console.error('❌ Azure connection failed:', error);
    }
}
// Call on server start
testAzureConnection();
const logPythonInfo = () => {
    const pythonCmd = process.env.PYTHON_CMD || process.env.PYTHON_BIN || 'python3';
    try {
        const out = (0, child_process_1.execSync)(`${pythonCmd} --version`, {
            stdio: ['ignore', 'pipe', 'pipe'],
        }).toString().trim();
        const version = out || (0, child_process_1.execSync)(`${pythonCmd} -V`, {
            stdio: ['ignore', 'pipe', 'pipe'],
        }).toString().trim();
        console.log(`Python detected: ${pythonCmd} (${version})`);
    }
    catch (err) {
        const fallbackCmd = 'python';
        try {
            const out = (0, child_process_1.execSync)(`${fallbackCmd} --version`, {
                stdio: ['ignore', 'pipe', 'pipe'],
            }).toString().trim();
            const version = out || (0, child_process_1.execSync)(`${fallbackCmd} -V`, {
                stdio: ['ignore', 'pipe', 'pipe'],
            }).toString().trim();
            console.log(`Python detected: ${fallbackCmd} (${version})`);
        }
        catch (fallbackErr) {
            console.warn(`Python not detected. Tried: ${pythonCmd}, ${fallbackCmd}`);
        }
    }
};
console.log("Node version:", process.version);
console.log("crypto exists:", typeof globalThis.crypto);
logPythonInfo();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 5000;
// Middleware
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// Serve generated invoices (PDFs)
app.use('/generated-invoices', express_1.default.static('generated-invoices'));
// Health check endpoint for Fly.io and monitoring
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});
// Routes
app.use('/api/users', userRoutes_1.default);
app.use('/api/user-activity', userActivityRoutes_1.default);
app.use('/api/tasks', taskRoutes_1.default);
app.use('/api/user-profile', userProfileRoutes_1.default);
// Job routes
app.use('/api/jobs', jobRoutes_1.default);
app.use('/api/job-details', jobDetailRoutes_1.default);
app.use('/api/job-rates', jobRateRoutes_1.default);
app.use('/api/job-notes', jobNoteRoutes_1.default);
app.use('/api/job-owners', jobOwnerRoutes_1.default);
app.use('/api/job-templates', jobCloneRoutes_1.default); // Job cloning and templates
app.use('/api/jobs', jobSubSectionRoutes_1.default); // Job sub-section views
// Organization routes
app.use('/api/organizations', organizationRoutes_1.default);
app.use('/api/organization-addresses', organizationAddressRoutes_1.default);
app.use('/api/organization-contacts', organizationContactRoutes_1.default);
app.use('/api/organization-licenses', organizationLicenseRoutes_1.default);
app.use('/api/organization-users', organizationUserRoutes_1.default);
app.use('/api/organization-document-titles', organizationDocumentTitleRoutes_1.default);
app.use('/api/organization-documents', organizationDocumentRoutes_1.default);
app.use('/api/organization-document-signatures', organizationDocumentSignatureRoutes_1.default);
app.use('/api/company-offices', companyOfficeRoutes_1.default);
app.use('/api/organization-contracts', organizationContractRoutes_1.default);
app.use('/api/organizations', organizationFiltersRoutes_1.default);
// Contact Activity routes of Organization
app.use('/api/contact-activity/dropdown', contactActivityRoutes_1.contactActivityDropdownRouter);
app.use('/api/contact-previews', contactActivityRoutes_1.contactPreviewRouter);
app.use('/api/organization-activities', contactActivityRoutes_1.organizationActivityRouter);
app.use('/api/contact-jobs', contactActivityRoutes_1.contactJobRouter);
// Applicant Profile Routes
app.use('/api/applicantsprofiles', applicantProfileRoutes_1.default);
// Applicant routes
app.use('/api/applicants', applicantRoutes_1.default);
app.use('/api/applicant-contacts', applicantContactRoutes_1.default);
app.use('/api/applicant-demographics', applicantDemographicRoutes_1.default);
app.use('/api/applicant-references', applicantReferencesRoutes_1.default);
app.use('/api/applicant-social-profiles', applicantSocialProfilesRoutes_1.default);
app.use('/api/applicant-work-history', applicantWorkHistoryRoutes_1.default);
app.use('/api/applicant-documents', applicantDocumentsRoutes_1.default);
// Applicant Communication (email/call/note logs + manual send)
app.use('/api/applicant-communications', applicantCommunicationRoutes_1.default);
// Timesheets and Payroll routes
app.use('/api/timesheets', timesheetRoutes_1.default);
app.use('/api/payroll', payrollRoutes_1.default);
// Unified Dropdown routes (search-as-you-type for all entities)
app.use('/api/dropdowns', dropdownRoutes_1.default);
// Application routes
app.use('/api/applications', applicationRoutes_1.default);
app.use('/api/interviews', interviewRoutes_1.default);
app.use('/api/assignments', assignmentRoutes_1.default);
app.use('/api/pipeline', pipelineRoutes_1.default);
// Dashboard routes
app.use('/api/dashboard', dashboardRoutes_1.default);
// Public Application and Job Board Routes
app.use('/api/public', publicRoutes_1.default);
// For Complete Data:
app.use('/organizations/complete', fullOrganizationRoutes_1.default);
app.use('/jobs/complete', fullJobRoutes_1.default);
// Automation routes
app.use('/api/email-automation', automationRoutes_1.default);
// adding health endpoint for render:
app.get('/health', (req, res) => {
    res.status(200).send('OK');
});
// Error handling middleware (must be last)
app.use(errorHandler_1.errorHandler);
// Start server
const server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    (0, cronJobService_1.default)(); // Initialize cron jobs after server starts
});
// Graceful shutdown handling
const shutdown = (signal) => {
    console.log(`${signal} received. Starting graceful shutdown...`);
    server.close(() => {
        console.log('HTTP server closed');
        process.exit(0);
    });
    // Force shutdown after 30 seconds
    setTimeout(() => {
        console.error('Forced shutdown after timeout');
        process.exit(1);
    }, 30000);
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
//# sourceMappingURL=server.js.map