import assert from 'node:assert/strict';
import { test } from 'node:test';
import { productionDeadline } from '../server/validation/productionDeadline';
import { date, InputError } from '../server/validation/input';

test('prazo preserva dias corridos, bissexto e virada de ano sem truncar ano expandido', () => {
  assert.equal(productionDeadline(1, new Date('2028-02-28T12:30:00Z')).deliveryDate, '2028-02-29');
  assert.equal(productionDeadline(2, new Date('2028-02-28T12:30:00Z')).deliveryDate, '2028-03-01');
  assert.equal(productionDeadline(1, new Date('2026-12-31T12:30:00Z')).deliveryDate, '2027-01-01');
  assert.equal(productionDeadline(1, new Date('9999-12-30T12:30:00Z')).deliveryDate, '9999-12-31');
  assert.throws(() => productionDeadline(1, new Date('9999-12-31T12:30:00Z')), InputError);
});
test('datas e prazos não representáveis falham com InputError em vez de erro de persistência/RangeError', () => {
  for (const value of [0, -1, 1.5, '10', 2147483648, 2147483647, Number.MAX_SAFE_INTEGER, Infinity, undefined]) {
    assert.throws(() => productionDeadline(value, new Date('2026-10-29T00:00:00Z')), InputError);
  }
  assert.throws(() => productionDeadline(1, new Date(NaN)), InputError);
  for (const value of ['0000-01-01', '2026-02-29', '10000-01-01']) assert.throws(() => date(value, 'Data'), InputError);
  for (const value of ['0001-01-01', '2028-02-29', '9999-12-31']) assert.equal(date(value, 'Data'), value);
});
