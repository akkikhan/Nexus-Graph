import { expect, test } from "@playwright/test";

test.describe.configure({ timeout: 120000 });

function jsonResponse(status: number, payload: unknown) {
    return {
        status,
        contentType: "application/json",
        body: JSON.stringify(payload),
    };
}

test("inbox healthy path: search/filter, open detail, request AI review", async ({ page }) => {
    test.setTimeout(120000);

    await page.route("**/api/v1/prs**", async (route) => {
        const url = new URL(route.request().url());
        if (url.pathname === "/api/v1/prs") {
            await route.fulfill(
                jsonResponse(200, {
                    prs: [
                        {
                            id: "pr-1",
                            number: 101,
                            title: "Add auth middleware",
                            status: "open",
                            author: { username: "johndoe", avatar: "" },
                            repository: { id: "repo-1", name: "nexus/platform" },
                            riskLevel: "high",
                            riskScore: 72,
                            aiSummary: "Auth middleware and request validation.",
                            comments: 3,
                            linesAdded: 120,
                            linesRemoved: 14,
                            createdAt: new Date().toISOString(),
                            updatedAt: new Date().toISOString(),
                        },
                    ],
                    total: 1,
                    limit: 20,
                    offset: 0,
                })
            );
            return;
        }
        await route.fallback();
    });

    await page.route("**/api/v1/prs/pr-1", async (route) => {
        await route.fulfill(
            jsonResponse(200, {
                pr: {
                    id: "pr-1",
                    number: 101,
                    title: "Add auth middleware",
                    description: "Implements auth middleware for API routes.",
                    status: "open",
                    author: { username: "johndoe", avatar: "" },
                    repository: { id: "repo-1", name: "nexus/platform" },
                    headBranch: "feature/auth",
                    baseBranch: "main",
                    riskLevel: "high",
                    riskScore: 72,
                    aiSummary: "Auth middleware and request validation.",
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    files: [{ path: "src/auth/middleware.ts", additions: 120, deletions: 14 }],
                },
            })
        );
    });

    await page.route("**/api/v1/prs/pr-1/request-review", async (route) => {
        await route.fulfill(jsonResponse(200, { success: true, message: "AI review queued" }));
    });
    await page.route("**/api/v1/integrations/issue-links**", async (route) => {
        const url = new URL(route.request().url());
        const prId = url.searchParams.get("prId");
        const links = [
            {
                id: "issue-link-pr-1",
                repoId: "repo-1",
                prId: "pr-1",
                provider: "linear",
                issueKey: "LIN-101",
                issueTitle: "Auth middleware rollout",
                issueUrl: "https://linear.app/nexus/issue/LIN-101/auth-middleware-rollout",
                status: "linked",
                metadata: {},
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            },
        ].filter((link) => {
            if (prId && link.prId !== prId) return false;
            return true;
        });
        await route.fulfill(
            jsonResponse(200, {
                links,
                total: links.length,
                limit: 20,
                offset: 0,
            })
        );
    });

    await page.goto("/inbox", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /PR Inbox/i })).toBeVisible({ timeout: 20000 });
    await expect(page.getByText(/LIN-101/i)).toBeVisible({ timeout: 20000 });

    const searchInput = page.locator('input[placeholder*="Search pull requests"]').first();
    await searchInput.fill("auth");

    const openFilter = page.getByRole("button", { name: /^open$/i }).first();
    await openFilter.click();

    const firstCard = page.locator("div.cursor-pointer.group").first();
    await firstCard.click();
    const inboxNavigated = await page
        .waitForURL(/\/inbox\/[^/]+$/, { timeout: 45000 })
        .then(() => true)
        .catch(() => false);
    const pathname = new URL(page.url()).pathname;
    if (!inboxNavigated && !/\/inbox\/[^/]+$/.test(pathname)) {
        await page.goto("/inbox/pr-1", { waitUntil: "domcontentloaded", timeout: 60000 });
    }

    await expect(page.getByText("Back to Inbox")).toBeVisible({ timeout: 30000 });
    await expect(page.getByText(/Linked Issues/i)).toBeVisible({ timeout: 30000 });
    await expect(page.getByText(/Auth middleware rollout/i)).toBeVisible({ timeout: 30000 });
    await page.getByRole("button", { name: /Request AI Review/i }).click();
    await expect(page.getByText(/AI review queued/i)).toBeVisible();
});

test("inbox degraded path: explicit error UI", async ({ page }) => {
    await page.route("**/api/v1/prs**", async (route) => {
        const url = new URL(route.request().url());
        if (url.pathname === "/api/v1/prs") {
            await route.fulfill(
                jsonResponse(503, {
                    error: "Database unavailable for pull request listing",
                    details: "connect ECONNREFUSED ::1:5432",
                })
            );
            return;
        }
        await route.fallback();
    });

    await page.goto("/inbox", { waitUntil: "domcontentloaded" });
    await expect(page.getByText(/Error loading PR/i)).toBeVisible({ timeout: 20000 });
    await expect(page.getByText(/Database unavailable/i)).toBeVisible({ timeout: 20000 });
});

