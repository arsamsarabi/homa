CREATE TABLE "notification_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"notification_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text,
	CONSTRAINT "notification_deliveries_key" UNIQUE("notification_id","channel")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" text NOT NULL,
	"reminder_id" uuid,
	"event_id" uuid,
	"recurrence_id" timestamp with time zone,
	"title" text NOT NULL,
	"occurrence_start" timestamp with time zone NOT NULL,
	"all_day" boolean DEFAULT false NOT NULL,
	"fire_at" timestamp with time zone NOT NULL,
	"dedupe_key" text NOT NULL,
	"read_at" timestamp with time zone,
	"snoozed_until" timestamp with time zone,
	"done_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notifications_dedupe_key_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" text NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "push_subscriptions_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
CREATE TABLE "reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" text NOT NULL,
	"event_id" uuid,
	"minutes_before" integer,
	"action" text DEFAULT 'display' NOT NULL,
	"title" text,
	"starts_at" timestamp with time zone,
	"tz" text,
	"rrule" text,
	"next_fire_at" timestamp with time zone,
	"done_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reminders_kind" CHECK (("reminders"."event_id" is not null and "reminders"."minutes_before" is not null) or ("reminders"."event_id" is null and "reminders"."title" is not null and "reminders"."starts_at" is not null and "reminders"."tz" is not null))
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "default_reminder_minutes" integer DEFAULT 10;--> statement-breakpoint
ALTER TABLE "instance_settings" ADD COLUMN "vapid_public_key" text;--> statement-breakpoint
ALTER TABLE "instance_settings" ADD COLUMN "vapid_private_key" text;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_notification_id_notifications_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_reminder_id_reminders_id_fk" FOREIGN KEY ("reminder_id") REFERENCES "public"."reminders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notification_deliveries_due_idx" ON "notification_deliveries" USING btree ("next_attempt_at") WHERE "notification_deliveries"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "notifications_owner_idx" ON "notifications" USING btree ("owner_user_id","created_at");--> statement-breakpoint
CREATE INDEX "notifications_snoozed_idx" ON "notifications" USING btree ("snoozed_until") WHERE "notifications"."snoozed_until" is not null;--> statement-breakpoint
CREATE INDEX "push_subscriptions_owner_idx" ON "push_subscriptions" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "reminders_event_idx" ON "reminders" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "reminders_owner_idx" ON "reminders" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "reminders_next_fire_idx" ON "reminders" USING btree ("next_fire_at") WHERE "reminders"."next_fire_at" is not null;