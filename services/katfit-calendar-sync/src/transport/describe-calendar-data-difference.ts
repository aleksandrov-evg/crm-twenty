import ICAL from 'ical.js';

export const CALENDAR_DIFFERENCE_FIELDS = [
  'uid', 'summary', 'description', 'dtstart', 'dtend', 'duration',
  'dtstamp', 'last-modified', 'created', 'sequence', 'status',
  'rrule', 'rdate', 'exdate', 'recurrence-id', 'attendee', 'organizer',
  'location', 'tzid', 'version', 'prodid', 'other', 'invalid-calendar',
] as const;

export const describeCalendarDataDifference = (
  reportData: string,
  resourceData: string,
): string[] => {
  const properties = (data: string) => {
    const grouped = new Map<string, string[]>();
    const visit = (component: ICAL.Component, path: string) => {
      for (const property of component.getAllProperties()) {
        const field = CALENDAR_DIFFERENCE_FIELDS.find(
          (field) => field === property.name,
        ) ?? 'other';
        const entries = grouped.get(field) ?? [];
        entries.push(JSON.stringify([path, property.toJSON()]));
        grouped.set(field, entries);
      }
      for (const child of component.getAllSubcomponents())
        visit(child, `${path}/${child.name}`);
    };
    visit(ICAL.Component.fromString(data), 'vcalendar');
    return grouped;
  };
  try {
    const report = properties(reportData);
    const resource = properties(resourceData);
    return CALENDAR_DIFFERENCE_FIELDS.filter((field) =>
      JSON.stringify((report.get(field) ?? []).sort()) !==
      JSON.stringify((resource.get(field) ?? []).sort()),
    );
  } catch {
    return ['invalid-calendar'];
  }
};