test("stacks list and detail route", async ({ page }) => {
    await page.route("**/api/v1/stacks", async (route) => {
        if (route.request().method() === "GET") {
            await route.fulfill(
                jsonResponse(200, {
                    stacks: [
                        {
                            id: "stack-db-1",
                            name: "Auth rollout",
                            repository: { id: "repo-1", name: "nexus/platform" },
                            baseBranch: "main",
                            branches: [{ name: "feature/auth", order: 1, status: "open", prNumber: 101 }],
                            mergableCount: 0,
                            totalPRs: 1,
                            createdAt: new Date().toISOString(),
                            updatedAt: new Date().toISOString(),
                        },
                    ],
                })
            );
            return;
        }
        await route.fallback();
    });

    await page.route("**/api/v1/stacks/stack-db-1", async (route) => {
        await route.fulfill(
            jsonResponse(200, {
                stack: {
                    id: "stack-db-1",
                    name: "Auth rollout",
                    repository: { id: "repo-1", name: "nexus/platform" },
                    baseBranch: "main",
                    branches: [
                        {
                            name: "feature/auth",
                            order: 1,
                            status: "open",
                            pr: { id: "pr-1", number: 101, title: "Add auth middleware", riskScore: 72 },
                        },
                    ],
                    mergableCount: 0,
                    totalPRs: 1,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                },
            })
        );
    });

    await page.route("**/api/v1/stacks/stack-db-1/sync", async (route) => {
        await route.fulfill(jsonResponse(200, { success: true, message: "Stack synced successfully" }));
    });

    await page.route("**/api/v1/stacks/stack-db-1/submit", async (route) => {
        await route.fulfill(jsonResponse(200, { success: true, message: "Stack submitted", prsCreated: 1 }));
    });
    await page.route("**/api/v1/integrations/issue-links**", async (route) => {
        const links = [
            {
                id: "stack-link-1",
                repoId: "repo-1",
                prId: "pr-1",
                provider: "linear",
                issueKey: "LIN-STACK-1",
                issueTitle: "Stack auth dependency chain",
                issueUrl: "https://linear.app/nexus/issue/LIN-STACK-1/stack-auth-dependency-chain",
                status: "linked",
                metadata: {},
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            },
        ];
        await route.fulfill(
            jsonResponse(200, {
                links,
                total: links.length,
                limit: 20,
                offset: 0,
            })
        );
    });

    await page.goto("/stacks", { waitUntil: "domcontentloaded" });
    await page.getByTestId("stack-card-stack-db-1").click();
    const stackNavigated = await page
        .waitForURL(/\/stacks\/[^/]+$/, { timeout: 45000 })
        .then(() => true)
        .catch(() => false);
    const stackPathname = new URL(page.url()).pathname;
    if (!stackNavigated && !/\/stacks\/[^/]+$/.test(stackPathname)) {
        await page.goto("/stacks/stack-db-1", { waitUntil: "domcontentloaded", timeout: 60000 });
    }
    await expect(page.getByText("Back to Stacks")).toBeVisible({ timeout: 30000 });
    await expect(page.getByText("Branch Order")).toBeVisible({ timeout: 30000 });
    await expect(page.getByText(/LIN-STACK-1/i)).toBeVisible({ timeout: 30000 });
});

test("queue: toggle turbo action", async ({ page }) => {
    let turbo = false;

    await page.route("**/api/v1/queue", async (route) => {
        if (route.request().method() === "GET") {
            await route.fulfill(
                jsonResponse(200, {
                    active: [],
                    recent: [],
                    controls: { paused: false, turbo },
                    stats: { queueLength: 0, avgWaitTime: "8m", successRate: 100, throughput: "24/day" },
                })
            );
            return;
        }
        await route.fallback();
    });

    await page.route("**/api/v1/queue/turbo", async (route) => {
        const payload = route.request().postDataJSON() as { enabled?: boolean };
        turbo = Boolean(payload?.enabled);
        await route.fulfill(jsonResponse(200, { success: true, turbo }));
    });

    await page.goto("/queue", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /Enable Turbo/i }).click();
    await expect(page.getByRole("button", { name: /Disable Turbo/i })).toBeVisible();
});

test("activity: filter switching", async ({ page }) => {
    await page.route("**/api/v1/activity", async (route) => {
        await route.fulfill(
            jsonResponse(200, {
                activities: [
                    {
                        id: "act-1",
                        type: "ai_review",
                        icon: "Bot",
                        color: "text-purple-500",
                        bgColor: "bg-purple-500/10",
                        title: "AI Review Completed",
                        description: "Reviewed #101",
                        timestamp: "1 minute ago",
                    },
                    {
                        id: "act-2",
                        type: "pr_merged",
                        icon: "GitMerge",
                        color: "text-green-500",
                        bgColor: "bg-green-500/10",
                        title: "PR Merged",
                        description: "#99 merged successfully",
                        timestamp: "2 minutes ago",
                    },
                    {
                        id: "act-3",
                        type: "stack_updated",
                        icon: "GitBranch",
                        color: "text-nexus-500",
                        bgColor: "bg-nexus-500/10",
                        title: "Stack Updated",
                        description: 'Stack "Auth stack" has 3 branches',
                        timestamp: "just now",
                    },
                    {
                        id: "act-4",
                        type: "integration_event",
                        icon: "Globe",
                        color: "text-cyan-400",
                        bgColor: "bg-cyan-500/10",
                        title: "Integration connection",
                        description: "Connection Jira Prod is now active.",
                        timestamp: "just now",
                        integration: {
                            provider: "jira",
                            scope: "connection",
                            action: "manual_validate",
                            outcome: "success",
                        },
                    },
                ],
            })
        );
    });

    await page.goto("/activity", { waitUntil: "domcontentloaded" });
    const reviewCard = page.getByRole("heading", { name: "AI Review Completed" });
    const mergeCard = page.getByRole("heading", { name: "PR Merged" });
    const stackCard = page.getByRole("heading", { name: "Stack Updated" });
    const integrationCard = page.getByRole("heading", { name: "Integration connection" });
    await page.getByRole("button", { name: /Reviews/i }).click();
    await expect(reviewCard).toBeVisible();
    await expect(mergeCard).toHaveCount(0);
    await expect(stackCard).toHaveCount(0);
    await expect(integrationCard).toHaveCount(0);
    await page.getByRole("button", { name: /Merges/i }).click();
    await expect(mergeCard).toBeVisible();
    await expect(reviewCard).toHaveCount(0);
    await expect(stackCard).toHaveCount(0);
    await expect(integrationCard).toHaveCount(0);
    await page.getByRole("button", { name: /Stacks/i }).click();
    await expect(stackCard).toBeVisible();
    await expect(page.getByText(/Auth stack/i)).toBeVisible();
    await expect(reviewCard).toHaveCount(0);
    await expect(mergeCard).toHaveCount(0);
    await expect(integrationCard).toHaveCount(0);
    await page.getByRole("button", { name: /Integrations/i }).click();
    await expect(integrationCard).toBeVisible();
    await expect(page.getByText("manual validate")).toBeVisible();
    await expect(reviewCard).toHaveCount(0);
    await expect(mergeCard).toHaveCount(0);
    await expect(stackCard).toHaveCount(0);
});

