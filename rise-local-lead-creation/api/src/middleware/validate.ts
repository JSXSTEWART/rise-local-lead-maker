import { Request, Response, NextFunction } from 'express';
import { z, ZodSchema } from 'zod';
import { createError } from './error-handler';

export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      const error = createError(
        'Validation failed',
        400,
        'VALIDATION_ERROR',
        result.error.flatten()
      );
      return next(error);
    }

    req.body = result.data;
    next();
  };
}

export function validateQuery<T>(schema: ZodSchema<T>) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query);

    if (!result.success) {
      const error = createError(
        'Invalid query parameters',
        400,
        'VALIDATION_ERROR',
        result.error.flatten()
      );
      return next(error);
    }

    req.query = result.data as any;
    next();
  };
}

// Common validation schemas
export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const leadIdSchema = z.object({
  id: z.string().uuid(),
});
