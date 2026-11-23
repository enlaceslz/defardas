/**
 * DE FARDAS ERP — Communication & WhatsApp Routes
 * Endpoints para central de atendimento omnichannel, canais Meta Cloud API / WA-AKG e webhooks assinados.
 */
import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { RequestWithUser, requireAuth, requirePermission } from '../auth/rbac';
import { communicationRepository } from '../repositories/communicationRepository';
import {
  whatsAppService,
  isSafeWhatsAppMediaUrl,
  sanitizeChannelConfig,
} from '../services/whatsappService';

export const communicationRouter = Router();
const isProd = process.env.NODE_ENV === 'production';

// Token efêmero em memória apenas para testes locais em desenvolvimento quando a env var não estiver definida
const DEV_EPHEMERAL_VERIFY_TOKEN = !isProd ? crypto.randomBytes(16).toString('hex') : '';

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

function extractMetaMessageText(msg: any): { body: string; mediaMimeType?: string } {
  if (msg?.text?.body) return { body: String(msg.text.body) };
  if (msg?.image) {
    return {
      body: msg.image.caption ? `[Imagem] ${msg.image.caption}` : '[Imagem recebida via WhatsApp]',
      mediaMimeType: msg.image.mime_type || 'image/jpeg',
    };
  }
  if (msg?.document) {
    const fname = msg.document.filename ? ` (${msg.document.filename})` : '';
    return {
      body: msg.document.caption
        ? `[Documento${fname}] ${msg.document.caption}`
        : `[Documento recebido${fname}]`,
      mediaMimeType: msg.document.mime_type || 'application/pdf',
    };
  }
  if (msg?.audio) {
    return {
      body: '[Áudio recebido via WhatsApp]',
      mediaMimeType: msg.audio.mime_type || 'audio/ogg',
    };
  }
  if (msg?.video) {
    return {
      body: msg.video.caption ? `[Vídeo] ${msg.video.caption}` : '[Vídeo recebido via WhatsApp]',
      mediaMimeType: msg.video.mime_type || 'video/mp4',
    };
  }
  if (msg?.button?.text) {
    return { body: `[Botão] ${msg.button.text}` };
  }
  if (msg?.interactive?.button_reply?.title) {
    return { body: `[Resposta Rápida] ${msg.interactive.button_reply.title}` };
  }
  if (msg?.interactive?.list_reply?.title) {
    return { body: `[Seleção de Lista] ${msg.interactive.list_reply.title}` };
  }
  if (msg?.location) {
    const locName = msg.location.name || msg.location.address || `${msg.location.latitude}, ${msg.location.longitude}`;
    return { body: `[Localização] ${locName}` };
  }
  return { body: '[Mídia ou mensagem recebida]' };
}

// ==============================================================================
// 1. Webhooks Públicos (Isentos de sessão/CSRF — protegidos por assinatura/chave)
// ==============================================================================

// Verificação do Webhook da Meta WhatsApp Cloud API
communicationRouter.get('/webhooks/meta', (req: Request, res: Response) => {
  const mode = String(req.query['hub.mode'] || '');
  const token = String(req.query['hub.verify_token'] || '');
  const challenge = String(req.query['hub.challenge'] || '');

  const configuredToken = process.env.META_WA_WEBHOOK_VERIFY_TOKEN?.trim() || '';
  if (isProd && !configuredToken) {
    return res.status(503).json({
      error: 'META_WA_WEBHOOK_VERIFY_TOKEN não configurado em produção.',
      code: 'WEBHOOK_NOT_CONFIGURED',
    });
  }

  const verifyToken = configuredToken || DEV_EPHEMERAL_VERIFY_TOKEN;
  if (!verifyToken) {
    return res.sendStatus(403);
  }

  // Valida formato do challenge e força text/plain para impedir reflexão HTML/XSS
  if (
    mode === 'subscribe' &&
    token &&
    challenge.length > 0 &&
    challenge.length <= 256 &&
    safeCompare(token, verifyToken)
  ) {
    console.log('✅ [WhatsApp Webhook] Meta Cloud API verificado com sucesso.');
    return res.type('text/plain; charset=utf-8').status(200).send(challenge);
  }

  return res.sendStatus(403);
});

