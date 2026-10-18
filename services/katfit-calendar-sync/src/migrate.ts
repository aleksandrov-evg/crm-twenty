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

void migrate().catch(() => {
  process.stderr.write('Calendar database migration failed\n');
  process.exitCode = 1;
});
