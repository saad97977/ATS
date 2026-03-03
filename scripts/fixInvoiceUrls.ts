/**
 * fixInvoiceUrls.ts
 *
 * One-time script: updates invoice records in the DB whose pdf_url still
 * points to http://localhost:5000/generated-invoices/... with the correct
 * Azure Blob Storage URL.
 *
 * Run with:
 *   npx ts-node scripts/fixInvoiceUrls.ts
 */

import { PrismaClient } from '@prisma/client';
import 'dotenv/config';

const prisma = new PrismaClient();

const ACCOUNT   = 'applicantdocsstorage123';
const CONTAINER = process.env.AZURE_INVOICES_CONTAINER_NAME || 'invoices';

(async () => {
  const stale = await prisma.invoice.findMany({
    where: {
      pdf_url: { contains: 'generated-invoices' },
    },
    select: { invoice_id: true, pdf_url: true },
  });

  if (stale.length === 0) {
    console.log('✔  No stale invoice URLs found — nothing to update.');
    await prisma.$disconnect();
    return;
  }

  console.log(`\nFound ${stale.length} invoice(s) to update:\n`);

  for (const inv of stale) {
    const filename = inv.pdf_url!.split('/').pop()!;
    const newUrl   = `https://${ACCOUNT}.blob.core.windows.net/${CONTAINER}/${filename}`;

    await prisma.invoice.update({
      where: { invoice_id: inv.invoice_id },
      data:  { pdf_url: newUrl },
    });

    console.log(`✅  ${inv.invoice_id}`);
    console.log(`    old: ${inv.pdf_url}`);
    console.log(`    new: ${newUrl}\n`);
  }

  console.log(`✔  Done. ${stale.length} record(s) updated.`);
  await prisma.$disconnect();
})();
