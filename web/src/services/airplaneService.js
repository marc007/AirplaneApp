import { normalizeNNumber } from '../utils/nNumber.js';

const env = typeof import.meta !== 'undefined' ? import.meta.env : undefined;
const processEnv = typeof process !== 'undefined' ? process.env : undefined;
const rawApiBaseUrl = env?.VITE_API_BASE_URL ?? processEnv?.VITE_API_BASE_URL;

if (!rawApiBaseUrl) {
  throw new Error('VITE_API_BASE_URL environment variable is required to contact the FAA search API.');
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
let persistedCache = loadPersistedCache();
const memoryCache = new Map();
let refreshStatusCache = null;
let refreshStatusFetchedAt = 0;

function createStorageAdapter() {
  try {
    const globalScope = typeof globalThis === 'object' ? globalThis : {};
    const storageCandidate =
      globalScope.localStorage ?? globalScope.window?.localStorage ?? globalScope.sessionStorage;

    if (storageCandidate) {
      const probeKey = '__airplanecheck_cache_probe__';
      storageCandidate.setItem(probeKey, probeKey);
      storageCandidate.removeItem(probeKey);
      return storageCandidate;
    }
  } catch (error) {
    console.warn('Unable to access browser storage, falling back to in-memory cache.', error);
  }

  const memory = new Map();
  return {
    getItem(key) {
      return memory.has(key) ? memory.get(key) : null;
    },
    setItem(key, value) {
      memory.set(key, value);
    },
    removeItem(key) {
      memory.delete(key);
    }
  };
}

function loadPersistedCache() {
  try {
    const serialized = storage.getItem(SEARCH_CACHE_STORAGE_KEY);
    if (!serialized) {
      return {
        version: null,
        entries: {}
      };
    }

    const parsed = JSON.parse(serialized);
    if (!parsed || typeof parsed !== 'object') {
      return {
        version: null,
        entries: {}
      };
    }

    return {
      version: parsed.version ?? null,
      entries: typeof parsed.entries === 'object' && parsed.entries ? parsed.entries : {}
    };
  } catch (error) {
    console.warn('Unable to read persisted airplane search cache. Clearing.', error);
    return {
      version: null,
      entries: {}
    };
  }
}

function persistCache() {
  try {
    storage.setItem(
      SEARCH_CACHE_STORAGE_KEY,
      JSON.stringify({
        version: persistedCache.version ?? null,
        entries: persistedCache.entries ?? {}
      })
    );
  } catch (error) {
    console.warn('Unable to persist airplane search cache.', error);
  }
}

function resetCache(version = persistedCache.version ?? null) {
  persistedCache = {
    version: version ?? null,
    entries: {}
  };
  memoryCache.clear();
  persistCache();
}

function versionsCompatible(entryVersion, datasetVersion) {
  if (!datasetVersion) {
    return entryVersion === null;
  }

  return entryVersion === datasetVersion;
}

function deepClone(value) {
  if (value === null || value === undefined) {
    return value;
  }

  return JSON.parse(JSON.stringify(value));
}

async function performFetch(url, options = {}) {
  const { headers, ...rest } = options;
  const response = await fetch(url, {
    ...rest,
    headers: {
      Accept: 'application/json',
      ...(headers || {})
    }
  });

  const text = await response.text();
  let payload = null;

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch (error) {
      throw new Error('Search API returned invalid JSON.');
    }
  }

  if (!response.ok) {
    const message = payload?.message ?? `Request failed with status ${response.status}.`;
    const error = new Error(message);
    error.status = response.status;
    if (payload?.details) {
      error.details = payload.details;
    }
    throw error;
  }

  return payload ?? {};
}

