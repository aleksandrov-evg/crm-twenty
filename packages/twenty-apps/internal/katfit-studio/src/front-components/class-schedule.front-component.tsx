import { type CSSProperties, useEffect, useMemo, useState } from 'react';
import { CoreApiClient } from 'twenty-client-sdk/core';
import { defineFrontComponent } from 'twenty-sdk/define';
import { enqueueSnackbar } from 'twenty-sdk/front-component';

export const CLASS_SCHEDULE_FRONT_COMPONENT_UNIVERSAL_IDENTIFIER =
  '67c2f57f-2d8d-4b61-8a06-93a7f9070d75';

const GRID_START_HOUR = 6;
const GRID_END_HOUR = 22;
const HOUR_HEIGHT = 64;

type ClassSession = {
  id: string;
  name: string;
  startsAt: string;
  endsAt: string;
  status: string;
  bookedCount: number;
  capacity: number;
};

const styles: Record<string, CSSProperties> = {
  container: {
    background: 'var(--t-background-primary)',
    color: 'var(--t-font-color-primary)',
    display: 'flex',
    flexDirection: 'column',
    fontFamily: 'var(--t-font-family)',
    height: '100%',
    overflow: 'hidden',
  },
  toolbar: {
    alignItems: 'center',
    borderBottom: '1px solid var(--t-border-color-light)',
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
    padding: 12,
  },
  title: { fontSize: 18, fontWeight: 600, marginRight: 'auto' },
  button: {
    background: 'var(--t-background-secondary)',
    border: '1px solid var(--t-border-color-medium)',
    borderRadius: 4,
    color: 'var(--t-font-color-primary)',
    cursor: 'pointer',
    minHeight: 32,
    padding: '4px 10px',
  },
  activeButton: {
    background: 'var(--t-color-blue)',
    border: '1px solid var(--t-color-blue)',
    borderRadius: 4,
    color: 'white',
    cursor: 'pointer',
    minHeight: 32,
    padding: '4px 10px',
  },
  gridScroll: { flex: 1, overflow: 'auto', padding: 12 },
  grid: { display: 'grid', minWidth: 800 },
  dayHeader: {
    alignItems: 'center',
    borderBottom: '1px solid var(--t-border-color-light)',
    borderLeft: '1px solid var(--t-border-color-light)',
    display: 'flex',
    fontSize: 12,
    justifyContent: 'center',
    minHeight: 40,
  },
  hourColumn: { position: 'relative' },
  hour: {
    color: 'var(--t-font-color-light)',
    fontSize: 12,
    position: 'absolute',
    right: 8,
    transform: 'translateY(-8px)',
  },
  dayColumn: {
    backgroundImage:
      'repeating-linear-gradient(to bottom, transparent 0, transparent 63px, var(--t-border-color-light) 63px, var(--t-border-color-light) 64px)',
    borderLeft: '1px solid var(--t-border-color-light)',
    position: 'relative',
  },
  session: {
    background: 'var(--t-background-secondary)',
    borderLeft: '3px solid var(--t-color-blue)',
    borderRadius: 4,
    boxSizing: 'border-box',
    color: 'var(--t-font-color-primary)',
    fontSize: 12,
    left: 4,
    overflow: 'hidden',
    padding: 6,
    position: 'absolute',
    right: 4,
    textAlign: 'left',
  },
  error: { color: 'var(--t-color-red)', padding: 16 },
};

const startOfWeek = (date: Date): Date => {
  const result = new Date(date);
  const dayOffset = (result.getDay() + 6) % 7;
  result.setDate(result.getDate() - dayOffset);
  result.setHours(0, 0, 0, 0);
  return result;
};

const addDays = (date: Date, days: number): Date => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

const startOfDay = (date: Date): Date => {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
};

const toDateKey = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;

const getWeekDays = (selectedDate: Date, mode: 'day' | 'week'): Date[] =>
  mode === 'day'
    ? [startOfDay(selectedDate)]
    : Array.from({ length: 7 }, (_, index) => addDays(startOfWeek(selectedDate), index));

