/**
 * DE FARDAS ERP — Full-Stack Server Entry Point
 * Conecta o backend modular Express com PostgreSQL / Drizzle ORM e monta o Vite dev server.
 */
import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
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
import {
  clientRepository,
  leadRepository,
  quoteRepository,
  orderRepository,
  financeRepository,
  inventoryRepository,
} from './server/repositories/index';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = parseInt(process.env.PORT || '3000', 10);
const isProd = process.env.NODE_ENV === 'production';

async function bootstrap() {
  const app = express();

  // Confiar no primeiro proxy reverso (Docker/Nginx/Cloud Run) para req.ip e cookies seguros
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  // Cabeçalhos defensivos de segurança HTTP (compatíveis com iframe preview)
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
  });

  // Middlewares básicos (preserva rawBody para verificação HMAC de webhooks)
  app.use(
    express.json({
      limit: '10mb',
      verify: (req: any, _res, buf) => {
        req.rawBody = buf;
      },
    })
  );
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(cookieParser());

  // Proteção contra CSRF em todas as rotas da API
  app.use('/api', csrfProtection);

  // Middleware de Autenticação / RBAC em todas as rotas de API
  app.use('/api', authMiddleware);

  // Rotas da API Modular do ERP DE FARDAS
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

  // Endpoint de Saúde e Diagnóstico da Fundação
  app.get('/api/health', async (_req: Request, res: Response) => {
    try {
      const [clientsList, leadsList, quotesList, ordersList, financeList, inventoryList] =
        await Promise.all([
          clientRepository.findAll(),
          leadRepository.findAll(),
          quoteRepository.findAll(),
          orderRepository.findAll(),
          financeRepository.findAll(),
          inventoryRepository.findAllItems(),
        ]);

      res.json({
        status: 'healthy',
        app: 'DE FARDAS ERP & PCP Industrial',
        version: '1.6.1',
        database: {
          type: 'PostgreSQL',
          connectedToRemote: db.isConnected(),
          mode: db.isConnected() ? 'PostgreSQL Pool Ativo (Drizzle ORM)' : 'Transacional Resiliente (Dev)',
        },
        counts: {
          clients: clientsList.length,
          leads: leadsList.length,
          quotes: quotesList.length,
          orders: ordersList.length,
          finance: financeList.length,
          inventory: inventoryList.length,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      res.status(503).json({
        status: 'degraded',
        error: isProd ? 'Erro ao verificar saúde do banco de dados.' : err.message,
        timestamp: new Date().toISOString(),
      });
    }
  });

  // Tratamento centralizado de erros na API (evita vazamento de stack traces em produção)
  app.use('/api', (err: any, _req: Request, res: Response, _next: NextFunction) => {
    console.error('❌ [API ERROR]', err);
    const statusCode = err.status || err.statusCode || 500;
    res.status(statusCode).json({
      error: isProd && statusCode >= 500
        ? 'Erro interno no servidor DE FARDAS ERP.'
        : err.message || 'Erro inesperado ao processar requisição.',
      code: err.code || 'INTERNAL_SERVER_ERROR',
    });
  });

  // Integração com Vite: Middleware Mode em desenvolvimento
  if (!isProd) {
    const vite = await createViteServer({
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

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 [DE FARDAS ERP] Servidor ouvindo em http://0.0.0.0:${PORT}`);
  });
}

bootstrap().catch((err) => {
  console.error('❌ Falha fatal ao iniciar o servidor DE FARDAS ERP:', err);
  process.exit(1);
});
