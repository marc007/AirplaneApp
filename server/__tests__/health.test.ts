import request from 'supertest';

import { createApp } from '../src/app';
import { resetConfig } from '../src/config';

describe('GET /health', () => {
  beforeEach(() => {
    resetConfig();
    process.env.FAA_DATASET_URL = 'https://example.com/faa/dataset.json';
    process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/airplanecheck';
  });

  it('returns an ok status payload', async () => {
    const response = await request(createApp()).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });
});
