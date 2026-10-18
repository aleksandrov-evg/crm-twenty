import { describeCalendarDatabaseError } from '../describe-calendar-database-error';

describe('safe database migration diagnostics', () => {
  it.each(['ENOTFOUND', 'ECONNREFUSED', '28P01', '3D000', '42501'])(
    'reports an actionable code %s without the raw error',
    (code) => {
      const result = describeCalendarDatabaseError({
        code,
        message: 'postgresql://user:secret@host/db',
        query: 'private SQL',
      });
      expect(result.code).toBe(code);
      expect(JSON.stringify(result)).not.toMatch(/secret|private SQL/);
    },
  );
  it('finds wrapped driver and aggregate errors', () => {
    expect(
      describeCalendarDatabaseError({ driverError: { code: '28P01' } }).code,
    ).toBe('28P01');
    expect(
      describeCalendarDatabaseError(
        new AggregateError([
          Object.assign(new Error('private'), { code: 'ECONNREFUSED' }),
        ]),
      ).code,
    ).toBe('ECONNREFUSED');
  });
  it('reports missing configuration without echoing environment values', () => {
    expect(
      describeCalendarDatabaseError(new Error('CALENDAR_DATABASE_URL_REQUIRED'))
        .code,
    ).toBe('CALENDAR_DATABASE_URL_REQUIRED');
  });
  it('redacts unknown codes, messages and cyclic errors', () => {
    const error: Record<string, unknown> = {
      code: 'secret-code',
      message: 'secret-url',
    };
    error.cause = error;
    expect(describeCalendarDatabaseError(error).code).toBe(
      'DATABASE_ERROR_UNCLASSIFIED',
    );
    expect(JSON.stringify(describeCalendarDatabaseError(error))).not.toContain(
      'secret',
    );
  });
});
