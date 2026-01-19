import { Response } from 'express';
export interface ApiResponse<T = any> {
    success: boolean;
    data?: T;
    error?: string;
    statusCode: number;
    errors?: Array<{
        field: string;
        message: string;
    }>;
}
export declare const sendSuccess: <T>(res: Response, data: T, statusCode?: number, message?: string) => void;
export declare const sendError: (res: Response, error: string, statusCode?: number, errors?: Array<{
    field: string;
    message: string;
}>) => void;
//# sourceMappingURL=response.d.ts.map