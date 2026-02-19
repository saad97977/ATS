import { Request, Response } from 'express';
export declare const assignmentController: {
    getAll: (req: Request, res: Response) => Promise<void>;
    getById: (req: Request, res: Response) => Promise<void>;
    create: (req: Request, res: Response) => Promise<void>;
    update: (req: Request, res: Response) => Promise<void>;
    getAssignmentByApplication: (req: Request, res: Response) => Promise<void>;
    getAssignmentsByEmploymentType: (req: Request, res: Response) => Promise<void>;
    getActiveAssignments: (req: Request, res: Response) => Promise<void>;
    getCompletedAssignments: (req: Request, res: Response) => Promise<void>;
    getAssignmentStats: (req: Request, res: Response) => Promise<void>;
    delete: (req: Request, res: Response) => Promise<void>;
};
//# sourceMappingURL=assignmentController.d.ts.map