import express from 'express';
import { execSync } from 'child_process';
import cors from 'cors';
import dotenv from 'dotenv';
import userRoutes from './routes/user/userRoutes';
import jobRoutes from './routes/job/jobRoutes';
import jobDetailRoutes from './routes/job/jobDetailRoutes';
import { errorHandler } from './middleware/errorHandler';
import jobRateRoutes from './routes/job/jobRateRoutes';
import jobNoteRoutes from './routes/job/jobNoteRoutes';
import jobOwnerRoutes from './routes/job/jobOwnerRoutes';
import organizationRoutes from './routes/organization/organizationRoutes';
import organizationAddressRoutes from './routes/organization/organizationAddressRoutes';
import organizationContactRoutes from './routes/organization/organizationContactRoutes';
import organizationLicenseRoutes from './routes/organization/organizationLicenseRoutes';
import companyOfficeRoutes from './routes/organization/companyOfficeRoutes';
import { contactActivityDropdownRouter, contactPreviewRouter, organizationActivityRouter, contactJobRouter } from './routes/organization/contactActivityRoutes';
import organizationAccountingRoutes from './routes/organization/organizationAccountingRoutes';
import organizationUserRoutes from './routes/organization/organizationUserRoutes';
import organizationDocumentTitleRoutes from './routes/organization/organizationDocumentTitleRoutes';
import organizationDocumentRoutes from './routes/organization/organizationDocumentRoutes';
import organizationDocumentSignatureRoutes from './routes/organization/organizationDocumentSignatureRoutes';
import { jobOwnerController } from './controllers/job/jobOwnerController';
import applicantRoutes from './routes/applicant/applicantRoutes';
import applicantContactRoutes from './routes/applicant/applicantContactRoutes';
import applicantDemographicRoutes from './routes/applicant/applicantDemographicRoutes';
import applicantWorkHistoryRoutes from './routes/applicant/applicantWorkHistoryRoutes';
import applicantReferencesRoutes from './routes/applicant/applicantReferencesRoutes';
import applicantSocialProfilesRoutes from './routes/applicant/applicantSocialProfilesRoutes';
import applicantDocumentsRoutes from './routes/applicant/applicantDocumentsRoutes';
import organizationContractorRoutes from './routes/organization/organizationContractRoutes';
import applicationRoutes from './routes/application/applicationRoutes';
import interviewRoutes from './routes/application/interviewRoutes';
import assignmentRoutes from './routes/application/assignmentRoutes';
import userActivityRoutes from './routes/user/userActivityRoutes';
import taskRoutes from './routes/user/taskRoutes';
import organizationCompleteRoutes from './routes/organization/fullOrganizationRoutes';
import jobCompleteRoutes from './routes/job/fullJobRoutes';
import publicRoutes from './routes/public_application/publicRoutes';
import applicantProfileRoutes from './routes/applicant/applicantProfileRoutes';
import pipelineRoutes from './routes/application/pipelineRoutes';
import initializeCronJobs from '../src/services/cronJobService'
import timesheetRoutes from './routes/timesheets/timesheetRoutes';
import payrollRoutes from './routes/timesheets/payrollRoutes';


dotenv.config();




// At the top of your main server file or this controller file
import { BlobServiceClient } from '@azure/storage-blob';

async function testAzureConnection() {
  try {
    if (!process.env.AZURE_STORAGE_CONNECTION_STRING) {
      console.error('❌ AZURE_STORAGE_CONNECTION_STRING not found');
      return;
    }
    
    const blobServiceClient = BlobServiceClient.fromConnectionString(
      process.env.AZURE_STORAGE_CONNECTION_STRING
    );
    const containerClient = blobServiceClient.getContainerClient(
      process.env.AZURE_CONTAINER_NAME || 'applicant-documents'
    );
    
    await containerClient.createIfNotExists({ access: 'blob' });
    console.log('✅ Azure Blob Storage connected successfully');
  } catch (error) {
    console.error('❌ Azure connection failed:', error);
  }
}

// Call on server start
testAzureConnection();


