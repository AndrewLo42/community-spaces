ALTER TABLE "events" ADD COLUMN "share_code" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "share_location" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_share_code_unique" UNIQUE("share_code");