import prisma from '../../prisma.config';
import { createCrudController } from '../../factories/crudFactory';
import { Request, Response } from 'express';
import { sendSuccess, sendError } from '../../utils/response';

/**
 * Organization Document CRUD Controller
 * 
 * Validation Rules:
 * - organization_id: Required UUID
 * - document_title_id: Required UUID (reference to document title)
 * - document_type: Required document type
 * - document_name: Required document name
 * - user_id: Required UUID (uploader)
 * - file: File upload (PDF, images, documents) - stored as base64 in database
 * - privacy: PUBLIC or PRIVATE
 * - expiration_date: Optional date
 */

/**
 * Create Organization Document with File Upload
 * Handles file upload and saves file content directly to database
 * Stores file as JSON: {originalFileName, mimeType, fileData}
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

    // Convert file buffer to base64 and store with metadata
    const fileBase64 = file.buffer.toString('base64');
    const fileMetadata = {
      originalFileName: file.originalname,
      mimeType: file.mimetype,
      fileData: fileBase64,
    };

    // Create document record in database with file content and metadata
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
      },
    }, 201);
  } catch (err: any) {
    console.error('Error uploading document:', err);
    return sendError(res, 'Failed to upload document', 500);
  }
};

/**
 * Update Organization Document with Optional File Upload
 * Allows updating document metadata and/or uploading a new document
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

    if (file) {
      // Convert file buffer to base64 and store with metadata
      const fileBase64 = file.buffer.toString('base64');
      const fileMetadata = {
        originalFileName: file.originalname,
        mimeType: file.mimetype,
        fileData: fileBase64,
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
    return sendError(res, 'Failed to update document', 500);
  }
};

/**
 * Download Organization Document
 * Extracts file from database and returns for download with proper extension
 * Preserves original filename and file extension from upload
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
      // Try to parse JSON metadata
      let originalFileName: string | null = null;
      let mimeType: string = 'application/octet-stream';
      let fileData: string | null = null;

      try {
        const fileMetadata = JSON.parse(document.file);
        originalFileName = fileMetadata.originalFileName;
        mimeType = fileMetadata.mimeType || 'application/octet-stream';
        fileData = fileMetadata.fileData;
      } catch (parseErr) {
        console.warn('JSON parsing failed, checking if it\'s plain base64');
        // If JSON parsing fails, assume it's plain base64 (old format)
        fileData = document.file;
      }

      if (!fileData) {
        return sendError(res, 'Document file data is missing or corrupted', 500);
      }

      try {
        // Convert base64 string back to buffer
        const fileBuffer = Buffer.from(fileData, 'base64');

        // Use original filename if available, otherwise use document_name with .pdf
        if (!originalFileName) {
          originalFileName = `${document.document_name}.pdf`;
          console.log('Using fallback filename:', originalFileName);
        }

        // Sanitize filename - remove invalid characters for HTTP headers
        // Keep only alphanumeric, dots, hyphens, underscores, and spaces
        const sanitizedFileName = originalFileName
          .replace(/[^a-zA-Z0-9._\- ]/g, '')
          .replace(/\s+/g, '_')
          .trim();

        if (!sanitizedFileName) {
          throw new Error('Filename is empty after sanitization');
        }

        // Set response headers for file download with proper extension
        res.setHeader('Content-Type', mimeType);
        res.setHeader('Content-Disposition', `attachment; filename="${sanitizedFileName}"`);
        res.setHeader('Content-Length', fileBuffer.length);
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

        console.log('Downloading file:', sanitizedFileName, 'with MIME type:', mimeType);
        return res.send(fileBuffer);
      } catch (bufferErr) {
        console.error('Error converting base64 to buffer:', bufferErr);
        return sendError(res, 'Failed to process document', 500);
      }
    } catch (err: any) {
      console.error('Unexpected error in download:', err);
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
          // Exclude file to reduce response size
        },
        orderBy: { upload_date: 'desc' },
      }),
      prisma.organizationDocument.count(),
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
 * Delete Organization Document
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
