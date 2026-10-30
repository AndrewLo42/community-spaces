ALTER TABLE "groups" ADD COLUMN "tags" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
CREATE INDEX "groups_tags_idx" ON "groups" USING gin ("tags");--> statement-breakpoint
-- Carry each group's old fixed category over as its first hashtag ("local-business" is already a valid tag).
UPDATE "groups" SET "tags" = ARRAY["category"] WHERE "category" <> '' AND "tags" = '{}';
