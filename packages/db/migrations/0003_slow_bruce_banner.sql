CREATE TYPE "public"."agent_run_audit_type" AS ENUM('status_transition', 'checkpoint', 'command', 'file_edit', 'note', 'error');--> statement-breakpoint
CREATE TYPE "public"."agent_run_status" AS ENUM('planned', 'running', 'awaiting_approval', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agent_run_audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"type" "agent_run_audit_type" DEFAULT 'note' NOT NULL,
	"actor" text DEFAULT 'system' NOT NULL,
	"message" text,
	"command" text,
	"file_path" text,
	"details" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agent_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"repo_id" uuid,
	"pr_id" uuid,
	"stack_id" uuid,
	"prompt" text NOT NULL,
	"plan" jsonb DEFAULT '{}'::jsonb,
	"status" "agent_run_status" DEFAULT 'planned' NOT NULL,
	"requires_approval" boolean DEFAULT false NOT NULL,
	"awaiting_approval_reason" text,
	"started_at" timestamp,
	"completed_at" timestamp,
	"error_message" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agent_run_audit_events" ADD CONSTRAINT "agent_run_audit_events_run_id_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_repo_id_repositories_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repositories"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_pr_id_pull_requests_id_fk" FOREIGN KEY ("pr_id") REFERENCES "public"."pull_requests"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_stack_id_stacks_id_fk" FOREIGN KEY ("stack_id") REFERENCES "public"."stacks"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_run_audit_events_run_created_idx" ON "agent_run_audit_events" USING btree ("run_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_run_audit_events_type_idx" ON "agent_run_audit_events" USING btree ("type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_runs_status_created_idx" ON "agent_runs" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_runs_user_status_idx" ON "agent_runs" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_runs_repo_status_idx" ON "agent_runs" USING btree ("repo_id","status");