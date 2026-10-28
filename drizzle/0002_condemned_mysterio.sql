CREATE TABLE "core"."number_counters" (
	"kind" varchar(30) PRIMARY KEY NOT NULL,
	"value" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "producao"."production_orders" ADD CONSTRAINT "production_orders_quote_item_id_quote_items_id_fk" FOREIGN KEY ("quote_item_id") REFERENCES "crm"."quote_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_order_quote_item_version" ON "producao"."production_orders" USING btree ("quote_id","quote_item_id","quote_version");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_quote_receivable_kind" ON "financeiro"."transactions" USING btree ("quote_id","sub_type") WHERE "financeiro"."transactions"."type" = 'receber' AND "financeiro"."transactions"."sub_type" IN ('entrada_pedido', 'saldo_entrega');--> statement-breakpoint
ALTER TABLE "producao"."production_orders" ADD CONSTRAINT "orders_gate" CHECK ("producao"."production_orders"."stage" = 'aguardando_liberacao' OR ("producao"."production_orders"."art_approved" AND "producao"."production_orders"."entry_payment_confirmed" AND "producao"."production_orders"."entry_receipt_url" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "producao"."production_orders" ADD CONSTRAINT "orders_positive_pieces" CHECK ("producao"."production_orders"."total_pieces" > 0);--> statement-breakpoint
ALTER TABLE "financeiro"."transactions" ADD CONSTRAINT "transactions_positive_amount" CHECK ("financeiro"."transactions"."amount" > 0);
--> statement-breakpoint
INSERT INTO core.number_counters (kind, value)
SELECT 'quote', COALESCE(MAX(substring(quote_number from '[0-9]+$')::integer), 0) FROM crm.quotes
UNION ALL SELECT 'order', COALESCE(MAX(substring(order_number from '[0-9]+$')::integer), 0) FROM producao.production_orders
UNION ALL SELECT 'client', COALESCE(MAX(substring(code from '[0-9]+$')::integer), 0) FROM crm.clients
UNION ALL SELECT 'finance', COALESCE(MAX(substring(transaction_number from '[0-9]+$')::integer), 0) FROM financeiro.transactions
UNION ALL SELECT 'inventory', COALESCE(MAX(substring(code from '[0-9]+$')::integer), 0) FROM estoque.items
UNION ALL SELECT 'lead', COALESCE(MAX(substring(lead_number from '[0-9]+$')::integer), 0) FROM crm.leads
UNION ALL SELECT 'movement', COALESCE(MAX(substring(movement_number from '[0-9]+$')::integer), 0) FROM estoque.movements;
