/**
 * DE FARDAS ERP — Communication & WhatsApp Routes
 * Endpoints para central de atendimento omnichannel, canais Meta Cloud API / WA-AKG e webhooks assinados.
 */
import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { RequestWithUser, requireAuth, requirePermission } from '../auth/rbac';
import { communicationRepository } from '../repositories/communicationRepository';
import { whatsAppService } from '../services/whatsappService';
import { auditService } from '../services/auditService';

export const communicationRouter = Router();
const isProd = process.env.NODE_ENV === 'production';

const ALLOWED_MESSAGE_TYPES = new Set(['text', 'image', 'document', 'template']);
const ALLOWED_STATUSES = new Set(['open', 'pending', 'resolved', 'closed']);

function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function escapeXml(text: string): string {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function isSafeMediaUrl(url: string): boolean {
  const trimmed = url.trim();
  return (
    trimmed.startsWith('https://') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('s3://') ||
    trimmed.startsWith('/uploads/')
  );
}

// ==============================================================================
// 1. Webhooks Públicos (Isentos de sessão/CSRF — protegidos por assinatura/chave)
// ==============================================================================

// Verificação do Webhook da Meta WhatsApp Cloud API
communicationRouter.get('/webhooks/meta', (req: Request, res: Response) => {
  const mode = String(req.query['hub.mode'] || '');
  const token = String(req.query['hub.verify_token'] || '');
  const challenge = String(req.query['hub.challenge'] || '');

  const configuredToken = process.env.META_WA_WEBHOOK_VERIFY_TOKEN;
  if (isProd && !configuredToken) {
    return res.status(503).json({
      error: 'META_WA_WEBHOOK_VERIFY_TOKEN não configurado em produção.',
      code: 'WEBHOOK_NOT_CONFIGURED',
    });
  }

  const verifyToken = configuredToken || 'defardas_wa_webhook_secret_2026';

  if (mode === 'subscribe' && token && safeCompare(token, verifyToken)) {
    console.log('✅ [WhatsApp Webhook] Meta Cloud API verificado com sucesso.');
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

// Recebimento de mensagens e status da Meta WhatsApp Cloud API
communicationRouter.post('/webhooks/meta', async (req: Request, res: Response) => {
  try {
    const appSecret = process.env.META_WA_APP_SECRET;
    if (isProd && !appSecret) {
      return res.status(503).json({
        error: 'META_WA_APP_SECRET obrigatório em produção para validação HMAC-SHA256.',
        code: 'WEBHOOK_SECRET_MISSING',
      });
    }

    if (appSecret) {
      const signature = req.headers['x-hub-signature-256'] as string | undefined;
      const rawBody: Buffer | undefined = (req as any).rawBody;
      if (!signature || !rawBody) {
        return res.status(401).json({ error: 'Assinatura X-Hub-Signature-256 ausente.' });
      }
      const expected = `sha256=${crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex')}`;
      if (!safeCompare(signature, expected)) {
        return res.status(401).json({ error: 'Assinatura do webhook Meta inválida.' });
      }
    }

    const body = req.body;
    if (body?.object === 'whatsapp_business_account') {
      const entries = Array.isArray(body.entry) ? body.entry : [];
      for (const entry of entries) {
        const changes = Array.isArray(entry.changes) ? entry.changes : [];
        for (const change of changes) {
          const value = change?.value;

          // 1a. Mensagens recebidas (idempotentes por msg.id)
          if (Array.isArray(value?.messages)) {
            for (const msg of value.messages) {
              const fromPhone = String(msg.from || '').trim();
              if (!fromPhone) continue;
              const textBody =
                msg.text?.body ||
                msg.image?.caption ||
                msg.document?.caption ||
                (msg.button?.text ? `[Botão] ${msg.button.text}` : '[Mídia recebida]');
              const contactMatch = Array.isArray(value.contacts)
                ? value.contacts.find((c: any) => c.wa_id === fromPhone) || value.contacts[0]
                : undefined;
              const contactName = contactMatch?.profile?.name || fromPhone;

              await whatsAppService.handleInboundMessage({
                provider: 'meta_cloud',
                fromPhone,
                fromName: contactName,
                body: textBody,
                externalId: msg.id,
              });
            }
          }

          // 1b. Atualizações de status de entrega/leitura (sent / delivered / read / failed)
          if (Array.isArray(value?.statuses)) {
            for (const st of value.statuses) {
              if (st?.id && ['sent', 'delivered', 'read', 'failed'].includes(st.status)) {
                const errDetail = st.errors?.[0]?.title || st.errors?.[0]?.message;
                await whatsAppService.handleDeliveryStatusUpdate(st.id, st.status, errDetail);
              }
            }
          }
        }
      }
    }

    return res.sendStatus(200);
  } catch (err: any) {
    console.error('❌ [WhatsApp Webhook] Erro ao processar webhook Meta:', err);
    return res.sendStatus(500);
  }
});

// Recebimento de mensagens do container isolado WA-AKG
communicationRouter.post('/webhooks/wa-akg', async (req: Request, res: Response) => {
  try {
    const configuredKey = process.env.WA_AKG_API_KEY;
    if (isProd && !configuredKey) {
      return res.status(503).json({
        error: 'WA_AKG_API_KEY obrigatório em produção.',
        code: 'WA_AKG_KEY_MISSING',
      });
    }

    if (configuredKey) {
      const providedKey = String(req.headers['x-api-key'] || req.headers['apikey'] || '');
      if (!providedKey || !safeCompare(providedKey, configuredKey)) {
        return res.status(401).json({ error: 'Chave de API WA-AKG inválida ou ausente.' });
      }
    }

    const { from, senderName, text, id, mediaUrl, mediaType } = req.body || {};
    const bodyText = String(text || '').trim() || (mediaUrl ? '[Mídia recebida]' : '');
    if (from && bodyText) {
      await whatsAppService.handleInboundMessage({
        provider: 'wa_akg',
        fromPhone: String(from),
        fromName: String(senderName || from),
        body: bodyText,
        externalId: id ? String(id) : undefined,
        mediaUrl: typeof mediaUrl === 'string' && isSafeMediaUrl(mediaUrl) ? mediaUrl : undefined,
        mediaMimeType: typeof mediaType === 'string' ? mediaType : undefined,
      });
    }
    return res.json({ success: true });
  } catch (err: any) {
    console.error('❌ [WhatsApp Webhook] Erro ao processar webhook WA-AKG:', err);
    return res.status(500).json({ error: 'Falha no processamento' });
  }
});

// ==============================================================================
// 2. Endpoints Autenticados + RBAC da Central de Atendimento Omnichannel
// ==============================================================================
communicationRouter.use(requireAuth);
communicationRouter.use(requirePermission('communication:view'));

// Listar canais configurados
communicationRouter.get('/channels', async (_req: RequestWithUser, res: Response) => {
  const channelsList = await communicationRepository.findAllChannels();
  res.json(channelsList);
});

// Obter QR code atualizado para o canal WA-AKG (sem vazar IDs a serviços externos)
communicationRouter.get('/channels/:id/qr', async (req: RequestWithUser, res: Response) => {
  const channel = await communicationRepository.findChannelById(req.params.id);
  if (!channel) {
    return res.status(404).json({ error: 'Canal não encontrado' });
  }

  let qrCode = channel.qrCode;
  let mode: 'live' | 'simulated' = qrCode ? 'live' : 'simulated';

  // Se houver endpoint WA-AKG configurado, tenta obter QR code em tempo real do container
  if (!qrCode && channel.provider === 'wa_akg' && process.env.WA_AKG_ENDPOINT) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4000);
      const qrRes = await fetch(`${process.env.WA_AKG_ENDPOINT}/instance/qr`, {
        signal: controller.signal,
        headers: { apikey: process.env.WA_AKG_API_KEY || '' },
      });
      clearTimeout(timer);
      if (qrRes.ok) {
        const payload = await qrRes.json().catch(() => null);
        if (payload?.qrCode && typeof payload.qrCode === 'string') {
          qrCode = payload.qrCode;
          mode = 'live';
        }
      }
    } catch {
      // Fallback seguro local sem expor dados a terceiros
    }
  }

  if (!qrCode) {
    const safePhone = escapeXml(channel.phoneNumber || 'WhatsApp ERP');
    const safeStatus = escapeXml(channel.status === 'connected' ? 'SESSÃO CONECTADA' : 'AGUARDANDO PAREAMENTO');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240">
      <rect width="240" height="240" rx="16" fill="#f8fafc"/>
      <rect x="20" y="20" width="56" height="56" rx="6" fill="none" stroke="#0f172a" stroke-width="8"/>
      <rect x="34" y="34" width="28" height="28" rx="2" fill="#0f172a"/>
      <rect x="164" y="20" width="56" height="56" rx="6" fill="none" stroke="#0f172a" stroke-width="8"/>
      <rect x="178" y="34" width="28" height="28" rx="2" fill="#0f172a"/>
      <rect x="20" y="164" width="56" height="56" rx="6" fill="none" stroke="#0f172a" stroke-width="8"/>
      <rect x="34" y="178" width="28" height="28" rx="2" fill="#0f172a"/>
      <rect x="96" y="32" width="14" height="14" fill="#1e293b"/>
      <rect x="122" y="32" width="14" height="14" fill="#1e293b"/>
      <rect x="108" y="54" width="18" height="14" fill="#1e293b"/>
      <rect x="32" y="98" width="14" height="14" fill="#1e293b"/>
      <rect x="58" y="114" width="14" height="14" fill="#1e293b"/>
      <rect x="168" y="102" width="14" height="14" fill="#1e293b"/>
      <rect x="196" y="122" width="14" height="14" fill="#1e293b"/>
      <rect x="106" y="174" width="16" height="16" fill="#1e293b"/>
      <rect x="142" y="174" width="16" height="16" fill="#1e293b"/>
      <rect x="174" y="174" width="24" height="24" fill="#1e293b"/>
      <rect x="78" y="88" width="84" height="64" rx="10" fill="#ffffff" stroke="#cbd5e1" stroke-width="2"/>
      <text x="120" y="112" text-anchor="middle" fill="#1d4ed8" font-family="sans-serif" font-weight="700" font-size="11">WA-AKG</text>
      <text x="120" y="128" text-anchor="middle" fill="#0f172a" font-family="monospace" font-size="9">${safeStatus}</text>
      <text x="120" y="142" text-anchor="middle" fill="#475569" font-family="monospace" font-size="8">${safePhone}</text>
    </svg>`;
    qrCode = `data:image/svg+xml;base64,${Buffer.from(svg, 'utf-8').toString('base64')}`;
  }

  return res.json({
    channelId: channel.id,
    status: channel.status,
    mode,
    qrCode,
  });
});

// Solicitar reconexão de canal (restrito a Admin / Gerente Comercial)
communicationRouter.post(
  '/channels/:id/reconnect',
  requirePermission('communication:manage_channels'),
  async (req: RequestWithUser, res: Response) => {
    const actor = req.user!;
    const channel = await communicationRepository.findChannelById(req.params.id);
    if (!channel) {
      return res.status(404).json({ error: 'Canal não encontrado' });
    }

    channel.status = 'connecting';
    channel.updatedAt = new Date().toISOString();
    await communicationRepository.saveChannel(channel);

    auditService.log({
      actorId: actor.id,
      actorName: actor.fullName,
      actorRole: actor.role,
      entityName: 'communication.channels',
      entityId: channel.id,
      action: 'RECONNECT_WHATSAPP_CHANNEL',
      notes: `Reconexão solicitada para o canal ${channel.channelName} (${channel.provider}).`,
    });

    setTimeout(async () => {
      try {
        channel.status = 'connected';
        channel.updatedAt = new Date().toISOString();
        await communicationRepository.saveChannel(channel);
      } catch (err) {
        console.error('Erro ao finalizar reconexão do canal:', err);
      }
    }, 1500);

    return res.json({ success: true, message: 'Tentativa de reconexão iniciada.', channel });
  }
);

// Listar conversas
communicationRouter.get('/conversations', async (_req: RequestWithUser, res: Response) => {
  const conversationsList = await communicationRepository.findAllConversations();
  res.json(conversationsList);
});

// Iniciar ou localizar conversa por telefone / cliente CRM
communicationRouter.post(
  '/conversations',
  requirePermission('communication:send_message'),
  async (req: RequestWithUser, res: Response) => {
    const actor = req.user!;
    const { phone, customerName, clientId, channelId } = req.body || {};

    if (!phone || String(phone).replace(/\D/g, '').length < 10) {
      return res.status(400).json({ error: 'Informe um número de WhatsApp válido com DDD.' });
    }

    try {
      const conv = await whatsAppService.startOrFindConversation({
        phone: String(phone),
        customerName: typeof customerName === 'string' ? customerName : undefined,
        clientId: typeof clientId === 'string' ? clientId : undefined,
        channelId: typeof channelId === 'string' ? channelId : undefined,
        actorId: actor.id,
        actorName: actor.fullName,
        actorRole: actor.role,
      });
      return res.status(201).json(conv);
    } catch (err: any) {
      return res.status(400).json({ error: err.message || 'Falha ao iniciar conversa.' });
    }
  }
);

// Marcar conversa como lida (zera unreadCount)
communicationRouter.post('/conversations/:id/read', async (req: RequestWithUser, res: Response) => {
  const updated = await whatsAppService.markConversationRead(req.params.id);
  if (!updated) {
    return res.status(404).json({ error: 'Conversa não encontrada.' });
  }
  return res.json(updated);
});

// Atualizar status da conversa (open | pending | resolved | closed)
communicationRouter.patch(
  '/conversations/:id/status',
  requirePermission('communication:send_message'),
  async (req: RequestWithUser, res: Response) => {
    const actor = req.user!;
    const status = String(req.body?.status || '');
    if (!ALLOWED_STATUSES.has(status)) {
      return res.status(400).json({
        error: 'Status inválido. Permitidos: open, pending, resolved, closed.',
      });
    }

    try {
      const updated = await whatsAppService.updateConversationStatus(
        req.params.id,
        status as any,
        actor
      );
      return res.json(updated);
    } catch (err: any) {
      return res.status(404).json({ error: err.message || 'Conversa não encontrada.' });
    }
  }
);

// Listar mensagens de uma conversa
communicationRouter.get('/conversations/:id/messages', async (req: RequestWithUser, res: Response) => {
  const conv = await communicationRepository.findConversationById(req.params.id);
  if (!conv) {
    return res.status(404).json({ error: 'Conversa não encontrada.' });
  }
  const messagesList = await communicationRepository.findMessagesByConversation(req.params.id);
  return res.json(messagesList);
});

// Enviar mensagem em uma conversa
communicationRouter.post(
  '/conversations/:id/messages',
  requirePermission('communication:send_message'),
  async (req: RequestWithUser, res: Response) => {
    const actor = req.user!;
    const { body, mediaUrl, messageType } = req.body || {};

    if (typeof body !== 'string' || body.trim().length === 0) {
      return res.status(400).json({ error: 'O corpo da mensagem é obrigatório.' });
    }
    if (body.trim().length > 4096) {
      return res.status(400).json({ error: 'A mensagem excede o limite de 4.096 caracteres do WhatsApp.' });
    }
    if (mediaUrl && (typeof mediaUrl !== 'string' || !isSafeMediaUrl(mediaUrl))) {
      return res.status(400).json({ error: 'URL de mídia inválida. Use https://, http://, s3:// ou /uploads/.' });
    }

    const safeType =
      typeof messageType === 'string' && ALLOWED_MESSAGE_TYPES.has(messageType)
        ? (messageType as 'text' | 'image' | 'document' | 'template')
        : 'text';

    try {
      const sentMsg = await whatsAppService.sendMessage({
        conversationId: req.params.id,
        body: body.trim(),
        senderId: actor.id,
        senderName: actor.fullName,
        senderRole: actor.role,
        mediaUrl: mediaUrl ? mediaUrl.trim() : undefined,
        messageType: safeType,
      });
      return res.status(201).json(sentMsg);
    } catch (err: any) {
      return res.status(400).json({ error: err.message || 'Falha ao enviar mensagem.' });
    }
  }
);

// Disparo de templates automáticos de ERP
communicationRouter.post(
  '/send-template',
  requirePermission('communication:send_template'),
  async (req: RequestWithUser, res: Response) => {
    const actor = req.user!;
    const { templateType, clientPhone, clientName, quoteNumber, orderNumber, amount, voucherNumber } =
      req.body || {};

    if (!clientPhone || !clientName) {
      return res.status(400).json({ error: 'clientPhone e clientName são obrigatórios.' });
    }

    try {
      let result;
      if (templateType === 'quote_ready') {
        result = await whatsAppService.sendQuoteTemplate(
          quoteNumber || 'ORC-2026',
          clientPhone,
          clientName,
          Number(amount || 0),
          actor
        );
      } else if (templateType === 'downpayment_confirmed') {
        result = await whatsAppService.sendDownpaymentConfirmedTemplate(
          orderNumber || 'OP-2026',
          clientPhone,
          clientName,
          voucherNumber || 'AUT-000',
          actor
        );
      } else {
        return res
          .status(400)
          .json({ error: 'templateType inválido. Permitidos: quote_ready, downpayment_confirmed.' });
      }
      return res.json({ success: true, message: result });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Falha ao disparar template.' });
    }
  }
);
