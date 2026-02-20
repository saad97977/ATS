import prisma from '../../prisma.config';
import { Request, Response } from 'express';
import { sendSuccess, sendError } from '../../utils/response';
import { BlobServiceClient } from '@azure/storage-blob';
import crypto from 'crypto';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

const blobServiceClient = BlobServiceClient.fromConnectionString(
  process.env.AZURE_STORAGE_CONNECTION_STRING!
);

const containerName = process.env.AZURE_ORG_DOCS_CONTAINER_NAME || 'organization-documents';
const signatureContainerName = 'document-signatures';

const getSignatureContainerClient = async () => {
  const containerClient = blobServiceClient.getContainerClient(signatureContainerName);
  await containerClient.createIfNotExists({ access: 'blob' });
  return containerClient;
};

const getContainerClient = async () => {
  const containerClient = blobServiceClient.getContainerClient(containerName);
  await containerClient.createIfNotExists({ access: 'blob' });
  return containerClient;
};

const generateSignatureHash = (documentId: string, userId: string, timestamp: Date): string => {
  return crypto
    .createHash('sha256')
    .update(`${documentId}-${userId}-${timestamp.toISOString()}`)
    .digest('hex');
};

const storeSignatureImage = async (
  documentId: string,
  userId: string,
  signatureData: string
): Promise<string> => {
  const containerClient = await getSignatureContainerClient();
  const blobName = `signatures/${documentId}/${userId}-${Date.now()}.png`;
  const base64Data = signatureData.replace(/^data:image\/\w+;base64,/, '');
  const buffer = Buffer.from(base64Data, 'base64');

  const blockBlobClient = containerClient.getBlockBlobClient(blobName);
  await blockBlobClient.upload(buffer, buffer.length, {
    blobHTTPHeaders: { blobContentType: 'image/png' },
    metadata: { documentId, userId, timestamp: new Date().toISOString() },
  });

  return blockBlobClient.url;
};

const addSignatureToPDF = async (
  pdfBuffer: Buffer,
  signatureImageUrl: string,
  signerName: string,
  signedDate: Date,
  position?: { x: number; y: number; page: number }
): Promise<Buffer> => {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const pageIndex = position?.page ?? pdfDoc.getPageCount() - 1;
  const page = pdfDoc.getPage(pageIndex);
  const { width } = page.getSize();

  const signatureResponse = await fetch(signatureImageUrl);
  const signatureBuffer = Buffer.from(await signatureResponse.arrayBuffer());
  const signatureImage = await pdfDoc.embedPng(signatureBuffer);

  const signatureWidth = 150;
  const signatureHeight = (signatureImage.height / signatureImage.width) * signatureWidth;
  const xPos = position?.x ?? width - signatureWidth - 50;
  const yPos = position?.y ?? 100;

  page.drawImage(signatureImage, { x: xPos, y: yPos, width: signatureWidth, height: signatureHeight });

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  page.drawText(`Digitally Signed by: ${signerName}`, {
    x: xPos, y: yPos - 15, size: 10, font, color: rgb(0, 0, 0),
  });
  page.drawText(`Date: ${signedDate.toLocaleString()}`, {
    x: xPos, y: yPos - 30, size: 10, font, color: rgb(0, 0, 0),
  });

  return Buffer.from(await pdfDoc.save());
};

// ─── Create Signature ─────────────────────────────────────────────────────────

