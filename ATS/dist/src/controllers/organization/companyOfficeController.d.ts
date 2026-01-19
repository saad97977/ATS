import { Request, Response } from 'express';
export declare const companyOfficeController: {
    create: (req: Request, res: Response) => Promise<void>;
    update: (req: Request, res: Response) => Promise<void>;
    getById: (req: Request, res: Response) => Promise<void>;
    getOfficesByOrganization: (req: Request, res: Response) => Promise<void>;
    getOfficesByType: (req: Request, res: Response) => Promise<void>;
    getPrimaryOffice: (req: Request, res: Response) => Promise<void>;
    getOfficesByLocation: (req: Request, res: Response) => Promise<void>;
    getOfficeStats: (req: Request, res: Response) => Promise<void>;
    getAll: (req: Request, res: Response) => Promise<void>;
    delete: (req: Request, res: Response) => Promise<void>;
};
//# sourceMappingURL=companyOfficeController.d.ts.map