import { Response } from 'express';

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  statusCode: number;
  errors?: Array<{ field: string; message: string }>;
}

export const sendSuccess = <T>(
  res: Response,
  data: T,
  statusCode: number = 200,
  message?: string
) => {
  res.status(statusCode).json({
    success: true,
    data,
    statusCode,
  });
};

export const sendError = (
  res: Response,
  error: string,
  statusCode: number = 500,
  errors?: Array<{ field: string; message: string }>
) => {
  const response: any = {
    success: false,
    error,
    statusCode,
  };

  if (errors) {
    response.errors = errors;
  }

  res.status(statusCode).json(response);
};
