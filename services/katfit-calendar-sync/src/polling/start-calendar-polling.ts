import { setTimeout } from 'node:timers/promises';

export const startCalendarPolling = (poller: {
  runOnce: () => Promise<unknown>;
}): { stop: () => Promise<void> } => {
  const controller = new AbortController();
  const running = (async () => {
    while (!controller.signal.aborted) {
      let delay = 1000;
      try {
        await poller.runOnce();
      } catch {
        process.stderr.write('Calendar polling failed\n');
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
