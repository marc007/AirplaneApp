import morgan from 'morgan';

import { getTelemetryClient } from '../telemetry/appInsights';

const stream = {
  write: (message: string) => {
    process.stdout.write(message);

    const client = getTelemetryClient();
    if (client) {
      client.trackTrace({ message: message.replace(/\n$/, '') });
    }
  },
};

export const loggingMiddleware = morgan(
  ':method :url :status :res[content-length] - :response-time ms',
  { stream },
);
