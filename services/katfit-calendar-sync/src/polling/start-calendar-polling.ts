import { describeCalendarDatabaseError } from '../storage/describe-calendar-database-error';
import { calendarLogger } from '../observability/calendar-logger';
import { setTimeout } from 'node:timers/promises';

export const startCalendarPolling = (
  poller: {
    runOnce: () => Promise<unknown>;
  },
  worker = 'polling',
): { stop: () => Promise<void> } => {
  const controller = new AbortController();
  const running = (async () => {
    while (!controller.signal.aborted) {
      let delay = 1000;
      const started = performance.now();
      try {
        const result = await poller.runOnce();
        if (result !== 'idle')
          calendarLogger.event(
            result === 'failed' ? 'error' : 'debug',
            'worker.cycle',
            {
              worker,
              result: typeof result === 'string' ? result : 'redacted',
              durationMs: Math.round(performance.now() - started),
            },
          );
      } catch (error: unknown) {
        calendarLogger.event('error', 'worker.failed', {
          worker,
          reason: describeCalendarDatabaseError(error).code,
          durationMs: Math.round(performance.now() - started),
        });
        delay = 5000;
      }
      try {
        await setTimeout(delay, undefined, { signal: controller.signal });
      } catch {
        break;
      }
    }
  })();

  return {
    stop: async () => {
      controller.abort();
      await running;
    },
  };
};
