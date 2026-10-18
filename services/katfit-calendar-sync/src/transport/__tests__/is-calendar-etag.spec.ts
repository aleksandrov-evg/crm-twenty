import { isCalendarEtag } from '../is-calendar-etag';

describe('calendar conditional request validators', () => {
  it.each(['"quoted"', '""', '1234567890123', '1234567890123-123456', 'value:one_two.v2'])(
    'accepts server validators without changing their bytes: %s', (value) => {
      expect(isCalendarEtag(value)).toBe(true);
    },
  );
  it.each(['', 'W/"weak"', 'W/bare', '*', 'one,two', 'one two', '"one", "two"', 'one\r\nHeader: value', ' leading', 'trailing ', 'x'.repeat(257)])(
    'rejects weak, ambiguous, or unsafe validators: %s', (value) => {
      expect(isCalendarEtag(value)).toBe(false);
    },
  );
});
