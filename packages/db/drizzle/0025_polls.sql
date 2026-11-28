CREATE TABLE "poll_answers" (
	"participant_id" uuid NOT NULL,
	"slot_id" uuid NOT NULL,
	"rank" integer,
	CONSTRAINT "poll_answers_participant_id_slot_id_pk" PRIMARY KEY("participant_id","slot_id"),
	CONSTRAINT "poll_answers_rank" CHECK ("poll_answers"."rank" is null or "poll_answers"."rank" >= 1)
);
--> statement-breakpoint
CREATE TABLE "poll_events" (
	"event_id" uuid PRIMARY KEY NOT NULL,
	"poll_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"organizer" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "poll_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"poll_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"holds" boolean DEFAULT false NOT NULL,
	"responded_at" timestamp with time zone,
	CONSTRAINT "poll_participants_poll_user_key" UNIQUE("poll_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "poll_slots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"poll_id" uuid NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	CONSTRAINT "poll_slots_poll_start_key" UNIQUE("poll_id","start_at"),
	CONSTRAINT "poll_slots_order" CHECK ("poll_slots"."end_at" > "poll_slots"."start_at")
);
--> statement-breakpoint
CREATE TABLE "polls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizer_user_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"location" text,
	"duration_minutes" integer NOT NULL,
	"tz" text NOT NULL,
	"mode" text DEFAULT 'slots' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"deadline" timestamp with time zone,
	"quorum" integer,
	"holds" boolean DEFAULT false NOT NULL,
	"calendar_id" uuid,
	"final_slot_id" uuid,
	"reminded_at" timestamp with time zone,
	"opened_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"finalized_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "polls_duration" CHECK ("polls"."duration_minutes" between 5 and 1440),
	CONSTRAINT "polls_quorum" CHECK ("polls"."quorum" is null or "polls"."quorum" >= 1)
);
--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "poll_id" uuid;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "poll_event" text;--> statement-breakpoint
ALTER TABLE "poll_answers" ADD CONSTRAINT "poll_answers_participant_id_poll_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."poll_participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poll_answers" ADD CONSTRAINT "poll_answers_slot_id_poll_slots_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."poll_slots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poll_events" ADD CONSTRAINT "poll_events_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poll_events" ADD CONSTRAINT "poll_events_poll_id_polls_id_fk" FOREIGN KEY ("poll_id") REFERENCES "public"."polls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poll_events" ADD CONSTRAINT "poll_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poll_participants" ADD CONSTRAINT "poll_participants_poll_id_polls_id_fk" FOREIGN KEY ("poll_id") REFERENCES "public"."polls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poll_participants" ADD CONSTRAINT "poll_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poll_slots" ADD CONSTRAINT "poll_slots_poll_id_polls_id_fk" FOREIGN KEY ("poll_id") REFERENCES "public"."polls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "polls" ADD CONSTRAINT "polls_organizer_user_id_users_id_fk" FOREIGN KEY ("organizer_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "polls" ADD CONSTRAINT "polls_calendar_id_calendars_id_fk" FOREIGN KEY ("calendar_id") REFERENCES "public"."calendars"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "poll_events_poll_idx" ON "poll_events" USING btree ("poll_id");--> statement-breakpoint
CREATE INDEX "poll_participants_user_idx" ON "poll_participants" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "polls_organizer_idx" ON "polls" USING btree ("organizer_user_id");--> statement-breakpoint
CREATE INDEX "polls_open_deadline_idx" ON "polls" USING btree ("deadline") WHERE "polls"."status" = 'open';--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_poll_id_polls_id_fk" FOREIGN KEY ("poll_id") REFERENCES "public"."polls"("id") ON DELETE cascade ON UPDATE no action;