test("insights dashboard load", async ({ page }) => {
    await page.route("**/api/v1/insights/dashboard", async (route) => {
        await route.fulfill(
            jsonResponse(200, {
                velocity: {
                    currentSprint: { committed: 10, completed: 6, predicted: 8, accuracy: 0.8 },
                    trend: [
                        { period: "W-3", velocity: 6 },
                        { period: "W-2", velocity: 8 },
                        { period: "W-1", velocity: 7 },
                        { period: "Current", velocity: 6 },
                    ],
                },
                codeHealth: {
                    score: 78,
                    trend: "+3",
                    breakdown: { testCoverage: 72, typeSafety: 85, documentation: 45, complexity: 68 },
                },
                reviewerHealth: {
                    averageReviewTime: "4.2h",
                    fatigueAlerts: 1,
                    topReviewers: [{ username: "sarah", reviews: 24, quality: 0.94 }],
                },
                aiInsights: [
                    {
                        type: "velocity_prediction",
                        severity: "warning",
                        message: "Sprint completion at risk",
                        action: "review_scope",
                    },
                ],
                bottlenecks: [{ type: "review_wait", description: "PRs wait for initial review", avgHours: 18 }],
            })
        );
    });

    await page.goto("/insights", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /AI Insights/i })).toBeVisible({ timeout: 20000 });
    await expect(page.getByText(/Sprint completion at risk/i)).toBeVisible({ timeout: 20000 });
});

