/**
 * DE FARDAS ERP — WhatsApp Omnichannel Service
 * Suporta Provedor Oficial (Meta WhatsApp Cloud API) e Provedor QR Code (WA-AKG isolado).
 * Garante idempotência (externalId), normalização DDI +55, validação HTTP real e rastreabilidade com CRM/PCP.
 */
import crypto from 'crypto';
import { communicationRepository } from '../repositories/communicationRepository';
import { clientRepository } from '../repositories/clientRepository';
import { leadRepository } from '../repositories/leadRepository';
import { auditService } from '../services/auditService';
import { MessageEntity, ConversationEntity } from '../types/db';

export interface SendMessageOptions {
  conversationId: string;
  body: string;
  senderName?: string;
  senderRole?: string;
  senderId?: string;
  messageType?: 'text' | 'image' | 'document' | 'template';
  mediaUrl?: string;
  mediaMimeType?: string;
}

const VALID_CONVERSATION_STATUSES: ConversationEntity['status'][] = ['open', 'pending', 'resolved', 'closed'];

/**
 * Normaliza telefones brasileiros para o formato canônico DDI+DDD+Número (ex: 5598988412090),
 * eliminando duplicação de conversas entre webhooks (com 55) e cadastros locais (sem 55).
 */
export function normalizeBrWhatsAppDigits(rawPhone: string): string {
  const digits = String(rawPhone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('55') && digits.length >= 12 && digits.length <= 13) {
    return digits;
  }
  if (digits.length >= 10 && digits.length <= 11) {
    return `55${digits}`;
  }
  return digits;
}

/** Formata dígitos brasileiros para exibição amigável `(98) 98841-2090` ou `(98) 3245-8800` */
export function formatBrPhoneDisplay(rawPhone: string): string {
  let digits = String(rawPhone || '').replace(/\D/g, '');
  if (digits.startsWith('55') && digits.length >= 12) {
    digits = digits.slice(2);
  }
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return rawPhone.trim();
}

/** Compara telefones tolerando presença ou ausência do DDI 55 */
function phonesMatch(phoneA: string, phoneB: string): boolean {
  const a = normalizeBrWhatsAppDigits(phoneA);
  const b = normalizeBrWhatsAppDigits(phoneB);
  if (!a || !b) return false;
  return a === b;
}

