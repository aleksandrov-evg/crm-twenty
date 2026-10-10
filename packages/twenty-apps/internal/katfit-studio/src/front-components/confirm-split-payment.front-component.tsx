import { type CSSProperties, useCallback, useEffect, useMemo, useState } from 'react';
import { CoreApiClient } from 'twenty-client-sdk/core';
import { RestApiClient } from 'twenty-client-sdk/rest';
import { defineFrontComponent } from 'twenty-sdk/define';
import { closeSidePanel, enqueueSnackbar, unmountFrontComponent, useSelectedRecordIds } from 'twenty-sdk/front-component';

export const CONFIRM_SPLIT_PAYMENT_FRONT_COMPONENT_UNIVERSAL_IDENTIFIER = 'cd36b79d-d0df-425e-81e3-8f155f77baad';

type Product = { id: string; name: string; price: { amountMicros: number; currencyCode: string } };
type Pair = { firstPerson: { id: string; name?: { firstName?: string; lastName?: string } } | null; secondPerson: { id: string; name?: { firstName?: string; lastName?: string } } | null };
type PaymentMethod = 'CASH' | 'SBP' | 'CARD';
type Response = { success: true; duplicate: boolean; visitsAvailable: number } | { success: false; message: string };

const styles: Record<string, CSSProperties> = {
  container: { display: 'flex', flexDirection: 'column', height: '100%', fontFamily: 'var(--t-font-family)', color: 'var(--t-font-color-primary)' },
  header: { padding: 'var(--t-spacing-4)', borderBottom: '1px solid var(--t-border-color-light)' },
  body: { display: 'flex', flex: 1, flexDirection: 'column', gap: 'var(--t-spacing-3)', padding: 'var(--t-spacing-4)', overflowY: 'auto' },
  field: { display: 'flex', flexDirection: 'column', gap: 'var(--t-spacing-2)' },
  control: { height: 'var(--t-spacing-8)', padding: '0 var(--t-spacing-3)', color: 'var(--t-font-color-primary)', background: 'var(--t-background-secondary)', border: '1px solid var(--t-border-color-medium)', borderRadius: 'var(--t-border-radius-sm)' },
  summary: { padding: 'var(--t-spacing-3)', background: 'var(--t-background-secondary)', border: '1px solid var(--t-border-color-light)', borderRadius: 'var(--t-border-radius-sm)', lineHeight: 1.6 },
  footer: { display: 'flex', justifyContent: 'flex-end', gap: 'var(--t-spacing-2)', padding: 'var(--t-spacing-3)', borderTop: '1px solid var(--t-border-color-light)' },
  button: { height: 'var(--t-spacing-8)', padding: '0 var(--t-spacing-3)', borderRadius: 'var(--t-border-radius-sm)', cursor: 'pointer' },
};

const defaultPaidAt = (): string => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

