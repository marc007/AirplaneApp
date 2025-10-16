# Airplane Web Application Audit

## Context
The repository currently contains two separate front-end code bases:

- `web/` – a Vite-based React project that appears to be the intended production web client.
- `webapp/` – a Jest-powered harness used to exercise isolated data-service and component logic.

The following findings focus on the `web/` project unless otherwise specified, because that is where the Vite + React + TypeScript implementation resides.

## Findings by Focus Area

### 1. Vite + React + TypeScript setup
- **Conflicting Vite configs:** Both `vite.config.ts` and `vite.config.js` exist. Vite prefers the TypeScript config, which imports `@vitejs/plugin-react`, but the project only installs `@vitejs/plugin-react-swc`. Running `npm run dev` or `npm run build` will fail with a missing dependency error.
- **Unused TypeScript entry point:** `index.html` bootstraps `/src/main.jsx`, while a parallel `/src/main.tsx` (and `/src/App.tsx`) exist but are not referenced. The active bundle is therefore pure JSX/JavaScript despite TypeScript tooling being configured.
- **TS configuration incompatible with current sources:** `tsconfig.json` sets `"allowJs": false`, but the source tree relies heavily on `.jsx`/`.js` files. Running `tsc --noEmit` will surface numerous configuration errors until either the project is fully migrated to TypeScript or the config is relaxed.

### 2. Parse JavaScript SDK integration
- **Missing dependency:** Neither `parse` nor `@types/parse` is listed in `web/package.json`, yet modules such as `src/lib/parseClient.ts` and `src/services/AirplaneDataService.ts` import from `parse`.
- **Parse client never executes in the rendered app:** Because the live entry point is `App.jsx`, which uses REST helpers (`searchAirplanes`) instead of `Parse`, the initialization in `src/lib/parseClient.ts` and the status banner in `App.tsx` never run.
- **Unimplemented Parse-specific logic in the harness:** The older `webapp/src/services/parseClient.js` still throws `fetchAirplanes has not been implemented`, so tests only work with mocks and do not validate Parse connectivity.

### 3. Data layer / browser storage
- **AirplaneDataService is disconnected from the UI:** `src/services/AirplaneDataService.ts` offers Parse-backed caching, but nothing in `src/main.jsx`, `App.jsx`, or the pages consumes it. The React flows call `searchAirplanes` (HTTP) instead of using the data service cache.
- **Storage adapter fallbacks are untested in-browser:** The in-memory fallback inside `AirplaneDataService` has no automated coverage, and the Jest harness (`webapp/`) uses a separate `createMemoryStorage` implementation instead of exercising localStorage in the Vite app.
- **Duplicate/competing service implementations:** There are two different search layers (`AirplaneDataService` vs. `airplaneService.js`), which will complicate future work unless consolidated.

### 4. UI components & navigation
- **UI depends on an undefined REST API:** `searchAirplanes` in `src/services/airplaneService.js` targets `${VITE_API_BASE_URL}/airplanes`, but no Express/Vite proxy or API implementation exists in the repo. Without that service, the search, results, and detail pages cannot function.
- **StatusIndicator only recognises two statuses (V/R):** Additional FAA status codes will render as bare fallbacks. This may be acceptable as an MVP but should be confirmed.
- **No integration tests or Storybook coverage:** The Jest harness provides unit tests only; the Vite app has no smoke tests to ensure routing and component composition work together.

### 5. Environment configuration
- **Parse environment sample is present but dormant:** `web/.env.example` documents `VITE_PARSE_APP_ID`, `VITE_PARSE_JAVASCRIPT_KEY`, and `VITE_PARSE_SERVER_URL`, yet these values are not consumed by the active application code path (`App.jsx`).
- **Missing API base documentation:** The REST helper expects `VITE_API_BASE_URL` (or `API_BASE_URL`) but no sample or README guidance exists.
- **Secrets handling strategy undecided:** There is no guidance on where to place Parse credentials in deployment (CI, hosting providers, etc.).

### 6. Build scripts & development server
- **Scripts exist but fail today:** `npm run dev`, `npm run build`, and `npm run preview` are defined in `web/package.json`, but they will terminate immediately due to the missing Vite plugin and Parse dependency.
- **No lint/test tooling configured for the Vite app:** Unlike the Jest harness, the Vite project lacks ESLint/Prettier scripts or test runners, leaving code quality unchecked.

### 7. Missing dependencies, configuration, or functionality
- Install and configure `parse` (and types) to unblock Parse usage.
- Decide between the Parse-based `AirplaneDataService` and the REST-based `airplaneService.js`, then remove the unused path.
- Connect the React UI to whichever data layer is canonical, including cache hydration/refresh flows.
- Replace the placeholder `App.tsx`/`main.tsx` or update the entry point so the TypeScript code actually renders.
- Ensure `.env` guidance covers both Parse and REST configurations.
- Add routing/tests to guarantee the search ➔ results ➔ detail journey works after wiring up the data layer.

## Recommendations
1. **Fix the build tooling first**
   - Remove one of the Vite configs (prefer the TypeScript version) and align the plugin import with the installed dependency (`@vitejs/plugin-react-swc`).
   - Add `parse` to `dependencies` and provide minimal type declarations (either via `@types/parse` or an expanded local module declaration).
   - Relax or update `tsconfig.json` (e.g., enable `allowJs`) until the codebase finishes migrating to TypeScript, or convert the remaining `.jsx`/`.js` files.

2. **Choose and implement a single data access strategy**
   - Either finish the Parse-backed `AirplaneDataService` and integrate it into the React app, or continue with the REST API approach and remove the unused Parse service files.
   - Wire the chosen service into the search/results/detail components, including cache refresh behaviour analogous to the legacy Xamarin app.

3. **Complete environment and configuration documentation**
   - Update `.env.example` (and README) to describe all required variables: Parse credentials, REST API base URL, and any additional keys.
   - Document how to supply these values in local development vs. production deployments.

4. **Add missing UX/QA coverage**
   - Introduce integration tests (e.g., Vitest + Testing Library) that exercise the full search flow using mocked network/Parse responses.
   - Consider Storybook or similar tooling for isolated component review.

5. **Sunset the `webapp/` harness or align it with the Vite app**
   - If the harness remains valuable, ensure it mirrors the production data layer. Otherwise, consolidate tests under the Vite project to avoid diverging behaviour.

Addressing the above will bring the web application to a functional baseline and position the team to iterate on features atop a stable build and data foundation.