export const createDocumentSignature = async (req: Request, res: Response) => {
  try {
    const { documentId } = req.params;
    const {
      user_id, signer_name, signer_email, signature_data,
      signature_type = 'DRAWN', ip_address, user_agent, position,
    } = req.body;

    if (!user_id || !signer_name || !signer_email || !signature_data) {
      return sendError(res, 'Missing required fields', 400);
    }

    const document = await prisma.organizationDocument.findUnique({
      where: { document_id: documentId },
    });
    if (!document) return sendError(res, 'Document not found', 404);

    const normalizedEmail = signer_email.toLowerCase().trim();

    // ── Guard: block if a non-rejected signature exists for this email ────────
    // A rejected signature is allowed to be re-signed; COMPLETED / VERIFIED block.
    const existingSignature = await prisma.documentSignature.findFirst({
      where: {
        document_id: documentId,
        signer_email: normalizedEmail,
        status: { not: 'REJECTED' },
      },
    });

    if (existingSignature) {
      const stateLabel = existingSignature.is_verified ? 'verified' : 'pending';
      return sendError(
        res,
        `This document already has a ${stateLabel} signature from ${signer_email}. Only rejected signatures can be re-submitted.`,
        409
      );
    }
    // ─────────────────────────────────────────────────────────────────────────

    const signatureImageUrl = await storeSignatureImage(documentId, user_id, signature_data);
    const signedAt = new Date();
    const verificationHash = generateSignatureHash(documentId, user_id, signedAt);

    const signature = await prisma.documentSignature.create({
      data: {
        document_id: documentId,
        user_id,
        signer_name,
        signer_email: normalizedEmail,
        signature_image_url: signatureImageUrl,
        signature_type,
        signed_at: signedAt,
        ip_address: ip_address || null,
        user_agent: user_agent || null,
        verification_hash: verificationHash,
        position: position ? JSON.stringify(position) : null,
        status: 'COMPLETED',
        is_verified: false,
      },
    });

    // Stamp PDF (non-blocking)
    try {
      const fileMetadata = JSON.parse(document.file);
      const containerClient = await getContainerClient();
      const blockBlobClient = containerClient.getBlockBlobClient(fileMetadata.blobName);
      const downloadResponse = await blockBlobClient.download();

      if (downloadResponse.readableStreamBody) {
        const chunks: Buffer[] = [];
        for await (const chunk of downloadResponse.readableStreamBody) {
          chunks.push(Buffer.from(chunk));
        }
        const pdfBuffer = Buffer.concat(chunks);
        const signedPdfBuffer = await addSignatureToPDF(
          pdfBuffer, signatureImageUrl, signer_name, signedAt, position
        );

        const signedBlobName = fileMetadata.blobName.replace('.pdf', `_signed_${Date.now()}.pdf`);
        const signedBlockBlobClient = containerClient.getBlockBlobClient(signedBlobName);
        await signedBlockBlobClient.upload(signedPdfBuffer, signedPdfBuffer.length, {
          blobHTTPHeaders: { blobContentType: 'application/pdf' },
        });

        await prisma.organizationDocument.update({
          where: { document_id: documentId },
          data: {
            file: JSON.stringify({
              ...fileMetadata,
              blobName: signedBlobName,
              url: signedBlockBlobClient.url,
              signed: true,
            }),
          },
        });
      }
    } catch (pdfError) {
      console.error('PDF stamp error (non-fatal):', pdfError);
    }

    return sendSuccess(res, {
      message: 'Document signed successfully',
      data: {
        signature_id: signature.signature_id,
        document_id: documentId,
        signer_name: signature.signer_name,
        signed_at: signature.signed_at,
        verification_hash: signature.verification_hash,
        is_verified: signature.is_verified,
      },
    }, 201);
  } catch (err: any) {
    console.error('Error creating signature:', err);
    return sendError(res, 'Failed to create signature', 500);
  }
};

// ─── Get Signatures ───────────────────────────────────────────────────────────

export const getDocumentSignatures = async (req: Request, res: Response) => {
  try {
    const { documentId } = req.params;

    const signatures = await prisma.documentSignature.findMany({
      where: { document_id: documentId },
      include: {
        user: {
          select: { user_id: true, name: true, email: true },
        },
      },
      orderBy: { signed_at: 'desc' },
    });

    return sendSuccess(res, { data: signatures, count: signatures.length });
  } catch (err: any) {
    console.error('Error fetching signatures:', err);
    return sendError(res, 'Failed to fetch signatures', 500);
  }
};

// ─── Verify Signature ─────────────────────────────────────────────────────────

export const verifySignature = async (req: Request, res: Response) => {
  try {
    const { signatureId } = req.params;

    const signature = await prisma.documentSignature.findUnique({
      where: { signature_id: signatureId },
      include: {
        document: { select: { document_id: true, document_name: true } },
        user: { select: { user_id: true, name: true, email: true } },
      },
    });

    if (!signature) return sendError(res, 'Signature not found', 404);

    // Cannot verify a rejected signature
    if (signature.status === 'REJECTED') {
      return sendError(res, 'Cannot verify a rejected signature', 400);
    }

    if (signature.is_verified) {
      return sendSuccess(res, {
        data: {
          signature_id: signature.signature_id,
          document_name: signature.document.document_name,
          signer_name: signature.signer_name,
          signer_email: signature.signer_email,
          signed_at: signature.signed_at,
          is_valid: true,
          already_verified: true,
          verification_hash: signature.verification_hash,
        },
      });
    }

    const expectedHash = generateSignatureHash(
      signature.document_id,
      signature.user_id,
      signature.signed_at
    );
    const isValid = signature.verification_hash === expectedHash;

    if (isValid) {
      await prisma.documentSignature.update({
        where: { signature_id: signatureId },
        data: { is_verified: true },
      });
    }

    return sendSuccess(res, {
      data: {
        signature_id: signature.signature_id,
        document_name: signature.document.document_name,
        signer_name: signature.signer_name,
        signer_email: signature.signer_email,
        signed_at: signature.signed_at,
        is_valid: isValid,
        already_verified: false,
        verification_hash: signature.verification_hash,
      },
    });
  } catch (err: any) {
    console.error('Error verifying signature:', err);
    return sendError(res, 'Failed to verify signature', 500);
  }
};

// ─── Reject Signature ─────────────────────────────────────────────────────────

