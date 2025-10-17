# Airplane Check Platform

Airplane Check surfaces FAA registration data via a modern TypeScript/Express API and React client while we wind down the historical Xamarin + Parse implementation. This repository houses both the new stack and the legacy projects so that teams can migrate incrementally without losing access to older tooling.

## Overview

- **Backend (`server/`)** – Node.js (Express + Prisma) API, dataset ingestion pipeline, and background scheduler for FAA's releasable aircraft archive.
- **Frontend (`web/`)** – Vite + React application that consumes the REST API (defaulting to the Azure deployment at `https://airplanecheck-api.azurewebsites.net`). The `webapp/` folder remains as a Jest harness for data-service experiments.
- **Legacy clients** – `AirplaneCheck/`, `AirplaneCheckTest/`, and `PCLAsyncRequest/` are the Parse-based Xamarin artifacts kept for regression investigations during the migration.
- **Infrastructure helpers** – `docker-compose.yml` provisions Postgres and the backend locally, while `Components/` and `packages/` cache Xamarin dependencies.

## Repository layout

| Path | Description |
| ---- | ----------- |
| `server/` | Express API, Prisma schema, ingestion CLI, and deployment assets. |
| `web/` | React web client that calls the REST API. |
| `webapp/` | Jest-powered harness for service-level tests and caching experiments. |
| `AirplaneCheck/` | Legacy Xamarin.Android client (Parse-dependent). |
| `AirplaneCheckTest/` | Xamarin instrumentation tests for the Parse mobile app. |
| `PCLAsyncRequest/` | Legacy PCL async helper, safe to remove once Xamarin is retired. |
| `docker-compose.yml` | Local development stack (Postgres + backend). |

## Getting started

### Quick start with Docker Compose

Prerequisites: Docker Desktop or Docker Engine 24+, Docker Compose v2, and an internet connection to download the FAA archive and container images.

1. Copy the backend environment template and supply real values:

   ```bash
   cp server/.env.example server/.env
   ```

   At a minimum set `FAA_DATASET_URL` to the zip file for the FAA releasable aircraft dataset and point `DATABASE_URL` at a Postgres instance accessible from the containers. You can keep the sample values when using the compose-provisioned Postgres service.

2. (Optional but recommended) create `docker-compose.override.yml` that points the backend service at your new env file so you do not have to edit the tracked manifest:

   ```yaml
   services:
     backend:
       env_file:
         - server/.env
   ```

3. Build and start the stack:

   ```bash
   docker compose up --build
   ```

   This starts Postgres on `localhost:5432` and the backend API on `http://localhost:3000`.

4. Seed the database by running the ingestion CLI inside the backend container:

   ```bash
   docker compose exec backend npm run ingest:faa
   ```

   The `datasetIngestion` table is updated as the archive is downloaded, unzipped, and merged into Postgres. The API becomes searchable once the job completes.

5. Visit `http://localhost:3000/api/airplanes/refresh-status` to confirm the latest ingestion metadata, or `http://localhost:3000/health` for a simple liveness probe.

### Manual backend setup (without Docker)

Prerequisites: Node.js 20 LTS, npm 10+, a running Postgres 14+ instance, and access to the FAA dataset zip.

1. Start or provision Postgres and make note of a connection string the API can reach.
2. Install dependencies:

   ```bash
   cd server
   npm install
   ```

3. Copy the env template and set values appropriate for your environment:

   ```bash
   cp .env.example .env
   ```

   Update at least `FAA_DATASET_URL` and `DATABASE_URL`. To enable the background scheduler set `SCHEDULER_ENABLED=true`.

4. Generate Prisma client assets and apply migrations:

   ```bash
   npm run prisma:generate
   npm run prisma:migrate
   ```

   > Deploying to Azure Postgres? Use `npm run prisma:deploy` and follow the
   > checklist in [`server/docs/azure-migrations.md`](server/docs/azure-migrations.md)
   > to ensure the `pg_trgm` extension and performance indexes are in place.

5. Launch the API in watch mode:

   ```bash
   npm run dev
   ```

   The service listens on `http://localhost:3000` by default. Use `npm run start` to execute the compiled build.

### Running the ingestion CLI

The CLI downloads the latest FAA archive and reconciles it into Postgres. Trigger it whenever you stand up a fresh environment or need an on-demand refresh.

```bash
cd server
npm run ingest:faa
```

- Successful runs log the ingestion ID, duration, and data version. Failures are recorded in the `datasetIngestion` table along with an error summary.
- The CLI respects the same environment variables as the API, so ensure `FAA_DATASET_URL` and `DATABASE_URL` are set before execution.
- Background refreshes can also be automated by setting `SCHEDULER_ENABLED=true` and tuning `SCHEDULER_INTERVAL_MINUTES`.

## Environment configuration

### Backend variables

