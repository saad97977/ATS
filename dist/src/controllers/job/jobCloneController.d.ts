import { Request, Response } from 'express';
export declare const previewSnapshot: (req: Request, res: Response) => Promise<void>;
export declare const saveJobAsTemplate: (req: Request, res: Response) => Promise<void>;
export declare const getTemplates: (req: Request, res: Response) => Promise<void>;
export declare const getTemplateById: (req: Request, res: Response) => Promise<void>;
export declare const updateTemplate: (req: Request, res: Response) => Promise<void>;
export declare const deleteTemplate: (req: Request, res: Response) => Promise<void>;
export declare const createJobFromTemplate: (req: Request, res: Response) => Promise<void>;
export declare const cloneJob: (req: Request, res: Response) => Promise<void>;
//# sourceMappingURL=jobCloneController.d.ts.map