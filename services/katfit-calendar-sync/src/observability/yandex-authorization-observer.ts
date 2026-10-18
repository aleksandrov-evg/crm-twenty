import { calendarLogger } from './calendar-logger';

export const createYandexAuthorizationObserver = () => {
  const previousResults = new Map<string, string>();

  return (status: string, connectionId?: string): void => {
    const result =
      status === 'snapshot' || status === 'discovered'
        ? 'authorized'
        : status === 'auth-required' || status === 'forbidden'
          ? status
          : undefined;
    // Network failures do not prove that credentials were rejected.
    if (!result) return;
    const scope = connectionId ?? 'discovery';
    if (previousResults.get(scope) === result) return;
    previousResults.set(scope, result);
    calendarLogger.event(
      result === 'authorized' ? 'info' : 'error',
      'yandex.authorization',
      { connectionId, result },
    );
  };
};
