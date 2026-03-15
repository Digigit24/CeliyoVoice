import type { Response } from 'express';

export interface SuccessResponse<T> {
  success: true;
  data: T;
}

export interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface PaginatedResponse<T> {
  success: true;
  data: T[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export function success<T>(res: Response, data: T, statusCode = 200): Response {
  const body: SuccessResponse<T> = { success: true, data };
  return res.status(statusCode).json(body);
}

export function errorResponse(
  res: Response,
  message: string,
  code: string,
  statusCode = 400,
  details?: unknown,
): Response {
  const body: ErrorResponse = {
    success: false,
    error: { code, message, ...(details !== undefined && { details }) },
  };
  return res.status(statusCode).json(body);
}

export function paginated<T>(
  res: Response,
  data: T[],
  total: number,
  page: number,
  limit: number,
  statusCode = 200,
): Response {
  const totalPages = Math.ceil(total / limit);
  const body: PaginatedResponse<T> = {
    success: true,
    data,
    pagination: {
      total,
      page,
      limit,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  };
  return res.status(statusCode).json(body);
}
