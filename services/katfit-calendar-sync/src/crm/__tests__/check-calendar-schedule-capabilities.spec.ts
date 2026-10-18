import { createCalendarScheduleCapabilityCheck } from '../check-calendar-schedule-capabilities';
import { createScheduleCapabilityFixture } from './fixtures/calendar-schedule-capability-fixture';

const configuration = { baseUrl: 'https://crm.example.test', apiToken: 'test' };
describe('schedule gateway capabilities', () => {
  const run = async (body: unknown, status = 200) => {
    const request = jest
      .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockResolvedValue(new Response(JSON.stringify(body), { status }));
    return {
      result: await createCalendarScheduleCapabilityCheck({
        ...configuration,
        fetch: request,
      })(),
      request,
    };
  };
  it('checks only metadata declarations without domain writes', async () => {
    const { result, request } = await run(
      createScheduleCapabilityFixture().metadata,
    );
    expect(result).toBe('ready');
    expect(String(request.mock.calls[0][0])).toBe(
      'https://crm.example.test/metadata',
    );
    expect(JSON.parse(String(request.mock.calls[0][1]?.body)).query).toMatch(
      /^query CalendarScheduleGatewayCapabilities/,
    );
  });
  it.each([
    'lock',
    'journal-fields',
    'unique',
    'partial-index',
    'field-identity',
    'route-auth',
    'route-path',
    'function-identity',
    'application',
    'duplicate-function',
    'inactive',
    'partial-page',
    'graphql-error',
  ])('fails closed for %s', async (problem) => {
    const fixture = createScheduleCapabilityFixture();
    switch (problem) {
      case 'lock':
        fixture.session.fieldsList = [];
        break;
      case 'journal-fields':
        fixture.journal.fieldsList.pop();
        break;
      case 'unique':
        fixture.journal.indexMetadataList = [];
        break;
      case 'partial-index':
        fixture.journal.indexMetadataList[0].indexWhereClause =
          'operationKey IS NOT NULL';
        break;
      case 'field-identity':
        fixture.journal.fieldsList[0].universalIdentifier =
          fixture.session.fieldsList[0].universalIdentifier;
        break;
      case 'route-auth':
        fixture.command.httpRouteTriggerSettings.isAuthRequired = false;
        break;
      case 'route-path':
        fixture.command.httpRouteTriggerSettings.path = '/wrong';
        break;
      case 'function-identity':
        fixture.command.universalIdentifier =
          fixture.session.universalIdentifier;
        break;
      case 'application':
        fixture.command.applicationId = fixture.session.fieldsList[0].id;
        break;
      case 'duplicate-function':
        fixture.metadata.data.findManyLogicFunctions.push(fixture.command);
        break;
      case 'inactive':
        fixture.journal.isActive = false;
        break;
      case 'partial-page':
        fixture.metadata.data.objects.pageInfo.hasNextPage = true;
        break;
      case 'graphql-error':
        Object.assign(fixture.metadata, { errors: [{ message: 'partial' }] });
        break;
    }
    expect((await run(fixture.metadata)).result).toBe('unconfirmed');
  });
  it.each([401, 403, 500])('handles HTTP %s', async (status) => {
    expect((await run({}, status)).result).toBe(
      status === 401
        ? 'auth-required'
        : status === 403
          ? 'forbidden'
          : 'unconfirmed',
    );
  });
});
