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

const CONTAINER_ONBOARDING = process.env.AZURE_ONBOARDING_DOCS_CONTAINER || 'onboarding-documents';

const parseContainerFromUrl = (url: string): string | null => {
  try {
    const { pathname } = new URL(url);
    const parts = pathname.split('/').filter(Boolean);
    return parts[0] ?? null;
  } catch {
    return null;
  }
};

const getContainerClientFor = async (fileMetadata: { containerName?: string; url?: string }) => {
  let name = containerName;
  if (fileMetadata.containerName) {
    name = fileMetadata.containerName;
  } else if (fileMetadata.url) {
    name = parseContainerFromUrl(fileMetadata.url) || containerName;
  }
  const cc = blobServiceClient.getContainerClient(name);
  await cc.createIfNotExists({ access: 'blob' });
  return cc;
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

// /**
//  * Download Applicant Document from Azure Blob
//  */
// export const downloadApplicantDocument = async (req: Request, res: Response) => {
//   try {
//     const { id } = req.params;

//     // Get document from database
//     const document = await prisma.applicantDocument.findUnique({
//       where: { applicant_document_id: id },
//     });

//     if (!document) {
//       return sendError(res, 'Applicant Document not found', 404);
//     }

//     if (!document.file_url) {
//       return sendError(res, 'Document file not found', 404);
//     }

//     try {
//       // Parse file metadata
//       const fileMetadata = JSON.parse(document.file_url);
      
//       if (!fileMetadata.blobName) {
//         return sendError(res, 'Document blob reference not found', 404);
//       }

//       // Download from Azure Blob Storage
//       const containerClient = await getContainerClient();
//       const blockBlobClient = containerClient.getBlockBlobClient(fileMetadata.blobName);

//       // Check if blob exists
//       const exists = await blockBlobClient.exists();
//       if (!exists) {
//         return sendError(res, 'Document file not found in storage', 404);
//       }

//       // Download blob
//       const downloadResponse = await blockBlobClient.download();
      
//       if (!downloadResponse.readableStreamBody) {
//         return sendError(res, 'Failed to download document', 500);
//       }

//       // Set response headers
//       const originalFileName = fileMetadata.originalFileName || `${document.document_type}.pdf`;
//       const sanitizedFileName = originalFileName
//         .replace(/[^a-zA-Z0-9._\- ]/g, '')
//         .replace(/\s+/g, '_')
//         .trim();

//       const mimeType = fileMetadata.mimeType || 'application/octet-stream';

//       res.setHeader('Content-Type', mimeType);
//       res.setHeader('Content-Disposition', `attachment; filename="${sanitizedFileName}"`);
//       if (downloadResponse.contentLength) {
//         res.setHeader('Content-Length', downloadResponse.contentLength);
//       }
//       res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

//       // Stream the blob to response
//       downloadResponse.readableStreamBody.pipe(res);

//     } catch (err: any) {
//       console.error('Error downloading from Azure:', err);
//       return sendError(res, 'Failed to download document', 500);
//     }
//   } catch (err: any) {
//     console.error('Error downloading document:', err);
//     return sendError(res, 'Failed to download document', 500);
//   }
// };

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


/**
 * Stream a document (view inline or force download).
 * Resolves the correct Azure container (applicant-documents vs onboarding-documents)
 * from the stored metadata, the same way assignmentController does.
 */
const streamApplicantDocument = async (req: Request, res: Response, forceDownload: boolean) => {
  try {
    const { id } = req.params;

    const document = await prisma.applicantDocument.findUnique({
      where: { applicant_document_id: id },
    });

    if (!document) return sendError(res, 'Applicant Document not found', 404);
    if (!document.file_url) return sendError(res, 'Document file not found', 404);

    let fileMetadata: any = {};
    try {
      fileMetadata = typeof document.file_url === 'string' ? JSON.parse(document.file_url) : document.file_url;
    } catch {
      fileMetadata = { url: document.file_url };
    }

    if (!fileMetadata.blobName) {
      if (fileMetadata.url) return res.redirect(302, fileMetadata.url);
      return sendError(res, 'Document file reference not found', 404);
    }

    const containerClient = await getContainerClientFor(fileMetadata);
    const blockBlobClient = containerClient.getBlockBlobClient(fileMetadata.blobName);

    const exists = await blockBlobClient.exists();
    if (!exists) return sendError(res, 'Document file not found in storage', 404);

    const downloadResponse = await blockBlobClient.download();
    if (!downloadResponse.readableStreamBody) {
      return sendError(res, 'Failed to read document from storage', 500);
    }

    const mimeType = fileMetadata.mimeType || 'application/octet-stream';
    const originalFileName = fileMetadata.originalFileName || `${document.document_type}.pdf`;
    const sanitizedFileName = originalFileName.replace(/[^a-zA-Z0-9._\- ]/g, '').replace(/\s+/g, '_').trim();

    const disposition = forceDownload
      ? `attachment; filename="${sanitizedFileName}"`
      : (mimeType.startsWith('image/') || mimeType === 'application/pdf'
          ? 'inline'
          : `attachment; filename="${sanitizedFileName}"`);

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', disposition);
    res.setHeader('Cache-Control', forceDownload ? 'no-cache, no-store, must-revalidate' : 'private, max-age=3600');
    if (downloadResponse.contentLength) res.setHeader('Content-Length', String(downloadResponse.contentLength));

    downloadResponse.readableStreamBody.pipe(res);
  } catch (err: any) {
    console.error('[streamApplicantDocument] error:', err);
    return sendError(res, 'Failed to stream document', 500);
  }
};

export const viewApplicantDocument = (req: Request, res: Response) => streamApplicantDocument(req, res, false);
export const downloadApplicantDocument = (req: Request, res: Response) => streamApplicantDocument(req, res, true);




/**
 * Get all applicants with their documents, paginated by applicant.
 * Each applicant entry includes all of their documents (resume, cover letter,
 * onboarding docs, etc.) with view/download links.
 *
 * GET /api/applicant-documents/all?page=&limit=&search=
 */
export const getApplicantAllDocuments = async (req: Request, res: Response) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 10));
    const skip  = (page - 1) * limit;
    const search = (req.query.search as string)?.trim();

    // Only include applicants who have at least one document
    const where: any = { documents: { some: {} } };
    if (search) {
      where.full_name = { contains: search, mode: 'insensitive' };
    }

    const [applicants, total] = await Promise.all([
      prisma.applicant.findMany({
        where,
        skip,
        take: limit,
        orderBy: { created_at : 'desc' },
        select: {
          applicant_id: true,
          full_name: true,
          first_name: true,
          last_name: true,
          contact: { select: { email: true, phone: true } },
          documents: {
            orderBy: { created_at: 'desc' },
            include: {
              application: {
                select: {
                  application_id: true,
                  status: true,
                  job: { select: { job_id: true, job_title: true, organization: { select: { name: true } } } },
                },
              },
            },
          },
        },
      }),
      prisma.applicant.count({ where }),
    ]);

    const data = applicants.map((a) => {
      const documents = a.documents.map((doc) => {
        let fileInfo: any = {};
        try {
          fileInfo = typeof doc.file_url === 'string' ? JSON.parse(doc.file_url) : (doc.file_url ?? {});
        } catch {
          fileInfo = { url: doc.file_url };
        }

        const id = doc.applicant_document_id;

        return {
          document_id:    id,
          document_type:  doc.document_type,
          document_name:  fileInfo.originalFileName ?? doc.document_type?.replace(/_/g, ' ') ?? 'Document',
          mime_type:      fileInfo.mimeType ?? null,
          size:           fileInfo.size ?? null,
          created_at:     doc.created_at,
          application_id: doc.application_id,
          application:    doc.application
            ? {
                application_id: doc.application.application_id,
                status:         doc.application.status,
                job_title:      doc.application.job?.job_title ?? null,
                organization:   doc.application.job?.organization?.name ?? null,
              }
            : null,
          view_url:     `/api/applicant-documents/${id}/view`,
          download_url: `/api/applicant-documents/${id}/download`,
        };
      });

      return {
        applicant: {
          applicant_id: a.applicant_id,
          full_name:    a.full_name,
          first_name:   a.first_name,
          last_name:    a.last_name,
          contact:      a.contact,
        },
        document_count: documents.length,
        documents,
      };
    });

    return sendSuccess(res, {
      data,
      paging: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (err: any) {
    console.error('Error fetching applicant documents:', err);
    return sendError(res, 'Failed to fetch applicant documents', 500);
  }
};