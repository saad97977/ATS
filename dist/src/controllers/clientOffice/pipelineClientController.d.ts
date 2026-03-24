import { Request, Response } from 'express';
export declare const clientOfficePipelineController: {
    getAllPipelineStages: (req: Request, res: Response) => Promise<void>;
    getPipelineByJob: (req: Request, res: Response) => Promise<void>;
    getPipelineOverview: (req: Request, res: Response) => Promise<void>;
    getPipelineStats: (req: Request, res: Response) => Promise<void>;
    getPipelineByInterviewStatus: (req: Request, res: Response) => Promise<void>;
    searchPipelinedApplicants: (req: Request, res: Response) => Promise<void>;
    getInterviewByApplication: (req: Request, res: Response) => Promise<void>;
    getJobs: (req: Request, res: Response) => Promise<void>;
    getApplicants: (req: Request, res: Response) => Promise<void>;
    getAssignments: (req: Request, res: Response) => Promise<void>;
    getMyOrganizations: (req: Request, res: Response) => Promise<void>;
};
//# sourceMappingURL=pipelineClientController.d.ts.map