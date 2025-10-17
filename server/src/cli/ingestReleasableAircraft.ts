import { getConfig } from '../config';
import { getPrismaClient } from '../lib/prisma';
import { FAARefreshService } from '../services/faaRefreshService';

export const run = async () => {
  const config = getConfig();
  const prisma = getPrismaClient();
  const service = new FAARefreshService({
    prisma,
    config,
  });

  try {
    const result = await service.refresh('manual');
    // eslint-disable-next-line no-console
    console.log(
      `FAA dataset refresh completed: ingestion=${result.ingestionId}, duration=${result.durationMs}ms, dataVersion=${result.dataVersion ?? 'unknown'}`,
    );
    return result;
  } finally {
    await prisma.$disconnect();
  }
};

if (require.main === module) {
  run().catch((error) => {
    // eslint-disable-next-line no-console
    console.error('Failed to ingest FAA releasable aircraft dataset', error);
    process.exit(1);
  });
}
