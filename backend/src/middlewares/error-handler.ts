import type { ApiError } from '@chief/shared';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { AppError } from '../errors/app-error.js';

/** Unknown routes answer with the same error body as every other failure. */
export const notFound: RequestHandler = (req, res) => {
  const body: ApiError = {
    error: { code: 'NOT_FOUND', message: `Route ${req.method} ${req.path} not found` },
  };
  res.status(404).json(body);
};

/**
 * Turns any error into an ApiError body. Known errors keep their status and message;
 * anything else is logged and answered with a generic 500, never with internal details.
 */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  let status = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'Unexpected error';

  if (err instanceof AppError) {
    ({ status, code, message } = err);
  } else if (isBodyParserError(err)) {
    status = err.status;
    code = status === 413 ? 'PAYLOAD_TOO_LARGE' : 'INVALID_BODY';
    message = status === 413 ? 'Request body is too large' : 'Request body is not valid JSON';
  }

  if (status >= 500) req.log.error({ err }, 'Request failed');
  const body: ApiError = { error: { code, message } };
  res.status(status).json(body);
};

/** Errors thrown by express.json() / express.raw() carry a 4xx status and a type. */
function isBodyParserError(err: unknown): err is { status: number; type: string } {
  if (typeof err !== 'object' || err === null) return false;
  const { status, type } = err as { status?: unknown; type?: unknown };
  return typeof status === 'number' && status >= 400 && status < 500 && typeof type === 'string';
}
