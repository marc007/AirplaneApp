import type { NextFunction, Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';

import { HttpError } from '../../middleware/errorHandler';
import { validateRequest } from '../../middleware/validation';
import { getPrismaClient } from '../../lib/prisma';
import { searchAirplanes } from '../../services/airplaneSearch';

const router = Router();

const firstValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
};

const stringParam = (min: number, max: number) =>
  z
    .preprocess((value) => {
      const first = firstValue(value);
      if (typeof first !== 'string') {
        return first;
      }

      return first.trim();
    }, z.string().min(min).max(max));

const booleanParam = z.preprocess((value) => {
  const first = firstValue(value);
  if (first === undefined || first === null) {
    return undefined;
  }

  if (typeof first === 'boolean') {
    return first;
  }

  if (typeof first === 'string') {
    const normalized = first.trim().toLowerCase();
    if (['true', '1', 'yes'].includes(normalized)) {
      return true;
    }

    if (['false', '0', 'no'].includes(normalized)) {
      return false;
    }
  }

  return first;
}, z.boolean());

const numericParam = (min: number, max: number) =>
  z.preprocess((value) => {
    const first = firstValue(value);
    if (first === undefined || first === null || first === '') {
      return undefined;
    }

    return first;
  }, z.coerce.number().int().min(min).max(max));

const tailNumberParam = z
  .preprocess((value) => {
    const first = firstValue(value);
    if (typeof first !== 'string') {
      return first;
    }

    return first.trim().toUpperCase();
  }, z
    .string()
    .min(1)
    .max(10)
    .regex(/^[A-Z0-9]+$/, 'Tail number must be alphanumeric')
    .refine(
      (value) => {
        const candidate = value.startsWith('N') ? value.slice(1) : value;
        return candidate.length > 0;
      },
      { message: 'Tail number must include characters after the N prefix' },
    ));

const searchQuerySchema = z.object({
  tailNumber: tailNumberParam.optional(),
  exact: booleanParam.optional(),
  status: stringParam(1, 10).optional(),
  manufacturer: stringParam(1, 120).optional(),
  owner: stringParam(1, 120).optional(),
  page: numericParam(1, 1000).optional(),
  pageSize: numericParam(1, 100).optional(),
});

const searchRequestSchema = z.object({
  query: searchQuerySchema,
  body: z.unknown().optional(),
  params: z.unknown().optional(),
});

type SearchQuery = z.infer<typeof searchQuerySchema>;

const normalizeTailNumber = (value: string): string => {
  const uppercased = value.toUpperCase();
  const normalized = uppercased.startsWith('N') ? uppercased : `N${uppercased}`;

  if (normalized.length > 10) {
    throw new HttpError('Tail number must not exceed 10 characters', 400);
  }

  return normalized;
};

const ensureFiltersProvided = (query: SearchQuery, tailNumber?: string) => {
  if (tailNumber || query.status || query.manufacturer || query.owner) {
    return;
  }

  throw new HttpError('At least one search filter is required', 400);
};

router.get(
  '/refresh-status',
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const prisma = getPrismaClient();
      const latest = await prisma.datasetIngestion.findFirst({
        orderBy: {
          startedAt: 'desc',
        },
      });

      if (!latest) {
        res.json({
          status: 'NOT_AVAILABLE',
          trigger: null,
          downloadedAt: null,
          startedAt: null,
          completedAt: null,
          failedAt: null,
          dataVersion: null,
          totals: null,
          errorMessage: null,
        });
        return;
      }

      res.json({
        id: latest.id,
        status: latest.status,
        trigger: latest.trigger,
        downloadedAt: latest.downloadedAt.toISOString(),
        startedAt: latest.startedAt.toISOString(),
        completedAt: latest.completedAt ? latest.completedAt.toISOString() : null,
        failedAt: latest.failedAt ? latest.failedAt.toISOString() : null,
        dataVersion: latest.dataVersion ?? null,
        totals: {
          manufacturers: latest.totalManufacturers ?? null,
          models: latest.totalModels ?? null,
          engines: latest.totalEngines ?? null,
          aircraft: latest.totalAircraft ?? null,
          owners: latest.totalOwners ?? null,
          ownerLinks: latest.totalOwnerLinks ?? null,
        },
        errorMessage: latest.errorMessage ?? null,
      });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/',
  validateRequest(searchRequestSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { query } = searchRequestSchema.parse({
        query: req.query,
        body: req.body,
        params: req.params,
      });

      const tailNumber = query.tailNumber ? normalizeTailNumber(query.tailNumber) : undefined;
      ensureFiltersProvided(query, tailNumber);

      const page = query.page ?? 1;
      const pageSize = query.pageSize ?? 25;
      const exact = query.exact ?? false;
      const status = query.status ? query.status.toUpperCase() : undefined;
      const manufacturer = query.manufacturer ?? undefined;
      const owner = query.owner ?? undefined;

      const prisma = getPrismaClient();
      const result = await searchAirplanes(prisma, {
        tailNumber: tailNumber
          ? {
              value: tailNumber,
              exact,
            }
          : undefined,
        status,
        manufacturer,
        owner,
        page,
        pageSize,
      });

      const totalPages = result.total === 0 ? 0 : Math.ceil(result.total / pageSize);

      res.json({
        data: result.data,
        meta: {
          page,
          pageSize,
          total: result.total,
          totalPages,
        },
        filters: {
          tailNumber: tailNumber
            ? {
                value: tailNumber,
                exact,
              }
            : null,
          status: status ?? null,
          manufacturer: manufacturer ?? null,
          owner: owner ?? null,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
