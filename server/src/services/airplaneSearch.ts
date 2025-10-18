import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';

export type AirplaneOwnerSummary = {
  name: string;
  city: string | null;
  state: string | null;
  country: string | null;
  ownershipType: string | null;
  lastActionDate: string | null;
};

export type AirplaneSearchResult = {
  tailNumber: string;
  serialNumber: string | null;
  statusCode: string | null;
  registrantType: string | null;
  manufacturer: string | null;
  model: string | null;
  modelCode: string | null;
  engineManufacturer: string | null;
  engineModel: string | null;
  airworthinessClass: string | null;
  certificationIssueDate: string | null;
  expirationDate: string | null;
  lastActivityDate: string | null;
  fractionalOwnership: boolean | null;
  owners: AirplaneOwnerSummary[];
};

export type AirplaneSearchParams = {
  tailNumber?: {
    value: string;
    exact: boolean;
  };
  status?: string;
  manufacturer?: string;
  owner?: string;
  page: number;
  pageSize: number;
};

export type AirplaneSearchPayload = {
  data: AirplaneSearchResult[];
  total: number;
  page: number;
  pageSize: number;
};

type AircraftWithRelations = Prisma.AircraftGetPayload<{
  select: {
    tailNumber: true;
    serialNumber: true;
    statusCode: true;
    registrantType: true;
    airworthinessClass: true;
    certificationIssueDate: true;
    expirationDate: true;
    lastActivityDate: true;
    fractionalOwnership: true;
    model: {
      select: {
        code: true;
        modelName: true;
        manufacturer: {
          select: {
            name: true;
          };
        };
      };
    };
    engine: {
      select: {
        manufacturer: true;
        model: true;
      };
    };
    owners: {
      select: {
        ownershipType: true;
        lastActionDate: true;
        owner: {
          select: {
            name: true;
            city: true;
            state: true;
            country: true;
          };
        };
      };
    };
  };
}>;

const mapOwner = (owner: AircraftWithRelations['owners'][number]): AirplaneOwnerSummary => ({
  name: owner.owner.name,
  city: owner.owner.city ?? null,
  state: owner.owner.state ?? null,
  country: owner.owner.country ?? null,
  ownershipType: owner.ownershipType ?? null,
  lastActionDate: owner.lastActionDate ? owner.lastActionDate.toISOString() : null,
});

const mapAircraft = (aircraft: AircraftWithRelations): AirplaneSearchResult => ({
  tailNumber: aircraft.tailNumber,
  serialNumber: aircraft.serialNumber ?? null,
  statusCode: aircraft.statusCode ?? null,
  registrantType: aircraft.registrantType ?? null,
  manufacturer: aircraft.model?.manufacturer?.name ?? null,
  model: aircraft.model?.modelName ?? null,
  modelCode: aircraft.model?.code ?? null,
  engineManufacturer: aircraft.engine?.manufacturer ?? null,
  engineModel: aircraft.engine?.model ?? null,
  airworthinessClass: aircraft.airworthinessClass ?? null,
  certificationIssueDate: aircraft.certificationIssueDate
    ? aircraft.certificationIssueDate.toISOString()
    : null,
  expirationDate: aircraft.expirationDate ? aircraft.expirationDate.toISOString() : null,
  lastActivityDate: aircraft.lastActivityDate ? aircraft.lastActivityDate.toISOString() : null,
  fractionalOwnership:
    typeof aircraft.fractionalOwnership === 'boolean'
      ? aircraft.fractionalOwnership
      : null,
  owners: aircraft.owners.map(mapOwner),
});

type TransactionClient = Parameters<PrismaClient['$transaction']>[0] extends (
  arg: (tx: infer T) => unknown,
) => unknown
  ? T
  : PrismaClient;

const FULL_TEXT_ERROR_PATTERN = /full[-\s]?text|contains/i;

