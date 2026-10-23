CREATE SCHEMA "core";
--> statement-breakpoint
CREATE SCHEMA "crm";
--> statement-breakpoint
CREATE SCHEMA "producao";
--> statement-breakpoint
CREATE SCHEMA "estoque";
--> statement-breakpoint
CREATE SCHEMA "financeiro";
--> statement-breakpoint
CREATE SCHEMA "communication";
--> statement-breakpoint
CREATE TABLE "core"."users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" varchar(120) NOT NULL,
	"email" varchar(150) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"role" varchar(30) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "core"."sessions" (
	"token" varchar(64) PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"user_role" varchar(30) NOT NULL,
	"user_full_name" varchar(120) NOT NULL,
	"user_email" varchar(150) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" varchar(45),
	"user_agent" varchar(255)
);
--> statement-breakpoint
CREATE TABLE "core"."audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"actor_name" varchar(120) NOT NULL,
	"actor_role" varchar(40) NOT NULL,
	"entity_name" varchar(60) NOT NULL,
	"entity_id" varchar(60) NOT NULL,
	"action" varchar(40) NOT NULL,
	"old_data" jsonb,
	"new_data" jsonb,
	"notes" text,
	"ip_address" varchar(45),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."event_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_type" varchar(60) NOT NULL,
	"payload" jsonb NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"retry_count" varchar(10) DEFAULT '0' NOT NULL,
	"error_message" text,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm"."clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(20) NOT NULL,
	"company_name" varchar(150) NOT NULL,
	"trade_name" varchar(150) NOT NULL,
	"cnpj" varchar(20) NOT NULL,
	"state_registration" varchar(30),
	"contact_name" varchar(100) NOT NULL,
	"phone" varchar(30) NOT NULL,
	"email" varchar(150) NOT NULL,
	"address" text NOT NULL,
	"city" varchar(80) DEFAULT 'São Luís' NOT NULL,
	"state" varchar(2) DEFAULT 'MA' NOT NULL,
	"segment" varchar(60) NOT NULL,
	"standard_uniform_notes" text,
	"total_orders_count" integer DEFAULT 0 NOT NULL,
	"total_spent" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clients_code_unique" UNIQUE("code"),
	CONSTRAINT "clients_cnpj_unique" UNIQUE("cnpj")
);
--> statement-breakpoint
CREATE TABLE "crm"."leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_number" varchar(30) NOT NULL,
	"client_name" varchar(120) NOT NULL,
	"company_name" varchar(150) NOT NULL,
	"phone" varchar(30) NOT NULL,
	"email" varchar(150) NOT NULL,
	"category" varchar(40) NOT NULL,
	"estimated_quantity" integer NOT NULL,
	"notes" text,
	"origin" varchar(40) DEFAULT 'portal_publico' NOT NULL,
	"status" varchar(30) DEFAULT 'novo' NOT NULL,
	"converted_quote_id" uuid,
	"assigned_seller_id" uuid,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leads_lead_number_unique" UNIQUE("lead_number")
);
--> statement-breakpoint
CREATE TABLE "crm"."quote_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quote_id" uuid NOT NULL,
	"category" varchar(40) NOT NULL,
	"model_name" varchar(150) NOT NULL,
	"fabric_name" varchar(100) NOT NULL,
	"fabric_color" varchar(60) NOT NULL,
	"sizes" jsonb NOT NULL,
	"total_quantity" integer NOT NULL,
	"material_unit_cost" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"outsourced_sewing_unit_cost" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"customization_unit_cost" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"freight_unit_cost" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"technical_loss_percentage" numeric(5, 2) DEFAULT '2.00' NOT NULL,
	"calculated_base_unit_cost" numeric(10, 2) NOT NULL,
	"markup_percentage" numeric(6, 2) NOT NULL,
	"suggested_unit_price" numeric(10, 2) NOT NULL,
	"negotiated_unit_price" numeric(10, 2) NOT NULL,
	"total_item_price" numeric(12, 2) NOT NULL,
	"customizations" jsonb DEFAULT '[]'::jsonb
);
--> statement-breakpoint
CREATE TABLE "crm"."quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quote_number" varchar(30) NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"client_id" uuid NOT NULL,
	"client_name" varchar(150) NOT NULL,
	"client_cnpj" varchar(20),
	"seller_id" uuid,
	"seller_name" varchar(100) NOT NULL,
	"commercial_status" varchar(30) DEFAULT 'rascunho' NOT NULL,
	"date" date NOT NULL,
	"valid_until" date NOT NULL,
	"total_base_cost" numeric(12, 2) NOT NULL,
	"markup_percentage" numeric(6, 2) NOT NULL,
	"suggested_total_amount" numeric(12, 2) NOT NULL,
	"negotiated_total_amount" numeric(12, 2) NOT NULL,
	"discount_amount" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"estimated_margin_percentage" numeric(6, 2) NOT NULL,
	"below_suggested_authorized" boolean DEFAULT false NOT NULL,
	"authorized_by_id" uuid,
	"authorized_by_name" varchar(120),
	"authorization_date" timestamp with time zone,
	"authorization_notes" text,
	"entry_percentage" numeric(5, 2) DEFAULT '50.00' NOT NULL,
	"entry_amount" numeric(12, 2) NOT NULL,
	"balance_amount" numeric(12, 2) NOT NULL,
	"payment_terms" text DEFAULT '50% Sinal (Liberação de Corte) + 50% na Entrega' NOT NULL,
	"production_lead_days" integer DEFAULT 16 NOT NULL,
	"art_approved" boolean DEFAULT false NOT NULL,
	"art_approved_by" varchar(100),
	"art_approval_date" timestamp with time zone,
	"art_file_url" text,
	"art_notes" text,
	"acceptance_channel" varchar(30) DEFAULT 'whatsapp',
	"acceptance_notes" text,
	"acceptance_timestamp" timestamp with time zone,
	"notes" text,
	"converted_order_id" uuid,
	"is_locked" boolean DEFAULT false NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quotes_quote_number_unique" UNIQUE("quote_number")
);
--> statement-breakpoint
CREATE TABLE "producao"."production_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_number" varchar(30) NOT NULL,
	"quote_id" uuid,
	"quote_version" integer DEFAULT 1 NOT NULL,
	"idempotency_key" varchar(120) NOT NULL,
	"client_id" uuid NOT NULL,
	"client_name" varchar(150) NOT NULL,
	"item_title" varchar(150) NOT NULL,
	"category" varchar(40) NOT NULL,
	"fabric_name" varchar(100) NOT NULL,
	"fabric_color" varchar(60) NOT NULL,
	"sizes" jsonb NOT NULL,
	"total_pieces" integer NOT NULL,
	"customizations" jsonb DEFAULT '[]'::jsonb,
	"commercial_status" varchar(30) DEFAULT 'aprovado' NOT NULL,
	"financial_status" varchar(30) DEFAULT 'entrada_pendente' NOT NULL,
	"stage" varchar(30) DEFAULT 'aguardando_liberacao' NOT NULL,
	"art_approved" boolean DEFAULT false NOT NULL,
	"art_approval_date" timestamp with time zone,
	"art_approved_by" varchar(100),
	"entry_payment_confirmed" boolean DEFAULT false NOT NULL,
	"entry_receipt_url" text,
	"entry_receipt_reference" varchar(80),
	"entry_verified_by_id" uuid,
	"entry_verification_date" timestamp with time zone,
	"priority" varchar(20) DEFAULT 'normal' NOT NULL,
	"creation_date" date NOT NULL,
	"target_delivery_date" date NOT NULL,
	"completion_date" date,
	"outsourced_partner" varchar(100),
	"partner_cost_per_piece" numeric(10, 2) DEFAULT '0.00',
	"technical_notes" text,
	"assigned_team" varchar(100) DEFAULT 'Mesa de Corte & Facção Terceirizada',
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "production_orders_order_number_unique" UNIQUE("order_number"),
	CONSTRAINT "production_orders_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "estoque"."items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(30) NOT NULL,
	"name" varchar(150) NOT NULL,
	"category" varchar(40) NOT NULL,
	"unit" varchar(20) NOT NULL,
	"physical_stock" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"allocated_stock" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"in_partners_custody_stock" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"min_stock" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"unit_cost_price" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"supplier" varchar(120),
	"location" varchar(80) DEFAULT 'Almoxarifado Central - Galpão 01',
	"last_restocked" date,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "items_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "estoque"."movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"movement_number" varchar(30) NOT NULL,
	"item_id" uuid NOT NULL,
	"production_order_id" uuid,
	"type" varchar(40) NOT NULL,
	"quantity" numeric(10, 2) NOT NULL,
	"unit" varchar(20) NOT NULL,
	"date" date NOT NULL,
	"reason" text NOT NULL,
	"reference_doc" varchar(80),
	"operator_id" uuid,
	"operator_name" varchar(120) NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "movements_movement_number_unique" UNIQUE("movement_number")
);
--> statement-breakpoint
CREATE TABLE "estoque"."partner_custody" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"partner_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"production_order_id" uuid,
	"remittance_movement_id" uuid,
	"sent_quantity" numeric(10, 2) NOT NULL,
	"returned_quantity" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"lost_quantity" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"unit" varchar(20) NOT NULL,
	"sent_date" date NOT NULL,
	"status" varchar(30) DEFAULT 'em_custodia' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "producao"."partners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(30) NOT NULL,
	"name" varchar(150) NOT NULL,
	"trade_name" varchar(150) NOT NULL,
	"cnpj_cpf" varchar(20),
	"phone" varchar(30) NOT NULL,
	"email" varchar(150),
	"address" text,
	"city" varchar(80) DEFAULT 'São Luís',
	"partner_type" varchar(40) NOT NULL,
	"capacity_pieces_per_month" varchar(20),
	"rating" numeric(3, 2) DEFAULT '5.00',
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "partners_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "financeiro"."transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_number" varchar(30) NOT NULL,
	"production_order_id" uuid,
	"quote_id" uuid,
	"type" varchar(20) NOT NULL,
	"sub_type" varchar(40) NOT NULL,
	"description" text NOT NULL,
	"category" varchar(60) NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"due_date" date NOT NULL,
	"paid_date" date,
	"status" varchar(20) DEFAULT 'pendente' NOT NULL,
	"payment_method" varchar(30) NOT NULL,
	"reference_id" varchar(60),
	"receipt_evidence_url" text,
	"receipt_voucher_number" varchar(80),
	"confirmed_by_id" uuid,
	"confirmed_by_name" varchar(120),
	"confirmation_notes" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transactions_transaction_number_unique" UNIQUE("transaction_number")
);
--> statement-breakpoint
CREATE TABLE "communication"."channels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" varchar(30) NOT NULL,
	"channel_name" varchar(100) NOT NULL,
	"phone_number" varchar(30) NOT NULL,
	"status" varchar(30) DEFAULT 'disconnected' NOT NULL,
	"qr_code" text,
	"config" jsonb DEFAULT '{}'::jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "communication"."conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_id" uuid NOT NULL,
	"client_id" uuid,
	"lead_id" uuid,
	"remote_jid" varchar(80) NOT NULL,
	"customer_name" varchar(120) NOT NULL,
	"customer_phone" varchar(30) NOT NULL,
	"status" varchar(30) DEFAULT 'open' NOT NULL,
	"assigned_agent_id" uuid,
	"unread_count" integer DEFAULT 0 NOT NULL,
	"last_message_text" text,
	"last_message_at" timestamp with time zone,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "communication"."messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"external_id" varchar(100),
	"direction" varchar(10) NOT NULL,
	"sender_name" varchar(100),
	"message_type" varchar(20) DEFAULT 'text' NOT NULL,
	"body" text NOT NULL,
	"media_url" text,
	"media_mime_type" varchar(80),
	"status" varchar(20) DEFAULT 'sent' NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "core"."sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."audit_logs" ADD CONSTRAINT "audit_logs_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "core"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm"."leads" ADD CONSTRAINT "leads_assigned_seller_id_users_id_fk" FOREIGN KEY ("assigned_seller_id") REFERENCES "core"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm"."quote_items" ADD CONSTRAINT "quote_items_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "crm"."quotes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm"."quotes" ADD CONSTRAINT "quotes_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "crm"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm"."quotes" ADD CONSTRAINT "quotes_seller_id_users_id_fk" FOREIGN KEY ("seller_id") REFERENCES "core"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm"."quotes" ADD CONSTRAINT "quotes_authorized_by_id_users_id_fk" FOREIGN KEY ("authorized_by_id") REFERENCES "core"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "producao"."production_orders" ADD CONSTRAINT "production_orders_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "crm"."quotes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "producao"."production_orders" ADD CONSTRAINT "production_orders_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "crm"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "producao"."production_orders" ADD CONSTRAINT "production_orders_entry_verified_by_id_users_id_fk" FOREIGN KEY ("entry_verified_by_id") REFERENCES "core"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estoque"."movements" ADD CONSTRAINT "movements_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "estoque"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estoque"."movements" ADD CONSTRAINT "movements_production_order_id_production_orders_id_fk" FOREIGN KEY ("production_order_id") REFERENCES "producao"."production_orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estoque"."movements" ADD CONSTRAINT "movements_operator_id_users_id_fk" FOREIGN KEY ("operator_id") REFERENCES "core"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estoque"."partner_custody" ADD CONSTRAINT "partner_custody_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "producao"."partners"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estoque"."partner_custody" ADD CONSTRAINT "partner_custody_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "estoque"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estoque"."partner_custody" ADD CONSTRAINT "partner_custody_production_order_id_production_orders_id_fk" FOREIGN KEY ("production_order_id") REFERENCES "producao"."production_orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estoque"."partner_custody" ADD CONSTRAINT "partner_custody_remittance_movement_id_movements_id_fk" FOREIGN KEY ("remittance_movement_id") REFERENCES "estoque"."movements"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financeiro"."transactions" ADD CONSTRAINT "transactions_production_order_id_production_orders_id_fk" FOREIGN KEY ("production_order_id") REFERENCES "producao"."production_orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financeiro"."transactions" ADD CONSTRAINT "transactions_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "crm"."quotes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financeiro"."transactions" ADD CONSTRAINT "transactions_confirmed_by_id_users_id_fk" FOREIGN KEY ("confirmed_by_id") REFERENCES "core"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication"."conversations" ADD CONSTRAINT "conversations_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "communication"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication"."conversations" ADD CONSTRAINT "conversations_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "crm"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication"."conversations" ADD CONSTRAINT "conversations_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "crm"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication"."conversations" ADD CONSTRAINT "conversations_assigned_agent_id_users_id_fk" FOREIGN KEY ("assigned_agent_id") REFERENCES "core"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication"."messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "communication"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_audit_logs_entity" ON "core"."audit_logs" USING btree ("entity_name","entity_id");--> statement-breakpoint
