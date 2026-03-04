ALTER TABLE "agent_runs" ADD COLUMN "provider" text DEFAULT 'anthropic' NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "model" text;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "budget_cents" integer DEFAULT 500 NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "budget_spent_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "approval_checkpoint" text;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "last_approved_at" timestamp;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_runs_provider_status_idx" ON "agent_runs" USING btree ("provider","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_runs_budget_idx" ON "agent_runs" USING btree ("budget_cents","budget_spent_cents");