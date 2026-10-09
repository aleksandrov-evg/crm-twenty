import { type CSSProperties, useEffect, useMemo, useState } from 'react';
import { CoreApiClient } from 'twenty-client-sdk/core';
import { defineFrontComponent } from 'twenty-sdk/define';
import { enqueueSnackbar } from 'twenty-sdk/front-component';

import { SESSION_FORMAT_OPTIONS } from 'src/constants/select-options';

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
  sessionFormat: string;
  status: string;
  bookedCount: number;
  capacity: number;
};

type SessionForm = {
  id: string | null;
  name: string;
  sessionFormat: string;
  startsAt: string;
  endsAt: string;
  capacity: string;
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
  grid: { display: 'grid', width: '100%' },
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
  formBackdrop: {
    alignItems: 'center',
    background: 'rgba(0, 0, 0, 0.55)',
    display: 'flex',
    inset: 0,
    justifyContent: 'center',
    padding: 16,
    position: 'absolute',
    zIndex: 1,
  },
  form: {
    background: 'var(--t-background-primary)',
    border: '1px solid var(--t-border-color-medium)',
    borderRadius: 8,
    boxShadow: '0 12px 32px rgba(0, 0, 0, 0.35)',
    display: 'grid',
    gap: 12,
    maxWidth: 380,
    padding: 16,
    width: '100%',
  },
  formLabel: { display: 'grid', fontSize: 13, gap: 4 },
  input: {
    background: 'var(--t-background-secondary)',
    border: '1px solid var(--t-border-color-medium)',
    borderRadius: 4,
    color: 'var(--t-font-color-primary)',
    minHeight: 32,
    padding: '4px 8px',
  },
  formActions: { display: 'flex', gap: 8, justifyContent: 'flex-end' },
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

const getSessionFormatLabel = (sessionFormat: string): string =>
  SESSION_FORMAT_OPTIONS.find(
    (sessionFormatOption) => sessionFormatOption.value === sessionFormat,
  )?.label ?? sessionFormat;

const toDateTimeLocalValue = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}T${String(date.getHours()).padStart(2, '0')}:${String(
    date.getMinutes(),
  ).padStart(2, '0')}`;

const getNewSessionForm = (startsAt: Date): SessionForm => {
  const endsAt = new Date(startsAt);
  endsAt.setHours(endsAt.getHours() + 1);

  return {
    id: null,
    name: '',
    sessionFormat: SESSION_FORMAT_OPTIONS[0].value,
    startsAt: toDateTimeLocalValue(startsAt),
    endsAt: toDateTimeLocalValue(endsAt),
    capacity: '4',
  };
};

const getSessionForm = (session: ClassSession): SessionForm => ({
  id: session.id,
  name: session.name,
  sessionFormat: session.sessionFormat,
  startsAt: toDateTimeLocalValue(new Date(session.startsAt)),
  endsAt: toDateTimeLocalValue(new Date(session.endsAt)),
  capacity: String(session.capacity),
});

const getWeekDays = (selectedDate: Date, mode: 'day' | 'week'): Date[] =>
  mode === 'day'
    ? [startOfDay(selectedDate)]
    : Array.from({ length: 7 }, (_, index) => addDays(startOfWeek(selectedDate), index));

const ClassSchedule = () => {
  const [mode, setMode] = useState<'day' | 'week'>('day');
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [sessions, setSessions] = useState<ClassSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessionForm, setSessionForm] = useState<SessionForm | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [reloadVersion, setReloadVersion] = useState(0);
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
                sessionFormat: true,
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
  }, [days, reloadVersion]);

  const movePeriod = (offset: number) => {
    setSelectedDate(addDays(selectedDate, offset * (mode === 'day' ? 1 : 7)));
  };

  const gridTemplateColumns =
    mode === 'week'
      ? '56px repeat(7, minmax(0, 1fr))'
      : '56px minmax(180px, 1fr)';
  const gridHeight = (GRID_END_HOUR - GRID_START_HOUR) * HOUR_HEIGHT;

  const openNewSessionForm = (day: Date, event: React.MouseEvent<HTMLDivElement>) => {
    const dayColumnBounds = event.currentTarget.getBoundingClientRect();
    const clickedHour = Math.max(
      GRID_START_HOUR,
      Math.min(
        GRID_END_HOUR - 1,
        GRID_START_HOUR + Math.floor((event.clientY - dayColumnBounds.top) / HOUR_HEIGHT),
      ),
    );
    const startsAt = new Date(day);
    startsAt.setHours(clickedHour, 0, 0, 0);
    setSessionForm(getNewSessionForm(startsAt));
  };

  const saveSession = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (sessionForm === null) return;

    const startsAt = new Date(sessionForm.startsAt);
    const endsAt = new Date(sessionForm.endsAt);
    const capacity = Number(sessionForm.capacity);
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt || !Number.isInteger(capacity) || capacity < 1) {
      await enqueueSnackbar({
        message: 'Укажите корректные время и вместимость.',
        variant: 'error',
      });
      return;
    }

    const name = sessionForm.name.trim() || getSessionFormatLabel(sessionForm.sessionFormat);
    const data = {
      name,
      sessionFormat: sessionForm.sessionFormat,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      capacity,
    };

    setIsSaving(true);
    try {
      const client = new CoreApiClient();
      if (sessionForm.id === null) {
        await client.mutation({
          createClassSession: {
            __args: { data: { ...data, status: 'PLANNED', bookedCount: 0 } },
            id: true,
          },
        } as never);
      } else {
        await client.mutation({
          updateClassSession: {
            __args: { id: sessionForm.id, data },
            id: true,
          },
        } as never);
      }
      setSessionForm(null);
      setReloadVersion((currentReloadVersion) => currentReloadVersion + 1);
      await enqueueSnackbar({
        message: sessionForm.id === null ? 'Занятие создано.' : 'Занятие обновлено.',
        variant: 'success',
      });
    } catch (saveError) {
      await enqueueSnackbar({
        message:
          saveError instanceof Error ? saveError.message : 'Не удалось сохранить занятие.',
        variant: 'error',
      });
    } finally {
      setIsSaving(false);
    }
  };

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
              <div key={dayKey} style={{ ...styles.dayColumn, height: gridHeight }} onClick={(event) => openNewSessionForm(day, event)}>
                {sessions.filter((session) => toDateKey(new Date(session.startsAt)) === dayKey).map((session) => {
                  const startsAt = new Date(session.startsAt);
                  const endsAt = new Date(session.endsAt);
                  const top = Math.max(0, ((startsAt.getHours() + startsAt.getMinutes() / 60) - GRID_START_HOUR) * HOUR_HEIGHT);
                  const height = Math.max(36, ((endsAt.getTime() - startsAt.getTime()) / 3_600_000) * HOUR_HEIGHT);
                  const startsAtLabel = startsAt.toLocaleTimeString('ru-RU', {
                    hour: '2-digit',
                    minute: '2-digit',
                  });
                  const sessionFormatLabel = getSessionFormatLabel(
                    session.sessionFormat,
                  );
                  return (
                    <button key={session.id} type="button" onClick={(event) => { event.stopPropagation(); setSessionForm(getSessionForm(session)); }} style={{ ...styles.session, top, height }} data-tooltip={`${sessionFormatLabel} · ${startsAtLabel} · ${session.bookedCount}/${session.capacity}`}>
                      <strong>{sessionFormatLabel}</strong><br />
                      {startsAtLabel} · {session.bookedCount}/{session.capacity}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
        {isLoading ? <div style={{ padding: 12 }}>Загрузка расписания…</div> : null}
      </div>
      {sessionForm !== null ? (
        <div style={styles.formBackdrop}>
          <form style={styles.form} onSubmit={(event) => void saveSession(event)}>
            <strong>{sessionForm.id === null ? 'Новое занятие' : 'Редактировать занятие'}</strong>
            <label style={styles.formLabel}>
              Название
              <input style={styles.input} value={sessionForm.name} onChange={(event) => setSessionForm({ ...sessionForm, name: event.target.value })} />
            </label>
            <label style={styles.formLabel}>
              Формат
              <select style={styles.input} value={sessionForm.sessionFormat} onChange={(event) => setSessionForm({ ...sessionForm, sessionFormat: event.target.value })}>
                {SESSION_FORMAT_OPTIONS.map((sessionFormatOption) => (
                  <option key={sessionFormatOption.value} value={sessionFormatOption.value}>{sessionFormatOption.label}</option>
                ))}
              </select>
            </label>
            <label style={styles.formLabel}>
              Начало
              <input style={styles.input} type="datetime-local" value={sessionForm.startsAt} onChange={(event) => setSessionForm({ ...sessionForm, startsAt: event.target.value })} required />
            </label>
            <label style={styles.formLabel}>
              Окончание
              <input style={styles.input} type="datetime-local" value={sessionForm.endsAt} onChange={(event) => setSessionForm({ ...sessionForm, endsAt: event.target.value })} required />
            </label>
            <label style={styles.formLabel}>
              Вместимость
              <input style={styles.input} type="number" min="1" step="1" value={sessionForm.capacity} onChange={(event) => setSessionForm({ ...sessionForm, capacity: event.target.value })} required />
            </label>
            <div style={styles.formActions}>
              <button style={styles.button} type="button" onClick={() => setSessionForm(null)} disabled={isSaving}>Отмена</button>
              <button style={styles.activeButton} type="submit" disabled={isSaving}>{isSaving ? 'Сохранение…' : 'Сохранить'}</button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
};

export default defineFrontComponent({
  universalIdentifier: CLASS_SCHEDULE_FRONT_COMPONENT_UNIVERSAL_IDENTIFIER,
  name: 'class-schedule',
  description: 'Почасовое расписание занятий',
  component: ClassSchedule,
});
