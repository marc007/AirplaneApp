import { fetchAirplanes } from './parseClient';

export const AIRPLANE_CACHE_KEY = 'airplaneCache';

const normalisePlane = (plane, index, requestedTailNumber) => {
  const identifier = plane.id ?? plane.objectId ?? plane.objectID ?? index + 1;
  const tailNumber = plane.nnumber ?? plane.tailNumber ?? requestedTailNumber;
  const manufacturer =
    plane.manufacturer ?? plane.mfr ?? plane.make ?? plane.manufacturerName ?? '';
  const model = plane.model ?? plane.modelName ?? plane.aircraftModel ?? '';
  const status = plane.status ?? plane.statusCode ?? plane.aircraftStatus ?? 'Unknown';

  return {
    ...plane,
    id: identifier,
    nnumber: tailNumber,
    manufacturer,
    model,
    status
  };
};

export class DataService {
  constructor(storage) {
    if (!storage) {
      throw new Error('A storage implementation is required');
    }

    this.storage = storage;
    this.airplaneInfos = [];
    this.refreshCache();
  }

  refreshCache() {
    const serialised = this.storage.getItem(AIRPLANE_CACHE_KEY);
    if (serialised) {
      try {
        const parsed = JSON.parse(serialised);
        if (Array.isArray(parsed)) {
          this.airplaneInfos = parsed;
        } else {
          this.airplaneInfos = [];
        }
      } catch (error) {
        this.airplaneInfos = [];
      }
    } else {
      this.airplaneInfos = [];
    }

    return this.getAirplaneInfos();
  }

  persist() {
    this.storage.setItem(AIRPLANE_CACHE_KEY, JSON.stringify(this.airplaneInfos));
  }

  getAirplaneInfos() {
    return this.airplaneInfos.map((plane) => ({ ...plane }));
  }

  getAirplaneInfo(id) {
    return this.airplaneInfos.find((plane) => plane.id === id) ?? null;
  }

  getNextId() {
    if (this.airplaneInfos.length === 0) {
      return 1;
    }

    const numericIdentifiers = this.airplaneInfos
      .map((plane) => plane.id)
      .filter((identifier) => typeof identifier === 'number' && !Number.isNaN(identifier));

    if (numericIdentifiers.length === 0) {
      return 1;
    }

    return Math.max(...numericIdentifiers) + 1;
  }

  saveAirplaneInfo(plane) {
    const planeToSave = { ...plane };
    if (!planeToSave.id) {
      planeToSave.id = this.getNextId();
    }

    const existingIndex = this.airplaneInfos.findIndex(({ id }) => id === planeToSave.id);

    if (existingIndex >= 0) {
      this.airplaneInfos.splice(existingIndex, 1, planeToSave);
    } else {
      this.airplaneInfos.push(planeToSave);
    }

    this.persist();
    return { ...planeToSave };
  }

  deleteAirplaneInfo(id) {
    this.airplaneInfos = this.airplaneInfos.filter((plane) => plane.id !== id);
    this.persist();
  }

  clearCache() {
    this.airplaneInfos = [];
    if (typeof this.storage.removeItem === 'function') {
      this.storage.removeItem(AIRPLANE_CACHE_KEY);
    } else {
      this.storage.setItem(AIRPLANE_CACHE_KEY, JSON.stringify([]));
    }
  }

  async search(tailNumber) {
    if (!tailNumber) {
      return [];
    }

    const trimmed = tailNumber.trim();
    if (!trimmed) {
      return [];
    }

    const normalisedTailNumber = trimmed.toUpperCase().startsWith('N')
      ? trimmed.toUpperCase()
      : `N${trimmed.toUpperCase()}`;

    const results = await fetchAirplanes(normalisedTailNumber);
    const normalizedResults = (Array.isArray(results) ? results : []).map((plane, index) =>
      normalisePlane(plane, index, normalisedTailNumber)
    );

    this.airplaneInfos = normalizedResults;
    this.persist();

    return this.getAirplaneInfos();
  }
}
