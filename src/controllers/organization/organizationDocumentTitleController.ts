import { Request, Response } from 'express';
import prisma from '../../prisma.config';
import { createCrudController } from '../../factories/crudFactory';
import { sendSuccess, sendError } from '../../utils/response';

/**
 * Organization Document Title CRUD Controller - Generated using CRUD Factory with Zod validation
 * Provides: GET all, GET by id, POST, PATCH, DELETE
 * 
 * Validation Rules:
 * - organization_id: Required UUID
 * - document_title: Required document title
 * 
 * Custom Overrides:
 * - getAll: Supports all=true parameter to fetch all records without pagination
 * - create: Validates unique document_title per organization
 */

// Generate base CRUD methods
const baseCrudController = createCrudController({
  model: prisma.organizationDocumentTitle,
  modelName: 'Organization Document Title',
  idField: 'document_title_id',
  defaultLimit: 10,
  maxLimit: 100,
});

/**
 * Custom getAll function that supports all=true parameter
 * GET /api/organization-document-titles?all=true
 * GET /api/organization-document-titles?page=1&limit=10
 */
const customGetAll = async (req: Request, res: Response) => {
  try {
    const { all } = req.query;

    // If all=true, fetch all records grouped by organization
    if (all === 'true') {
      const allRecords = await prisma.organizationDocumentTitle.findMany({
        orderBy: {
          document_title: 'asc',
        },
        include: {
          organization: {
            select: {
              organization_id: true,
              name: true,
            },
          },
        },
      });

      // Group by organization
      const groupedByOrg = allRecords.reduce((acc: any, title: any) => {
        const orgId = title.organization_id;
        
        if (!acc[orgId]) {
          acc[orgId] = {
            organization_id: title.organization.organization_id,
            organization_name: title.organization.name,
            document_titles: []
          };
        }
        
        acc[orgId].document_titles.push({
          document_title_id: title.document_title_id,
          document_title: title.document_title,
          organization_id: title.organization_id,
        });
        
        return acc;
      }, {});

      const hierarchicalData = Object.values(groupedByOrg);

      return sendSuccess(res, {
        data: hierarchicalData,
        total: hierarchicalData.length,
      });
    }

    // Otherwise, use the default paginated getAll from CRUD factory
    return baseCrudController.getAll(req, res);
  } catch (error: any) {
    console.error('Error fetching organization document titles:', error);
    return sendError(res, 'Failed to fetch organization document titles', 500);
  }
};

/**
 * Custom create function with unique validation
 * POST /api/organization-document-titles
 * Validates that document_title is unique per organization
 */
const customCreate = async (req: Request, res: Response) => {
  try {
    const { organization_id, document_title } = req.body;

    // Validate required fields
    if (!organization_id) {
      return sendError(res, 'organization_id is required', 400, [
        { field: 'organization_id', message: 'organization_id is required' }
      ]);
    }

    if (!document_title) {
      return sendError(res, 'document_title is required', 400, [
        { field: 'document_title', message: 'document_title is required' }
      ]);
    }

    // Check if organization exists
    const organization = await prisma.organization.findUnique({
      where: { organization_id },
    });

    if (!organization) {
      return sendError(res, 'Organization not found', 404);
    }

    // Check for duplicate document title within the same organization
    const existingTitle = await prisma.organizationDocumentTitle.findFirst({
      where: {
        organization_id,
        document_title,
      },
    });

    if (existingTitle) {
      return sendError(
        res,
        'Document title already exists for this organization',
        409,
        [{
          field: 'document_title',
          message: `Document title "${document_title}" already exists for this organization`,
        }]
      );
    }

    // Create new document title
    const newDocumentTitle = await prisma.organizationDocumentTitle.create({
      data: {
        organization_id,
        document_title,
      },
      include: {
        organization: {
          select: {
            organization_id: true,
            name: true,
            status: true,
          },
        },
      },
    });

    return sendSuccess(res, newDocumentTitle, 201);
  } catch (err: any) {
    console.error('Error creating organization document title:', err);

    if (err.code === 'P2003') {
      return sendError(res, 'Related organization not found', 404);
    }

    return sendError(res, 'Failed to create organization document title', 500);
  }
};

/**
 * Custom update function with additional validation
 * PATCH /api/organization-document-titles/:id
 * Validates unique document_title per organization and includes related data
 */
const customUpdate = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { document_title, organization_id } = req.body;

    // Validate that the document title exists
    const existingTitle = await prisma.organizationDocumentTitle.findUnique({
      where: { document_title_id: id },
    });

    if (!existingTitle) {
      return sendError(res, 'Organization document title not found', 404);
    }

    // If updating document_title, check for duplicates in the same organization
    if (document_title) {
      const targetOrgId = organization_id || existingTitle.organization_id;
      
      const duplicateTitle = await prisma.organizationDocumentTitle.findFirst({
        where: {
          organization_id: targetOrgId,
          document_title,
          NOT: {
            document_title_id: id, // Exclude current record
          },
        },
      });

      if (duplicateTitle) {
        return sendError(
          res,
          'Document title already exists for this organization',
          409,
          [{
            field: 'document_title',
            message: `Document title "${document_title}" already exists for this organization`,
          }]
        );
      }
    }

    // If updating organization_id, validate it exists
    if (organization_id && organization_id !== existingTitle.organization_id) {
      const organization = await prisma.organization.findUnique({
        where: { organization_id },
      });

      if (!organization) {
        return sendError(res, 'Organization not found', 404);
      }
    }

    // Update the document title
    const updatedTitle = await prisma.organizationDocumentTitle.update({
      where: { document_title_id: id },
      data: req.body,
      include: {
        organization: {
          select: {
            organization_id: true,
            name: true,
            status: true,
          },
        },
        documents: {
          select: {
            document_id: true,
            document_name: true,
            document_type: true,
            privacy: true,
            expiration_date: true,
            upload_date: true,
          },
        },
      },
    });

    return sendSuccess(res, updatedTitle);
  } catch (error: any) {
    console.error('Error updating organization document title:', error);
    
    if (error.code === 'P2025') {
      return sendError(res, 'Organization document title not found', 404);
    }

    if (error.code === 'P2003') {
      return sendError(res, 'Related organization not found', 404);
    }

    return sendError(res, 'Failed to update organization document title', 500);
  }
};

// Export controller with custom methods
export const organizationDocumentTitleController = {
  ...baseCrudController,
  getAll: customGetAll,
  create: customCreate,
  update: customUpdate,
};