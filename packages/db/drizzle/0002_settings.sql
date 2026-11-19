ALTER TABLE "users" ADD COLUMN "home_tz" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "secondary_calendar" text DEFAULT 'none' NOT NULL;