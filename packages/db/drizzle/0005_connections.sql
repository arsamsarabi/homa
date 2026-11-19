CREATE TABLE "connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" text NOT NULL,
	"provider" text NOT NULL,
	"credentials" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"last_error" text,
	"last_synced_at" timestamp with time zone,
	"sync_started_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "calendars" ADD COLUMN "connection_id" uuid;--> statement-breakpoint
ALTER TABLE "calendars" ADD COLUMN "read_only" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "calendars" ADD COLUMN "remote_id" text;--> statement-breakpoint
ALTER TABLE "calendars" ADD COLUMN "sync_token" text;--> statement-breakpoint
ALTER TABLE "calendars" ADD COLUMN "remote_etag" text;--> statement-breakpoint
ALTER TABLE "calendars" ADD COLUMN "remote_last_modified" text;--> statement-breakpoint
ALTER TABLE "calendars" ADD COLUMN "content_hash" text;--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "connections_owner_idx" ON "connections" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "connections_synced_idx" ON "connections" USING btree ("last_synced_at");--> statement-breakpoint
ALTER TABLE "calendars" ADD CONSTRAINT "calendars_connection_id_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "calendars_connection_idx" ON "calendars" USING btree ("connection_id");