const ClassSchedule = () => {
  const [mode, setMode] = useState<'day' | 'week'>('week');
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [sessions, setSessions] = useState<ClassSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const days = useMemo(() => getWeekDays(selectedDate, mode), [mode, selectedDate]);

  useEffect(() => {
    const firstDay = days[0];
    const lastDay = addDays(days[days.length - 1], 1);
    let isMounted = true;

    void (async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = (await new CoreApiClient().query({
          classSessions: {
            __args: {
              filter: {
                and: [
                  { startsAt: { gte: firstDay.toISOString() } },
                  { startsAt: { lt: lastDay.toISOString() } },
                ],
              },
              first: 200,
            },
            edges: {
              node: {
                id: true,
                name: true,
                startsAt: true,
                endsAt: true,
                status: true,
                bookedCount: true,
                capacity: true,
              },
            },
          },
        } as never)) as unknown as {
          classSessions?: { edges?: Array<{ node: ClassSession }> };
        };

        if (isMounted) {
          setSessions(response.classSessions?.edges?.map(({ node }) => node) ?? []);
        }
      } catch (loadError) {
        if (isMounted) {
          setError('Не удалось загрузить занятия.');
          await enqueueSnackbar({
            message:
              loadError instanceof Error
                ? loadError.message
                : 'Не удалось загрузить занятия.',
            variant: 'error',
          });
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [days]);

  const movePeriod = (offset: number) => {
    setSelectedDate(addDays(selectedDate, offset * (mode === 'day' ? 1 : 7)));
  };

  const gridTemplateColumns = `56px repeat(${days.length}, minmax(180px, 1fr))`;
  const gridHeight = (GRID_END_HOUR - GRID_START_HOUR) * HOUR_HEIGHT;

  return (
    <div style={styles.container}>
      <div style={styles.toolbar}>
        <div style={styles.title}>Расписание занятий</div>
        <button style={styles.button} type="button" onClick={() => movePeriod(-1)}>
          ←
        </button>
        <button style={styles.button} type="button" onClick={() => setSelectedDate(new Date())}>
          Сегодня
        </button>
        <button style={styles.button} type="button" onClick={() => movePeriod(1)}>
          →
        </button>
        <button style={mode === 'day' ? styles.activeButton : styles.button} type="button" onClick={() => setMode('day')}>
          День
        </button>
        <button style={mode === 'week' ? styles.activeButton : styles.button} type="button" onClick={() => setMode('week')}>
          Неделя
        </button>
      </div>
      <div style={styles.gridScroll}>
        {error ? <div style={styles.error}>{error}</div> : null}
        <div style={{ ...styles.grid, gridTemplateColumns, gridTemplateRows: `40px ${gridHeight}px` }}>
          <div />
          {days.map((day) => (
            <div key={toDateKey(day)} style={styles.dayHeader}>
              {day.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'short' })}
            </div>
          ))}
          <div style={{ ...styles.hourColumn, height: gridHeight }}>
            {Array.from({ length: GRID_END_HOUR - GRID_START_HOUR + 1 }, (_, index) => (
              <span key={index} style={{ ...styles.hour, top: index * HOUR_HEIGHT }}>
                {String(GRID_START_HOUR + index).padStart(2, '0')}:00
              </span>
            ))}
          </div>
          {days.map((day) => {
            const dayKey = toDateKey(day);
            return (
              <div key={dayKey} style={{ ...styles.dayColumn, height: gridHeight }}>
                {sessions.filter((session) => toDateKey(new Date(session.startsAt)) === dayKey).map((session) => {
                  const startsAt = new Date(session.startsAt);
                  const endsAt = new Date(session.endsAt);
                  const top = Math.max(0, ((startsAt.getHours() + startsAt.getMinutes() / 60) - GRID_START_HOUR) * HOUR_HEIGHT);
                  const height = Math.max(36, ((endsAt.getTime() - startsAt.getTime()) / 3_600_000) * HOUR_HEIGHT);
                  return (
                    <button key={session.id} type="button" style={{ ...styles.session, top, height }} data-tooltip={`${session.name} · ${session.bookedCount}/${session.capacity}`}>
                      <strong>{session.name}</strong><br />
                      {startsAt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })} · {session.bookedCount}/{session.capacity}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
        {isLoading ? <div style={{ padding: 12 }}>Загрузка расписания…</div> : null}
      </div>
    </div>
  );
};

export default defineFrontComponent({
  universalIdentifier: CLASS_SCHEDULE_FRONT_COMPONENT_UNIVERSAL_IDENTIFIER,
  name: 'class-schedule',
  description: 'Почасовое расписание занятий',
  component: ClassSchedule,
});
