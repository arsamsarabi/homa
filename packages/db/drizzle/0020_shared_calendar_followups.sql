ALTER TABLE "shared_calendar_prefs" ADD COLUMN "color" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "created_by_user_id" text;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