// Recebimento de mensagens e status da Meta WhatsApp Cloud API
communicationRouter.post('/webhooks/meta', async (req: Request, res: Response) => {
  try {
    const appSecret = process.env.META_WA_APP_SECRET?.trim() || '';
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
              if (fromPhone.replace(/\D/g, '').length < 10) continue;

              const extracted = extractMetaMessageText(msg);
              const contactMatch = Array.isArray(value.contacts)
                ? value.contacts.find((c: any) => c.wa_id === fromPhone) || value.contacts[0]
                : undefined;
              const contactName = contactMatch?.profile?.name || fromPhone;

              await whatsAppService.handleInboundMessage({
                provider: 'meta_cloud',
                fromPhone,
                fromName: contactName,
                body: extracted.body,
                externalId: msg.id ? String(msg.id) : undefined,
                mediaMimeType: extracted.mediaMimeType,
              });
            }
          }

          // 1b. Atualizações de status de entrega/leitura (sent / delivered / read / failed)
          if (Array.isArray(value?.statuses)) {
            for (const st of value.statuses) {
              if (st?.id && ['sent', 'delivered', 'read', 'failed'].includes(st.status)) {
                const errDetail = st.errors?.[0]?.title || st.errors?.[0]?.message;
                await whatsAppService.handleDeliveryStatusUpdate(String(st.id), st.status, errDetail);
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

// Recebimento de mensagens e status do container isolado WA-AKG
communicationRouter.post('/webhooks/wa-akg', async (req: Request, res: Response) => {
  try {
    const configuredKey = process.env.WA_AKG_API_KEY?.trim() || '';
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

    const { event, from, senderName, text, id, mediaUrl, mediaType, status, errorMessage } = req.body || {};

    // Atualização de status de entrega (ACK) vindo do container WA-AKG
    if (event === 'message.status' && id && ['sent', 'delivered', 'read', 'failed'].includes(status)) {
      await whatsAppService.handleDeliveryStatusUpdate(
        String(id),
        status,
        typeof errorMessage === 'string' ? errorMessage.slice(0, 300) : undefined
      );
      return res.json({ success: true });
    }

    const cleanPhone = String(from || '').trim();
    const safeMedia = typeof mediaUrl === 'string' && isSafeWhatsAppMediaUrl(mediaUrl) ? mediaUrl.trim() : undefined;
    const bodyText = String(text || '').trim() || (safeMedia ? '[Mídia recebida]' : '');

    if (cleanPhone.replace(/\D/g, '').length >= 10 && bodyText) {
      await whatsAppService.handleInboundMessage({
        provider: 'wa_akg',
        fromPhone: cleanPhone,
        fromName: String(senderName || cleanPhone),
        body: bodyText,
        externalId: id ? String(id) : undefined,
        mediaUrl: safeMedia,
        mediaMimeType: typeof mediaType === 'string' ? mediaType.slice(0, 80) : undefined,
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

// Resumo leve de mensagens não lidas (para badge da Sidebar)
communicationRouter.get('/unread-summary', async (_req: RequestWithUser, res: Response) => {
  const [conversationsList, channelsList] = await Promise.all([
    communicationRepository.findAllConversations(),
    communicationRepository.findAllChannels(),
  ]);
  const totalUnread = conversationsList.reduce((acc, c) => acc + (c.unreadCount || 0), 0);
  const openCount = conversationsList.filter((c) => c.status === 'open' || c.status === 'pending').length;
  const anyLiveConfigured = channelsList.some((ch) => whatsAppService.getChannelDiagnostics(ch).configured);

  return res.json({
    totalUnread,
    openConversationsCount: openCount,
    totalConversationsCount: conversationsList.length,
    anyLiveConfigured,
  });
});

// Listar canais configurados (com diagnóstico real e config sanitizada)
communicationRouter.get('/channels', async (_req: RequestWithUser, res: Response) => {
  const channelsList = await communicationRepository.findAllChannels();
  const enriched = channelsList.map((ch) => ({
    ...ch,
    config: sanitizeChannelConfig(ch.config),
    diagnostics: whatsAppService.getChannelDiagnostics(ch),
  }));
  res.json(enriched);
});

// Obter QR code atualizado para o canal WA-AKG (sem vazar IDs a serviços externos)
communicationRouter.get('/channels/:id/qr', async (req: RequestWithUser, res: Response) => {
  const channel = await communicationRepository.findChannelById(req.params.id);
  if (!channel) {
    return res.status(404).json({ error: 'Canal não encontrado' });
  }

  let qrCode = channel.qrCode;
  let mode: 'live' | 'simulated' = qrCode ? 'live' : 'simulated';
  const waEndpoint = (process.env.WA_AKG_ENDPOINT?.trim() || '').replace(/\/+$/, '');

  // Se houver endpoint WA-AKG configurado, tenta obter QR code em tempo real do container
  if (!qrCode && channel.provider === 'wa_akg' && waEndpoint) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4000);
      const qrRes = await fetch(`${waEndpoint}/instance/qr`, {
        signal: controller.signal,
        headers: { apikey: process.env.WA_AKG_API_KEY?.trim() || '' },
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
    diagnostics: whatsAppService.getChannelDiagnostics(channel),
  });
});

// Verificar conectividade e reconectar canal (restrito a Admin / Gerente Comercial)
communicationRouter.post(
  '/channels/:id/reconnect',
  requirePermission('communication:manage_channels'),
  async (req: RequestWithUser, res: Response) => {
    const actor = req.user!;
    const channel = await communicationRepository.findChannelById(req.params.id);
    if (!channel) {
      return res.status(404).json({ error: 'Canal não encontrado' });
    }

    const result = await whatsAppService.checkAndReconnectChannel(channel, actor);
    return res.json({
      success: true,
      message: result.message,
      channel: {
        ...result.channel,
        config: sanitizeChannelConfig(result.channel.config),
        diagnostics: result.diagnostics,
      },
    });
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
    const { body, mediaUrl, mediaMimeType, messageType } = req.body || {};

    if (typeof body !== 'string' || body.trim().length === 0) {
      return res.status(400).json({ error: 'O corpo da mensagem é obrigatório.' });
    }
    if (body.trim().length > 4096) {
      return res.status(400).json({ error: 'A mensagem excede o limite de 4.096 caracteres do WhatsApp.' });
    }
    if (mediaUrl && (typeof mediaUrl !== 'string' || !isSafeWhatsAppMediaUrl(mediaUrl))) {
      return res.status(400).json({
        error: 'URL de mídia inválida ou não permitida. Use um link público https://, s3:// ou /uploads/.',
      });
    }

    const safeType =
      typeof messageType === 'string' && ALLOWED_MESSAGE_TYPES.has(messageType)
        ? (messageType as 'text' | 'image' | 'document' | 'template')
        : undefined;

    try {
      const sentMsg = await whatsAppService.sendMessage({
        conversationId: req.params.id,
        body: body.trim(),
        senderId: actor.id,
        senderName: actor.fullName,
        senderRole: actor.role,
        mediaUrl: mediaUrl ? mediaUrl.trim() : undefined,
        mediaMimeType: typeof mediaMimeType === 'string' ? mediaMimeType.trim().slice(0, 80) : undefined,
        messageType: safeType,
      });
      return res.status(201).json(sentMsg);
    } catch (err: any) {
      return res.status(400).json({ error: err.message || 'Falha ao enviar mensagem.' });
    }
  }
);

// Disparo de templates automáticos de ERP (Comercial, PCP, Financeiro e Compras)
communicationRouter.post(
  '/send-template',
  requirePermission('communication:send_template'),
  async (req: RequestWithUser, res: Response) => {
    const actor = req.user!;
    const {
      templateType,
      clientPhone,
      clientName,
      quoteNumber,
      orderNumber,
      poNumber,
      amount,
      voucherNumber,
      artVersion,
      artFileUrl,
      stage,
      targetDeliveryDate,
      expectedDeliveryDate,
      itemsSummary,
      dueDate,
      pixKey,
      paymentLabel,
    } = req.body || {};

    if (!clientPhone || !clientName) {
      return res.status(400).json({ error: 'clientPhone e clientName são obrigatórios.' });
    }

    try {
      let result: { conversation: any; message: any };
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
      } else if (templateType === 'art_approval') {
        result = await whatsAppService.sendArtApprovalTemplate({
          clientPhone,
          clientName,
          referenceNumber: orderNumber || quoteNumber || 'PEDIDO',
          artVersion: artVersion !== undefined ? Number(artVersion) : undefined,
          artFileUrl: typeof artFileUrl === 'string' ? artFileUrl : undefined,
          actor,
        });
      } else if (templateType === 'order_stage_update') {
        result = await whatsAppService.sendOrderStageUpdateTemplate({
          clientPhone,
          clientName,
          orderNumber: orderNumber || 'OP-2026',
          stage: String(stage || 'corte'),
          targetDeliveryDate: typeof targetDeliveryDate === 'string' ? targetDeliveryDate : undefined,
          actor,
        });
      } else if (templateType === 'purchase_order') {
        result = await whatsAppService.sendPurchaseOrderTemplate({
          supplierPhone: clientPhone,
          supplierName: clientName,
          poNumber: poNumber || 'PC-2026',
          amount: Number(amount || 0),
          expectedDeliveryDate: typeof expectedDeliveryDate === 'string' ? expectedDeliveryDate : undefined,
          itemsSummary: typeof itemsSummary === 'string' ? itemsSummary : undefined,
          actor,
        });
      } else if (templateType === 'payment_reminder') {
        result = await whatsAppService.sendPaymentReminderTemplate({
          clientPhone,
          clientName,
          referenceNumber: orderNumber || quoteNumber || 'PEDIDO',
          amount: Number(amount || 0),
          dueDate: typeof dueDate === 'string' ? dueDate : undefined,
          pixKey: typeof pixKey === 'string' ? pixKey : undefined,
          paymentLabel: typeof paymentLabel === 'string' ? paymentLabel : undefined,
          actor,
        });
      } else {
        return res.status(400).json({
          error:
            'templateType inválido. Permitidos: quote_ready, downpayment_confirmed, art_approval, order_stage_update, purchase_order, payment_reminder.',
        });
      }

      return res.json({
        success: result.message?.status !== 'failed',
        conversationId: result.conversation.id,
        conversation: result.conversation,
        message: result.message,
      });
    } catch (err: any) {
      return res.status(400).json({ error: err.message || 'Falha ao disparar template.' });
    }
  }
);
