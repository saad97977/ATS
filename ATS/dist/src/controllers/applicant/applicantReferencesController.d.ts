import { Request, Response } from 'express';
export declare const applicantReferencesController: import("../../factories/crudFactory").CrudController;
/**
 * Create Applicant Reference with Duplicate Check
 * Prevents duplicate user_id for the same applicant
 */
export declare const createApplicantReference: (req: Request, res: Response) => Promise<void>;
/**
 * Update Applicant Reference with Duplicate Check
 * Prevents duplicate user_id for the same applicant when updating
 */
export declare const updateApplicantReference: (req: Request, res: Response) => Promise<void>;
/**
 * Get All References for a Specific Applicant
 */
export declare const getReferencesByApplicantId: (req: Request, res: Response) => Promise<void>;
//# sourceMappingURL=applicantReferencesController.d.ts.map