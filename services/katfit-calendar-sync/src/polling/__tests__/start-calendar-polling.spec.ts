import { startCalendarPolling } from '../start-calendar-polling';

describe('startCalendarPolling', () => {
  it('stops without starting another polling cycle', async () => {
    const poller = { runOnce: jest.fn().mockResolvedValue('idle') };
    const loop = startCalendarPolling(poller);
    await loop.stop();
    expect(poller.runOnce).toHaveBeenCalledTimes(1);
  });

  it('waits for the in-flight cycle before reporting shutdown complete', async () => {
    let finish: () => void = () => {
      throw new Error('Cycle did not start');
    };
    const poller = {
      runOnce: jest.fn(
        () =>
          new Promise<'saved'>((resolve) => {
            finish = () => resolve('saved');
          }),
      ),
    };
    const loop = startCalendarPolling(poller);
    let stopped = false;
    const stopping = loop.stop().then(() => {
      stopped = true;
    });
    await Promise.resolve();
    expect(stopped).toBe(false);
    finish();
    await stopping;
    expect(stopped).toBe(true);
    expect(poller.runOnce).toHaveBeenCalledTimes(1);
  });
});

it('reports worker identity and errors without exception contents', async () => {
  const { calendarLogger } =
    await import('../../observability/calendar-logger');
  const event = jest
    .spyOn(calendarLogger, 'event')
    .mockImplementation(() => {});
  try {
    const loop = startCalendarPolling(
      {
        runOnce: async () => {
          throw Error('password=private');
        },
      },
      'schedule',
    );
    await loop.stop();
    expect(event).toHaveBeenCalledWith(
      'error',
      'worker.failed',
      expect.objectContaining({
        worker: 'schedule',
        reason: 'DATABASE_ERROR_UNCLASSIFIED',
      }),
    );
    expect(JSON.stringify(event.mock.calls)).not.toContain('private');
  } finally {
    event.mockRestore();
  }
});
it('reports debug cycles without passing raw result objects to logs', async () => {
  const { calendarLogger } =
    await import('../../observability/calendar-logger');
  const event = jest
    .spyOn(calendarLogger, 'event')
    .mockImplementation(() => {});
  try {
    const loop = startCalendarPolling(
      { runOnce: async () => ({ secret: 'private' }) },
      'preview',
    );
    await loop.stop();
    expect(event).toHaveBeenCalledWith(
      'debug',
      'worker.cycle',
      expect.objectContaining({ worker: 'preview', result: 'redacted' }),
    );
    expect(JSON.stringify(event.mock.calls)).not.toContain('private');
  } finally {
    event.mockRestore();
  }
});
