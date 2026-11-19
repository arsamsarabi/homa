CREATE TABLE "outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"calendar_id" uuid NOT NULL,
	"uid" text NOT NULL,
	"kind" text NOT NULL,
	"event_id" uuid,
	"href" text,
	"etag" text,
	"version" integer DEFAULT 1 NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outbox_calendar_uid_key" UNIQUE("calendar_id","uid")
);
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "remote_href" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "remote_etag" text;--> statement-breakpoint
ALTER TABLE "connections" ADD COLUMN "label" text;--> statement-breakpoint
ALTER TABLE "connections" ADD COLUMN "notice" text;--> statement-breakpoint
ALTER TABLE "connections" ADD COLUMN "notice_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "outbox" ADD CONSTRAINT "outbox_connection_id_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbox" ADD CONSTRAINT "outbox_calendar_id_calendars_id_fk" FOREIGN KEY ("calendar_id") REFERENCES "public"."calendars"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "outbox_due_idx" ON "outbox" USING btree ("connection_id","next_attempt_at");--> statement-breakpoint
CREATE INDEX "events_remote_href_idx" ON "events" USING btree ("calendar_id","remote_href") WHERE "events"."remote_href" is not null;