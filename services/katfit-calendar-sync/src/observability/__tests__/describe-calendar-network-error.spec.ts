import { describeCalendarNetworkError } from '../describe-calendar-network-error';

describe('describeCalendarNetworkError', () => {
  it.each(['ENOTFOUND', 'ECONNRESET', 'UND_ERR_CONNECT_TIMEOUT', 'CERT_HAS_EXPIRED'])(
    'extracts %s from a fetch cause without exposing messages', (code) => {
      expect(describeCalendarNetworkError({ message: 'private-url', cause: { code, message: 'private-token' } })).toBe(code);
    },
  );
  it('handles aggregate failures and timeout names', () => {
    expect(describeCalendarNetworkError({ errors: [{ code: 'ECONNREFUSED' }] })).toBe('ECONNREFUSED');
    expect(describeCalendarNetworkError({ name: 'TimeoutError' })).toBe('ETIMEDOUT');
  });
  it('bounds recursive causes and rejects unrecognized codes', () => {
    const error: { cause?: unknown } = {};
    error.cause = error;
    expect(describeCalendarNetworkError(error)).toBe('CALDAV_NETWORK_UNCLASSIFIED');
    expect(describeCalendarNetworkError({ code: 'private-token', message: 'secret' })).toBe('CALDAV_NETWORK_UNCLASSIFIED');
  });
});
