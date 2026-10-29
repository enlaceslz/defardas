/**
 * DE FARDAS ERP — WhatsApp Omnichannel Service
 * Suporta Provedor Oficial (Meta WhatsApp Cloud API) e Provedor QR Code (WA-AKG isolado).
 * Integra atendimento ao CRM; deduplicação e recibos do provedor ainda estão pendentes.
 */
import crypto from 'crypto';
import { InputError, text } from '../validation/input';

export class CommunicationError extends Error {
  constructor(message: string, public status: 404 | 503) { super(message); }
}
import { communicationRepository } from '../repositories/communicationRepository';
import { clientRepository } from '../repositories/clientRepository';
import { leadRepository } from '../repositories/leadRepository';
import { auditService } from '../services/auditService';
import { MessageEntity, ConversationEntity } from '../types/db';

export interface SendMessageOptions {
  conversationId: string;
  body: string;
  senderName?: string;
  messageType?: 'text' | 'image' | 'document' | 'template';
  mediaUrl?: string;
  mediaMimeType?: string;
}

export class WhatsAppService {
  private metaToken = process.env.META_WA_TOKEN;
  private metaPhoneNumberId = process.env.META_WA_PHONE_NUMBER_ID;
  private waAkgEndpoint = process.env.WA_AKG_ENDPOINT || 'http://defardas-wa-akg:8080';
  private waAkgApiKey = process.env.WA_AKG_API_KEY;

