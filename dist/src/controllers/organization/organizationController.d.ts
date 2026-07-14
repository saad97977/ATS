import { Request, Response } from 'express';
export declare const getOrganizationOnboardingDocuments: (req: Request, res: Response) => Promise<void>;
export declare const setOrganizationOnboardingDocuments: (req: Request, res: Response) => Promise<void>;
export declare const getOnboardingDocumentViewUrl: (req: Request, res: Response) => Promise<void>;
export declare const organizationController: {
    getAll: (req: Request, res: Response) => Promise<void>;
    getById: (req: Request, res: Response) => Promise<void>;
    update: (req: Request, res: Response) => Promise<void>;
    getOrganizationOnboardingDocuments: (req: Request, res: Response) => Promise<void>;
    setOrganizationOnboardingDocuments: (req: Request, res: Response) => Promise<void>;
    getOnboardingDocumentViewUrl: (req: Request, res: Response) => Promise<void>;
    create: (req: Request, res: Response) => Promise<void>;
    delete: (req: Request, res: Response) => Promise<void>;
};
//# sourceMappingURL=organizationController.d.ts.map