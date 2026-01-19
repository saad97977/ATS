import { Request, Response } from 'express';
export declare const interviewController: {
    create: (req: Request, res: Response) => Promise<void>;
    getById: (req: Request, res: Response) => Promise<void>;
    getInterviewsByApplication: (req: Request, res: Response) => Promise<void>;
    getInterviewsByStatus: (req: Request, res: Response) => Promise<void>;
    getUpcomingInterviews: (req: Request, res: Response) => Promise<void>;
    getInterviewsByDateRange: (req: Request, res: Response) => Promise<void>;
    getInterviewStats: (req: Request, res: Response) => Promise<void>;
    getAll: (req: Request, res: Response) => Promise<void>;
    update: (req: Request, res: Response) => Promise<void>;
    delete: (req: Request, res: Response) => Promise<void>;
};
//# sourceMappingURL=interviewController.d.ts.map