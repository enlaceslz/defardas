import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import { trustedProxy } from '../server/validation/trustedProxy';
test('proxy confiável exige IP/CIDR explícito e não aceita booleanos, saltos ou rede universal', () => {
  assert.equal(trustedProxy(undefined), false); assert.equal(trustedProxy(''), false);
  assert.deepEqual(trustedProxy('127.0.0.1/32, ::1,127.0.0.1/32'), ['127.0.0.1/32', '::1']);
  for (const value of ['true', 'false', '1', '*', 'loopback', '0.0.0.0/0', '::/0', '127.0.0.1/33', '::1/129', '127.0.0.1,', 'host.invalid', '127.0.0.1/1/2']) assert.throws(() => trustedProxy(value), /TRUST_PROXY_CIDRS/);
});
test('HTTP ignora X-Forwarded-For sem confiança e usa cadeia apenas até proxy confiável', async () => {
  for (const config of [undefined, '127.0.0.1/32']) {
    const app = express(); app.set('trust proxy', trustedProxy(config));
    app.get('/', (req, res) => res.json({ ip: req.ip }));
    const server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.on('listening', resolve));
    try {
      const base = `http://127.0.0.1:${(server.address() as any).port}`;
      const result = await (await fetch(base, { headers: { 'X-Forwarded-For': '198.51.100.99, 192.0.2.10' } })).json();
      assert.equal(result.ip, config ? '192.0.2.10' : '127.0.0.1');
    } finally { server.closeAllConnections(); server.close(); }
  }
});
