import { describeCalendarDataDifference } from '../describe-calendar-data-difference';

const calendar = (properties: string) =>
  `BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:private-uid\r\n${properties}\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n`;

describe('describeCalendarDataDifference', () => {
  it('reports changed property names without values', () => {
    expect(describeCalendarDataDifference(
      calendar('SUMMARY:private-title\r\nDTSTAMP:20261019T120000Z'),
      calendar('SUMMARY:private-title\r\nDTSTAMP:20261019T120001Z'),
    )).toEqual(['dtstamp']);
  });
  it('does not expose custom property names', () => {
    expect(describeCalendarDataDifference(calendar('X-PRIVATE:secret'), calendar('X-PRIVATE:changed'))).toEqual(['other']);
  });
  it('ignores property ordering and line endings', () => {
    expect(describeCalendarDataDifference(
      calendar('SUMMARY:title\r\nSTATUS:CONFIRMED'),
      calendar('STATUS:CONFIRMED\r\nSUMMARY:title').replace(/\r\n/g, '\n'),
    )).toEqual([]);
  });
  it('handles malformed input without exposing it', () => {
    expect(describeCalendarDataDifference('private-invalid', calendar('SUMMARY:title'))).toEqual(['invalid-calendar']);
  });
});
