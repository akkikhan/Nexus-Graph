/**
 * NEXUS API - Webhook Routes
 * Handle incoming webhooks from GitHub, GitLab, etc.
 */
import { Hono } from "hono";
import { createHmac, timingSafeEqual } from "crypto";
const webhookRouter = new Hono();
// Verify GitHub webhook signature
function verifyGitHubSignature(payload, signature, secret) {
    const hmac = createHmac("sha256", secret);
    const digest = `sha256=${hmac.update(payload).digest("hex")}`;
    try {
        return timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
    }
    catch {
        return false;
    }
}
// Verify GitLab webhook token
function verifyGitLabToken(token, secret) {
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
    // Verify signature in production
    if (secret && signature && !verifyGitHubSignature(rawBody, signature, secret)) {
        return c.json({ error: "Invalid signature" }, 401);
    }
    const payload = JSON.parse(rawBody);
    console.log(`[GitHub Webhook] Event: ${event}, Delivery: ${deliveryId}`);
    // Handle different events
    switch (event) {
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
async function handlePullRequestEvent(payload) {
    const { action, pull_request: pr, repository } = payload;
    console.log(`[PR Event] ${action} - ${repository.full_name}#${pr.number}`);
    switch (action) {
        case "opened":
        case "reopened":
            // 1. Create/update PR in database
            // 2. Trigger AI review
            // 3. Calculate risk score
            // 4. Update stack if part of one
            // 5. Send notifications
            console.log(`[PR Event] Triggering AI review for PR #${pr.number}`);
            break;
        case "synchronize":
            // PR was updated (new commits)
            // 1. Re-run AI review on new changes
            // 2. Update risk score
            // 3. Check for resolved comments
            console.log(`[PR Event] Re-reviewing PR #${pr.number}`);
            break;
        case "closed":
            if (pr.merged) {
                // PR was merged
                // 1. Update stack (rebase dependent branches)
                // 2. Update metrics
                // 3. Cleanup
                console.log(`[PR Event] PR #${pr.number} merged`);
            }
            break;
        case "review_requested":
            // Someone was requested to review
            // 1. Send notification
            // 2. Update reviewer workload tracking
            console.log(`[PR Event] Review requested for PR #${pr.number}`);
            break;
    }
}
async function handleReviewEvent(payload) {
    const { action, review, pull_request: pr } = payload;
    console.log(`[Review Event] ${action} by ${review.user.login}`);
    // Track review for fatigue analysis
    // Update PR status if approved/changes requested
}
async function handleCommentEvent(payload) {
    const { action, comment, pull_request: pr } = payload;
    console.log(`[Comment Event] ${action} on PR #${pr.number}`);
    // Potentially trigger AI response to questions
    // Update comment resolution tracking
}
async function handlePushEvent(payload) {
    const { ref, commits, repository } = payload;
    console.log(`[Push Event] ${commits?.length || 0} commits to ${ref}`);
    // Update branch tracking
    // Trigger conflict prediction if affects open PRs
}
async function handleCheckRunEvent(payload) {
    const { action, check_run } = payload;
    console.log(`[Check Run] ${check_run.name}: ${check_run.conclusion}`);
    // Update CI status on PRs
    // Trigger merge if auto-merge enabled and all checks pass
}
// GitLab handlers (similar structure)
async function handleGitLabMREvent(payload) {
    const { object_attributes: mr, project } = payload;
    console.log(`[GitLab MR] ${mr.action} - ${project.path_with_namespace}!${mr.iid}`);
}
async function handleGitLabNoteEvent(payload) {
    const { object_attributes: note } = payload;
    console.log(`[GitLab Note] ${note.noteable_type}`);
}
async function handleGitLabPushEvent(payload) {
    const { ref, total_commits_count, project } = payload;
    console.log(`[GitLab Push] ${total_commits_count} commits to ${ref}`);
}
async function handleGitLabPipelineEvent(payload) {
    const { object_attributes: pipeline } = payload;
    console.log(`[GitLab Pipeline] ${pipeline.status}`);
}
export { webhookRouter };
//# sourceMappingURL=webhooks.js.map