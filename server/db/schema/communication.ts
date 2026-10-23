import { pgSchema, uuid, varchar, text, integer, boolean, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { clients } from './clients';
import { leads } from './leads';
import { users } from './users';

export const communicationSchema = pgSchema('communication');

export const channels = communicationSchema.table('channels', {
  id: uuid('id').primaryKey().defaultRandom(),
  provider: varchar('provider', { length: 30 }).notNull().$type<'meta_cloud' | 'wa_akg'>(),
  channelName: varchar('channel_name', { length: 100 }).notNull(),
  phoneNumber: varchar('phone_number', { length: 30 }).notNull(),
  status: varchar('status', { length: 30 }).notNull().default('disconnected').$type<
    'connected' | 'connecting' | 'disconnected' | 'qr_ready' | 'error'
  >(),
  qrCode: text('qr_code'),
  config: jsonb('config').default({}),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const conversations = communicationSchema.table('conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  channelId: uuid('channel_id').notNull().references(() => channels.id, { onDelete: 'cascade' }),
  clientId: uuid('client_id').references(() => clients.id, { onDelete: 'set null' }),
  leadId: uuid('lead_id').references(() => leads.id, { onDelete: 'set null' }),
  remoteJid: varchar('remote_jid', { length: 80 }).notNull(), // Ex: 559888412090@s.whatsapp.net
  customerName: varchar('customer_name', { length: 120 }).notNull(),
  customerPhone: varchar('customer_phone', { length: 30 }).notNull(),
  status: varchar('status', { length: 30 }).notNull().default('open').$type<
    'open' | 'pending' | 'resolved' | 'closed'
  >(),
  assignedAgentId: uuid('assigned_agent_id').references(() => users.id, { onDelete: 'set null' }),
  unreadCount: integer('unread_count').notNull().default(0),
  lastMessageText: text('last_message_text'),
  lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
  tags: jsonb('tags').default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_conversations_remote_jid').on(table.remoteJid),
  index('idx_conversations_status').on(table.status),
]);

export const messages = communicationSchema.table('messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
  externalId: varchar('external_id', { length: 100 }), // WhatsApp message ID for idempotency & deduplication
  direction: varchar('direction', { length: 10 }).notNull().$type<'inbound' | 'outbound'>(),
  senderName: varchar('sender_name', { length: 100 }),
  messageType: varchar('message_type', { length: 20 }).notNull().default('text').$type<
    'text' | 'image' | 'document' | 'audio' | 'template'
  >(),
  body: text('body').notNull(),
  mediaUrl: text('media_url'),
  mediaMimeType: varchar('media_mime_type', { length: 80 }),
  status: varchar('status', { length: 20 }).notNull().default('sent').$type<
    'pending' | 'sent' | 'delivered' | 'read' | 'failed'
  >(),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_messages_conversation').on(table.conversationId),
  index('idx_messages_external_id').on(table.externalId),
]);

export type WhatsAppChannel = typeof channels.$inferSelect;
export type NewWhatsAppChannel = typeof channels.$inferInsert;
export type Conversation = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
