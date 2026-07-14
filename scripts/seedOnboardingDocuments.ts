/**
 * seed-onboarding-documents.ts
 * ─────────────────────────────────────────────────────────────────────────
 * One-time (re-runnable) script that:
 *   1. Uploads every PDF in SMS_Adobe_E_Docs/ to Azure Blob Storage
 *   2. Upserts a matching OnboardingDocumentTemplate row (by `name`) with
 *      the resulting blob URL + the category/company/state metadata below
 *
 * Re-running is safe: existing templates (matched by name) get their
 * master_file_url and metadata refreshed instead of being duplicated.
 *
 * USAGE
 *   1. Extract the zip so the PDFs sit in a folder, e.g. ./SMS_Adobe_E_Docs
 *   2. npm install @azure/storage-blob tsx   (or ts-node)
 *   3. Set env vars (see bottom of file) — at minimum:
 *        AZURE_STORAGE_CONNECTION_STRING
 *        AZURE_ONBOARDING_CONTAINER   (defaults to "onboarding-document-templates")
 *        DOCS_DIR                     (defaults to "./SMS_Adobe_E_Docs")
 *   4. npx tsx seed-onboarding-documents.ts
 * ─────────────────────────────────────────────────────────────────────────
 */

import fs from 'fs';
import path from 'path';
import { PrismaClient, OnboardingDocumentCategory, DocumentRecipientType } from '@prisma/client';
import { BlobServiceClient } from '@azure/storage-blob';

const prisma = new PrismaClient();

const DOCS_DIR = process.env.DOCS_DIR || path.join(process.cwd(), 'SMS_Adobe_E_Docs');
const CONTAINER_NAME = process.env.AZURE_ONBOARDING_CONTAINER || 'onboarding-document-templates';
const CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING;

if (!CONNECTION_STRING) {
  console.error('Missing AZURE_STORAGE_CONNECTION_STRING env var.');
  process.exit(1);
}

// ─── Metadata for all 63 documents ─────────────────────────────────────────
// company_code: null = applies to every company code (per schema comment)
// work_state / locality: null = not state/city specific
type SeedRow = {
  file: string;
  name: string;
  category: OnboardingDocumentCategory;
  company_code: string | null;
  recipient_type: DocumentRecipientType;
  requires_signature: boolean;
  work_state: string | null;
  locality: string | null;
  notes?: string;
};

