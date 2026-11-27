/**
 * DE FARDAS ERP — Locations, Routing & Shareable Map Links Routes
 * Endpoints públicos somente leitura para links ?mapa=<token>, roteamento OSRM
 * e geocodificação de origem, além de rotas autenticadas para criar/gerenciar links.
 */
import { Router, Request, Response } from 'express';
import { RequestWithUser, requireAuth } from '../auth/rbac';
import { isValidLatLng } from '../services/addressMetadataService';
import { publicLocationRateLimiter } from '../middleware/rateLimiter';
import {
  locationShareService,
  sanitizeLocationSharePayload,
} from '../services/locationShareService';
import { geocodeBrazilianAddress } from './lookupRoutes';

export const locationsRouter = Router();

function computeHaversineMeters(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number
): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(toLat - fromLat);
  const dLng = toRad(toLng - fromLng);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(fromLat)) * Math.cos(toRad(toLat)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

function formatOsrmInstruction(step: any): string {
  const type = String(step?.maneuver?.type || '');
  const modifier = String(step?.maneuver?.modifier || '');
  const road = String(step?.name || '').trim();
  const roadSuffix = road ? ` em ${road}` : '';

  const modMap: Record<string, string> = {
    left: 'à esquerda',
    'sharp left': 'acentuada à esquerda',
    'slight left': 'leve à esquerda',
    right: 'à direita',
    'sharp right': 'acentuada à direita',
    'slight right': 'leve à direita',
    straight: 'em frente',
    uturn: 'retorno',
  };
  const dir = modMap[modifier] || '';

  switch (type) {
    case 'depart':
      return `Siga${dir ? ` ${dir}` : ''}${roadSuffix}`;
    case 'arrive':
      return `Você chegou ao destino${roadSuffix}`;
    case 'roundabout':
    case 'rotary':
      return `Na rotatória, pegue a saída${road ? ` para ${road}` : ''}`;
    case 'merge':
      return `Entre na via${roadSuffix}`;
    case 'fork':
      return `Na bifurcação, mantenha-se ${dir || 'na faixa'}${roadSuffix}`;
    case 'end of road':
      return `No fim da rua, vire ${dir || 'na transversal'}${roadSuffix}`;
    case 'turn':
      return `Vire ${dir || 'na esquina'}${roadSuffix}`;
    case 'new name':
    case 'continue':
      return `Continue ${dir || 'em frente'}${roadSuffix}`;
    default:
      return road ? `Siga por ${road}` : 'Siga pelo trajeto indicado';
  }
}

// ==============================================================================
// 1. Rotas Públicas Somente Leitura (?mapa=<token> + Roteamento + Origem CEP)
// ==============================================================================

locationsRouter.get('/share/:token', async (req: Request, res: Response) => {
  try {
    const result = await locationShareService.getShareByToken(String(req.params.token || ''));

    if (result.status === 'not_found') {
      return res.status(404).json({
        error: 'Link de localização não encontrado ou inválido.',
        code: 'LOCATION_SHARE_NOT_FOUND',
      });
    }

    if (result.status === 'revoked') {
      return res.status(410).json({
        error: 'Este link de localização foi revogado pelo emissor ou administrador.',
        code: 'LOCATION_SHARE_REVOKED',
        revokedAt: result.revokedAt,
      });
    }

    if (result.status === 'expired') {
      return res.status(410).json({
        error: 'Este link de localização expirou. Solicite um novo compartilhamento no ERP DE FARDAS.',
        code: 'LOCATION_SHARE_EXPIRED',
        expiresAt: result.expiresAt,
      });
    }

    const { record } = result;
    return res.json({
      locationCode: record.locationCode,
      entityType: record.entityType,
      createdAt: record.createdAt,
      expiresAt: record.expiresAt,
      createdByName: record.createdByName,
      accessCount: record.accessCount,
      location: record.location,
    });
  } catch (err: any) {
    return res.status(500).json({
      error: err?.message || 'Erro ao carregar localização compartilhada.',
    });
  }
});

// GET /api/locations/route?fromLat=...&fromLng=...&toLat=...&toLng=...
locationsRouter.get('/route', publicLocationRateLimiter, async (req: Request, res: Response) => {
  const fromLat = Number(req.query.fromLat);
  const fromLng = Number(req.query.fromLng);
  const toLat = Number(req.query.toLat);
  const toLng = Number(req.query.toLng);

  if (!isValidLatLng(fromLat, fromLng) || !isValidLatLng(toLat, toLng)) {
    return res.status(400).json({
      error: 'Coordenadas de origem e destino inválidas para cálculo de rota.',
      code: 'INVALID_ROUTE_COORDINATES',
    });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?overview=full&geometries=geojson&steps=true`;
    const osrmRes = await fetch(osrmUrl, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'DE-FARDAS-ERP/1.6 (contato@defardas.com.br)',
      },
    });
    if (osrmRes.ok) {
      const data: any = await osrmRes.json();
      const route = Array.isArray(data?.routes) ? data.routes[0] : null;
      if (route && Array.isArray(route.geometry?.coordinates)) {
        const geometry: Array<[number, number]> = route.geometry.coordinates
          .map((coord: any) => [Number(coord[1]), Number(coord[0])] as [number, number])
          .filter(([lat, lng]: [number, number]) => isValidLatLng(lat, lng));

        const rawSteps: any[] = Array.isArray(route.legs?.[0]?.steps) ? route.legs[0].steps : [];
        const steps = rawSteps.slice(0, 60).map((s: any) => ({
          instruction: formatOsrmInstruction(s),
          distanceMeters: Math.round(Number(s.distance || 0)),
          durationSeconds: Math.round(Number(s.duration || 0)),
          name: typeof s.name === 'string' && s.name.trim() ? s.name.trim() : undefined,
        }));

        return res.json({
          distanceMeters: Math.round(Number(route.distance || 0)),
          durationSeconds: Math.round(Number(route.duration || 0)),
          geometry,
          steps,
          source: 'OSRM',
        });
      }
    }
  } catch {
    // Fallback para Haversine
  } finally {
    clearTimeout(timer);
  }

  const straightMeters = computeHaversineMeters(fromLat, fromLng, toLat, toLng);
  // Estimativa conservadora urbana (30 km/h ~ 8.33 m/s) em linha reta caso OSRM falhe
  const estimatedSeconds = Math.max(60, Math.round(straightMeters / 8.33));

  return res.json({
    distanceMeters: straightMeters,
    durationSeconds: estimatedSeconds,
    geometry: [
      [fromLat, fromLng],
      [toLat, toLng],
    ],
    steps: [
      {
        instruction: 'Trajeto direto estimado entre origem e destino (roteador viário indisponível no momento)',
        distanceMeters: straightMeters,
        durationSeconds: estimatedSeconds,
      },
    ],
    source: 'Haversine',
  });
});

// GET /api/locations/public-geocode?cep=...&number=...&q=...
locationsRouter.get('/public-geocode', publicLocationRateLimiter, async (req: Request, res: Response) => {
  const cep = typeof req.query.cep === 'string' ? req.query.cep.trim().slice(0, 12) : undefined;
  const number = typeof req.query.number === 'string' ? req.query.number.trim().slice(0, 20) : undefined;
  const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 160) : undefined;

  if (!cep && !q) {
    return res.status(400).json({
      error: 'Informe um CEP ou endereço de partida para traçar a rota.',
      code: 'ORIGIN_QUERY_REQUIRED',
    });
  }

  // Extrai CEP (ex: "65075-441", "65075-441, 100", "CEP 65075-441 nº 100") e eventual número
  let resolvedCep = cep;
  let resolvedNumber = number;
  let remainingQuery = q;

  if (!resolvedCep && q) {
    const cepMatch = q.match(/\b(\d{5})-?(\d{3})\b/);
    if (cepMatch) {
      resolvedCep = `${cepMatch[1]}${cepMatch[2]}`;
      const afterRemoval = q
        .replace(cepMatch[0], ' ')
        .replace(/\bcep\b/gi, ' ')
        .replace(/\bn[º°o.]?\b/gi, ' ')
        .replace(/[,;:\-]+/g, ' ')
        .trim();
      if (!resolvedNumber && afterRemoval && /^\d+[a-zA-Z0-9\-\/]*$/i.test(afterRemoval)) {
        resolvedNumber = afterRemoval.slice(0, 20);
        remainingQuery = undefined;
      } else if (!afterRemoval) {
        remainingQuery = undefined;
      } else {
        remainingQuery = afterRemoval;
      }
    }
  }

  const geo = await geocodeBrazilianAddress({
    cep: resolvedCep,
    number: resolvedNumber,
    q: resolvedCep ? undefined : remainingQuery,
  });

  if (!geo) {
    return res.status(404).json({
      error: 'Não foi possível localizar o endereço de partida informado.',
      code: 'ORIGIN_GEOCODE_NOT_FOUND',
    });
  }

  return res.json(geo);
});

// ==============================================================================
// 2. Rotas Autenticadas (Geração, Listagem e Revogação de Links de Mapa)
// ==============================================================================
locationsRouter.use(requireAuth);

locationsRouter.post('/share', async (req: RequestWithUser, res: Response) => {
  const actor = req.user!;
  const ip = req.ip || req.socket.remoteAddress || 'unknown';

  try {
    const sanitized = sanitizeLocationSharePayload(req.body?.location);
    const expiresInHours = Number(req.body?.expiresInHours || 168);
    const recipientLabel =
      typeof req.body?.recipientLabel === 'string' ? req.body.recipientLabel : undefined;

    const created = await locationShareService.createShare({
      location: sanitized,
      actor,
      expiresInHours,
      recipientLabel,
      ipAddress: ip,
    });

    return res.status(201).json({
      success: true,
      ...created,
    });
  } catch (err: any) {
    return res.status(400).json({
      error: err?.message || 'Não foi possível gerar o link compartilhável da localização.',
    });
  }
});

locationsRouter.get('/shares', async (req: RequestWithUser, res: Response) => {
  const actor = req.user!;
  const list = await locationShareService.listSharesForActor(actor);
  return res.json(list);
});

locationsRouter.delete('/share/:id', async (req: RequestWithUser, res: Response) => {
  const actor = req.user!;
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const result = await locationShareService.revokeShare(String(req.params.id || ''), actor, ip);
  if (!result.ok) {
    return res.status(result.status).json({ error: result.error });
  }
  return res.json({ success: true, message: 'Link de localização revogado com sucesso.' });
});
