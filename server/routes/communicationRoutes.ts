import { isLocalDemoEnvironment } from '../auth/demoEnvironment';
import { verifyMetaWebhook, verifyWaAkgWebhook } from '../middleware/webhookAuth';
/**
 * DE FARDAS ERP — Communication & WhatsApp Routes
 * Endpoints para central de atendimento omnichannel, canais Meta Cloud API / WA-AKG e webhooks.
 */
import { Router, Request, Response } from 'express';
import { RequestWithUser, requireAuth } from '../auth/rbac';
import { communicationRepository } from '../repositories/communicationRepository';
import { whatsAppService } from '../services/whatsappService';

export const communicationRouter = Router();

// ==============================================================================
// 1. Webhooks Públicos (Isentos de autenticação de sessão)
// ==============================================================================

// Verificação do Webhook da Meta WhatsApp Cloud API
communicationRouter.get('/webhooks/meta', (req: Request, res: Response) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const verifyToken = process.env.META_WA_WEBHOOK_VERIFY_TOKEN;

  if (verifyToken && mode === 'subscribe' && token === verifyToken) {
    console.log('✅ [WhatsApp Webhook] Meta Cloud API verificado com sucesso.');
    return res.status(200).send(challenge);
  }

  res.sendStatus(403);
});

// Recebimento de mensagens da Meta WhatsApp Cloud API
communicationRouter.post('/webhooks/meta', verifyMetaWebhook, async (req: Request, res: Response) => {
  try {
    const body = req.body;
    if (body.object === 'whatsapp_business_account') {
      const entries = body.entry || [];
      for (const entry of entries) {
        const changes = entry.changes || [];
        for (const change of changes) {
          const value = change.value;
          if (value?.messages) {
            for (const msg of value.messages) {
              const fromPhone = msg.from;
              const textBody = msg.text?.body || '[Mídia recebida]';
              const contactName = value.contacts?.[0]?.profile?.name || fromPhone;

              await whatsAppService.handleInboundMessage({
                channelId: 'ch-meta-official',
                fromPhone,
                fromName: contactName,
                body: textBody,
                externalId: msg.id,
              });
            }
          }
        }
      }
    }
    res.sendStatus(200);
  } catch (err: any) {
    console.error('❌ [WhatsApp Webhook] Erro ao processar webhook Meta:', err);
    res.sendStatus(500);
  }
});

// Recebimento de mensagens do container isolado WA-AKG
communicationRouter.post('/webhooks/wa-akg', verifyWaAkgWebhook, async (req: Request, res: Response) => {
  try {
    const { from, senderName, text, id, mediaUrl, mediaType } = req.body;
    if (from && text) {
      await whatsAppService.handleInboundMessage({
        channelId: 'ch-wa-akg-qr',
        fromPhone: from,
        fromName: senderName || from,
        body: text,
        externalId: id,
        mediaUrl,
        mediaMimeType: mediaType,
      });
    }
    res.json({ success: true });
  } catch (err: any) {
    console.error('❌ [WhatsApp Webhook] Erro ao processar webhook WA-AKG:', err);
    res.status(500).json({ error: 'Falha no processamento' });
  }
});

// ==============================================================================
// 2. Endpoints Autenticados da Central de Atendimento Omnichannel
// ==============================================================================
communicationRouter.use(requireAuth);

// Listar canais configurados
communicationRouter.get('/channels', async (_req: RequestWithUser, res: Response) => {
  const channelsList = await communicationRepository.findAllChannels();
  res.json(channelsList);
});

// Obter QR code atualizado para o canal WA-AKG
communicationRouter.get('/channels/:id/qr', async (req: RequestWithUser, res: Response) => {
  const channel = await communicationRepository.findChannelById(req.params.id);
  if (!channel) {
    return res.status(404).json({ error: 'Canal não encontrado' });
  }

  if (!isLocalDemoEnvironment() && !channel.qrCode) {
    return res.status(503).json({ error: 'QR Code indisponível no provedor.' });
  }
  // Prévia demonstrativa apenas em desenvolvimento
  const qrMock = channel.qrCode || `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="100%" height="100%" fill="%23fff"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="%230f172a" font-family="sans-serif" font-size="12">QR Code Ativo: ${channel.phoneNumber}</text></svg>`;

  res.json({
    channelId: channel.id,
    status: channel.status,
    qrCode: qrMock,
  });
});

// Solicitar reconexão de canal
communicationRouter.post('/channels/:id/reconnect', async (req: RequestWithUser, res: Response) => {
  const channel = await communicationRepository.findChannelById(req.params.id);
  if (!channel) {
    return res.status(404).json({ error: 'Canal não encontrado' });
  }

  if (!isLocalDemoEnvironment()) {
    return res.status(501).json({ error: 'Reconexão ao provedor ainda não implementada.' });
  }
  channel.status = 'connecting';
  channel.updatedAt = new Date().toISOString();
  await communicationRepository.saveChannel(channel);

  setTimeout(async () => {
    channel.status = 'connected';
    channel.updatedAt = new Date().toISOString();
    await communicationRepository.saveChannel(channel);
  }, 1500);

  res.json({ success: true, message: 'Tentativa de conexão iniciada.', channel });
});

// Listar conversas
communicationRouter.get('/conversations', async (_req: RequestWithUser, res: Response) => {
  const conversationsList = await communicationRepository.findAllConversations();
  res.json(conversationsList);
});

// Listar mensagens de uma conversa
communicationRouter.get('/conversations/:id/messages', async (req: RequestWithUser, res: Response) => {
  const messagesList = await communicationRepository.findMessagesByConversation(req.params.id);
  res.json(messagesList);
});

// Enviar mensagem em uma conversa
communicationRouter.post('/conversations/:id/messages', async (req: RequestWithUser, res: Response) => {
  const actor = req.user!;
  const { body, mediaUrl, messageType } = req.body;

  if (!body) {
    return res.status(400).json({ error: 'O corpo da mensagem é obrigatório.' });
  }

  try {
    const sentMsg = await whatsAppService.sendMessage({
      conversationId: req.params.id,
      body,
      senderName: actor.fullName,
      mediaUrl,
      messageType,
    });
    res.status(201).json(sentMsg);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Falha ao enviar mensagem.' });
  }
});

// Disparo de templates automáticos de ERP
communicationRouter.post('/send-template', async (req: RequestWithUser, res: Response) => {
  // Templates operacionais exigem consulta da proposta, baixa e gate reais.
  if (!isLocalDemoEnvironment()) {
    return res.status(501).json({ error: 'Templates automáticos aguardam integração com os registros e portões do ERP.' });
  }
  const { templateType, clientPhone, clientName, quoteNumber, orderNumber, amount, voucherNumber } = req.body;

  if (!clientPhone || !clientName) {
    return res.status(400).json({ error: 'clientPhone e clientName são obrigatórios.' });
  }

  try {
    let result;
    if (templateType === 'quote_ready') {
      result = await whatsAppService.sendQuoteTemplate(quoteNumber || 'ORC-2026', clientPhone, clientName, Number(amount || 0));
    } else if (templateType === 'downpayment_confirmed') {
      result = await whatsAppService.sendDownpaymentConfirmedTemplate(orderNumber || 'OP-2026', clientPhone, clientName, voucherNumber || 'AUT-000');
    } else {
      return res.status(400).json({ error: 'templateType inválido. Permitidos: quote_ready, downpayment_confirmed.' });
    }
    res.json({ success: true, message: result });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Falha ao disparar template.' });
  }
});
