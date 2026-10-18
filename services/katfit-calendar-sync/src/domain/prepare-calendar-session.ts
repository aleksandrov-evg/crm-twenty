import { createHash } from 'node:crypto';

import { z } from 'zod';

import { parseCalendarEvent } from './parse-calendar-event';
import { updateGeneratedDescription } from './update-generated-description';

export const SESSION_FORMATS = [
  'GROUP_REFORMER',
  'INTRO_REFORMER',
  'PERSONAL_EQUIPMENT',
  'SPLIT_EQUIPMENT',
  'MAT_PILATES',
  'STRETCHING',
  'TRX',
] as const;
const formatSchema = z.enum(SESSION_FORMATS);
const capacitySchema = z.number().int().min(1).max(100);
const defaultsSchema = z.object({
  sessionFormat: formatSchema.optional(),
  capacity: capacitySchema.optional(),
});

export type CalendarImportOptions = {
  timezone: string;
  allowFloating?: boolean;
  defaults?: z.infer<typeof defaultsSchema>;
};
export type CalendarSessionCandidate = {
  uid: string;
  recurrenceKey: 'single';
  name: string;
  sessionFormat: (typeof SESSION_FORMATS)[number];
  capacity: number;
  startsAt: string;
  endsAt: string;
  timezone: string;
  durationMinutes: number;
  idempotencyKey: string;
  recordingKey: string;
};
export type CalendarSessionPreparation =
  | { decision: 'READY'; candidate: CalendarSessionCandidate }
  | { decision: 'NEEDS_REVIEW'; reason: string; uid?: string };

export const prepareCalendarSession = (input: {
  workspaceId: string;
  connectionId: string;
  calendarData: string;
  options: CalendarImportOptions;
  now: Date;
}): CalendarSessionPreparation => {
  const parsed = parseCalendarEvent(input.calendarData, input.options);
  if (parsed.status !== 'parsed')
    return {
      decision: 'NEEDS_REVIEW',
      reason: parsed.reason,
      ...(parsed.uid ? { uid: parsed.uid } : {}),
    };
  const event = parsed.event;
  const review = (reason: string): CalendarSessionPreparation => ({
    decision: 'NEEDS_REVIEW',
    reason,
    uid: event.uid,
  });
  if (
    !Number.isFinite(input.now.getTime()) ||
    Date.parse(event.startsAt) <= input.now.getTime()
  )
    return review('PAST_OR_CURRENT_EVENT');
  const defaults = defaultsSchema.safeParse(input.options.defaults ?? {});
  if (!defaults.success) return review('INVALID_DEFAULTS');

  // Generated roster content must never become booking or format instructions.
  const cleared = updateGeneratedDescription({
    description: event.description,
    generatedContent: '',
  });
  if (cleared.status !== 'rendered') return review('INVALID_GENERATED_BLOCK');
  const lines = cleared.description.split(/\r\n|\r|\n/);
  const markers = lines
    .map((line, index) => (line.trim() === 'KATFIT:' ? index : -1))
    .filter((index) => index >= 0);
  if (markers.length > 1) return review('DUPLICATE_METADATA_BLOCK');
  const metadata = new Map<string, string>();
  if (markers.length === 1) {
    for (const line of lines.slice(markers[0] + 1)) {
      if (!line.trim() || line.startsWith('--- KATFIT:GENERATED:')) break;
      const match = /^(group|format|capacity)\s*=\s*(.+)$/.exec(line.trim());
      if (!match || metadata.has(match[1])) return review('INVALID_METADATA');
      metadata.set(match[1], match[2].trim());
    }
  }
  if (metadata.has('group')) return review('GROUP_MAPPING_REQUIRED');
  const format = formatSchema.safeParse(
    metadata.get('format') ?? defaults.data.sessionFormat,
  );
  const rawCapacity = metadata.get('capacity');
  if (rawCapacity !== undefined && !/^\d{1,3}$/.test(rawCapacity))
    return review('INVALID_CAPACITY');
  const capacity = capacitySchema.safeParse(
    rawCapacity === undefined ? defaults.data.capacity : Number(rawCapacity),
  );
  if (!format.success || !capacity.success)
    return review('MISSING_OR_INVALID_METADATA');
  if (format.data === 'PERSONAL_EQUIPMENT' && capacity.data !== 1)
    return review('PERSONAL_CAPACITY');
  const idempotencyKey = `calendar-create:${createHash('sha256')
    .update(
      JSON.stringify([
        input.workspaceId,
        input.connectionId,
        event.uid,
        'single',
      ]),
    )
    .digest('hex')}`;
  return {
    decision: 'READY',
    candidate: {
      uid: event.uid,
      recurrenceKey: 'single',
      name: event.name,
      sessionFormat: format.data,
      capacity: capacity.data,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      timezone: event.timezone,
      durationMinutes:
        (Date.parse(event.endsAt) - Date.parse(event.startsAt)) / 60000,
      idempotencyKey,
      recordingKey: `session-create:${idempotencyKey}`,
    },
  };
};
