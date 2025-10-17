import { normalizeNNumber } from '../utils/nNumber';
import type {
  Airplane,
  AirplaneDetailsResult,
  AirplaneOwner,
  NormalizedFilters,
  RefreshStatus,
  RefreshTotals,
  SearchMeta,
  SearchResult,
  SearchResultPayload
} from '../types/airplane';

interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface CacheEntry {
  version: string | null;
  storedAt: number;
  result: SearchResultPayload;
}

interface PersistedCache {
  version: string | null;
  entries: Record<string, CacheEntry>;
}

type ApiAirplane = Record<string, unknown>;

type ApiFilters = Record<string, unknown> | undefined;

interface ApiSearchResponse {
  data?: ApiAirplane[];
  meta?: Partial<Record<keyof SearchMeta, unknown>>;
  filters?: ApiFilters;
}

interface ApiRefreshStatus {
  id?: string | number | null;
  status?: string | null;
  trigger?: string | null;
  downloadedAt?: unknown;
  startedAt?: unknown;
  completedAt?: unknown;
  failedAt?: unknown;
  dataVersion?: string | null;
  totals?: Record<string, unknown> | null;
  errorMessage?: string | null;
}

interface CacheKeyParams {
  tailNumber?: string | null;
  exact?: boolean;
  page?: number;
  pageSize?: number;
  status?: string | null;
  manufacturer?: string | null;
  owner?: string | null;
}

type GlobalWithProcess = typeof globalThis & {
  process?: {
    env?: Record<string, string | undefined>;
  };
};

export interface RefreshStatusOptions {
  force?: boolean;
  fetchOptions?: RequestInit;
}

export interface SearchOptions {
  forceRefresh?: boolean;
  forceRefreshMetadata?: boolean;
  page?: number;
  pageSize?: number;
  signal?: AbortSignal;
}

export class ApiError extends Error {
  readonly status: number;
  readonly details?: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

const env = typeof import.meta !== 'undefined' ? import.meta.env : undefined;
const rawApiBaseUrl =
  env?.VITE_API_BASE_URL ??
  ((globalThis as GlobalWithProcess).process?.env?.VITE_API_BASE_URL ?? undefined);

if (!rawApiBaseUrl) {
  throw new Error(
    'VITE_API_BASE_URL environment variable is required to contact the FAA search API.'
  );
}

const API_BASE_URL = String(rawApiBaseUrl).replace(/\/$/, '');
const SEARCH_ENDPOINT = '/api/airplanes';
const REFRESH_STATUS_ENDPOINT = '/api/airplanes/refresh-status';
const SEARCH_CACHE_STORAGE_KEY = 'airplanecheck:web:search-cache:v2';
const REFRESH_STATUS_TTL_MS = 2 * 60 * 1000;

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric'
});

const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: 'numeric'
});

const storage = createStorageAdapter();
let persistedCache = loadPersistedCache(storage);
const memoryCache = new Map<string, CacheEntry>();
let refreshStatusCache: RefreshStatus | null = null;
let refreshStatusFetchedAt = 0;

function createStorageAdapter(): StorageAdapter {
  try {
    const globalScope = typeof globalThis === 'object' ? globalThis : {};
    const storageCandidate =
      (globalScope as unknown as { localStorage?: Storage; window?: Window; sessionStorage?: Storage })
        .localStorage ??
      (globalScope as unknown as { localStorage?: Storage; window?: Window; sessionStorage?: Storage })
        .window?.localStorage ??
      (globalScope as unknown as { localStorage?: Storage; window?: Window; sessionStorage?: Storage })
        .sessionStorage;

    if (storageCandidate) {
      const probeKey = '__airplanecheck_cache_probe__';
      storageCandidate.setItem(probeKey, probeKey);
      storageCandidate.removeItem(probeKey);
      return storageCandidate;
    }
  } catch (error) {
    console.warn('Unable to access browser storage, falling back to in-memory cache.', error);
  }

  const memory = new Map<string, string>();
  return {
    getItem(key: string) {
      return memory.has(key) ? memory.get(key)! : null;
    },
    setItem(key: string, value: string) {
      memory.set(key, value);
    },
    removeItem(key: string) {
      memory.delete(key);
    }
  };
}

