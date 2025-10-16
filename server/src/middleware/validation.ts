import type { NextFunction, Request, Response } from 'express';
import type { AnyZodObject } from 'zod';

import { HttpError } from './errorHandler';

export const validateRequest = (schema: AnyZodObject) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse({
      body: req.body,
      query: req.query,
      params: req.params,
    });

    if (!result.success) {
      return next(new HttpError('Validation failed', 400, result.error.format()));
    }

    return next();
  };
};
