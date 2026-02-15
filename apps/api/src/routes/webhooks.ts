/**
 * NEXUS API - Webhook Routes
 * Handle incoming webhooks from GitHub, GitLab, etc.
 */

import { Hono } from "hono";
import { createHmac, timingSafeEqual } from "crypto";
import { githubRepository } from "../repositories/github.js";
import { prRepository } from "../repositories/pr.js";
import { userRepository } from "../repositories/user.js";
import { prFilesRepository } from "../repositories/prFiles.js";
import { createInstallationAccessToken } from "../github/app.js";
import { listPullRequestFiles } from "../github/client.js";
import { computeRisk } from "../services/risk.js";
import { aiRules, db } from "../db/index.js";
import { and, eq, isNull, or } from "drizzle-orm";

const webhookRouter = new Hono();

// Verify GitHub webhook signature
function verifyGitHubSignature(
    payload: string,
    signature: string,
    secret: string
): boolean {
    const hmac = createHmac("sha256", secret);
    const digest = `sha256=${hmac.update(payload).digest("hex")}`;

    try {
        return timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
    } catch {
        return false;
    }
}

// Verify GitLab webhook token
function verifyGitLabToken(token: string, secret: string): boolean {
    return token === secret;
}

/**
 * POST /webhooks/github - Handle GitHub webhooks
 */
webhookRouter.post("/github", async (c) => {
    const signature = c.req.header("X-Hub-Signature-256");
    const event = c.req.header("X-GitHub-Event");
    const deliveryId = c.req.header("X-GitHub-Delivery");

    const rawBody = await c.req.text();
    const secret = process.env.GITHUB_WEBHOOK_SECRET || "";

    // If a secret is configured, require and verify the signature.
    let signatureStatus: "skipped" | "ok" | "missing" | "invalid" = "skipped";
    if (secret) {
        if (!signature) {
            signatureStatus = "missing";
            console.warn(
                `[GitHub Webhook] Missing signature. Event: ${event}, Delivery: ${deliveryId}`
            );
            return c.json({ error: "Missing signature" }, 401);
        }
        if (!verifyGitHubSignature(rawBody, signature, secret)) {
            signatureStatus = "invalid";
            console.warn(
                `[GitHub Webhook] Invalid signature. Event: ${event}, Delivery: ${deliveryId}`
            );
            return c.json({ error: "Invalid signature" }, 401);
        }
        signatureStatus = "ok";
    }

    const payload = JSON.parse(rawBody);

    console.log(
        `[GitHub Webhook] Event: ${event}, Delivery: ${deliveryId}, Signature: ${signatureStatus}`
    );

    // Handle different events
    switch (event) {
        case "installation":
        case "installation_repositories":
            await handleInstallationEvent(payload);
            break;
        case "pull_request":
            await handlePullRequestEvent(payload);
            break;
        case "pull_request_review":
            await handleReviewEvent(payload);
            break;
        case "pull_request_review_comment":
            await handleCommentEvent(payload);
            break;
        case "push":
            await handlePushEvent(payload);
            break;
        case "check_run":
            await handleCheckRunEvent(payload);
            break;
        default:
            console.log(`[GitHub Webhook] Unhandled event: ${event}`);
    }

    return c.json({ received: true, event, deliveryId });
});

/**
 * POST /webhooks/gitlab - Handle GitLab webhooks
 */
webhookRouter.post("/gitlab", async (c) => {
    const token = c.req.header("X-Gitlab-Token");
    const event = c.req.header("X-Gitlab-Event");

    const secret = process.env.GITLAB_WEBHOOK_SECRET || "";

    if (secret && token && !verifyGitLabToken(token, secret)) {
        return c.json({ error: "Invalid token" }, 401);
    }

    const payload = await c.req.json();

    console.log(`[GitLab Webhook] Event: ${event}`);

    // Handle different events
    switch (event) {
        case "Merge Request Hook":
            await handleGitLabMREvent(payload);
            break;
        case "Note Hook":
            await handleGitLabNoteEvent(payload);
            break;
        case "Push Hook":
            await handleGitLabPushEvent(payload);
            break;
        case "Pipeline Hook":
            await handleGitLabPipelineEvent(payload);
            break;
        default:
            console.log(`[GitLab Webhook] Unhandled event: ${event}`);
    }

    return c.json({ received: true, event });
});

