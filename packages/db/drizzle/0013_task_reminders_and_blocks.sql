ALTER TABLE "reminders" DROP CONSTRAINT "reminders_kind";--> statement-breakpoint
ALTER TABLE "notification_channels" ALTER COLUMN "reminder_kinds" SET DEFAULT '{event,standalone,task}'::text[];--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "task_id" uuid;--> statement-breakpoint
ALTER TABLE "reminders" ADD COLUMN "task_id" uuid;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "scheduled_event_id" uuid;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_scheduled_event_id_events_id_fk" FOREIGN KEY ("scheduled_event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reminders_task_idx" ON "reminders" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "tasks_scheduled_event_idx" ON "tasks" USING btree ("scheduled_event_id");--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_kind" CHECK (("reminders"."event_id" is not null and "reminders"."task_id" is null and "reminders"."minutes_before" is not null) or ("reminders"."task_id" is not null and "reminders"."event_id" is null and "reminders"."minutes_before" is not null) or ("reminders"."event_id" is null and "reminders"."task_id" is null and "reminders"."title" is not null and "reminders"."starts_at" is not null and "reminders"."tz" is not null));--> statement-breakpoint
-- Channels that take standalone reminders also get task reminders, like new channels.
UPDATE "notification_channels" SET "reminder_kinds" = array_append("reminder_kinds", 'task') WHERE 'standalone' = ANY("reminder_kinds");
