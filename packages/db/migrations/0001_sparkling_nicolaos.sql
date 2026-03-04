CREATE TYPE "public"."ai_review_job_status" AS ENUM('queued', 'running', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ai_review_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pr_id" uuid NOT NULL,
	"requested_by_user_id" uuid,
	"status" "ai_review_job_status" DEFAULT 'queued' NOT NULL,
	"provider" text,
	"model" text,
	"findings_count" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"started_at" timestamp,
	"completed_at" timestamp,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ai_review_jobs" ADD CONSTRAINT "ai_review_jobs_pr_id_pull_requests_id_fk" FOREIGN KEY ("pr_id") REFERENCES "public"."pull_requests"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ai_review_jobs" ADD CONSTRAINT "ai_review_jobs_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_review_jobs_pr_status_idx" ON "ai_review_jobs" USING btree ("pr_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_review_jobs_created_idx" ON "ai_review_jobs" USING btree ("created_at");