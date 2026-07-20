import { Request, Response } from 'express';
export declare const clockIn: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const clockOut: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const pauseClock: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const resumeClock: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const getTodayStatus: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const getUserAttendance: (req: Request, res: Response) => Promise<void>;
export declare const getAllAttendance: (req: Request, res: Response) => Promise<void>;
export declare const getAttendanceByDate: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const updateAttendanceRecord: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const getAttendanceSummary: (req: Request, res: Response) => Promise<void>;
export declare const getLiveStatus: (req: Request, res: Response) => Promise<void>;
//# sourceMappingURL=attendanceController.d.ts.map