function loadPersistedCache(adapter: StorageAdapter): PersistedCache {
  try {
    const serialized = adapter.getItem(SEARCH_CACHE_STORAGE_KEY);
    if (!serialized) {
      return { version: null, entries: {} };
    }

    const parsed = JSON.parse(serialized) as Partial<PersistedCache> | null;
    if (!parsed || typeof parsed !== 'object') {
      return { version: null, entries: {} };
    }

    const version =
      typeof parsed.version === 'string' || parsed.version === null ? parsed.version ?? null : null;
    const entries =
      parsed.entries && typeof parsed.entries === 'object'
        ? (parsed.entries as Record<string, CacheEntry>)
        : {};

    return {
      version,
      entries: entries ?? {}
    };
  } catch (error) {
    console.warn('Unable to read persisted airplane search cache. Clearing.', error);
    return { version: null, entries: {} };
  }
}

function persistCache(adapter: StorageAdapter, cache: PersistedCache): void {
  try {
    adapter.setItem(
      SEARCH_CACHE_STORAGE_KEY,
      JSON.stringify({
        version: cache.version ?? null,
        entries: cache.entries ?? {}
      })
    );
  } catch (error) {
    console.warn('Unable to persist airplane search cache.', error);
  }
}

function resetCache(version: string | null = persistedCache.version ?? null): void {
  persistedCache = {
    version: version ?? null,
    entries: {}
  };
  memoryCache.clear();
  persistCache(storage, persistedCache);
}

function versionsCompatible(
  entryVersion: string | null,
  datasetVersion: string | null
): boolean {
  if (!datasetVersion) {
    return entryVersion === null;
  }

  return entryVersion === datasetVersion;
}

function deepClone<T>(value: T): T {
  if (value === null || value === undefined) {
    return value;
  }

  return JSON.parse(JSON.stringify(value)) as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

async function performFetch<TResponse>(
  url: string,
  options: RequestInit = {}
): Promise<TResponse> {
  const headers = new Headers(options.headers ?? undefined);
  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json');
  }

  const response = await fetch(url, {
    ...options,
    headers
  });

  const text = await response.text();
  let payload: unknown = null;

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch (error) {
      throw new ApiError('Search API returned invalid JSON.', response.status);
    }
  }

  if (!response.ok) {
    const payloadRecord = isRecord(payload) ? payload : undefined;
    const message =
      payloadRecord && typeof payloadRecord.message === 'string'
        ? payloadRecord.message
        : `Request failed with status ${response.status}.`;
    const details = payloadRecord?.details;
    throw new ApiError(message, response.status, details);
  }

  return (payload ?? {}) as TResponse;
}

function toFormattedDate(value: unknown, formatter: Intl.DateTimeFormat) {
  if (!value) {
    return {
      iso: null,
      display: ''
    };
  }

  const date = value instanceof Date ? value : new Date(value as string);
  if (Number.isNaN(date.getTime())) {
    return {
      iso: null,
      display: ''
    };
  }

  return {
    iso: date.toISOString(),
    display: formatter.format(date)
  };
}

function mapDate(value: unknown) {
  return toFormattedDate(value, dateFormatter);
}

function mapTimestamp(value: unknown) {
  return toFormattedDate(value, dateTimeFormatter);
}

