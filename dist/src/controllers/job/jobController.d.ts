import { Request, Response } from 'express';
export declare const jobController: {
    create: (req: Request, res: Response) => Promise<void>;
    getById: (req: Request, res: Response) => Promise<void>;
    update: (req: Request, res: Response) => Promise<void>;
    getAll: (req: Request, res: Response) => Promise<void>;
    getJobsByOrganization: (req: Request, res: Response) => Promise<void>;
    getJobsByStatus: (req: Request, res: Response) => Promise<void>;
    getJobsByType: (req: Request, res: Response) => Promise<void>;
    getJobsByManager: (req: Request, res: Response) => Promise<void>;
    getApprovedJobs: (req: Request, res: Response) => Promise<void>;
    getActiveJobs: (req: Request, res: Response) => Promise<void>;
    getJobStats: (req: Request, res: Response) => Promise<void>;
    getJobsByUser: (req: Request, res: Response) => Promise<void>;
    getUserOrganizations: (req: Request, res: Response) => Promise<void>;
    approveJob: (req: Request, res: Response) => Promise<void>;
    declineJob: (req: Request, res: Response) => Promise<void>;
    autoCloseExpiredJobs: (req: Request, res: Response) => Promise<void>;
    getPendingJobsByManager: (req: Request, res: Response) => Promise<void>;
    getApprovedJobsByManager: (req: Request, res: Response) => Promise<void>;
    getDeclinedJobsByManager: (req: Request, res: Response) => Promise<void>;
    getClosedJobsByManager: (req: Request, res: Response) => Promise<void>;
    getDraftJobsByManager: (req: Request, res: Response) => Promise<void>;
    getJobRequirements: (req: Request, res: Response) => Promise<void>;
    getJobsCounts: (req: Request, res: Response) => Promise<void>;
    delete: (req: Request, res: Response) => Promise<void>;
};
//# sourceMappingURL=jobController.d.ts.map