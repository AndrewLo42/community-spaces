ALTER TYPE "public"."notification_type" ADD VALUE 'event_changed';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'event_cancelled';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'event_rsvp';--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "muted_notifications" text[] DEFAULT '{}'::text[] NOT NULL;