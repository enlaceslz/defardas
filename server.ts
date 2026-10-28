/**
 * DE FARDAS ERP — Full-Stack Server Entry Point
 * Conecta o backend modular Express com PostgreSQL / Data Store e monta o Vite dev server.
 */
import express from 'express';
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = parseInt(process.env.PORT || '3000', 10);
const isProd = process.env.NODE_ENV === 'production';

async function bootstrap() {
  const app = express();

  // Middlewares básicos
  app.use(express.json({ limit: '10mb' }));
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
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'healthy',
      app: 'DE FARDAS ERP & PCP Industrial',
      version: '1.6.0-P0',
      database: {
        type: 'PostgreSQL',
        connectedToRemote: db.isConnected(),
        mode: db.isConnected() ? 'PostgreSQL Pool Ativo' : 'Transacional Resiliente',
      },
      counts: {
        clients: db.clients.size,
        leads: db.leads.size,
        quotes: db.quotes.size,
        orders: db.orders.size,
        finance: db.finance.size,
        inventory: db.inventory.size,
      },
      timestamp: new Date().toISOString(),
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
