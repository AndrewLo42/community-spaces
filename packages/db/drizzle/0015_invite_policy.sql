CREATE TYPE "public"."invite_policy" AS ENUM('admins', 'members');--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN "invite_policy" "invite_policy" DEFAULT 'admins' NOT NULL;