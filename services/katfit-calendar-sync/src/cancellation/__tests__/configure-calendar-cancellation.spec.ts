import { configureCalendarCancellation } from '../configure-calendar-cancellation';
it('keeps cancellation review disabled by default', () => {
  expect(configureCalendarCancellation({})).toBeNull();
});
it('requires polling for confirmation of missing events', () => {
  expect(() =>
    configureCalendarCancellation({
      CALENDAR_CANCELLATION_REVIEW_ENABLED: 'true',
    }),
  ).toThrow('CALENDAR_CANCELLATION_REVIEW_REQUIRES_POLLING');
});
it('rejects an invalid flag', () => {
  expect(() =>
    configureCalendarCancellation({
      CALENDAR_CANCELLATION_REVIEW_ENABLED: 'yes',
    }),
  ).toThrow();
});
