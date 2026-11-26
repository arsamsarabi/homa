CREATE TABLE "calendar_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"calendar_id" uuid NOT NULL,
	"grantee_user_id" text,
	"circle_id" uuid,
	"level" text NOT NULL,
	CONSTRAINT "calendar_grants_one_target" CHECK (("calendar_grants"."grantee_user_id" is not null and "calendar_grants"."circle_id" is null) or ("calendar_grants"."grantee_user_id" is null and "calendar_grants"."circle_id" is not null)),
	CONSTRAINT "calendar_grants_level" CHECK ("calendar_grants"."level" in ('none', 'freebusy', 'read', 'edit'))
);
--> statement-breakpoint
CREATE TABLE "shared_calendar_prefs" (
	"user_id" text NOT NULL,
	"calendar_id" uuid NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	CONSTRAINT "shared_calendar_prefs_user_id_calendar_id_pk" PRIMARY KEY("user_id","calendar_id")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "sharing_preset" text DEFAULT 'private' NOT NULL;--> statement-breakpoint
ALTER TABLE "calendars" ADD COLUMN "default_access" text;--> statement-breakpoint
ALTER TABLE "calendar_grants" ADD CONSTRAINT "calendar_grants_calendar_id_calendars_id_fk" FOREIGN KEY ("calendar_id") REFERENCES "public"."calendars"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_grants" ADD CONSTRAINT "calendar_grants_grantee_user_id_users_id_fk" FOREIGN KEY ("grantee_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_grants" ADD CONSTRAINT "calendar_grants_circle_id_circles_id_fk" FOREIGN KEY ("circle_id") REFERENCES "public"."circles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_calendar_prefs" ADD CONSTRAINT "shared_calendar_prefs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_calendar_prefs" ADD CONSTRAINT "shared_calendar_prefs_calendar_id_calendars_id_fk" FOREIGN KEY ("calendar_id") REFERENCES "public"."calendars"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_grants_person_key" ON "calendar_grants" USING btree ("calendar_id","grantee_user_id") WHERE "calendar_grants"."grantee_user_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_grants_circle_key" ON "calendar_grants" USING btree ("calendar_id","circle_id") WHERE "calendar_grants"."circle_id" is not null;--> statement-breakpoint
CREATE INDEX "calendar_grants_calendar_idx" ON "calendar_grants" USING btree ("calendar_id");--> statement-breakpoint
CREATE INDEX "calendar_grants_grantee_idx" ON "calendar_grants" USING btree ("grantee_user_id");--> statement-breakpoint
CREATE INDEX "calendar_grants_circle_idx" ON "calendar_grants" USING btree ("circle_id");