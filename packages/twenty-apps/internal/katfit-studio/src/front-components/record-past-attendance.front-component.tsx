import { type CSSProperties, useEffect, useRef, useState } from 'react';
import { CoreApiClient } from 'twenty-client-sdk/core';
import { RestApiClient, RestApiClientError } from 'twenty-client-sdk/rest';
import { defineFrontComponent } from 'twenty-sdk/define';
import { closeSidePanel, enqueueSnackbar, openSidePanelPage, SidePanelPages, unmountFrontComponent, useSelectedRecordIds } from 'twenty-sdk/front-component';

export const RECORD_PAST_ATTENDANCE_FRONT_COMPONENT_UNIVERSAL_IDENTIFIER = '54ac432c-ad11-4912-84d4-221d89c45c4a';

type MembershipOption = { id: string; name: string; status: string; visitsAvailable: number; product: { name: string; sessionFormat: string; durationMinutes: number } | null };
type SessionOption = { id: string; name: string; sessionFormat: string };
type Result =
  | { success: true; preview: true; visitsAvailable: number; visitsAfter: number }
  | { success: true; duplicate: boolean; bookingId: string; classSessionId: string; transactionId: string; visitsAvailable: number }
  | { success: false; message: string };

const styles: Record<string, CSSProperties> = {
  container: { display: 'flex', flexDirection: 'column', height: '100%', padding: 16, gap: 12, overflowY: 'auto', color: 'var(--t-font-color-primary)', background: 'var(--t-background-primary)', fontFamily: 'var(--t-font-family)' },
  field: { display: 'flex', flexDirection: 'column', gap: 4 },
  control: { minHeight: 32, padding: 6, color: 'var(--t-font-color-primary)', background: 'var(--t-background-secondary)', border: '1px solid var(--t-border-color-medium)', borderRadius: 4 },
  summary: { padding: 12, background: 'var(--t-background-secondary)', border: '1px solid var(--t-border-color-light)', borderRadius: 4 },
  validationError: { padding: 12, color: 'var(--t-color-red)', background: 'var(--t-background-secondary)', border: '1px solid var(--t-color-red)', borderRadius: 4 },
  actions: { display: 'flex', gap: 8, justifyContent: 'flex-end' },
};

const sourceOptions = [
  ['TRAINER', 'Тренер'], ['ATTENDANCE_LOG', 'Журнал посещений'], ['CLIENT', 'Подтверждение клиента'], ['ADMIN', 'Решение администратора'], ['OTHER', 'Другое'],
] as const;

const getEndsAtValue = (
  startsAt: string,
  durationMinutes: number | undefined,
): string => {
  if (!startsAt || !durationMinutes || durationMinutes <= 0) {
    return '';
  }

  const startsAtDate = new Date(startsAt);

  if (Number.isNaN(startsAtDate.getTime())) {
    return '';
  }

  const endsAtDate = new Date(
    startsAtDate.getTime() + durationMinutes * 60_000,
  );
  const localEndsAtDate = new Date(
    endsAtDate.getTime() - endsAtDate.getTimezoneOffset() * 60_000,
  );

  return localEndsAtDate.toISOString().slice(0, 16);
};

