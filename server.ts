/**
 * DE FARDAS ERP — Full-Stack Server Entry Point
 * Conecta o backend modular Express com PostgreSQL / Drizzle ORM e monta o Vite dev server.
 */
import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { createApiApp } from './server/app';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = parseInt(process.env.PORT || '3000', 10);
const isProd = process.env.NODE_ENV === 'production';

async function bootstrap() {
  const app = createApiApp();

  // Integração com Vite: Middleware Mode em desenvolvimento
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true, allowedHosts: true },
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
