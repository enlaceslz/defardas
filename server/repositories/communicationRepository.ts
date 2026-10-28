/**
 * DE FARDAS ERP — Communication Repository (Drizzle ORM + Resilient Memory Store)
 * Gerencia persistência de canais WhatsApp (Meta Cloud API & WA-AKG), conversas e mensagens.
 */
import { eq, desc } from 'drizzle-orm';
import { db as drizzleDb } from '../db/index';
import { db as fallbackDb } from '../db/connection';
import { 
  channels, 
  conversations, 
  messages, 
  WhatsAppChannel, 
  Conversation, 
  Message, 
  NewWhatsAppChannel, 
  NewConversation, 
  NewMessage 
} from '../db/schema/communication';
import { WhatsAppChannelEntity, ConversationEntity, MessageEntity } from '../types/db';

export class CommunicationRepository {
  // Channels
  public async findAllChannels(): Promise<WhatsAppChannelEntity[]> {
    if (fallbackDb.isConnected()) {
      try {
        const rows = await drizzleDb.select().from(channels).orderBy(desc(channels.createdAt));
        return rows.map((r) => this.mapToChannelEntity(r));
      } catch (err) {
        console.warn('⚠️ [CommunicationRepository] Erro ao listar canais via Drizzle. Recorrendo à memória.', err);
      }
    }
    return Array.from(fallbackDb.channels.values());
  }

  public async findChannelById(id: string): Promise<WhatsAppChannelEntity | null> {
    if (fallbackDb.isConnected()) {
      try {
        const rows = await drizzleDb.select().from(channels).where(eq(channels.id, id)).limit(1);
        if (rows.length > 0) return this.mapToChannelEntity(rows[0]);
      } catch (err) {
        console.warn(`⚠️ [CommunicationRepository] Falha ao buscar canal ${id}.`, err);
      }
    }
    return fallbackDb.channels.get(id) || null;
  }

  public async saveChannel(channel: WhatsAppChannelEntity): Promise<WhatsAppChannelEntity> {
    fallbackDb.channels.set(channel.id, channel);

    if (fallbackDb.isConnected()) {
      try {
        const newRecord: NewWhatsAppChannel = {
          id: channel.id,
          provider: channel.provider,
          channelName: channel.channelName,
          phoneNumber: channel.phoneNumber,
          status: channel.status,
          qrCode: channel.qrCode || null,
          config: channel.config || {},
          isActive: channel.isActive,
        };

        await drizzleDb
          .insert(channels)
          .values(newRecord)
          .onConflictDoUpdate({
            target: channels.id,
            set: {
              status: newRecord.status,
              qrCode: newRecord.qrCode,
              config: newRecord.config,
              isActive: newRecord.isActive,
              updatedAt: new Date(),
            },
          });
      } catch (err) {
        console.error(`❌ [CommunicationRepository] Falha ao persistir canal ${channel.id}:`, err);
      }
    }

    return channel;
  }

  // Conversations
  public async findAllConversations(): Promise<ConversationEntity[]> {
    if (fallbackDb.isConnected()) {
      try {
        const rows = await drizzleDb.select().from(conversations).orderBy(desc(conversations.lastMessageAt));
        return rows.map((r) => this.mapToConversationEntity(r));
      } catch (err) {
        console.warn('⚠️ [CommunicationRepository] Erro ao listar conversas via Drizzle.', err);
      }
    }
    return Array.from(fallbackDb.conversations.values());
  }

  public async findConversationById(id: string): Promise<ConversationEntity | null> {
    if (fallbackDb.isConnected()) {
      try {
        const rows = await drizzleDb.select().from(conversations).where(eq(conversations.id, id)).limit(1);
        if (rows.length > 0) return this.mapToConversationEntity(rows[0]);
      } catch (err) {
        console.warn(`⚠️ [CommunicationRepository] Falha ao buscar conversa ${id}.`, err);
      }
    }
    return fallbackDb.conversations.get(id) || null;
  }

  public async findConversationByRemoteJid(remoteJid: string): Promise<ConversationEntity | null> {
    if (fallbackDb.isConnected()) {
      try {
        const rows = await drizzleDb.select().from(conversations).where(eq(conversations.remoteJid, remoteJid)).limit(1);
        if (rows.length > 0) return this.mapToConversationEntity(rows[0]);
      } catch (err) {
        console.warn(`⚠️ [CommunicationRepository] Falha ao buscar remoteJid ${remoteJid}.`, err);
      }
    }
    for (const c of fallbackDb.conversations.values()) {
      if (c.remoteJid === remoteJid) return c;
    }
    return null;
  }

