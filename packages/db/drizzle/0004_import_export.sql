ALTER TABLE "events" DROP CONSTRAINT "events_owner_uid_key";--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "rdates" timestamp with time zone[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_calendar_uid_key" UNIQUE("calendar_id","uid");