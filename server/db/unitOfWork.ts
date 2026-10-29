import type { RequestHandler, Response } from 'express';
import { db } from './connection';
import { withPgTransaction } from './index';

let memoryQueue: Promise<void> = Promise.resolve();
const memoryCollections = ['clients', 'leads', 'quotes', 'orders', 'finance', 'financeRequests', 'inventory', 'movements', 'channels', 'conversations', 'messages', 'publicSettings'] as const;

export async function unitOfWork<T>(operation: () => Promise<T>): Promise<T> {
  await db.ready;
  if (db.isConnected()) return withPgTransaction(operation);
  if (process.env.NODE_ENV === 'production' || process.env.DATABASE_URL) throw new Error('PostgreSQL indisponível.');
  // Demonstração local: mesmas garantias de serialização e rollback dos agregados.
  const previous = memoryQueue;
  let release!: () => void;
  memoryQueue = new Promise<void>((resolve) => { release = resolve; });
  await previous;
  const snapshots = memoryCollections.map((key) => structuredClone(db[key]));
  try { return await operation(); }
  catch (error) {
    memoryCollections.forEach((key, index) => {
      db[key].clear();
      for (const [id, value] of snapshots[index]) (db[key] as Map<string, any>).set(id, value);
    });
    throw error;
  } finally { release(); }
}

class RejectedResponse extends Error {}
class AuditedRejection extends Error {
  constructor(readonly status: number, readonly body: unknown, readonly audit: () => Promise<unknown>) {
    super('Operação rejeitada com auditoria após rollback.');
  }
}
// O callback interno deve somente registrar a tentativa, nunca reaplicar a operação rejeitada.
export function rejectWithAudit(status: number, body: unknown, audit: () => Promise<unknown>): never {
  if (!Number.isInteger(status) || status < 400 || status >= 500) throw new Error('Status de rejeição inválido.');
  throw new AuditedRejection(status, body, audit);
}
// Bufferiza somente a resposta JSON; nenhum sucesso sai antes do COMMIT.
export function atomic(handler: RequestHandler): RequestHandler {
  return async (req, res, next) => {
    let body: any;
    let status = 200;
    let responded = false;
    let proxy: Response;
    proxy = new Proxy(res, {
      get(target, property) {
        if (property === 'status') return (code: number) => { status = code; return proxy; };
        if (property === 'json') return (payload: any) => { body = payload; responded = true; return proxy; };
        const value = Reflect.get(target, property);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    try {
      await unitOfWork(async () => {
        await handler(req, proxy, next);
        if (!responded) throw new Error('Operação atômica sem resposta JSON.');
        if (status >= 400) throw new RejectedResponse();
      });
      res.status(status).json(body);
    } catch (error) {
      if (error instanceof AuditedRejection) {
        try {
          // A UoW anterior já fez rollback e liberou cliente/lock antes de iniciar esta.
          await unitOfWork(error.audit);
          res.status(error.status).json(error.body);
        } catch (auditError) { next(auditError); }
      } else if (error instanceof RejectedResponse) res.status(status).json(body);
      else next(error);
    }
  };
}
