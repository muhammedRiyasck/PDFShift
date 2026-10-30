import { Request, Response, NextFunction } from 'express';

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  console.error('[Error]', err.message);
  const statusCode = err.message.includes('not found') ? 404
    : err.message.includes('Only PDF') ? 415
    : err.message.includes('out of range') || err.message.includes('No pages') ? 422
    : 500;
  res.status(statusCode).json({ error: err.message });
}
