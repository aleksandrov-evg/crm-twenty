import 'reflect-metadata';

import { DataSource } from 'typeorm';

import { CreateCalendarOperations1792229192906 } from '../migrations/1792229192906-create-calendar-operations';
import { CreateCalendarConnections1792230811000 } from '../migrations/1792230811000-create-calendar-connections';
import { CreateCalendarInbox1792237004000 } from '../migrations/1792237004000-create-calendar-inbox';

import { CreateCalendarImportPreview1792240000000 } from '../migrations/1792240000000-create-calendar-import-preview';

import { CreateCalendarSessionLinks1792241000000 } from '../migrations/1792241000000-create-calendar-session-links';

import { CreateCalendarSessionIntents1792242000000 } from '../migrations/1792242000000-create-calendar-session-intents';

import { CreateCalendarCreationExecution1792243000000 } from '../migrations/1792243000000-create-calendar-creation-execution';

import { AddCalendarLiveSourceCheck1792244000000 } from '../migrations/1792244000000-add-calendar-live-source-check';

import { CreateCalendarActivation1792245000000 } from '../migrations/1792245000000-create-calendar-activation';

import { FinalizeCalendarCreation1792246000000 } from '../migrations/1792246000000-finalize-calendar-creation';

import { AddCalendarScheduleCheck1792247000000 } from '../migrations/1792247000000-add-calendar-schedule-check';

import { CreateCalendarCancellationReview1792248000000 } from '../migrations/1792248000000-create-calendar-cancellation-review';

import { ObserveCalendarCancellationOutcome1792249000000 } from '../migrations/1792249000000-observe-calendar-cancellation-outcome';

import { CreateCancellationExecution1792250000000 } from '../migrations/1792250000000-create-cancellation-execution';

export const createCalendarDataSource = (
  databaseUrl: string | undefined,
): DataSource => {
  if (!databaseUrl) {
    throw new Error('CALENDAR_DATABASE_URL_REQUIRED');
  }

  const url = new URL(databaseUrl);

  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error('CALENDAR_DATABASE_URL_INVALID');
  }

  return new DataSource({
    type: 'postgres',
    url: databaseUrl,
    schema: 'calendar_sync',
    synchronize: false,
    migrationsRun: false,
    migrationsTableName: 'migrations',
    migrations: [
      CreateCalendarOperations1792229192906,
      CreateCalendarConnections1792230811000,
      CreateCalendarInbox1792237004000,
      CreateCalendarImportPreview1792240000000,
      CreateCalendarSessionLinks1792241000000,
      CreateCalendarSessionIntents1792242000000,
      CreateCalendarCreationExecution1792243000000,
      AddCalendarLiveSourceCheck1792244000000,
      CreateCalendarActivation1792245000000,
      FinalizeCalendarCreation1792246000000,
      AddCalendarScheduleCheck1792247000000,
      CreateCalendarCancellationReview1792248000000,
      ObserveCalendarCancellationOutcome1792249000000,
      CreateCancellationExecution1792250000000,
    ],
    entities: [],
    logging: false,
  });
};
