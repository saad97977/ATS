import { Request, Response } from 'express';
export declare const organizationUserController: {
    create: (req: Request, res: Response) => Promise<void>;
    getById: (req: Request, res: Response) => Promise<void>;
    getUsersByOrganization: (req: Request, res: Response) => Promise<void>;
    getOrganizationsByUser: (req: Request, res: Response) => Promise<void>;
    getUsersByDepartment: (req: Request, res: Response) => Promise<void>;
    getUsersByDivision: (req: Request, res: Response) => Promise<void>;
    getOrganizationUserStats: (req: Request, res: Response) => Promise<void>;
    getAll: (req: Request, res: Response) => Promise<void>;
    update: (req: Request, res: Response) => Promise<void>;
    delete: (req: Request, res: Response) => Promise<void>;
};
//# sourceMappingURL=organizationUserController.d.ts.map