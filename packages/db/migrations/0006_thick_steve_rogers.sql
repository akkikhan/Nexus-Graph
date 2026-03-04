CREATE TYPE "public"."integration_webhook_status" AS ENUM('received', 'processed', 'failed', 'dead_letter');--> statement-breakpoint
CREATE TYPE "public"."issue_link_sync_status" AS ENUM('pending', 'synced', 'failed', 'dead_letter');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "integration_webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" "integration_provider" NOT NULL,
	"repo_id" uuid,
	"event_type" text NOT NULL,
	"external_event_id" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb,
	"status" "integration_webhook_status" DEFAULT 'received' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"next_attempt_at" timestamp DEFAULT now() NOT NULL,
	"last_attempt_at" timestamp,
	"processed_at" timestamp,
	"error_message" text,
	"correlation_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "issue_link_sync_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"issue_link_id" uuid NOT NULL,
	"provider" "integration_provider" NOT NULL,
	"status" "issue_link_sync_status" DEFAULT 'pending' NOT NULL,
	"attempt_number" integer NOT NULL,
	"error_message" text,
	"response_code" integer,
	"latency_ms" integer,
	"details" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "integration_webhook_events" ADD CONSTRAINT "integration_webhook_events_repo_id_repositories_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repositories"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "issue_link_sync_events" ADD CONSTRAINT "issue_link_sync_events_issue_link_id_issue_links_id_fk" FOREIGN KEY ("issue_link_id") REFERENCES "public"."issue_links"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "integration_webhook_events_provider_external_unique_idx" ON "integration_webhook_events" USING btree ("provider","external_event_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "integration_webhook_events_status_next_attempt_idx" ON "integration_webhook_events" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "integration_webhook_events_repo_status_idx" ON "integration_webhook_events" USING btree ("repo_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "integration_webhook_events_correlation_unique_idx" ON "integration_webhook_events" USING btree ("correlation_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "issue_link_sync_events_issue_attempt_unique_idx" ON "issue_link_sync_events" USING btree ("issue_link_id","attempt_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "issue_link_sync_events_status_idx" ON "issue_link_sync_events" USING btree ("status");