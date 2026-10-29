import type { ErrorRequestHandler } from 'express';
import { InputError } from '../validation/input';
import { logOperationalError, operationalErrorCode } from '../observability/errors';

export const apiErrorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  const incidentId = logOperationalError('api', error);
  if (res.headersSent) { res.destroy(); return; }
  const code = operationalErrorCode(error);
  const status = error?.status === 400 ? 400 : error?.status === 413 ? 413 :
    ['23505', '23503'].includes(code) ? 409 : code === '23514' ? 422 : 500;
  res.setHeader('X-Diagnostic-Id', incidentId);
  res.status(status).json({ error: error instanceof InputError ? error.message :
    status === 500 ? 'Falha interna. A operação não foi confirmada.' :
    status === 409 ? 'Conflito com registros existentes. Atualize a tela e confira os vínculos.' : 'Requisição inválida.' });
};
