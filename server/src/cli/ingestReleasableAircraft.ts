import { createWriteStream } from 'fs';
import { mkdtemp, rm } from 'fs/promises';
import path from 'path';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import type { ReadableStream } from 'stream/web';
import { tmpdir } from 'os';
import { fetch } from 'undici';

import { getConfig } from '../config';
import { ingestReleasableAircraftArchive } from '../ingest/releasableAircraft';
import { PrismaReleasableAircraftRepository } from '../ingest/prismaRepository';
import { getPrismaClient } from '../lib/prisma';

const downloadDataset = async (url: string, archivePath: string) => {
  const response = await fetch(url);

  if (!response.ok || !response.body) {
    throw new Error(`Failed to download dataset from ${url}: ${response.status}`);
  }

  const readable = Readable.fromWeb(response.body as unknown as ReadableStream<Uint8Array>);
  const writable = createWriteStream(archivePath);

  await pipeline(readable, writable);

  const dataVersion =
    response.headers.get('last-modified') ?? response.headers.get('etag') ?? undefined;

  return { dataVersion };
};

const main = async () => {
  const config = getConfig();
  const prisma = getPrismaClient();
  const repository = new PrismaReleasableAircraftRepository(prisma);

  const tempDir = await mkdtemp(path.join(tmpdir(), 'faa-'));
  const archivePath = path.join(tempDir, 'ReleasableAircraft.zip');

  try {
    const downloadedAt = new Date();
    const { dataVersion } = await downloadDataset(config.faaDatasetUrl, archivePath);

    const ingestion = await repository.startIngestion({
      sourceUrl: config.faaDatasetUrl,
      dataVersion,
      downloadedAt,
    });

    const stats = await ingestReleasableAircraftArchive({
      archivePath,
      repository,
      ingestionId: ingestion.id,
    });

    await repository.completeIngestion(ingestion.id, stats);
  } finally {
    await prisma.$disconnect();
    await rm(tempDir, { recursive: true, force: true });
  }
};

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Failed to ingest FAA releasable aircraft dataset', error);
  process.exit(1);
});
