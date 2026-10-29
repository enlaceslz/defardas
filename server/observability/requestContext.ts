import type { Request } from 'express';

// Somente o template registrado pelo servidor; nunca URL, params, query, corpo ou headers.
// Antes de resolver a rota, usar marcador fixo em vez de reconstruir caminho do cliente.
export function securityRequestContext(req: Request) {
  const route = typeof req.route?.path === 'string' ? req.route.path.slice(0, 200) : 'protected-resource';
  const method = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].includes(req.method) ? req.method : 'OTHER';
  return { route, method };
}
