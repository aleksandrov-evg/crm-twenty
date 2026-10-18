import { randomUUID } from 'node:crypto';

import {
  calendarCrmBinding,
  createCalendarCrmCapabilityCheck,
} from '../check-calendar-crm-capabilities';
import {
  createCapabilityFixture,
  CRM_TEST_CONFIGURATION,
} from './fixtures/calendar-capability-fixture';

const setup = () => {
  const fixture = createCapabilityFixture();
  const request = jest
    .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
    .mockImplementation(async (url) => {
      const path = new URL(String(url)).pathname;
      if (path === '/metadata') return Response.json(fixture.metadata);
      return Response.json({
        data: {
          [path.endsWith('classSessions') ? 'classSessions' : 'studioEvents']:
            [],
        },
        pageInfo: { hasNextPage: false },
      });
    });
  const check = createCalendarCrmCapabilityCheck(
    { ...CRM_TEST_CONFIGURATION, fetch: request },
    fixture.workspaceId,
  );
  return { ...fixture, request, check };
};

describe('CRM capability check', () => {
  it('verifies workspace, objects, a full unique key index and the authenticated application command without writes', async () => {
    const { check, evidence, request } = setup();
    expect(await check()).toMatchObject({
      status: 'ready',
      evidence: { ...evidence, checkedAt: expect.any(String) },
    });
    expect(request).toHaveBeenCalledTimes(3);
    expect(
      request.mock.calls.every(([url]) => !String(url).includes('/s/')),
    ).toBe(true);
    const metadataQuery = JSON.parse(
      String(request.mock.calls[0][1]?.body),
    ).query;
    expect(metadataQuery).toMatch(/^query /);
    expect(metadataQuery).not.toContain('mutation');
    expect(
      request.mock.calls
        .slice(1)
        .every(([, options]) => options?.method === 'GET'),
    ).toBe(true);
  });
  it('uses a valid UUID for the audit read probe accepted by Twenty', async () => {
    const { check, request } = setup();
    await check();
    const auditRequest = request.mock.calls.find(([url]) =>
      new URL(String(url)).pathname === '/rest/studioEvents',
    );
    expect(auditRequest).toBeDefined();
    const filter = new URL(String(auditRequest?.[0])).searchParams.get('filter');
    expect(filter).toBe('id[eq]:00000000-0000-4000-8000-000000000000');
    expect(filter?.slice('id[eq]:'.length)).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });
  it('binds readiness to origin, workspace and token', () => {
    const { workspaceId } = setup();
    const binding = calendarCrmBinding(CRM_TEST_CONFIGURATION, workspaceId);
    expect(
      calendarCrmBinding(
        { ...CRM_TEST_CONFIGURATION, apiToken: 'rotated' },
        workspaceId,
      ),
    ).not.toBe(binding);
    expect(
      calendarCrmBinding(
        { ...CRM_TEST_CONFIGURATION, baseUrl: 'https://other.test' },
        workspaceId,
      ),
    ).not.toBe(binding);
    expect(calendarCrmBinding(CRM_TEST_CONFIGURATION, randomUUID())).not.toBe(
      binding,
    );
  });
  it.each([
    (fixture: ReturnType<typeof setup>) => {
      fixture.metadata.data.currentWorkspace.id = randomUUID();
    },
    (fixture: ReturnType<typeof setup>) => {
      fixture.session.isActive = false;
    },
    (fixture: ReturnType<typeof setup>) => {
      fixture.audit.applicationId = randomUUID();
    },
    (fixture: ReturnType<typeof setup>) => {
      fixture.session.fieldsList[0].type = 'NUMBER';
    },
    (fixture: ReturnType<typeof setup>) => {
      fixture.session.fieldsList.push(fixture.session.fieldsList[0]);
    },
    (fixture: ReturnType<typeof setup>) => {
      fixture.session.fieldsList.find(
        (field) => field.name === 'recordingKey',
      )!.universalIdentifier = randomUUID();
    },
    (fixture: ReturnType<typeof setup>) => {
      fixture.session.indexMetadataList[0].isUnique = false;
    },
    (fixture: ReturnType<typeof setup>) => {
      fixture.session.indexMetadataList[0].indexWhereClause =
        '"status" = \'PLANNED\'';
    },
    (fixture: ReturnType<typeof setup>) => {
      fixture.session.indexMetadataList[0].indexFieldMetadataList[0].subFieldName =
        'value';
    },
    (fixture: ReturnType<typeof setup>) => {
      fixture.session.indexMetadataList[0].indexFieldMetadataList.push({
        fieldMetadataId: randomUUID(),
        subFieldName: null,
      });
    },
    (fixture: ReturnType<typeof setup>) => {
      fixture.session.indexMetadataList[0].indexFieldMetadataList[0].fieldMetadataId =
        randomUUID();
    },
    (fixture: ReturnType<typeof setup>) => {
      fixture.command.httpRouteTriggerSettings.isAuthRequired = false;
    },
    (fixture: ReturnType<typeof setup>) => {
      fixture.command.httpRouteTriggerSettings.httpMethod = 'GET';
    },
    (fixture: ReturnType<typeof setup>) => {
      fixture.command.httpRouteTriggerSettings.path = '/other';
    },
    (fixture: ReturnType<typeof setup>) => {
      fixture.command.applicationId = randomUUID();
    },
    (fixture: ReturnType<typeof setup>) => {
      fixture.metadata.data.findManyLogicFunctions.push(fixture.command);
    },
    (fixture: ReturnType<typeof setup>) => {
      fixture.metadata.data.objects.pageInfo.hasNextPage = true;
    },
  ])('rejects an incompatible or ambiguous deployment', async (mutate) => {
    const fixture = setup();
    mutate(fixture);
    expect(await fixture.check()).toMatchObject({ status: 'not-ready' });
  });
  it('rejects partial GraphQL data with errors', async () => {
    const fixture = setup();
    fixture.request.mockResolvedValue(
      Response.json({ ...fixture.metadata, errors: [{ message: 'denied' }] }),
    );
    expect(await fixture.check()).toMatchObject({ status: 'not-ready' });
  });
  it.each([
    [401, 'auth-required'],
    [403, 'forbidden'],
    [500, 'unavailable'],
  ] as const)('handles HTTP %s', async (status, expected) => {
    const fixture = setup();
    fixture.request.mockResolvedValue(new Response(null, { status }));
    expect(await fixture.check()).toEqual({ status: expected });
  });
  it('does not expose network error details or token', async () => {
    const fixture = setup();
    fixture.request.mockRejectedValue(new Error('test-token'));
    expect(await fixture.check()).toEqual({ status: 'unavailable' });
  });
  it('rejects an ignored read filter or incomplete page', async () => {
    const fixture = setup();
    fixture.request
      .mockReset()
      .mockResolvedValueOnce(Response.json(fixture.metadata))
      .mockResolvedValue(
        Response.json({
          data: { classSessions: [] },
          pageInfo: { hasNextPage: true },
        }),
      );
    expect(await fixture.check()).toEqual({
      status: 'not-ready',
      reason: 'CRM_READ_PROBE_FAILED',
    });
  });
});
