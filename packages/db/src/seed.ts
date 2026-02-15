import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import {
    organizations,
    users,
    repositories,
    orgMembers,
    stacks,
    branches,
    pullRequests,
    pullRequestFiles,
    comments,
    reviews,
    mergeQueue,
} from "./schema.js";

const ORG_ID = "10000000-0000-4000-8000-000000000001";
const USER_ID = "20000000-0000-4000-8000-000000000001";
const REPO_ID = "30000000-0000-4000-8000-000000000001";
const STACK_ID = "40000000-0000-4000-8000-000000000001";
const BRANCH_AUTH_ID = "50000000-0000-4000-8000-000000000101";
const BRANCH_API_ID = "50000000-0000-4000-8000-000000000102";
const BRANCH_UI_ID = "50000000-0000-4000-8000-000000000103";

const PR_101_ID = "60000000-0000-4000-8000-000000000101";
const PR_102_ID = "60000000-0000-4000-8000-000000000102";
const PR_103_ID = "60000000-0000-4000-8000-000000000103";
const PR_104_ID = "60000000-0000-4000-8000-000000000104";

function connectionString(): string {
    return (
        process.env.SUPABASE_DATABASE_URL ||
        process.env.DATABASE_URL ||
        "postgresql://postgres:postgres@localhost:5432/nexus"
    );
}

function useHostedSsl(url: string): boolean {
    if (url.includes("sslmode=require")) return true;
    try {
        const host = new URL(url).hostname.toLowerCase();
        // Treat docker-compose service names / local hosts as non-hosted (no SSL by default).
        if (
            host === "localhost" ||
            host === "127.0.0.1" ||
            host === "::1" ||
            host === "postgres" ||
            !host.includes(".")
        ) {
            return false;
        }
        // Known hosted Postgres providers.
        if (host.endsWith(".supabase.co")) return true;
        if (host.endsWith(".postgres.database.azure.com")) return true;
        return false;
    } catch {
        return false;
    }
}

