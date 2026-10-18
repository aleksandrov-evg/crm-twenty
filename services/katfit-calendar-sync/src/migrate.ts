import { describeCalendarDatabaseError } from './storage/describe-calendar-database-error';
import { createCalendarDataSource } from './storage/create-calendar-data-source';

const migrate = async (): Promise<void> => {
  const source = await createCalendarDataSource(
    process.env.CALENDAR_DATABASE_URL,
  ).initialize();

  try {
    await source.query('CREATE SCHEMA IF NOT EXISTS "calendar_sync"');
    await source.runMigrations({ transaction: 'all' });
  } finally {
    await source.destroy();
  }
};

void migrate().catch((error: unknown) => {
  process.stderr.write(
    `${JSON.stringify({ status: 'failed', operation: 'calendar-database-migrate', ...describeCalendarDatabaseError(error) })}\n`,
  );
  process.exitCode = 1;
});
