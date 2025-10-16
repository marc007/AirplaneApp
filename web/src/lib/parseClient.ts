import Parse from 'parse/dist/parse.min.js';

const appId = import.meta.env.VITE_PARSE_APP_ID ?? '';
const javascriptKey = import.meta.env.VITE_PARSE_JAVASCRIPT_KEY ?? '';
const serverURL = import.meta.env.VITE_PARSE_SERVER_URL ?? '';

const isConfigured = Boolean(appId && javascriptKey && serverURL);

if (isConfigured) {
  Parse.initialize(appId, javascriptKey);
  Parse.serverURL = serverURL;
} else if (import.meta.env.DEV) {
  const missing = [
    ['VITE_PARSE_APP_ID', appId],
    ['VITE_PARSE_JAVASCRIPT_KEY', javascriptKey],
    ['VITE_PARSE_SERVER_URL', serverURL]
  ]
    .filter(([, value]) => !value)
    .map(([key]) => key)
    .join(', ');

  // eslint-disable-next-line no-console
  console.warn(
    `Parse SDK is not configured. Set the following environment variables in .env: ${missing}`
  );
}

export const parseConfig = {
  appId,
  javascriptKey,
  serverURL,
  isConfigured
};

export default Parse;