function normalizeTotals(input: unknown): RefreshTotals | null {
  if (!isRecord(input)) {
    return null;
  }

  const toNumberOrNull = (value: unknown): number | null => {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }

    return null;
  };

  return {
    manufacturers: toNumberOrNull(input.manufacturers),
    models: toNumberOrNull(input.models),
    engines: toNumberOrNull(input.engines),
    aircraft: toNumberOrNull(input.aircraft),
    owners: toNumberOrNull(input.owners),
    ownerLinks: toNumberOrNull(input.ownerLinks)
  };
}

function normalizeRefreshStatus(input: ApiRefreshStatus | null | undefined): RefreshStatus {
  const downloadedAt = mapTimestamp(input?.downloadedAt ?? null);
  const startedAt = mapTimestamp(input?.startedAt ?? null);
  const completedAt = mapTimestamp(input?.completedAt ?? null);
  const failedAt = mapTimestamp(input?.failedAt ?? null);

  const datasetVersion =
    input?.dataVersion ?? completedAt.iso ?? startedAt.iso ?? downloadedAt.iso ?? null;

  return {
    id: (input?.id ?? null) as string | number | null,
    status: input?.status ?? 'UNKNOWN',
    trigger: input?.trigger ?? null,
    downloadedAt,
    startedAt,
    completedAt,
    failedAt,
    dataVersion: input?.dataVersion ?? null,
    datasetVersion,
    totals: normalizeTotals(input?.totals ?? null),
    errorMessage: input?.errorMessage ?? null
  };
}

function extractDatasetVersion(status: RefreshStatus | null): string | null {
  return status?.datasetVersion ?? null;
}

function setCacheVersion(datasetVersion: string | null): void {
  if (!datasetVersion) {
    if (persistedCache.version !== null || Object.keys(persistedCache.entries).length > 0) {
      resetCache(null);
    }
    return;
  }

  if (persistedCache.version !== datasetVersion) {
    resetCache(datasetVersion);
  }
}

function buildSearchCacheKey(params: CacheKeyParams): string {
  return JSON.stringify({
    tailNumber: params.tailNumber ?? null,
    exact: params.exact ?? false,
    page: params.page ?? 1,
    pageSize: params.pageSize ?? 25,
    status: params.status ?? null,
    manufacturer: params.manufacturer ?? null,
    owner: params.owner ?? null
  });
}

function readFromCache(
  cacheKey: string | null,
  datasetVersion: string | null
): SearchResultPayload | null {
  if (!cacheKey) {
    return null;
  }

  const memoEntry = memoryCache.get(cacheKey);
  if (memoEntry && versionsCompatible(memoEntry.version ?? null, datasetVersion ?? null)) {
    return deepClone(memoEntry.result);
  }

  const persistedEntry = persistedCache.entries?.[cacheKey];
  if (persistedEntry && versionsCompatible(persistedEntry.version ?? null, datasetVersion ?? null)) {
    memoryCache.set(cacheKey, persistedEntry);
    return deepClone(persistedEntry.result);
  }

  return null;
}

function storeInCache(
  cacheKey: string | null,
  datasetVersion: string | null,
  result: SearchResultPayload
): void {
  if (!cacheKey) {
    return;
  }

  const entry: CacheEntry = {
    version: datasetVersion ?? null,
    storedAt: Date.now(),
    result: deepClone(result)
  };

  memoryCache.set(cacheKey, entry);
  if (!persistedCache.entries) {
    persistedCache.entries = {};
  }
  persistedCache.entries[cacheKey] = entry;
  persistCache(storage, persistedCache);
}

function mapOwner(dto: unknown): AirplaneOwner {
  if (!isRecord(dto)) {
    return {
      name: '',
      city: null,
      state: null,
      country: null,
      ownershipType: null,
      lastActionDate: mapDate(null),
      location: null
    };
  }

  const lastActionDate = mapDate(dto.lastActionDate ?? null);
  const parts = [dto.city, dto.state, dto.country]
    .filter((part) => typeof part === 'string' && part.trim() !== '')
    .map((part) => (part as string).trim());

  return {
    name: typeof dto.name === 'string' ? dto.name : '',
    city: typeof dto.city === 'string' ? dto.city : null,
    state: typeof dto.state === 'string' ? dto.state : null,
    country: typeof dto.country === 'string' ? dto.country : null,
    ownershipType: typeof dto.ownershipType === 'string' ? dto.ownershipType : null,
    lastActionDate,
    location: parts.length ? parts.join(', ') : null
  };
}