const RecordPastAttendanceForm = () => {
  const selectedRecordIds = useSelectedRecordIds();
  const personId = selectedRecordIds.length === 1 ? selectedRecordIds[0] : null;
  const [memberships, setMemberships] = useState<MembershipOption[]>([]);
  const [membershipId, setMembershipId] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [source, setSource] = useState('TRAINER');
  const [sourceDetails, setSourceDetails] = useState('');
  const [reason, setReason] = useState('');
  const [sessions, setSessions] = useState<SessionOption[]>([]);
  const [existingClassSessionId, setExistingClassSessionId] = useState('');
  const [preview, setPreview] = useState<{ visitsAvailable: number; visitsAfter: number } | null>(null);
  const [result, setResult] = useState<Extract<Result, { bookingId: string }> | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const startsAtInputRef = useRef<HTMLInputElement>(null);
  const selectedMembership = memberships.find((membership) => membership.id === membershipId);
  const hasProductDuration =
    Number.isInteger(selectedMembership?.product?.durationMinutes) &&
    (selectedMembership?.product?.durationMinutes ?? 0) > 0;

  useEffect(() => {
    if (!personId) return;
    void (async () => {
      try {
        const response = await new CoreApiClient().query({ studioMemberships: { __args: { filter: { personId: { eq: personId } }, first: 100 }, edges: { node: { id: true, name: true, status: true, visitsAvailable: true, product: { name: true, sessionFormat: true, durationMinutes: true } } } } } as never) as unknown as { studioMemberships?: { edges?: Array<{ node: MembershipOption }> } };
        const options = response.studioMemberships?.edges?.map(({ node }) => node) ?? [];
        setMemberships(options);
        setMembershipId(options[0]?.id ?? '');
      } catch {
        await enqueueSnackbar({ message: 'Не удалось загрузить пакеты клиента.', variant: 'error' });
      }
    })();
  }, [personId]);

  const resetPreview = () => {
    setPreview(null);
    setResult(null);
    setValidationError(null);
  };

  const close = () => { unmountFrontComponent(); closeSidePanel(); };

  const getCurrentStartsAt = (): string =>
    startsAtInputRef.current?.value ?? startsAt;

  const getCurrentEndsAt = (): string =>
    getEndsAtValue(
      getCurrentStartsAt(),
      selectedMembership?.product?.durationMinutes,
    );

  const getValidationError = (): string | null => {
    if (personId === null) {
      return 'Откройте карточку одного клиента перед внесением занятия.';
    }
    if (!membershipId) {
      return 'Выберите пакет клиента.';
    }
    if (!hasProductDuration) {
      return 'У выбранного продукта не указана длительность занятия.';
    }
    if (!getCurrentStartsAt()) {
      return 'Укажите начало занятия.';
    }
    if (!getCurrentEndsAt()) {
      return 'Не удалось рассчитать окончание занятия. Проверьте длительность продукта.';
    }
    if (source === 'OTHER' && !sourceDetails.trim()) {
      return 'Заполните пояснение источника.';
    }
    if (!reason.trim()) {
      return 'Заполните причину внесения.';
    }

    return null;
  };

  const perform = async (previewOnly: boolean) => {
    const formValidationError = getValidationError();
    if (formValidationError !== null) {
      setValidationError(formValidationError);
      return;
    }
    if (personId === null) {
      return;
    }

    const currentStartsAt = getCurrentStartsAt();
    const currentEndsAt = getCurrentEndsAt();
    setValidationError(null);
    setStartsAt(currentStartsAt);
    setEndsAt(currentEndsAt);
    setLoading(true);
    try {
      const startsAtIso = new Date(currentStartsAt).toISOString();
      const idempotencyKey = `${personId}:${membershipId}:${startsAtIso}`;
      const response = await new RestApiClient().post<Result>('/s/studio/attendance/record-past', {
        personId, membershipId, startsAt: startsAtIso, endsAt: new Date(currentEndsAt).toISOString(),
        existingClassSessionId: existingClassSessionId || undefined, reason: reason.trim(), source,
        sourceDetails: sourceDetails.trim() || undefined, idempotencyKey, previewOnly,
      });
      if (!response.success) {
        setPreview(null);
        await enqueueSnackbar({ message: response.message, variant: 'error' });
        return;
      }
      if ('preview' in response) {
        setPreview(response);
        const sessionsResponse = await new CoreApiClient().query({ classSessions: { __args: { filter: { startsAt: { eq: startsAtIso } }, first: 100 }, edges: { node: { id: true, name: true, sessionFormat: true } } } } as never) as unknown as { classSessions?: { edges?: Array<{ node: SessionOption }> } };
        setSessions((sessionsResponse.classSessions?.edges?.map(({ node }) => node) ?? []).filter((session) => session.sessionFormat === selectedMembership?.product?.sessionFormat));
      } else {
        setResult(response);
        setPreview(null);
        await enqueueSnackbar({ message: `Посещение списано. Остаток: ${response.visitsAvailable}.`, variant: 'success' });
      }
    } catch (error) {
      const responseBody = error instanceof RestApiClientError ? error.body : null;
      const responseMessage = typeof responseBody === 'object' && responseBody !== null && 'message' in responseBody && typeof responseBody.message === 'string' ? responseBody.message : null;
      await enqueueSnackbar({ message: responseMessage ?? (error instanceof Error ? error.message : 'Не удалось выполнить операцию.'), variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return <div style={styles.container}>
    <h2>Внести прошедшее занятие</h2>
    <label style={styles.field}>Пакет клиента
      <select style={styles.control} value={membershipId} onChange={(event) => { const nextMembership = memberships.find((membership) => membership.id === event.target.value); setMembershipId(event.target.value); setEndsAt(getEndsAtValue(getCurrentStartsAt(), nextMembership?.product?.durationMinutes)); resetPreview(); }}>
        {memberships.map((membership) => <option key={membership.id} value={membership.id}>{membership.name} · {membership.visitsAvailable} доступно</option>)}
      </select>
    </label>
    {selectedMembership && <div style={styles.summary}>Продукт: {selectedMembership.product?.name} · Формат: {selectedMembership.product?.sessionFormat} · Длительность: {selectedMembership.product?.durationMinutes} мин. · Статус: {selectedMembership.status}</div>}
    {selectedMembership && !hasProductDuration && <div style={styles.summary}>У продукта не указана длительность занятия. Откройте продукт в разделе «Продукты студии», заполните поле «Длительность, минут» и повторите операцию.</div>}
    <label style={styles.field}>Начало занятия
      <input ref={startsAtInputRef} style={styles.control} type="datetime-local" defaultValue={startsAt} onBlur={(event) => { setStartsAt(event.target.value); setEndsAt(getEndsAtValue(event.target.value, selectedMembership?.product?.durationMinutes)); setExistingClassSessionId(''); setSessions([]); resetPreview(); }} />
    </label>
    <label style={styles.field}>Окончание занятия
      <input style={styles.control} type="datetime-local" value={endsAt} readOnly />
    </label>
    {sessions.length > 0 && <label style={styles.field}>Существующее занятие
      <select style={styles.control} value={existingClassSessionId} onChange={(event) => { setExistingClassSessionId(event.target.value); setPreview(null); }}>
        <option value="">Создать новое занятие</option>
        {sessions.map((session) => <option key={session.id} value={session.id}>{session.name}</option>)}
      </select>
    </label>}
    <label style={styles.field}>Источник сведений
      <select style={styles.control} value={source} onChange={(event) => { setSource(event.target.value); resetPreview(); }}>
        {sourceOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
    </label>
    {source === 'OTHER' && <label style={styles.field}>Пояснение источника
      <input style={styles.control} value={sourceDetails} onChange={(event) => { setSourceDetails(event.target.value); resetPreview(); }} />
    </label>}
    <label style={styles.field}>Причина внесения
      <textarea style={styles.control} value={reason} onChange={(event) => { setReason(event.target.value); resetPreview(); }} />
    </label>
    {preview && <div style={styles.summary}>Пакет: {selectedMembership?.name}<br />Дата: {startsAt}<br />Списание: −1 посещение<br />Остаток после: {preview.visitsAfter}</div>}
    {validationError && <div role="alert" style={styles.validationError}>{validationError}</div>}
    {result && <div style={styles.summary}>
      <button type="button" onClick={() => void openSidePanelPage({ page: SidePanelPages.ViewRecord, recordId: result.bookingId, objectNameSingular: 'studioBooking' })}>Открыть запись</button>
      <button type="button" onClick={() => void openSidePanelPage({ page: SidePanelPages.ViewRecord, recordId: result.classSessionId, objectNameSingular: 'classSession' })}>Открыть занятие</button>
      <button type="button" onClick={() => void openSidePanelPage({ page: SidePanelPages.ViewRecord, recordId: result.transactionId, objectNameSingular: 'membershipTransaction' })}>Открыть операцию пакета</button>
      <div>Остаток: {result.visitsAvailable}</div>
    </div>}
    <div style={styles.actions}>
      <button type="button" onClick={close}>Закрыть</button>
      {!result && <button type="button" disabled={loading} onClick={() => void perform(!preview)}>{loading ? 'Проверка…' : preview ? 'Подтвердить списание' : 'Проверить'}</button>}
    </div>
  </div>;
};

export default defineFrontComponent({ universalIdentifier: RECORD_PAST_ATTENDANCE_FRONT_COMPONENT_UNIVERSAL_IDENTIFIER, name: 'record-past-attendance', description: 'Record a completed class against a paid package.', component: RecordPastAttendanceForm });
