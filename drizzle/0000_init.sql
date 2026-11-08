CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TYPE "public"."credit_role" AS ENUM('cast', 'director');--> statement-breakpoint
CREATE TYPE "public"."movie_title_kind" AS ENUM('primary', 'original', 'alternate');--> statement-breakpoint
CREATE TYPE "public"."country_source" AS ENUM('ip', 'user');--> statement-breakpoint
CREATE TYPE "public"."rating_source" AS ENUM('swipe', 'import', 'manual');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limit" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"count" integer NOT NULL,
	"last_request" bigint NOT NULL,
	CONSTRAINT "rate_limit_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credits" (
	"movie_id" bigint NOT NULL,
	"person_id" bigint NOT NULL,
	"role" "credit_role" NOT NULL,
	"billing_order" integer,
	"character_name" text,
	CONSTRAINT "credits_movie_id_person_id_role_pk" PRIMARY KEY("movie_id","person_id","role")
);
--> statement-breakpoint
CREATE TABLE "genres" (
	"id" smallint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "genres_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 32767 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	CONSTRAINT "genres_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "movie_embeddings" (
	"movie_id" bigint NOT NULL,
	"model" text NOT NULL,
	"dimensions" integer NOT NULL,
	"embedding" vector(1024) NOT NULL,
	"text_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "movie_embeddings_movie_id_model_pk" PRIMARY KEY("movie_id","model"),
	CONSTRAINT "movie_embeddings_dimensions_check" CHECK ("movie_embeddings"."dimensions" = 1024)
);
--> statement-breakpoint
CREATE TABLE "movie_external_ids" (
	"provider" text NOT NULL,
	"external_id" text NOT NULL,
	"movie_id" bigint NOT NULL,
	CONSTRAINT "movie_external_ids_provider_external_id_pk" PRIMARY KEY("provider","external_id"),
	CONSTRAINT "movie_external_ids_movie_provider_unique" UNIQUE("movie_id","provider")
);
--> statement-breakpoint
CREATE TABLE "movie_genres" (
	"movie_id" bigint NOT NULL,
	"genre_id" smallint NOT NULL,
	CONSTRAINT "movie_genres_movie_id_genre_id_pk" PRIMARY KEY("movie_id","genre_id")
);
--> statement-breakpoint
CREATE TABLE "movie_titles" (
	"movie_id" bigint NOT NULL,
	"title_normalized" text NOT NULL,
	"kind" "movie_title_kind" NOT NULL,
	CONSTRAINT "movie_titles_movie_id_title_normalized_pk" PRIMARY KEY("movie_id","title_normalized")
);
--> statement-breakpoint
CREATE TABLE "movies" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "movies_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"title" text NOT NULL,
	"original_title" text,
	"title_normalized" text NOT NULL,
	"release_date" date,
	"release_year" smallint GENERATED ALWAYS AS (extract(year from release_date)::smallint) STORED,
	"overview" text,
	"runtime_minutes" integer,
	"poster_path" text,
	"original_language" text,
	"popularity" real,
	"vote_average" real,
	"fetched_at" timestamp with time zone,
	"search" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('english', coalesce(title, '')), 'A') || setweight(to_tsvector('english', coalesce(overview, '')), 'B')) STORED,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "people_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"profile_path" text
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"user_id" text PRIMARY KEY NOT NULL,
	"country" char(2),
	"country_source" "country_source",
	"onboarded_at" timestamp with time zone,
	"terms_accepted_at" timestamp with time zone,
	"terms_version" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profiles_country_upper_check" CHECK ("profiles"."country" ~ '^[A-Z]{2}$'),
	CONSTRAINT "profiles_country_source_check" CHECK (("profiles"."country" is null) = ("profiles"."country_source" is null))
);
--> statement-breakpoint
CREATE TABLE "ratings" (
	"user_id" text NOT NULL,
	"movie_id" bigint NOT NULL,
	"score" smallint NOT NULL,
	"source" "rating_source" NOT NULL,
	"rated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ratings_user_id_movie_id_pk" PRIMARY KEY("user_id","movie_id"),
	CONSTRAINT "ratings_score_check" CHECK ("ratings"."score" between 1 and 10)
);
--> statement-breakpoint
CREATE TABLE "swipe_skips" (
	"user_id" text NOT NULL,
	"movie_id" bigint NOT NULL,
	"skipped_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "swipe_skips_user_id_movie_id_pk" PRIMARY KEY("user_id","movie_id")
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credits" ADD CONSTRAINT "credits_movie_id_movies_id_fk" FOREIGN KEY ("movie_id") REFERENCES "public"."movies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credits" ADD CONSTRAINT "credits_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movie_embeddings" ADD CONSTRAINT "movie_embeddings_movie_id_movies_id_fk" FOREIGN KEY ("movie_id") REFERENCES "public"."movies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movie_external_ids" ADD CONSTRAINT "movie_external_ids_movie_id_movies_id_fk" FOREIGN KEY ("movie_id") REFERENCES "public"."movies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movie_genres" ADD CONSTRAINT "movie_genres_movie_id_movies_id_fk" FOREIGN KEY ("movie_id") REFERENCES "public"."movies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movie_genres" ADD CONSTRAINT "movie_genres_genre_id_genres_id_fk" FOREIGN KEY ("genre_id") REFERENCES "public"."genres"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movie_titles" ADD CONSTRAINT "movie_titles_movie_id_movies_id_fk" FOREIGN KEY ("movie_id") REFERENCES "public"."movies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_movie_id_movies_id_fk" FOREIGN KEY ("movie_id") REFERENCES "public"."movies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "swipe_skips" ADD CONSTRAINT "swipe_skips_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "swipe_skips" ADD CONSTRAINT "swipe_skips_movie_id_movies_id_fk" FOREIGN KEY ("movie_id") REFERENCES "public"."movies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "credits_person_idx" ON "credits" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "movie_embeddings_embedding_hnsw_idx" ON "movie_embeddings" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "movie_genres_genre_movie_idx" ON "movie_genres" USING btree ("genre_id","movie_id");--> statement-breakpoint
CREATE INDEX "movie_titles_title_normalized_idx" ON "movie_titles" USING btree ("title_normalized");--> statement-breakpoint
CREATE INDEX "movies_title_normalized_year_idx" ON "movies" USING btree ("title_normalized","release_year");--> statement-breakpoint
CREATE INDEX "movies_search_idx" ON "movies" USING gin ("search");--> statement-breakpoint
CREATE INDEX "movies_popularity_idx" ON "movies" USING btree ("popularity" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "ratings_user_updated_idx" ON "ratings" USING btree ("user_id","updated_at" DESC NULLS FIRST,"movie_id" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "ratings_movie_idx" ON "ratings" USING btree ("movie_id");