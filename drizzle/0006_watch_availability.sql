CREATE TABLE "watch_availability" (
	"movie_id" bigint PRIMARY KEY NOT NULL,
	"regions" jsonb NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "watch_availability" ADD CONSTRAINT "watch_availability_movie_id_movies_id_fk" FOREIGN KEY ("movie_id") REFERENCES "public"."movies"("id") ON DELETE cascade ON UPDATE no action;