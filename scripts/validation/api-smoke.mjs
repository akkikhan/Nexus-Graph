#!/usr/bin/env node

import { spawn } from "node:child_process";

const API_BASE_URL = (process.env.API_BASE_URL || "http://localhost:3001").replace(/\/+$/, "");
const ALLOW_DEGRADED = process.env.ALLOW_DEGRADED !== "false";
const AUTO_START_API = process.env.AUTO_START_API !== "false";
const PNPM_BIN = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForApi(timeoutMs = 90000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        try {
            const response = await fetch(`${API_BASE_URL}/health`);
            if (response.ok) return true;
        } catch {
            // Keep waiting
        }
        await sleep(1000);
    }
    return false;
}

function startApiService() {
    const child = spawn(`${PNPM_BIN} --filter @nexus/api dev`, {
        shell: true,
        stdio: "pipe",
        env: process.env,
    });

    child.stdout.on("data", (chunk) => process.stdout.write(`[api-smoke:api] ${chunk}`));
    child.stderr.on("data", (chunk) => process.stderr.write(`[api-smoke:api] ${chunk}`));
    return child;
}

async function stopApiService(child) {
    if (!child || child.exitCode !== null) return;
    if (process.platform === "win32") {
        await new Promise((resolve) => {
            const killer = spawn(`taskkill /pid ${child.pid} /T /F`, {
                shell: true,
                stdio: "ignore",
            });
            killer.on("exit", () => resolve(null));
            killer.on("error", () => resolve(null));
        });
        return;
    }
    child.kill("SIGTERM");
    await sleep(300);
    if (child.exitCode === null) child.kill("SIGKILL");
}

async function request(path, options = {}) {
    const url = `${API_BASE_URL}${path}`;
    const response = await fetch(url, options);
    const contentType = response.headers.get("content-type") || "";
    let payload;

    if (contentType.includes("application/json")) {
        payload = await response.json().catch(() => null);
    } else {
        payload = await response.text().catch(() => "");
    }

    return { url, response, payload };
}

function printResult(label, result) {
    const status = result.response.status;
    process.stdout.write(`[api-smoke] ${label}: ${status}\n`);
}

function allowStatus(endpointName, status, primaryStatus) {
    if (status === primaryStatus) return true;
    if (!ALLOW_DEGRADED) return false;
    if (status !== 503) return false;
    process.stdout.write(`[api-smoke] ${endpointName}: allowed degraded status 503\n`);
    return true;
}

function assertErrorPayload(endpointName, payload) {
    assert(
        payload && typeof payload === "object" && typeof payload.error === "string",
        `${endpointName} expected JSON error payload with "error"`
    );
}