  public async saveConversation(conv: ConversationEntity): Promise<ConversationEntity> {
    fallbackDb.conversations.set(conv.id, conv);

    if (fallbackDb.isConnected()) {
      try {
        const newRecord: NewConversation = {
          id: conv.id,
          channelId: conv.channelId,
          clientId: conv.clientId || null,
          leadId: conv.leadId || null,
          remoteJid: conv.remoteJid,
          customerName: conv.customerName,
          customerPhone: conv.customerPhone,
          status: conv.status,
          assignedAgentId: conv.assignedAgentId || null,
          unreadCount: conv.unreadCount,
          lastMessageText: conv.lastMessageText || null,
          lastMessageAt: conv.lastMessageAt ? new Date(conv.lastMessageAt) : null,
          tags: conv.tags || [],
        };

        await drizzleDb
          .insert(conversations)
          .values(newRecord)
          .onConflictDoUpdate({
            target: conversations.id,
            set: {
              status: newRecord.status,
              unreadCount: newRecord.unreadCount,
              lastMessageText: newRecord.lastMessageText,
              lastMessageAt: newRecord.lastMessageAt,
              tags: newRecord.tags,
              updatedAt: new Date(),
            },
          });
      } catch (err) {
        console.error(`❌ [CommunicationRepository] Falha ao persistir conversa ${conv.id}:`, err);
      }
    }

    return conv;
  }

  // Messages
  public async findMessagesByConversation(conversationId: string): Promise<MessageEntity[]> {
    if (fallbackDb.isConnected()) {
      try {
        const rows = await drizzleDb
          .select()
          .from(messages)
          .where(eq(messages.conversationId, conversationId))
          .orderBy(messages.createdAt);
        return rows.map((r) => this.mapToMessageEntity(r));
      } catch (err) {
        console.warn(`⚠️ [CommunicationRepository] Falha ao buscar mensagens da conversa ${conversationId}.`, err);
      }
    }
    return Array.from(fallbackDb.messages.values()).filter((m: any) => m.conversationId === conversationId);
  }

  public async saveMessage(msg: MessageEntity): Promise<MessageEntity> {
    fallbackDb.messages.set(msg.id, msg);

    if (fallbackDb.isConnected()) {
      try {
        const newRecord: NewMessage = {
          id: msg.id,
          conversationId: msg.conversationId,
          externalId: msg.externalId || null,
          direction: msg.direction,
          senderName: msg.senderName || null,
          messageType: msg.messageType,
          body: msg.body,
          mediaUrl: msg.mediaUrl || null,
          mediaMimeType: msg.mediaMimeType || null,
          status: msg.status,
          errorMessage: msg.errorMessage || null,
        };

        await drizzleDb
          .insert(messages)
          .values(newRecord)
          .onConflictDoUpdate({
            target: messages.id,
            set: {
              status: newRecord.status,
              errorMessage: newRecord.errorMessage,
            },
          });
      } catch (err) {
        console.error(`❌ [CommunicationRepository] Falha ao persistir mensagem ${msg.id}:`, err);
      }
    }

    return msg;
  }

  private mapToChannelEntity(row: WhatsAppChannel): WhatsAppChannelEntity {
    return {
      id: row.id,
      provider: row.provider,
      channelName: row.channelName,
      phoneNumber: row.phoneNumber,
      status: row.status,
      qrCode: row.qrCode || undefined,
      config: row.config || {},
      isActive: row.isActive,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private mapToConversationEntity(row: Conversation): ConversationEntity {
    return {
      id: row.id,
      channelId: row.channelId,
      clientId: row.clientId || undefined,
      leadId: row.leadId || undefined,
      remoteJid: row.remoteJid,
      customerName: row.customerName,
      customerPhone: row.customerPhone,
      status: row.status,
      assignedAgentId: row.assignedAgentId || undefined,
      unreadCount: row.unreadCount,
      lastMessageText: row.lastMessageText || undefined,
      lastMessageAt: row.lastMessageAt ? row.lastMessageAt.toISOString() : undefined,
      tags: (row.tags as string[]) || [],
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private mapToMessageEntity(row: Message): MessageEntity {
    return {
      id: row.id,
      conversationId: row.conversationId,
      externalId: row.externalId || undefined,
      direction: row.direction,
      senderName: row.senderName || undefined,
      messageType: row.messageType,
      body: row.body,
      mediaUrl: row.mediaUrl || undefined,
      mediaMimeType: row.mediaMimeType || undefined,
      status: row.status,
      errorMessage: row.errorMessage || undefined,
      createdAt: row.createdAt.toISOString(),
    };
  }
}

export const communicationRepository = new CommunicationRepository();
