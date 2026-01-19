import { Request, Response } from 'express';
export declare const contractController: {
    create: (req: Request, res: Response) => Promise<void>;
    getById: (req: Request, res: Response) => Promise<void>;
    getContractsByOrganization: (req: Request, res: Response) => Promise<void>;
    getContractsByUser: (req: Request, res: Response) => Promise<void>;
    getContractsByStatus: (req: Request, res: Response) => Promise<void>;
    getContractsBySignedStatus: (req: Request, res: Response) => Promise<void>;
    getContractsBySentStatus: (req: Request, res: Response) => Promise<void>;
    getContractsByContractorType: (req: Request, res: Response) => Promise<void>;
    getPendingContracts: (req: Request, res: Response) => Promise<void>;
    getSignedContracts: (req: Request, res: Response) => Promise<void>;
    getContractStats: (req: Request, res: Response) => Promise<void>;
    getAll: (req: Request, res: Response) => Promise<void>;
    update: (req: Request, res: Response) => Promise<void>;
    delete: (req: Request, res: Response) => Promise<void>;
};
//# sourceMappingURL=organizationContractController.d.ts.map