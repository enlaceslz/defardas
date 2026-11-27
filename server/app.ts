/**
 * DE FARDAS ERP — Express API Application Factory
 * Compartilhada entre o servidor Express completo (server.ts / Docker / Local)
 * e a Serverless Function da Vercel (api/index.ts), sem importar Vite.
 */
import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import { csrfProtection } from './middleware/csrf';
import { authMiddleware } from './auth/rbac';
import { authRouter } from './routes/authRoutes';
import { quotesRouter } from './routes/quotesRoutes';
import { ordersRouter } from './routes/ordersRoutes';
import { financeRouter } from './routes/financeRoutes';
import { inventoryRouter } from './routes/inventoryRoutes';
import { leadsRouter } from './routes/leadsRoutes';
import { clientsRouter } from './routes/clientsRoutes';
import { auditRouter } from './routes/auditRoutes';
import { migrationRouter } from './routes/migrationRoutes';
import { communicationRouter } from './routes/communicationRoutes';
import { lookupRouter } from './routes/lookupRoutes';
import { partnersRouter } from './routes/partnersRoutes';
import { suppliersRouter } from './routes/suppliersRoutes';
import { notificationsRouter } from './routes/notificationsRoutes';
import { reportsRouter } from './routes/reportsRoutes';
import { locationsRouter } from './routes/locationsRoutes';
import { db } from './db/connection';
import {
  clientRepository,
  leadRepository,
  quoteRepository,
  orderRepository,
  financeRepository,
  inventoryRepository,
  partnerRepository,
  supplierRepository,
} from './repositories/index';

export function createApiApp(): express.Express {
  const app = express();
  const isProd = process.env.NODE_ENV === 'production';

  // Confiar no primeiro proxy reverso (Vercel / Docker / Nginx / Cloud Run) para req.ip e cookies seguros
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  // Cabeçalhos defensivos de segurança HTTP (compatíveis com iframe preview)
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self)');
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

  // Garante inicialização do pool PostgreSQL antes da primeira requisição (essencial em cold starts serverless)
  app.use('/api', async (_req: Request, _res: Response, next: NextFunction) => {
    try {
      await db.ensureReady();
      next();
    } catch (err) {
      next(err);
    }
  });

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
  app.use('/api/lookups', lookupRouter);
  app.use('/api/partners', partnersRouter);
  app.use('/api/suppliers', suppliersRouter);
  app.use('/api/notifications', notificationsRouter);
  app.use('/api/reports', reportsRouter);
  app.use('/api/locations', locationsRouter);

  // Endpoint de Saúde e Diagnóstico da Fundação
  app.get('/api/health', async (_req: Request, res: Response) => {
    try {
      await db.ensureReady();
      const [clientsList, leadsList, quotesList, ordersList, financeList, inventoryList, partnersList, suppliersList, purchaseOrdersList] =
        await Promise.all([
          clientRepository.findAll(),
          leadRepository.findAll(),
          quoteRepository.findAll(),
          orderRepository.findAll(),
          financeRepository.findAll(),
          inventoryRepository.findAllItems(),
          partnerRepository.findAll(),
          supplierRepository.findAll(),
          supplierRepository.findAllPurchaseOrders(),
        ]);

      res.json({
        status: isProd && !db.isConnected() ? 'degraded' : 'healthy',
        app: 'DE FARDAS ERP & PCP Industrial',
        version: '1.6.1',
        runtime: process.env.VERCEL ? 'vercel-serverless' : 'node-server',
        database: {
          type: 'PostgreSQL',
          connectedToRemote: db.isConnected(),
          mode: db.isConnected()
            ? 'PostgreSQL Pool Ativo (Drizzle ORM)'
            : isProd
              ? 'PostgreSQL Desconectado (Configure DATABASE_URL)'
              : 'Transacional Resiliente (Dev)',
        },
        counts: {
          clients: clientsList.length,
          leads: leadsList.length,
          quotes: quotesList.length,
          orders: ordersList.length,
          finance: financeList.length,
          inventory: inventoryList.length,
          partners: partnersList.length,
          suppliers: suppliersList.length,
          purchaseOrders: purchaseOrdersList.length,
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

  // Fallback JSON 404 para endpoints de API inexistentes
  app.use('/api', (_req: Request, res: Response) => {
    res.status(404).json({
      error: 'Endpoint da API não encontrado.',
      code: 'API_NOT_FOUND',
    });
  });

  // Tratamento centralizado de erros na API (evita vazamento de stack traces em produção)
  app.use('/api', (err: any, _req: Request, res: Response, _next: NextFunction) => {
    console.error('❌ [API ERROR]', err);
    const statusCode = err.status || err.statusCode || 500;
    res.status(statusCode).json({
      error:
        isProd && statusCode >= 500
          ? 'Erro interno no servidor DE FARDAS ERP.'
          : err.message || 'Erro inesperado ao processar requisição.',
      code: err.code || 'INTERNAL_SERVER_ERROR',
    });
  });

  return app;
}
