import { z } from 'zod';

import { isValidTimeZone } from './is-valid-time-zone';

const instantSchema = z.iso
  .datetime({ offset: true })
  .transform((value) => new Date(value).toISOString());

export const scheduleSchema = z.strictObject({
  name: z.string().trim().min(1),
  interval: z
    .strictObject({
      startsAt: instantSchema,
      endsAt: instantSchema,
      timezone: z.string().min(1).refine(isValidTimeZone),
    })
    .refine((interval) => interval.endsAt > interval.startsAt),
});

export type SessionScheduleSnapshot = z.input<typeof scheduleSchema>;

export type SessionScheduleMergeResult =
  | { status: 'invalid'; source: 'base' | 'local' | 'remote' }
  | { status: 'conflict'; fields: Array<'name' | 'interval'> }
  | {
      status: 'merged';
      snapshot: SessionScheduleSnapshot;
      updateLocal: boolean;
      updateRemote: boolean;
    };

const isSameInterval = (
  first: SessionScheduleSnapshot['interval'],
  second: SessionScheduleSnapshot['interval'],
): boolean =>
  first.startsAt === second.startsAt &&
  first.endsAt === second.endsAt &&
  first.timezone === second.timezone;

export const mergeSessionSchedule = ({
  base,
  local,
  remote,
}: {
  base: SessionScheduleSnapshot;
  local: SessionScheduleSnapshot;
  remote: SessionScheduleSnapshot;
}): SessionScheduleMergeResult => {
  const parsedBase = scheduleSchema.safeParse(base);

  if (!parsedBase.success) {
    return { status: 'invalid', source: 'base' };
  }

  const parsedLocal = scheduleSchema.safeParse(local);

  if (!parsedLocal.success) {
    return { status: 'invalid', source: 'local' };
  }

  const parsedRemote = scheduleSchema.safeParse(remote);

  if (!parsedRemote.success) {
    return { status: 'invalid', source: 'remote' };
  }

  const baseline = parsedBase.data;
  const localSchedule = parsedLocal.data;
  const remoteSchedule = parsedRemote.data;
  const fields: Array<'name' | 'interval'> = [];
  const localNameChanged = localSchedule.name !== baseline.name;
  const remoteNameChanged = remoteSchedule.name !== baseline.name;
  const localIntervalChanged = !isSameInterval(
    localSchedule.interval,
    baseline.interval,
  );
  const remoteIntervalChanged = !isSameInterval(
    remoteSchedule.interval,
    baseline.interval,
  );

  if (
    localNameChanged &&
    remoteNameChanged &&
    localSchedule.name !== remoteSchedule.name
  ) {
    fields.push('name');
  }

  // A transfer must not combine one editor's start with the other's end.
  if (
    localIntervalChanged &&
    remoteIntervalChanged &&
    !isSameInterval(localSchedule.interval, remoteSchedule.interval)
  ) {
    fields.push('interval');
  }

  if (fields.length > 0) {
    return { status: 'conflict', fields };
  }

  const snapshot = {
    name: localNameChanged ? localSchedule.name : remoteSchedule.name,
    interval: localIntervalChanged
      ? localSchedule.interval
      : remoteSchedule.interval,
  };

  return {
    status: 'merged',
    snapshot,
    updateLocal:
      snapshot.name !== localSchedule.name ||
      !isSameInterval(snapshot.interval, localSchedule.interval),
    updateRemote:
      snapshot.name !== remoteSchedule.name ||
      !isSameInterval(snapshot.interval, remoteSchedule.interval),
  };
};
