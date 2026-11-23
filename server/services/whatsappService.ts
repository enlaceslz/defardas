/**
 * DE FARDAS ERP — WhatsApp Omnichannel Service
 * Suporta Provedor Oficial (Meta WhatsApp Cloud API) e Provedor QR Code (WA-AKG isolado).
 * Garante idempotência (externalId), normalização DDI +55, validação de mídia contra SSRF,
 * diagnóstico real de provedores, vínculo com Clientes/Leads/Parceiros/Fornecedores e templates ERP.
 */
import crypto from 'crypto';
import { communicationRepository } from '../repositories/communicationRepository';
import { clientRepository } from '../repositories/clientRepository';
import { leadRepository } from '../repositories/leadRepository';
import { partnerRepository } from '../repositories/partnerRepository';
import { supplierRepository } from '../repositories/supplierRepository';
import { auditService } from '../services/auditService';
import { MessageEntity, ConversationEntity, WhatsAppChannelEntity } from '../types/db';

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

export interface ChannelDiagnostics {
  configured: boolean;
  deliveryMode: 'live' | 'sandbox';
  webhookPath: string;
  missingEnvVars: string[];
  hasWebhookSecret: boolean;
}

const VALID_CONVERSATION_STATUSES: ConversationEntity['status'][] = ['open', 'pending', 'resolved', 'closed'];

const STAGE_DISPLAY_LABELS: Record<string, string> = {
  aguardando_liberacao: 'Aguardando Liberação (Gate A.3.2)',
  corte: 'Corte & Enfesto',
  bordado_silk: 'Bordado / Silk-Screen',
  costura: 'Costura & Facção',
  conferencia_qualidade: 'Conferência de Qualidade',
  retrabalho: 'Ajuste de Qualidade (Retrabalho)',
  expedicao: 'Pronto para Expedição / Retirada',
  entregue: 'Entregue',
};

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

/**
 * Valida URLs de mídia (artes, propostas, comprovantes) bloqueando esquemas perigosos
 * e endereços internos/privados (loopback, RFC-1918 e metadados de nuvem).
 */