function mapAirplane(dto: ApiAirplane, index: number): Airplane {
  const tailNumber = normalizeNNumber(dto?.tailNumber ?? dto?.nnumber ?? '');
  const owners = Array.isArray(dto?.owners) ? dto.owners.map(mapOwner) : [];
  const primaryOwner = owners[0] ?? null;
  const idSource = dto?.id ?? (tailNumber || `airplane-${index}`);
  const id = typeof idSource === 'string' ? idSource : String(idSource);

  return {
    id,
    tailNumber,
    serialNumber: typeof dto?.serialNumber === 'string' ? dto.serialNumber : null,
    statusCode: typeof dto?.statusCode === 'string' ? dto.statusCode : null,
    registrantType: typeof dto?.registrantType === 'string' ? dto.registrantType : null,
    manufacturer: typeof dto?.manufacturer === 'string' ? dto.manufacturer : null,
    model: typeof dto?.model === 'string' ? dto.model : null,
    modelCode: typeof dto?.modelCode === 'string' ? dto.modelCode : null,
    engineManufacturer:
      typeof dto?.engineManufacturer === 'string' ? dto.engineManufacturer : null,
    engineModel: typeof dto?.engineModel === 'string' ? dto.engineModel : null,
    airworthinessClass:
      typeof dto?.airworthinessClass === 'string' ? dto.airworthinessClass : null,
    certificationIssueDate: mapDate(dto?.certificationIssueDate ?? null),
    expirationDate: mapDate(dto?.expirationDate ?? null),
    lastActivityDate: mapDate(dto?.lastActivityDate ?? null),
    fractionalOwnership:
      typeof dto?.fractionalOwnership === 'boolean'
        ? dto.fractionalOwnership
        : null,
    owners,
    primaryOwner,
    raw: dto ?? null
  };
}

function normalizeFilters(
  rawFilters: ApiFilters,
  fallbackTailNumber: string | null
): NormalizedFilters {
  const raw: Record<string, unknown> = isRecord(rawFilters)
    ? (rawFilters as Record<string, unknown>)
    : {};
  const tailNumberFilter = raw.tailNumber;
  let normalizedTailNumberFilter: NormalizedFilters['tailNumber'] = null;

  if (isRecord(tailNumberFilter)) {
    const value = normalizeNNumber(tailNumberFilter.value ?? '');
    if (value) {
      normalizedTailNumberFilter = {
        value,
        exact: Boolean(tailNumberFilter.exact)
      };
    }
  } else if (fallbackTailNumber) {
    normalizedTailNumberFilter = {
      value: fallbackTailNumber,
      exact: true
    };
  }

  return {
    tailNumber: normalizedTailNumberFilter,
    status: typeof raw.status === 'string' ? (raw.status as string) : null,
    manufacturer: typeof raw.manufacturer === 'string' ? (raw.manufacturer as string) : null,
    owner: typeof raw.owner === 'string' ? (raw.owner as string) : null
  };
}

function normalizeSearchPayload(
  payload: ApiSearchResponse,
  fallbackTailNumber: string | null
): SearchResultPayload {
  const sourceData = Array.isArray(payload?.data) ? payload.data : [];
  const airplanes = sourceData.map(mapAirplane);

  const toNumber = (value: unknown, fallback: number): number => {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
    return fallback;
  };

  const meta: SearchMeta = {
    page: toNumber(payload?.meta?.page, 1),
    pageSize: toNumber(payload?.meta?.pageSize, sourceData.length || 25),
    total: toNumber(payload?.meta?.total, sourceData.length),
    totalPages: toNumber(payload?.meta?.totalPages, sourceData.length ? 1 : 0)
  };

  return {
    airplanes,
    meta,
    filters: normalizeFilters(payload?.filters, fallbackTailNumber),
    receivedAt: new Date().toISOString()
  };
}