async function seed() {
    const url = connectionString();
    const client = postgres(url, {
        max: 1,
        ssl: useHostedSsl(url) ? "require" : undefined,
    });
    const db = drizzle(client);

    try {
        await db.delete(comments);
        await db.delete(reviews);
        await db.delete(mergeQueue);
        await db.delete(pullRequestFiles);
        await db.delete(pullRequests);
        await db.delete(branches);
        await db.delete(stacks);
        await db.delete(orgMembers);
        await db.delete(repositories);
        await db.delete(users).where(eq(users.id, USER_ID));
        await db.delete(organizations).where(eq(organizations.id, ORG_ID));

        await db.insert(organizations).values({
            id: ORG_ID,
            name: "Nexus Demo Org",
            slug: "nexus-demo-org",
            plan: "team",
            aiProvider: "anthropic",
            aiModel: "claude-sonnet-4-20250514",
            aiEnabled: true,
        });

        await db.insert(users).values({
            id: USER_ID,
            email: "dev@nexus.local",
            name: "Nexus Dev",
            avatar: "https://example.com/avatar/dev.png",
        });

        await db.insert(orgMembers).values({
            id: "21000000-0000-4000-8000-000000000001",
            orgId: ORG_ID,
            userId: USER_ID,
            role: "owner",
        });

        await db.insert(repositories).values({
            id: REPO_ID,
            orgId: ORG_ID,
            platform: "github",
            externalId: "repo-1",
            name: "demo-repo",
            fullName: "nexus/demo-repo",
            defaultBranch: "main",
            private: false,
        });

        await db.insert(stacks).values({
            id: STACK_ID,
            repoId: REPO_ID,
            userId: USER_ID,
            name: "demo-stack-auth-flow",
            baseBranch: "main",
            status: "active",
            createdAt: new Date("2026-01-11T08:00:00.000Z"),
            updatedAt: new Date("2026-01-12T08:00:00.000Z"),
        });

        await db.insert(branches).values([
            {
                id: BRANCH_AUTH_ID,
                stackId: STACK_ID,
                repoId: REPO_ID,
                name: "stack/auth-foundation",
                position: 0,
                prNumber: 101,
                prTitle: "Auth foundation and session scaffolding",
                prStatus: "open",
            },
            {
                id: BRANCH_API_ID,
                stackId: STACK_ID,
                repoId: REPO_ID,
                name: "stack/api-hardening",
                position: 1,
                parentBranchId: BRANCH_AUTH_ID,
                prNumber: 102,
                prTitle: "API hardening and request validation",
                prStatus: "merged",
            },
            {
                id: BRANCH_UI_ID,
                stackId: STACK_ID,
                repoId: REPO_ID,
                name: "stack/ui-followups",
                position: 2,
                parentBranchId: BRANCH_API_ID,
                prNumber: 103,
                prTitle: "UI follow-ups and error states",
                prStatus: "draft",
            },
        ]);

        await db.insert(pullRequests).values([
            {
                id: PR_101_ID,
                branchId: BRANCH_AUTH_ID,
                repoId: REPO_ID,
                authorId: USER_ID,
                number: 101,
                externalId: "gh_pr_101",
                title: "Auth foundation and session scaffolding",
                description: "Core auth paths touched.",
                url: "https://example.com/pr/101",
                status: "open",
                isDraft: false,
                linesAdded: 210,
                linesRemoved: 32,
                filesChanged: 12,
                aiSummary: "Core auth paths touched. Validate token refresh and middleware ordering.",
                riskScore: 78,
                riskLevel: "high",
                createdAt: new Date("2026-01-11T08:30:00.000Z"),
                updatedAt: new Date("2026-01-12T11:00:00.000Z"),
            },
            {
                id: PR_102_ID,
                branchId: BRANCH_API_ID,
                repoId: REPO_ID,
                authorId: USER_ID,
                number: 102,
                externalId: "gh_pr_102",
                title: "API hardening and request validation",
                description: "Validation coverage improved.",
                url: "https://example.com/pr/102",
                status: "merged",
                isDraft: false,
                linesAdded: 148,
                linesRemoved: 24,
                filesChanged: 8,
                aiSummary: "Moderate risk update. Validation coverage improved on public handlers.",
                riskScore: 46,
                riskLevel: "medium",
                createdAt: new Date("2026-01-11T09:10:00.000Z"),
                updatedAt: new Date("2026-01-12T12:15:00.000Z"),
            },
            {
                id: PR_103_ID,
                branchId: BRANCH_UI_ID,
                repoId: REPO_ID,
                authorId: USER_ID,
                number: 103,
                externalId: "gh_pr_103",
                title: "UI follow-ups and error states",
                description: "UI-only draft updates.",
                url: "https://example.com/pr/103",
                status: "draft",
                isDraft: true,
                linesAdded: 84,
                linesRemoved: 12,
                filesChanged: 6,
                aiSummary: "Low risk UI-only draft. Main concern is loading-state consistency.",
                riskScore: 22,
                riskLevel: "low",
                createdAt: new Date("2026-01-11T09:50:00.000Z"),
                updatedAt: new Date("2026-01-12T13:20:00.000Z"),
            },
            {
                id: PR_104_ID,
                repoId: REPO_ID,
                authorId: USER_ID,
                number: 104,
                externalId: "gh_pr_104",
                title: "Payment retry race-condition fix",
                description: "Critical flow fix in payments.",
                url: "https://example.com/pr/104",
                status: "open",
                isDraft: false,
                linesAdded: 52,
                linesRemoved: 17,
                filesChanged: 4,
                aiSummary: "Critical-risk change in payment workflow. Verify idempotency behavior.",
                riskScore: 91,
                riskLevel: "critical",
                createdAt: new Date("2026-01-11T10:30:00.000Z"),
                updatedAt: new Date("2026-01-12T14:05:00.000Z"),
            },
        ]);

        process.stdout.write("[db:seed] seeded deterministic demo data\n");
    } finally {
        await client.end();
    }
}

seed().catch((error) => {
    process.stderr.write(`[db:seed] failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
});
