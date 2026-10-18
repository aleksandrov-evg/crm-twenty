export const YANDEX_CALDAV_ORIGIN = 'https://caldav.yandex.ru';

export const isYandexCalDavTarget = (value: string): boolean => {
  try {
    const url = new URL(value);

    return (
      url.origin === YANDEX_CALDAV_ORIGIN &&
      url.username === '' &&
      url.password === '' &&
      url.hash === '' &&
      url.search === ''
    );
  } catch {
    return false;
  }
};
