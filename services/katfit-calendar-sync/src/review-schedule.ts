import { z } from 'zod';

import { createCalendarSessionLookup } from './crm/find-calendar-session';
import { readCalendarCrmEnvironment } from './crm/read-calendar-crm-environment';
import { CalendarScheduleReview } from './schedule/calendar-schedule-review';
import { CalendarCredentialCipher } from './security/calendar-credential-cipher';
import { CalendarScheduleReviewStore } from './storage/calendar-schedule-review.store';
import { createCalendarDataSource } from './storage/create-calendar-data-source';

const reviewSchedule = async (): Promise<void> => {
  const mode = z
    .enum(['list', 'inspect', 'resolve'])
    .default('list')
    .parse(process.env.CALENDAR_REVIEW_MODE);
  const scope = z
    .object({ workspaceId: z.uuid(), connectionId: z.uuid() })
    .parse({
      workspaceId: process.env.TWENTY_WORKSPACE_ID,
      connectionId: process.env.CALENDAR_CONNECTION_ID,
    });
  const source = await createCalendarDataSource(
    process.env.CALENDAR_DATABASE_URL,
  ).initialize();
  try {
    const store = new CalendarScheduleReviewStore(source, scope);
    if (mode === 'list') {
      process.stdout.write(
        `${JSON.stringify({ status: 'listed', limit: 100, conflicts: await store.list() }, null, 2)}\n`,
      );
      return;
    }
    const uid = z
      .string()
      .min(1)
      .max(1024)
      .parse(process.env.CALENDAR_REVIEW_UID);
    const configuration = readCalendarCrmEnvironment(process.env);
    const keyId = process.env.CALENDAR_ENCRYPTION_KEY_ID ?? 'primary';
    const review = new CalendarScheduleReview(
      store,
      new CalendarCredentialCipher(keyId, {
        [keyId]: process.env.CALENDAR_ENCRYPTION_KEY ?? '',
      }),
      createCalendarSessionLookup({
        baseUrl: configuration.TWENTY_API_URL,
        apiToken: configuration.TWENTY_API_TOKEN,
        allowInsecureHttp: configuration.TWENTY_ALLOW_INSECURE_HTTP === 'true',
      }),
    );
    const result =
      mode === 'inspect'
        ? await review.inspect(uid)
        : await review.resolve(
            uid,
            z
              .string()
              .regex(/^\d{13}\.[a-f0-9]{64}$/)
              .parse(process.env.CALENDAR_REVIEW_TOKEN),
            z
              .enum(['crm', 'calendar'])
              .parse(process.env.CALENDAR_REVIEW_CHOICE),
          );
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.status !== 'review' && result.status !== 'queued')
      process.exitCode = 1;
  } finally {
    await source.destroy();
  }
};

void reviewSchedule().catch(() => {
  process.stderr.write('CALENDAR_SCHEDULE_REVIEW_FAILED\n');
  process.exitCode = 1;
});
