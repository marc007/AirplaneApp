import { DataService, AIRPLANE_CACHE_KEY } from '../dataService';
import { createMemoryStorage } from '../../storage/memoryStorage';
import { fetchAirplanes } from '../parseClient';

jest.mock('../parseClient');

describe('DataService', () => {
  let storage;
  let service;

  beforeEach(() => {
    fetchAirplanes.mockReset();
    storage = createMemoryStorage();
    service = new DataService(storage);
  });

  it('normalises search queries, caches results, and returns cloned data', async () => {
    const plane = {
      id: 'abc123',
      tailNumber: 'N12345',
      manufacturer: 'Cessna',
      model: '172',
      statusCode: 'ACTIVE',
      expirationDate: '2024-12-31T00:00:00.000Z',
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
    };
    fetchAirplanes.mockResolvedValueOnce({
      data: [plane],
      meta: {
        total: 1,
        page: 1,
        pageSize: 1,
        totalPages: 1
      },
      filters: {
        tailNumber: {
          value: 'N12345',
          exact: true
        }
      }
    });

    const results = await service.search('12345');

    expect(fetchAirplanes).toHaveBeenCalledWith('N12345');
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      id: 'abc123',
      nnumber: 'N12345',
      manufacturer: 'Cessna',
      model: '172',
      status: 'ACTIVE',
      expirationDate: '2024-12-31T00:00:00.000Z'
    });
    expect(results[0].owners).toEqual([
      {
        name: 'Jane Doe',
        location: 'Seattle, WA, US',
        ownershipType: 'Individual',
        lastActionDate: '2022-06-01T00:00:00.000Z'
      }
    ]);
    expect(service.lastMeta).toMatchObject({ total: 1, page: 1 });
    expect(service.lastFilters).toMatchObject({
      tailNumber: {
        value: 'N12345',
        exact: true
      }
    });
    expect(results[0]).not.toBe(service.getAirplaneInfos()[0]);

    const serialised = storage.getItem(AIRPLANE_CACHE_KEY);
    expect(serialised).toBeTruthy();

    const hydratedService = new DataService(storage);
    expect(hydratedService.getAirplaneInfos()).toHaveLength(1);
    expect(hydratedService.getAirplaneInfo('abc123').nnumber).toBe('N12345');
  });

  it('refreshCache reads data from storage when present', () => {
    const cached = [
      { id: 1, nnumber: 'N54321', manufacturer: 'Piper', model: 'PA-28', status: 'Inactive' }
    ];
    storage.setItem(AIRPLANE_CACHE_KEY, JSON.stringify(cached));

    const refreshedService = new DataService(storage);
    expect(refreshedService.getAirplaneInfos()).toEqual(cached);
  });

  it('saveAirplaneInfo assigns identifiers and persists updates', () => {
    const saved = service.saveAirplaneInfo({
      nnumber: 'N77777',
      manufacturer: 'Beechcraft',
      model: 'Bonanza',
      status: 'Active'
    });

    expect(saved.id).toBe(1);
    expect(service.getAirplaneInfo(saved.id)).toMatchObject({ nnumber: 'N77777' });

    service.saveAirplaneInfo({ id: saved.id, nnumber: 'N77777', manufacturer: 'Beechcraft', model: 'G36' });

    const entries = JSON.parse(storage.getItem(AIRPLANE_CACHE_KEY));
    expect(entries[0].model).toBe('G36');
  });

  it('clearCache removes all entries from storage and memory', () => {
    service.saveAirplaneInfo({ nnumber: 'N10101', manufacturer: 'Mooney', model: 'M20J' });

    expect(service.getAirplaneInfos()).toHaveLength(1);

    service.clearCache();

    expect(service.getAirplaneInfos()).toHaveLength(0);
    expect(storage.getItem(AIRPLANE_CACHE_KEY)).toBeNull();
  });
});