const ROWS: SeedRow[] = [
  { file: '2022 Alabama State Income Tax Form.pdf', name: 'Alabama State Income Tax Form', category: 'TAX_FORM', company_code: null, recipient_type: 'ALL', requires_signature: true, work_state: 'AL', locality: null },
  { file: '2022 Non Compete - MCL JASCO.pdf', name: 'Non-Compete Agreement (MCL JASCO)', category: 'AGREEMENT', company_code: 'JASCO', recipient_type: 'ALL', requires_signature: true, work_state: null, locality: null },
  { file: '401k Enrollment 2022-2023.pdf', name: '401k Enrollment Form', category: 'PROFILE_TASK', company_code: null, recipient_type: 'ALL', requires_signature: true, work_state: null, locality: null },
  { file: '401k Exit 2022-2023.pdf', name: '401k Exit Form', category: 'PROFILE_TASK', company_code: null, recipient_type: 'ALL', requires_signature: true, work_state: null, locality: null },
  { file: '401k Welcome Booklet.pdf', name: '401k Welcome Booklet', category: 'OTHER', company_code: null, recipient_type: 'ALL', requires_signature: false, work_state: null, locality: null },
  { file: '7 Day Notice Form.pdf', name: '7 Day Notice Form', category: 'AGREEMENT', company_code: null, recipient_type: 'ALL', requires_signature: true, work_state: null, locality: null },
  { file: 'Applicants Certification, Authorization and Agreement.pdf', name: 'Applicant Certification, Authorization and Agreement', category: 'AGREEMENT', company_code: null, recipient_type: 'ALL', requires_signature: true, work_state: null, locality: null },
  { file: 'ASTS Clearinghouse Form.pdf', name: 'ASTS Clearinghouse Form', category: 'PROFILE_TASK', company_code: null, recipient_type: 'DRIVERS', requires_signature: true, work_state: null, locality: null },
  { file: 'Authorization for Direct Deposit.pdf', name: 'Authorization for Direct Deposit', category: 'PROFILE_TASK', company_code: null, recipient_type: 'ALL', requires_signature: true, work_state: null, locality: null },
  { file: 'AutoPort Covid19 Reporting Policy.pdf', name: 'AutoPort COVID-19 Reporting Policy', category: 'POLICY', company_code: null, recipient_type: 'ALL', requires_signature: false, work_state: null, locality: null },
  { file: 'City of Detroit DW- 4.pdf', name: 'City of Detroit Withholding (DW-4)', category: 'TAX_FORM', company_code: null, recipient_type: 'ALL', requires_signature: true, work_state: 'MI', locality: 'Detroit' },
  { file: 'City of Grad Rapids W4.pdf', name: 'City of Grand Rapids W-4', category: 'TAX_FORM', company_code: null, recipient_type: 'ALL', requires_signature: true, work_state: 'MI', locality: 'Grand Rapids' },
  { file: 'City of Lansing W-4.pdf', name: 'City of Lansing W-4', category: 'TAX_FORM', company_code: null, recipient_type: 'ALL', requires_signature: true, work_state: 'MI', locality: 'Lansing' },
  { file: 'Code of Conduct MCL JASCO.pdf', name: 'Code of Conduct (MCL JASCO)', category: 'POLICY', company_code: 'JASCO', recipient_type: 'ALL', requires_signature: false, work_state: null, locality: null },
  { file: 'Disclosure of Information Authorization Form (SEEL).pdf', name: 'Disclosure of Information Authorization Form (SEEL)', category: 'AGREEMENT', company_code: 'SEEL', recipient_type: 'ALL', requires_signature: true, work_state: null, locality: null },
  { file: 'ERISA - Electronic Distribution of Materials.pdf', name: 'ERISA Electronic Distribution Consent', category: 'AGREEMENT', company_code: null, recipient_type: 'ALL', requires_signature: true, work_state: null, locality: null },
  { file: 'Exit Interview Form 2022.pdf', name: 'Exit Interview Form', category: 'OTHER', company_code: null, recipient_type: 'ALL', requires_signature: false, work_state: null, locality: null },
  { file: 'FFCRA COVID Leave Acknowledgement.pdf', name: 'FFCRA COVID Leave Acknowledgement', category: 'POLICY', company_code: null, recipient_type: 'ALL', requires_signature: true, work_state: null, locality: null },
  { file: 'Grand Rapids Withholding.pdf', name: 'Grand Rapids Withholding', category: 'TAX_FORM', company_code: null, recipient_type: 'ALL', requires_signature: true, work_state: 'MI', locality: 'Grand Rapids' },
  { file: 'Lansing Withholding.pdf', name: 'Lansing Withholding', category: 'TAX_FORM', company_code: null, recipient_type: 'ALL', requires_signature: true, work_state: 'MI', locality: 'Lansing' },
  { file: "Manager's Reference Guide -- Points to Remember.pdf", name: "Manager's Reference Guide — Points to Remember", category: 'OTHER', company_code: null, recipient_type: 'MANAGER', requires_signature: false, work_state: null, locality: null },
  { file: "Manager's Reference Guide (1).pdf", name: "Manager's Reference Guide", category: 'OTHER', company_code: null, recipient_type: 'MANAGER', requires_signature: false, work_state: null, locality: null },
  { file: 'MCL JASCO Code of Conduct v2.pdf', name: 'Code of Conduct v2 (MCL JASCO)', category: 'POLICY', company_code: 'JASCO', recipient_type: 'ALL', requires_signature: false, work_state: null, locality: null },
  { file: 'MCL JASCO IT Asset Managment Policy.pdf', name: 'IT Asset Management Policy (MCL JASCO)', category: 'POLICY', company_code: 'JASCO', recipient_type: 'ALL', requires_signature: false, work_state: null, locality: null },
  { file: 'MCL JASCO Non-Solicitation, Non-Disclosure & Privacy Policy v2.pdf', name: 'Non-Solicitation, Non-Disclosure & Privacy Policy (MCL JASCO)', category: 'AGREEMENT', company_code: 'JASCO', recipient_type: 'ALL', requires_signature: true, work_state: null, locality: null },
  { file: 'MCL JASCO Phishing - Malicious Software Policy v2.pdf', name: 'Phishing & Malicious Software Policy v2 (MCL JASCO)', category: 'POLICY', company_code: 'JASCO', recipient_type: 'ALL', requires_signature: false, work_state: null, locality: null },
  { file: 'New Hire Data Sheet 2023.pdf', name: 'New Hire Data Sheet', category: 'PROFILE_TASK', company_code: null, recipient_type: 'ALL', requires_signature: true, work_state: null, locality: null },
  { file: 'Non-Driving Agreement SMSMCLSEEL.pdf', name: 'Non-Driving Agreement (SMS/MCL/SEEL)', category: 'AGREEMENT', company_code: 'SEEL', recipient_type: 'NON_DRIVERS', requires_signature: true, work_state: null, locality: null },
  { file: 'Non-Driving Agreement.pdf', name: 'Non-Driving Agreement', category: 'AGREEMENT', company_code: null, recipient_type: 'NON_DRIVERS', requires_signature: true, work_state: null, locality: null },
  { file: 'Onboarding.pdf', name: 'Onboarding Overview', category: 'OTHER', company_code: null, recipient_type: 'ALL', requires_signature: false, work_state: null, locality: null },
  { file: 'Phishing  Malicious Software Policy.pdf', name: 'Phishing & Malicious Software Policy', category: 'POLICY', company_code: null, recipient_type: 'ALL', requires_signature: false, work_state: null, locality: null },
  { file: 'Preliminary Guidelines For Working From Home SEEL.pdf', name: 'Preliminary Guidelines for Working From Home (SEEL)', category: 'POLICY', company_code: 'SEEL', recipient_type: 'ALL', requires_signature: false, work_state: null, locality: null },
  { file: 'Preliminary Guidelines For Working From Home.pdf', name: 'Preliminary Guidelines for Working From Home', category: 'POLICY', company_code: null, recipient_type: 'ALL', requires_signature: false, work_state: null, locality: null },
  { file: 'QIC Handbook.pdf', name: 'QIC Employee Handbook', category: 'HANDBOOK', company_code: 'QIC', recipient_type: 'ALL', requires_signature: false, work_state: null, locality: null },
  { file: 'QIC Offer Letter - Hourly.pdf', name: 'QIC Offer Letter — Hourly', category: 'AGREEMENT', company_code: 'QIC', recipient_type: 'ALL', requires_signature: true, work_state: null, locality: null },
  { file: 'QIC Offer Letter - Salary.pdf', name: 'QIC Offer Letter — Salary', category: 'AGREEMENT', company_code: 'QIC', recipient_type: 'ALL', requires_signature: true, work_state: null, locality: null },
  { file: 'remote access timeclock employees - vehicle restrictions with logos.pdf', name: 'Remote Access Timeclock — Vehicle Restrictions', category: 'POLICY', company_code: null, recipient_type: 'DRIVERS', requires_signature: false, work_state: null, locality: null },
  { file: 'SEEL Benefits Overview HOURLY 2023-2024.pdf', name: 'SEEL Benefits Overview — Hourly', category: 'OTHER', company_code: 'SEEL', recipient_type: 'ALL', requires_signature: false, work_state: null, locality: null },
  { file: 'SEEL Benefits Overview SALARIED 2023-2024.pdf', name: 'SEEL Benefits Overview — Salaried', category: 'OTHER', company_code: 'SEEL', recipient_type: 'ALL', requires_signature: false, work_state: null, locality: null },
  { file: 'SEEL COVID19 Field Guide.pdf', name: 'SEEL COVID-19 Field Guide', category: 'POLICY', company_code: 'SEEL', recipient_type: 'ALL', requires_signature: false, work_state: null, locality: null },
  { file: 'SEEL Driver Safety Discipline.pdf', name: 'SEEL Driver Safety Discipline Policy', category: 'POLICY', company_code: 'SEEL', recipient_type: 'DRIVERS', requires_signature: true, work_state: null, locality: null },
  { file: 'SEEL Driver Safety Program Booklet.pdf', name: 'SEEL Driver Safety Program Booklet', category: 'OTHER', company_code: 'SEEL', recipient_type: 'DRIVERS', requires_signature: false, work_state: null, locality: null },
  { file: 'SEEL Offer Letter - Hourly Interns.pdf', name: 'SEEL Offer Letter — Hourly Interns', category: 'AGREEMENT', company_code: 'SEEL', recipient_type: 'ALL', requires_signature: true, work_state: null, locality: null },
  { file: 'SEEL Offer Letter - Hourly.pdf', name: 'SEEL Offer Letter — Hourly', category: 'AGREEMENT', company_code: 'SEEL', recipient_type: 'ALL', requires_signature: true, work_state: null, locality: null },
  { file: 'SEEL Offer Letter - Salary.pdf', name: 'SEEL Offer Letter — Salary', category: 'AGREEMENT', company_code: 'SEEL', recipient_type: 'ALL', requires_signature: true, work_state: null, locality: null },
  { file: 'SEEL Training Investment Agreement.pdf', name: 'SEEL Training Investment Agreement', category: 'AGREEMENT', company_code: 'SEEL', recipient_type: 'ALL', requires_signature: true, work_state: null, locality: null },
  { file: 'SMS 2022 ETS Vaccination Policy.pdf', name: 'SMS ETS Vaccination Policy', category: 'POLICY', company_code: null, recipient_type: 'ALL', requires_signature: false, work_state: null, locality: null },
  { file: 'SMS Employee Handbook for SEEL 2023.pdf', name: 'SMS Employee Handbook for SEEL (2023)', category: 'HANDBOOK', company_code: 'SEEL', recipient_type: 'ALL', requires_signature: false, work_state: null, locality: null },
  { file: 'SMS Employee Login  Viewing Paystubs.pdf', name: 'SMS Employee Login & Viewing Paystubs', category: 'OTHER', company_code: null, recipient_type: 'ALL', requires_signature: false, work_state: null, locality: null },
  { file: 'SMSQIC Non-Compete.pdf', name: 'Non-Compete Agreement (SMS/QIC)', category: 'AGREEMENT', company_code: 'QIC', recipient_type: 'ALL', requires_signature: true, work_state: null, locality: null },
  { file: 'SMS-SEEL Employee Handbook 2022.pdf', name: 'SMS-SEEL Employee Handbook (2022)', category: 'HANDBOOK', company_code: 'SEEL', recipient_type: 'ALL', requires_signature: false, work_state: null, locality: null },
  { file: 'START-Field Crew Safety Awareness.pdf', name: 'START Field Crew Safety Awareness', category: 'POLICY', company_code: null, recipient_type: 'ALL', requires_signature: false, work_state: null, locality: null },
  { file: 'State of Georgia Withholding.pdf', name: 'Georgia State Withholding', category: 'TAX_FORM', company_code: null, recipient_type: 'ALL', requires_signature: true, work_state: 'GA', locality: null },
  { file: 'State of Illinois Withholding.pdf', name: 'Illinois State Withholding', category: 'TAX_FORM', company_code: null, recipient_type: 'ALL', requires_signature: true, work_state: 'IL', locality: null },
  { file: 'State of Indiana Withholding.pdf', name: 'Indiana State Withholding', category: 'TAX_FORM', company_code: null, recipient_type: 'ALL', requires_signature: true, work_state: 'IN', locality: null },
  { file: 'State of Kentucky Withholding.pdf', name: 'Kentucky State Withholding', category: 'TAX_FORM', company_code: null, recipient_type: 'ALL', requires_signature: true, work_state: 'KY', locality: null },
  { file: 'State of Mississippi Withholding.pdf', name: 'Mississippi State Withholding', category: 'TAX_FORM', company_code: null, recipient_type: 'ALL', requires_signature: true, work_state: 'MS', locality: null },
  { file: 'State of Ohio Withholding.pdf', name: 'Ohio State Withholding', category: 'TAX_FORM', company_code: null, recipient_type: 'ALL', requires_signature: true, work_state: 'OH', locality: null },
  { file: "Upload SSN and Driver's License.pdf", name: "Upload SSN and Driver's License", category: 'PROFILE_TASK', company_code: null, recipient_type: 'ALL', requires_signature: false, work_state: null, locality: null },
  { file: 'VA Withholding.pdf', name: 'Virginia State Withholding', category: 'TAX_FORM', company_code: null, recipient_type: 'ALL', requires_signature: true, work_state: 'VA', locality: null },
  { file: 'Vehicle Usage and Maintenance Policy 09.26.22.pdf', name: 'Vehicle Usage and Maintenance Policy (09/26/22)', category: 'POLICY', company_code: null, recipient_type: 'DRIVERS', requires_signature: true, work_state: null, locality: null },
  { file: 'Vehicle Usage and Maintenance Policy.pdf', name: 'Vehicle Usage and Maintenance Policy', category: 'POLICY', company_code: null, recipient_type: 'DRIVERS', requires_signature: true, work_state: null, locality: null },
  { file: 'Welcome aboard!.pdf', name: 'Welcome Aboard!', category: 'OTHER', company_code: null, recipient_type: 'ALL', requires_signature: false, work_state: null, locality: null },
];

