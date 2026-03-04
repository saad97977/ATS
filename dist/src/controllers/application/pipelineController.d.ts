import { Request, Response } from 'express';
export declare const uploadOnboardingDocs: import("express").RequestHandler<import("express-serve-static-core").ParamsDictionary, any, any, import("qs").ParsedQs, Record<string, any>>;
export declare const pipelineController: {
    getAll: (req: Request, res: Response) => Promise<void>;
    create: (req: Request, res: Response) => Promise<void>;
    getById: (req: Request, res: Response) => Promise<void>;
    update: (req: Request, res: Response) => Promise<void>;
    delete: (req: Request, res: Response) => Promise<void>;
    createInterviewForPipeline: (req: Request, res: Response) => Promise<void>;
    getInterviewByApplication: (req: Request, res: Response) => Promise<void>;
    updateInterviewDate: (req: Request, res: Response) => Promise<void>;
    autoUpdateCompletedInterviews: (req: Request, res: Response) => Promise<void>;
    rejectInterview: (req: Request, res: Response) => Promise<void>;
    acceptInterview: (req: Request, res: Response) => Promise<void>;
    onboardCandidate: (req: Request, res: Response) => Promise<void>;
    getPipelineByJob: (req: Request, res: Response) => Promise<void>;
    getPipelineStats: (req: Request, res: Response) => Promise<void>;
    getPipelineOverview: (req: Request, res: Response) => Promise<void>;
    getPipelineByInterviewStatus: (req: Request, res: Response) => Promise<void>;
    searchPipelinedApplicants: (req: Request, res: Response) => Promise<void>;
    uploadOnboardingDocs: import("express").RequestHandler<import("express-serve-static-core").ParamsDictionary, any, any, import("qs").ParsedQs, Record<string, any>>;
    getAssignmentDetails: (req: Request, res: Response) => Promise<void>;
};
//# sourceMappingURL=pipelineController.d.ts.map