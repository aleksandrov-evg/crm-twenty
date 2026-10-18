import { createCalendarDataSource } from '../create-calendar-data-source';

describe('createCalendarDataSource', () => {
  it('requires its own explicit database configuration', () => {
    expect(() => createCalendarDataSource(undefined)).toThrow(
      'CALENDAR_DATABASE_URL_REQUIRED',
    );
  });

  it('rejects a non-PostgreSQL URL', () => {
    expect(() => createCalendarDataSource('https://crm.example')).toThrow(
      'CALENDAR_DATABASE_URL_INVALID',
    );
  });

  it('uses only the service schema and migration with automatic writes disabled', () => {
    const source = createCalendarDataSource(
      'postgresql://calendar:password@localhost/calendar',
    );

    expect(source.options).toMatchObject({
      type: 'postgres',
      schema: 'calendar_sync',
      synchronize: false,
      migrationsRun: false,
      migrationsTableName: 'migrations',
      entities: [],
    });
    expect(source.options.migrations).toHaveLength(15);
    expect(source.isInitialized).toBe(false);
  });
});
