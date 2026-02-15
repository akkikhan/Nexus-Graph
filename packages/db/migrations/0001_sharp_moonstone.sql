CREATE TABLE IF NOT EXISTS "github_installation_repositories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"github_installation_id" uuid NOT NULL,
	"repo_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "github_installations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"account_login" text NOT NULL,
	"account_id" text,
	"account_type" text,
	"suspended" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pull_request_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pr_id" uuid NOT NULL,
	"path" text NOT NULL,
	"status" text,
	"additions" integer DEFAULT 0 NOT NULL,
	"deletions" integer DEFAULT 0 NOT NULL,
	"changes" integer DEFAULT 0 NOT NULL,
	"sha" text,
	"patch" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "github_installation_repositories" ADD CONSTRAINT "github_installation_repositories_github_installation_id_github_installations_id_fk" FOREIGN KEY ("github_installation_id") REFERENCES "public"."github_installations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "github_installation_repositories" ADD CONSTRAINT "github_installation_repositories_repo_id_repositories_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "github_installations" ADD CONSTRAINT "github_installations_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pull_request_files" ADD CONSTRAINT "pull_request_files_pr_id_pull_requests_id_fk" FOREIGN KEY ("pr_id") REFERENCES "public"."pull_requests"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "github_installation_repositories_install_repo_idx" ON "github_installation_repositories" USING btree ("github_installation_id","repo_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "github_installation_repositories_repo_idx" ON "github_installation_repositories" USING btree ("repo_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "github_installations_org_idx" ON "github_installations" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "github_installations_external_idx" ON "github_installations" USING btree ("external_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pull_request_files_pr_idx" ON "pull_request_files" USING btree ("pr_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "pull_request_files_pr_path_idx" ON "pull_request_files" USING btree ("pr_id","path");