const buildFullTextSearchTerm = (value: string): string => {
  const trimmed = value.trim();
  const tokens = trimmed
    .split(/\s+/)
    .map((token) => token.replace(/["']/g, '').trim())
    .filter(Boolean);

  if (tokens.length === 0) {
    const fallback = trimmed.replace(/["']/g, '');
    return `"*${fallback || trimmed}*"`;
  }

  return tokens.map((token) => `"*${token}*"`).join(' AND ');
};

const shouldRetryWithoutFullText = (error: unknown): boolean => {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2010' &&
    FULL_TEXT_ERROR_PATTERN.test(error.message)
  ) {
    return true;
  }

  if (error instanceof Error && FULL_TEXT_ERROR_PATTERN.test(error.message)) {
    return true;
  }

  return false;
};

const fetchPagedAircraftIds = async (
  client: TransactionClient,
  params: AirplaneSearchParams,
  skip: number,
  useFullText: boolean,
): Promise<{ ids: number[]; total: number }> => {
  const tailFilter = params.tailNumber;
  const statusFilter = params.status;
  const manufacturerFilter = params.manufacturer?.trim();
  const ownerFilter = params.owner?.trim();

  const start = skip + 1;
  const end = skip + params.pageSize;

  const manufacturerJoin = manufacturerFilter
    ? Prisma.sql`
        INNER JOIN [dbo].[AircraftModel] am ON am.[id] = a.[modelId]
        INNER JOIN [dbo].[Manufacturer] m ON m.[id] = am.[manufacturerId]
      `
    : Prisma.sql``;

  const ownerJoin = ownerFilter
    ? Prisma.sql`
        INNER JOIN [dbo].[AircraftOwner] ao ON ao.[aircraftId] = a.[id]
        INNER JOIN [dbo].[Owner] o ON o.[id] = ao.[ownerId]
      `
    : Prisma.sql``;

  const whereConditions: Prisma.Sql[] = [];

  if (tailFilter) {
    whereConditions.push(
      tailFilter.exact
        ? Prisma.sql`a.[tailNumber] = ${tailFilter.value}`
        : Prisma.sql`a.[tailNumber] LIKE ${`${tailFilter.value}%`}`,
    );
  }

  if (statusFilter) {
    whereConditions.push(Prisma.sql`a.[statusCode] = ${statusFilter}`);
  }

  if (manufacturerFilter) {
    if (useFullText) {
      whereConditions.push(
        Prisma.sql`CONTAINS(m.[name], ${buildFullTextSearchTerm(manufacturerFilter)})`,
      );
    } else {
      const manufacturerLower = manufacturerFilter.toLowerCase();
      whereConditions.push(Prisma.sql`CHARINDEX(${manufacturerLower}, LOWER(m.[name])) > 0`);
    }
  }

  if (ownerFilter) {
    if (useFullText) {
      whereConditions.push(
        Prisma.sql`CONTAINS(o.[name], ${buildFullTextSearchTerm(ownerFilter)})`,
      );
    } else {
      const ownerLower = ownerFilter.toLowerCase();
      whereConditions.push(Prisma.sql`CHARINDEX(${ownerLower}, LOWER(o.[name])) > 0`);
    }
  }

  const whereSql =
    whereConditions.length > 0
      ? Prisma.sql`WHERE ${Prisma.join(whereConditions, Prisma.sql` AND `)}`
      : Prisma.sql``;

  const buildFilteredCte = () => Prisma.sql`
    WITH Filtered AS (
      SELECT DISTINCT a.[id], a.[tailNumber]
      FROM [dbo].[Aircraft] a
      ${manufacturerJoin}
      ${ownerJoin}
      ${whereSql}
    )
  `;

  const totalRows = await client.$queryRaw<{ total: bigint }[]>(Prisma.sql`
    ${buildFilteredCte()}
    SELECT COUNT(1) AS total FROM Filtered;
  `);

  const total = totalRows.length > 0 ? Number(totalRows[0].total) : 0;

  if (total === 0) {
    return { ids: [], total: 0 };
  }

  const idsRows = await client.$queryRaw<{ id: number }[]>(Prisma.sql`
    ${buildFilteredCte()}
    SELECT numbered.[id]
    FROM (
      SELECT
        f.[id],
        ROW_NUMBER() OVER (ORDER BY f.[tailNumber], f.[id]) AS rn
      FROM Filtered f
    ) numbered
    WHERE numbered.rn BETWEEN ${start} AND ${end}
    ORDER BY numbered.rn;
  `);

  return {
    ids: idsRows.map((row) => Number(row.id)),
    total,
  };
};

export const searchAirplanes = async (
  prisma: PrismaClient,
  params: AirplaneSearchParams,
): Promise<AirplaneSearchPayload> => {
  const skip = (params.page - 1) * params.pageSize;

  const executeSearch = async (useFullText: boolean) =>
    prisma.$transaction(async (tx) => {
      const { ids, total } = await fetchPagedAircraftIds(tx, params, skip, useFullText);

      if (total === 0 || ids.length === 0) {
        return { total, aircraft: [] as AircraftWithRelations[] };
      }

      const aircraft = await tx.aircraft.findMany({
        where: {
          id: {
            in: ids,
          },
        },
        select: {
          tailNumber: true,
          serialNumber: true,
          statusCode: true,
          registrantType: true,
          airworthinessClass: true,
          certificationIssueDate: true,
          expirationDate: true,
          lastActivityDate: true,
          fractionalOwnership: true,
          model: {
            select: {
              code: true,
              modelName: true,
              manufacturer: {
                select: {
                  name: true,
                },
              },
            },
          },
          engine: {
            select: {
              manufacturer: true,
              model: true,
            },
          },
          owners: {
            orderBy: {
              owner: {
                name: 'asc',
              },
            },
            select: {
              ownershipType: true,
              lastActionDate: true,
              owner: {
                select: {
                  name: true,
                  city: true,
                  state: true,
                  country: true,
                },
              },
            },
          },
        },
        orderBy: [
          {
            tailNumber: 'asc',
          },
          {
            id: 'asc',
          },
        ],
      });

      return { total, aircraft };
    });

  const finalize = (result: {
    total: number;
    aircraft: AircraftWithRelations[];
  }): AirplaneSearchPayload => ({
    data: result.aircraft.map(mapAircraft),
    total: result.total,
    page: params.page,
    pageSize: params.pageSize,
  });

  try {
    const result = await executeSearch(true);
    return finalize(result);
  } catch (error) {
    const shouldFallback = Boolean(params.manufacturer || params.owner);

    if (shouldFallback && shouldRetryWithoutFullText(error)) {
      const fallbackResult = await executeSearch(false);
      return finalize(fallbackResult);
    }

    throw error;
  }
};
