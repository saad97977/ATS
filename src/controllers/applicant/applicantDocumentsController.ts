import prisma from '../../prisma.config';
import { Request, Response } from 'express';
import { sendSuccess, sendError } from '../../utils/response';
import { BlobServiceClient } from '@azure/storage-blob';

/**
 * Applicant Document CRUD Controller with Azure Blob Storage
 * 
 * Validation Rules:
 * - applicant_id: Required UUID
 * - document_type: Required document type (e.g., "Resume", "Cover Letter", "ID Proof", etc.)
 * - file_url: File upload (PDF, images, documents) - stored in Azure Blob Storage
 */

// Initialize Azure Blob Service Client
if (!process.env.AZURE_STORAGE_CONNECTION_STRING) {
  throw new Error('AZURE_STORAGE_CONNECTION_STRING is not defined in environment variables');
}

const blobServiceClient = BlobServiceClient.fromConnectionString(
  process.env.AZURE_STORAGE_CONNECTION_STRING
);

const containerName = process.env.AZURE_CONTAINER_NAME || 'applicant-documents';

/**
 * Get container client (creates container if it doesn't exist)
 */
const getContainerClient = async () => {
  const containerClient = blobServiceClient.getContainerClient(containerName);
  
  // Create container if it doesn't exist
  await containerClient.createIfNotExists({
    access: 'blob', // Public read access for blobs
  });
  
  return containerClient;
};

/**
 * Generate unique blob name
 */
const generateBlobName = (applicantId: string, originalName: string): string => {
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8);
  const sanitizedName = originalName.replace(/[^a-zA-Z0-9.-]/g, '_');
  return `${applicantId}/${timestamp}-${randomStr}-${sanitizedName}`;
};

/**
 * Create Applicant Document with File Upload to Azure Blob
 */
export const createApplicantDocumentWithFile = async (req: Request, res: Response) => {
  try {
    const { applicant_id, document_type } = req.body;
    const file = (req as any).file;

    // Validate required fields
    if (!applicant_id) {
      return sendError(res, 'Applicant ID is required', 400);
    }
    if (!document_type) {
      return sendError(res, 'Document type is required', 400);
    }
    if (!file) {
      return sendError(res, 'Document file is required', 400);
    }

    // Check if applicant exists
    const applicant = await prisma.applicant.findUnique({
      where: { applicant_id },
    });

    if (!applicant) {
      return sendError(res, 'Applicant not found', 404);
    }

    // Upload to Azure Blob Storage
    const containerClient = await getContainerClient();
    const blobName = generateBlobName(applicant_id, file.originalname);
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);

    // Upload file buffer to Azure
    await blockBlobClient.upload(file.buffer, file.buffer.length, {
      blobHTTPHeaders: {
        blobContentType: file.mimetype,
      },
    });

    // Get the blob URL
    const fileUrl = blockBlobClient.url;

    // Store metadata in database
    const fileMetadata = {
      originalFileName: file.originalname,
      mimeType: file.mimetype,
      blobName: blobName,
      size: file.size,
      url: fileUrl,
    };

    // Create document record in database
    const newDocument = await prisma.applicantDocument.create({
      data: {
        applicant_id,
        document_type,
        file_url: JSON.stringify(fileMetadata),
      },
    });

    return sendSuccess(res, {
      message: 'Document uploaded successfully',
      data: newDocument,
      file: {
        filename: file.originalname,
        originalName: file.originalname,
        size: file.size,
        mimeType: file.mimetype,
        url: fileUrl,
      },
    }, 201);
  } catch (err: any) {
    console.error('Error uploading document:', err);
    return sendError(res, 'Failed to upload document', 500);
  }
};

/**
 * Update Applicant Document with Optional File Upload
 */
export const updateApplicantDocumentWithFile = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { document_type } = req.body;
    const file = (req as any).file;

    // Check if document exists
    const existingDocument = await prisma.applicantDocument.findUnique({
      where: { applicant_document_id: id },
    });

    if (!existingDocument) {
      return sendError(res, 'Applicant Document not found', 404);
    }

    // Prepare update data
    const updateData: any = {};

    if (document_type) {
      updateData.document_type = document_type;
    }

    if (file) {
      // Delete old file from Azure if it exists
      if (existingDocument.file_url) {
        try {
          const oldMetadata = JSON.parse(existingDocument.file_url);
          if (oldMetadata.blobName) {
            const containerClient = await getContainerClient();
            const oldBlobClient = containerClient.getBlockBlobClient(oldMetadata.blobName);
            await oldBlobClient.deleteIfExists();
          }
        } catch (err) {
          console.warn('Error deleting old blob:', err);
        }
      }

      // Upload new file to Azure
      const containerClient = await getContainerClient();
      const blobName = generateBlobName(existingDocument.applicant_id, file.originalname);
      const blockBlobClient = containerClient.getBlockBlobClient(blobName);

      await blockBlobClient.upload(file.buffer, file.buffer.length, {
        blobHTTPHeaders: {
          blobContentType: file.mimetype,
        },
      });

      const fileUrl = blockBlobClient.url;

      const fileMetadata = {
        originalFileName: file.originalname,
        mimeType: file.mimetype,
        blobName: blobName,
        size: file.size,
        url: fileUrl,
      };

      updateData.file_url = JSON.stringify(fileMetadata);
    }

    // If no updates provided
    if (Object.keys(updateData).length === 0) {
      return sendError(res, 'No fields to update', 400);
    }

    // Update document in database
    const updatedDocument = await prisma.applicantDocument.update({
      where: { applicant_document_id: id },
      data: updateData,
    });

    return sendSuccess(res, {
      message: 'Document updated successfully',
      data: updatedDocument,
      ...(file && {
        file: {
          filename: file.originalname,
          originalName: file.originalname,
          size: file.size,
          mimeType: file.mimetype,
        },
      }),
    });
  } catch (err: any) {
    console.error('Error updating document:', err);
    return sendError(res, 'Failed to update document', 500);
  }
};

