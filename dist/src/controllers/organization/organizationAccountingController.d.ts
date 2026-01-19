import { Request, Response } from 'express';
export declare const organizationAccountingController: {
    create: (req: Request, res: Response) => Promise<void>;
    getById: (req: Request, res: Response) => Promise<void>;
    getAccountingByOrganization: (req: Request, res: Response) => Promise<void>;
    getAccountingByType: (req: Request, res: Response) => Promise<void>;
    getAccountingByBank: (req: Request, res: Response) => Promise<void>;
    getAccountingByCountry: (req: Request, res: Response) => Promise<void>;
    getAccountingStats: (req: Request, res: Response) => Promise<void>;
    getAll: (req: Request, res: Response) => Promise<void>;
    update: (req: Request, res: Response) => Promise<void>;
    delete: (req: Request, res: Response) => Promise<void>;
};
//# sourceMappingURL=organizationAccountingController.d.ts.map