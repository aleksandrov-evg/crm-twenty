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
