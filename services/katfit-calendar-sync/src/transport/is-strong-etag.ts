export const isStrongEtag = (value: string): boolean =>
  /^"[\x21\x23-\x7e\x80-\xff]*"$/.test(value);
