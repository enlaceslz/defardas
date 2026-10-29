ALTER TABLE "producao"."production_orders" ADD COLUMN "revision" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE FUNCTION "producao"."bump_order_revision"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.revision := OLD.revision + 1;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "production_orders_revision" BEFORE UPDATE ON "producao"."production_orders"
FOR EACH ROW EXECUTE FUNCTION "producao"."bump_order_revision"();
