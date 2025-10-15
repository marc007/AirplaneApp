# Airplane Check

Airplane Check now ships with a modern browser-based client alongside the original Xamarin.Android
application. The Xamarin solution remains in the repository for reference while the new web app
acts as the primary entry point for ongoing development.

## Project Structure

- `web/` – Vite + React + TypeScript application that will replace the legacy Xamarin client.
- `AirplaneCheck/`, `AirplaneCheckTest/`, `PCLAsyncRequest/` – Existing Xamarin projects kept for
  historical context and potential logic reuse.

## Getting Started (Web)

> Requires Node.js 18 or later.

1. Install the dependencies:

   ```bash
   cd web
   npm install
   ```

2. Copy the example environment file and supply your Parse credentials:

   ```bash
   cp .env.example .env
   # Edit .env to set VITE_PARSE_APP_ID, VITE_PARSE_JAVASCRIPT_KEY, VITE_PARSE_SERVER_URL
   ```

3. Launch the development server:

   ```bash
   npm run dev
   ```

   The app will be available at the URL printed by Vite (typically `http://localhost:5173`).

### Environment Variables

The Parse JavaScript SDK is configured entirely through environment variables. Create a `.env`
file (based on `.env.example`) and provide values for the following keys:

- `VITE_PARSE_APP_ID` – Parse Application ID
- `VITE_PARSE_JAVASCRIPT_KEY` – Parse JavaScript key
- `VITE_PARSE_SERVER_URL` – HTTPS URL to your Parse Server instance

These variables are read at build time by Vite and injected into the front-end application.

## Available NPM Scripts

Inside the `web/` directory, the following scripts are available:

- `npm run dev` – Start Vite in development mode.
- `npm run build` – Type-check and produce a production build.
- `npm run preview` – Preview the production build locally.
- `npm run lint` – Run ESLint on the project.
- `npm run format` – Format the codebase with Prettier.

## Legacy Xamarin Client

The Xamarin Android solution remains untouched. You can still open `AirplaneCheck.sln` in Visual
Studio to inspect or run the original mobile implementation.
