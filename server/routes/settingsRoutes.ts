import { Router } from 'express';
import { query } from '../db/index';
import { atomic } from '../db/unitOfWork';
import { requireRole, type RequestWithUser } from '../auth/rbac';
import { auditService } from '../services/auditService';
import { text, number } from '../validation/input';
import { db } from '../db/connection';
export const settingsRouter = Router();
const persistent = () => Boolean(process.env.DATABASE_URL) || process.env.NODE_ENV === 'production';
settingsRouter.get('/public-config', async (_req, res) => {
  const profile = persistent() ? (await query('SELECT value FROM core.public_settings WHERE key=$1', ['company_profile'])).rows[0]?.value : db.publicSettings.get('company_profile');
  res.json({ profile: profile || null });
});
settingsRouter.put('/settings/profile', requireRole(['admin']), atomic(async (req: RequestWithUser, res) => {
  const body = req.body || {};
  const profile: Record<string, string | number> = {};
  for (const key of ['name', 'tradeName', 'cnpj', 'ie', 'phone', 'whatsapp', 'email', 'address', 'neighborhood', 'city', 'state', 'cep', 'openingHours']) {
    profile[key] = text(body[key], key, key === 'state' ? 2 : 250, ['name', 'tradeName'].includes(key));
  }
  profile.foundedYear = number(body.foundedYear, 'Ano de fundação', 0, true);
  profile.productionCapacityPiecesMonth = number(body.productionCapacityPiecesMonth, 'Capacidade mensal', 0, true);
  if (persistent()) await query(`INSERT INTO core.public_settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=NOW()`, ['company_profile', JSON.stringify(profile)]);
  else db.publicSettings.set('company_profile', profile);
  await auditService.log({ actorId: req.user!.id, actorName: req.user!.fullName, actorRole: req.user!.role,
    entityName: 'core.public_settings', entityId: 'company_profile', action: 'UPDATE_COMPANY_PROFILE' });
  res.json(profile);
}));
