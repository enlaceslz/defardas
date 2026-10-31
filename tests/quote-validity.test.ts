import assert from 'node:assert/strict';
import { test } from 'node:test';
import { quoteValidity } from '../src/utils/quoteValidity';
test('validade mantém dias corridos e rejeita entradas/datas não representáveis', () => {
  assert.equal(quoteValidity(1, new Date('2028-02-28T12:00:00Z')), '2028-02-29');
  assert.equal(quoteValidity(1, new Date('2026-12-31T12:00:00Z')), '2027-01-01');
  assert.equal(quoteValidity(1, new Date('9999-12-30T12:00:00Z')), '9999-12-31');
  for (const days of [0, -1, 1.5, Infinity, NaN, 2147483647, 2147483648]) assert.throws(() => quoteValidity(days, new Date('2026-01-01T00:00:00Z')));
  assert.throws(() => quoteValidity(1, new Date('9999-12-31T00:00:00Z')));
  assert.throws(() => quoteValidity(1, new Date(NaN)));
});
