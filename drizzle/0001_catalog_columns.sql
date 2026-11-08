ALTER TABLE "movies" ADD COLUMN "tagline" text;--> statement-breakpoint
ALTER TABLE "movies" ADD COLUMN "vote_count" integer;--> statement-breakpoint
ALTER TABLE "movies" ADD COLUMN "source_missing_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "tmdb_id" integer;--> statement-breakpoint
CREATE UNIQUE INDEX "people_tmdb_id_idx" ON "people" USING btree ("tmdb_id");