// Event handlers

async function handlePullRequestEvent(payload: any) {
    const { action, pull_request: pr, repository } = payload;

    console.log(`[PR Event] ${action} - ${repository.full_name}#${pr.number}`);

    // Only process actions that matter for DB state.
    const supportedActions = new Set([
        "opened",
        "reopened",
        "synchronize",
        "edited",
        "ready_for_review",
        "closed",
    ]);
    if (!supportedActions.has(action)) return;

    // Ensure repo exists and is mapped to an org.
    const accountLogin =
        repository?.owner?.login ||
        payload?.installation?.account?.login ||
        "github";
    const { orgId } = await githubRepository.upsertOrgFromGitHubAccount({
        login: accountLogin,
        avatarUrl: repository?.owner?.avatar_url || null,
    });
    const { repoId } = await githubRepository.upsertRepository({
        orgId,
        externalRepoId: repository.id,
        name: repository.name,
        fullName: repository.full_name,
        defaultBranch: repository.default_branch,
        private: repository.private,
    });

    const author = pr?.user;
    const { userId: authorId } = await userRepository.upsertGitHubUser({
        githubId: author?.id,
        login: author?.login,
        avatarUrl: author?.avatar_url,
        name: author?.login,
    });

    const status = pr.merged
        ? "merged"
        : pr.state === "closed"
            ? "closed"
            : pr.draft
                ? "draft"
                : "open";

    // Fetch PR file list for better scoring, if we can.
    const installationId: number | undefined = payload?.installation?.id;
    let filePaths: string[] = [];
    let prFiles: any[] = [];
    if (installationId && process.env.GITHUB_APP_ID && process.env.GITHUB_APP_PRIVATE_KEY) {
        try {
            const token = await createInstallationAccessToken(installationId);
            const [owner, repo] = String(repository.full_name || "/").split("/");
            const files = await listPullRequestFiles({
                owner,
                repo,
                pullNumber: pr.number,
                token,
            });
            prFiles = files;
            filePaths = files.map((f) => f.filename);
        } catch (e: any) {
            console.warn(`[PR Event] Could not fetch PR files: ${e?.message || e}`);
        }
    }

    const linesAdded = Number(pr.additions ?? 0);
    const linesRemoved = Number(pr.deletions ?? 0);
    const filesChanged = Number(pr.changed_files ?? prFiles.length ?? 0);

    // Pull org/repo AI rules (if any) to influence deterministic risk scoring.
    let ruleRows: any[] = [];
    try {
        ruleRows = await db
            .select({
                id: aiRules.id,
                name: aiRules.name,
                prompt: aiRules.prompt,
                regexPattern: aiRules.regexPattern,
                filePatterns: aiRules.filePatterns,
                severity: aiRules.severity,
                enabled: aiRules.enabled,
            })
            .from(aiRules)
            .where(
                and(
                    eq(aiRules.orgId, orgId),
                    or(eq(aiRules.repoId, repoId), isNull(aiRules.repoId)),
                    eq(aiRules.enabled, true)
                )
            );
    } catch (e: any) {
        console.warn(`[PR Event] Could not load AI rules: ${e?.message || e}`);
    }

    const risk = computeRisk({
        title: pr.title,
        filesChanged,
        linesAdded,
        linesRemoved,
        repoFullName: repository.full_name,
        filePaths,
        aiRules: ruleRows,
    });

    const upserted = await prRepository.upsertByRepoAndNumber({
        repoId,
        authorId,
        number: pr.number,
        externalId: String(pr.id),
        title: pr.title,
        description: pr.body || "",
        url: pr.html_url,
        isDraft: !!pr.draft,
        status: status as any,
        linesAdded,
        linesRemoved,
        filesChanged,
        aiSummary: risk.aiSummary,
        riskScore: risk.riskScore,
        riskLevel: risk.riskLevel,
        riskFactors: risk.riskFactors,
        estimatedReviewMinutes: Math.max(5, Math.round((linesAdded + linesRemoved) / 80)),
    } as any);

    if (upserted?.id && prFiles.length > 0) {
        await prFilesRepository.upsertMany(
            upserted.id,
            prFiles.map((f) => ({
                prId: upserted.id,
                path: f.filename,
                status: f.status || null,
                additions: f.additions ?? 0,
                deletions: f.deletions ?? 0,
                changes: f.changes ?? 0,
                sha: f.sha || null,
                patch: f.patch || null,
            }))
        );
    }
}

