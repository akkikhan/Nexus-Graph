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
        if (prs.response.status === 200) {
            assert(prs.payload && Array.isArray(prs.payload.prs), "prs payload must include prs[]");
            firstPrId = prs.payload.prs[0]?.id || null;
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
        } else {
            assertErrorPayload("stacks", stacks.payload);
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
        } else {
            assertErrorPayload("activity", activity.payload);
        }

        const insights = await request("/api/v1/insights/dashboard");
        printResult("GET /api/v1/insights/dashboard", insights);
        assert(insights.response.status === 200, "insights/dashboard must return 200");

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
