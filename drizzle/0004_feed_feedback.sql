CREATE TYPE "public"."feedback_kind" AS ENUM('not_interested', 'more_like_this');--> statement-breakpoint
CREATE TABLE "feed_feedback" (
	"user_id" text NOT NULL,
	"movie_id" bigint NOT NULL,
	"kind" "feedback_kind" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feed_feedback_user_id_movie_id_pk" PRIMARY KEY("user_id","movie_id")
);
--> statement-breakpoint
ALTER TABLE "feed_feedback" ADD CONSTRAINT "feed_feedback_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feed_feedback" ADD CONSTRAINT "feed_feedback_movie_id_movies_id_fk" FOREIGN KEY ("movie_id") REFERENCES "public"."movies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "feed_feedback_user_kind_created_idx" ON "feed_feedback" USING btree ("user_id","kind","created_at" DESC NULLS FIRST);