import { Request, Response } from 'express';
export declare const TasksController: {
    getFilteredTasks: (req: Request, res: Response) => Promise<void>;
    getUpcomingTasks: (req: Request, res: Response) => Promise<void>;
    getTaskStats: (req: Request, res: Response) => Promise<void>;
    getAll: (req: Request, res: Response) => Promise<void>;
    getById: (req: Request, res: Response) => Promise<void>;
    create: (req: Request, res: Response) => Promise<void>;
    update: (req: Request, res: Response) => Promise<void>;
    delete: (req: Request, res: Response) => Promise<void>;
};
//# sourceMappingURL=TasksController.d.ts.map