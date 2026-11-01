ALTER TYPE "public"."notification_type" ADD VALUE 'event_reminder';--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "reminded_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "events_reminder_due_idx" ON "events" USING btree ("starts_at") WHERE "events"."reminded_at" is null and "events"."cancelled_at" is null;