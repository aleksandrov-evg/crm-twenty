import { createCalendarLogger, readCalendarLogLevel } from '../calendar-logger';

describe('calendar structured logging', () => {
  it('logs only allowlisted calendar difference fields', () => {
    const write = jest.fn();
    createCalendarLogger('info', write).event('error', 'calendar.snapshot.comparison', {
      result: 'content-different',
      differenceFields: ['dtstamp', 'private-field', 'description'],
    });
    expect(JSON.parse(write.mock.calls[0][0]).differenceFields).toEqual(['dtstamp', 'description']);
    expect(write.mock.calls[0][0]).not.toContain('private-field');
  });
  it('uses info by default and rejects invalid levels', () => {
    expect(readCalendarLogLevel({})).toBe('info');
    expect(readCalendarLogLevel({ CALENDAR_LOG_LEVEL: 'debug' })).toBe('debug');
    expect(() =>
      readCalendarLogLevel({ CALENDAR_LOG_LEVEL: 'verbose' }),
    ).toThrow('CALENDAR_LOG_LEVEL_INVALID');
  });
  it.each([
    ['silent', 0],
    ['error', 1],
    ['info', 2],
    ['debug', 3],
  ] as const)('filters %s severity', (level, expected) => {
    const write = jest.fn();
    const logger = createCalendarLogger(level, write);
    logger.event('error', 'worker.failed', {
      worker: 'polling',
      reason: 'exception',
    });
    logger.event('info', 'crm.creation.confirmed', { result: 'confirmed' });
    logger.event('debug', 'worker.cycle', { result: 'idle' });
    expect(write).toHaveBeenCalledTimes(expected);
    for (const [line] of write.mock.calls)
      expect(JSON.parse(line)).toHaveProperty('timestamp');
  });
  it('retains only safe IDs, labels and counts even in debug', () => {
    const write = jest.fn();
    const logger = createCalendarLogger('debug', write);
    logger.event('debug', 'calendar.snapshot', {
      connectionId: '16ba6f55-90d4-4775-ab0e-de84d7aaf0b1',
      operationId: 'user-secret',
      worker: 'polling',
      result: 'saved',
      reason: 'TOKEN',
      count: 4,
      durationMs: 20,
      ...{
        password: 'private-password',
        calendarData: 'private-event',
        name: 'private-name',
        token: 'private-token',
      },
    });
    const record = JSON.parse(write.mock.calls[0][0]);
    expect(record).toMatchObject({
      worker: 'polling',
      result: 'saved',
      reason: 'redacted',
      count: 4,
    });
    expect(record).not.toHaveProperty('operationId');
    expect(write.mock.calls[0][0]).not.toMatch(/private-|user-secret|TOKEN/);
    logger.event('debug', 'secret-event-name');
    expect(write).toHaveBeenCalledTimes(1);
  });
  it('records domain confirmation labels without exposing payloads', () => {
    const write = jest.fn();
    createCalendarLogger('info', write).event(
      'info',
      'schedule.synchronization.confirmed',
      { result: 'both-sides-verified' },
    );
    expect(JSON.parse(write.mock.calls[0][0]).result).toBe(
      'both-sides-verified',
    );
  });
  it('does not affect a business operation if the log sink throws', () => {
    expect(() =>
      createCalendarLogger('info', () => {
        throw Error('Sink failed');
      }).event('info', 'service.started'),
    ).not.toThrow();
  });
});
