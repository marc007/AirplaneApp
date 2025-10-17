# Aircraft Search API

The Airplane Check backend exposes a REST API that normalises FAA registration data into a
Postgres database. It powers the modern web experience and replaces the legacy Parse-based
integrations. All endpoints return JSON and do not require authentication in development.

Base URL: `https://<host>/api`

## `GET /api/airplanes`

Search the dataset for aircraft using tail number, status, manufacturer, and owner filters. At least
one filter must be provided.

### Example request

```bash
curl "http://localhost:3000/api/airplanes?tailNumber=N12345&exact=true&page=1&pageSize=25" \
  --header "Accept: application/json"
```

### Query parameters

| Name | Type | Required | Description |
| ---- | ---- | -------- | ----------- |
| `tailNumber` | `string` | optional | Full or partial FAA tail number. The value is uppercased automatically and will be prefixed with `N` if omitted. Use with `exact=true` for an exact match; otherwise a prefix search is performed. Must contain only alphanumeric characters and result in a value no longer than 10 characters after normalisation. |
| `exact` | `boolean` | optional | When `true`, the search requires an exact tail number match. Defaults to `false`, enabling prefix searches when `tailNumber` is provided. Accepted truthy values: `true`, `1`, `yes`; falsy values: `false`, `0`, `no`. |
| `status` | `string` | optional | Registration status code (e.g. `A`, `I`, `D`). The comparison is case-insensitive and is converted to uppercase internally. |
| `manufacturer` | `string` | optional | Filters on the aircraft manufacturer name. Performs a case-insensitive substring match. |
| `owner` | `string` | optional | Filters on the registered owner name. Performs a case-insensitive substring match. |
| `page` | `number` | optional | Results page to return. Defaults to `1`. Must be between `1` and `1000`. |
| `pageSize` | `number` | optional | Number of records per page. Defaults to `25` and cannot exceed `100`. |

Requests that omit all filters are rejected with a `400` response.

### Response fields

The endpoint returns an object with the following shape.

#### `data[]`

| Field | Type | Description |
| ----- | ---- | ----------- |
| `tailNumber` | `string` | Normalised N-number (always capitalised and prefixed with `N`). |
| `serialNumber` | `string` or `null` | Manufacturer serial number when available. |
| `statusCode` | `string` or `null` | FAA registration status code. |
| `registrantType` | `string` or `null` | Registrant classification reported by the FAA. |
| `manufacturer` | `string` or `null` | Aircraft manufacturer. |
| `model` | `string` or `null` | Aircraft model description. |
| `modelCode` | `string` or `null` | FAA model code. |
| `engineManufacturer` | `string` or `null` | Engine manufacturer. |
| `engineModel` | `string` or `null` | Engine model. |
| `airworthinessClass` | `string` or `null` | Airworthiness classification string. |
| `certificationIssueDate` | `string` or `null` | ISO 8601 timestamp. |
| `expirationDate` | `string` or `null` | ISO 8601 timestamp for registration expiry. |
| `lastActivityDate` | `string` or `null` | ISO 8601 timestamp for the last FAA action. |
| `fractionalOwnership` | `boolean` or `null` | Indicates whether the aircraft participates in fractional ownership. |
| `owners[]` | `object[]` | Owner records sorted alphabetically by owner name. |

Owner objects include `name`, `city`, `state`, `country`, `ownershipType`, and `lastActionDate`
(ISO 8601 string). When no owners are linked, the array is empty.

#### `meta`

| Field | Type | Description |
| ----- | ---- | ----------- |
| `page` | `number` | Requested page number. |
| `pageSize` | `number` | Number of records per page. |
| `total` | `number` | Total number of matching records. |
| `totalPages` | `number` | `0` when `total` is `0`, otherwise `ceil(total / pageSize)`. |

#### `filters`

Echoes the normalised filters applied to the query so consumers can synchronise UI state easily.
Tail number filters include both the normalised value and whether the query was an exact match.

### Sample response

```
Status: 200 OK
Content-Type: application/json
```

