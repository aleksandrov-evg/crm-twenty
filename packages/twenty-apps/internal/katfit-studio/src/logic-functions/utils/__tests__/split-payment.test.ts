import assert from 'node:assert/strict';
import test from 'node:test';

import { type SplitProduct, validateSplitPayment } from '../split-payment.ts';

const product: SplitProduct = {
  id: 'split-4',
  name: 'Сплит-блок 4 тренировки',
  category: 'SPLIT',
  visitsIncluded: 4,
  price: { amountMicros: 20_000_000_000, currencyCode: 'RUB' },
  isActive: true,
  validFrom: '2026-01-01',
  validTo: null,
};

const input = {
  pairId: 'pair-1',
  productId: product.id,
  paidAt: '2026-01-08T10:00:00.000Z',
  idempotencyKey: 'split-payment-1',
};

test('accepts one full payment from a pair participant', () => {
  assert.equal(
    validateSplitPayment(
      { ...input, payments: [{ personId: 'person-1', amount: 20_000, paymentMethod: 'SBP' }] },
      product,
      ['person-1', 'person-2'],
    ).success,
    true,
  );
});

test('accepts two equal payments from the pair participants', () => {
  assert.equal(
    validateSplitPayment(
      { ...input, payments: [
        { personId: 'person-1', amount: 10_000, paymentMethod: 'SBP' },
        { personId: 'person-2', amount: 10_000, paymentMethod: 'CASH' },
      ] },
      product,
      ['person-1', 'person-2'],
    ).success,
    true,
  );
});

test('rejects a split payment by someone outside the pair', () => {
  const result = validateSplitPayment(
    { ...input, payments: [{ personId: 'person-3', amount: 20_000, paymentMethod: 'SBP' }] },
    product,
    ['person-1', 'person-2'],
  );

  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.code, 'INVALID_PAYMENT_PARTICIPANTS');
});

test('rejects two payments that are not equal halves', () => {
  const result = validateSplitPayment(
    { ...input, payments: [
      { personId: 'person-1', amount: 12_000, paymentMethod: 'SBP' },
      { personId: 'person-2', amount: 8_000, paymentMethod: 'CASH' },
    ] },
    product,
    ['person-1', 'person-2'],
  );

  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.code, 'AMOUNT_MISMATCH');
});
