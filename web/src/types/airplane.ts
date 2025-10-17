export interface FormattedDate {
  iso: string | null;
  display: string;
}

export interface AirplaneOwner {
  name: string;
  city: string | null;
  state: string | null;
  country: string | null;
  ownershipType: string | null;
  lastActionDate: FormattedDate;
  location: string | null;
}

export interface Airplane {
  id: string;
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
  certificationIssueDate: FormattedDate;
  expirationDate: FormattedDate;
  lastActivityDate: FormattedDate;
  fractionalOwnership: boolean | null;
  owners: AirplaneOwner[];
  primaryOwner: AirplaneOwner | null;
  raw: unknown;
}

export interface TailNumberFilter {
  value: string;
  exact: boolean;
}

export interface NormalizedFilters {
  tailNumber: TailNumberFilter | null;
  status: string | null;
  manufacturer: string | null;
  owner: string | null;
}

export interface SearchMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface SearchResultPayload {
  airplanes: Airplane[];
  meta: SearchMeta;
  filters: NormalizedFilters;
  receivedAt: string;
}

export interface RefreshTotals {
  manufacturers: number | null;
  models: number | null;
  engines: number | null;
  aircraft: number | null;
  owners: number | null;
  ownerLinks: number | null;
}

export interface RefreshStatus {
  id: string | number | null;
  status: string;
  trigger: string | null;
  downloadedAt: FormattedDate;
  startedAt: FormattedDate;
  completedAt: FormattedDate;
  failedAt: FormattedDate;
  dataVersion: string | null;
  datasetVersion: string | null;
  totals: RefreshTotals | null;
  errorMessage: string | null;
}

export interface SearchResult extends SearchResultPayload {
  refreshStatus: RefreshStatus | null;
  fromCache: boolean;
}

export interface AirplaneDetailsResult {
  airplane: Airplane | null;
  refreshStatus: RefreshStatus | null;
  fromCache: boolean;
  meta: SearchMeta;
  filters: NormalizedFilters;
  receivedAt: string;
}

export interface ResultMetaSnapshot {
  fromCache: boolean;
  receivedAt: string | null;
}
