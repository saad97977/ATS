import { Request, Response } from 'express';
export declare const getAllPayrolls: (req: Request, res: Response) => Promise<void>;
export declare const getPayrollStats: (req: Request, res: Response) => Promise<void>;
export declare const getPayrollById: (req: Request, res: Response) => Promise<void>;
export declare const getPayrollsByAssignment: (req: Request, res: Response) => Promise<void>;
export declare const createPayroll: (req: Request, res: Response) => Promise<void>;
export declare const updatePayroll: (req: Request, res: Response) => Promise<void>;
export declare const voidAndReplacePayroll: (req: Request, res: Response) => Promise<void>;
export declare const deletePayroll: (req: Request, res: Response) => Promise<void>;
export declare const markQbSynced: (req: Request, res: Response) => Promise<void>;
export declare const bulkMarkQbSynced: (req: Request, res: Response) => Promise<void>;
export declare const getPayrollPeriods: (req: Request, res: Response) => Promise<void>;
export declare const getPayrollsByPeriod: (req: Request, res: Response) => Promise<void>;
export declare const payrollController: {
    getAllPayrolls: (req: Request, res: Response) => Promise<void>;
    getPayrollStats: (req: Request, res: Response) => Promise<void>;
    getPayrollById: (req: Request, res: Response) => Promise<void>;
    getPayrollsByAssignment: (req: Request, res: Response) => Promise<void>;
    createPayroll: (req: Request, res: Response) => Promise<void>;
    updatePayroll: (req: Request, res: Response) => Promise<void>;
    deletePayroll: (req: Request, res: Response) => Promise<void>;
    voidAndReplacePayroll: (req: Request, res: Response) => Promise<void>;
    markQbSynced: (req: Request, res: Response) => Promise<void>;
    bulkMarkQbSynced: (req: Request, res: Response) => Promise<void>;
    getPayrollPeriods: (req: Request, res: Response) => Promise<void>;
    getPayrollsByPeriod: (req: Request, res: Response) => Promise<void>;
};
//# sourceMappingURL=payrollController.d.ts.map