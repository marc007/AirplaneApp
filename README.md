AirplaneApp
===========

## Web UI test harness

A lightweight React-based test harness lives in `webapp/` to exercise caching logic and UI flows for the modern web experience. It ships with Jest and React Testing Library plus Parse request mocks so the suite runs entirely offline.

### Running the tests

1. `cd webapp`
2. `npm install`
3. `npm test`

The tests validate data service caching behaviours (search, refresh, persistence) alongside user interactions (searching, refreshing, and viewing airplane details) for the new web app.
