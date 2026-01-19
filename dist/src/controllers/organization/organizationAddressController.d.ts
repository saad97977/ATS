import { Request, Response } from 'express';
export declare const organizationAddressController: {
    create: (req: Request, res: Response) => Promise<void>;
    update: (req: Request, res: Response) => Promise<void>;
    getById: (req: Request, res: Response) => Promise<void>;
    getAddressesByOrganization: (req: Request, res: Response) => Promise<void>;
    getAddressesByType: (req: Request, res: Response) => Promise<void>;
    checkOrganizationAddresses: (req: Request, res: Response) => Promise<void>;
    getAll: (req: Request, res: Response) => Promise<void>;
    delete: (req: Request, res: Response) => Promise<void>;
};
//# sourceMappingURL=organizationAddressController.d.ts.map