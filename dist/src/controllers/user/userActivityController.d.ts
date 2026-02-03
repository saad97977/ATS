import { Request, Response } from 'express';
export declare const userActivityController: {
    getAllUserActivities: (req: Request, res: Response) => Promise<void>;
    getActivityStats: (req: Request, res: Response) => Promise<void>;
    getUserActivityByUserId: (req: Request, res: Response) => Promise<void>;
    getRecentActiveUsers: (req: Request, res: Response) => Promise<void>;
    getInactiveUsers: (req: Request, res: Response) => Promise<void>;
    getUserActivitySummary: (req: Request, res: Response) => Promise<void>;
    getAll: (req: Request, res: Response) => Promise<void>;
    getById: (req: Request, res: Response) => Promise<void>;
    create: (req: Request, res: Response) => Promise<void>;
    update: (req: Request, res: Response) => Promise<void>;
    delete: (req: Request, res: Response) => Promise<void>;
};
//# sourceMappingURL=userActivityController.d.ts.map