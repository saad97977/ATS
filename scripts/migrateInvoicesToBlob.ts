/**
 * migrateInvoicesToBlob.ts
 *
 * One-time script: uploads every PDF in /generated-invoices to
 * Azure Blob Storage (invoices container), then prints the new URLs.
 *
 * Run with:
 *   npx ts-node scripts/migrateInvoicesToBlob.ts
 */

import { BlobServiceClient } from '@azure/storage-blob';
import * as fs from 'fs';
import * as path from 'path';
import 'dotenv/config';

const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
const containerName    = process.env.AZURE_INVOICES_CONTAINER_NAME || 'invoices';

if (!connectionString) {
  console.error('❌  AZURE_STORAGE_CONNECTION_STRING is not set in .env');
  process.exit(1);
}

const localDir = path.join(process.cwd(), 'generated-invoices');

if (!fs.existsSync(localDir)) {
  console.error('❌  generated-invoices folder not found');
  process.exit(1);
}

const files = fs.readdirSync(localDir).filter(f => f.endsWith('.pdf'));

if (files.length === 0) {
  console.log('No PDF files found in generated-invoices/');
  process.exit(0);
}

(async () => {
  const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
  const containerClient   = blobServiceClient.getContainerClient(containerName);

  await containerClient.createIfNotExists({ access: 'blob' });
  console.log(`\n📦  Container: ${containerName}`);
  console.log(`📂  Files found: ${files.length}\n`);

  for (const filename of files) {
    const localPath = path.join(localDir, filename);
    const buffer    = fs.readFileSync(localPath);

    const blockBlobClient = containerClient.getBlockBlobClient(filename);
    await blockBlobClient.upload(buffer, buffer.length, {
      blobHTTPHeaders: { blobContentType: 'application/pdf' },
    });

    console.log(`✅  ${filename}`);
    console.log(`    ${blockBlobClient.url}\n`);
  }

  console.log(`✔  Migration complete. ${files.length} file(s) uploaded.`);
  console.log(`\nYou can now safely delete the generated-invoices/ folder.`);
  console.log(`Also update any invoice records in the DB whose pdf_url still points`);
  console.log(`to http://localhost:5000/generated-invoices/... with the new blob URLs above.`);
})();