```json
{
  "data": [
    {
      "tailNumber": "N12345",
      "serialNumber": "SER123",
      "statusCode": "A",
      "registrantType": "Corporation",
      "manufacturer": "CESSNA",
      "model": "172S SKYHAWK SP",
      "modelCode": "CESS172",
      "engineManufacturer": "Lycoming",
      "engineModel": "IO-360-L2A",
      "airworthinessClass": "Standard",
      "certificationIssueDate": "2010-05-01T00:00:00.000Z",
      "expirationDate": "2025-06-01T00:00:00.000Z",
      "lastActivityDate": "2024-03-01T00:00:00.000Z",
      "fractionalOwnership": false,
      "owners": [
        {
          "name": "Sky Leasing",
          "city": "San Francisco",
          "state": "CA",
          "country": "US",
          "ownershipType": "Corporation",
          "lastActionDate": "2024-02-01T00:00:00.000Z"
        }
      ]
    }
  ],
  "meta": {
    "page": 1,
    "pageSize": 25,
    "total": 2,
    "totalPages": 1
  },
  "filters": {
    "tailNumber": {
      "value": "N123",
      "exact": false
    },
    "status": null,
    "manufacturer": null,
    "owner": "Sky"
  }
}
```

### Error responses

| Status | Message | When it occurs |
| ------ | ------- | --------------- |
| `400` | `Validation failed` | Query parameters failed schema validation (e.g. an invalid tail number or out-of-range pagination values). The response includes a `details` object with field-level errors. |
| `400` | `At least one search filter is required` | No recognised filters were supplied. |
| `500` | `Internal Server Error` | An unexpected server fault occurred. |

Errors are returned using a consistent payload shape:

```json
{
  "message": "...",
  "details": {
    "field": ["error"]
  }
}
```

## `GET /api/airplanes/refresh-status`

Returns metadata about the most recent dataset refresh so administrative screens can display
up-to-date status information. When no refresh has been recorded the endpoint returns a payload of
`null` values with `status` set to `NOT_AVAILABLE`.

### Example request

```bash
curl "http://localhost:3000/api/airplanes/refresh-status" \
  --header "Accept: application/json"
```

### Response fields

| Field | Type | Description |
| ----- | ---- | ----------- |
| `id` | `number` or `null` | Primary key of the ingestion record. |
| `status` | `string` | One of `PENDING`, `RUNNING`, `COMPLETED`, `FAILED`, or `NOT_AVAILABLE`. |
| `trigger` | `string` or `null` | `MANUAL` when kicked off by the CLI, `SCHEDULED` when triggered by the scheduler, otherwise `null`. |
| `downloadedAt` | `string` or `null` | ISO 8601 timestamp for when the archive download finished. |
| `startedAt` | `string` or `null` | ISO 8601 timestamp marking the ingestion start. |
| `completedAt` | `string` or `null` | ISO 8601 timestamp when the ingestion finished successfully. |
| `failedAt` | `string` or `null` | ISO 8601 timestamp when a failure was recorded. |
| `dataVersion` | `string` or `null` | Version identifier captured from the FAA download headers (`Last-Modified` or `ETag`). |
| `totals` | `object` or `null` | Aggregated row counts (manufacturers, models, engines, aircraft, owners, ownerLinks). |
| `errorMessage` | `string` or `null` | Truncated error summary when the ingestion fails. |

### Sample response

```
Status: 200 OK
Content-Type: application/json
```

```json
{
  "id": 42,
  "status": "COMPLETED",
  "trigger": "SCHEDULED",
  "downloadedAt": "2024-01-01T00:00:00.000Z",
  "startedAt": "2024-01-01T00:05:00.000Z",
  "completedAt": "2024-01-01T00:10:00.000Z",
  "failedAt": null,
  "dataVersion": "E1234567",
  "totals": {
    "manufacturers": 1200,
    "models": 3400,
    "engines": 3200,
    "aircraft": 987654,
    "owners": 876543,
    "ownerLinks": 900000
  },
  "errorMessage": null
}
```

### Error responses

The endpoint returns `500 Internal Server Error` when the status lookup fails unexpectedly.

## Dataset metadata and caching guidance

- The ingestion pipeline stores every run in the `datasetIngestion` table. `downloadedAt`,
  `startedAt`, and `completedAt` track the lifecycle of that run. Use these timestamps to surface
  "Last refreshed" messaging in the UI.
- `dataVersion` is populated from the FAA archive headers whenever possible. Treat this as the
  canonical dataset identifier. If it is `null`, fall back to `completedAt` (or `startedAt`) when
  determining whether a cache is stale.
- The frontend should poll `GET /api/airplanes/refresh-status` before issuing search requests and
  cache the response for a short period (two minutes in the current web client). Persist search
  results alongside the dataset version and flush the cache whenever the reported version changes.
- The ingestion CLI (`npm run ingest:faa`) and the built-in scheduler both raise a
  `RefreshInProgressError` if a run is already active. External job runners should catch this
  condition and retry later instead of forcing concurrent ingestions.
- Monitoring systems can rely on `status`, `failedAt`, and `errorMessage` to detect ingestion
  failures quickly. The totals object is useful for verifying that expected row counts were
  processed.
