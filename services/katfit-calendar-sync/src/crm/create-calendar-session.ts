import { z } from 'zod';

import {
  calendarSessionCommandSchema,
  type CalendarSessionCommand,
} from '../domain/create-calendar-session-command';
import {
  createCalendarCrmRequest,
  type CalendarCrmConfiguration,
} from './calendar-crm-request';

const successSchema = z.object({
  success: z.literal(true),
  classSessionId: z.uuid(),
  duplicate: z.boolean(),
});
export type CalendarSessionCreationResult =
  | { status: 'confirmed'; classSessionId: string; duplicate: boolean }
  | { status: 'auth-required' | 'forbidden' | 'unconfirmed' };

export const createCalendarSessionSender = (
  configuration: CalendarCrmConfiguration,
) => {
  const request = createCalendarCrmRequest(configuration);
  return async (
    command: CalendarSessionCommand,
  ): Promise<CalendarSessionCreationResult> => {
    const payload = calendarSessionCommandSchema.parse(command);
    const response = await request('/s/studio/sessions/create', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (response.status === 'unconfirmed') return response;
    if (response.httpStatus === 401) return { status: 'auth-required' };
    if (response.httpStatus === 403) return { status: 'forbidden' };
    const parsed = successSchema.safeParse(response.body);
    if (response.httpStatus !== 200 || !parsed.success)
      return { status: 'unconfirmed' };
    return {
      status: 'confirmed',
      classSessionId: parsed.data.classSessionId,
      duplicate: parsed.data.duplicate,
    };
  };
};