/**
 * Download Applicant Document from Azure Blob
 */
export const downloadApplicantDocument = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Get document from database
    const document = await prisma.applicantDocument.findUnique({
      where: { applicant_document_id: id },
    });

    if (!document) {
      return sendError(res, 'Applicant Document not found', 404);
    }

    if (!document.file_url) {
      return sendError(res, 'Document file not found', 404);
    }

    try {
      // Parse file metadata
      const fileMetadata = JSON.parse(document.file_url);
      
      if (!fileMetadata.blobName) {
        return sendError(res, 'Document blob reference not found', 404);
      }

      // Download from Azure Blob Storage
      const containerClient = await getContainerClient();
      const blockBlobClient = containerClient.getBlockBlobClient(fileMetadata.blobName);

      // Check if blob exists
      const exists = await blockBlobClient.exists();
      if (!exists) {
        return sendError(res, 'Document file not found in storage', 404);
      }

      // Download blob
      const downloadResponse = await blockBlobClient.download();
      
      if (!downloadResponse.readableStreamBody) {
        return sendError(res, 'Failed to download document', 500);
      }

      // Set response headers
      const originalFileName = fileMetadata.originalFileName || `${document.document_type}.pdf`;
      const sanitizedFileName = originalFileName
        .replace(/[^a-zA-Z0-9._\- ]/g, '')
        .replace(/\s+/g, '_')
        .trim();

      const mimeType = fileMetadata.mimeType || 'application/octet-stream';

      res.setHeader('Content-Type', mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${sanitizedFileName}"`);
      if (downloadResponse.contentLength) {
        res.setHeader('Content-Length', downloadResponse.contentLength);
      }
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

      // Stream the blob to response
      downloadResponse.readableStreamBody.pipe(res);

    } catch (err: any) {
      console.error('Error downloading from Azure:', err);
      return sendError(res, 'Failed to download document', 500);
    }
  } catch (err: any) {
    console.error('Error downloading document:', err);
    return sendError(res, 'Failed to download document', 500);
  }
};

/**
 * Get All Applicant Documents (without file data)
 */
export const getAllApplicantDocuments = async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 10));
    const skip = (page - 1) * limit;

    const [documents, total] = await Promise.all([
      prisma.applicantDocument.findMany({
        skip,
        take: limit,
        select: {
          applicant_document_id: true,
          applicant_id: true,
          document_type: true,
        },
        orderBy: { applicant_document_id: 'desc' },
      }),
      prisma.applicantDocument.count(),
    ]);

    return sendSuccess(res, {
      data: documents,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err: any) {
    console.error('Error fetching documents:', err);
    return sendError(res, 'Failed to fetch documents', 500);
  }
};

/**
 * Get Single Applicant Document by ID (without file data)
 */
export const getApplicantDocumentById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const document = await prisma.applicantDocument.findUnique({
      where: { applicant_document_id: id },
      select: {
        applicant_document_id: true,
        applicant_id: true,
        document_type: true,
      },
    });

    if (!document) {
      return sendError(res, 'Applicant Document not found', 404);
    }

    return sendSuccess(res, {
      data: document,
    });
  } catch (err: any) {
    console.error('Error fetching document:', err);
    return sendError(res, 'Failed to fetch document', 500);
  }
};

/**
 * Delete Applicant Document (also deletes from Azure Blob)
 */
export const deleteApplicantDocument = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const document = await prisma.applicantDocument.findUnique({
      where: { applicant_document_id: id },
    });

    if (!document) {
      return sendError(res, 'Applicant Document not found', 404);
    }

    // Delete from Azure Blob Storage
    if (document.file_url) {
      try {
        const fileMetadata = JSON.parse(document.file_url);
        if (fileMetadata.blobName) {
          const containerClient = await getContainerClient();
          const blockBlobClient = containerClient.getBlockBlobClient(fileMetadata.blobName);
          await blockBlobClient.deleteIfExists();
        }
      } catch (err) {
        console.warn('Error deleting blob from Azure:', err);
        // Continue with database deletion even if blob deletion fails
      }
    }

    // Delete from database
    await prisma.applicantDocument.delete({
      where: { applicant_document_id: id },
    });

    return sendSuccess(res, {
      message: 'Document deleted successfully',
      data: { applicant_document_id: id },
    });
  } catch (err: any) {
    console.error('Error deleting document:', err);
    return sendError(res, 'Failed to delete document', 500);
  }
};

/**
 * Get All Documents by Applicant ID
 */
export const getDocumentsByApplicantId = async (req: Request, res: Response) => {
  try {
    const { applicant_id } = req.params;

    // Check if applicant exists
    const applicant = await prisma.applicant.findUnique({
      where: { applicant_id },
    });

    if (!applicant) {
      return sendError(res, 'Applicant not found', 404);
    }

    // Get all documents for this applicant
    const documents = await prisma.applicantDocument.findMany({
      where: { applicant_id },
      select: {
        applicant_document_id: true,
        applicant_id: true,
        document_type: true,
      },
      orderBy: { applicant_document_id: 'desc' },
    });

    return sendSuccess(res, {
      message: `Found ${documents.length} document(s) for applicant`,
      data: documents,
      count: documents.length,
    });
  } catch (err: any) {
    console.error('Error fetching documents by applicant:', err);
    return sendError(res, 'Failed to fetch documents', 500);
  }
};