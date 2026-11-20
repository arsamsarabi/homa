ALTER TABLE "calendars" ALTER COLUMN "color" SET DEFAULT '#7d7fa3';--> statement-breakpoint
ALTER TABLE "calendars" ADD COLUMN "hidden" boolean DEFAULT false NOT NULL;