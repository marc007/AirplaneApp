# Aircraft Search API

The aircraft search endpoint exposes FAA registration data that has been normalized into the
service database. It powers the web experience by returning lightweight summaries that can be
rendered directly in search results.

## Endpoint

```
GET /api/airplanes
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

At least one of `tailNumber`, `status`, `manufacturer`, or `owner` must be supplied. Requests that
omit all filters will be rejected with a `400` response.

### Successful response

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

- `data` contains the paginated aircraft summaries. Dates are ISO-8601 strings.
- `owners` is ordered alphabetically by owner name. When no owners are linked, an empty array is
  returned.
- `meta.totalPages` is `0` when no results match.
- `filters` echoes the normalised filters applied to the query so consumers can synchronise UI
  state easily.

### Error responses

| Status | Message | When it occurs |
| ------ | ------- | --------------- |
| `400` | `Validation failed` | Query parameters failed schema validation (e.g. an invalid tail number or out-of-range pagination values). The response includes a `details` object with field-level errors. |
| `400` | `At least one search filter is required` | No recognised filters were supplied. |
| `500` | `Internal Server Error` | An unexpected server fault occurred. |

Errors are returned using a consistent payload shape: `{ "message": "...", "details": { ... } }`
if details are available.