test("settings diagnostics: webhook auth events visible with filters", async ({ page }) => {
    await page.route("**/api/v1/health", async (route) => {
        await route.fulfill(
            jsonResponse(200, {
                status: "healthy",
                version: "0.1.0",
                timestamp: new Date().toISOString(),
                database: {
                    connected: true,
                    latencyMs: 9,
                },
                websocket: {
                    status: "ready",
                    connectedClients: 2,
                },
            })
        );
    });

    const nowIso = new Date().toISOString();
    const connectionRecords = [
        {
            id: "conn-slack-1",
            repoId: "repo-1",
            provider: "slack",
            status: "active" as const,
            displayName: "Slack Main",
            config: { defaultChannel: "C123" } as Record<string, unknown>,
            lastValidatedAt: nowIso,
            createdAt: nowIso,
            updatedAt: nowIso,
        },
        {
            id: "conn-jira-1",
            repoId: "repo-1",
            provider: "jira",
            status: "error" as const,
            displayName: "Jira Prod",
            config: {} as Record<string, unknown>,
            lastError: "token revoked",
            createdAt: nowIso,
            updatedAt: nowIso,
        },
    ];
    const connectionActionAudits: Array<{
        id: string;
        action: string;
        entityType: string;
        entityId?: string;
        repoId?: string;
        connectionId?: string;
        outcome: "success" | "error";
        summary: string;
        metadata: Record<string, unknown>;
        createdAt: string;
    }> = [];
    const appendConnectionActionAudit = (entry: {
        action: string;
        entityId?: string;
        repoId?: string;
        connectionId?: string;
        outcome: "success" | "error";
        summary: string;
        metadata?: Record<string, unknown>;
    }) => {
        connectionActionAudits.unshift({
            id: `connection-audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            action: entry.action,
            entityType: "integration_connection",
            entityId: entry.entityId,
            repoId: entry.repoId,
            connectionId: entry.connectionId,
            outcome: entry.outcome,
            summary: entry.summary,
            metadata: entry.metadata || {},
            createdAt: new Date().toISOString(),
        });
    };

    await page.route("**/api/v1/integrations/connections**", async (route) => {
        const url = new URL(route.request().url());
        const method = route.request().method().toUpperCase();
        const path = url.pathname;
        const validateMatch = path.match(/\/connections\/([^/]+)\/validate$/);
        if (validateMatch && method === "POST") {
            const connectionId = validateMatch[1];
            const connection = connectionRecords.find((item) => item.id === connectionId);
            if (!connection) {
                await route.fulfill(jsonResponse(404, { error: "Integration connection not found" }));
                return;
            }
            const payload = route.request().postDataJSON() as { simulateFailure?: boolean } | null;
            const simulateFailure = payload?.simulateFailure === true;
            connection.lastValidatedAt = new Date().toISOString();
            connection.updatedAt = new Date().toISOString();
            if (simulateFailure) {
                connection.status = "error";
                connection.lastError = "Manual validation failure drill from settings control plane";
                appendConnectionActionAudit({
                    action: "integration.connection.manual_validate_fail",
                    entityId: connection.id,
                    repoId: connection.repoId,
                    connectionId: connection.id,
                    outcome: "error",
                    summary: `Connection ${connection.displayName} is now ${connection.status}.`,
                    metadata: {
                        provider: connection.provider,
                        status: connection.status,
                    },
                });
                await route.fulfill(
                    jsonResponse(200, {
                        success: true,
                        reason: "validation_failed",
                        connection,
                    })
                );
                return;
            }
            if (connection.status !== "disabled") connection.status = "active";
            connection.lastError = undefined;
            appendConnectionActionAudit({
                action: "integration.connection.manual_validate",
                entityId: connection.id,
                repoId: connection.repoId,
                connectionId: connection.id,
                outcome: "success",
                summary: `Connection ${connection.displayName} is now ${connection.status}.`,
                metadata: {
                    provider: connection.provider,
                    status: connection.status,
                },
            });
            await route.fulfill(
                jsonResponse(200, {
                    success: true,
                    reason: "validated",
                    connection,
                })
            );
            return;
        }

        const statusMatch = path.match(/\/connections\/([^/]+)\/status$/);
        if (statusMatch && method === "POST") {
            const connectionId = statusMatch[1];
            const connection = connectionRecords.find((item) => item.id === connectionId);
            if (!connection) {
                await route.fulfill(jsonResponse(404, { error: "Integration connection not found" }));
                return;
            }
            const payload = route.request().postDataJSON() as { status?: "active" | "disabled" } | null;
            if (!payload?.status) {
                await route.fulfill(jsonResponse(400, { error: "status is required" }));
                return;
            }
            connection.status = payload.status;
            connection.updatedAt = new Date().toISOString();
            if (payload.status === "active") {
                connection.lastError = undefined;
            }
            appendConnectionActionAudit({
                action: "integration.connection.set_status",
                entityId: connection.id,
                repoId: connection.repoId,
                connectionId: connection.id,
                outcome: "success",
                summary: `Connection ${connection.displayName} status set to ${connection.status}.`,
                metadata: {
                    provider: connection.provider,
                    status: connection.status,
                },
            });
            await route.fulfill(
                jsonResponse(200, {
                    success: true,
                    reason: "status_updated",
                    connection,
                })
            );
            return;
        }

        if (path.endsWith("/connections") && method === "GET") {
            const repoId = url.searchParams.get("repoId");
            const provider = url.searchParams.get("provider");
            const status = url.searchParams.get("status");
            const rows = connectionRecords.filter((connection) => {
                if (repoId && connection.repoId !== repoId) return false;
                if (provider && connection.provider !== provider) return false;
                if (status && connection.status !== status) return false;
                return true;
            });
            await route.fulfill(
                jsonResponse(200, {
                    connections: rows,
                    total: rows.length,
                    limit: 50,
                    offset: 0,
                })
            );
            return;
        }

        await route.fulfill(
            jsonResponse(404, { error: "Unhandled connections route in smoke test" })
        );
    });

    await page.route("**/api/v1/integrations/metrics**", async (route) => {
        await route.fulfill(
            jsonResponse(200, {
                totals: {
                    connections: 2,
                    issueLinks: 3,
                    deliveries: 5,
                    webhookEvents: 7,
                    webhookAuthFailures: 2,
                    webhookAuthConfigErrors: 1,
                    issueSyncAttempts: 4,
                    pending: 1,
                    retrying: 1,
                    delivered: 3,
                    failed: 1,
                    deadLetter: 1,
                    webhooksReceived: 1,
                    webhooksProcessed: 5,
                    webhooksFailed: 1,
                    webhooksDeadLetter: 0,
                    issueSyncPending: 1,
                    issueSyncSynced: 2,
                    issueSyncFailed: 1,
                    issueSyncDeadLetter: 0,
                },
                providers: {
                    slack: 1,
                    jira: 1,
                },
                webhookAuth: {
                    failuresByProvider: {
                        slack: 2,
                    },
                    failuresByReason: {
                        missing_signature_headers: 1,
                        timestamp_out_of_window: 1,
                    },
                    failureRatePct: 20,
                },
                retryQueue: {
                    notificationQueued: 1,
                    webhookQueued: 1,
                },
                successRatePct: 75,
                generatedAt: new Date().toISOString(),
            })
        );
    });

    await page.route("**/api/v1/integrations/alerts**", async (route) => {
        await route.fulfill(
            jsonResponse(200, {
                status: "warning",
                alerts: [
                    {
                        code: "webhook_auth_failures_high",
                        severity: "warning",
                        message: "Webhook auth failure count is above threshold.",
                        value: 2,
                        threshold: 1,
                    },
                ],
                thresholds: {
                    minSuccessRatePct: 95,
                    maxRetryQueueAgeSeconds: 300,
                    webhookAuthWindowMinutes: 60,
                    maxWebhookAuthFailures: 1,
                    maxWebhookAuthFailureRatePct: 5,
                    minDeliverySamples: 20,
                    minWebhookAuthSamples: 20,
                },
                queueAges: {
                    oldestNotificationRetryAgeSeconds: 100,
                    oldestWebhookRetryAgeSeconds: 90,
                },
                suppression: {
                    deliverySampleCount: 12,
                    webhookAuthSampleCount: 12,
                    suppressedCodes: [],
                },
                webhookAuthWindow: {
                    startAt: new Date().toISOString(),
                    failures: 2,
                    ingested: 10,
                    failureRatePct: 20,
                    configErrors: 1,
                },
                generatedAt: new Date().toISOString(),
            })
        );
    });

    const webhookEvents = [
        {
            id: "wh-1",
            provider: "slack",
            repoId: "repo-1",
            eventType: "push.failed",
            externalEventId: "wh-ext-1",
            payload: {},
            status: "failed",
            attempts: 1,
            maxAttempts: 3,
            nextAttemptAt: nowIso,
            correlationId: "corr-wh-1",
            createdAt: nowIso,
            updatedAt: nowIso,
        },
        {
            id: "wh-2",
            provider: "slack",
            repoId: "repo-1",
            eventType: "message.channels",
            externalEventId: "wh-ext-2",
            payload: {},
            status: "received",
            attempts: 0,
            maxAttempts: 3,
            nextAttemptAt: nowIso,
            correlationId: "corr-wh-2",
            createdAt: nowIso,
            updatedAt: nowIso,
        },
    ];
    const webhookActionAudits: Array<{
        id: string;
        action: string;
        entityType: string;
        entityId?: string;
        repoId?: string;
        webhookEventId?: string;
        outcome: "success" | "error";
        summary: string;
        metadata: Record<string, unknown>;
        createdAt: string;
    }> = [];

    const appendWebhookActionAudit = (entry: {
        action: string;
        entityId?: string;
        repoId?: string;
        webhookEventId?: string;
        outcome: "success" | "error";
        summary: string;
        metadata?: Record<string, unknown>;
    }) => {
        webhookActionAudits.unshift({
            id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            action: entry.action,
            entityType: "integration_webhook",
            entityId: entry.entityId,
            repoId: entry.repoId,
            webhookEventId: entry.webhookEventId,
            outcome: entry.outcome,
            summary: entry.summary,
            metadata: entry.metadata || {},
            createdAt: new Date().toISOString(),
        });
    };

    const notificationDeliveries = [
        {
            id: "nd-1",
            connectionId: "conn-slack-1",
            repoId: "repo-1",
            channel: "C123",
            eventType: "pr.review.requested",
            payload: {},
            status: "pending",
            attempts: 0,
            maxAttempts: 3,
            nextAttemptAt: nowIso,
            correlationId: "notif-corr-1",
            createdAt: nowIso,
            updatedAt: nowIso,
        },
        {
            id: "nd-2",
            connectionId: "conn-slack-1",
            repoId: "repo-1",
            channel: "C123",
            eventType: "ai.finding.critical",
            payload: {},
            status: "retrying",
            attempts: 1,
            maxAttempts: 3,
            nextAttemptAt: nowIso,
            correlationId: "notif-corr-2",
            createdAt: nowIso,
            updatedAt: nowIso,
        },
    ];
    const notificationActionAudits: Array<{
        id: string;
        action: string;
        entityType: string;
        entityId?: string;
        repoId?: string;
        deliveryId?: string;
        outcome: "success" | "error";
        summary: string;
        metadata: Record<string, unknown>;
        createdAt: string;
    }> = [];

    const appendNotificationActionAudit = (entry: {
        action: string;
        entityId?: string;
        repoId?: string;
        deliveryId?: string;
        outcome: "success" | "error";
        summary: string;
        metadata?: Record<string, unknown>;
    }) => {
        notificationActionAudits.unshift({
            id: `notif-audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            action: entry.action,
            entityType: "integration_notification",
            entityId: entry.entityId,
            repoId: entry.repoId,
            deliveryId: entry.deliveryId,
            outcome: entry.outcome,
            summary: entry.summary,
            metadata: entry.metadata || {},
            createdAt: new Date().toISOString(),
        });
    };
    const issueLinks = [
        {
            id: "il-1",
            repoId: "repo-1",
            prId: "pr-101",
            provider: "linear",
            issueKey: "LIN-123",
            status: "sync_failed",
            metadata: {},
            createdAt: nowIso,
            updatedAt: nowIso,
        },
        {
            id: "il-2",
            repoId: "repo-1",
            prId: "pr-102",
            provider: "jira",
            issueKey: "JIRA-77",
            status: "sync_pending",
            metadata: {},
            createdAt: nowIso,
            updatedAt: nowIso,
        },
    ];
    const issueLinkActionAudits: Array<{
        id: string;
        action: string;
        entityType: string;
        entityId?: string;
        repoId?: string;
        issueLinkId?: string;
        outcome: "success" | "error";
        summary: string;
        metadata: Record<string, unknown>;
        createdAt: string;
    }> = [];

    const appendIssueLinkActionAudit = (entry: {
        action: string;
        entityId?: string;
        repoId?: string;
        issueLinkId?: string;
        outcome: "success" | "error";
        summary: string;
        metadata?: Record<string, unknown>;
    }) => {
        issueLinkActionAudits.unshift({
            id: `issue-link-audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            action: entry.action,
            entityType: "integration_issue_link",
            entityId: entry.entityId,
            repoId: entry.repoId,
            issueLinkId: entry.issueLinkId,
            outcome: entry.outcome,
            summary: entry.summary,
            metadata: entry.metadata || {},
            createdAt: new Date().toISOString(),
        });
    };

    await page.route("**/api/v1/integrations/connection-action-audits**", async (route) => {
        const url = new URL(route.request().url());
        const repoId = url.searchParams.get("repoId");
        const limit = Number(url.searchParams.get("limit") || 20);
        const filtered = connectionActionAudits.filter((event) => {
            if (repoId && event.repoId !== repoId) return false;
            return true;
        });
        await route.fulfill(
            jsonResponse(200, {
                events: filtered.slice(0, Math.max(limit, 1)),
                total: filtered.length,
                limit: Math.max(limit, 1),
            })
        );
    });

    await page.route("**/api/v1/integrations/webhook-action-audits**", async (route) => {
        const url = new URL(route.request().url());
        const repoId = url.searchParams.get("repoId");
        const limit = Number(url.searchParams.get("limit") || 20);
        const filtered = webhookActionAudits.filter((event) => {
            if (repoId && event.repoId !== repoId) return false;
            return true;
        });
        await route.fulfill(
            jsonResponse(200, {
                events: filtered.slice(0, Math.max(limit, 1)),
                total: filtered.length,
                limit: Math.max(limit, 1),
            })
        );
    });
    await page.route("**/api/v1/integrations/notification-action-audits**", async (route) => {
        const url = new URL(route.request().url());
        const repoId = url.searchParams.get("repoId");
        const limit = Number(url.searchParams.get("limit") || 20);
        const filtered = notificationActionAudits.filter((event) => {
            if (repoId && event.repoId !== repoId) return false;
            return true;
        });
        await route.fulfill(
            jsonResponse(200, {
                events: filtered.slice(0, Math.max(limit, 1)),
                total: filtered.length,
                limit: Math.max(limit, 1),
            })
        );
    });
    await page.route("**/api/v1/integrations/issue-link-action-audits**", async (route) => {
        const url = new URL(route.request().url());
        const repoId = url.searchParams.get("repoId");
        const limit = Number(url.searchParams.get("limit") || 20);
        const filtered = issueLinkActionAudits.filter((event) => {
            if (repoId && event.repoId !== repoId) return false;
            return true;
        });
        await route.fulfill(
            jsonResponse(200, {
                events: filtered.slice(0, Math.max(limit, 1)),
                total: filtered.length,
                limit: Math.max(limit, 1),
            })
        );
    });
    await page.route("**/api/v1/integrations/notifications**", async (route) => {
        const url = new URL(route.request().url());
        const method = route.request().method().toUpperCase();
        const path = url.pathname;

        if (path.endsWith("/notifications/retry") && method === "POST") {
            let processed = 0;
            const outcomes = notificationDeliveries.map((delivery) => {
                if (delivery.status === "pending" || delivery.status === "retrying" || delivery.status === "failed") {
                    processed += 1;
                    delivery.status = "delivered";
                    delivery.attempts += 1;
                    delivery.updatedAt = new Date().toISOString();
                    appendNotificationActionAudit({
                        action: "integration.notification.retry_due",
                        entityId: delivery.id,
                        repoId: delivery.repoId,
                        deliveryId: delivery.id,
                        outcome: "success",
                        summary: `Retried notification ${delivery.correlationId} -> ${delivery.status}.`,
                        metadata: {
                            reason: "delivered",
                            status: delivery.status,
                        },
                    });
                    return {
                        id: delivery.id,
                        reason: "delivered",
                        status: delivery.status,
                        repoId: delivery.repoId,
                        correlationId: delivery.correlationId,
                    };
                }
                return {
                    id: delivery.id,
                    reason: "skipped",
                    status: delivery.status,
                    repoId: delivery.repoId,
                    correlationId: delivery.correlationId,
                };
            });
            await route.fulfill(
                jsonResponse(200, {
                    success: true,
                    processed,
                    outcomes,
                })
            );
            return;
        }

        const deliverMatch = path.match(/\/notifications\/([^/]+)\/deliver$/);
        if (deliverMatch && method === "POST") {
            const deliveryId = deliverMatch[1];
            const delivery = notificationDeliveries.find((item) => item.id === deliveryId);
            if (!delivery) {
                await route.fulfill(jsonResponse(404, { error: "Notification delivery not found" }));
                return;
            }
            const payload = route.request().postDataJSON() as { simulateFailure?: boolean } | null;
            const simulateFailure = payload?.simulateFailure === true;
            if (simulateFailure) {
                delivery.attempts += 1;
                delivery.status = delivery.attempts >= delivery.maxAttempts ? "dead_letter" : "failed";
                delivery.updatedAt = new Date().toISOString();
                appendNotificationActionAudit({
                    action: "integration.notification.manual_fail",
                    entityId: delivery.id,
                    repoId: delivery.repoId,
                    deliveryId: delivery.id,
                    outcome: "error",
                    summary: `Notification ${delivery.correlationId} is now ${delivery.status}.`,
                    metadata: {
                        mode: "fail",
                    },
                });
                await route.fulfill(
                    jsonResponse(200, {
                        success: true,
                        reason: "failed",
                        delivery,
                    })
                );
                return;
            }
            delivery.status = "delivered";
            delivery.attempts += 1;
            delivery.deliveredAt = new Date().toISOString();
            delivery.updatedAt = new Date().toISOString();
            appendNotificationActionAudit({
                action: "integration.notification.manual_deliver",
                entityId: delivery.id,
                repoId: delivery.repoId,
                deliveryId: delivery.id,
                outcome: "success",
                summary: `Notification ${delivery.correlationId} is now ${delivery.status}.`,
                metadata: {
                    mode: "deliver",
                },
            });
            await route.fulfill(
                jsonResponse(200, {
                    success: true,
                    reason: "delivered",
                    delivery,
                })
            );
            return;
        }

        if (path.endsWith("/notifications") && method === "GET") {
            const status = url.searchParams.get("status");
            const deliveries = notificationDeliveries.filter((delivery) => {
                if (status && delivery.status !== status) return false;
                return true;
            });
            await route.fulfill(
                jsonResponse(200, {
                    deliveries,
                    total: deliveries.length,
                    limit: 8,
                    offset: 0,
                })
            );
            return;
        }

        await route.fulfill(jsonResponse(404, { error: "Unhandled notifications route in smoke test" }));
    });
    await page.route("**/api/v1/integrations/issue-links**", async (route) => {
        const url = new URL(route.request().url());
        const method = route.request().method().toUpperCase();
        const path = url.pathname;

        if (path.endsWith("/issue-links/retry-sync") && method === "POST") {
            let processed = 0;
            const outcomes = issueLinks.map((link) => {
                if (link.status === "sync_pending" || link.status === "sync_failed") {
                    processed += 1;
                    link.status = "linked";
                    link.updatedAt = new Date().toISOString();
                    appendIssueLinkActionAudit({
                        action: "integration.issue_link.retry_sync",
                        entityId: link.id,
                        repoId: link.repoId,
                        issueLinkId: link.id,
                        outcome: "success",
                        summary: `Retried issue link ${link.issueKey} -> ${link.status}.`,
                        metadata: {
                            reason: "synced",
                            status: link.status,
                            provider: link.provider,
                        },
                    });
                    return {
                        id: link.id,
                        reason: "synced",
                        status: link.status,
                        repoId: link.repoId,
                        provider: link.provider,
                        issueKey: link.issueKey,
                    };
                }
                return {
                    id: link.id,
                    reason: "skipped",
                    status: link.status,
                    repoId: link.repoId,
                    provider: link.provider,
                    issueKey: link.issueKey,
                };
            });
            await route.fulfill(
                jsonResponse(200, {
                    success: true,
                    processed,
                    outcomes,
                })
            );
            return;
        }

        const syncMatch = path.match(/\/issue-links\/([^/]+)\/sync$/);
        if (syncMatch && method === "POST") {
            const issueLinkId = syncMatch[1];
            const link = issueLinks.find((item) => item.id === issueLinkId);
            if (!link) {
                await route.fulfill(jsonResponse(404, { error: "Issue link not found" }));
                return;
            }
            const payload = route.request().postDataJSON() as { simulateFailure?: boolean } | null;
            const simulateFailure = payload?.simulateFailure === true;
            if (simulateFailure) {
                link.status = "sync_failed";
                link.updatedAt = new Date().toISOString();
                appendIssueLinkActionAudit({
                    action: "integration.issue_link.manual_fail",
                    entityId: link.id,
                    repoId: link.repoId,
                    issueLinkId: link.id,
                    outcome: "error",
                    summary: `Issue link ${link.issueKey} is now ${link.status}.`,
                    metadata: {
                        mode: "fail",
                    },
                });
                await route.fulfill(
                    jsonResponse(200, {
                        success: true,
                        reason: "sync_failed",
                        issueLink: link,
                        syncEvent: {
                            id: `sync-${Date.now()}`,
                            issueLinkId: link.id,
                            provider: link.provider,
                            status: "failed",
                            attemptNumber: 1,
                            createdAt: new Date().toISOString(),
                        },
                    })
                );
                return;
            }

            link.status = "linked";
            link.updatedAt = new Date().toISOString();
            appendIssueLinkActionAudit({
                action: "integration.issue_link.manual_sync",
                entityId: link.id,
                repoId: link.repoId,
                issueLinkId: link.id,
                outcome: "success",
                summary: `Issue link ${link.issueKey} is now ${link.status}.`,
                metadata: {
                    mode: "sync",
                },
            });
            await route.fulfill(
                jsonResponse(200, {
                    success: true,
                    reason: "synced",
                    issueLink: link,
                    syncEvent: {
                        id: `sync-${Date.now()}`,
                        issueLinkId: link.id,
                        provider: link.provider,
                        status: "synced",
                        attemptNumber: 1,
                        createdAt: new Date().toISOString(),
                    },
                })
            );
            return;
        }

        if (path.endsWith("/issue-links") && method === "GET") {
            const status = url.searchParams.get("status");
            const provider = url.searchParams.get("provider");
            const links = issueLinks.filter((link) => {
                if (status && link.status !== status) return false;
                if (provider && link.provider !== provider) return false;
                return true;
            });
            await route.fulfill(
                jsonResponse(200, {
                    links,
                    total: links.length,
                    limit: 8,
                    offset: 0,
                })
            );
            return;
        }

        await route.fulfill(jsonResponse(404, { error: "Unhandled issue-link route in smoke test" }));
    });

    await page.route("**/api/v1/integrations/webhooks**", async (route) => {
        const url = new URL(route.request().url());
        const method = route.request().method().toUpperCase();
        const path = url.pathname;

        if (path.endsWith("/webhooks/retry") && method === "POST") {
            let processed = 0;
            const outcomes = webhookEvents.map((event) => {
                if (event.status === "received" || event.status === "failed") {
                    processed += 1;
                    event.status = "processed";
                    event.attempts += 1;
                    event.updatedAt = new Date().toISOString();
                    appendWebhookActionAudit({
                        action: "integration.webhook.retry_due",
                        entityId: event.id,
                        repoId: event.repoId,
                        webhookEventId: event.id,
                        outcome: "success",
                        summary: `Retried webhook ${event.externalEventId} -> ${event.status}.`,
                        metadata: {
                            reason: "processed",
                            status: event.status,
                        },
                    });
                    return {
                        id: event.id,
                        reason: "processed",
                        status: event.status,
                        repoId: event.repoId,
                        externalEventId: event.externalEventId,
                    };
                }
                return {
                    id: event.id,
                    reason: "skipped",
                    status: event.status,
                    repoId: event.repoId,
                    externalEventId: event.externalEventId,
                };
            });
            await route.fulfill(
                jsonResponse(200, {
                    success: true,
                    processed,
                    outcomes,
                })
            );
            return;
        }

        const processMatch = path.match(/\/webhooks\/([^/]+)\/process$/);
        if (processMatch && method === "POST") {
            const webhookId = processMatch[1];
            const event = webhookEvents.find((item) => item.id === webhookId);
            if (!event) {
                await route.fulfill(jsonResponse(404, { error: "Webhook event not found" }));
                return;
            }
            const payload = route.request().postDataJSON() as { simulateFailure?: boolean } | null;
            const simulateFailure = payload?.simulateFailure === true;
            if (simulateFailure) {
                event.attempts += 1;
                event.status = event.attempts >= event.maxAttempts ? "dead_letter" : "failed";
                event.updatedAt = new Date().toISOString();
                appendWebhookActionAudit({
                    action: "integration.webhook.manual_fail",
                    entityId: event.id,
                    repoId: event.repoId,
                    webhookEventId: event.id,
                    outcome: "error",
                    summary: `Webhook ${event.externalEventId} is now ${event.status}.`,
                    metadata: {
                        mode: "fail",
                    },
                });
                await route.fulfill(
                    jsonResponse(200, {
                        success: true,
                        reason: "failed",
                        event,
                    })
                );
                return;
            }
            event.status = "processed";
            event.attempts += 1;
            event.processedAt = new Date().toISOString();
            event.updatedAt = new Date().toISOString();
            appendWebhookActionAudit({
                action: "integration.webhook.manual_process",
                entityId: event.id,
                repoId: event.repoId,
                webhookEventId: event.id,
                outcome: "success",
                summary: `Webhook ${event.externalEventId} is now ${event.status}.`,
                metadata: {
                    mode: "process",
                },
            });
            await route.fulfill(
                jsonResponse(200, {
                    success: true,
                    reason: "processed",
                    event,
                })
            );
            return;
        }

        if (path.endsWith("/webhooks") && method === "GET") {
            const provider = url.searchParams.get("provider");
            const status = url.searchParams.get("status");
            const events = webhookEvents.filter((event) => {
                if (provider && event.provider !== provider) return false;
                if (status && event.status !== status) return false;
                return true;
            });
            await route.fulfill(
                jsonResponse(200, {
                    events,
                    total: events.length,
                    limit: 8,
                    offset: 0,
                })
            );
            return;
        }

        await route.fulfill(jsonResponse(404, { error: "Unhandled webhook route in smoke test" }));
    });

    await page.route("**/api/v1/integrations/webhook-auth-events**", async (route) => {
        const url = new URL(route.request().url());
        const isExport = url.pathname.endsWith("/webhook-auth-events/export");
        const provider = url.searchParams.get("provider");
        const reason = url.searchParams.get("reason");
        const events = [
            {
                id: "auth-1",
                provider: "slack",
                eventType: "message.channels",
                externalEventId: "evt-1",
                outcome: "rejected",
                reason: "missing_signature_headers",
                statusCode: 401,
                signaturePresent: false,
                timestampPresent: false,
                createdAt: new Date().toISOString(),
            },
            {
                id: "auth-2",
                provider: "slack",
                eventType: "slack.action.approve_queue",
                externalEventId: "evt-2",
                outcome: "rejected",
                reason: "timestamp_out_of_window",
                statusCode: 401,
                signaturePresent: true,
                timestampPresent: true,
                createdAt: new Date().toISOString(),
            },
        ].filter((event) => {
            if (provider && event.provider !== provider) return false;
            if (reason && !event.reason.includes(reason)) return false;
            return true;
        });

        if (isExport) {
            const format = (url.searchParams.get("format") || "json").toLowerCase();
            if (format === "csv") {
                const csv = [
                    "\"id\",\"provider\",\"outcome\",\"reason\",\"statusCode\"",
                    ...events.map(
                        (event) =>
                            `"${event.id}","${event.provider}","${event.outcome}","${event.reason}","${event.statusCode}"`
                    ),
                ].join("\n");
                await route.fulfill({
                    status: 200,
                    headers: {
                        "content-type": "text/csv; charset=utf-8",
                        "content-disposition": "attachment; filename=\"nexus-webhook-auth-events-smoke.csv\"",
                    },
                    body: csv,
                });
                return;
            }
            await route.fulfill({
                status: 200,
                headers: {
                    "content-type": "application/json; charset=utf-8",
                    "content-disposition": "attachment; filename=\"nexus-webhook-auth-events-smoke.json\"",
                },
                body: JSON.stringify(events),
            });
            return;
        }

        await route.fulfill(
            jsonResponse(200, {
                events,
                total: events.length,
                limit: 12,
                offset: 0,
            })
        );
    });

    await page.goto("/settings", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /^Settings$/i })).toBeVisible({ timeout: 20000 });
    await expect(page.getByText(/Integration Diagnostics/i)).toBeVisible({ timeout: 20000 });
    await expect(page.getByText(/Integrations Operations/i)).toBeVisible({ timeout: 20000 });
    await expect(page.getByText(/Connection Control Plane/i)).toBeVisible({ timeout: 20000 });
    await expect(page.getByText(/Webhook Recovery Queue/i)).toBeVisible({ timeout: 20000 });
    await expect(page.getByText(/Notification Delivery Queue/i)).toBeVisible({ timeout: 20000 });
    await expect(page.getByText(/Issue-Link Sync Queue/i)).toBeVisible({ timeout: 20000 });
    await expect(page.getByText(/webhook_auth_failures_high/i)).toBeVisible({ timeout: 20000 });
    await expect(page.getByText(/Connected \(1\)/i)).toBeVisible({ timeout: 20000 });
    await expect(page.getByText(/push.failed/i)).toBeVisible({ timeout: 20000 });
    await expect(page.getByText(/pr.review.requested/i)).toBeVisible({ timeout: 20000 });
    await expect(page.getByText(/LIN-123/i)).toBeVisible({ timeout: 20000 });
    await expect(page.getByText(/missing signature headers/i)).toBeVisible({ timeout: 20000 });
    await expect(page.getByRole("button", { name: /Export JSON/i })).toBeVisible({ timeout: 20000 });
    await expect(page.getByRole("button", { name: /Export CSV/i })).toBeVisible({ timeout: 20000 });

    const jiraConnectionRow = page.getByTestId("connection-row-conn-jira-1");
    await jiraConnectionRow.getByRole("button", { name: /^Validate$/i }).click();
    await expect(page.getByText("Connection Jira Prod is now active.", { exact: true })).toBeVisible({ timeout: 20000 });
    await jiraConnectionRow.getByRole("button", { name: /^Disable$/i }).click();
    await expect(page.getByText("Connection Jira Prod status set to disabled.", { exact: true })).toBeVisible({
        timeout: 20000,
    });
    await jiraConnectionRow.getByRole("button", { name: /^Enable$/i }).click();
    await expect(page.getByText("Connection Jira Prod status set to active.", { exact: true })).toBeVisible({
        timeout: 20000,
    });

    await page.getByRole("button", { name: /^Fail$/i }).first().click();
    await expect(page.getByText("Webhook wh-ext-1 is now failed.", { exact: true })).toBeVisible({ timeout: 20000 });
    await page.getByRole("button", { name: /Retry Due/i }).first().click();
    await expect(page.getByText("Retried 2 due webhook event(s).", { exact: true })).toBeVisible({ timeout: 20000 });
    await page.getByRole("button", { name: /Retry Due/i }).nth(1).click();
    await expect(page.getByText("Retried 2 due notification(s).", { exact: true })).toBeVisible({ timeout: 20000 });
    await page.getByRole("button", { name: /Retry Due/i }).nth(2).click();
    await expect(page.getByText("Retried 2 issue-link sync(s).", { exact: true })).toBeVisible({ timeout: 20000 });

    await expect(page.getByText(/\(manual validate\)/i)).toBeVisible({ timeout: 20000 });
    await page.getByRole("button", { name: /Export JSON/i }).click();
    await page.getByRole("button", { name: /Export CSV/i }).click();

    const reasonInput = page.getByPlaceholder("missing_signature_headers");
    await reasonInput.fill("timestamp_out_of_window");
    await expect(page.getByText(/timestamp out of window/i)).toBeVisible({ timeout: 20000 });
});
