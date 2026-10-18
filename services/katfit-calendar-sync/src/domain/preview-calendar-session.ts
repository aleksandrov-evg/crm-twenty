import type { CalendarSessionLookup } from '../crm/find-calendar-session';
import { prepareCalendarSession } from './prepare-calendar-session';

export const previewCalendarSession = async (
  input: Parameters<typeof prepareCalendarSession>[0],
  lookup?: (recordingKey: string) => Promise<CalendarSessionLookup>,
) => {
  const preparation = prepareCalendarSession(input);
  if (preparation.decision !== 'READY') return preparation;
  if (!lookup) return { ...preparation, crmLookup: 'not-configured' as const };
  const result = await lookup(preparation.candidate.recordingKey);
  if (result.status === 'not-found')
    return {
      decision: 'CREATE_CANDIDATE' as const,
      candidate: preparation.candidate,
    };
  if (result.status === 'matched')
    return {
      decision: 'EXISTING_SESSION' as const,
      candidate: preparation.candidate,
      session: result.session,
    };
  return {
    decision: 'NEEDS_REVIEW' as const,
    reason: `CRM_${result.status.toUpperCase().replaceAll('-', '_')}`,
    uid: preparation.candidate.uid,
  };
};