  /**
   * Envia mensagem para um contato via canal configurado
   */
  public async sendMessage(options: SendMessageOptions): Promise<MessageEntity> {
    const body = text(options.body, 'Mensagem', 4000);
    if ((options.messageType !== undefined && options.messageType !== 'text') ||
        options.mediaUrl !== undefined || options.mediaMimeType !== undefined) {
      throw new InputError('Somente mensagens de texto são suportadas neste fluxo.');
    }
    const conv = await communicationRepository.findConversationById(options.conversationId);
    if (!conv) {
      throw new CommunicationError('Conversa não encontrada.', 404);
    }

    const channel = await communicationRepository.findChannelById(conv.channelId);
    if (!channel) {
      throw new CommunicationError('Canal de WhatsApp não configurado.', 503);
    }

    if (!channel.isActive || channel.status !== 'connected') {
      throw new CommunicationError('Canal de WhatsApp inativo ou desconectado.', 503);
    }
    if ((channel.provider === 'meta_cloud' && (!this.metaToken?.trim() || !this.metaPhoneNumberId?.trim())) ||
        (channel.provider === 'wa_akg' && !this.waAkgApiKey?.trim()) ||
        !['meta_cloud', 'wa_akg'].includes(channel.provider)) {
      throw new CommunicationError('Provedor WhatsApp não configurado.', 503);
    }
    const cleanPhone = conv.customerPhone.replace(/\D/g, '');
    if (!cleanPhone) throw new InputError('Telefone da conversa inválido.');

    const messageId = crypto.randomUUID();
    const externalId = `wa_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    const newMsg: MessageEntity = {
      id: messageId,
      conversationId: conv.id,
      externalId,
      direction: 'outbound',
      senderName: options.senderName || 'Atendimento DE FARDAS',
      messageType: options.messageType || 'text',
      body,
      mediaUrl: options.mediaUrl,
      mediaMimeType: options.mediaMimeType,
      status: 'sent',
      createdAt: new Date().toISOString(),
    };

    // Disparo real conforme o provedor do canal
    if (channel.provider === 'meta_cloud' && this.metaToken && this.metaPhoneNumberId) {
      try {
        const metaUrl = `https://graph.facebook.com/v21.0/${this.metaPhoneNumberId}/messages`;
        
        const response = await fetch(metaUrl, {
          method: 'POST',
          signal: AbortSignal.timeout(15000),
          headers: {
            'Authorization': `Bearer ${this.metaToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`,
            type: 'text',
            text: { body },
          }),
        });
        if (!response.ok) throw new Error(`Provedor WhatsApp retornou HTTP ${response.status}.`);
      } catch (err: any) {
        newMsg.status = 'failed';
        newMsg.errorMessage = 'Envio não confirmado pelo provedor. Confira o histórico antes de tentar novamente.';
      }
    } else if (channel.provider === 'wa_akg') {
      try {
        const response = await fetch(`${this.waAkgEndpoint}/message/sendText`, {
          method: 'POST',
          signal: AbortSignal.timeout(15000),
          headers: {
            'Content-Type': 'application/json',
            'apikey': this.waAkgApiKey || '',
          },
          body: JSON.stringify({
            number: cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`,
            text: body,
          }),
        });
        if (!response.ok) throw new Error(`Provedor WhatsApp retornou HTTP ${response.status}.`);
      } catch (err: any) {
        newMsg.status = 'failed';
        newMsg.errorMessage = 'Envio não confirmado pelo provedor. Confira o histórico antes de tentar novamente.';
      }
    } else {
      newMsg.status = 'failed';
      newMsg.errorMessage = 'Provedor WhatsApp não configurado.';
    }

    await communicationRepository.saveMessage(newMsg);

    // Atualiza conversa
    conv.lastMessageText = body;
    conv.lastMessageAt = new Date().toISOString();
    conv.updatedAt = new Date().toISOString();
    await communicationRepository.saveConversation(conv);

    await auditService.log({
      actorName: options.senderName || 'DE FARDAS',
      actorRole: 'atendimento',
      entityName: 'communication.messages',
      entityId: newMsg.id,
      action: newMsg.status === 'failed' ? 'WHATSAPP_MESSAGE_FAILED' : 'SEND_WHATSAPP_MESSAGE',
      notes: `Tentativa de envio. Provedor: ${channel.provider}. Estado: ${newMsg.status}.`,
    });

    return newMsg;
  }

  /**
   * Processa recebimento de mensagem externa (via Webhook)
   */
  public async handleInboundMessage(payload: {
    channelId: string;
    fromPhone: string;
    fromName: string;
    body: string;
    externalId?: string;
    mediaUrl?: string;
    mediaMimeType?: string;
  }): Promise<MessageEntity> {
    const cleanPhone = payload.fromPhone.replace(/\D/g, '');
    const remoteJid = `${cleanPhone}@s.whatsapp.net`;

    // Localiza ou cria a conversa
    let conv = await communicationRepository.findConversationByRemoteJid(remoteJid);
    if (!conv) {
      // Tentar associar cliente existente por telefone
      const allClients = await clientRepository.findAll();
      const matchedClient = allClients.find((c) => c.phone.replace(/\D/g, '') === cleanPhone);

      // Tentar associar lead existente
      const allLeads = await leadRepository.findAll();
      const matchedLead = allLeads.find((l) => l.phone.replace(/\D/g, '') === cleanPhone);

      conv = {
        id: crypto.randomUUID(),
        channelId: payload.channelId,
        clientId: matchedClient?.id,
        leadId: matchedLead?.id,
        remoteJid,
        customerName: payload.fromName || matchedClient?.tradeName || matchedLead?.clientName || cleanPhone,
        customerPhone: payload.fromPhone,
        status: 'open',
        unreadCount: 1,
        lastMessageText: payload.body,
        lastMessageAt: new Date().toISOString(),
        tags: matchedClient ? ['cliente_ativo'] : ['novo_contato'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await communicationRepository.saveConversation(conv);
    } else {
      conv.unreadCount += 1;
      conv.lastMessageText = payload.body;
      conv.lastMessageAt = new Date().toISOString();
      conv.updatedAt = new Date().toISOString();
      await communicationRepository.saveConversation(conv);
    }

    const newMsg: MessageEntity = {
      id: crypto.randomUUID(),
      conversationId: conv.id,
      externalId: payload.externalId || `in_${Date.now()}`,
      direction: 'inbound',
      senderName: payload.fromName || conv.customerName,
      messageType: payload.mediaUrl ? 'image' : 'text',
      body: payload.body,
      mediaUrl: payload.mediaUrl,
      mediaMimeType: payload.mediaMimeType,
      status: 'delivered',
      createdAt: new Date().toISOString(),
    };

    await communicationRepository.saveMessage(newMsg);

    await auditService.log({
      actorName: payload.fromName || cleanPhone,
      actorRole: 'cliente_whatsapp',
      entityName: 'communication.messages',
      entityId: newMsg.id,
      action: 'RECEIVE_WHATSAPP_MESSAGE',
      notes: `Mensagem recebida de ${conv.customerName} (${conv.customerPhone}).`,
    });

    return newMsg;
  }

  /**
   * Template: Envio de Proposta Comercial para o Cliente
   */
  public async sendQuoteTemplate(quoteNumber: string, clientPhone: string, clientName: string, amount: number) {
    const body = `Olá, ${clientName}! 👋\n\nSua proposta comercial *${quoteNumber}* da *DE FARDAS* no valor total de *R$ ${amount.toFixed(2)}* está pronta!\n\n📋 *Condições:* 50% de Sinal para Liberação de Corte + 50% na Entrega.\n\nPara aprovar ou tirar dúvidas, basta responder a esta mensagem.`;
    return this.findOrCreateAndSend(clientPhone, clientName, body);
  }

  /**
   * Template: Notificação de Confirmação de Sinal 50% e Liberação de OP
   */
  public async sendDownpaymentConfirmedTemplate(orderNumber: string, clientPhone: string, clientName: string, voucherNumber: string) {
    const body = `✅ *Comprovante Confirmado — DE FARDAS*\n\nOlá, ${clientName}! Confirmamos o recebimento do sinal de 50% referente à Ordem de Produção *${orderNumber}* (Autenticação: ${voucherNumber}).\n\n✂️ Seu pedido foi formalmente liberado para a etapa de *Corte e Produção*! Avisaremos a cada avanço.`;
    return this.findOrCreateAndSend(clientPhone, clientName, body);
  }

  private async findOrCreateAndSend(phone: string, name: string, body: string) {
    const cleanPhone = phone.replace(/\D/g, '');
    const remoteJid = `${cleanPhone}@s.whatsapp.net`;
    let conv = await communicationRepository.findConversationByRemoteJid(remoteJid);

    if (!conv) {
      const channelsList = await communicationRepository.findAllChannels();
      const defaultChannel = channelsList[0] || { id: 'ch-meta-official' };
      conv = {
        id: crypto.randomUUID(),
        channelId: defaultChannel.id,
        remoteJid,
        customerName: name,
        customerPhone: phone,
        status: 'open',
        unreadCount: 0,
        lastMessageText: body,
        lastMessageAt: new Date().toISOString(),
        tags: ['automacao_erp'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await communicationRepository.saveConversation(conv);
    }

    return this.sendMessage({
      conversationId: conv.id,
      body,
      senderName: 'DE FARDAS (Sistema ERP)',
    });
  }
}

export const whatsAppService = new WhatsAppService();
