import { renderCrmOriginExport } from '../../domain/render-crm-origin-export';
import {
  type CalendarCrmExportStore,
  type CalendarCrmExportLease,
} from '../../storage/calendar-crm-export.store';
import { CalendarCrmExportWorker } from '../calendar-crm-export-worker';
import { configureCalendarCrmExport } from '../configure-calendar-crm-export';

const scope = {
  workspaceId: 'd668c5d7-a036-4d4d-b00b-83dde748aa25',
  connectionId: 'a7f741c4-8c46-4d4c-bce3-887ae379e8fb',
};
const session = {
  id: 'b3d78540-15b6-4b9c-b31b-5d663ee06012',
  recordingKey: 'session-create:04599d15-50f7-4a6d-877a-22c1cd3b4676',
  name: 'Training',
  startsAt: '2099-01-01T09:00:00.000Z',
  endsAt: '2099-01-01T10:00:00.000Z',
  sessionFormat: 'GROUP_REFORMER' as const,
  capacity: 4,
  status: 'PLANNED',
};
const make = () => {
  const context = {
    configurationVersion: 1,
    calendarUrl: 'https://caldav.yandex.ru/calendars/test/classes/',
    timezone: 'Europe/Moscow',
    username: 'test',
    encryptedAppPassword: 'encrypted',
  };
  const rendered = renderCrmOriginExport({
    ...scope,
    calendarUrl: context.calendarUrl,
    session,
  });
  if (rendered.status !== 'prepared') throw Error('Invalid fixture');
  const lease: CalendarCrmExportLease = {
    ...context,
    id: '16ba6f55-90d4-4775-ab0e-de84d7aaf0b1',
    command: rendered.command,
    leaseGeneration: 1,
    sendStartedAt: null,
    verifiedAt: null,
  };
  const store = {
    scope,
    getContext: jest.fn(async () => context),
    prepare: jest.fn(async () => 'prepared' as const),
    claimNext: jest.fn(async () => lease),
    authorize: jest.fn(async () => true),
    beginSend: jest.fn(async () => true),
    settleReview: jest.fn(async () => true),
    retry: jest.fn(async () => true),
    recordVerified: jest.fn(async (): Promise<boolean> => true),
    finalize: jest.fn(async () => 'finalized' as const),
  } satisfies Pick<
    CalendarCrmExportStore,
    | 'scope'
    | 'getContext'
    | 'prepare'
    | 'claimNext'
    | 'authorize'
    | 'beginSend'
    | 'settleReview'
    | 'retry'
    | 'recordVerified'
    | 'finalize'
  >;
  const dependencies = {
    sendEnabled: true,
    list: jest.fn(async () => ({
      status: 'read' as const,
      sessions: [session],
      needsReview: [],
    })),
    lookup: jest.fn(async () => ({ status: 'matched' as const, session })),
    checkCapabilities: jest.fn(async () => true),
    execute: jest.fn(
      async (
        _command: typeof rendered.command,
        _lease: CalendarCrmExportLease,
        authorize: () => Promise<boolean>,
      ) => {
        if (!(await authorize())) return { status: 'not-authorized' as const };
        return {
          status: 'confirmed' as const,
          etag: '"one"',
          calendarData: rendered.command.calendarData,
        };
      },
    ),
  };
  return {
    store,
    dependencies,
    lease,
    worker: new CalendarCrmExportWorker(store, dependencies),
  };
};
it('is opt-in and requires polling and preparation before sending', () => {
  expect(configureCalendarCrmExport({})).toBeNull();
  expect(() =>
    configureCalendarCrmExport({ CALENDAR_CRM_EXPORT_SEND_ENABLED: 'true' }),
  ).toThrow('CALENDAR_CRM_EXPORT_REQUIRES_PREPARATION_AND_POLLING');
  expect(() =>
    configureCalendarCrmExport({
      CALENDAR_CRM_EXPORT_PREPARATION_ENABLED: 'invalid',
    }),
  ).toThrow();
});
it('prepares but never claims or writes in preparation-only mode', async () => {
  const { worker, store, dependencies } = make();
  dependencies.sendEnabled = false;
  expect(await worker.runOnce()).toBe('saved');
  expect(store.prepare).toHaveBeenCalledTimes(1);
  expect(store.claimNext).not.toHaveBeenCalled();
  expect(dependencies.execute).not.toHaveBeenCalled();
});
it('does not export calendar-origin sessions while their existing link is pending', async () => {
  const { worker, store, dependencies } = make();
  dependencies.sendEnabled = false;
  dependencies.list.mockResolvedValue({
    status: 'read',
    sessions: [
      {
        ...session,
        recordingKey: `session-create:calendar-create:${'a'.repeat(64)}`,
      },
    ],
    needsReview: [],
  });
  expect(await worker.runOnce()).toBe('idle');
  expect(store.prepare).not.toHaveBeenCalled();
});
it('freshly checks CRM before beginSend, verifies the resource and only then finalizes', async () => {
  const { worker, store, dependencies } = make();
  expect(await worker.runOnce()).toBe('saved');
  expect(dependencies.lookup).toHaveBeenCalledTimes(3);
  expect(store.beginSend).toHaveBeenCalledTimes(1);
  expect(store.recordVerified).toHaveBeenCalledTimes(1);
  expect(store.finalize).toHaveBeenCalledTimes(1);
});
it('does not send a frozen export if the CRM session has moved', async () => {
  const { worker, store, dependencies } = make();
  dependencies.lookup.mockResolvedValue({
    status: 'matched',
    session: { ...session, name: 'Moved' },
  });
  expect(await worker.runOnce()).toBe('saved');
  expect(dependencies.execute).not.toHaveBeenCalled();
  expect(store.settleReview).toHaveBeenCalledWith(
    expect.anything(),
    'CRM_EXPORT_SESSION_CHANGED',
  );
});
it('does not authorize another PUT after a previous request might have been delivered', async () => {
  const { worker, store, lease, dependencies } = make();
  lease.sendStartedAt = new Date();
  expect(await worker.runOnce()).toBe('saved');
  expect(store.beginSend).not.toHaveBeenCalled();
  expect(store.finalize).not.toHaveBeenCalled();
  expect(store.settleReview).toHaveBeenCalledWith(
    expect.anything(),
    'CRM_EXPORT_NOT_AUTHORIZED',
  );
});
it('requires capabilities and ownership before a calendar request', async () => {
  const { worker, store, dependencies } = make();
  dependencies.checkCapabilities.mockResolvedValue(false);
  expect(await worker.runOnce()).toBe('saved');
  expect(dependencies.execute).not.toHaveBeenCalled();
  expect(store.beginSend).not.toHaveBeenCalled();
});
it('does not report a completed link when saving GET proof was not confirmed', async () => {
  const { worker, store } = make();
  store.recordVerified.mockResolvedValue(false);
  expect(await worker.runOnce()).toBe('stale');
  expect(store.finalize).not.toHaveBeenCalled();
});