| Variable | Required | Description | Default / Example |
| -------- | -------- | ----------- | ----------------- |
| `NODE_ENV` | No | Influences logging and error formatting. | `development` |
| `PORT` | No | HTTP port to bind. | `3000` |
| `FAA_DATASET_URL` | **Yes** | HTTPS URL to the FAA releasable aircraft archive (`ReleasableAircraft.zip`). | `https://example.com/faa/ReleasableAircraft.zip` |
| `DATABASE_URL` | **Yes** | Postgres connection string consumed by Prisma. | `postgresql://postgres:postgres@localhost:5432/airplanecheck` |
| `DATABASE_SSL_MODE` | No | Forces Prisma to append `sslmode` to the connection string when absent. | `require` |
| `DATABASE_CONNECTION_LIMIT` | No | Caps concurrent Postgres connections opened by Prisma. | `10` |
| `SCHEDULER_ENABLED` | No | When `true`, enables the built-in refresh scheduler. | `false` |
| `SCHEDULER_INTERVAL_MINUTES` | No | Minutes between scheduled refresh attempts. Values < 1 are coerced to 1. | `60` |
| `APPINSIGHTS_CONNECTION_STRING` | No | Enables Application Insights telemetry and request logging when set. | *(unset)* |
| `APPINSIGHTS_ROLE_NAME` | No | Overrides the cloud role label reported to Application Insights. | `airplanecheck-api` |
| `APPINSIGHTS_SAMPLING_PERCENTAGE` | No | Sampling percentage (0–100) applied to Application Insights telemetry. | `50` |

### Frontend variables

| Variable | Required | Description | Default / Example |
| -------- | -------- | ----------- | ----------------- |
| `VITE_API_BASE_URL` | **Yes** | Base URL of the backend API without a trailing slash. | `https://airplanecheck-api.azurewebsites.net` |
| `VITE_PARSE_APP_ID` | No (legacy) | Only required when running the deprecated Parse data path in the legacy clients. | *(unset)* |
| `VITE_PARSE_JAVASCRIPT_KEY` | No (legacy) | Legacy Parse JavaScript key for the deprecated clients. | *(unset)* |
| `VITE_PARSE_SERVER_URL` | No (legacy) | Legacy Parse server URL used by the Xamarin harness. | *(unset)* |

Create `.env.local` (ignored by git) inside `web/` to supply these values during development. Vite exposes variables prefixed with `VITE_` to the browser bundle; never embed production secrets directly in the client.

### Secrets handling recommendations

- **Local development:** use `.env`/`.env.local` files that remain untracked. `dotenv` loads backend values automatically and Vite reads `.env.local` for the frontend.
- **Dockerized environments:** mount environment files or inject variables via your orchestrator/hosting provider. The provided Dockerfile respects runtime `ENV` overrides.
- **Production:** store secrets in a dedicated manager (AWS Secrets Manager, GCP Secret Manager, HashiCorp Vault, etc.) and populate container environment variables at deploy time. Do not bake sensitive values into images or commit them to version control.

## API reference

The backend currently exposes two public endpoints:

| Method | Path | Description |
| ------ | ---- | ----------- |
| `GET` | `/api/airplanes` | Search normalized aircraft registrations using tail number, status, manufacturer, or owner filters. |
| `GET` | `/api/airplanes/refresh-status` | Retrieve metadata about the most recent ingestion job. |

Key request/response examples, schema details, and error codes are documented in [`server/docs/api-airplanes.md`](server/docs/api-airplanes.md). Highlights:

- Search responses include `data`, `meta`, and `filters` objects so the UI can render pagination state accurately.
- Refresh status responses expose `status`, `trigger`, timestamps, record counts, and `dataVersion`. When a dataset version is available, clients should invalidate any cached search results that reference a different version.
- The frontend caches search results per dataset version. If the refresh job reports a new version (via `dataVersion` or the completion timestamp), clear the persisted cache before issuing new requests.

## Deployment guidelines

- **Containerization:** The backend ships with a multi-stage Dockerfile that compiles TypeScript, prunes dev dependencies, and emits a production image running `node dist/index.js`. Build with `docker build -t airplanecheck-backend ./server` and provide runtime environment variables via your orchestrator.
- **Hosting options:** Any platform capable of running Node 20 containers and exposing Postgres connectivity is suitable (Kubernetes, ECS/Fargate, Fly.io, Render, Railway, etc.). Provision a managed Postgres instance with automated backups and tune connection pooling to match your platform.
- **Scheduling refresh jobs:** Either enable the built-in scheduler (`SCHEDULER_ENABLED=true`) with an appropriate `SCHEDULER_INTERVAL_MINUTES`, or run the ingestion CLI from Cron/Cloud Scheduler. External schedulers should monitor for the `RefreshInProgressError` response to avoid overlapping jobs.
- **Monitoring ingestion:** Track the `datasetIngestion` table for authoritative job history, including failure messages. Expose logs from the backend container to your logging stack to capture ingestion diagnostics. The `/api/airplanes/refresh-status` endpoint can serve as a lightweight health signal for dashboards and can be polled by the frontend to surface “last refreshed” messaging.
- **Azure App Service:** Use [`server/docs/azure-app-service-deployment.md`](server/docs/azure-app-service-deployment.md) for platform-specific configuration, GitHub Actions secrets, and scaling recommendations when hosting on Azure.

## Legacy Parse migration status

The Xamarin.Android app and Parse-based utilities remain in this repository for reference but are no longer the primary integration path:

- New development should target the REST API exposed from `server/` and the React client in `web/`.
- Parse credentials (`ApplicationId`, `.NET Key`, JavaScript key) are now optional and only required when working on the legacy clients.
- Plan to archive `AirplaneCheck/`, `AirplaneCheckTest/`, and Parse-specific helpers once the web client reaches full parity. Document any remaining Parse dependencies inside feature branches so they can be replaced with API calls.

Maintaining this context should ease the final deprecation of the legacy stack while giving teams clear instructions for the modern architecture.
