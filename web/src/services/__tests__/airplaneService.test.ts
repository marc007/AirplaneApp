import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type MockResponse = {
  ok: boolean;
  status: number;
  text: () => Promise<string>;
};

const API_BASE_URL = 'https://api.test';

const createResponse = <TPayload>(payload: TPayload, status = 200): MockResponse => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => (payload !== undefined ? JSON.stringify(payload) : '')
});

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
  vi.stubEnv('VITE_API_BASE_URL', API_BASE_URL);
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.clear();
  }
});

afterEach(() => {
  if ('fetch' in globalThis) {
    delete (globalThis as { fetch?: typeof fetch }).fetch;
  }
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('airplaneService', () => {
  it('fetches and normalizes airplanes, caching subsequent requests', async () => {
    const refreshStatusPayload = {
      status: 'COMPLETED',
      completedAt: '2024-05-01T00:00:00.000Z',
      dataVersion: '2024.05',
      totals: {
        aircraft: 1,
        owners: 1
      }
    };

    const searchPayload = {
      data: [
        {
          tailNumber: 'N12345',
          statusCode: 'V',
          registrantType: 'Individual',
          manufacturer: 'Cessna',
          model: '172 Skyhawk',
          modelCode: 'CE-172',
          serialNumber: 'SN12345',
          engineManufacturer: 'Lycoming',
          engineModel: 'IO-360-L2A',
          airworthinessClass: 'Standard',
          certificationIssueDate: '2020-01-15T00:00:00.000Z',
          expirationDate: '2024-12-31T00:00:00.000Z',
          lastActivityDate: '2023-03-15T00:00:00.000Z',
          fractionalOwnership: false,
          owners: [
            {
              name: 'Jane Doe',
              city: 'Seattle',
              state: 'WA',
              country: 'US',
              ownershipType: 'Individual',
              lastActionDate: '2022-06-01T00:00:00.000Z'
            }
          ]
        }
      ],
      meta: {
        page: 1,
        pageSize: 1,
        total: 1,
        totalPages: 1
      },
      filters: {}
    };

    const fetchMock = vi.fn((url: string) => {
      if (url === `${API_BASE_URL}/api/airplanes/refresh-status`) {
        return Promise.resolve(createResponse(refreshStatusPayload));
      }
      if (url.startsWith(`${API_BASE_URL}/api/airplanes?`)) {
        return Promise.resolve(createResponse(searchPayload));
      }

      throw new Error(`Unexpected request for ${url}`);
    });

    (globalThis as { fetch?: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;

    const { clearSearchCache, searchAirplanes } = await import('../airplaneService');
    clearSearchCache();

    const result = await searchAirplanes('N12345');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe(`${API_BASE_URL}/api/airplanes/refresh-status`);
    expect(fetchMock.mock.calls[1][0]).toBe(`${API_BASE_URL}/api/airplanes?tailNumber=N12345&exact=true`);

    expect(result.fromCache).toBe(false);
    expect(result.airplanes).toHaveLength(1);
    const airplane = result.airplanes[0];
    expect(airplane.tailNumber).toBe('N12345');
    expect(airplane.certificationIssueDate.iso).toBe('2020-01-15T00:00:00.000Z');
    expect(airplane.owners).toHaveLength(1);
    expect(airplane.owners[0].location).toBe('Seattle, WA, US');
    expect(result.refreshStatus?.dataVersion).toBe('2024.05');

    const cached = await searchAirplanes('12345');
    expect(cached.fromCache).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(cached.airplanes[0].owners[0].location).toBe('Seattle, WA, US');
  });

  it('returns an empty result when no tail number is provided', async () => {
    const refreshStatusPayload = {
      status: 'NOT_AVAILABLE',
      completedAt: null,
      dataVersion: null,
      totals: null
    };

    const fetchMock = vi.fn((url: string) => {
      if (url === `${API_BASE_URL}/api/airplanes/refresh-status`) {
        return Promise.resolve(createResponse(refreshStatusPayload));
      }

      throw new Error(`Unexpected request for ${url}`);
    });

    (globalThis as { fetch?: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;

    const { searchAirplanes } = await import('../airplaneService');

    const result = await searchAirplanes('');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.airplanes).toHaveLength(0);
    expect(result.fromCache).toBe(false);
    expect(result.meta.total).toBe(0);
    expect(result.refreshStatus?.status).toBe('NOT_AVAILABLE');
  });

  it('throws descriptive errors when the API responds with an error payload', async () => {
    const refreshStatusPayload = {
      status: 'COMPLETED',
      completedAt: '2024-01-01T00:00:00.000Z',
      dataVersion: '2024.01',
      totals: null
    };

    const errorPayload = {
      message: 'At least one search filter is required'
    };

    const fetchMock = vi.fn((url: string) => {
      if (url === `${API_BASE_URL}/api/airplanes/refresh-status`) {
        return Promise.resolve(createResponse(refreshStatusPayload));
      }
      if (url.startsWith(`${API_BASE_URL}/api/airplanes?`)) {
        return Promise.resolve(createResponse(errorPayload, 400));
      }

      throw new Error(`Unexpected request for ${url}`);
    });

    (globalThis as { fetch?: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;

    const { searchAirplanes } = await import('../airplaneService');

    await expect(searchAirplanes('N00000')).rejects.toThrow('At least one search filter is required');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
