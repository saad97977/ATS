"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
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
const organizationAccountingRoutes_1 = __importDefault(require("./routes/organization/organizationAccountingRoutes"));
const organizationUserRoutes_1 = __importDefault(require("./routes/organization/organizationUserRoutes"));
const organizationDocumentTitleRoutes_1 = __importDefault(require("./routes/organization/organizationDocumentTitleRoutes"));
const organizationDocumentRoutes_1 = __importDefault(require("./routes/organization/organizationDocumentRoutes"));
const applicantRoutes_1 = __importDefault(require("./routes/applicant/applicantRoutes"));
const applicantContactRoutes_1 = __importDefault(require("./routes/applicant/applicantContactRoutes"));
const applicantDemographicRoutes_1 = __importDefault(require("./routes/applicant/applicantDemographicRoutes"));
const applicantWorkHistoryRoutes_1 = __importDefault(require("./routes/applicant/applicantWorkHistoryRoutes"));
const applicantReferencesRoutes_1 = __importDefault(require("./routes/applicant/applicantReferencesRoutes"));
const applicantSocialProfilesRoutes_1 = __importDefault(require("./routes/applicant/applicantSocialProfilesRoutes"));
const applicantDocumentsRoutes_1 = __importDefault(require("./routes/applicant/applicantDocumentsRoutes"));
const organizationContractRoutes_1 = __importDefault(require("./routes/organization/organizationContractRoutes"));
const applicationRoutes_1 = __importDefault(require("./routes/application/applicationRoutes"));
const interviewRoutes_1 = __importDefault(require("./routes/application/interviewRoutes"));
const assignmentRoutes_1 = __importDefault(require("./routes/application/assignmentRoutes"));
const userActivityRoutes_1 = __importDefault(require("./routes/user/userActivityRoutes"));
const taskRoutes_1 = __importDefault(require("./routes/user/taskRoutes"));
const fullOrganizationRoutes_1 = __importDefault(require("./routes/organization/fullOrganizationRoutes"));
const fullJobRoutes_1 = __importDefault(require("./routes/job/fullJobRoutes"));
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 5000;
// Middleware
app.use((0, cors_1.default)());
app.use(express_1.default.json());
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
app.use('/api/user-tasks', taskRoutes_1.default);
// Job routes
app.use('/api/jobs', jobRoutes_1.default);
app.use('/api/job-details', jobDetailRoutes_1.default);
app.use('/api/job-rates', jobRateRoutes_1.default);
app.use('/api/job-notes', jobNoteRoutes_1.default);
app.use('/api/job-owners', jobOwnerRoutes_1.default);
// Organization routes
app.use('/api/organizations', organizationRoutes_1.default);
app.use('/api/organization-addresses', organizationAddressRoutes_1.default);
app.use('/api/organization-contacts', organizationContactRoutes_1.default);
app.use('/api/organization-licenses', organizationLicenseRoutes_1.default);
app.use('/api/organization-accounting', organizationAccountingRoutes_1.default);
app.use('/api/organization-users', organizationUserRoutes_1.default);
app.use('/api/organization-document-titles', organizationDocumentTitleRoutes_1.default);
app.use('/api/organization-documents', organizationDocumentRoutes_1.default);
app.use('/api/company-offices', companyOfficeRoutes_1.default);
app.use('/api/organization-contracts', organizationContractRoutes_1.default);
// Applicant routes
app.use('/api/applicants', applicantRoutes_1.default);
app.use('/api/applicant-contacts', applicantContactRoutes_1.default);
app.use('/api/applicant-demographics', applicantDemographicRoutes_1.default);
app.use('/api/applicant-references', applicantReferencesRoutes_1.default);
app.use('/api/applicant-social-profiles', applicantSocialProfilesRoutes_1.default);
app.use('/api/applicant-work-history', applicantWorkHistoryRoutes_1.default);
app.use('/api/applicant-documents', applicantDocumentsRoutes_1.default);
// Application routes
app.use('/api/applications', applicationRoutes_1.default);
app.use('/api/interviews', interviewRoutes_1.default);
app.use('/api/assignments', assignmentRoutes_1.default);
// For Complete Data:
app.use('/organizations/complete', fullOrganizationRoutes_1.default);
app.use('/jobs/complete', fullJobRoutes_1.default);
// Error handling middleware (must be last)
app.use(errorHandler_1.errorHandler);
// Start server
const server = app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
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