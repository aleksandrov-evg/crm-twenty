import { calendarLogger } from '../calendar-logger';
import { createYandexAuthorizationObserver } from '../yandex-authorization-observer';

describe('Yandex authorization notifications', () => {
  afterEach(() => jest.restoreAllMocks());

  it('logs first result and changes without repeating identical cycles', () => {
    const event = jest.spyOn(calendarLogger, 'event').mockImplementation();
    const observe = createYandexAuthorizationObserver();
    observe('snapshot');
    observe('snapshot');
    observe('unavailable');
    observe('snapshot');
    observe('auth-required');
    observe('auth-required');
    observe('snapshot');
    expect(event.mock.calls.map((call) => [call[0], call[2]?.result])).toEqual([
      ['info', 'authorized'], ['error', 'auth-required'], ['info', 'authorized'],
    ]);
  });

  it('keeps connections independent and distinguishes forbidden access', () => {
    const event = jest.spyOn(calendarLogger, 'event').mockImplementation();
    const observe = createYandexAuthorizationObserver();
    observe('snapshot', 'one');
    observe('snapshot', 'two');
    observe('forbidden', 'two');
    expect(event).toHaveBeenCalledTimes(3);
    expect(event).toHaveBeenLastCalledWith('error', 'yandex.authorization', {
      connectionId: 'two', result: 'forbidden',
    });
  });

  it('ignores inconclusive failures and reports successful discovery', () => {
    const event = jest.spyOn(calendarLogger, 'event').mockImplementation();
    const observe = createYandexAuthorizationObserver();
    observe('unavailable');
    observe('invalid-snapshot');
    observe('discovery-failed');
    expect(event).not.toHaveBeenCalled();
    observe('discovered');
    expect(event).toHaveBeenCalledWith('info', 'yandex.authorization', {
      connectionId: undefined, result: 'authorized',
    });
  });
});
