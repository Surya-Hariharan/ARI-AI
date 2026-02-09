/**
 * Response Utilities for ARI Backend
 * 
 * DESIGN INTENT:
 * --------------
 * Consistent response formatting across all endpoints.
 * This ensures clients can reliably parse responses and
 * that error messages are properly structured.
 */

import type { Response } from 'express';

/**
 * Standard success response format
 */
export interface SuccessResponse<T = unknown> {
  success: true;
  data: T;
}

/**
 * Standard error response format
 */
export interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/**
 * Sends a success response with consistent formatting
 */
export function sendSuccess<T>(res: Response, data: T, statusCode = 200): void {
  const response: SuccessResponse<T> = {
    success: true,
    data,
  };

  res.status(statusCode).json(response);
}

/**
 * Sends an error response with consistent formatting
 * 
 * SECURITY NOTE:
 * Error messages should be informative enough for debugging
 * but not leak sensitive implementation details.
 */
export function sendError(
  res: Response,
  code: string,
  message: string,
  statusCode = 400,
  details?: unknown
): void {
  const response: ErrorResponse = {
    success: false,
    error: {
      code,
      message,
      ...(details && { details }),
    },
  };

  res.status(statusCode).json(response);
}

/**
 * Sends an unauthorized error (401)
 * 
 * SECURITY INTENT:
 * Used when authentication fails. Message is intentionally vague
 * to avoid leaking information about valid/invalid tokens.
 */
export function sendUnauthorized(res: Response, reason?: string): void {
  sendError(
    res,
    'UNAUTHORIZED',
    reason || 'Authentication required',
    401
  );
}

/**
 * Sends a forbidden error (403)
 * 
 * SECURITY INTENT:
 * Used when policy evaluation fails. The reason is provided
 * to help legitimate clients understand what went wrong.
 */
export function sendForbidden(res: Response, reason: string): void {
  sendError(
    res,
    'FORBIDDEN',
    `Policy denied: ${reason}`,
    403
  );
}

// ============================================================================
// ALIAS EXPORTS (for convenience)
// ============================================================================

/**
 * Alias for sendSuccess - returns response directly
 */
export function success<T>(res: Response, data: T, statusCode = 200): Response {
  const response: SuccessResponse<T> = {
    success: true,
    data,
  };

  return res.status(statusCode).json(response);
}

/**
 * Alias for sendError - returns response directly
 */
export function error(
  res: Response,
  statusCode: number,
  code: string,
  message: string,
  details?: unknown
): Response {
  const response: ErrorResponse = {
    success: false,
    error: {
      code,
      message,
      ...(details && { details }),
    },
  };

  return res.status(statusCode).json(response);
}

/**
 * Custom API Error class for consistent error handling
 */
export class ApiError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string

  ) {
    super(message);
    this.name = 'ApiError';
  }
}
