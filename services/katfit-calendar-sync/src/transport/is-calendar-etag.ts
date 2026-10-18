export const isCalendarEtag = (value: string): boolean =>
  /^"[\x21\x23-\x7e\x80-\xff]*"$/.test(value) ||
  // Yandex sends bare validators; preserve their exact bytes for conditional requests.
  /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/.test(value);
