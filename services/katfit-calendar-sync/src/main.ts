import { configureCalendarCancellation } from './cancellation/configure-calendar-cancellation';
import { configureCalendarSchedule } from './schedule/configure-calendar-schedule';
import { configureCalendarEnrichment } from './enrichment/configure-calendar-enrichment';
import { createServer } from 'node:http';

import { z } from 'zod';

import { CalendarSessionIntentStore } from './storage/calendar-session-intent.store';

import { configureCalendarCreationWorker } from './creation/configure-calendar-creation-worker';
import { configureCalendarCrmWorker } from './reconciliation/create-calendar-crm-worker';
import { CalendarPoller } from './polling/calendar-poller';
import { startCalendarPolling } from './polling/start-calendar-polling';
import { CalendarCredentialCipher } from './security/calendar-credential-cipher';
import { CalendarImportPreviewStore } from './storage/calendar-import-preview.store';
import { CalendarPollStore } from './storage/calendar-poll.store';
import { createCalendarDataSource } from './storage/create-calendar-data-source';

const start = async (): Promise<void> => {
  const cancellation = configureCalendarCancellation(process.env);
  const schedule = configureCalendarSchedule(process.env);
  const enrichment = configureCalendarEnrichment(process.env);
  const createCreationWorker = configureCalendarCreationWorker(process.env);
  const createCrmWorker = configureCalendarCrmWorker(process.env);
  const prepareCreation =
    z
      .enum(['true', 'false'])
      .default('false')
      .parse(process.env.CALENDAR_CREATE_PREPARATION_ENABLED) === 'true';
  const creationScope = prepareCreation
    ? z.object({ workspaceId: z.uuid(), connectionId: z.uuid() }).parse({
        workspaceId: process.env.TWENTY_WORKSPACE_ID,
        connectionId: process.env.CALENDAR_CONNECTION_ID,
      })
    : null;
  const port = Number(process.env.PORT ?? 3100);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('CALENDAR_PORT_INVALID');
  }

  if (
    process.env.CALENDAR_POLLING_ENABLED &&
    !['true', 'false'].includes(process.env.CALENDAR_POLLING_ENABLED)
  ) {
    throw new Error('CALENDAR_POLLING_CONFIG_INVALID');
  }
  if (
    process.env.CALENDAR_PREVIEW_ENABLED &&
    !['true', 'false'].includes(process.env.CALENDAR_PREVIEW_ENABLED)
  )
    throw new Error('CALENDAR_PREVIEW_CONFIG_INVALID');
  const previewEnabled = process.env.CALENDAR_PREVIEW_ENABLED === 'true';
  const pollingEnabled = process.env.CALENDAR_POLLING_ENABLED === 'true';
  const keyId = process.env.CALENDAR_ENCRYPTION_KEY_ID ?? 'primary';
  const cipher = pollingEnabled
    ? new CalendarCredentialCipher(keyId, {
        [keyId]: process.env.CALENDAR_ENCRYPTION_KEY ?? '',
      })
    : null;

  const source = await createCalendarDataSource(
    process.env.CALENDAR_DATABASE_URL,
  ).initialize();
  const server = createServer((request, response) => {
    if (request.method !== 'GET' || request.url !== '/healthz') {
      response.writeHead(404).end();
      return;
    }

    void source
      .query(
        schedule
          ? 'SELECT (SELECT "nextScheduleCheckAt" FROM calendar_sync."calendarSessionLink" LIMIT 1)'
          : enrichment
            ? 'SELECT (SELECT "commonBase" FROM calendar_sync."calendarSessionLink" LIMIT 1), (SELECT "nextFinalizeAt" FROM calendar_sync."calendarCreationExecution" LIMIT 1), (SELECT uid FROM calendar_sync."calendarDescriptionRefresh" LIMIT 1)'
            : 'SELECT 1',
      )
      .then(() =>
        source.query(
          cancellation
            ? 'SELECT (SELECT "initialBookingIds" FROM calendar_sync."calendarCancellationReview" LIMIT 1), (SELECT id FROM calendar_sync."calendarCancellationObservation" LIMIT 1)'
            : 'SELECT 1',
        ),
      )
      .then(() =>
        source.query(
          createCreationWorker
            ? 'SELECT (SELECT id FROM calendar_sync."calendarActivation" LIMIT 1), (SELECT "crmCapabilitiesCheckedAt" FROM calendar_sync."calendarCreationAttempt" LIMIT 1)'
            : 'SELECT 1',
        ),
      )
      .then(() =>
        source.query(
          createCreationWorker
            ? 'SELECT (SELECT uid FROM calendar_sync."calendarCreationExecution" LIMIT 1), (SELECT "liveSourceCheckedAt" FROM calendar_sync."calendarCreationAttempt" LIMIT 1)'
            : 'SELECT 1',
        ),
      )
      .then(() =>
        source.query(
          creationScope
            ? 'SELECT 1 FROM calendar_sync."calendarSessionCreateIntent" LIMIT 1'
            : 'SELECT 1',
        ),
      )
      .then(() =>
        source.query(
          createCrmWorker
            ? 'SELECT 1 FROM "calendar_sync"."calendarSessionLink" LIMIT 1'
            : 'SELECT 1',
        ),
      )
      .then(() =>
        source.query(
          previewEnabled
            ? 'SELECT 1 FROM "calendar_sync"."calendarImportPreview" LIMIT 1'
            : 'SELECT 1',
        ),
      )
      .then(() =>
        source.query(
          pollingEnabled
            ? 'SELECT (SELECT "readGeneration" FROM "calendar_sync"."calendarConnection" LIMIT 1), (SELECT "id" FROM "calendar_sync"."calendarResource" LIMIT 1), (SELECT "id" FROM "calendar_sync"."calendarInbox" LIMIT 1)'
            : 'SELECT 1 FROM "calendar_sync"."studioCalendarOperation" LIMIT 1',
        ),
      )
      .then(() => {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(
          JSON.stringify({
            status: 'ok',
            synchronizationEnabled: false,
            calendarCancellationReviewEnabled: cancellation !== null,
            calendarCancellationSendEnabled: false,
            calendarSchedulePreparationEnabled:
              schedule?.preparationEnabled ?? false,
            calendarScheduleSendEnabled: schedule?.sendEnabled ?? false,
            calendarPollingEnabled: pollingEnabled,
            calendarPreviewEnabled: previewEnabled,
            calendarCrmLookupEnabled: createCrmWorker !== null,
            calendarCreatePreparationEnabled: creationScope !== null,
            calendarCreationRecoveryEnabled: createCreationWorker !== null,
            calendarDescriptionPreparationEnabled:
              enrichment?.preparationEnabled ?? false,
            calendarExportSendEnabled: enrichment?.sendEnabled ?? false,
            calendarCreateSendEnabled:
              process.env.CALENDAR_CREATE_SEND_ENABLED === 'true',
            calendarLiveSourceCheckEnabled:
              process.env.CALENDAR_LIVE_SOURCE_CHECK_ENABLED === 'true',
          }),
        );
      })
      .catch(() => response.writeHead(503).end());
  });

  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, '0.0.0.0', resolve);
    });
  } catch {
    await source.destroy();
    throw new Error('CALENDAR_HTTP_START_FAILED');
  }

  const polling = cipher
    ? startCalendarPolling(
        new CalendarPoller(new CalendarPollStore(source, cipher)),
      )
    : null;

  const preview = previewEnabled
    ? startCalendarPolling(new CalendarImportPreviewStore(source))
    : null;

  const crmWorker = createCrmWorker
    ? startCalendarPolling(createCrmWorker(source))
    : null;

  const intentWorker = creationScope
    ? startCalendarPolling(
        new CalendarSessionIntentStore(source, creationScope),
      )
    : null;

  const recoveryWorker = createCreationWorker
    ? startCalendarPolling(createCreationWorker(source))
    : null;

  const enrichmentWorkers =
    enrichment?.create(source).map((worker) => startCalendarPolling(worker)) ??
    [];

  const scheduleWorkers =
    schedule?.create(source).map((worker) => startCalendarPolling(worker)) ??
    [];

  const cancellationWorker = cancellation
    ? startCalendarPolling(cancellation(source))
    : null;

  const shutdown = (): void => {
    void (async () => {
      await Promise.all([
        polling?.stop(),
        cancellationWorker?.stop(),
        preview?.stop(),
        crmWorker?.stop(),
        intentWorker?.stop(),
        recoveryWorker?.stop(),
        ...scheduleWorkers.map((worker) => worker.stop()),
        ...enrichmentWorkers.map((worker) => worker.stop()),
      ]);
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await source.destroy();
    })().catch(() => {
      process.exitCode = 1;
    });
  };

  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
};

void start().catch(() => {
  process.stderr.write('Calendar service startup failed\n');
  process.exitCode = 1;
});
