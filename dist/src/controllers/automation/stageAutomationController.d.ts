import { Request, Response } from 'express';
export declare const getAllStageAutomations: (req: Request, res: Response) => Promise<void>;
export declare const createStageAutomation: (req: Request, res: Response) => Promise<void>;
export declare const toggleStageAutomation: (req: Request, res: Response) => Promise<void>;
export declare const deleteStageAutomation: (req: Request, res: Response) => Promise<void>;
export declare const updateStageAutomation: (req: Request, res: Response) => Promise<void>;
export declare const fireStageAutomations: (stageName: string, applicantId: string, applicationId: string, jobId: string, organizationId: string) => Promise<void>;
export declare const stageAutomationController: {
    getAllStageAutomations: (req: Request, res: Response) => Promise<void>;
    createStageAutomation: (req: Request, res: Response) => Promise<void>;
    toggleStageAutomation: (req: Request, res: Response) => Promise<void>;
    deleteStageAutomation: (req: Request, res: Response) => Promise<void>;
    updateStageAutomation: (req: Request, res: Response) => Promise<void>;
    fireStageAutomations: (stageName: string, applicantId: string, applicationId: string, jobId: string, organizationId: string) => Promise<void>;
};
//# sourceMappingURL=stageAutomationController.d.ts.map