async function main() {
  console.log(`Found ${ROWS.length} template rows to seed.`);

  if (!fs.existsSync(DOCS_DIR)) {
    console.error(`DOCS_DIR does not exist: ${DOCS_DIR}`);
    process.exit(1);
  }

  const blobService = BlobServiceClient.fromConnectionString(CONNECTION_STRING!);
  const container = blobService.getContainerClient(CONTAINER_NAME);
  await container.createIfNotExists();

  let uploaded = 0, created = 0, updated = 0, skipped = 0;

  for (const row of ROWS) {
    const localPath = path.join(DOCS_DIR, row.file);
    if (!fs.existsSync(localPath)) {
      console.warn(`⚠ Skipping "${row.name}" — file not found at ${localPath}`);
      skipped++;
      continue;
    }

    // Stable, readable blob name: category/slug.pdf
    const slug = row.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const blobName = `${row.category.toLowerCase()}/${slug}.pdf`;
    const blockBlobClient = container.getBlockBlobClient(blobName);

    const buffer = fs.readFileSync(localPath);
    await blockBlobClient.uploadData(buffer, {
      blobHTTPHeaders: { blobContentType: 'application/pdf' },
      overwrite: true,
    });
    uploaded++;

    const masterFileUrl = blockBlobClient.url;

    const existing = await prisma.onboardingDocumentTemplate.findFirst({
      where: { name: row.name },
    });

    if (existing) {
      await prisma.onboardingDocumentTemplate.update({
        where: { template_id: existing.template_id },
        data: {
          category: row.category,
          company_code: row.company_code,
          recipient_type: row.recipient_type,
          requires_signature: row.requires_signature,
          work_state: row.work_state,
          locality: row.locality,
          master_file_url: masterFileUrl,
          is_active: true,
        },
      });
      updated++;
    } else {
      await prisma.onboardingDocumentTemplate.create({
        data: {
          name: row.name,
          category: row.category,
          company_code: row.company_code,
          recipient_type: row.recipient_type,
          requires_signature: row.requires_signature,
          work_state: row.work_state,
          locality: row.locality,
          master_file_url: masterFileUrl,
          is_active: true,
        },
      });
      created++;
    }

    console.log(`✓ ${row.name}  →  ${masterFileUrl}`);
  }

  console.log('\n─── Summary ───');
  console.log(`Uploaded to blob: ${uploaded}`);
  console.log(`Templates created: ${created}`);
  console.log(`Templates updated: ${updated}`);
  console.log(`Skipped (file missing): ${skipped}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

/**
 * ENV VARS NEEDED
 * ───────────────
 * AZURE_STORAGE_CONNECTION_STRING   e.g. "DefaultEndpointsProtocol=https;AccountName=...;AccountKey=...;EndpointSuffix=core.windows.net"
 * AZURE_ONBOARDING_CONTAINER        optional, defaults to "onboarding-document-templates"
 * DOCS_DIR                          optional, defaults to "./SMS_Adobe_E_Docs" (folder with the 63 extracted PDFs)
 * DATABASE_URL                      already set for your Prisma project
 */