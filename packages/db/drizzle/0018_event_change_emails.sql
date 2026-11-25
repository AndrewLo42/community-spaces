CREATE TABLE "event_change_emails" (
	"event_id" text PRIMARY KEY NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"location" text NOT NULL,
	"link" text NOT NULL,
	"actor_id" text,
	"version" integer DEFAULT 1 NOT NULL,
	"due_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "event_change_emails" ADD CONSTRAINT "event_change_emails_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_change_emails" ADD CONSTRAINT "event_change_emails_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;