function formatBRL(amount: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number.isFinite(amount) ? amount : 0);
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number = 8000): Promise<globalThis.Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export class WhatsAppService {
  private get metaToken() {
    return process.env.META_WA_TOKEN;
  }
  private get metaPhoneNumberId() {
    return process.env.META_WA_PHONE_NUMBER_ID;
  }
  private get waAkgEndpoint() {
    return process.env.WA_AKG_ENDPOINT;
  }
  private get waAkgApiKey() {
    return process.env.WA_AKG_API_KEY;
  }

  /**
   * Localiza ou cria uma conversa com normalização canônica de telefone e vínculo automático ao CRM.
   */
  public async startOrFindConversation(params: {
    phone: string;
    customerName?: string;
    clientId?: string;
    channelId?: string;
    actorName?: string;
    actorRole?: string;
    actorId?: string;
  }): Promise<ConversationEntity> {
    const canonicalDigits = normalizeBrWhatsAppDigits(params.phone);
    if (canonicalDigits.length < 10) {
      throw new Error('Telefone/WhatsApp inválido. Informe DDD e número completo.');
    }

    const remoteJid = `${canonicalDigits}@s.whatsapp.net`;
    const existing = await communicationRepository.findConversationByRemoteJid(remoteJid);
    if (existing) {
      if (existing.status === 'closed' || existing.status === 'resolved') {
        existing.status = 'open';
        existing.updatedAt = new Date().toISOString();
        await communicationRepository.saveConversation(existing);
      }
      return existing;
    }

    // Vincular cliente / lead automaticamente se não informado
    const [allClients, allLeads, allChannels] = await Promise.all([
      clientRepository.findAll(),
      leadRepository.findAll(),
      communicationRepository.findAllChannels(),
    ]);

    const matchedClient =
      (params.clientId ? allClients.find((c) => c.id === params.clientId) : undefined) ||
      allClients.find((c) => phonesMatch(c.phone, canonicalDigits));
    const matchedLead = allLeads.find((l) => phonesMatch(l.phone, canonicalDigits));

    const targetChannel =
      (params.channelId ? allChannels.find((c) => c.id === params.channelId) : undefined) ||
      allChannels.find((c) => c.isActive && c.status === 'connected') ||
      allChannels[0];

    if (!targetChannel) {
      throw new Error('Nenhum canal WhatsApp configurado no ERP.');
    }

    const now = new Date().toISOString();
    const conv: ConversationEntity = {
      id: crypto.randomUUID(),
      channelId: targetChannel.id,
      clientId: matchedClient?.id,
      leadId: matchedLead?.id,
      remoteJid,
      customerName:
        params.customerName?.trim() ||
        matchedClient?.contactName ||
        matchedClient?.tradeName ||
        matchedLead?.clientName ||
        formatBrPhoneDisplay(canonicalDigits),
      customerPhone: formatBrPhoneDisplay(canonicalDigits),
      status: 'open',
      unreadCount: 0,
      lastMessageText: '',
      lastMessageAt: now,
      tags: matchedClient ? ['cliente_ativo'] : matchedLead ? ['lead_crm'] : ['atendimento_ativo'],
      createdAt: now,
      updatedAt: now,
    };

    await communicationRepository.saveConversation(conv);

    auditService.log({
      actorId: params.actorId,
      actorName: params.actorName || 'Sistema ERP',
      actorRole: params.actorRole || 'system',
      entityName: 'communication.conversations',
      entityId: conv.id,
      action: 'CREATE_WHATSAPP_CONVERSATION',
      notes: `Conversa iniciada para ${conv.customerName} (${conv.customerPhone}) no canal ${targetChannel.provider}.`,
    });

    return conv;
  }

  /**
   * Envia mensagem para um contato via canal configurado com validação HTTP real.
   */
  public async sendMessage(options: SendMessageOptions): Promise<MessageEntity> {
    const cleanBody = String(options.body || '').trim();
    if (!cleanBody) {
      throw new Error('O corpo da mensagem não pode estar vazio.');
    }

    const conv = await communicationRepository.findConversationById(options.conversationId);
    if (!conv) {
      throw new Error(`Conversa ${options.conversationId} não encontrada.`);
    }

    const channel = await communicationRepository.findChannelById(conv.channelId);
    if (!channel) {
      throw new Error(`Canal de WhatsApp ${conv.channelId} não configurado.`);
    }
    if (!channel.isActive) {
      throw new Error(`O canal "${channel.channelName}" está desativado.`);
    }

    const messageId = crypto.randomUUID();
    let externalId = `wa_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const targetDigits = normalizeBrWhatsAppDigits(conv.customerPhone || conv.remoteJid);

    const newMsg: MessageEntity = {
      id: messageId,
      conversationId: conv.id,
      externalId,
      direction: 'outbound',
      senderName: options.senderName || 'Atendimento DE FARDAS',
      messageType: options.messageType || 'text',
      body: cleanBody,
      mediaUrl: options.mediaUrl,
      mediaMimeType: options.mediaMimeType,
      status: 'sent',
      createdAt: new Date().toISOString(),
    };

    // Disparo real conforme provedor configurado com validação de resposta HTTP
    if (channel.provider === 'meta_cloud' && this.metaToken && this.metaPhoneNumberId) {
      try {
        const metaUrl = `https://graph.facebook.com/v21.0/${this.metaPhoneNumberId}/messages`;
        const res = await fetchWithTimeout(metaUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.metaToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: targetDigits,
            type: 'text',
            text: { body: cleanBody },
          }),
        });

        const payload = await res.json().catch(() => null);
        if (!res.ok) {
          const detail = payload?.error?.message || `Meta Cloud API HTTP ${res.status}`;
          newMsg.status = 'failed';
          newMsg.errorMessage = detail;
          console.warn('⚠️ [WhatsApp] Rejeição Meta Cloud API:', detail);
        } else if (payload?.messages?.[0]?.id) {
          externalId = payload.messages[0].id;
          newMsg.externalId = externalId;
        }
      } catch (err: any) {
        console.warn('⚠️ [WhatsApp] Falha de transporte Meta Cloud API:', err.message);
        newMsg.status = 'failed';
        newMsg.errorMessage = err.message || 'Falha de comunicação com Meta Cloud API.';
      }
    } else if (channel.provider === 'wa_akg' && this.waAkgEndpoint) {
      try {
        const res = await fetchWithTimeout(`${this.waAkgEndpoint}/message/sendText`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: this.waAkgApiKey || '',
          },
          body: JSON.stringify({
            number: targetDigits,
            text: cleanBody,
          }),
        });

        const payload = await res.json().catch(() => null);
        if (!res.ok) {
          const detail = payload?.error || payload?.message || `WA-AKG HTTP ${res.status}`;
          newMsg.status = 'failed';
          newMsg.errorMessage = detail;
          console.warn('⚠️ [WhatsApp] Rejeição WA-AKG:', detail);
        } else if (payload?.key?.id || payload?.id) {
          newMsg.externalId = payload?.key?.id || payload?.id;
        }
      } catch (err: any) {
        console.warn('⚠️ [WhatsApp] Falha de transporte WA-AKG container:', err.message);
        if (process.env.NODE_ENV === 'production') {
          newMsg.status = 'failed';
          newMsg.errorMessage = err.message || 'Container WA-AKG inacessível.';
        }
      }
    }

    await communicationRepository.saveMessage(newMsg);

    // Atualiza conversa: zera não lidas ao responder e reabre se estava concluída
    conv.lastMessageText = cleanBody;
    conv.lastMessageAt = newMsg.createdAt;
    conv.unreadCount = 0;
    if (conv.status === 'resolved' || conv.status === 'closed') {
      conv.status = 'open';
    }
    conv.updatedAt = new Date().toISOString();
    await communicationRepository.saveConversation(conv);

    auditService.log({
      actorId: options.senderId,
      actorName: options.senderName || 'DE FARDAS',
      actorRole: options.senderRole || 'system',
      entityName: 'communication.messages',
      entityId: newMsg.id,
      action: newMsg.status === 'failed' ? 'WHATSAPP_SEND_FAILED' : 'SEND_WHATSAPP_MESSAGE',
      notes: `Mensagem (${newMsg.status}) para ${conv.customerName} (${conv.customerPhone}) via ${channel.provider}.${
        newMsg.errorMessage ? ` Erro: ${newMsg.errorMessage}` : ''
      }`,
    });

    return newMsg;
  }

  /**
   * Marca conversa como lida (zera contador unreadCount).
   */
  public async markConversationRead(conversationId: string): Promise<ConversationEntity | null> {
    const conv = await communicationRepository.findConversationById(conversationId);
    if (!conv) return null;
    if (conv.unreadCount > 0) {
      conv.unreadCount = 0;
      conv.updatedAt = new Date().toISOString();
      await communicationRepository.saveConversation(conv);
    }
    return conv;
  }

  /**
   * Atualiza status do atendimento (open | pending | resolved | closed) com auditoria.
   */
  public async updateConversationStatus(
    conversationId: string,
    status: ConversationEntity['status'],
    actor: { id?: string; fullName: string; role: string }
  ): Promise<ConversationEntity> {
    if (!VALID_CONVERSATION_STATUSES.includes(status)) {
      throw new Error(`Status de atendimento inválido: ${status}.`);
    }
    const conv = await communicationRepository.findConversationById(conversationId);
    if (!conv) {
      throw new Error(`Conversa ${conversationId} não encontrada.`);
    }

    const previous = conv.status;
    conv.status = status;
    conv.updatedAt = new Date().toISOString();
    await communicationRepository.saveConversation(conv);

    auditService.log({
      actorId: actor.id,
      actorName: actor.fullName,
      actorRole: actor.role,
      entityName: 'communication.conversations',
      entityId: conv.id,
      action: 'UPDATE_CONVERSATION_STATUS',
      notes: `Atendimento de ${conv.customerName} alterado de '${previous}' para '${status}'.`,
    });

    return conv;
  }

  /**
   * Processa recebimento de mensagem externa (via Webhook) com idempotência por externalId.
   */
  public async handleInboundMessage(payload: {
    channelId?: string;
    provider?: 'meta_cloud' | 'wa_akg';
    fromPhone: string;
    fromName: string;
    body: string;
    externalId?: string;
    mediaUrl?: string;
    mediaMimeType?: string;
  }): Promise<MessageEntity> {
    // Idempotência: evita duplicar mensagens em retentativas de webhook (Meta / WA-AKG)
    if (payload.externalId) {
      const existingMsg = await communicationRepository.findMessageByExternalId(payload.externalId);
      if (existingMsg) {
        return existingMsg;
      }
    }

    const canonicalDigits = normalizeBrWhatsAppDigits(payload.fromPhone);
    const remoteJid = `${canonicalDigits}@s.whatsapp.net`;

    // Resolver canal de destino dinamicamente por ID ou provedor
    let resolvedChannelId = payload.channelId;
    if (!resolvedChannelId && payload.provider) {
      const ch = await communicationRepository.findChannelByProvider(payload.provider);
      resolvedChannelId = ch?.id;
    }
    if (!resolvedChannelId) {
      const all = await communicationRepository.findAllChannels();
      resolvedChannelId = all[0]?.id || 'ch-meta-official';
    }

    let conv = await communicationRepository.findConversationByRemoteJid(remoteJid);
    if (!conv) {
      const [allClients, allLeads] = await Promise.all([
        clientRepository.findAll(),
        leadRepository.findAll(),
      ]);

      const matchedClient = allClients.find((c) => phonesMatch(c.phone, canonicalDigits));
      const matchedLead = allLeads.find((l) => phonesMatch(l.phone, canonicalDigits));

      const now = new Date().toISOString();
      conv = {
        id: crypto.randomUUID(),
        channelId: resolvedChannelId,
        clientId: matchedClient?.id,
        leadId: matchedLead?.id,
        remoteJid,
        customerName:
          payload.fromName?.trim() ||
          matchedClient?.contactName ||
          matchedClient?.tradeName ||
          matchedLead?.clientName ||
          formatBrPhoneDisplay(canonicalDigits),
        customerPhone: formatBrPhoneDisplay(canonicalDigits),
        status: 'open',
        unreadCount: 1,
        lastMessageText: payload.body,
        lastMessageAt: now,
        tags: matchedClient ? ['cliente_ativo'] : matchedLead ? ['lead_crm'] : ['novo_contato'],
        createdAt: now,
        updatedAt: now,
      };
      await communicationRepository.saveConversation(conv);
    } else {
      conv.unreadCount += 1;
      conv.lastMessageText = payload.body;
      conv.lastMessageAt = new Date().toISOString();
      if (conv.status === 'resolved' || conv.status === 'closed') {
        conv.status = 'open';
      }
      conv.updatedAt = new Date().toISOString();
      await communicationRepository.saveConversation(conv);
    }

    const messageType: MessageEntity['messageType'] = payload.mediaUrl
      ? payload.mediaMimeType?.startsWith('audio/')
        ? 'audio'
        : payload.mediaMimeType?.startsWith('image/')
          ? 'image'
          : 'document'
      : 'text';

    const newMsg: MessageEntity = {
      id: crypto.randomUUID(),
      conversationId: conv.id,
      externalId: payload.externalId || `in_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
      direction: 'inbound',
      senderName: payload.fromName || conv.customerName,
      messageType,
      body: payload.body,
      mediaUrl: payload.mediaUrl,
      mediaMimeType: payload.mediaMimeType,
      status: 'delivered',
      createdAt: new Date().toISOString(),
    };

    await communicationRepository.saveMessage(newMsg);

    auditService.log({
      actorName: payload.fromName || canonicalDigits,
      actorRole: 'cliente_whatsapp',
      entityName: 'communication.messages',
      entityId: newMsg.id,
      action: 'RECEIVE_WHATSAPP_MESSAGE',
      notes: `Mensagem recebida de ${conv.customerName} (${conv.customerPhone}).`,
    });

    return newMsg;
  }

  /**
   * Atualiza status de entrega/leitura vindo do webhook da Meta (sent -> delivered -> read -> failed).
   */
  public async handleDeliveryStatusUpdate(
    externalId: string,
    status: 'sent' | 'delivered' | 'read' | 'failed',
    errorMessage?: string
  ): Promise<void> {
    if (!externalId) return;
    const msg = await communicationRepository.findMessageByExternalId(externalId);
    if (!msg) return;

    msg.status = status;
    if (errorMessage) {
      msg.errorMessage = errorMessage;
    }
    await communicationRepository.saveMessage(msg);
  }

  /**
   * Template: Envio de Proposta Comercial para o Cliente (valores formatados em pt-BR)
   */
  public async sendQuoteTemplate(
    quoteNumber: string,
    clientPhone: string,
    clientName: string,
    amount: number,
    actor?: { id?: string; fullName: string; role: string }
  ) {
    const body = `Olá, ${clientName}!\n\nSua proposta comercial *${quoteNumber}* da *DE FARDAS* no valor total de *${formatBRL(amount)}* está pronta!\n\n*Condições:* 50% de Sinal para Liberação de Corte + 50% na Entrega.\n\nPara aprovar ou tirar dúvidas, basta responder a esta mensagem.`;
    return this.findOrCreateAndSend(clientPhone, clientName, body, 'template', actor);
  }

  /**
   * Template: Notificação de Confirmação de Sinal 50% e Liberação de OP
   */
  public async sendDownpaymentConfirmedTemplate(
    orderNumber: string,
    clientPhone: string,
    clientName: string,
    voucherNumber: string,
    actor?: { id?: string; fullName: string; role: string }
  ) {
    const body = `*Comprovante Confirmado — DE FARDAS*\n\nOlá, ${clientName}! Confirmamos o recebimento do sinal de 50% referente à Ordem de Produção *${orderNumber}* (Autenticação: ${voucherNumber}).\n\nSeu pedido foi formalmente liberado para a etapa de *Corte e Produção*! Avisaremos a cada avanço.`;
    return this.findOrCreateAndSend(clientPhone, clientName, body, 'template', actor);
  }

  private async findOrCreateAndSend(
    phone: string,
    name: string,
    body: string,
    messageType: 'text' | 'template' = 'template',
    actor?: { id?: string; fullName: string; role: string }
  ) {
    const conv = await this.startOrFindConversation({
      phone,
      customerName: name,
      actorId: actor?.id,
      actorName: actor?.fullName || 'DE FARDAS (Sistema ERP)',
      actorRole: actor?.role || 'system',
    });

    return this.sendMessage({
      conversationId: conv.id,
      body,
      messageType,
      senderId: actor?.id,
      senderName: actor?.fullName || 'DE FARDAS (Sistema ERP)',
      senderRole: actor?.role || 'system',
    });
  }
}

export const whatsAppService = new WhatsAppService();
