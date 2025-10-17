import { createApp } from './app';
import { getConfig } from './config';
import { getPrismaClient } from './lib/prisma';
import { FAARefreshService } from './services/faaRefreshService';
import { RefreshScheduler } from './services/refreshScheduler';

const config = getConfig();
const prisma = getPrismaClient();
const refreshService = new FAARefreshService({
  prisma,
  config,
});

const app = createApp();

if (config.scheduler.enabled) {
  const scheduler = new RefreshScheduler({
    service: refreshService,
    intervalMinutes: config.scheduler.intervalMinutes,
    enabled: config.scheduler.enabled,
  });
  scheduler.start();
}

app.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`Server listening on port ${config.port}`);
});
