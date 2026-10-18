import { z } from 'zod';

import { CalendarCancellationStore } from './storage/calendar-cancellation.store';
import { createCalendarDataSource } from './storage/create-calendar-data-source';

const reviewCancellations = async (): Promise<void> => {
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
    const store = new CalendarCancellationStore(source, scope);
    if (process.env.CALENDAR_CANCELLATION_REVIEW_ID) {
      const reviewId = z
        .uuid()
        .parse(process.env.CALENDAR_CANCELLATION_REVIEW_ID);
      process.stdout.write(
        `${JSON.stringify({ status: 'history', reviewId, limit: 100, observations: await store.history(reviewId) }, null, 2)}\n`,
      );
      return;
    }
    process.stdout.write(
      `${JSON.stringify({ status: 'listed', crmCancellationEnabled: false, limit: 100, requests: await store.list() }, null, 2)}\n`,
    );
  } finally {
    await source.destroy();
  }
};
void reviewCancellations().catch(() => {
  process.stderr.write('CALENDAR_CANCELLATION_REVIEW_FAILED\n');
  process.exitCode = 1;
});
