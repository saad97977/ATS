import prisma from '../../prisma.config';
import { Request, Response } from 'express';
import { sendSuccess, sendError } from '../../utils/response';
import { BlobServiceClient } from '@azure/storage-blob';

/**
 * Organization Document CRUD Controller with Azure Blob Storage
 * 
 * Validation Rules:
 * - organization_id: Required UUID
 * - document_title_id: Required UUID (reference to document title)
 * - document_type: Required document type
 * - document_name: Required document name
 * - user_id: Required UUID (uploader)
 * - file: File upload (PDF, images, documents) - stored in Azure Blob Storage
 * - privacy: PUBLIC or PRIVATE
 * - expiration_date: Optional date
 */

// Initialize Azure Blob Service Client
if (!process.env.AZURE_STORAGE_CONNECTION_STRING) {
  throw new Error('AZURE_STORAGE_CONNECTION_STRING is not defined in environment variables');
}

const blobServiceClient = BlobServiceClient.fromConnectionString(
  process.env.AZURE_STORAGE_CONNECTION_STRING
);

const containerName = process.env.AZURE_ORG_DOCS_CONTAINER_NAME || 'organization-documents';

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
const generateBlobName = (organizationId: string, originalName: string): string => {
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8);
  const sanitizedName = originalName.replace(/[^a-zA-Z0-9.-]/g, '_');
  return `${organizationId}/${timestamp}-${randomStr}-${sanitizedName}`;
};



/**
 * Create Organization Document with File Upload to Azure Blob
 */
