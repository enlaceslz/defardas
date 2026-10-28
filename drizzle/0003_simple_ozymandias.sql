CREATE TABLE "core"."public_settings" (
	"key" varchar(30) PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