export const rejectSignature = async (req: Request, res: Response) => {
  try {
    const { signatureId } = req.params;
    const { rejected_by, rejection_reason } = req.body;

    if (!rejected_by) {
      return sendError(res, 'rejected_by (user_id) is required', 400);
    }
    if (!rejection_reason || !rejection_reason.trim()) {
      return sendError(res, 'A rejection reason is required', 400);
    }

    const signature = await prisma.documentSignature.findUnique({
      where: { signature_id: signatureId },
    });

    if (!signature) return sendError(res, 'Signature not found', 404);

    if (signature.status === 'REJECTED') {
      return sendError(res, 'This signature has already been rejected', 409);
    }

    const updated = await prisma.documentSignature.update({
      where: { signature_id: signatureId },
      data: {
        status: 'REJECTED',
        is_verified: false,
        rejected_at: new Date(),
        rejection_reason: rejection_reason.trim(),
        rejected_by,
      },
    });

    return sendSuccess(res, {
      message: 'Signature rejected successfully',
      data: {
        signature_id: updated.signature_id,
        status: updated.status,
        rejection_reason: updated.rejection_reason,
        rejected_at: updated.rejected_at,
      },
    });
  } catch (err: any) {
    console.error('Error rejecting signature:', err);
    return sendError(res, 'Failed to reject signature', 500);
  }
};

// ─── Audit Trail ─────────────────────────────────────────────────────────────

export const getSignatureAuditTrail = async (req: Request, res: Response) => {
  try {
    const { documentId } = req.params;

    const auditTrail = await prisma.documentSignature.findMany({
      where: { document_id: documentId },
      select: {
        signature_id: true,
        signer_name: true,
        signer_email: true,
        signed_at: true,
        ip_address: true,
        signature_type: true,
        status: true,
        verification_hash: true,
        signature_image_url: true,
        is_verified: true,
        rejection_reason: true,
        rejected_at: true,
        rejected_by: true,
      },
      orderBy: { signed_at: 'asc' },
    });

    return sendSuccess(res, {
      data: {
        document_id: documentId,
        total_signatures: auditTrail.length,
        audit_trail: auditTrail,
      },
    });
  } catch (err: any) {
    console.error('Error fetching audit trail:', err);
    return sendError(res, 'Failed to fetch audit trail', 500);
  }
};

// ─── Request Signature ────────────────────────────────────────────────────────

export const requestSignature = async (req: Request, res: Response) => {
  try {
    const { documentId } = req.params;
    const { recipient_email, recipient_name, message } = req.body;

    if (!recipient_email || !recipient_name) {
      return sendError(res, 'Recipient email and name are required', 400);
    }

    const document = await prisma.organizationDocument.findUnique({
      where: { document_id: documentId },
    });
    if (!document) return sendError(res, 'Document not found', 404);

    const normalizedEmail = recipient_email.toLowerCase().trim();

    // ── Guard: don't send a request if a non-rejected signature exists ────────
    const alreadySigned = await prisma.documentSignature.findFirst({
      where: {
        document_id: documentId,
        signer_email: normalizedEmail,
        status: { not: 'REJECTED' },
      },
    });

    if (alreadySigned) {
      return sendError(
        res,
        `${recipient_email} has already signed this document.`,
        409
      );
    }
    // ─────────────────────────────────────────────────────────────────────────

    const signatureRequest = await prisma.signatureRequest.create({
      data: {
        document_id: documentId,
        recipient_email: normalizedEmail,
        recipient_name,
        message: message || null,
        status: 'PENDING',
        request_token: crypto.randomBytes(32).toString('hex'),
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    return sendSuccess(res, {
      message: 'Signature request sent successfully',
      data: {
        request_id: signatureRequest.request_id,
        recipient_email: signatureRequest.recipient_email,
        status: signatureRequest.status,
        expires_at: signatureRequest.expires_at,
      },
    }, 201);
  } catch (err: any) {
    console.error('Error requesting signature:', err);
    return sendError(res, 'Failed to request signature', 500);
  }
};

// ─── Get Signature Image ──────────────────────────────────────────────────────

export const getSignatureImage = async (req: Request, res: Response) => {
  try {
    const { signatureId } = req.params;

    const signature = await prisma.documentSignature.findUnique({
      where: { signature_id: signatureId },
      select: { signature_image_url: true, signer_name: true },
    });

    if (!signature) return sendError(res, 'Signature not found', 404);

    const containerClient = await getSignatureContainerClient();
    const blobUrl = new URL(signature.signature_image_url);
    const blobName = blobUrl.pathname.replace(`/${signatureContainerName}/`, '');

    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
    const exists = await blockBlobClient.exists();
    if (!exists) return sendError(res, 'Signature image not found in storage', 404);

    const downloadResponse = await blockBlobClient.download();
    if (!downloadResponse.readableStreamBody) {
      return sendError(res, 'Failed to stream signature image', 500);
    }

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.setHeader('Access-Control-Allow-Origin', process.env.FRONTEND_URL || '*');

    downloadResponse.readableStreamBody.pipe(res);
  } catch (err: any) {
    console.error('Error serving signature image:', err);
    return sendError(res, 'Failed to serve signature image', 500);
  }
};