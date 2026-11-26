ALTER TABLE "circles" ADD COLUMN "color" text DEFAULT '#7d7fa3' NOT NULL;--> statement-breakpoint
ALTER TABLE "circles" ADD COLUMN "avatar_seed" text;--> statement-breakpoint
UPDATE "circles" SET "avatar_seed" = replace(gen_random_uuid()::text, '-', '') WHERE "avatar_seed" IS NULL;--> statement-breakpoint
ALTER TABLE "circles" ALTER COLUMN "avatar_seed" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "circles" ADD COLUMN "avatar_image" text;