const createKey = (): string => typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `split-payment-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const personName = (person: NonNullable<Pair['firstPerson']>): string => [person.name?.firstName, person.name?.lastName].filter(Boolean).join(' ') || person.id;

const ConfirmSplitPaymentForm = () => {
  const selectedRecordIds = useSelectedRecordIds();
  const pairId = selectedRecordIds.length === 1 ? selectedRecordIds[0] : null;
  const [pair, setPair] = useState<Pair | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [productId, setProductId] = useState('');
  const [twoPayments, setTwoPayments] = useState(true);
  const [paidAt, setPaidAt] = useState(defaultPaidAt);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('SBP');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [idempotencyKey] = useState(createKey);
  const product = useMemo(() => products.find(({ id }) => id === productId) ?? null, [productId, products]);

  const load = useCallback(async () => {
    if (pairId === null) return;
    setLoading(true);
    try {
      const result = (await new CoreApiClient().query({
        studioPairs: { __args: { filter: { id: { eq: pairId } }, first: 1 }, edges: { node: { firstPerson: { id: true, name: { firstName: true, lastName: true } }, secondPerson: { id: true, name: { firstName: true, lastName: true } } } } },
        studioProducts: { __args: { filter: { and: [{ isActive: { eq: true } }, { category: { eq: 'SPLIT' } }] }, first: 100 }, edges: { node: { id: true, name: true, price: { amountMicros: true, currencyCode: true } } } },
      } as never)) as unknown as { studioPairs?: { edges?: Array<{ node: Pair }> }; studioProducts?: { edges?: Array<{ node: Product }> } };
      const loadedPair = result.studioPairs?.edges?.[0]?.node ?? null;
      const loadedProducts = result.studioProducts?.edges?.map(({ node }) => node) ?? [];
      setPair(loadedPair); setProducts(loadedProducts); setProductId(loadedProducts[0]?.id ?? '');
    } catch { await enqueueSnackbar({ message: 'Не удалось загрузить пару или сплит-продукты.', variant: 'error' }); }
    finally { setLoading(false); }
  }, [pairId]);

  useEffect(() => { void load(); }, [load]);
  const close = () => { unmountFrontComponent(); closeSidePanel(); };
  const submit = async () => {
    const firstPerson = pair?.firstPerson;
    const secondPerson = pair?.secondPerson;
    if (pairId === null || !firstPerson || !secondPerson || product === null) return;
    setSubmitting(true);
    const amount = product.price.amountMicros / 1_000_000;
    const payments = twoPayments
      ? [{ personId: firstPerson.id, amount: amount / 2, paymentMethod }, { personId: secondPerson.id, amount: amount / 2, paymentMethod }]
      : [{ personId: firstPerson.id, amount, paymentMethod }];
    try {
      const result = await new RestApiClient().post<Response>('/s/studio/split-payments/confirm', { pairId, productId: product.id, paidAt: new Date(paidAt).toISOString(), payments, idempotencyKey });
      if (!result.success) { await enqueueSnackbar({ message: result.message, variant: 'error' }); return; }
      await enqueueSnackbar({ message: result.duplicate ? 'Оплата уже была оформлена.' : `Сплит-блок активирован. Доступно: ${result.visitsAvailable}.`, variant: 'success' });
      close();
    } catch (error) { await enqueueSnackbar({ message: error instanceof Error ? error.message : 'Не удалось оформить сплит-блок.', variant: 'error' }); }
    finally { setSubmitting(false); }
  };
  const canSubmit = !loading && !submitting && pairId !== null && pair?.firstPerson !== null && pair?.secondPerson !== null && product !== null && paidAt !== '';
  const amount = product ? product.price.amountMicros / 1_000_000 : 0;
  return <div style={styles.container}><div style={styles.header}><h2>Оформить сплит-блок</h2><p>Общий остаток пары будет уменьшаться один раз за совместный слот.</p></div><div style={styles.body}>
    <label style={styles.field}>Сплит-блок<select style={styles.control} value={productId} onChange={(event) => setProductId(event.target.value)} disabled={loading || submitting}>{products.map((item) => <option key={item.id} value={item.id}>{item.name} — {item.price.amountMicros / 1_000_000} ₽</option>)}</select></label>
    <label style={styles.field}>Дата и время оплаты<input style={styles.control} type="datetime-local" value={paidAt} max={defaultPaidAt()} onChange={(event) => setPaidAt(event.target.value)} disabled={submitting} /></label>
    <label style={styles.field}>Способ оплаты<select style={styles.control} value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as PaymentMethod)} disabled={submitting}><option value="SBP">СБП</option><option value="CASH">Наличные</option><option value="CARD">Карта</option></select></label>
    <label><input type="checkbox" checked={twoPayments} onChange={(event) => setTwoPayments(event.target.checked)} disabled={submitting} /> Два платежа по половине</label>
    {pair?.firstPerson && pair?.secondPerson && product ? <div style={styles.summary}>{twoPayments ? <><div>{personName(pair.firstPerson)} — {amount / 2} ₽</div><div>{personName(pair.secondPerson)} — {amount / 2} ₽</div></> : <div>{personName(pair.firstPerson)} — {amount} ₽</div>}<div>Будет начислено: 4 совместные тренировки.</div></div> : null}
  </div><div style={styles.footer}><button style={styles.button} onClick={close} disabled={submitting}>Отмена</button><button style={styles.button} onClick={() => void submit()} disabled={!canSubmit}>{submitting ? 'Оформление…' : 'Подтвердить оплату'}</button></div></div>;
};

export default defineFrontComponent({ universalIdentifier: CONFIRM_SPLIT_PAYMENT_FRONT_COMPONENT_UNIVERSAL_IDENTIFIER, name: 'confirm-split-payment', description: 'Create a fully paid shared split block.', component: ConfirmSplitPaymentForm });