async function run() {
    process.stdout.write(`[api-smoke] API base: ${API_BASE_URL}\n`);
    let managedApi = null;

    const reachable = await waitForApi(3000);
    if (!reachable && AUTO_START_API) {
        process.stdout.write("[api-smoke] API not reachable, starting local API service...\n");
        managedApi = startApiService();
        const ready = await waitForApi();
        if (!ready) {
            throw new Error("API service did not become ready");
        }
        process.stdout.write("[api-smoke] local API service ready\n");
    } else if (!reachable) {
        throw new Error("API is not reachable and AUTO_START_API=false");
    }

    try {
        const health = await request("/health");
        printResult("GET /health", health);
        assert(health.response.status === 200, "/health must return 200");
        assert(
            health.payload && typeof health.payload === "object" && typeof health.payload.status === "string",
            "/health payload must include status"
        );

        const syncPayload = {
            stackName: "smoke-stack",
            snapshot: {
                trunk: "main",
                branches: [],
            },
        };
        const syncLocal = await request("/api/v1/stacks/sync-local", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(syncPayload),
        });
        printResult("POST /api/v1/stacks/sync-local", syncLocal);
        assert(syncLocal.response.status === 200, "sync-local setup must return 200");

        const prs = await request("/api/v1/prs?limit=5");
        printResult("GET /api/v1/prs?limit=5", prs);
        assert(allowStatus("prs", prs.response.status, 200), "prs endpoint status mismatch");
        let firstPrId = null;
        let firstRepoId = null;
        if (prs.response.status === 200) {
            assert(prs.payload && Array.isArray(prs.payload.prs), "prs payload must include prs[]");
            firstPrId = prs.payload.prs[0]?.id || null;
            firstRepoId = prs.payload.prs[0]?.repository?.id || null;
        } else {
            assertErrorPayload("prs", prs.payload);
        }

        const stacks = await request("/api/v1/stacks");
        printResult("GET /api/v1/stacks", stacks);
        assert(allowStatus("stacks", stacks.response.status, 200), "stacks endpoint status mismatch");
        if (stacks.response.status === 200) {
            assert(
                stacks.payload && Array.isArray(stacks.payload.stacks),
                "stacks payload must include stacks[]"
            );
            if (!firstRepoId) {
                firstRepoId = stacks.payload.stacks[0]?.repository?.id || null;
            }
        } else {
            assertErrorPayload("stacks", stacks.payload);
        }

        if (firstRepoId) {
            const createPR = await request("/api/v1/prs", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    repositoryId: firstRepoId,
                    title: `Smoke PR ${Date.now()}`,
                    description: "PR write-path smoke coverage",
                    headBranch: `smoke/pr-${Date.now()}`,
                    baseBranch: "main",
                    draft: true,
                    requestAIReview: false,
                }),
            });
            printResult("POST /api/v1/prs", createPR);
            assert(createPR.response.status === 201, "create PR must return 201");
            assert(createPR.payload?.pr?.id, "create PR must return pr.id");
            const createdPrId = createPR.payload.pr.id;

            const patchPR = await request(`/api/v1/prs/${createdPrId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    title: "Smoke PR Updated Title",
                    draft: false,
                }),
            });
            printResult(`PATCH /api/v1/prs/${createdPrId}`, patchPR);
            assert(patchPR.response.status === 200, "update PR must return 200");
            assert(
                patchPR.payload?.pr?.title === "Smoke PR Updated Title",
                "update PR must persist title"
            );
            assert(
                patchPR.payload?.pr?.status === "open",
                "update PR must map draft=false to open"
            );

            const getCreatedPR = await request(`/api/v1/prs/${createdPrId}`);
            printResult(`GET /api/v1/prs/${createdPrId}`, getCreatedPR);
            assert(getCreatedPR.response.status === 200, "created PR detail must return 200");
            assert(
                getCreatedPR.payload?.pr?.title === "Smoke PR Updated Title",
                "created PR detail must reflect updated title"
            );

            const requestReview = await request(`/api/v1/prs/${createdPrId}/request-review`, {
                method: "POST",
            });
            printResult(`POST /api/v1/prs/${createdPrId}/request-review`, requestReview);
            assert(requestReview.response.status === 200, "request-review must return 200");
            assert(requestReview.payload?.success === true, "request-review must return success=true");
            assert(requestReview.payload?.jobId, "request-review must return jobId");
            const reviewJobId = requestReview.payload.jobId;

            const queuedJob = await request(`/api/v1/prs/${createdPrId}/ai-review-jobs/${reviewJobId}`);
            printResult(`GET /api/v1/prs/${createdPrId}/ai-review-jobs/${reviewJobId}`, queuedJob);
            assert(queuedJob.response.status === 200, "AI review job detail must return 200");
            assert(queuedJob.payload?.job?.status === "queued", "AI review job must start in queued state");

            const startReviewJob = await request(`/api/v1/prs/${createdPrId}/ai-review-jobs/${reviewJobId}/start`, {
                method: "POST",
            });
            printResult(`POST /api/v1/prs/${createdPrId}/ai-review-jobs/${reviewJobId}/start`, startReviewJob);
            assert(startReviewJob.response.status === 200, "AI review job start must return 200");
            assert(startReviewJob.payload?.success === true, "AI review job start must return success=true");
            assert(startReviewJob.payload?.job?.status === "running", "AI review job start must set running status");

            const completeReviewJob = await request(`/api/v1/prs/${createdPrId}/ai-review-jobs/${reviewJobId}/complete`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    summary: "Smoke AI review completed with persisted findings.",
                    model: "smoke-ai-model",
                    provider: "smoke-provider",
                    findings: [
                        {
                            path: "src/auth/middleware.ts",
                            line: 15,
                            side: "RIGHT",
                            body: "Ensure token parsing handles malformed input.",
                            severity: "warning",
                            category: "security",
                        },
                        {
                            path: "src/api/route.ts",
                            line: 22,
                            side: "RIGHT",
                            body: "Add retry guard around transient downstream failures.",
                            severity: "error",
                            category: "reliability",
                        },
                    ],
                }),
            });
            printResult(`POST /api/v1/prs/${createdPrId}/ai-review-jobs/${reviewJobId}/complete`, completeReviewJob);
            assert(completeReviewJob.response.status === 200, "AI review job complete must return 200");
            assert(completeReviewJob.payload?.success === true, "AI review job complete must return success=true");
            assert(
                completeReviewJob.payload?.job?.status === "completed",
                "AI review job complete must set completed status"
            );
            assert(
                completeReviewJob.payload?.findingsPersisted === 2,
                "AI review completion must persist provided findings"
            );

            const completedJob = await request(`/api/v1/prs/${createdPrId}/ai-review-jobs/${reviewJobId}`);
            printResult(`GET /api/v1/prs/${createdPrId}/ai-review-jobs/${reviewJobId} (completed)`, completedJob);
            assert(completedJob.response.status === 200, "completed AI review job detail must return 200");
            assert(
                completedJob.payload?.job?.status === "completed",
                "completed AI review job detail must report completed status"
            );
            assert(
                completedJob.payload?.job?.findingsCount === 2,
                "completed AI review job detail must include findingsCount"
            );

            const createdPrReviews = await request(`/api/v1/reviews/pr/${createdPrId}`);
            printResult(`GET /api/v1/reviews/pr/${createdPrId}`, createdPrReviews);
            assert(createdPrReviews.response.status === 200, "created PR reviews must return 200");
            assert(Array.isArray(createdPrReviews.payload?.reviews), "created PR reviews payload must include reviews[]");
            const persistedAiReview = createdPrReviews.payload.reviews.find(
                (review) => review.isAI === true && Array.isArray(review.comments) && review.comments.length > 0
            );
            assert(Boolean(persistedAiReview), "AI review completion must persist at least one AI review with comments");
        }

        if (firstRepoId && stacks.response.status === 200) {
            const smokeStackName = `smoke-stack-${Date.now()}`;
            const createStack = await request("/api/v1/stacks", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: smokeStackName,
                    repositoryId: firstRepoId,
                    baseBranch: "main",
                }),
            });
            printResult("POST /api/v1/stacks", createStack);
            assert(createStack.response.status === 201, "create stack must return 201");
            const createdStackId = createStack.payload?.stack?.id;
            assert(createdStackId, "create stack must return stack.id");

            const addBaseBranch = await request(`/api/v1/stacks/${createdStackId}/branches`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    branchName: `smoke/${Date.now()}-base`,
                }),
            });
            printResult(`POST /api/v1/stacks/${createdStackId}/branches (base)`, addBaseBranch);
            assert(addBaseBranch.response.status === 200, "add base branch must return 200");
            const firstBranchName = addBaseBranch.payload?.stack?.branches?.[0]?.name;
            assert(firstBranchName, "add branch must include branch name");

            const addFeatureBranch = await request(`/api/v1/stacks/${createdStackId}/branches`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    branchName: `smoke/${Date.now()}-feature`,
                    parentBranchName: firstBranchName,
                }),
            });
            printResult(`POST /api/v1/stacks/${createdStackId}/branches (feature)`, addFeatureBranch);
            assert(addFeatureBranch.response.status === 200, "add feature branch must return 200");
            const secondBranchName = addFeatureBranch.payload?.stack?.branches?.[0]?.name;
            assert(secondBranchName, "feature branch response must include branch name");

            const reorder = await request(`/api/v1/stacks/${createdStackId}/reorder`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    branches: [
                        { branchName: secondBranchName, order: 0 },
                        { branchName: firstBranchName, order: 1 },
                    ],
                }),
            });
            printResult(`PUT /api/v1/stacks/${createdStackId}/reorder`, reorder);
            assert(reorder.response.status === 200, "reorder stack branches must return 200");
            assert(Array.isArray(reorder.payload?.stack?.branches), "reorder response must include branches[]");

            const syncStack = await request(`/api/v1/stacks/${createdStackId}/sync`, {
                method: "POST",
            });
            printResult(`POST /api/v1/stacks/${createdStackId}/sync`, syncStack);
            assert(syncStack.response.status === 200, "stack sync must return 200");
            assert(
                typeof syncStack.payload?.result?.branchesRebased === "number",
                "stack sync must include branchesRebased"
            );

            const submitStack = await request(`/api/v1/stacks/${createdStackId}/submit`, {
                method: "POST",
            });
            printResult(`POST /api/v1/stacks/${createdStackId}/submit`, submitStack);
            assert(submitStack.response.status === 200, "stack submit must return 200");
            assert(
                typeof submitStack.payload?.prsCreated === "number",
                "stack submit must include prsCreated"
            );

            const stackDetail = await request(`/api/v1/stacks/${createdStackId}`);
            printResult(`GET /api/v1/stacks/${createdStackId}`, stackDetail);
            assert(stackDetail.response.status === 200, "stack detail must return 200");
            assert(Array.isArray(stackDetail.payload?.stack?.branches), "stack detail must include branches[]");

            const deleteStack = await request(`/api/v1/stacks/${createdStackId}`, {
                method: "DELETE",
            });
            printResult(`DELETE /api/v1/stacks/${createdStackId}`, deleteStack);
            assert(deleteStack.response.status === 200, "delete stack must return 200");

            const deletedStack = await request(`/api/v1/stacks/${createdStackId}`);
            printResult(`GET /api/v1/stacks/${createdStackId} (deleted)`, deletedStack);
            assert(deletedStack.response.status === 404, "deleted stack detail must return 404");
        }

        const activity = await request("/api/v1/activity?limit=5");
        printResult("GET /api/v1/activity?limit=5", activity);
        assert(
            allowStatus("activity", activity.response.status, 200),
            "activity endpoint status mismatch"
        );
        if (activity.response.status === 200) {
            assert(
                activity.payload && Array.isArray(activity.payload.activities),
                "activity payload must include activities[]"
            );
            if (activity.payload.activities.length > 0) {
                const firstActivity = activity.payload.activities[0];
                assert(typeof firstActivity.id === "string", "activity item must include id");
                assert(typeof firstActivity.type === "string", "activity item must include type");
                assert(typeof firstActivity.title === "string", "activity item must include title");
                assert(typeof firstActivity.timestamp === "string", "activity item must include timestamp");
            }
        } else {
            assertErrorPayload("activity", activity.payload);
        }

        const insights = await request("/api/v1/insights/dashboard");
        printResult("GET /api/v1/insights/dashboard", insights);
        assert(insights.response.status === 200, "insights/dashboard must return 200");
        assert(insights.payload?.velocity?.currentSprint, "insights/dashboard must include velocity.currentSprint");
        assert(Array.isArray(insights.payload?.aiInsights), "insights/dashboard must include aiInsights[]");

        if (firstRepoId) {
            const predictConflicts = await request("/api/v1/insights/predict-conflicts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    repositoryId: firstRepoId,
                    branch: "smoke/branch",
                }),
            });
            printResult("POST /api/v1/insights/predict-conflicts", predictConflicts);
            assert(predictConflicts.response.status === 200, "predict-conflicts must return 200");
            assert(
                typeof predictConflicts.payload?.conflictProbability === "number",
                "predict-conflicts must include conflictProbability"
            );
            assert(
                Array.isArray(predictConflicts.payload?.conflictingPRs),
                "predict-conflicts must include conflictingPRs[]"
            );
        }

        const reviewerFatigue = await request("/api/v1/insights/reviewer-fatigue", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                reviewerId: "20000000-0000-4000-8000-000000000001",
            }),
        });
        printResult("POST /api/v1/insights/reviewer-fatigue", reviewerFatigue);
        assert(reviewerFatigue.response.status === 200, "reviewer-fatigue must return 200");
        assert(
            reviewerFatigue.payload?.analysis?.currentState,
            "reviewer-fatigue must include analysis.currentState"
        );

        const velocityPath = firstRepoId
            ? `/api/v1/insights/velocity?period=week&repositoryId=${encodeURIComponent(firstRepoId)}`
            : "/api/v1/insights/velocity?period=week";
        const velocity = await request(velocityPath);
        printResult("GET /api/v1/insights/velocity?period=week", velocity);
        assert(velocity.response.status === 200, "insights/velocity must return 200");
        assert(
            typeof velocity.payload?.current?.prsOpened === "number",
            "insights/velocity must include current.prsOpened"
        );
        assert(
            Array.isArray(velocity.payload?.trends?.prsPerDay),
            "insights/velocity must include trends.prsPerDay[]"
        );

        const codeHealthPath = firstRepoId
            ? `/api/v1/insights/code-health?repositoryId=${encodeURIComponent(firstRepoId)}`
            : "/api/v1/insights/code-health";
        const codeHealth = await request(codeHealthPath);
        printResult("GET /api/v1/insights/code-health", codeHealth);
        assert(codeHealth.response.status === 200, "insights/code-health must return 200");
        assert(
            typeof codeHealth.payload?.overallScore === "number",
            "insights/code-health must include overallScore"
        );
        assert(
            Array.isArray(codeHealth.payload?.hotspots),
            "insights/code-health must include hotspots[]"
        );

        if (firstPrId) {
            const optimalReviewers = await request(
                `/api/v1/insights/optimal-reviewers?prId=${encodeURIComponent(firstPrId)}&files=src/auth/index.ts,src/api/route.ts`
            );
            printResult("GET /api/v1/insights/optimal-reviewers", optimalReviewers);
            assert(optimalReviewers.response.status === 200, "optimal-reviewers must return 200");
            assert(
                Array.isArray(optimalReviewers.payload?.recommendations),
                "optimal-reviewers must include recommendations[]"
            );
        }

        const queue = await request("/api/v1/queue");
        printResult("GET /api/v1/queue", queue);
        assert(queue.response.status === 200, "queue must return 200");
        assert(queue.payload && Array.isArray(queue.payload.active), "queue payload must include active[]");
        assert(
            queue.payload && queue.payload.controls && typeof queue.payload.controls.paused === "boolean",
            "queue payload must include controls.paused"
        );
        assert(
            queue.payload && queue.payload.controls && typeof queue.payload.controls.turbo === "boolean",
            "queue payload must include controls.turbo"
        );

        const pause = await request("/api/v1/queue/pause", { method: "POST" });
        printResult("POST /api/v1/queue/pause", pause);
        assert(pause.response.status === 200, "queue pause must return 200");
        assert(pause.payload?.paused === true, "queue pause must set paused=true");

        const queuePaused = await request("/api/v1/queue");
        printResult("GET /api/v1/queue (paused)", queuePaused);
        assert(queuePaused.response.status === 200, "queue (paused) must return 200");
        assert(queuePaused.payload?.controls?.paused === true, "queue snapshot must reflect paused state");

        const resume = await request("/api/v1/queue/resume", { method: "POST" });
        printResult("POST /api/v1/queue/resume", resume);
        assert(resume.response.status === 200, "queue resume must return 200");
        assert(resume.payload?.paused === false, "queue resume must set paused=false");

        const turboOn = await request("/api/v1/queue/turbo", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ enabled: true }),
        });
        printResult("POST /api/v1/queue/turbo", turboOn);
        assert(turboOn.response.status === 200, "queue turbo must return 200");
        assert(turboOn.payload?.turbo === true, "queue turbo must set turbo=true");

        const queueTurbo = await request("/api/v1/queue");
        printResult("GET /api/v1/queue (turbo)", queueTurbo);
        assert(queueTurbo.response.status === 200, "queue (turbo) must return 200");
        assert(queueTurbo.payload?.controls?.turbo === true, "queue snapshot must reflect turbo state");

        const activeQueueId = queueTurbo.payload?.active?.[0]?.id;
        if (activeQueueId) {
            const retry = await request(`/api/v1/queue/${activeQueueId}/retry`, {
                method: "POST",
            });
            printResult(`POST /api/v1/queue/${activeQueueId}/retry`, retry);
            assert(retry.response.status === 200, "queue retry must return 200");

            const remove = await request(`/api/v1/queue/${activeQueueId}`, {
                method: "DELETE",
            });
            printResult(`DELETE /api/v1/queue/${activeQueueId}`, remove);
            assert(remove.response.status === 200, "queue remove must return 200");
        }

        if (firstPrId) {
            const reviews = await request(`/api/v1/reviews/pr/${firstPrId}`);
            printResult(`GET /api/v1/reviews/pr/${firstPrId}`, reviews);
            assert(reviews.response.status === 200, "reviews by PR must return 200");
            assert(reviews.payload && Array.isArray(reviews.payload.reviews), "reviews payload must include reviews[]");

            const createReview = await request("/api/v1/reviews", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    prId: firstPrId,
                    action: "comment",
                    body: "Smoke review comment",
                    comments: [
                        {
                            path: "src/auth/middleware.ts",
                            line: 10,
                            body: "Looks good, verify edge case.",
                            side: "RIGHT",
                        },
                    ],
                }),
            });
            printResult("POST /api/v1/reviews", createReview);
            assert(createReview.response.status === 201, "create review must return 201");
            assert(createReview.payload?.review?.id, "create review must return review.id");

            const createComment = await request("/api/v1/reviews/comment", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    prId: firstPrId,
                    body: "Smoke inline comment",
                    path: "src/auth/middleware.ts",
                    line: 12,
                    side: "RIGHT",
                }),
            });
            printResult("POST /api/v1/reviews/comment", createComment);
            assert(createComment.response.status === 201, "create comment must return 201");
            assert(createComment.payload?.comment?.id, "create comment must return comment.id");

            const commentId = createComment.payload?.comment?.id;
            if (commentId) {
                const resolve = await request(`/api/v1/reviews/${commentId}/resolve`, {
                    method: "POST",
                });
                printResult(`POST /api/v1/reviews/${commentId}/resolve`, resolve);
                assert(resolve.response.status === 200, "resolve comment must return 200");
                assert(resolve.payload?.success === true, "resolve comment must return success=true");
            }

            const pending = await request("/api/v1/reviews/pending?limit=5");
            printResult("GET /api/v1/reviews/pending?limit=5", pending);
            assert(pending.response.status === 200, "pending reviews must return 200");
            assert(pending.payload && Array.isArray(pending.payload.pending), "pending payload must include pending[]");
        }

        process.stdout.write("[api-smoke] PASS\n");
    } finally {
        await stopApiService(managedApi);
    }
}

run().catch((error) => {
    process.stderr.write(`[api-smoke] FAIL: ${error.message}\n`);
    process.exitCode = 1;
});
