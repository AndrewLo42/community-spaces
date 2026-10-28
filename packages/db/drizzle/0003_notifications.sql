CREATE TYPE "public"."email_digest" AS ENUM('daily', 'weekly', 'off');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('comment', 'reply', 'post_approved', 'post_declined', 'request_approved', 'role_changed', 'mod_queue');--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" "notification_type" NOT NULL,
	"group_key" text NOT NULL,
	"group_id" text,
	"post_id" text,
	"actor_id" text,
	"actor_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"data" jsonb,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_digest" "email_digest" DEFAULT 'weekly' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_digest_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notifications_user_recent_idx" ON "notifications" USING btree ("user_id","updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_unread_key_idx" ON "notifications" USING btree ("user_id","group_key") WHERE "notifications"."read_at" is null;