export const createOrganizationDocumentWithFile = async (req: Request, res: Response) => {
  try {
    const { organization_id, document_title_id, document_type, document_name, user_id, privacy, expiration_date } = req.body;
    const file = (req as any).file;

    // Validate required fields
    if (!organization_id) {
      return sendError(res, 'Organization ID is required', 400);
    }
    if (!document_title_id) {
      return sendError(res, 'Document Title ID is required', 400);
    }
    if (!document_type) {
      return sendError(res, 'Document type is required', 400);
    }
    if (!document_name) {
      return sendError(res, 'Document name is required', 400);
    }
    if (!user_id) {
      return sendError(res, 'User ID is required', 400);
    }
    if (!file) {
      return sendError(res, 'Document file is required', 400);
    }
    if (!privacy || !['PUBLIC', 'PRIVATE'].includes(privacy)) {
      return sendError(res, 'Privacy level must be PUBLIC or PRIVATE', 400);
    }

    // Check if organization exists
    const organization = await prisma.organization.findUnique({
      where: { organization_id },
    });

    if (!organization) {
      return sendError(res, 'Organization not found', 404);
    }

    // Check if document title exists
    const documentTitle = await prisma.organizationDocumentTitle.findUnique({
      where: { document_title_id },
    });

    if (!documentTitle) {
      return sendError(res, 'Document Title not found', 404);
    }

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { user_id },
    });

    if (!user) {
      return sendError(res, 'User not found', 404);
    }

    // ✅ NEW: Check if document name already exists under this document title
    const existingDocument = await prisma.organizationDocument.findFirst({
      where: {
        document_title_id,
        document_name,
      },
    });

    if (existingDocument) {
      return sendError(
        res, 
        `A document with the name "${document_name}" already exists under this document title. Please use a different name.`, 
        409
      );
    }

    // Upload to Azure Blob Storage
    const containerClient = await getContainerClient();
    const blobName = generateBlobName(organization_id, file.originalname);
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);

    // Upload file buffer to Azure
    await blockBlobClient.upload(file.buffer, file.buffer.length, {
      blobHTTPHeaders: {
        blobContentType: file.mimetype,
      },
      metadata: {
        organizationId: organization_id,
        documentType: document_type,
        privacy: privacy,
        uploadedBy: user_id,
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
    const newDocument = await prisma.organizationDocument.create({
      data: {
        organization_id,
        document_title_id,
        document_type,
        document_name,
        user_id,
        file: JSON.stringify(fileMetadata),
        privacy,
        expiration_date: expiration_date ? new Date(expiration_date) : null,
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

    // Handle unique constraint violation (backup check)
    if (err.code === 'P2002' && err.meta?.target?.includes('document_name')) {
      return sendError(res, 'A document with this name already exists. Please use a different name.', 409);
    }

    return sendError(res, 'Failed to upload document', 500);
  }
};

/**
 * Update Organization Document with Optional File Upload
 */
export const updateOrganizationDocumentWithFile = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { document_title_id, document_type, document_name, privacy, expiration_date } = req.body;
    const file = (req as any).file;

    // Check if document exists
    const existingDocument = await prisma.organizationDocument.findUnique({
      where: { document_id: id },
    });

    if (!existingDocument) {
      return sendError(res, 'Organization Document not found', 404);
    }

    // Prepare update data
    const updateData: any = {};

    if (document_title_id) {
      // Validate document title exists
      const documentTitle = await prisma.organizationDocumentTitle.findUnique({
        where: { document_title_id },
      });

      if (!documentTitle) {
        return sendError(res, 'Document Title not found', 404);
      }

      updateData.document_title_id = document_title_id;
    }

    if (document_type) {
      updateData.document_type = document_type;
    }

    if (document_name) {
      updateData.document_name = document_name;
    }

    if (privacy && ['PUBLIC', 'PRIVATE'].includes(privacy)) {
      updateData.privacy = privacy;
    }

    if (expiration_date) {
      updateData.expiration_date = new Date(expiration_date);
    }

    // ✅ NEW: Check if document name already exists under the target document title
    if (document_name || document_title_id) {
      const targetDocumentTitleId = document_title_id || existingDocument.document_title_id;
      const targetDocumentName = document_name || existingDocument.document_name;

      const duplicateDocument = await prisma.organizationDocument.findFirst({
        where: {
          document_title_id: targetDocumentTitleId,
          document_name: targetDocumentName,
          document_id: {
            not: id, // Exclude the current document being updated
          },
        },
      });

      if (duplicateDocument) {
        return sendError(
          res, 
          `A document with the name "${targetDocumentName}" already exists under this document title. Please use a different name.`, 
          409
        );
      }
    }

    if (file) {
      // Delete old file from Azure if it exists
      if (existingDocument.file) {
        try {
          const oldMetadata = JSON.parse(existingDocument.file);
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
      const blobName = generateBlobName(existingDocument.organization_id, file.originalname);
      const blockBlobClient = containerClient.getBlockBlobClient(blobName);

      await blockBlobClient.upload(file.buffer, file.buffer.length, {
        blobHTTPHeaders: {
          blobContentType: file.mimetype,
        },
        metadata: {
          organizationId: existingDocument.organization_id,
          documentType: document_type || existingDocument.document_type,
          privacy: privacy || existingDocument.privacy,
          uploadedBy: existingDocument.user_id,
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

      updateData.file = JSON.stringify(fileMetadata);
    }

    // If no updates provided
    if (Object.keys(updateData).length === 0) {
      return sendError(res, 'No fields to update', 400);
    }

    // Update document in database
    const updatedDocument = await prisma.organizationDocument.update({
      where: { document_id: id },
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

    // Handle unique constraint violation (backup check)
    if (err.code === 'P2002' && err.meta?.target?.includes('document_name')) {
      return sendError(res, 'A document with this name already exists. Please use a different name.', 409);
    }

    return sendError(res, 'Failed to update document', 500);
  }
};


/**
 * Download Organization Document from Azure Blob
 */
export const downloadOrganizationDocument = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Get document from database
    const document = await prisma.organizationDocument.findUnique({
      where: { document_id: id },
    });

    if (!document) {
      return sendError(res, 'Organization Document not found', 404);
    }

    if (!document.file) {
      return sendError(res, 'Document file not found', 404);
    }

    try {
      // Parse file metadata
      const fileMetadata = JSON.parse(document.file);
      
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
      const originalFileName = fileMetadata.originalFileName || `${document.document_name}.pdf`;
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
 * Get All Organization Documents (without file data)
 */
export const getAllOrganizationDocuments = async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 10));
    const skip = (page - 1) * limit;

    const [documents, total] = await Promise.all([
      prisma.organizationDocument.findMany({
        skip,
        take: limit,
        select: {
          document_id: true,
          organization_id: true,
          document_title_id: true,
          document_type: true,
          document_name: true,
          user_id: true,
          privacy: true,
          expiration_date: true,
          upload_date: true,
          file: true,
          // Include related data
          organization: {
            select: {
              organization_id: true,
              name: true,
              website: true,
              status: true,
            }
          },
          title: {
            select: {
              document_title_id: true,
              document_title: true,
            }
          },
          user: {
            select: {
              user_id: true,
              name: true,
              email: true,
            }
          }
        },
        orderBy: { upload_date: 'desc' },
      }),
      prisma.organizationDocument.count(),
    ]);

    // Transform documents to include file URL
    const documentsWithFileUrl = documents.map(doc => {
      let fileUrl = null;
      if (doc.file) {
        try {
          const fileMetadata = JSON.parse(doc.file);
          fileUrl = fileMetadata.url || null;
        } catch (err) {
          console.warn(`Failed to parse file metadata for document ${doc.document_id}`);
        }
      }

      return {
        document_id: doc.document_id,
        document_name: doc.document_name,
        document_type: doc.document_type,
        privacy: doc.privacy,
        expiration_date: doc.expiration_date,
        upload_date: doc.upload_date,
        file_url: fileUrl,
        organization: doc.organization,
        document_title: doc.title,
        uploaded_by: doc.user,
      };
    });

    // Create hierarchical structure: Organization -> DocumentTitle -> Documents
    const hierarchy: any = {};

    documentsWithFileUrl.forEach(doc => {
      const orgId = doc.organization.organization_id;
      const orgName = doc.organization.name;
      const titleId = doc.document_title.document_title_id;
      const titleName = doc.document_title.document_title;

      // Initialize organization if not exists
      if (!hierarchy[orgId]) {
        hierarchy[orgId] = {
          organization_id: orgId,
          organization_name: orgName,
          organization_status: doc.organization.status,
          organization_website: doc.organization.website,
          document_titles: {},
        };
      }

      // Initialize document title if not exists
      if (!hierarchy[orgId].document_titles[titleId]) {
        hierarchy[orgId].document_titles[titleId] = {
          document_title_id: titleId,
          document_title: titleName,
          documents: [],
        };
      }

      // Add document to the title
      hierarchy[orgId].document_titles[titleId].documents.push({
        document_id: doc.document_id,
        document_name: doc.document_name,
        document_type: doc.document_type,
        privacy: doc.privacy,
        expiration_date: doc.expiration_date,
        upload_date: doc.upload_date,
        file_url: doc.file_url,
        uploaded_by: doc.uploaded_by,
      });
    });

    // Convert hierarchy object to array format
    const hierarchicalData = Object.values(hierarchy).map((org: any) => ({
      ...org,
      document_titles: Object.values(org.document_titles),
    }));

    return sendSuccess(res, {
      data: hierarchicalData,
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
   * View Organization Document Inline (like classroom - opens in browser)
   * UPDATED WITH PROPER CORS HEADERS
   */
  export const viewOrganizationDocument = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      // Get document from database
      const document = await prisma.organizationDocument.findUnique({
        where: { document_id: id },
      });

      if (!document) {
        return sendError(res, 'Organization Document not found', 404);
      }

      if (!document.file) {
        return sendError(res, 'Document file not found', 404);
      }

      try {
        // Parse file metadata
        const fileMetadata = JSON.parse(document.file);
        
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
          return sendError(res, 'Failed to view document', 500);
        }

        // Set response headers for inline viewing
        const originalFileName = fileMetadata.originalFileName || `${document.document_name}.pdf`;
        const sanitizedFileName = originalFileName
          .replace(/[^a-zA-Z0-9._\- ]/g, '')
          .replace(/\s+/g, '_')
          .trim();

        const mimeType = fileMetadata.mimeType || 'application/pdf';

        // IMPORTANT: Set CORS headers to allow cross-origin requests
        res.setHeader('Access-Control-Allow-Origin', '*'); // Or specify your frontend domain
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, Content-Length');
        
        res.setHeader('Content-Type', mimeType);
        // Use 'inline' instead of 'attachment' to view in browser
        res.setHeader('Content-Disposition', `inline; filename="${sanitizedFileName}"`);
        if (downloadResponse.contentLength) {
          res.setHeader('Content-Length', downloadResponse.contentLength);
        }
        // Allow browser to cache for better performance
        res.setHeader('Cache-Control', 'public, max-age=3600');
        // Security headers - DO NOT use X-Frame-Options or use ALLOWALL
        res.setHeader('X-Content-Type-Options', 'nosniff');
        // REMOVE or comment out X-Frame-Options to allow iframe embedding
        // res.setHeader('X-Frame-Options', 'SAMEORIGIN');

        // Stream the blob to response
        downloadResponse.readableStreamBody.pipe(res);

      } catch (err: any) {
        console.error('Error viewing from Azure:', err);
        return sendError(res, 'Failed to view document', 500);
      }
    } catch (err: any) {
      console.error('Error viewing document:', err);
      return sendError(res, 'Failed to view document', 500);
    }
  };



  /**
   * Get Single Organization Document by ID (without file data)
   */
  export const getOrganizationDocumentById = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const document = await prisma.organizationDocument.findUnique({
        where: { document_id: id },
        select: {
          document_id: true,
          organization_id: true,
          document_title_id: true,
          document_type: true,
          document_name: true,
          user_id: true,
          privacy: true,
          expiration_date: true,
          upload_date: true,
          // Exclude file to reduce response size
        },
      });

      if (!document) {
        return sendError(res, 'Organization Document not found', 404);
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
 * Delete Organization Document (also deletes from Azure Blob)
 */
export const deleteOrganizationDocument = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const document = await prisma.organizationDocument.findUnique({
      where: { document_id: id },
    });

    if (!document) {
      return sendError(res, 'Organization Document not found', 404);
    }

    // Delete from Azure Blob Storage
    if (document.file) {
      try {
        const fileMetadata = JSON.parse(document.file);
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
    await prisma.organizationDocument.delete({
      where: { document_id: id },
    });

    return sendSuccess(res, {
      message: 'Document deleted successfully',
      data: { document_id: id },
    });
  } catch (err: any) {
    console.error('Error deleting document:', err);
    return sendError(res, 'Failed to delete document', 500);
  }
};

/**
 * Get All Documents by Organization ID
 */
export const getDocumentsByOrganizationId = async (req: Request, res: Response) => {
  try {
    const { organization_id } = req.params;

    // Check if organization exists
    const organization = await prisma.organization.findUnique({
      where: { organization_id },
    });

    if (!organization) {
      return sendError(res, 'Organization not found', 404);
    }

    // Get all documents for this organization
    const documents = await prisma.organizationDocument.findMany({
      where: { organization_id },
      select: {
        document_id: true,
        organization_id: true,
        document_title_id: true,
        document_type: true,
        document_name: true,
        user_id: true,
        privacy: true,
        expiration_date: true,
        upload_date: true,
      },
      orderBy: { upload_date: 'desc' },
    });

    return sendSuccess(res, {
      message: `Found ${documents.length} document(s) for organization`,
      data: documents,
      count: documents.length,
    });
  } catch (err: any) {
    console.error('Error fetching documents by organization:', err);
    return sendError(res, 'Failed to fetch documents', 500);
  }
};

/**
 * Get Document File Metadata (without downloading)
 */
export const getDocumentFileMetadata = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const document = await prisma.organizationDocument.findUnique({
      where: { document_id: id },
    });

    if (!document) {
      return sendError(res, 'Organization Document not found', 404);
    }

    if (!document.file) {
      return sendError(res, 'Document file metadata not found', 404);
    }

    try {
      const fileMetadata = JSON.parse(document.file);
      
      // Return metadata without the file data
      return sendSuccess(res, {
        data: {
          document_id: document.document_id,
          document_name: document.document_name,
          file: {
            originalFileName: fileMetadata.originalFileName,
            mimeType: fileMetadata.mimeType,
            size: fileMetadata.size,
            url: fileMetadata.url,
          },
        },
      });
    } catch (err) {
      return sendError(res, 'Failed to parse file metadata', 500);
    }
  } catch (err: any) {
    console.error('Error fetching file metadata:', err);
    return sendError(res, 'Failed to fetch file metadata', 500);
  }
};