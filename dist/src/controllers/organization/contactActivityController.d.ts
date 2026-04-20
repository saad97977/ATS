import { Request, Response } from 'express';
export declare const contactActivityDropdownController: {
    getOrganizationUsers: (req: Request, res: Response) => Promise<void>;
    getUsers: (req: Request, res: Response) => Promise<void>;
    getOrganizations: (req: Request, res: Response) => Promise<void>;
    getJobs: (req: Request, res: Response) => Promise<void>;
};
export declare const contactPreviewController: {
    getAll: (req: Request, res: Response) => Promise<void>;
    getById: (req: Request, res: Response) => Promise<void>;
    getByOrganizationUser: (req: Request, res: Response) => Promise<void>;
    create: (req: Request, res: Response) => Promise<void>;
    update: (req: Request, res: Response) => Promise<void>;
    delete: (req: Request, res: Response) => Promise<void>;
};
export declare const organizationActivityController: {
    getAll: (req: Request, res: Response) => Promise<void>;
    getById: (req: Request, res: Response) => Promise<void>;
    getByOrganization: (req: Request, res: Response) => Promise<void>;
    create: (req: Request, res: Response) => Promise<void>;
    update: (req: Request, res: Response) => Promise<void>;
    delete: (req: Request, res: Response) => Promise<void>;
};
export declare const contactJobController: {
    getAll: (req: Request, res: Response) => Promise<void>;
    getByOrganizationUser: (req: Request, res: Response) => Promise<void>;
    getByJob: (req: Request, res: Response) => Promise<void>;
    create: (req: Request, res: Response) => Promise<void>;
    bulkCreate: (req: Request, res: Response) => Promise<void>;
    delete: (req: Request, res: Response) => Promise<void>;
    deleteByComposite: (req: Request, res: Response) => Promise<void>;
};
//# sourceMappingURL=contactActivityController.d.ts.map