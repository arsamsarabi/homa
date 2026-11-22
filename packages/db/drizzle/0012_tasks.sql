CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" text NOT NULL,
	"name" text NOT NULL,
	"color" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_tags" (
	"task_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "task_tags_task_id_tag_id_pk" PRIMARY KEY("task_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" text NOT NULL,
	"uid" text DEFAULT gen_random_uuid()::text NOT NULL,
	"project_id" uuid,
	"parent_id" uuid,
	"title" text NOT NULL,
	"notes" text,
	"priority" smallint DEFAULT 0 NOT NULL,
	"due_date" date,
	"due_time" time(0),
	"tz" text NOT NULL,
	"rrule" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tasks_owner_uid_key" UNIQUE("owner_user_id","uid"),
	CONSTRAINT "tasks_priority" CHECK ("tasks"."priority" between 0 and 3),
	CONSTRAINT "tasks_due_time_needs_date" CHECK ("tasks"."due_time" is null or "tasks"."due_date" is not null),
	CONSTRAINT "tasks_rrule_needs_date" CHECK ("tasks"."rrule" is null or "tasks"."due_date" is not null)
);
--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_tags" ADD CONSTRAINT "task_tags_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_tags" ADD CONSTRAINT "task_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_parent_id_tasks_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "projects_owner_name_key" ON "projects" USING btree ("owner_user_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "tags_owner_name_key" ON "tags" USING btree ("owner_user_id",lower("name"));--> statement-breakpoint
CREATE INDEX "task_tags_tag_idx" ON "task_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "tasks_open_idx" ON "tasks" USING btree ("owner_user_id") WHERE "tasks"."completed_at" is null;--> statement-breakpoint
CREATE INDEX "tasks_completed_idx" ON "tasks" USING btree ("owner_user_id","completed_at") WHERE "tasks"."completed_at" is not null;--> statement-breakpoint
CREATE INDEX "tasks_parent_idx" ON "tasks" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "tasks_project_idx" ON "tasks" USING btree ("project_id");