export function isSafeWhatsAppMediaUrl(url: string): boolean {
  const trimmed = String(url || '').trim();
  if (!trimmed || trimmed.length > 2048) return false;
  if (trimmed.startsWith('/uploads/') && !trimmed.includes('..')) {
    return true;
  }
  if (trimmed.startsWith('s3://') && trimmed.length > 8 && !trimmed.includes('..')) {
    return true;
  }
  if (!trimmed.startsWith('https://') && !trimmed.startsWith('http://')) {
    return false;
  }
  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.toLowerCase();
    if (!host) return false;
    if (
      host === 'localhost' ||
      host === '::1' ||
      host === '[::1]' ||
      host.endsWith('.local') ||
      host.endsWith('.internal') ||
      /^127\./.test(host) ||
      /^10\./.test(host) ||
      /^169\.254\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^0\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(host) ||
      /^fc00:|^fd00:|^fe80:/i.test(host)
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function isPublicHttpUrl(url?: string): boolean {
  if (!url) return false;
  return (url.startsWith('https://') || url.startsWith('http://')) && isSafeWhatsAppMediaUrl(url);
}

/** Remove qualquer chave potencialmente sensível antes de retornar config de canal ao frontend */
export function sanitizeChannelConfig(config?: Record<string, any>): Record<string, any> {
  if (!config || typeof config !== 'object') return {};
  const clean: Record<string, any> = {};
  for (const [k, v] of Object.entries(config)) {
    if (/token|secret|key|password|auth/i.test(k)) continue;
    clean[k] = v;
  }
  return clean;
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

function formatIsoDateBR(iso?: string): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return iso || '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number = 8000
): Promise<globalThis.Response> {
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
    return process.env.META_WA_TOKEN?.trim() || '';
  }
  private get metaPhoneNumberId() {
    return process.env.META_WA_PHONE_NUMBER_ID?.trim() || '';
  }
  private get metaAppSecret() {
    return process.env.META_WA_APP_SECRET?.trim() || '';
  }
  private get waAkgEndpoint() {
    return (process.env.WA_AKG_ENDPOINT?.trim() || '').replace(/\/+$/, '');
  }
  private get waAkgApiKey() {
    return process.env.WA_AKG_API_KEY?.trim() || '';
  }

  /**
   * Retorna diagnóstico real do provedor sem expor tokens ou segredos.
   */
  public getChannelDiagnostics(channel: WhatsAppChannelEntity): ChannelDiagnostics {
    if (channel.provider === 'meta_cloud') {
      const missing: string[] = [];
      if (!this.metaToken) missing.push('META_WA_TOKEN');
      if (!this.metaPhoneNumberId) missing.push('META_WA_PHONE_NUMBER_ID');
      const configured = missing.length === 0;
      return {
        configured,
        deliveryMode: configured ? 'live' : 'sandbox',
        webhookPath: '/api/communication/webhooks/meta',
        missingEnvVars: missing,
        hasWebhookSecret: Boolean(this.metaAppSecret),
      };
    }

    const missing: string[] = [];
    if (!this.waAkgEndpoint) missing.push('WA_AKG_ENDPOINT');
    const configured = missing.length === 0;
    return {
      configured,
      deliveryMode: configured ? 'live' : 'sandbox',
      webhookPath: '/api/communication/webhooks/wa-akg',
      missingEnvVars: missing,
      hasWebhookSecret: Boolean(this.waAkgApiKey),
    };
  }

  /**
   * Testa a conectividade real com o provedor configurado (Meta Cloud API ou WA-AKG)
   * e atualiza o status do canal com honestidade (sem simulação falsa de conectado).
   */
  public async checkAndReconnectChannel(
    channel: WhatsAppChannelEntity,
    actor: { id?: string; fullName: string; role: string }
  ): Promise<{ channel: WhatsAppChannelEntity; diagnostics: ChannelDiagnostics; message: string }> {
    const diagnostics = this.getChannelDiagnostics(channel);
    const nowIso = new Date().toISOString();

    if (!diagnostics.configured) {
      channel.status = channel.provider === 'wa_akg' ? 'qr_ready' : 'disconnected';
      channel.updatedAt = nowIso;
      await communicationRepository.saveChannel(channel);

      auditService.log({
        actorId: actor.id,
        actorName: actor.fullName,
        actorRole: actor.role,
        entityName: 'communication.channels',
        entityId: channel.id,
        action: 'RECONNECT_WHATSAPP_CHANNEL',
        notes: `Verificação de canal ${channel.channelName}: modo sandbox local (variáveis pendentes: ${diagnostics.missingEnvVars.join(', ')}).`,
      });

      return {
        channel,
        diagnostics,
        message: `Canal em modo local/sandbox. Configure ${diagnostics.missingEnvVars.join(' e ')} no ambiente do servidor para conexão externa real.`,
      };
    }

    let message = 'Canal verificado e conectado com sucesso.';
    if (channel.provider === 'meta_cloud') {
      try {
        const res = await fetchWithTimeout(
          `https://graph.facebook.com/v21.0/${encodeURIComponent(this.metaPhoneNumberId)}?fields=display_phone_number,verified_name`,
          {
            method: 'GET',
            headers: { Authorization: `Bearer ${this.metaToken}` },
          },
          6000
        );
        if (res.ok) {
          const data = await res.json().catch(() => null);
          channel.status = 'connected';
          if (data?.display_phone_number && typeof data.display_phone_number === 'string') {
            channel.phoneNumber = data.display_phone_number;
          }
          message = `Meta Cloud API conectada${data?.verified_name ? ` (${data.verified_name})` : ''}.`;
        } else {
          const errData = await res.json().catch(() => null);
          channel.status = 'error';
          message = errData?.error?.message || `Meta Cloud API respondeu HTTP ${res.status}.`;
        }
      } catch (err: any) {
        channel.status = 'error';
        message = `Falha ao contatar Meta Cloud API: ${err?.message || 'tempo esgotado'}.`;
      }
    } else {
      try {
        const res = await fetchWithTimeout(
          `${this.waAkgEndpoint}/instance/connectionState`,
          {
            method: 'GET',
            headers: { apikey: this.waAkgApiKey },
          },
          5000
        );
        if (res.ok) {
          const data = await res.json().catch(() => null);
          const state = String(data?.state || data?.instance?.state || '').toLowerCase();
          if (state === 'open' || state === 'connected') {
            channel.status = 'connected';
            channel.qrCode = undefined;
            message = 'Container WA-AKG conectado e pronto para envios.';
          } else {
            channel.status = 'qr_ready';
            message = 'Container WA-AKG acessível. Escaneie o QR Code para parear o aparelho.';
          }
        } else {
          channel.status = 'error';
          message = `Container WA-AKG retornou HTTP ${res.status}.`;
        }
      } catch (err: any) {
        channel.status = 'error';
        message = `Container WA-AKG inacessível no endpoint configurado (${err?.message || 'timeout'}).`;
      }
    }

    channel.updatedAt = new Date().toISOString();
    await communicationRepository.saveChannel(channel);

    auditService.log({
      actorId: actor.id,
      actorName: actor.fullName,
      actorRole: actor.role,
      entityName: 'communication.channels',
      entityId: channel.id,
      action: 'RECONNECT_WHATSAPP_CHANNEL',
      notes: `Reconexão/diagnóstico do canal ${channel.channelName} (${channel.provider}): status '${channel.status}'.`,
    });

    return { channel, diagnostics, message };
  }

  /**
   * Localiza ou cria uma conversa com normalização canônica de telefone e vínculo automático
   * ao CRM (Clientes/Leads), Parceiros/Facções e Fornecedores.
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
      let changed = false;
      if (existing.status === 'closed' || existing.status === 'resolved') {
        existing.status = 'open';
        changed = true;
      }
      if (params.clientId && !existing.clientId) {
        existing.clientId = params.clientId;
        changed = true;
      }
      if (changed) {
        existing.updatedAt = new Date().toISOString();
        await communicationRepository.saveConversation(existing);
      }
      return existing;
    }

    const [allClients, allLeads, allPartners, allSuppliers, allChannels] = await Promise.all([
      clientRepository.findAll(),
      leadRepository.findAll(),
      partnerRepository.findAll(),
      supplierRepository.findAll(),
      communicationRepository.findAllChannels(),
    ]);

    const matchedClient =
      (params.clientId ? allClients.find((c) => c.id === params.clientId) : undefined) ||
      allClients.find((c) => phonesMatch(c.phone, canonicalDigits));
    const matchedLead = allLeads.find((l) => phonesMatch(l.phone, canonicalDigits));
    const matchedPartner = allPartners.find((p) => phonesMatch(p.phone, canonicalDigits));
    const matchedSupplier = allSuppliers.find((s) => phonesMatch(s.phone, canonicalDigits));

    const targetChannel =
      (params.channelId ? allChannels.find((c) => c.id === params.channelId) : undefined) ||
      allChannels.find((c) => c.isActive && c.status === 'connected') ||
      allChannels.find((c) => c.isActive) ||
      allChannels[0];

    if (!targetChannel) {
      throw new Error('Nenhum canal WhatsApp configurado no ERP.');
    }

    const tags: string[] = [];
    if (matchedClient) tags.push('cliente_ativo');
    if (matchedLead) tags.push('lead_crm');
    if (matchedPartner) tags.push('parceiro_faccao');
    if (matchedSupplier) tags.push('fornecedor_insumos');
    if (tags.length === 0) tags.push('atendimento_ativo');

    const now = new Date().toISOString();
    const conv: ConversationEntity = {
      id: crypto.randomUUID(),
      channelId: targetChannel.id,
      clientId: matchedClient?.id,
      leadId: matchedLead?.id,
      remoteJid,
      customerName:
        params.customerName?.trim().slice(0, 120) ||
        matchedClient?.contactName ||
        matchedClient?.tradeName ||
        matchedSupplier?.tradeName ||
        matchedPartner?.tradeName ||
        matchedLead?.clientName ||
        formatBrPhoneDisplay(canonicalDigits),
      customerPhone: formatBrPhoneDisplay(canonicalDigits),
      status: 'open',
      unreadCount: 0,
      lastMessageText: '',
      lastMessageAt: now,
      tags,
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
   * Envia mensagem de texto, imagem, documento ou template via canal configurado com validação HTTP real.
   */
  public async sendMessage(options: SendMessageOptions): Promise<MessageEntity> {
    const cleanBody = String(options.body || '').trim();
    if (!cleanBody) {
      throw new Error('O corpo da mensagem não pode estar vazio.');
    }
    if (cleanBody.length > 4096) {
      throw new Error('A mensagem excede o limite de 4.096 caracteres do WhatsApp.');
    }
    if (options.mediaUrl && !isSafeWhatsAppMediaUrl(options.mediaUrl)) {
      throw new Error('URL de mídia não permitida. Use um link público https://, s3:// ou /uploads/.');
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
    const cleanMediaUrl = options.mediaUrl?.trim();
    const resolvedType: MessageEntity['messageType'] =
      options.messageType ||
      (cleanMediaUrl
        ? /\.(png|jpe?g|webp|gif)(\?|$)/i.test(cleanMediaUrl)
          ? 'image'
          : 'document'
        : 'text');

    const newMsg: MessageEntity = {
      id: messageId,
      conversationId: conv.id,
      externalId,
      direction: 'outbound',
      senderName: options.senderName || 'Atendimento DE FARDAS',
      messageType: resolvedType,
      body: cleanBody,
      mediaUrl: cleanMediaUrl,
      mediaMimeType: options.mediaMimeType,
      status: 'sent',
      createdAt: new Date().toISOString(),
    };

    // Disparo real conforme provedor configurado com validação de resposta HTTP
    if (channel.provider === 'meta_cloud' && this.metaToken && this.metaPhoneNumberId) {
      try {
        const metaUrl = `https://graph.facebook.com/v21.0/${encodeURIComponent(this.metaPhoneNumberId)}/messages`;
        const canSendPublicMedia = Boolean(cleanMediaUrl && isPublicHttpUrl(cleanMediaUrl));
        let metaPayload: Record<string, any>;

        if (canSendPublicMedia && resolvedType === 'image') {
          metaPayload = {
            messaging_product: 'whatsapp',
            to: targetDigits,
            type: 'image',
            image: { link: cleanMediaUrl, caption: cleanBody },
          };
        } else if (canSendPublicMedia && resolvedType === 'document') {
          metaPayload = {
            messaging_product: 'whatsapp',
            to: targetDigits,
            type: 'document',
            document: { link: cleanMediaUrl, caption: cleanBody },
          };
        } else {
          const composedText = cleanMediaUrl ? `${cleanBody}\n\nAnexo: ${cleanMediaUrl}` : cleanBody;
          metaPayload = {
            messaging_product: 'whatsapp',
            to: targetDigits,
            type: 'text',
            text: { body: composedText },
          };
        }

        const res = await fetchWithTimeout(metaUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.metaToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(metaPayload),
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
        const canSendPublicMedia = Boolean(cleanMediaUrl && isPublicHttpUrl(cleanMediaUrl));
        const endpointPath = canSendPublicMedia ? '/message/sendMedia' : '/message/sendText';
        const waBody = canSendPublicMedia
          ? {
              number: targetDigits,
              mediatype: resolvedType === 'image' ? 'image' : 'document',
              media: cleanMediaUrl,
              caption: cleanBody,
            }
          : {
              number: targetDigits,
              text: cleanMediaUrl ? `${cleanBody}\n\nAnexo: ${cleanMediaUrl}` : cleanBody,
            };

        const res = await fetchWithTimeout(`${this.waAkgEndpoint}${endpointPath}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: this.waAkgApiKey,
          },
          body: JSON.stringify(waBody),
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
    if (canonicalDigits.length < 10) {
      throw new Error('Telefone de origem inválido no payload do webhook.');
    }

    const safeBody = String(payload.body || '').trim().slice(0, 4096) || '[Mídia recebida]';
    const safeName = String(payload.fromName || '').trim().slice(0, 120);
    const safeMediaUrl =
      payload.mediaUrl && isSafeWhatsAppMediaUrl(payload.mediaUrl) ? payload.mediaUrl.trim() : undefined;

    const remoteJid = `${canonicalDigits}@s.whatsapp.net`;

    // Resolver canal de destino dinamicamente por ID ou provedor (sempre UUID válido)
    let resolvedChannelId = payload.channelId;
    if (!resolvedChannelId && payload.provider) {
      const ch = await communicationRepository.findChannelByProvider(payload.provider);
      resolvedChannelId = ch?.id;
    }
    if (!resolvedChannelId) {
      const all = await communicationRepository.findAllChannels();
      resolvedChannelId = all[0]?.id;
    }
    if (!resolvedChannelId) {
      throw new Error('Nenhum canal WhatsApp cadastrado para receber mensagens.');
    }

    let conv = await communicationRepository.findConversationByRemoteJid(remoteJid);
    if (!conv) {
      const [allClients, allLeads, allPartners, allSuppliers] = await Promise.all([
        clientRepository.findAll(),
        leadRepository.findAll(),
        partnerRepository.findAll(),
        supplierRepository.findAll(),
      ]);

      const matchedClient = allClients.find((c) => phonesMatch(c.phone, canonicalDigits));
      const matchedLead = allLeads.find((l) => phonesMatch(l.phone, canonicalDigits));
      const matchedPartner = allPartners.find((p) => phonesMatch(p.phone, canonicalDigits));
      const matchedSupplier = allSuppliers.find((s) => phonesMatch(s.phone, canonicalDigits));

      const tags: string[] = [];
      if (matchedClient) tags.push('cliente_ativo');
      if (matchedLead) tags.push('lead_crm');
      if (matchedPartner) tags.push('parceiro_faccao');
      if (matchedSupplier) tags.push('fornecedor_insumos');
      if (tags.length === 0) tags.push('novo_contato');

      const now = new Date().toISOString();
      conv = {
        id: crypto.randomUUID(),
        channelId: resolvedChannelId,
        clientId: matchedClient?.id,
        leadId: matchedLead?.id,
        remoteJid,
        customerName:
          safeName ||
          matchedClient?.contactName ||
          matchedClient?.tradeName ||
          matchedSupplier?.tradeName ||
          matchedPartner?.tradeName ||
          matchedLead?.clientName ||
          formatBrPhoneDisplay(canonicalDigits),
        customerPhone: formatBrPhoneDisplay(canonicalDigits),
        status: 'open',
        unreadCount: 1,
        lastMessageText: safeBody,
        lastMessageAt: now,
        tags,
        createdAt: now,
        updatedAt: now,
      };
      await communicationRepository.saveConversation(conv);
    } else {
      conv.unreadCount += 1;
      conv.lastMessageText = safeBody;
      conv.lastMessageAt = new Date().toISOString();
      if (conv.status === 'resolved' || conv.status === 'closed') {
        conv.status = 'open';
      }
      conv.updatedAt = new Date().toISOString();
      await communicationRepository.saveConversation(conv);
    }

    const messageType: MessageEntity['messageType'] = safeMediaUrl
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
      senderName: safeName || conv.customerName,
      messageType,
      body: safeBody,
      mediaUrl: safeMediaUrl,
      mediaMimeType: payload.mediaMimeType,
      status: 'delivered',
      createdAt: new Date().toISOString(),
    };

    await communicationRepository.saveMessage(newMsg);

    auditService.log({
      actorName: safeName || canonicalDigits,
      actorRole: 'cliente_whatsapp',
      entityName: 'communication.messages',
      entityId: newMsg.id,
      action: 'RECEIVE_WHATSAPP_MESSAGE',
      notes: `Mensagem recebida de ${conv.customerName} (${conv.customerPhone}).`,
    });

    return newMsg;
  }

  /**
   * Atualiza status de entrega/leitura vindo do webhook da Meta ou WA-AKG (sent -> delivered -> read -> failed).
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
   * Template 1: Envio de Proposta Comercial para o Cliente
   */
  public async sendQuoteTemplate(
    quoteNumber: string,
    clientPhone: string,
    clientName: string,
    amount: number,
    actor?: { id?: string; fullName: string; role: string }
  ) {
    const body = `Olá, ${clientName}!\n\nSua proposta comercial *${quoteNumber}* da *DE FARDAS* no valor total de *${formatBRL(amount)}* está pronta!\n\n*Condições:* 50% de Sinal para Liberação de Corte + 50% na Entrega.\n\nPara aprovar ou solicitar ajustes no layout, basta responder a esta mensagem.`;
    return this.findOrCreateAndSend(clientPhone, clientName, body, 'template', actor);
  }

  /**
   * Template 2: Confirmação de Sinal 50% e Liberação de OP (Gate A.3.2)
   */
  public async sendDownpaymentConfirmedTemplate(
    orderNumber: string,
    clientPhone: string,
    clientName: string,
    voucherNumber: string,
    actor?: { id?: string; fullName: string; role: string }
  ) {
    const body = `*Comprovante Confirmado — DE FARDAS*\n\nOlá, ${clientName}! Confirmamos o recebimento do sinal de 50% referente à Ordem de Produção *${orderNumber}* (Autenticação: ${voucherNumber}).\n\nO requisito financeiro do Portão Fabril foi liberado! Avisaremos a cada etapa da produção.`;
    return this.findOrCreateAndSend(clientPhone, clientName, body, 'template', actor);
  }

  /**
   * Template 3: Solicitação Formal de Aprovação de Arte / Layout (Gate A.3.2)
   */
  public async sendArtApprovalTemplate(params: {
    clientPhone: string;
    clientName: string;
    referenceNumber: string;
    artVersion?: number;
    artFileUrl?: string;
    actor?: { id?: string; fullName: string; role: string };
  }) {
    const verLabel = params.artVersion ? ` (v${params.artVersion})` : '';
    const linkLine = params.artFileUrl ? `\nArquivo da arte: ${params.artFileUrl}\n` : '\n';
    const body = `*Aprovação de Layout / Arte${verLabel} — DE FARDAS*\n\nOlá, ${params.clientName}! A arte personalizada referente a *${params.referenceNumber}* está disponível para conferência.${linkLine}\nPor favor, responda com *APROVADO* para liberarmos o corte na fábrica (Gate A.3.2), ou informe os ajustes desejados.`;
    return this.findOrCreateAndSend(
      params.clientPhone,
      params.clientName,
      body,
      'template',
      params.actor,
      params.artFileUrl && isSafeWhatsAppMediaUrl(params.artFileUrl) ? params.artFileUrl : undefined
    );
  }

  /**
   * Template 4: Atualização de Etapa de Produção / Prazo de Entrega (PCP)
   */
  public async sendOrderStageUpdateTemplate(params: {
    clientPhone: string;
    clientName: string;
    orderNumber: string;
    stage: string;
    targetDeliveryDate?: string;
    actor?: { id?: string; fullName: string; role: string };
  }) {
    const stageLabel = STAGE_DISPLAY_LABELS[params.stage] || params.stage;
    const deliveryLine = params.targetDeliveryDate
      ? `\n*Previsão de entrega:* ${formatIsoDateBR(params.targetDeliveryDate)}`
      : '';
    const body = `*Atualização de Produção — DE FARDAS*\n\nOlá, ${params.clientName}! Sua Ordem de Produção *${params.orderNumber}* avançou para a etapa: *${stageLabel}*.${deliveryLine}\n\nQualquer dúvida, nossa equipe está à disposição por aqui!`;
    return this.findOrCreateAndSend(params.clientPhone, params.clientName, body, 'template', params.actor);
  }

  /**
   * Template 5: Envio de Pedido de Compra (PC) ao Fornecedor
   */
  public async sendPurchaseOrderTemplate(params: {
    supplierPhone: string;
    supplierName: string;
    poNumber: string;
    amount: number;
    expectedDeliveryDate?: string;
    itemsSummary?: string;
    actor?: { id?: string; fullName: string; role: string };
  }) {
    const deliveryLine = params.expectedDeliveryDate
      ? `\n*Entrega prevista:* ${formatIsoDateBR(params.expectedDeliveryDate)}`
      : '';
    const itemsLine = params.itemsSummary ? `\n*Itens:* ${params.itemsSummary}` : '';
    const body = `*Pedido de Compra ${params.poNumber} — DE FARDAS*\n\nOlá, ${params.supplierName}! Segue nosso Pedido de Compra *${params.poNumber}* no valor total de *${formatBRL(params.amount)}*.${itemsLine}${deliveryLine}\n\nPor favor, confirme o recebimento, disponibilidade e previsão de faturamento/envio.`;
    return this.findOrCreateAndSend(params.supplierPhone, params.supplierName, body, 'template', params.actor);
  }

  /**
   * Template 6: Lembrete de Pagamento (Sinal 50% ou Saldo na Entrega)
   */
  public async sendPaymentReminderTemplate(params: {
    clientPhone: string;
    clientName: string;
    referenceNumber: string;
    amount: number;
    dueDate?: string;
    pixKey?: string;
    paymentLabel?: string;
    actor?: { id?: string; fullName: string; role: string };
  }) {
    const label = params.paymentLabel || 'Sinal de 50% (Liberação de Produção)';
    const dueLine = params.dueDate ? `\n*Vencimento:* ${formatIsoDateBR(params.dueDate)}` : '';
    const pixLine = params.pixKey
      ? `\n*Chave PIX oficial:* ${params.pixKey}`
      : '\n*Chave PIX oficial:* CNPJ da DE FARDAS';
    const body = `*Lembrete Financeiro — DE FARDAS*\n\nOlá, ${params.clientName}! Lembramos que está em aberto o título de *${label}* referente a *${params.referenceNumber}* no valor de *${formatBRL(params.amount)}*.${dueLine}${pixLine}\n\nAssim que efetuar o pagamento, envie o comprovante por aqui para registro e liberação imediata!`;
    return this.findOrCreateAndSend(params.clientPhone, params.clientName, body, 'template', params.actor);
  }

  private async findOrCreateAndSend(
    phone: string,
    name: string,
    body: string,
    messageType: 'text' | 'template' = 'template',
    actor?: { id?: string; fullName: string; role: string },
    mediaUrl?: string
  ) {
    const conv = await this.startOrFindConversation({
      phone,
      customerName: name,
      actorId: actor?.id,
      actorName: actor?.fullName || 'DE FARDAS (Sistema ERP)',
      actorRole: actor?.role || 'system',
    });

    const msg = await this.sendMessage({
      conversationId: conv.id,
      body,
      messageType,
      mediaUrl,
      senderId: actor?.id,
      senderName: actor?.fullName || 'DE FARDAS (Sistema ERP)',
      senderRole: actor?.role || 'system',
    });

    return { conversation: conv, message: msg };
  }
}

export const whatsAppService = new WhatsAppService();
