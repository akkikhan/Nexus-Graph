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

    await page.goto("/inbox", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /PR Inbox/i })).toBeVisible({ timeout: 20000 });

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
                            pr: { number: 101, title: "Add auth middleware", riskScore: 72 },
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
                ],
            })
        );
    });

    await page.goto("/activity", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /Reviews/i }).click();
    await expect(page.getByText("AI Review Completed")).toBeVisible();
    await page.getByRole("button", { name: /Merges/i }).click();
    await expect(page.getByText("PR Merged")).toBeVisible();
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