function toFormattedDate(value, formatter) {
  if (!value) {
    return {
      iso: null,
      display: ''
    };
  }

  const date = value instanceof Date ? value : new Date(value);
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

function mapDate(value) {
  return toFormattedDate(value, dateFormatter);
}

function mapTimestamp(value) {
  return toFormattedDate(value, dateTimeFormatter);
}

function normalizeTotals(input) {
  if (!input || typeof input !== 'object') {
    return null;
  }

  const toNumberOrNull = (value) => {
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

function normalizeRefreshStatus(input) {
  const downloadedAt = mapTimestamp(input?.downloadedAt ?? null);
  const startedAt = mapTimestamp(input?.startedAt ?? null);
  const completedAt = mapTimestamp(input?.completedAt ?? null);
  const failedAt = mapTimestamp(input?.failedAt ?? null);

  const datasetVersion = input?.dataVersion ?? completedAt.iso ?? startedAt.iso ?? downloadedAt.iso ?? null;

  return {
    id: input?.id ?? null,
    status: input?.status ?? 'UNKNOWN',
    trigger: input?.trigger ?? null,
    downloadedAt,
    startedAt,
    completedAt,
    failedAt,
    dataVersion: input?.dataVersion ?? null,
    datasetVersion,
    totals: normalizeTotals(input?.totals),
    errorMessage: input?.errorMessage ?? null
  };
}

function extractDatasetVersion(status) {
  return status?.datasetVersion ?? null;
}

function setCacheVersion(datasetVersion) {
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

function buildSearchCacheKey(params) {
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

function readFromCache(cacheKey, datasetVersion) {
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

function storeInCache(cacheKey, datasetVersion, result) {
  if (!cacheKey) {
    return;
  }

  const entry = {
    version: datasetVersion ?? null,
    storedAt: Date.now(),
    result: deepClone(result)
  };

  memoryCache.set(cacheKey, entry);
  if (!persistedCache.entries) {
    persistedCache.entries = {};
  }
  persistedCache.entries[cacheKey] = entry;
  persistCache();
}

function mapOwner(dto) {
  if (!dto || typeof dto !== 'object') {
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
  const parts = [dto.city, dto.state, dto.country].filter((part) => !!part && String(part).trim() !== '');

  return {
    name: typeof dto.name === 'string' ? dto.name : '',
    city: dto.city ?? null,
    state: dto.state ?? null,
    country: dto.country ?? null,
    ownershipType: dto.ownershipType ?? null,
    lastActionDate,
    location: parts.length ? parts.join(', ') : null
  };
}

function mapAirplane(dto, index) {
  const tailNumber = normalizeNNumber(dto?.tailNumber ?? dto?.nnumber ?? '');
  const owners = Array.isArray(dto?.owners) ? dto.owners.map(mapOwner) : [];
  const primaryOwner = owners[0] ?? null;

  return {
    id: dto?.id ?? (tailNumber || `airplane-${index}`),
    tailNumber,
    serialNumber: dto?.serialNumber ?? null,
    statusCode: dto?.statusCode ?? null,
    registrantType: dto?.registrantType ?? null,
    manufacturer: dto?.manufacturer ?? null,
    model: dto?.model ?? null,
    modelCode: dto?.modelCode ?? null,
    engineManufacturer: dto?.engineManufacturer ?? null,
    engineModel: dto?.engineModel ?? null,
    airworthinessClass: dto?.airworthinessClass ?? null,
    certificationIssueDate: mapDate(dto?.certificationIssueDate ?? null),
    expirationDate: mapDate(dto?.expirationDate ?? null),
    lastActivityDate: mapDate(dto?.lastActivityDate ?? null),
    fractionalOwnership:
      typeof dto?.fractionalOwnership === 'boolean' ? dto.fractionalOwnership : null,
    owners,
    primaryOwner,
    raw: dto ?? null
  };
}

function normalizeFilters(rawFilters, fallbackTailNumber) {
  const tailNumberFilter = rawFilters?.tailNumber;
  let normalizedTailNumberFilter = null;

  if (tailNumberFilter && typeof tailNumberFilter === 'object') {
    const value = normalizeNNumber(tailNumberFilter.value ?? '');
    normalizedTailNumberFilter = value
      ? {
          value,
          exact: Boolean(tailNumberFilter.exact)
        }
      : null;
  } else if (fallbackTailNumber) {
    normalizedTailNumberFilter = {
      value: fallbackTailNumber,
      exact: true
    };
  }

  return {
    tailNumber: normalizedTailNumberFilter,
    status: rawFilters?.status ?? null,
    manufacturer: rawFilters?.manufacturer ?? null,
    owner: rawFilters?.owner ?? null
  };
}

function normalizeSearchPayload(payload, fallbackTailNumber) {
  const sourceData = Array.isArray(payload?.data) ? payload.data : [];
  const airplanes = sourceData.map(mapAirplane);

  const meta = {
    page: payload?.meta?.page ?? 1,
    pageSize: payload?.meta?.pageSize ?? (sourceData.length || 25),
    total: payload?.meta?.total ?? sourceData.length,
    totalPages: payload?.meta?.totalPages ?? (sourceData.length ? 1 : 0)
  };

  return {
    airplanes,
    meta,
    filters: normalizeFilters(payload?.filters, fallbackTailNumber),
    receivedAt: new Date().toISOString()
  };
}

export async function getRefreshStatus(options = {}) {
  const { force = false } = options;

  if (!force && refreshStatusCache && Date.now() - refreshStatusFetchedAt < REFRESH_STATUS_TTL_MS) {
    return deepClone(refreshStatusCache);
  }

  const status = normalizeRefreshStatus(
    await performFetch(`${API_BASE_URL}${REFRESH_STATUS_ENDPOINT}`, options.fetchOptions ?? {})
  );

  refreshStatusCache = status;
  refreshStatusFetchedAt = Date.now();

  setCacheVersion(extractDatasetVersion(status));

  return deepClone(status);
}

export function clearSearchCache() {
  resetCache();
}

export async function searchAirplanes(rawNNumber, options = {}) {
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
    return {
      airplanes: [],
      meta: {
        page: 1,
        pageSize: 0,
        total: 0,
        totalPages: 0
      },
      filters: normalizeFilters({}, null),
      receivedAt: new Date().toISOString(),
      refreshStatus,
      fromCache: false
    };
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

  const payload = await performFetch(url, { signal });
  const normalizedResult = normalizeSearchPayload(payload, normalizedTailNumber);

  storeInCache(cacheKey, datasetVersion, {
    airplanes: normalizedResult.airplanes,
    meta: normalizedResult.meta,
    filters: normalizedResult.filters,
    receivedAt: normalizedResult.receivedAt
  });

  return {
    ...normalizedResult,
    refreshStatus,
    fromCache: false
  };
}

export async function getAirplaneDetails(rawNNumber, options = {}) {
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
