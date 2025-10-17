import type { Prisma, PrismaClient } from '@prisma/client';

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

export const searchAirplanes = async (
  prisma: PrismaClient,
  params: AirplaneSearchParams,
): Promise<AirplaneSearchPayload> => {
  const where: Prisma.AircraftWhereInput = {};

  if (params.tailNumber) {
    where.tailNumber = params.tailNumber.exact
      ? params.tailNumber.value
      : { startsWith: params.tailNumber.value };
  }

  if (params.status) {
    where.statusCode = params.status;
  }

  if (params.manufacturer) {
    where.model = {
      manufacturer: {
        name: {
          contains: params.manufacturer,
          mode: 'insensitive',
        },
      },
    };
  }

  if (params.owner) {
    where.owners = {
      some: {
        owner: {
          name: {
            contains: params.owner,
            mode: 'insensitive',
          },
        },
      },
    };
  }

  const skip = (params.page - 1) * params.pageSize;

  const [total, aircraft] = await prisma.$transaction([
    prisma.aircraft.count({ where }),
    prisma.aircraft.findMany({
      where,
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
      orderBy: {
        tailNumber: 'asc',
      },
      skip,
      take: params.pageSize,
    }),
  ]);

  return {
    data: aircraft.map(mapAircraft),
    total,
    page: params.page,
    pageSize: params.pageSize,
  };
};
