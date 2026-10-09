import { type CSSProperties, useCallback, useEffect, useMemo, useState } from 'react';
import { CoreApiClient } from 'twenty-client-sdk/core';
import { RestApiClient } from 'twenty-client-sdk/rest';
import { defineFrontComponent } from 'twenty-sdk/define';
import { closeSidePanel, enqueueSnackbar, unmountFrontComponent, useSelectedRecordIds } from 'twenty-sdk/front-component';

export const CREATE_SPLIT_BOOKING_FRONT_COMPONENT_UNIVERSAL_IDENTIFIER = 'a11a7eaa-efef-4221-99a4-489cf6d9ec12';

type Membership = { id: string; name: string; visitsAvailable: number };
type Session = { id: string; name: string; startsAt: string; capacity: number; bookedCount: number };
type Result = { success: true; duplicate: boolean; bookingIds: string[] } | { success: false; message: string };

const styles: Record<string, CSSProperties> = {
  container: { display: 'flex', flexDirection: 'column', height: '100%', gap: 12, padding: 16, overflowY: 'auto', color: 'var(--t-font-color-primary)', background: 'var(--t-background-primary)', fontFamily: 'var(--t-font-family)' },
  field: { display: 'flex', flexDirection: 'column', gap: 4 },
  control: { minHeight: 32, padding: 6, color: 'var(--t-font-color-primary)', background: 'var(--t-background-secondary)', border: '1px solid var(--t-border-color-medium)', borderRadius: 4 },
  summary: { padding: 12, background: 'var(--t-background-secondary)', border: '1px solid var(--t-border-color-light)', borderRadius: 4 },
  actions: { display: 'flex', gap: 8, justifyContent: 'flex-end' },
};

const CreateSplitBookingForm = () => {
  const selectedRecordIds = useSelectedRecordIds();
  const pairId = selectedRecordIds.length === 1 ? selectedRecordIds[0] : null;
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [membershipId, setMembershipId] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const membership = useMemo(() => memberships.find((item) => item.id === membershipId) ?? null, [membershipId, memberships]);
  const session = useMemo(() => sessions.find((item) => item.id === sessionId) ?? null, [sessionId, sessions]);
  const load = useCallback(async () => {
    if (!pairId) return;
    try {
      const result = (await new CoreApiClient().query({
        studioMemberships: { __args: { filter: { and: [{ pairId: { eq: pairId } }, { status: { eq: 'ACTIVE' } }, { visitsAvailable: { gt: 0 } }] }, first: 100 }, edges: { node: { id: true, name: true, visitsAvailable: true } } },
        classSessions: { __args: { filter: { and: [{ sessionFormat: { eq: 'SPLIT_EQUIPMENT' } }, { status: { in: ['PLANNED', 'CONFIRMED'] } }, { startsAt: { gt: new Date().toISOString() } }] }, first: 100 }, edges: { node: { id: true, name: true, startsAt: true, capacity: true, bookedCount: true } } },
      } as never)) as unknown as { studioMemberships?: { edges?: Array<{ node: Membership }> }; classSessions?: { edges?: Array<{ node: Session }> } };
      const loadedMemberships = result.studioMemberships?.edges?.map(({ node }) => node) ?? [];
      const loadedSessions = result.classSessions?.edges?.map(({ node }) => node) ?? [];
      setMemberships(loadedMemberships); setSessions(loadedSessions); setMembershipId(loadedMemberships[0]?.id ?? ''); setSessionId(loadedSessions[0]?.id ?? '');
    } catch { await enqueueSnackbar({ message: 'Не удалось загрузить блоки или свободные слоты.', variant: 'error' }); }
    finally { setLoading(false); }
  }, [pairId]);
  useEffect(() => { void load(); }, [load]);
  const close = () => { unmountFrontComponent(); closeSidePanel(); };
  const submit = async () => {
    if (!pairId || !membership || !session) return;
    setSubmitting(true);
    try {
      const response = await new RestApiClient().post<Result>('/s/studio/split-bookings/create', { pairId, membershipId: membership.id, classSessionId: session.id, idempotencyKey: `split-booking:${pairId}:${membership.id}:${session.id}` });
      if (!response.success) { await enqueueSnackbar({ message: response.message, variant: 'error' }); return; }
      await enqueueSnackbar({ message: response.duplicate ? 'Пара уже записана на этот слот.' : 'Пара записана: зарезервирована одна общая тренировка.', variant: 'success' }); close();
    } catch (error) { await enqueueSnackbar({ message: error instanceof Error ? error.message : 'Не удалось записать пару.', variant: 'error' }); }
    finally { setSubmitting(false); }
  };
  return <div style={styles.container}><h2>Записать пару на сплит</h2><label style={styles.field}>Общий блок<select style={styles.control} value={membershipId} onChange={(event) => setMembershipId(event.target.value)} disabled={loading || submitting}>{memberships.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.visitsAvailable} доступно</option>)}</select></label><label style={styles.field}>Свободный слот<select style={styles.control} value={sessionId} onChange={(event) => setSessionId(event.target.value)} disabled={loading || submitting}>{sessions.map((item) => <option key={item.id} value={item.id}>{item.name} · {new Date(item.startsAt).toLocaleString('ru-RU')} · свободно {item.capacity - item.bookedCount}</option>)}</select></label>{membership && session ? <div style={styles.summary}>Будут созданы две записи пары и один резерв общего блока.</div> : <div style={styles.summary}>Нет активного блока или будущего сплит-слота.</div>}<div style={styles.actions}><button onClick={close} disabled={submitting}>Отмена</button><button onClick={() => void submit()} disabled={!membership || !session || submitting}>{submitting ? 'Запись…' : 'Записать пару'}</button></div></div>;
};

export default defineFrontComponent({ universalIdentifier: CREATE_SPLIT_BOOKING_FRONT_COMPONENT_UNIVERSAL_IDENTIFIER, name: 'create-split-booking', description: 'Book a pair into a future split session.', component: CreateSplitBookingForm });
