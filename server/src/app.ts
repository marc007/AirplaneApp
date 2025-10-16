import express from 'express';
import helmet from 'helmet';

import { getConfig } from './config';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { loggingMiddleware } from './middleware/logging';
import healthRouter from './routes/health';

export const createApp = () => {
  const app = express();
  const config = getConfig();

  app.set('trust proxy', config.nodeEnv === 'production');

  app.use(helmet());
  app.use(express.json());
  app.use(loggingMiddleware);

  app.use('/health', healthRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};