CREATE INDEX "idx_audit_logs_created_at" ON "core"."audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_event_log_status" ON "core"."event_log" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_event_log_created_at" ON "core"."event_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_quotes_client" ON "crm"."quotes" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "idx_quotes_status" ON "crm"."quotes" USING btree ("commercial_status");--> statement-breakpoint
CREATE INDEX "idx_orders_client" ON "producao"."production_orders" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "idx_orders_stage" ON "producao"."production_orders" USING btree ("stage");--> statement-breakpoint
CREATE INDEX "idx_orders_idempotency" ON "producao"."production_orders" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "idx_stock_movements_item" ON "estoque"."movements" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "idx_stock_movements_order" ON "estoque"."movements" USING btree ("production_order_id");--> statement-breakpoint
CREATE INDEX "idx_finance_status" ON "financeiro"."transactions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_finance_due_date" ON "financeiro"."transactions" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "idx_finance_order" ON "financeiro"."transactions" USING btree ("production_order_id");--> statement-breakpoint
CREATE INDEX "idx_conversations_remote_jid" ON "communication"."conversations" USING btree ("remote_jid");--> statement-breakpoint
CREATE INDEX "idx_conversations_status" ON "communication"."conversations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_messages_conversation" ON "communication"."messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "idx_messages_external_id" ON "communication"."messages" USING btree ("external_id");