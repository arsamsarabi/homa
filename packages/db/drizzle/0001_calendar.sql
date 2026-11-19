CREATE TABLE "calendars" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" text NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT '#4a4e69' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_instances" (
	"event_id" uuid NOT NULL,
	"owner_user_id" text NOT NULL,
	"calendar_id" uuid NOT NULL,
	"recurrence_id" timestamp with time zone NOT NULL,
	"during" "tstzrange" NOT NULL,
	CONSTRAINT "event_instances_event_id_recurrence_id_pk" PRIMARY KEY("event_id","recurrence_id")
);
--> statement-breakpoint
CREATE TABLE "event_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"recurrence_id" timestamp with time zone NOT NULL,
	"summary" text,
	"description" text,
	"location" text,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_overrides_event_recurrence_key" UNIQUE("event_id","recurrence_id")
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"calendar_id" uuid NOT NULL,
	"owner_user_id" text NOT NULL,
	"uid" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"description" text,
	"location" text,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"all_day" boolean DEFAULT false NOT NULL,
	"tz" text NOT NULL,
	"rrule" text,
	"exdates" timestamp with time zone[] DEFAULT '{}' NOT NULL,
	"source" text DEFAULT 'native' NOT NULL,
	"expanded_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "events_owner_uid_key" UNIQUE("owner_user_id","uid")
);
--> statement-breakpoint
ALTER TABLE "calendars" ADD CONSTRAINT "calendars_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_instances" ADD CONSTRAINT "event_instances_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_overrides" ADD CONSTRAINT "event_overrides_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_calendar_id_calendars_id_fk" FOREIGN KEY ("calendar_id") REFERENCES "public"."calendars"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "calendars_owner_idx" ON "calendars" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "event_instances_during_idx" ON "event_instances" USING gist ("during");--> statement-breakpoint
CREATE INDEX "event_instances_owner_idx" ON "event_instances" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "events_calendar_idx" ON "events" USING btree ("calendar_id");--> statement-breakpoint
CREATE INDEX "events_recurring_idx" ON "events" USING btree ("expanded_until") WHERE "events"."rrule" is not null;