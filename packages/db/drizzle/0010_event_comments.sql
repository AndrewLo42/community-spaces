ALTER TYPE "public"."notification_type" ADD VALUE 'event_comment' BEFORE 'reply';--> statement-breakpoint
ALTER TABLE "comments" ALTER COLUMN "post_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "event_id" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "comment_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "event_id" text;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comments_event_idx" ON "comments" USING btree ("event_id","created_at");--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_one_thread" CHECK (num_nonnulls("comments"."post_id", "comments"."event_id") = 1);