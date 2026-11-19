CREATE TABLE "instance_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"instance_name" text DEFAULT 'Homa' NOT NULL,
	"sign_ups" text DEFAULT 'open' NOT NULL,
	"default_language" text DEFAULT 'en' NOT NULL,
	"default_home_tz" text,
	"default_secondary_calendar" text DEFAULT 'none' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "instance_settings_single_row" CHECK ("instance_settings"."id" = 1)
);
--> statement-breakpoint
-- The single row, with the defaults above.
INSERT INTO "instance_settings" DEFAULT VALUES;
