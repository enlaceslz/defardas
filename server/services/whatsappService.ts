import { unitOfWork } from '../db/unitOfWork';
/**
 * DE FARDAS ERP — WhatsApp Omnichannel Service
 * Suporta Provedor Oficial (Meta WhatsApp Cloud API) e Provedor QR Code (WA-AKG isolado).
 * Integra atendimento ao CRM; deduplicação de requisições disponível; recibos do provedor ainda estão pendentes.
 */
import crypto from 'crypto';
import { InputError, text } from '../validation/input';

export class CommunicationError extends Error {
  constructor(message: string, public status: 404 | 409 | 503) { super(message); }
}
import { communicationRepository } from '../repositories/communicationRepository';
import { clientRepository } from '../repositories/clientRepository';
import { leadRepository } from '../repositories/leadRepository';
import { auditService } from '../services/auditService';
import { MessageEntity, ConversationEntity } from '../types/db';

export interface SendMessageOptions {
  conversationId: string;
  idempotencyKey?: string;
  actorId?: string;
  actorRole?: string;
  body: string;
  senderName?: string;
  messageType?: 'text' | 'image' | 'document' | 'template';
  mediaUrl?: string;
  mediaMimeType?: string;
}

export class WhatsAppService {
  private metaToken = process.env.META_WA_TOKEN;
  private metaPhoneNumberId = process.env.META_WA_PHONE_NUMBER_ID;
  private waAkgEndpoint = process.env.WA_AKG_ENDPOINT?.trim();
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
    const key = options.idempotencyKey || crypto.randomUUID();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key)) throw new InputError('Chave de repetição inválida.');
    const hash = crypto.createHash('sha256').update(`${options.actorId || 'system'}:${key.toLowerCase()}`).digest('hex');
    const messageId = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
    const prepared = await unitOfWork(async () => {
      const existing = await communicationRepository.findMessageById(messageId);
      if (existing) {
        if (existing.direction !== 'outbound' || existing.conversationId !== options.conversationId || existing.body !== body) {
          throw new CommunicationError('Chave de repetição já usada para outra mensagem.', 409);
        }
        return { message: existing };
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
          (channel.provider === 'wa_akg' && (!this.waAkgApiKey?.trim() || !this.waAkgEndpoint)) ||
          !['meta_cloud', 'wa_akg'].includes(channel.provider)) {
        throw new CommunicationError('Provedor WhatsApp não configurado.', 503);
      }
      const cleanPhone = conv.customerPhone.replace(/\D/g, '');
      if (!cleanPhone) throw new InputError('Telefone da conversa inválido.');

      const message: MessageEntity = {
        id: messageId, conversationId: conv.id, direction: 'outbound',
        senderName: options.senderName || 'Atendimento DE FARDAS', messageType: 'text', body,
        status: 'pending', createdAt: new Date().toISOString(),
      };
      await communicationRepository.saveMessage(message);
      await auditService.log({ actorId: options.actorId, actorName: options.senderName || 'DE FARDAS',
        actorRole: options.actorRole || 'atendimento', entityName: 'communication.messages', entityId: message.id,
        action: 'WHATSAPP_SEND_REQUESTED', notes: 'Solicitação registrada antes de contatar o provedor.' });
      return { message, channel, cleanPhone };
    });
    if (!prepared.channel) return prepared.message;
    const { channel, cleanPhone } = prepared;
    const newMsg = { ...prepared.message, status: 'sent' as MessageEntity['status'] };

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
        if (!response.ok) {
          newMsg.status = response.status >= 400 && response.status < 500 ? 'failed' : 'pending';
          newMsg.errorMessage = 'Envio não confirmado pelo provedor. Confira o histórico antes de tentar novamente.';
        }
      } catch (err: any) {
        newMsg.status = 'pending';
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
        if (!response.ok) {
          newMsg.status = response.status >= 400 && response.status < 500 ? 'failed' : 'pending';
          newMsg.errorMessage = 'Envio não confirmado pelo provedor. Confira o histórico antes de tentar novamente.';
        }
      } catch (err: any) {
        newMsg.status = 'pending';
        newMsg.errorMessage = 'Envio não confirmado pelo provedor. Confira o histórico antes de tentar novamente.';
      }
    } else {
      newMsg.status = 'failed';
      newMsg.errorMessage = 'Provedor WhatsApp não configurado.';
    }

    return unitOfWork(async () => {
      const current = await communicationRepository.findMessageById(newMsg.id);
      if (!current) throw new Error('Intenção de envio indisponível.');
      if (current.status !== 'pending') return current;
      await communicationRepository.saveMessage(newMsg);
      // Recarregar dentro da transação preserva atualizações de entrada ocorridas durante o envio.
      const conv = await communicationRepository.findConversationById(options.conversationId);
      if (!conv) throw new CommunicationError('Conversa não encontrada.', 404);
      conv.lastMessageText = body;
      conv.lastMessageAt = new Date().toISOString();
      conv.updatedAt = new Date().toISOString();
      await communicationRepository.saveConversation(conv);
      await auditService.log({ actorId: options.actorId, actorName: options.senderName || 'DE FARDAS',
        actorRole: options.actorRole || 'atendimento', entityName: 'communication.messages', entityId: newMsg.id,
        action: newMsg.status === 'sent' ? 'SEND_WHATSAPP_MESSAGE' :
          newMsg.status === 'failed' ? 'WHATSAPP_MESSAGE_FAILED' : 'WHATSAPP_SEND_UNCONFIRMED',
        notes: `Tentativa de envio. Provedor: ${channel.provider}. Estado: ${newMsg.status}.` });
      return newMsg;
    });
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
    const externalId = text(payload.externalId, 'Identificador externo', 100);
    const fromPhone = text(payload.fromPhone, 'Telefone', 30);
    const fromName = text(payload.fromName, 'Nome do contato', 100, false);
    const body = text(payload.body, 'Mensagem recebida', 64000);
    const mediaUrl = text(payload.mediaUrl, 'URL de mídia', 2000, false) || undefined;
    const mediaMimeType = text(payload.mediaMimeType, 'Tipo de mídia', 80, false) || undefined;
    const cleanPhone = fromPhone.replace(/\D/g, '');
    if (!cleanPhone) throw new InputError('Telefone inválido.');
    return unitOfWork(async () => {
      const channel = await communicationRepository.findChannelById(payload.channelId);
      if (!channel?.isActive) throw new CommunicationError('Canal de recepção indisponível.', 503);
      const existing = await communicationRepository.findInboundByExternalId(payload.channelId, externalId);
      if (existing) return existing;
      const remoteJid = `${cleanPhone}@s.whatsapp.net`;

      // Localiza ou cria a conversa
      let conv = await communicationRepository.findConversationByRemoteJid(remoteJid, payload.channelId);
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
          customerName: fromName || matchedClient?.tradeName || matchedLead?.clientName || cleanPhone,
          customerPhone: fromPhone,
          status: 'open',
          unreadCount: 1,
          lastMessageText: body,
          lastMessageAt: new Date().toISOString(),
          tags: matchedClient ? ['cliente_ativo'] : ['novo_contato'],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        await communicationRepository.saveConversation(conv);
      } else {
        conv.unreadCount += 1;
        conv.lastMessageText = body;
        conv.lastMessageAt = new Date().toISOString();
        conv.updatedAt = new Date().toISOString();
        await communicationRepository.saveConversation(conv);
      }

      const newMsg: MessageEntity = {
        id: crypto.randomUUID(),
        conversationId: conv.id,
        externalId,
        direction: 'inbound',
        senderName: fromName || conv.customerName,
        messageType: mediaUrl ? 'image' : 'text',
        body,
        mediaUrl,
        mediaMimeType,
        status: 'delivered',
        createdAt: new Date().toISOString(),
      };

      await communicationRepository.saveMessage(newMsg);

      await auditService.log({
        actorName: fromName || cleanPhone,
        actorRole: 'cliente_whatsapp',
        entityName: 'communication.messages',
        entityId: newMsg.id,
        action: 'RECEIVE_WHATSAPP_MESSAGE',
        notes: `Mensagem recebida de ${conv.customerName} (${conv.customerPhone}).`,
      });

      return newMsg;
    });
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