async function handleInstallationEvent(payload: any) {
    const eventAction = payload?.action;
    const installation = payload?.installation;
    const repositoriesAdded = payload?.repositories_added || payload?.repositories || [];
    const repositoriesRemoved = payload?.repositories_removed || [];

    const account = installation?.account || payload?.sender || {};
    const installationId = installation?.id;
    if (!installationId) {
        console.warn("[Install Event] Missing installation.id");
        return;
    }

    const login = account?.login || "github";
    const { orgId } = await githubRepository.upsertOrgFromGitHubAccount({
        login,
        avatarUrl: account?.avatar_url || null,
    });

    const { githubInstallationId } = await githubRepository.upsertInstallation({
        orgId,
        installationId,
        accountLogin: login,
        accountId: account?.id ?? null,
        accountType: account?.type ?? null,
        suspended: eventAction === "suspend",
    });

    const toUpsert = [...repositoriesAdded].filter(Boolean);
    const repoIds: string[] = [];
    for (const r of toUpsert) {
        const { repoId } = await githubRepository.upsertRepository({
            orgId,
            externalRepoId: r.id,
            name: r.name,
            fullName: r.full_name,
            defaultBranch: r.default_branch,
            private: r.private,
        });
        repoIds.push(repoId);
    }

    // For installation_repositories, GitHub sends adds/removes. We'll re-store current known list
    // as "replacement" only if it contains a full list (payload.repositories). Otherwise we do add/remove.
    if (Array.isArray(payload?.repositories)) {
        await githubRepository.replaceInstallationRepos({
            githubInstallationId,
            repoIds,
        });
    } else {
        if (repoIds.length > 0) {
            await githubRepository.addInstallationRepos({ githubInstallationId, repoIds });
        }

        const removedIds: string[] = [];
        for (const r of [...repositoriesRemoved].filter(Boolean)) {
            // Ensure repo exists locally so we can map id -> repoId.
            const { repoId } = await githubRepository.upsertRepository({
                orgId,
                externalRepoId: r.id,
                name: r.name,
                fullName: r.full_name,
                defaultBranch: r.default_branch,
                private: r.private,
            });
            removedIds.push(repoId);
        }
        if (removedIds.length > 0) {
            await githubRepository.removeInstallationRepos({ githubInstallationId, repoIds: removedIds });
        }
    }
}

async function handleReviewEvent(payload: any) {
    const { action, review, pull_request: pr } = payload;

    console.log(`[Review Event] ${action} by ${review.user.login}`);

    // Track review for fatigue analysis
    // Update PR status if approved/changes requested
}

async function handleCommentEvent(payload: any) {
    const { action, comment, pull_request: pr } = payload;

    console.log(`[Comment Event] ${action} on PR #${pr.number}`);

    // Potentially trigger AI response to questions
    // Update comment resolution tracking
}

async function handlePushEvent(payload: any) {
    const { ref, commits, repository } = payload;

    console.log(`[Push Event] ${commits?.length || 0} commits to ${ref}`);

    // Update branch tracking
    // Trigger conflict prediction if affects open PRs
}

async function handleCheckRunEvent(payload: any) {
    const { action, check_run } = payload;

    console.log(`[Check Run] ${check_run.name}: ${check_run.conclusion}`);

    // Update CI status on PRs
    // Trigger merge if auto-merge enabled and all checks pass
}

// GitLab handlers (similar structure)

async function handleGitLabMREvent(payload: any) {
    const { object_attributes: mr, project } = payload;
    console.log(`[GitLab MR] ${mr.action} - ${project.path_with_namespace}!${mr.iid}`);
}

async function handleGitLabNoteEvent(payload: any) {
    const { object_attributes: note } = payload;
    console.log(`[GitLab Note] ${note.noteable_type}`);
}

async function handleGitLabPushEvent(payload: any) {
    const { ref, total_commits_count, project } = payload;
    console.log(`[GitLab Push] ${total_commits_count} commits to ${ref}`);
}

async function handleGitLabPipelineEvent(payload: any) {
    const { object_attributes: pipeline } = payload;
    console.log(`[GitLab Pipeline] ${pipeline.status}`);
}

export { webhookRouter };
