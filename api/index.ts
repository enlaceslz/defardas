/**
 * DE FARDAS ERP — Vercel Serverless Function Entry Point
 * Expõe todas as rotas /api/* da aplicação Express no runtime Node.js da Vercel,
 * eliminando o erro HTTP 405 causado por rewrites para o index.html estático.
 */
import { createApiApp } from '../server/app';

const app = createApiApp();

export default app;