const logPythonInfo = () => {
  const pythonCmd = process.env.PYTHON_CMD || process.env.PYTHON_BIN || 'python3';
  try {
    const out = execSync(`${pythonCmd} --version`, {
      stdio: ['ignore', 'pipe', 'pipe'],
    }).toString().trim();
    const version = out || execSync(`${pythonCmd} -V`, {
      stdio: ['ignore', 'pipe', 'pipe'],
    }).toString().trim();
    console.log(`Python detected: ${pythonCmd} (${version})`);
  } catch (err: any) {
    const fallbackCmd = 'python';
    try {
      const out = execSync(`${fallbackCmd} --version`, {
        stdio: ['ignore', 'pipe', 'pipe'],
      }).toString().trim();
      const version = out || execSync(`${fallbackCmd} -V`, {
        stdio: ['ignore', 'pipe', 'pipe'],
      }).toString().trim();
      console.log(`Python detected: ${fallbackCmd} (${version})`);
    } catch (fallbackErr: any) {
      console.warn(`Python not detected. Tried: ${pythonCmd}, ${fallbackCmd}`);
    }
  }
};

console.log("Node version:", process.version);
console.log("crypto exists:", typeof globalThis.crypto);
logPythonInfo();




const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Serve generated invoices (PDFs)
app.use('/generated-invoices', express.static('generated-invoices'));

// Health check endpoint for Fly.io and monitoring
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Routes
app.use('/api/users', userRoutes);
app.use('/api/user-activity', userActivityRoutes);
app.use('/api/user-tasks', taskRoutes);


// Job routes
app.use('/api/jobs', jobRoutes);
app.use('/api/job-details', jobDetailRoutes);
app.use('/api/job-rates', jobRateRoutes);
app.use('/api/job-notes', jobNoteRoutes);
app.use('/api/job-owners', jobOwnerRoutes);

// Organization routes
app.use('/api/organizations', organizationRoutes);
app.use('/api/organization-addresses', organizationAddressRoutes);
app.use('/api/organization-contacts', organizationContactRoutes);
app.use('/api/organization-licenses', organizationLicenseRoutes);
app.use('/api/organization-accounting', organizationAccountingRoutes);
app.use('/api/organization-users', organizationUserRoutes);
app.use('/api/organization-document-titles', organizationDocumentTitleRoutes);
app.use('/api/organization-documents', organizationDocumentRoutes);
app.use('/api/organization-document-signatures', organizationDocumentSignatureRoutes);
app.use('/api/company-offices', companyOfficeRoutes);
app.use('/api/organization-contracts', organizationContractorRoutes);


// Contact Activity routes of Organization
app.use('/api/contact-activity/dropdown', contactActivityDropdownRouter);
app.use('/api/contact-previews', contactPreviewRouter);
app.use('/api/organization-activities', organizationActivityRouter);
app.use('/api/contact-jobs', contactJobRouter);



// Applicant Profile Routes
app.use('/api/applicantsprofiles', applicantProfileRoutes);


// Applicant routes
app.use('/api/applicants', applicantRoutes);
app.use('/api/applicant-contacts', applicantContactRoutes);
app.use('/api/applicant-demographics', applicantDemographicRoutes);
app.use('/api/applicant-references', applicantReferencesRoutes);
app.use('/api/applicant-social-profiles', applicantSocialProfilesRoutes);
app.use('/api/applicant-work-history', applicantWorkHistoryRoutes);
app.use('/api/applicant-documents', applicantDocumentsRoutes);


// Timesheets and Payroll routes
app.use('/api/timesheets', timesheetRoutes);
app.use('/api/payroll', payrollRoutes);

// Application routes
app.use('/api/applications', applicationRoutes);
app.use('/api/interviews', interviewRoutes);
app.use('/api/assignments', assignmentRoutes);
app.use('/api/pipeline', pipelineRoutes);


// Public Application and Job Board Routes
app.use('/api/public', publicRoutes);



// For Complete Data:
app.use('/organizations/complete', organizationCompleteRoutes);
app.use('/jobs/complete', jobCompleteRoutes);

    
// adding health endpoint for render:
app.get('/health', (req, res) => {
  res.status(200).send('OK');
}
);





// Error handling middleware (must be last)
app.use(errorHandler);

// Start server
const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
  initializeCronJobs(); // Initialize cron jobs after server starts
});

// Graceful shutdown handling
const shutdown = (signal: string) => {
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
