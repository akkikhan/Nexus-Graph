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

            const createChatSession = await request("/api/v1/chat/sessions", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    repoId: firstRepoId,
                    prId: createdPrId,
                    context: {
                        source: "api-smoke",
                        scope: "pr-review",
                    },
                }),
            });
            printResult("POST /api/v1/chat/sessions", createChatSession);
            assert(createChatSession.response.status === 201, "chat session create must return 201");
            const chatSessionId = createChatSession.payload?.session?.id;
            assert(chatSessionId, "chat session create must return session.id");

            const listChatSessions = await request(`/api/v1/chat/sessions?prId=${encodeURIComponent(createdPrId)}&limit=5`);
            printResult("GET /api/v1/chat/sessions", listChatSessions);
            assert(listChatSessions.response.status === 200, "chat sessions list must return 200");
            assert(Array.isArray(listChatSessions.payload?.sessions), "chat sessions list must include sessions[]");
            assert(
                listChatSessions.payload.sessions.some((session) => session.id === chatSessionId),
                "chat sessions list must include created session"
            );

            const invalidAssistantMessage = await request(`/api/v1/chat/sessions/${chatSessionId}/messages`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    role: "assistant",
                    content: "This should fail because provenance is missing.",
                }),
            });
            printResult(`POST /api/v1/chat/sessions/${chatSessionId}/messages (invalid)`, invalidAssistantMessage);
            assert(invalidAssistantMessage.response.status === 400, "assistant message without provenance must return 400");

            const rawSecret = "ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890";
            const createUserMessage = await request(`/api/v1/chat/sessions/${chatSessionId}/messages`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    role: "user",
                    content: `Please review this token handling path: ${rawSecret}`,
                }),
            });
            printResult(`POST /api/v1/chat/sessions/${chatSessionId}/messages (user)`, createUserMessage);
            assert(createUserMessage.response.status === 201, "chat user message create must return 201");
            assert(createUserMessage.payload?.message?.role === "user", "chat user message must persist user role");

            const createAssistantMessage = await request(`/api/v1/chat/sessions/${chatSessionId}/messages`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    role: "assistant",
                    content: "Found one issue and one follow-up recommendation.",
                    provider: "smoke-provider",
                    model: "smoke-model",
                    provenance: {
                        source: "smoke-ai",
                        model: "smoke-model",
                        provider: "smoke-provider",
                        citations: [
                            {
                                type: "file",
                                file: "src/auth/middleware.ts",
                                line: 15,
                                snippet: "if (!token) return unauthorized();",
                            },
                        ],
                        toolActions: [
                            {
                                name: "diff-analyzer",
                                status: "completed",
                                output: { filesScanned: 2 },
                            },
                        ],
                    },
                    citations: [
                        {
                            type: "doc",
                            title: "Auth Guideline",
                            url: "https://example.com/auth-guideline",
                        },
                    ],
                    toolActions: [
                        {
                            name: "risk-scorer",
                            status: "completed",
                            output: { risk: "high" },
                        },
                    ],
                    promptTokens: 120,
                    completionTokens: 45,
                    totalTokens: 165,
                }),
            });
            printResult(`POST /api/v1/chat/sessions/${chatSessionId}/messages (assistant)`, createAssistantMessage);
            assert(createAssistantMessage.response.status === 201, "chat assistant message create must return 201");
            assert(
                createAssistantMessage.payload?.message?.role === "assistant",
                "chat assistant message must persist assistant role"
            );
            assert(
                createAssistantMessage.payload?.message?.provenance?.model === "smoke-model",
                "chat assistant message must persist provenance model"
            );

            const chatSessionDetail = await request(`/api/v1/chat/sessions/${chatSessionId}`);
            printResult(`GET /api/v1/chat/sessions/${chatSessionId}`, chatSessionDetail);
            assert(chatSessionDetail.response.status === 200, "chat session detail must return 200");
            assert(chatSessionDetail.payload?.session?.prId === createdPrId, "chat session must retain PR context");
            assert(
                Number(chatSessionDetail.payload?.session?.messageCount) >= 2,
                "chat session detail must include persisted message count"
            );

            const chatMessages = await request(`/api/v1/chat/sessions/${chatSessionId}/messages?limit=10`);
            printResult(`GET /api/v1/chat/sessions/${chatSessionId}/messages`, chatMessages);
            assert(chatMessages.response.status === 200, "chat messages list must return 200");
            assert(Array.isArray(chatMessages.payload?.messages), "chat messages list must include messages[]");
            assert(chatMessages.payload.messages.length >= 2, "chat messages list must include persisted messages");

            const persistedUserMessage = chatMessages.payload.messages.find((msg) => msg.role === "user");
            assert(persistedUserMessage, "chat messages list must include user message");
            assert(
                persistedUserMessage.content.includes("[REDACTED_SECRET]"),
                "chat persistence must redact secrets from stored content"
            );
            assert(
                !persistedUserMessage.content.includes(rawSecret),
                "chat persistence must not store raw secret tokens"
            );

            const persistedAssistantMessage = chatMessages.payload.messages.find((msg) => msg.role === "assistant");
            assert(persistedAssistantMessage, "chat messages list must include assistant message");
            assert(
                persistedAssistantMessage.provenance?.provider === "smoke-provider",
                "chat assistant message must preserve provenance provider"
            );

            const createAgentRunDisallowedProvider = await request("/api/v1/agents/runs", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    userId: "20000000-0000-4000-8000-000000000001",
                    repoId: firstRepoId,
                    prId: createdPrId,
                    provider: "untrusted-provider",
                    prompt: "Attempt run with provider blocked by policy.",
                }),
            });
            printResult("POST /api/v1/agents/runs (provider policy rejection)", createAgentRunDisallowedProvider);
            assert(
                createAgentRunDisallowedProvider.response.status === 400,
                "agent run create with disallowed provider must return 400"
            );

            const createAgentRunInvalidBudget = await request("/api/v1/agents/runs", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    userId: "20000000-0000-4000-8000-000000000001",
                    repoId: firstRepoId,
                    prId: createdPrId,
                    provider: "anthropic",
                    budgetCents: 999999,
                    prompt: "Attempt run with budget over guardrail max.",
                }),
            });
            printResult("POST /api/v1/agents/runs (budget policy rejection)", createAgentRunInvalidBudget);
            assert(
                createAgentRunInvalidBudget.response.status === 400,
                "agent run create with invalid budget must return 400"
            );

            const createAgentRun = await request("/api/v1/agents/runs", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    userId: "20000000-0000-4000-8000-000000000001",
                    repoId: firstRepoId,
                    prId: createdPrId,
                    provider: "anthropic",
                    model: "claude-sonnet-smoke",
                    budgetCents: 20,
                    prompt: `Refactor auth middleware and open PR. token=${rawSecret}`,
                    plan: {
                        steps: [
                            "Inspect auth middleware",
                            "Draft refactor plan",
                            "Generate patch",
                        ],
                    },
                }),
            });
            printResult("POST /api/v1/agents/runs", createAgentRun);
            assert(createAgentRun.response.status === 201, "agent run create must return 201");
            const agentRunId = createAgentRun.payload?.run?.id;
            assert(agentRunId, "agent run create must return run.id");
            assert(createAgentRun.payload?.run?.status === "planned", "agent run should start in planned state");
            assert(createAgentRun.payload?.run?.provider === "anthropic", "agent run must persist provider");
            assert(createAgentRun.payload?.run?.budgetCents === 20, "agent run must persist budget");
            assert(
                createAgentRun.payload?.run?.prompt?.includes("[REDACTED_SECRET]"),
                "agent run prompt must redact secrets"
            );

            const agentRunDetailPlanned = await request(`/api/v1/agents/runs/${agentRunId}`);
            printResult(`GET /api/v1/agents/runs/${agentRunId}`, agentRunDetailPlanned);
            assert(agentRunDetailPlanned.response.status === 200, "agent run detail must return 200");
            assert(agentRunDetailPlanned.payload?.run?.status === "planned", "agent run detail should show planned");

            const listAgentRuns = await request(`/api/v1/agents/runs?prId=${encodeURIComponent(createdPrId)}&limit=10`);
            printResult("GET /api/v1/agents/runs", listAgentRuns);
            assert(listAgentRuns.response.status === 200, "agent runs list must return 200");
            assert(Array.isArray(listAgentRuns.payload?.runs), "agent runs list must include runs[]");
            assert(
                listAgentRuns.payload.runs.some((run) => run.id === agentRunId),
                "agent runs list must include created run"
            );

            const invalidTransitionPlannedToCompleted = await request(`/api/v1/agents/runs/${agentRunId}/transition`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    status: "completed",
                    message: "This should fail due to invalid transition.",
                }),
            });
            printResult(
                `POST /api/v1/agents/runs/${agentRunId}/transition (planned->completed invalid)`,
                invalidTransitionPlannedToCompleted
            );
            assert(
                invalidTransitionPlannedToCompleted.response.status === 409,
                "invalid planned->completed transition must return 409"
            );

            const transitionToRunning = await request(`/api/v1/agents/runs/${agentRunId}/transition`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    status: "running",
                    message: "Execution started.",
                    actor: "smoke-runner",
                }),
            });
            printResult(`POST /api/v1/agents/runs/${agentRunId}/transition (running)`, transitionToRunning);
            assert(transitionToRunning.response.status === 200, "planned->running transition must return 200");
            assert(transitionToRunning.payload?.run?.status === "running", "agent run should transition to running");

            const awaitingApprovalWithoutReason = await request(`/api/v1/agents/runs/${agentRunId}/transition`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    status: "awaiting_approval",
                    actor: "smoke-runner",
                }),
            });
            printResult(
                `POST /api/v1/agents/runs/${agentRunId}/transition (awaiting_approval invalid)`,
                awaitingApprovalWithoutReason
            );
            assert(
                awaitingApprovalWithoutReason.response.status === 400,
                "awaiting_approval transition without reason must return 400"
            );

            const awaitingApproval = await request(`/api/v1/agents/runs/${agentRunId}/transition`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    status: "awaiting_approval",
                    awaitingApprovalReason: "Needs human checkpoint before file mutations.",
                    approvalCheckpoint: "checkpoint-smoke-1",
                    actor: "smoke-runner",
                }),
            });
            printResult(`POST /api/v1/agents/runs/${agentRunId}/transition (awaiting_approval)`, awaitingApproval);
            assert(awaitingApproval.response.status === 200, "running->awaiting_approval transition must return 200");
            assert(
                awaitingApproval.payload?.run?.status === "awaiting_approval",
                "agent run should transition to awaiting_approval"
            );

            const createAuditWhileAwaitingApproval = await request(`/api/v1/agents/runs/${agentRunId}/audit`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    type: "command",
                    actor: "smoke-runner",
                    command: "git status",
                    message: "Attempt mutation while approval is pending.",
                    details: {
                        costCents: 1,
                    },
                }),
            });
            printResult(`POST /api/v1/agents/runs/${agentRunId}/audit (awaiting approval blocked)`, createAuditWhileAwaitingApproval);
            assert(
                createAuditWhileAwaitingApproval.response.status === 409,
                "mutation audit event must be blocked when run is awaiting approval"
            );

            const transitionApprovalToRunningWithoutCheckpoint = await request(`/api/v1/agents/runs/${agentRunId}/transition`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    status: "running",
                    actor: "human-approver",
                    message: "Approval attempted without checkpoint.",
                }),
            });
            printResult(
                `POST /api/v1/agents/runs/${agentRunId}/transition (awaiting_approval->running missing checkpoint)`,
                transitionApprovalToRunningWithoutCheckpoint
            );
            assert(
                transitionApprovalToRunningWithoutCheckpoint.response.status === 400,
                "awaiting_approval->running without checkpoint must return 400"
            );

            const transitionApprovalToRunningWrongCheckpoint = await request(`/api/v1/agents/runs/${agentRunId}/transition`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    status: "running",
                    approvalCheckpoint: "wrong-checkpoint",
                    actor: "human-approver",
                    message: "Approval attempted with wrong checkpoint.",
                }),
            });
            printResult(
                `POST /api/v1/agents/runs/${agentRunId}/transition (awaiting_approval->running wrong checkpoint)`,
                transitionApprovalToRunningWrongCheckpoint
            );
            assert(
                transitionApprovalToRunningWrongCheckpoint.response.status === 409,
                "awaiting_approval->running with wrong checkpoint must return 409"
            );

            const transitionApprovalToRunning = await request(`/api/v1/agents/runs/${agentRunId}/transition`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    status: "running",
                    approvalCheckpoint: "checkpoint-smoke-1",
                    actor: "human-approver",
                    message: "Approval granted. Continue execution.",
                }),
            });
            printResult(
                `POST /api/v1/agents/runs/${agentRunId}/transition (awaiting_approval->running)`,
                transitionApprovalToRunning
            );
            assert(
                transitionApprovalToRunning.response.status === 200,
                "awaiting_approval->running transition must return 200"
            );

            const createAgentAuditEvent = await request(`/api/v1/agents/runs/${agentRunId}/audit`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    type: "command",
                    actor: "smoke-runner",
                    command: `git commit -m \"test\" && echo ${rawSecret}`,
                    message: "Executed command for agent planning.",
                    details: {
                        exitCode: 0,
                        phase: "planning",
                        costCents: 15,
                    },
                }),
            });
            printResult(`POST /api/v1/agents/runs/${agentRunId}/audit`, createAgentAuditEvent);
            assert(createAgentAuditEvent.response.status === 201, "agent audit append must return 201");
            assert(
                createAgentAuditEvent.payload?.event?.command?.includes("[REDACTED_SECRET]"),
                "agent audit command must redact secrets"
            );

            const createAgentAuditEventBudgetExceeded = await request(`/api/v1/agents/runs/${agentRunId}/audit`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    type: "command",
                    actor: "smoke-runner",
                    command: "git push",
                    message: "Attempt command over budget.",
                    details: {
                        costCents: 10,
                    },
                }),
            });
            printResult(`POST /api/v1/agents/runs/${agentRunId}/audit (budget exceeded)`, createAgentAuditEventBudgetExceeded);
            assert(
                createAgentAuditEventBudgetExceeded.response.status === 409,
                "agent audit append must reject events that exceed run budget"
            );

            const auditEvents = await request(`/api/v1/agents/runs/${agentRunId}/audit?limit=20`);
            printResult(`GET /api/v1/agents/runs/${agentRunId}/audit`, auditEvents);
            assert(auditEvents.response.status === 200, "agent audit listing must return 200");
            assert(Array.isArray(auditEvents.payload?.events), "agent audit listing must include events[]");
            assert(auditEvents.payload.events.length >= 4, "agent audit listing should include lifecycle + command events");
            assert(
                auditEvents.payload.events.some((event) => event.type === "status_transition"),
                "agent audit listing must include status transition events"
            );

            const transitionToCompleted = await request(`/api/v1/agents/runs/${agentRunId}/transition`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    status: "completed",
                    actor: "smoke-runner",
                    message: "Agent run completed successfully.",
                }),
            });
            printResult(`POST /api/v1/agents/runs/${agentRunId}/transition (completed)`, transitionToCompleted);
            assert(transitionToCompleted.response.status === 200, "running->completed transition must return 200");
            assert(transitionToCompleted.payload?.run?.status === "completed", "agent run should transition to completed");

            const invalidCompletedToRunning = await request(`/api/v1/agents/runs/${agentRunId}/transition`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    status: "running",
                    actor: "smoke-runner",
                    message: "This should fail because run is completed.",
                }),
            });
            printResult(
                `POST /api/v1/agents/runs/${agentRunId}/transition (completed->running invalid)`,
                invalidCompletedToRunning
            );
            assert(
                invalidCompletedToRunning.response.status === 409,
                "completed->running transition must return 409"
            );

            const createFailingRun = await request("/api/v1/agents/runs", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    userId: "20000000-0000-4000-8000-000000000001",
                    repoId: firstRepoId,
                    provider: "anthropic",
                    prompt: "Attempt risky refactor and capture failure path.",
                }),
            });
            printResult("POST /api/v1/agents/runs (failing run)", createFailingRun);
            assert(createFailingRun.response.status === 201, "failing agent run create must return 201");
            const failingRunId = createFailingRun.payload?.run?.id;
            assert(failingRunId, "failing run create must return run.id");

            const failingRunToRunning = await request(`/api/v1/agents/runs/${failingRunId}/transition`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    status: "running",
                    message: "Failing run started.",
                }),
            });
            printResult(`POST /api/v1/agents/runs/${failingRunId}/transition (running)`, failingRunToRunning);
            assert(failingRunToRunning.response.status === 200, "failing run planned->running must return 200");

            const failingRunToFailed = await request(`/api/v1/agents/runs/${failingRunId}/transition`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    status: "failed",
                    actor: "smoke-runner",
                    message: "Run failed as part of smoke scenario.",
                    errorMessage: `Provider refused token ${rawSecret}`,
                }),
            });
            printResult(`POST /api/v1/agents/runs/${failingRunId}/transition (failed)`, failingRunToFailed);
            assert(failingRunToFailed.response.status === 200, "running->failed transition must return 200");
            assert(failingRunToFailed.payload?.run?.status === "failed", "failing run should transition to failed");
            assert(
                failingRunToFailed.payload?.run?.errorMessage?.includes("[REDACTED_SECRET]"),
                "failed run error message must redact secrets"
            );
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
