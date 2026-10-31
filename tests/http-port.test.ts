import assert from 'node:assert/strict';
import { test } from 'node:test';
import { httpPort } from '../server/validation/httpPort';
test('porta HTTP não aceita coerção parcial, zero, overflow ou formatos ambíguos', () => {
  assert.equal(httpPort(undefined), 3000);
  for (const value of ['1', '3300', '65535']) assert.equal(httpPort(value), Number(value));
  for (const value of ['', '0', '-1', '65536', '3000abc', '3000.5', '3e3', '03000', ' 3000', '3000 ', 'Infinity']) {
    assert.throws(() => httpPort(value), /PORT deve ser/);
  }
});
