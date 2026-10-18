import { z } from 'zod';
import { describeCalendarStartupError } from '../describe-calendar-startup-error';
import { createCalendarLogger } from '../calendar-logger';

it('reports the exact missing flag dependency without blaming the database', () => {
  expect(
    describeCalendarStartupError(
      Error('CALENDAR_CRM_EXPORT_REQUIRES_PREPARATION_AND_POLLING'),
    ),
  ).toEqual({ reason: 'CALENDAR_CRM_EXPORT_REQUIRES_PREPARATION_AND_POLLING' });
});
it('reports configuration field names without values or validation messages', () => {
  const result = z
    .object({ TWENTY_WORKSPACE_ID: z.uuid(), TWENTY_API_URL: z.url() })
    .safeParse({
      TWENTY_WORKSPACE_ID: 'private-id',
      TWENTY_API_URL: 'private-token',
    });
  if (result.success) throw Error('Fixture must fail');
  const diagnostic = describeCalendarStartupError(result.error);
  expect(diagnostic).toEqual({
    reason: 'CALENDAR_CONFIGURATION_INVALID',
    configurationFields: ['TWENTY_WORKSPACE_ID', 'TWENTY_API_URL'],
  });
  expect(JSON.stringify(diagnostic)).not.toContain('private');
});
it('keeps database diagnostics but classifies unknown exceptions as generic startup failures', () => {
  expect(describeCalendarStartupError({ code: '42501' })).toEqual({
    reason: '42501',
  });
  expect(describeCalendarStartupError(Error('secret'))).toEqual({
    reason: 'SERVICE_STARTUP_FAILED',
  });
});
it('logs only allowlisted configuration fields and startup stages', () => {
  const write = jest.fn();
  createCalendarLogger('info', write).event('error', 'service.failed', {
    stage: 'configuration',
    ...describeCalendarStartupError(Error('CALENDAR_ENCRYPTION_KEY_INVALID')),
    configurationFields: ['CALENDAR_ENCRYPTION_KEY', 'PRIVATE_SECRET'],
  });
  const result = JSON.parse(write.mock.calls[0][0]);
  expect(result).toMatchObject({
    stage: 'configuration',
    reason: 'CALENDAR_ENCRYPTION_KEY_INVALID',
    configurationFields: ['CALENDAR_ENCRYPTION_KEY'],
  });
  expect(write.mock.calls[0][0]).not.toContain('PRIVATE_SECRET');
});
