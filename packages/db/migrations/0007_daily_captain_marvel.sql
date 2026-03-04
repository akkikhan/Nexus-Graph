CREATE TYPE "public"."integration_webhook_auth_outcome" AS ENUM('rejected', 'config_error');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "integration_webhook_auth_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" "integration_provider" NOT NULL,
	"repo_id" uuid,
	"event_type" text NOT NULL,
	"external_event_id" text NOT NULL,
	"outcome" "integration_webhook_auth_outcome" DEFAULT 'rejected' NOT NULL,
	"reason" text NOT NULL,
	"status_code" integer NOT NULL,
	"signature_present" boolean DEFAULT false NOT NULL,
	"timestamp_present" boolean DEFAULT false NOT NULL,
	"request_timestamp" timestamp,
	"request_skew_seconds" integer,
	"details" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "integration_webhook_auth_events" ADD CONSTRAINT "integration_webhook_auth_events_repo_id_repositories_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repositories"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "integration_webhook_auth_events_provider_created_idx" ON "integration_webhook_auth_events" USING btree ("provider","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "integration_webhook_auth_events_reason_created_idx" ON "integration_webhook_auth_events" USING btree ("reason","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "integration_webhook_auth_events_repo_created_idx" ON "integration_webhook_auth_events" USING btree ("repo_id","created_at");