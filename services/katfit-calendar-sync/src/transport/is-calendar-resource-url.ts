import { isYandexCalDavTarget } from './yandex-caldav-target';

export const isCalendarResourceUrl = (
  calendarUrl: string,
  resourceUrl: string,
): boolean => {
  if (!isYandexCalDavTarget(calendarUrl) || !isYandexCalDavTarget(resourceUrl))
    return false;
  const collection = new URL(calendarUrl);
  const resource = new URL(resourceUrl);
  const prefix = collection.pathname.endsWith('/')
    ? collection.pathname
    : `${collection.pathname}/`;
  if (!resource.pathname.startsWith(prefix)) return false;
  try {
    const filename = decodeURIComponent(resource.pathname.slice(prefix.length));
    return (
      filename.length > 0 &&
      filename !== '.' &&
      filename !== '..' &&
      !/[/\\\x00-\x1f]/.test(filename)
    );
  } catch {
    return false;
  }
};

