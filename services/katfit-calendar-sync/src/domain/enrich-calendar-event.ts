import ICAL from 'ical.js';
import { z } from 'zod';

import {
  calendarParticipantSchema,
  type CalendarParticipant,
} from '../crm/read-calendar-roster';
import { parseCalendarEvent } from './parse-calendar-event';
import { updateGeneratedDescription } from './update-generated-description';

export const enrichCalendarEvent = (input: {
  calendarData: string;
  uid: string;
  classSessionId: string;
  participants: CalendarParticipant[];
}):
  | { status: 'rendered'; calendarData: string; changed: boolean }
  | { status: 'needs-review'; reason: string } => {
  const participants = z
    .array(calendarParticipantSchema)
    .max(100)
    .safeParse(input.participants);
  if (
    !z.uuid().safeParse(input.classSessionId).success ||
    !participants.success ||
    new Set(input.participants.map((person) => person.personId)).size !==
      input.participants.length
  )
    return { status: 'needs-review', reason: 'INVALID_ENRICHMENT' };
  const parsed = parseCalendarEvent(input.calendarData, { timezone: 'UTC' });
  if (parsed.status !== 'parsed' || parsed.event.uid !== input.uid)
    return {
      status: 'needs-review',
      reason: 'EVENT_IDENTITY_OR_SHAPE_CHANGED',
    };
  const calendar = ICAL.Component.fromString(input.calendarData);
  const event = calendar.getFirstSubcomponent('vevent');
  if (!event || event.getAllProperties('x-katfit-session-id').length > 1)
    return { status: 'needs-review', reason: 'INVALID_CRM_ID_MARKER' };
  const previousId = event.getFirstPropertyValue('x-katfit-session-id');
  if (previousId !== null && previousId !== input.classSessionId)
    return { status: 'needs-review', reason: 'CALENDAR_CRM_ID_MISMATCH' };
  const rendered = updateGeneratedDescription({
    description: parsed.event.description,
    generatedContent: [
      `Тренировка CRM: ${input.classSessionId}`,
      `Участники (${participants.data.length}):`,
      ...participants.data.map((person) => `- ${person.name}`),
    ].join('\n'),
  });
  if (rendered.status !== 'rendered')
    return { status: 'needs-review', reason: 'INVALID_GENERATED_BLOCK' };
  if (!rendered.changed && previousId === input.classSessionId)
    return {
      status: 'rendered',
      calendarData: input.calendarData,
      changed: false,
    };
  event.updatePropertyWithValue('description', rendered.description);
  event.updatePropertyWithValue('x-katfit-session-id', input.classSessionId);
  const text = calendar.toString();
  return {
    status: 'rendered',
    calendarData: text.endsWith('\r\n') ? text : `${text}\r\n`,
    changed: true,
  };
};