export async function getRefreshStatus(
  options: RefreshStatusOptions = {}
): Promise<RefreshStatus> {
  const { force = false } = options;

  if (!force && refreshStatusCache && Date.now() - refreshStatusFetchedAt < REFRESH_STATUS_TTL_MS) {
    return deepClone(refreshStatusCache);
  }

  const status = normalizeRefreshStatus(
    await performFetch<ApiRefreshStatus>(
      `${API_BASE_URL}${REFRESH_STATUS_ENDPOINT}`,
      options.fetchOptions
    )
  );

  refreshStatusCache = status;
  refreshStatusFetchedAt = Date.now();

  setCacheVersion(extractDatasetVersion(status));

  return deepClone(status);
}

export function clearSearchCache(): void {
  resetCache();
}

export async function searchAirplanes(
  rawNNumber: string | null | undefined,
  options: SearchOptions = {}
): Promise<SearchResult> {
  const normalizedTailNumber = normalizeNNumber(rawNNumber);
  const {
    forceRefresh = false,
    page = 1,
    pageSize = 25,
    signal
  } = options;

  const forceMetadata = options.forceRefreshMetadata === true || forceRefresh;
  const refreshStatus = await getRefreshStatus({ force: forceMetadata });
  const datasetVersion = extractDatasetVersion(refreshStatus);

  if (!normalizedTailNumber) {
    const emptyResult: SearchResult = {
      airplanes: [],
      meta: {
        page: 1,
        pageSize: 0,
        total: 0,
        totalPages: 0
      },
      filters: normalizeFilters(undefined, null),
      receivedAt: new Date().toISOString(),
      refreshStatus,
      fromCache: false
    };

    return emptyResult;
  }

  const cacheKey = buildSearchCacheKey({
    tailNumber: normalizedTailNumber,
    exact: true,
    page,
    pageSize
  });

  if (!forceRefresh) {
    const cached = readFromCache(cacheKey, datasetVersion);
    if (cached) {
      return {
        ...cached,
        refreshStatus,
        fromCache: true
      };
    }
  }

  const searchParams = new URLSearchParams();
  searchParams.set('tailNumber', normalizedTailNumber);
  searchParams.set('exact', 'true');
  if (page && page !== 1) {
    searchParams.set('page', String(page));
  }
  if (pageSize && pageSize !== 25) {
    searchParams.set('pageSize', String(pageSize));
  }

  const queryString = searchParams.toString();
  const url = `${API_BASE_URL}${SEARCH_ENDPOINT}${queryString ? `?${queryString}` : ''}`;

  const payload = await performFetch<ApiSearchResponse>(url, { signal });
  const normalizedResult = normalizeSearchPayload(payload, normalizedTailNumber);

  storeInCache(cacheKey, datasetVersion, normalizedResult);

  return {
    ...normalizedResult,
    refreshStatus,
    fromCache: false
  };
}

export async function getAirplaneDetails(
  rawNNumber: string | null | undefined,
  options: SearchOptions = {}
): Promise<AirplaneDetailsResult> {
  const normalizedTailNumber = normalizeNNumber(rawNNumber);
  const result = await searchAirplanes(rawNNumber, options);
  const airplane = normalizedTailNumber
    ? result.airplanes.find((item) => item.tailNumber === normalizedTailNumber) ?? null
    : result.airplanes[0] ?? null;

  return {
    airplane,
    refreshStatus: result.refreshStatus,
    fromCache: result.fromCache,
    meta: result.meta,
    filters: result.filters,
    receivedAt: result.receivedAt
  };
}
