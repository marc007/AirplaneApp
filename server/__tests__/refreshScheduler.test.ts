import type { FAARefreshService } from '../src/services/faaRefreshService';
import { RefreshInProgressError } from '../src/services/faaRefreshService';
import { RefreshScheduler } from '../src/services/refreshScheduler';

describe('RefreshScheduler', () => {
  const createLogger = () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  });

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('triggers scheduled refreshes at the configured interval', async () => {
    const refreshMock = jest.fn().mockResolvedValue(undefined);
    const service = { refresh: refreshMock } as unknown as FAARefreshService;
    const logger = createLogger();
    const scheduler = new RefreshScheduler({
      service,
      intervalMinutes: 2,
      enabled: true,
      logger,
    });

    scheduler.start();

    expect(scheduler.isActive()).toBe(true);

    jest.advanceTimersByTime(2 * 60 * 1000);
    await Promise.resolve();

    expect(refreshMock).toHaveBeenCalledWith('scheduled');
    expect(logger.info).toHaveBeenCalledWith(
      '[FAA Scheduler] Triggered scheduled FAA dataset refresh',
    );

    scheduler.stop();
  });

  it('logs a warning when a refresh is already in progress', async () => {
    const refreshMock = jest
      .fn()
      .mockRejectedValueOnce(new RefreshInProgressError())
      .mockResolvedValue(undefined);
    const service = { refresh: refreshMock } as unknown as FAARefreshService;
    const logger = createLogger();
    const scheduler = new RefreshScheduler({
      service,
      intervalMinutes: 1,
      enabled: true,
      logger,
    });

    scheduler.start();

    jest.advanceTimersByTime(60 * 1000);
    await Promise.resolve();

    expect(logger.warn).toHaveBeenCalledWith(
      '[FAA Scheduler] Refresh already in progress, skipping scheduled run',
    );

    jest.advanceTimersByTime(60 * 1000);
    await Promise.resolve();

    expect(logger.error).not.toHaveBeenCalled();
    expect(refreshMock).toHaveBeenCalledTimes(2);

    scheduler.stop();
  });

  it('logs errors from refresh failures', async () => {
    const refreshMock = jest.fn().mockRejectedValue(new Error('network failure'));
    const service = { refresh: refreshMock } as unknown as FAARefreshService;
    const logger = createLogger();
    const scheduler = new RefreshScheduler({
      service,
      intervalMinutes: 1,
      enabled: true,
      logger,
    });

    scheduler.start();

    jest.advanceTimersByTime(60 * 1000);
    await Promise.resolve();

    expect(logger.error).toHaveBeenCalledWith(
      '[FAA Scheduler] Scheduled refresh failed',
      expect.any(Error),
    );

    scheduler.stop();
  });

  it('can be stopped and prevents future triggers', async () => {
    const refreshMock = jest.fn().mockResolvedValue(undefined);
    const service = { refresh: refreshMock } as unknown as FAARefreshService;
    const logger = createLogger();
    const scheduler = new RefreshScheduler({
      service,
      intervalMinutes: 1,
      enabled: true,
      logger,
    });

    scheduler.start();
    scheduler.stop();

    expect(scheduler.isActive()).toBe(false);

    jest.advanceTimersByTime(5 * 60 * 1000);
    await Promise.resolve();

    expect(refreshMock).not.toHaveBeenCalled();
  });
});
