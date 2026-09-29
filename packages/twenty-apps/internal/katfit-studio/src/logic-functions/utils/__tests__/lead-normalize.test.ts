import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  mapInterestedFormats,
  mapLeadSource,
  normalizeContact,
  opportunityName,
  slaDueAt,
  splitPersonName,
} from '../lead-normalize.ts';

describe('normalizeContact', () => {
  it('normalizes Russian phone from 8…', () => {
    const result = normalizeContact('+7 (900) 123-45-67', null);
    assert.equal(result.e164, '+79001234567');
    assert.equal(result.nationalNumber, '9001234567');
  });

  it('normalizes email', () => {
    const result = normalizeContact(null, '  Ann@Example.COM ');
    assert.equal(result.email, 'ann@example.com');
  });
});

describe('splitPersonName', () => {
  it('splits first and last', () => {
    assert.deepEqual(splitPersonName('Анна Иванова'), {
      firstName: 'Анна',
      lastName: 'Иванова',
    });
  });
});

describe('mapLeadSource', () => {
  it('maps yandex cpc to search', () => {
    assert.equal(
      mapLeadSource({ utmSource: 'yandex', utmMedium: 'cpc' }),
      'YANDEX_SEARCH',
    );
  });

  it('maps rsya', () => {
    assert.equal(
      mapLeadSource({ utmSource: 'yandex', utmMedium: 'cpm' }),
      'YANDEX_NETWORK',
    );
  });
});

describe('mapInterestedFormats', () => {
  it('maps landing interests', () => {
    assert.deepEqual(mapInterestedFormats(['reformer', 'stretching', 'undecided']), [
      'INTRO_REFORMER',
      'STRETCHING',
    ]);
  });
});

describe('opportunityName', () => {
  it('formats title', () => {
    assert.equal(opportunityName('Анна'), 'Анна — первое занятие');
  });
});

describe('slaDueAt', () => {
  it('adds two hours', () => {
    const from = new Date('2026-09-29T10:00:00.000Z');
    assert.equal(slaDueAt(from), '2026-09-29T12:00:00.000Z');
  });
});
