CREATE TABLE "places" (
	"id" integer PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"ascii_name" text NOT NULL,
	"state" text NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"population" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN "place_id" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "place_id" integer;--> statement-breakpoint
CREATE INDEX "places_name_prefix_idx" ON "places" USING btree (lower("ascii_name") text_pattern_ops);--> statement-breakpoint
CREATE INDEX "places_lat_lng_idx" ON "places" USING btree ("lat","lng");--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE set null ON UPDATE no action;