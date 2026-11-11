CREATE TYPE "public"."import_status" AS ENUM('completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."import_unmatched_reason" AS ENUM('no_match', 'ambiguous', 'invalid_row', 'duplicate', 'kept_manual');--> statement-breakpoint
CREATE TABLE "import_unmatched_rows" (
	"import_id" bigint NOT NULL,
	"row_number" integer NOT NULL,
	"title" text NOT NULL,
	"year" smallint,
	"score" smallint,
	"reason" "import_unmatched_reason" NOT NULL,
	CONSTRAINT "import_unmatched_rows_import_id_row_number_pk" PRIMARY KEY("import_id","row_number"),
	CONSTRAINT "import_unmatched_rows_row_number_check" CHECK ("import_unmatched_rows"."row_number" >= 1),
	CONSTRAINT "import_unmatched_rows_score_check" CHECK ("import_unmatched_rows"."score" is null or "import_unmatched_rows"."score" between 1 and 10)
);
--> statement-breakpoint
CREATE TABLE "imports" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "imports_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" text NOT NULL,
	"status" "import_status" NOT NULL,
	"rows_total" integer NOT NULL,
	"rows_matched" integer NOT NULL,
	"rows_unmatched" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "imports_counts_check" CHECK ("imports"."rows_total" >= 0 and "imports"."rows_matched" >= 0 and "imports"."rows_unmatched" >= 0),
	CONSTRAINT "imports_completed_counts_check" CHECK ("imports"."status" <> 'completed' or "imports"."rows_matched" + "imports"."rows_unmatched" = "imports"."rows_total")
);
--> statement-breakpoint
ALTER TABLE "import_unmatched_rows" ADD CONSTRAINT "import_unmatched_rows_import_id_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."imports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imports" ADD CONSTRAINT "imports_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "imports_user_created_idx" ON "imports" USING btree ("user_id","created_at" DESC NULLS FIRST,"id" DESC NULLS FIRST);