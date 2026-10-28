import crypto from 'node:crypto';
import type { RequestHandler, Request } from 'express';

export type RawBodyRequest = Request & { rawBody?: Buffer };
export const verifyMetaWebhook: RequestHandler = (req: RawBodyRequest, res, next) => {
  const secret = process.env.META_WA_APP_SECRET;
  if (!secret) return res.status(503).json({ error: 'Webhook Meta não configurado.' });
  const signature = req.get('x-hub-signature-256') || '';
  const expected = `sha256=${crypto.createHmac('sha256', secret).update(req.rawBody || Buffer.alloc(0)).digest('hex')}`;
  const provided = Buffer.from(signature);
  const calculated = Buffer.from(expected);
  if (!req.rawBody || provided.length !== calculated.length || !crypto.timingSafeEqual(provided, calculated)) {
    return res.status(401).json({ error: 'Assinatura de webhook inválida.' });
  }
  next();
};

export const verifyWaAkgWebhook: RequestHandler = (req, res, next) => {
  const secret = process.env.WA_AKG_WEBHOOK_SECRET;
  if (!secret) return res.status(503).json({ error: 'Webhook WA-AKG não configurado.' });
  const provided = Buffer.from(req.get('x-webhook-secret') || '');
  const expected = Buffer.from(secret);
  if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
    return res.status(401).json({ error: 'Credencial de webhook inválida.' });
  }
  next();
};
