import { Request, Response } from 'express';
export declare const applicationController: {
    getById: (req: Request, res: Response) => Promise<void>;
    create: (req: Request, res: Response) => Promise<void>;
    getApplicationsByJob: (req: Request, res: Response) => Promise<void>;
    getApplicationsByApplicant: (req: Request, res: Response) => Promise<void>;
    getApplicationsByStatus: (req: Request, res: Response) => Promise<void>;
    getApplicationStatsByJob: (req: Request, res: Response) => Promise<void>;
    getAll: (req: Request, res: Response) => Promise<void>;
    update: (req: Request, res: Response) => Promise<void>;
    delete: (req: Request, res: Response) => Promise<void>;
};
//# sourceMappingURL=applicationController.d.ts.map