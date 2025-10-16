import Parse from 'parse';
import {
  AirplaneInfo,
  FAAMasterAttributes,
  SerializableAirplaneInfo,
  airplaneInfoFromParseObject,
  deserializeAirplaneInfo,
  serializeAirplaneInfo,
} from '../models/AirplaneInfo';

export type StorageAdapter = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

const createStorageAdapter = (): StorageAdapter => {
  try {
    const globalScope: any = typeof globalThis === 'object' ? globalThis : {};
    const storageCandidate: StorageAdapter | undefined =
      globalScope.localStorage ?? globalScope.window?.localStorage;

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
    },
  };
};

export interface FetchAirplanesOptions {
  /**
   * Maximum number of results to request from Parse.
   * Defaults to 50 which mirrors the standard Parse limit.
   */
  limit?: number;
}

export class AirplaneDataServiceError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'AirplaneDataServiceError';
  }
}

export class AirplaneDataService {
  private readonly storage: StorageAdapter;
  private readonly cacheKey: string;
  private _airplaneInfos: AirplaneInfo[] = [];

  constructor(options?: { cacheKey?: string; storage?: StorageAdapter }) {
    this.cacheKey = options?.cacheKey ?? 'airplanecheck:airplaneinfos';
    this.storage = options?.storage ?? createStorageAdapter();
    this.refreshCache();
  }

  get airplaneInfos(): ReadonlyArray<AirplaneInfo> {
    return [...this._airplaneInfos];
  }

  refreshCache(): void {
    const cached = this.storage.getItem(this.cacheKey);
    if (!cached) {
      this._airplaneInfos = [];
      return;
    }

    try {
      const parsed = JSON.parse(cached) as SerializableAirplaneInfo[];
      this._airplaneInfos = parsed.map(deserializeAirplaneInfo);
    } catch (error) {
      console.error('Unable to deserialize cached airplane info. Clearing cache.', error);
      this._airplaneInfos = [];
      this.storage.removeItem(this.cacheKey);
    }
  }

  clearCache(): void {
    this._airplaneInfos = [];
    try {
      this.storage.removeItem(this.cacheKey);
    } catch (error) {
      console.error('Unable to clear airplane cache', error);
    }
  }

  getAirplaneInfo(id: number): AirplaneInfo | undefined {
    return this._airplaneInfos.find((info) => info.id === id);
  }

  saveAirplaneInfo(airplaneInfo: AirplaneInfo): AirplaneInfo {
    const normalized = { ...airplaneInfo };
    const existingIndex = this.findExistingIndex(normalized);

    if (existingIndex >= 0) {
      const existing = this._airplaneInfos[existingIndex];
      normalized.id = existing.id ?? normalized.id ?? this.getNextId();
      this._airplaneInfos.splice(existingIndex, 1, normalized);
    } else {
      normalized.id = normalized.id ?? this.getNextId();
      this._airplaneInfos.push(normalized);
    }

    airplaneInfo.id = normalized.id;
    this.persistCache();
    return { ...normalized };
  }

  deleteAirplaneInfo(airplaneInfo: AirplaneInfo): void {
    const index = this._airplaneInfos.findIndex((info) => info.id === airplaneInfo.id);
    if (index >= 0) {
      this._airplaneInfos.splice(index, 1);
      this.persistCache();
      return;
    }

    // If the record was never cached with an id, fall back to comparing by airplane number.
    const fallbackIndex = this._airplaneInfos.findIndex(
      (info) => info.airplanenumber === airplaneInfo.airplanenumber
    );

    if (fallbackIndex >= 0) {
      this._airplaneInfos.splice(fallbackIndex, 1);
      this.persistCache();
    }
  }

  async fetchAirplanesByNumber(
    airplanenumber: string,
    options: FetchAirplanesOptions = {}
  ): Promise<ReadonlyArray<AirplaneInfo>> {
    const normalized = this.normalizeAirplaneNumber(airplanenumber);
    if (!normalized) {
      return [];
    }

    const query = new Parse.Query<FAAMasterAttributes>('FAAmaster');
    query.startsWith('nnumber', normalized);
    query.limit(options.limit ?? 50);

    try {
      const results = await query.find();
      const parsed = results.map((result) => airplaneInfoFromParseObject(result));
      return parsed.map((info) => this.saveAirplaneInfo(info));
    } catch (error) {
      console.error('Failed to fetch airplane information from Parse.', error);
      const message = this.describeError('Unable to fetch airplane information', error);
      throw new AirplaneDataServiceError(message, error);
    }
  }

  private persistCache(): void {
    try {
      const serialized = JSON.stringify(this._airplaneInfos.map(serializeAirplaneInfo));
      this.storage.setItem(this.cacheKey, serialized);
    } catch (error) {
      console.error('Unable to persist airplane cache', error);
    }
  }

  private getNextId(): number {
    if (this._airplaneInfos.length === 0) {
      return 1;
    }

    const maxId = this._airplaneInfos.reduce<number>((max, info) => {
      const { id } = info;
      return id && id > max ? id : max;
    }, 0);

    return maxId + 1;
  }

  private findExistingIndex(airplaneInfo: AirplaneInfo): number {
    if (typeof airplaneInfo.id === 'number') {
      return this._airplaneInfos.findIndex((info) => info.id === airplaneInfo.id);
    }

    if (airplaneInfo.objectId) {
      const byObject = this._airplaneInfos.findIndex(
        (info) => info.objectId === airplaneInfo.objectId
      );
      if (byObject >= 0) {
        return byObject;
      }
    }

    return this._airplaneInfos.findIndex(
      (info) => info.airplanenumber === airplaneInfo.airplanenumber
    );
  }

  private normalizeAirplaneNumber(raw: string | null | undefined): string | null {
    if (!raw) {
      return null;
    }

    const trimmed = raw.trim();
    if (!trimmed) {
      return null;
    }

    const upper = trimmed.toUpperCase();
    return upper.startsWith('N') ? upper : `N${upper}`;
  }

  private describeError(prefix: string, error: unknown): string {
    if (error instanceof Error) {
      return `${prefix}: ${error.message}`;
    }

    if (typeof error === 'string') {
      return `${prefix}: ${error}`;
    }

    try {
      return `${prefix}: ${JSON.stringify(error)}`;
    } catch (_) {
      return prefix;
    }
  }
}
