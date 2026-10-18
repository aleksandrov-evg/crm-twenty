import {
  mergeSessionSchedule,
  type SessionScheduleSnapshot,
} from '../merge-session-schedule';

describe('mergeSessionSchedule', () => {
  const base: SessionScheduleSnapshot = {
    name: 'Пилатес',
    interval: {
      startsAt: '2026-11-01T09:00:00.000Z',
      endsAt: '2026-11-01T10:00:00.000Z',
      timezone: 'Europe/Moscow',
    },
  };
  const moved: SessionScheduleSnapshot = {
    ...base,
    interval: {
      ...base.interval,
      startsAt: '2026-11-01T11:00:00.000Z',
      endsAt: '2026-11-01T12:00:00.000Z',
    },
  };

  it('rejects an unresolvable timezone instead of silently using the server timezone', () => {
    expect(
      mergeSessionSchedule({
        base,
        local: base,
        remote: {
          ...base,
          interval: { ...base.interval, timezone: 'Unknown/Studio' },
        },
      }),
    ).toEqual({ status: 'invalid', source: 'remote' });
  });

  it('does not echo a previously synchronized schedule', () => {
    expect(mergeSessionSchedule({ base, local: base, remote: base })).toEqual({
      status: 'merged',
      snapshot: base,
      updateLocal: false,
      updateRemote: false,
    });
  });

  it('imports a calendar transfer into the same local schedule', () => {
    expect(mergeSessionSchedule({ base, local: base, remote: moved })).toEqual({
      status: 'merged',
      snapshot: moved,
      updateLocal: true,
      updateRemote: false,
    });
  });

  it('exports a CRM transfer', () => {
    expect(mergeSessionSchedule({ base, local: moved, remote: base })).toEqual({
      status: 'merged',
      snapshot: moved,
      updateLocal: false,
      updateRemote: true,
    });
  });

  it('combines a CRM rename with a calendar transfer', () => {
    expect(
      mergeSessionSchedule({
        base,
        local: { ...base, name: 'Утренняя группа' },
        remote: moved,
      }),
    ).toEqual({
      status: 'merged',
      snapshot: { ...moved, name: 'Утренняя группа' },
      updateLocal: true,
      updateRemote: true,
    });
  });

  it('does not conflict when both sides already made the same change', () => {
    expect(mergeSessionSchedule({ base, local: moved, remote: moved })).toEqual(
      {
        status: 'merged',
        snapshot: moved,
        updateLocal: false,
        updateRemote: false,
      },
    );
  });

  it('does not silently merge a change to the start with a competing change to the end', () => {
    const local = {
      ...base,
      interval: { ...base.interval, startsAt: '2026-11-01T09:30:00.000Z' },
    };
    const remote = {
      ...base,
      interval: { ...base.interval, endsAt: '2026-11-01T11:00:00.000Z' },
    };

    expect(mergeSessionSchedule({ base, local, remote })).toEqual({
      status: 'conflict',
      fields: ['interval'],
    });
  });

  it('reports all competing fields without choosing a winner', () => {
    expect(
      mergeSessionSchedule({
        base,
        local: { ...base, name: 'А' },
        remote: { ...moved, name: 'Б' },
      }),
    ).toEqual({ status: 'conflict', fields: ['name'] });
    expect(
      mergeSessionSchedule({
        base,
        local: { ...moved, name: 'А' },
        remote: {
          ...base,
          name: 'Б',
          interval: { ...base.interval, endsAt: '2026-11-01T10:30:00.000Z' },
        },
      }),
    ).toEqual({ status: 'conflict', fields: ['name', 'interval'] });
  });

  it('compares equivalent timestamp offsets as the same instant', () => {
    const remote = {
      ...base,
      interval: {
        ...base.interval,
        startsAt: '2026-11-01T12:00:00+03:00',
        endsAt: '2026-11-01T13:00:00+03:00',
      },
    };

    expect(mergeSessionSchedule({ base, local: base, remote })).toEqual({
      status: 'merged',
      snapshot: base,
      updateLocal: false,
      updateRemote: false,
    });
  });

  it.each(['base', 'local', 'remote'] as const)(
    'rejects an invalid interval in %s',
    (source) => {
      const invalid = {
        ...base,
        interval: { ...base.interval, endsAt: base.interval.startsAt },
      };

      expect(
        mergeSessionSchedule({
          base,
          local: base,
          remote: base,
          [source]: invalid,
        }),
      ).toEqual({ status: 'invalid', source });
    },
  );

  it.each(['not a date', '2026-11-01T09:00:00', '2026-02-30T09:00:00Z'])(
    'rejects ambiguous or invalid timestamp %s',
    (startsAt) => {
      expect(
        mergeSessionSchedule({
          base,
          local: base,
          remote: { ...base, interval: { ...base.interval, startsAt } },
        }),
      ).toEqual({ status: 'invalid', source: 'remote' });
    },
  );
});
