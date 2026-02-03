import { Request, Response } from 'express';
/**
 * Public Job Board Controller
 *
 * Handles public-facing job listings for applicants
 * No authentication required for viewing jobs
 *
 * Business Rules:
 * - Only shows jobs with status = 'OPEN'
 * - Only shows jobs from ACTIVE organizations
 * - Hides sensitive information (manager details, internal notes, etc.)
 * - Supports filtering, searching, and pagination
 */
/**
 * Get all public job listings
 * GET /api/public/jobs
 *
 * Query params:
 * - search: Search in job title, location, organization name
 * - location: Filter by location
 * - job_type: Filter by TEMPORARY or PERMANENT
 * - organization_name: Filter by organization name
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 10, max: 50)
 */
export declare const getPublicJobs: (req: Request, res: Response) => Promise<void>;
/**
 * Get single public job details
 * GET /api/public/jobs/:id
 */
export declare const getPublicJobById: (req: Request, res: Response) => Promise<void>;
/**
 * Get public job statistics
 * GET /api/public/jobs/stats
 */
export declare const getPublicJobStats: (req: Request, res: Response) => Promise<void>;
/**
 * Search jobs with advanced filters
 * POST /api/public/jobs/search
 *
 * Body params:
 * - keywords: Search keywords
 * - location: Location filter
 * - job_type: TEMPORARY or PERMANENT
 * - organization_id: Filter by organization
 * - min_pay_rate: Minimum pay rate
 * - max_pay_rate: Maximum pay rate
 * - office_type: REMOTE, HYBRID, or ONSITE
 * - posted_within_days: Number of days (e.g., 7, 30)
 * - page: Page number
 * - limit: Items per page
 */
export declare const searchPublicJobs: (req: Request, res: Response) => Promise<void>;
/**
 * Get featured/highlighted jobs
 * GET /api/public/jobs/featured
 *
 * Returns jobs with the most open positions or recently posted
 */
export declare const getFeaturedJobs: (req: Request, res: Response) => Promise<void>;
/**
 * Get jobs by organization (public view)
 * GET /api/public/organizations/:organizationId/jobs
 */
export declare const getJobsByOrganization: (req: Request, res: Response) => Promise<void>;
//# sourceMappingURL=publicJobBoardController.d.ts.map