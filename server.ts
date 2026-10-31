import { trustedProxy } from './server/validation/trustedProxy';
import { httpPort } from './server/validation/httpPort';
import 'dotenv/config';
import 'express-async-errors';
/**
 * DE FARDAS ERP — Full-Stack Server Entry Point
 * Conecta o backend modular Express com PostgreSQL / Data Store e monta o Vite dev server.
 */
import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import type { RawBodyRequest } from './server/middleware/webhookAuth';
import { csrfProtection } from './server/middleware/csrf';
import { authMiddleware } from './server/auth/rbac';
import { authRouter } from './server/routes/authRoutes';
import { quotesRouter } from './server/routes/quotesRoutes';
import { ordersRouter } from './server/routes/ordersRoutes';
import { financeRouter } from './server/routes/financeRoutes';
import { inventoryRouter } from './server/routes/inventoryRoutes';
import { leadsRouter } from './server/routes/leadsRoutes';
import { clientsRouter } from './server/routes/clientsRoutes';
import { auditRouter } from './server/routes/auditRoutes';
import { migrationRouter } from './server/routes/migrationRoutes';
import { communicationRouter } from './server/routes/communicationRoutes';
import { db } from './server/db/connection';
import { pool } from './server/db/index';
import { apiErrorHandler } from './server/middleware/apiErrorHandler';
import { logOperationalError } from './server/observability/errors';
import { settingsRouter } from './server/routes/settingsRoutes';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = httpPort(process.env.PORT);
const isProd = process.env.NODE_ENV === 'production';

async function bootstrap() {
  const proxyTrust = trustedProxy(process.env.TRUST_PROXY_CIDRS);
  await db.ready;
  if (isProd) {
    await pool.query('SELECT key FROM core.public_settings LIMIT 0');
    await pool.query('SELECT kind, value FROM core.number_counters LIMIT 0');
    await pool.query('SELECT token_hash FROM core.password_reset_tokens LIMIT 0');
    await pool.query('SELECT revision FROM producao.production_orders LIMIT 0');
  }
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', proxyTrust);
  app.use('/api', (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.set('X-Content-Type-Options', 'nosniff');
    next();
  });

  // Middlewares básicos
  app.use(express.json({ limit: '10mb', verify: (req: RawBodyRequest, _res, buffer) => {
    if (req.originalUrl?.split('?')[0] === '/api/communication/webhooks/meta') req.rawBody = Buffer.from(buffer);
  } }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(cookieParser());

  // Proteção contra CSRF em todas as rotas da API
  app.use('/api', csrfProtection);

  // Middleware de Autenticação / RBAC em todas as rotas de API
  app.use('/api', authMiddleware);

  // Rotas da API Modular do ERP DE FARDAS
  app.use('/api', settingsRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/quotes', quotesRouter);
  app.use('/api/orders', ordersRouter);
  app.use('/api/finance', financeRouter);
  app.use('/api/inventory', inventoryRouter);
  app.use('/api/leads', leadsRouter);
  app.use('/api/clients', clientsRouter);
  app.use('/api/communication', communicationRouter);
  app.use('/api/audit', auditRouter);
  app.use('/api/migration', migrationRouter);

  // Readiness: consulta real, sem expor contagens ou dados internos.
  app.get('/api/health', async (_req, res) => {
    try {
      await db.getPool()!.query('SELECT 1');
      res.json({ status: 'healthy' });
    } catch {
      res.status(503).json({ status: 'unavailable' });
    }
  });

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Endpoint não encontrado.' });
  });
  app.use('/api', apiErrorHandler);

  // Integração com Vite: Middleware Mode em desenvolvimento
  if (!isProd) {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
    console.log('⚡ [DEV] Vite middlewares integrados ao servidor Express.');
  } else {
    // Modo Produção: Servir build estático de /dist
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 [DE FARDAS ERP] Servidor ouvindo em http://0.0.0.0:${PORT}`);
  });
  const shutdown = () => {
    server.close(() => { void pool.end().then(() => process.exit(0)); });
    setTimeout(() => process.exit(1), 15000).unref();
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}

bootstrap().catch((err) => {
  logOperationalError('startup', err);
  process.exit(1);
});
